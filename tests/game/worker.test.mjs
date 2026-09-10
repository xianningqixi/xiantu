import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { webcrypto } from "node:crypto";
import { buildSync } from "esbuild";
import { IDBFactory } from "fake-indexeddb";

// Execute the unchanged production Worker message handler. Only the browser storage API
// is replaced with a standards-oriented in-memory implementation; this is not browser QA.
const source = buildSync({
  entryPoints: ["lib/game/simulation.worker.ts"],
  bundle: true,
  platform: "browser",
  format: "iife",
  write: false,
}).outputFiles[0].text;
const factorySource = buildSync({
  entryPoints: ["tests/game/synthetic-world.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
}).outputFiles[0].text;
const { syntheticFixture: fixture } = await import(
  `data:text/javascript;base64,${Buffer.from(factorySource).toString("base64")}`
);
const profile = {
  name: "复测甲",
  sex: "female",
  aptitude: 75,
  artifact: "focus",
  mode: "simple",
  appearance: { face: 0, hair: 1, color: 0 },
};
const expected = (w) => ({ saveId: w?.saveId ?? null, revision: w?.revision ?? null });
const builtins = JSON.parse(readFileSync("lib/game/content/extensions.json", "utf8")).filter(
  (e) => e.data.journey,
);
const campaignNpcCount = builtins.reduce((n, e) => n + e.data.definitions.characters.length, 0);
let clientSerial = 0;

function environment() {
  const factory = new IDBFactory();
  const fault = { denyOpen: false, abortWrite: false, aborted: 0 };
  const storage = {
    open(...args) {
      if (fault.denyOpen) throw new DOMException("Storage unavailable", "SecurityError");
      const request = factory.open(...args);
      request.addEventListener("success", () => {
        const db = request.result;
        const transaction = db.transaction.bind(db);
        db.transaction = (...args) => {
          const tx = transaction(...args);
          const objectStore = tx.objectStore.bind(tx);
          tx.objectStore = (name) => {
            const store = objectStore(name);
            if (name === "saves" && tx.mode === "readwrite") {
              const put = store.put.bind(store);
              store.put = (...args) => {
                const request = put(...args);
                request.addEventListener("success", () => {
                  if (fault.abortWrite) {
                    fault.aborted++;
                    tx.abort();
                  }
                });
                return request;
              };
            }
            return store;
          };
          return tx;
        };
      });
      return request;
    },
  };
  function client(onProgress = () => {}) {
    const id = ++clientSerial;
    let serial = 0;
    const pending = new Map();
    const scope = {
      onmessage: null,
      postMessage(response) {
        const waiter = pending.get(response.id);
        assert.ok(waiter, "unexpected Worker response");
        if (response.progress) {
          onProgress(structuredClone(response));
          return;
        }
        pending.delete(response.id);
        clearTimeout(waiter.timeout);
        waiter.resolve(structuredClone(response));
      },
    };
    vm.runInNewContext(source, {
      self: scope,
      indexedDB: storage,
      crypto: webcrypto,
      TextEncoder,
      structuredClone,
    });
    return {
      send(input) {
        const message = structuredClone({ id: `test-client:${id}:${++serial}`, ...input });
        return new Promise((resolve, reject) => {
          const timeout = setTimeout(
            () => reject(new Error(`Worker did not acknowledge ${input.kind}`)),
            2000,
          );
          pending.set(message.id, { resolve, timeout });
          scope.onmessage({ data: message });
        });
      },
      async load() {
        const r = await this.send({ kind: "load" });
        assert.equal(r.ok, true, r.error);
        return r.state;
      },
      async create(previous = null, name = profile.name) {
        const r = await this.send({
          kind: "create",
          profile: { ...profile, name },
          seed: 12345,
          replace: !!previous,
          expected: expected(previous),
        });
        assert.equal(r.ok, true, r.error);
        return r.state;
      },
      work(w) {
        return this.send({
          kind: "command",
          command: { type: "work" },
          revision: w.revision,
          expected: expected(w),
        });
      },
    };
  }
  async function records(store) {
    const db = await new Promise((resolve, reject) => {
      const q = factory.open("xiantu-qingshi");
      q.onsuccess = () => resolve(q.result);
      q.onerror = () => reject(q.error);
    });
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(store, "readonly");
        const q = tx.objectStore(store).getAll();
        tx.oncomplete = () => resolve(q.result);
        tx.onabort = () => reject(tx.error);
      });
    } finally {
      db.close();
    }
  }
  async function seedLegacy(world) {
    const db = await new Promise((resolve, reject) => {
      const q = factory.open("xiantu-qingshi");
      q.onupgradeneeded = () => {
        q.result.createObjectStore("saves");
        q.result.createObjectStore("backups");
      };
      q.onsuccess = () => resolve(q.result);
      q.onerror = () => reject(q.error);
    });
    await new Promise((resolve, reject) => {
      const tx = db.transaction("saves", "readwrite");
      tx.objectStore("saves").put(world, "current");
      tx.oncomplete = resolve;
      tx.onabort = () => reject(tx.error);
    });
    db.close();
  }
  return { client, fault, records, seedLegacy };
}

