import test from "node:test";
import assert from "node:assert/strict";
import { buildSync } from "esbuild";
import { boundaryViolations, checkProject } from "../scripts/check-boundaries.mjs";

test("the production rules and migration modules retain their pure dependency boundary", () => {
  assert.ok(checkProject() >= 5);
  assert.deepEqual(boundaryViolations("export const next = (seed: number) => seed * 1664525;"), []);
  for (const source of [
    "import React from 'react';",
    "import { open } from 'node:fs';",
    "import { useGame } from './use-game';",
    "Date.now()",
    "Math.random()",
    'indexedDB.open("test")',
    'fetch("/")',
    "document.body",
  ]) {
    assert.ok(boundaryViolations(source).length, source);
  }
});

test("diagnostic records discard unapproved fields including mock keys, prompts, worlds and raw errors", async () => {
  const source = buildSync({
    entryPoints: ["lib/logging.ts"],
    bundle: true,
    format: "esm",
    platform: "node",
    write: false,
  }).outputFiles[0].text;
  const { diagnosticRecord } = await import(
    `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`
  );
  const record = diagnosticRecord("AI_REQUEST_FAILED", {
    requestId: "request-1",
    code: "AI_UNAVAILABLE",
    durationMs: 50,
    apiKey: "mock-secret-not-for-logs",
    playerText: "private player text",
    world: { name: "private character" },
    error: "upstream contained mock-secret-not-for-logs",
  });
  assert.deepEqual(record, {
    event: "AI_REQUEST_FAILED",
    requestId: "request-1",
    code: "AI_UNAVAILABLE",
    durationMs: 50,
  });
  assert.doesNotMatch(JSON.stringify(record), /mock-secret|private/);
});
