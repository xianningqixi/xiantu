import { saved as savedState } from "./journey-controls";
import { creationSettings } from "./journey-controls";
import { openCurrentLocation } from "./journey-controls";
import { expect, test, type Page } from "@playwright/test";

async function create(page: Page, name = "浏览器验收") {
  await page.goto("/");
  await expect(page.locator(".creation-form, .game-shell, .recovery-screen")).toBeVisible();
  if (await page.locator(".creation-more").count()) await creationSettings(page);
  await page.getByRole("textbox", { name: "姓名", exact: true }).fill(name);
  await page.getByRole("button", { name: "踏入仙途", exact: true }).click();
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
  await expect(page.getByLabel("本机已存", { exact: true })).toBeVisible();
}
async function settings(page: Page) {
  await page.getByRole("button", { name: "存档与设置", exact: true }).click();
  return page.getByRole("dialog", { name: "存档与设置" });
}

test("draft fields and aptitude survive reloading before the world is created", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.locator(".creation-form, .game-shell, .recovery-screen")).toBeVisible();
  if (await page.locator(".creation-more").count()) await creationSettings(page);
  await page.getByRole("textbox", { name: "姓名", exact: true }).fill("草稿修士");
  await page.getByRole("radio", { name: "男", exact: true }).check();
  await page.getByRole("button", { name: "重掷", exact: true }).click();
  const aptitude = await page
    .getByRole("progressbar", { name: "灵根资质" })
    .getAttribute("aria-valuenow");
  await expect(page.locator(".creation-form .save-footnote")).toHaveText("创角草稿已保存");
  await page.reload();
  await expect(page.locator(".creation-form, .game-shell, .recovery-screen")).toBeVisible();
  if (await page.locator(".creation-more").count()) await creationSettings(page);
  await expect(page.getByRole("textbox", { name: "姓名", exact: true })).toHaveValue("草稿修士");
  await expect(page.getByRole("radio", { name: "男", exact: true })).toBeChecked();
  await expect(page.getByRole("progressbar", { name: "灵根资质" })).toHaveAttribute(
    "aria-valuenow",
    aptitude!,
  );
  await expect(page.getByRole("button", { name: "踏入仙途", exact: true })).toBeEnabled();
  expect(errors).toEqual([]);
});

test("double click makes one reward and refresh recovers the committed day", async ({ page }) => {
  await create(page);
  await openCurrentLocation(page);
  await page.getByRole("button", { name: /接些坊市杂务/ }).dblclick();
  await expect(page.locator("header").getByText("第 2 日", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.locator(".creation-form, .game-shell, .recovery-screen")).toBeVisible();
  if (await page.locator(".creation-more").count()) await creationSettings(page);
  await expect(page.locator("header").getByText("第 2 日", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "浏览器验收", exact: true })).toBeVisible();
});

test("bad import is rejected and canceling a valid import keeps the original world", async ({
  page,
}) => {
  await create(page, "原档保留");
  const before = await savedState(page);
  const dialog = await settings(page);
  await page.getByLabel("选择存档文件").setInputFiles({
    name: "bad.json",
    mimeType: "application/json",
    buffer: Buffer.from("{broken"),
  });
  await expect(dialog.getByRole("alert")).toContainText("文件无法识别");
  expect(await savedState(page)).toEqual(before);
  await page.getByLabel("选择存档文件").setInputFiles({
    name: "valid.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(before)),
  });
  await page.getByRole("button", { name: "再想一想", exact: true }).click();
  expect(await savedState(page)).toEqual(before);
  const invalid = { ...before, player: { ...before.player, stones: -1 } };
  await page.getByLabel("选择存档文件").setInputFiles({
    name: "invalid.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(invalid)),
  });
  await page.getByRole("button", { name: "确认继续", exact: true }).click();
  await expect(dialog.getByRole("alert")).toBeVisible();
  expect(await savedState(page)).toEqual(before);
  await page.reload();
  await expect(page.getByRole("heading", { name: "原档保留", exact: true })).toBeVisible();
});

