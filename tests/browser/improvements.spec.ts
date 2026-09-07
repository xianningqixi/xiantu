import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
async function create(page: Page) {
  await page.goto("/");
  await page.getByRole("textbox", { name: "姓名", exact: true }).fill("改进验收");
  await page.getByRole("button", { name: "踏入仙途", exact: true }).click();
  await expect(page.getByRole("heading", { name: "改进验收", exact: true })).toBeVisible();
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
test("mobile status, guided controls, prices, time badges and immediate feedback remain visible", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await create(page);
  await expect(page.locator(".mobile-status summary")).toContainText("6 灵石");
  await page.locator(".mobile-status summary").click();
  await expect(page.locator(".mobile-status-body")).toContainText("眼下之事");
  await expect(page.locator(".mobile-status-body")).toContainText("伴生法宝");
  await expect(page.locator(".mobile-status-body")).toContainText("同行之人");
  await page.locator(".mobile-status-body").getByRole("button", { name: "去看看" }).click();
  await expect(page.locator("#story-choice-greet")).toBeFocused();
  await expect(page.locator("#story-choice-greet .time-badge")).toHaveText("即刻");
  await page.locator("#story-choice-greet").click();
  await expect(page.locator("#story-choice-learn")).toHaveClass(/guide-target/);
  await page.locator("#story-choice-learn").click();
  await expect(page.locator("[data-sonner-toast]")).toBeVisible();
  await page.getByRole("tab", { name: "修行", exact: true }).click();
  await expect(page.locator("#practice-start")).toBeVisible();
  await page.getByRole("tab", { name: "行囊", exact: true }).click();
  await expect(page.locator('[data-shop-item="healing"]')).toHaveAttribute("data-price", "8");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: "/tmp/xiantu-mobile-inventory.png", fullPage: true });
  expect(errors).toEqual([]);
});

test("conditional retreat sends one batch request, summarizes known events, and journal filters are bounded", async ({
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
            id: e.data.id,
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
        });
        super.postMessage(message, options);
      }
    };
  });
  await create(page);
  await page.locator("#story-choice-greet").click();
  await page.locator("#story-choice-learn").click();
  await page.getByRole("tab", { name: "修行", exact: true }).click();
  await page.getByLabel("推进方式", { exact: true }).selectOption("ready");
  const before = await saved(page);
  await page.locator("#practice-start").click();
  await expect(page.getByRole("dialog", { name: "闭关期间", exact: true })).toBeVisible();
  const after = await saved(page);
  expect(after.player.xp).toBe(20);
  expect(after.day - before.day).toBeLessThan(30);
  expect(after.longAction).toBeNull();
  const traffic = await page.evaluate(() => (window as any).__traffic);
  expect(traffic.filter((m: any) => m.kind === "advance")).toHaveLength(1);
  expect(traffic.filter((m: any) => m.direction === "out" && m.type === "step")).toHaveLength(0);
  expect(traffic.filter((m: any) => m.progress)).toHaveLength(after.day - before.day);
  await page.keyboard.press("Escape");
  await page.getByRole("tab", { name: "历程", exact: true }).click();
  await expect(page.getByText(/上次查看后新增/).first()).toBeVisible();
  expect(await page.locator(".journal-entry").count()).toBeLessThanOrEqual(50);
  await page.getByLabel("历程人物").selectOption("PLAYER");
  await expect(page.locator(".journal-year").first()).toBeVisible();
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
    expect(image.src).toMatch(/\.webp$/);
    expect(Number(image.width)).toBeGreaterThan(0);
    expect(Number(image.height)).toBeGreaterThan(0);
  }
  const manifest = await (await page.request.get("/offline-manifest.json")).json();
  expect(manifest.bytes).toBeLessThan(2 * 1024 * 1024);
  expect(manifest.files.some((f: string) => f.includes("npc-"))).toBe(false);
  const source = JSON.parse(readFileSync("lib/game/content/images.json", "utf8"));
  expect(
    Object.values(source).reduce((total: number, image: any) => total + image.bytes, 0),
  ).toBeLessThan(2 * 1024 * 1024);
});
