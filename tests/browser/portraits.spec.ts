import { test, expect, type Page } from "@playwright/test";
import sharp from "sharp";
async function saved(page: Page, store = "saves", key = "current") {
  return page.evaluate(
    async ({ store, key }) => {
      const db = await new Promise<IDBDatabase>((resolve) => {
        const r = indexedDB.open("xiantu-qingshi");
        r.onsuccess = () => resolve(r.result);
      });
      try {
        return await new Promise<any>((resolve) => {
          const tx = db.transaction(store);
          const r = tx.objectStore(store).get(key);
          tx.oncomplete = () => resolve(r.result);
        });
      } finally {
        db.close();
      }
    },
    { store, key },
  );
}
async function fixture() {
  const png = await sharp({
    create: { width: 640, height: 960, channels: 4, background: "#819787" },
  })
    .png()
    .toBuffer();
  return `data:image/png;base64,${png.toString("base64")}`;
}
async function create(page: Page) {
  await page.getByRole("textbox", { name: "姓名", exact: true }).fill("立绘修士");
  await page.getByRole("button", { name: "踏入仙途", exact: true }).click();
  await expect(page.getByRole("heading", { name: "立绘修士", exact: true })).toBeVisible();
}
test("creation fits desktop and mobile viewports, with all panels accessible and footer on screen", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  for (const [width, height] of [
    [1440, 900],
    [1366, 768],
    [390, 844],
    [320, 720],
  ]) {
    await page.setViewportSize({ width, height });
    await page.goto("/");
    await expect(page).toHaveTitle(/仙途/);
    await expect(page.getByRole("textbox", { name: "姓名", exact: true })).toBeVisible();
    await expect(page.getByLabel("身高（cm）", { exact: true })).toBeVisible();
    const check = async () => {
      const box = (await page
        .getByRole("button", { name: "踏入仙途", exact: true })
        .boundingBox())!;
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.y + box.height).toBeLessThanOrEqual(height);
      const bounds = await page.evaluate(() => ({
        h: document.documentElement.scrollHeight,
        w: document.documentElement.scrollWidth,
      }));
      expect(bounds.h).toBeLessThanOrEqual(height);
      expect(bounds.w).toBeLessThanOrEqual(width);
    };
    await check();
    await page.screenshot({ path: `/tmp/xiantu-creation-${width}.png` });
    if (width < 1050) {
      await page.getByRole("button", { name: "全身立绘", exact: true }).click();
      await expect(page.getByRole("button", { name: "随机生成立绘", exact: true })).toBeVisible();
      await check();
      await page.getByRole("button", { name: "天资与机缘", exact: true }).click();
      await expect(page.getByRole("button", { name: "重掷", exact: true })).toBeVisible();
      await check();
    }
  }
  expect(errors).toEqual([]);
});
test("player body and generated asset persist; NPC adoption saves through Worker without progressing world", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const image = await fixture();
  // Only supplier image response is a fixture; cache, draft, Worker and durable save remain real.
  await page.route("**/api/portraits", (route) => route.fulfill({ json: { image } }));
  await page.goto("/");
  await page.getByLabel("身高（cm）", { exact: true }).fill("172");
  await page.getByLabel("胸围（cm）", { exact: true }).fill("96");
  await page.getByRole("button", { name: "随机生成立绘", exact: true }).click();
  await expect(page.locator(".fullbody-frame img")).toBeVisible();
  await create(page);
  const first = await saved(page);
  expect(first.profile.physique.heightCm).toBe(172);
  expect(first.profile.physique.bustCm).toBe(96);
  expect(first.player.portraitId).toMatch(/^[a-f0-9]{64}$/);
  expect(first.profile.portraitId).toBe(first.player.portraitId);
  await expect(page.locator(".player-seal img")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "立绘修士", exact: true })).toBeVisible();
  expect(await saved(page)).toEqual(first);
  await page.getByRole("tab", { name: "故人", exact: true }).click();
  await page.locator(".person-row").filter({ hasText: "林晚" }).click();
  const dialog = page.getByRole("dialog", { name: "林晚", exact: true });
  await expect(dialog.getByLabel("体貌资料")).toContainText("身高");
  await expect(dialog.getByLabel("体貌资料")).toContainText("胸 / 腰 / 臀");
  const before = await saved(page);
  await dialog.getByRole("button", { name: /随机.*立绘/ }).click();
  await expect.poll(async () => (await saved(page)).revision).toBe(before.revision + 1);
  await expect(dialog.locator(".fullbody-frame img")).toBeVisible();
  const after = await saved(page);
  expect(after.day).toBe(before.day);
  expect(after.rng).toEqual(before.rng);
  expect(after.events).toEqual(before.events);
  expect(after.player).toEqual(before.player);
  expect(after.revision).toBe(before.revision + 1);
  expect(after.npcs.find((a: any) => a.id === "NPC_LIN_WAN").portraitId).toMatch(/^[a-f0-9]{64}$/);
  expect(
    await dialog.locator(".fullbody-frame img").evaluate((el) => getComputedStyle(el).objectFit),
  ).toBe("contain");
  expect(errors).toEqual([]);
});
test("late or cancelled generation and failed image cache cannot adopt a portrait", async ({
  page,
}) => {
  const image = await fixture();
  let release!: () => void;
  let next = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/portraits", async (route) => {
    await next;
    await route.fulfill({ json: { image } }).catch(() => {});
  });
  await page.goto("/");
  await page.getByRole("button", { name: "随机生成立绘", exact: true }).click();
  await page.getByLabel("身高（cm）", { exact: true }).fill("174");
  release();
  await expect(page.getByRole("alert")).toContainText("形貌已经修改");
  await expect(page.locator(".fullbody-frame img")).toHaveCount(0);
  next = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.getByRole("button", { name: "随机生成立绘", exact: true }).click();
  await page.getByRole("button", { name: "取消生成", exact: true }).click();
  release();
  await expect(page.getByRole("alert")).toContainText("已取消");
  await expect(page.locator(".fullbody-frame img")).toHaveCount(0);
  // Fault injection is confined to the separate cosmetic database.
  await page.evaluate(() => {
    const open = indexedDB.open.bind(indexedDB);
    indexedDB.open = ((name: string, version?: number) => {
      if (name === "xiantu-portrait-assets")
        throw new DOMException("缓存空间不足", "QuotaExceededError");
      return open(name, version);
    }) as typeof indexedDB.open;
  });
  next = Promise.resolve();
  await page.getByRole("button", { name: "随机生成立绘", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("缓存空间不足");
  await create(page);
  expect((await saved(page)).player.portraitId).toBeUndefined();
  expect((await saved(page)).day).toBe(0);
});
test("unconfigured image service gives an actionable setup message without creating a world", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "随机生成立绘", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("生图模型");
  await expect(page.getByRole("button", { name: "踏入仙途", exact: true })).toBeVisible();
  expect(await saved(page)).toBeUndefined();
});

