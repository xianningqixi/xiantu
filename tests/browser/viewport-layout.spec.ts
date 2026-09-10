import { test, expect, type Page, type Locator, type TestInfo } from "@playwright/test";
import { readFileSync } from "node:fs";
import { saved } from "./journey-controls";

const fixtures = process.env.XIANTU_AB_FIXTURES ?? "/tmp/xiantu-ab-fixtures";

async function closeTop(page: Page) {
  const dialogs = page.locator('[role="dialog"][data-state="open"]');
  const count = await dialogs.count();
  await dialogs.last().getByRole("button", { name: "关闭", exact: true }).click();
  await expect(dialogs).toHaveCount(count - 1);
  await expect(page.locator('[role="dialog"][data-state="closed"]')).toHaveCount(0);
}

async function importWorld(page: Page, file = "economy", patch?: (world: any) => void) {
  const world = JSON.parse(readFileSync(`${fixtures}/${file}.json`, "utf8"));
  patch?.(world);
  await page.getByLabel("选择存档文件").setInputFiles({
    name: "layout-fixture.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(world)),
  });
  await page.getByRole("button", { name: "确认继续", exact: true }).click();
  await expect(page.locator(".dojo-primary")).toBeVisible();
  await expect(page.getByLabel("本机已存", { exact: true })).toBeVisible();
  return saved(page);
}

async function noScroll(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(() => {
        const scrollers = [...document.querySelectorAll<HTMLElement>("*")].filter((el) => {
          if (!el.getClientRects().length || el.clientHeight < 4 || el.clientWidth < 4)
            return false;
          const style = getComputedStyle(el);
          return (
            (["auto", "scroll"].includes(style.overflowY) &&
              el.scrollHeight > el.clientHeight + 2) ||
            (["auto", "scroll"].includes(style.overflowX) && el.scrollWidth > el.clientWidth + 2)
          );
        });
        return {
          viewport:
            document.documentElement.scrollHeight <= innerHeight + 1 &&
            document.documentElement.scrollWidth <= innerWidth + 1,
          scrollers: scrollers.map((el) => `${el.tagName}.${el.className}`),
        };
      }),
    )
    .toEqual({ viewport: true, scrollers: [] });
}

/** Every control must be completely reachable on a page, not merely concealed with overflow. */
async function readAllPages(host: Locator) {
  await expect(host).toHaveAttribute("data-ready", "true");
  const previous = host
    .locator(":scope > .page-navigation")
    .getByRole("button", { name: /^上一页/ });
  const next = host.locator(":scope > .page-navigation").getByRole("button", { name: /^下一页/ });
  while ((await previous.count()) && (await previous.isEnabled())) await previous.click();
  const reached = new Set<number>();
  let total = 0;
  for (let turn = 0; turn < 80; turn++) {
    const state = await host.evaluate((el) => {
      const crop = el
        .querySelector<HTMLElement>(":scope > .page-window > .page-crop")!
        .getBoundingClientRect();
      const controls = [
        ...el.querySelectorAll<HTMLElement>(
          ".paged-document button, .paged-document input, .paged-document select, .paged-document a",
        ),
      ].filter(
        (control) =>
          control.checkVisibility() &&
          control.getBoundingClientRect().height > 3 &&
          control.getBoundingClientRect().width > 3 &&
          !control.closest('[hidden], [aria-hidden="true"], .sr-only') &&
          getComputedStyle(control).opacity !== "0",
      );
      const visible: number[] = [],
        split: string[] = [];
      controls.forEach((control, index) => {
        const r = control.getBoundingClientRect();
        if (r.bottom <= crop.top + 1 || r.top >= crop.bottom - 1) return;
        if (
          r.top >= crop.top - 1 &&
          r.bottom <= crop.bottom + 1 &&
          r.left >= crop.left - 1 &&
          r.right <= crop.right + 1
        )
          visible.push(index);
        else
          split.push(
            `${control.getAttribute("aria-label") || control.textContent?.trim() || control.tagName} [${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.right)},${Math.round(r.bottom)}] crop [${Math.round(crop.left)},${Math.round(crop.top)},${Math.round(crop.right)},${Math.round(crop.bottom)}]`,
          );
      });
      return { total: controls.length, visible, split };
    });
    expect(state.split).toEqual([]);
    total = state.total;
    state.visible.forEach((id) => reached.add(id));
    if (!(await next.count()) || !(await next.isEnabled())) break;
    await next.click();
  }
  expect(reached.size).toBe(total);
  while ((await previous.count()) && (await previous.isEnabled())) await previous.click();
}

