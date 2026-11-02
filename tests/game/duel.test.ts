import test from "node:test";
import assert from "node:assert/strict";
import { createWorld, applyCommand, validateWorld } from "../../lib/game/engine";
import { extensionScenes } from "../../lib/game/content-story";
import { EXTENSIONS } from "../../lib/game/content/extensions";
import { chapterWaitDays } from "../../lib/game/world-map";
import { validateExtension, validateRegistry } from "../../lib/game/content/extension-contract.mjs";
import { PACK, VISUAL_IDS } from "../../lib/game/content/official";
import { MAIN_STORY } from "../../lib/game/main-story";
import { readFileSync } from "node:fs";
import type { Command, LocationId, World } from "../../lib/game/types";
import { answerDaily } from "./daily-test-helpers";

const official = { roles: PACK.roles, assets: VISUAL_IDS };
const packs = EXTENSIONS.filter((e) => e.data.manifest.packId.startsWith("shichai."));
const fictive = {
  name: "决斗",
  sex: "male" as const,
  aptitude: 70,
  artifact: "focus" as const,
  mode: "simple" as const,
  appearance: { face: 0, hair: 0, color: 0 },
};
const EVENTS = JSON.parse(readFileSync("content-packs/daily-events/events.json", "utf8")) as {
  events: { id: string; choices: { id: string }[] }[];
};
const EVENT = "daily.brush-wolves";
const RISK_CHOICE = EVENTS.events.find((n) => n.id === EVENT)!.choices[0].id;
const HERO = "shichai.chunshui.suqingyan";
const RIVAL = "shichai.chunshui.qiheng";

function fresh() {
  let w = createWorld(99, fictive, "duel", 40, { contentLocks: packs.map((p) => p.lock) });
  const act = (c: Command) => (w = pg(w, c));
  return {
    get w() {
      return w;
    },
    act,
  };
}

/** 把世界摆到「已经退让、站在青岚宗山门」的状态。 */
function arrange(w: World) {
  w.player.realm = 10;
  w.player.manual = true;
  w.player.stones = 120;
  w.day = 40;
  if (!w.events.some((e) => e.kind === "survey"))
    w.events.unshift({ ...w.events[0], id: `${w.events[0].id}rub`, kind: "survey" });
  const chapters = MAIN_STORY.chapters;
  chapters.slice(0, 3).forEach((chapter, i) => {
    if (w.events.some((e) => e.mainStory?.nodeId === chapter.dialogue.id)) return;
    const base = { ...w.events[0], kind: "main-story" as const };
    w.events.push({
      ...base,
      id: `${base.id}d${i}`,
      day: i * 10 + 2,
      location: chapter.sites[chapter.guideSite as "market"] as LocationId,
      actors: ["PLAYER", chapter.guide],
      mainStory: { nodeId: chapter.dialogue.id, choiceId: "listen" },
    });
    w.events.push({
      ...base,
      id: `${base.id}f${i}`,
      day: i * 10 + 4,
      location: chapter.sites[chapter.discovery.site as "market"] as LocationId,
      actors: ["PLAYER"],
      mainStory: { nodeId: chapter.discovery.id, choiceId: "follow" },
    });
  });
  for (const a of w.npcs) if (a.id.startsWith("shichai.")) a.location = "ruins" as never;
  const hero = w.npcs.find((a) => a.id === HERO)!;
  const rival = w.npcs.find((a) => a.id === RIVAL)!;
  w.player.location = "market" as never;
  hero.location = "market" as never;
  rival.location = "market" as never;
  Object.assign(w.contentState, {
    "shichai.chunshui.intro": true,
    [`${HERO}.meet`]: true,
    [`${HERO}.bond`]: true,
    [`${HERO}.spark`]: true,
    [`${HERO}.rival`]: true,
    [`${HERO}.lost`]: true,
    [`${HERO}.flag.closed`]: false,
    [`${HERO}.flag.lost`]: true,
  });
  return w;
}

/** 行动编号必须全局唯一：同一个编号重放不会推进时间。 */
let clock = 0;
const pg = (w: World, c: Command) => applyCommand(w, c, `duel:${++clock}`, w.revision);

/** 空过 n 天：等候是长行动，得先起再逐日 step。行动编号要全局唯一，不能重放。 */
function pass(w: World, n: number) {
  let world = w;
  for (let i = 0; i < n; i++) {
    world = answerDaily(world);
    world = applyCommand(world, { type: "wait", days: 1 }, `duel:wait:${++clock}`, world.revision);
    for (let j = 0; j < 4 && world.longAction; j++) {
      world = answerDaily(world);
      world = applyCommand(world, { type: "step" }, `duel:step:${++clock}`, world.revision);
    }
  }
  return world;
}

