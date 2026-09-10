import { growTo, finish as finishCurrent, answerDaily } from "./journey-controls";
import { openMore, creationSettings, viewJournal } from "./journey-controls";
import { openPractice } from "./journey-controls";
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
  await finishCurrent(page);
}
async function grow(page: Page, realm: number) {
  const B = JSON.parse(readFileSync("lib/game/content/balance.json", "utf8"));
  await growTo(
    page,
    B.cultivation.realmOrder[Math.max(realm, B.cultivation.realmOrder.indexOf("QI_3"))],
  );
  await selectLocations(page);
}
async function localTravel(page: Page, to: string) {
  await answerDaily(page);
  if ((await world(page)).player.location === to) {
    await openCurrentLocation(page);
    return;
  }
  await selectLocations(page);
  await act(page, page.locator(`[data-travel-to="${to}"]`));
  await answerDaily(page);
  expect((await world(page)).player.location).toBe(to);
}
async function completeNode(page: Page, nodeId: string, location: string) {
  await localTravel(page, location);
  const scene = page.locator(`[data-main-story-id="${nodeId}"]`);
  for (let day = 0; day < 35 && !(await scene.count()); day++) {
    await openMore(page);
    await act(
      page,
      page.getByRole("dialog", { name: "选择更多行动" }).locator('[data-journey-action="rest"]'),
    );
  }
  await expect(scene).toBeVisible();
  await expect(scene).not.toContainText("{{");
  const state = await world(page);
  expect(state.events.some((e: any) => e.mainStory?.nodeId === nodeId)).toBe(false);
  if (await scene.locator(".dojo-speaker").count()) {
    await scene.locator(".dojo-speaker").click();
    await expect(
      page.getByRole("dialog").getByRole("tab", { name: "属性", exact: true }),
    ).toBeVisible();
    await expect(page.locator(".character-sheet")).toBeVisible();
    await page.keyboard.press("Escape");
    expect(await world(page)).toEqual(state);
  }
  const choice = nodeId.endsWith(".ending")
    ? page.getByRole("button", { name: /公开拓本/ })
    : page.locator(".dojo-primary");
  await act(page, choice);
  const after = await world(page);
  expect(after.day).toBe(state.day);
  expect(after.events.filter((e: any) => e.mainStory?.nodeId === nodeId)).toHaveLength(1);
}
async function openChapter(page: Page, chapter: (typeof authored.chapters)[number]) {
  await localTravel(page, chapter.sites.inn);
  const intro = page.locator(`[data-story-id="${chapter.volumePackId}.intro"]`);
  await expect(intro).toBeVisible();
  await expect(intro).toContainText(chapter.volumeTitle);
  await expect(page.locator(".dojo-primary")).toBeEnabled();
  const before = await world(page);
  await act(page, page.locator(".dojo-primary"));
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
  await creationSettings(page);
  await expect(page.getByText("主线 · 青石十钗", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "踏入仙途", exact: true }).click();
  await expect(page.locator(".dojo")).toBeVisible();
  await expect(page.getByLabel("本机已存", { exact: true })).toBeAttached();
  await expect(page.locator(".side-story")).toHaveCount(0);
  await expect(page.locator(".dojo-scene")).not.toContainText("裴姒");
  const initial = await world(page);
  expect(initial.contentLocks).toHaveLength(4);
  expect(initial.npcs).toHaveLength(123);
  await page.locator(".dojo-speaker").click();
  await expect(page.getByRole("dialog")).toContainText("身份与心愿");
  await page.keyboard.press("Escape");
  expect(await world(page)).toEqual(initial);
  await page.screenshot({ path: `${output}/map-start-desktop.png`, fullPage: true });
  await openCurrentLocation(page);
  for (let i = 0; i < 4; i++) await act(page, page.locator(".dojo-primary"));
  await grow(page, 1);
  await openChapter(page, authored.chapters[0]);
  await localTravel(page, "gate");
  const beforeSurvey = await world(page);
  await openMore(page);
  await act(
    page,
    page
      .getByRole("dialog", { name: "选择更多行动" })
      .getByRole("button", { name: "勘察古道残碑", exact: true }),
  );
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
      await selectLocations(page);
      await page.locator(`[data-atlas-place="${chapter.id}"]`).click();
      await act(page, page.locator(".atlas-go"));
      await expect(page.locator("#atlas-page")).not.toBeVisible();
      const arrived = await world(page);
      expect(arrived.player.location).toBe(chapter.sites.gate);
      expect(arrived.day).toBe(start.day + [0, 3, 4, 5][i]);
      await selectLocations(page);
      await expect(page.locator(".local-destinations")).toContainText(
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
    await page.locator("#atlas-page").scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${output}/chapter-${chapter.id}.png`, fullPage: true });
  }
  const final = await world(page);
  expect(final.events.filter((e: any) => e.mainStory)).toHaveLength(8);
  expect(
    final.events.find((e: any) => e.mainStory?.nodeId === "main.dongxue.ending").mainStory.choiceId,
  ).toBe("share");
  for (const chapter of authored.chapters)
    expect(final.contentState[`${chapter.volumePackId}.intro`]).toBe(true);
  await expect(page.locator(".game-shell")).toBeVisible();
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await page.evaluate(() => scrollTo(0, 0));
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    for (const card of await page.locator(".local-destinations>div").all()) {
      const bounds = await card.boundingBox();
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
    }
    await page.screenshot({ path: `${output}/map-mobile-${width}.png`, fullPage: true });
  }
  await page.reload();
  await expect(page.locator(".game-shell")).toBeVisible();
  expect(await world(page)).toEqual(final);
  await viewJournal(page);
  await page.getByRole("combobox", { name: "历程类型" }).selectOption({ label: "主线线索" });
  await expect(page.locator(".journal-entry")).toHaveCount(8);
  expect(await world(page)).toEqual(final);
  writeFileSync(`${output}/complete-world.json`, JSON.stringify(final, null, 2));
  expect(errors).toEqual([]);
});
