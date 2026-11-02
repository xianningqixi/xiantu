import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { openCurrentLocation } from "./journey-controls";
import {
  installBDriver,
  commandB,
  createB,
  loadB,
  replyB,
  growthB,
  showB,
} from "./redesign-b-driver";
import type { LocationId, World } from "../../lib/game/types";

/**
 * 第三夜（night-3）：第二夜写完、隔一场之后再进第一夜的地点（此处为青石坊市，
 * 她就在本卷起点，不必跨城）：第三夜要出现、画面要是自己的那张、露骨段落按尺度折叠。
 * 这条链只能靠真实 UI 走，重写时最容易断的就是 flag 生产者。
 */
type Node = {
  id: string;
  minRealm: number;
  visualId: string;
  conditions: { fact: string; op: string; value: unknown }[];
  choices: { id: string; label: string; effects: { kind: string; key?: string }[] }[];
};
const HERO = "shichai.chunshui.suqingyan";
const PACK = HERO.split(".")[1];
const TABLE = JSON.parse(
  readFileSync(`content-packs/shichai-${PACK}/storylets.json`, "utf8"),
) as Node[];
const node = (id: string) => TABLE.find((n) => n.id === id)!;
const LEGACY_REALM = [0, 1, 2, 3, 10];
/** minRealm 0–4 是旧五档（映射到炼气一到筑基初期），5 以上才是当前索引。 */
const realmGateIndex = (realm: number) => (realm <= 4 ? LEGACY_REALM[realm] : realm);
const progressChoice = (id: string) => {
  const suffix = id.slice(id.lastIndexOf(".") + 1);
  const progress = node(id).choices.filter((c) => c.effects.some((e) => e.kind === "progress"));
  return (
    progress.find((c) =>
      c.effects.some((e) => e.kind === "progress" && (e.key ?? "").endsWith(`.flag.${suffix}`)),
    )?.id ??
    progress[0]?.id ??
    node(id).choices[0].id
  );
};
/** 当前显示的旁支属于谁（`<pack>.<hero>`），便于判断能否先点掉腾槽。 */
const survey_owner = (shown: string | null) => {
  if (!shown) return null;
  const owner = shown.split(".").slice(0, 3).join(".");
  return owner === HERO ? owner : null;
};
const requiredLocation = (id: string) =>
  (node(id).conditions.find((c) => c.fact === "location")?.value as LocationId | undefined) ?? null;

async function openScenes(page: Page): Promise<{ w: World; ids: string[] }> {
  const w = await loadB(page);
  await showB(page, w);
  await openCurrentLocation(page);
  const ids = await page
    .locator("[data-story-id]")
    .evaluateAll((els) => els.map((el) => el.getAttribute("data-story-id")!));
  return { w, ids };
}

async function grow(page: Page, w: World, target: number): Promise<World> {
  for (let i = 0; i < 400 && w.player.realm < target; i++) {
    const reply = replyB(w);
    w = await commandB(page, w, reply ?? growthB(w));
  }
  expect(w.player.realm).toBeGreaterThanOrEqual(target);
  return w;
}

/** 修行是分段的长动作，走完它；途中冒出的小事顺手答掉，否则下一步会被拦住。 */
async function settle(page: Page, w: World): Promise<World> {
  let next = w;
  for (let i = 0; i < 200; i++) {
    const reply = replyB(next);
    if (reply) {
      next = await commandB(page, next, reply);
      continue;
    }
    if (!next.longAction) break;
    next = await commandB(page, next, { type: "step" });
  }
  expect(next.longAction).toBeNull();
  expect(next.pendingDailyEventId).toBeNull();
  return next;
}

async function run(page: Page, w: World, c: Parameters<typeof commandB>[2]): Promise<World> {
  return settle(page, await commandB(page, await settle(page, w), c));
}

async function travel(page: Page, w: World, to: LocationId): Promise<World> {
  try {
    return await commandB(page, await settle(page, w), { type: "travel", to });
  } catch {
    const mid = await commandB(page, await settle(page, w), {
      type: "travel",
      to: (to.split(".").slice(0, 2).join(".") + ".market") as LocationId,
    });
    return commandB(page, mid, { type: "travel", to });
  }
}

