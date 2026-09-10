import { test, expect, type Page } from "@playwright/test";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { saved, dismissPanels, finish, openMore } from "./journey-controls";
const B = JSON.parse(readFileSync("lib/game/content/balance.json", "utf8"));
const dir = "docs/reports/screenshots/redesign-ab/realms";
const fixtures = process.env.XIANTU_AB_FIXTURES ?? "/tmp/xiantu-ab-fixtures";
async function importScenario(page: Page, file: string) {
  await dismissPanels(page);
  if (await page.locator(".dojo").count())
    await page.getByRole("button", { name: "存档与设置", exact: true }).click();
  await page.getByLabel("选择存档文件").setInputFiles(`${fixtures}/${file}.json`);
  await page.getByRole("button", { name: "确认继续", exact: true }).click();
  await expect(page.locator(".dojo-primary")).toBeVisible();
  await expect(page.getByLabel("本机已存", { exact: true })).toBeVisible();
  await expect
    .poll(async () => (await saved(page))?.player.name)
    .toBe(JSON.parse(readFileSync(`${fixtures}/${file}.json`, "utf8")).player.name);
  return saved(page);
}
for (const width of [1440, 390])
  test(`AB ${width}: every adjacent realm, preparations, cap and both failure outcomes use actual Worker commands`, async ({
    page,
    browser,
  }) => {
    test.setTimeout(240000);
    mkdirSync(dir, { recursive: true });
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await page.goto("/");
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const results = [];
    for (const [realm, key] of B.cultivation.realmOrder.entries()) {
      const before = await importScenario(page, `realm-${realm}`),
        rule = B.cultivation.advanceRules[key];
      await expect(page.locator(".status-profile small")).not.toHaveText("");
      expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(
        false,
      );
      await page.screenshot({ path: `${dir}/${key}-${width}.png`, animations: "disabled" });
      expect(await saved(page)).toEqual(before);
      if (rule.kind === "cap") {
        await openMore(page);
        await page.getByRole("button", { name: "设置修炼方式", exact: true }).click();
        await expect(page.locator("#practice-start")).toBeDisabled();
        expect(await saved(page)).toEqual(before);
        await dismissPanels(page);
        results.push({ key, kind: rule.kind, capBlocked: true, readOnly: true });
        continue;
      }
      await page.locator(".dojo-primary").click();
      if (rule.kind !== "minor") {
        await expect(page.getByRole("dialog")).toContainText("感悟 3");
        expect(await page.getByRole("switch", { name: "服用突破丹", exact: true }).count()).toBe(
          rule.kind === "major" ? 1 : 0,
        );
        expect(await saved(page)).toEqual(before);
        if (rule.kind === "major")
          await page.screenshot({
            path: `${dir}/major-preparation-${width}.png`,
            animations: "disabled",
          });
        await page.getByRole("button", { name: /凝神，尝试突破/ }).click();
      }
      await expect(page.locator(".realm-ceremony")).toBeVisible();
      await finish(page);
      const after = await saved(page);
      expect(after.player.realm).toBe(B.cultivation.realmOrder.indexOf(rule.targetRealm));
      expect(after.player.xp).toBe(5);
      expect(after.day - before.day).toBe(rule.days);
      expect(after.player.insight).toBe(rule.kind === "minor" ? before.player.insight : 0);
      expect(after.player.pills).toBe(before.player.pills);
      expect(after.player.alive).toBe(true);
      if (rule.kind === "minor") expect(after.rng).toEqual(before.rng);
      results.push({
        key,
        kind: rule.kind,
        target: rule.targetRealm,
        days: after.day - before.day,
        overflow: after.player.xp,
        insight: after.player.insight,
        alive: after.player.alive,
      });
      await page.reload();
      await expect(page.locator(".dojo-primary")).toBeVisible();
      expect(await saved(page)).toEqual(after);
    }
    for (const outcome of ["ordinary", "setback"]) {
      const before = await importScenario(page, outcome);
      await page.locator(".dojo-primary").click();
      await page.getByRole("button", { name: /凝神，尝试突破/ }).click();
      if (outcome === "setback") {
        await expect(page.locator(".realm-setback")).toBeVisible();
        await expect
          .poll(() =>
            page.locator(".realm-setback").evaluate((el) => Number(getComputedStyle(el).opacity)),
          )
          .toBeGreaterThan(0.9);
        await page.screenshot({ path: `${dir}/setback-${width}.png`, animations: "allow" });
      }
      await finish(page);
      const after = await saved(page);
      expect(after.player.realm).toBe(before.player.realm - (outcome === "setback" ? 1 : 0));
      expect(after.player.alive).toBe(true);
      expect(after.player.hp).toBeGreaterThan(0);
      expect(after.player.xp).toBeLessThan(before.player.xp);
      results.push({
        outcome,
        from: before.player.realm,
        to: after.player.realm,
        xp: after.player.xp,
        alive: after.player.alive,
      });
    }
    expect(errors).toEqual([]);
    writeFileSync(
      `${dir}/results-${width}.json`,
      JSON.stringify(
        {
          browser: browser.version(),
          viewport: { width, height: width === 390 ? 844 : 900 },
          setup:
            "Controlled valid scenario fixtures, actual UI commands through production Worker; not a new-player timing run",
          results,
        },
        null,
        2,
      ),
    );
  });

