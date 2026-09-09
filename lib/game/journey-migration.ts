import migrations from "./content/journey-migrations.json";
import { EXTENSIONS } from "./content/extensions";
import type { LocationId, World } from "./types";
/** Only the four exact published 0.1.0 locks have a reviewed upgrade path. Unknown locks stay unknown. */
export function upgradeJourneyLocks(locks: string[]) {
  return locks.map((lock) => {
    const migration = migrations.find((m) => m.from === lock);
    const target =
      migration &&
      EXTENSIONS.find(
        (e) =>
          e.data.manifest.packId === migration.packId &&
          e.data.manifest.packVersion === migration.toVersion,
      );
    return target?.lock ?? lock;
  });
}
export function migrateJourneys(world: World) {
  if (!Array.isArray(world.contentLocks)) return false;
  let changed = false;
  for (const migration of migrations) {
    if (!world.contentLocks.includes(migration.from)) continue;
    const entry = EXTENSIONS.find(
      (e) =>
        e.data.manifest.packId === migration.packId &&
        e.data.manifest.packVersion === migration.toVersion,
    );
    if (!entry) continue;
    for (const actor of world.npcs) {
      if (
        !entry.data.definitions.characters.some((a) => a.id === actor.id) ||
        world.party.includes(actor.id)
      )
        continue;
      const location = migration.locations[actor.location as keyof typeof migration.locations];
      if (location) actor.location = location as LocationId;
    }
    changed = true;
  }
  world.contentLocks = upgradeJourneyLocks(world.contentLocks);
  return changed;
}
