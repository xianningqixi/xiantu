import { expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
const DAILY_EVENTS = JSON.parse(readFileSync("content-packs/daily-events/events.json", "utf8"))
  .events as {
  id: string;
  category: string;
  choices: { id: string; effects: { kind: string; value?: number }[] }[];
}[];
const BAL = JSON.parse(readFileSync("lib/game/content/balance.json", "utf8"));
const advanceRule = (p: World["player"]) =>
  BAL.cultivation.advanceRules[BAL.cultivation.realmOrder[p.realm]];
const threshold = (p: World["player"]) => advanceRule(p).requiredExperience;
import type { Command, World } from "../../lib/game/types";
export async function installBDriver(page: Page) {
  await page.addInitScript(() => {
    const Native = window.Worker;
    let serial = Number(sessionStorage.getItem("redesign-b-serial") || 0);
    (window as any).__bProgress = [];
    window.Worker = class extends Native {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        if (options?.name !== "xiantu-game") return;
        (window as any).__bWorker = this;
        const waiters = new Map<string, (v: any) => void>();
        this.addEventListener("message", ({ data }) => {
          if (data.progress) {
            (window as any).__bProgress.push(data.progress);
            return;
          }
          const resolve = waiters.get(data.id);
          if (resolve) {
            waiters.delete(data.id);
            resolve(data);
          }
        });
        (window as any).__bAsk = (input: any) =>
          new Promise((resolve) => {
            const id = `browser-b:${++serial}`;
            sessionStorage.setItem("redesign-b-serial", String(serial));
            waiters.set(id, resolve);
            this.postMessage({ ...input, id, protocolVersion: 1 });
          });
      }
    };
  });
  await page.goto("/");
  await page.waitForFunction(() => !!(window as any).__bAsk);
}
export async function askB(page: Page, input: any) {
  const r = await page.evaluate((input) => (window as any).__bAsk(input), input);
  expect(r.ok, r.error).toBe(true);
  return r;
}
/**
 * 把当前战斗打完并返回最新存档。自从日常遭遇会真的开战，
 * 任何「推进时间」的夹具都可能中途踩进战斗，之后再发命令就被「请先完成当前战斗」挡住。
 */
export async function settleBattleB(page: Page, w: World): Promise<World> {
  let cur = w;
  for (let i = 0; i < 400 && cur.battle; i++) {
    const ally = cur.battle.allies.find((a) => a.id === "PLAYER");
    const hurt = ally !== undefined && ally.hp / ally.maxHp <= 0.34 && cur.player.healing > 0;
    const target = cur.battle.enemies.find((e) => e.hp > 0)?.id;
    cur = (
      await askB(page, {
        kind: "command",
        command: hurt
          ? { type: "battle", action: "heal" }
          : { type: "battle", action: "attack", target },
        revision: cur.revision,
        expected: { saveId: cur.saveId, revision: cur.revision },
      })
    ).state;
  }
  return cur;
}
export async function commandB(page: Page, w: World, c: Command): Promise<World> {
  // 战斗指令本身要留给调用方控制节奏，其余命令先把拦路的战斗收掉。
  let cur = c.type === "battle" ? w : await settleBattleB(page, w);
  return (
    await askB(page, {
      kind: "command",
      command: c,
      revision: cur.revision,
      expected: { saveId: cur.saveId, revision: cur.revision },
    })
  ).state;
}
export async function createB(page: Page, aptitude = 90): Promise<World> {
  return (
    await askB(page, {
      kind: "create",
      seed: 42,
      profile: {
        name: `资质${aptitude}`,
        sex: "female",
        aptitude,
        artifact: "ward",
        mode: "simple",
        appearance: { face: 0, hair: 0, color: 0 },
      },
      expected: { saveId: null, revision: null },
    })
  ).state;
}
/**
 * 应答待处理的日常事件：优先挑不花钱的那一支，因为事件作者会换选项 id，
 * 硬编码 face / decline 迟早失效。
 */
export function replyB(w: World): Command | null {
  if (!w.pendingDailyEventId) return null;
  const n = DAILY_EVENTS.find((n) => n.id === w.pendingDailyEventId)!;
  // 事件作者的选项 id 会变，按「这条选项真要花多少随身物资」现算一遍。
  const affordable = n.choices.filter((c) =>
    ["stones", "grass", "healing", "insight"].every(
      (kind) =>
        (w.player as unknown as Record<string, number>)[kind] +
          c.effects.filter((e) => e.kind === kind).reduce((sum, e) => sum + (e.value ?? 0), 0) >=
        0,
    ),
  );
  const pick = affordable.at(0) ?? n.choices.at(-1)!;
  return { type: "choose", nodeId: n.id, choiceId: pick.id };
}
export function growthB(w: World): Command {
  const reply = replyB(w);
  if (reply) return reply;
  if (w.longAction) return { type: "step" };
  if (!w.player.manual)
    return w.player.location === "inn" ? { type: "learn" } : { type: "travel", to: "inn" };
  if (w.player.xp >= threshold(w.player))
    return advanceRule(w.player).kind === "minor"
      ? { type: "advanceMinor" }
      : { type: "breakthrough", usePill: false, guardian: false };
  return { type: "train", days: 7, stoneMethod: false, stopWhen: { kind: "cultivationReady" } };
}
/** 从 Worker 重新读出当前存档，避免页面重载后手里的 state 过期。 */
export async function loadB(page: Page): Promise<World> {
  return (await askB(page, { kind: "load" })).state;
}
export async function showB(page: Page, w: World) {
  await page.reload();
  await page.waitForFunction(() => !!(window as any).__bAsk);
  await expect(page.getByRole("heading", { name: w.player.name, exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "道场", exact: true }).click();
}
