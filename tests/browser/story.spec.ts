import { test, expect, type Page } from "@playwright/test";
import {
  saved,
  act,
  train,
  finish,
  openPractice,
  openMore,
  travelTo,
  dismissPanels,
  openCurrentLocation,
} from "./journey-controls";
import { installPauseControl, armPause } from "./pause-control";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
const B = JSON.parse(readFileSync("lib/game/content/balance.json", "utf8"));
async function breakthrough(page: Page) {
  await openPractice(page);
  await act(page, page.getByRole("button", { name: /凝神，尝试突破/ }));
  await finish(page);
}
async function startStory(page: Page, name: string) {
  await page.goto("/");
  await page.getByRole("textbox", { name: "姓名", exact: true }).fill(name);
  await page.getByRole("button", { name: "踏入仙途", exact: true }).click();
  await expect(page.locator(".dojo-primary")).toBeVisible();
  for (let i = 0; i < 4; i++) await act(page, page.locator(".dojo-primary"));
  expect((await saved(page)).agreement.status).toBe("accepted");
}
for (const honor of [true, false])
  test(`dojo story ${honor ? "honor" : "breach"} preserves battle, promises, reunion, breakthrough and paused checkpoints`, async ({
    page,
  }) => {
    test.setTimeout(180000);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await installPauseControl(page);
    await startStory(page, honor ? "守诺修士" : "失约修士");
    for (let i = 0; i < 6 && (await saved(page)).player.realm === 0; i++) {
      await train(page, 7);
      await breakthrough(page);
    }
    expect((await saved(page)).player.realm).toBeGreaterThan(0);
    for (let i = 0; i < 5 && (await saved(page)).party.length === 1; i++) {
      await openMore(page);
      await act(
        page,
        page
          .getByRole("dialog", { name: "选择更多行动" })
          .getByRole("button", { name: /^(邀二人同行|约在此处会合)$/ }),
      );
    }
    expect((await saved(page)).party).toHaveLength(3);
    await travelTo(page, "山门古道");
    await act(page, page.locator(".dojo-primary"));
    expect((await saved(page)).battle).toBeTruthy();
    await openMore(page);
    await act(page, page.getByRole("button", { name: "普攻 1 回合", exact: true }));
    const battle = await saved(page);
    for (const ally of battle.battle.allies) {
      await openMore(page);
      await page
        .locator(".ally-row")
        .getByRole("button", { name: `查看${ally.name}的人物资料`, exact: true })
        .click();
      await expect(page.locator(`[data-character-id="${ally.id}"] [data-stat="hp"]`)).toContainText(
        `${ally.hp} / ${ally.maxHp}`,
      );
      await page
        .locator(".profile-modal")
        .getByRole("button", { name: "关闭", exact: true })
        .click();
    }
    expect(await saved(page)).toEqual(battle);
    await dismissPanels(page);
    await page.reload();
    await expect(page.getByRole("heading", { name: /指挥战斗/ })).toBeVisible();
    expect((await saved(page)).battle).toEqual(battle.battle);
    if (honor) {
      for (let i = 0; i < 20 && (await saved(page)).battle; i++)
        await act(page, page.locator(".dojo-primary"));
    } else {
      await openMore(page);
      await page.getByRole("switch", { name: "自动战斗", exact: true }).click();
      await expect.poll(async () => !!(await saved(page)).battle, { timeout: 30000 }).toBe(false);
      await dismissPanels(page);
    }
    expect((await saved(page)).loot.grass).toBe(1);
    await act(page, page.locator(".dojo-primary"));
    await page.locator(".dojo-primary").click();
    if (honor) await act(page, page.getByRole("button", { name: /按约将凝元草交给林晚/ }));
    else {
      const before = await saved(page);
      await page.getByRole("button", { name: /把凝元草也收入自己囊中/ }).click();
      expect(await saved(page)).toEqual(before);
      await act(page, page.getByRole("button", { name: "确认独占，承担后果", exact: true }));
      await dismissPanels(page);
    }
    const settled = await saved(page);
    const portability = process.env.XIANTU_STORY_OUTPUT ?? "/tmp/xiantu-story-chromium";
    mkdirSync(portability, { recursive: true });
    writeFileSync(`${portability}/${honor ? "honor" : "breach"}.json`, JSON.stringify(settled));
    expect(settled.story.outcome).toBe(honor ? "fulfilled" : "breached");
    expect(settled.loot).toBeNull();
    expect(
      settled.events.some((e: any) => e.kind === (honor ? "promiseFulfilled" : "promiseBreached")),
    ).toBe(true);
    await openMore(page);
    const renew = page.getByRole("button", { name: "再次邀约林晚同行", exact: true });
    if (honor) {
      await renew.click();
      const renewal = page.getByRole("dialog", { name: "再次相约探秘境", exact: true });
      await expect(renewal).toContainText("现在确认不扣款");
      await expect(renewal.getByRole("button", { name: /确认再次同行/ })).toBeEnabled();
    } else {
      await expect(renew).toBeDisabled();
      await expect(page.locator("#negotiation-availability")).toContainText(
        "对方不愿接受目前的条件。",
      );
    }
    expect(await saved(page)).toEqual(settled);
    await dismissPanels(page);
    await openPractice(page);
    await page.getByLabel("停止条件", { exact: true }).selectOption("days");
    await page.getByLabel("修炼日数", { exact: true }).selectOption("30");
    await armPause(page);
    await act(page, page.locator("#practice-start"));
    await expect(page.locator(".dojo-primary")).toHaveText("继续当前行动");
    const paused = await saved(page);
    expect(paused.longAction.checkpoint).toBeGreaterThanOrEqual(3);
    await page.getByRole("tab", { name: "人物", exact: true }).click();
    await page.getByRole("button", { name: "查看全部人物", exact: true }).click();
    await page.getByLabel("人物范围", { exact: true }).selectOption("region");
    await page.locator(".person-row").first().click();
    await page.getByRole("tab", { name: "经历", exact: true }).click();
    await dismissPanels(page);
    expect(await saved(page)).toEqual(paused);
    await page.reload();
    await expect(page.locator(".dojo-primary")).toHaveText("继续当前行动");
    expect(await saved(page)).toEqual(paused);
    await page.locator(".dojo-primary").click();
    await finish(page);
    // The same scene surface handles any preceding main or side scene and the reunion.
    for (let i = 0; i < 16 && !(await saved(page)).story.flags.reunion; i++) {
      const w = await saved(page);
      if (w.player.location !== "market") {
        await travelTo(page, "青石坊市");
        continue;
      }
      if (await page.locator(".dojo-primary[data-story-choice]").count())
        await act(page, page.locator(".dojo-primary"));
      else {
        await openMore(page);
        await act(page, page.getByRole("button", { name: "在此停留 1 日", exact: true }));
        await finish(page);
      }
    }
    expect((await saved(page)).story.flags.reunion).toBe(true);
    const cap = B.cultivation.realmOrder.length - 1;
    for (let i = 0; i < 10 && (await saved(page)).player.realm < cap; i++) {
      const w = await saved(page),
        rule =
          B.cultivation.advanceRules[
            B.cultivation.realmOrder[w.player.realm] as keyof typeof B.cultivation.advanceRules
          ];
      if (w.player.xp < rule.requiredExperience) await train(page, 30);
      if ((await saved(page)).player.realm < cap) await breakthrough(page);
    }
    const final = await saved(page);
    expect(final.player.realm).toBe(cap);
    expect(final.player.alive).toBe(true);
    await page.reload();
    await expect(page.locator(".dojo-primary")).toBeVisible();
    expect(await saved(page)).toEqual(final);
    expect(errors).toEqual([]);
  });
