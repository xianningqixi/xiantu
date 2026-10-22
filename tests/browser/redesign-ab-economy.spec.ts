import { test, expect } from "@playwright/test";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { saved, act, openPractice, openCurrentLocation } from "./journey-controls";
import { installPauseControl, armPause } from "./pause-control";
const B = JSON.parse(readFileSync("lib/game/content/balance.json", "utf8"));

/** Pagination may move an inventory control to a later page after each transaction. */
async function turnTo(control: import("@playwright/test").Locator) {
  const host = control.locator(
    'xpath=ancestor::*[contains(concat(" ", normalize-space(@class), " "), " paged-content ")][1]',
  );
  if (!(await host.count())) return;
  await expect(host).toHaveAttribute("data-ready", "true");
  const previous = host
    .locator(":scope > .page-navigation")
    .getByRole("button", { name: /^上一页/ });
  const next = host.locator(":scope > .page-navigation").getByRole("button", { name: /^下一页/ });
  while ((await previous.count()) && (await previous.isEnabled())) await previous.click();
  for (let i = 0; i < 60; i++) {
    const inside = await control.evaluate((el) => {
      if (!el.checkVisibility()) return false;
      const r = el.getBoundingClientRect(),
        c = el.closest(".page-crop")!.getBoundingClientRect();
      return r.top >= c.top - 1 && r.bottom <= c.bottom + 1;
    });
    if (inside) return;
    if (!(await next.count()) || !(await next.isEnabled())) break;
    await next.click();
  }
}

