import { growTo, answerDaily } from "./journey-controls";
import { test, expect, type Page } from "@playwright/test";
import {
  saved,
  act,
  openMore,
  selectLocations,
  openPractice,
  finish,
  dismissPanels,
} from "./journey-controls";
import { readFileSync } from "node:fs";
const B = JSON.parse(readFileSync("lib/game/content/balance.json", "utf8"));
async function shortcut(page: Page, id: string) {
  await openMore(page);
  const control = page
    .getByRole("dialog", { name: "选择更多行动" })
    .locator(`[data-journey-action="${id}"]`);
  if (await control.count()) return control;
  await dismissPanels(page);
  return page.locator(".dojo-primary");
}
async function forest(page: Page) {
  await selectLocations(page);
  await page.locator('[data-atlas-place="atlas.cangzhu"]').click();
  await act(page, page.locator(".atlas-go"));
}
test("dojo shortcuts retain real costs, free learning, breakthrough and sect contribution rules", async ({
  page,
}) => {
  test.setTimeout(120000);
  await page.goto("/");
  await page.getByRole("textbox", { name: "姓名", exact: true }).fill("行路知微");
  await page.getByRole("button", { name: "踏入仙途", exact: true }).click();
  await expect(page.locator(".dojo-primary")).toBeVisible();
  const poor = await saved(page),
    paid = await act(page, await shortcut(page, "work"));
  expect(paid.player.stones - poor.player.stones).toBe(B.actions.workSpiritStoneReward);
  expect(paid.day - poor.day).toBe(B.actions.workDays);
  await (await shortcut(page, "shop")).click();
  await expect(page.locator('[data-shop-item="healing"]')).toBeVisible();
  expect(await saved(page)).toEqual(paid);
  await answerDaily(page);
  const before = await saved(page);
  await act(page, await shortcut(page, "practice"));
  const inn = await saved(page);
  expect(inn.player.location).toBe("inn");
  expect(inn.day - before.day).toBe(
    B.travel.routes.find((r: any) => r.from === "LOC_MARKET" && r.to === "LOC_INN").days,
  );
  await act(page, page.locator(".dojo-primary"));
  const learned = await saved(page);
  expect(learned.player.manual).toBe(true);
  expect(learned.day).toBe(inn.day);
  expect(learned.rng).toEqual(inn.rng);
  expect(learned.player.stones).toBe(inn.player.stones);
  await openPractice(page);
  expect(await saved(page)).toEqual(learned);
  await page.getByLabel("停止条件", { exact: true }).selectOption("ready");
  await page.locator("#practice-start").click();
  await finish(page);
  await openMore(page);
  await expect(page.getByRole("button", { name: "准备突破", exact: true }).first()).toBeVisible();
  await dismissPanels(page);
  await growTo(page, "QI_5");
  await forest(page);
  await answerDaily(page);
  await openMore(page);
  const sect = page.getByRole("region", { name: "宗门修行", exact: true });
  await act(page, sect.getByRole("button", { name: /拜访玉女宗/ }));
  const visited = await saved(page);
  await sect.getByRole("button", { name: "申请加入玉女宗", exact: true }).click();
  expect(await saved(page)).toEqual(visited);
  const joined = await act(page, sect.getByRole("button", { name: /确认自愿入门/ }));
  for (let i = 0; i < 3; i++) await act(page, sect.getByRole("button", { name: /照料竹泉药圃/ }));
  const earned = await saved(page);
  expect(earned.player.stones - joined.player.stones).toBe(3 * B.sects.taskStones);
  expect(earned.day - joined.day).toBe(3 * B.sects.taskDays);
  await act(page, sect.getByRole("button", { name: /研习心法/ }));
  const trained = await saved(page);
  expect(trained.player.sectMembership.contribution).toBe(
    earned.player.sectMembership.contribution - B.sects.artContributionCost,
  );
  await page.reload();
  await expect(page.locator(".dojo-primary")).toBeVisible();
  expect(await saved(page)).toEqual(trained);
});
