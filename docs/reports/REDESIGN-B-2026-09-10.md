# B 期：成长阶梯与日循环（规则 0.2.0）

工作树 `/Users/wangdaxi/Documents/ChatGPT/xiuxian/xiantu-b-realms`，分支 `redesign/b-realms`，基线 `d8ac3e4`。未合入 main，未改原工作树中的 A/UI/服务端改动，`components/` 改动为零。需求依据为 [重构方案](../REDESIGN-2026-09-10.md)，先完成 [逐键计划](../REDESIGN-B-PLAN.md)，再实现。

**B 的规则、迁移和数据接口已实现；跨 A/B 的完整 UI 验收仍为部分完成。** 旧界面能通过临时入口执行三种差事、功法进阶、卖草与洞府；真实 Chrome 已验证旧档导入和 Worker 暂停/选择/续行。旧界面会禁用长行动中的场景选择，且尚无 A 的突破仪式与实时事件流，因此不能把 Worker 验证写成这些 UI 项已通过。截图、测试日志与具体接口如下。

## 1. 核心需求逐项状态

| 方案 | 状态 | 实现与边界 |
| --- | --- | --- |
| 3.1 境界表 | 完成 | `REALMS` / `REALM_KEYS` / realmOrder / advanceRules / realmStats / 寿元与初始权重均 13 档；凡人、炼气一至九、筑基初中后。主线门槛 1/3/6/10。 |
| 3.1 手动冲关 | 完成 | `advanceMinor` 为 0 日、无随机、必成、扣旧阈值并结转余量；玩家不自动晋层，NPC 按配置自动晋层。 |
| 3.1 瓶颈与大突破 | 完成 | kind 查表；感悟加成最高 2000bp，启动后消耗；只有 major 可用丹/护法。普通失败损失 20%，大突破 30%；指定瓶颈严重失败跌一层、清修为。失败不扣血，降层仅把现有血量裁至新上限。进行中保持机会与目标快照。 |
| 3.1 每日修为 | 完成 | 基础 4/10/14 + floor(资质/8) + 功法阶 + 定心佩 + 灵石修炼 + 宗门心法/共修 + 同城洞府；重伤乘 0.5 后向下取整，最少 1。玩家/NPC 共用函数。 |
| 3.2 事件与概率 | 完成 | 修炼/停留/差事/旅途分别试掷 20/40/15/25%；三类各 10 条，60/30/10 权重，7 日冷却，额外排除上一次事件。所有新随机走 simulation 流。 |
| 3.2 选择与暂停 | 规则完成，UI 部分 | `pendingDailyEventId` + `contentState[daily.id]`；含选项时逐日事务提交后暂停，保留 id/checkpoint/remaining；choose 原子结算并清空 pending，可继续原行动。真实浏览器已通过 Worker 回滚/续行路径；旧组件仍禁用按钮。 |
| 3.2 效果 | 完成 | stones/insight/grass/healing/relation/encounter；负成本先汇总校验。论道选择额外耗 1 日；赠药的目标与第 7 日回礼写入事件元数据，活着的受助者回赠 5 灵石，仅一次。encounter 只记非致命遭遇，无新战斗。 |
| 3.2 停留与差事 | 完成 | wait 每日回执为当日小事或在场 NPC 动态。chores 坊市 1 日/6 石；herbs 郊野炼一 1 日/4 石、40%草、10%遭遇；escort 坊市炼三 2 日/18 石、20%遭遇。各 4 条回执随机取。 |
| 3.3 功法/聚气丹 | 完成 | 客栈进阶 40/120/300，境界 1/4/7；聚气丹购买 20，服用增加三日普通修为，单次不超过当前阈值 50%，不自动晋级。 |
| 3.3 洞府/出售 | 部分完成（单城与出售已实现，多城产权语义待定） | 炼三、坊市、200；同城 +3 并屏蔽普通修炼事件。出售草/回春/突破为 25/4/15，数量 1–99，在坊市校验库存。单一 cave 字段只能表示当前洞府城。 |
| 3.3 宗门经济 | 完成 | 20 贡献换丹，在所属宗门办理；30 日 20 石，所有在世门人共用时钟；可外出领取，旧档不补发迁移前俸禄。贡献校验扣除当前入门记录后的兑换，退宗重入不重复扣旧账。 |
| 3.3 章末奖励 | 完成 | discovery 选择成功时一次性领取 40/60/80/120 灵石与 2 感悟；旧完成章节不追补。无新增章末秘境/法器掉落。 |
| 3.9 Actor | 完成 | insight=0、manualRank=0、skills=[qingmang]、qi=0、jobCooldowns={}，可选 cave/gear，严格校验。技能与装备只预留。 |
| 3.9 门籍/约定 | 完成（后续机制预留） | rank=outer、questStep=0、lastStipendDay；terms=story，允许 split 类型。内门、任务链、泛化同行不执行。 |
| 3.9 World/迁移 | 完成 | schema 7 / rules 0.2.0；旧 0–4 → 0/1/2/3/10，历史溢出封顶。原档备份和迁移同一事务提交，失败时两者都回滚。 |
| 3.9 Command/协议 | B 命令完成 | 新经济、job、advanceMinor 均有严格请求校验；work 省略 job 兼容 chores。explore、discuss/gift/mentor/inviteCompanion、learnSkill 与新战斗技能参数属于 C/D，未启用空壳命令。 |
| 4.3 Worker 投影 | 完成 | 每日保存后 progress.newEventIds 只包含当日新产生且玩家已知的 ID。完整 World 仍在批次结束返回；仪式可据新旧 realm 与 advance/breakthrough 事件触发。 |
| 4.4 与成长引导 | 数据完成 | 七阶段 unlocks、九步 growth、查表 objective 和最简 journeyActions；第七步非故事同行等待 D，不能在 B 单独完成全部九步。 |
| 3.4/3.5/3.6/3.7 与第 9 节禁做项 | 按范围未做 | 新战斗、主动探索、宗门任务链/内门、护法泛化、关系互动、通用同行、章末秘境均未实现；未增加金丹/经营/云存档/AI裁决等。 |

