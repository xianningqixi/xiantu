import { test, expect, type Page } from "@playwright/test";
import { mkdirSync, readFileSync } from "node:fs";
const atlas = JSON.parse(readFileSync("content-packs/world-atlas/map.json", "utf8"));
const output = "/tmp/xiantu-open-atlas";
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
async function start(page: Page) {
  await page.goto("/");
  await expect(page).toHaveTitle(/仙途/);
  await page.getByRole("textbox", { name: "姓名", exact: true }).fill("山河过客");
  await page.getByRole("button", { name: "踏入仙途", exact: true }).click();
  await expect(page.locator("#world-map")).toBeVisible();
  await expect(page.locator("[data-atlas-place]")).toHaveCount(0);
  await openMap(page);
  await expect(page.getByText("本机已存", { exact: true })).toBeAttached();
}
async function openMap(page: Page) {
  const dialog = page.getByRole("dialog", { name: "云岚境大地图", exact: true });
  if (!(await dialog.isVisible()))
    await page.getByRole("button", { name: "地图", exact: true }).click();
  await expect(dialog).toBeVisible();
  await expect(dialog.locator("[data-atlas-place]")).toHaveCount(10);
  return dialog;
}
async function travel(page: Page, id: string) {
  const dialog = await openMap(page);
  await page.locator(`[data-atlas-place="${id}"]`).click();
  const before = await saved(page);
  const button = page.locator(".atlas-go");
  await expect(button).toBeEnabled();
  const days = Number((await button.textContent())!.match(/(\d+) 日/)![1]);
  await button.click();
  await expect.poll(async () => (await saved(page)).revision).toBeGreaterThan(before.revision);
  await expect(page.getByText("本机已存", { exact: true })).toBeAttached();
  const next = await saved(page);
  expect(next.player.location).toBe(atlas.places.find((p: any) => p.id === id).to);
  expect(next.day).toBe(before.day + days);
  expect(next.player.realm).toBe(0);
  expect(next.player.stones).toBe(before.player.stones);
  expect(next.contentState).toEqual(before.contentState);
  await expect(page.locator("[data-main-story-id], .side-story")).toHaveCount(0);
  await expect(dialog).not.toBeVisible();
  await openMap(page);
  await expect(page.locator(`[data-atlas-place="${id}"]`)).toHaveAttribute(
    "aria-current",
    "location",
  );
  await dialog.getByRole("button", { name: "关闭地图", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  return next;
}
test("a new mortal previews and visits all ten map places, with gated NPC stories and durable travel", async ({
  page,
}) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (e) => {
    if (e.type() === "error") errors.push(e.text());
  });
  await start(page);
  const before = await saved(page);
  for (const p of atlas.places) {
    await page.locator(`[data-atlas-place="${p.id}"]`).click();
    await expect(
      page.getByRole("dialog", { name: "云岚境大地图" }).locator(".atlas-destination h3"),
    ).toHaveText(p.name);
  }
  expect(await saved(page)).toEqual(before);
  await page.locator('[data-atlas-place="dongxue"]').click();
  await expect(page.locator(".atlas-destination")).toContainText("筑基初期");
  await expect(page.locator(".atlas-go")).toHaveText("启程前往 · 13 日");
  await page
    .getByRole("dialog", { name: "云岚境大地图" })
    .screenshot({ path: `${output}/desktop-map.png` });
  await travel(page, "dongxue");
  const market = page.locator('[data-map-location="shichai.dongxue.market"]');
  if (await market.locator(".map-residents button").count()) {
    const arrived = await saved(page);
    await market.locator(".map-residents button").first().click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    expect(await saved(page)).toEqual(arrived);
  }
  for (const p of atlas.places.filter((p: any) => p.id !== "dongxue")) await travel(page, p.id);
  const final = await saved(page);
  await page.reload();
  await expect(page.locator("#world-map")).toBeVisible();
  expect(await saved(page)).toEqual(final);
  expect(errors).toEqual([]);
});
for (const width of [390, 320])
  test(`the ${width}px map keeps every destination visible and tappable without horizontal overflow`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    await start(page);
    const before = await saved(page);
    for (const p of atlas.places) {
      const button = page.locator(`[data-atlas-place="${p.id}"]`);
      await button.scrollIntoViewIfNeeded();
      await button.click();
      await expect(button).toHaveAttribute("aria-pressed", "true");
      const box = (await button.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width);
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
    expect(await saved(page)).toEqual(before);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    const modal = page.getByRole("dialog", { name: "云岚境大地图", exact: true });
    expect(await modal.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    await expect(modal.getByRole("button", { name: "关闭地图", exact: true })).toBeInViewport();
    await page.locator(".atlas-section").screenshot({ path: `${output}/mobile-${width}.png` });
    await travel(page, "atlas.xuesong");
    await page.reload();
    await openMap(page);
    await expect(page.locator('[data-atlas-place="atlas.xuesong"]')).toHaveAttribute(
      "aria-current",
      "location",
    );
  });

test("the atlas opens on demand, closes without travel, and restores focus and the current destination", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (e) => {
    if (["error", "warning"].includes(e.type())) errors.push(e.text());
  });
  await start(page);
  const before = await saved(page);
  const dialog = page.getByRole("dialog", { name: "云岚境大地图", exact: true });
  await dialog.getByRole("button", { name: "关闭地图", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  const trigger = page.getByRole("button", { name: "地图", exact: true });
  await expect(trigger).toBeFocused();
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await trigger.scrollIntoViewIfNeeded();
    await expect(page.locator(".atlas-canvas")).toHaveCount(0);
    await page.screenshot({ path: `${output}/map-closed-${width}.png` });
    await expect(page.locator("#location-detail")).toHaveCount(0);
    const currentPlace = page.locator(".map-place.is-current");
    await currentPlace.getByRole("button", { name: "青石坊市", exact: true }).click();
    await expect(page.locator("#world-map")).toHaveCount(0);
    await expect(page.locator(".place-heading h1")).toHaveText("青石坊市");
    await expect(page.locator("#story-choice-greet")).toBeVisible();
    expect(await saved(page)).toEqual(before);
    await page.getByRole("button", { name: "返回地点选择", exact: true }).click();
    await expect(currentPlace.getByRole("button", { name: "青石坊市", exact: true })).toBeFocused();
    await expect(page.locator("#location-detail")).toHaveCount(0);
    expect(await saved(page)).toEqual(before);
    await trigger.click();
    await dialog.getByRole("button", { name: "查看霜河城", exact: true }).click();
    await expect(dialog.locator(".atlas-destination")).toContainText("霜河城");
    expect(await saved(page)).toEqual(before);
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
    await expect(trigger).toBeFocused();
    await trigger.press("Enter");
    await expect(dialog.locator('[data-atlas-place="qingshi"]')).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(dialog.getByRole("button", { name: "关闭地图", exact: true })).toBeInViewport();
    await dialog.screenshot({ path: `${output}/map-dialog-${width}.png` });
    await dialog.getByRole("button", { name: "关闭地图", exact: true }).click();
    expect(await saved(page)).toEqual(before);
  }
  await openMap(page);
  await page.mouse.click(2, 2);
  await expect(dialog).not.toBeVisible();
  expect(await saved(page)).toEqual(before);
  await page.reload();
  await expect(trigger).toBeVisible();
  await expect(dialog).not.toBeVisible();
  expect(await saved(page)).toEqual(before);
  expect(errors).toEqual([]);
});