test("create, export and a fresh Worker preserve the complete saved world", async () => {
  const env = environment();
  const a = env.client();
  assert.equal(await a.load(), null);
  const world = await a.create();
  assert.equal(world.npcs.length, 100 + campaignNpcCount);
  assert.equal(world.contentLocks.length, 4);
  assert.equal(world.npcs.slice(40, 100).filter((npc) => npc.sex === "female").length, 60);
  assert.equal(world.npcs.slice(40, 100).filter((npc) => npc.npcTemplateId === npc.id).length, 60);
  const exported = await a.send({ kind: "export", expected: expected(world) });
  assert.equal(exported.ok, true);
  assert.deepEqual(JSON.parse(exported.text), world);
  assert.deepEqual(await env.client().load(), world);
});

test("generated day-9 and day-40 worlds import intact and keep the replaced save in backups", async () => {
  const env = environment();
  const a = env.client();
  let previous = await a.create();
  for (const name of ["early", "evolved"]) {
    const imported = fixture(name);
    const r = await a.send({
      kind: "import",
      text: JSON.stringify(imported),
      replace: true,
      expected: expected(previous),
    });
    assert.equal(r.ok, true, r.error);
    assert.notEqual(r.state.saveId, imported.saveId);
    assert.equal(r.state.revision, imported.revision + 1);
    assert.equal(r.state.npcs.length, imported.npcs.length + campaignNpcCount);
    assert.equal(r.state.contentLocks.length, 4);
    const normalized = {
      ...r.state,
      saveId: imported.saveId,
      revision: imported.revision,
      npcs: r.state.npcs.slice(0, imported.npcs.length),
      contentLocks: imported.contentLocks,
    };
    assert.deepEqual(normalized, imported);
    assert.deepEqual(await env.client().load(), r.state);
    assert.ok(
      (await env.records("backups")).some(
        (w) => w.saveId === previous.saveId && w.revision === previous.revision,
      ),
    );
    previous = r.state;
  }
});

test("unconfirmed replacement and malformed imports leave the current save and backups untouched", async () => {
  const env = environment();
  const a = env.client();
  const world = await a.create();
  const denied = await a.send({
    kind: "import",
    text: JSON.stringify(fixture("early")),
    replace: false,
    expected: expected(world),
  });
  assert.equal(denied.ok, false);
  for (const text of [
    "{broken",
    "null",
    JSON.stringify({ ...world, profile: null }),
    JSON.stringify({ ...world, story: { flags: null } }),
    "x".repeat(5 * 1024 * 1024 + 1),
  ]) {
    const r = await a.send({ kind: "import", text, replace: true, expected: expected(world) });
    assert.equal(r.ok, false);
    assert.deepEqual(await env.client().load(), world);
    assert.deepEqual(await env.records("backups"), []);
  }
});

test("two independent Workers racing to act commit exactly one day and one reward", async () => {
  const env = environment();
  const a = env.client(),
    b = env.client();
  const original = await a.create();
  assert.deepEqual(await b.load(), original);
  const replies = await Promise.all([a.work(original), b.work(original)]);
  assert.equal(replies.filter((r) => r.ok).length, 1);
  assert.equal(replies.filter((r) => !r.ok).length, 1);
  const saved = await env.client().load();
  assert.equal(saved.day, original.day + 1);
  assert.equal(saved.player.stones, original.player.stones + 6);
  assert.equal(saved.revision, original.revision + 1);
});

test("a stale page cannot act, export, or confirm an earlier replacement after another Worker advances", async () => {
  const env = environment();
  const a = env.client(),
    b = env.client();
  const original = await a.create();
  const progress = await a.work(original);
  assert.equal(progress.ok, true);
  const requests = [
    { kind: "command", command: { type: "work" }, revision: original.revision },
    { kind: "export" },
    { kind: "import", text: JSON.stringify(fixture("early")), replace: true },
    { kind: "create", profile: { ...profile, name: "不应覆盖" }, seed: 8, replace: true },
  ];
  for (const input of requests) {
    const r = await b.send({ ...input, expected: expected(original) });
    assert.equal(r.ok, false);
    assert.match(r.error, /重新读取/);
    assert.deepEqual(await env.client().load(), progress.state);
  }
  const recovered = await b.work(await b.load());
  assert.equal(recovered.ok, true);
  assert.equal(recovered.state.day, original.day + 2);
});

test("two new characters at revision zero are distinguished by save identity", async () => {
  const env = environment();
  const a = env.client(),
    b = env.client();
  const first = await a.create();
  await b.load();
  const second = await a.create(first, "复测乙");
  assert.equal(first.revision, second.revision);
  assert.notEqual(first.saveId, second.saveId);
  assert.equal((await b.work(first)).ok, false);
  assert.equal((await b.send({ kind: "export", expected: expected(first) })).ok, false);
  const saved = await b.load();
  assert.deepEqual(saved, second);
  assert.equal(saved.day, 0);
  assert.equal(saved.player.stones, 6);
});

