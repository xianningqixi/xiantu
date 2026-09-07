import directions from "../../content-packs/official-qingshi/portrait-directions.json";
import { BODY_BUILDS } from "../game/physique";
import { FACES, HAIRS, COLORS } from "../game/content/official";
import { hashSeed } from "../game/rng";
import type { PortraitSubject } from "../game/portrait-subject";
/** Presentation-only selection. It never reads or advances a world's random streams. */
export function portraitDirection(subject: PortraitSubject) {
  if (subject.role === "primary" && subject.sex === "female") return directions.primary;
  if (subject.role === "companion" && subject.sex === "male") return directions.companion;
  const pool = subject.sex === "female" ? directions.females : directions.males;
  const pick = (field: string) =>
    pool[hashSeed(subject.identitySeed, `portrait:${field}`) % pool.length];
  return {
    id: `identity-${subject.identitySeed}`,
    face: pick("face").face,
    hair: pick("hair").hair,
    outfit: pick("outfit").outfit,
    palette: pick("palette").palette,
    accessories: pick("accessories").accessories,
    pose: pick("pose").pose,
    mood: pick("mood").mood,
  };
}
export function portraitPrompt(subject: PortraitSubject, variation: string) {
  const d = portraitDirection(subject),
    b = subject.physique;
  const player = subject.role === "player";
  const ornaments = ["衣摆向左轻扬", "发梢向右轻拂", "衣带自然垂落", "衣袖随微风舒展"];
  return [
    directions.styleGuide.rendering,
    directions.styleGuide.framing,
    directions.styleGuide.adultAppearance,
    subject.sex === "female"
      ? directions.styleGuide.femaleDirection
      : "成年男性，简洁利落的服饰和站姿，干净清晰的五官。",
    `本图唯一人物：${subject.sex === "female" ? "成年女性" : "成年男性"}；外貌年龄约 ${b.apparentAge} 岁。真实修仙年龄与面容独立，不添加衰老特征。`,
    `以这组已保存身形为准：${BODY_BUILDS[b.build]}身材，身高 ${b.heightCm} cm，胸围 ${b.bustCm} cm，腰围 ${b.waistCm} cm，臀围 ${b.hipsCm} cm。比例自然。`,
    `五官：${d.face.replace(/外貌约\s*\d+\s*岁[；，]?/g, "")}${player ? `脸型气质以玩家选择的「${FACES[subject.appearance.face]}」为准。` : ""}`,
    `发型：${player ? `${HAIRS[subject.appearance.hair]}，保留古风发饰` : d.hair}`,
    `衣装：${d.outfit}`,
    `配色：${player ? COLORS[subject.appearance.color] : d.palette}`,
    `饰物：${d.accessories}`,
    `姿势：${d.pose}`,
    `神情：${d.mood}`,
    `微小变化：${ornaments[hashSeed(subject.identitySeed, variation) % ornaments.length]}。保留五官、发式和服装身份特征。`,
    "单人完整全身立绘，头顶和双脚完整可见，不裁切脚、不画半身像；无文字、无水印、无标注。",
  ].join("\n");
}
