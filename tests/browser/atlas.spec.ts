import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { saved, selectLocations, openCurrentLocation, act } from "./journey-controls";
const atlas = JSON.parse(readFileSync("content-packs/world-atlas/map.json", "utf8"));
async function start(page: Page) {
  await page.goto("/");
  await page.getByRole("textbox", { name: "姓名", exact: true }).fill("山河过客");
  await page.getByRole("button", { name: "踏入仙途", exact: true }).click();
  await expect(page.locator(".dojo-primary")).toBeVisible();
}
test("a mortal previews and visits all ten destinations with durable route days, without consuming time on preview", async ({
  page,
}) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await start(page);
  await selectLocations(page);
  const before = await saved(page);
  for (const place of atlas.places) {
    await page.locator(`[data-atlas-place="${place.id}"]`).click();
    await expect(page.locator(".atlas-destination h3")).toHaveText(place.name);
  }
  expect(await saved(page)).toEqual(before);
  for (const place of atlas.places.filter((p: any) => p.id !== "qingshi")) {
    await selectLocations(page);
    await page.locator(`[data-atlas-place="${place.id}"]`).click();
    const prior = await saved(page);
    const button = page.locator(".atlas-go"),
      days = Number((await button.innerText()).match(/(\d+) 日/)![1]);
    const next = await act(page, button);
    expect(next.player.location).toBe(place.to);
    expect(next.day - prior.day).toBe(days);
    expect(next.player.stones).toBe(prior.player.stones);
    expect(next.contentState).toEqual(prior.contentState);
    await expect(page.locator(".dojo")).toBeVisible();
  }
  const final = await saved(page);
  await page.reload();
  await expect(page.locator(".dojo-primary")).toBeVisible();
  expect(await saved(page)).toEqual(final);
  expect(errors).toEqual([]);
});
for (const width of [390, 320])
  test(`${width}px atlas keeps all destinations tappable without horizontal overflow`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    await start(page);
    await selectLocations(page);
    const before = await saved(page);
    for (const p of atlas.places) {
      const button = page.locator(`[data-atlas-place="${p.id}"]`);
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
    await openCurrentLocation(page);
    expect(await saved(page)).toEqual(before);
  });
test("travel navigation and selected previews remain read-only across all viewport sizes", async ({
  page,
}) => {
  await start(page);
  const before = await saved(page);
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await selectLocations(page);
    await page.locator('[data-atlas-place="dongxue"]').click();
    await expect(page.locator(".atlas-destination")).toContainText("霜河城");
    await openCurrentLocation(page);
    expect(await saved(page)).toEqual(before);
    await selectLocations(page);
    await expect(page.locator('[data-atlas-place="qingshi"]')).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  }
  await page.reload();
  await expect(page.locator(".dojo-primary")).toBeVisible();
  expect(await saved(page)).toEqual(before);
});
