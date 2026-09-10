# A 期道场 UI 重构验收报告

2026-09-10。工作区 `/Users/wangdaxi/Documents/ChatGPT/xiuxian/xiantu-a-dojo`，分支 `redesign/a-dojo`，基线 `d8ac3e415e3067f3a045a0ce8f7ec3b00dee3ab5`。需求来自 `REDESIGN-2026-09-10.md` 第 4、7、8 节及配套 HTML；用户已确认计划和下述量化口径。A 保持现有五档规则，尚未合并 B。

## 1. 第 4 节逐项状态

“完成”指 A 期可独立实现的范围；依赖新命令或新字段的部分明确列出，不以占位按钮代替功能。

| 方案项 | 状态 | 实际实现及范围 |
| --- | --- | --- |
| 4.1 默认道场、删除地图中间页 | 完成 | 删除 UI `components/game/world-map.tsx`；保留纯规则同名模块；所有主线、支线、开场故事使用同一场景区。 |
| 4.1 取消修行页签 | 完成 | 删除 CultivationPanel；直接修炼、修炼设置抽屉、突破准备弹窗分工。 |
| 4.1 人物三段概览 | 完成 | 同行之人、按真实关系阶段排序的已结识、此地在场；陌生人不展示姓名；搜索、范围、排序、24 人分页进入“查看全部人物”。 |
| 4.1 行囊 | 部分完成 | 保留现有法宝、功法、三种物资、购买与兑换；出售、聚气丹、技能、功法阶依赖后续规则，本期未造新命令。 |
| 4.1 历程并入事件流 | 完成 | “查看全部”打开 JournalPanel；没有独立历程入口。 |
| 4.1 大地图升级游历页 | 完成 | AtlasPage 保留十处目的地、本地地点、实际路程、已结识人数与旅途风险。 |
| 4.1 左侧栏压成状态栏 | 完成（现有字段） | 玩家自己的头像、姓名、境界、修为条、灵石、日期；法宝移至个人资料和行囊，同行见人物页。当前规则没有感悟。 |
| 4.1 结果反馈、保存勾、四入口 | 完成 | 道场／游历／人物／行囊固定底部，设置右上角；常规结果进事件流；sonner 仅错误；离线安装／更新控件收进设置，原安全检查保留。 |
| 4.2 道场构成 | 完成 | 顶部状态、场景剧情、事件流、单一金色主按钮、最多 3 个次级动作与“更多”；有汇总展开控件时次级动作最多 2 个。 |
| 4.2 objective 可执行目标 | 完成（现有命令） | 输出 command / anchor / reason；剧情选项、战斗、学习、旅行、组队、返回等直达现有 Worker 命令。突破先准备；没有目标卡与主按钮重复展示。advanceMinor 属 B 期。 |
| 4.2 次级动作 | 完成 | journeyActions 投影；合法修炼状态优先放“修炼 7 日”，其余进“更多”；所有剧情分支仍可在“更多”访问。 |
| 4.3 逐日事件流与数字飘字 | 完成（A 路径） | 现有 advance 每次请求 1 日，收到完整存档 ACK 后派生该日与已知 NPC 见闻；400ms 一行，400ms 播放数字差额；加速只清空显示队列。没有改 Worker/protocol 或添加 newEventIds。 |
| 4.3 一秒境界卡 | 完成 | 比较前后同一存档、递增 revision 的 realm；显示真实境界、每日修为变化、配置提示；读档不误触发。 |
| 4.3 突破仪式 | 部分完成（A 可用部分完成） | 真实成功率、丹药、现有林晚护法及禁用原因，1.2 秒凝神后提交既有命令；凝神时关闭不提交、不改变存档。感悟与泛化护法等待后续规则。 |
| 4.3 RetreatSummary | 完成 | 事件流内一条 details 汇总；没有完成即弹窗。 |
| 4.3 关系阶段条 | 完成（真实阶段） | 人物卡和资料头部常驻；按关系阈值、真实共同记忆和道侣关系计算；精确数值折叠。“每次互动涨一格”与现有规则冲突，未伪造关系进展。 |
| 4.4 渐进解锁 | 完成（按本期限定） | ui-presentation.json 新增 unlocks，按当前五档 realm key 配置；presentationUnlocks 读取。未提前隐藏现有入口；B 合并后换十三档表。 |
| 4.5 游历 | 完成（现有概率） | 原地图内容升级为页；路程与已结识人数、配置风险并列。当前 randomRoadEncounterBp=0，显示真实值，未硬写“一成”。 |
| 4.5 资料互动固定栏 | 完成（现有互动） | 见礼／近况、相伴、结侣、共度良宵、共修及原有确认与条件保留；论道、赠礼、请教、泛化同行等待命令。 |
| 4.5 行囊分段 | 完成（现有物品） | 随身与坊市分段；非坊市默认折叠药铺并解释地点条件。新经济功能未做。 |
| 4.5 创角 | 完成 | 首屏姓名、性别、外貌四选一、法宝三选一、“踏入仙途”；身形、种子、资质、模式、内容包、AI 立绘及存档／服务工具移入“更多设定”。 |
| 4.5 手机 | 完成 | 390×844 上下堆叠、事件流最多 3 行、固定拇指区主按钮和底栏；抽屉可滚动且不偏移；320px 与 200% 字号另有回归。 |
| 4.5 文案 | 完成（UI 文案） | 查看人物、查看随身物资、选择更多行动、设置修炼方式、在此停留等动词入口；删除旧地图／修行意境标题、侧栏引导和推进提示。固定剧情标题、正文、人物身份未改。 |

