import { test, expect, type Page, type Locator } from "@playwright/test";
const llm = {
  baseUrl: "https://llm.provider.example/v1",
  model: "llm-config-test",
  key: "fake-key-only-for-browser-test",
};
const image = {
  baseUrl: "https://image.provider.example/v1",
  model: "image-config-test",
  key: "fake-image-key-only-for-browser-test",
};
async function fill(form: Locator, config: typeof llm) {
  await form.getByRole("switch").check();
  await form.getByLabel("服务地址（Base URL）", { exact: true }).fill(config.baseUrl);
  await form.getByLabel("模型 ID", { exact: true }).fill(config.model);
  await form.getByLabel("API Key", { exact: true }).fill(config.key);
}
async function open(page: Page, inGame = false) {
  if (inGame) await page.getByRole("button", { name: "存档与设置", exact: true }).click();
  await page.getByRole("button", { name: "AI 模型设置", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "AI 模型设置", exact: true });
  await expect(dialog.getByRole("tab", { name: "LLM 文字模型", exact: true })).toBeVisible();
  return dialog;
}
async function world(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const q = indexedDB.open("xiantu-qingshi");
      q.onsuccess = () => resolve(q.result);
    });
    try {
      return await new Promise<any>((resolve) => {
        const tx = db.transaction("saves");
        const q = tx.objectStore("saves").get("current");
        tx.oncomplete = () => resolve(q.result);
      });
    } finally {
      db.close();
    }
  });
}

test("creation and game settings expose independent persistent LLM and image configuration without putting keys in saves", async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page).toHaveTitle(/仙途/);
  let dialog = await open(page);
  const textForm = dialog.getByRole("form", { name: "LLM 文字模型配置", exact: true });
  await fill(textForm, llm);
  await textForm.getByRole("button", { name: "保存配置", exact: true }).click();
  await expect(textForm.getByRole("status")).toContainText("配置已保存");
  await expect(textForm.getByLabel("API Key", { exact: true })).toHaveValue("");
  await dialog.getByRole("tab", { name: "生图模型", exact: true }).click();
  const imageForm = dialog.getByRole("form", { name: "生图模型配置", exact: true });
  await fill(imageForm, image);
  await imageForm.getByRole("button", { name: "保存配置", exact: true }).click();
  await expect(imageForm.getByRole("status")).toContainText("配置已保存");
  const cookie = (await context.cookies()).find((cookie) => cookie.name === "xiantu_models")!;
  expect(cookie.httpOnly).toBe(true);
  expect(cookie.sameSite).toBe("Strict");
  const response = await page.request.post("/api/model-settings", {
    headers: { Origin: new URL(page.url()).origin },
    data: { action: "read" },
  });
  const metadata = await response.text();
  expect(metadata).not.toContain(llm.key);
  expect(metadata).not.toContain(image.key);
  expect(metadata).toContain(image.model);
  await page.reload();
  dialog = await open(page);
  await expect(dialog.getByRole("tabpanel").getByLabel("模型 ID", { exact: true })).toHaveValue(
    llm.model,
  );
  await expect(dialog.getByRole("tabpanel").getByLabel("API Key", { exact: true })).toHaveValue("");
  await expect(dialog.getByRole("tabpanel").getByLabel("API Key", { exact: true })).toHaveAttribute(
    "placeholder",
    /已保存/,
  );
  await page.keyboard.press("Escape");
  await page.getByRole("textbox", { name: "姓名", exact: true }).fill("模型配置验收");
  await page.getByRole("button", { name: "踏入仙途", exact: true }).click();
  await expect(page.getByRole("heading", { name: "模型配置验收", exact: true })).toBeVisible();
  const before = await world(page);
  dialog = await open(page, true);
  await dialog.getByRole("tab", { name: "生图模型", exact: true }).click();
  await expect(dialog.getByRole("tabpanel").getByLabel("模型 ID", { exact: true })).toHaveValue(
    image.model,
  );
  await dialog.getByRole("button", { name: "清除个人配置并关闭", exact: true }).click();
  await expect(dialog.getByRole("status")).toContainText("已清除");
  await dialog.getByRole("tab", { name: "LLM 文字模型", exact: true }).click();
  await expect(dialog.getByRole("tabpanel").getByLabel("模型 ID", { exact: true })).toHaveValue(
    llm.model,
  );
  expect(await world(page)).toEqual(before);
  const browserState = await page.evaluate(() =>
    JSON.stringify({
      local: { ...localStorage },
      session: { ...sessionStorage },
      cookie: document.cookie,
    }),
  );
  expect(browserState).not.toContain(llm.key);
  expect(browserState).not.toContain(image.key);
  expect(JSON.stringify(await world(page))).not.toContain(llm.key);
  expect(errors).toEqual([]);
});