test("an aborted commit rolls back both imported progress and its backup, then retry succeeds", async () => {
  const env = environment();
  const a = env.client();
  const original = await a.create();
  const input = {
    kind: "import",
    text: JSON.stringify(fixture("early")),
    replace: true,
    expected: expected(original),
  };
  env.fault.abortWrite = true;
  const rejected = await a.send(input);
  assert.equal(rejected.ok, false);
  assert.equal(env.fault.aborted, 1);
  assert.deepEqual(await env.client().load(), original);
  assert.deepEqual(await env.records("backups"), []);
  env.fault.abortWrite = false;
  const retried = await a.send(input);
  assert.equal(retried.ok, true, retried.error);
  assert.equal(retried.state.day, 8);
  assert.deepEqual(
    new Set((await env.records("backups")).map((w) => w.saveId)),
    new Set([original.saveId, fixture("early").saveId]),
  );
});

test("storage access failure returns an error and keeps the last saved world recoverable", async () => {
  const env = environment();
  const a = env.client();
  const original = await a.create();
  env.fault.denyOpen = true;
  const failed = await a.work(original);
  assert.equal(failed.ok, false);
  env.fault.denyOpen = false;
  assert.deepEqual(await env.client().load(), original);
  assert.equal((await a.work(original)).ok, true);
});

test("a lost acknowledgment retry is idempotent but the same ID cannot change its payload", async () => {
  const env = environment();
  const a = env.client();
  const world = await a.create();
  const input = {
    id: "stable-work",
    kind: "command",
    command: { type: "work" },
    revision: world.revision,
    expected: expected(world),
  };
  const first = await a.send(input);
  assert.equal(first.ok, true, first.error);
  const retry = await env.client().send(input);
  assert.equal(retry.ok, true, retry.error);
  assert.deepEqual(retry.state, first.state);
  const reused = await a.send({ ...input, command: { type: "rest" } });
  assert.equal(reused.code, "COMMAND_ID_REUSE");
  assert.deepEqual(await a.load(), first.state);
});

test("unknown messages and extra command fields are rejected without changing the saved world", async () => {
  const env = environment();
  const a = env.client();
  const world = await a.create();
  for (const input of [
    { kind: "unrecognized" },
    { kind: "load", protocolVersion: 99 },
    {
      kind: "command",
      command: { type: "work", reward: 100 },
      revision: 0,
      expected: expected(world),
    },
    {
      kind: "command",
      command: { type: "train", days: 7, stoneMethod: "false" },
      revision: 0,
      expected: expected(world),
    },
  ]) {
    const r = await a.send(input);
    assert.equal(r.code, "VALIDATION_ERROR");
    assert.deepEqual(await a.load(), world);
  }
});

test("creation drafts survive Worker restart, reject stale editing, and clear only after successful creation", async () => {
  const env = environment();
  const a = env.client();
  assert.equal((await a.send({ kind: "loadDraft" })).draft, null);
  const draft = {
    version: 1,
    revision: 0,
    seed: 42,
    roll: 103,
    profile: { ...profile, name: "" },
    previousLook: { profile: { ...profile, portraitId: "a".repeat(64) }, seed: 42, roll: 102 },
  };
  const saved = await a.send({ kind: "saveDraft", draft });
  assert.equal(saved.ok, true, saved.error);
  assert.deepEqual((await env.client().send({ kind: "loadDraft" })).draft, saved.draft);
  assert.equal((await a.send({ kind: "saveDraft", draft })).code, "STALE_REVISION");
  env.fault.abortWrite = true;
  const failed = await a.send({ kind: "create", seed: 42, profile, expected: expected(null) });
  assert.equal(failed.ok, false);
  assert.deepEqual((await a.send({ kind: "loadDraft" })).draft, saved.draft);
  env.fault.abortWrite = false;
  await a.create();
  assert.equal((await a.send({ kind: "loadDraft" })).draft, null);
});

function releasedShape(world, version = 1) {
  const copy = structuredClone(world);
  if (copy.rulesVersion === "0.2.0")
    for (const a of [copy.player, ...copy.npcs]) {
      a.realm = a.realm >= 10 ? 4 : Math.min(3, a.realm);
      a.xp = Math.min(a.xp, [20, 40, 60, 90, 100][a.realm]);
      a.hp = Math.min(a.hp, [30, 50, 60, 70, 130][a.realm]);
      a.attempt = null;
      for (const key of ["insight", "manualRank", "skills", "qi", "jobCooldowns"]) delete a[key];
      if (a.sectMembership)
        for (const key of ["rank", "questStep", "lastStipendDay"]) delete a.sectMembership[key];
    }
  delete copy.dailyEventCooldowns;
  delete copy.pendingDailyEventId;
  if (copy.agreement) delete copy.agreement.terms;
  copy.npcs = copy.npcs.filter((a) => !a.id.startsWith("shichai."));
  copy.events = copy.events.filter((e) => !e.actors.some((id) => id.startsWith("shichai.")));
  const events = new Set(copy.events.map((e) => e.id));
  copy.relations = copy.relations.filter(
    (r) => ![r.from, r.to].some((id) => id.startsWith("shichai.")),
  );
  for (const r of copy.relations) r.memories = r.memories.filter((id) => events.has(id));
  if (version === 1) {
    delete copy.schemaVersion;
    delete copy.commandReceipts;
  } else copy.schemaVersion = 2;
  copy.rulesVersion = "0.1.1";
  delete copy.negotiations;
  delete copy.contentLocks;
  delete copy.contentState;
  delete copy.knowledge;
  delete copy.simulationOptions;
  for (const actor of [copy.player, ...copy.npcs]) delete actor.lastActionDay;
  if (copy.battle) delete copy.battle.lethal;
  if (copy.longAction)
    for (const key of ["id", "checkpoint", "paidStones"]) delete copy.longAction[key];
  return copy;
}