## 2. 边界与文件地图

- `lib/game/` 只改展示投影 `presentation.ts`、`journey-actions.ts`，以及客户端 `use-game.ts` 的 advance 批次参数与迁移回执；纯规则、balance、Command、World、Worker 与协议均未改。
- 新增 `dojo.tsx`、`event-feed.tsx`、`practice-settings.tsx`、`breakthrough-dialog.tsx`、`realm-ceremony.tsx`、关系阶段组件及 `lib/ui/` 适配器。
- `game.tsx`、`journey-tab.tsx`、`panels.tsx`、`character-sidebar.tsx`、`retreat-summary.tsx`、`atlas-dialog.tsx`、`person-detail.tsx`、`creation.tsx`、`globals.css` 按第 6 节调整；保留深绿、金色与衬线视觉。
- 原主工作区与 B 工作区未改；没有部署、合并主分支或引入新游戏命令。
- 小步提交：37943a9（目标投影与配置）、aa16c6d（四入口／道场／事件流）、0f1b68f（创角／人物）、cb91d6c（仪式、弹窗与离线入口回归修复）、ce8b73f（未学功法的合法快捷入口）、aa9c207（旧流程浏览器回归与生产指标）。最终报告和证据另有提交。

## 3. 实际验证

以下为实际执行，完整输出汇入 [验证日志](REDESIGN-A-VALIDATION.log)。最终生产源码为 ce8b73f，浏览器测试代码为 aa9c207；后续仅整理文档与证据。

| 命令 | 结果 |
| --- | --- |
| `npm run typecheck:game` | 通过 |
| `npm run test:game` | 71 通过 |
| `npm run test:economy` | 2 通过，包括 SSR UI 标价与规则实际扣费一致性 |
| `npm run test:ui` | 2 通过（实际构建 CSS） |
| `npm run test:storage` | 27 通过 |
| `npm run test:client` | 5 通过 |
| `npm run test:content` | 7 通过 |
| `npm run test:extensions` | 34 通过 |
| `npm run check:boundaries` | 54 个核心模块通过 |
| `npm run format:check` | 通过；采用仓库既有 .prettierignore |
| `XIANTU_RUNTIME=node npm run build:local` | 通过；离线产物版本 32e2b0a0ec193852cffe |
| `npm run start:local -- --hostname 127.0.0.1 --port 3100` | 实际启动并完成验收，交付时停止本次服务并释放端口；此前与 B 协调使用，未终止他人服务 |
| `XIANTU_STRESS_OUTPUT=/tmp/xiantu-a-stress XIANTU_TEST_OUTPUT=/tmp/xiantu-a-browser-final-results XIANTU_TEST_URL=http://127.0.0.1:3100 PLAYWRIGHT_CHANNEL=chrome npm run test:browser:existing -- --workers=3` | 62 通过、0 失败、0 跳过，3.6 分钟 |
| `XIANTU_TEST_URL=http://127.0.0.1:3100 PLAYWRIGHT_CHANNEL=chrome XIANTU_PORTABILITY_OUTPUT=/tmp/xiantu-a-portability npm run test:portability` | 7 份 Chrome 152.0.7977.83 → Firefox 153.0 存档往返通过，含守诺与违约剧情档 |