const offers = (w: World, suffix: string) =>
  extensionScenes(w, 12).some((n) => n.id === `${HERO}.${suffix}`);

test("losing does not end the line: the sequel opens and leads to a duel", () => {
  const { w } = fresh();
  arrange(w);
  assert.equal(offers(w, "lost-2"), true, "被夺之后应该还有下一幕");
  // 没走 lost-2 之前不该直接跳到决斗。
  assert.equal(offers(w, "lost-3"), false);
  w.contentState[`${HERO}.flag.lost2`] = true;
  assert.equal(offers(w, "lost-2"), false, "lost-2 是一次性的");
  assert.equal(offers(w, "lost-3"), true);
});

test("winning the duel flips the route back to the romance line", () => {
  const { w, act } = fresh();
  arrange(w);
  w.contentState[`${HERO}.flag.lost2`] = true;
  const scene = extensionScenes(w, 12).find((n) => n.id === `${HERO}.lost-3`)!;
  const duel = scene.choices.find((c) => c.effects.some((e) => e.kind === "duel"))!;
  const started = act({ type: "chooseExtension", nodeId: scene.id, choiceId: duel.id });
  assert.ok(started.battle, "选完应该真的开打");
  assert.equal(started.battle!.kind, "duel");
  assert.equal(started.battle!.enemies[0].id, RIVAL);
  // 对手按玩家境界托底，不能被剧情碾压。
  assert.ok(started.battle!.enemies[0].maxHp >= Math.ceil(started.player.hp * 0.9));

  // 直接把对手打空结束战斗，走胜利分支。
  started.battle!.enemies[0].hp = 1;
  started.battle!.allies[0].hp = started.player.hp;
  let won = started;
  for (let i = 0; i < 30 && won.battle; i++)
    won = applyCommand(won, { type: "battle", action: "attack" }, `duel:win:${i}`, won.revision);
  assert.equal(won.battle, null);
  assert.ok(won.contentState[`${HERO}.flag.lost3`], "赢了要写下胜利字段");
  assert.ok(!won.contentState[`${HERO}.flag.lost3-lose`]);
  // 一幕演完有两日间隔，等过去才轮到下一幕。
  won = pass(won, 2);
  // 赢了之后有专门的收尾节点，接过它才算真的把人赢回来。
  const after = extensionScenes(won, 12).find((n) => n.id === `${HERO}.lost-win`);
  assert.ok(
    after,
    `赢了应该有把路翻回来的后续：${extensionScenes(won, 12)
      .map((n) => n.id)
      .join(",")} lost3=${won.contentState[`${HERO}.flag.lost3`]}`,
  );
  validateWorld(won);
});

