import { readFileSync } from "node:fs";
import { extensionScenes } from "../lib/game/content-story";
import { chapterWaitDays } from "../lib/game/world-map";
import { selectedExtensions } from "../lib/game/content/extensions";
const w: any = JSON.parse(readFileSync("/tmp/world-win.json", "utf8"));
const exts = selectedExtensions(w.contentLocks);
console.log("exts", exts.map((e: any) => e.data.manifest.packId));
for (const e of exts) console.log(e.data.manifest.packId, "waitDays", chapterWaitDays(w, e.data), "intro", w.contentState[e.data.journey?.introId]);
console.log("scenes", extensionScenes(w).map((s: any) => s.id));
