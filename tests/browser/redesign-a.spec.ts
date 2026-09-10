import { test, expect, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { saved, openPractice, finish, act, dismissPanels } from "./journey-controls";
const output = "docs/reports/screenshots/redesign-a";
mkdirSync(output, { recursive: true });
async function counts(page: Page) {
  return page.evaluate(() => {
    const visible = (el: Element) => {
      const box = el.getBoundingClientRect(),
        style = getComputedStyle(el);
      return (
        box.width > 0 &&
        box.height > 0 &&
        box.top < innerHeight &&
        box.bottom > 0 &&
        style.visibility !== "hidden" &&
        style.display !== "none" &&
        !el.closest("[hidden],[inert]")
      );
    };
    const controls = (root: Element) =>
      [...root.querySelectorAll('button,a[href],summary,input,select,[role="tab"]')].filter(
        (el) => visible(el) && !(el as HTMLButtonElement).disabled,
      );
    const dojo = document.querySelector(".dojo")!;
    return {
      content: controls(dojo).map((el) => el.textContent?.trim()),
      screen: controls(document.body).length,
      bright: [...document.querySelectorAll('button[data-variant="default"]')]
        .filter(visible)
        .map((el) => el.textContent?.trim()),
      overflow: document.documentElement.scrollWidth > innerWidth,
    };
  });
}
for (const width of [1440, 390])
  test(`A acceptance ${width}: first screen, first full bar, ceremony, portable save and metrics`, async ({
    page,
    browser,
  }, testInfo) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width, height: width === 1440 ? 900 : 844 });
    const issues: string[] = [];
    page.on("pageerror", (e) => issues.push(e.message));
    await page.goto("/");
    const started = Date.now();
    await page.getByRole("textbox", { name: "姓名", exact: true }).fill(`道场验收${width}`);
    await expect(page.getByRole("button", { name: "踏入仙途", exact: true })).toBeEnabled();
    await page.screenshot({
      path: `${output}/step-01-creation-${width}.png`,
      animations: "disabled",
    });
    await page.getByRole("button", { name: "踏入仙途", exact: true }).click();
    await expect(page.locator(".dojo-primary")).toBeVisible();
    await expect(page.getByRole("tab", { name: "道场", exact: true })).toHaveAttribute(
      "data-state",
      "active",
    );
    await expect(page.locator(".game-nav [role=tab]")).toHaveText(["道场", "游历", "人物", "行囊"]);
    await expect(page.locator(".dojo-primary")).toBeInViewport();
    await expect(page.getByRole("button", { name: "查看全部", exact: true })).toBeVisible();
    await expect(page.getByLabel("本机已存", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "寻找入门功法", exact: true })).toBeEnabled();
    const first = await counts(page);
    expect(first.content.length).toBeLessThanOrEqual(7);
    expect(first.bright).toHaveLength(1);
    expect(first.overflow).toBe(false);
    await page.screenshot({ path: `${output}/step-01-dojo-${width}.png`, animations: "disabled" });
    await act(page, page.locator(".dojo-primary"));
    await act(page, page.locator(".dojo-primary"));
    expect((await saved(page)).player.manual).toBe(true);
    const manual = await saved(page);
    const states = [
      { name: "新局", ...first },
      { name: "学会功法", ...(await counts(page)) },
    ];
    await page.getByRole("button", { name: "修炼 7 日", exact: true }).click();
    await finish(page);
    const full = await saved(page);
    expect(full.player.xp).toBe(20);
    const firstFullMs = Date.now() - started;
    expect(firstFullMs).toBeLessThan(180000);
    const speed = page.getByRole("button", { name: /加速显示/ });
    if (await speed.isVisible()) {
      const before = await saved(page);
      await speed.click();
      expect(await saved(page)).toEqual(before);
    }
    await expect(page.locator(".event-feed")).toContainText("修为");
    await page.screenshot({
      path: `${output}/step-02-first-full-${width}.png`,
      animations: "disabled",
    });
    states.push({ name: "首次圆满", ...(await counts(page)) });
    await openPractice(page);
    await page.screenshot({
      path: `${output}/step-02-breakthrough-preparation-${width}.png`,
      animations: "disabled",
    });
    const beforeRitual = await saved(page);
    await page.getByRole("button", { name: /凝神，尝试突破/ }).click();
    await expect(page.getByRole("button", { name: "凝聚气机…", exact: true })).toBeVisible();
    await page.getByRole("dialog").getByRole("button", { name: "关闭", exact: true }).click();
    await page.waitForTimeout(1300);
    expect(await saved(page)).toEqual(beforeRitual);
    await openPractice(page);
    await page.getByRole("button", { name: /凝神，尝试突破/ }).click();
    await expect(page.locator(".realm-ceremony")).toBeVisible();
    await expect
      .poll(() =>
        page.locator(".realm-ceremony").evaluate((el) => Number(getComputedStyle(el).opacity)),
      )
      .toBeGreaterThan(0.9);
    await page.screenshot({
      path: `${output}/step-02-realm-ceremony-${width}.png`,
      animations: "allow",
    });
    await finish(page);
    const final = await saved(page);
    states.push({ name: "引气入体后", ...(await counts(page)) });
    await page.getByRole("button", { name: "存档与设置", exact: true }).click();
    const exported = page.waitForEvent("download");
    await page.getByRole("button", { name: "导出当前存档", exact: true }).click();
    const file = (await exported).path();
    const context = await browser.newContext({
        viewport: { width, height: width === 1440 ? 900 : 844 },
      }),
      other = await context.newPage();
    await other.goto("/");
    await other.getByLabel("选择存档文件").setInputFiles((await file)!);
    await other.getByRole("button", { name: "确认继续", exact: true }).click();
    await expect(other.locator(".dojo-primary")).toBeVisible();
    const imported = await saved(other);
    expect(imported.saveId).not.toBe(final.saveId);
    expect(imported.revision).toBe(final.revision + 1);
    expect({ ...imported, saveId: final.saveId, revision: final.revision }).toEqual(final);
    await expect(other.locator(".event-feed")).toContainText("已导入");
    await other.screenshot({
      path: `${output}/step-09-import-${width}.png`,
      animations: "disabled",
    });
    await other.reload();
    await expect(other.locator(".dojo-primary")).toBeVisible();
    expect(await saved(other)).toEqual(imported);
    await context.close();
    // Preserve the real checkpoint version; this A branch does not implement the B migration.
    await dismissPanels(page);
    await page.getByRole("button", { name: "存档与设置", exact: true }).click();
    await page.getByLabel("选择存档文件").setInputFiles({
      name: "rules-0.1.6.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(final)),
    });
    await page.getByRole("button", { name: "确认继续", exact: true }).click();
    await expect(page.locator(".event-feed")).toContainText(final.rulesVersion);
    await page.screenshot({
      path: `${output}/step-09-current-version-${width}.png`,
      animations: "disabled",
    });
    const practicePaths = [];
    for (const path of [
      { from: "道场", tab: "道场" },
      { from: "游历", tab: "游历" },
      { from: "人物", tab: "人物" },
      { from: "行囊", tab: "行囊" },
      { from: "人物页的资料弹窗", tab: "人物", modal: "profile" },
      { from: "行囊页的设置", tab: "行囊", modal: "settings" },
      { from: "道场更多行动", tab: "道场", modal: "more" },
    ]) {
      const tab = path.tab;
      // Import the same real, UI-created checkpoint before checking each navigation path.
      {
        await page.getByRole("button", { name: "存档与设置", exact: true }).click();
        await page.getByLabel("选择存档文件").setInputFiles({
          name: "practice-checkpoint.json",
          mimeType: "application/json",
          buffer: Buffer.from(JSON.stringify(manual)),
        });
        await page.getByRole("button", { name: "确认继续", exact: true }).click();
        await expect(page.locator(".dojo-primary")).toBeVisible();
      }
      await page.getByRole("tab", { name: tab, exact: true }).click();
      if (path.modal === "profile") await page.locator(".person-row h3").first().click();
      if (path.modal === "settings")
        await page.getByRole("button", { name: "存档与设置", exact: true }).click();
      if (path.modal === "more")
        await page.getByRole("button", { name: "更多", exact: true }).click();
      let clicks = 0;
      if (path.modal) {
        await page.getByRole("dialog").getByRole("button", { name: "关闭", exact: true }).click();
        clicks++;
      }
      if (tab !== "道场") {
        await page.getByRole("tab", { name: "道场", exact: true }).click();
        clicks++;
      }
      await page.getByRole("button", { name: "修炼 7 日", exact: true }).click();
      clicks++;
      await finish(page);
      practicePaths.push({ from: path.from, clicks });
    }
    expect(Math.max(...practicePaths.map((p) => p.clicks))).toBeLessThanOrEqual(3);
    for (const state of states) {
      expect(state.content.length, state.name).toBeLessThanOrEqual(7);
      expect(state.bright, state.name).toHaveLength(1);
      expect(state.overflow, state.name).toBe(false);
    }
    expect(issues).toEqual([]);
    const metrics = {
      browser: browser.version(),
      origin: new URL(page.url()).origin,
      offlineVersion: (await (await page.request.get("/offline-manifest.json")).json()).version,
      viewport: { width, height: width === 1440 ? 900 : 844 },
      firstScreen: first,
      states,
      firstFullMs,
      practicePaths,
      saveVersion: final.rulesVersion,
      initialRealm: manual.player.realm,
      ceremonyRealm: final.player.realm,
    };
    writeFileSync(`${output}/metrics-${width}.json`, JSON.stringify(metrics, null, 2));
    await testInfo.attach("measured-metrics", {
      body: JSON.stringify(metrics, null, 2),
      contentType: "application/json",
    });
  });
