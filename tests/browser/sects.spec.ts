import { growTo, answerDaily } from "./journey-controls";
import {
  openMore,
  openDrawerCategory,
  clickPaged,
  turnTo,
  dismissPanels,
} from "./journey-controls";
import { creationSettings } from "./journey-controls";
import { test, expect, type Page, type Locator } from "@playwright/test";
import { mkdirSync, readFileSync } from "node:fs";
import { openCurrentLocation, selectLocations, viewJournal } from "./journey-controls";
const B = JSON.parse(readFileSync("lib/game/content/balance.json", "utf8"));
const ACHIEVEMENTS = (readFileSync("lib/game/achievements.ts", "utf8").match(/^\s*id: "/gm) ?? [])
  .length;
const output = "/tmp/xiantu-sect-qa";
mkdirSync(output, { recursive: true });
async function saved(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const q = indexedDB.open("xiantu-qingshi");
      q.onsuccess = () => resolve(q.result);
      q.onerror = () => reject(q.error);
    });
    try {
      return await new Promise<any>((resolve, reject) => {
        const tx = db.transaction("saves");
        const q = tx.objectStore("saves").get("current");
        tx.oncomplete = () => resolve(q.result);
        tx.onabort = () => reject(tx.error);
      });
    } finally {
      db.close();
    }
  });
}
async function act(page: Page, button: Locator) {
  const before = await saved(page);
  await page.waitForTimeout(450);
  await turnTo(button);
  await button.click();
  await expect.poll(async () => (await saved(page)).revision).toBeGreaterThan(before.revision);
  await expect(page.getByLabel("本机已存", { exact: true })).toBeAttached();
  return saved(page);
}
async function create(page: Page) {
  await page.goto("/");
  await page.getByRole("textbox", { name: "姓名", exact: true }).fill("问道行人");
  await page.getByRole("button", { name: "踏入仙途", exact: true }).click();
  await expect(page.locator(".dojo")).toBeVisible();
  await expect(page.locator("[data-atlas-place]")).toHaveCount(0);
  await growTo(page, "QI_5");
}
async function travel(page: Page, place: string) {
  await selectLocations(page);
  const modal = page.locator("#atlas-page");
  await modal.locator(`[data-atlas-place="${place}"]`).click();
  // Compact layouts render the departure control in a portal outside #atlas-page.
  await act(page, page.locator(".atlas-go"));
  await expect(modal).not.toBeVisible();
  await openCurrentLocation(page);
  await answerDaily(page);
  await openDrawerCategory(page, "宗门");
}

