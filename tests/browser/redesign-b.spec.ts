import { dismissPanels, openMore } from "./journey-controls";
import { test, expect, type Page } from "@playwright/test";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
const output = "docs/reports/screenshots/redesign-ab/b";
test.use({ channel: "chrome", viewport: { width: 1440, height: 900 } });
export async function savedB(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open("xiantu-qingshi");
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    try {
      return await new Promise<any>((resolve) => {
        const tx = db.transaction("saves");
        const r = tx.objectStore("saves").get("current");
        tx.oncomplete = () => resolve(r.result);
      });
    } finally {
      db.close();
    }
  });
}
test("B: real 0.1.6 import, migration notice, backup and exported new-context roundtrip", async ({
  page,
  browser,
}) => {
  mkdirSync(output, { recursive: true });
  const original = JSON.parse(
    readFileSync("tests/game/fixtures/redesign-b/legacy-0.1.6-foundation.json", "utf8"),
  );
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page
    .getByLabel("选择存档文件")
    .setInputFiles("tests/game/fixtures/redesign-b/legacy-0.1.6-foundation.json");
  await page.getByRole("button", { name: "确认继续", exact: true }).click();
  await expect(page.getByText(/旧档已迁移至规则 0.2.0/).first()).toBeVisible();
  const w = await savedB(page);
  expect(w.player.realm).toBe(10);
  expect(w.schemaVersion).toBe(7);
  expect(w.rulesVersion).toBe("0.2.0");
  for (const key of ["events", "relations", "knowledge", "rng", "day"])
    expect(w[key]).toEqual(original[key]);
  original.npcs.forEach((a: any, i: number) =>
    expect(w.npcs[i].realm).toBe([0, 1, 2, 3, 10][a.realm]),
  );
  await expect(page.getByRole("heading", { name: "旧档筑基行者", exact: true })).toBeVisible();
  await page.screenshot({ path: `${output}/migration-notice.png` });
  await page.getByRole("button", { name: "存档与设置", exact: true }).click();
  await page.getByRole("button", { name: /本机备份/ }).click();
  await expect(page.getByText(/升级前/).first()).toBeVisible();
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", {
      name: `导出${original.player.name}第${original.day + 1}日备份`,
      exact: true,
    })
    .click();
  const backupPath = "/tmp/xiantu-b-browser-backup.json";
  await (await download).saveAs(backupPath);
  expect(JSON.parse(readFileSync(backupPath, "utf8"))).toEqual(original);
  await page.screenshot({ path: `${output}/migration-backup.png` });
  await dismissPanels(page);
  await page.getByRole("button", { name: "存档与设置", exact: true }).click();
  const exported = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出当前存档", exact: true }).click();
  const exportedPath = "/tmp/xiantu-b-browser-export.json";
  await (await exported).saveAs(exportedPath);
  const context = await browser.newContext({
    baseURL: process.env.XIANTU_TEST_URL || "http://127.0.0.1:3100",
    viewport: { width: 1440, height: 900 },
  });
  const next = await context.newPage();
  await next.goto("/");
  await next.getByLabel("选择存档文件").setInputFiles(exportedPath);
  await next.getByRole("button", { name: "确认继续", exact: true }).click();
  await expect(next.getByRole("heading", { name: "旧档筑基行者", exact: true })).toBeVisible();
  const normal = (v: any) => {
    const { saveId, revision, ...rest } = v;
    return rest;
  };
  expect(normal(await savedB(next))).toEqual(normal(w));
  await next.screenshot({ path: `${output}/new-context-import.png` });
  await context.close();
  expect(errors).toEqual([]);
  writeFileSync(
    "docs/reports/redesign-ab-migration.json",
    JSON.stringify(
      {
        fixture: "legacy-0.1.6-foundation.json",
        before: {
          day: original.day,
          schema: original.schemaVersion,
          rules: original.rulesVersion,
          realm: original.player.realm,
        },
        after: {
          day: w.day,
          schema: w.schemaVersion,
          rules: w.rulesVersion,
          realm: w.player.realm,
        },
        backupExact: true,
        historyExact: true,
        roundtrip: true,
      },
      null,
      2,
    ) + "\n",
  );
});

import {
  installBDriver,
  askB,
  commandB,
  createB,
  replyB,
  growthB,
  showB,
} from "./redesign-b-driver";
import type { Command, World } from "../../lib/game/types";
const DAILY_EVENTS = JSON.parse(readFileSync("content-packs/daily-events/events.json", "utf8"))
  .events as { id: string; category: string; choices: { id: string; label: string }[] }[];
