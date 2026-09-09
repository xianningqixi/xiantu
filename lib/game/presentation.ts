import { journeyContext, companionStatus } from "./journey-presentation";
import { threshold } from "./rules";
import { mainObjective } from "./main-story";
import presentation from "../../content-packs/official-qingshi/ui-presentation.json";
import B from "./content/balance.json";
import { PACK, contentText } from "./content/official";
import type { World } from "./types";
function at(value: unknown, path: string): unknown {
  return path
    .split(".")
    .reduce<unknown>(
      (current, key) =>
        current && typeof current === "object" && Object.hasOwn(current, key)
          ? (current as Record<string, unknown>)[key]
          : undefined,
      value,
    );
}
export function objective(world: World) {
  const context = {
    ...world,
    primaryPresent: world.npcs.some(
      (a) => a.id === PACK.roles.primary && a.alive && a.location === world.player.location,
    ),
  };
  const entry = presentation.objectives.find((entry) =>
    Object.entries(entry.when).every(([path, expected]) => {
      const value = at(context, path);
      return expected === "present"
        ? value != null
        : Array.isArray(expected)
          ? expected.includes(value as string)
          : typeof expected === "boolean"
            ? Boolean(value) === expected
            : value === expected;
    }),
  )!;
  const format = (text: string) =>
    contentText(
      text.replace(/\{\{balance\.([^{}]+)\}\}/g, (_, path: string) => String(at(B, path) ?? "")),
      world,
    );
  const current = journeyContext(world),
    companion = companionStatus(world);
  const override = world.ended
    ? {
        title: "此生已落笔",
        text: "回顾这一世的修行与相逢，也可导出保存。",
        tab: "journal",
        anchor: "journal-heading",
      }
    : world.battle
      ? {
          title: "秘境战斗 · 轮到你行动",
          text: "查看最近战报，选择进攻、防御或撤退。",
          tab: "journey",
          anchor: "battle-controls",
        }
      : world.loot
        ? {
            title: world.player.location === "ruins" ? "收好战利品 · 返回坊市" : "战利品待分配",
            text: "完成此次同行的分配后，再继续远行与修炼。",
            tab: "journey",
            anchor: "current-scene",
          }
        : world.longAction
          ? {
              title:
                world.longAction.kind === "wait"
                  ? "正在等候"
                  : world.longAction.kind === "breakthrough"
                    ? "正在突破"
                    : "正在修炼",
              text: `已保存 ${world.longAction.checkpoint}/${world.longAction.total} 日，可暂停后查看变化。`,
              tab: world.longAction.kind === "wait" ? "journey" : "cultivation",
              anchor: "long-action-state",
            }
          : current.actionable
            ? {
                title: current.title!,
                text: `${current.displayName ? `与${current.displayName}的故事` : "此处的故事"}正在展开，继续阅读并作出回应。`,
                tab: "journey",
                anchor: current.anchor,
                location: world.player.location,
              }
            : companion && world.agreement?.status === "accepted"
              ? {
                  ...companion,
                  tab: world.player.realm < 1 ? "cultivation" : "journey",
                  anchor:
                    world.player.realm < 1
                      ? "practice-start"
                      : world.party.length === 3 && world.player.location !== "gate"
                        ? "world-map"
                        : "companion-status",
                  location: world.party.length === 3 ? "gate" : world.player.location,
                }
              : [0, 3].includes(world.player.realm) && world.player.xp >= threshold(world.player)
                ? {
                    title: "修为圆满 · 尝试突破",
                    text: "先突破大境界，再继续修行；突破失败不会致命。",
                    tab: "cultivation",
                    anchor: "breakthrough-preparation",
                  }
                : mainObjective(world);
  return {
    ...entry,
    title: format(entry.title),
    text: format(entry.text),
    ...override,
  };
}
