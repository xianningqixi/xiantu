import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { buildSync, transformSync } from "esbuild";

const guardCode = buildSync({
  entryPoints: ["lib/game/continuation.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
}).outputFiles[0].text;
const { createContinuationGuard } = await import(
  `data:text/javascript;base64,${Buffer.from(guardCode).toString("base64")}`
);
const text = fs.readFileSync("components/game/game.tsx", "utf8");
const parsed = ts.createSourceFile(
  "game.tsx",
  text,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);
const callbacks = {};
function visit(node) {
  if (ts.isVariableDeclaration(node) && ["act", "pause"].includes(node.name.getText(parsed)))
    callbacks[node.name.getText(parsed)] = node.initializer.getText(parsed);
  if (ts.isJsxAttribute(node) && node.name.getText(parsed) === "onAuto")
    callbacks.onAuto = node.initializer.expression.getText(parsed);
  ts.forEachChild(node, visit);
}
visit(parsed);
assert.deepEqual(Object.keys(callbacks).sort(), ["act", "onAuto", "pause"]);

// Test the actual application callbacks with controlled message completion.
// This verifies async ordering, not React rendering, DOM clicks, or browser visibility events.
function environment(w = null) {
  const state = { auto: false, running: false, tab: "cultivation" };
  const document = { hidden: false };
  const requests = [];
  const context = vm.createContext({
    document,
    w,
    useCallback: (fn) => fn,
    game: { pauseAdvance: () => {} },
    continuations: createContinuationGuard(),
    setAutoRunning: (value) => {
      state.auto = value;
    },
    setRunning: (value) => {
      state.running = value;
    },
    setTab: (value) => {
      state.tab = value;
    },
    send: (command) => new Promise((resolve) => requests.push({ command, resolve })),
  });
  const program =
    Object.entries(callbacks)
      .map(([key, value]) => `const ${key} = ${value};`)
      .join("\n") + "\n({act, pause, onAuto})";
  const handlers = vm.runInContext(
    transformSync(program, { loader: "ts", target: "es2022" }).code,
    context,
  );
  return { state, document, requests, ...handlers };
}

test("automatic battle starts only after a successful current command", async () => {
  const e = environment();
  const pending = e.onAuto(true);
  assert.equal(e.state.auto, false);
  e.requests.shift().resolve(true);
  await pending;
  assert.equal(e.state.auto, true);
  const stop = e.onAuto(false);
  assert.equal(e.state.auto, false);
  e.requests.shift().resolve(true);
  await stop;
  assert.equal(e.state.auto, false);
});

test("pause while enabling auto invalidates its late success even after returning to the page", async () => {
  const e = environment();
  const pending = e.onAuto(true);
  e.document.hidden = true;
  e.pause();
  e.document.hidden = false;
  e.requests.shift().resolve(true);
  await pending;
  assert.equal(e.state.auto, false);
  const resumed = e.onAuto(true);
  e.requests.shift().resolve(true);
  await resumed;
  assert.equal(e.state.auto, true);
});

test("pause while starting a long action preserves the pause and does not navigate on late success", async () => {
  for (const command of [
    { type: "train", days: 7, stoneMethod: false },
    { type: "wait", days: 3 },
    { type: "breakthrough", usePill: false, guardian: false },
  ]) {
    const e = environment();
    const pending = e.act(command);
    e.pause();
    e.requests.shift().resolve(true);
    assert.equal(await pending, true);
    assert.equal(e.state.running, false);
    assert.equal(e.state.tab, "cultivation");
  }
});

test("failed commands and hidden pages do not start automatic advancement", async () => {
  const e = environment();
  const auto = e.onAuto(true);
  e.requests.shift().resolve(false);
  await auto;
  assert.equal(e.state.auto, false);
  e.document.hidden = true;
  const hidden = e.onAuto(true);
  e.requests.shift().resolve(true);
  await hidden;
  assert.equal(e.state.auto, false);
  const train = e.act({ type: "train", days: 7, stoneMethod: false });
  e.requests.shift().resolve(false);
  await train;
  assert.equal(e.state.running, false);
});

test("a fresh explicit long-action request can resume after an earlier pause", async () => {
  const e = environment();
  e.pause();
  const pending = e.act({ type: "wait", days: 3 });
  e.requests.shift().resolve(true);
  await pending;
  assert.equal(e.state.running, true);
  assert.equal(e.state.tab, "cultivation");
});

test("only the saved pending choice resumes its long action after a successful current acknowledgement", async () => {
  for (const paused of [false, true]) {
    const e = environment({ pendingDailyEventId: "daily.test", longAction: { id: "same-action" } });
    const pending = e.act({ type: "choose", nodeId: "daily.test", choiceId: "decline" });
    assert.equal(e.state.running, false);
    if (paused) e.pause();
    e.requests.shift().resolve(true);
    await pending;
    assert.equal(e.state.running, !paused);
  }
  const e = environment({ pendingDailyEventId: "daily.test", longAction: { id: "same-action" } });
  const other = e.act({ type: "choose", nodeId: "story.other", choiceId: "reply" });
  e.requests.shift().resolve(true);
  await other;
  assert.equal(e.state.running, false);
});