test("another page cannot write to a replaced character even at the same revision", async ({
  page,
  context,
}) => {
  await create(page, "旧角色");
  const other = await context.newPage();
  await other.goto("/");
  await expect(other.getByRole("heading", { name: "旧角色", exact: true })).toBeVisible();
  const dialog = await settings(page);
  await dialog.getByRole("button", { name: "创建新角色", exact: true }).click();
  await page.getByRole("textbox", { name: "姓名", exact: true }).fill("新角色");
  await page.getByRole("button", { name: "踏入仙途", exact: true }).click();
  await page.getByRole("button", { name: "确认继续", exact: true }).click();
  await expect(page.getByRole("heading", { name: "新角色", exact: true })).toBeVisible();
  await openCurrentLocation(other);
  await other.getByRole("button", { name: /接些坊市杂务/ }).click();
  await expect(other.getByRole("alert")).toContainText("另一页面");
  await other.getByRole("button", { name: "重新读取", exact: true }).click();
  await expect(other.getByRole("heading", { name: "新角色", exact: true })).toBeVisible();
  await expect(other.locator("header").getByText("第 1 日", { exact: true })).toBeVisible();
});

test("backup restore requires confirmation and preserves the replaced character", async ({
  page,
}) => {
  await create(page, "备份甲");
  const dialog = await settings(page);
  await dialog.getByRole("button", { name: "创建新角色", exact: true }).click();
  await page.getByRole("textbox", { name: "姓名", exact: true }).fill("备份乙");
  await page.getByRole("button", { name: "踏入仙途", exact: true }).click();
  await page.getByRole("button", { name: "确认继续", exact: true }).click();
  await expect(page.getByRole("heading", { name: "备份乙", exact: true })).toBeVisible();
  await settings(page);
  await page.getByRole("button", { name: "本机备份", exact: true }).click();
  const backups = page.getByRole("dialog", { name: /存档与设置.*本机备份|找回一段人生/ });
  await backups.getByRole("button", { name: "恢复", exact: true }).click();
  await page.getByRole("button", { name: "取消恢复", exact: true }).click();
  await expect(backups).toBeVisible();
  await backups.getByRole("button", { name: "恢复", exact: true }).click();
  await page.getByRole("button", { name: "确认恢复", exact: true }).click();
  await page.reload();
  await expect(page.locator(".creation-form, .game-shell, .recovery-screen")).toBeVisible();
  if (await page.locator(".creation-more").count()) await creationSettings(page);
  await expect(page.getByRole("heading", { name: "备份甲", exact: true })).toBeVisible();
  await settings(page);
  await page.getByRole("button", { name: "本机备份", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: /存档与设置.*本机备份|找回一段人生/ }),
  ).toContainText("备份乙");
});

test("exported save can be imported through the actual file control", async ({ page }) => {
  await create(page, "可携带修士");
  const dialog = await settings(page);
  const downloaded = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "导出当前存档", exact: true }).click();
  const download = await downloaded;
  const path = await download.path();
  expect(path).toBeTruthy();
  await page.getByLabel("选择存档文件").setInputFiles(path!);
  await page.getByRole("button", { name: "确认继续", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await page.reload();
  await expect(page.locator(".creation-form, .game-shell, .recovery-screen")).toBeVisible();
  if (await page.locator(".creation-more").count()) await creationSettings(page);
  await expect(page.getByRole("heading", { name: "可携带修士", exact: true })).toBeVisible();
});

