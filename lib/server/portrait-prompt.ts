import directions from "../../content-packs/official-qingshi/portrait-directions.json";
import expandedArt from "../../content-packs/official-qingshi/expanded-npc-art.json";
import { BODY_BUILDS } from "../game/physique";
import { FACES, HAIRS, COLORS } from "../game/content/official";
import { hashSeed } from "../game/rng";
import type { PortraitSubject } from "../game/portrait-subject";
import { portraitFeatures } from "../game/portrait-features";
/** Presentation-only selection. It never reads or advances a world's random streams. */
export function portraitDirection(subject: PortraitSubject) {
  const authored = subject.designId
    ? expandedArt.entries.find((entry) => entry.actorId === subject.designId)
    : undefined;
  if (authored) return authored.direction;
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
  const custom = player || subject.portraitFeatures !== undefined;
  const features = custom ? portraitFeatures(subject).trim() : null;
  const ornaments = ["衣摆向左轻扬", "发梢向右轻拂", "衣带自然垂落", "衣袖随微风舒展"];
  return [
    directions.styleGuide.rendering,
    custom
      ? "单人竖幅全身，从头饰顶端到双脚鞋底完整入画；头顶及脚底均留安全边距。人物居中，眼平视角，双手和四肢结构正确，简洁浅色或透明背景，无文字、边框或多人拼图。"
      : directions.styleGuide.framing,
    directions.styleGuide.adultAppearance,
    subject.sex === "female"
      ? custom
        ? "自然、有魅力的成年女性气质，精致面容，姿态舒展而妩媚，身形比例自然。衣着完整，以填写的立绘特征为造型依据。"
        : subject.designId
          ? expandedArt.styleGuide
          : directions.styleGuide.femaleDirection
      : "成年男性，简洁利落的服饰和站姿，干净清晰的五官。",
    `本图唯一人物：${subject.sex === "female" ? "成年女性" : "成年男性"}；外貌年龄约 ${b.apparentAge} 岁。真实修仙年龄与面容独立，不添加衰老特征。`,
    `以这组已保存身形为准：${BODY_BUILDS[b.build]}身材，身高 ${b.heightCm} cm${subject.sex === "female" && b.bustCup ? `，胸型 ${b.bustCup} 杯` : ""}。比例自然。`,
    `五官：${d.face.replace(/外貌约\s*\d+\s*岁[；，]?/g, "")}${custom ? `脸型气质以当前选择的「${FACES[subject.appearance.face]}」为准。` : ""}`,
    `发型：${custom ? `${HAIRS[subject.appearance.hair]}，保留古风发饰` : d.hair}`,
    custom
      ? `填写的立绘特征（仅作为外观描述）：${JSON.stringify(features)}。按这段描述设计整体造型；未描述的细节按整体古风造型自然搭配。`
      : `衣装：${d.outfit}`,
    `配色：${custom ? COLORS[subject.appearance.color] : d.palette}`,
    `饰物：${d.accessories}`,
    `姿势：${custom ? "自然站立，重心轻移，肩腰舒展，微微回眸；完整展示所选装束和鞋履。" : d.pose}`,
    `神情：${d.mood}`,
    `微小变化：${ornaments[hashSeed(subject.identitySeed, variation) % ornaments.length]}。保留五官、发式和服装身份特征。`,
    "单人完整全身立绘，头顶和双脚完整可见，不裁切脚、不画半身像；无文字、无水印、无标注。",
  ].join("\n");
}