test("released version-one snapshots migrate additively with an exact old backup and no RNG/time changes", async () => {
  const env = environment();
  const legacy = releasedShape(fixture("early", true));
  await env.seedLegacy(legacy);
  const response = await env.client().send({ kind: "load" });
  assert.equal(response.ok, true, response.error);
  assert.equal(response.migrated, true);
  assert.equal(response.state.schemaVersion, 7);
  assert.deepEqual({ ...releasedShape(response.state), revision: legacy.revision }, legacy);
  assert.ok(
    Object.values(response.state.knowledge)
      .flat()
      .every((m) => [0, 3, 4].includes(m[1])),
  );
  assert.deepEqual(await env.records("backups"), [legacy]);
  assert.deepEqual(await env.client().load(), response.state);
});

test("failed migration preserves the original legacy snapshot; restoring a backup retains the replaced world", async () => {
  const env = environment();
  const legacy = releasedShape(fixture("early", true));
  await env.seedLegacy(legacy);
  env.fault.abortWrite = true;
  assert.equal((await env.client().send({ kind: "load" })).ok, false);
  assert.deepEqual(await env.records("saves"), [legacy]);
  assert.deepEqual(await env.records("backups"), []);
  env.fault.abortWrite = false;
  const a = env.client();
  const current = await a.load();
  const changed = await a.work(current);
  assert.equal(changed.ok, true);
  const backups = await a.send({ kind: "backups" });
  assert.equal(backups.backups.length, 1);
  const key = backups.backups[0].key;
  const before = await a.send({ kind: "exportBackup", backupKey: key });
  assert.deepEqual(JSON.parse(before.text), legacy);
  const restored = await a.send({
    kind: "restore",
    backupKey: key,
    replace: true,
    expected: expected(changed.state),
  });
  assert.equal(restored.ok, true, restored.error);
  assert.equal(restored.state.day, legacy.day);
  assert.notEqual(restored.state.saveId, changed.state.saveId);
  assert.ok(
    (await env.records("backups")).some(
      (w) => w.saveId === changed.state.saveId && w.revision === changed.state.revision,
    ),
  );
});

test("future save schemas and unrelated content locks never migrate or replace the current world", async () => {
  const env = environment();
  const a = env.client();
  const current = await a.create();
  for (const invalid of [
    { ...current, schemaVersion: 999 },
    { ...current, packLock: "unregistered-content" },
  ]) {
    const r = await a.send({
      kind: "import",
      text: JSON.stringify(invalid),
      replace: true,
      expected: expected(current),
    });
    assert.equal(r.ok, false);
    assert.deepEqual(await a.load(), current);
    assert.deepEqual(await env.records("backups"), []);
  }
});

test("schema two migration preserves payload receipts and checkpoint resource accounting", async () => {
  const env = environment();
  const client = env.client();
  let w = await client.create();
  const done = await client.work(w);
  assert.equal(done.ok, true);
  w = done.state;
  const legacy = releasedShape(w, 2);
  const clean = environment();
  await clean.seedLegacy(legacy);
  const result = await clean.client().load();
  assert.equal(result.schemaVersion, 7);
  assert.deepEqual(result.commandReceipts, w.commandReceipts);
  assert.deepEqual({ ...releasedShape(result, 2), revision: legacy.revision }, legacy);
});

async function startTraining(env, days = 7, stopWhen) {
  const a = env.client();
  const initial = fixture("early");
  await env.seedLegacy(initial);
  const result = await a.send({
    kind: "command",
    id: "training-start",
    command: { type: "train", days, stoneMethod: true, ...(stopWhen ? { stopWhen } : {}) },
    revision: initial.revision,
    expected: expected(initial),
  });
  assert.equal(result.ok, true, result.error);
  return result.state;
}
const advanceRequest = (w, id = "batch") => ({
  kind: "advance",
  id,
  actionId: w.longAction.id,
  checkpoint: w.longAction.checkpoint,
  days: w.longAction.remaining,
  expected: expected(w),
});