test("different browsers and stale configuration revisions remain isolated", async ({
  page,
  browser,
}) => {
  await page.goto("/");
  await open(page);
  const form = page.getByRole("form", { name: "LLM 文字模型配置", exact: true });
  await fill(form, llm);
  await form.getByRole("button", { name: "保存配置", exact: true }).click();
  await expect(form.getByRole("status")).toContainText("已保存");
  const other = await browser.newContext();
  try {
    const tab = await other.newPage();
    await tab.goto(page.url());
    await open(tab);
    await expect(
      tab
        .getByRole("form", { name: "LLM 文字模型配置", exact: true })
        .getByLabel("模型 ID", { exact: true }),
    ).not.toHaveValue(llm.model);
    const same = await page.context().newPage();
    await same.goto(page.url());
    await open(same);
    await form.getByLabel("模型 ID", { exact: true }).fill("updated-model");
    await form.getByRole("button", { name: "保存配置", exact: true }).click();
    await expect(form.getByRole("status")).toContainText("已保存");
    await same.getByRole("button", { name: "保存配置", exact: true }).click();
    await expect(same.getByRole("alert")).toContainText("另一页面");
    await same.getByRole("button", { name: "重新读取", exact: true }).click();
    await expect(
      same
        .getByRole("form", { name: "LLM 文字模型配置", exact: true })
        .getByLabel("模型 ID", { exact: true }),
    ).toHaveValue("updated-model");
    await same.close();
  } finally {
    await other.close();
  }
});

test("mobile model settings validate inputs, show test previews, and discard cancelled responses", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  // Only the paid provider test response is mocked. Reading, saving and validation use the real route.
  let delay = false;
  await page.route("**/api/model-settings", async (route) => {
    const body = route.request().postDataJSON();
    if (body.action !== "test") return route.continue();
    if (delay) await new Promise((resolve) => setTimeout(resolve, 700));
    await route.fulfill({
      json:
        body.kind === "image"
          ? {
              message: "测试图像已返回",
              image:
                "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aSr8AAAAASUVORK5CYII=",
            }
          : { message: "模型测试通过" },
    });
  });
  await page.goto("/");
  const dialog = await open(page);
  const form = dialog.getByRole("form", { name: "LLM 文字模型配置", exact: true });
  await fill(form, { ...llm, key: "" });
  await form.getByRole("button", { name: "保存配置", exact: true }).click();
  await expect(form.getByRole("alert")).toContainText("API Key");
  await form.getByLabel("API Key", { exact: true }).fill(llm.key);
  await form.getByRole("button", { name: "测试连接", exact: true }).click();
  await expect(form.getByRole("status")).toContainText("测试通过");
  await dialog.evaluate((element) => {
    element.scrollTop = 0;
  });
  await page.screenshot({ path: "/tmp/xiantu-ai-settings-mobile.png" });
  await dialog.getByRole("tab", { name: "生图模型", exact: true }).click();
  const imageForm = dialog.getByRole("form", { name: "生图模型配置", exact: true });
  await fill(imageForm, image);
  await imageForm.getByRole("button", { name: "测试生图（1 张）", exact: true }).click();
  await expect(dialog.getByRole("img", { name: "生图模型测试预览", exact: true })).toBeVisible();
  delay = true;
  await imageForm.getByRole("button", { name: "测试生图（1 张）", exact: true }).click();
  await imageForm.getByRole("button", { name: "取消测试", exact: true }).click();
  await expect(imageForm.getByRole("status")).toContainText("已取消");
  await page.waitForTimeout(900);
  await expect(dialog.getByRole("img", { name: "生图模型测试预览", exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  expect(errors).toEqual([]);
});
