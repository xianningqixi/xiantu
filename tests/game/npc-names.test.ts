import test from "node:test";
import assert from "node:assert/strict";
import { createWorld, validateWorld } from "../../lib/game/engine";
import { migrateSave } from "../../lib/game/migrations";
import { deduplicateNpcNames } from "../../lib/game/npc-names";
import { withCampaignContent } from "../../lib/game/campaign-content";
import { EXTENSIONS } from "../../lib/game/content/extensions";
import { npcSubject } from "../../lib/game/portrait-subject";
import { fighter } from "../../lib/game/combat";
import type { Profile } from "../../lib/game/types";

const profile: Profile = {
  name: "姓名验收",
  sex: "female",
  aptitude: 75,
  artifact: "focus",
  mode: "simple",
  appearance: { face: 0, hair: 1, color: 0 },
};
const locks = withCampaignContent();
const unique = (world: ReturnType<typeof createWorld>) =>
  assert.equal(new Set(world.npcs.map((actor) => actor.name)).size, world.npcs.length);

test("NPC names are unique across seeds and every installed content roster", () => {
  for (const seed of [
    0,
    42,
    12345,
    4294967295,
    ...Array.from({ length: 24 }, (_, i) => i * 7919),
  ]) {
    for (const contentLocks of [[], EXTENSIONS.map((e) => e.lock)]) {
      const world = createWorld(seed, profile, "names", 100, { contentLocks });
      unique(world);
      const before = structuredClone(world);
      assert.deepEqual(deduplicateNpcNames(world), []);
      assert.deepEqual(world, before);
      assert.deepEqual(createWorld(seed, profile, "names", 100, { contentLocks }), before);
    }
  }
});

test("duplicate repair preserves authored names, untouched NPCs, identity, history and random streams", () => {
  const old = createWorld(12345, profile, "duplicate-migration", 100, { contentLocks: locks });
  old.npcs.find((a) => a.id === "NPC_0020")!.name = "沈栖月";
  old.npcs.find((a) => a.id === "NPC_0028")!.name = "许清禾";
  old.npcs.find((a) => a.id === "NPC_0030")!.name = "叶长宁";
  const before = structuredClone(old);
  const portraits = old.npcs.map(npcSubject);
  const result = migrateSave(old);
  assert.equal(result.migrated, true);
  unique(result.world);
  assert.equal(result.world.npcs.find((a) => a.id === "shichai.xiaye.shenqiyue")!.name, "沈栖月");
  assert.equal(result.world.npcs.find((a) => a.id === "NPC_0010")!.name, "许清禾");
  assert.equal(result.world.npcs.find((a) => a.id === "NPC_0024")!.name, "叶长宁");
  const changes = result.world.npcs.filter((a, i) => a.name !== before.npcs[i].name);
  assert.deepEqual(
    changes.map((a) => a.id),
    ["NPC_0020", "NPC_0028", "NPC_0030"],
  );
  assert.deepEqual(result.world.npcs.map(npcSubject), portraits);
  const withoutRename = structuredClone(result.world);
  withoutRename.npcs.forEach((a, i) => {
    a.name = before.npcs[i].name;
  });
  assert.deepEqual(withoutRename, before);
  assert.deepEqual(old, before);
  assert.deepEqual(migrateSave(result.world), { world: result.world, migrated: false });
});

test("name repair also handles duplicate dead actors and current battle labels without changing battle state", () => {
  const world = createWorld(2, profile, "battle-names", 100, { contentLocks: locks });
  const actor = world.npcs[27];
  actor.name = world.npcs[9].name;
  const ally = fighter(actor);
  world.battle = {
    id: "name-label-test",
    allies: [ally],
    enemies: [],
    logs: [],
    round: 0,
    auto: false,
    lethal: false,
  };
  const before = structuredClone(world);
  const changes = deduplicateNpcNames(world);
  assert.equal(changes.length, 1);
  assert.equal(world.battle!.allies[0].name, actor.name);
  const restored = structuredClone(world);
  restored.npcs[27].name = before.npcs[27].name;
  restored.battle!.allies[0].name = before.battle!.allies[0].name;
  assert.deepEqual(restored, before);
  world.npcs[29].alive = false;
  world.npcs[29].name = world.npcs[9].name;
  assert.equal(deduplicateNpcNames(world).length, 1);
  unique(world);
});

test("the maximum 200-NPC duplicate roster resolves deterministically without numeric names", () => {
  const world = createWorld(7, profile, "crowded", 200);
  world.npcs.forEach((a) => {
    a.name = "沈清禾";
    delete a.npcTemplateId;
  });
  const before = structuredClone(world);
  const changes = deduplicateNpcNames(world);
  assert.equal(changes.length, 199);
  unique(world);
  assert.ok(world.npcs.every((a) => !/\d/.test(a.name) && a.name.length <= 4));
  deduplicateNpcNames(before);
  assert.deepEqual(before, world);
  validateWorld(world);
});
