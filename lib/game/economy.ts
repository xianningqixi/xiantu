import B from "./content/balance.json";
export const SHOP_ITEMS = {
  healing: {
    name: "回春丹",
    price: B.economy.shopPrices.ITEM_HEALING_PILL,
    description: `恢复 ${B.combat.healingPillRestoreMaxHpBp / 100}% 最大气血。`,
  },
  pills: {
    name: "突破丹",
    price: B.economy.shopPrices.ITEM_BREAKTHROUGH_PILL,
    description: `筑基时服用，成功率提高 ${B.cultivation.breakthrough.pillBonusBp / 100}%。`,
  },
  grass: {
    name: "凝元草",
    price: B.economy.shopPrices.ITEM_NINGYUAN_GRASS,
    description: `可交付约定，或加 ${B.economy.pillExchange.spiritStoneCost} 灵石兑换突破丹。`,
  },
} as const;
export const ALL_SHOP_ITEMS = {
  ...SHOP_ITEMS,
  qi: {
    name: "聚气丹",
    price: B.economy.shopPrices.qi,
    description: "立即增加三日修为，单次不超过当前境界阈值的一半。",
  },
};
export const DEPARTURE_FEE = (B.combat.partyMaxSize - 1) * B.story.departureFeePerNpc;
export const STONE_METHOD = B.cultivation.methods.METHOD_SPIRIT_STONE;

import { gainPerDay } from "./cultivation";
import { requireRule, threshold } from "./rules";
import { locationKind, localSite } from "./world-map";
import { recordFact } from "./knowledge";
import type { World } from "./types";
export function upgradeManual(w: World) {
  const p = w.player,
    next = B.cultivation.manualRanks[p.manualRank + 1];
  requireRule(
    next && p.manual && locationKind(p.location) === "inn" && p.realm >= (next.minRealm ?? 0),
    "功法进阶需在客栈办理，并满足下一阶境界条件。",
    "ACTION_UNAVAILABLE",
  );
  requireRule(p.stones >= next.cost, "功法进阶所需灵石不足。", "INSUFFICIENT_RESOURCES");
  p.stones -= next.cost;
  p.manualRank = (p.manualRank + 1) as 1 | 2 | 3;
  w.notice = `你花费 ${next.cost} 枚灵石，将功法进阶至${p.manualRank}阶，每日修为加成提高至 ${next.gain}。`;
  recordFact(w, "manual-upgrade", w.notice);
}
export function useQi(w: World) {
  const p = w.player;
  requireRule(p.manual && p.qi > 0, "需要已学会功法并持有聚气丹。", "ACTION_UNAVAILABLE");
  const gain = Math.min(
    gainPerDay(w, p) * B.economy.qiExperienceDays,
    Math.floor((threshold(p) * B.economy.qiThresholdCapBp) / B.probabilityScaleBp),
  );
  p.qi--;
  p.xp += gain;
  w.notice = `你服下一枚聚气丹，获得 ${gain} 修为。`;
  recordFact(w, "use-qi", w.notice);
}
export function rentCave(w: World) {
  const p = w.player,
    cfg = B.cultivation.cave,
    city = localSite(p.location, "market");
  requireRule(
    locationKind(p.location) === "market" && p.realm >= cfg.minRealm && p.cave !== city,
    "需达到炼气三层，在尚未置办洞府的坊市办理。",
    "ACTION_UNAVAILABLE",
  );
  requireRule(p.stones >= cfg.cost, "置办洞府所需灵石不足。", "INSUFFICIENT_RESOURCES");
  p.stones -= cfg.cost;
  p.cave = city;
  w.notice = `你花费 ${cfg.cost} 枚灵石置办洞府，在本城修炼每日额外获得 ${cfg.dailyGain} 修为。`;
  recordFact(w, "rent-cave", w.notice);
}
export function sell(w: World, item: keyof typeof B.economy.sellPrices, quantity: number) {
  const p = w.player;
  requireRule(
    B.economy.sellEnabled && locationKind(p.location) === "market",
    "请到坊市出售物资。",
    "ACTION_UNAVAILABLE",
  );
  requireRule(
    Number.isSafeInteger(quantity) &&
      quantity > 0 &&
      quantity <= B.limits.maxTradeQuantity &&
      p[item] >= quantity,
    "出售数量不合法或物资不足。",
    "INSUFFICIENT_RESOURCES",
  );
  const revenue = B.economy.sellPrices[item] * quantity;
  p[item] -= quantity;
  p.stones += revenue;
  w.notice = `你出售 ${quantity} 份${SHOP_ITEMS[item].name}，获得 ${revenue} 枚灵石。`;
  recordFact(w, "sell", w.notice);
}
