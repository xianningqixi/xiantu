import { B, requireRule } from "./rules";
import { random } from "./rng";
import { recordFact } from "./knowledge";
import { locationKind } from "./world-map";
import type { World } from "./types";
export type Job = keyof typeof B.actions.jobs;
const receipts: Record<Job, string[]> = {
  chores: [
    "你替药铺分拣干药，逐包扎好药签。",
    "你随货郎搬齐货箱，又把棚下的石阶扫净。",
    "你照着账册清点陶罐，补齐几处模糊的标记。",
    "你在集市帮忙收摊，将散落的竹筐一一归位。",
  ],
  herbs: [
    "你循着药香寻入草坡，在背阴处采得所需药材。",
    "晨露未散，你沿山径辨认叶脉，把药草细细分开。",
    "你翻过低坡，在石缝间寻得药师嘱托的草药。",
    "你避开带刺藤蔓，带回一篮新鲜药材。",
  ],
  escort: [
    "你护着商队穿过两段山路，货物如数送达。",
    "你随车队轮换守夜，晨起将货车领入城门。",
    "你沿途照看驮兽与货箱，终于听到商队交货的铃声。",
    "两日路上风尘扑面，你将商队平安送到约定地点。",
  ],
};
export function requireJob(w: World, job: Job) {
  const rule = B.actions.jobs[job];
  requireRule(
    rule.locationKinds.includes(locationKind(w.player.location)) && w.player.realm >= rule.minRealm,
    "地点或境界不满足这项差事的条件。",
    "ACTION_UNAVAILABLE",
  );
  return rule;
}
export function settleJob(w: World, job: Job) {
  const rule = B.actions.jobs[job];
  w.player.stones += rule.stones;
  const grass = rule.grassBp > 0 && random(w, "simulation", B.probabilityScaleBp) < rule.grassBp;
  if (grass) w.player.grass++;
  const encounter =
    rule.encounterBp > 0 && random(w, "simulation", B.probabilityScaleBp) < rule.encounterBp;
  w.notice = `${receipts[job][random(w, "simulation", receipts[job].length)]} 获得 ${rule.stones} 枚灵石${grass ? "、1 株凝元草" : ""}。`;
  recordFact(w, "work", w.notice);
  if (encounter)
    recordFact(
      w,
      "encounter",
      `${rule.name}途中${job === "escort" ? "山匪拦路" : "小妖兽来犯"}，你记下遭遇，性命无碍。`,
    );
}
