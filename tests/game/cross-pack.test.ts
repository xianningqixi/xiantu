import test from "node:test";
import assert from "node:assert/strict";
import { createWorld, applyCommand, validateWorld } from "../../lib/game/engine";
import { extensionScenes } from "../../lib/game/content-story";
import { EXTENSIONS } from "../../lib/game/content/extensions";
import { validateExtension, validateRegistry } from "../../lib/game/content/extension-contract.mjs";
import { PACK, VISUAL_IDS } from "../../lib/game/content/official";
import { MAIN_STORY } from "../../lib/game/main-story";
import type { Command, LocationId, World } from "../../lib/game/types";

const official = { roles: PACK.roles, assets: VISUAL_IDS };
const packs = EXTENSIONS.filter((e) => e.data.manifest.packId.startsWith("shichai."));
const NODE = "shichai.dongxue.yeshutong.hearsay";
const CLOSED = "shichai.chunshui.wenzhiwei.flag.closed";

function fresh() {
  let w = createWorld(
    4242,
    {
      name: "旁听",
      sex: "male",
      aptitude: 70,
      artifact: "focus",
      mode: "simple",
      appearance: { face: 0, hair: 0, color: 0 },
    },
    "cross-pack",
    40,
    { contentLocks: packs.map((p) => p.lock) },
  );
  let serial = 0;
  const act = (c: Command) => (w = applyCommand(w, c, `cross:${++serial}`, w.revision));
  // 返回值是新世界；调用方靠它拿最新状态，闭包里的 w 只给 arrange 用。
  return {
    get w() {
      return w;
    },
    act,
  };
}

/** 只有《春水》那边的进度条满足条件时，这条冬雪节点才该出现。 */
function arrange(w: World, closed: boolean, vow: boolean) {
  // 十三档境界：筑基初期是 10，整卷的门槛正好卡在这里。
  w.player.realm = 10;
  w.player.manual = true;
  // 章节按顺序解锁；这里直接伪造前几卷的主线记录，跳过攻略本身。
  // 伪造的记录带日期，得让世界时间盖过它们。
  w.day = 40;
  // 主线要求先有拓片证据（勘察或秘境结算）。
  if (!w.events.some((e) => e.kind === "survey"))
    w.events.unshift({ ...w.events[0], id: `${w.events[0].id}rub`, kind: "survey" });
  const chapters = MAIN_STORY.chapters;
  chapters.slice(0, 3).forEach((chapter, i) => {
    if (w.events.some((e) => e.mainStory?.nodeId === chapter.dialogue.id)) return;
    const base = { ...w.events[0], kind: "main-story" as const };
    const dialogueDay = i * 10 + 2;
    w.events.push({
      ...base,
      id: `${base.id}d${i}`,
      day: dialogueDay,
      location: chapter.sites[chapter.guideSite as "market"] as LocationId,
      actors: ["PLAYER", chapter.guide],
      mainStory: { nodeId: chapter.dialogue.id, choiceId: "listen" },
    });
    w.events.push({
      ...base,
      id: `${base.id}f${i}`,
      day: dialogueDay + 2,
      location: chapter.sites[chapter.discovery.site as "market"] as LocationId,
      actors: ["PLAYER"],
      mainStory: { nodeId: chapter.discovery.id, choiceId: "follow" },
    });
  });
  // 别的女主全部挪开，避免她们的同条件节点把槽占满。
  for (const a of w.npcs) if (a.id.startsWith("shichai.")) a.location = "ruins" as never;
  const hero = w.npcs.find((a) => a.id === "shichai.dongxue.yeshutong")!;
  w.player.location = "shichai.dongxue.inn" as never;
  hero.location = "shichai.dongxue.inn" as never;
  Object.assign(w.contentState, {
    "shichai.dongxue.intro": true,
    "shichai.dongxue.yeshutong.meet": true,
    "shichai.dongxue.yeshutong.bond": true,
    "shichai.dongxue.yeshutong.flag.bond": true,
    [CLOSED]: closed,
    "shichai.chunshui.wenzhiwei.flag.vow": vow,
  });
  return w;
}
const offers = (w: World) => extensionScenes(w, 12).some((n) => n.id === NODE);

