import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createWorld } from "../../lib/game/engine";
import { migrateSave } from "../../lib/game/migrations";
import { EXTENSIONS } from "../../lib/game/content/extensions";
import { CAMPAIGN_LOCKS } from "../../lib/game/campaign-content";

type Migration = {
  from: string;
  packId: string;
  toVersion: string;
  locations: Record<string, string>;
};
const migrations = JSON.parse(
  readFileSync("lib/game/content/journey-migrations.json", "utf8"),
) as Migration[];
const profile = {
  name: "旧档",
  sex: "male" as const,
  aptitude: 70,
  artifact: "focus" as const,
  mode: "simple" as const,
  appearance: { face: 0, hair: 0, color: 0 },
};

/**
 * 每次发布新内容，玩家的旧档都带着上一版的内容锁。没有登记的旧锁等于旧档打不开，
 * 所以「已发布的锁必须留在迁移表里」这件事要有测试盯着。
 */
test("every migration reads like a released archive: unique sources, known target, current locks excluded", () => {
  const sources = migrations.map((m) => m.from);
  assert.equal(new Set(sources).size, sources.length, "迁移表里有重复的旧锁");
  const installed = new Set(EXTENSIONS.map((e) => e.data.manifest.packId));
  for (const packId of new Set(migrations.map((m) => m.packId)))
    assert.ok(installed.has(packId), `${packId} 已不在安装列表里`);
  // 主线四卷一直在发布，必须始终保留升级路径。
  for (const lock of CAMPAIGN_LOCKS)
    assert.ok(
      migrations.some((m) => m.from === lock || m.packId === lock.split("@")[0]),
      `${lock} 所在包缺少迁移入口`,
    );
  for (const migration of migrations) {
    assert.match(migration.from, /@\d+\.\d+\.\d+:[0-9a-f]{64}$/);
    assert.equal(migration.toVersion, "0.2.0");
    const target = EXTENSIONS.find(
      (e) => e.data.manifest.packId === migration.packId && e.lock === migration.from,
    );
    assert.equal(
      target,
      undefined,
      `${migration.packId} 把当前锁 ${migration.from} 也登记成了旧锁`,
    );
    assert.equal(typeof migration.locations, "object", `${migration.from} 缺少地点映射字段`);
  }
});

test("a save on the previous release's lock upgrades instead of failing to load", () => {
  const stale = migrations.find((m) => m.packId === "shichai.chunshui")!;
  const world = structuredClone(createWorld(1234, profile, "stale-lock")) as unknown as {
    contentLocks: string[];
  };
  world.contentLocks = world.contentLocks.map((lock) =>
    lock.includes("shichai.chunshui") ? stale.from : lock,
  );
  const migrated = migrateSave(world).world;
  assert.ok(!migrated.contentLocks.includes(stale.from), "旧锁没有被升级");
  const pack = EXTENSIONS.find((e) => e.data.manifest.packId === "shichai.chunshui")!;
  assert.ok(migrated.contentLocks.includes(pack.lock));
  // 主线四卷仍然齐全，迁移不该顺手丢掉别的包。
  for (const lock of CAMPAIGN_LOCKS.slice(1)) assert.ok(migrated.contentLocks.includes(lock));
});