/** 卷首：先到地点把 intro 做掉，否则整卷节点都被 chapterWaitDays 挡着。 */
async function openVolume(page: Page, w: World): Promise<World> {
  const intro = `shichai.${PACK}.intro`;
  const flag = node(intro)
    .choices.flatMap((c) => c.effects)
    .find((e) => e.kind === "progress")!.key!;
  if (w.contentState[flag]) return w;
  let next = w;
  const at = requiredLocation(intro);
  for (let i = 0; i < 24; i++) {
    const reply = replyB(next);
    if (reply) {
      next = await run(page, next, reply);
      continue;
    }
    if (at && next.player.location !== at) {
      next = await travel(page, next, at);
      continue;
    }
    const opened = await openScenes(page);
    next = opened.w;
    if (opened.ids.includes(intro))
      return run(page, next, {
        type: "chooseExtension",
        nodeId: intro,
        choiceId: progressChoice(intro),
      });
    next = await run(page, next, { type: "wait", days: 1 });
  }
  throw new Error(`${intro} 未出现`);
}

/** 把这条线按依赖顺序推进到目标可选（含卷首 intro）。 */
async function reach(page: Page, w: World, target: string, choose = true): Promise<World> {
  const chain: string[] = [];
  const walk = (id: string, seen = new Set<string>()) => {
    if (seen.has(id)) return;
    seen.add(id);
    for (const c of node(id).conditions) {
      const m = /^flag\.(.+)\.flag\.(.+)$/.exec(c.fact);
      if (!m || c.op !== "eq" || c.value !== true) continue;
      const wanted = c.fact.slice("flag.".length);
      const prev = TABLE.find((n) =>
        n.choices.some((ch) => ch.effects.some((e) => e.kind === "progress" && e.key === wanted)),
      )?.id;
      if (!prev) continue;
      walk(prev, seen);
      if (!chain.includes(prev)) chain.push(prev);
    }
  };
  walk(target);
  chain.push(target);

  // minRealm 0–4 是旧五档，要按引擎的门槛映射（4 = 筑基初期）再换算成境界索引。
  let next = await openVolume(page, await grow(page, w, realmGateIndex(node(target).minRealm)));
  for (const step of chain) {
    const want = requiredLocation(step);
    let seen: string[] = [];
    for (let i = 0; i < 90; i++) {
      if (want && next.player.location !== want) next = await travel(page, next, want);
      const opened = await openScenes(page);
      next = opened.w;
      seen = opened.ids;
      if (seen.includes(step)) break;
      // 等待途中优先挑「还排在后面的链条节点」，否则会把目标本身提前吃掉。
      const remaining = new Set(chain.slice(chain.indexOf(step)));
      const other = seen.find((id) => id.startsWith(`${HERO}.`) && !remaining.has(id));
      if (other) {
        next = await run(page, next, {
          type: "chooseExtension",
          nodeId: other,
          choiceId: progressChoice(other),
        });
        // 卷内有 sceneIntervalDays（2 日）间隔，选完还要空等，否则一直被间隔挡着。
        for (let d = 0; d < 2; d++) next = await run(page, next, { type: "wait", days: 1 });
      } else next = await run(page, next, { type: "wait", days: 1 });
    }
    expect(seen.includes(step), `${step} 未出现`).toBe(true);
    if (!choose && step === target) return next;
    next = await run(page, next, {
      type: "chooseExtension",
      nodeId: step,
      choiceId: progressChoice(step),
    });
  }
  return next;
}

/** 剧情有 2 日间隔，第三夜要等第隔日才重新刷出来。 */
async function waitForScene(page: Page, id: string): Promise<World> {
  let opened = await openScenes(page);
  for (let i = 0; i < 8 && !opened.ids.includes(id); i++) {
    opened = await openScenes(page);
    if (opened.ids.includes(id)) break;
    await run(page, opened.w, replyB(opened.w) ?? { type: "wait", days: 1 });
    opened = await openScenes(page);
  }
  expect(opened.ids).toContain(id);
  return opened.w;
}

