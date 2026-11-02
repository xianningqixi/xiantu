import { test, expect, type Page } from "@playwright/test";
import { installBDriver, commandB, createB, loadB, showB, replyB } from "./redesign-b-driver";
import { openCurrentLocation, dismissPanels, openMore } from "./journey-controls";
import type { World } from "../../lib/game/types";

const HERO = "shichai.chunshui.suqingyan";
const RIVAL = "shichai.chunshui.qiheng";

/**
 * 被夺线的翻盘是一场当面决斗。存档直接推到「lost-3 已在眼前」，
 * 只验真实 UI：卡片能出现、按钮能把人拖进决斗面板、打完写回胜利字段。
 */
async function stage(page: Page, w: World): Promise<World> {
  await page.evaluate(
    async ([hero, rival]) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const q = indexedDB.open("xiantu-qingshi");
        q.onsuccess = () => resolve(q.result);
        q.onerror = () => reject(q.error);
      });
      const save = await new Promise<any>((resolve, reject) => {
        const tx = db.transaction("saves", "readwrite");
        const store = tx.objectStore("saves");
        const q = store.get("current");
        q.onsuccess = () => {
          const s = q.result;
          s.player.location = "inn";
          s.player.realm = 3;
          s.player.manual = true;
          s.player.hp = [0, 22, 32, 46, 62, 86, 112, 140, 176, 214, 258, 306, 372][3];
          s.player.stones = 60;
          s.contentState[`${hero}.flag.met`] = true;
          s.contentState[`${hero}.flag.lost`] = true;
          s.contentState[`${hero}.flag.lost2`] = true;
          // 节点本身的消费键是裸 id；同一位女主只占一个槽，前置节点不消费就会把 lost-3 挡在外面。
          s.contentState[`${hero}.lost`] = true;
          s.contentState[`${hero}.lost-2`] = true;
          // 前两幕也要消费掉；否则它们占着主位，lost-3 只是没有按钮的旁白卡。
          s.contentState[`${hero}.lost`] = true;
          s.contentState[`${hero}.lost-2`] = true;
          // 卷首 intro 必须已被消费，否则过滤只放 intro、旁支永远挤不进来。
          s.contentState["shichai.chunshui.intro"] = true;
          s.contentState["shichai.chunshui.prologue"] = true;
          // 校验器要求这项是 null 或一个真实事件 id，delete 会留下 undefined。
          s.pendingDailyEventId = null;
          delete s.longAction;
          delete s.battle;
          delete s.loot;
          for (const n of s.npcs) if (n.id === hero || n.id === rival) n.location = "inn";
          store.put(s, "current");
          resolve(s);
        };
        q.onerror = () => reject(q.error);
      });
      db.close();
      return save;
    },
    [HERO, RIVAL],
  );
  await showB(page, w);
  return loadB(page);
}

/** 把当天的修行走完：一次 wait 只留下待办的一格，要再 step 掉它才真正过完这一天。 */
async function walkDay(page: Page, w: World): Promise<World> {
  let cur = w;
  for (let i = 0; i < 10; i++) {
    const reply = replyB(cur);
    if (reply) {
      cur = await commandB(page, cur, reply);
      continue;
    }
    if (!cur.longAction) break;
    cur = await commandB(page, cur, { type: "step" });
  }
  return cur;
}

/** 等到目标卡片出现在屏幕上。修行中的当天不出旁支，所以每轮都得把行动走完再审。 */
async function untilScene(page: Page, id: string): Promise<World> {
  let w = await loadB(page);
  for (let i = 0; i < 40; i++) {
    // 挂着日常事件时规则层一律不给旁支，必须先把它答掉。
    const reply = replyB(w);
    if (reply) {
      w = await commandB(page, w, reply);
      continue;
    }
    // 命令回的是新存档，页面自己不会重读，必须重挂一次才看得到新场景。
    await showB(page, w);
    if (await page.locator(`[data-story-id="${id}"]`).count()) return w;
    if (!w.longAction) w = await commandB(page, w, { type: "wait", days: 1 });
    w = await walkDay(page, w);
  }
  throw new Error(`${id} 没有出现`);
}

