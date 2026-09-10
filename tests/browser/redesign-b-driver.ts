import { expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
const DAILY_EVENTS = JSON.parse(readFileSync("content-packs/daily-events/events.json", "utf8"))
  .events as { id: string; category: string }[];
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
export async function commandB(page: Page, w: World, c: Command): Promise<World> {
  return (
    await askB(page, {
      kind: "command",
      command: c,
      revision: w.revision,
      expected: { saveId: w.saveId, revision: w.revision },
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
export function replyB(w: World): Command | null {
  if (!w.pendingDailyEventId) return null;
  const n = DAILY_EVENTS.find((n) => n.id === w.pendingDailyEventId)!;
  return { type: "choose", nodeId: n.id, choiceId: n.category === "risk" ? "face" : "decline" };
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
export async function showB(page: Page, w: World) {
  await page.reload();
  await page.waitForFunction(() => !!(window as any).__bAsk);
  await expect(page.getByRole("heading", { name: w.player.name, exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "道场", exact: true }).click();
}
