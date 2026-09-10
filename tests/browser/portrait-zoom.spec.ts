import { test, expect, type Page, type Locator } from "@playwright/test";
import { saved, growTo, dismissPanels } from "./journey-controls";

test.beforeEach(async ({ page }) => {
  // Read-only viewing must work without any AI service or supplier request.
  await page.route("**/api/model-settings", (route) =>
    route.fulfill({ json: { models: { llm: { enabled: false }, image: { enabled: false } } } }),
  );
  await page.route("**/api/portraits", (route) => route.abort());
});

async function create(page: Page) {
  await page.goto("/author");
  await page.getByRole("textbox", { name: "姓名", exact: true }).fill("看图修士");
  await page.getByRole("button", { name: "踏入仙途", exact: true }).click();
  await expect(page.getByLabel("本机已存", { exact: true })).toBeVisible();
}

async function loaded(image: Locator) {
  await expect(image).toBeVisible();
  await expect
    .poll(() => image.evaluate((img: HTMLImageElement) => img.complete && img.naturalHeight > 0))
    .toBe(true);
}

async function closeViewer(page: Page, opener: Locator) {
  await page.keyboard.press("Escape");
  await expect(page.locator(".image-viewer")).toHaveCount(0);
  await expect(opener).toBeFocused();
}

test("speaker portrait enlarges directly, preserves the unknown name, and fits desktop/mobile", async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  let generated = 0;
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/portraits") generated++;
  });
  await create(page);
  const before = await saved(page);
  const speaker = page.locator(".dojo-speaker");
  const portrait = speaker.locator("[data-person-avatar]");
  const source = await portrait.locator("img").getAttribute("src");
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: width === 1440 ? 900 : 844 });
    await portrait.click();
    const viewer = page.locator(".image-viewer");
    await expect(viewer.getByRole("heading")).toHaveText("青白衣衫的女修的全身立绘");
    await expect(page.locator(".profile-modal")).toHaveCount(0);
    await expect(viewer.locator("img")).toHaveAttribute("src", source!);
    await loaded(viewer.locator("img"));
    const box = (await viewer.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width);
    expect(box.y + box.height).toBeLessThanOrEqual(width === 1440 ? 900 : 844);
    await expect.poll(() => viewer.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    expect(await viewer.locator("img").evaluate((el) => getComputedStyle(el).objectFit)).toBe(
      "contain",
    );
    await page.screenshot({
      path: testInfo.outputPath(`portrait-${width}.png`),
      animations: "disabled",
    });
    await closeViewer(page, speaker);
    expect(await saved(page)).toEqual(before);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await speaker.locator("span:not(.npc-portrait)").last().click();
  await expect(page.locator(".profile-modal")).toBeVisible();
  const profile = page.locator(".profile-modal");
  await profile.getByRole("tab", { name: "经历", exact: true }).click();
  const avatar = profile.locator(".sheet-portrait-link");
  await avatar.focus();
  await page.keyboard.press("Enter");
  await loaded(page.locator(".image-viewer-image"));
  await closeViewer(page, avatar);
  await expect(profile.getByRole("tab", { name: "经历", exact: true })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await profile.getByRole("tab", { name: "立绘", exact: true }).click();
  const fullbody = profile.locator(".portrait-expand");
  await fullbody.click();
  await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
  await expect(
    page.locator(".image-viewer").getByRole("button", { name: "关闭", exact: true }),
  ).toBeInViewport();
  await loaded(page.locator(".image-viewer-image"));
  await closeViewer(page, fullbody);
  await expect(profile.getByRole("tab", { name: "立绘", exact: true })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  expect(await saved(page)).toEqual(before);
  expect(generated).toBe(0);
  expect(errors).toEqual([]);
});

test("NPC list and relationship avatars enlarge the matching fullbody without replacing the open profile", async ({
  page,
}) => {
  test.setTimeout(120000);
  await create(page);
  await page.locator(".dojo-primary").click();
  await growTo(page, "QI_1");
  await dismissPanels(page);
  const before = await saved(page);
  await page.getByRole("tab", { name: "人物", exact: true }).click();
  await page.getByRole("button", { name: "查看全部人物", exact: true }).click();
  await page.getByRole("searchbox", { name: "搜索姓名", exact: true }).fill("林晚");
  const row = page.locator(".person-row").filter({ hasText: "林晚" });
  const avatarSource = await row.locator("img").getAttribute("src");
  await row.locator("[data-person-avatar]").click();
  const viewer = page.locator(".image-viewer");
  await expect(viewer.getByRole("heading")).toHaveText("林晚的全身立绘");
  await loaded(viewer.locator("img"));
  expect(await viewer.locator("img").getAttribute("src")).not.toBe(avatarSource);
  const originalSource = await viewer.locator("img").getAttribute("src");
  await expect(page.locator(".profile-modal")).toHaveCount(0);
  await closeViewer(page, row);
  await row.getByRole("heading").click();
  const profile = page.locator(".profile-modal");
  await expect(profile.getByRole("tab", { name: "属性", exact: true })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await page.keyboard.press("Escape");
  await expect(profile).toHaveCount(0);
  await page.locator(".status-profile h2").click();
  await profile.getByRole("tab", { name: "关系", exact: true }).click();
  const peer = profile.locator('[data-relation-peer="NPC_LIN_WAN"] .sheet-peer');
  await peer.locator("[data-person-avatar]").click();
  await loaded(viewer.locator("img"));
  await expect(viewer.locator("img")).toHaveAttribute("src", originalSource!);
  await closeViewer(page, peer);
  await expect(profile.locator("[data-character-id]")).toHaveAttribute(
    "data-character-id",
    "PLAYER",
  );
  await expect(profile.getByRole("tab", { name: "关系", exact: true })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  expect(await saved(page)).toEqual(before);
});

test("a player without artwork gets an empty viewer, never an NPC portrait", async ({ page }) => {
  await create(page);
  const before = await saved(page);
  expect(before.player.portraitId).toBeUndefined();
  await expect(page.locator(".status-avatar img")).toHaveCount(0);
  await page.locator(".status-avatar").click();
  const viewer = page.locator(".image-viewer");
  await expect(viewer.getByRole("heading")).toHaveText("看图修士的全身立绘");
  await expect(viewer.getByRole("status")).toContainText("暂时无法显示这张图片");
  await expect(viewer.locator("img")).toHaveCount(0);
  await viewer.getByRole("button", { name: "关闭", exact: true }).click();
  await expect(viewer).toHaveCount(0);
  await expect(page.locator(".status-profile")).toBeFocused();
  expect(await saved(page)).toEqual(before);
});
