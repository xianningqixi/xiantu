import { legacyRealmIndex, stats, threshold } from "./rules";
import { requireSave } from "./errors";
import { deduplicateNpcNames } from "./npc-names";
import { MAIN_STORY_LOCK, mainChapters } from "./main-story";
import legacyCampaignLocks from "./content/main-story-migrations.json";
import { withCampaignContent } from "./campaign-content";
import { createContentActors } from "./worldgen";
import { migrateJourneys } from "./journey-migration";
import { defaultPhysique, profilePhysique } from "./physique";
import { pruneReceipts } from "./receipts";
import { validateWorld } from "./engine";
import { compactKnowledge, migrateKnowledge } from "./knowledge";
import { GameError } from "./protocol";
import type { Knowledge, World } from "./types";

/** Registered additive migration for the released xiantu-web-1 snapshot only.
 * Content/rules locks remain subject to validateWorld; this never blesses an unknown pack.
 */
export function migrateSave(value: unknown): { world: World; migrated: boolean } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new GameError("SAVE_VERSION_UNSUPPORTED", "存档格式无法识别，原进度未改变。");
  }
  const copy = structuredClone(value) as World;
  const version = (value as { schemaVersion?: unknown }).schemaVersion;
  if (
    version !== undefined &&
    version !== 1 &&
    version !== 2 &&
    version !== 3 &&
    version !== 4 &&
    version !== 5 &&
    version !== 6 &&
    version !== 7
  ) {
    throw new GameError(
      "SAVE_VERSION_UNSUPPORTED",
      "这是尚不支持的存档版本，请保留文件并使用对应版本打开。",
    );
  }
  const oldRules = (value as { rulesVersion?: unknown }).rulesVersion;
  const migrated = version !== 7 || oldRules !== "0.2.0";
  if (version !== 4 && version !== 5 && version !== 6 && version !== 7) {
    copy.negotiations = [];
    if (version !== 3) {
      copy.contentLocks = [];
      copy.contentState = {};
    } else {
      copy.contentLocks ??= [];
      copy.contentState ??= {};
    }
  }
  if (version !== 3 && version !== 4 && version !== 5 && version !== 6 && version !== 7) {
    // Old command IDs remain in appliedCommands and stay non-replayable when their
    // original payload is unknown. Do not invent receipts or delete old history.
    if (version !== 2) copy.commandReceipts = {};
    copy.knowledge = compactKnowledge(copy, migrateKnowledge(copy));
    copy.simulationOptions = { backgroundConflicts: false };
    for (const actor of [copy.player, ...copy.npcs]) actor.lastActionDay = copy.day - 1;
    if (copy.battle) copy.battle.lethal = false;
    if (copy.longAction) {
      const a = copy.longAction;
      a.id = `legacy-action:${copy.day - a.total + a.remaining}`;
      a.checkpoint = a.total - a.remaining;
      a.paidStones = a.kind === "train" && a.stoneMethod ? a.checkpoint : 0;
    }
  }
  if (oldRules === "0.1.1") copy.rulesVersion = "0.1.2";
  if (version === 3 || version === 4)
    copy.knowledge = compactKnowledge(copy, (value as { knowledge: Knowledge[] }).knowledge);
  if (version !== 5 && version !== 6 && version !== 7) {
    copy.receiptHistory = { count: 0, hash: "0".repeat(64) };
    pruneReceipts(copy);
  }
  if (version !== 6 && version !== 7) {
    copy.schemaVersion = 7;
    copy.profile.physique = profilePhysique(copy.profile);
    copy.player.physique = { ...copy.profile.physique };
    if (copy.profile.portraitId) copy.player.portraitId = copy.profile.portraitId;
    for (const actor of copy.npcs)
      actor.physique ??= defaultPhysique(actor.sex, actor.appearanceSeed);
  }
  requireSave(
    ["0.1.1", "0.1.2", "0.1.3", "0.1.4", "0.1.5", "0.1.6", "0.2.0"].includes(String(oldRules)),
    "规则版本不支持。",
  );
  requireSave(
    oldRules === "0.1.6" ||
      oldRules === "0.2.0" ||
      ![copy.player, ...copy.npcs].some((a) => a.npcJourney),
    "旧规则不支持 NPC 行程。",
  );
  const realmMigrated = oldRules !== "0.2.0";
  if (version !== 7 || realmMigrated) {
    copy.schemaVersion = 7;
    copy.dailyEventCooldowns ??= {};
    copy.pendingDailyEventId ??= null;
    for (const actor of [copy.player, ...copy.npcs]) {
      if (realmMigrated) {
        requireSave(
          Number.isInteger(actor.realm) && actor.realm >= 0 && actor.realm < 5,
          "旧档境界不合法。",
        );
        requireSave(
          Number.isSafeInteger(actor.xp) &&
            actor.xp >= 0 &&
            Number.isSafeInteger(actor.hp) &&
            actor.hp >= 0,
          "旧档修为或气血不合法。",
        );
        const oldRealm = actor.realm;
        // Keep already-started attempts on their original resolution table.
        const attempt =
          actor.id === "PLAYER" && copy.longAction?.kind === "breakthrough"
            ? copy.longAction
            : actor.attempt;
        if (attempt && !attempt.rule) {
          requireSave(oldRealm === 0 || oldRealm === 3, "旧档突破境界不合法。");
          attempt.rule = {
            targetRealm: oldRealm === 0 ? "QI_1" : "FOUNDATION_1",
            requiredExperience: oldRealm === 0 ? 20 : 100,
            failureExperienceLossBp: 2000,
            severeFailureConditionalBp: oldRealm === 0 ? 0 : 1000,
          };
        }
        actor.realm = legacyRealmIndex(oldRealm);
        actor.xp = Math.min(actor.xp, threshold(actor));
        actor.hp = Math.min(actor.hp, stats(actor).maxHp);
      }
      actor.insight ??= 0;
      actor.manualRank ??= 0;
      actor.skills ??= ["qingmang"];
      actor.qi ??= 0;
      actor.jobCooldowns ??= {};
      if (actor.sectMembership) {
        actor.sectMembership.rank ??= "outer";
        actor.sectMembership.questStep ??= 0;
        actor.sectMembership.lastStipendDay ??= actor.sectMembership.joinedDay;
      }
    }
    if (copy.agreement) copy.agreement.terms ??= "story";
  }
  const journeyMigrated = migrateJourneys(copy);
  const campaignMigrated =
    copy.campaignLock === undefined || legacyCampaignLocks.includes(copy.campaignLock);
  if (campaignMigrated) copy.campaignLock = MAIN_STORY_LOCK;
  // Validate the old graph before adding anything: unknown versions, orphan identities
  // and malformed histories must not be repaired into apparently legitimate saves.
  const previousRules = copy.rulesVersion;
  copy.rulesVersion = "0.2.0";
  validateWorld(copy);
  const atlasMigrated = ["0.1.2", "0.1.3"].includes(previousRules);

  const locks = withCampaignContent(copy.contentLocks);
  const missing = locks.filter((lock) => !copy.contentLocks.includes(lock));
  if (missing.length) {
    if (!copy.campaignHistory && copy.events.some((event) => event.mainStory))
      copy.campaignHistory = {
        eventCount: copy.events.length,
        chapters: mainChapters(copy).map((c) => c.id),
      };
    const added = createContentActors(copy.seed, missing, copy.day);
    if (copy.npcs.length + added.length > 200)
      throw new GameError(
        "SAVE_VERSION_UNSUPPORTED",
        "本局人物已接近容量上限，暂无法接续四卷。原档已保留。",
      );
    copy.npcs.push(...added);
    copy.contentLocks = locks;
    validateWorld(copy);
  }
  const namesMigrated = deduplicateNpcNames(copy).length > 0;
  if (namesMigrated) validateWorld(copy);
  return {
    world: copy,
    migrated:
      migrated ||
      realmMigrated ||
      atlasMigrated ||
      journeyMigrated ||
      campaignMigrated ||
      missing.length > 0 ||
      namesMigrated,
  };
}
