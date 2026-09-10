# A × B 整合验收报告

2026-09-10。分支 `redesign/a-dojo`，工作区 `/Users/wangdaxi/Documents/ChatGPT/xiuxian/xiantu-a-dojo`。A × B 整合验收完成；最终 Chrome 全套 71/71 通过，0 跳过。最终生产代码提交 `1706e2002fa2692f0facc5eb17710ae4a4892107`，全套测试提交 `dbe9930d87d29b206adbdf0051511cae11c99bd5`，随后仅补充截图等待与本报告。

本轮按协调方授权，将原 A 提交 `26a74524444bf44871a4383131426384f50b3f2d` rebase 到指定 B 合并提交 `9d79fd23a6d438036effc3296c53b6d3097e1165`。原 A 保留于 `safety/a-dojo-before-b-20260910`；[原 A 报告](REDESIGN-A-2026-09-10.md) 与 `screenshots/redesign-a/` 内容保持不变。B tip 为 `7930153ab5b84431b9dd7eccc536f5c4fddfad0f`。未向 main 合并、推送或部署。

用户所称“第 5 项兼容清单”，对应原报告第 6 节“B 期兼容点与合并后回归”；原报告第 5 节是截图索引。下文逐项复核该兼容清单。

## 1. 第 4 节逐项状态

| 方案项 | 整合状态 | 实际结果与边界 |
| --- | --- | --- |
| 4.1 默认道场、取消地图中间页 | 完成 | 保留 A 的道场场景区，主线、支线与开场原文内联；没有独立地图中间页。 |
| 4.1 四入口、设置、左栏压缩 | 完成 | 底部道场／游历／人物／行囊，右上设置与保存勾；顶部增加真实感悟与差额飘字；常规结果进事件流，sonner 仅错误。 |
| 4.1 取消修行／历程页签 | 完成 | 修炼直接操作与设置抽屉、突破弹窗；历程从事件流“查看全部”进入。 |
| 4.1 人物概览与行囊 | 完成（现有命令） | 同行／已结识／在场及二级检索保留；新行囊展示功法阶、感悟、qi、洞府与四种商品。技能编辑留待后续机制。 |
| 4.2 道场、唯一主按钮、次级动作 | 完成 | objective 提供真实命令；最多三项次级动作（有汇总时两项），优先修炼／杂务／采买；理由置于主按钮下方。 |
| 4.2 境界目标 | 完成 | minor 发 advanceMinor，计时晋升进入准备，cap 禁止新修炼；全部由 advanceRule、threshold、REALMS 与 realmOrder 投影。 |
| 4.3 逐日流 | 完成 | 每次推进一日，完整 ACK 后以 progress.newEventIds 对齐已保存事件正文，过滤玩家知情与 knownNpcUpdates；400ms 一行，加速只作用于显示队列。修复加速时 React 延后更新读取已清空队列的问题。 |
| 4.3 境界卡与跌境 | 完成 | 同一存档真实 realm 变化显示一秒仪式；成功、普通失败与严重失败跌境分别核对。读档不冒充晋级。 |
| 4.3 突破准备 | 完成（B 接口） | 展示感悟实际自动消耗与成功率；丹药／护法仅大突破，瓶颈不出现无效开关；凝神期间取消不提交。 |
| 4.3 长行动与汇总 | 完成 | 内联可展开汇总；pendingDaily 仅放行对应 choose，成功保存后续原 actionId/checkpoint，其他写入继续阻断。 |
| 4.3 关系阶段 | 完成（真实事实） | 沿用真实关系阈值和记忆，不伪造“每次互动涨一格”。 |
| 4.4 解锁 | 完成（已有功能） | 保留 B 十三档表；读取属性路径、布尔／数组与 gte/gt/lte/lt/eq。接人物／同城／四城、差事、洞府、宗门、见礼／同行、道侣／共修门槛。技能槽、泛化同行与霜河后续机制仍遵循 B/C/D 实际能力。 |
| 4.5 游历 | 完成 | 大地图为游历页；同城与四城入口按表开放，宗门标记按表显示，时间与风险取真实配置。 |
| 4.5 人物资料互动 | 完成（已有命令） | 固定底栏保留；展示真实感悟／功法阶／qi／洞府。论道、赠礼、请教及泛化同行未造新命令。 |
| 4.5 行囊 | 完成（B 经济） | ALL_SHOP_ITEMS 四项买入、三项卖出、聚气丹服用、功法进阶、洞府置办、既有治疗与兑换，标价与禁用原因查表。 |
| 4.5 创角、手机与文案 | 完成 | 沿用 A 首屏精简与更多设定；390×844 堆叠、拇指区动作、四入口；固定剧情、NPC 身份及原有深绿／金色／衬线视觉不改。 |