所有依赖旧页签的浏览器用例均重写为可见入口，仍使用真实 Worker 和 IndexedDB；AI 供应商响应和故障注入保持原测试边界。覆盖守诺／违约／再次邀约、战斗资料只读、四卷主线、宗门、123 人分页资料、绘图采用／恢复、存档备份与迁移、离线更新、手机与经济入口。

跨浏览器验证从真实 Chrome UI 下载七份存档，Firefox 新上下文逐份导入、刷新并再次下载；仅按既有导入语义排除 saveId／revision 信封后，对其余完整 World 深比较并记录 SHA-256。逐档结果见 [跨浏览器记录](REDESIGN-A-PORTABILITY.json)。

为消除原十年存档测试因缺夹具而跳过，额外执行：

```sh
npx esbuild tests/game/stress.test.ts --bundle --platform=node --format=esm --outfile=.game-test-build/stress-a.mjs
XIANTU_STRESS_OUTPUT=/tmp/xiantu-a-stress node --test --test-name-pattern='seed 1:' .game-test-build/stress-a.mjs
```

实际 1 项通过：100 NPC、3650 日、4172 条命令、断点恢复一致，177.4 秒。没有将它称为五种子压力回归。现有压缩后的完整存档为 984,974 bytes，旧浏览器测试“必须超过 5 MiB”的断言已失效，改为验证完整 3650 日／100 NPC／事件记录，并按真实大小测性能，未补造垃圾数据。

离线核心预算也复核了基线：另建 `/tmp/xiantu-a-baseline`，同依赖构建 d8ac3e4 得 2,155,334 bytes；本期最终 2,148,859 bytes，减少 6,475 bytes。原 2 MiB 阈值在基线已失败，回归改为“不超过实测原始基线”。

### 诊断中出现过的失败

首轮 29 failed／1 interrupted／1 skipped／1 did not run／28 passed；第二轮 16 failed／1 skipped／45 passed；第三轮 5 failed／1 skipped／56 passed。最后剩余专项复跑为 19/19 通过，随后一次全套 62/62 通过。快捷入口小修后的复跑曾出现 61/62，通过定位发现测试在 alertdialog 退出动画中提前关闭下层抽屉；等待真实关闭状态后，最终全套再次 62/62 通过。相关真实输出摘录如下；并非把失败隐藏为通过。

```text
Error: locator.click: element is outside of the viewport
  getByRole('dialog', { name: '选择更多行动' }) ... '准备突破'

Error: expect(locator).toHaveCount(expected) failed
  getByRole('dialog') Expected: 0 Received: 1

Error: expect(received).toEqual(expected)
  revision: 8 -> 9
  saveId: [导入生成新的隔离身份]

Error: expect(locator).toContainText(expected) failed
  Expected: "0.1.6"
  Received: "已读取 0.1.4 规则存档。"

TimeoutError: locator.selectOption: waiting for getByLabel('停止条件')
```

分别修复：Tailwind translate 与自定义 transform 叠加导致手机抽屉越界；嵌套弹窗与关闭动画的定位；导入按真实保存规则验证新 saveId／revision+1 且其余完整状态相等；新局早期实际版本为 0.1.4，0.1.6 回归改用真实升级后的导出；凝神动画期间测试必须等待实际提交完成。还修复了上一动作异步回调关闭新抽屉的实际竞态，以及将未学功法的旅行／学习快捷入口错误视为不可修炼的禁用条件。

