import { growTo } from "./journey-controls";
import { creationSettings, dismissPanels } from "./journey-controls";
import { test, expect, type Page } from "@playwright/test";
import sharp from "sharp";
test.beforeEach(async ({ page }) => {
  // Model availability and paid image responses are external fixtures; cosmetic cache and game Worker remain real.
  await page.route("**/api/model-settings", (route) =>
    route.fulfill({
      json: {
        models: {
          llm: { enabled: true, hasKey: true, model: "browser-fixture" },
          image: { enabled: true, hasKey: true, model: "browser-fixture" },
        },
      },
    }),
  );
});
async function openLin(page: Page) {
  await dismissPanels(page);
  await page.getByRole("tab", { name: "人物", exact: true }).click();
  const all = page.getByRole("button", { name: "查看全部人物", exact: true });
  if (await all.isVisible()) await all.click();
  await page.getByRole("searchbox", { name: "搜索姓名", exact: true }).fill("林晚");
  await page.locator(".person-row").filter({ hasText: "林晚" }).getByRole("heading").click();
}
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
async function create(page: Page, unlockPeople = true) {
  await page.getByRole("textbox", { name: "姓名", exact: true }).fill("立绘修士");
  await page.getByRole("button", { name: "踏入仙途", exact: true }).click();
  await expect(page.getByRole("heading", { name: "立绘修士", exact: true })).toBeVisible();
  if (unlockPeople) {
    await page.locator(".dojo-primary").click();
    await expect(page.locator(".dojo-primary")).toHaveText(/谢过/);
    await growTo(page, "QI_1");
  }
}
test("creation fits first-screen essentials while advanced shape and portrait settings remain available", async ({
  page,
}) => {
  for (const [width, height] of [
    [1440, 900],
    [1366, 768],
    [390, 844],
    [320, 720],
  ]) {
    await page.setViewportSize({ width, height });
    await page.goto("/");
    await expect(page.getByRole("textbox", { name: "姓名", exact: true })).toBeVisible();
    await expect(page.getByLabel("身高（cm）", { exact: true })).not.toBeVisible();
    await expect(page.getByRole("button", { name: "踏入仙途", exact: true })).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await creationSettings(page);
    await expect(page.getByLabel("身高（cm）", { exact: true })).toBeVisible();
    await expect(page.getByRole("combobox", { name: "胸围", exact: true })).toHaveValue("C");
    await page.getByRole("radio", { name: "男", exact: true }).check();
    await expect(page.getByRole("combobox", { name: "胸围", exact: true })).toHaveCount(0);
    await expect(page.locator(".creation-form .save-footnote")).toHaveText("创角草稿已保存");
    await page.reload();
    await creationSettings(page);
    await expect(page.getByRole("radio", { name: "男", exact: true })).toBeChecked();
    await page.getByRole("radio", { name: "女", exact: true }).check();
    await expect(page.getByRole("combobox", { name: "胸围", exact: true })).toHaveValue("C");
    await expect(page.getByRole("button", { name: "随机生成立绘", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "重掷", exact: true })).toBeVisible();
  }
});
test("player body and generated asset persist; NPC adoption saves through Worker without progressing world", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const image = await fixture();
  // Image response and model readiness are fixtures; cache, draft, Worker and durable save remain real.
  const subjects: any[] = [];
  await page.route("**/api/portraits", (route) => {
    subjects.push(route.request().postDataJSON().subject);
    return route.fulfill({ json: { image } });
  });
  await page.goto("/");
  await expect(page.locator(".creation-form, .game-shell, .recovery-screen")).toBeVisible();
  if (await page.locator(".creation-more").count()) await creationSettings(page);
  await page.getByLabel("身高（cm）", { exact: true }).fill("172");
  const bust = page.getByRole("combobox", { name: "胸围", exact: true });
  await expect(bust.locator("option:not([disabled])")).toHaveText(["A", "B", "C", "D", "E"]);
  await bust.selectOption("E");
  const features = "月白长裤，棉袜和平底靴，袖口绣着银色云纹";
  await expect(page.locator(".portrait-features input")).toHaveCount(1);
  await page.getByRole("textbox", { name: "立绘特征", exact: true }).fill(features);
  await expect(page.locator(".creation-form .save-footnote")).toHaveText("创角草稿已保存");
  await page.reload();
  await expect(page.locator(".creation-form, .game-shell, .recovery-screen")).toBeVisible();
  if (await page.locator(".creation-more").count()) await creationSettings(page);
  await expect(bust).toHaveValue("E");
  await expect(page.getByRole("textbox", { name: "立绘特征", exact: true })).toHaveValue(features);
  await page.getByRole("button", { name: "随机生成立绘", exact: true }).click();
  await page.getByRole("button", { name: "采用新立绘", exact: true }).click();
  await expect(page.locator(".fullbody-frame img")).toBeVisible();
  const createdImage = await page
    .locator(".fullbody-frame img")
    .evaluate(async (img: HTMLImageElement) =>
      Array.from(new Uint8Array(await (await fetch(img.src)).arrayBuffer())),
    );
  expect(subjects[0].portraitFeatures).toEqual(features);
  expect(subjects[0].physique.bustCup).toBe("E");
  await create(page);
  const first = await saved(page);
  expect(first.profile.physique.heightCm).toBe(172);
  expect(first.profile.physique.bustCup).toBe("E");
  expect(first.player.physique).toEqual(first.profile.physique);
  expect(first.profile.portraitFeatures).toEqual(features);
  expect(first.player.portraitId).toMatch(/^[a-f0-9]{64}$/);
  expect(first.profile.portraitId).toBe(first.player.portraitId);
  await expect(page.locator(".status-avatar img")).toBeVisible();
  await page.locator(".status-avatar").click();
  const playerViewer = page.locator(".image-viewer");
  await expect(playerViewer.getByRole("heading")).toHaveText("立绘修士的全身立绘");
  await expect(playerViewer.locator("img")).toHaveAttribute("src", /^blob:/);
  expect(
    await playerViewer
      .locator("img")
      .evaluate(async (img: HTMLImageElement) =>
        Array.from(new Uint8Array(await (await fetch(img.src)).arrayBuffer())),
      ),
  ).toEqual(createdImage);
  await expect(page.locator(".profile-modal")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(playerViewer).toHaveCount(0);
  await expect(page.locator(".status-profile")).toBeFocused();
  expect(await saved(page)).toEqual(first);
  await page.reload();
  await expect(page.locator(".creation-form, .game-shell, .recovery-screen")).toBeVisible();
  if (await page.locator(".creation-more").count()) await creationSettings(page);
  await expect(page.getByRole("heading", { name: "立绘修士", exact: true })).toBeVisible();
  expect(await saved(page)).toEqual(first);
  await page.getByRole("tab", { name: "人物", exact: true }).click();
  await page.getByRole("button", { name: "查看全部人物", exact: true }).click();
  await page.getByRole("searchbox", { name: "搜索姓名", exact: true }).fill("林晚");
  await page.locator(".person-row").filter({ hasText: "林晚" }).click();
  const dialog = page.getByRole("dialog", { name: "林晚", exact: true });
  await dialog.getByRole("tab", { name: "立绘", exact: true }).click();
  await expect(dialog.getByLabel("体貌资料")).toContainText("身高");
  await expect(dialog.getByLabel("体貌资料")).toContainText("胸 / 腰 / 臀");
  const before = await saved(page);
  await dialog.getByRole("button", { name: "重新绘制立绘", exact: true }).click();
  await dialog.getByRole("button", { name: "生成新立绘", exact: true }).click();
  await dialog.getByRole("button", { name: "采用新立绘", exact: true }).click();
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
test("legacy portrait features import into one editable field and preserve empty input", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".creation-form, .game-shell, .recovery-screen")).toBeVisible();
  if (await page.locator(".creation-more").count()) await creationSettings(page);
  await expect(page.getByRole("textbox", { name: "姓名", exact: true })).toBeVisible();
  await page.getByLabel("选择创角草稿", { exact: true }).setInputFiles({
    name: "legacy-draft.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        format: "xiantu-creation-draft-1",
        draft: {
          version: 1,
          revision: 0,
          seed: 12345,
          roll: 0,
          contentLocks: [],
          profile: {
            name: "旧草稿修士",
            sex: "female",
            aptitude: 55,
            artifact: "focus",
            mode: "simple",
            appearance: { face: 0, hair: 0, color: 0 },
            portraitFeatures: ["月白长裤", "棉袜", "平底靴"],
          },
        },
      }),
    ),
  });
  const input = page.getByRole("textbox", { name: "立绘特征", exact: true });
  await expect(page.locator(".portrait-features input")).toHaveCount(1);
  await expect(input).toHaveValue("月白长裤 · 棉袜 · 平底靴");
  await page.reload();
  await expect(page.locator(".creation-form, .game-shell, .recovery-screen")).toBeVisible();
  if (await page.locator(".creation-more").count()) await creationSettings(page);
  await expect(input).toHaveValue("月白长裤 · 棉袜 · 平底靴");
  await input.fill("");
  await expect(page.locator(".creation-form .save-footnote")).toHaveText("创角草稿已保存");
  await page.reload();
  await expect(page.locator(".creation-form, .game-shell, .recovery-screen")).toBeVisible();
  if (await page.locator(".creation-more").count()) await creationSettings(page);
  await expect(input).toHaveValue("");
  expect(await saved(page)).toBeUndefined();
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
  await expect(page.locator(".creation-form, .game-shell, .recovery-screen")).toBeVisible();
  if (await page.locator(".creation-more").count()) await creationSettings(page);
  await page.getByRole("button", { name: "随机生成立绘", exact: true }).click();
  await page.locator(".portrait-features input").first().fill("月白长裤");
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
  await create(page, false);
  expect((await saved(page)).player.portraitId).toBeUndefined();
  expect((await saved(page)).day).toBe(0);
});
test("unconfigured image service gives an actionable setup message without creating a world", async ({
  page,
}) => {
  // Readiness was available, but the supplier rejects generation; the UI must retain a setup path.
  await page.route("**/api/portraits", (route) =>
    route.fulfill({
      status: 409,
      json: { error: "请先打开「AI 模型设置 → 生图模型」，填写配置、启用并保存。" },
    }),
  );
  await page.goto("/");
  await expect(page.locator(".creation-form, .game-shell, .recovery-screen")).toBeVisible();
  if (await page.locator(".creation-more").count()) await creationSettings(page);
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
  await expect(page.locator(".creation-form, .game-shell, .recovery-screen")).toBeVisible();
  if (await page.locator(".creation-more").count()) await creationSettings(page);
  await expect(page.locator(".fullbody-frame img")).toHaveCount(0);
  await create(page);
  await page.getByRole("button", { name: "存档与设置", exact: true }).click();
  await expect(
    page.getByRole("complementary", { name: "离线与安装" }).getByRole("status"),
  ).toHaveText("固定剧情离线内容已缓存");
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await dismissPanels(page);
  const before = await saved(page);
  await page.getByRole("tab", { name: "人物", exact: true }).click();
  await page.getByRole("button", { name: "查看全部人物", exact: true }).click();
  await page.getByRole("searchbox", { name: "搜索姓名", exact: true }).fill("林晚");
  await page.locator(".person-row").filter({ hasText: "林晚" }).click();
  let dialog = page.getByRole("dialog", { name: "林晚", exact: true });
  await dialog.getByRole("tab", { name: "立绘", exact: true }).click();
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
  await expect(page.locator(".creation-form, .game-shell, .recovery-screen")).toBeVisible();
  if (await page.locator(".creation-more").count()) await creationSettings(page);
  await expect(page.getByRole("heading", { name: "立绘修士", exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "人物", exact: true }).click();
  await page.getByRole("button", { name: "查看全部人物", exact: true }).click();
  await page.getByRole("searchbox", { name: "搜索姓名", exact: true }).fill("林晚");
  await page.locator(".person-row").filter({ hasText: "林晚" }).click();
  dialog = page.getByRole("dialog", { name: "林晚", exact: true });
  await dialog.getByRole("tab", { name: "立绘", exact: true }).click();
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

test("redraw shares creation fields, previews before saving, and keeps either bundled or previously generated originals", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const images = [
    await fixture(),
    `data:image/png;base64,${(
      await sharp({ create: { width: 640, height: 960, channels: 4, background: "#b7a06c" } })
        .png()
        .toBuffer()
    ).toString("base64")}`,
  ];
  const requests: any[] = [];
  await page.route("**/api/portraits", (route) => {
    requests.push(route.request().postDataJSON().subject);
    return route.fulfill({ json: { image: images[requests.length % images.length] } });
  });
  await page.goto("/");
  await expect(page.locator(".creation-form, .game-shell, .recovery-screen")).toBeVisible();
  if (await page.locator(".creation-more").count()) await creationSettings(page);
  await expect(page.getByRole("textbox", { name: "姓名", exact: true })).toBeVisible();
  // Capture the actual creation controls; redraw must present the same options.
  const options: Record<string, string[]> = {};
  for (const name of ["容貌", "发式", "服饰主色", "身材"])
    options[name] = await page
      .getByRole("radiogroup", { name: name === "容貌" ? "外貌" : name, exact: true })
      .getByRole("radio")
      .evaluateAll((els) => els.map((el) => el.getAttribute("aria-label")!));
  await create(page);
  await openLin(page);
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("tab", { name: "立绘", exact: true }).click();
  const before = await saved(page);
  const actor = before.npcs.find((a: any) => a.id === "NPC_LIN_WAN");
  const originalUrl = await dialog.locator(".fullbody-frame img").getAttribute("src");
  await dialog.getByRole("button", { name: "重新绘制立绘", exact: true }).click();
  const editor = dialog.getByRole("region", { name: "重新绘制形貌" });
  await expect(editor).toBeFocused();
  for (const name of Object.keys(options)) {
    expect(
      await editor
        .getByRole("radiogroup", { name, exact: true })
        .getByRole("radio")
        .evaluateAll((els) => els.map((el) => el.getAttribute("aria-label")!)),
    ).toEqual(options[name]);
    await editor.getByRole("radiogroup", { name, exact: true }).getByRole("radio").nth(1).check();
  }
  await expect(editor.getByLabel("身高（cm）", { exact: true })).toHaveValue(
    String(actor.physique.heightCm),
  );
  await editor.getByLabel("身高（cm）", { exact: true }).fill("180");
  await editor.getByRole("combobox", { name: "胸围", exact: true }).selectOption("D");
  await dialog.getByRole("textbox", { name: "立绘特征", exact: true }).fill("墨绿长裤与银色平底靴");
  expect(await saved(page)).toEqual(before);
  // Both desktop and narrow mobile layouts retain every form control and original option.
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await editor.scrollIntoViewIfNeeded();
    await expect
      .poll(() =>
        dialog.evaluate(
          (el) =>
            el.scrollWidth <= el.clientWidth &&
            el.getBoundingClientRect().left >= 0 &&
            el.getBoundingClientRect().right <= innerWidth,
        ),
      )
      .toBe(true);
    await dialog.screenshot({ path: `/tmp/xiantu-redraw-fields-${width}.png` });
  }
  await dialog.getByRole("button", { name: "生成新立绘", exact: true }).click();
  const preview = dialog.getByRole("img", { name: "林晚的新立绘预览", exact: true });
  await expect(preview).toBeVisible();
  expect(requests[0].physique.heightCm).toBe(180);
  expect(requests[0].physique.bustCup).toBe("D");
  expect(requests[0].appearance).toEqual({ face: 1, hair: 1, color: 1 });
  expect(requests[0].portraitFeatures).toBe("墨绿长裤与银色平底靴");
  expect(await saved(page)).toEqual(before);
  await expect(
    dialog.locator(".portrait-studio").getByRole("img", { name: "林晚的全身立绘", exact: true }),
  ).toHaveAttribute("src", originalUrl!);
  await dialog.getByRole("button", { name: "保留原立绘", exact: true }).click();
  await expect(preview).toHaveCount(0);
  expect(await saved(page)).toEqual(before);
  await page.keyboard.press("Escape");
  await page.reload();
  await expect(page.locator(".creation-form, .game-shell, .recovery-screen")).toBeVisible();
  if (await page.locator(".creation-more").count()) await creationSettings(page);
  expect(await saved(page)).toEqual(before);
  await openLin(page);
  await dialog.getByRole("tab", { name: "立绘", exact: true }).click();
  await dialog.getByRole("button", { name: "重新绘制立绘", exact: true }).click();
  await expect(dialog.getByLabel("身高（cm）", { exact: true })).toHaveValue(
    String(actor.physique.heightCm),
  );
  await dialog.getByLabel("身高（cm）", { exact: true }).fill("178");
  await dialog.getByRole("combobox", { name: "胸围", exact: true }).selectOption("B");
  await dialog.getByRole("textbox", { name: "立绘特征", exact: true }).fill("青衣长裙与月白披帛");
  await dialog.getByRole("button", { name: "生成新立绘", exact: true }).click();
  await expect(preview).toBeVisible();
  await dialog
    .locator(".portrait-comparison")
    .screenshot({ path: "/tmp/xiantu-redraw-comparison.png" });
  const generatedCount = requests.length;
  for (const figure of await dialog.locator(".portrait-comparison figure").all()) {
    const imageSource = await figure.locator("img").getAttribute("src");
    const opener = figure.getByRole("button");
    await opener.click();
    const viewer = page.locator(".image-viewer");
    await expect(viewer).toBeVisible();
    await expect(viewer.locator("img")).toHaveAttribute("src", imageSource!);
    await expect(viewer.getByRole("button", { name: "关闭", exact: true })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(viewer).toHaveCount(0);
    await expect(opener).toBeFocused();
    expect(await saved(page)).toEqual(before);
  }
  expect(requests).toHaveLength(generatedCount);
  expect(await saved(page)).toEqual(before);
  await dialog.getByRole("button", { name: "采用新立绘", exact: true }).click();
  await expect.poll(async () => (await saved(page)).revision).toBe(before.revision + 1);
  const adopted = await saved(page);
  const next = adopted.npcs.find((a: any) => a.id === actor.id);
  expect(next.physique.heightCm).toBe(178);
  expect(next.physique.bustCup).toBe("B");
  expect(next.portraitFeatures).toBe("青衣长裙与月白披帛");
  expect(next.portraitId).toMatch(/^[a-f0-9]{64}$/);
  expect(adopted.day).toBe(before.day);
  expect(adopted.rng).toEqual(before.rng);
  expect(adopted.events).toEqual(before.events);
  expect(adopted.relations).toEqual(before.relations);
  const imageBytes = () =>
    dialog
      .locator(".portrait-studio")
      .getByRole("img", { name: "林晚的全身立绘", exact: true })
      .evaluate(async (img: HTMLImageElement) =>
        Array.from(new Uint8Array(await (await fetch(img.src)).arrayBuffer())),
      );
  const oldBytes = await imageBytes();
  // Fill only the cosmetic cache. Generating a preview must pin the current image
  // instead of evicting it as the oldest entry when the cache reaches its cap.
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open("xiantu-portrait-assets");
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction("images", "readwrite");
        tx.objectStore("images").put({
          id: "f".repeat(64),
          blob: new Blob([new Uint8Array(48 * 1024 * 1024)]),
          signature: "cache-cap-fixture",
          savedAt: Date.now() + 100000,
        });
        tx.oncomplete = () => resolve();
        tx.onabort = () => reject(tx.error);
      });
    } finally {
      db.close();
    }
  });
  await dialog.getByRole("button", { name: "重新绘制立绘", exact: true }).click();
  await expect(dialog.getByLabel("身高（cm）", { exact: true })).toHaveValue("178");
  await dialog.getByLabel("身高（cm）", { exact: true }).fill("165");
  await dialog.getByRole("button", { name: "生成新立绘", exact: true }).click();
  await expect(preview).toBeVisible();
  await dialog.getByRole("button", { name: "保留原立绘", exact: true }).click();
  expect(await saved(page)).toEqual(adopted);
  expect(await imageBytes()).toEqual(oldBytes);
  await page.keyboard.press("Escape");
  await page.reload();
  await expect(page.locator(".creation-form, .game-shell, .recovery-screen")).toBeVisible();
  if (await page.locator(".creation-more").count()) await creationSettings(page);
  await expect(page.locator(".status-profile")).toBeVisible();
  expect(await saved(page)).toEqual(adopted);
  await openLin(page);
  await dialog.getByRole("tab", { name: "立绘", exact: true }).click();
  const requestCount = requests.length;
  await dialog.getByRole("button", { name: "恢复原立绘", exact: true }).click();
  await expect.poll(async () => (await saved(page)).revision).toBe(adopted.revision + 1);
  const restored = await saved(page);
  const restoredActor = restored.npcs.find((a: any) => a.id === actor.id);
  const { portraitOriginal, ...restoredIdentity } = restoredActor;
  expect(restoredIdentity).toEqual(actor);
  expect(restored.day).toBe(before.day);
  expect(restored.rng).toEqual(before.rng);
  expect(restored.events).toEqual(before.events);
  expect(restored.relations).toEqual(before.relations);
  expect(requests.length).toBe(requestCount);
  await expect(dialog.locator(".portrait-studio .fullbody-frame img")).toHaveAttribute(
    "src",
    originalUrl!,
  );
  await expect(dialog.getByRole("button", { name: "恢复原立绘", exact: true })).toBeDisabled();
  await dialog.screenshot({ path: "/tmp/xiantu-restored-npc-320.png" });
  await page.keyboard.press("Escape");
  await page.reload();
  await expect(page.locator(".creation-form, .game-shell, .recovery-screen")).toBeVisible();
  if (await page.locator(".creation-more").count()) await creationSettings(page);
  await expect(page.locator(".status-profile")).toBeVisible();
  expect(await saved(page)).toEqual(restored);
  expect(errors).toEqual([]);
});