test("B: production Worker new games measure aptitude, command count and one hundred daily-event days", async ({
  browser,
}) => {
  test.setTimeout(360000);
  const samples = [];
  for (const aptitude of [20, 90]) {
    const context = await browser.newContext({
      baseURL: process.env.XIANTU_TEST_URL || "http://127.0.0.1:3100",
      viewport: { width: 1440, height: 900 },
    });
    const page = await context.newPage();
    await installBDriver(page);
    let w = await createB(page, aptitude),
      commands = 0;
    while (w.player.realm < 3) {
      const oldRealm = w.player.realm;
      w = await commandB(page, w, growthB(w));
      commands++;
      if (aptitude === 90 && oldRealm === 0 && w.player.realm === 1) {
        await showB(page, w);
        await page.screenshot({ path: `${output}/entry.png` });
      }
    }
    expect(commands).toBeLessThanOrEqual(40);
    if (aptitude === 90) {
      await showB(page, w);
      await page.screenshot({ path: `${output}/qi-three.png` });
    }
    samples.push({ aptitude, days: w.day, commands });
    await context.close();
  }
  const context = await browser.newContext({
    baseURL: process.env.XIANTU_TEST_URL || "http://127.0.0.1:3100",
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();
  await installBDriver(page);
  let w = await createB(page),
    commands = 0;
  while (w.day < 100 || replyB(w)) {
    const c: Command = replyB(w) ?? (w.longAction ? { type: "step" } : { type: "wait", days: 1 });
    w = await commandB(page, w, c);
    commands++;
  }
  const events = w.events.filter((e) => e.kind === "daily-event");
  expect(events.length).toBeGreaterThanOrEqual(15);
  events.forEach((e, i) => {
    if (i) expect(e.daily!.nodeId).not.toBe(events[i - 1].daily!.nodeId);
  });
  const slow = samples[0].days,
    fast = samples[1].days;
  expect((slow - fast) / fast).toBeGreaterThanOrEqual(0.4);
  await showB(page, w);
  await page.screenshot({ path: `${output}/hundred-days.png` });
  await context.close();
  writeFileSync(
    "docs/reports/redesign-ab-browser-metrics.json",
    JSON.stringify(
      {
        driver:
          "Real Chrome production Worker protocol; all writes transact through the shipped Worker",
        samples,
        lowAptitudeExtraDaysRatio: (slow - fast) / fast,
        highAptitudeDayReduction: (slow - fast) / slow,
        daily: { days: w.day, count: events.length, consecutiveRepeats: 0, commands },
      },
      null,
      2,
    ) + "\n",
  );
});

test("B: daily retreat pause/resume and actual UI shortcuts for jobs, manual, sale and cave", async ({
  page,
}) => {
  test.setTimeout(360000);
  await installBDriver(page);
  let w = await createB(page);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  w = await commandB(page, w, { type: "meet", target: "NPC_LIN_WAN" });
  await showB(page, w);
  await page.screenshot({ path: `${output}/greeting.png` });
  while (w.player.realm < 3) w = await commandB(page, w, growthB(w));
  w = await commandB(page, w, { type: "train", days: 30, stoneMethod: false });
  let r = await askB(page, {
    kind: "advance",
    actionId: w.longAction!.id,
    checkpoint: 0,
    days: 30,
    expected: { saveId: w.saveId, revision: w.revision },
  });
  w = r.state;
  expect(w.pendingDailyEventId).toBeTruthy();
  expect(w.longAction).toBeTruthy();
  expect(r.advanceResult.reason).toBe("condition");
  const checkpoints = await page.evaluate(() => (window as any).__bProgress);
  const event = w.events.findLast((e) => e.kind === "daily-event")!;
  expect(checkpoints.at(-1).newEventIds).toContain(event.id);
  await showB(page, w);
  await page.screenshot({ path: `${output}/daily-paused.png` });
  const npcEventIds = checkpoints
    .flatMap((p: { newEventIds: string[] }) => p.newEventIds)
    .filter((id: string) => w.events.some((e) => e.id === id && !e.actors.includes("PLAYER")));
  expect(npcEventIds.length).toBeGreaterThan(0);
  const checkpoint = w.longAction!.checkpoint;
  const node = DAILY_EVENTS.find((n) => n.id === w.pendingDailyEventId)!;
  const label = node.choices.find(
    (c) => c.id === (node.category === "risk" ? "face" : "decline"),
  )!.label;
  const buttons = page.getByRole("button", { name: new RegExp(label) });
  if (!(await buttons.first().isVisible())) await openMore(page);
  await expect(buttons.first()).toBeEnabled();
  const uiChoiceBlocked = false;
  await buttons.first().click();
  // The real UI acknowledges the choice and resumes the original action automatically.
  await expect
    .poll(async () => (await savedB(page)).longAction?.checkpoint ?? 999)
    .toBeGreaterThan(checkpoint);
  await page.getByRole("tab", { name: "行囊", exact: true }).click();
  w = await savedB(page);
  if (replyB(w)) w = await commandB(page, w, replyB(w)!);
  const resumeCheckpoint = w.longAction!.checkpoint;
  r = await askB(page, {
    kind: "advance",
    actionId: w.longAction!.id,
    checkpoint: resumeCheckpoint,
    days: 1,
    expected: { saveId: w.saveId, revision: w.revision },
  });
  w = r.state;
  expect(w.longAction!.checkpoint).toBe(resumeCheckpoint + 1);
  if (replyB(w)) w = await commandB(page, w, replyB(w)!);
  await showB(page, w);
  await page.screenshot({ path: `${output}/daily-resumed.png` });
  w = await commandB(page, w, { type: "stop" });
  if (replyB(w)) w = await commandB(page, w, replyB(w)!);
  w = await commandB(page, w, { type: "travel", to: "market" });
  if (replyB(w)) w = await commandB(page, w, replyB(w)!);
  while (w.player.stones < 270) {
    w = await commandB(page, w, { type: "work", job: "chores" });
    if (replyB(w)) w = await commandB(page, w, replyB(w)!);
  }
  async function clickAction(label: RegExp) {
    await showB(page, w);
    const previous = w;
    await openMore(page);
    await page.getByRole("button", { name: label }).first().click({ timeout: 15000 });
    await expect
      .poll(async () => (await savedB(page))?.revision)
      .toBeGreaterThan(previous.revision);
    w = await savedB(page);
    if (replyB(w)) w = await commandB(page, w, replyB(w)!);
    return previous;
  }
  let before = await clickAction(/接些坊市杂务/);
  expect(w.day - before.day).toBe(1);
  await page.screenshot({ path: `${output}/job-chores.png` });
  before = await clickAction(/护送商队/);
  expect(w.day - before.day).toBe(2);
  await page.screenshot({ path: `${output}/job-escort.png` });
  w = await commandB(page, w, { type: "travel", to: "atlas.cangzhu" });
  if (replyB(w)) w = await commandB(page, w, replyB(w)!);
  before = await clickAction(/^采药/);
  expect(w.day - before.day).toBe(1);
  await page.screenshot({ path: `${output}/job-herbs.png` });
  while (!w.player.grass) {
    w = await commandB(page, w, { type: "work", job: "herbs" });
    if (replyB(w)) w = await commandB(page, w, replyB(w)!);
  }
  w = await commandB(page, w, { type: "travel", to: "inn" });
  if (replyB(w)) w = await commandB(page, w, replyB(w)!);
  before = await clickAction(/功法进阶/);
  expect(w.player.stones).toBe(before.player.stones - 40);
  expect(w.player.manualRank).toBe(1);
  await page.screenshot({ path: `${output}/manual-upgrade.png` });
  w = await commandB(page, w, { type: "travel", to: "market" });
  if (replyB(w)) w = await commandB(page, w, replyB(w)!);
  before = await clickAction(/出售一份凝元草/);
  expect(w.player.stones).toBe(before.player.stones + 25);
  await page.screenshot({ path: `${output}/sell-grass.png` });
  before = await clickAction(/置办洞府/);
  expect(w.player.stones).toBe(before.player.stones - 200);
  expect(w.player.cave).toBe("market");
  await page.screenshot({ path: `${output}/rent-cave.png` });
  expect(errors).toEqual([]);
  writeFileSync(
    "docs/reports/redesign-ab-browser-loop.json",
    JSON.stringify(
      {
        viewport: [1440, 900],
        channel: "chrome",
        dailyChoice: {
          workerPause: true,
          durableEventId: event.id,
          checkpoint,
          workerResume: true,
          uiChoiceBlocked,
          knownNpcProgressEvents: npcEventIds.length,
        },
        economy: {
          threeJobsClicked: true,
          manualRank: w.player.manualRank,
          cave: w.player.cave,
          grass: w.player.grass,
          stones: w.player.stones,
        },
        pageErrors: errors,
      },
      null,
      2,
    ) + "\n",
  );
});