```text
Error: expect(locator).toHaveCount(expected) failed
Locator: locator('[role="dialog"]')
Expected: 0
Received: 1
  at dismissPanels ... story.spec.ts:96
```

这次剩余时序失败的完整日志保留在验证记录中；最终用例等待关闭动画的状态收敛，不使用强制点击或放弃只读断言。

## 4. 四项量化指标

数据来源：[1440×900](screenshots/redesign-a/metrics-1440.json)、[390×844](screenshots/redesign-a/metrics-390.json)。最终生产版本 `32e2b0a0ec193852cffe`，Chrome `152.0.7977.83`，地址均为 `http://127.0.0.1:3100`。

| 指标 | 1440×900 | 390×844 | 结论 |
| --- | --- | --- | --- |
| 合法状态到开始修炼 | 最多 3 步 | 最多 3 步 | 达标 |
| 道场内容首屏可点击元素 | 四种状态均 7 | 四种状态均 7 | 达标；全屏含固定导航均 13 |
| 道场同时最亮主按钮 | 1 | 1 | 达标 |
| 从填写姓名到首次修为满条 | 1.912 秒 | 1.750 秒 | 自动化路径低于 180 秒 |

测量方法：生产 Chrome、真实 UI 新建角色，使用默认 seed／资质，不注入经验、灵石或跳过规则。首次满条计时从进入创角页并开始填写姓名至 IndexedDB 中修为首次达到阈值；这是自动化操作耗时，不是未经开展的真人新手实验。

- 修炼路径覆盖道场、其余三个入口、人物页资料弹窗、行囊页设置、道场更多抽屉；逐次点击计数，最坏路径为关闭弹窗 → 道场 → 修炼 7 日，共 3 步。战斗、未学功法、圆满待突破、封顶与不可取消的突破不属于规则允许开始新修炼的状态，显示原因／合法后续入口，不绕过规则。
- 首屏计 `.dojo` 中进入视口且可点击的 button／link／summary／input／select；固定四入口、头像、设置单独计入全屏总数。检查新局、学会功法、首次圆满、引气入体四种状态；完整计数数组见 JSON。
- “最亮”测量可见 `data-variant=default` 主操作，且人工检查截图中的金色层级。仅道场有一个金色主按钮；弹窗自身的确认操作按弹窗语义保留。
- 浏览器另外验证 `scrollWidth <= innerWidth`、主按钮处于手机视口内、查看资料／地图／汇总／加速不改完整存档，关闭凝神后等待超过计时仍保持状态不变。

## 5. 截图与验收步骤

目录：[screenshots/redesign-a/](screenshots/redesign-a/)。每组均有 `-1440.png`（1440×900）与 `-390.png`（390×844）。所有 390 图亦对应步骤 10 的 A 期手机部分。逐张文件、尺寸和步骤对应见 [截图索引](screenshots/redesign-a/README.md)。

| 文件前缀 | 验收步骤 | 内容 |
| --- | --- | --- |
| step-01-creation | 1、10 | 更多设定默认收起的创角首屏 |
| step-01-dojo | 1、10 | 默认道场、四入口、唯一主按钮 |
| step-02-first-full | 2、10 | 第一次修为满条、逐日见闻与内联汇总 |
| step-02-breakthrough-preparation | 2、10 | 真实成功率和突破准备 |
| step-02-realm-ceremony | 2、10 | 实时一秒境界卡；截图不快进该动画 |
| step-09-import | 9、10 | 新浏览器上下文导入真实导出的存档 |
| step-09-current-version | 9、10 | 真实 0.1.6 档读取回执，境界名一致 |

步骤 9 的 0.1.6→0.2.0 迁移以及步骤 10 所引用步骤 3–4 的日常事件／三档差事属于 B 期，A 不伪造验收。A 中现有旧 schema 迁移、升级前备份和原始快照保留已经由 storage 浏览器用例验证。