## 2. 第 5 节配置逐键核对

`lib/game/content/balance.json` 的 configVersion 已为 0.2.0。下面“预留”表示配置已写入，执行机制留给 C/D/E。

| 配置键 | 状态/值 |
| --- | --- |
| cultivation.realmOrder、advanceRules.kind | 完成，13 项；mortal-entry/minor/bottleneck/major/cap |
| cultivation.aptitudeGainDivisor | 完成，8 |
| cultivation.excessExperienceCarryForward | 完成，true；玩家日常经验不封顶，迁移历史溢出单独封顶 |
| cultivation.minorAdvanceAutoForPlayerAndNpc | 完成，player:false / npc:true |
| cultivation.injuredGainPenaltyBp、injuredHpThresholdBp | 完成，5000 / 3000 |
| cultivation.manualRanks | 完成，cost 0/40/120/300，gain 0/2/4/6，minRealm 1/4/7 |
| cultivation.insight | 完成，perPointBp:200、maxBonusBp:2000、discussGain:1、exploreGain:1、chapterGain:2；主动论道/探索预留 |
| cultivation.cave | 完成，cost:200、dailyGain:3、minRealm:3、blocksOrdinaryDailyEvents:true |
| cultivation.breakthrough.foundationAdvancementEnabled | 完成，true；healthLossOnFailure 仍为 0 |
| combat.realmStats | 完成，13 档 |
| combat.skills、combat.encounters、combat.skillSlotsByRealm | 配置完成、机制预留；槽位 0:1 / 4:2 / 10:3 |
| travel.randomRoadEncounterBp、encounterFreeRegions | 配置完成、机制预留；1200 / [qingshi-local] |
| actions.jobs | 完成，三档地点/境界/天数/报酬/概率 |
| actions.explore | 配置完成、机制预留；冷却 2 日、遭遇30%/草35%/感悟20%/见闻15% |
| actions.dailyEvents | 完成，2000/4000/1500/2500bp，类别与回礼参数一起配置 |
| economy.shopPrices.qi、sellEnabled、sellPrices | 完成，20 / true / 草25、回春4、突破15 |
| economy.chapterRewards | 完成，[40,60,80,120] |
| sects.skillContributionCost、pillContributionCost | 60（预留）/20（执行） |
| sects.stipendIntervalDays、stipendStones | 完成，30/20 |
| sects.innerRankContribution、innerTaskMultiplierBp、guardianRequiresFriend | 配置完成、机制预留，100 / 15000 / true |
| relationships.discussCooldownDays、giftCooldownDays、giftDeltas | 配置完成、机制预留，7 / 3 / 灵石6、回春8、草12 |
| relationships.mentorCooldownDays、mentorExperienceBp、mentorMinRealmGap、duelDailyBp | 配置完成、机制预留，30 / 2500 / 3 / 500 |
| world.initialRealmWeights、npcLifespanDays | 完成，13 项；权重乘 10 做整数抽样，原每人一次抽样数量不变 |
| presentation.exactRelationshipNumbersVisibleByDefault、relationshipStageVisible | 完成，false / true；显示实现交 A |
| actions.livingExpensesPerDay | 保持 0 |

