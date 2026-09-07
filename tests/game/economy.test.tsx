import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { InventoryPanel } from "../../components/game/panels";
import { applyCommand, createWorld } from "../../lib/game/engine";
import { SHOP_ITEMS } from "../../lib/game/economy";
import { GameError } from "../../lib/game/errors";
const profile = {
  name: "核价",
  sex: "female",
  aptitude: 50,
  artifact: "focus",
  mode: "simple",
  appearance: { face: 0, hair: 0, color: 0 },
} as const;
test("rendered shop prices equal the actual rule debit for every item", () => {
  for (const item of Object.keys(SHOP_ITEMS) as (keyof typeof SHOP_ITEMS)[]) {
    const world = createWorld(42, profile, `price-${item}`);
    world.player.stones = 100;
    const html = renderToStaticMarkup(
      <InventoryPanel world={world} send={async () => true} busy={false} />,
    );
    const displayed = Number(
      html.match(new RegExp(`data-shop-item="${item}" data-price="(\\d+)"`))?.[1],
    );
    assert.ok(displayed > 0);
    const next = applyCommand(world, { type: "buy", item }, `buy-${item}`, world.revision);
    assert.equal(world.player.stones - next.player.stones, displayed);
    assert.equal(next.player[item], world.player[item] + 1);
  }
});
test("resource refusals carry a stable code and preserve source state", () => {
  const world = createWorld(42, profile, "refusal");
  const before = JSON.stringify(world);
  assert.throws(
    () => applyCommand(world, { type: "buy", item: "grass" }, "poor", 0),
    (error: unknown) => error instanceof GameError && error.code === "INSUFFICIENT_RESOURCES",
  );
  assert.equal(JSON.stringify(world), before);
});
