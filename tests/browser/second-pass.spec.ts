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
 * 第二轮剧情（errand/confide/return-gift/night-2/daybreak）走真实 UI：
 * 先把存档推到能看见余额，再沿前置链推进这条线，
 * 校验同屏旁支按人分槽与夜间二次场景的正文分层。
 *
 * 节点表直接读 content-packs（用例进程里不加载 lib 的 json import）。
 */
type Effect = { kind: string; key?: string; item?: string; value?: number };
type Node = {
  id: string;
  minRealm: number;
  conditions: { fact: string; op: string; value: unknown }[];
  choices: { id: string; effects: Effect[] }[];
};
const PACK_OF = (hero: string) => hero.split(".")[1];
const TABLES = new Map<string, Node[]>();
function nodesOf(hero: string): Node[] {
  const pack = PACK_OF(hero);
  if (!TABLES.has(pack))
    TABLES.set(
      pack,
      JSON.parse(readFileSync(`content-packs/shichai-${pack}/storylets.json`, "utf8")) as Node[],
    );
  return TABLES.get(pack)!;
}
const node = (id: string) => nodesOf(id).find((n) => n.id === id)!;
/**
 * 选「真正推进这一步」的分支：progress 键通常是 `<hero>.flag.<尾缀>`，
 * 同名的 `.later` 之类也会带 progress，所以按尾缀对齐后再兜底。
 */
const progressChoice = (id: string, w: World) => {
  const suffix = id.slice(id.lastIndexOf(".") + 1);
  const affordable = (c: Node["choices"][number]) =>
    c.effects.every((e) => {
      if (e.kind !== "resource") return true;
      const key = e.item as keyof World["player"] | undefined;
      const value = e.value ?? 0;
      return !key || value >= 0 || (w.player[key] as number) + value >= 0;
    });
  const usable = node(id).choices.filter(affordable);
  const progress = usable.filter((c) => c.effects.some((e) => e.kind === "progress"));
  return (
    progress.find((c) =>
      c.effects.some((e) => e.kind === "progress" && (e.key ?? "").endsWith(`.flag.${suffix}`)),
    )?.id ??
    progress[0]?.id ??
    usable[0]?.id ??
    node(id).choices[0].id
  );
};
const requiredLocation = (id: string) =>
  (node(id).conditions.find((c) => c.fact === "location")?.value as LocationId | undefined) ?? null;

/** 由 flag 依赖反推这条线的前置顺序（flag.<hero>.flag.suffix → <hero>.suffix）。 */
function pathTo(target: string): string[] {
  const table = nodesOf(target);
  const flags = node(target).choices.flatMap((c) =>
    c.effects.filter((e) => e.kind === "progress" && e.key).map((e) => e.key!),
  );
  for (const key of new Set(flags.map((k) => k.slice(0, k.lastIndexOf(".flag."))))) {
    const chain: string[] = [];
    const walk = (id: string, seen = new Set<string>()) => {
      if (seen.has(id)) return;
      seen.add(id);
      for (const c of node(id).conditions) {
        const m = /^flag\.(.+)\.flag\.(.+)$/.exec(c.fact);
        if (!m || c.op !== "eq" || c.value !== true) continue;
        // flag 尾缀不一定等于节点尾缀（bond 依赖 flag.met，节点却叫 meet），反查生成者。
        const wanted = c.fact.slice("flag.".length);
        const prev = table.find((n) =>
          n.choices.some((choice) =>
            choice.effects.some((e) => e.kind === "progress" && e.key === wanted),
          ),
        )?.id;
        if (!prev) continue;

        walk(prev, seen);
        if (!chain.includes(prev)) chain.push(prev);
      }
    };
    walk(target);
    if (chain.length) return [...chain, target];
  }
  return [target];
}

/** 重新载入页面并返回当前存档与屏幕上可选的场景 id（真实渲染，不是猜）。 */
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

/** 修行是分段的长动作，出发前必须先把它走完；路上撞上的战斗也要先收尾。 */
async function settle(page: Page, w: World): Promise<World> {
  let next = w;
  for (let i = 0; i < 200 && next.longAction; i++)
    next = await commandB(page, next, { type: "step" });
  expect(next.longAction).toBeNull();
  for (let i = 0; i < 200 && next.battle; i++) {
    const reply = replyB(next);
    next = await commandB(page, next, reply ?? { type: "battle", action: "attack" });
  }
  return next;
}

/** 每条命令前先把长动作走完，命令后再收尾，避免条件过期。 */
async function run(page: Page, w: World, c: Parameters<typeof commandB>[2]): Promise<World> {
  return settle(page, await commandB(page, await settle(page, w), c));
}

