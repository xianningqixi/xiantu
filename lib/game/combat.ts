import { B } from "./rules";
import type { Actor, Battle, Fighter, SkillId, World } from "./types";
import { stats, requireRule, actorById, combatDamage } from "./rules";
import { random } from "./rng";
import { memory } from "./relationships";
import { updateAgreementAvailability } from "./agreement";
import { die } from "./lifecycle";
import { advanceDay } from "./daily-simulation";
import { recordFact as record } from "./knowledge";
import { skillConfig, skillName, usableSkills } from "./skills";

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
    else
      a.hp = Math.max(
        1,
        f.hp ||
          Math.ceil(
            f.maxHp *
              (outcome === "defeat"
                ? (w.profile.mode === "simple"
                    ? B.modes.simple.defeatHpRestoreBp
                    : B.modes.complex.nonlethalDefeatHpRestoreBp) / B.probabilityScaleBp
                : B.combat.nonlethalVictoryDownedHpRestoreBp / B.probabilityScaleBp),
          ),
      );
    a.hp = Math.min(a.hp, stats(a).maxHp);
  }
  updateAgreementAvailability(w);
  if (w.ended) {
    w.battle = null;
    w.notice = "此生已落笔。致命遭遇已经结束，可导出这一世的经历。";
    return;
  }
  if (battle.kind) {
    finishFieldBattle(w, battle, outcome);
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
      w.player.stones -= Math.floor(
        (w.player.stones *
          (w.profile.mode === "simple"
            ? B.modes.simple.defeatCurrencyLossBp
            : B.modes.complex.nonlethalDefeatCurrencyLossBp)) /
          B.probabilityScaleBp,
      );
      const days =
        w.profile.mode === "simple"
          ? B.modes.simple.defeatExtraRecoveryDays
          : B.modes.complex.nonlethalDefeatExtraRecoveryDays;
      for (let d = 0; d < days; d++) advanceDay(w, new Set(w.party));
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

function finishFieldBattle(w: World, battle: Battle, outcome: "win" | "retreat" | "defeat") {
  const p = w.player;
  if (outcome === "win") {
    const loot = battle.loot ?? { stones: 0, grass: 0 };
    const split = battle.kind === "expedition" && w.agreement?.terms === "split";
    if (split) {
      const n = w.party.length,
        share = Math.floor(loot.stones / n);
      w.party.forEach((id, i) => {
        actorById(w, id)!.stones += i === 0 ? loot.stones - share * (n - 1) : share;
      });
      for (let i = 0; i < loot.grass; i++) actorById(w, w.party[i % n])!.grass += 1;
    } else {
      p.stones += loot.stones;
      p.grass += loot.grass;
    }
    const insight = battle.insight ?? 0;
    if (insight) p.insight += insight;
    if (battle.destination) {
      for (let d = 0; d < (battle.remainingTravelDays ?? 0) && !w.ended; d++)
        advanceDay(w, new Set(w.party), "travel");
      if (w.ended) {
        w.battle = null;
        return;
      }
      p.location = battle.destination;
      for (const id of w.party) actorById(w, id)!.location = battle.destination;
    }
    if (battle.kind === "expedition") {
      w.expeditionCount = (w.expeditionCount ?? 0) + 1;
      w.notice = split
        ? `残碑再度沉寂。灵石与凝元草按同行约定当场分完，石傀的裂痕比上次更深。`
        : `残碑再度沉寂。你把 ${loot.stones} 枚灵石${
            loot.grass ? `和 ${loot.grass} 株凝元草` : ""
          }收入行囊，石傀的裂痕比上次更深。`;
    } else
      w.notice = `敌人尽数倒下。你清点了战场，获得 ${loot.stones} 枚灵石${
        loot.grass ? `、${loot.grass} 株凝元草` : ""
      }${insight ? `，另有 ${insight} 点感悟` : ""}。`;
  } else {
    if (outcome === "defeat") {
      p.stones -= Math.floor(
        (p.stones *
          (w.profile.mode === "simple"
            ? B.modes.simple.defeatCurrencyLossBp
            : B.modes.complex.nonlethalDefeatCurrencyLossBp)) /
          B.probabilityScaleBp,
      );
      const days =
        w.profile.mode === "simple"
          ? B.modes.simple.defeatExtraRecoveryDays
          : B.modes.complex.nonlethalDefeatExtraRecoveryDays;
      for (let d = 0; d < days; d++) advanceDay(w, new Set(w.party));
    }
    if (battle.kind === "expedition") {
      p.location = "gate";
      for (const id of w.party) actorById(w, id)!.location = "gate";
      w.notice =
        outcome === "retreat"
          ? "你们沿旧路撤回古道，这次秘境没有收获。"
          : "同伴把你拖出残碑。丢失了一些灵石，好在大家都活着。";
    } else
      w.notice =
        outcome === "retreat"
          ? "你退回原处包扎伤口，这次历练没有收获。"
          : "同伴将你拖回安全处。丢失了一些灵石，好在大家都活着。";
  }
  record(w, `${battle.kind}-battle-${outcome}`, w.notice, w.party);
  w.battle = null;
}

export function battleRound(
  w: World,
  action: "attack" | "skill" | "guard" | "heal" | "retreat",
  target?: string,
  requestedSkill?: SkillId,
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
  const playerSkills = usableSkills(w.player);
  let playerSkill: SkillId | undefined;
  if (p.hp > 0) {
    if (action === "skill") {
      playerSkill = requestedSkill ?? playerSkills[0];
      requireRule(
        !!playerSkill && playerSkills.includes(playerSkill),
        requestedSkill ? "尚未学会这门功法，或境界不足以驾驭。" : "尚未学会可用的功法。",
        "ACTION_UNAVAILABLE",
      );
      requireRule(p.cooldown === 0, `${skillName(playerSkill!)}尚在调息。`);
    }
    if (action === "heal")
      requireRule(w.player.healing > 0 && p.hp < p.maxHp, "没有回春丹，或气血已经充足。");
  }
  const order = [...battle.allies, ...battle.enemies].sort(
    (a, b) =>
      Number(!!b.firstNext) - Number(!!a.firstNext) ||
      b.speed - a.speed ||
      a.id.localeCompare(b.id),
  );
  for (const f of order) f.firstNext = false;
  const logs: string[] = [];
  const strike = (attacker: Fighter, defender: Fighter, damage: number, verb: string) => {
    defender.hp = Math.max(0, defender.hp - damage);
    logs.push(
      `${attacker.name}${verb}${defender.name}，造成 ${damage} 点伤害${defender.hp === 0 ? "，使其倒地" : ""}。`,
    );
    if (defender.guard && defender.reflectBp) {
      const reflected = Math.max(
        1,
        Math.floor((damage * defender.reflectBp) / B.probabilityScaleBp),
      );
      attacker.hp = Math.max(0, attacker.hp - reflected);
      logs.push(
        `${defender.name}借太极之势反弹伤害，${attacker.name}受到 ${reflected} 点伤害${attacker.hp === 0 ? "，使其倒地" : ""}。`,
      );
    }
  };
  for (const f of order) {
    if (f.hp <= 0) continue;
    if ((f.skipTurns ?? 0) > 0) {
      f.skipTurns = (f.skipTurns ?? 0) - 1;
      logs.push(`${f.name}心神恍惚，这一回合没能出手。`);
      continue;
    }
    f.guard = false;
    f.reflectBp = undefined;
    const skillReady = f.cooldown === 0;
    if (f.cooldown > 0) f.cooldown--;
    const ally = battle.allies.includes(f);
    const enemies = (ally ? battle.enemies : battle.allies).filter((t) => t.hp > 0);
    if (!enemies.length) break;
    let selected = f.id === "PLAYER" ? action : "attack";
    let chosenSkill: SkillId | undefined;
    const owner = ally ? actorById(w, f.id) : undefined;
    if (ally && f.id !== "PLAYER") {
      const pool = usableSkills(owner!);
      selected =
        owner!.healing > 0 &&
        f.hp / f.maxHp <= B.combat.automaticHealWhenHpAtOrBelowBp / B.probabilityScaleBp
          ? "heal"
          : skillReady && pool.length
            ? "skill"
            : "attack";
      if (selected === "skill") chosenSkill = pool[0];
    } else if (f.id === "PLAYER" && action === "skill") chosenSkill = playerSkill;
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
      logs.push(`${f.name}寻找退路，却被敌人截住。`);
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
    // Enemy tactics: wounded beasts guard; cornered swordsmen heal once.
    if (!ally && f.tactic && skillReady && !(f.tacticUsed && f.tactic === "heal")) {
      const thresholdHp = ((f.maxHp * (f.tacticAtHpBp ?? 5000)) / B.probabilityScaleBp) | 0;
      if (f.hp <= thresholdHp) {
        if (f.tactic === "guard") {
          f.guard = true;
          f.cooldown = 2;
          f.tacticUsed = true;
          logs.push(`${f.name}负伤后收势自保，摆出守势。`);
          continue;
        }
        if (f.tactic === "heal") {
          const gain = Math.ceil((f.maxHp * (f.tacticHealBp ?? 2000)) / B.probabilityScaleBp);
          f.hp = Math.min(f.maxHp, f.hp + gain);
          f.cooldown = 3;
          f.tacticUsed = true;
          logs.push(`${f.name}服下丹药稳住伤势，恢复 ${gain} 点气血。`);
          continue;
        }
      }
    }
    const t = (f.id === "PLAYER" && enemies.find((t) => t.id === target)) || enemies[0];
    if (selected === "skill" && chosenSkill) {
      const config = skillConfig(chosenSkill);
      f.cooldown = config.cooldown ?? 0;
      if (config.healMaxHpBp) {
        const gain = Math.ceil((f.maxHp * config.healMaxHpBp) / B.probabilityScaleBp);
        f.hp = Math.min(f.maxHp, f.hp + gain);
        logs.push(`${f.name}使出${config.name}，恢复 ${gain} 点气血。`);
      } else if (config.skipTargetTurns) {
        t.skipTurns = (t.skipTurns ?? 0) + config.skipTargetTurns;
        logs.push(`${f.name}使出${config.name}，${t.name}心神失守。`);
      } else if (config.guard || config.effect === "guard_then_first") {
        f.guard = true;
        if (config.reflectDamageBp) {
          f.reflectBp = config.reflectDamageBp;
          logs.push(`${f.name}使出${config.name}，凝神护体，借力反弹。`);
        } else {
          if (config.effect === "guard_then_first") f.firstNext = true;
          logs.push(`${f.name}使出${config.name}，身形轻灵，抢占先机。`);
        }
      } else {
        const damage = combatDamage(f.attack, t.defense, true, t.guard, config.damageMultiplierBp);
        strike(f, t, damage, `使出${config.name}，击中`);
      }
    } else {
      const damage = combatDamage(f.attack, t.defense, false, t.guard);
      strike(f, t, damage, "攻击");
    }
  }
  battle.logs = [...battle.logs, ...logs];
  battle.round++;
  // Old in-flight battles retain Fighter snapshots; actor HP follows the migrated realm cap.
  for (const f of battle.allies) {
    const owner = actorById(w, f.id)!;
    owner.hp = Math.min(f.hp, stats(owner).maxHp);
  }
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
