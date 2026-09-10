import { openCurrentLocation, selectLocations } from "./journey-controls";
import { test, expect, type Page } from "@playwright/test";
import { mkdirSync, readFileSync } from "node:fs";
const B = JSON.parse(readFileSync("lib/game/content/balance.json", "utf8"));
const output = "/tmp/xiantu-character-qa";
mkdirSync(output, { recursive: true });
const realms = B.cultivation.realmOrder;
async function world(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const q = indexedDB.open("xiantu-qingshi");
      q.onsuccess = () => resolve(q.result);
      q.onerror = () => reject(q.error);
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
  });
}
async function checkAttributes(page: Page, actor: any) {
  const sheet = page.locator(`[data-character-id="${actor.id}"]`);
  await expect(sheet).toBeVisible();
  const values = B.combat.realmStats[realms[actor.realm]];
  for (const [key, expected] of Object.entries({
    hp: `${actor.hp} / ${values.maxHp}`,
    xp: `${actor.xp} / ${B.cultivation.advanceRules[realms[actor.realm]].requiredExperience}`,
    aptitude: `${actor.aptitude} / 100`,
    attack: values.attack,
    defense: values.defense,
    speed: values.speed,
    stones: actor.stones,
    healing: actor.healing,
    height: `${actor.physique.heightCm} cm`,
    pills: actor.pills,
    grass: actor.grass,
  })) {
    const cell = sheet.locator(`[data-stat="${key}"]`);
    await expect(cell).toContainText(String(expected));
  }
}
test("all local NPCs and the player expose live attributes, directed relations and history without revealing remote residents", async ({
  page,
}) => {
  test.setTimeout(240000);
  const errors: string[] = [];
  let generated = 0;
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/portraits") generated++;
  });
  await page.goto("/");
  await expect(page).toHaveTitle(/仙途/);
  await page.getByRole("textbox", { name: "姓名", exact: true }).fill("属性验收");
  await page.getByRole("button", { name: "踏入仙途", exact: true }).click();
  await expect(page.getByLabel("本机已存", { exact: true })).toBeVisible();
  await openCurrentLocation(page);
  for (let i = 0; i < 4; i++) {
    const before = (await world(page)).revision;
    await page.locator(".dojo-primary").click();
    await expect.poll(async () => (await world(page)).revision).toBeGreaterThan(before);
  }
  const snapshot = await world(page);
  expect(snapshot.npcs).toHaveLength(123);
  await page.locator(".status-profile").click();
  await checkAttributes(page, snapshot.player);
  let dialog = page.getByRole("dialog");
  await dialog.getByRole("tab", { name: "关系", exact: true }).click();
  await expect(dialog.locator('[data-relation-peer="NPC_LIN_WAN"]')).toBeVisible();
  const toPlayer = snapshot.relations.find(
    (r: any) => r.from === "NPC_LIN_WAN" && r.to === "PLAYER",
  );
  const fromPlayer = snapshot.relations.find(
    (r: any) => r.from === "PLAYER" && r.to === "NPC_LIN_WAN",
  );
  const relation = dialog.locator('[data-relation-peer="NPC_LIN_WAN"]');
  await expect(relation.locator(".sheet-attitude").nth(0)).toContainText(`好感${fromPlayer.favor}`);
  await expect(relation.locator(".sheet-attitude").nth(1)).toContainText(`好感${toPlayer.favor}`);
  await dialog.screenshot({ path: `${output}/player-relations-desktop.png` });
  await relation.locator(".sheet-peer").click();
  await checkAttributes(
    page,
    snapshot.npcs.find((a: any) => a.id === "NPC_LIN_WAN"),
  );
  await page.keyboard.press("Escape");
  await page.locator(".dojo-speaker").click();
  await checkAttributes(
    page,
    snapshot.npcs.find((a: any) => a.id === "NPC_LIN_WAN"),
  );
  await page.keyboard.press("Escape");
  await page.getByRole("tab", { name: "人物", exact: true }).click();
  await page.getByRole("button", { name: "查看全部人物", exact: true }).click();
  await page.getByLabel("人物范围", { exact: true }).selectOption("region");
  const rows = page.locator(".person-row");
  const visibleIds = new Set<string>();
  for (let pageIndex = 0; pageIndex < 10; pageIndex++) {
    for (let i = 0; i < (await rows.count()); i++) {
      await rows.nth(i).getByRole("heading").click();
      await expect(page.locator(".profile-modal")).toBeVisible();
      const id = (await page.locator(".character-sheet").getAttribute("data-character-id"))!;
      expect(visibleIds.has(id)).toBe(false);
      visibleIds.add(id);
      await checkAttributes(
        page,
        snapshot.npcs.find((a: any) => a.id === id),
      );
      await expect(page.getByRole("dialog")).toContainText("身份与心愿");
      await page.keyboard.press("Escape");
      await expect(page.locator(".profile-modal")).toHaveCount(0);
    }
    const next = page.getByRole("button", { name: "下一页", exact: true });
    if (await next.isDisabled()) break;
    await next.click();
  }
  const atlas = JSON.parse(readFileSync("content-packs/world-atlas/map.json", "utf8"));
  const regionSites = new Set([
    "market",
    "inn",
    "gate",
    "ruins",
    ...atlas.places.filter((p: any) => p.region === "qingshi").map((p: any) => p.to),
  ]);
  expect([...visibleIds].sort()).toEqual(
    snapshot.npcs
      .filter((a: any) => regionSites.has(a.location))
      .map((a: any) => a.id)
      .sort(),
  );
  await page.getByRole("searchbox", { name: "搜索姓名", exact: true }).fill("林晚");
  expect(await world(page)).toEqual(snapshot);
  await rows.filter({ hasText: "林晚" }).click();
  dialog = page.getByRole("dialog");
  await dialog.screenshot({ path: `${output}/npc-attributes-desktop.png` });
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    for (const tab of ["属性", "关系", "经历", "立绘"]) {
      await dialog.getByRole("tab", { name: tab, exact: true }).click();
      await expect.poll(() => dialog.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
      await expect
        .poll(() =>
          dialog.evaluate((element) => {
            const bounds = element.getBoundingClientRect();
            return bounds.left >= 0 && bounds.right <= innerWidth;
          }),
        )
        .toBe(true);
      await dialog.evaluate((element) => {
        element.scrollTop = 0;
      });
      if (tab === "属性" || tab === "关系")
        await dialog.screenshot({ path: `${output}/npc-${tab}-${width}.png` });
    }
    const portrait = dialog.locator(".fullbody-frame img");
    await expect(portrait).toBeVisible();
    expect(
      await portrait.evaluate((img: HTMLImageElement) => getComputedStyle(img).objectFit),
    ).toBe("contain");
  }
  await dialog.getByRole("tab", { name: "经历", exact: true }).click();
  await expect(dialog.locator(".sheet-memory").first()).toContainText("第");
  expect(await world(page)).toEqual(snapshot);
  await page.keyboard.press("Escape");
  await page.reload();
  await expect(page.locator(".status-profile")).toBeVisible();
  expect(await world(page)).toEqual(snapshot);
  expect(errors).toEqual([]);
  expect(generated).toBe(0);
});

