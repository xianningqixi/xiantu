import { knowledgeEntries } from "./knowledge";
import { B } from "./rules";
import { requireSave as requireRule } from "./errors";
import { validTerms, proposalSchema } from "./negotiation";
import { selectedExtensions } from "./content/extensions";
import { PACK, LOCATIONS } from "./content/official";
import type { Fighter, World } from "./types";
import { threshold, stats, actorById } from "./rules";

export function validateWorld(w: World) {
  requireRule(
    w?.format === "xiantu-web-1" && w.rulesVersion === "0.1.2" && w.packLock === PACK.lock,
    "存档格式或内容版本不匹配。",
  );
  const object = (value: unknown) => !!value && typeof value === "object" && !Array.isArray(value);
  requireRule(
    w.schemaVersion === 5 && object(w.commandReceipts),
    "存档结构版本不支持，请使用迁移入口。",
  );
  requireRule(
    Array.isArray(w.negotiations) &&
      new Set(w.negotiations.map((n) => n.proposalId)).size === w.negotiations.length,
    "交涉记录重复或缺失。",
  );
  for (const n of w.negotiations)
    requireRule(
      typeof n.proposalId === "string" &&
        n.proposalId.length > 0 &&
        typeof n.sessionId === "string" &&
        n.sessionId.length > 0 &&
        n.target === PACK.roles.primary &&
        Number.isSafeInteger(n.day) &&
        n.day >= 0 &&
        n.day <= w.day &&
        Number.isSafeInteger(n.revision) &&
        n.revision > 0 &&
        n.revision <= w.revision &&
        proposalSchema.safeParse(n.proposal).success &&
        validTerms(n.proposal),
      "交涉历史无效。",
    );
  requireRule(
    object(w.receiptHistory) &&
      Number.isSafeInteger(w.receiptHistory.count) &&
      w.receiptHistory.count >= 0 &&
      w.receiptHistory.count <= w.appliedCommands?.length &&
      /^[0-9a-f]{64}$/.test(w.receiptHistory.hash),
    "回执累计记录不合法。",
  );
  requireRule(
    Object.keys(w.commandReceipts).length <= B.limits.recentCommandReceipts,
    "近期回执超过上限。",
  );
  const commandIds = new Set(Array.isArray(w.appliedCommands) ? w.appliedCommands : []);
  requireRule(
    Object.entries(w.commandReceipts).every(
      ([id, r]) =>
        commandIds.has(id) &&
        object(r) &&
        typeof r.fingerprint === "string" &&
        r.fingerprint.length <= 16384 &&
        Number.isSafeInteger(r.revision) &&
        r.revision > 0 &&
        r.revision <= w.revision,
    ),
    "行动回执不完整。",
  );
  requireRule(
    typeof w.saveId === "string" &&
      w.saveId.length > 0 &&
      Number.isInteger(w.seed) &&
      w.seed >= 0 &&
      w.seed <= 4294967295,
    "存档身份或世界种子不合法。",
  );
  requireRule(object(w.profile) && object(w.profile.appearance), "角色创建资料不完整。");
  const profile = w.profile;
  requireRule(
    typeof profile.name === "string" &&
      profile.name.trim().length > 0 &&
      profile.name.length <= 16 &&
      ["female", "male"].includes(profile.sex) &&
      ["simple", "complex"].includes(profile.mode) &&
      ["focus", "ward", "bond"].includes(profile.artifact),
    "角色资料不合法。",
  );
  requireRule(
    Number.isInteger(profile.aptitude) &&
      profile.aptitude >= 1 &&
      profile.aptitude <= 100 &&
      ["face", "hair", "color"].every(
        (key) =>
          Number.isInteger(profile.appearance[key as keyof typeof profile.appearance]) &&
          profile.appearance[key as keyof typeof profile.appearance] >= 0 &&
          profile.appearance[key as keyof typeof profile.appearance] < 4,
      ),
    "资质或外貌配置不合法。",
  );
  requireRule(
    object(w.player) &&
      w.player.name === profile.name &&
      w.player.sex === profile.sex &&
      w.player.aptitude === profile.aptitude,
    "玩家身份与创建资料不一致。",
  );
  requireRule(
    object(w.story) &&
      object(w.story.flags) &&
      Object.values(w.story.flags).every((v) => typeof v === "boolean") &&
      typeof w.story.compensated === "boolean",
    "故事进度不完整。",
  );
  requireRule(
    typeof w.ended === "boolean" &&
      typeof w.notice === "string" &&
      Number.isInteger(w.lastExpeditionDay),
    "游戏状态不合法。",
  );
  requireRule(
    Number.isSafeInteger(w.day) &&
      w.day >= 0 &&
      Number.isSafeInteger(w.revision) &&
      w.revision >= 0,
    "日期或存档版本不合法。",
  );
  requireRule(
    Array.isArray(w.npcs) && w.npcs.length >= 2 && w.npcs.length <= 200,
    "人物数量不合法。",
  );
  const extensionSet = selectedExtensions(w.contentLocks);
  requireRule(
    object(w.contentState) && Object.values(w.contentState).every((v) => typeof v === "boolean"),
    "支线进度不合法。",
  );
  const allowedKeys = new Set(
    extensionSet.flatMap((e) => [...e.data.manifest.flags, ...e.data.storylets.map((n) => n.id)]),
  );
  requireRule(
    Object.keys(w.contentState).every((key) => allowedKeys.has(key)),
    "支线进度越过内容包范围。",
  );
  const actors = [w.player, ...w.npcs];
  const ids = new Set(actors.map((a) => a.id));
  requireRule(ids.size === actors.length && w.player.id === "PLAYER", "人物身份重复或缺失。");
  requireRule(ids.has(PACK.roles.primary) && ids.has(PACK.roles.companion), "必要的故事人物缺失。");
  for (const a of actors) {
    requireRule(
      typeof a.name === "string" && a.name.length >= 1 && a.name.length <= 16,
      "人物姓名不合法。",
    );
    requireRule(Number.isInteger(a.realm) && a.realm >= 0 && a.realm <= 4, "境界不合法。");
    requireRule(a.location in LOCATIONS, "人物地点不合法。");
    for (const k of [
      "ageDays",
      "xp",
      "hp",
      "stones",
      "healing",
      "pills",
      "grass",
      "readyDay",
    ] as const)
      requireRule(Number.isSafeInteger(a[k]) && a[k] >= 0, `${a.name}的状态不合法。`);
    requireRule(a.xp <= threshold(a) && a.hp <= stats(a).maxHp, "修为或气血超过当前境界上限。");
    requireRule(
      typeof a.alive === "boolean" && typeof a.manual === "boolean",
      "人物生死或功法状态不合法。",
    );
  }
  requireRule(
    Array.isArray(w.party) &&
      w.party.length >= 1 &&
      w.party.length <= 3 &&
      new Set(w.party).size === w.party.length &&
      w.party.includes("PLAYER"),
    "队伍不合法。",
  );
  for (const id of w.party) {
    const a = actorById(w, id);
    requireRule(
      a && (id === "PLAYER" || a.alive) && a.location === w.player.location,
      "同伴身份或位置不一致。",
    );
  }
  requireRule(
    Array.isArray(w.events) && new Set(w.events.map((e) => e.id)).size === w.events.length,
    "事件 ID 重复。",
  );
  const eventIds = new Set(w.events.map((e) => e.id));
  for (const e of w.events)
    requireRule(
      typeof e.text === "string" &&
        Number.isInteger(e.day) &&
        e.day <= w.day &&
        e.actors.every((id) => ids.has(id)),
      "事件引用不合法。",
    );
  requireRule(
    object(w.simulationOptions) && typeof w.simulationOptions.backgroundConflicts === "boolean",
    "世界演化设置不合法。",
  );
  requireRule(object(w.knowledge), "知情记忆缺失。");
  const evidence = new Map(w.events.map((e) => [e.id, e]));
  const knowledgeKeys = new Set<string>();
  for (const m of knowledgeEntries(w)) {
    const e = evidence.get(m.eventId);
    const key = JSON.stringify([m.eventId, m.knower]);
    requireRule(
      e &&
        ids.has(m.knower) &&
        ["participant", "witness", "told", "public", "legacy"].includes(m.source) &&
        Number.isSafeInteger(m.learnedDay) &&
        m.learnedDay >= e.day &&
        m.learnedDay <= w.day &&
        (m.sourceActor === null || ids.has(m.sourceActor)) &&
        !knowledgeKeys.has(key),
      "知情来源或引用不合法。",
    );
    if (m.source === "participant")
      requireRule(e?.actors.includes(m.knower), "当事人记忆与事实不符。");
    if (m.source === "public") requireRule(e?.public, "私密事件不能伪装为公告。");
    if (m.source === "told") requireRule(m.sourceActor !== null, "告知必须保留来源。");
    knowledgeKeys.add(key);
  }
  for (const m of knowledgeEntries(w))
    if (m.source === "told")
      requireRule(
        knowledgeKeys.has(JSON.stringify([m.eventId, m.sourceActor])),
        "告知人并不知道这件事。",
      );
  for (const a of actors)
    requireRule(
      Number.isSafeInteger(a.lastActionDay) && a.lastActionDay >= -1 && a.lastActionDay <= w.day,
      "人物行动日不合法。",
    );
  requireRule(Array.isArray(w.relations), "关系数据不合法。");
  for (const r of w.relations) {
    requireRule(ids.has(r.from) && ids.has(r.to), "关系引用了未知人物。");
    requireRule(
      Number.isInteger(r.favor) &&
        r.favor >= -100 &&
        r.favor <= 100 &&
        Number.isInteger(r.trust) &&
        r.trust >= -100 &&
        r.trust <= 100 &&
        Number.isInteger(r.attraction) &&
        r.attraction >= 0 &&
        r.attraction <= 100,
      "关系数值不合法。",
    );
    requireRule(
      Array.isArray(r.memories) &&
        r.memories.every(
          (id) => eventIds.has(id) && knowledgeKeys.has(JSON.stringify([id, r.from])),
        ),
      "记忆没有对应的已知历史事件。",
    );
    if (r.socialEventId)
      requireRule(
        r.memories.includes(r.socialEventId) && evidence.get(r.socialEventId)?.kind === "social",
        "交往摘要引用无效。",
      );
  }
  for (const k of ["simulation", "combat"] as const)
    requireRule(
      Number.isInteger(w.rng[k]) && w.rng[k] > 0 && w.rng[k] <= 4294967295,
      "随机状态不合法。",
    );
  requireRule(
    Array.isArray(w.appliedCommands) && w.appliedCommands.every((id) => typeof id === "string"),
    "行动去重记录不合法。",
  );
  requireRule(
    w.story && ["none", "fulfilled", "breached", "not_triggered"].includes(w.story.outcome),
    "故事状态不合法。",
  );
  if (w.longAction)
    requireRule(
      ["train", "wait", "breakthrough"].includes(w.longAction.kind) &&
        Number.isInteger(w.longAction.remaining) &&
        w.longAction.remaining > 0 &&
        w.longAction.remaining <= w.longAction.total &&
        w.longAction.total <= 30,
      "长行动状态不合法。",
    );
  for (const a of actors) {
    requireRule(
      ["female", "male"].includes(a.sex) &&
        Number.isInteger(a.aptitude) &&
        a.aptitude >= 1 &&
        a.aptitude <= 100 &&
        typeof a.activity === "string" &&
        typeof a.sect === "string" &&
        typeof a.personality === "string" &&
        typeof a.goal === "string",
      "人物资料不完整。",
    );
    if (a.attempt)
      requireRule(
        Number.isInteger(a.attempt.remaining) &&
          a.attempt.remaining >= 1 &&
          a.attempt.remaining <= 2 &&
          Number.isInteger(a.attempt.chance) &&
          a.attempt.chance >= 0 &&
          a.attempt.chance <= 10000,
        "突破进度不合法。",
      );
  }
  if (w.agreement) {
    const a = w.agreement;
    requireRule(
      typeof a.id === "string" &&
        [
          "accepted",
          "active",
          "fulfilled",
          "breached",
          "not_triggered",
          "cancelled",
          "impossible",
        ].includes(a.status) &&
        Array.isArray(a.members) &&
        a.members.length === 3 &&
        new Set(a.members).size === 3 &&
        a.members.every((id) => ids.has(id)) &&
        ["PLAYER", PACK.roles.primary, PACK.roles.companion].every((id) =>
          a.members.includes(id),
        ) &&
        a.recipient === PACK.roles.primary &&
        typeof a.strict === "boolean",
      "同行约定不合法。",
    );
    if (a.meeting)
      requireRule(
        a.meeting.location in LOCATIONS && a.meeting.location !== "ruins",
        "会合地点不合法。",
      );
  }
  if (w.longAction) {
    const a = w.longAction;
    requireRule(
      typeof a.id === "string" &&
        a.id.length > 0 &&
        a.checkpoint === a.total - a.remaining &&
        Number.isSafeInteger(a.paidStones) &&
        a.paidStones >= 0 &&
        a.paidStones <=
          a.checkpoint * B.cultivation.methods.METHOD_SPIRIT_STONE.costSpiritStonesPerDay,
      "长行动检查点或已付款记录不合法。",
    );
    requireRule(
      Number.isInteger(a.total) &&
        Number.isInteger(a.chance) &&
        a.chance >= 0 &&
        a.chance <= 10000 &&
        typeof a.stoneMethod === "boolean" &&
        (a.guardian === null || ids.has(a.guardian)),
      "长行动资料不完整。",
    );
  }
  if (w.loot)
    requireRule(
      w.loot.stones === B.economy.expeditionSpiritStoneReward &&
        w.loot.grass === B.economy.expeditionNingyuanGrassReward &&
        !!w.agreement &&
        w.agreement.expeditionId === w.loot.expeditionId,
      "战利品与约定不匹配。",
    );
  if (w.battle) {
    const b = w.battle;
    requireRule(
      typeof b.id === "string" &&
        Number.isInteger(b.round) &&
        b.round >= 1 &&
        typeof b.auto === "boolean" &&
        typeof b.lethal === "boolean" &&
        Array.isArray(b.logs) &&
        b.logs.every((t) => typeof t === "string") &&
        Array.isArray(b.allies) &&
        Array.isArray(b.enemies) &&
        b.enemies.length > 0,
      "战斗资料不完整。",
    );
    requireRule(
      w.player.location === "ruins" &&
        b.allies.length === w.party.length &&
        new Set(b.allies.map((a) => a.id)).size === w.party.length &&
        b.allies.every((a) => w.party.includes(a.id)),
      "战斗位置或队伍不匹配。",
    );
    for (const f of [...b.allies, ...b.enemies])
      requireRule(
        typeof f.name === "string" &&
          typeof f.guard === "boolean" &&
          ["hp", "maxHp", "attack", "defense", "speed", "cooldown"].every(
            (k) =>
              Number.isSafeInteger(f[k as keyof Fighter]) && Number(f[k as keyof Fighter]) >= 0,
          ) &&
          f.maxHp > 0 &&
          f.hp <= f.maxHp &&
          f.cooldown <= 3,
        "战斗人物状态不合法。",
      );
  }
}