async function inspect(page: Page, info: TestInfo, name: string) {
  await page.waitForTimeout(100);
  await noScroll(page);
  const dialogs = page.locator('[role="dialog"][data-state="open"]');
  const surface = (await dialogs.count()) ? dialogs.last() : page.locator("main").last();
  for (const host of await surface.locator(".paged-content:visible").all())
    await readAllPages(host);
  await page.screenshot({ path: info.outputPath(`${name}.png`), animations: "disabled" });
}

for (const [width, height] of [
  [1440, 900],
  [1366, 768],
  [390, 844],
  [320, 740],
]) {
  test(`single-screen ${width}: creation, four pages, profiles, atlas and functional dialogs`, async ({
    page,
  }, info) => {
    test.setTimeout(240000);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    let generated = 0;
    page.on("request", (request) => {
      if (new URL(request.url()).pathname === "/api/portraits") generated++;
    });
    await page.route("**/api/model-settings", (route) =>
      route.fulfill({
        json: {
          models: {
            llm: { enabled: false, hasKey: false },
            image: { enabled: false, hasKey: false },
          },
        },
      }),
    );
    await page.setViewportSize({ width, height });
    await page.goto("/author");
    await expect(page.getByRole("textbox", { name: "姓名", exact: true })).toBeVisible();
    await page.getByRole("textbox", { name: "姓名", exact: true }).fill("一屏修士");
    for (const name of ["入世", "形貌", "机缘", "立绘", "更多设定"]) {
      await page
        .getByRole("navigation", { name: "创角步骤" })
        .getByRole("button", { name, exact: true })
        .click();
      await inspect(page, info, `creation-${name}`);
    }
    const before = await importWorld(page);
    for (const name of ["道场", "游历", "人物", "行囊"]) {
      await page.getByRole("tab", { name, exact: true }).click();
      await inspect(page, info, `page-${name}`);
    }
    for (const name of ["随身物品", "法宝与修行", "坊市交易"]) {
      await page
        .getByRole("navigation", { name: "行囊分类" })
        .getByRole("button", { name, exact: true })
        .click();
      await inspect(page, info, `inventory-${name}`);
    }
    await page.getByRole("tab", { name: "游历", exact: true }).click();
    const map = page.locator(".atlas-canvas");
    for (const marker of await map.locator("[data-atlas-place]").all()) {
      const r = (await marker.boundingBox())!,
        c = (await map.boundingBox())!;
      expect(r.y).toBeGreaterThanOrEqual(c.y);
      expect(r.y + r.height).toBeLessThanOrEqual(c.y + c.height);
    }
    await page.locator('[data-atlas-place="atlas.wendao"]').click();
    await inspect(page, info, "atlas-destination");
    if (width <= 700) await closeTop(page);
    await page.getByRole("tab", { name: "人物", exact: true }).click();
    await page.getByRole("button", { name: "查看全部人物", exact: true }).click();
    await inspect(page, info, "people-search");
    await page.getByRole("searchbox", { name: "搜索姓名", exact: true }).fill("林晚");
    await page.locator(".person-row h3").click();
    for (const name of ["属性", "关系", "经历", "立绘"]) {
      await page.locator(".profile-modal").getByRole("tab", { name, exact: true }).click();
      await inspect(page, info, `profile-${name}`);
    }
    await closeTop(page);
    await page.getByRole("tab", { name: "道场", exact: true }).click();
    if (width <= 700)
      await page
        .getByRole("navigation", { name: "道场阅读" })
        .getByRole("button", { name: "近日见闻" })
        .click();
    await page.getByRole("button", { name: "查看全部", exact: true }).click();
    await inspect(page, info, "journal-events");
    await page
      .getByRole("navigation", { name: "历程分类" })
      .getByRole("button", { name: "主线线索" })
      .click();
    await inspect(page, info, "journal-main");
    await closeTop(page);
    await page.getByRole("button", { name: "更多", exact: true }).click();
    for (const name of await page
      .getByRole("navigation", { name: "行动分类" })
      .getByRole("button")
      .allTextContents()) {
      await page
        .getByRole("navigation", { name: "行动分类" })
        .getByRole("button", { name, exact: true })
        .click();
      await inspect(page, info, `more-${name}`);
    }
    await page
      .getByRole("navigation", { name: "行动分类" })
      .getByRole("button", { name: "日常" })
      .click();
    await page.getByRole("button", { name: "设置修炼方式", exact: true }).click();
    await inspect(page, info, "practice");
    await closeTop(page);
    await page.getByRole("button", { name: "存档与设置", exact: true }).click();
    for (const name of ["存档", "离线", "新角色", "工具"]) {
      await page
        .getByRole("navigation", { name: "设置分类" })
        .getByRole("button", { name, exact: true })
        .click();
      await inspect(page, info, `settings-${name}`);
    }
    await page.getByRole("button", { name: "AI 模型设置", exact: true }).click();
    for (const name of [/LLM 文字模型/, /生图模型/]) {
      await page.getByRole("tab", { name }).click();
      await inspect(page, info, `models-${name.source}`);
    }
    await page
      .locator(".model-settings-modal")
      .getByRole("button", { name: "关闭", exact: true })
      .click();
    await expect(page.getByRole("navigation", { name: "设置分类" })).toBeVisible();
    await page
      .getByRole("navigation", { name: "设置分类" })
      .getByRole("button", { name: "存档", exact: true })
      .click();
    await page.getByRole("button", { name: "本机备份", exact: true }).click();
    await inspect(page, info, "backups");
    await closeTop(page);
    expect(await saved(page)).toEqual(before);
    expect(generated).toBe(0);
    expect(errors).toEqual([]);
  });
}

