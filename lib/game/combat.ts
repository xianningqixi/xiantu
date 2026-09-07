import { B } from "./rules";
import type { Actor, Fighter, World } from "./types";
import { stats, requireRule, actorById, combatDamage } from "./rules";
import { random } from "./rng";
import { memory } from "./relationships";
import { updateAgreementAvailability } from "./agreement";
import { die } from "./lifecycle";
import { advanceDay } from "./daily-simulation";
import { recordFact as record } from "./knowledge";

export function fighter(a: Actor): Fighter {
  return { id: a.id, name: a.name, hp: a.hp, ...stats(a), guard: false, cooldown: 0 };
}

export function finishBattle(w: World, outcome: "win" | "retreat" | "defeat") {
  const battle = w.battle!;
  for (const f of battle.allies) {
    const a = actorById(w, f.id)!;
    if (!a.alive) continue;
    if (battle.lethal && f.hp === 0 && (a.id !== "PLAYER" || w.profile.mode === "complex"))
      die(w, a, "在致命遭遇中身亡");
    else a.hp = Math.max(1, f.hp || Math.ceil(f.maxHp * (outcome === "defeat" ? 0.3 : 0.1)));
  }
  updateAgreementAvailability(w);
  if (w.ended) {
    w.battle = null;
    w.notice = "此生已落笔。致命遭遇已经结束，可导出这一世的经历。";
    return;
  }
  if (outcome === "win") {
    w.loot = {
      stones: B.economy.expeditionSpiritStoneReward,
      grass: B.economy.expeditionNingyuanGrassReward,
      expeditionId: battle.id,
    };
    for (const id of w.party.filter((id) => id !== "PLAYER"))
      memory(w, id, "sharedVictory", `你与${actorById(w, id)!.name}在残碑秘境并肩取胜。`);
    w.notice = `石傀轰然倒下。你们找到 ${B.economy.expeditionNingyuanGrassReward} 株凝元草和 ${B.economy.expeditionSpiritStoneReward} 枚灵石。战利品暂存，回到坊市后再按约分配。`;
  } else {
    if (w.agreement) w.agreement.status = "not_triggered";
    if (w.story.outcome === "none") {
      w.story.outcome = "not_triggered";
      w.story.settledDay = w.day;
    }
    w.player.location = "gate";
    for (const id of w.party) actorById(w, id)!.location = "gate";
    if (outcome === "defeat") {
      w.player.stones -= Math.floor(w.player.stones * (w.profile.mode === "simple" ? 0.1 : 0.15));
      advanceDay(w, new Set(w.party));
      if (w.profile.mode === "complex") advanceDay(w, new Set(w.party));
    }
    w.notice =
      outcome === "retreat"
        ? "你们撤回古道。尚未获得凝元草，这次没有构成违约。"
        : battle.lethal
          ? "你撤回古道休养。此战伤亡和灵石损失已经记入历程。"
          : "同伴将你带回古道休养。损失了部分灵石，大家都活着。";
  }
  record(w, `battle-${outcome}`, w.notice, w.party);
  w.battle = null;
}

export function battleRound(
  w: World,
  action: "attack" | "skill" | "guard" | "heal" | "retreat",
  target?: string,
) {
  const battle = w.battle!;
  requireRule(battle, "眼下没有战斗。");
  const p = battle.allies.find((a) => a.id === "PLAYER")!;
  if (target !== undefined)
    requireRule(
      (action === "attack" || action === "skill") &&
        battle.enemies.some((e) => e.id === target && e.hp > 0),
      "战斗目标无效，请选择当前可攻击的敌人。",
    );
  if (p.hp > 0) {
    if (action === "skill") requireRule(p.cooldown === 0, "剑诀尚在调息。");
    if (action === "heal")
      requireRule(w.player.healing > 0 && p.hp < p.maxHp, "没有回春丹，或气血已经充足。");
  }
  const order = [...battle.allies, ...battle.enemies].sort(
    (a, b) => b.speed - a.speed || a.id.localeCompare(b.id),
  );
  const logs: string[] = [];
  for (const f of order) {
    if (f.hp <= 0) continue;
    f.guard = false;
    const skillReady = f.cooldown === 0;
    if (f.cooldown > 0) f.cooldown--;
    const ally = battle.allies.includes(f);
    const enemies = (ally ? battle.enemies : battle.allies).filter((t) => t.hp > 0);
    if (!enemies.length) break;
    let selected = f.id === "PLAYER" ? action : "attack";
    const owner = ally ? actorById(w, f.id) : undefined;
    if (ally && f.id !== "PLAYER")
      selected =
        owner!.healing > 0 &&
        f.hp / f.maxHp <= B.combat.automaticHealWhenHpAtOrBelowBp / B.probabilityScaleBp
          ? "heal"
          : skillReady
            ? "skill"
            : "attack";
    if (selected === "retreat") {
      if (
        random(w, "combat", 10000) <
        Math.min(
          B.combat.retreatSuccessCeilingBp,
          B.combat.retreatBaseSuccessBp +
            (w.profile.artifact === "ward" ? B.artifacts.ARTIFACT_WARD.retreatBonusBp : 0),
        )
      ) {
        finishBattle(w, "retreat");
        return;
      }
      logs.push("你寻找退路，却被石傀截住。");
      continue;
    }
    if (selected === "guard") {
      f.guard = true;
      logs.push(`${f.name}凝神防御。`);
      continue;
    }
    if (selected === "heal" && owner) {
      owner.healing--;
      const gain = Math.ceil((f.maxHp * B.combat.healingPillRestoreMaxHpBp) / B.probabilityScaleBp);
      f.hp = Math.min(f.maxHp, f.hp + gain);
      logs.push(`${f.name}服下回春丹，恢复气血。`);
      continue;
    }
    const t = (f.id === "PLAYER" && enemies.find((t) => t.id === target)) || enemies[0];
    const damage = combatDamage(f.attack, t.defense, selected === "skill", t.guard);
    t.hp = Math.max(0, t.hp - damage);
    if (selected === "skill") f.cooldown = B.combat.prototypeStrikeCooldownOwnTurns;
    logs.push(
      `${f.name}${selected === "skill" ? "使出青芒剑诀" : "攻击"}${t.name}，造成 ${damage} 点伤害${t.hp === 0 ? "，使其倒地" : ""}。`,
    );
  }
  battle.logs = [...battle.logs, ...logs];
  battle.round++;
  for (const f of battle.allies) actorById(w, f.id)!.hp = f.hp;
  if (battle.enemies.every((a) => a.hp <= 0)) {
    finishBattle(w, "win");
    return;
  }
  if (battle.allies.every((a) => a.hp <= 0)) {
    finishBattle(w, "defeat");
    return;
  }
  if (battle.round > B.combat.maximumRoundCount) {
    finishBattle(w, "retreat");
    return;
  }
  w.notice = logs.at(-1) || "双方仍在对峙。";
}