## 2. 兼容清单与十三档矩阵

- rule.kind 已成为 B 的正式类型，删除 A 对旧五档的兼容推断；界面不写境界数字分支。
- minor 满条执行既有 advanceMinor、保留溢出修为；mortal-entry／bottleneck／major 执行真实计时命令；大突破准备读取规则能力。
- unlocks 使用 B 原表，新增纯读取逻辑及功能键门槛，不把展示解锁写成规则锁。
- pendingDaily 在长行动前取得展示优先级；选择事务失败或用户中途暂停时不偷偷续行，成功 ACK 才恢复。
- progress 的 ID 与同日完整 World 对齐，正文来自真实事件；最后一个已确认 progress 保留到下一次请求。没有凭 ID 编故事，也没有扩协议。
- 新商品读 ALL_SHOP_ITEMS；功法、洞府、感悟与使用效果均读现有配置／Actor 字段。
- 迁移保留 0.1.6 原始备份；进行中突破保留旧概率、剩余日数与正确目标，不按新境界索引重新解释旧动作。

| 起点 | 类型 | 目标 | 规则日数 | 双视口校验 |
| --- | --- | --- | --- | --- |
| MORTAL | mortal-entry | QI_1 | 1 | 通过 |
| QI_1 | minor | QI_2 | 0 | 通过 |
| QI_2 | minor | QI_3 | 0 | 通过 |
| QI_3 | bottleneck | QI_4 | 1 | 通过 |
| QI_4 | minor | QI_5 | 0 | 通过 |
| QI_5 | minor | QI_6 | 0 | 通过 |
| QI_6 | bottleneck | QI_7 | 1 | 通过 |
| QI_7 | minor | QI_8 | 0 | 通过 |
| QI_8 | minor | QI_9 | 0 | 通过 |
| QI_9 | major | FOUNDATION_1 | 3 | 通过 |
| FOUNDATION_1 | bottleneck | FOUNDATION_2 | 1 | 通过 |
| FOUNDATION_2 | bottleneck | FOUNDATION_3 | 1 | 通过 |
| FOUNDATION_3 | cap | 封顶 | 0 | 通过 |

十三档矩阵、两种失败、两个视口的实际结果见 `screenshots/redesign-ab/realms/results-{1440,390}.json`。每一档用合法受控场景导入，再由生产 UI 发命令给真实 Worker；这些场景不计入新手耗时指标。每次成功核对目标、日数、5 点溢出、感悟消耗、丹药未误扣、存活和刷新深相等。

## 3. 实际测试与构建

实际执行结果如下。完整成功输出见 [验证日志](REDESIGN-AB-VALIDATION.log)，完整诊断失败输出见 [诊断日志](REDESIGN-AB-DIAGNOSTICS.log)。

| 命令 | 结果 |
| --- | --- |
| `npm run typecheck:game` | 通过 |
| `npm run test:game` | 87/87 |
| `npm run test:ui` | 2/2 |
| `npm run test:economy` | 3/3，覆盖四项买价与三项卖价的 UI／规则一致性 |
| `npm run test:storage` | 29/29 |
| `npm run test:client` | 6/6 |
| `npm run test:content` | 8/8 |
| `npm run test:extensions` | 34/34 |
| `npm run check:boundaries` | 56 模块通过 |
| `npm run test:boundaries` | 3/3 |
| `npm run format:check` | 通过 |
| `npm run build:local` | 通过，离线核心 a844861d49c2b0be6fcb |
| `XIANTU_STRESS_OUTPUT=/tmp/xiantu-a-stress XIANTU_TEST_OUTPUT=/tmp/xiantu-ab-browser-final-results XIANTU_TEST_URL=http://127.0.0.1:3100 PLAYWRIGHT_CHANNEL=chrome npm run test:browser:existing -- --workers=4` | 71/71，0 skipped，8.7 分钟 |
| `XIANTU_TEST_OUTPUT=/tmp/xiantu-ab-ceremony-results XIANTU_TEST_URL=http://127.0.0.1:3100 PLAYWRIGHT_CHANNEL=chrome npx playwright test tests/browser/redesign-ab-realms.spec.ts --grep 'every adjacent realm' --workers=1` | 2/2；只增加动画稳定等待，复核全部境界及两类失败并重拍跌境卡 |
| `XIANTU_TEST_URL=http://127.0.0.1:3100 PLAYWRIGHT_CHANNEL=chrome XIANTU_PORTABILITY_OUTPUT=/tmp/xiantu-ab-portability npm run test:portability` | 7 份 Chrome → Firefox 往返通过；[指纹记录](redesign-ab-portability.json) |

