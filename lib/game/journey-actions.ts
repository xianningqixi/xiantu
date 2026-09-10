import B from "./content/balance.json";
import { stats, threshold, advanceRule } from "./rules";
import { sectAt } from "./sect-content";
import { LOCATIONS, localSite, locationKind } from "./world-map";
import type { Command, World } from "./types";

type Destination =
  | { command: Command; tab?: never; anchor?: never }
  | { command?: never; tab: "cultivation" | "inventory"; anchor?: never }
  | { command?: never; tab?: never; anchor: "sect-panel" };
export type JourneyAction = {
  id: string;
  title: string;
  hint: string;
  icon: "practice" | "coins" | "rest" | "wait" | "road" | "sect";
} & Destination;

/** Contextual shortcuts only; projecting or opening a panel never writes the world. */
export function journeyActions(w: World): JourneyAction[] {
  const p = w.player,
    kind = locationKind(p.location),
    sect = sectAt(p.location),
    member = p.sectMembership;
  if (kind === "ruins" || w.loot) return [];
  const actions: JourneyAction[] = [];
  const add = (id: string, title: string, hint: string, command: Command) =>
    actions.push({ id, title, hint, icon: "coins", command });
  const nextManual = B.cultivation.manualRanks[p.manualRank + 1];
  if (
    kind === "inn" &&
    p.manual &&
    nextManual &&
    p.realm >= (nextManual.minRealm ?? 0) &&
    p.stones >= nextManual.cost
  )
    add("upgrade-manual", "功法进阶", `${nextManual.cost} 灵石 · 每日加成 ${nextManual.gain}`, {
      type: "upgradeManual",
    });
  if (kind === "market") {
    if (p.stones >= B.economy.shopPrices.qi)
      add("buy-qi", "购买聚气丹", `${B.economy.shopPrices.qi} 灵石`, { type: "buy", item: "qi" });
    if (
      p.realm >= B.cultivation.cave.minRealm &&
      p.cave !== p.location &&
      p.stones >= B.cultivation.cave.cost
    )
      add("rent-cave", "置办洞府", `${B.cultivation.cave.cost} 灵石 · 本城修炼加成`, {
        type: "rentCave",
      });
    for (const item of ["grass", "healing", "pills"] as const)
      if (p[item] > 0)
        add(
          `sell-${item}`,
          `出售一份${{ grass: "凝元草", healing: "回春丹", pills: "突破丹" }[item]}`,
          `${B.economy.sellPrices[item]} 灵石`,
          { type: "sell", item, quantity: 1 },
        );
  }
  if (p.manual && p.qi > 0)
    add("use-qi", "服用聚气丹", "增加修为 · 不耗时", { type: "use", item: "qi" });
  for (const job of ["herbs", "escort"] as const) {
    const rule = B.actions.jobs[job];
    if (rule.locationKinds.includes(kind) && p.realm >= rule.minRealm)
      add(`work-${job}`, rule.name, `${rule.days} 日 · ${rule.stones} 灵石`, { type: "work", job });
  }
  if (member && sect?.id === member.id && member.contribution >= B.sects.pillContributionCost)
    add("sect-exchange", "贡献换突破丹", `${B.sects.pillContributionCost} 贡献`, {
      type: "sectExchange",
    });

  if (sect) {
    if (!w.visitedSects?.includes(sect.id))
      actions.push({
        id: "sect",
        title: `拜访${sect.name}`,
        hint: "认识门人 · 了解修行门路",
        icon: "sect",
        command: { type: "visitSect", sectId: sect.id },
      });
    else if (member?.id === sect.id) {
      actions.push({
        id: "sect-task",
        title: sect.task,
        hint: `${B.sects.taskContribution} 贡献 · ${B.sects.taskStones} 灵石`,
        icon: "coins",
        command: { type: "sectTask" },
      });
      if (!member.artLearned && member.contribution >= B.sects.artContributionCost)
        actions.push({
          id: "sect-art",
          title: `研习《${sect.technique}》`,
          hint: `消耗 ${B.sects.artContributionCost} 贡献`,
          icon: "sect",
          command: { type: "learnSectArt" },
        });
    } else
      actions.push({
        id: "sect",
        title: `了解${sect.name}`,
        hint: "查看门人与入门条件",
        icon: "sect",
        anchor: "sect-panel",
      });
  }
  if (p.manual) {
    if (advanceRule(p).kind === "minor" && p.xp >= threshold(p))
      actions.push({
        id: "advance-minor",
        title: "冲关",
        hint: "修为圆满 · 不耗时",
        icon: "practice",
        command: { type: "advanceMinor" },
      });
    const ready = !!advanceRule(p).targetRealm && advanceRule(p).days > 0 && p.xp >= threshold(p);
    actions.push({
      id: "practice",
      title: ready ? "准备突破" : "静心修炼",
      hint: ready ? "修为已满 · 查看突破准备" : "选择修行方式与时长",
      icon: "practice",
      tab: "cultivation",
    });
  } else {
    const inn = localSite(p.location, "inn");
    actions.push({
      id: "practice",
      title: kind === "inn" ? "学习《基础吐纳诀》" : "寻找入门功法",
      hint: kind === "inn" ? "向店家领书 · 免费学习" : `前往${LOCATIONS[inn].name} · 免费学艺`,
      icon: "practice",
      command: kind === "inn" ? { type: "learn" } : { type: "travel", to: inn },
    });
  }
  if (kind === "market") {
    actions.push({
      id: "work",
      title: "接些坊市杂务",
      hint: `获得 ${B.actions.workSpiritStoneReward} 灵石`,
      icon: "coins",
      command: { type: "work", job: "chores" },
    });
    actions.push({
      id: "shop",
      title: "采买修行物资",
      hint: "查看丹药与灵草价格",
      icon: "road",
      tab: "inventory",
    });
  } else if (kind === "gate" || kind === "wild") {
    const market = localSite(p.location, "market");
    actions.push({
      id: "return-market",
      title: `返回${LOCATIONS[market].name}`,
      hint: "进城补给 · 采买与接取杂务",
      icon: "road",
      command: { type: "travel", to: market },
    });
  }
  const injured = p.hp < stats(p).maxHp;
  actions.push({
    id: "rest",
    title: injured ? "调养伤势" : "歇息片刻",
    hint: injured ? "休养一段时日 · 恢复气血" : "气血充足 · 安心休整",
    icon: "rest",
    command: { type: "rest" },
  });
  actions.push({
    id: "wait",
    title: "在此停留 1 日",
    hint: "停留此地 · 留意人物与剧情变化",
    icon: "wait",
    command: { type: "wait", days: 1 },
  });
  return actions;
}