test("Worker batches publish only durable progress and one final world, identical to individual checkpoints", async () => {
  const env = environment();
  const start = await startTraining(env);
  const progress = [];
  const a = env.client((r) => {
    assert.equal(r.state, undefined);
    progress.push(r.progress);
  });
  const result = await a.send(advanceRequest(start));
  assert.equal(result.ok, true, result.error);
  assert.equal(progress.length, 7);
  for (const update of progress) {
    assert.ok(Array.isArray(update.newEventIds));
    for (const id of update.newEventIds) {
      assert.equal(result.state.events.find((e) => e.id === id)?.day, update.day);
      assert.ok(result.state.knowledge[id].some((k) => k[0] === 0));
    }
  }
  assert.equal(result.state.player.stones, start.player.stones - 7);
  assert.deepEqual(await a.load(), result.state);
  assert.deepEqual(
    (await a.send(advanceRequest(start))).state,
    result.state,
    "lost ack must not advance again",
  );
  const control = environment();
  await control.seedLegacy(start);
  const b = control.client();
  let w = start;
  for (let i = 1; i <= 7; i++) {
    const response = await b.send({
      kind: "command",
      id: `${start.saveId}:${start.longAction.id}:step:${i}`,
      command: { type: "step" },
      revision: w.revision,
      expected: expected(w),
    });
    assert.equal(response.ok, true, response.error);
    w = response.state;
  }
  assert.deepEqual(result.state, w);
});

test("batch pause and a failed fourth paid checkpoint preserve restartable durable progress", async () => {
  for (const failure of [false, true]) {
    const env = environment();
    const start = await startTraining(env);
    let pause;
    const a = env.client((r) => {
      if (r.progress.completed === 3) {
        if (failure) env.fault.abortWrite = true;
        else pause = a.send({ kind: "pauseAdvance", advanceId: "batch" });
      }
    });
    const result = await a.send(advanceRequest(start));
    if (pause) await pause;
    assert.equal(result.ok, !failure);
    assert.equal(result.state.longAction.checkpoint, 3);
    assert.equal(result.state.player.stones, start.player.stones - 3);
    assert.deepEqual(await env.client().load(), result.state);
    env.fault.abortWrite = false;
    const resumed = await env.client().send(advanceRequest(result.state, "resumed"));
    assert.equal(resumed.ok, true, resumed.error);
    assert.equal(resumed.state.player.stones, start.player.stones - 7);
    assert.equal(resumed.state.longAction, null);
  }
});

test("a retried partial batch never advances beyond its original checkpoint boundary", async () => {
  const env = environment();
  const start = await startTraining(env);
  const request = { ...advanceRequest(start), days: 3 };
  const a = env.client();
  const first = await a.send(request);
  const retry = await a.send(request);
  assert.equal(first.state.longAction.checkpoint, 3);
  assert.deepEqual(retry.state, first.state);
});

test("conditional training stops at eligibility and important news pauses a resumable action", async () => {
  const env = environment();
  const start = await startTraining(env, 7, { kind: "cultivationReady" });
  const result = await env.client().send(advanceRequest(start));
  assert.equal(result.ok, true, result.error);
  assert.equal(result.advanceResult.reason, "condition");
  assert.equal(result.state.player.xp, 34);
  assert.equal(result.state.longAction, null);
  assert.ok(result.state.day - start.day < 7);
  const news = environment();
  const w = await startTraining(news, 7, { kind: "importantEvent" });
  // A known local lifespan event is guaranteed on the next committed day.
  w.npcs[0].location = w.player.location;
  w.npcs[0].ageDays = 43199;
  await news.seedLegacy(w);
  const paused = await news.client().send(advanceRequest(w));
  assert.equal(paused.ok, true, paused.error);
  assert.equal(paused.advanceResult.reason, "condition");
  assert.equal(paused.state.longAction.checkpoint, 1);
  assert.equal(paused.state.npcs[0].alive, false);
});

test("exact old journey locks migrate durably with an intact backup, including an aborted migration retry", async () => {
  const registry = JSON.parse(readFileSync("lib/game/content/extensions.json", "utf8"));
  const migrations = JSON.parse(readFileSync("lib/game/content/journey-migrations.json", "utf8"));
  const entries = registry.filter((e) => e.data.journey);
  const setup = environment();
  const created = await setup.client().send({
    kind: "create",
    profile,
    seed: 12345,
    contentLocks: entries.map((e) => e.lock),
    expected: expected(null),
  });
  assert.equal(created.ok, true, created.error);
  const legacy = structuredClone(created.state);
  legacy.contentLocks = entries.map(
    (e) => migrations.find((m) => m.packId === e.data.manifest.packId).from,
  );
  for (const actor of legacy.npcs) if (actor.id.startsWith("shichai.")) actor.location = "market";
  legacy.contentState["shichai.chunshui.suqingyan.flag.met"] = true;
  const env = environment();
  await env.seedLegacy(legacy);
  env.fault.abortWrite = true;
  const failed = await env.client().send({ kind: "load" });
  assert.equal(failed.ok, false);
  assert.deepEqual(await env.records("saves"), [legacy]);
  assert.deepEqual(await env.records("backups"), []);
  env.fault.abortWrite = false;
  const loaded = await env.client().send({ kind: "load" });
  assert.equal(loaded.ok, true, loaded.error);
  assert.equal(loaded.migrated, true);
  assert.deepEqual(loaded.state.player, legacy.player);
  assert.deepEqual(loaded.state.rng, legacy.rng);
  assert.deepEqual(loaded.state.contentState, legacy.contentState);
  assert.deepEqual(loaded.state.events, legacy.events);
  assert.equal(loaded.state.day, legacy.day);
  assert.equal(loaded.state.revision, legacy.revision + 1);
  assert.equal(
    loaded.state.npcs.find((a) => a.id === "shichai.xiaye.peisi").location,
    "shichai.xiaye.market",
  );
  assert.deepEqual(await env.records("backups"), [legacy]);
  assert.deepEqual(await env.client().load(), loaded.state);
});

