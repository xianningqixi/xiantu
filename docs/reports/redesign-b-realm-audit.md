# 境界索引审计

扫描对象为 lib、components、scripts、tests 的 TS/TSX/JS/MJS 文件。查询比较、数值 includes；另查内容契约的 max(4) 与旧阈值表。

## 规则层

新晋升逻辑无境界数字分支。migrations.ts 的旧 0–4 范围用于旧格式校验；validate.ts 的 0 下界和 REALM_KEYS.length 是通用范围校验。

```text
lib/game/migrations.ts:100:          Number.isInteger(actor.realm) && actor.realm >= 0 && actor.realm < 5,
lib/game/validate.ts:216:      Number.isInteger(a.realm) && a.realm >= 0 && a.realm < REALM_KEYS.length,
```

## 交给 A 的组件

以下组件未修改。应以 advanceRule().kind / realmIndex() 替换，尤其旧 QI_3→筑基、旧索引 4=终点。

```text
components/game/panels.tsx:162:  const can = p.xp >= threshold(p) && (p.realm === 0 || p.realm === 3);
components/game/panels.tsx:192:          {p.realm === 0 ? <Sprout /> : <Sparkles />}
components/game/panels.tsx:198:            {p.realm === 4
components/game/panels.tsx:200:              : p.realm === 0
components/game/panels.tsx:206:      {p.realm === 4 && (
components/game/panels.tsx:277:              {preview.readyAfter > 0 && p.realm < 4 && (
components/game/panels.tsx:306:                <Sparkles size={18} /> {p.realm === 0 ? "引气入体" : "尝试筑基"}
components/game/panels.tsx:309:                {p.realm < 4
components/game/panels.tsx:310:                  ? `${breakthroughChance(w, p, pill && p.realm === 3 && p.pills > 0, guardian && p.realm === 3 && guardPossible) / 100}%`
components/game/panels.tsx:315:              {p.realm === 4
components/game/panels.tsx:317:                : `突破耗时 ${attempt.days} 日；失败不致命。普通失败损失 ${attempt.failureExperienceLossBp / 100}% 修为${p.realm === 3 ? `，失败时有 ${attempt.severeFailureConditionalBp / 100}% 概率跌落一层` : ""}。`}
components/game/panels.tsx:319:            {!can && p.realm < 4 && (
components/game/panels.tsx:321:                {[1, 2].includes(p.realm)
components/game/panels.tsx:326:            {p.realm === 3 && (
components/game/panels.tsx:389:                  usePill: p.realm === 3 && pill && p.pills > 0,
components/game/panels.tsx:390:                  guardian: p.realm === 3 && guardian && guardPossible,
components/game/panels.tsx:394:              {can ? "凝神，尝试突破" : p.realm === 4 ? "筑基已成" : "尚需积累修为"}
components/game/panels.tsx:400:                  usePill: p.realm === 3 && pill && p.pills > 0,
components/game/panels.tsx:401:                  guardian: p.realm === 3 && guardian && guardPossible,
components/game/game.tsx:786:                          [0, 3, 4].includes(p.realm) &&
components/game/game.tsx:796:                      [0, 3, 4].includes(p.realm) &&
components/game/retreat-summary.tsx:39:    [0, 3].includes(world.player.realm) &&
components/game/journey-tab.tsx:326:                      disabled={blocked || p.realm < 1 || w.party.length !== 1}
components/game/journey-tab.tsx:335:                          {p.realm < 1
components/game/journey-tab.tsx:439:                    p.realm < 1 ||
components/game/journey-tab.tsx:447:                    : p.realm < 1
components/game/journey-tab.tsx:596:                  {!readiness.ready && p.realm >= 1 && (
```

## 旧档生成与测试

qa-redesign-b-legacy.mjs 明确运行旧 d8ac3e4 规则，必须沿用旧索引以产出真实 0.1.6 存档。