// Fault fixture preparation uses only this test's isolated browser storage.
async function mutateStoredSave(page: Page, change: "legacy" | "campaign" | "corrupt") {
  return page.evaluate(async (change) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const q = indexedDB.open("xiantu-qingshi");
      q.onsuccess = () => resolve(q.result);
      q.onerror = () => reject(q.error);
    });
    const before = await new Promise<Record<string, unknown>>((resolve, reject) => {
      const tx = db.transaction("saves", "readwrite");
      const store = tx.objectStore("saves");
      const q = store.get("current");
      let original: Record<string, unknown>;
      q.onsuccess = () => {
        original = structuredClone(q.result);
        if (change === "legacy") {
          // Build an authentic released five-realm/schema-one shape for this old-format test.
          const realmBack = (r: number) => (r >= 10 ? 4 : Math.min(r, 3));
          for (const a of [q.result.player, ...q.result.npcs]) {
            a.realm = realmBack(a.realm);
            a.hp = Math.min(a.hp, [30, 50, 70, 90, 130][a.realm]);
            for (const key of ["insight", "manualRank", "skills", "qi", "jobCooldowns", "cave"])
              delete a[key];
          }
          delete q.result.pendingDailyEventId;
          delete q.result.dailyEventCooldowns;
          delete q.result.schemaVersion;
          delete q.result.commandReceipts;
          q.result.rulesVersion = "0.1.1";
          delete q.result.negotiations;
          delete q.result.contentLocks;
          delete q.result.contentState;
          q.result.npcs = q.result.npcs.filter((a: { id: string }) => !a.id.startsWith("shichai."));
          delete q.result.knowledge;
          delete q.result.simulationOptions;
          for (const a of [q.result.player, ...q.result.npcs]) delete a.lastActionDay;
          if (q.result.battle) delete q.result.battle.lethal;
          if (q.result.longAction)
            for (const key of ["id", "checkpoint", "paidStones"]) delete q.result.longAction[key];
        } else if (change === "campaign") {
          delete q.result.campaignLock;
          q.result.contentLocks = [];
          q.result.npcs = q.result.npcs.filter((a: { id: string }) => !a.id.startsWith("shichai."));
        } else q.result.profile = null;
        store.put(q.result, "current");
      };
      tx.oncomplete = () => resolve(original);
      tx.onabort = () => reject(tx.error);
    });
    db.close();
    return before;
  }, change);
}

async function savedRecords(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const q = indexedDB.open("xiantu-qingshi");
      q.onsuccess = () => resolve(q.result);
      q.onerror = () => reject(q.error);
    });
    try {
      return await new Promise<{ world: any; backups: any[] }>((resolve, reject) => {
        const tx = db.transaction(["saves", "backups"]);
        const world = tx.objectStore("saves").get("current");
        const backups = tx.objectStore("backups").getAll();
        tx.oncomplete = () => resolve({ world: world.result, backups: backups.result });
        tx.onabort = () => reject(tx.error);
      });
    } finally {
      db.close();
    }
  });
}

test("an existing game gains the four fixed volumes atomically, keeps its original backup and never resets on reload", async ({
  page,
}) => {
  await create(page, "四卷接续");
  await mutateStoredSave(page, "campaign");
  const old = (await savedRecords(page)).world;
  expect(old.npcs).toHaveLength(100);
  await page.reload();
  await expect(page.locator(".creation-form, .game-shell, .recovery-screen")).toBeVisible();
  if (await page.locator(".creation-more").count()) await creationSettings(page);
  await expect(page.locator(".dojo")).toBeVisible();
  const joined = await savedRecords(page);
  expect(joined.world.contentLocks).toHaveLength(4);
  expect(joined.world.npcs).toHaveLength(123);
  expect(joined.world.npcs.slice(0, 100)).toEqual(old.npcs);
  for (const key of [
    "saveId",
    "player",
    "profile",
    "day",
    "rng",
    "events",
    "knowledge",
    "relations",
    "contentState",
    "appliedCommands",
    "commandReceipts",
  ])
    expect(joined.world[key]).toEqual(old[key]);
  expect(joined.world.revision).toBe(old.revision + 1);
  expect(joined.backups).toEqual([old]);
  await expect(page.getByRole("tab", { name: "游历", exact: true })).toBeDisabled();
  await page.reload();
  await expect(page.locator(".creation-form, .game-shell, .recovery-screen")).toBeVisible();
  if (await page.locator(".creation-more").count()) await creationSettings(page);
  await expect(page.locator(".dojo")).toBeVisible();
  expect(await savedRecords(page)).toEqual(joined);
});

