import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { buildSync } from 'esbuild';
import { IDBFactory } from 'fake-indexeddb';

// Execute the unchanged production Worker message handler. Only the browser storage API
// is replaced with a standards-oriented in-memory implementation; this is not browser QA.
const source = buildSync({ entryPoints: ['lib/game/simulation.worker.ts'], bundle: true,
  platform: 'browser', format: 'iife', write: false }).outputFiles[0].text;
const factorySource = buildSync({ entryPoints: ['tests/game/synthetic-world.ts'], bundle: true,
  platform: 'node', format: 'esm', write: false }).outputFiles[0].text;
const { syntheticFixture: fixture } = await import(`data:text/javascript;base64,${Buffer.from(factorySource).toString('base64')}`);
const profile = { name: '复测甲', sex: 'female', aptitude: 75, artifact: 'focus', mode: 'simple',
  appearance: { face: 0, hair: 1, color: 0 } };
const expected = w => ({ saveId: w?.saveId ?? null, revision: w?.revision ?? null });
let clientSerial = 0;

function environment() {
  const factory = new IDBFactory();
  const fault = { denyOpen: false, abortWrite: false, aborted: 0 };
  const storage = { open(...args) {
    if (fault.denyOpen) throw new DOMException('Storage unavailable', 'SecurityError');
    const request = factory.open(...args);
    request.addEventListener('success', () => {
      const db = request.result;
      const transaction = db.transaction.bind(db);
      db.transaction = (...args) => {
        const tx = transaction(...args);
        const objectStore = tx.objectStore.bind(tx);
        tx.objectStore = name => {
          const store = objectStore(name);
          if (name === 'saves' && tx.mode === 'readwrite') {
            const put = store.put.bind(store);
            store.put = (...args) => {
              const request = put(...args);
              request.addEventListener('success', () => {
                if (fault.abortWrite) { fault.aborted++; tx.abort(); }
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
  } };
  function client() {
    const id = ++clientSerial; let serial = 0;
    const pending = new Map();
    const scope = { onmessage: null, postMessage(response) {
      const waiter = pending.get(response.id); assert.ok(waiter, 'unexpected Worker response');
      pending.delete(response.id); clearTimeout(waiter.timeout); waiter.resolve(structuredClone(response));
    } };
    vm.runInNewContext(source, { self: scope, indexedDB: storage, crypto: webcrypto, TextEncoder, structuredClone });
    return {
      send(input) {
        const message = structuredClone({ ...input, id: `test-client:${id}:${++serial}` });
        return new Promise((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error(`Worker did not acknowledge ${input.kind}`)), 2000);
          pending.set(message.id, { resolve, timeout }); scope.onmessage({ data: message });
        });
      },
      async load() { const r = await this.send({ kind: 'load' }); assert.equal(r.ok, true, r.error); return r.state; },
      async create(previous = null, name = profile.name) {
        const r = await this.send({ kind: 'create', profile: { ...profile, name }, seed: 12345,
          replace: !!previous, expected: expected(previous) });
        assert.equal(r.ok, true, r.error); return r.state;
      },
      work(w) { return this.send({ kind: 'command', command: { type: 'work' }, revision: w.revision, expected: expected(w) }); },
    };
  }
  async function records(store) {
    const db = await new Promise((resolve, reject) => {
      const q = factory.open('xiantu-qingshi', 1); q.onsuccess = () => resolve(q.result); q.onerror = () => reject(q.error);
    });
    try { return await new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readonly'); const q = tx.objectStore(store).getAll();
      tx.oncomplete = () => resolve(q.result); tx.onabort = () => reject(tx.error);
    }); } finally { db.close(); }
  }
  return { client, fault, records };
}

test('create, export and a fresh Worker preserve the complete saved world', async () => {
  const env = environment(); const a = env.client(); assert.equal(await a.load(), null);
  const world = await a.create(); const exported = await a.send({ kind: 'export', expected: expected(world) });
  assert.equal(exported.ok, true); assert.deepEqual(JSON.parse(exported.text), world);
  assert.deepEqual(await env.client().load(), world);
});

test('generated day-9 and day-40 worlds import intact and keep the replaced save in backups', async () => {
  const env = environment(); const a = env.client(); let previous = await a.create();
  for (const name of ['early', 'evolved']) {
    const imported = fixture(name);
    const r = await a.send({ kind: 'import', text: JSON.stringify(imported), replace: true, expected: expected(previous) });
    assert.equal(r.ok, true, r.error); assert.notEqual(r.state.saveId, imported.saveId);
    assert.equal(r.state.revision, imported.revision + 1);
    const normalized = { ...r.state, saveId: imported.saveId, revision: imported.revision };
    assert.deepEqual(normalized, imported);
    assert.deepEqual(await env.client().load(), r.state);
    assert.ok((await env.records('backups')).some(w => w.saveId === previous.saveId && w.revision === previous.revision));
    previous = r.state;
  }
});

test('unconfirmed replacement and malformed imports leave the current save and backups untouched', async () => {
  const env = environment(); const a = env.client(); const world = await a.create();
  const denied = await a.send({ kind: 'import', text: JSON.stringify(fixture('early')), replace: false, expected: expected(world) });
  assert.equal(denied.ok, false);
  for (const text of ['{broken', 'null', JSON.stringify({ ...world, profile: null }), JSON.stringify({ ...world, story: { flags: null } }), 'x'.repeat(5 * 1024 * 1024 + 1)]) {
    const r = await a.send({ kind: 'import', text, replace: true, expected: expected(world) });
    assert.equal(r.ok, false); assert.deepEqual(await env.client().load(), world);
    assert.deepEqual(await env.records('backups'), []);
  }
});

test('two independent Workers racing to act commit exactly one day and one reward', async () => {
  const env = environment(); const a = env.client(), b = env.client(); const original = await a.create();
  assert.deepEqual(await b.load(), original);
  const replies = await Promise.all([a.work(original), b.work(original)]);
  assert.equal(replies.filter(r => r.ok).length, 1); assert.equal(replies.filter(r => !r.ok).length, 1);
  const saved = await env.client().load(); assert.equal(saved.day, original.day + 1);
  assert.equal(saved.player.stones, original.player.stones + 6); assert.equal(saved.revision, original.revision + 1);
});

test('a stale page cannot act, export, or confirm an earlier replacement after another Worker advances', async () => {
  const env = environment(); const a = env.client(), b = env.client(); const original = await a.create();
  const progress = await a.work(original); assert.equal(progress.ok, true);
  const requests = [
    { kind: 'command', command: { type: 'work' }, revision: original.revision },
    { kind: 'export' },
    { kind: 'import', text: JSON.stringify(fixture('early')), replace: true },
    { kind: 'create', profile: { ...profile, name: '不应覆盖' }, seed: 8, replace: true },
  ];
  for (const input of requests) {
    const r = await b.send({ ...input, expected: expected(original) }); assert.equal(r.ok, false); assert.match(r.error, /重新读取/);
    assert.deepEqual(await env.client().load(), progress.state);
  }
  const recovered = await b.work(await b.load()); assert.equal(recovered.ok, true);
  assert.equal(recovered.state.day, original.day + 2);
});

test('two new characters at revision zero are distinguished by save identity', async () => {
  const env = environment(); const a = env.client(), b = env.client(); const first = await a.create();
  await b.load(); const second = await a.create(first, '复测乙');
  assert.equal(first.revision, second.revision); assert.notEqual(first.saveId, second.saveId);
  assert.equal((await b.work(first)).ok, false);
  assert.equal((await b.send({ kind: 'export', expected: expected(first) })).ok, false);
  const saved = await b.load(); assert.deepEqual(saved, second); assert.equal(saved.day, 0); assert.equal(saved.player.stones, 6);
});

test('an aborted commit rolls back both imported progress and its backup, then retry succeeds', async () => {
  const env = environment(); const a = env.client(); const original = await a.create();
  const input = { kind: 'import', text: JSON.stringify(fixture('early')), replace: true, expected: expected(original) };
  env.fault.abortWrite = true;
  const rejected = await a.send(input); assert.equal(rejected.ok, false); assert.equal(env.fault.aborted, 1);
  assert.deepEqual(await env.client().load(), original); assert.deepEqual(await env.records('backups'), []);
  env.fault.abortWrite = false;
  const retried = await a.send(input); assert.equal(retried.ok, true, retried.error);
  assert.equal(retried.state.day, 8); assert.deepEqual(await env.records('backups'), [original]);
});

test('storage access failure returns an error and keeps the last saved world recoverable', async () => {
  const env = environment(); const a = env.client(); const original = await a.create();
  env.fault.denyOpen = true; const failed = await a.work(original); assert.equal(failed.ok, false);
  env.fault.denyOpen = false; assert.deepEqual(await env.client().load(), original);
  assert.equal((await a.work(original)).ok, true);
});
