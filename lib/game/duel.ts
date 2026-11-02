import { B, stats, requireRule, actorById } from "./rules";
import { fighter } from "./combat";
import { random } from "./rng";
import type { Battle, Fighter, World } from "./types";

/**
 * 剧情决斗：情敌（或别的对手）挡在前面，胜负各写一个进度字段。
 * 走的是正式战斗流程，玩家可以用技能、可以退，退了算没赢。
 */
export function duelBattle(w: World, target: string, win: string, lose: string): Battle {
  const a = actorById(w, target);
  requireRule(a?.alive, "对手不在人世，无从对决。");
  requireRule(a!.location === w.player.location, "对手不在这里。");
  const mine = fighter(w.player);
  // 对手按自己的境界打，但压到与玩家同一档上下浮动，避免剧情决斗直接碾压或被碾压。
  const self = stats(a!);
  const scale = (v: number) =>
    Math.max(1, Math.round((v * (B.probabilityScaleBp + 600)) / B.probabilityScaleBp));
  const enemy: Fighter = {
    id: a!.id,
    name: a!.name,
    maxHp: Math.max(self.maxHp, Math.ceil(mine.maxHp * 0.9)),
    hp: Math.max(self.maxHp, Math.ceil(mine.maxHp * 0.9)),
    attack: scale(self.attack),
    defense: self.defense,
    speed: self.speed,
    guard: false,
    cooldown: 0,
  };
  const stones = 4 + random(w, "combat", 6);
  return {
    id: `duel:${w.revision + 1}:${w.day}`,
    round: 1,
    allies: w.party.map((id) =>
      fighter(id === "PLAYER" ? w.player : w.npcs.find((n) => n.id === id)!),
    ),
    enemies: [enemy],
    logs: [`${a!.name}把话说到最后，退无可退。`],
    auto: false,
    lethal: false,
    kind: "duel",
    location: w.player.location,
    loot: { stones, grass: 0 },
    flags: { win, lose },
  };
}