/**
 * 选中目标节点。选项按钮不在剧情卡片里，而在底部行动坞：首选是 `.dojo-primary`，
 * 其余进「更多」。等待期间 NPC 会走动、卡片会整块重渲染，所以每轮都重新确认场景再点。
 * 女主每次只占一个槽，其它旁支还会一直把目标挤在外面，因此顺带把占位旁支点掉。
 */
async function chooseScene(page: Page, id: string): Promise<World> {
  const want = requiredLocation(id);
  const label = node(id).choices.find((c) => c.id === progressChoice(id))!.label;
  let lastError: unknown = null;
  for (let i = 0; i < 60; i++) {
    let w = await loadB(page);
    if (want && w.player.location !== want) w = await travel(page, w, want);
    await showB(page, w);
    await openCurrentLocation(page);
    const shown = await page
      .locator(".dojo-scene")
      .evaluate((el) => el.getAttribute("data-story-id"));
    const target = shown === id ? id : survey_owner(shown);
    if (target) {
      try {
        const clicked = await page.evaluate(
          ([match, choiceLabel]) => {
            const buttons = [
              ...document.querySelectorAll<HTMLElement>(
                '.dojo-primary,[data-journey-action^="choice-"]',
              ),
            ].filter((b) => !(b as HTMLButtonElement).disabled);
            const button =
              buttons.find((b) => b.textContent?.includes(choiceLabel)) ??
              (match ? buttons[0] : undefined);
            button?.click();
            return !!button;
          },
          [target === id, label] as const,
        );
        if (!clicked) throw new Error(`${target} 没有可用按钮`);
        const after = await loadB(page);
        if (after.contentState[target]) {
          if (target === id) return after;
          lastError = new Error(`${id} 还没出现`);
        } else lastError = new Error(`${target} 点击后未记账`);
      } catch (error) {
        lastError = error;
      }
    }
    let nw = await loadB(page);
    await run(page, nw, replyB(nw) ?? { type: "wait", days: 1 });
  }
  throw lastError ?? new Error(`${id} 选不上`);
}

test("night-3 follows night-2 and shows its own image with the folded body", async ({ page }) => {
  test.setTimeout(900000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await installBDriver(page);
  let w = await createB(page, 95);
  w = await reach(page, w, `${HERO}.night-3`, false);
  w = await waitForScene(page, `${HERO}.night-3`);

  const card = page.locator(`[data-story-id="${HERO}.night-3"]`);
  await expect(card).toBeVisible();
  // 画面必须是第三夜自己那张，键规则 `<hero>.cg.night-3` → 文件 `<hero>-cg-night-3.webp`。
  const src = await card.locator("figure img").getAttribute("src");
  expect(src).toContain(`${HERO.split(".").pop()}-cg-night-3`);
  const response = await page.request.get(src!);
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("image/webp");

  const fold = card.locator("details.intimate-body-fold");
  await expect(fold).toHaveCount(1);
  // 底部行动坞是 fixed 的，会把 summary 压在下面，先滚进视口再强制点。
  await fold.locator("summary").evaluate((el) => (el as HTMLElement).click());
  await expect(card.locator(".intimate-body-fold p")).not.toBeEmpty();

  // 选一条推进会写 flag.night3，此后第三夜不再重复出现。
  w = await chooseScene(page, `${HERO}.night-3`);
  expect(w.contentState[`${HERO}.night-3`]).toBeTruthy();
  expect(errors).toEqual([]);
});

test("night-2 has its own image instead of reusing the first night's", async ({ page }) => {
  test.setTimeout(900000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await installBDriver(page);
  let w = await createB(page, 95);
  w = await reach(page, w, `${HERO}.night-2`, false);
  w = await waitForScene(page, `${HERO}.night-2`);

  const card = page.locator(`[data-story-id="${HERO}.night-2"]`);
  await expect(card).toBeVisible();
  const src = await card.locator("figure img").getAttribute("src");
  expect(src).toContain(`${HERO.split(".").pop()}-cg-night-2`);
  const response = await page.request.get(src!);
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("image/webp");

  w = await chooseScene(page, `${HERO}.night-2`);
  expect(w.contentState[`${HERO}.night-2`]).toBeTruthy();
  expect(errors).toEqual([]);
});