test("NPC history shows personal events before acquaintance, with biography and no knowledge or save writes", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page).toHaveTitle(/仙途/);
  await page.getByRole("textbox", { name: "姓名", exact: true }).fill("生平验收");
  await page.getByRole("button", { name: "踏入仙途", exact: true }).click();
  await expect(page.getByLabel("本机已存", { exact: true })).toBeVisible();
  await openCurrentLocation(page);
  const initial = await world(page);
  await page.locator(".dojo-speaker").click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("tab", { name: "经历", exact: true }).click();
  await expect(dialog.getByRole("region", { name: "生平小传" })).toContainText("常在坊市药摊之间");
  await expect(dialog).toContainText("林晚的个人经历 · 0 条");
  await expect(dialog).toContainText("此世尚无新的经历记录");
  await expect(dialog).not.toContainText("共同经历与已知近况");
  expect(await world(page)).toEqual(initial);
  await dialog.screenshot({ path: `${output}/history-biography-desktop.png` });
  await page.keyboard.press("Escape");
  let state = initial;
  const candidate = (w: any) =>
    w.npcs.find(
      (actor: any) =>
        ["market", "inn", "gate"].includes(actor.location) &&
        w.npcs.filter((other: any) => other.name === actor.name).length === 1 &&
        !w.relations.some((r: any) => r.from === actor.id && r.to === "PLAYER" && r.known) &&
        w.events.some(
          (event: any) =>
            event.actors.includes(actor.id) &&
            !event.actors.includes("PLAYER") &&
            !w.knowledge[event.id]?.some((row: number[]) => row[0] === 0),
        ),
    );
  for (let i = 0; i < 12 && !candidate(state); i++) {
    await page.getByRole("button", { name: /接些坊市杂务/ }).click();
    await expect.poll(async () => (await world(page)).revision).toBeGreaterThan(state.revision);
    state = await world(page);
  }
  const actor = candidate(state);
  expect(actor).toBeTruthy();
  const own = state.events.filter((e: any) => e.actors.includes(actor.id));
  const unseen = own.find(
    (event: any) => !state.knowledge[event.id]?.some((row: number[]) => row[0] === 0),
  );
  expect(unseen).toBeTruthy();
  await page.getByRole("tab", { name: "人物", exact: true }).click();
  await page.getByRole("button", { name: "查看全部人物", exact: true }).click();
  await page.getByLabel("人物范围", { exact: true }).selectOption("region");
  await page.getByRole("searchbox", { name: "搜索姓名", exact: true }).fill(actor.name);
  await page
    .locator(".person-row")
    .filter({ has: page.getByRole("heading", { name: new RegExp(`^${actor.name}`) }) })
    .click();
  await dialog.getByRole("tab", { name: "经历", exact: true }).click();
  await expect(dialog).toContainText(`${actor.name}的个人经历 · ${own.length} 条`);
  await expect(dialog.locator(`[data-event-id="${unseen.id}"]`)).toContainText(unseen.text);
  await expect(dialog.locator(`[data-event-id="${unseen.id}"]`)).toContainText("个人经历");
  for (const item of await dialog.locator(".sheet-memory").all()) {
    const id = await item.getAttribute("data-event-id");
    expect(own.some((e: any) => e.id === id)).toBe(true);
  }
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await expect
      .poll(() =>
        dialog.evaluate((element) => {
          const r = element.getBoundingClientRect();
          return r.left >= 0 && r.right <= innerWidth && element.scrollWidth <= element.clientWidth;
        }),
      )
      .toBe(true);
    await dialog.evaluate((el) => {
      el.scrollTop = 0;
    });
    await dialog.screenshot({ path: `${output}/history-personal-${width}.png` });
  }
  expect(await world(page)).toEqual(state);
  await page.keyboard.press("Escape");
  await page.reload();
  await expect(page.locator(".status-profile")).toBeVisible();
  expect(await world(page)).toEqual(state);
  expect(errors).toEqual([]);
});
