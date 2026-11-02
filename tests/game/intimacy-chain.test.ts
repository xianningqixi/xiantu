import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { EXTENSIONS, extensionVisual } from "../../lib/game/content/extensions";

/**
 * 亲密场景链：night → night-2 → night-3、dual → dual-2。
 * 每一跳都要有真正的生产者（写 flag）、消费者和独立画面，
 * 否则玩家会卡在半路看着后面的节点永远不出现。
 */
type Condition = { fact: string; op: string; value: unknown };
type Choice = { id: string; effects: { kind: string; key?: string }[] };
type Node = {
  id: string;
  explicit?: string;
  visualId: string;
  conditions: Condition[];
  choices: Choice[];
};

const PACKS = ["chunshui", "dongxue", "qiudeng", "xiaye"];
const nodesOf = (pack: string) =>
  JSON.parse(readFileSync(`content-packs/shichai-${pack}/storylets.json`, "utf8")) as Node[];
const TABLES = new Map(PACKS.map((p) => [p, nodesOf(p)]));
/** 卷内女主 id：取 `shichai.<pay>.<hero>.<slug>` 的第 3 段去重。 */
const HEROES = (pack: string) =>
  [...new Set(TABLES.get(pack)!.map((n) => n.id.split(".")[2]))]
    .filter((h) => TABLES.get(pack)!.some((n) => n.id === `shichai.${pack}.${h}.night`))
    .map((h) => `shichai.${pack}.${h}`);

const progressKeys = (n: Node) =>
  n.choices.flatMap((c) =>
    c.effects.filter((e) => e.kind === "progress" && e.key).map((e) => e.key!),
  );
const producer = (pack: string, key: string) =>
  TABLES.get(pack)!.find((n) => progressKeys(n).includes(key.replace(/^flag\./, "")));
const flag = (n: Node, suffix: string) =>
  `flag.${n.id.slice(0, n.id.lastIndexOf("."))}.flag.${suffix}`;
const has = (n: Node, fact: string, value: unknown) =>
  n.conditions.some((c) => c.fact === fact && c.op === "eq" && c.value === value);
const location = (n: Node) => n.conditions.find((c) => c.fact === "location")?.value;

for (const pack of PACKS) {
  test(`${pack}: every intimate scene has a reachable second and third step`, () => {
    const table = TABLES.get(pack)!;
    for (const hero of HEROES(pack)) {
      const base = table.filter((n) => `${hero}.` && n.id.startsWith(`${hero}.`));
      const get = (suffix: string) => base.find((n) => n.id === `${hero}.${suffix}`);

      const night = get("night");
      const night2 = get("night-2");
      const night3 = get("night-3");
      const dual = get("dual");
      const dual2 = get("dual-2");
      assert.ok(night && night2 && night3, `${hero} 缺 night 链`);
      assert.ok(dual && dual2, `${hero} 缺 dual 链`);

      // 第一夜之后每晚都只能进一次，且地点沿用上一夜的场景。
      assert.ok(has(night2, flag(night, "night"), true), `${night2.id} 未依赖第一夜`);
      assert.ok(has(night2, flag(night2, "night2"), false), `${night2.id} 未自锁`);
      assert.ok(location(night2), `${night2.id} 缺地点条件`);
      assert.ok(location(night3), `${night3.id} 缺地点条件`);
      assert.ok(has(night3, flag(night2, "night2"), true), `${night3.id} 未依赖第二夜`);
      assert.ok(has(night3, flag(night3, "night3"), false), `${night3.id} 未自锁`);

      // 生产 flag 的分支必须存在，否则下一夜永远不可达。
      assert.ok(producer(pack, flag(night2, "night2")), `${hero} 没有写入 night2 的分支`);
      assert.ok(producer(pack, flag(night3, "night3")), `${hero} 没有写入 night3 的分支`);
      assert.ok(has(dual2, flag(dual, "dual"), true), `${dual2.id} 未依赖双修`);
      assert.ok(has(dual2, flag(dual2, "dual2"), false), `${dual2.id} 未自锁`);
      assert.ok(producer(pack, flag(dual2, "dual2")), `${hero} 没有写入 dual2 的分支`);

      // 第三夜要有自己的画面槽；第二夜暂与第一夜共用一张。
      assert.notEqual(night3.visualId, night.visualId, `${hero} 第三夜复用了第一夜的画面`);
      for (const n of [night2, night3, dual2])
        assert.ok(extensionVisual(n.visualId), `${n.id} 的画面 ${n.visualId} 未登记`);

      // 每个节点都要留一条空 effects 的退出项，且露骨段落只一段。
      for (const n of [night2, night3, dual2]) {
        assert.ok(
          n.choices.some((c) => c.effects.length === 0),
          `${n.id} 没有退出项`,
        );
        assert.ok((n.explicit ?? "").length >= 250, `${n.id} 的露骨段落过短`);
        assert.ok(!n.explicit!.includes("\n"), `${n.id} 的露骨段落含换行`);
      }
    }
  });
}

test("no pack repeats an intimate slug for the same heroine twice", () => {
  for (const pack of PACKS) {
    const ids = TABLES.get(pack)!.map((n) => n.id);
    assert.equal(new Set(ids).size, ids.length, `${pack} 有重复节点`);
  }
});
