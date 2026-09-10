import { openMore, dismissPanels } from "./journey-controls";
import { test, expect, type Page } from "@playwright/test";
import { readFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { openCurrentLocation, selectLocations } from "./journey-controls";

const read = (file: string) => JSON.parse(readFileSync(file, "utf8"));
const catalog = read("content-packs/art-refresh-20260909/catalog.json");
const images = read("lib/game/content/images.json");
const avatars = read("lib/game/content/avatars.json");
const display = read("lib/game/content/cosmetic-display.json");
const sects = read("content-packs/cultivation-sects/sects.json").sects;
const output = "outputs/art-refresh-20260909";
mkdirSync(output, { recursive: true });

test("all refreshed full-size images and independent avatars are served with reviewed bytes", async ({
  request,
}) => {
  test.setTimeout(120000);
  expect(catalog.assets).toHaveLength(257);
  const portraitAssets = catalog.assets.filter((a: any) => a.kind === "portrait");
  expect(portraitAssets).toHaveLength(129);
  expect(Object.keys(display.locations)).toHaveLength(19);
  const faces = new Set<string>();
  for (const asset of catalog.assets) {
    const url = asset.sourceUrl ?? `/art/refresh-20260909/${asset.id}.webp`;
    const meta = images[url];
    const response = await request.get(meta.src);
    expect(response.status(), asset.id).toBe(200);
    expect(response.headers()["content-type"]).toContain("image/webp");
    const bytes = await response.body();
    expect(createHash("sha256").update(bytes).digest("hex"), asset.id).toBe(asset.sha256);
    const info = await sharp(bytes).metadata();
    expect([info.width, info.height], asset.id).toEqual([asset.width, asset.height]);
    expect(meta.lazy).toBe(true);
    if (asset.kind === "portrait") {
      const avatarUrl = avatars[url];
      expect(avatarUrl, asset.id).toBeTruthy();
      expect(faces.has(avatarUrl), asset.id).toBe(false);
      faces.add(avatarUrl);
      const face = await request.get(avatarUrl);
      expect(face.status()).toBe(200);
      const size = await sharp(await face.body()).metadata();
      expect([size.width, size.height]).toEqual([512, 512]);
    }
  }
});

async function saved(page: Page) {
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

test("three sect locations and six new portraits render through real travel without view-time save writes", async ({
  page,
}) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  let generations = 0;
  await page.route("**/api/portraits", (route) => {
    generations++;
    return route.abort();
  });
  await page.goto("/author");
  await page.getByRole("textbox", { name: "姓名", exact: true }).fill("新图验收");
  await page.getByRole("button", { name: "踏入仙途", exact: true }).click();
  await expect(page.locator(".dojo")).toBeVisible();
  for (const sect of sects) {
    await selectLocations(page);
    const map = page.locator("#atlas-page");
    await map.locator(`[data-atlas-place="${sect.home}"]`).click();
    await map.locator(".atlas-go").click();
    await expect(map).not.toBeVisible();
    await openCurrentLocation(page);
    const placeArt = images[display.locations[sect.home].url];
    const scene = page.locator(".dojo-landscape img");
    await expect(scene).toHaveAttribute("src", placeArt.src);
    await expect.poll(() => scene.evaluate((i: HTMLImageElement) => i.naturalWidth)).toBe(1672);
    await openMore(page);
    const panel = page.getByRole("region", { name: "宗门修行" });
    const beforeVisit = await saved(page);
    await panel.getByRole("button", { name: new RegExp(`拜访${sect.name}`) }).click();
    await expect
      .poll(async () => (await saved(page)).revision)
      .toBeGreaterThan(beforeVisit.revision);
    const beforeViewing = await saved(page);
    for (const resident of sect.residents) {
      await panel.getByRole("button", { name: new RegExp(`查看${resident.name}`) }).click();
      const sheet = page.locator(`[data-character-id="${resident.id}"]`);
      await sheet.getByRole("tab", { name: "立绘", exact: true }).click();
      const art = sheet.locator(".fullbody-frame img");
      await expect(art).toHaveAttribute("src", images[display.portraits[resident.id].url].src);
      await expect.poll(() => art.evaluate((i: HTMLImageElement) => i.naturalWidth)).toBe(1024);
      for (const width of [1440, 390]) {
        await page.setViewportSize({ width, height: 900 });
        expect(await sheet.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
        await sheet.screenshot({ path: `${output}/${resident.id}-${width}.png` });
      }
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.keyboard.press("Escape");
      await openMore(page);
      await expect(page.locator(".profile-modal")).toHaveCount(0);
      expect(await saved(page)).toEqual(beforeViewing);
    }
    await page.screenshot({ animations: "disabled", path: `${output}/${sect.id}-location.png` });
  }
  expect(generations).toBe(0);
  expect(errors).toEqual([]);
});