/** Use the visible pager, never scroll or force-click a clipped control. */
async function turnTo(control: Locator) {
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
    if (
      await control.evaluate((el) => {
        if (!el.checkVisibility()) return false;
        const r = el.getBoundingClientRect(),
          c = el.closest(".page-crop")!.getBoundingClientRect();
        return r.top >= c.top - 1 && r.bottom <= c.bottom + 1;
      })
    )
      return;
    if (!(await next.count()) || !(await next.isEnabled())) break;
    await next.click();
  }
  throw new Error(`Unreachable control: ${await control.textContent()}`);
}
async function clickPaged(control: Locator) {
  await turnTo(control);
  await control.click();
}

for (const width of [1366, 390]) {
  test(`working controls ${width}: create, buy, practice, summary, portrait decisions`, async ({
    page,
  }, info) => {
    test.setTimeout(180000);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route("**/api/model-settings", (route) =>
      route.fulfill({
        json: {
          models: {
            llm: { enabled: true, hasKey: true, model: "layout-fixture" },
            image: { enabled: true, hasKey: true, model: "layout-fixture" },
          },
        },
      }),
    );
    const { default: sharp } = await import("sharp");
    const bytes = await sharp({
      create: { width: 640, height: 960, channels: 4, background: "#819787" },
    })
      .png()
      .toBuffer();
    let generated = 0;
    await page.route("**/api/portraits", (route) => {
      generated++;
      return route.fulfill({
        json: { image: `data:image/png;base64,${bytes.toString("base64")}` },
      });
    });
    await page.setViewportSize({ width, height: width === 1366 ? 768 : 844 });
    await page.goto("/author");
    await page.getByRole("textbox", { name: "姓名", exact: true }).fill("分页新修士");
    await page
      .getByRole("navigation", { name: "创角步骤" })
      .getByRole("button", { name: "形貌", exact: true })
      .click();
    const heightInput = page.getByLabel("身高（cm）", { exact: true });
    await turnTo(heightInput);
    await heightInput.fill("172");
    await page
      .getByRole("navigation", { name: "创角步骤" })
      .getByRole("button", { name: "机缘", exact: true })
      .click();
    await page
      .getByRole("navigation", { name: "创角步骤" })
      .getByRole("button", { name: "形貌", exact: true })
      .click();
    await expect(heightInput).toHaveValue("172");
    await page.getByRole("button", { name: "踏入仙途", exact: true }).click();
    await expect(page.getByLabel("本机已存", { exact: true })).toBeVisible();
    expect((await saved(page)).player.physique.heightCm).toBe(172);
    expect((await saved(page)).player.name).toBe("分页新修士");
    // Scenario data goes through the real import/confirmation path in an isolated author database.
    const before = await importWorld(page);
    await page.getByRole("tab", { name: "行囊", exact: true }).click();
    await page
      .getByRole("navigation", { name: "行囊分类" })
      .getByRole("button", { name: "坊市交易" })
      .click();
    await clickPaged(page.getByRole("button", { name: "购买聚气丹", exact: true }));
    await expect.poll(async () => (await saved(page)).player.qi).toBe(before.player.qi + 1);
    expect((await saved(page)).day).toBe(before.day);
    expect((await saved(page)).player.stones).toBeLessThan(before.player.stones);
    await page.getByRole("tab", { name: "道场", exact: true }).click();
    await page.getByRole("button", { name: "更多", exact: true }).click();
    await clickPaged(page.getByRole("button", { name: "设置修炼方式", exact: true }));
    await page.getByLabel("停止条件", { exact: true }).selectOption("days");
    await turnTo(page.getByLabel("修炼日数", { exact: true }));
    await page.getByLabel("修炼日数", { exact: true }).selectOption("1");
    await inspect(page, info, "practice-day");
    await clickPaged(page.locator("#practice-start"));
    await expect.poll(async () => (await saved(page)).longAction).toBeNull();
    await expect.poll(async () => (await saved(page)).day).toBe(before.day + 1);
    expect((await saved(page)).player.xp).toBeGreaterThan(before.player.xp);
    if (width <= 700)
      await page
        .getByRole("navigation", { name: "道场阅读" })
        .getByRole("button", { name: "近日见闻" })
        .click();
    await page.getByRole("button", { name: "闭关 1 日汇总", exact: true }).click();
    await inspect(page, info, "retreat-summary");
    await closeTop(page);
    await page.getByRole("tab", { name: "人物", exact: true }).click();
    await page.getByRole("button", { name: "查看全部人物", exact: true }).click();
    await page.getByRole("searchbox", { name: "搜索姓名", exact: true }).fill("林晚");
    await page.locator(".person-row h3").click();
    const profile = page.locator(".profile-modal");
    await profile.getByRole("tab", { name: "立绘", exact: true }).click();
    const old = await saved(page);
    await clickPaged(profile.getByRole("button", { name: "重新绘制立绘", exact: true }));
    await inspect(page, info, "portrait-editor");
    await clickPaged(profile.getByRole("button", { name: "生成新立绘", exact: true }));
    await expect(profile.getByRole("button", { name: "采用新立绘", exact: true })).toBeEnabled();
    await inspect(page, info, "portrait-comparison");
    await clickPaged(profile.getByRole("button", { name: /^(保留原立绘|取消绘制)$/ }));
    expect(await saved(page)).toEqual(old);
    await clickPaged(profile.getByRole("button", { name: "重新绘制立绘", exact: true }));
    await clickPaged(profile.getByRole("button", { name: "生成新立绘", exact: true }));
    await expect(profile.getByRole("button", { name: "采用新立绘", exact: true })).toBeEnabled();
    await clickPaged(profile.getByRole("button", { name: "采用新立绘", exact: true }));
    await expect.poll(async () => (await saved(page)).revision).toBe(old.revision + 1);
    await clickPaged(profile.getByRole("button", { name: "恢复原立绘", exact: true }));
    await expect.poll(async () => (await saved(page)).revision).toBe(old.revision + 2);
    const restored = await saved(page);
    expect(restored.day).toBe(old.day);
    expect(restored.rng).toEqual(old.rng);
    expect(restored.player).toEqual(old.player);
    const originalNpc = old.npcs.find((a: any) => a.id === "NPC_LIN_WAN");
    expect(
      restored.npcs.find((a: any) => a.id === "NPC_LIN_WAN").portraitOriginal.physique,
    ).toEqual(originalNpc.physique);
    expect(restored.npcs.map(({ portraitOriginal, ...a }: any) => a)).toEqual(
      old.npcs.map(({ portraitOriginal, ...a }: any) => a),
    );
    expect(generated).toBe(2);
    expect(errors).toEqual([]);
  });
}