/** 走一步；没有直达路就先回到这一带的市集再转。 */
async function travel(page: Page, w: World, to: LocationId): Promise<World> {
  try {
    return await commandB(page, await settle(page, w), { type: "travel", to });
  } catch {
    const hub =
      to.split(".").length > 1 ? to.split(".").slice(0, 2).join(".") + ".market" : "market";
    const mid = await commandB(page, await settle(page, w), {
      type: "travel",
      to: hub as LocationId,
    });
    return commandB(page, mid, { type: "travel", to });
  }
}

/** 卷首：到指定地点把 intro 做掉，否则整卷的节点都被 chapterWaitDays 挡着。 */
async function openVolume(page: Page, w: World, hero: string): Promise<World> {
  const pack = PACK_OF(hero);
  const intro = `shichai.${pack}.intro`;
  const progress = nodesOf(hero)
    .find((n) => n.id === intro)!
    .choices.flatMap((c) => c.effects)
    .find((e) => e.kind === "progress")?.key;
  const flag = progress?.includes(".flag.")
    ? progress.slice(0, progress.lastIndexOf(".flag."))
    : progress;
  if (!flag || w.contentState[flag]) return w;
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
    if (i % 5 === 0) console.log("VOL", i, next.player.location, opened.ids.join("|"));
    if (opened.ids.includes(intro))
      return run(page, next, {
        type: "chooseExtension",
        nodeId: intro,
        choiceId: progressChoice(intro, next),
      });
    next = await run(page, next, { type: "wait", days: 1 });
  }
  throw new Error(`${intro} 未出现`);
}

/**
 * 沿前置链把这位女主的线推到目标节点可选；地点不对就先挪过去。
 * choose=false 时停在「目标刚可选」，方便用例自己去看它。
 */
async function reach(
  page: Page,
  w: World,
  hero: string,
  target: string,
  choose = true,
): Promise<World> {
  w = await settle(page, await grow(page, w, node(target).minRealm));
  w = await openVolume(page, w, hero);
  let next = w;
  const chain = pathTo(target);
  console.log("CHAIN", target, chain.join(" > "));
  for (const step of chain) {
    const want = requiredLocation(step);
    if (want && next.player.location !== want) next = await travel(page, next, want);
    let seenHere: string[] = [];
    let shown = 0;
    for (let i = 0; i < 90; i++) {
      // 地点依赖的节点：每轮都核对一遍，免得被日常事件或长动作带走。
      if (want && next.player.location !== want) next = await travel(page, next, want);
      const opened = await openScenes(page);
      next = opened.w;
      seenHere = opened.ids;
      if (seenHere.includes(step)) break;
      if (i % 10 === 0)
        console.log(
          "HERE",
          i,
          next.player.location,
          !!next.npcs.find((n) => n.id === hero && n.location === next.player.location),
          next.npcs.find((n) => n.id === hero)?.npcJourney ?? null,
        );
      if (i === 20)
        console.log(
          "TEXT",
          (await page.locator("#current-scene").innerText()).slice(0, 300).replace(/\n/g, " / "),
        );
      if (shown++ % 3 === 0)
        console.log(
          "DBG",
          i,
          step,
          next.day,
          next.player.location,
          seenHere,
          next.longAction?.kind ?? "-",
          JSON.stringify({
            locks: next.contentLocks?.length,
            battle: !!next.battle,
            loot: !!next.loot,
            daily: next.pendingDailyEventId,
            ended: next.ended,
            realm: next.player.realm,
            near: next.npcs.filter((n) => n.location === next.player.location).map((n) => n.id),
            known: next.relations.filter((r) => r.known).length,
          }),
        );
      const reply = replyB(next);
      if (reply) {
        next = await run(page, next, reply);
        continue;
      }
      const other = seenHere.find((id) => id.startsWith(`${hero}.`));
      next = await run(
        page,
        next,
        other
          ? { type: "chooseExtension", nodeId: other, choiceId: progressChoice(other, next) }
          : { type: "wait", days: 1 },
      );
    }
    if (!seenHere.includes(step))
      console.log("MISS", step, next.day, next.player.location, seenHere);
    expect(seenHere.includes(step), `${step} 未出现`).toBe(true);
    if (!choose && step === target) return next;
    next = await run(page, next, {
      type: "chooseExtension",
      nodeId: step,
      choiceId: progressChoice(step, next),
    });
  }
  return next;
}

/**
 * 两个人同时在客栈时，两条旁支要并列挂在屏幕上，且绝不出现同一个人两条。
 * NPC 会走动，所以轮着等她们都回到店里。
 */
