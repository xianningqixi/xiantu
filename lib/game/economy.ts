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
export const DEPARTURE_FEE = (B.combat.partyMaxSize - 1) * B.story.departureFeePerNpc;
export const STONE_METHOD = B.cultivation.methods.METHOD_SPIRIT_STONE;
