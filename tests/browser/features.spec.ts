import { installPauseControl, armPause } from "./pause-control";
import { openMore, finish } from "./journey-controls";
import { creationSettings } from "./journey-controls";
import { openPractice } from "./journey-controls";
import { openCurrentLocation, travelTo } from "./journey-controls";
import { test, expect, type Page } from "@playwright/test";
import { readFileSync, existsSync } from "node:fs";
async function world(page: Page, dbName = "xiantu-qingshi") {
  return page.evaluate(async (dbName) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open(dbName);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
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
  }, dbName);
}
async function create(page: Page, name = "功能验收") {
  await page.goto("/");
  await page.getByRole("textbox", { name: "姓名", exact: true }).fill(name);
  await page.getByRole("button", { name: "踏入仙途", exact: true }).click();
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
  await openCurrentLocation(page);
}
async function agreeReady(page: Page) {
  await create(page);
  for (let i = 0; i < 3; i++) {
    await page.locator(".dojo-primary").click();
    await expect(page.getByLabel("本机已存", { exact: true })).toBeVisible();
  }
}
async function openNegotiation(page: Page) {
  await openMore(page);
  await page.getByRole("button", { name: "与林晚同行交涉", exact: true }).click();
  return page.getByRole("dialog", { name: "与林晚商议同行" });
}
const terms = {
  members: ["PLAYER", "NPC_LIN_WAN", "NPC_ZHOU_AN"],
  recipient: "NPC_LIN_WAN",
  item: "grass",
  quantity: 1,
  remainder: "PLAYER",
  travelStones: 2,
  scope: "next_expedition",
};
test("author creation and actual preview file imports cannot overwrite the normal game", async ({
  page,
  context,
}) => {
  await create(page, "正式人生");
  const before = await world(page);
  const preview = await context.newPage();
  await preview.goto("/author");
  await expect(preview.getByText(/作者预览 · 独立测试存档/)).toBeVisible();
  await preview.getByRole("textbox", { name: "姓名", exact: true }).fill("作者测试");
  await creationSettings(preview);
  await preview.getByRole("checkbox", { name: /周安的归途口信/ }).check();
  await preview.getByRole("button", { name: "踏入仙途", exact: true }).click();
  await expect(preview.getByRole("heading", { name: "作者测试", exact: true })).toBeVisible();
  expect((await world(preview, "xiantu-author-preview")).contentLocks).toHaveLength(5);
  expect(await world(page)).toEqual(before);
  await preview.getByRole("button", { name: "存档与设置" }).click();
  await preview
    .getByLabel("选择存档文件")
    .setInputFiles("/tmp/xiantu-author-fixtures/guest.roadside-arrival.json");
  await preview.getByRole("button", { name: "确认继续", exact: true }).click();
  const side = preview.locator(".dojo-scene");
  await expect(side).toContainText("周安");
  const first = preview.locator(".dojo-primary");
  await first.click();
  await expect(preview.getByLabel("本机已存", { exact: true })).toBeVisible();
  expect(
    (await world(preview, "xiantu-author-preview")).contentState["guest.roadside.started"],
  ).toBe(true);
  expect(await world(page)).toEqual(before);
  await page.getByRole("button", { name: "存档与设置" }).click();
  await page
    .getByLabel("选择存档文件")
    .setInputFiles("/tmp/xiantu-author-fixtures/guest.roadside-arrival.json");
  await page.getByRole("button", { name: "确认继续", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "存档与设置" }).getByRole("alert")).toContainText(
    "作者预览",
  );
  expect(await world(page)).toEqual(before);
});
test("AI ambiguity, explicit confirmation, escaped text and history reloading use one adopted proposal", async ({
  page,
}) => {
  await agreeReady(page);
  const initial = await world(page);
  let calls = 0;
  await page.route("**/api/negotiation", async (route) => {
    calls++;
    const request = route.request().postDataJSON();
    await route.fulfill({
      json: {
        saveId: request.saveId,
        sessionId: request.sessionId,
        revision: request.revision,
        mock: true,
        proposal: {
          intent: calls === 1 ? "clarify" : "invite",
          reply: calls === 1 ? "需要明确分配。" : "<img src=x onerror=alert(1)> 请确认",
          terms: calls === 1 ? null : terms,
        },
      },
    });
  });
  const dialog = await openNegotiation(page);
  await dialog.getByRole("textbox", { name: "你想怎样商议" }).fill("平分吧");
  await dialog.getByRole("button", { name: "提出商议" }).click();
  await expect(dialog).toContainText("需要明确分配。");
  await expect(dialog.getByRole("button", { name: "确认以上条款" })).toHaveCount(0);
  expect(await world(page)).toEqual(initial);
  await dialog
    .getByRole("textbox", { name: "你想怎样商议" })
    .fill("第一株凝元草给你，其余归我，路费2灵石");
  await dialog.getByRole("button", { name: "提出商议" }).click();
  await expect(dialog).toContainText("<img src=x onerror=alert(1)>");
  expect(await dialog.locator("img").count()).toBe(0);
  expect(await world(page)).toEqual(initial);
  await dialog.getByRole("button", { name: "确认以上条款" }).dblclick();
  await expect(dialog).not.toBeVisible();
  const adopted = await world(page);
  expect(adopted.negotiations).toHaveLength(1);
  expect(adopted.agreement.status).toBe("accepted");
  await page.reload();
  await expect(page.getByRole("heading", { name: "功能验收", exact: true })).toBeVisible();
  expect((await world(page)).negotiations).toHaveLength(1);
  expect(calls).toBe(2);
});
test("cancelled late AI response and provider failure leave the world unchanged", async ({
  page,
}) => {
  await agreeReady(page);
  const before = await world(page);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  await page.route("**/api/negotiation", async (route) => {
    const q = route.request().postDataJSON();
    await gate;
    await route
      .fulfill({ json: { ...q, proposal: { intent: "invite", reply: "迟到的回应", terms } } })
      .catch(() => {});
  });
  let dialog = await openNegotiation(page);
  await dialog.getByRole("textbox", { name: "你想怎样商议" }).fill("商议同行");
  await dialog.getByRole("button", { name: "提出商议" }).click();
  await dialog.getByRole("button", { name: "取消等待" }).click();
  release();
  await expect(dialog).toContainText("已取消");
  expect(await world(page)).toEqual(before);
  await expect(dialog.getByRole("button", { name: "确认以上条款" })).toHaveCount(0);
  await page.unroute("**/api/negotiation");
  await page.route("**/api/negotiation", (route) =>
    route.fulfill({ status: 503, json: { error: "服务未配置，仍可使用固定选项。" } }),
  );
  await dialog.getByRole("button", { name: "提出商议" }).click();
  await expect(dialog.getByRole("alert")).toContainText("未配置");
  expect(await world(page)).toEqual(before);
});
test("320px layout, 200 percent text and failed illustrations preserve actions and identity", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.route(
    (url) => url.pathname.startsWith("/art/"),
    (route) => route.abort(),
  );
  await create(page, "窄屏修士");
  const before = await world(page);
  await page.addStyleTag({ content: "html{font-size:200% !important}" });
  await expect(page.getByRole("heading", { name: "窄屏修士", exact: true })).toBeVisible();
  expect(await world(page)).toEqual(before);
  await page.getByRole("button", { name: /接些坊市杂务/ }).click();
  await expect(page.locator("header").getByText("第 2 日", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("100 NPC decade save imports at full size and keeps UI responsive during checkpointed waiting", async ({
  page,
}, testInfo) => {
  test.setTimeout(90000);
  const fixture = `${process.env.XIANTU_STRESS_OUTPUT ?? "/tmp/xiantu-stress"}/save-1.json`;
  test.skip(
    !existsSync(fixture),
    "Run npm run test:stress first for the full decade performance check",
  );
  const file = readFileSync(fixture);
  const decade = JSON.parse(file.toString());
  expect(decade.day).toBe(3650);
  expect(decade.npcs).toHaveLength(100);
  expect(decade.events.length).toBeGreaterThan(100);
  await create(page, "性能回归");
  await page.getByRole("button", { name: "存档与设置" }).click();
  const started = Date.now();
  await page.getByLabel("选择存档文件").setInputFiles(fixture);
  await page.getByRole("button", { name: "确认继续", exact: true }).click();
  await expect(page.getByRole("heading", { name: "十年回归", exact: true })).toBeVisible();
  const importMs = Date.now() - started;
  await installPauseControl(page);
  await page.reload();
  await expect(page.locator(".dojo-primary")).toBeVisible();
  await openMore(page);
  await page.locator("#wait-controls summary").click();
  await page.getByLabel("等候日数", { exact: true }).selectOption("30");
  await armPause(page, 4);
  await page.evaluate(() => {
    (window as any).__lag = [];
    let previous = performance.now();
    (window as any).__lagTimer = setInterval(() => {
      const now = performance.now();
      (window as any).__lag.push(now - previous);
      previous = now;
    }, 50);
  });
  const runStarted = Date.now();
  await page.getByRole("button", { name: /^开始停留/ }).click();
  await expect(page.locator(".dojo-primary")).toHaveText("继续当前行动", { timeout: 60000 });
  const paused = await world(page);
  expect(paused.longAction.checkpoint).toBeGreaterThanOrEqual(4);
  await page.getByRole("tab", { name: "人物", exact: true }).click();
  await page.getByRole("button", { name: "查看全部人物", exact: true }).click();
  await expect(page.getByRole("heading", { name: "查看人物" })).toBeVisible();
  expect(await world(page)).toEqual(paused);
  await openCurrentLocation(page);
  await page.locator(".dojo-primary").click();
  await finish(page);
  const lag = await page.evaluate(() => {
    clearInterval((window as any).__lagTimer);
    return (window as any).__lag as number[];
  });
  const summary = {
    npcCount: 100,
    initialDay: 3650,
    days: 30,
    importBytes: file.byteLength,
    importMs,
    actionMs: Date.now() - runStarted,
    maxUiTimerGapMs: Math.max(...lag),
    samples: lag.length,
    browser: testInfo.project.name || process.env.PLAYWRIGHT_BROWSER || "chromium",
  };
  console.log(JSON.stringify({ performance: summary }));
  expect(lag.length).toBeGreaterThan(5);
  expect(summary.maxUiTimerGapMs).toBeLessThan(2000);
});

test("two official reunion preview fixtures remain separate from the normal game when images fail", async ({
  page,
  context,
}) => {
  await create(page, "正式档不动");
  const before = await world(page);
  const preview = await context.newPage();
  await preview.route(
    (url) => url.pathname.startsWith("/art/"),
    (route) => route.abort(),
  );
  await preview.goto("/author");
  for (const outcome of ["fulfilled", "breached"]) {
    if (outcome === "breached")
      await preview.getByRole("button", { name: "存档与设置", exact: true }).click();
    await preview
      .getByLabel("选择存档文件")
      .setInputFiles(`/tmp/xiantu-author-fixtures/official-${outcome}.json`);
    await preview.getByRole("button", { name: "确认继续", exact: true }).click();
    await expect(preview.getByRole("heading", { name: "演示数据", exact: true })).toBeVisible();
    await expect(preview.locator(".dojo-story h1")).toContainText(
      outcome === "fulfilled" ? "她还记得那株草" : "一诺之后",
    );
    const snapshot = await world(preview, "xiantu-author-preview");
    await preview.reload();
    await expect(preview.getByRole("heading", { name: "演示数据", exact: true })).toBeVisible();
    expect(await world(preview, "xiantu-author-preview")).toEqual(snapshot);
    expect(await world(page)).toEqual(before);
  }
});
