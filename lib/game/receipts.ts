import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";
import B from "./content/balance.json";
import type { World } from "./types";
/** This chain is an audit digest, not authentication or a command membership proof.
 * Exact historical IDs are retained independently; expired payloads refuse replay.
 */
export function pruneReceipts(world: World) {
  const entries = Object.entries(world.commandReceipts).sort(
    (a, b) => a[1].revision - b[1].revision || a[0].localeCompare(b[0]),
  );
  for (const [id, receipt] of entries.slice(
    0,
    Math.max(0, entries.length - B.limits.recentCommandReceipts),
  )) {
    world.receiptHistory.hash = bytesToHex(
      sha256(
        utf8ToBytes(
          JSON.stringify([world.receiptHistory.hash, id, receipt.fingerprint, receipt.revision]),
        ),
      ),
    );
    world.receiptHistory.count++;
    delete world.commandReceipts[id];
  }
}
