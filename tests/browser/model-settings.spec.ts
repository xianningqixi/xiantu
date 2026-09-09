import { test, expect, type Page, type Locator } from "@playwright/test";
import { MODEL_PRESETS } from "../../lib/ai/model-settings";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
const keys = {
  llm: "fake-key-only-for-browser-test",
  image: "fake-image-key-only-for-browser-test",
};
const output = process.env.XIANTU_KEY_QA_OUTPUT || join(tmpdir(), "xiantu-key-only-qa");
const preview =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aSr8AAAAASUVORK5CYII=";

test.use({ serviceWorkers: "block" });
test.beforeEach(async ({ context }) => {
  // Private storage and configuration routes stay real; paid provider calls never leave the browser.
  await context.route("**/api/portraits", (route) =>
    route.fulfill({ status: 503, json: { error: "本用例不调用生图服务" } }),
  );
  await context.route("**/api/negotiation", (route) =>
    route.fulfill({ status: 503, json: { error: "本用例不调用交涉服务" } }),
  );
  await context.route("**/api/model-settings", async (route) => {
    const body = route.request().postDataJSON();
    if (body.action !== "test") return route.continue();
    expect(Object.keys(body.config).sort()).toEqual(["key", "revision"]);
    await route.fulfill({
      json:
        body.kind === "image"
          ? { message: "模拟生图成功", image: preview }
          : { message: "模拟连接成功" },
    });
  });
  await mkdir(output, { recursive: true });
});
async function open(page: Page, inGame = false) {
  if (inGame) await page.getByRole("button", { name: "存档与设置", exact: true }).click();
  const entry = inGame ? page : page.locator("header");
  await entry.getByRole("button", { name: "AI 模型设置", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "AI 模型设置", exact: true });
  await expect(dialog.getByRole("tab", { name: "LLM 文字模型", exact: true })).toBeVisible();
  return dialog;
}
async function world(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const q = indexedDB.open("xiantu-qingshi");
      q.onsuccess = () => resolve(q.result);
      q.onerror = () => reject(q.error);
    });
    try {
      return await new Promise<any>((resolve, reject) => {
        const tx = db.transaction("saves"),
          q = tx.objectStore("saves").get("current");
        tx.oncomplete = () => resolve(q.result);
        tx.onabort = () => reject(tx.error);
      });
    } finally {
      db.close();
    }
  });
}
async function read(page: Page) {
  const response = await page.request.post("/api/model-settings", {
    headers: { Origin: new URL(page.url()).origin },
    data: { action: "read" },
  });
  expect(response.ok()).toBe(true);
  const data = await response.json();
  expect(JSON.stringify(data)).not.toContain(keys.llm);
  expect(JSON.stringify(data)).not.toContain(keys.image);
  return data.models;
}
async function keyOnly(form: Locator, kind: "llm" | "image") {
  await expect(form.locator("input")).toHaveCount(1);
  await expect(
    form.locator("select, [role=switch], input[type=number], input[type=url]"),
  ).toHaveCount(0);
  await expect(form.getByLabel("API Key", { exact: true })).toHaveAttribute("type", "password");
  await expect(form).toContainText(MODEL_PRESETS[kind].model);
  await expect(form).toContainText(MODEL_PRESETS[kind].baseUrl);
  await expect(form).not.toContainText("高级选项");
}
async function saveKey(form: Locator, key: string) {
  await form.getByLabel("API Key", { exact: true }).fill(key);
  await form.getByRole("button", { name: "保存 Key", exact: true }).click();
  await expect(form.getByRole("status")).toContainText("Key 已保存");
  await expect(form.getByLabel("API Key", { exact: true })).toHaveValue("");
}
async function fullyVisible(locator: Locator, page: Page) {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  const viewport = page.viewportSize()!;
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height);
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
}
async function uncutForm(form: Locator) {
  const body = form.locator(".model-form-body");
  const size = await body.evaluate((element) => ({
    content: element.scrollHeight,
    visible: element.clientHeight,
  }));
  expect(size.content).toBeLessThanOrEqual(size.visible + 1);
}

