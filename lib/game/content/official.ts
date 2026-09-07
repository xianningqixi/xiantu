import B from "./balance.json";
import type { LocationId, StoryNode, World } from "../types";
import manifest from "../../../content-packs/official-qingshi/manifest.json";
import story from "../../../content-packs/official-qingshi/storylets.json";
import locations from "../../../content-packs/official-qingshi/locations.json";
import characters from "../../../content-packs/official-qingshi/characters.json";
import presentation from "../../../content-packs/official-qingshi/presentation.json";
import art from "../../../content-packs/official-qingshi/art/manifest.json";
import integrity from "../../../content-packs/official-qingshi/integrity.json";
import { validateContent } from "./contract.mjs";

const data = validateContent({ manifest, story, locations, characters, presentation, art });
export const VISUAL_IDS = Object.keys(data.art.assets);
export const PACK = { ...data.manifest, lock: integrity.lock };
export const CHARACTERS = data.characters;
export const PRESENTATION = data.presentation;
export const LOCATIONS = data.locations as Record<
  LocationId,
  { name: string; subtitle: string; body: string; destinations: LocationId[]; visualId: string }
>;
export const STORY = data.story as StoryNode[];
export function visual(id: string) {
  return data.art.assets[id] || { url: "", alt: "此处图景，待你想象。", kind: "scene" };
}
export const ART = {
  market: visual(LOCATIONS.market.visualId).url,
  inn: visual(LOCATIONS.inn.visualId).url,
  gate: visual(LOCATIONS.gate.visualId).url,
  ruins: visual(LOCATIONS.ruins.visualId).url,
  primary: visual(CHARACTERS.primary.portraitId || "").url,
};
/** Substitution is text-only; React renders escaped text, never HTML or executable expressions. */
export function contentText(value: string, w: World) {
  const tokens: Record<string, string> = {
    "player.name": w.player.name,
    "primary.name":
      w.npcs.find((a) => a.id === PACK.roles.primary)?.name || CHARACTERS.primary.name,
    "companion.name":
      w.npcs.find((a) => a.id === PACK.roles.companion)?.name || CHARACTERS.companion.name,
  };
  return value.replace(/\{\{([^{}]+)\}\}/g, (_, key: string) => tokens[key] ?? "未知人物");
}

export const ARTIFACTS = [
  {
    id: "focus",
    name: "定心佩",
    glyph: "定",
    description: `心静则道生。每日修炼额外获得 ${B.artifacts.ARTIFACT_FOCUS.cultivationFlatGainPerDay} 点修为。`,
  },
  {
    id: "ward",
    name: "归途符",
    glyph: "归",
    description: `山长水远，总有归途。撤退成功率提高 ${B.artifacts.ARTIFACT_WARD.retreatBonusBp / 100}%。`,
  },
  {
    id: "bond",
    name: "同心绳",
    glyph: "缘",
    description: "一诺千金。履行约定时，同伴额外增加信任。",
  },
] as const;
export const REALMS = ["凡人", "炼气一层", "炼气二层", "炼气三层", "筑基初期"];
export const FACES = ["清秀", "俊朗", "温润", "英气"];
export const HAIRS = ["束发", "披发", "高髻", "短发"];
export const COLORS = ["青衫", "月白", "墨衣", "藕荷"];
