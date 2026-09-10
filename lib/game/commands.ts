import { requireJob, settleJob } from "./jobs";
import { upgradeManual, rentCave, sell, useQi } from "./economy";
import { sectExchange } from "./sects";
import { chooseDailyEvent, waitReceipt } from "./daily-events";
import { realmIndex } from "./rules";
import { storyIntimacyKind } from "./intimacy-history";
import {
  currentPortrait,
  originalPortrait,
  canRestorePortrait,
  restorePortrait,
} from "./portrait-restore";
import {
  visitSect,
  joinSect,
  requireSectHome,
  settleSectTask,
  learnSectArt,
  leaveSect,
} from "./sects";
import {
  intimacyBoundaryReason,
  companyReason,
  intimacyReason,
  recordCompany,
  settleIntimacy,
} from "./intimacy";
import { MAIN_STORY, mainScene, hasRubbing } from "./main-story";
import { commandDays, travelDays } from "./action-cost";
import { advanceStopReason, validateStopCondition } from "./advance";
import { DEPARTURE_FEE, ALL_SHOP_ITEMS as SHOP_ITEMS, STONE_METHOD } from "./economy";
import { validTerms } from "./negotiation";
import { extensionScenes } from "./content-story";
import { PACK, REALMS, PRESENTATION, contentText } from "./content/official";
import { LOCATIONS, travelRoute, locationKind, locationEnabled, regionOf } from "./world-map";
import type { Command, World } from "./types";
import { B, advanceRule, threshold, stats, requireRule, actorById } from "./rules";
import { relation, ensureRelation, memory, meet } from "./relationships";
import {
  partyReadiness,
  departureStatus,
  updateAgreementAvailability,
  acceptAgreement,
  renewalReason,
} from "./agreement";
import { scene } from "./story";
import {
  advanceMinor,
  learn,
  cultivate,
  breakthroughChance,
  breakthroughResult,
} from "./cultivation";
import { advanceDay } from "./daily-simulation";
import { fighter, battleRound } from "./combat";
import { recordFact as record } from "./knowledge";

type CommandHandlers = {
  [K in Command["type"]]: (world: World, command: Command & { type: K }) => void;
};

