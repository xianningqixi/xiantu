import {
  openCurrentLocation,
  selectLocations,
  travelTo,
  showLocalPeople,
} from "./journey-controls";
import { installPauseControl, armPause } from "./pause-control";
import { test, expect, type Page, type Locator } from "@playwright/test";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
const atlas = JSON.parse(readFileSync("content-packs/world-atlas/map.json", "utf8"));
const qingshiLocations = new Set([
  "market",
  "inn",
  "gate",
  "ruins",
  ...atlas.places.filter((p: any) => p.region === "qingshi").map((p: any) => p.to),
]);
async function saved(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const q = indexedDB.open("xiantu-qingshi");
      q.onsuccess = () => resolve(q.result);
    });
    try {
      return await new Promise<any>((resolve) => {
        const tx = db.transaction("saves");
        const q = tx.objectStore("saves").get("current");
        tx.oncomplete = () => resolve(q.result);
      });
    } finally {
      db.close();
    }
  });
}
async function click(page: Page, button: Locator) {
  const revision = (await saved(page)).revision;
  await button.click();
  await expect.poll(async () => (await saved(page)).revision).toBeGreaterThan(revision);
}
async function finish(page: Page) {
  await expect.poll(async () => !!(await saved(page)).longAction, { timeout: 30000 }).toBe(false);
  await expect(page.getByText("本机已存", { exact: true })).toBeVisible();
  await expect(page.getByRole("dialog", { name: "闭关期间", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
}
async function train(page: Page, days: number) {
  await page.getByRole("tab", { name: "修行", exact: true }).click();
  await page.getByRole("radio", { name: `${days} 日`, exact: true }).check();
  await click(
    page,
    page.getByRole("button", { name: new RegExp(`^开始${days >= 7 ? "闭关" : "修炼"}`) }),
  );
  await finish(page);
}
async function breakthrough(page: Page) {
  await page.getByRole("tab", { name: "修行", exact: true }).click();
  await click(page, page.getByRole("button", { name: /凝神，尝试突破/ }));
  await finish(page);
}
for (const honor of [true, false])
  test(`normal UI story ${honor ? "honor" : "breach"} reaches reunion and foundation attempt, with reload and long-action pause`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(180000);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await installPauseControl(page);
    await page.goto("/");
    await page
      .getByRole("textbox", { name: "姓名", exact: true })
      .fill(honor ? "守诺修士" : "失约修士");
    await page.getByRole("button", { name: "踏入仙途", exact: true }).click();
    await expect(page.getByText("本机已存", { exact: true })).toBeVisible();
    await openCurrentLocation(page);
    for (let i = 0; i < 4; i++)
      await click(page, page.locator(".story-choices .story-choice").first());
    expect((await saved(page)).agreement.status).toBe("accepted");
    await train(page, 7);
    await breakthrough(page);
    for (let i = 0; i < 5 && (await saved(page)).player.realm === 0; i++) {
      await train(page, 1);
      await breakthrough(page);
    }
    expect((await saved(page)).player.realm).toBeGreaterThan(0);
    for (let i = 0; i < 5 && (await saved(page)).party.length === 1; i++)
      await click(
        page,
        page.getByRole("button", { name: /^(邀二人同行|约在此处会合 · 1 日|等候同伴 · 1 日)/ }),
      );
    expect((await saved(page)).party).toHaveLength(3);
    await travelTo(page, "山门古道");
    await click(page, page.getByRole("button", { name: /三人同行，进入残碑秘境/ }));
    await click(page, page.getByRole("button", { name: "普攻 1 回合", exact: true }));
    const battle = await saved(page);
    expect(battle.battle).toBeTruthy();
    for (const ally of battle.battle.allies) {
      await page
        .locator(".ally-row")
        .getByRole("button", { name: `查看${ally.name}的人物资料`, exact: true })
        .click();
      await expect(page.locator(`[data-character-id="${ally.id}"] [data-stat="hp"]`)).toContainText(
        `${ally.hp} / ${ally.maxHp}`,
      );
      await page.keyboard.press("Escape");
    }
    expect(await saved(page)).toEqual(battle);
    await page.reload();
    await expect(page.getByRole("heading", { name: "残碑守卫" })).toBeVisible();
    expect((await saved(page)).battle).toEqual(battle.battle);
    if (honor) {
      for (const action of ["青芒剑诀", "普攻", "防御", "普攻", "青芒剑诀"]) {
        if (!(await saved(page)).battle) break;
        await click(page, page.getByRole("button", { name: `${action} 1 回合`, exact: true }));
      }
    } else {
      await page.getByRole("switch", { name: "自动战斗", exact: true }).click();
      await expect.poll(async () => !!(await saved(page)).battle, { timeout: 20000 }).toBe(false);
    }
    expect((await saved(page)).battle).toBeNull();
    expect((await saved(page)).loot.grass).toBe(1);
    await openCurrentLocation(page);
    await click(page, page.getByRole("button", { name: /收好战利品，返回坊市/ }));
    if (honor) await click(page, page.getByRole("button", { name: /按约将凝元草交给林晚/ }));
    else {
      const before = await saved(page);
      await page.getByRole("button", { name: /把凝元草也收入自己囊中/ }).click();
      expect(await saved(page)).toEqual(before);
      await click(page, page.getByRole("button", { name: "确认独占，承担后果", exact: true }));
    }
    const settled = await saved(page);
    expect(settled.story.outcome).toBe(honor ? "fulfilled" : "breached");
    expect(settled.loot).toBeNull();
    expect(
      settled.events.some((e: any) => e.kind === (honor ? "promiseFulfilled" : "promiseBreached")),
    ).toBe(true);
    await expect(page.getByRole("heading", { name: "同行之前，先立一诺" })).toHaveCount(0);
    await showLocalPeople(page);
    await page.getByRole("button", { name: "再次邀约林晚同行", exact: true }).click();
    const renewal = page.getByRole("dialog", { name: "再次相约探秘境", exact: true });
    await expect(renewal.getByRole("region", { name: "再次同行条款" })).toContainText(
      "现在确认不扣款",
    );
    if (honor) await expect(renewal.getByRole("button", { name: /确认再次同行/ })).toBeEnabled();
    else await expect(renewal.getByRole("button", { name: /确认再次同行/ })).toBeDisabled();
    expect(await saved(page)).toEqual(settled);
    await page.keyboard.press("Escape");
    await selectLocations(page);
    await openCurrentLocation(page);
    await page.reload();
    await openCurrentLocation(page);
    expect(await saved(page)).toEqual(settled);
    await expect(page.getByRole("heading", { name: "同行之前，先立一诺" })).toHaveCount(0);
    await page.getByRole("tab", { name: "修行", exact: true }).click();
    await page.getByRole("radio", { name: "30 日", exact: true }).check();
    await armPause(page);
    await click(page, page.getByRole("button", { name: /开始闭关/ }));
    await expect
      .poll(async () => (await saved(page)).longAction?.checkpoint ?? 30)
      .toBeGreaterThanOrEqual(3);
    await expect(page.getByText("计算已暂停，已完成的日数和进度均已保存。")).toBeVisible();
    const paused = await saved(page);
    await page.getByRole("tab", { name: "故人", exact: true }).click();
    await page.getByRole("button", { name: /^打听本地人物/ }).click();
    // Local people include the region's outskirts; acquaintances remain listed after moving away.
    const expectedPeople = paused.npcs.filter(
      (npc: any) =>
        qingshiLocations.has(npc.location) ||
        paused.relations.some((r: any) => r.from === "PLAYER" && r.to === npc.id && r.known),
    );
    const count = expectedPeople.length;
    await expect(page.locator(".person-row")).toHaveCount(count);
    const headings = await page.locator(".person-row h3").allTextContents();
    for (const npc of expectedPeople)
      expect(headings.filter((heading) => heading.startsWith(npc.name))).toHaveLength(1);
    for (let i = 0; i < count; i++) {
      const row = page.locator(".person-row").nth(i);
      await row.click();
      const detail = page.getByRole("dialog");
      await expect(detail).toContainText("人物小传");
      await detail.getByRole("button", { name: "Close", exact: true }).click();
    }
    expect(await saved(page)).toEqual(paused);
    await page.reload();
    await expect(page.getByText("计算已暂停，已完成的日数和进度均已保存。")).toBeVisible();
    expect(await saved(page)).toEqual(paused);
    await page.getByRole("button", { name: "继续", exact: true }).click();
    await finish(page);
    await page.getByRole("tab", { name: "游历", exact: true }).click();
    await openCurrentLocation(page);
    for (let i = 0; i < 8 && !(await saved(page)).npcs[0].alive; i++)
      throw new Error("Required NPC unexpectedly died");
    for (let i = 0; i < 8 && !(await saved(page)).story.flags.reunion; i++) {
      if (await page.locator("#main-story-scene").count()) {
        await click(page, page.locator("#main-story-scene .story-choice").first());
        continue;
      }
      const story = page.locator(".story-copy h2");
      if ((await story.count()) && /她还记得|话里多了|旧诺|旧日|草/.test(await story.innerText())) {
        await click(page, page.locator(".story-choices .story-choice").first());
      } else {
        const sceneButtons = page.locator(".story-choices .story-choice");
        const currentText = await page.locator(".story-copy").innerText();
        if (/重逢|失约|约定/.test(currentText) && (await sceneButtons.count()))
          await click(page, sceneButtons.first());
        else {
          await click(page, page.getByRole("button", { name: /在此等候/ }));
          await finish(page);
        }
      }
    }
    expect((await saved(page)).story.flags.reunion).toBe(true);
    await expect(page.getByRole("heading", { name: "同行之前，先立一诺" })).toHaveCount(0);
    if (!honor) {
      const before = await saved(page);
      if (before.npcs[0].location === "market")
        await click(page, page.getByRole("button", { name: /交付药草，赔礼/ }));
      expect((await saved(page)).events.some((e: any) => e.kind === "promiseBreached")).toBe(true);
    }
    await breakthrough(page);
    let final = await saved(page);
    expect(final.events.some((e: any) => e.kind === "attempt" && e.text.includes("突破"))).toBe(
      true,
    );
    expect(final.player.alive).toBe(true);
    for (let retry = 0; retry < 5 && final.player.realm < 4; retry++) {
      await train(page, 30);
      await breakthrough(page);
      final = await saved(page);
    }
    expect(final.player.realm).toBe(4);
    await page.getByRole("tab", { name: "游历", exact: true }).click();
    await travelTo(page, "听雨客栈");
    await travelTo(page, "青石坊市");
    await expect(page.getByRole("heading", { name: "同行之前，先立一诺" })).toHaveCount(0);
    final = await saved(page);
    await page.reload();
    await openCurrentLocation(page);
    expect(await saved(page)).toEqual(final);
    await expect(page.getByRole("heading", { name: "同行之前，先立一诺" })).toHaveCount(0);
    // Failure outcomes are verified by controlled rule fixtures; this real world may succeed on its first attempt.
    // Actual browser exports are retained as local handoff fixtures, never committed as user data.
    const output = `/tmp/xiantu-story-${testInfo.project.name || process.env.PLAYWRIGHT_BROWSER || "chromium"}`;
    mkdirSync(output, { recursive: true });
    writeFileSync(`${output}/${honor ? "honor" : "breach"}.json`, JSON.stringify(final, null, 2));
    await page.screenshot({
      path: `${output}/${honor ? "honor" : "breach"}.png`,
      fullPage: true,
      animations: "disabled",
    });
    expect(errors).toEqual([]);
  });

test("completed invitations stay closed on desktop and mobile; explicit renewal saves without charging", async ({
  page,
}) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") errors.push(message.text());
  });
  await page.goto("/");
  await expect(page).toHaveTitle(/仙途/);
  await page.getByRole("textbox", { name: "姓名", exact: true }).fill("再访修士");
  await page.getByRole("button", { name: "踏入仙途", exact: true }).click();
  await openCurrentLocation(page);
  for (let i = 0; i < 4; i++)
    await click(page, page.locator(".story-choices .story-choice").first());
  await train(page, 7);
  await breakthrough(page);
  for (let i = 0; i < 5 && (await saved(page)).player.realm === 0; i++) {
    await train(page, 1);
    await breakthrough(page);
  }
  for (let i = 0; i < 5 && (await saved(page)).party.length === 1; i++)
    await click(
      page,
      page.getByRole("button", { name: /^(邀二人同行|约在此处会合 · 1 日|等候同伴 · 1 日)/ }),
    );
  await click(page, page.getByRole("button", { name: /暂别同伴/ }));
  const before = await saved(page);
  expect(before.agreement.status).toBe("cancelled");
  const output = "/tmp/xiantu-story-repeat-qa";
  mkdirSync(output, { recursive: true });
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: width === 1440 ? 1000 : 844 });
    await expect(page.getByRole("heading", { name: "一盏灯下的故人" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "同行之前，先立一诺" })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.locator(".story-copy").scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${output}/returned-${width}.png`, animations: "disabled" });
    await showLocalPeople(page);
    await page.getByRole("button", { name: "再次邀约林晚同行", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "再次相约探秘境", exact: true });
    await expect(dialog.getByRole("button", { name: /确认再次同行/ })).toBeEnabled();
    await expect(dialog).toContainText("现在确认不扣款");
    await page.screenshot({ path: `${output}/renewal-${width}.png`, animations: "disabled" });
    expect(await saved(page)).toEqual(before);
    await page.keyboard.press("Escape");
    await selectLocations(page);
    await openCurrentLocation(page);
    expect(await saved(page)).toEqual(before);
  }
  await showLocalPeople(page);
  await page.getByRole("button", { name: "再次邀约林晚同行", exact: true }).click();
  await click(page, page.getByRole("button", { name: /确认再次同行/ }));
  await expect(page.getByRole("dialog", { name: "再次相约探秘境", exact: true })).toHaveCount(0);
  const renewed = await saved(page);
  expect(renewed.agreement.status).toBe("accepted");
  expect(renewed.agreement.id).not.toBe(before.agreement.id);
  for (const key of ["day", "rng", "player", "npcs", "relations", "story"])
    expect(renewed[key]).toEqual(before[key]);
  expect(renewed.events.slice(0, before.events.length)).toEqual(before.events);
  await page.reload();
  await openCurrentLocation(page);
  expect(await saved(page)).toEqual(renewed);
  await expect(page.getByRole("heading", { name: "山路不远，来日可期" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "同行之前，先立一诺" })).toHaveCount(0);
  expect(errors).toEqual([]);
});
