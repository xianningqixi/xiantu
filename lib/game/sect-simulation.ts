import { sectResident, sectHome } from "./sect-content";
import { npcSectTask } from "./sects";
import {
  bondPartner,
  companyReason,
  intimacyReason,
  recordCompany,
  settleIntimacy,
} from "./intimacy";
import { B, actorById } from "./rules";
import type { Actor, World } from "./types";

/** Authored partners make their own choices. The player is never paired by the daily simulator. */
export function sectNpcAction(w: World, a: Actor, occupied: Set<string>) {
  if (!a.sectMembership || a.npcJourney || w.party.includes(a.id) || a.location !== sectHome(a))
    return false;
  const partnerId = sectResident(a.id)?.partner;
  if (partnerId && w.day % B.sects.npcDualIntervalDays === 0) {
    const b = actorById(w, partnerId);
    if (
      b &&
      !occupied.has(b.id) &&
      !w.party.includes(b.id) &&
      b.lastActionDay < w.day &&
      b.location === sectHome(b) &&
      !companyReason(w, a, b)
    ) {
      if (bondPartner(w, a.id)?.id === b.id) {
        if (intimacyReason(w, a, b, "dual")) return npcSectTask(w, a);
        settleIntimacy(w, a, b, "dual");
      } else if (!intimacyReason(w, a, b, "bond")) {
        settleIntimacy(w, a, b, "bond");
      } else {
        recordCompany(w, a, b, `${a.name}与${b.name}在水榭交流一日修行心得，认真听取彼此的想法。`);
        a.activity = b.activity = "与同门相伴交流";
      }
      b.lastActionDay = w.day;
      return true;
    }
  }
  return npcSectTask(w, a);
}
