# 剧情扩充写作规格（2026-10-29）

目标：让每个角色线不止「初见到结局」十二步，而是在相识之后有日常、有反复、有分歧；亲密不是一次性里程碑，而是可以从不同角度再来一次的场景。

## 每位女主新增 5 个节点

命名：`shichai.<pack>.<hero>.<slug>`，slug 固定取下列五个之一加序号：

1. `<hero>.errand`（priority 56，minRealm 1）——她请你搭把手。给出「帮到底（耗灵石或凝元草，bond +8/+5）」「只帮一半（bond +3）」两条，第三条空 effects 退出。
2. `<hero>.confide`（priority 62，minRealm 2，需 `flag.<hero>.flag.bond` 为 true；进度键写 `<hero>.flag.confide`）——她说一件从没对人说过的事。一条 `experience` + bond，一条只 bond，一条退出。
3. `<hero>.return-gift`（priority 58，minRealm 2，需 bond 为 true）——她回赠东西。一条 `resource` 收入（凝元草 1～2 或回春丹 1），一条 bond +4，一条退出。
4. `<hero>.night-2`（priority 73，minRealm 3，需 `flag.<hero>.flag.night` 为 true；进度键写 `<hero>.flag.night2`）——第二次，换了地点与心境。带 `explicit` 段；choice effects 必须含 `experience` 指向该角色。
5. `<hero>.daybreak`（priority 71，minRealm 3，需 `flag.<hero>.flag.night2` 为 true；不写 progress，只写 bond 与 experience）——事后清早的一次谈话，用来收束余韵。一条 bond +5 + experience，一条空退出。

## 硬性字段

- `visualId` 必须先加进该包 `visuals.json`，可以复用同角色已有的 `cg` 槽位（复用不算重复，允许两个节点指向同一图）。
- `participants` 恰好一位女主。
- 每个节点必须有一个 `effects: []` 的退出选项。
- 条件里必须包含 `flag.<hero>.flag.closed` 为 false，避免死后开口。
- 新增 progress 键要登记进该包 `manifest.json` 的 `flags`。每包上限 40 条，现已有 28～31 条，所以每角色只留 2 个新 flag：`<hero>.flag.confide`、`<hero>.flag.night2`。daybreak 不需要新 flag，靠 night-2 的 flag 加节点终身消费拦住。
- `eyebrow` 用「卷名 · 小标题」，卷名为 春水／冬雪／秋灯／夏夜（「秋灯」卷按 packId 是 qiudeng）。
- 正文 400～700 字，第二人称，保持现有克制文风；`explicit` 250～400 字，写身体与呼吸，不写「仿佛」「宛如」堆砌。
- 只写成品 JSON，不写 Markdown；一次改完整个包再跑 `npm run content:prepare`。
