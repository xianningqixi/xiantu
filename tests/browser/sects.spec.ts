import { openMore, dismissPanels } from "./journey-controls";
import { creationSettings } from "./journey-controls";
import { test, expect, type Page, type Locator } from "@playwright/test";
import { mkdirSync, readFileSync } from "node:fs";
import { openCurrentLocation, selectLocations } from "./journey-controls";
const B = JSON.parse(readFileSync("lib/game/content/balance.json", "utf8"));
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
}
async function travel(page: Page, place: string) {
  await selectLocations(page);
  const modal = page.locator("#atlas-page");
  await modal.locator(`[data-atlas-place="${place}"]`).click();
  await act(page, modal.locator(".atlas-go"));
  await expect(modal).not.toBeVisible();
  await openCurrentLocation(page);
  await openMore(page);
}

test("three sect routes, contribution economy, NPC relationship choices and reload work through real UI", async ({
  page,
}) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await create(page);
  await travel(page, "atlas.wendao");
  await openMore(page);
  const sect = page.getByRole("region", { name: "宗门修行" });
  await expect(sect).toContainText("全真派");
  const before = await saved(page);
  await act(page, sect.getByRole("button", { name: /拜访全真派/ }));
  expect((await saved(page)).npcs.length).toBe(before.npcs.length + 2);
  await sect.getByRole("button", { name: "申请加入全真派", exact: true }).click();
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
  await sect.getByRole("button", { name: /查看宁含章/ }).click();
  const sheet = page.locator('[data-character-id="SECT_QUAN_NING"]');
  await expect(sheet.getByRole("region", { name: "角色属性" })).toBeVisible();
  const original = await saved(page);
  await sheet.getByRole("tab", { name: "经历", exact: true }).click();
  await expect(sheet.getByRole("region", { name: "性与亲密经历" })).toContainText("仅呈现已记录");
  await sheet.getByRole("button", { name: "性与亲密经历", exact: true }).click();
  expect(await saved(page)).toEqual(original);
  await sheet.getByRole("tab", { name: "关系", exact: true }).click();
  await act(page, sheet.getByRole("button", { name: /^上前见礼/ }));
  const bond = sheet.getByRole("button", { name: /^结为道侣/ });
  await expect(bond).toBeDisabled();
  for (let i = 0; i < 4; i++) await act(page, sheet.getByRole("button", { name: /^相伴交流/ }));
  await expect(bond).toBeEnabled();
  const beforeConfirm = await saved(page);
  await bond.click();
  expect(await saved(page)).toEqual(beforeConfirm);
  await act(page, sheet.getByRole("button", { name: "我愿意，确认结为道侣", exact: true }));
  await sheet.getByRole("button", { name: /^共度良宵/ }).click();
  await act(page, sheet.getByRole("button", { name: "我愿意，确认共度良宵", exact: true }));
  await sheet.getByRole("button", { name: /^道侣共修/ }).click();
  await act(page, sheet.getByRole("button", { name: "我愿意，确认道侣共修", exact: true }));
  await sheet.getByRole("tab", { name: "经历", exact: true }).click();
  await expect(sheet.getByRole("region", { name: "性与亲密经历" })).toContainText("3 条");
  await expect(sheet.locator(".sheet-memory")).toHaveCount(3);
  await sheet.screenshot({ path: `${output}/personal-history-desktop.png` });
  const final = await saved(page);
  await page.keyboard.press("Escape");
  await openMore(page);
  await page.reload();
  await expect(page.locator(".dojo")).toBeVisible();
  expect(await saved(page)).toEqual(final);
  await openCurrentLocation(page);
  await openMore(page);
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(sect.locator('[data-sect-membership="quanzhen"]')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await sect.screenshot({ path: `${output}/sect-${width}.png` });
    await sect.getByRole("button", { name: /查看宁含章/ }).click();
    await sheet.getByRole("tab", { name: "经历", exact: true }).click();
    await sheet.getByRole("button", { name: "性与亲密经历", exact: true }).click();
    expect(await sheet.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    await sheet.screenshot({ path: `${output}/history-${width}.png` });
    await page.keyboard.press("Escape");
    await openMore(page);
  }
  expect(await saved(page)).toEqual(final);
  await sect.locator(".sect-departure summary").click();
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
  await openMore(page);
  const sect = page.getByRole("region", { name: "宗门修行" });
  await act(page, sect.getByRole("button", { name: /拜访玉女宗/ }));
  const before = await saved(page);
  await sect.getByRole("button", { name: "申请加入玉女宗", exact: true }).click();
  await expect(sect.getByRole("group", { name: "入门誓约" })).toContainText("自愿");
  await sect.getByRole("button", { name: "再考虑", exact: true }).click();
  expect(await saved(page)).toEqual(before);
  await sect.getByRole("button", { name: "申请加入玉女宗", exact: true }).click();
  await act(page, sect.getByRole("button", { name: /确认自愿入门/ }));
  expect((await saved(page)).player.sectMembership.id).toBe("yunv");
  await sect.getByRole("button", { name: /查看顾清蘅/ }).click();
  const sheet = page.locator('[data-character-id="SECT_YUNV_GU"]');
  await sheet.getByRole("tab", { name: "关系", exact: true }).click();
  await act(page, sheet.getByRole("button", { name: /^上前见礼/ }));
  await expect(sheet.getByRole("button", { name: /^结为道侣/ })).toBeDisabled();
  await expect(sheet.getByRole("button", { name: /^道侣共修/ })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await openMore(page);
  await dismissPanels(page);
  await selectLocations(page);
  await expect(page.locator("#atlas-page")).toBeVisible();
});