import { installPauseControl, armPause } from "./pause-control";
for (const width of [1440, 390])
  test(`AB ${width}: legacy in-flight breakthrough preserves its snapshot across migration, checkpoint reload and new context`, async ({
    page,
    browser,
  }) => {
    test.setTimeout(90000);
    await installPauseControl(page);
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    const path = "tests/game/fixtures/redesign-b/legacy-0.1.6-inflight.json";
    const old = JSON.parse(readFileSync(path, "utf8"));
    await page.goto("/");
    await page.getByLabel("选择存档文件").setInputFiles(path);
    await page.getByRole("button", { name: "确认继续", exact: true }).click();
    await expect(page.locator(".event-feed")).toContainText("旧档已迁移至规则 0.2.0");
    const migrated = await saved(page);
    expect(migrated.longAction.chance).toBe(old.longAction.chance);
    expect(migrated.longAction.remaining).toBe(old.longAction.remaining);
    expect(migrated.longAction.rule.targetRealm).toBe("FOUNDATION_1");
    expect(migrated.day).toBe(old.day);
    expect(migrated.rng).toEqual(old.rng);
    await page.screenshot({ path: `${dir}/legacy-inflight-${width}.png`, animations: "disabled" });
    await armPause(page, 1);
    await page.locator(".dojo-primary").click();
    await expect(page.locator(".dojo-primary")).toHaveText("继续当前行动");
    const paused = await saved(page);
    expect(paused.longAction.checkpoint).toBe(1);
    expect(paused.longAction.chance).toBe(old.longAction.chance);
    await page.reload();
    await expect(page.locator(".dojo-primary")).toBeVisible();
    expect(await saved(page)).toEqual(paused);
    await page.getByRole("button", { name: "存档与设置", exact: true }).click();
    const event = page.waitForEvent("download");
    await page.getByRole("button", { name: "导出当前存档", exact: true }).click();
    const download = await (await event).path();
    const ctx = await browser.newContext({
        viewport: { width, height: width === 390 ? 844 : 900 },
      }),
      other = await ctx.newPage();
    await other.goto(process.env.XIANTU_TEST_URL ?? "http://127.0.0.1:3100");
    await other.getByLabel("选择存档文件").setInputFiles(download!);
    await other.getByRole("button", { name: "确认继续", exact: true }).click();
    await expect(other.locator(".dojo-primary")).toBeVisible();
    const transferred = await saved(other);
    expect({ ...transferred, saveId: paused.saveId, revision: paused.revision }).toEqual(paused);
    await other.screenshot({
      path: `${dir}/checkpoint-import-${width}.png`,
      animations: "disabled",
    });
    await other.locator(".dojo-primary").click();
    await finish(other);
    const done = await saved(other);
    expect(done.day - old.day).toBe(old.longAction.remaining);
    expect(done.player.alive).toBe(true);
    expect(done.longAction).toBeNull();
    await ctx.close();
  });
