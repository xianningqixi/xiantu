## 2026-09-08 地域旅程升级（0.2.0）

本卷现按 `journey.json` 指定的地点、成长和线索出现；每两日最多一场，先引子后人物阶段，人物每七日回访常驻处且不跨城随机移动。下文 0.1.0 图片接入记录为历史证据，其旧锁是已登记迁移的来源；当前锁以 integrity.json 为准。当前规则、真实浏览器跨城及构建结果见 [旅程验收](../../docs/QA-2026-09-08-JOURNEY.md)。原 PNG、提示词、大纲和故事正文保持不变，仅调整地点条件与成长门槛。

# 青石十钗 · 卷四《冬雪》 · 验收记录

## 2026-09-08 自有图片接入实测

本卷 31 张 PNG 已通过 art/manifest.json 接入，所有视觉槽位 owned，女角色 portraitId 已登记。派生 WebP 共 3,809,288 字节，全部 lazy；图片摘要与锁保存在本卷 integrity.json，原 storylets／outline／art-prompts／PNG 未改。

实际执行 `npm run content:prepare`（5 包、169 图）、`npm run verify`（105 项测试与完整构建通过）、`npm run test:extensions`（8 项）、`npm run content:fixtures`、`npm run build:local`，退出码均为 0。独立运行 `npx esbuild tests/game/shichai.test.ts --bundle --platform=node --format=esm --outfile=.game-test-build/shichai.test.mjs --log-level=error && node --test .game-test-build/shichai.test.mjs`，3 项通过。

实际以 `npm run dev:local -- --hostname 127.0.0.1 --port 3200` 启动，再运行 `PLAYWRIGHT_CHANNEL=chrome XIANTU_TEST_URL=http://127.0.0.1:3200 npx playwright test tests/browser/owned-art.spec.ts`，3 项通过。四卷同时创建真实新局、苏清晏 CG／立绘／NPC 详情显示、roadside 单包待绘占位与 120 个图片 HTTP 请求通过；390／320px 无横向溢出。规则测试走完 11 条道侣路线，不等于每卷全部 CG／分支均已在浏览器逐一玩过。

离线核心改前 1,420,407 字节，当前 2,231,332 字节，120 张新增图均未进入核心；官方内容锁与全目录文件摘要不变。共享目录另有并行立绘特征变更，已保留并在总报告单列。本轮未提交、推送或部署。

完整命令日志、限制及截图见 [2026-09-08 QA](../../docs/QA-2026-09-08.md)，图片记录见 [资源证据](../../outputs/shichai-owned-integrity.json)，[桌面卡片](../../outputs/shichai-owned-card.png)、[手机 390px](../../outputs/shichai-owned-mobile-390.png)、[手机 320px](../../outputs/shichai-owned-mobile-320.png)、[roadside 占位](../../outputs/roadside-planned-desktop.png)。

本卷当前 lock：`shichai.dongxue@0.1.0:ad5ec0542b09cd8251d8c6da41b99542cc04409999647142d40330e82e2973d2`。


作者：Claude（草稿）。日期：2026-09-07。本包剧情定义保持独立；本次自有图片与运行时接入记录见上节。

## 已实际执行

| 检查 | 结果 | 说明 |
| --- | --- | --- |
| `npm run content:prepare` 严格协议校验与注册 | PASS，退出码 0 | 节点 37、标记 31、角色 6、视觉槽位 31（全部 owned，已接入） |
| `npm run test:extensions` | PASS，8 项 | 现已覆盖四卷全部 owned 槽位与 11 位女角色立绘 |
| 真实浏览器 / 作者预览 / 手机 | 部分实际通过 | 四卷同选创建新局；苏清晏相识与人物详情、320／390px 卡片通过；本卷完整路线未逐条浏览器试玩 |

## 待补内容

- 所有 `〔R18 段落待补 · 编号 …〕` 标记处的正文，由作者补写并自行审查；编号与 outline.md 中的要点一一对应。
- 图片已接入：本卷所有视觉槽位为 owned，源 PNG 与提示词保留不改。

## 路线矩阵

| 路线 | 预期流程 | 状态 |
| --- | --- | --- |
| 叶疏桐（情敌 叶承） | 相识→相知→心动→情敌介入→初夜→双修→道侣；退让分支进入被夺结局；身故分支收束 | 道侣路线规则测试通过；完整浏览器分支未逐条试玩 |
| 宋小满（情敌 王虎） | 相识→相知→心动→情敌介入→初夜→双修→道侣；退让分支进入被夺结局；身故分支收束 | 道侣路线规则测试通过；完整浏览器分支未逐条试玩 |
| 楚莲（情敌 严孤鹤） | 相识→相知→心动→情敌介入→初夜→双修→道侣；退让分支进入被夺结局；身故分支收束 | 道侣路线规则测试通过；完整浏览器分支未逐条试玩 |

## 协议边界提醒

- 每个节点任一选择都会一次性消费该节点；相识节点提供一次「改日再说」的二次机会，其余阶段的退出即终止该线。
- 情敌为真实 NPC，会按世界规则自行行动；情敌自然身故时走「无人相争」分支。
- 「被夺」结局只写入本包标记与玩家单方经历，不改变任何人物的生死、数值或关系。
- 引擎没有 `player.sex` 事实，本包文本按男性主角书写，无法在协议层强制。