## 3. 实际测试与构建

| 命令 | 最终结果 |
| --- | --- |
| npm run typecheck:game | 通过 |
| npm run test:game | 83 通过 |
| npm run test:content | 8 通过 |
| npm run test:extensions | 34 通过 |
| npm run test:economy | 2 通过（旧行囊展示价格）；新增经济规则另在 test:game 覆盖 |
| npm run test:storage | 29 通过，含真实旧档、日常暂停/回滚/重试/恢复 |
| npm run test:client | 5 通过 |
| npm run format:check | 通过 |
| npm run build:local | 通过，最终离线构建标识 65029b6f953607006cc9 |
| npm run test:stress | 5通过；每局100 NPC/3650日，检查点重放一致 |
| XIANTU_TEST_URL=http://127.0.0.1:3100 npx playwright test tests/browser/redesign-b.spec.ts | 3 通过（2.1 分钟）；完整 UI 仪式/事件流仍待 A |

实际完整输出保存在 [测试日志目录](redesign-b-logs/)，包括阶段性失败及修正后的结果。失败堆栈中数 MB 的内联编译模块 base64 路径已省略，错误消息、断言与堆栈位置保留；原始未处理日志仍在本机 /tmp/xiantu-b-*.log。

实际使用 Node v23.9.0、macOS、真实 Google Chrome，viewport 1440×900。生产启动命令为 `npm run start:local -- --hostname 127.0.0.1 --port 3100`。浏览器指标通过装载生产页面的真实 Worker 协议驱动，全程由生产 Worker 写入 IndexedDB；三种差事、功法、卖草和洞府通过现有界面按钮点击。未直接写浏览器数据库或伪造资源。准备经济验收资金用正常差事赚取，卖出的草来自采药。

阶段性失败与修正（保留日志，不掩盖失败）：

- 日常接入后旧测试遇到 `GameError: 先回应当前小事，再继续行程。`：为不测日常的既有场景增加通过真实 choose 命令回应的辅助函数；未关闭随机事件。迁移合成夹具用 rest 产生旧版本形状，真实 0.1.6 档另独立保存和测试。
- 旧“旅行绝不改变 contentState/灵石”断言改为核对主线/支线进度不变，并准确计入日常收入；命令回执测试按实际新增回应命令数核对累计摘要。
- 浏览器初次载入 QA helper 出现 `Module ...events.json needs an import attribute of type: json`：Playwright 的 Node 测试端改用 fs 读取配置，不修改生产模块。
- 浏览器旧界面定位曾报 `waiting for getByRole('button', { name: /接些坊市杂务/ })`：先进入本地地点详情，再定位行动。控件 aria-label 是“进入听雨客栈/青石坊市”，已按实际控件定位。
- 指标最初用“节省比例”校验，得到 0.384615 后触发 AssertionError；方案只写“日数差异”，最终同时报告两种分母，不修改数值规则或择优换种子。

## 4. 五种子 3650 日前后比较

严格按要求先完成境界与迁移压力测试，再实现日常/经济：

1. 基线规则 0.1.6/schema6，输出 `/tmp/xiantu-redesign-b-before`，五种子全部通过。
2. 仅境界/迁移的 0.2.0，输出 `/tmp/xiantu-redesign-b-realms`，五种子全部通过；见 [境界阶段对比](redesign-b-stress-realms.json)。该阶段各种子入宗数与基线相同，均最终达到新上限。
3. 完整 B，输出 `/tmp/xiantu-redesign-b-after-final`；比较器为 `scripts/qa-redesign-b-stress-report.mjs`。中途另一次完整 B 压力运行因补齐回执文案而主动停止，未冒充最终结果。

