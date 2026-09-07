import { expect, test, type Page } from '@playwright/test';

async function create(page: Page, name = '浏览器验收') {
  await page.goto('/');
  await page.getByRole('textbox', { name: '姓名', exact: true }).fill(name);
  await page.getByRole('button', { name: '踏入仙途', exact: true }).click();
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
  await expect(page.getByText('本机已存', { exact: true })).toBeVisible();
}
async function settings(page: Page) {
  await page.getByRole('button', { name: '存档与设置', exact: true }).click();
  return page.getByRole('dialog', { name: '收好这一卷人生' });
}

test('draft fields and aptitude survive reloading before the world is created', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  await page.getByRole('textbox', { name: '姓名', exact: true }).fill('草稿修士');
  await page.getByRole('radio', { name: '男', exact: true }).check();
  await page.getByRole('button', { name: '重掷', exact: true }).click();
  const aptitude = await page.getByRole('progressbar', { name: '灵根资质' }).getAttribute('aria-valuenow');
  await expect(page.getByRole('status')).toHaveText('创角草稿已保存');
  await page.reload();
  await expect(page.getByRole('textbox', { name: '姓名', exact: true })).toHaveValue('草稿修士');
  await expect(page.getByRole('radio', { name: '男', exact: true })).toBeChecked();
  await expect(page.getByRole('progressbar', { name: '灵根资质' })).toHaveAttribute('aria-valuenow', aptitude!);
  await expect(page.getByRole('button', { name: '踏入仙途', exact: true })).toBeEnabled();
  expect(errors).toEqual([]);
});

test('double click makes one reward and refresh recovers the committed day', async ({ page }) => {
  await create(page);
  await page.getByRole('button', { name: '接些坊市杂务 1 日 · 获得 6 灵石', exact: true }).dblclick();
  await expect(page.locator('header').getByText('第 2 日', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.locator('header').getByText('第 2 日', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: '浏览器验收', exact: true })).toBeVisible();
});