test("cancelled invitations stay closed on desktop and mobile, explicit renewal saves without charging", async ({
  page,
}) => {
  test.setTimeout(120000);
  await startStory(page, "再访修士");
  await train(page, 7);
  await breakthrough(page);
  await openMore(page);
  await act(page, page.getByRole("button", { name: "邀二人同行", exact: true }));
  await openMore(page);
  await act(page, page.getByRole("button", { name: "暂别同行之人", exact: true }));
  const before = await saved(page);
  expect(before.agreement.status).toBe("cancelled");
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: width === 1440 ? 900 : 844 });
    await openCurrentLocation(page);
    await expect(page.locator(".dojo-story")).not.toContainText("同行之前，先立一诺");
    await openMore(page);
    await page.getByRole("button", { name: "再次邀约林晚同行", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "再次相约探秘境" })).toContainText(
      "现在确认不扣款",
    );
    expect(await saved(page)).toEqual(before);
    await dismissPanels(page);
  }
  await openMore(page);
  await page.getByRole("button", { name: "再次邀约林晚同行", exact: true }).click();
  await act(page, page.getByRole("button", { name: /确认再次同行/ }));
  const after = await saved(page);
  expect(after.agreement.status).toBe("accepted");
  for (const key of ["day", "rng", "player", "npcs", "relations", "story"])
    expect(after[key]).toEqual(before[key]);
  await page.reload();
  await expect(page.locator(".dojo-primary")).toBeVisible();
  expect(await saved(page)).toEqual(after);
});