| 种子 | NPC 死亡率（前→后） | 入宗率（前→后） | 各境界分布（前→后） | 平均境界（前→后） | 重放 |
| --- | --- | --- | --- | --- | --- |
| 1 | 0% → 0% | 21% → 21% | `[0, 0, 0, 0, 100]` → `[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 100]` | 4 → 12 | 通过 |
| 42 | 0% → 0% | 10% → 10% | `[0, 0, 0, 0, 100]` → `[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 100]` | 4 → 12 | 通过 |
| 12345 | 0% → 0% | 16% → 16% | `[0, 0, 0, 0, 100]` → `[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 100]` | 4 → 12 | 通过 |
| 20260906 | 0% → 0% | 13% → 13% | `[0, 0, 0, 0, 100]` → `[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 100]` | 4 → 12 | 通过 |
| 987654321 | 0% → 0% | 23% → 23% | `[0, 0, 0, 0, 100]` → `[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 100]` | 4 → 12 | 通过 |

五种子最终 **5/5 通过**。死亡率均为0%，入宗率未变化，分布均抵达各版终点，没有数量级异常。具体数值、运行耗时与bundle指纹见 [机器对比记录](redesign-b-stress.json)。最终整组约1408.88秒（23.48分钟），与生产浏览器/构建并行，耗时仅作记录，不是独占环境性能基准。


每局均为 100 NPC、3650 游戏日，并把第40日存档重放至第100日，与连续运行的完整指纹相等。分布按 `[凡人,炼一,炼二,炼三,炼四,炼五,炼六,炼七,炼八,炼九,筑初,筑中,筑后]` 计；基线仅五档。平均境界为档位索引平均，旧 4 与新 12 都是各自版本上限，不能解释为实力提升三倍。

差异来源：新晋层阈值/概率与 13 档成长改变 NPC 的行动路径；新日常/差事试掷会消耗 simulation 流，从第一次新试掷起，旧 seed 后续 NPC 抽样不再等于旧版本。仍保持同一版本、同一 seed、同一命令序列的确定性，排序使用稳定 ID，载入和查看不重抽。俸禄也改变后续买丹的资金条件。最终源码重新打包后的压力测试 bundle SHA256 与运行中的 bundle 完全一致（`bfa2cb1134a63b2ab563bd83d1ae8e3ead69dd1bdb3ccf91fd91084f786532ba`）；后续引导/文档与迁移俸禄修正不改变该模拟入口。战斗流没有新增试掷，固定 NPC 的初始身份、驻地、相对境界和锁定故事文字保持原样。长期都达到筑基后期，与无生存支出、失败不致命、可重试的规则一致。

## 5. 真实旧档迁移

来源：用基线 `d8ac3e4` 的真实 0.1.6 规则命令生成，重现脚本 `scripts/qa-redesign-b-legacy.mjs`；不是把新规则世界改一个版本号冒充旧档。两份夹具在 `tests/game/fixtures/redesign-b/`：`legacy-0.1.6-foundation.json` 与 `legacy-0.1.6-inflight.json`。

| 字段 | 迁移前 | 迁移后 |
| --- | --- | --- |
| schema / rules | 6 / 0.1.6 | 7 / 0.2.0 |
| 内部 day（界面日期） | 25（第26日） | 25（第26日） |
| 玩家“旧档筑基行者” realm | 4，筑基初期 | 10，筑基初期 |
| 玩家 xp / hp / stones | 0 / 130 / 6 | 0 / 130 / 6 |
| 周安 realm / xp / hp | 3 / 72 / 90 | 3 / 72 / 70（新炼三气血上限） |
| NPC_0003 顾照雪 realm / xp | 3 / 36 | 3 / 36 |
| 历程/关系/知情/RNG | 原对象内容 | 深相等 |
| 新字段 | 不存在 | 感悟0、功法0、聚气丹0、qingmang技能预留、空日常与冷却；门籍俸禄从迁移日开始 |
| 进行中突破 | 旧机会、剩余日数、旧目标 | 快照保留，旧炼三进行中的筑基不会变成炼四突破 |

真实 Chrome 操作选择旧文件→确认→显示迁移提示；在“本机备份”导出升级前原档，与夹具完整深相等。再导出 schema7 档，在新浏览器上下文导入，除了新存档身份/修订号外完整一致。Worker 故障测试证明空浏览器导入在提交失败时，当前档和原档备份都不落盘；重试成功后两者一并保存。详见 [迁移记录](redesign-b-migration.json) 与截图。

## 6. 三项量化与浏览器证据

