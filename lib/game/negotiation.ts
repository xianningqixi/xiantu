import B from "./content/balance.json";
import { DEPARTURE_FEE } from "./economy";
import { z } from "zod";
import { PACK } from "./content/official";
import { knownEvents } from "./knowledge";
import type { World } from "./types";
const id = z.string().min(1).max(160);
export const termsSchema = z
  .object({
    members: z.array(id).length(3),
    recipient: id,
    item: z.literal("grass"),
    quantity: z.literal(B.story.firstGrassQuantity),
    remainder: z.literal("PLAYER"),
    travelStones: z.literal(DEPARTURE_FEE),
    scope: z.literal("next_expedition"),
  })
  .strict();
export const proposalSchema = z
  .object({
    intent: z.enum(["invite", "counter_offer", "accept", "reject", "clarify"]),
    reply: z.string().min(1).max(1500),
    terms: termsSchema.nullable(),
  })
  .strict();
export type NegotiationProposal = z.infer<typeof proposalSchema>;
export type NegotiationRecord = {
  proposalId: string;
  sessionId: string;
  target: string;
  day: number;
  revision: number;
  proposal: NegotiationProposal;
};
export const negotiationCommandSchema = z
  .object({
    type: z.literal("adoptNegotiation"),
    proposalId: id,
    sessionId: id,
    saveId: id,
    revision: z.number().int().safe().nonnegative(),
    target: id,
    proposal: proposalSchema,
    confirmed: z.literal(true),
  })
  .strict();
export const canonicalTerms = () => ({
  members: ["PLAYER", PACK.roles.primary, PACK.roles.companion],
  recipient: PACK.roles.primary,
  item: "grass" as const,
  quantity: B.story.firstGrassQuantity,
  remainder: "PLAYER" as const,
  travelStones: DEPARTURE_FEE,
  scope: "next_expedition" as const,
});
export function validTerms(proposal: NegotiationProposal) {
  const terms = proposal.terms;
  return (
    !!terms &&
    new Set(terms.members).size === 3 &&
    canonicalTerms().members.every((id) => terms.members.includes(id)) &&
    terms.recipient === PACK.roles.primary
  );
}
export function negotiationContext(w: World, target: string) {
  const actor = w.npcs.find((a) => a.id === target);
  if (!actor?.alive || actor.location !== w.player.location)
    throw new Error("需要与存活且在场的人交涉。");
  // Only the intersection of player and interlocutor knowledge enters a shared conversation.
  const targetKnowledge = new Set(knownEvents(w, target).map((e) => e.id));
  return {
    target: { id: actor.id, name: actor.name },
    location: w.player.location,
    terms: canonicalTerms(),
    facts: knownEvents(w)
      .filter((e) => targetKnowledge.has(e.id))
      .slice(-5)
      .map((e) => ({ id: e.id, text: e.text.slice(0, 800) })),
  };
}
