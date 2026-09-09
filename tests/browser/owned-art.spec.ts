import { openCurrentLocation, travelTo } from "./journey-controls";
import { test, expect, type Page } from "@playwright/test";
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
const images = JSON.parse(
  readFileSync(new URL("../../lib/game/content/images.json", import.meta.url), "utf8"),
) as Record<string, { src: string; bytes: number }>;
const avatars = JSON.parse(
  readFileSync(new URL("../../lib/game/content/avatars.json", import.meta.url), "utf8"),
) as Record<string, string>;
const output = path.resolve("outputs");
mkdirSync(output, { recursive: true });
async function world(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("xiantu-author-preview");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise<any>((resolve, reject) => {
        const tx = db.transaction("saves");
        const request = tx.objectStore("saves").get("current");
        tx.oncomplete = () => resolve(request.result);
        tx.onabort = () => reject(tx.error);
      });
    } finally {
      db.close();
    }
  });
}
async function saved(page: Page) {
  await expect(page.getByText("本机已存", { exact: true })).toBeAttached();
}
async function create(page: Page, shichai: boolean) {
  await page.goto("/author");
  await expect(page.getByText(/作者预览 · 独立测试存档/)).toBeVisible();
  await page.getByRole("textbox", { name: "姓名", exact: true }).fill("图片验收");
  const boxes = page.getByRole("checkbox", { name: shichai ? /青石十钗/ : /周安的归途口信/ });
  expect(await boxes.count()).toBe(shichai ? 0 : 1);
  for (const box of await boxes.all()) await box.check();
  await page.getByRole("button", { name: "踏入仙途", exact: true }).click();
  await expect(page.getByRole("heading", { name: "图片验收", exact: true })).toBeVisible();
  await saved(page);
  await openCurrentLocation(page);
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(
    true,
  );
  expect((await world(page)).contentLocks).toHaveLength(shichai ? 4 : 5);
}

async function act(page: Page, button: import("@playwright/test").Locator) {
  const revision = (await world(page)).revision;
  await button.click();
  await expect.poll(async () => (await world(page)).revision).toBeGreaterThan(revision);
}
async function finishAction(page: Page) {
  await expect.poll(async () => !!(await world(page)).longAction, { timeout: 60000 }).toBe(false);
  const summary = page.getByRole("dialog", { name: "闭关期间", exact: true });
  if (await summary.count()) await page.keyboard.press("Escape");
}
async function practice(page: Page, days: number) {
  await page.getByRole("tab", { name: "修行", exact: true }).click();
  await page.getByRole("radio", { name: `${days} 日`, exact: true }).check();
  await act(page, page.getByRole("button", { name: days >= 7 ? /开始闭关/ : /开始修炼/ }));
  await finishAction(page);
}

function errors(page: Page) {
  const found: string[] = [];
  page.on("pageerror", (error) => found.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") found.push(message.text());
  });
  return found;
}
async function travel(page: Page, location: string) {
  await travelTo(page, location);
  await expect(page.getByRole("heading", { name: location, exact: true, level: 1 })).toBeVisible();
  await saved(page);
}

