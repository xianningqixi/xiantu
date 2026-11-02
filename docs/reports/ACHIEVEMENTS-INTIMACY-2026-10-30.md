# 第三轮：成就系统与亲密链补完（2026-10-30）

## 背景

用户指令（原话）：「可以加上成就系统 然后nsfw剧情部分继续添加 大概加到一半左右 然后补充剧情图片 尽可能的多」。

按三件事拆解：成就系统从零建；亲密链从「一夜 + 一次双修」补到第二个后续节点（`night-3`／`dual-2`），并把每个人的露骨段落补到接近满覆盖；配图按新节点逐张生成、质检、接入。

## 成就系统

- 新建 `lib/game/achievements.ts`：六类（修行／争斗／历练／人情／故事／生活）共 40 条，含隐性的死亡与破产两条。判定只读一次遍历得到的 `AchievementTally`，不在每条成就里扫事件。
- 结算挂在引擎 `applyCommand` 尾部（`settleAchievements`），每条成就只解锁一次；解锁写 `achievement` 事件，沉默类成就（死亡／破产）不写。
- 存档侧 `validate.ts` 增 `validateAchievements`（未知 id、未来日期都拒）；`migrations.ts` 给旧档补默认 `achievements: {}`——引擎每次命令都会写这个空对象，`portrait-edit` 的「只改外观」零差异断言因此在比较前归一化。
- UI 侧新增历程第四个页签「成就」，按类分组、显示已完成数与隐藏项占位；`journal-panel` 的分类标签同步。

## 亲密链与正文

十一人每人补齐 `night-3` 与 `dual-2` 两个节点（22 段），并把上一轮四人共 57 条亲密节点的露骨段落统一到 250–450 字区间。

- 依赖必须可走通：`night-2` 写 `flag.night2`、`night-3` 读它并写 `flag.night3`；`dual` 写 `flag.dual`、`dual-2` 读它并写 `flag.dual2`。冬雪卷原本缺 `night-2`，导致三条 `night-3` 永远不可达，本次一并补上（谷仓、山神龛、灶间）。
- 新建 `tests/game/intimacy-chain.test.ts` 守结构：每一跳要有真正的生产者分支、自锁、独立画面、空 effects 退出项，露骨段落单段且不小于 250 字；同一人的节点不许重名。
- 新建 `tests/browser/third-night.spec.ts` 真实 UI 验收：沿依赖链推到第三夜，断言卡片可见、图是 `-cg-night-3` 且 webp 返回 200、折叠段落可展开、选择后落 `contentState`。

## 配图

- 22 条新节点各生成一张专属 CG（不再复用旧 `cg.night`／`cg.dual`）。提示词沿用「极端近景 + 单句姿势锁 + 机位贴合骨盆」的口径。
- 逐张三问质检（根部是否连男方、是否明确插入、有无多余肢体）：首批 22 张过 15 张，7 张按失败姿势各出 4 个变体重跑，二次质检全部选出通过帧后才接入。
- 接入三层：卷内 `art/manifest.json` 资产与 `visuals.json` 槽、`art-refresh-20260910/catalog.json`（257→279 条）、节点 `visualId` 改指 `cg.night-3`／`cg.dual-2`；WebP 统一 1672×941、SHA 绑定。内容哈希变化按惯例补 `journey-migrations.json`。
- 断言同步：`extensions.test.ts` 142、`art-refresh.spec.ts` 279、`owned-art.spec.ts` 142。

## 图文对齐修正

图先于文生成，六条的正文场景与成图对不上（药棚 vs 药铺前堂、船篷 vs 客栈上房等）。两条线各自按不同场景计划作业，等发现时图已入 catalog。

处理方向定为「文贴图」（图已质检、已入目录，改图成本高）：秋灯／夏夜六条与冬雪六条全部按 manifest 的 alt 重写 body 与 explicit，id／conditions／minRealm／visualId 不动，`location` 条件靠剧情动作落回原位（例如把她拽进渡口岸边的船篷）。alt 里的构图要素逐一写进正文。

## 容量与作者文档

上限从「每包 40 节点／40 flags」放到「64 节点／48 flags」，`minRealm` 写 5 以上直接按十三档境界索引；`content-packs/AUTHORING.md` 补容量段。

## 验证

- `npm run test:game` 174 项、`test:content` 8 项、`content:prepare` EXIT 0、`npm run verify` EXIT 0。
- 定向浏览器：`third-night`、`art-refresh`、`owned-art`、`sects`、`journey-actions`、`story`、`second-pass` 全过。
- 已知取舍：`third-night.spec.ts` 走完整条链约 3.5 分钟；为躲开卡片重渲染改在页面里按属性点按钮，不再用 locator 链式点击。
