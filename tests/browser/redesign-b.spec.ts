import { test, expect, type Page } from "@playwright/test";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
const output = "docs/reports/screenshots/redesign-b";
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
  await expect(page.getByRole("button", { name: /旧档筑基行者 筑基初期/ })).toBeVisible();
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
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
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
  await expect(next.getByRole("button", { name: /旧档筑基行者 筑基初期/ })).toBeVisible();
  const normal = (v: any) => {
    const { saveId, revision, ...rest } = v;
    return rest;
  };
  expect(normal(await savedB(next))).toEqual(normal(w));
  await next.screenshot({ path: `${output}/new-context-import.png` });
  await context.close();
  expect(errors).toEqual([]);
  writeFileSync(
    "docs/reports/redesign-b-migration.json",
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
