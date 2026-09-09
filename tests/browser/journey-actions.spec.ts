import { test, expect, type Page, type Locator } from "@playwright/test";
import { mkdirSync, readFileSync } from "node:fs";
import { openCurrentLocation } from "./journey-controls";
const B = JSON.parse(readFileSync("lib/game/content/balance.json", "utf8"));
const output = "/tmp/xiantu-journey-actions";
mkdirSync(output, { recursive: true });
async function saved(page: Page) {
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
  const before = await saved(page);
  await page.waitForTimeout(450);
  await button.click();
  await expect.poll(async () => (await saved(page)).revision).toBeGreaterThan(before.revision);
  await expect(page.getByText("本机已存", { exact: true })).toBeAttached();
  return saved(page);
}
async function forest(page: Page) {
  await page.getByRole("button", { name: "地图", exact: true }).click();
  const modal = page.getByRole("dialog", { name: "云岚境大地图", exact: true });
  await modal.locator('[data-atlas-place="atlas.cangzhu"]').click();
  await act(page, modal.locator(".atlas-go"));
  await expect(modal).not.toBeVisible();
  await openCurrentLocation(page);
}

test("location shortcuts learn at the inn, reflect growth and sect membership, and persist real costs", async ({
  page,
}) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.goto("/");
  await expect(page).toHaveTitle(/仙途/);
  await page.getByRole("textbox", { name: "姓名", exact: true }).fill("行路知微");
  await page.getByRole("button", { name: "踏入仙途", exact: true }).click();
  await openCurrentLocation(page);
  const bottom = page.getByRole("region", { name: "当前地点行动", exact: true });
  const action = (id: string) => bottom.locator(`[data-journey-action="${id}"]`);
  await expect(action("work")).toBeVisible();
  const poor = await saved(page);
  const paid = await act(page, action("work"));
  expect(paid.player.stones - poor.player.stones).toBe(B.actions.workSpiritStoneReward);
  expect(paid.day - poor.day).toBe(B.actions.workDays);
  await expect(action("shop").locator(".time-badge")).toHaveText("即刻");
  await action("shop").click();
  await expect(page.locator('[data-shop-item="healing"]')).toBeVisible();
  expect(await saved(page)).toEqual(paid);
  await page.getByRole("tab", { name: "游历", exact: true }).click();
  await openCurrentLocation(page);
  await forest(page);
  await expect(page.locator(".location-navigation .place-heading h1")).toHaveText("苍竹林");
  await expect(action("work")).toHaveCount(0);
  await expect(action("sect")).toContainText("拜访玉女宗");
  await bottom.screenshot({ path: `${output}/forest-desktop.png` });
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await bottom.screenshot({ path: `${output}/forest-${width}.png` });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  const forestState = await saved(page);
  const travelBadge = await action("practice").locator(".time-badge").innerText();
  const inn = await act(page, action("practice"));
  expect(inn.player.location).toBe("inn");
  expect(inn.day - forestState.day).toBe(Number(travelBadge.replace(" 日", "")));
  await expect(action("practice")).toContainText("学习《基础吐纳诀》");
  await expect(action("practice").locator(".time-badge")).toHaveText("即刻");
  await expect(action("work")).toHaveCount(0);
  await expect(action("sect")).toHaveCount(0);
  await bottom.screenshot({ path: `${output}/inn-desktop.png` });
  const learned = await act(page, action("practice"));
  expect(learned.player.manual).toBe(true);
  expect(learned.day).toBe(inn.day);
  expect(learned.player.stones).toBe(inn.player.stones);
  expect(learned.rng).toEqual(inn.rng);
  await expect(action("practice")).toContainText("静心修炼");
  await expect(action("practice").locator(".time-badge")).toHaveText("即刻");
  await action("practice").click();
  await expect(page.locator("#practice-start")).toBeVisible();
  expect(await saved(page)).toEqual(learned);
  await page.getByLabel("推进方式", { exact: true }).selectOption("ready");
  await page.locator("#practice-start").click();
  await expect(page.getByRole("dialog", { name: "闭关期间", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("tab", { name: "游历", exact: true }).click();
  await openCurrentLocation(page);
  await expect(action("practice")).toContainText("准备突破");
  await forest(page);
  await act(page, action("sect"));
  await expect(action("sect")).toContainText("了解玉女宗");
  const visited = await saved(page);
  await action("sect").click();
  await expect(page.locator("#sect-panel")).toBeFocused();
  expect(await saved(page)).toEqual(visited);
  const sect = page.getByRole("region", { name: "宗门修行", exact: true });
  await sect.getByRole("button", { name: "申请加入玉女宗", exact: true }).click();
  expect(await saved(page)).toEqual(visited);
  const joined = await act(page, sect.getByRole("button", { name: /确认自愿入门/ }));
  await expect(action("sect")).toHaveCount(0);
  await expect(action("sect-task")).toBeVisible();
  await expect(action("sect-art")).toHaveCount(0);
  for (let i = 0; i < B.sects.artContributionCost / B.sects.taskContribution; i++)
    await act(page, action("sect-task"));
  const earned = await saved(page);
  expect(earned.player.stones - joined.player.stones).toBe(3 * B.sects.taskStones);
  expect(earned.day - joined.day).toBe(3 * B.sects.taskDays);
  await expect(action("sect-art").locator(".time-badge")).toHaveText("即刻");
  await bottom.screenshot({ path: `${output}/sect-desktop.png` });
  const trained = await act(page, action("sect-art"));
  expect(trained.day).toBe(earned.day);
  expect(trained.player.sectMembership.contribution).toBe(
    earned.player.sectMembership.contribution - B.sects.artContributionCost,
  );
  await expect(action("sect-art")).toHaveCount(0);
  await page.reload();
  await openCurrentLocation(page);
  await expect(action("sect-task")).toBeVisible();
  await expect(action("sect-art")).toHaveCount(0);
  expect(await saved(page)).toEqual(trained);
  expect(await page.locator("vite-error-overlay").count()).toBe(0);
  expect(errors).toEqual([]);
});