test("a pack can read another pack's progress only when it declares crossFlag.v1", () => {
  const entry = packs.find((p) => p.data.manifest.packId === "shichai.dongxue")!;
  assert.ok(entry.data.manifest.reads?.includes(CLOSED));
  validateExtension(entry.data, official);
  // 条件事实里的外部字段不能凭空出现：去掉能力就该被拒。
  const stray = structuredClone(entry.data);
  stray.storylets[0].conditions.push({ fact: `flag.${CLOSED}`, op: "eq", value: false });
  stray.manifest.requiresCapabilities = stray.manifest.requiresCapabilities.filter(
    (c) => c !== "crossFlag.v1",
  );
  assert.throws(() => validateExtension(stray, official), /crossFlag/);
  // 也不能读一个没人声明的字段。
  const ghost = structuredClone(entry);
  ghost.data.manifest.reads = ["shichai.chunshui.wenzhiwei.flag.ghost"];
  assert.throws(
    () => validateRegistry([ghost, ...packs.filter((p) => p !== entry)], official),
    /没有包声明/,
  );
  // 不能把自己本包的字段写进 reads（那会被当成外部字段重复校验）。
  const self = structuredClone(entry);
  self.data.manifest.reads = [self.data.manifest.flags[0]];
  assert.throws(
    () => validateRegistry([self, ...packs.filter((p) => p !== entry)], official),
    /重复/,
  );
});

test("every volume can echo another volume's scenes, and only declares what it reads", () => {
  for (const pack of packs) {
    const m = pack.data.manifest;
    assert.ok(!m.reads?.length || m.requiresCapabilities.includes("crossFlag.v1"));
    // reads 必须与实际条件一一对应：多写的会随着内容改动悄悄失效。
    const used = new Set(
      pack.data.storylets.flatMap((n) =>
        n.conditions.filter((c) => c.fact.startsWith("flag.")).map((c) => c.fact.slice(5)),
      ),
    );
    const external = [...used].filter((f) => !m.flags.includes(f));
    assert.deepEqual(
      [...(m.reads ?? [])].sort(),
      external.sort(),
      `${m.packId} 的 reads 与条件不一致`,
    );
  }
  // 每条呼应都要有出处：读的那个 flag 得真的是别的卷写下来的。
  for (const pack of packs)
    for (const n of pack.data.storylets.filter((x) => x.id.endsWith(".hearsay")))
      for (const c of n.conditions.filter((x) => x.fact.startsWith("flag."))) {
        const key = c.fact.slice(5);
        if (pack.data.manifest.flags.includes(key)) continue;
        const writer = packs.find(
          (p) =>
            p.data.manifest.flags.includes(key) &&
            p.data.storylets.some((n) =>
              n.choices.some((ch) =>
                ch.effects.some((e) => e.kind === "progress" && e.key === key),
              ),
            ),
        );
        assert.ok(writer, `${n.id} 读的 ${key} 没有任何卷写它`);
      }
});

test("the cross-pack node shows up only after the other volume's scene happened", () => {
  const { w, act } = fresh();
  assert.equal(offers(arrange(w, false, false)), false, "没有听过就说不上话");
  arrange(w, true, false);
  assert.equal(offers(w), true);
  // 对方已经结了道侣，听的就不该是「花轿抬走」那回事。
  arrange(w, true, true);
  assert.equal(offers(w), false);

  // 回到「听过、但她还没结道侣」的状态再选一次，验证效果真的落账。
  arrange(w, true, false);
  const scene = extensionScenes(w, 12).find((n) => n.id === NODE)!;
  // act 会换掉整个世界对象，取最新的一份再断言。
  const next = act({ type: "chooseExtension", nodeId: scene.id, choiceId: scene.choices[0].id });
  assert.ok(next.contentState[NODE]);
  const r = next.relations.find(
    (x) => x.from === "shichai.dongxue.yeshutong" && x.to === "PLAYER",
  )!;
  assert.ok(r.favor > 0 && r.trust > 0);
  validateWorld(next);
});