test("retreating from the duel counts as not winning, and retrying clears the marks", () => {
  const { w, act } = fresh();
  arrange(w);
  w.contentState[`${HERO}.flag.lost2`] = true;
  let world = w;
  const scene = extensionScenes(world, 12).find((n) => n.id === `${HERO}.lost-3`)!;
  const duel = scene.choices.find((c) => c.effects.some((e) => e.kind === "duel"))!;
  world = act({ type: "chooseExtension", nodeId: scene.id, choiceId: duel.id });
  // 撤退有成功率，没逃掉或被逼败都算没赢，这里一直走到分出结果。
  for (let i = 0; i < 40 && world.battle; i++)
    world = applyCommand(
      world,
      { type: "battle", action: "retreat" },
      `duel:retreat:${i}`,
      world.revision,
    );
  assert.equal(world.battle, null);
  assert.ok(world.contentState[`${HERO}.flag.lost3-lose`], "退也算没赢");
  assert.ok(!world.contentState[`${HERO}.flag.lost3`]);

  // 输了之后有「再来一场」，失败页是独立一幕，等一幕间隔再看。
  world = pass(world, 2);
  // 两天里情敌会走开，把他放回原处再验证下一场能开。
  world.npcs.find((a) => a.id === RIVAL)!.location = "market" as never;
  const retry = extensionScenes(world, 12).find((n) => n.id === `${HERO}.lost-retry`);
  assert.ok(
    retry,
    `输了应该有再来一场的选择 scenes=${extensionScenes(world, 12)
      .map((n) => n.id)
      .join(
        ",",
      )} day=${world.day} pl=${world.player.location} hl=${world.npcs.find((a) => a.id === HERO)?.location} keys=${Object.keys(world.contentState).length} lw=${world.contentState[`${HERO}.lost-win`]} rv=${world.npcs.find((a) => a.id === RIVAL)?.alive} rel=${JSON.stringify(world.relations.filter((r) => r.from === HERO))} closed=${world.contentState[`${HERO}.flag.closed`]} lose=${world.contentState[`${HERO}.flag.lost3-lose`]} loot=${!!world.loot} long=${world.longAction?.kind} ended=${world.ended} alive=${world.player.alive} hp=${world.player.hp} pending=${world.pendingDailyEventId} revision=${world.revision} wait=${chapterWaitDays(world, EXTENSIONS.find((e) => e.data.manifest.packId === "shichai.chunshui")!.data)}`,
  );
  const again = retry!.choices.find((c) => c.effects.some((e) => e.kind === "duel"))!;
  const stones = world.player.stones;
  world = applyCommand(
    world,
    { type: "chooseExtension", nodeId: retry!.id, choiceId: again.id },
    "duel:retry",
    world.revision,
  );
  assert.equal(world.contentState[`${HERO}.flag.lost3`], false);
  assert.equal(world.contentState[`${HERO}.flag.lost3-lose`], false);
  assert.equal(world.player.stones, stones - 20);
  // 重来一次是当场再打，不必重新爬上宗门的台阶。
  assert.ok(world.battle, "「再来一场」应该直接开打");
  assert.equal(world.battle!.kind, "duel");

  // 这次赢下来，再把收尾节点接过，初夜路线重新可达。
  world.battle!.enemies[0].hp = 1;
  for (let i = 0; i < 30 && world.battle; i++)
    world = applyCommand(
      world,
      { type: "battle", action: "attack" },
      `duel:again:${i}`,
      world.revision,
    );
  assert.equal(world.battle, null);
  assert.ok(world.contentState[`${HERO}.flag.lost3`], "这一场赢了");

  // 赢下来的收尾还不算完，接过它才真正翻回主线。
  world = pass(world, 2);
  const win = extensionScenes(world, 12).find((n) => n.id === `${HERO}.lost-win`);
  assert.ok(win, "赢了之后应该有翻回主线的收尾");
  const take = win!.choices.find((c) => c.effects.some((e) => e.kind === "bond"))!;
  world = pg(world, { type: "chooseExtension", nodeId: win!.id, choiceId: take.id });
  assert.equal(world.contentState[`${HERO}.flag.contest`], true);
  validateWorld(world);
});

test("duel needs checkable content: target must be on stage, flags must be declared", () => {
  const entry = packs.find((p) => p.data.manifest.packId === "shichai.chunshui")!;
  validateExtension(entry.data, official);
  const stray = structuredClone(entry.data);
  stray.storylets.find((n) => n.id === `${HERO}.lost-3`)!.participants = [HERO];
  assert.throws(() => validateExtension(stray, official), /必须在场参与/);

  const ghost = structuredClone(entry.data);
  const effect = ghost.storylets
    .find((n) => n.id === `${HERO}.lost-3`)!
    .choices.flatMap((c) => c.effects)
    .find((e) => e.kind === "duel")!;
  effect.win.key = `${HERO}.flag.ghost`;
  assert.throws(() => validateExtension(ghost, official), /越权/);

  // 没声明能力就不能用决斗。
  const bare = structuredClone(entry.data);
  bare.manifest.requiresCapabilities = bare.manifest.requiresCapabilities.filter(
    (c) => c !== "duel.v1",
  );
  assert.throws(() => validateExtension(bare, official), /duel\.v1/);
});

test("a daily risk event now starts a real fight before it reports anything", () => {
  let w = createWorld(7, fictive, "risk");
  w.player.realm = 3;
  // 把一条风险小事摆上台面，选「站稳脚步应对」。
  const day = { id: `${w.events[0].id}daily`, nodeId: EVENT };
  w.pendingDailyEventId = EVENT;
  w.contentState[EVENT] = true;
  w.dailyEventCooldowns[EVENT] = w.day;
  w.events.push({ ...w.events[0], id: day.id, kind: "daily-event", daily: { nodeId: EVENT } });
  w = pg(w, { type: "choose", nodeId: EVENT, choiceId: RISK_CHOICE });
  assert.ok(w.battle, "遭遇要真的开打，不能只留一条日志");
  assert.equal(w.battle!.kind, "road");
  assert.ok(w.battle!.enemies.length > 0);
  assert.equal(w.pendingDailyEventId, null);
  validateWorld(w);
});