test("four-volume growth and main clues unlock local stories and real travel with persistent desktop/mobile art", async ({
  page,
}) => {
  const issues = errors(page);
  test.setTimeout(180000);
  await create(page, true);
  await expect(page.locator(".side-story")).toHaveCount(0);
  await page.screenshot({ path: path.join(output, "journey-new-game.png") });
  // The same assets are now reached through cultivation and the local introduction.
  for (let i = 0; i < 4; i++) await act(page, page.locator(".story-choices .story-choice").first());
  await practice(page, 7);
  for (let attempt = 0; attempt < 8 && (await world(page)).player.realm === 0; attempt++) {
    await page.getByRole("tab", { name: "修行", exact: true }).click();
    await act(page, page.getByRole("button", { name: /凝神，尝试突破/ }));
    await finishAction(page);
    if ((await world(page)).player.realm === 0) await practice(page, 1);
  }
  expect((await world(page)).player.realm).toBeGreaterThanOrEqual(1);
  await page.getByRole("tab", { name: "游历", exact: true }).click();
  await travel(page, "听雨客栈");
  await act(
    page,
    page.locator('[data-story-id="shichai.chunshui.intro"]').locator(".story-choice").first(),
  );
  await expect(page.locator(".side-story")).toHaveCount(0);
  await travel(page, "青石坊市");
  for (
    let day = 0;
    day < 35 && !(await page.locator('[data-story-id="shichai.chunshui.suqingyan.meet"]').count());
    day++
  ) {
    await page.waitForTimeout(450);
    await act(page, page.locator('[data-journey-action="rest"]'));
  }
  const card = page.locator('[data-story-id="shichai.chunshui.suqingyan.meet"]');
  await expect(card).toBeVisible();
  await card.scrollIntoViewIfNeeded();
  for (const image of await card.locator("img").all())
    await expect
      .poll(() => image.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0))
      .toBe(true);
  expect(await card.locator("img").count()).toBe(2);
  await expect(card).not.toContainText("{{");
  await expect(card.locator(".side-story-cg img")).toHaveAttribute(
    "src",
    /suqingyan-cg-meet-.+\.webp$/,
  );
  await expect(card.locator(".side-story-portrait img")).toHaveAttribute(
    "src",
    /suqingyan-portrait-.+\.webp$/,
  );
  const before = await world(page);
  await card.locator(".side-story-portrait button").click();
  await expect(page.locator('[data-character-id="shichai.chunshui.suqingyan"]')).toBeVisible();
  await expect(page.getByRole("dialog")).toContainText(
    before.npcs.find((a: any) => a.id === "shichai.chunshui.suqingyan").goal,
  );
  await page.keyboard.press("Escape");
  expect(await world(page)).toEqual(before);
  await page.screenshot({ path: path.join(output, "shichai-owned-desktop.png") });
  await card.screenshot({ path: path.join(output, "shichai-owned-card.png") });
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await card.scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(
      true,
    );
    const box = await card.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    await page.screenshot({ path: path.join(output, `shichai-owned-mobile-${width}.png`) });
  }
  await page.reload();
  await openCurrentLocation(page);
  await expect(card).toBeVisible();
  await saved(page);
  expect(await world(page)).toEqual(before);
  await card.locator(".story-choice").first().click();
  await expect.poll(async () => (await world(page)).revision).toBe(before.revision + 1);
  await saved(page);
  const after = await world(page);
  expect(after.contentState["shichai.chunshui.suqingyan.flag.met"]).toBe(true);
  expect(after.revision).toBe(before.revision + 1);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("tab", { name: /故人/ }).click();
  const row = page
    .locator(".person-row")
    .filter({ has: page.getByRole("heading", { name: /苏清晏/ }) });
  await expect(row.locator("img")).toHaveAttribute(
    "src",
    avatars["/art/shichai.chunshui/suqingyan-portrait.png"],
  );
  await row.click();
  const dialog = page.getByRole("dialog", { name: "苏清晏", exact: true });
  await dialog.getByRole("tab", { name: "立绘", exact: true }).click();
  const portrait = dialog.locator(".fullbody-frame img");
  await expect(portrait).toHaveAttribute("src", /suqingyan-portrait-.+\.webp$/);
  await expect
    .poll(() => portrait.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0))
    .toBe(true);
  await dialog.screenshot({ path: path.join(output, "shichai-owned-npc.png") });
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await expect
      .poll(() => dialog.evaluate((element) => element.scrollWidth <= element.clientWidth))
      .toBe(true);
    await expect
      .poll(() =>
        dialog.evaluate((element) => {
          const modal = element.getBoundingClientRect();
          const frame = element.querySelector(".fullbody-frame")!.getBoundingClientRect();
          return (
            modal.left >= 0 &&
            modal.right <= innerWidth &&
            frame.left >= 0 &&
            frame.right <= innerWidth
          );
        }),
      )
      .toBe(true);
    await dialog.screenshot({ path: path.join(output, `shichai-owned-npc-${width}.png`) });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  expect(await world(page)).toEqual(after);
  await page.keyboard.press("Escape");
  // All subsequent progression uses visible controls and the real Worker/IndexedDB save.
  for (let i = 0; i < 5 && (await world(page)).player.realm < 2; i++) await practice(page, 7);
  expect((await world(page)).player.realm).toBeGreaterThanOrEqual(2);
  await page.getByRole("tab", { name: "游历", exact: true }).click();
  for (let i = 0; i < 14 && !(await page.locator(".side-story").count()); i++) {
    await page.waitForTimeout(450);
    await act(page, page.locator('[data-journey-action="rest"]'));
  }
  await act(page, page.locator(".side-story").locator(".story-choice").first());
  for (let i = 0; i < 8 && (await world(page)).party.length === 1; i++) {
    await page.waitForTimeout(450);
    await act(
      page,
      page.getByRole("button", { name: /^(邀二人同行|约在此处会合 · 1 日|等候同伴 · 1 日)/ }),
    );
  }
  expect((await world(page)).party).toHaveLength(3);
  await travel(page, "山门古道");
  // Travel is now available from the on-demand atlas; story evidence gates scenes.
  const routePreview = await world(page);
  await page.getByRole("button", { name: "地图", exact: true }).click();
  const atlas = page.getByRole("dialog", { name: "云岚境大地图", exact: true });
  await atlas.locator('[data-atlas-place="xiaye"]').click();
  await expect(atlas.locator(".atlas-go")).toBeEnabled();
  await expect(atlas.locator(".atlas-go")).toHaveText("启程前往 · 3 日");
  await atlas.screenshot({ path: path.join(output, "journey-route-preview.png") });
  await atlas.getByRole("button", { name: "关闭地图", exact: true }).click();
  expect(await world(page)).toEqual(routePreview);
  for (
    let i = 0;
    i < 8 && (await page.getByRole("button", { name: /三人同行，进入残碑秘境/ }).isDisabled());
    i++
  ) {
    await act(page, page.getByRole("button", { name: /在古道等候一日/ }));
    await finishAction(page);
  }
  await act(page, page.getByRole("button", { name: /三人同行，进入残碑秘境/ }));
  await page.getByRole("switch", { name: "自动战斗", exact: true }).click();
  await expect.poll(async () => !!(await world(page)).battle, { timeout: 30000 }).toBe(false);
  expect((await world(page)).loot.grass).toBe(1);
  await act(page, page.getByRole("button", { name: /收好战利品，返回坊市/ }));
  await act(page, page.getByRole("button", { name: /按约将凝元草交给林晚/ }));
  for (
    let i = 0;
    i < 30 && !(await page.locator('[data-main-story-id="main.qingshi.rubbing"]').count());
    i++
  ) {
    await page.waitForTimeout(450);
    await act(page, page.locator('[data-journey-action="rest"]'));
  }
  await act(
    page,
    page.locator('[data-main-story-id="main.qingshi.rubbing"]').locator(".story-choice").first(),
  );
  await travel(page, "听雨客栈");
  for (let i = 0; i < 2; i++) {
    await page.waitForTimeout(450);
    await act(page, page.locator('[data-journey-action="rest"]'));
  }
  await act(
    page,
    page.locator('[data-main-story-id="main.qingshi.route"]').locator(".story-choice").first(),
  );
  await travel(page, "青石坊市");
  await travel(page, "山门古道");
  await page.getByRole("button", { name: "地图", exact: true }).click();
  await atlas.locator('[data-atlas-place="xiaye"]').click();
  await expect(atlas.locator(".atlas-go")).toBeEnabled();
  const departureDay = (await world(page)).day;
  await act(page, atlas.locator(".atlas-go"));
  await expect(atlas).not.toBeVisible();
  const arrived = await world(page);
  expect(arrived.day).toBe(departureDay + 3);
  expect(arrived.player.location).toBe("shichai.xiaye.gate");
  await travel(page, "临江听潮客栈");
  const summer = page.locator('[data-story-id="shichai.xiaye.intro"]');
  await expect(summer).toBeVisible();
  await expect(page.locator(".side-story")).toHaveCount(1);
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.locator("[data-sonner-toast]")).toHaveCount(0);
    await page.evaluate(() => window.scrollTo(0, 0));
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: path.join(output, `journey-linjiang-${width}.png`) });
  }
  const arrivalSave = await world(page);
  await page.reload();
  await openCurrentLocation(page);
  await expect(summer).toBeVisible();
  expect(await world(page)).toEqual(arrivalSave);
  expect(issues).toEqual([]);
  await expect(page.locator("vite-error-overlay")).toHaveCount(0);
});