test("adding the main campaign lock backs up the intact old save and rolls back on failed storage", async () => {
  const setup = environment();
  const legacy = await setup.client().create();
  delete legacy.campaignLock;
  const env = environment();
  await env.seedLegacy(legacy);
  env.fault.abortWrite = true;
  assert.equal((await env.client().send({ kind: "load" })).ok, false);
  assert.deepEqual(await env.records("saves"), [legacy]);
  assert.deepEqual(await env.records("backups"), []);
  env.fault.abortWrite = false;
  const loaded = await env.client().send({ kind: "load" });
  assert.equal(loaded.ok, true, loaded.error);
  assert.equal(loaded.migrated, true);
  assert.match(loaded.state.campaignLock, /^main.quest@/);
  assert.deepEqual(loaded.state.player, legacy.player);
  assert.deepEqual(loaded.state.npcs, legacy.npcs);
  assert.deepEqual(loaded.state.rng, legacy.rng);
  assert.deepEqual(loaded.state.events, legacy.events);
  assert.deepEqual(loaded.state.knowledge, legacy.knowledge);
  assert.equal(loaded.state.day, legacy.day);
  assert.equal(loaded.state.revision, legacy.revision + 1);
  assert.deepEqual(await env.records("backups"), [legacy]);
  assert.deepEqual(await env.client().load(), loaded.state);
});

test("duplicate NPC names migrate atomically with exact backup, rollback and idempotent reload", async () => {
  const env = environment();
  const raw = await env.client().create();
  raw.npcs.find((a) => a.id === "NPC_0020").name = "沈栖月";
  raw.npcs.find((a) => a.id === "NPC_0028").name = "许清禾";
  raw.npcs.find((a) => a.id === "NPC_0030").name = "叶长宁";
  await env.seedLegacy(raw);
  env.fault.abortWrite = true;
  const failed = await env.client().send({ kind: "load" });
  assert.equal(failed.ok, false);
  assert.deepEqual(await env.records("saves"), [raw]);
  assert.deepEqual(await env.records("backups"), []);
  env.fault.abortWrite = false;
  const loaded = await env.client().send({ kind: "load" });
  assert.equal(loaded.ok, true, loaded.error);
  assert.equal(loaded.migrated, true);
  const current = loaded.state;
  assert.equal(new Set(current.npcs.map((a) => a.name)).size, current.npcs.length);
  assert.equal(current.revision, raw.revision + 1);
  assert.equal(current.npcs.find((a) => a.id === "shichai.xiaye.shenqiyue").name, "沈栖月");
  const withoutRename = structuredClone(current);
  withoutRename.revision = raw.revision;
  withoutRename.npcs.forEach((a, i) => {
    a.name = raw.npcs[i].name;
  });
  assert.deepEqual(withoutRename, raw);
  assert.deepEqual(await env.records("backups"), [raw]);
  assert.deepEqual(await env.records("saves"), [current]);
  const again = await env.client().send({ kind: "load" });
  assert.equal(again.migrated, false);
  assert.deepEqual(again.state, current);
  assert.deepEqual(await env.records("backups"), [raw]);
});

test("open-map rule migration saves atomically with the exact old backup before allowing distant travel", async () => {
  const env = environment();
  const old = await env.client().create();
  for (const a of [old.player, ...old.npcs]) {
    a.realm = a.realm >= 10 ? 4 : Math.min(3, a.realm);
    a.xp = Math.min(a.xp, [20, 40, 60, 90, 100][a.realm]);
    a.hp = Math.min(a.hp, [30, 50, 60, 70, 130][a.realm]);
  }
  old.rulesVersion = "0.1.3";
  await env.seedLegacy(old);
  env.fault.abortWrite = true;
  const denied = await env.client().send({ kind: "load" });
  assert.equal(denied.ok, false);
  assert.deepEqual((await env.records("saves"))[0], old);
  env.fault.abortWrite = false;
  const response = await env.client().send({ kind: "load" });
  assert.equal(response.ok, true, response.error);
  assert.equal(response.migrated, true);
  assert.equal(response.state.rulesVersion, "0.2.0");
  assert.deepEqual(
    {
      ...response.state,
      npcs: response.state.npcs.map((a) => ({ ...a, realm: a.realm === 10 ? 4 : a.realm })),
      rulesVersion: old.rulesVersion,
      revision: old.revision,
    },
    old,
  );
  assert.deepEqual(await env.records("backups"), [old]);
  assert.deepEqual(await env.client().load(), response.state);
});

