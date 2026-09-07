import type { World } from "./types";

export function hashSeed(seed: number, stream: string) {
  let h = 2166136261;
  for (const c of `${seed}:${stream}:1`) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  return h || 1;
}

export function nextRandom(state: number) {
  let x = state >>> 0;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  return x >>> 0;
}

export function random(w: World, stream: "simulation" | "combat", max: number) {
  const limit = Math.floor(4294967296 / max) * max;
  let x: number;
  do {
    x = nextRandom(w.rng[stream]);
    w.rng[stream] = x;
  } while (x >= limit);
  return x % max;
}

export function rollAptitude(seed: number, roll: number) {
  return 1 + (nextRandom(hashSeed(seed, `creation:${roll}`)) % 100);
}