test("key-only settings persist both models and clear only the confirmed key without touching the world", async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const submitted: object[] = [];
  page.on("request", (request) => {
    if (request.url().endsWith("/api/model-settings") && request.postDataJSON()?.action === "save")
      submitted.push(request.postDataJSON().config);
  });
  await page.goto("/");
  await expect(page).toHaveTitle(/仙途/);
  let dialog = await open(page);
  for (const kind of ["llm", "image"] as const) {
    await dialog
      .getByRole("tab", { name: kind === "llm" ? "LLM 文字模型" : "生图模型", exact: true })
      .click();
    const form = dialog.getByRole("form", {
      name: kind === "llm" ? "LLM 文字模型配置" : "生图模型配置",
      exact: true,
    });
    await keyOnly(form, kind);
    await saveKey(form, keys[kind]);
    await expect(dialog).toBeVisible();
    await fullyVisible(form.getByRole("button", { name: "保存 Key", exact: true }), page);
  }
  expect(submitted).toHaveLength(2);
  for (const config of submitted) expect(Object.keys(config).sort()).toEqual(["key", "revision"]);
  const cookie = (await context.cookies()).find((cookie) => cookie.name === "xiantu_models")!;
  expect(cookie.httpOnly).toBe(true);
  expect(cookie.sameSite).toBe("Strict");
  const models = await read(page);
  for (const kind of ["llm", "image"] as const)
    expect(models[kind]).toMatchObject({
      ...MODEL_PRESETS[kind],
      enabled: true,
      hasKey: true,
      source: "personal",
      revision: 1,
    });
  expect(await world(page)).toBeUndefined();
  await page.reload();
  dialog = await open(page);
  const llmForm = dialog.getByRole("form", { name: "LLM 文字模型配置", exact: true });
  await expect(llmForm.getByLabel("API Key", { exact: true })).toHaveAttribute(
    "placeholder",
    /已保存/,
  );
  await saveKey(llmForm, "");
  await uncutForm(llmForm);
  await page.screenshot({ path: join(output, "desktop-key-only.png") });
  await page.keyboard.press("Escape");
  await page.getByRole("textbox", { name: "姓名", exact: true }).fill("密钥配置验收");
  await page.getByRole("button", { name: "踏入仙途", exact: true }).click();
  await expect(page.getByRole("tab", { name: "游历", exact: true })).toBeVisible();
  const before = await world(page);
  dialog = await open(page, true);
  await dialog.getByRole("tab", { name: "生图模型", exact: true }).click();
  await dialog.getByRole("button", { name: "清除生图模型 Key", exact: true }).click();
  await expect(page.getByRole("alertdialog")).toContainText("另一类模型和游戏存档不受影响");
  await page.getByRole("button", { name: "保留 Key", exact: true }).click();
  expect((await read(page)).image.hasKey).toBe(true);
  await dialog.getByRole("button", { name: "清除生图模型 Key", exact: true }).click();
  await page.getByRole("button", { name: "确认清除生图模型", exact: true }).click();
  await expect(dialog.getByRole("status")).toContainText("已清除个人 Key");
  expect((await read(page)).image).toMatchObject({ enabled: false, hasKey: false });
  expect((await read(page)).llm.hasKey).toBe(true);
  expect(await world(page)).toEqual(before);
  const browserState = await page.evaluate(() =>
    JSON.stringify({
      local: { ...localStorage },
      session: { ...sessionStorage },
      cookie: document.cookie,
    }),
  );
  for (const key of Object.values(keys)) {
    expect(browserState).not.toContain(key);
    expect(JSON.stringify(await world(page))).not.toContain(key);
  }
  expect(errors).toEqual([]);
});

test("separate browsers and stale key edits stay isolated", async ({ page, browser }) => {
  await page.goto("/");
  let dialog = await open(page);
  const form = dialog.getByRole("form", { name: "LLM 文字模型配置", exact: true });
  await saveKey(form, keys.llm);
  const other = await browser.newContext({ serviceWorkers: "block" });
  try {
    const tab = await other.newPage();
    await tab.goto(page.url());
    await open(tab);
    expect((await read(tab)).llm.source).not.toBe("personal");
    const same = await page.context().newPage();
    await same.goto(page.url());
    await open(same);
    await saveKey(form, "fake-replacement-key");
    await same.getByRole("button", { name: "保存 Key", exact: true }).click();
    await expect(same.getByRole("alert")).toContainText("另一页面");
    await same.getByRole("button", { name: "重新读取", exact: true }).click();
    dialog = same.getByRole("dialog", { name: "AI 模型设置", exact: true });
    const current = dialog.getByRole("form", { name: "LLM 文字模型配置", exact: true });
    await expect(current.getByLabel("API Key", { exact: true })).toHaveAttribute(
      "placeholder",
      /已保存/,
    );
    await saveKey(current, "");
    expect((await read(same)).llm.revision).toBe(3);
    await same.close();
  } finally {
    await other.close();
  }
});

test("mobile key-only settings validate empty input and discard cancelled mock test results", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  let delayed = false;
  await page.route("**/api/model-settings", async (route) => {
    const body = route.request().postDataJSON();
    if (body.action !== "test") return route.fallback();
    expect(Object.keys(body.config).sort()).toEqual(["key", "revision"]);
    if (delayed) await new Promise((resolve) => setTimeout(resolve, 700));
    await route
      .fulfill({
        json:
          body.kind === "image"
            ? { message: "模拟生图成功", image: preview }
            : { message: "模拟连接成功" },
      })
      .catch(() => {});
  });
  await page.goto("/");
  const dialog = await open(page);
  const form = dialog.getByRole("form", { name: "LLM 文字模型配置", exact: true });
  await keyOnly(form, "llm");
  await form.getByRole("button", { name: "保存 Key", exact: true }).click();
  await expect(form.getByRole("alert")).toContainText("请填写自己的 API Key");
  await expect(form.getByLabel("API Key", { exact: true })).toBeFocused();
  await form.getByLabel("API Key", { exact: true }).fill(keys.llm);
  await form.getByRole("button", { name: "测试连接", exact: true }).click();
  await expect(form.getByRole("status")).toContainText("模拟连接成功");
  expect((await read(page)).llm.source).not.toBe("personal");
  await saveKey(form, keys.llm);
  await fullyVisible(form.getByRole("button", { name: "保存 Key", exact: true }), page);
  await uncutForm(form);
  await page.screenshot({ path: join(output, "mobile-key-only.png") });
  await dialog.getByRole("tab", { name: "生图模型", exact: true }).click();
  const imageForm = dialog.getByRole("form", { name: "生图模型配置", exact: true });
  await keyOnly(imageForm, "image");
  await imageForm.getByLabel("API Key", { exact: true }).fill(keys.image);
  await imageForm.getByRole("button", { name: "测试生图（1 张）", exact: true }).click();
  await expect(dialog.getByRole("img", { name: "生图模型测试预览", exact: true })).toBeVisible();
  delayed = true;
  await imageForm.getByRole("button", { name: "测试生图（1 张）", exact: true }).click();
  await imageForm.getByRole("button", { name: "取消测试", exact: true }).click();
  await expect(imageForm.getByRole("status")).toContainText("已取消");
  await page.waitForTimeout(900);
  await expect(dialog.getByRole("img", { name: "生图模型测试预览", exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  expect(errors).toEqual([]);
});
