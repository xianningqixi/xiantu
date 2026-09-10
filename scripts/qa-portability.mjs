import { chromium, firefox, expect } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
const url = process.env.XIANTU_TEST_URL ?? "http://127.0.0.1:3100";
const output = process.env.XIANTU_PORTABILITY_OUTPUT ?? "/tmp/xiantu-portability";
mkdirSync(output, { recursive: true });
const chrome = await chromium.launch({
  channel: process.env.PLAYWRIGHT_CHANNEL,
  args: ["--disable-gpu"],
});
const fox = await firefox.launch();
const normal = (w) => {
  const { saveId, revision, ...rest } = w;
  return rest;
};
const hash = (w) =>
  createHash("sha256")
    .update(JSON.stringify(normal(w)))
    .digest("hex");
async function saved(page) {
  return page.evaluate(async () => {
    const db = await new Promise((resolve) => {
      const q = indexedDB.open("xiantu-qingshi");
      q.onsuccess = () => resolve(q.result);
    });
    try {
      return await new Promise((resolve) => {
        const tx = db.transaction("saves"),
          q = tx.objectStore("saves").get("current");
        tx.oncomplete = () => resolve(q.result);
      });
    } finally {
      db.close();
    }
  });
}
async function download(page, label) {
  await page.getByRole("button", { name: "存档与设置", exact: true }).click();
  const event = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出当前存档", exact: true }).click();
  const path = `${output}/${label}.json`;
  await (await event).saveAs(path);
  await page.getByRole("dialog").getByRole("button", { name: "关闭", exact: true }).click();
  return path;
}
const report = {
  chrome: chrome.version(),
  firefox: fox.version(),
  platform: process.platform,
  results: [],
};
try {
  const context = await chrome.newContext({ baseURL: url, reducedMotion: "reduce" });
  const page = await context.newPage();
  await page.goto("/");
  await page.getByRole("textbox", { name: "姓名", exact: true }).fill("跨浏览器修士");
  await page.getByRole("button", { name: "踏入仙途", exact: true }).click();
  await expect(page.getByLabel("本机已存", { exact: true })).toBeVisible();
  const fixtures = [await download(page, "arrival")];
  for (let i = 0; i < 4; i++) {
    const before = await saved(page);
    await page.locator(".dojo-primary").click();
    await expect.poll(async () => (await saved(page)).revision).toBeGreaterThan(before.revision);
    await expect(page.getByLabel("本机已存", { exact: true })).toBeVisible();
    fixtures.push(await download(page, `story-${i + 1}`));
  }
  for (const branch of ["honor", "breach"]) {
    await page.getByRole("button", { name: "存档与设置", exact: true }).click();
    await page
      .getByLabel("选择存档文件")
      .setInputFiles(
        `${process.env.XIANTU_STORY_OUTPUT ?? "/tmp/xiantu-story-chromium"}/${branch}.json`,
      );
    await page.getByRole("button", { name: "确认继续", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    fixtures.push(await download(page, branch));
  }
  for (const file of fixtures) {
    const original = JSON.parse(readFileSync(file, "utf8")),
      ctx = await fox.newContext({ baseURL: url, reducedMotion: "reduce" }),
      p = await ctx.newPage();
    await p.goto("/");
    await p.getByLabel("选择存档文件").setInputFiles(file);
    await p.getByRole("button", { name: "确认继续", exact: true }).click();
    await expect(
      p.getByRole("heading", { name: original.profile.name, exact: true }),
    ).toBeVisible();
    await p.reload();
    await expect(
      p.getByRole("heading", { name: original.profile.name, exact: true }),
    ).toBeVisible();
    expect(normal(await saved(p))).toEqual(normal(original));
    const back = await download(p, `firefox-${file.split("/").pop().replace(".json", "")}`);
    expect(normal(JSON.parse(readFileSync(back, "utf8")))).toEqual(normal(original));
    report.results.push({
      file: file.split("/").pop(),
      day: original.day,
      fingerprint: hash(original),
      passed: true,
    });
    await ctx.close();
  }
  writeFileSync(`${output}/report.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} finally {
  await chrome.close();
  await fox.close();
}