test("second-pass scenes share the stage, one slot per person", async ({ page }) => {
  test.setTimeout(900000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await installBDriver(page);
  let w = await createB(page, 95);
  // 两条线都推到 night-2（夜里之后还有戏），再把她们聊成朋友、邀进队伍带着走：
  // NPC 会自己四处走动，只有在队伍里才保证跟主角同处一地。
  for (const hero of ["shichai.chunshui.gutinglan", "shichai.chunshui.wenzhiwei"]) {
    w = await reach(page, w, hero, `${hero}.night-2`);
    // 信任只从共事里长：先把她线上的余下节点一并答掉（每次都带 bond 信任），
    // 条件齐了再邀入队伍带着走。
    for (let i = 0; i < 40; i++) {
      try {
        w = await run(page, w, { type: "inviteCompanion", target: hero });
        break;
      } catch {
        /* 还不是朋友，往下攀交情 */
      }
      // 她会走动，先追上她再去攀交情。
      const here = w.npcs.find((n) => n.id === hero);
      if (here && here.location !== w.player.location && !w.party.includes(hero))
        w = await travel(page, w, here.location);
      const opened = await openScenes(page);
      w = opened.w;
      const scene = opened.ids.find((id) => id.startsWith(`${hero}.`));
      // 她的线还能往下走就往下走；走不动了就闲聊攒交情（信任只从共事里长）。
      const pickCmd =
        replyB(w) ??
        (scene
          ? { type: "chooseExtension" as const, nodeId: scene, choiceId: progressChoice(scene, w) }
          : { type: "chat" as const, target: hero });
      w = await run(page, w, pickCmd);
      if (!scene) w = await run(page, w, replyB(w) ?? { type: "wait", days: 1 });
    }
    expect(w.party, `${hero} 未能同行`).toContain(hero);
  }
  w = await travel(page, w, "inn");
  // 卷内剧情有 2 日的间隔，刚过完一场夜里要歇几天才有下一场。
  let opened = await openScenes(page);
  for (let i = 0; i < 6 && !opened.ids.length; i++) {
    w = await run(page, opened.w, replyB(opened.w) ?? { type: "wait", days: 1 });
    opened = await openScenes(page);
  }
  const scenes = opened.ids.filter((id) => !id.endsWith(".intro"));
  console.log("SCENES", scenes.join(" | "));
  expect(scenes.length).toBeGreaterThan(1);
  const owners = scenes.map((id) => id.split(".")[2]);
  expect(new Set(owners).size).toBe(owners.length);

  // 同屏条数跟着窗口宽度走：手机上只说一条，宽屏才铺开。
  const cards = page.locator("[data-story-id]");
  await page.setViewportSize({ width: 390, height: 900 });
  await expect.poll(() => cards.count()).toBe(1);
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect.poll(() => cards.count()).toBeGreaterThan(1);
  expect(await cards.count()).toBeLessThanOrEqual(scenes.length);

  // 一条占主位，其余进旁支栏：正文真的写出来，署名不是空的。
  const extras = page.locator(".dojo-extra-story[data-story-id]");
  expect(await extras.count()).toBeGreaterThan(0);
  const first = extras.first();
  await expect(first.locator("p").first()).not.toBeEmpty();
  await expect(first.locator(".eyebrow")).not.toBeEmpty();
  await expect(page.locator(".dojo-primary")).toBeVisible();
  expect(errors).toEqual([]);
});

test("night-2 keeps the explicit body folded at standard and hidden at tasteful", async ({
  page,
}) => {
  test.setTimeout(900000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await installBDriver(page);
  let w = await createB(page, 95);
  const hero = "shichai.chunshui.suqingyan";
  w = await reach(page, w, hero, `${hero}.night-2`, false);
  let night = await openScenes(page);
  for (let i = 0; i < 6 && !night.ids.includes(`${hero}.night-2`); i++) {
    w = await run(page, night.w, replyB(night.w) ?? { type: "wait", days: 1 });
    night = await openScenes(page);
  }
  const card = page.locator(`[data-story-id="${hero}.night-2"]`);
  await expect(card).toBeVisible();
  const fold = card.locator("details.intimate-body-fold");
  await expect(fold).toHaveCount(1);
  await fold.locator("summary").click();
  await expect(card.locator(".intimate-body-fold p")).not.toBeEmpty();

  w = await commandB(page, night.w, { type: "setIntimacyDetail", detail: "tasteful" });
  await openScenes(page);
  await expect(
    page.locator(`[data-story-id="${hero}.night-2"] details.intimate-body-fold`),
  ).toHaveCount(0);
  expect(errors).toEqual([]);
});
