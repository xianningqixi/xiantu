import { PACK } from "./content/official";
import presentation from "../../content-packs/official-qingshi/npc-presentation.json";
import type { Actor, World } from "./types";

export function npcProfile(a: Actor) {
  if (a.id === PACK.roles.primary) return presentation.fixed.primary;
  if (a.id === PACK.roles.companion) return presentation.fixed.companion;
  return presentation.backgrounds[(a.appearanceSeed >>> 0) % presentation.backgrounds.length];
}

function initialAge(w: World, a: Actor) {
  const elapsed = a.alive
    ? w.day
    : (w.events.find((e) => e.kind === "death" && e.actors.includes(a.id))?.day ?? w.day);
  return Math.max(18, Math.floor((a.ageDays - elapsed) / 360));
}

/** Presentation never draws world RNG. Initial ages keep faces stable as the world advances. */
export function npcPortrait(w: World, a: Actor): { src: string; slot: number | null } {
  if (a.id === PACK.roles.primary) return presentation.fixed.primary.portrait;
  if (a.id === PACK.roles.companion) return presentation.fixed.companion.portrait;
  const peers = w.npcs
    .filter((n) => n.sex === a.sex && n.id !== PACK.roles.primary && n.id !== PACK.roles.companion)
    .sort(
      (x, y) => (x.appearanceSeed >>> 0) - (y.appearanceSeed >>> 0) || x.id.localeCompare(y.id),
    );
  const reserved = Object.values(presentation.fixed).map((p) => p.portrait);
  const pool = presentation.atlases
    .filter((atlas) => atlas.sex === a.sex)
    .flatMap((atlas) =>
      atlas.slots.map((slot) => ({ src: atlas.url, slot: slot.index, age: slot.age })),
    )
    .filter((p) => !reserved.some((r) => r.src === p.src && r.slot === p.slot));
  let available = pool.slice();
  for (const peer of peers) {
    if (!available.length) available = pool.slice();
    const age = initialAge(w, peer);
    let nearest = 0;
    for (let i = 1; i < available.length; i++)
      if (Math.abs(available[i].age - age) < Math.abs(available[nearest].age - age)) nearest = i;
    const chosen = available.splice(nearest, 1)[0];
    if (peer.id === a.id) return { src: chosen.src, slot: chosen.slot };
  }
  const fallback = pool[(a.appearanceSeed >>> 0) % pool.length];
  return { src: fallback.src, slot: fallback.slot };
}