const output = "docs/reports/screenshots/redesign-ab/economy";
for (const width of [1440, 390])
  test(`AB ${width}: all inventory prices, qi use and visible daily evidence match durable Worker results`, async ({
    page,
  }) => {
    test.setTimeout(90000);
    mkdirSync(output, { recursive: true });
    await installPauseControl(page);
    await page.addInitScript(() => {
      const Native = window.Worker;
      (window as any).__actualProgress = [];
      window.Worker = class extends Native {
        constructor(url: string | URL, options?: WorkerOptions) {
          super(url, options);
          this.addEventListener("message", ({ data }) => {
            if (data.progress) (window as any).__actualProgress.push(data.progress);
          });
        }
      };
    });
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    // Controlled valid scenario; every subsequent transaction goes through visible UI and Worker.
    const source = JSON.parse(readFileSync("/tmp/xiantu-ab-fixtures/economy.json", "utf8"));
    await page.goto("/");
    await page.getByLabel("选择存档文件").setInputFiles({
      name: "inventory-scenario.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(source)),
    });
    await page.getByRole("button", { name: "确认继续", exact: true }).click();
    await expect(page.locator(".dojo-primary")).toBeVisible();
    await page.getByRole("tab", { name: "行囊", exact: true }).click();
    // The paginated inventory opens on 随身物品; trading lives in its own category.
    await page.getByRole("button", { name: "坊市交易", exact: true }).click();
    const transactions = [];
    for (const [item, name, price] of [
      ["healing", "回春丹", B.economy.shopPrices.ITEM_HEALING_PILL],
      ["pills", "突破丹", B.economy.shopPrices.ITEM_BREAKTHROUGH_PILL],
      ["grass", "凝元草", B.economy.shopPrices.ITEM_NINGYUAN_GRASS],
      ["qi", "聚气丹", B.economy.shopPrices.qi],
    ] as const) {
      const before = await saved(page);
      await expect(page.locator(`[data-shop-item="${item}"]`)).toHaveAttribute(
        "data-price",
        String(price),
      );
      const buy = page.getByRole("button", { name: `购买${name}`, exact: true });
      await turnTo(buy);
      const after = await act(page, buy);
      expect(after.player[item]).toBe(before.player[item] + 1);
      expect(before.player.stones - after.player.stones).toBe(price);
      expect(after.day).toBe(before.day);
      expect(after.rng).toEqual(before.rng);
      transactions.push({ item, buy: price });
    }
    for (const item of ["healing", "pills", "grass"]) {
      const before = await saved(page),
        price = B.economy.sellPrices[item];
      const control = page.locator(`[data-sell-item="${item}"]`);
      await expect(control).toHaveAttribute("data-price", String(price));
      await turnTo(control);
      const after = await act(page, control);
      expect(after.player[item]).toBe(before.player[item] - 1);
      expect(after.player.stones - before.player.stones).toBe(price);
      expect(after.day).toBe(before.day);
      expect(after.rng).toEqual(before.rng);
      transactions.push({ item, sell: price });
    }
    // Qi consumption lives in 随身物品, not the trading category.
    await page.getByRole("button", { name: "随身物品", exact: true }).click();
    const preQi = await saved(page);
    const gain =
      B.cultivation.qiDailyBaseGain +
      Math.floor(preQi.player.aptitude / B.cultivation.aptitudeGainDivisor) +
      B.cultivation.manualRanks[preQi.player.manualRank].gain;
    const rule = B.cultivation.advanceRules[B.cultivation.realmOrder[preQi.player.realm]];
    const expectedQi = Math.min(
      gain * B.economy.qiExperienceDays,
      Math.floor((rule.requiredExperience * B.economy.qiThresholdCapBp) / B.probabilityScaleBp),
    );
    const qiButton = page.getByRole("button", { name: "服用聚气丹", exact: true });
    await turnTo(qiButton);
    const postQi = await act(page, qiButton);
    expect(postQi.player.xp - preQi.player.xp).toBe(expectedQi);
    expect(postQi.player.qi).toBe(preQi.player.qi - 1);
    expect(postQi.day).toBe(preQi.day);
    expect(postQi.rng).toEqual(preQi.rng);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(
      false,
    );
    await page.screenshot({
      path: `${output}/inventory-${width}.png`,
      fullPage: true,
      animations: "disabled",
    });
    await openPractice(page);
    await page.getByLabel("停止条件", { exact: true }).selectOption("days");
    await page.getByLabel("修炼日数", { exact: true }).selectOption("7");
    await armPause(page, 1);
    await act(page, page.locator("#practice-start"));
    await expect.poll(async () => (await saved(page)).longAction?.checkpoint).toBe(1);
    const paused = await saved(page),
      progress = await page.evaluate(() => (window as any).__actualProgress.at(-1));
    expect(progress.day).toBe(paused.day);
    expect(progress.actionId).toBe(paused.longAction.id);
    const entries = paused.events.filter((e: any) => progress.newEventIds.includes(e.id));
    const known = entries.filter((e: any) =>
      paused.knowledge[e.id]?.some((row: number[]) => row[0] === 0),
    );
    const unseen = paused.events.filter(
      (e: any) =>
        e.day === paused.day && !paused.knowledge[e.id]?.some((row: number[]) => row[0] === 0),
    );
    expect(unseen.length).toBeGreaterThan(0);
    for (const event of unseen) expect(progress.newEventIds).not.toContain(event.id);
    const expectedNews = JSON.parse(
      readFileSync("/tmp/xiantu-ab-fixtures/economy-news.json", "utf8"),
    );
    const knownNpc = known.filter((e: any) => expectedNews.some((n: any) => n.id === e.id));
    expect(knownNpc.map((e: any) => e.text)).toEqual(expectedNews.map((e: any) => e.text));
    expect(knownNpc.length).toBeGreaterThan(0);
    await openCurrentLocation(page);
    const speed = page.getByRole("button", { name: /加速显示/ });
    if (await speed.isVisible()) await speed.click();
    for (const event of knownNpc)
      await expect(page.locator(".event-feed-lines")).toContainText(event.text);
    for (const event of unseen)
      await expect(page.locator(".event-feed-lines")).not.toContainText(event.text);
    expect(await saved(page)).toEqual(paused);
    await page.screenshot({ path: `${output}/durable-feed-${width}.png`, animations: "disabled" });
    await page.reload();
    await expect(page.locator(".dojo-primary")).toBeVisible();
    expect(await saved(page)).toEqual(paused);
    writeFileSync(
      `${output}/results-${width}.json`,
      JSON.stringify(
        {
          transactions,
          qiGain: expectedQi,
          progress,
          knownNpcIds: knownNpc.map((e: any) => e.id),
          hiddenIds: unseen.map((e: any) => e.id),
          speedReadOnly: true,
          reloadExact: true,
        },
        null,
        2,
      ),
    );
  });
