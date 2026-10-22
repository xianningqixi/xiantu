import {
  growTo,
  answerDaily,
  openDrawerCategory,
  clickPaged,
  turnTo,
  dismissPanels,
} from "./journey-controls";
import { openCurrentLocation, selectLocations } from "./journey-controls";
import { test, expect, type Page, type Locator } from "@playwright/test";

async function saved(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("xiantu-qingshi");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise<any>((resolve, reject) => {
        const tx = db.transaction("saves");
        const request = tx.objectStore("saves").get("current");
        tx.oncomplete = () => resolve(request.result);
        tx.onabort = () => reject(tx.error);
      });
    } finally {
      db.close();
    }
  });
}
async function act(page: Page, button: Locator) {
  const before = await saved(page);
  await page.waitForTimeout(450);
  await turnTo(button);
  await button.click();
  await expect.poll(async () => (await saved(page)).revision).toBeGreaterThan(before.revision);
  await expect(page.getByLabel("本机已存", { exact: true })).toBeAttached();
  return saved(page);
}

test("a bonded adult can cheat in secret and watch a dao companion with someone else", async ({
  page,
}) => {
  test.setTimeout(360000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page.getByRole("textbox", { name: "姓名", exact: true }).fill("问道行人");
  await page.getByRole("button", { name: "踏入仙途", exact: true }).click();
  await expect(page.locator(".dojo")).toBeVisible();
  await growTo(page, "FOUNDATION_1");
  await selectLocations(page);
  const atlas = page.locator("#atlas-page");
  await atlas.locator('[data-atlas-place="atlas.wendao"]').click();
  await act(page, page.locator(".atlas-go"));
  await expect(atlas).not.toBeVisible();
  await openCurrentLocation(page);
  await answerDaily(page);
  await openDrawerCategory(page, "宗门");
  const sect = page.getByRole("region", { name: "宗门修行" });
  await act(page, sect.getByRole("button", { name: /拜访全真派/ }));
  await clickPaged(sect.getByRole("button", { name: /查看宁含章/ }));
  const ning = page.locator('[data-character-id="SECT_QUAN_NING"]');
  await ning.getByRole("tab", { name: "关系", exact: true }).click();
  await act(page, ning.getByRole("button", { name: /^上前见礼/ }));
  await clickPaged(ning.getByRole("button", { name: "相伴与道侣", exact: true }));
  const intimacy = page.getByRole("dialog", { name: /^与.*相处$/ });
  await intimacy.getByRole("button", { name: /^私下亲热/ }).click();
  await act(page, intimacy.getByRole("button", { name: "我愿意，确认私下亲热", exact: true }));
  await intimacy.getByRole("button", { name: /^偷情/ }).click();
  await act(page, intimacy.getByRole("button", { name: "小心掩饰，确认偷情", exact: true }));
  await expect(intimacy).toContainText("这段偷情只写在当事人的生平里");
  expect(
    (await saved(page)).events.some(
      (event: { intimacy?: { kind: string }; text: string }) =>
        event.intimacy?.kind === "affair" &&
        event.text.includes("高潮") &&
        event.text.includes("这段偷情只写在当事人的生平里"),
    ),
  ).toBe(true);
  for (let i = 0; i < 4; i++) await act(page, intimacy.getByRole("button", { name: /^相伴交流/ }));
  await clickPaged(intimacy.getByRole("button", { name: /^结为道侣/ }));
  await act(page, intimacy.getByRole("button", { name: "我愿意，确认结为道侣", exact: true }));
  await dismissPanels(page);
  await openCurrentLocation(page);
  await openDrawerCategory(page, "宗门");
  await clickPaged(sect.getByRole("button", { name: /查看常玄一/ }));
  const chang = page.locator('[data-character-id="SECT_QUAN_CHANG"]');
  await chang.getByRole("tab", { name: "关系", exact: true }).click();
  await act(page, chang.getByRole("button", { name: /^上前见礼/ }));
  await clickPaged(chang.getByRole("button", { name: "相伴与道侣", exact: true }));
  const watching = page.getByRole("dialog", { name: /^与.*相处$/ });
  await clickPaged(watching.getByRole("button", { name: /^亲眼看着道侣出轨/ }));
  await act(page, watching.getByRole("button", { name: "我只看着，确认", exact: true }));
  await expect(watching).toContainText("这一夜的寝取写在三人的生平里");
  expect(
    (await saved(page)).events.some(
      (event: { intimacy?: { kind: string }; text: string; actors: string[] }) =>
        event.intimacy?.kind === "ntr" &&
        event.actors.includes("PLAYER") &&
        event.text.includes("寝取") &&
        event.text.includes("高潮"),
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});