```text
scripts/qa-redesign-b-legacy.mjs:17:while(w.player.realm<4 && w.day<100){
scripts/qa-redesign-b-legacy.mjs:19:if((w.player.realm===0||w.player.realm===3)&&w.player.xp>=threshold(w.player)){
scripts/qa-redesign-b-legacy.mjs:21:if(w.rulesVersion!=="0.1.6"||w.schemaVersion!==6||w.player.realm!==4)throw Error("Requires a released 0.1.6 baseline checkout");
```

## 测试夹具与旧浏览器流程

迁移断言保留显式旧→新映射；新增 B 浏览器中的 0/1/3 是验收目标。原 story/main-quest/owned-art 浏览器晋级辅助仍是旧 UI 流程，A 合并后需按新晋级路径更新；本期跑专用 redesign-b.spec.ts。

```text
tests/game/journey.test.ts:399:    a.realm = a.realm >= 10 ? 4 : Math.min(3, a.realm);
tests/game/journey.test.ts:412:      npcs: result.world.npcs.map((a) => ({ ...a, realm: a.realm === 10 ? 4 : a.realm })),
tests/browser/redesign-b.spec.ts:141:    while (w.player.realm < 3) {
tests/browser/redesign-b.spec.ts:145:      if (aptitude === 90 && oldRealm === 0 && w.player.realm === 1) {
tests/browser/redesign-b.spec.ts:210:  while (w.player.realm < 3) w = await commandB(page, w, growthB(w));
tests/game/engine.test.ts:74:  while (r.state.player.realm === 0) {
tests/game/engine.test.ts:207:    if (r.state.player.realm < 10) {
tests/browser/owned-art.spec.ts:104:  for (let attempt = 0; attempt < 8 && (await world(page)).player.realm === 0; attempt++) {
tests/browser/owned-art.spec.ts:108:    if ((await world(page)).player.realm === 0) await practice(page, 1);
tests/browser/owned-art.spec.ts:239:  for (let i = 0; i < 5 && (await world(page)).player.realm < 2; i++) await practice(page, 7);
tests/browser/owned-art.spec.ts:344:  for (let i = 0; i < 8 && (await world(page)).player.realm === 0; i++) {
tests/browser/owned-art.spec.ts:348:    if ((await world(page)).player.realm === 0) await practice(page, 1);
tests/game/worker.test.mjs:425:      a.realm = a.realm >= 10 ? 4 : Math.min(3, a.realm);
tests/game/worker.test.mjs:780:    a.realm = a.realm >= 10 ? 4 : Math.min(3, a.realm);
tests/game/worker.test.mjs:798:      npcs: response.state.npcs.map((a) => ({ ...a, realm: a.realm === 10 ? 4 : a.realm })),
tests/game/extensions.test.ts:137:    a.realm = a.realm >= 10 ? 4 : Math.min(3, a.realm);
tests/browser/main-quest.spec.ts:46:    if ((await world(page)).player.realm === 0 || (await world(page)).player.realm === 3) {
tests/browser/story.spec.ts:80:    for (let i = 0; i < 5 && (await saved(page)).player.realm === 0; i++) {
tests/browser/story.spec.ts:225:    for (let retry = 0; retry < 5 && final.player.realm < 4; retry++) {
tests/browser/story.spec.ts:271:  for (let i = 0; i < 5 && (await saved(page)).player.realm === 0; i++) {
```

## 内容包契约

`lib/game/content/contract.mjs:57,177`、`extension-contract.mjs:58,90,136` 的 0–4 范围/阈值表是已发布内容包 API 1/2 的序列化协议。原 NPC 与剧情数据不改；worldgen、sects、content-story 通过 legacyRealmIndex 适配到新规则。把这里直接扩成 0–12 会使同一旧内容锁的数值含义漂移。后续若要创作炼气四层以上新包，应显式升级内容包 API 并给出新 schema。

`simulation.worker.ts` 的旧备份列表也已按 rulesVersion 映射旧 realm，避免旧筑基误标炼气四层。`git diff d8ac3e4 -- components` 为空。