test("closing or cancelling an NPC redraw cannot adopt a late result, and male redraw omits the cup field", async ({
  page,
}) => {
  const image = await fixture();
  let release!: () => void;
  let arrived!: () => void;
  let arrival = new Promise<void>((resolve) => {
    arrived = resolve;
  });
  let response = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/portraits", async (route) => {
    arrived();
    await response;
    await route.fulfill({ json: { image } }).catch(() => {});
  });
  await page.goto("/");
  await expect(page.locator(".creation-form, .game-shell, .recovery-screen")).toBeVisible();
  if (await page.locator(".creation-more").count()) await creationSettings(page);
  await create(page);
  const before = await saved(page);
  await openLin(page);
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("tab", { name: "立绘", exact: true }).click();
  await dialog.getByRole("button", { name: "重新绘制立绘", exact: true }).click();
  await dialog.getByRole("button", { name: "生成新立绘", exact: true }).click();
  await arrival;
  await dialog.getByRole("button", { name: "保留原立绘", exact: true }).click();
  release();
  await expect(dialog.getByRole("region", { name: "重新绘制形貌" })).toHaveCount(0);
  expect(await saved(page)).toEqual(before);
  arrival = new Promise<void>((resolve) => {
    arrived = resolve;
  });
  response = new Promise<void>((resolve) => {
    release = resolve;
  });
  await dialog.getByRole("button", { name: "重新绘制立绘", exact: true }).click();
  await dialog.getByRole("button", { name: "生成新立绘", exact: true }).click();
  await arrival;
  await page.keyboard.press("Escape");
  release();
  await page.reload();
  await expect(page.locator(".creation-form, .game-shell, .recovery-screen")).toBeVisible();
  if (await page.locator(".creation-more").count()) await creationSettings(page);
  await expect(page.locator(".status-profile")).toBeVisible();
  expect(await saved(page)).toEqual(before);
  await page.getByRole("tab", { name: "人物", exact: true }).click();
  await page.getByRole("button", { name: "查看全部人物", exact: true }).click();
  await page
    .getByRole("combobox", { name: "人物范围", exact: true })
    .selectOption({ label: "同城" });
  await page.getByRole("searchbox", { name: "搜索姓名", exact: true }).fill("周安");
  await page
    .locator(".person-row")
    .filter({ has: page.getByRole("heading", { name: /^周安/ }) })
    .click();
  await dialog.getByRole("tab", { name: "立绘", exact: true }).click();
  await dialog.getByRole("button", { name: "重新绘制立绘", exact: true }).click();
  await expect(dialog.getByLabel("身高（cm）", { exact: true })).toBeVisible();
  await expect(dialog.getByRole("combobox", { name: "胸围", exact: true })).toHaveCount(0);
  expect(await saved(page)).toEqual(before);
});

