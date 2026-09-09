import { sectHome, sectResident } from "./sect-content";
import atlas from "../../content-packs/world-atlas/map.json";
import B from "./content/balance.json";
import { LOCATIONS as OFFICIAL } from "./content/official";
import { EXTENSIONS, selectedExtensions, type Extension } from "./content/extensions";
import type { Actor, LocationId, World } from "./types";
export type SiteKind = "market" | "inn" | "gate" | "ruins" | "wild";
type Place = {
  name: string;
  subtitle: string;
  body: string;
  destinations: LocationId[];
  visualId: string;
  kind: SiteKind;
};
export const ATLAS = atlas.places;
const wildPlaces = ATLAS.filter((p) => p.kind !== "town");
const wildPlace = (id: LocationId) => wildPlaces.find((p) => p.to === id);
export const LOCATIONS = Object.fromEntries([
  ...Object.entries(OFFICIAL).map(([id, place]) => [id, { ...place, kind: id }]),
  ...EXTENSIONS.flatMap(({ data }) => Object.entries(data.definitions.locations ?? {})),
  ...wildPlaces.map((p) => [
    p.to,
    {
      name: p.name,
      subtitle: p.subtitle,
      body: p.body,
      destinations: [p.gate],
      visualId: "scene.ruins.moon",
      kind: "wild",
    },
  ]),
]) as Record<LocationId, Place>;
export const locationKind = (id: LocationId): SiteKind => LOCATIONS[id]?.kind;
export function regionOf(id: LocationId) {
  return (
    wildPlace(id)?.region ??
    EXTENSIONS.find(({ data }) => Object.hasOwn(data.definitions.locations ?? {}, id))?.data
      .manifest.packId ??
    "qingshi"
  );
}
export function locationEnabled(w: World, id: LocationId): boolean {
  const wild = wildPlace(id);
  if (wild) return locationEnabled(w, wild.gate as LocationId);
  return (
    Object.hasOwn(OFFICIAL, id) ||
    selectedExtensions(w.contentLocks).some(({ data }) =>
      Object.hasOwn(data.definitions.locations ?? {}, id),
    )
  );
}
export function localSite(id: LocationId, kind: "market" | "inn" | "gate"): LocationId {
  id = (wildPlace(id)?.gate ?? id) as LocationId;
  const pack = EXTENSIONS.find(({ data }) => Object.hasOwn(data.definitions.locations ?? {}, id));
  return (pack?.data.journey?.locations[kind] ?? kind) as LocationId;
}
export function safeLocations(actor: Actor): LocationId[] {
  if (sectHome(actor)) return [sectHome(actor)!];
  return (["market", "inn", "gate"] as const).map((kind) => localSite(actor.location, kind));
}
const residents = new Map(
  EXTENSIONS.flatMap(({ data }) => data.definitions.characters.map((c) => [c.id, c] as const)),
);
export function scheduledHome(actor: Actor, day: number): LocationId | null {
  if (sectResident(actor.id) && sectHome(actor) && actor.location !== sectHome(actor))
    return sectHome(actor)!;
  const resident = residents.get(actor.id);
  if (!resident?.homeVisitIntervalDays || day % resident.homeVisitIntervalDays !== 0) return null;
  const home = resident.location as LocationId;
  return regionOf(home) === regionOf(actor.location) ? home : null;
}
export const expeditionCount = (w: World) =>
  w.events.filter((e) => e.kind === "expedition" && e.actors.includes("PLAYER")).length;
