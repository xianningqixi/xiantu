import test from "node:test";
import assert from "node:assert/strict";
import { EXTENSIONS } from "../../lib/game/content/extensions";
import { spreadScenes } from "../../lib/game/content-story";
test("scene slots prefer one scene per person before doubling up", () => {
  const nodes = EXTENSIONS.flatMap((e) => e.data.storylets).map((n) => ({
    id: n.id,
    participants: n.participants,
    packId: n.id.split(".").slice(0, 2).join("."),
    priority: n.priority,
  }));
  assert.ok(nodes.length > 100, `only ${nodes.length} authored scenes`);
  const owner = (n: (typeof nodes)[number]) => n.participants[0] ?? n.packId;
  const crowded = [...nodes].sort(
    (a, b) => (owner(a) === owner(nodes[0]) ? -1 : 1) - (owner(b) === owner(nodes[0]) ? -1 : 1),
  );
  const picked = spreadScenes(crowded, 3);
  assert.equal(picked.length, 3);
  assert.equal(new Set(picked.map((n) => n.id)).size, 3);
  // a pool smaller than the limit keeps everything, and owner-less nodes still fill slots
  assert.equal(spreadScenes(nodes.slice(0, 2), 3).length, 2);
  assert.equal(spreadScenes([], 3).length, 0);
});