全套包括 `story.spec.ts` 的守诺／失约、战斗刷新、暂停恢复及十三档成长至封顶；`main-quest.spec.ts` 的四章真实流程；B 原三项浏览器测试；两尺寸的境界矩阵／旧途中突破／交易和事件流。交易实际买价为 8/30/40/20，卖价 4/15/25；专项场景服用聚气丹获得 54 修为。事件流专项在每个尺寸确认 3 条已知 NPC 事件正文、32 条未知世界事件排除，且加速／查看／刷新不改完整存档。

生产启动使用 `npm run start:local -- --hostname 127.0.0.1 --port 3100`；Chrome 使用 `PLAYWRIGHT_CHANNEL=chrome`。所有浏览器修改保留真实 Worker／IndexedDB 与完整只读断言；旧流程先通过真实 UI 达到解锁门槛、回应途中事件，再捕获待测快照。没有强制点击 disabled 控件、注入假回执或跳过失败用例。

B 规则、数值、迁移及 Worker 与指定合并提交一致，故本轮不因 rebase 重跑五种子十年压力测试。B 压力结果仍见 B 原报告，不作为本轮重新执行的结果。大存档浏览器性能用原 A 已生成的真实 seed 1／3650 日／100 NPC 夹具（984,974 bytes），并在实际解锁后验证 30 日等待与暂停：导入 576ms，解锁后的起始 day=3653，等待动作加只读查看耗时 20,928ms，50ms 采样的最大 UI 定时器间隔 192.7ms。此为四 worker 回归环境的实际值，非单用户基准。

离线预算采用 B 构建 `65029b6f953607006cc9` 实测 2,217,127 bytes；整合构建 `a844861d49c2b0be6fcb` 为 2,212,775 bytes，减少 4,352 bytes。没有沿用已无法覆盖 B 新规则的旧 A 预算。

### 诊断中实际出现的失败

初次整合全套 65 项：29 failed／36 passed；更新境界专项后全套 69 项：22 failed／47 passed，再次全套 10 failed／59 passed。专项 25 项先有 1 failed／24 passed，修正最后的支线同行门槛后，该用例与两项交易／事件专项共 3/3 通过。最终 71 项全套与 2 项截图补拍专项均通过。测试维护过程还出现过语法／误覆盖造成的未完整运行，已恢复并重新核对发现的用例数量，保留原输出，不计为有效验收。

代表性真实输出如下；失败没有改成 skip 或削弱只读快照断言：

```text
TimeoutError: locator.click: Timeout 15000ms exceeded.
  waiting for getByRole('dialog').locator('[data-journey-action="practice"]')

getByRole('tab', { name: '人物', exact: true }): element is not enabled

Expected substring: "修为 +20"
Received string: "闭关 2 日汇总…修为 +30…"

getByRole('button', { name: /^结为道侣/ }): Expected enabled, Received disabled

Locator: locator('.event-feed-lines')
Expected substring: "叶语菱与百里筠岑在青石坊市结识，谈起各自的见闻。"
Received string: "第 1 日你花费 8 枚灵石，购得回春丹。…"
```

前四项对应主按钮去重、渐进解锁、B 溢出修为规则与筑基前的结侣门槛，测试改为走真实界面并核对新规则结果。最后一项引出了真实的加速队列丢字问题：改用稳定的队列快照后，再以实际已知 progress ID／正文核对显示，同时检查未知世界事件既未进入 progress 也未出现在事件流。桌面和手机均通过，且查看／加速／刷新保持完整存档。

## 4. 四项量化指标

Chrome 152.0.7977.83，生产构建 `a844861d49c2b0be6fcb`。原始记录：[桌面](screenshots/redesign-ab/metrics-1440.json)、[手机](screenshots/redesign-ab/metrics-390.json)。