test("three sect routes, contribution economy, NPC relationship choices and reload work through real UI", async ({
  page,
}) => {
  test.setTimeout(360000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await create(page);
  await growTo(page, "FOUNDATION_1");
  await travel(page, "atlas.wendao");
  const sect = page.getByRole("region", { name: "宗门修行" });
  await expect(sect).toContainText("全真派");
  const before = await saved(page);
  await act(page, sect.getByRole("button", { name: /拜访全真派/ }));
  expect((await saved(page)).npcs.length).toBe(before.npcs.length + 2);
  await clickPaged(sect.getByRole("button", { name: "申请加入全真派", exact: true }));
  expect((await saved(page)).player.sectMembership).toBeUndefined();
  await act(page, sect.getByRole("button", { name: /确认自愿入门/ }));
  const joined = await saved(page);
  await expect(sect).toContainText(
    `委托报酬：${B.sects.taskContribution} 贡献、${B.sects.taskStones} 灵石`,
  );
  for (let i = 0; i < 3; i++)
    await act(page, sect.getByRole("button", { name: /巡护山道救助行旅/ }));
  const paid = await saved(page);
  expect(paid.day).toBe(joined.day + 3 * B.sects.taskDays);
  expect(paid.player.stones).toBe(joined.player.stones + 3 * B.sects.taskStones);
  await act(page, sect.getByRole("button", { name: /研习心法/ }));
  await clickPaged(sect.getByRole("button", { name: /查看宁含章/ }));
  const sheet = page.locator('[data-character-id="SECT_QUAN_NING"]');
  await expect(sheet.getByRole("region", { name: "角色属性" })).toBeVisible();
  const original = await saved(page);
  await sheet.getByRole("tab", { name: "经历", exact: true }).click();
  await expect(sheet.getByRole("region", { name: "性与亲密经历" })).toContainText("仅呈现已记录");
  await sheet.getByRole("button", { name: "性与亲密经历", exact: true }).click();
  expect(await saved(page)).toEqual(original);
  await sheet.getByRole("tab", { name: "关系", exact: true }).click();
  await act(page, sheet.getByRole("button", { name: /^上前见礼/ }));
  await clickPaged(sheet.getByRole("button", { name: "相伴与道侣", exact: true }));
  const intimacy = page.getByRole("dialog", { name: /^与.*相处$/ });
  const bond = intimacy.getByRole("button", { name: /^结为道侣/ });
  await expect(bond).toBeDisabled();
  for (let i = 0; i < 4; i++) await act(page, intimacy.getByRole("button", { name: /^相伴交流/ }));
  await expect(bond).toBeEnabled();
  const beforeConfirm = await saved(page);
  await clickPaged(bond);
  expect(await saved(page)).toEqual(beforeConfirm);
  await act(page, intimacy.getByRole("button", { name: "我愿意，确认结为道侣", exact: true }));
  await intimacy.getByRole("button", { name: /^共度良宵/ }).click();
  await act(page, intimacy.getByRole("button", { name: "我愿意，确认共度良宵", exact: true }));
  await intimacy.getByRole("button", { name: /^道侣共修/ }).click();
  const methods = intimacy.getByRole("radiogroup", { name: "双修取舍" }),
    beforeDual = await saved(page);
  await expect(methods.getByRole("radio", { name: "既济" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await clickPaged(methods.getByRole("radio", { name: "采补" }));
  await expect(methods.getByRole("radio", { name: "采补" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  expect(await saved(page)).toEqual(beforeDual);
  await act(page, intimacy.getByRole("button", { name: "我愿意，确认道侣共修", exact: true }));
  await page.keyboard.press("Escape");
  await sheet.getByRole("tab", { name: "经历", exact: true }).click();
  await expect(sheet.getByRole("region", { name: "性与亲密经历" })).toContainText("3 条");
  await expect(sheet.locator(".sheet-memory").filter({ hasText: "采得" })).toHaveCount(1);
  await expect(sheet.locator(".sheet-memory")).toHaveCount(3);
  await sheet.screenshot({ path: `${output}/personal-history-desktop.png` });
  const final = await saved(page);
  await page.keyboard.press("Escape");
  await viewJournal(page);
  const codex = page.getByRole("dialog", { name: /查看全部历程/ });
  await codex.getByRole("button", { name: "亲密图鉴", exact: true }).click();
  const gallery = codex.getByRole("region", { name: "亲密图鉴" });
  await expect(gallery).toContainText("宁含章");
  await expect(gallery.locator(".sheet-memory")).toHaveCount(3);
  expect(await saved(page)).toEqual(final);
  await gallery.getByRole("radio", { name: "道侣共修", exact: true }).click();
  await expect(gallery.locator(".sheet-memory")).toHaveCount(1);
  await expect(gallery.locator(".sheet-memory")).toContainText("采得");
  await gallery.getByLabel("图鉴人物").selectOption("SECT_QUAN_NING");
  await expect(gallery.locator(".codex-person-block")).toHaveCount(1);
  await gallery.getByRole("radio", { name: "全部", exact: true }).click();
  await expect(gallery.locator(".sheet-memory")).toHaveCount(3);
  await codex.screenshot({ path: `${output}/intimacy-codex-desktop.png` });
  await codex.getByRole("button", { name: "成就", exact: true }).click();
  const board = codex.getByRole("region", { name: "成就" });
  await expect(board).toContainText("已达成");
  // The bond/night/dual just performed each unlock their own entry.
  for (const id of ["bond-1", "dual-1", "realm-qi3"]) {
    const row = board.locator(`[data-achievement-id="${id}"]`);
    await expect(row).toHaveClass(/done/);
  }
  await expect(board.locator('[data-achievement-id="day-365"]')).not.toHaveClass(/done/);
  await expect(board.locator('[data-achievement-id="dual-10"]')).not.toHaveClass(/done/);
  expect(await board.locator(".achievement-row.done").count()).toBeGreaterThanOrEqual(3);
  await board.getByRole("radio", { name: /^人情/ }).click();
  await expect(board.locator('[data-achievement-id="bond-1"]')).toHaveCount(1);
  await expect(board.locator('[data-achievement-id="day-365"]')).toHaveCount(0);
  await board.getByRole("radio", { name: "全部", exact: true }).click();
  await expect(board.locator(".achievement-row")).toHaveCount(ACHIEVEMENTS);
  await codex.screenshot({ path: `${output}/achievements-desktop.png` });
  const beforeBoard = await saved(page);
  await board.getByRole("radio", { name: /^修行/ }).click();
  expect(await saved(page)).toEqual(beforeBoard);
  await board.getByRole("radio", { name: "全部", exact: true }).click();
  expect(await saved(page)).toEqual(final);
  await page.keyboard.press("Escape");
  await openDrawerCategory(page, "宗门");

  await page.reload();
  await expect(page.locator(".dojo")).toBeVisible();
  expect(await saved(page)).toEqual(final);
  await openCurrentLocation(page);
  await answerDaily(page);
  await openDrawerCategory(page, "宗门");
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(sect.locator('[data-sect-membership="quanzhen"]')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await sect.screenshot({ path: `${output}/sect-${width}.png` });
    await clickPaged(sect.getByRole("button", { name: /查看宁含章/ }));
    await sheet.getByRole("tab", { name: "经历", exact: true }).click();
    await clickPaged(sheet.getByRole("button", { name: "性与亲密经历", exact: true }));
    expect(await sheet.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    await sheet.screenshot({ path: `${output}/history-${width}.png` });
    await page.keyboard.press("Escape");
    await openDrawerCategory(page, "宗门");
  }
  expect(await saved(page)).toEqual(final);
  await clickPaged(sect.locator(".sect-departure summary"));
  await act(page, sect.getByRole("button", { name: /确认离开全真派/ }));
  expect((await saved(page)).player.sectMembership).toBeUndefined();
  await travel(page, "atlas.yunmeng");
  await act(page, sect.getByRole("button", { name: /拜访合欢宗/ }));
  await expect(sect).toContainText("双方自愿");
  await travel(page, "atlas.cangzhu");
  await act(page, sect.getByRole("button", { name: /拜访玉女宗/ }));
  await expect(sect.getByRole("button", { name: "申请加入玉女宗", exact: true })).toBeDisabled();
  expect(errors).toEqual([]);
});

test("a new adult woman can voluntarily take the Jade vow; viewing or cancelling never joins", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await create(page);
  await travel(page, "atlas.cangzhu");
  const sect = page.getByRole("region", { name: "宗门修行" });
  await act(page, sect.getByRole("button", { name: /拜访玉女宗/ }));
  const before = await saved(page);
  await clickPaged(sect.getByRole("button", { name: "申请加入玉女宗", exact: true }));
  await expect(sect.getByRole("group", { name: "入门誓约" })).toContainText("自愿");
  await clickPaged(sect.getByRole("button", { name: "再考虑", exact: true }));
  expect(await saved(page)).toEqual(before);
  await clickPaged(sect.getByRole("button", { name: "申请加入玉女宗", exact: true }));
  await act(page, sect.getByRole("button", { name: /确认自愿入门/ }));
  expect((await saved(page)).player.sectMembership.id).toBe("yunv");
  await clickPaged(sect.getByRole("button", { name: /查看顾清蘅/ }));
  const sheet = page.locator('[data-character-id="SECT_YUNV_GU"]');
  await sheet.getByRole("tab", { name: "关系", exact: true }).click();
  await act(page, sheet.getByRole("button", { name: /^上前见礼/ }));
  await clickPaged(sheet.getByRole("button", { name: "相伴与道侣", exact: true }));
  const intimacy = page.getByRole("dialog", { name: /^与.*相处$/ });
  await expect(intimacy.getByRole("button", { name: /^结为道侣/ })).toBeDisabled();
  await expect(intimacy.getByRole("button", { name: /^道侣共修/ })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await openMore(page);
  await dismissPanels(page);
  await selectLocations(page);
  await expect(page.locator("#atlas-page")).toBeVisible();
});
