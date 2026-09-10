import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
const before = process.argv[2] ?? "/tmp/xiantu-redesign-b-before";
const after = process.argv[3] ?? "/tmp/xiantu-redesign-b-after";
const output = process.argv[4] ?? "docs/reports/redesign-b-stress.json";
const B = JSON.parse(readFileSync("lib/game/content/balance.json", "utf8"));
function summarize(dir, seed) {
  const w = JSON.parse(readFileSync(resolve(dir, `save-${seed}.json`), "utf8"));
  const run = JSON.parse(readFileSync(resolve(dir, `${seed}.json`), "utf8"));
  const distribution = Array(w.rulesVersion === "0.2.0" ? 13 : 5).fill(0);
  w.npcs.forEach((a) => distribution[a.realm]++);
  const admitted = new Set(
    w.events
      .filter((e) => e.kind === "sect-join")
      .flatMap((e) => e.actors.filter((id) => id !== "PLAYER")),
  );
  const dead = w.npcs.filter((a) => !a.alive).length;
  return {
    rules: w.rulesVersion,
    schema: w.schemaVersion,
    day: w.day,
    npcs: w.npcs.length,
    dead,
    deathPercent: (100 * dead) / w.npcs.length,
    admitted: admitted.size,
    admissionPercent: (100 * admitted.size) / w.npcs.length,
    distribution,
    meanRealm: w.npcs.reduce((v, a) => v + a.realm, 0) / w.npcs.length,
    seconds: run.seconds,
    bytes: run.bytes,
    checkpointRecovery: run.checkpointRecovery,
    bundleSHA256: run.bundleSHA256,
  };
}
const rows = B.world.stressTestSeeds.map((seed) => ({
  seed,
  before: summarize(before, seed),
  after: summarize(after, seed),
}));
mkdirSync(resolve(output, ".."), { recursive: true });
writeFileSync(output, JSON.stringify({ before, after, rows }, null, 2) + "\n");
console.table(
  rows.map((r) => ({
    seed: r.seed,
    death: `${r.before.deathPercent}% → ${r.after.deathPercent}%`,
    admission: `${r.before.admissionPercent}% → ${r.after.admissionPercent}%`,
    mean: `${r.before.meanRealm} → ${r.after.meanRealm}`,
    distribution: `${r.before.distribution} → ${r.after.distribution}`,
  })),
);