test("redraw adoption commits portrait and visual traits together, and failed storage retains both originals", async () => {
  const env = environment();
  const client = env.client();
  const world = await client.create();
  const npc = world.npcs.find((a) => a.id === "NPC_LIN_WAN");
  const look = {
    appearance: { face: 1, hair: 2, color: 3 },
    physique: { ...npc.physique, heightCm: 180, bustCup: "D" },
    portraitFeatures: "月白长裤与平底靴",
  };
  const message = {
    kind: "command",
    command: { type: "attachPortrait", target: npc.id, portraitId: "b".repeat(64), look },
    revision: world.revision,
    expected: expected(world),
  };
  env.fault.abortWrite = true;
  const failed = await client.send(message);
  assert.equal(failed.ok, false);
  assert.deepEqual(await env.records("saves"), [world]);
  assert.deepEqual(await env.client().load(), world);
  env.fault.abortWrite = false;
  const success = await client.send(message);
  assert.equal(success.ok, true, success.error);
  const saved = success.state;
  const next = saved.npcs.find((a) => a.id === npc.id);
  assert.equal(next.portraitId, message.command.portraitId);
  assert.deepEqual(next.physique, look.physique);
  assert.deepEqual(next.portraitAppearance, look.appearance);
  assert.equal(next.portraitFeatures, look.portraitFeatures);
  assert.equal(saved.day, world.day);
  assert.deepEqual(saved.rng, world.rng);
  assert.deepEqual(saved.events, world.events);
  assert.deepEqual(saved.relations, world.relations);
  assert.deepEqual(await env.records("saves"), [saved]);
  assert.deepEqual(await env.client().load(), saved);
  const restore = {
    kind: "command",
    command: { type: "restorePortrait", target: npc.id },
    revision: saved.revision,
    expected: expected(saved),
  };
  env.fault.abortWrite = true;
  const aborted = await client.send(restore);
  assert.equal(aborted.ok, false);
  assert.deepEqual(await env.client().load(), saved);
  env.fault.abortWrite = false;
  const restored = await client.send(restore);
  assert.equal(restored.ok, true, restored.error);
  const { portraitOriginal, ...restoredNpc } = restored.state.npcs.find((a) => a.id === npc.id);
  assert.deepEqual(restoredNpc, npc);
  assert.equal(restored.state.day, saved.day);
  assert.deepEqual(restored.state.rng, saved.rng);
  assert.deepEqual(restored.state.events, saved.events);
  assert.deepEqual(restored.state.relations, saved.relations);
  assert.deepEqual(await env.client().load(), restored.state);
});
test("renewed invitations commit once, survive reload and roll back on save failure", async () => {
  const env = environment();
  const client = env.client();
  let world = await client.create();
  for (const command of [
    { type: "choose", nodeId: "first-meeting", choiceId: "greet" },
    { type: "choose", nodeId: "manual", choiceId: "learn" },
    { type: "choose", nodeId: "shared-goal", choiceId: "listen" },
    { type: "choose", nodeId: "agreement", choiceId: "accept" },
    { type: "disband" },
  ]) {
    const response = await client.send({
      kind: "command",
      command,
      revision: world.revision,
      expected: expected(world),
    });
    assert.equal(response.ok, true, response.error);
    world = response.state;
  }
  const message = {
    id: "renewal-transaction",
    kind: "command",
    command: { type: "renewAgreement" },
    revision: world.revision,
    expected: expected(world),
  };
  env.fault.abortWrite = true;
  const failed = await client.send(message);
  assert.equal(failed.ok, false);
  assert.equal(failed.state, undefined);
  env.fault.abortWrite = false;
  assert.deepEqual(await env.client().load(), world);
  const response = await client.send(message);
  assert.equal(response.ok, true, response.error);
  const renewed = response.state;
  assert.equal(renewed.agreement.status, "accepted");
  assert.deepEqual(renewed.player, world.player);
  assert.deepEqual(renewed.npcs, world.npcs);
  assert.deepEqual(renewed.relations, world.relations);
  assert.deepEqual(renewed.story, world.story);
  assert.equal(renewed.day, world.day);
  assert.deepEqual(renewed.rng, world.rng);
  assert.deepEqual(renewed.events.slice(0, world.events.length), world.events);
  assert.deepEqual(await env.client().load(), renewed);
  const replay = await client.send(message);
  assert.equal(replay.ok, true, replay.error);
  assert.deepEqual(replay.state, renewed);
  const stale = await client.send({
    kind: "command",
    command: { type: "choose", nodeId: "agreement", choiceId: "accept" },
    revision: renewed.revision,
    expected: expected(renewed),
  });
  assert.equal(stale.ok, false);
  assert.deepEqual(await env.client().load(), renewed);
});
test("sect discovery, task rewards and private intimacy commit atomically and survive a fresh Worker", async () => {
  const env = environment();
  const client = env.client();
  let world = await client.create();
  const run = async (command, abortFirst = false) => {
    const message = {
      kind: "command",
      command,
      revision: world.revision,
      expected: expected(world),
    };
    if (abortFirst) {
      env.fault.abortWrite = true;
      const rejected = await client.send(message);
      assert.equal(rejected.ok, false);
      env.fault.abortWrite = false;
      assert.deepEqual(await env.client().load(), world);
    }
    const result = await client.send(message);
    assert.equal(result.ok, true, result.error);
    world = result.state;
    assert.deepEqual(await env.client().load(), world);
  };
  await run({ type: "travel", to: "atlas.wendao" });
  const originalNames = world.npcs.map((a) => [a.id, a.name]);
  await run({ type: "visitSect", sectId: "quanzhen" }, true);
  assert.deepEqual(
    world.npcs.slice(0, originalNames.length).map((a) => [a.id, a.name]),
    originalNames,
  );
  await run({ type: "joinSect", sectId: "quanzhen", confirmed: true }, true);
  const initial = structuredClone(world);
  for (let i = 0; i < 3; i++) await run({ type: "sectTask" }, true);
  const balance = JSON.parse(readFileSync("lib/game/content/balance.json", "utf8"));
  assert.equal(world.player.stones, initial.player.stones + 3 * balance.sects.taskStones);
  assert.equal(world.day, initial.day + 3 * balance.sects.taskDays);
  await run({ type: "learnSectArt" }, true);
  for (let i = 0; i < 4; i++) await run({ type: "spendTime", target: "SECT_QUAN_NING" });
  await run({ type: "intimacy", target: "SECT_QUAN_NING", kind: "bond", confirmed: true }, true);
  await run({ type: "intimacy", target: "SECT_QUAN_NING", kind: "night", confirmed: true }, true);
  await run({ type: "intimacy", target: "SECT_QUAN_NING", kind: "dual", confirmed: true }, true);
  const events = world.events.filter((e) => e.intimacy);
  assert.equal(events.length, 3);
  assert.ok(events.every((e) => world.knowledge[e.id].length === 2));
  const exported = await client.send({ kind: "export", expected: expected(world) });
  assert.equal(exported.ok, true);
  assert.deepEqual(JSON.parse(exported.text), world);
});