test("sect, breakthrough and enlarged-font reading remain reachable", async ({ page }, info) => {
  test.setTimeout(120000);
  await page.route("**/api/model-settings", (route) => route.fulfill({ json: { models: {} } }));
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto("/author");
  await importWorld(page, "realm-9");
  await page.getByRole("button", { name: "更多", exact: true }).click();
  await clickPaged(page.getByRole("button", { name: "准备突破", exact: true }));
  await inspect(page, info, "breakthrough-ready");
  await closeTop(page);
  const sects = JSON.parse(
    readFileSync("content-packs/cultivation-sects/sects.json", "utf8"),
  ).sects;
  const before = await importWorld(page, "economy", (w) => {
    w.player.location = sects[0].home;
  });
  await page.getByRole("button", { name: "更多", exact: true }).click();
  await page
    .getByRole("navigation", { name: "行动分类" })
    .getByRole("button", { name: "宗门", exact: true })
    .click();
  await inspect(page, info, "sect-entry");
  await closeTop(page);
  await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
  for (const name of ["道场", "游历", "人物", "行囊"]) {
    await page.getByRole("tab", { name, exact: true }).click();
    await inspect(page, info, `large-font-${name}`);
  }
  expect(await saved(page)).toEqual(before);
});

for (const width of [1366, 320]) {
  test(`battle and settlement ${width}: commands and confirmation stay accessible`, async ({
    page,
  }, info) => {
    await page.route("**/api/model-settings", (route) => route.fulfill({ json: { models: {} } }));
    await page.setViewportSize({ width, height: width === 1366 ? 768 : 740 });
    await page.goto("/author");
    const battle = await importWorld(page, "layout-battle");
    await inspect(page, info, "battle-current");
    await page.getByRole("button", { name: "更多", exact: true }).click();
    await inspect(page, info, "battle-controls");
    await clickPaged(page.getByRole("button", { name: "普攻 1 回合", exact: true }));
    await expect.poll(async () => (await saved(page)).battle.round).toBe(battle.battle.round + 1);
    await closeTop(page);
    const loot = await importWorld(page, "layout-loot");
    await page.locator(".dojo-primary").click();
    await expect(
      page.getByRole("navigation", { name: "行动分类" }).getByRole("button", { name: "战利品" }),
    ).toHaveAttribute("aria-current", "page");
    await inspect(page, info, "loot-options");
    await clickPaged(page.getByRole("button", { name: /把凝元草也收入自己囊中/ }));
    await noScroll(page);
    await expect(
      page.getByRole("button", { name: "确认独占，承担后果", exact: true }),
    ).toBeInViewport();
    expect(await saved(page)).toEqual(loot);
  });
}

test("returning from a related person restores the reading page", async ({ page }) => {
  await page.route("**/api/model-settings", (route) => route.fulfill({ json: { models: {} } }));
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto("/author");
  const before = await importWorld(page);
  await page.locator(".status-profile h2").click();
  const profile = page.locator(".profile-modal");
  await profile.getByRole("tab", { name: "关系", exact: true }).click();
  const peer = profile.locator(".sheet-peer").nth(5);
  await turnTo(peer);
  const readingPage = await profile.locator(".paged-content:visible").getAttribute("data-page");
  expect(Number(readingPage)).toBeGreaterThan(1);
  await peer.locator("strong").click();
  await profile.getByRole("button", { name: /返回境界验收7的资料/ }).click();
  await expect(profile.getByRole("tab", { name: "关系", exact: true })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(profile.locator(".paged-content:visible")).toHaveAttribute("data-ready", "true");
  await expect(profile.locator(".paged-content:visible")).toHaveAttribute(
    "data-page",
    readingPage!,
  );
  expect(await saved(page)).toEqual(before);
});
