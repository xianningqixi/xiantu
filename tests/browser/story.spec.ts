import { test, expect, type Page, type Locator } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
async function saved(page: Page) {
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
async function click(page: Page, button: Locator) {
  const revision = (await saved(page)).revision;
  await button.click();
  await expect.poll(async () => (await saved(page)).revision).toBeGreaterThan(revision);
}
async function finish(page: Page) {
  await expect.poll(async () => !!(await saved(page)).longAction, { timeout: 30000 }).toBe(false);
  await expect(page.getByText("本机已存", { exact: true })).toBeVisible();
}
async function train(page: Page, days: number) {
  await page.getByRole("tab", { name: "修行", exact: true }).click();
  await page.getByRole("radio", { name: `${days} 日`, exact: true }).check();
  await click(
    page,
    page.getByRole("button", { name: new RegExp(`^开始${days >= 7 ? "闭关" : "修炼"}`) }),
  );
  await finish(page);
}
async function breakthrough(page: Page) {
  await page.getByRole("tab", { name: "修行", exact: true }).click();
  await click(page, page.getByRole("button", { name: /凝神，尝试突破/ }));
  await finish(page);
}
for (const honor of [true, false])
  test(`normal UI story ${honor ? "honor" : "breach"} reaches reunion and foundation attempt, with reload and long-action pause`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(180000);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/");
    await page
      .getByRole("textbox", { name: "姓名", exact: true })
      .fill(honor ? "守诺修士" : "失约修士");
    await page.getByRole("button", { name: "踏入仙途", exact: true }).click();
    await expect(page.getByText("本机已存", { exact: true })).toBeVisible();
    for (let i = 0; i < 4; i++)
      await click(page, page.locator(".story-choices .story-choice").first());
    expect((await saved(page)).agreement.status).toBe("accepted");
    await train(page, 7);
    await breakthrough(page);
    for (let i = 0; i < 5 && (await saved(page)).player.realm === 0; i++) {
      await train(page, 1);
      await breakthrough(page);
    }
    expect((await saved(page)).player.realm).toBeGreaterThan(0);
    for (let i = 0; i < 5 && (await saved(page)).party.length === 1; i++)
      await click(
        page,
        page.getByRole("button", { name: /^(邀二人同行|约在此处会合 · 1 日|等候同伴 · 1 日)$/ }),
      );
    expect((await saved(page)).party).toHaveLength(3);
    await click(page, page.locator(".travel-options").getByRole("button", { name: /山门古道/ }));
    await click(page, page.getByRole("button", { name: /三人同行，进入残碑秘境/ }));
    await click(page, page.getByRole("button", { name: "普攻", exact: true }));
    const battle = await saved(page);
    expect(battle.battle).toBeTruthy();
    await page.reload();
    await expect(page.getByRole("heading", { name: "残碑守卫" })).toBeVisible();
    expect((await saved(page)).battle).toEqual(battle.battle);
    if (honor) {
      for (const action of ["青芒剑诀", "普攻", "防御", "普攻", "青芒剑诀"]) {
        if (!(await saved(page)).battle) break;
        await click(page, page.getByRole("button", { name: action, exact: true }));
      }
    } else {
      await page.getByRole("switch", { name: "自动战斗", exact: true }).click();
      await expect.poll(async () => !!(await saved(page)).battle, { timeout: 20000 }).toBe(false);
    }
    expect((await saved(page)).battle).toBeNull();
    expect((await saved(page)).loot.grass).toBe(1);
    await click(page, page.getByRole("button", { name: /收好战利品，返回坊市/ }));
    if (honor) await click(page, page.getByRole("button", { name: /按约将凝元草交给林晚/ }));
    else {
      const before = await saved(page);
      await page.getByRole("button", { name: /把凝元草也收入自己囊中/ }).click();
      expect(await saved(page)).toEqual(before);
      await click(page, page.getByRole("button", { name: "确认独占，承担后果", exact: true }));
    }
    const settled = await saved(page);
    expect(settled.story.outcome).toBe(honor ? "fulfilled" : "breached");
    expect(settled.loot).toBeNull();
    expect(
      settled.events.some((e: any) => e.kind === (honor ? "promiseFulfilled" : "promiseBreached")),
    ).toBe(true);
    await page.getByRole("tab", { name: "修行", exact: true }).click();
    await page.getByRole("radio", { name: "30 日", exact: true }).check();
    await click(page, page.getByRole("button", { name: /开始闭关/ }));
    await expect
      .poll(async () => (await saved(page)).longAction?.checkpoint ?? 30)
      .toBeGreaterThanOrEqual(3);
    await page.getByRole("button", { name: "暂停", exact: true }).click();
    await expect(page.getByText("计算已暂停，已完成的日数和进度均已保存。")).toBeVisible();
    const paused = await saved(page);
    await page.getByRole("tab", { name: "故人", exact: true }).click();
    await page.getByRole("button", { name: "查看世界人物 · 40 人", exact: true }).click();
    await expect(page.locator(".person-row")).toHaveCount(40);
    for (let i = 0; i < 40; i++) {
      const row = page.locator(".person-row").nth(i);
      await row.click();
      const detail = page.getByRole("dialog");
      await expect(detail).toContainText("人物小传");
      await detail.getByRole("button", { name: "Close", exact: true }).click();
    }
    expect(await saved(page)).toEqual(paused);
    await page.reload();
    await expect(page.getByText("计算已暂停，已完成的日数和进度均已保存。")).toBeVisible();
    expect(await saved(page)).toEqual(paused);
    await page.getByRole("button", { name: "继续", exact: true }).click();
    await finish(page);
    await page.getByRole("tab", { name: "游历", exact: true }).click();
    for (let i = 0; i < 8 && !(await saved(page)).npcs[0].alive; i++)
      throw new Error("Required NPC unexpectedly died");
    for (let i = 0; i < 8 && !(await saved(page)).story.flags.reunion; i++) {
      const story = page.locator(".story-copy h2");
      if ((await story.count()) && /她还记得|话里多了|旧诺|旧日|草/.test(await story.innerText())) {
        await click(page, page.locator(".story-choices .story-choice").first());
      } else {
        const sceneButtons = page.locator(".story-choices .story-choice");
        const currentText = await page.locator(".story-copy").innerText();
        if (/重逢|失约|约定/.test(currentText) && (await sceneButtons.count()))
          await click(page, sceneButtons.first());
        else {
          await click(
            page,
            page.getByRole("button", { name: "等候故人 3 日 · 世界继续前行", exact: true }),
          );
          await finish(page);
        }
      }
    }
    expect((await saved(page)).story.flags.reunion).toBe(true);
    if (!honor) {
      const before = await saved(page);
      if (before.npcs[0].location === "market")
        await click(page, page.getByRole("button", { name: "交付药草，赔礼", exact: true }));
      expect((await saved(page)).events.some((e: any) => e.kind === "promiseBreached")).toBe(true);
    }
    await breakthrough(page);
    let final = await saved(page);
    expect(final.events.some((e: any) => e.kind === "attempt" && e.text.includes("突破"))).toBe(
      true,
    );
    expect(final.player.alive).toBe(true);
    const attempts = final.events.filter(
      (e: any) => e.actors.includes("PLAYER") && e.kind === "breakthrough-failed",
    );
    for (let retry = 0; retry < 5 && final.player.realm < 4; retry++) {
      await train(page, 30);
      await breakthrough(page);
      final = await saved(page);
    }
    expect(final.player.realm).toBe(4);
    if (honor) expect(attempts.length).toBeGreaterThan(0);
    // Actual browser exports are retained as local handoff fixtures, never committed as user data.
    const output = `/tmp/xiantu-story-${testInfo.project.name || process.env.PLAYWRIGHT_BROWSER || "chromium"}`;
    mkdirSync(output, { recursive: true });
    writeFileSync(`${output}/${honor ? "honor" : "breach"}.json`, JSON.stringify(final, null, 2));
    await page.screenshot({
      path: `${output}/${honor ? "honor" : "breach"}.png`,
      fullPage: true,
      animations: "disabled",
    });
    expect(errors).toEqual([]);
  });