test("player restoration recovers the created portrait and look after reload; missing original image preserves the current save", async ({
  page,
}) => {
  test.setTimeout(60000);
  const firstImage = await fixture();
  const nextImage = `data:image/png;base64,${(
    await sharp({ create: { width: 640, height: 960, channels: 4, background: "#445533" } })
      .png()
      .toBuffer()
  ).toString("base64")}`;
  let requests = 0;
  await page.route("**/api/portraits", (route) =>
    route.fulfill({ json: { image: requests++ ? nextImage : firstImage } }),
  );
  await page.goto("/");
  await expect(page.locator(".creation-form, .game-shell, .recovery-screen")).toBeVisible();
  if (await page.locator(".creation-more").count()) await creationSettings(page);
  await page.getByRole("button", { name: "随机生成立绘", exact: true }).click();
  await page.getByRole("button", { name: "采用新立绘", exact: true }).click();
  await create(page);
  const original = await saved(page);
  const open = async () => {
    await page.locator(".status-profile h2").click();
    await page.getByRole("dialog").getByRole("tab", { name: "立绘", exact: true }).click();
  };
  await open();
  const dialog = page.getByRole("dialog");
  const imageBytes = () =>
    dialog
      .locator(".portrait-studio .fullbody-frame img")
      .evaluate(async (img: HTMLImageElement) =>
        Array.from(new Uint8Array(await (await fetch(img.src)).arrayBuffer())),
      );
  const bytes = await imageBytes();
  await dialog.getByRole("button", { name: "重新绘制立绘", exact: true }).click();
  await expect(dialog.getByRole("region", { name: "重新绘制形貌" })).toBeFocused();
  await dialog.getByLabel("身高（cm）", { exact: true }).fill("182");
  await dialog.getByRole("combobox", { name: "胸围", exact: true }).selectOption("D");
  await dialog.getByRole("button", { name: "生成新立绘", exact: true }).click();
  await dialog.getByRole("button", { name: "采用新立绘", exact: true }).click();
  await expect.poll(async () => (await saved(page)).revision).toBe(original.revision + 1);
  const adopted = await saved(page);
  expect(adopted.player.portraitOriginal.portraitId).toBe(original.player.portraitId);
  await page.keyboard.press("Escape");
  await page.reload();
  await expect(page.locator(".creation-form, .game-shell, .recovery-screen")).toBeVisible();
  if (await page.locator(".creation-more").count()) await creationSettings(page);
  await expect(page.locator(".status-profile")).toBeVisible();
  await open();
  // Missing local artwork must not discard the successfully adopted replacement.
  const cache = async (remove: boolean) =>
    page.evaluate(
      async ({ id, remove }) => {
        const db = await new Promise<IDBDatabase>((resolve) => {
          const q = indexedDB.open("xiantu-portrait-assets");
          q.onsuccess = () => resolve(q.result);
        });
        try {
          await new Promise<void>((resolve, reject) => {
            const tx = db.transaction("images", "readwrite"),
              store = tx.objectStore("images");
            if (remove) {
              const q = store.get(id);
              q.onsuccess = () => {
                (window as any).__portraitOriginal = q.result;
                store.delete(id);
              };
            } else store.put((window as any).__portraitOriginal);
            tx.oncomplete = () => resolve();
            tx.onabort = () => reject(tx.error);
          });
        } finally {
          db.close();
        }
      },
      { id: original.player.portraitId, remove },
    );
  await cache(true);
  await dialog.getByRole("button", { name: "恢复原立绘", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("未保存原立绘图片");
  expect(await saved(page)).toEqual(adopted);
  await cache(false);
  await page.setViewportSize({ width: 320, height: 900 });
  await dialog.getByRole("button", { name: "恢复原立绘", exact: true }).click();
  await expect.poll(async () => (await saved(page)).revision).toBe(adopted.revision + 1);
  const restored = await saved(page);
  expect(restored.profile).toEqual(original.profile);
  const { portraitOriginal, ...player } = restored.player;
  expect(player).toEqual(original.player);
  expect(restored.npcs).toEqual(original.npcs);
  for (const key of ["day", "rng", "events", "knowledge", "relations"])
    expect(restored[key]).toEqual(original[key]);
  expect(await imageBytes()).toEqual(bytes);
  expect(requests).toBe(2);
  await expect(dialog.getByRole("button", { name: "恢复原立绘", exact: true })).toBeDisabled();
  await page.keyboard.press("Escape");
  await page.reload();
  await expect(page.locator(".creation-form, .game-shell, .recovery-screen")).toBeVisible();
  if (await page.locator(".creation-more").count()) await creationSettings(page);
  await expect(page.locator(".status-profile")).toBeVisible();
  expect(await saved(page)).toEqual(restored);
});
