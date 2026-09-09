import test from "node:test";
import assert from "node:assert/strict";
import { createWorld, applyCommand, validateWorld } from "../../lib/game/engine";
import { extensionScenes } from "../../lib/game/content-story";
import { EXTENSIONS, extensionVisual } from "../../lib/game/content/extensions";
import { localSite } from "../../lib/game/world-map";
import type { Command } from "../../lib/game/types";
const packs = EXTENSIONS.filter((e) => e.data.manifest.packId.startsWith("shichai."));
test("all four shichai packs load together and every heroine route can be walked to the vow", () => {
  assert.equal(packs.length, 4);
  let w = createWorld(
    7,
    {
      name: "阿鼎",
      sex: "male",
      aptitude: 60,
      artifact: "focus",
      mode: "simple",
      appearance: { face: 0, hair: 0, color: 0 },
    },
    "shichai-smoke",
    40,
    { contentLocks: packs.map((p) => p.lock) },
  );
  assert.equal(w.npcs.length, 40 + 6 + 6 + 5 + 6);
  let serial = 0;
  const act = (c: Command) => (w = applyCommand(w, c, `smoke:${++serial}`, w.revision));
  const pick = (id: string, choiceIndex = 0) => {
    // Route fixture: advance the clock past the separately tested pacing gate.
    w.day += 2;
    const n = extensionScenes(w).find((n) => n.id === id);
    assert.ok(
      n,
      `expected ${id}, saw ${extensionScenes(w)
        .map((n) => n.id)
        .join(",")}`,
    );
    act({ type: "chooseExtension", nodeId: n!.id, choiceId: n!.choices[choiceIndex].id });
  };
  w.player.realm = 4;
  w.player.manual = true;
  w.player.stones = 200;
  const byId = (id: string) => w.npcs.find((a) => a.id === id)!;
  // prologues + main scroll
  for (const p of packs) {
    w.player.location = p.data.journey!.locations.inn as any;
    pick(`${p.data.manifest.packId}.intro`);
  }
  w.player.location = "shichai.qiudeng.inn";
  byId("shichai.qiudeng.xuanxuzi").location = "shichai.qiudeng.inn";
  pick("shichai.qiudeng.main.scroll");
  pick("shichai.qiudeng.main.sign");
  const routes: [string, string, string, string, string][] = [
    ["shichai.chunshui", "suqingyan", "qiheng", "market", "market"],
    ["shichai.chunshui", "gutinglan", "weicen", "gate", "inn"],
    ["shichai.chunshui", "wenzhiwei", "zhengbaichuan", "inn", "inn"],
    ["shichai.xiaye", "peisi", "shenwanshan", "market", "inn"],
    ["shichai.xiaye", "shenqiyue", "luqingyao", "gate", "gate"],
    ["shichai.xiaye", "liuhanyan", "hantieyi", "market", "market"],
    ["shichai.qiudeng", "wenrenshuang", "cuijiuzhang", "market", "inn"],
    ["shichai.qiudeng", "jiangzhaoxue", "baiwujiu", "gate", "gate"],
    ["shichai.dongxue", "yeshutong", "yecheng", "inn", "inn"],
    ["shichai.dongxue", "songxiaoman", "wanghu", "gate", "gate"],
    ["shichai.dongxue", "chulian", "yanguhe", "market", "inn"],
  ];
  for (const [pack, h, r, home, night] of routes) {
    const H = `${pack}.${h}`;
    const R = `${pack}.${r}`;
    // park every other extension NPC away from the player so only this route is eligible
    for (const a of w.npcs) if (a.id.startsWith("shichai.")) a.location = "ruins" as any;
    const together = (loc: string) => {
      const place = packs.find((p) => p.data.manifest.packId === pack)!.data.journey!.locations[
        loc as "market" | "inn" | "gate"
      ];
      w.player.location = place as any;
      byId(H).location = place as any;
    };
    together(home);
    pick(`${H}.meet`, 1);
    pick(`${H}.meet-again`);
    pick(`${H}.bond`);
    pick(`${H}.spark`);
    // choose the plain rival node (variants may outrank it; take whichever is offered, first choice = fight)
    w.day += 2;
    const offered = extensionScenes(w).find((n) => n.id.startsWith(`${H}.rival`));
    assert.ok(
      offered,
      `no rival node for ${H}: ${extensionScenes(w)
        .map((n) => n.id)
        .join(",")}`,
    );
    act({ type: "chooseExtension", nodeId: offered!.id, choiceId: offered!.choices[0].id });
    together(night);
    pick(`${H}.night`);
    pick(`${H}.dual`);
    pick(`${H}.vow`);
    assert.equal(w.contentState[`${H}.flag.closed`], true);
    assert.ok(byId(R).alive);
  }
  // main line to the end
  for (const a of w.npcs) if (a.id.startsWith("shichai.")) a.location = "ruins" as any;
  w.player.location = "shichai.qiudeng.inn";
  byId("shichai.qiudeng.xuanxuzi").location = "shichai.qiudeng.inn";
  pick("shichai.qiudeng.main.reveal", 1);
  pick("shichai.qiudeng.main.choice");
  pick("shichai.qiudeng.main.duel");
  validateWorld(JSON.parse(JSON.stringify(w)));
  const choices = w.events.filter((e) => e.kind === "story-choice");
  assert.equal(choices.length, 4 + 1 + 11 * 8 + 4);
});
test("yield at the rival node leads to the lost ending and closes the route; death leads to mourning", () => {
  let w = createWorld(
    9,
    {
      name: "阿鼎",
      sex: "male",
      aptitude: 60,
      artifact: "focus",
      mode: "simple",
      appearance: { face: 0, hair: 0, color: 0 },
    },
    "shichai-smoke-2",
    40,
    { contentLocks: [packs[0].lock] },
  );
  let serial = 0;
  const act = (c: Command) => (w = applyCommand(w, c, `smoke2:${++serial}`, w.revision));
  const pick = (id: string, i = 0) => {
    w.day += 2;
    const n = extensionScenes(w).find((n) => n.id === id);
    assert.ok(n, id);
    act({ type: "chooseExtension", nodeId: n!.id, choiceId: n!.choices[i].id });
  };
  const H = "shichai.chunshui.suqingyan";
  const by = (id: string) => w.npcs.find((a) => a.id === id)!;
  for (const a of w.npcs) if (a.id.startsWith("shichai.")) a.location = "ruins" as any;
  w.player.location = "market";
  by(H).location = "market";
  w.player.manual = true;
  w.player.realm = 4;
  w.contentState["shichai.chunshui.intro"] = true;
  pick(`${H}.meet`);
  pick(`${H}.bond`);
  pick(`${H}.spark`);
  pick(`${H}.rival`, 1);
  pick(`${H}.lost`);
  assert.equal(w.contentState[`${H}.flag.closed`], true);
  assert.equal(extensionScenes(w).length, 0);
  // fresh route, then she dies after bond
  const G = "shichai.chunshui.gutinglan";
  w.player.location = "gate";
  by(G).location = "gate";
  pick(`${G}.meet`);
  pick(`${G}.bond`);
  by(G).alive = false;
  by(G).hp = 0;
  pick(`${G}.mourn`);
  assert.equal(w.contentState[`${G}.flag.closed`], true);
  validateWorld(JSON.parse(JSON.stringify(w)));
});

test("every visual in all four volumes has an image URL", () => {
  for (const { data } of packs)
    for (const id of Object.keys(data.visuals)) assert.ok(extensionVisual(id).url, id);
});