test("roadside-only new game reaches its planned image and keeps original card layout", async ({
  page,
}) => {
  const issues = errors(page);
  await create(page, false);
  for (let i = 0; i < 4; i++) await act(page, page.locator(".story-choices .story-choice").first());
  await practice(page, 7);
  for (let i = 0; i < 8 && (await world(page)).player.realm === 0; i++) {
    await page.getByRole("tab", { name: "修行", exact: true }).click();
    await act(page, page.getByRole("button", { name: /凝神，尝试突破/ }));
    await finishAction(page);
    if ((await world(page)).player.realm === 0) await practice(page, 1);
  }
  await page.getByRole("tab", { name: "游历", exact: true }).click();
  await travel(page, "山门古道");
  if (!(await page.locator('[data-story-id="guest.roadside.introduction"]').count())) {
    await act(page, page.getByRole("button", { name: /^(约在此处会合 · 1 日|等候同伴 · 1 日)/ }));
  }
  const intro = page.locator('[data-story-id="guest.roadside.introduction"]');
  for (let day = 0; day < 30 && !(await intro.count()); day++) {
    // The client deliberately ignores identical clicks less than 400 ms apart.
    await page.waitForTimeout(450);
    const beforeDay = (await world(page)).day;
    await page.locator('[data-journey-action="rest"]').click();
    await expect.poll(async () => (await world(page)).day).toBeGreaterThan(beforeDay);
    await saved(page);
  }
  await expect(intro).toBeVisible();
  await intro.locator(".story-choice").first().click();
  await saved(page);
  await travel(page, "青石坊市");
  const market = page.locator('[data-story-id^="guest.roadside.market-"]');
  await expect(market).toBeVisible();
  await market.locator(".story-choice").first().click();
  await saved(page);
  await travel(page, "山门古道");
  const card = page.locator('[data-story-id^="guest.roadside.return-with-"]');
  for (let day = 0; day < 30 && !(await card.count()); day++) {
    // The client deliberately ignores identical clicks less than 400 ms apart.
    await page.waitForTimeout(450);
    const beforeDay = (await world(page)).day;
    await page.locator('[data-journey-action="rest"]').click();
    await expect.poll(async () => (await world(page)).day).toBeGreaterThan(beforeDay);
    await saved(page);
  }
  await expect(card).toBeVisible();
  await expect(card.locator(".image-fallback")).toContainText("待绘插图");
  await expect(card.locator(".side-story-portrait")).toHaveCount(0);
  expect(await card.locator("img").count()).toBe(0);
  const before = await world(page);
  await card.scrollIntoViewIfNeeded();
  await card.screenshot({ path: path.join(output, "roadside-planned-desktop.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  await card.scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: path.join(output, "roadside-planned-mobile.png") });
  expect(await world(page)).toEqual(before);
  await card.locator(".story-choice").first().click();
  await saved(page);
  expect((await world(page)).contentState["guest.roadside.closed"]).toBe(true);
  expect(issues).toEqual([]);
});

test("all 120 registered extension WebPs are served successfully", async ({ request }) => {
  const owned = Object.entries(images).filter(([url]) => url.startsWith("/art/shichai."));
  expect(owned).toHaveLength(120);
  for (const [, image] of owned) {
    const response = await request.get(image.src);
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("image/webp");
    expect((await response.body()).byteLength).toBe(image.bytes);
  }
});