test("losing a heroine opens a real duel, and winning writes the comeback flag", async ({
  page,
}) => {
  test.setTimeout(180000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1280, height: 900 });
  await installBDriver(page);
  const created = await createB(page);
  let w = await stage(page, created);
  w = await untilScene(page, `${HERO}.lost-3`);

  // 这一场是当期主位：正文在场景区，选项被投影到道场按钮栏。
  await expect(page.locator(".dojo-story h1")).toHaveText("丹房外的雪");
  const duelButton = page.locator(".dojo-primary");
  await expect(duelButton).toContainText("拔剑，就在这里分个明白");
  await duelButton.click();

  // 决斗面板开在「更多行动」抽屉里：专属标题、专属说明、情敌立绘（不是秘境图）。
  await openMore(page);
  const controls = page.locator("#battle-controls");
  await expect(controls).toBeVisible({ timeout: 15000 });
  const ceiling = page.locator(".battle-panel .section-heading");
  await expect(ceiling).toContainText("当面之争");
  await expect(ceiling).toContainText("退无可退");
  await expect(ceiling).toContainText("此争斗不伤性命");
  expect((await loadB(page)).battle?.kind).toBe("duel");
  expect((await loadB(page)).battle?.flags?.win).toBe(`${HERO}.flag.lost3`);

  // 打赢：字段必须落到存档里，而不是只在 UI 上闪一下。
  await page.getByRole("switch", { name: "自动战斗", exact: true }).click();
  await expect.poll(async () => !!(await loadB(page)).battle, { timeout: 60000 }).toBe(false);
  let after = await loadB(page);
  expect(after.contentState[`${HERO}.flag.lost3`]).toBe(true);
  expect(after.contentState[`${HERO}.flag.lost3-lose`]).toBeUndefined();

  // 赢了之后这条线要往下走：隔一场戏就能看到回来的人。
  await dismissPanels(page);
  after = await walkDay(page, after);
  await untilScene(page, `${HERO}.lost-win`);
  await expect(page.locator(".dojo-story h1")).toHaveText("药圃边上的一句话");
  expect(errors).toEqual([]);
});

test("a duel can be called off, and the flag then lets the player try again", async ({ page }) => {
  test.setTimeout(180000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await installBDriver(page);
  const created = await createB(page);
  let w = await stage(page, created);
  w = await untilScene(page, `${HERO}.lost-3`);
  await expect(page.locator(`#current-scene[data-story-id="${HERO}.lost-3"]`)).toHaveCount(1);
  await page.locator(".dojo-primary").click();
  await openMore(page);
  await expect(page.locator("#battle-controls")).toBeVisible({ timeout: 15000 });

  // 主动撤退：算没赢，但不能把玩家卡死在一条永远打不开的线上。
  // 撤退本身有成功率，所以要反复按到真的脱身；窄屏的动作栏又会被翻页导航压住，
  // 直接派发点击比让 Playwright 做命中测试稳。
  for (let i = 0; i < 30 && (await loadB(page)).battle; i++) {
    const clicked = await page.evaluate(() => {
      const button = [
        ...document.querySelectorAll<HTMLButtonElement>("#battle-controls button"),
      ].find((b) => b.textContent?.trim().startsWith("撤退"));
      button?.click();
      return !!button;
    });
    expect(clicked).toBe(true);
    await page.waitForTimeout(400);
  }
  expect((await loadB(page)).battle!).toBeFalsy();
  await dismissPanels(page);
  // 撤退成功后页面仍是战斗前的旧画面，必须重挂才能落到场景。
  await showB(page, await loadB(page));
  const after = await loadB(page);
  expect(after.contentState[`${HERO}.flag.lost3`]).toBeUndefined();
  expect(after.contentState[`${HERO}.flag.lost3-lose`]).toBe(true);

  // 窄屏也要能看到重来那张卡片，且按钮不被裁掉。
  const next = await untilScene(page, `${HERO}.lost-retry`);
  await expect(page.locator(".dojo-story h1")).toHaveText("剑落在雪里");
  await expect(page.locator(".dojo-primary")).toContainText("说明你还会再来");
  // 窄屏不能把重来的入口裁出屏幕。
  const box = (await page.locator(".dojo-primary").boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  expect(next.player.stones).toBeGreaterThanOrEqual(20);
  expect(errors).toEqual([]);
});