export function journeys(w: World) {
  return selectedExtensions(w.contentLocks)
    .filter((e) => e.data.journey)
    .sort(
      (a, b) =>
        a.data.journey!.order - b.data.journey!.order ||
        a.data.manifest.packId.localeCompare(b.data.manifest.packId),
    );
}
export function chapterClues(w: World, data: Extension) {
  return data.storylets.filter((n) => w.contentState[n.id]).length;
}
export function chapterWaitDays(w: World, data: Extension) {
  const last = w.events.findLast((e) => e.storyNodeId?.startsWith(data.manifest.packId + "."));
  return last && data.journey
    ? Math.max(0, data.journey.sceneIntervalDays - (w.day - last.day))
    : 0;
}
export function currentJourney(w: World) {
  return journeys(w).find(({ data }) =>
    Object.values(data.journey!.locations).some(
      (id) => regionOf(id as LocationId) === regionOf(w.player.location),
    ),
  );
}
export function regionName(id: LocationId) {
  id = (wildPlace(id)?.gate ?? id) as LocationId;
  return (
    EXTENSIONS.find(({ data }) => Object.hasOwn(data.definitions.locations ?? {}, id))?.data.journey
      ?.regionName ?? "青石坊市"
  );
}
export function roadOptions(w: World) {
  const routes = journeys(w).filter(({ data }) => data.journey!.locations.gate !== "gate");
  const gates: LocationId[] = [
    "gate",
    ...routes.map(({ data }) => data.journey!.locations.gate as LocationId),
  ];
  const index = gates.indexOf(w.player.location);
  if (index < 0) return [];
  return [index - 1, index + 1]
    .filter((i) => i >= 0 && i < gates.length)
    .map((i) => {
      const target = i ? routes[i - 1].data : null;
      const departing = index ? routes[index - 1].data : null;

      return {
        to: gates[i],
        name: target?.journey?.regionName ?? "青石坊市",
        days: (i > index ? target : departing)?.journey?.travelDays ?? 1,
        requirement: "",
        lead: i > index ? target!.journey!.routeLead : "沿来路返回，旧地与故人仍在。",
      };
    });
}
/** Weighted route projection. Reading a route never advances time or consumes RNG. */
export function travelRoute(
  from: LocationId,
  to: LocationId,
  w?: World,
): { days: number; path: LocationId[] } | null {
  const enabled = (id: LocationId) => !!LOCATIONS[id] && (!w || locationEnabled(w, id));
  if (!enabled(from) || !enabled(to) || from === "ruins" || to === "ruins") return null;
  const graph = new Map<LocationId, { to: LocationId; days: number }[]>();
  const add = (a: LocationId, b: LocationId, days: number) => {
    if (enabled(a) && enabled(b)) graph.set(a, [...(graph.get(a) ?? []), { to: b, days }]);
  };
  const ids = {
    market: "LOC_MARKET",
    inn: "LOC_INN",
    gate: "LOC_GATE",
    ruins: "LOC_RUINS",
    wild: "",
  };
  for (const [id, place] of Object.entries(LOCATIONS)) {
    if (place.kind === "wild") continue;
    for (const next of place.destinations) {
      const rule = B.travel.routes.find(
        (r) =>
          (r.from === ids[place.kind] && r.to === ids[locationKind(next)]) ||
          (r.bidirectional && r.to === ids[place.kind] && r.from === ids[locationKind(next)]),
      );
      add(
        id as LocationId,
        next,
        rule?.days ?? (place.kind === "gate" || locationKind(next) === "gate" ? 1 : 0),
      );
    }
  }
  const routes = (
    w
      ? journeys(w)
      : EXTENSIONS.filter((e) => e.data.journey).sort(
          (a, b) => a.data.journey!.order - b.data.journey!.order,
        )
  ).filter((e) => e.data.journey!.locations.gate !== "gate");
  let previous: LocationId = "gate";
  for (const { data } of routes) {
    const gate = data.journey!.locations.gate as LocationId;
    add(previous, gate, data.journey!.travelDays);
    add(gate, previous, data.journey!.travelDays);
    previous = gate;
  }
  for (const p of wildPlaces) {
    add(p.to as LocationId, p.gate as LocationId, p.days!);
    add(p.gate as LocationId, p.to as LocationId, p.days!);
  }
  const distances = new Map<LocationId, { days: number; path: LocationId[] }>([
    [from, { days: 0, path: [from] }],
  ]);
  const visited = new Set<LocationId>();
  while (true) {
    const current = [...distances.entries()]
      .filter(([id]) => !visited.has(id))
      .sort((a, b) => a[1].days - b[1].days)[0];
    if (!current) return null;
    const [id, route] = current;
    if (id === to) return route;
    visited.add(id);
    for (const edge of graph.get(id) ?? []) {
      const days = route.days + edge.days;
      if (days < (distances.get(edge.to)?.days ?? Infinity))
        distances.set(edge.to, { days, path: [...route.path, edge.to] });
    }
  }
}
export function atlasPlaces(w: World) {
  return ATLAS.filter((p) => locationEnabled(w, p.to as LocationId));
}