test("legacy browser storage upgrades on a copy and exposes the original backup", async ({
  page,
}) => {
  await create(page, "旧版修士");
  await mutateStoredSave(page, "legacy");
  await page.reload();
  await expect(page.locator(".creation-form, .game-shell, .recovery-screen")).toBeVisible();
  if (await page.locator(".creation-more").count()) await creationSettings(page);
  await expect(page.getByRole("heading", { name: "旧版修士", exact: true })).toBeVisible();
  await expect(page.locator("header").getByText("第 1 日", { exact: true })).toBeVisible();
  await settings(page);
  await page.getByRole("button", { name: "本机备份", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: /存档与设置.*本机备份|找回一段人生/ }),
  ).toContainText("旧版修士");
});

test("a corrupt current save stays exportable and a valid backup can recover it", async ({
  page,
}) => {
  await create(page, "损坏前修士");
  await mutateStoredSave(page, "legacy");
  await page.reload();
  await expect(page.locator(".creation-form, .game-shell, .recovery-screen")).toBeVisible();
  if (await page.locator(".creation-more").count()) await creationSettings(page);
  await expect(page.getByRole("heading", { name: "损坏前修士", exact: true })).toBeVisible();
  await mutateStoredSave(page, "corrupt");
  await page.reload();
  await expect(page.locator(".creation-form, .game-shell, .recovery-screen")).toBeVisible();
  if (await page.locator(".creation-more").count()) await creationSettings(page);
  await expect(page.getByRole("alert")).toContainText("可先导出原始进度");
  await page.getByRole("button", { name: "本机备份", exact: true }).click();
  const backups = page.getByRole("dialog", { name: /存档与设置.*本机备份|找回一段人生/ });
  const downloaded = page.waitForEvent("download");
  await backups.getByRole("button", { name: "导出原始进度", exact: true }).click();
  expect(await (await downloaded).path()).toBeTruthy();
  await backups.getByRole("button", { name: "恢复", exact: true }).click();
  await page.getByRole("button", { name: "确认恢复", exact: true }).click();
  await expect(page.getByRole("heading", { name: "损坏前修士", exact: true })).toBeVisible();
});

test("a creation draft exports and imports without creating or replacing a world", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".creation-form, .game-shell, .recovery-screen")).toBeVisible();
  if (await page.locator(".creation-more").count()) await creationSettings(page);
  await page.getByRole("textbox", { name: "姓名", exact: true }).fill("可携草稿");
  await page.getByRole("radio", { name: "男", exact: true }).check();
  await page.locator(".portrait-features input").first().fill("深蓝长袍");
  await expect(page.locator(".creation-form .save-footnote")).toHaveText("创角草稿已保存");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出创角草稿", exact: true }).click();
  const file = await (await download).path();
  await page.getByRole("textbox", { name: "姓名", exact: true }).fill("临时草稿");
  await page.locator(".portrait-features input").first().fill("白袍");
  await expect(page.locator(".creation-form .save-footnote")).toHaveText("创角草稿已保存");
  await page.getByLabel("选择创角草稿", { exact: true }).setInputFiles(file!);
  await expect(page.getByRole("textbox", { name: "姓名", exact: true })).toHaveValue("可携草稿");
  await expect(page.getByRole("radio", { name: "男", exact: true })).toBeChecked();
  await expect(page.locator(".portrait-features input").first()).toHaveValue("深蓝长袍");
  await page.reload();
  await expect(page.locator(".creation-form, .game-shell, .recovery-screen")).toBeVisible();
  if (await page.locator(".creation-more").count()) await creationSettings(page);
  await expect(page.getByRole("textbox", { name: "姓名", exact: true })).toHaveValue("可携草稿");
  await expect(page.getByRole("button", { name: "踏入仙途", exact: true })).toBeVisible();
});
