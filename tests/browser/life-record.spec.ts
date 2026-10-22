import { test, expect } from "@playwright/test";
import { saved, turnTo } from "./journey-controls";

test("the character sheet shows recorded virginity and relationships without writing the world", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page.getByRole("textbox", { name: "姓名", exact: true }).fill("问道行人");
  await page.getByRole("button", { name: "踏入仙途", exact: true }).click();
  await expect(page.locator(".dojo")).toBeVisible();
  const before = await saved(page);
  await page.getByRole("button", { name: "查看问道行人的人物资料", exact: true }).click();
  const sheet = page.locator(".profile-modal");
  const record = sheet.getByRole("region", { name: "性经历与交往经历" });
  await turnTo(record);
  await expect(record).toContainText("处女");
  await expect(record).toContainText("记下的经历里还没有亲热，也没有交合。");
  await expect(record).toContainText("没有记下道侣。");
  await expect(record).toContainText("未记载的过往不会推断。");
  await expect(record.getByText("已非处女")).toHaveCount(0);
  expect(await saved(page)).toEqual(before);
  await sheet.getByRole("tab", { name: "经历", exact: true }).click();
  await expect(sheet.getByRole("region", { name: "性与亲密经历" })).toContainText("仅呈现已记录");
  expect(await saved(page)).toEqual(before);
  await sheet.getByRole("tab", { name: "属性", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await turnTo(record);
  await expect(record).toContainText("处女");
  expect(await sheet.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  expect(errors).toEqual([]);
});