| 指标 | Chrome 实测 | 辅助纯规则实测 |
| --- | --- | --- |
| 新局至炼气三层命令数 | 资质90：17；资质20：21，均 ≤40 | 资质90：16（40 NPC 环境） |
| 100 日日常事件 | 33 次，连续重复 0 次 | 33 次，连续重复 0 次 |
| 资质20/90日数差异 | 13 日 / 8 日 | 13 日 / 8 日 |

测量使用 seed42、归途符、免费修炼、7日计划在圆满时停止；主动回应事件取不耗时/不付费选项。命令数包含启动、逐日 step、晋层与事件回应，不只计 UI 主按钮点击。Chrome 用生产新局默认 NPC 数，辅助纯规则固定40 NPC，所以事件插入可能多一条命令。

**资质差异分母必须说明**：以资质90的8日为基准，低资质多耗时 `(13-8)/8=62.5%`，达到“差异≥40%”。以低资质13日为分母，高资质节省 `(13-8)/13=38.46%`，没有达到“至少节省40%”。若产品验收实际要求后者，则该项需要调整方案数值或验收定义，本分支没有擅自改数值。

重测纯规则指标：

```sh
npx esbuild scripts/qa-redesign-b-metrics.ts --bundle --platform=node --format=esm --outfile=.game-test-build/metrics.mjs
node .game-test-build/metrics.mjs
```

重测脚本：`scripts/qa-redesign-b-metrics.ts`（esbuild 后 node 执行）及 `tests/browser/redesign-b.spec.ts` / `redesign-b-driver.ts`。机器记录：[纯规则](redesign-b-metrics.json)、[Chrome指标](redesign-b-browser-metrics.json)、[Chrome日循环](redesign-b-browser-loop.json)。

截图目录 `screenshots/redesign-b/`：

- `greeting.png`、`entry.png`、`qi-three.png`：真实世界中的见礼与晋级状态；旧界面没有 A 的仪式，不能据截图宣称仪式已实现。
- `daily-paused.png`、`daily-resumed.png`：长行动保留检查点，日常内容出现，Worker 回应后可续行。记录中 `uiChoiceBlocked:true` 明确保留旧 UI 缺口；逐日 progress 已含玩家已知 NPC 事件，但旧界面未实时插入事件流。
- `job-chores.png`、`job-herbs.png`、`job-escort.png`、`manual-upgrade.png`、`sell-grass.png`、`rent-cave.png`：通过临时 journeyActions 入口实际点击，核对落盘日期/物资变化。
- `hundred-days.png`、`migration-notice.png`、`migration-backup.png`、`new-context-import.png`：事件量化终点和导入/备份证据。

## 7. 境界审计与给 A 的接口

完整 grep 输出、每类处理方式、内容 API 契约例外见 [境界索引审计](redesign-b-realm-audit.md)。`components/` 中 panels、game、retreat-summary、journey-tab 的旧索引判断逐项单列。原 story/main-quest/owned-art 浏览器辅助仍按旧 UI 自动晋层假设运行，需 A 合并后更新；本期执行的是专用 B 浏览器流程。

A 应感知的状态：

- `advanceRule(player).kind` 与 `xp >= threshold(player)`：minor 发 advanceMinor；mortal-entry/bottleneck/major 发 breakthrough；cap 不再给晋级目标。仅 major 可显示用丹和护法。
- `pendingDailyEventId` 优先于普通 longAction 目标；`scene(w)` 返回日常 StoryNode，`journeyContext` 给正确目标人物。需允许当前 choose 命令，并在成功后以原 action.id/checkpoint 续行。不要把 unresolved 事件清除或重新试掷。
- manualRank、insight、qi、cave 和门籍贡献/俸禄；增加经济入口与清晰的禁用原因。`SHOP_ITEMS` 暂保留旧行囊支持的三项；`ALL_SHOP_ITEMS` 含 qi，供 A 新行囊接入，避免旧 icons 表运行崩溃。
- `objective()` 对圆满给可执行 command，对 pending 给剧情锚点；其余 A 重构仍由 A 负责。新旧 realm 可作为仪式触发条件，WorldEvent 的 advance/breakthrough/breakthrough-failed 可作为历史证据。

Worker 格式（原字段保留）：

```ts
progress: {
  actionId: string;
  completed: number;
  total: number;
  day: number;
  paidStones: number;
  newEventIds: string[]; // 当前事务当日新增、玩家已知，例如 ["event:447"]
}
```

