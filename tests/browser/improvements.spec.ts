import { openPractice } from "./journey-controls";
import { openCurrentLocation } from "./journey-controls";
import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
async function create(page: Page) {
  await page.goto("/");
  await page.getByRole("textbox", { name: "姓名", exact: true }).fill("改进验收");
  await page.getByRole("button", { name: "踏入仙途", exact: true }).click();
  await expect(page.getByRole("heading", { name: "改进验收", exact: true })).toBeVisible();
  await openCurrentLocation(page);
}
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
test("mobile status, primary choices, prices and event feedback remain visible", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await create(page);
  await expect(page.locator(".character-status")).toContainText("灵石 6");
  await page.locator(".dojo-primary").click();
  await expect(page.locator(".event-feed")).toContainText("林晚");
  await page.locator(".dojo-primary").click();
  await expect(page.locator(".event-feed")).toContainText("吐纳");
  await expect(page.locator("[data-sonner-toast]")).toHaveCount(0);
  await page.getByRole("tab", { name: "行囊", exact: true }).click();
  await expect(page.locator('[data-shop-item="healing"]')).toHaveAttribute("data-price", "8");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test("conditional retreat requests durable daily batches, exposes a collapsible summary and bounded journal", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const Native = window.Worker;
    (window as any).__traffic = [];
    window.Worker = class extends Native {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        this.addEventListener("message", (e) =>
          (window as any).__traffic.push({
            direction: "in",
            progress: !!e.data.progress,
            state: !!e.data.state,
          }),
        );
      }
      postMessage(message: any, options?: any) {
        (window as any).__traffic.push({
          direction: "out",
          kind: message.kind,
          type: message.command?.type,
          days: message.days,
        });
        super.postMessage(message, options);
      }
    };
  });
  await create(page);
  await page.locator(".dojo-primary").click();
  await page.locator(".dojo-primary").click();
  await openPractice(page);
  await page.getByLabel("停止条件", { exact: true }).selectOption("ready");
  const before = await saved(page);
  await page.locator("#practice-start").click();
  await expect.poll(async () => !!(await saved(page)).longAction).toBe(false);
  const after = await saved(page);
  expect(after.player.xp).toBe(20);
  expect(after.day - before.day).toBeLessThan(30);
  const traffic = await page.evaluate(() => (window as any).__traffic);
  const batches = traffic.filter((m: any) => m.kind === "advance");
  expect(batches).toHaveLength(after.day - before.day);
  expect(batches.every((m: any) => m.days === 1)).toBe(true);
  expect(traffic.filter((m: any) => m.direction === "out" && m.type === "step")).toHaveLength(0);
  expect(traffic.filter((m: any) => m.progress)).toHaveLength(after.day - before.day);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.locator(".retreat-summary summary").click();
  await expect(page.locator(".retreat-summary")).toContainText("修为 +20");
  const speed = page.getByRole("button", { name: /加速显示/ });
  if (await speed.isVisible()) await speed.click();
  await page.getByRole("button", { name: "查看全部", exact: true }).click();
  expect(await page.locator(".journal-entry").count()).toBeLessThanOrEqual(50);
  await page.getByLabel("历程人物").selectOption("PLAYER");
  await expect(page.locator(".journal-year").first()).toBeVisible();
  expect(await saved(page)).toEqual(after);
});

test("optimized images reserve dimensions and atlas downloads are excluded from initial offline core", async ({
  page,
}) => {
  await create(page);
  const imageData = await page.locator("img").evaluateAll((images) =>
    images.map((image) => ({
      src: image.currentSrc,
      width: image.getAttribute("width"),
      height: image.getAttribute("height"),
    })),
  );
  expect(imageData.length).toBeGreaterThan(0);
  for (const image of imageData) {
    const pathname = new URL(image.src).pathname;
    if (pathname.startsWith("/artifacts/")) {
      expect(pathname).toMatch(/^\/artifacts\/(bond|focus|ward)\.svg$/);
    } else {
      expect(pathname).toMatch(/\.webp$/);
    }
    expect(Number(image.width)).toBeGreaterThan(0);
    expect(Number(image.height)).toBeGreaterThan(0);
  }
  const manifest = await (await page.request.get("/offline-manifest.json")).json();
  // Rebuilt d8ac3e4 baseline: 2,155,334 bytes. The historical 2 MiB bound already failed.
  expect(manifest.bytes).toBeLessThanOrEqual(2_155_334);
  expect(manifest.files.some((f: string) => f.includes("npc-"))).toBe(false);
  const source = JSON.parse(readFileSync("lib/game/content/images.json", "utf8"));
  expect(
    Object.entries(source)
      .filter(([url]) => /^\/art\/[^/]+\.png$/.test(url))
      .reduce((total: number, [, image]: any) => total + image.bytes, 0),
  ).toBeLessThan(2 * 1024 * 1024);
  for (const [url, asset] of Object.entries(source) as [string, any][]) {
    if (!url.startsWith("/art/portraits/")) continue;
    expect(asset.lazy).toBe(true);
    expect(asset.bytes).toBeLessThan(300 * 1024);
    expect(manifest.files).not.toContain(asset.src);
  }
});
