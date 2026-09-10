import { expect, type Page, type Locator } from "@playwright/test";
export async function saved(page: Page, database = "xiantu-qingshi") {
  return page.evaluate(async (database) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const q = indexedDB.open(database);
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
  }, database);
}
export async function dismissPanels(page: Page) {
  for (let i = 0; i < 4; i++) {
    await expect(
      page.locator(
        '[role="dialog"][data-state="closed"], [role="alertdialog"][data-state="closed"]',
      ),
    ).toHaveCount(0);
    const dialogs = page.locator('[role="dialog"][data-state="open"]');
    const count = await dialogs.count();
    if (!count) break;
    await dialogs.last().getByRole("button", { name: "关闭", exact: true }).click();
    await expect(dialogs).toHaveCount(count - 1);
  }
}
export async function openCurrentLocation(page: Page) {
  await dismissPanels(page);
  await page.getByRole("tab", { name: "道场", exact: true }).click();
  await expect(page.locator(".dojo")).toBeVisible();
}
export async function selectLocations(page: Page) {
  await dismissPanels(page);
  await page.getByRole("tab", { name: "游历", exact: true }).click();
  await expect(page.locator("#atlas-page")).toBeVisible();
}
export async function travelTo(page: Page, name: string) {
  await selectLocations(page);
  await page
    .locator(".local-destinations")
    .getByRole("button", { name: new RegExp(`^前往${name}`) })
    .click();
  await expect(page.locator(".dojo-landscape figcaption")).toContainText(name);
}
export async function openMore(page: Page) {
  await expect(page.locator('[role="dialog"][data-state="closed"]')).toHaveCount(0);
  if (await page.getByRole("dialog", { name: "选择更多行动", exact: true }).isVisible()) return;
  await openCurrentLocation(page);
  await page.getByRole("button", { name: "更多", exact: true }).click();
}
export async function showLocalPeople(page: Page) {
  await openMore(page);
}
export async function openPractice(page: Page) {
  await openMore(page);
  await page
    .getByRole("dialog", { name: "选择更多行动", exact: true })
    .getByRole("button", { name: /^(设置修炼方式|准备突破)$/ })
    .first()
    .click();
}
export async function creationSettings(page: Page) {
  const details = page.locator(".creation-more");
  if ((await details.getAttribute("open")) === null) await details.locator("summary").click();
}
export async function act(page: Page, button: Locator) {
  const before = await saved(page);
  await button.click();
  await expect.poll(async () => (await saved(page)).revision).toBeGreaterThan(before.revision);
  await expect(page.getByLabel("本机已存", { exact: true })).toBeVisible();
  return saved(page);
}
export async function finish(page: Page) {
  await expect(page.getByRole("button", { name: "凝聚气机…", exact: true })).toHaveCount(0);
  await expect.poll(async () => !!(await saved(page)).longAction, { timeout: 30000 }).toBe(false);
  await expect(page.getByLabel("本机已存", { exact: true })).toBeVisible();
}
export async function train(page: Page, days: number) {
  await openPractice(page);
  await page.getByLabel("停止条件", { exact: true }).selectOption("days");
  await page.getByLabel("修炼日数", { exact: true }).selectOption(String(days));
  await act(page, page.locator("#practice-start"));
  await finish(page);
}
export async function viewJournal(page: Page) {
  await openCurrentLocation(page);
  const speed = page.getByRole("button", { name: /加速显示/ });
  if (await speed.isVisible()) await speed.click();
  await page.getByRole("button", { name: "查看全部", exact: true }).click();
}
export async function travelLocation(page: Page, to: string, database = "xiantu-qingshi") {
  const before = await saved(page, database);
  if (before.player.location === to) {
    await openCurrentLocation(page);
    return;
  }
  await selectLocations(page);
  const local = page.locator(`[data-travel-to="${to}"]`);
  if (!(await local.count())) {
    const atlasTo = to.startsWith("atlas.")
      ? to
      : to.startsWith("shichai.")
        ? to.split(".")[1]
        : "qingshi";
    await page.locator(`[data-atlas-place="${atlasTo}"]`).click();
    await page.locator(".atlas-go").click();
    await expect(page.locator(".dojo")).toBeVisible();
    if ((await saved(page, database)).player.location !== to) {
      await selectLocations(page);
      await page.locator(`[data-travel-to="${to}"]`).click();
    }
  } else await local.click();
  await expect(page.locator(".dojo")).toBeVisible();
  expect((await saved(page, database)).player.location).toBe(to);
}