每条 progress 在提交成功后发出。`newEventIds` 为空也是合法；不含未知远方私事，不把旧事件的累计摘要冒充新事件。最终批次仍返回完整 World。ID 本身不带正文，A 若要在最后 World 返回前实时渲染，还需协调按 ID 读取只读事件投影或给 progress 增加正文投影；B 未擅改方案规定的载荷。

`unlocks` 每条为 `{when, show:string[], toast}`：when 使用属性路径对象，例如 `{"player.realm":{"gte":3}}`、`{"player.manual":true}`；第一日内部 day 从0起。show 是 UI 功能键，如 work.chores、tab.dojo、skill-slot.2、travel.four-cities。只控制显示，不构成规则锁，读取逻辑由 A 实现。

临时 journeyActions：advance-minor、breakthrough、upgrade-manual、buy-qi、use-qi、sell-grass/healing/pills、rent-cave、work-herbs、work-escort、sect-exchange；旧 work 入口显式发 job:chores。无需改组件即可使用；不满足前置时不展示对应捷径，Worker 始终再次校验。

## 8. 方案缺漏、冲突与开放问题

1. **UI 禁用冲突**：`components/game/game.tsx` 的 blocked 包含 `!!w.longAction`。B 的日常选择保留长行动，故旧组件必然禁用选择。为遵守“不改 UI 组件”，没有绕过或隐藏检查点；已通知 A 与协调任务。自动续行和仪式/实时流留给 A，这使第8节的完整2/3项仍部分完成。
2. **实时数据载荷不足**：newEventIds 只能通知有新事件，旧 World 中没有正文。需要 A/B 后续约定只读投影，或明确允许增加事件摘要载荷。
3. **洞府多城语义**：“每城一处、一次性”与单个 cave:LocationId 无法同时表达完整产权。本期按单个当前洞府城存储；迁居其他城再次付费会替换 cave。是否永久保留多城产权、回旧城是否免费切换，应补字段与迁移再定，未加入暗藏的产权结构。
4. **指标分母**：62.5% 的相对耗时差与 38.46% 的节省比例均给出；如验收要求节省≥40%，当前配置不达标，不以更换种子/资质/资源投入规避。
5. **未指定的具体参数**：首批事件统一7日冷却，受助 NPC 第7日回礼5石，均配置化；风险不符合境界/地点时跳过该类别，不重抽普通类别。已存在 pending 时先回应，不叠加第二个未决事件。修炼/停留/差事/旅途四类试掷，休息/宗门委托/共修/突破等未另定义事件概率，维持原行动；突破不会被普通日常打断。
6. **耗时选择与短行动**：论道的1日推进 NPC 与寿元，但不消耗原闭关的剩余计划。旅途/护送仍为原子的短行动，先完成其配置天数与结算，再回应期间命中的小事；不会把尚未结算的短行动伪装为闭关。若要在每个旅途日中途改道，需 C 扩展长行动类型。
7. **后续机制预留**：御风步/太极归元冷却未在方案给定，配置 null，不擅定战斗规则；qingmang 等 skills、rank/questStep、split 约定及 explore/relationships 配置不意味着 C/D 已可用。九步中的非故事同行需 D 提供真实完成事实；当前不会伪造完成记录。
8. **旧内容包量纲**：固定NPC和故事锁属于 API1/2的0–4档契约；运行时显式适配。创作包含新境界的内容包应升级 API，不能直接解释旧索引4为炼四。新主线 minRealm 属于独立主线schema，已升版本及锁，并登记旧锁迁移。
9. **经济平衡待后续风险接入**：仅按配置计算，采药含卖草的期望收入为14石/日，高于护送的9石/日（都未计日常事件）。B 的遭遇没有战斗成本，按方案保留数值，C 接入风险后再评估。
10. **配置路径冲突与兼容**：方案3.3说价格都放economy，第5节指定功法/cave放cultivation，本期以后者为单一来源。Actor未列聚气丹库存，补了qi:number默认0。旧 work 无job按chores兼容，旧界面的“任意地点劳作”入口可能被规则拒绝，由 A 按新表收口。

所有新增世界写入通过生产 Worker 事务，原始备份与迁移在同一提交完成；新随机只用 rng.ts。未安装插件、未发布站点、未向主分支合并。