test("autonomous NPC relationships, journeys and admission are atomic, replay-safe and durable", async () => {
  const env = environment();
  const client = env.client();
  let world = await client.create();
  const originalIds = world.npcs.map((a) => [a.id, a.name, a.appearanceSeed]);
  let sawJourney = false;
  for (let day = 0; day < 45; day++) {
    const message = {
      id: `npc-life-day:${day}`,
      kind: "command",
      command: { type: "work" },
      revision: world.revision,
      expected: expected(world),
    };
    if (day < 15 || world.npcs.some((a) => a.npcJourney?.remaining === 1)) {
      env.fault.abortWrite = true;
      const failed = await client.send(message);
      assert.equal(failed.ok, false);
      env.fault.abortWrite = false;
      assert.deepEqual(await env.client().load(), world);
    }
    const result = await client.send(message);
    assert.equal(result.ok, true, result.error);
    world = result.state;
    assert.deepEqual(
      (await client.send({ ...message, revision: world.revision, expected: expected(world) }))
        .state,
      world,
    );
    sawJourney ||= world.npcs.some((a) => a.npcJourney);
    assert.deepEqual(await env.client().load(), world);
  }
  assert.equal(world.rulesVersion, "0.2.0");
  assert.equal(sawJourney, true);
  assert.ok(world.events.some((e) => e.kind === "npc-friendship"));
  assert.ok(world.events.some((e) => e.kind === "sect-join" && !e.actors.includes("PLAYER")));
  assert.equal(world.visitedSects, undefined);
  assert.deepEqual(
    world.npcs.map((a) => [a.id, a.name, a.appearanceSeed]),
    originalIds,
  );
  const exported = await client.send({ kind: "export", expected: expected(world) });
  assert.equal(exported.ok, true);
  assert.deepEqual(JSON.parse(exported.text), world);
});

test("real 0.1.6 imports preserve the input backup atomically even in an empty browser", async () => {
  for (const stage of ["foundation", "inflight"]) {
    const old = JSON.parse(
      readFileSync(`tests/game/fixtures/redesign-b/legacy-0.1.6-${stage}.json`, "utf8"),
    );
    const env = environment(),
      client = env.client();
    const request = { kind: "import", text: JSON.stringify(old), expected: expected(null) };
    env.fault.abortWrite = true;
    const failed = await client.send(request);
    assert.equal(failed.ok, false);
    assert.deepEqual(await env.records("saves"), []);
    assert.deepEqual(await env.records("backups"), []);
    env.fault.abortWrite = false;
    const result = await client.send(request);
    assert.equal(result.ok, true, result.error);
    assert.equal(result.migrated, true);
    assert.deepEqual(await env.records("backups"), [old]);
    assert.equal(result.state.schemaVersion, 7);
    assert.equal(result.state.rulesVersion, "0.2.0");
    assert.equal(result.state.player.realm, stage === "foundation" ? 10 : 3);
    assert.equal(result.state.longAction?.chance, old.longAction?.chance);
    for (const key of ["events", "relations", "knowledge", "rng", "day"])
      assert.deepEqual(result.state[key], old[key]);
    old.npcs.forEach((a, i) => assert.equal(result.state.npcs[i].realm, [0, 1, 2, 3, 10][a.realm]));
    assert.deepEqual(await env.client().load(), result.state);
  }
});