const commandHandlers: CommandHandlers = {
  upgradeManual,
  rentCave,
  sectExchange,
  sell: (w, c) => sell(w, c.item, c.quantity),
  use: (w) => useQi(w),
  advanceMinor: (w) => advanceMinor(w, w.player),
  visitSect: (w, c) => visitSect(w, c.sectId),
  joinSect: (w, c) => joinSect(w, c.sectId),
  learnSectArt: (w) => learnSectArt(w),
  leaveSect: (w) => leaveSect(w),
  sectTask: (w, c) => {
    requireSectHome(w);
    for (let d = 0; d < commandDays(w, c) && !w.ended; d++) advanceDay(w, new Set(w.party));
    if (!w.ended) settleSectTask(w, w.player);
  },
  spendTime: (w, c) => {
    const a = actorById(w, c.target);
    const reason = companyReason(w, w.player, a);
    requireRule(!reason, reason);
    for (let d = 0; d < commandDays(w, c) && !w.ended; d++)
      advanceDay(w, new Set([...w.party, c.target]));
    if (w.ended || !a!.alive) return;
    w.notice = `你与${a!.name}相伴交流 ${commandDays(w, c)} 日，分享行路见闻与修行心得，彼此多了一分了解。`;
    recordCompany(w, w.player, a!, w.notice);
  },
  intimacy: (w, c) => {
    const a = actorById(w, c.target);
    const reason = intimacyReason(w, w.player, a, c.kind);
    requireRule(!reason, reason);
    for (let d = 0; d < commandDays(w, c) && !w.ended; d++)
      advanceDay(w, new Set([...w.party, c.target]));
    if (w.ended || !a!.alive) return;
    w.notice = settleIntimacy(w, w.player, a!, c.kind);
  },
  chooseMain: (w, c) => {
    const node = mainScene(w);
    requireRule(node?.id === c.nodeId, "主线条件已变化，请核对地点、人物与时间。");
    const choice = node!.choices.find((x) => x.id === c.choiceId);
    requireRule(choice, "主线选项不存在。");
    for (const id of node!.participants) if (!relation(w, id)?.known) meet(w, id);
    record(
      w,
      "main-story",
      `${node!.title}：${node!.body} 你选择：${choice!.label}。${choice!.reply}`,
      ["PLAYER", ...node!.participants],
    );
    w.events[w.events.length - 1].mainStory = { nodeId: node!.id, choiceId: choice!.id };
    w.notice = choice!.reply;
    const chapterIndex = MAIN_STORY.chapters.findIndex((ch) => ch.discovery.id === node!.id);
    if (chapterIndex >= 0) {
      const stones = B.economy.chapterRewards[chapterIndex];
      w.player.stones += stones;
      w.player.insight += B.cultivation.insight.chapterGain;
      record(
        w,
        "chapter-reward",
        `本章查证完成，获得 ${stones} 枚灵石、${B.cultivation.insight.chapterGain} 感悟。`,
      );
      w.notice += ` 获得 ${stones} 枚灵石、${B.cultivation.insight.chapterGain} 感悟。`;
    }
  },
  surveyRuins: (w, c) => {
    requireRule(
      w.player.location === "gate" &&
        w.player.realm >= realmIndex(B.story.playerMinimumExplorationRealm) &&
        w.party.length === 1 &&
        !w.loot,
      "成为炼气修士后，可独自到山门古道勘察残碑。",
    );
    requireRule(!hasRubbing(w), "残碑拓片已取得，沿主线继续查证即可。");
    const days = commandDays(w, c);
    for (let day = 0; day < days && !w.ended; day++) advanceDay(w);
    if (w.ended) return;
    w.notice = `你在古道残碑外沿勘察 ${days} 日，拓下可疑水纹。明日回坊市查证水纹的来历。`;
    record(w, "survey", w.notice);
  },
  attachPortrait: (w, c) => {
    const actor = actorById(w, c.target);
    requireRule(actor, "人物不存在。");
    actor!.portraitOriginal ??= structuredClone(
      originalPortrait(w, actor!) ?? currentPortrait(w, actor!),
    );
    if (c.look) {
      requireRule(
        c.look.physique.apparentAge === actor!.physique!.apparentAge,
        "重绘不会改变人物年龄。",
      );
      actor!.physique = structuredClone(c.look.physique);
      if (c.target === "PLAYER") {
        w.profile.appearance = { ...c.look.appearance };
        w.profile.physique = structuredClone(c.look.physique);
        w.profile.portraitFeatures = structuredClone(c.look.portraitFeatures);
      } else {
        actor!.portraitAppearance = { ...c.look.appearance };
        actor!.portraitFeatures = structuredClone(c.look.portraitFeatures);
      }
    }
    actor!.portraitId = c.portraitId;
    if (c.target === "PLAYER") w.profile.portraitId = c.portraitId;
    w.notice = `${actor!.name}的全身立绘已保存。`;
  },
  restorePortrait: (w, c) => {
    const actor = actorById(w, c.target);
    requireRule(actor, "人物不存在。");
    requireRule(canRestorePortrait(w, actor!), "当前没有可恢复的原立绘。", "ACTION_UNAVAILABLE");
    const original = originalPortrait(w, actor!)!;
    restorePortrait(w, actor!, original);
    w.notice = `${actor!.name}已恢复原立绘与对应形貌。`;
  },
  renewAgreement: (w) => {
    const reason = renewalReason(w);
    requireRule(!reason, reason);
    acceptAgreement(w);
    w.notice = "新的同行约定已记下。旧日经历仍然保留，路费在本次出发时支付。";
  },
  adoptNegotiation: (w, c) => {
    const p = w.player;

    requireRule(
      c.saveId === w.saveId && c.revision === w.revision,
      "交涉期间进度已经变化，请重新商议。",
    );
    requireRule(!w.negotiations.some((n) => n.proposalId === c.proposalId), "这份提议已经采用。");
    requireRule(
      c.target === PACK.roles.primary &&
        ["invite", "counter_offer", "accept"].includes(c.proposal.intent) &&
        validTerms(c.proposal),
      "条款尚未完整或超出当前可商议范围，请继续澄清。",
    );
    requireRule(
      w.party.length === 1 && p.stones >= DEPARTURE_FEE,
      `需要空出的队伍与至少 ${DEPARTURE_FEE} 枚灵石路费。`,
    );
    acceptAgreement(w);
    w.negotiations.push({
      proposalId: c.proposalId,
      sessionId: c.sessionId,
      target: c.target,
      day: w.day,
      revision: w.revision + 1,
      proposal: c.proposal,
    });
    record(
      w,
      "negotiation",
      `你确认了与${actorById(w, c.target)!.name}的同行草案：${c.proposal.reply} 条款：下一次秘境，三人同行，第一株凝元草归对方，其余战利品归你，出发支付 ${DEPARTURE_FEE} 灵石。`,
      ["PLAYER", c.target],
    );
    w.notice = "同行条款已确认并保存。会合后即可组队出发。";
    return;
  },
  chooseExtension: (w, c) => {
    const p = w.player;

    const node = extensionScenes(w).find((n) => n.id === c.nodeId);
    requireRule(node, "支线已变化，或参与者不在场。");
    const choice = node!.choices.find((x) => x.id === c.choiceId);
    requireRule(choice, "支线选项已失效。");
    if (storyIntimacyKind(node!.id, choice!.id)) {
      for (const e of choice!.effects)
        if (e.kind === "experience") {
          const reason = intimacyBoundaryReason(w, p, actorById(w, e.target));
          requireRule(!reason, reason);
        }
    }
    for (const e of choice!.effects) {
      if (e.kind === "progress") w.contentState[e.key] = true;
      if (e.kind === "meet") meet(w, e.target);
      if (e.kind === "starterManual") learn(w, p);
      if (e.kind === "buyItem") handle(w, { type: "buy", item: e.item });
      if (e.kind === "experience") {
        const eventId = record(w, "shared-experience", e.text, ["PLAYER", e.target]);
        const r = ensureRelation(w, e.target);
        r.memories.push(eventId);
      }
      if (e.kind === "agreement") acceptAgreement(w);
    }
    w.contentState[node!.id] = true;
    record(
      w,
      "story-choice",
      `${node!.title}：${node!.body} ${node!.quote ?? ""} 你选择：${choice!.label}。${choice!.reply}`,
      ["PLAYER", ...node!.participants],
    );
    w.events[w.events.length - 1].storyNodeId = node!.id;
    w.notice = choice!.reply;
    return;
  },
  choose: (w, c) => {
    if (w.pendingDailyEventId) {
      const days = chooseDailyEvent(w, c.nodeId, c.choiceId);
      const reply = w.notice;
      for (let d = 0; d < days && !w.ended; d++) advanceDay(w);
      if (!w.ended) w.notice = reply;
      return;
    }
    const p = w.player;

    const n = scene(w);
    requireRule(n?.id === c.nodeId, "这一幕已经变化，请使用当前选项。");
    const choice = n!.choices.find((x) => x.id === c.choiceId);
    requireRule(choice, "当前没有这个选项。");
    for (const e of choice!.effects) {
      if (e.kind === "meet") meet(w, PACK.roles[e.target as keyof typeof PACK.roles]);
      if (e.kind === "learn") learn(w, p);
      if (e.kind === "flag") {
        requireRule(PACK.declaredFlags.includes(e.key || ""), "故事进度字段不受支持。");
        w.story.flags[e.key!] = true;
        if (e.key === "reunion")
          record(w, "reunion", choice!.reply, ["PLAYER", PACK.roles.primary]);
      }
      if (e.kind === "agreement") {
        acceptAgreement(w);
      }
    }
    w.notice = choice!.reply;
    return;
  },
  meet: (w, c) => {
    const p = w.player;
    meet(w, c.target);
    return;
  },
  learn: (w, c) => {
    const p = w.player;
    requireRule(locationKind(p.location) === "inn", "请到客栈领取入门经书。");
    learn(w, p);
    return;
  },
  travel: (w, c) => {
    const p = w.player;

    requireRule(!w.loot, "先带着战利品返回坊市结算。");
    requireRule(
      w.party.every((id) => !actorById(w, id)?.attempt),
      "同伴正在突破，请等候完成后再动身。",
    );
    requireRule(locationEnabled(w, c.to), "目的地尚未载入此世。");
    const route = travelRoute(p.location, c.to, w);
    requireRule(route && p.location !== c.to, "这里不能直接到达那个地点。");
    const time = route!.days;
    for (let d = 0; d < time; d++) advanceDay(w, new Set(w.party), "travel");
    if (w.ended) return;
    p.location = c.to;
    for (const id of w.party) actorById(w, id)!.location = c.to;
    w.notice = `你来到${LOCATIONS[c.to].name}${time ? `，路上经过 ${time} 日` : ""}。`;
    record(w, "travel", w.notice, w.party);
    return;
  },
  train: (w, c) => {
    validateStopCondition(w, c.stopWhen);
    requireRule(
      !c.stopWhen || !advanceStopReason(w, { kind: "cultivationReady" }),
      "修为已圆满，无需继续修行。",
      "ACTION_UNAVAILABLE",
    );
    requireRule(
      !advanceStopReason(w, c.stopWhen),
      "停止条件已经满足，无需继续修行。",
      "ACTION_UNAVAILABLE",
    );
    const p = w.player;
    requireRule(p.manual, "先在客栈领取并学习入门功法。");
    requireRule(p.location !== "ruins", "秘境不宜静修。");
    requireRule([1, 3, 7, 30].includes(c.days), "修炼天数不合法。");
    requireRule(
      !c.stoneMethod || p.stones >= c.days * STONE_METHOD.costSpiritStonesPerDay,
      "灵石不足以完成这段修炼。",
    );
    w.longAction = {
      id: `action:${w.revision + 1}`,
      checkpoint: 0,
      paidStones: 0,
      kind: "train",
      ...(c.stopWhen ? { stopWhen: c.stopWhen } : {}),
      total: c.days,
      remaining: c.days,
      stoneMethod: c.stoneMethod,
      chance: 0,
      guardian: null,
    };
    w.notice = "你收拢心神，开始吐纳。";
    return;
  },
  wait: (w, c) => {
    validateStopCondition(w, c.stopWhen);
    requireRule(
      !advanceStopReason(w, c.stopWhen),
      "停止条件已经满足，无需继续等候。",
      "ACTION_UNAVAILABLE",
    );
    const p = w.player;
    requireRule(p.location !== "ruins", "先离开秘境。");
    requireRule([1, 3, 7, 30].includes(c.days), "等待天数不合法。");
    w.longAction = {
      id: `action:${w.revision + 1}`,
      checkpoint: 0,
      paidStones: 0,
      kind: "wait",
      ...(c.stopWhen ? { stopWhen: c.stopWhen } : {}),
      total: c.days,
      remaining: c.days,
      stoneMethod: false,
      chance: 0,
      guardian: null,
    };
    return;
  },
  step: (w, c) => {
    const p = w.player;

    const a = w.longAction;
    requireRule(a, "没有正在进行的长行动。");
    const occupied = new Set(["PLAYER", ...(a!.guardian ? [a!.guardian] : [])]);
    advanceDay(w, occupied, a!.kind === "breakthrough" ? undefined : a!.kind);
    if (w.ended) return;
    if (a!.kind === "train") cultivate(w, p, a!.stoneMethod);
    a!.remaining--;
    a!.checkpoint++;
    if (a!.kind === "train" && a!.stoneMethod) a!.paidStones += STONE_METHOD.costSpiritStonesPerDay;
    const cultivationStop =
      a!.kind === "train" && a!.stopWhen
        ? advanceStopReason(w, { kind: "cultivationReady" }, w.day - 1)
        : null;
    const stopReason =
      cultivationStop ||
      (a!.stopWhen?.kind === "importantEvent"
        ? null
        : advanceStopReason(w, a!.stopWhen, w.day - 1));
    if (a!.remaining === 0 || stopReason) {
      if (a!.kind === "breakthrough") {
        const success = breakthroughResult(w, p, a!.chance, a!.rule);
        w.notice = success
          ? `气机贯通，你踏入了${REALMS[p.realm]}。`
          : "气息渐散，这次突破未成。损失了修为，但性命无碍；养足修为后仍可重试。";
      } else {
        w.notice =
          a!.kind === "train"
            ? `${a!.checkpoint}日修炼结束。山中无甲子，故人也在各自前行。`
            : waitReceipt(w);
        if (stopReason) w.notice += ` ${stopReason}`;
        record(w, a!.kind, w.notice);
      }
      w.longAction = null;
    } else
      w.notice = `${a!.kind === "wait" ? "等候" : a!.kind === "breakthrough" ? "突破" : "修炼"}已过 ${a!.total - a!.remaining} 日，还剩 ${a!.remaining} 日。`;
    if (!w.ended && a!.kind === "wait") w.notice = waitReceipt(w);
    if (w.pendingDailyEventId) w.notice = w.events.findLast((e) => e.kind === "daily-event")!.text;
    return;
  },
  stop: (w, c) => {
    const p = w.player;
    requireRule(w.longAction?.kind !== "breakthrough", "突破开始后需要完成，不能中断。");
    requireRule(w.longAction, "没有正在进行的长行动。");
    w.notice = "你提前结束了闭关，已经获得的修为保留。";
    record(w, "stop", w.notice);
    w.longAction = null;
    return;
  },
  work: (w, c) => {
    const job = c.job ?? "chores";
    const rule = requireJob(w, job);
    for (let d = 0; d < rule.days && !w.ended; d++) advanceDay(w, new Set(["PLAYER"]), "work");
    if (!w.ended) settleJob(w, job);
  },
  rest: (w, c) => {
    const p = w.player;
    requireRule(p.location !== "ruins", "先离开秘境再休息。");
    for (let d = 0; d < commandDays(w, c); d++) advanceDay(w);
    if (w.ended) return;
    p.hp = Math.min(
      stats(p).maxHp,
      p.hp + Math.ceil((stats(p).maxHp * B.actions.restRestoreMaxHpBp) / B.probabilityScaleBp),
    );
    w.notice = "你歇息一日，气血渐复。";
    record(w, "rest", w.notice);
    return;
  },
  heal: (w, c) => {
    const p = w.player;
    requireRule(p.healing > 0 && p.hp < stats(p).maxHp, "没有丹药，或气血已经充足。");
    p.healing--;
    p.hp = Math.min(
      stats(p).maxHp,
      p.hp +
        Math.ceil((stats(p).maxHp * B.combat.healingPillRestoreMaxHpBp) / B.probabilityScaleBp),
    );
    w.notice = "服下回春丹，气血恢复。";
    record(w, "heal", w.notice);
    return;
  },
  buy: (w, c) => {
    const p = w.player;

    requireRule(locationKind(p.location) === "market", "请到坊市药铺购买。");
    const price = SHOP_ITEMS[c.item].price;
    requireRule(price && p.stones >= price, "灵石不足。", "INSUFFICIENT_RESOURCES");
    p.stones -= price;
    p[c.item]++;
    w.notice = `你花费 ${price} 枚灵石，购得${SHOP_ITEMS[c.item].name}。`;
    record(w, "buy", w.notice);
    return;
  },
  exchange: (w, c) => {
    const p = w.player;
    requireRule(
      locationKind(p.location) === "market" &&
        p.grass >= B.economy.pillExchange.inputQuantity &&
        p.stones >= B.economy.pillExchange.spiritStoneCost,
      `兑换需要在坊市交付 ${B.economy.pillExchange.inputQuantity} 株凝元草和 ${B.economy.pillExchange.spiritStoneCost} 枚灵石。`,
    );
    p.grass--;
    p.stones -= B.economy.pillExchange.spiritStoneCost;
    p.pills++;
    w.notice = `药师收下凝元草与 ${B.economy.pillExchange.spiritStoneCost} 枚灵石，交给你突破丹。`;
    record(w, "exchange", w.notice);
    return;
  },
  breakthrough: (w, c) => {
    const p = w.player;

    requireRule(
      p.location !== "ruins" &&
        ["mortal-entry", "bottleneck", "major"].includes(advanceRule(p).kind) &&
        p.xp >= threshold(p),
      "尚未满足突破条件。",
    );
    requireRule(
      !c.usePill || (advanceRule(p).kind === "major" && p.pills > 0),
      "仅大突破可用丹药，且需拥有突破丹。",
    );
    let guardian: string | null = null;
    if (c.guardian) {
      const a = actorById(w, PACK.roles.primary)!;
      const r = relation(w, a.id);
      requireRule(
        advanceRule(p).kind === "major" &&
          a.alive &&
          !a.attempt &&
          a.location === p.location &&
          a.realm >= p.realm &&
          (r?.trust || 0) >= B.cultivation.breakthrough.guardianMinimumTrust &&
          (r?.favor || 0) >= B.cultivation.breakthrough.guardianMinimumFavorability,
        "护法需要在场、空闲、境界足够且信任你的同伴。",
      );
      guardian = a.id;
    }
    const chance = breakthroughChance(w, p, c.usePill, !!guardian);
    if (c.usePill) p.pills--;
    p.insight = 0;
    w.longAction = {
      id: `action:${w.revision + 1}`,
      checkpoint: 0,
      paidStones: 0,
      kind: "breakthrough",
      rule: { ...advanceRule(p) },
      total: advanceRule(p).days,
      remaining: advanceRule(p).days,
      stoneMethod: false,
      chance,
      guardian,
    };
    record(
      w,
      "attempt",
      `你开始尝试突破，成功率 ${chance / 100}%。${c.usePill ? "已服用一枚突破丹。" : ""}`,
    );
    w.notice = "灵气沿经脉汇聚，你沉下心来，等待最后一道关隘。";
    return;
  },
  formParty: (w, c) => {
    const p = w.player;

    const availability = partyReadiness(w);
    requireRule(availability.ready, availability.reason);
    w.party = [...w.agreement!.members];
    for (const id of w.party.filter((id) => id !== "PLAYER"))
      if (!relation(w, id)?.known) meet(w, id);
    w.notice = contentText(PRESENTATION.notices.party, w);
    record(w, "party", w.notice, w.party);
    return;
  },
  rally: (w, c) => {
    const p = w.player;

    requireRule(
      w.agreement?.status === "accepted" &&
        w.party.length === 1 &&
        p.realm >= realmIndex(B.story.playerMinimumExplorationRealm) &&
        p.location !== "ruins",
      "请先约定同行，在安全地点召集同伴。",
    );
    requireRule(
      w.agreement!.members.every((id) => actorById(w, id)?.alive),
      "同伴已经离世，这份约定无法继续。",
    );
    requireRule(
      w.agreement!.members.every(
        (id) => regionOf(actorById(w, id)!.location) === regionOf(p.location),
      ),
      "同伴尚在别处，请回到他们所在的城镇再约会合。",
    );
    w.agreement!.meeting = { location: p.location };
    for (let d = 0; d < commandDays(w, c); d++) advanceDay(w);
    if (w.ended) return;
    const status = partyReadiness(w);
    w.notice = status.ready
      ? "同伴依约抵达。现在可以邀二人同行。"
      : `${status.reason}。已经在此等候的人会留下，等候一日即可继续会合。`;
    record(
      w,
      "rally",
      `你约同伴在${LOCATIONS[p.location].name}会合，等候了一日。`,
      w.agreement!.members,
    );
    return;
  },
  expedition: (w, c) => {
    const p = w.player;

    const availability = departureStatus(w);
    requireRule(availability.ready, availability.reason);
    requireRule(p.location === "gate", "先前往山门古道。");
    requireRule(
      w.agreement?.status === "accepted" && w.party.length === 3,
      "需要已接受的约定和三人队伍。",
    );
    requireRule(
      !w.loot && p.stones >= DEPARTURE_FEE,
      `先结清上次战利品，并备好 ${DEPARTURE_FEE} 枚灵石路费。`,
    );
    requireRule(
      w.day - w.lastExpeditionDay >= B.economy.expeditionCooldownDays,
      `秘境气息未定，${B.economy.expeditionCooldownDays} 日后再入山。`,
    );
    for (const id of w.party)
      requireRule(
        actorById(w, id)?.alive &&
          !actorById(w, id)?.attempt &&
          actorById(w, id)!.hp > 0 &&
          actorById(w, id)!.location === p.location,
        "同伴须在场、存活、空闲并能行动。",
      );
    p.stones -= DEPARTURE_FEE;
    for (const id of w.party.filter((id) => id !== "PLAYER"))
      actorById(w, id)!.stones += B.story.departureFeePerNpc;
    const id = `expedition:${w.events.length + 1}`;
    w.agreement!.status = "active";
    w.agreement!.expeditionId = id;
    for (let d = 0; d < commandDays(w, c); d++) advanceDay(w, new Set(w.party));
    if (w.ended) return;
    for (const id of w.party) actorById(w, id)!.location = "ruins";
    w.lastExpeditionDay = w.day;
    w.battle = {
      id,
      round: 1,
      allies: w.party.map((id) => fighter(actorById(w, id)!)),
      enemies: Array.from({ length: B.combat.storyEncounter.enemyCount }, (_, i) => i).map((i) => ({
        id: `ENEMY_${i}`,
        name: `守碑石傀${i === 0 ? "·甲" : "·乙"}`,
        maxHp: B.combat.storyEncounter.enemyMaxHp,
        hp: B.combat.storyEncounter.enemyMaxHp,
        attack: B.combat.storyEncounter.enemyAttack,
        defense: B.combat.storyEncounter.enemyDefense,
        speed: B.combat.storyEncounter.enemySpeed,
        guard: false,
        cooldown: 0,
      })),
      logs: ["两具石傀从残碑旁苏醒，拦住了去路。"],
      auto: false,
      lethal: B.combat.storyEncounter.lethal,
    };
    w.notice = "一日山行后，你们抵达残碑。守碑石傀横在路中，战斗开始。";
    record(w, "expedition", w.notice, w.party);
    return;
  },
  battle: (w, c) => {
    const p = w.player;
    battleRound(w, c.action, c.target);
    return;
  },
  auto: (w, c) => {
    const p = w.player;
    requireRule(w.battle, "眼下没有战斗。");
    w.battle!.auto = c.enabled;
    return;
  },
  return: (w, c) => {
    const p = w.player;

    requireRule(p.location === "ruins" && !w.battle, "先结束秘境中的战斗。");
    for (let d = 0; d < commandDays(w, c); d++) advanceDay(w, new Set(w.party));
    if (w.ended) return;
    for (const id of w.party) actorById(w, id)!.location = "market";
    w.notice = "两日山路后，坊市的灯火重新映入眼帘。该清点这次的收获了。";
    record(w, "return", w.notice, w.party);
    return;
  },
  settle: (w, c) => {
    const p = w.player;

    requireRule(w.loot && p.location === "market", "回到坊市后再分配战利品。");
    requireRule(w.agreement?.status === "active", "没有可结算的有效约定。");
    requireRule(c.honor || c.confirm, "独占药草会违背约定，需要明确确认。");
    requireRule(c.honor || !w.agreement!.strict, "补偿后重新接受的严格条款要求按约交付。");
    const a = actorById(w, w.agreement!.recipient)!;
    requireRule(a.alive && a.location === p.location, "领取人需存活且在场。");
    const loot = w.loot!;
    p.stones += loot.stones;
    const outcome = c.honor ? "fulfilled" : "breached";
    if (c.honor) {
      a.grass += loot.grass;
      memory(w, a.id, "promiseFulfilled", `你将说好的凝元草交给${a.name}，履行了秘境约定。`);
    } else {
      p.grass += loot.grass;
      memory(w, a.id, "promiseBreached", `你留下了约定归${a.name}的凝元草。她亲眼见证了这次失约。`);
    }
    w.agreement!.status = outcome;
    w.story.outcome = outcome;
    w.story.settledDay = w.day;
    w.story.flags.reunion = false;
    if (!c.honor) w.story.compensated = false;
    w.loot = null;
    w.party = ["PLAYER"];
    w.notice = c.honor
      ? contentText(PRESENTATION.notices.fulfilled, w)
      : contentText(PRESENTATION.notices.breached, w);
    return;
  },
  resolveAgreement: (w, c) => {
    const p = w.player;

    updateAgreementAvailability(w);
    requireRule(
      w.agreement?.status === "impossible" && p.location !== "ruins",
      "请先返回安全地点，确认约定已客观无法履行。",
    );
    if (w.loot) {
      p.stones += w.loot.stones;
      p.grass += w.loot.grass;
      w.loot = null;
    }
    w.party = ["PLAYER"];
    w.story.outcome = "not_triggered";
    w.story.settledDay = w.day;
    w.story.flags.reunion = false;
    w.notice = "原约定已客观无法履行，余物已清点。没有认定违约，既有共同经历仍保留。";
    w.agreement!.reason += " 已确认例外处置，余物已清点。";
    record(w, "exception-settlement", w.notice, w.agreement!.members);
    w.agreement!.status = "cancelled";
    return;
  },
  compensate: (w, c) => {
    const p = w.player;

    const a = actorById(w, PACK.roles.primary)!;
    requireRule(
      w.story.outcome === "breached" &&
        !w.story.compensated &&
        p.grass >= 1 &&
        a.alive &&
        a.location === p.location,
      "补偿需一株凝元草，并与当事人当面交付。",
    );
    p.grass--;
    a.grass++;
    w.story.compensated = true;
    memory(w, a.id, "promiseCompensated", contentText(PRESENTATION.notices.compensationEvent, w));
    w.notice = contentText(PRESENTATION.notices.compensated, w);
    return;
  },
  disband: (w, c) => {
    const p = w.player;
    requireRule(!w.loot && !w.battle && p.location !== "ruins", "先离开秘境并结算战利品。");
    w.party = ["PLAYER"];
    if (w.agreement?.status === "accepted") w.agreement.status = "cancelled";
    w.notice = "你们暂时各行其是，已经发生的共同经历仍然保留。";
    record(w, "disband", w.notice);
    return;
  },
};

export function handle(w: World, c: Command) {
  requireRule(!w.ended && w.player.alive, "这一段人生已经结束，可以导出历程或开始新的一局。");
  const dailyChoice = c.type === "choose" && c.nodeId === w.pendingDailyEventId;
  if (w.pendingDailyEventId)
    requireRule(
      dailyChoice ||
        c.type === "stop" ||
        (c.type === "step" && w.longAction?.kind === "breakthrough"),
      "先回应当前小事，再继续行程。",
      "ACTION_UNAVAILABLE",
    );
  if (w.longAction)
    requireRule(["step", "stop"].includes(c.type) || dailyChoice, "先完成或结束当前修行。");
  if (w.battle) requireRule(["battle", "auto"].includes(c.type), "请先完成当前战斗。");
  const handler = commandHandlers[c.type] as (world: World, command: Command) => void;
  handler(w, c);
}
