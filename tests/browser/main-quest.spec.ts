import { openCurrentLocation, selectLocations } from "./journey-controls";
import { test, expect, type Page, type Locator } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
const authored = JSON.parse(readFileSync("content-packs/main-quest/story.json", "utf8"));
const output = "/tmp/xiantu-main-quest";
mkdirSync(output, { recursive: true });
async function world(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const q = indexedDB.open("xiantu-qingshi");
      q.onsuccess = () => resolve(q.result);
      q.onerror = () => reject(q.error);
    });
    try {
      return await new Promise<any>((resolve, reject) => {
        const tx = db.transaction("saves");
        const q = tx.objectStore("saves").get("current");
        tx.oncomplete = () => resolve(q.result);
        tx.onabort = () => reject(tx.error);
      });
    } finally {
      db.close();
    }
  });
}
async function act(page: Page, button: Locator) {
  const revision = (await world(page)).revision;
  await page.waitForTimeout(450);
  await button.click();
  await expect.poll(async () => (await world(page)).revision).toBeGreaterThan(revision);
}
async function finish(page: Page) {
  await expect.poll(async () => !!(await world(page)).longAction, { timeout: 60000 }).toBe(false);
  await expect(page.getByText("本机已存", { exact: true })).toBeAttached();
  const summary = page.getByRole("dialog", { name: "闭关期间", exact: true });
  if (await summary.count()) await page.keyboard.press("Escape");
}
async function grow(page: Page, realm: number) {
  for (let i = 0; i < 12 && (await world(page)).player.realm < realm; i++) {
    const before = (await world(page)).player.realm;
    await page.getByRole("tab", { name: "修行", exact: true }).click();
    const days = before < 3 ? 7 : 30;
    await page.getByRole("radio", { name: `${days} 日`, exact: true }).check();
    await act(page, page.getByRole("button", { name: /开始闭关/ }));
    await finish(page);
    if ((await world(page)).player.realm === 0 || (await world(page)).player.realm === 3) {
      await page.getByRole("tab", { name: "修行", exact: true }).click();
      const attempt = page.getByRole("button", { name: /凝神，尝试突破/ });
      if ((await attempt.count()) && (await attempt.isEnabled())) {
        await act(page, attempt);
        await finish(page);
      }
    }
  }
  expect((await world(page)).player.realm).toBeGreaterThanOrEqual(realm);
  await page.getByRole("tab", { name: "游历", exact: true }).click();
}
async function localTravel(page: Page, to: string) {
  if ((await world(page)).player.location === to) {
    await openCurrentLocation(page);
    return;
  }
  await selectLocations(page);
  const button = page.locator(`[data-map-location="${to}"] .map-travel`);
  if (await button.isDisabled()) {
    const market = to.includes(".") ? to.replace(/\.[^.]+$/, ".market") : "market";
    await act(page, page.locator(`[data-map-location="${market}"] .map-travel`));
    await selectLocations(page);
  }
  await act(page, button);
  expect((await world(page)).player.location).toBe(to);
}
async function completeNode(page: Page, nodeId: string, location: string) {
  await localTravel(page, location);
  const scene = page.locator(`[data-main-story-id="${nodeId}"]`);
  for (let day = 0; day < 35 && !(await scene.count()); day++)
    await act(page, page.getByRole("button", { name: /歇息片刻/ }));
  await expect(scene).toBeVisible();
  await expect(scene).not.toContainText("{{");
  const state = await world(page);
  expect(state.events.some((e: any) => e.mainStory?.nodeId === nodeId)).toBe(false);
  if (await scene.locator(".main-story-speaker").count()) {
    await scene.locator(".main-story-speaker").click();
    await expect(
      page.getByRole("dialog").getByRole("tab", { name: "属性", exact: true }),
    ).toBeVisible();
    await expect(page.locator(".character-sheet")).toBeVisible();
    await page.keyboard.press("Escape");
    expect(await world(page)).toEqual(state);
  }
  const choice = nodeId.endsWith(".ending")
    ? scene.getByRole("button", { name: /公开拓本/ })
    : scene.locator(".story-choice").first();
  await act(page, choice);
  const after = await world(page);
  expect(after.day).toBe(state.day);
  expect(after.events.filter((e: any) => e.mainStory?.nodeId === nodeId)).toHaveLength(1);
}
async function openChapter(page: Page, chapter: (typeof authored.chapters)[number]) {
  await localTravel(page, chapter.sites.inn);
  const intro = page.locator(`[data-story-id="${chapter.volumePackId}.intro"]`);
  await expect(intro).toBeVisible();
  await expect(intro).toContainText(`主线 · 青石十钗 · ${chapter.volumeTitle}`);
  await expect(page.locator(".objective")).toContainText(chapter.volumeTitle);
  const before = await world(page);
  await act(page, intro.locator(".story-choice").first());
  const after = await world(page);
  expect(after.contentState[`${chapter.volumePackId}.intro`]).toBe(true);
  expect(after.day).toBe(before.day);
}
test("the default game integrates all four volumes into its main quest through local introductions, people, growth and travel", async ({
  page,
}) => {
  test.setTimeout(300000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.getByRole("textbox", { name: "姓名", exact: true }).fill("循图寻源");
  const packs = page.getByRole("checkbox", { name: /青石十钗/ });
  expect(await packs.count()).toBe(0);
  await expect(page.getByText("主线 · 青石十钗", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "踏入仙途", exact: true }).click();
  await expect(page.locator("#world-map")).toBeVisible();
  await expect(page.getByText("本机已存", { exact: true })).toBeAttached();
  await expect(page.locator(".side-story")).toHaveCount(0);
  await expect(page.locator(".local-map")).not.toContainText("裴姒");
  const initial = await world(page);
  expect(initial.contentLocks).toHaveLength(4);
  expect(initial.npcs).toHaveLength(123);
  await page.locator(".main-quest-log summary").click();
  await page.locator(".map-residents button").first().locator(":scope > span").last().click();
  await expect(page.getByRole("dialog")).toContainText("人物小传");
  await page.keyboard.press("Escape");
  expect(await world(page)).toEqual(initial);
  await page.screenshot({ path: `${output}/map-start-desktop.png`, fullPage: true });
  await openCurrentLocation(page);
  for (let i = 0; i < 4; i++) await act(page, page.locator(".story-choices .story-choice").first());
  await grow(page, 1);
  await openChapter(page, authored.chapters[0]);
  await localTravel(page, "gate");
  const beforeSurvey = await world(page);
  await act(page, page.locator("#main-survey"));
  const survey = await world(page);
  expect(survey.day).toBe(beforeSurvey.day + authored.surveyDays);
  expect(survey.player.stones).toBe(beforeSurvey.player.stones);
  expect(survey.loot).toBeNull();
  for (let i = 0; i < authored.chapters.length; i++) {
    const chapter = authored.chapters[i];
    if (i > 0) {
      await grow(page, chapter.minRealm);
      await localTravel(page, authored.chapters[i - 1].sites.gate);
      const start = await world(page);
      await page.getByRole("button", { name: "地图", exact: true }).click();
      await page.locator(`[data-atlas-place="${chapter.id}"]`).click();
      await act(page, page.locator(".atlas-go"));
      await expect(
        page.getByRole("dialog", { name: "云岚境大地图", exact: true }),
      ).not.toBeVisible();
      const arrived = await world(page);
      expect(arrived.player.location).toBe(chapter.sites.gate);
      expect(arrived.day).toBe(start.day + [0, 3, 4, 5][i]);
      await selectLocations(page);
      await expect(page.locator(".local-map")).toContainText(
        chapter.regionName === "青岚山城" ? "青岚" : chapter.regionName.slice(0, 2),
      );
      await openChapter(page, chapter);
    }
    await completeNode(page, chapter.dialogue.id, chapter.sites[chapter.guideSite]);
    const meeting = (await world(page)).events.find(
      (e: any) => e.mainStory?.nodeId === chapter.dialogue.id,
    );
    expect(meeting.actors).toEqual(["PLAYER", chapter.guide]);
    await completeNode(page, chapter.discovery.id, chapter.sites[chapter.discovery.site]);
    const finishState = await world(page);
    expect(
      finishState.events.find((e: any) => e.mainStory?.nodeId === chapter.discovery.id).day,
    ).toBeGreaterThanOrEqual(meeting.day + authored.intervalDays);
    await selectLocations(page);
    await page.locator("#world-map").scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${output}/chapter-${chapter.id}.png`, fullPage: true });
  }
  const final = await world(page);
  expect(final.events.filter((e: any) => e.mainStory)).toHaveLength(8);
  expect(
    final.events.find((e: any) => e.mainStory?.nodeId === "main.dongxue.ending").mainStory.choiceId,
  ).toBe("share");
  for (const chapter of authored.chapters)
    expect(final.contentState[`${chapter.volumePackId}.intro`]).toBe(true);
  await expect(page.locator(".objective")).toContainText("此行已了");
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await page.evaluate(() => scrollTo(0, 0));
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    for (const card of await page.locator(".map-place").all()) {
      const bounds = await card.boundingBox();
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
    }
    await page.screenshot({ path: `${output}/map-mobile-${width}.png`, fullPage: true });
  }
  await page.reload();
  await expect(page.locator(".objective")).toContainText("此行已了");
  expect(await world(page)).toEqual(final);
  await page.getByRole("tab", { name: "历程", exact: true }).click();
  await page.getByRole("combobox", { name: "历程类型" }).selectOption({ label: "主线线索" });
  await expect(page.locator(".journal-entry")).toHaveCount(8);
  expect(await world(page)).toEqual(final);
  writeFileSync(`${output}/complete-world.json`, JSON.stringify(final, null, 2));
  expect(errors).toEqual([]);
});