test("matching NPC full-body artwork loads without generation, remains offline, and never becomes player art", async ({
  page,
  context,
}) => {
  let calls = 0;
  await page.route("**/api/portraits", (route) => {
    calls++;
    return route.abort();
  });
  await page.goto("/");
  await expect(page.locator(".fullbody-frame img")).toHaveCount(0);
  await create(page);
  await expect(page.getByText("离线可用", { exact: true })).toBeVisible();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  const before = await saved(page);
  await page.getByRole("tab", { name: "故人", exact: true }).click();
  await page.locator(".person-row").filter({ hasText: "林晚" }).click();
  let dialog = page.getByRole("dialog", { name: "林晚", exact: true });
  const art = dialog.locator(".fullbody-frame img");
  await expect(art).toBeVisible();
  await expect(art).toHaveAttribute("src", /art\/optimized\/npc-lin-wan-.*\.webp$/);
  await expect
    .poll(() => art.evaluate((image: HTMLImageElement) => image.naturalWidth))
    .toBeGreaterThan(0);
  await dialog.evaluate((el) => {
    el.scrollTop = 0;
  });
  await page.screenshot({ animations: "disabled", path: "/tmp/xiantu-linwan-bundled-desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await dialog.evaluate((el) => {
    el.scrollTop = 0;
  });
  await page.screenshot({ animations: "disabled", path: "/tmp/xiantu-linwan-bundled-mobile.png" });
  expect(await saved(page)).toEqual(before);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole("heading", { name: "立绘修士", exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "故人", exact: true }).click();
  await page.locator(".person-row").filter({ hasText: "林晚" }).click();
  dialog = page.getByRole("dialog", { name: "林晚", exact: true });
  await expect
    .poll(() =>
      dialog
        .locator(".fullbody-frame img")
        .evaluate((image: HTMLImageElement) => image.naturalWidth),
    )
    .toBeGreaterThan(0);
  expect(await saved(page)).toEqual(before);
  expect(calls).toBe(0);
});
