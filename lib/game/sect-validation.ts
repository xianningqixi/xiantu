import { intimacyKind } from "./intimacy-history";
import { z } from "zod";
import { SECTS, sectById } from "./sect-content";
import { B } from "./rules";
import { locationEnabled, travelRoute } from "./world-map";
import type { LocationId, World } from "./types";
const sectId = z.enum(["yunv", "hehuan", "quanzhen"]);
const day = z.number().int().safe().nonnegative();
const membership = z
  .object({
    id: sectId,
    joinedDay: day,
    rank: z.enum(["outer", "inner"]),
    questStep: day,
    lastStipendDay: day,
    contribution: day,
    earned: day,
    artLearned: z.boolean(),
    previousSect: z.string().min(1).max(160),
  })
  .strict();
const intimate = z
  .object({ kind: z.enum(["bond", "night", "dual"]), consent: z.literal("mutual") })
  .strict();

export function validateSectState(w: World, requireSave: (ok: unknown, message: string) => void) {
  if (w.visitedSects !== undefined) {
    requireSave(
      ["0.1.5", "0.1.6", "0.2.0"].includes(w.rulesVersion),
      "宗门进度需要 0.1.5 或更新规则。",
    );
    requireSave(
      z.array(sectId).max(SECTS.length).safeParse(w.visitedSects).success &&
        new Set(w.visitedSects).size === w.visitedSects.length,
      "宗门拜访记录不合法。",
    );
  }
  for (const sect of SECTS) {
    const present = sect.residents.map((r) => w.npcs.find((a) => a.id === r.id));
    const visited = w.visitedSects?.includes(sect.id as "yunv" | "hehuan" | "quanzhen");
    requireSave(
      visited ? present.every(Boolean) : present.every((a) => !a),
      "宗门人物与拜访记录不符。",
    );
    if (visited) requireSave(locationEnabled(w, sect.home as LocationId), "宗门所在地图尚未载入。");
    present.forEach((a, i) => {
      if (a)
        requireSave(
          a.sex === sect.residents[i].sex && a.sectMembership?.id === sect.id,
          "宗门人物身份不一致。",
        );
    });
  }
  for (const a of [w.player, ...w.npcs]) {
    if (a.npcJourney !== undefined) {
      const j = a.npcJourney;
      requireSave(
        ["0.1.6", "0.2.0"].includes(w.rulesVersion) &&
          /^NPC_\d+$/.test(a.id) &&
          a.alive &&
          !a.attempt &&
          a.lastActionDay === w.day &&
          !w.party.includes(a.id) &&
          !(
            w.agreement?.status === "accepted" &&
            w.agreement.meeting &&
            w.agreement.members.includes(a.id)
          ) &&
          j &&
          typeof j === "object" &&
          Object.keys(j).length === 4 &&
          SECTS.some((s) => s.home === j.to) &&
          locationEnabled(w, j.to) &&
          Number.isSafeInteger(j.startedDay) &&
          j.startedDay >= 0 &&
          j.startedDay <= w.day &&
          Number.isSafeInteger(j.total) &&
          j.total === Math.max(1, travelRoute(a.location, j.to, w)?.days ?? -1) &&
          Number.isSafeInteger(j.remaining) &&
          j.remaining > 0 &&
          j.remaining < j.total &&
          j.remaining === j.total - (w.day - j.startedDay + 1),
        "NPC 行程的资格、路线或剩余日数不合法。",
      );
    }
    const m = a.sectMembership;
    if (m !== undefined) {
      requireSave(membership.safeParse(m).success, "宗门门籍不合法。");
      requireSave(
        (w.visitedSects?.includes(m!.id) ||
          (["0.1.6", "0.2.0"].includes(w.rulesVersion) &&
            /^NPC_\d+$/.test(a.id) &&
            locationEnabled(w, sectById(m!.id)!.home))) &&
          m!.joinedDay <= w.day &&
          m!.lastStipendDay >= m!.joinedDay &&
          m!.lastStipendDay <= w.day &&
          a.sect === sectById(m!.id)?.name &&
          m!.contribution === m!.earned - (m!.artLearned ? B.sects.artContributionCost : 0),
        "宗门贡献或日期不合法。",
      );
      if (m!.id === "yunv") requireSave(a.sex === "female", "玉女宗门籍须为成年女子。");
    }
  }
  const partners = new Map<string, string>();
  for (const e of w.events) {
    if (!e.intimacy && intimacyKind(w, e) === "bond") {
      const [a, b] = e.actors;
      partners.set(a, b);
      partners.set(b, a);
    }
    if (e.intimacy !== undefined || e.kind === "intimacy") {
      requireSave(
        ["0.1.5", "0.1.6", "0.2.0"].includes(w.rulesVersion),
        "亲密事件需要 0.1.5 或更新规则。",
      );
      requireSave(
        intimate.safeParse(e.intimacy).success &&
          e.kind === "intimacy" &&
          e.actors.length === 2 &&
          new Set(e.actors).size === 2 &&
          !e.public &&
          e.day >= 0,
        "亲密经历须保留双方自愿的非公开记录。",
      );
      for (const id of e.actors) {
        const a = [w.player, ...w.npcs].find((a) => a.id === id)!;
        const endDay = a.alive
          ? w.day
          : (w.events.find((ev) => ev.kind === "death" && ev.actors.includes(id))?.day ?? w.day);
        requireSave(
          e.day <= endDay &&
            a.ageDays - (endDay - e.day) >=
              B.relationships.intimateRelationshipMinimumAgeYears * B.world.daysPerYear,
          "亲密经历发生时双方须为在世成年人。",
        );
        if (a.sectMembership?.id === "yunv")
          requireSave(e.day < a.sectMembership.joinedDay, "亲密经历与守贞门规冲突。");
      }
      const [a, b] = e.actors;
      if (e.intimacy!.kind === "bond") {
        partners.set(a, b);
        partners.set(b, a);
      } else
        requireSave(partners.get(a) === b && partners.get(b) === a, "亲密经历缺少双方道侣之约。");
    }
  }
}
