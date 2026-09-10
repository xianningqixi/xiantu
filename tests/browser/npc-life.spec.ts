import { growTo, finish, answerDaily } from "./journey-controls";
import { openMore, selectLocations } from "./journey-controls";
import { openPractice } from "./journey-controls";
import { test, expect, type Page, type Locator } from "@playwright/test";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { openCurrentLocation } from "./journey-controls";
const sects = JSON.parse(readFileSync("content-packs/cultivation-sects/sects.json", "utf8")).sects;
const out = "/tmp/xiantu-npc-life-browser";
mkdirSync(out, { recursive: true });
async function saved(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const q = indexedDB.open("xiantu-qingshi");
      q.onsuccess = () => resolve(q.result);
      q.onerror = () => reject(q.error);
    });
    try {
      return await new Promise<any>((resolve, reject) => {
        const tx = db.transaction("saves"),
          q = tx.objectStore("saves").get("current");
        tx.oncomplete = () => resolve(q.result);
        tx.onabort = () => reject(tx.error);
      });
    } finally {
      db.close();
    }
  });
}
async function act(page: Page, button: Locator) {
  const before = await saved(page);
  await button.click();
  await expect.poll(async () => (await saved(page)).revision).toBeGreaterThan(before.revision);
}

test("elapsed time develops autonomous NPC friendships and sect lives, shown in summaries and durable profiles", async ({
  page,
}) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (e) => {
    if (e.type() === "error") errors.push(e.text());
  });
  await page.goto("/");
  await expect(page).toHaveTitle(/仙途/);
  await page.getByRole("textbox", { name: "姓名", exact: true }).fill("行路观世");
  await page.getByRole("button", { name: "踏入仙途", exact: true }).click();
  await openCurrentLocation(page);
  for (let i = 0; i < 4; i++) await act(page, page.locator(".dojo-primary"));
  await growTo(page, "QI_3");
  const before = await saved(page);
  await openMore(page);
  await page.locator("#wait-controls summary").click();
  await page.getByLabel("等候日数", { exact: true }).selectOption("30");
  await act(page, page.getByRole("button", { name: /^开始停留/ }));
  await finish(page);
  const summary = page.locator(".retreat-summary");
  await summary.locator("summary").click();
  await expect(summary).toContainText(/结识|结为朋友|拜入|访求师门/);
  const after = await saved(page);
  expect(after.day - before.day).toBe(30);
  // Daily sightings may award stones; waiting itself has no debit.
  expect(after.player.stones).toBeGreaterThanOrEqual(before.player.stones);
  expect(after.visitedSects).toBeUndefined();
  expect(after.npcs.map((a: any) => [a.id, a.name, a.appearanceSeed])).toEqual(
    before.npcs.map((a: any) => [a.id, a.name, a.appearanceSeed]),
  );
  for (const kind of ["npc-meet", "npc-friendship", "npc-depart", "npc-arrive", "sect-join"])
    expect(after.events.some((e: any) => e.kind === kind)).toBe(true);
  await summary.screenshot({ path: `${out}/retreat-desktop.png` });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await summary.evaluate((e) => e.scrollWidth <= e.clientWidth)).toBe(true);
  await summary.screenshot({ path: `${out}/retreat-mobile.png` });
  await page.keyboard.press("Escape");
  await page.reload();
  await expect(page.getByRole("tab", { name: "游历", exact: true })).toBeVisible();
  expect(await saved(page)).toEqual(after);

  const joined = after.npcs.find((a: any) => a.sectMembership);
  expect(joined).toBeTruthy();
  const sect = sects.find((s: any) => s.id === joined.sectMembership.id);
  await selectLocations(page);
  const atlas = page.locator("#atlas-page");
  await atlas.locator(`[data-atlas-place="${sect.home}"]`).click();
  await act(page, atlas.locator(".atlas-go"));
  await expect(atlas).not.toBeVisible();
  await openCurrentLocation(page);
  await page.getByRole("tab", { name: "人物", exact: true }).click();
  await page.getByRole("button", { name: "查看全部人物", exact: true }).click();
  await page.getByRole("searchbox", { name: "搜索姓名", exact: true }).fill(joined.name);
  await page
    .locator(".person-row")
    .filter({ has: page.getByRole("heading", { name: new RegExp(`^${joined.name}`) }) })
    .click();
  const dialog = page.getByRole("dialog", { name: joined.name, exact: true });
  await expect(dialog).toContainText(sect.name);
  const viewing = await saved(page);
  await dialog.getByRole("tab", { name: "经历", exact: true }).click();
  await expect(dialog).toContainText(`拜入${sect.name}`);
  for (const width of [390, 320, 1470]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await dialog.evaluate((e) => e.scrollWidth <= e.clientWidth)).toBe(true);
    await dialog.getByText(new RegExp(`${joined.name}经当地门人考察`)).scrollIntoViewIfNeeded();
    await expect(dialog.getByText(new RegExp(`${joined.name}经当地门人考察`))).toBeVisible();
    await dialog.screenshot({ path: `${out}/sect-history-${width}.png` });
  }
  expect(await saved(page)).toEqual(viewing);
  await page.keyboard.press("Escape");
  await openCurrentLocation(page);
  await page.getByRole("button", { name: "查看全部", exact: true }).click();
  await page.getByLabel("历程类型", { exact: true }).selectOption("npc-friendship");
  await expect(page.locator(".journal")).toContainText("结为朋友");
  expect(await saved(page)).toEqual(viewing);
  writeFileSync(
    `${out}/result.json`,
    JSON.stringify(
      {
        day: after.day,
        npcs: after.npcs.length,
        counts: Object.fromEntries(
          [
            "npc-meet",
            "npc-friendship",
            "npc-depart",
            "npc-arrive",
            "sect-join",
            "sect-task",
            "sect-art",
          ].map((kind) => [kind, after.events.filter((e: any) => e.kind === kind).length]),
        ),
        joined: after.npcs
          .filter((a: any) => a.sectMembership)
          .map((a: any) => ({ name: a.name, sect: a.sect, day: a.sectMembership.joinedDay })),
        errors,
      },
      null,
      2,
    ),
  );
  expect(errors).toEqual([]);
});
