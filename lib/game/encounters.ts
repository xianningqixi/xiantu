import { B, REALM_KEYS, clamp } from "./rules";
import { random } from "./rng";
import { SAFE } from "./rules";
import { fighter } from "./combat";
import { regionOf } from "./world-map";
import type { Battle, Fighter, LocationId, World } from "./types";

interface TemplateConfig {
  name: string;
  where?: "road" | "explore" | "both";
  weight?: number;
  minPlayerRealm?: number;
  maxPlayerRealm?: number;
  minExpeditionCount?: number;
  count: [number, number];
  realmOffset: number;
  stones: [number, number];
  grassChanceBp?: number;
  grass?: number;
  insight?: number;
  tactic?: "guard" | "heal";
  tacticAtHpBp?: number;
  tacticHealBp?: number;
  lethal?: boolean;
  lethalInComplex?: boolean;
}

const templates = B.combat.encounters as unknown as Record<string, TemplateConfig>;

function roll(range: [number, number], w: World, stream: "combat" = "combat") {
  return range[0] + random(w, stream, range[1] - range[0] + 1);
}

function enemy(template: TemplateConfig, w: World, index: number): Fighter {
  const realm = clamp(w.player.realm + template.realmOffset, 0, REALM_KEYS.length - 1);
  const realmStats = (
    B.combat.realmStats as Record<
      string,
      { maxHp: number; attack: number; defense: number; speed: number }
    >
  )[REALM_KEYS[realm]];
  const suffix = index === 0 ? "·甲" : index === 1 ? "·乙" : `·${index + 1}`;
  return {
    id: `ENEMY_${index}`,
    name: `${template.name}${template.count[1] > 1 || index > 0 ? suffix : ""}`,
    maxHp: realmStats.maxHp,
    hp: realmStats.maxHp,
    attack: realmStats.attack,
    defense: realmStats.defense,
    speed: realmStats.speed,
    guard: false,
    cooldown: 0,
    ...(template.tactic
      ? {
          tactic: template.tactic,
          tacticAtHpBp: template.tacticAtHpBp ?? 5000,
          tacticHealBp: template.tacticHealBp,
        }
      : {}),
  };
}

/** Weighted pick among the templates that fit this encounter context and realm. */
function pickTemplate(w: World, where: "road" | "explore") {
  const eligible = Object.values(templates).filter(
    (t) =>
      t.count &&
      t.stones &&
      t.minExpeditionCount === undefined &&
      (t.where ?? "both") !== (where === "road" ? "explore" : "road") &&
      w.player.realm >= (t.minPlayerRealm ?? 0) &&
      (t.maxPlayerRealm === undefined || w.player.realm <= t.maxPlayerRealm),
  );
  const total = eligible.reduce((sum, t) => sum + (t.weight ?? 1), 0);
  let rollValue = random(w, "combat", total);
  for (const template of eligible) {
    rollValue -= template.weight ?? 1;
    if (rollValue < 0) return template;
  }
  return eligible[0];
}

function buildBattle(
  w: World,
  kind: "road" | "explore",
  template: TemplateConfig,
  options: { destination?: LocationId; intro: string },
): Battle {
  const count = roll(template.count, w);
  const enemies = Array.from({ length: count }, (_, i) => enemy(template, w, i));
  const stones = roll(template.stones, w);
  const grass =
    template.grassChanceBp !== undefined &&
    random(w, "combat", B.probabilityScaleBp) < template.grassChanceBp
      ? (template.grass ?? 1)
      : 0;
  return {
    id: `encounter:${w.revision + 1}:${w.day}`,
    round: 1,
    allies: w.party.map((id) =>
      fighter(id === "PLAYER" ? w.player : w.npcs.find((a) => a.id === id)!),
    ),
    enemies,
    logs: [options.intro],
    auto: false,
    lethal: !!template.lethal || (!!template.lethalInComplex && w.profile.mode === "complex"),
    kind,
    location: w.player.location,
    destination: options.destination,
    loot: { stones, grass },
    ...(template.insight ? { insight: template.insight } : {}),
  };
}

/**
 * Wilderness roads roll once per travelled day (12% base). The three authored
 * town sites of the starting region never roll; authored far regions do.
 */
export function maybeRoadEncounter(w: World, destination: LocationId): Battle | null {
  const origin = w.player.location;
  if (SAFE.includes(origin) && SAFE.includes(destination)) return null;
  // The authored starting region stays peaceful; encounters begin on farther roads
  // once the player is strong enough to survive an ambush.
  if (regionOf(origin) === "qingshi" || regionOf(destination) === "qingshi") return null;
  if (
    w.player.realm <
    ((B.travel as { randomRoadEncounterMinRealm?: number }).randomRoadEncounterMinRealm ?? 4)
  )
    return null;
  // Ambushes are post-story 历练 pressure: scripted chapters and author previews stay calm.
  if (w.story.settledDay == null) return null;
  if (random(w, "combat", B.probabilityScaleBp) >= B.travel.randomRoadEncounterBp) return null;
  const template = pickTemplate(w, "road");
  return buildBattle(w, "road", template, {
    destination,
    intro: `${template.name}拦住了去路。你与同行之人稳住阵脚，准备迎战。`,
  });
}

/** Wilderness exploration uses the same templates; the fight happens on the spot. */
export function exploreEncounter(w: World): Battle | null {
  const reveal = random(w, "combat", B.probabilityScaleBp);
  if (reveal >= B.actions.explore.encounterBp) return null;
  const template = pickTemplate(w, "explore");
  return buildBattle(w, "explore", template, {
    intro: `灌木深处窜出${template.name}，你来不及退回大路。`,
  });
}