| 指标 | 1440×900 | 390×844 | 方法与口径 |
| --- | --- | --- | --- |
| 合法状态开始修炼 | 最多 3 步 | 最多 3 步 | 七种入口状态逐次点击计数；最坏为关弹窗 → 道场 → 修炼。 |
| 道场内容首屏可点击元素 | 6–7 | 7 | 新局、学会功法、首次满条、引气后；计进入视口的启用 button/link/summary/input/select。 |
| 同时最亮主按钮 | 1 | 1 | 四种状态检查 default 主操作，并人工复核截图金色层级。 |
| 创角至首次修为满条 | 2.277 秒 | 2.647 秒 | 从填写姓名开始，到真实 IndexedDB 的修为首次达阈值。默认种子、资质、真实 UI，无注入经验。 |

全屏含头像、设置及启用导航：首次进入均 11；四种状态桌面 11–12、手机 11–13。两项禁用导航不计可点击元素。完整控件文本数组见机器记录，未把全屏总数隐藏为 7。

以上耗时是自动化操作测量，不是未经开展的真人新手实验。战斗、未学功法、圆满待晋阶、封顶、不可取消的突破等不属于可开始新修炼的合法状态；沿用原 A 经确认的口径。两个尺寸均检查无横向滚动；关键场景的完整存档只读断言、凝神取消等待和导出再导入保持有效。

## 5. 截图与验收步骤

共 **67 张**，逐张文件、实际尺寸和验收步骤见 [截图索引](screenshots/redesign-ab/README.md)。新证据仅写入 `screenshots/redesign-ab/`。步骤 1、2、9、10 为两种规定视口；十三档／失败／途中迁移也在两个尺寸验证。B 原三项浏览器用例另存于 `redesign-ab/b/`，不覆盖原 B 证据。

| 路径 | 步骤 | 数量 |
| --- | --- | --- |
| `step-01-*.png` | 1、10 | 4 |
| `step-02-*.png` | 2、10 | 6 |
| `step-09-*.png` | 9、10 | 4 |
| `realms/{MORTAL,QI_1…QI_9,FOUNDATION_1…FOUNDATION_3}-*.png` | 2、10 | 26 |
| `realms/major-preparation-*`、`setback-*` | 2、10 | 4 |
| `realms/legacy-inflight-*`、`checkpoint-import-*` | 9、10 | 4 |
| `economy/inventory-*`、`durable-feed-*` | 3、4、10 | 4 |
| `b/*.png` | 1、2、3、4、9 | 15 |

## 6. 方案缺漏与保留的开放问题

1. A 原报告关于 ≤7 的口径仍是道场内容区；固定导航、头像和设置另计。规则禁止新修炼的战斗、圆满、封顶等状态不绕过规则。真人新手耗时没有开展。
2. B 资质指标保留原分母：低资质多耗时 62.5%，高资质节省 38.46%。若要求节省 ≥40%，仍是开放问题；本轮不调整数值或分母。
3. 洞府仍为一个当前城市字段，换城再次购买会替换。未擅自扩展多城产权或迁移协议。
4. B 预留的技能槽、泛化同行、rank/questStep 等字段不代表后续 C/D 机制已完成；不以占位按钮宣称可用。固定 NPC／剧情正文不改。
5. 感悟由现有 breakthrough 命令自动消耗，不能提供一个不会改变规则的“是否消耗”开关；界面明确显示实际行为。泛化护法仍需后续命令支持。
6. progress 仍只有 ID，当前一次一日 ACK 可获得同日正文。若未来改回单次多日推进，应另定只读快照投影，不能只复用当前最后状态。
7. 导入生成新 saveId／revision 是既有防陈旧写入行为；跨上下文比较仅归一该信封，其余整个 World 深相等。
8. 保留 A/C/D/E 范围界线，未实现第 9 节排除的系统，未修改主仓工作树或 B 工作区。


## 7. 提交边界与交接

`git merge-base --is-ancestor 9d79fd23a6d438036effc3296c53b6d3097e1165 HEAD` 通过。与 B 合并点相比，`lib/game/` 仅 `presentation.ts`、`journey-actions.ts` 两个展示投影及 `use-game.ts` 客户端适配有差异；balance、commands、types、cultivation、economy、daily-events、Worker 与迁移规则均未改。审计没有发现本轮 UI 中数值境界分支。

原 A 报告与截图相对安全分支无差异。整合按投影／入口、事件流、解锁门槛、单元契约、浏览器流程、截图稳定等待逐步提交。提交后的最终 clean SHA 由任务交付消息提供，方便协调方快进或审查；本任务不合并 A 到 main、不推送、不部署。67 张新截图、两种视口的原始 JSON、日志及开发状态均随本分支交付。