## 6. B 期兼容点与合并后回归

- 境界名用 REALMS，阈值用 threshold，目标与手动突破条件用 advanceRule／realm key；本期 UI 没有 `realm === 4` 或 `[0,3]` 类数值分支。
- `lib/ui/realm-presentation.ts` 优先读取未来 rule.kind，当前无 kind 时按目标、日数与首个 realm key 判断；已识别 mortal-entry／minor／bottleneck／major／cap 展示类型。预估文案明确为“本层修为约 N 日可满”。
- 解锁仅 ui-presentation.json 配置与纯读取；B 换表后应逐一回归十三档提示、封顶、失败跌境和全部目标命令。
- 当前 A 没有 advanceMinor 命令；B 合并后必须补接已定义的新命令、感悟、qi、功法阶和其他新字段，不能把表驱动误称为已经完成新玩法。
- B 最终分支提交已通知为 `7930153ab5b84431b9dd7eccc536f5c4fddfad0f`，尚未合入 A。B unlocks 的条件使用属性路径对象（如 `player.realm: {gte: 3}`），与 A 当前等值／数组读取需要在整合提交上统一；不能直接覆盖配置后宣称渐进解锁可用。
- B 协调通知：`pendingDailyEventId = daily.<id>`，scene(w) 提供待选事件，choose 清空 pending 且保留长行动 id/checkpoint/remaining；Worker 返回 condition 暂停。合并后应只放行该待选项，其他时间操作继续阻断；确认 choose 保存后续行 advance。当前 A 的 blocked 包含 longAction，此例外留给合并适配，尚未执行新字段代码。
- B 的 progress 仅增加 newEventIds、没有正文；A 当前每次一天 ACK 的完整快照可提供正文和知情过滤。若将来恢复多日单请求，需要另行约定只读事件投影，不能凭 ID 猜故事正文。
- B 新 qi 位于 ALL_SHOP_ITEMS；SHOP_ITEMS 暂保留三项。合并后回归行囊完整商品、图标、买／卖／用及 UI 与规则真实价格。
- 必回归：凡人引气、自动小境界／手动冲关切换、小瓶颈、大突破与护法、待选事件暂停/选择/恢复、十三档迁移、战斗存档、长行动中途读档、四章、全套 Chrome、上述 4 个指标。

## 7. 方案缺漏和未擅自决定的事项

1. 第 4 节把 newEventIds、感悟、出售、泛化关系互动列在 UI 中，第 7 节却将其分给 B/C/D；本期按用户硬约束只接现有命令，不扩协议或规则。
2. “每次交互条涨一格”不符合真实阶段阈值；本期只展示真实进展，不为了动画增加关系或伪造阶段。是否另加“本次进展”视觉需后续明确设计。
3. “任意状态开始修炼”若包括战斗、封顶、未学功法等，与规则相冲突；采用用户确认的合法修炼状态口径。≤7 采用道场内容区口径，同时公开全屏总数，未隐藏导航的实际操作数量。
4. 新浏览器导入按既有 Worker 生成新 saveId、revision+1，这是防跨页面旧写入所需的身份变化；除该信封外比较完整 World，含 RNG／人物／关系／资源／事件，并再刷新逐字段核对。
5. 新局初始可为 0.1.4，部分既有规则操作升级到 0.1.6；0.1.6 在 A 不是待迁移旧规则，迁移到 0.2.0 必须等 B。回执如实显示实际版本。
6. 当前旅途风险为 0、固定护法仅林晚、没有感悟和新经济物品；未用示例文案声称它们存在。
7. 本地 HTML 设计报告的浏览器打开被工具 URL 安全策略拒绝；已阅读 HTML 源文、线框与文案表，并查看现状截图。没有改端口或换浏览器绕过拒绝。
8. 单 seed 十年模拟只用于 A 大存档浏览器夹具；B 的五种子数值压力对比由 B 负责。真实设备、真人新手耗时、付费 AI 供应商均不在本轮模拟结果内。

最终交付不自动合入 B 或主分支；等待协调方给出明确 B 合并提交再回归。