test('bad import is rejected and canceling an import keeps the original world', async ({ page }) => {
  await create(page, '原档保留');
  const dialog = await settings(page);
  await page.getByLabel('选择存档文件').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{broken') });
  await page.getByRole('button', { name: '再想一想', exact: true }).click();
  await expect(dialog).toBeVisible();
  await page.getByLabel('选择存档文件').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{broken') });
  await page.getByRole('button', { name: '确认继续', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('原进度未改变');
  await page.reload();
  await expect(page.getByRole('heading', { name: '原档保留', exact: true })).toBeVisible();
});

test('another page cannot write to a replaced character even at the same revision', async ({ page, context }) => {
  await create(page, '旧角色');
  const other = await context.newPage(); await other.goto('/');
  await expect(other.getByRole('heading', { name: '旧角色', exact: true })).toBeVisible();
  const dialog = await settings(page);
  await dialog.getByRole('button', { name: '创建新角色', exact: true }).click();
  await page.getByRole('textbox', { name: '姓名', exact: true }).fill('新角色');
  await page.getByRole('button', { name: '踏入仙途', exact: true }).click();
  await page.getByRole('button', { name: '确认继续', exact: true }).click();
  await expect(page.getByRole('heading', { name: '新角色', exact: true })).toBeVisible();
  await other.getByRole('button', { name: '接些坊市杂务 1 日 · 获得 6 灵石', exact: true }).click();
  await expect(other.getByRole('alert')).toContainText('另一页面');
  await other.getByRole('button', { name: '重新读取', exact: true }).click();
  await expect(other.getByRole('heading', { name: '新角色', exact: true })).toBeVisible();
  await expect(other.locator('header').getByText('第 1 日', { exact: true })).toBeVisible();
});

test('backup restore requires confirmation and preserves the replaced character', async ({ page }) => {
  await create(page, '备份甲');
  const dialog = await settings(page);
  await dialog.getByRole('button', { name: '创建新角色', exact: true }).click();
  await page.getByRole('textbox', { name: '姓名', exact: true }).fill('备份乙');
  await page.getByRole('button', { name: '踏入仙途', exact: true }).click();
  await page.getByRole('button', { name: '确认继续', exact: true }).click();
  await expect(page.getByRole('heading', { name: '备份乙', exact: true })).toBeVisible();
  await settings(page);
  await page.getByRole('button', { name: '本机备份', exact: true }).click();
  const backups = page.getByRole('dialog', { name: '找回一段人生' });
  await backups.getByRole('button', { name: '恢复', exact: true }).click();
  await page.getByRole('button', { name: '再想一想', exact: true }).click();
  await expect(backups).toBeVisible();
  await backups.getByRole('button', { name: '恢复', exact: true }).click();
  await page.getByRole('button', { name: '确认恢复', exact: true }).click();
  await page.reload();
  await expect(page.getByRole('heading', { name: '备份甲', exact: true })).toBeVisible();
  await settings(page); await page.getByRole('button', { name: '本机备份', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '找回一段人生' })).toContainText('备份乙');
});

test('exported save can be imported through the actual file control', async ({ page }) => {
  await create(page, '可携带修士');
  const dialog = await settings(page);
  const downloaded = page.waitForEvent('download');
  await dialog.getByRole('button', { name: '导出当前存档', exact: true }).click();
  const download = await downloaded; const path = await download.path(); expect(path).toBeTruthy();
  await page.getByLabel('选择存档文件').setInputFiles(path!);
  await page.getByRole('button', { name: '确认继续', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: '可携带修士', exact: true })).toBeVisible();
});

// Fault fixture preparation uses only this test's isolated browser storage.
async function mutateStoredSave(page: Page, change: 'legacy' | 'corrupt') {
  return page.evaluate(async change => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const q = indexedDB.open('xiantu-qingshi'); q.onsuccess = () => resolve(q.result); q.onerror = () => reject(q.error);
    });
    const before = await new Promise<Record<string, unknown>>((resolve, reject) => {
      const tx = db.transaction('saves', 'readwrite'); const store = tx.objectStore('saves'); const q = store.get('current');
      let original: Record<string, unknown>;
      q.onsuccess = () => {
        original = structuredClone(q.result);
        if (change === 'legacy') { delete q.result.schemaVersion; delete q.result.commandReceipts; }
        else q.result.profile = null;
        store.put(q.result, 'current');
      };
      tx.oncomplete = () => resolve(original); tx.onabort = () => reject(tx.error);
    });
    db.close(); return before;
  }, change);
}

test('legacy browser storage upgrades on a copy and exposes the original backup', async ({ page }) => {
  await create(page, '旧版修士');
  await mutateStoredSave(page, 'legacy');
  await page.reload();
  await expect(page.getByRole('heading', { name: '旧版修士', exact: true })).toBeVisible();
  await expect(page.locator('header').getByText('第 1 日', { exact: true })).toBeVisible();
  await settings(page); await page.getByRole('button', { name: '本机备份', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '找回一段人生' })).toContainText('旧版修士');
});

test('a corrupt current save stays exportable and a valid backup can recover it', async ({ page }) => {
  await create(page, '损坏前修士');
  await mutateStoredSave(page, 'legacy'); await page.reload();
  await expect(page.getByRole('heading', { name: '损坏前修士', exact: true })).toBeVisible();
  await mutateStoredSave(page, 'corrupt'); await page.reload();
  await expect(page.getByRole('alert')).toContainText('可先导出原始进度');
  await page.getByRole('button', { name: '本机备份', exact: true }).click();
  const backups = page.getByRole('dialog', { name: '找回一段人生' });
  const downloaded = page.waitForEvent('download');
  await backups.getByRole('button', { name: '导出原始进度', exact: true }).click();
  expect(await (await downloaded).path()).toBeTruthy();
  await backups.getByRole('button', { name: '恢复', exact: true }).click();
  await page.getByRole('button', { name: '确认恢复', exact: true }).click();
  await expect(page.getByRole('heading', { name: '损坏前修士', exact: true })).toBeVisible();
});
