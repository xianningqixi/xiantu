import { journeyContext } from "./journey-presentation";
import { B, REALM_KEYS, advanceRule, threshold } from "./rules";
import { mainObjective, currentMainStep, hasRubbing } from "./main-story";
import { partyReadiness, departureStatus } from "./agreement";
import { breakthroughChance, gainPerDay } from "./cultivation";
import { commandDays } from "./action-cost";
import { PACK, REALMS } from "./content/official";
import { LOCATIONS, localSite, locationKind, regionOf } from "./world-map";
import presentation from "../../content-packs/official-qingshi/ui-presentation.json";
import type { Command, LocationId, World } from "./types";

export interface Objective {
  title: string;
  reason: string;
  text: string;
  tab: string;
  command?: Command;
  anchor?: string;
  location?: LocationId;
  choices?: { title: string; command: Command }[];
}
function goal(title: string, reason: string, extra: Partial<Objective> = {}): Objective {
  return { title, reason, text: reason, tab: "journey", ...extra };
}
function travel(w: World, to: LocationId, reason: string) {
  const command: Command = { type: "travel", to };
  return goal(`前往${LOCATIONS[to].name} · ${commandDays(w, command)} 日`, reason, {
    command,
    location: to,
  });
}
export function objective(w: World): Objective {
  const p = w.player,
    rule = advanceRule(p),
    context = journeyContext(w);
  const train = (reason?: string) => {
    if (!p.manual)
      return locationKind(p.location) === "inn"
        ? goal("学习《基础吐纳诀》", "免费领取，学会后即可修炼。", { command: { type: "learn" } })
        : travel(w, localSite(p.location, "inn"), "客栈备有免费的入门功法。");
    if (rule.targetRealm && rule.days > 0 && p.xp >= threshold(p))
      return goal(
        `尝试突破 · ${breakthroughChance(w, p, false, false) / 100}%`,
        `准备踏入${REALMS[REALM_KEYS.findIndex((key) => key === rule.targetRealm)]}；失败不致命。`,
        { tab: "cultivation", anchor: "breakthrough-preparation" },
      );
    if (!rule.targetRealm)
      return goal("前往游历", "本版境界已至终点，仍可查访主线与故人。", { anchor: "atlas-page" });
    return goal(
      "静心修炼 · 1 日",
      reason ??
        `再修约 ${Math.ceil(Math.max(0, threshold(p) - p.xp) / gainPerDay(w, p))} 日本层修为圆满。`,
      {
        command: {
          type: "train",
          days: 1,
          stoneMethod: false,
          stopWhen: { kind: "cultivationReady" },
        },
      },
    );
  };
  if (w.ended)
    return goal("回顾这一世", "修行与相逢已记入历程。", {
      tab: "journal",
      anchor: "journal-heading",
    });
  if (w.battle) {
    const fighter = w.battle.allies.find((a) => a.id === p.id)!;
    const skill = fighter.cooldown === 0;
    return goal(skill ? "施展青芒剑诀" : "挥剑普攻", "指挥本回合行动；其他招式在更多行动中。", {
      command: { type: "battle", action: skill ? "skill" : "attack" },
    });
  }
  if (w.loot)
    return p.location === "ruins"
      ? goal("收好战利品，返回坊市", "返回后清点所得，兑现同行约定。", {
          command: { type: "return" },
        })
      : goal("分配战利品", "核对承诺与分配，再继续远行。", { anchor: "loot-settlement" });
  if (w.longAction)
    return goal("继续当前行动", `已保存 ${w.longAction.checkpoint}/${w.longAction.total} 日。`, {
      anchor: "long-action-state",
    });
  if (context.actionable) {
    const node = context.main ?? context.side ?? context.official!;
    const type = context.main ? "chooseMain" : context.side ? "chooseExtension" : "choose";
    const choices = node.choices.map((choice) => ({
      title: choice.label,
      command: { type, nodeId: node.id, choiceId: choice.id } as Command,
    }));
    return goal(choices[0].title, "作出回应，继续眼前的故事。", {
      command: choices[0].command,
      choices,
      anchor: context.anchor,
      location: p.location,
    });
  }
  if (w.agreement?.status === "impossible")
    return goal("确认约定无法继续", w.agreement.reason ?? "查看这次同行的实际结果。", {
      command: p.location === "ruins" ? { type: "return" } : { type: "resolveAgreement" },
    });
  if (p.location === "ruins")
    return goal("返回青石坊市", "离开秘境后可以修炼与休息。", { command: { type: "return" } });
  if (!p.manual || (rule.days > 0 && p.xp >= threshold(p))) return train();
  if (w.agreement?.status === "accepted") {
    if (
      p.realm <
      REALM_KEYS.indexOf(B.story.playerMinimumExplorationRealm as (typeof REALM_KEYS)[number])
    )
      return train();
    if (w.party.length < B.combat.partyMaxSize) {
      const status = partyReadiness(w);
      const remote = status.members.find((a) => regionOf(a.location) !== regionOf(p.location));
      if (remote) return travel(w, localSite(remote.location, "market"), "回到同伴所在城镇会合。");
      return goal(
        status.ready ? "邀二人同行" : "约在此处会合",
        status.reason || "同伴已经在场，组队不扣路费。",
        { command: { type: status.ready ? "formParty" : "rally" } },
      );
    }
    if (p.location !== "gate") return travel(w, "gate", "同伴已齐，前往古道准备出发。");
    const departure = departureStatus(w);
    if (departure.ready)
      return goal("三人同行，进入残碑秘境", "出发时支付路费，将遭遇战斗。", {
        command: { type: "expedition" },
      });
    return goal(
      p.stones < B.story.departureFeePerNpc * (B.combat.partyMaxSize - 1)
        ? "接取杂务"
        : "在此停留 1 日",
      departure.reason,
      {
        command:
          p.stones < B.story.departureFeePerNpc * (B.combat.partyMaxSize - 1)
            ? { type: "work" }
            : { type: "wait", days: 1 },
      },
    );
  }
  const main = mainObjective(w),
    step = currentMainStep(w);
  if (main && main.tab !== "cultivation") {
    const destination =
      "location" in main
        ? main.location
        : step && !step.sameRegion
          ? (step.chapter.sites.market as LocationId)
          : undefined;
    if (destination && destination !== p.location) return travel(w, destination, main.text);
    if (p.location === "gate" && !hasRubbing(w) && w.party.length === 1)
      return goal("勘察古道残碑", "取得水纹拓片，查访主线线索。", {
        command: { type: "surveyRuins" },
      });
  }
  return train(main?.text);
}

function at(value: unknown, path: string): unknown {
  return path
    .split(".")
    .reduce<unknown>(
      (v, key) => (v && typeof v === "object" ? (v as Record<string, unknown>)[key] : undefined),
      value,
    );
}
/** Only disclosure metadata. This never grants a rule capability or mutates the save. */
export function presentationUnlocks(w: World) {
  const context = { ...w, realmKey: REALM_KEYS[w.player.realm] };
  return presentation.unlocks.filter((entry) =>
    Object.entries(entry.when).every(([path, expected]) => {
      const value = at(context, path);
      return Array.isArray(expected) ? expected.includes(value as never) : value === expected;
    }),
  );
}
