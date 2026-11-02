import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { EXTENSIONS } from "../../lib/game/content/extensions";
import { validateExtension } from "../../lib/game/content/extension-contract.mjs";
import { PACK, VISUAL_IDS } from "../../lib/game/content/official";

type Condition = { fact: string; op: string; value: unknown };
type Effect = {
  kind: string;
  key?: string;
  target?: string;
  win?: { key: string };
  lose?: { key: string };
};
type Node = {
  id: string;
  body: string;
  participants: string[];
  conditions: Condition[];
  choices: { effects: Effect[] }[];
};

const packs = EXTENSIONS.filter((e) => e.data.manifest.packId.startsWith("shichai."));
const official = { roles: PACK.roles, assets: VISUAL_IDS };

/** 被夺线是「退让 → 上门 → 对决 → 翻回来」的阶梯；缺一环玩家就又能掉进死路。 */
test("every heroine's lost route climbs all the way back to the romance line", () => {
  let heroes = 0;
  for (const pack of packs) {
    const nodes = JSON.parse(
      readFileSync(
        `content-packs/${pack.data.manifest.packId.replaceAll(".", "-")}/storylets.json`,
        "utf8",
      ),
    ) as Node[];
    const lost = nodes.filter((n) => n.id.endsWith(".lost"));
    for (const lostNode of lost) {
      heroes++;
      const hero = lostNode.id.replace(/\.lost$/, "");
      const get = (suffix: string) => nodes.find((n) => n.id === `${hero}.${suffix}`);
      const flags = pack.data.manifest.flags;

      for (const suffix of ["lost-2", "lost-3", "lost-win", "lost-retry"]) {
        const node = get(suffix);
        assert.ok(node, `${hero} 缺 ${suffix}，被夺线又断在半路`);
        assert.ok(node!.body.length >= 400, `${node!.id} 太短`);
      }
      // 决斗必须在场、胜负字段必须已声明、两边不能是同一个。
      const duelNode = get("lost-3")!;
      const duel = duelNode.choices.flatMap((c) => c.effects).find((e) => e.kind === "duel")!;
      assert.ok(duel, `${duelNode.id} 没有决斗`);
      assert.ok(duelNode.participants.includes(duel.target!), "情敌不在参与者里");
      assert.ok(flags.includes(duel.win!.key) && flags.includes(duel.lose!.key), "胜负字段没声明");
      assert.notEqual(duel.win!.key, duel.lose!.key);

      // 赢下来要真的把路线掰回去：写 contest，而不是又写一遍 closed。
      const reward = get("lost-win")!
        .choices.flatMap((c) => c.effects)
        .filter((e) => e.kind === "progress")
        .map((e) => e.key);
      assert.ok(reward.includes(`${hero}.flag.contest`), `${hero} 赢了却没翻回主线`);

      // 输了要能重来：清掉两个标记再当场再打一场。
      const retry = get("lost-retry")!.choices.flatMap((c) => c.effects);
      const cleared = retry
        .filter((e) => e.kind === "progress" && (e as { active?: boolean }).active === false)
        .map((e) => e.key);
      assert.ok(cleared.length >= 2, `${hero} 的重来没有清零标记`);
      assert.ok(
        retry.some((e) => e.kind === "duel"),
        `${hero} 的重来没有当场再打`,
      );

      // 每条节点都要有退出项，玩家不能被逼着往下走。
      for (const suffix of ["lost-2", "lost-3", "lost-win", "lost-retry"])
        assert.ok(
          get(suffix)!.choices.some((c) => c.effects.length === 0),
          `${get(suffix)!.id} 没有退出项`,
        );
    }
  }
  assert.equal(heroes, 11, `应有 11 位女主带 lost 节点，实际 ${heroes}`);
});

test("the whole route still passes content validation", () => {
  for (const pack of packs) assert.doesNotThrow(() => validateExtension(pack.data, official));
});
