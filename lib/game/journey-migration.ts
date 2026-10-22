import migrations from "./content/journey-migrations.json";
import { EXTENSIONS } from "./content/extensions";
import type { LocationId, World } from "./types";

/** Exact 0.2.0 locks from before the adult scenes were rewritten. Geography stays put. */
const PREVIOUS_VOLUME_LOCKS: Record<string, string> = {
  "shichai.chunshui@0.2.0:bbd4768fe95d856e779c575e8221c33ae806b781d78333e453854c2006d8c17c":
    "shichai.chunshui",
  "shichai.xiaye@0.2.0:639a283f6173caddad57baf2909bbe281f069d08dbfdb30a44bf7392bd7acf71":
    "shichai.xiaye",
  "shichai.qiudeng@0.2.0:8d6766874c599307bb0d201b907d2cec578f5f64fc1727f405bec762eb3072f8":
    "shichai.qiudeng",
  "shichai.dongxue@0.2.0:64e08faee26460e1fa2af5442ee68a99eb1a17953a2da62861c09b64544be247":
    "shichai.dongxue",
};

/** Only the four exact published 0.1.0 locks have a reviewed geography upgrade. Unknown locks stay unknown. */
export function upgradeJourneyLocks(locks: string[]) {
  return locks.map((lock) => {
    const rewritten = PREVIOUS_VOLUME_LOCKS[lock];
    if (rewritten)
      return EXTENSIONS.find((e) => e.data.manifest.packId === rewritten)?.lock ?? lock;
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
  const next = upgradeJourneyLocks(world.contentLocks);
  if (next.some((lock, index) => lock !== world.contentLocks[index])) changed = true;
  world.contentLocks = next;
  return changed;
}
