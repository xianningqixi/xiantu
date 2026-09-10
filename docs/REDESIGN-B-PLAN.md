# B 期执行计划

工作树：`/Users/wangdaxi/Documents/ChatGPT/xiuxian/xiantu-b-realms`；分支：`redesign/b-realms`；起点：`d8ac3e4`。主目录已有 UI/服务端改动，不纳入本分支。不自行合入 main。当前会话为执行模式，先以本计划完成需求与文件核对，再写规则代码。

## 顺序与提交边界

1. 读取规范、设计、规则与测试；运行旧规则五种子 3650 日基线并保存原档。
2. 扩 13 档境界、共同修炼与突破、玩家手动冲关、固定人物境界适配、schema 7 / rules 0.2.0 迁移。对应规则、迁移测试与首次新规则压力测试在日常事件和经济之前执行。
3. 每日日常事件 storylet、冷却、选择暂停、分级差事；对应确定性、概率、回执和资源测试。
4. 功法、丹药、出售、洞府、贡献兑换与俸禄、章末奖励；对应经济与 Worker 原子性测试。
5. Worker 每日已知新事件、九步成长表、渐进解锁数据与最简 journeyActions 入口；不改 components。
6. 全套验收、五种子前后报告、旧档实际导入、三个指标脚本、真实 Chrome 1440×900 生产构建验收及截图，更新 README 和 DEVELOPMENT-STATUS，提交交接报告。

## 第 5 节逐键清单

| 配置 | 落实方式 |
| --- | --- |
| configVersion | 0.2.0 |
| cultivation.realmOrder / advanceRules.kind | 13 档及目标、阈值、耗时、概率、失败表 |
| aptitudeGainDivisor / excessExperienceCarryForward / minorAdvanceAutoForPlayerAndNpc | 8 / true / player:false,npc:true |
| injuredGainPenaltyBp / injuredHpThresholdBp | 5000 / 3000 |
| manualRanks / insight / cave | 完整配置及 B 期相关效果；论道探索数值仅预留 |
| breakthrough.foundationAdvancementEnabled | true；healthLossOnFailure 保持 0 |
| combat.realmStats | 13 档 |
| combat.skills / encounters / skillSlotsByRealm | 按方案预留数据；C 期执行机制 |
| travel.randomRoadEncounterBp / encounterFreeRegions | 1200 / qingshi-local；C 期接战斗 |
| actions.jobs / explore / dailyEvents | 三档差事与每日概率执行；探索配置预留 |
| economy.shopPrices.qi / sellEnabled / sellPrices / chapterRewards | 20 / true / 25,4,15 / 40,60,80,120 |
| sects.skillContributionCost / pillContributionCost / stipendIntervalDays / stipendStones | 60 / 20 / 30 / 20；技能仅预留 |
| sects.innerRankContribution / innerTaskMultiplierBp / guardianRequiresFriend | 100 / 15000 / true；D 期机制预留 |
| relationships.discussCooldownDays / giftCooldownDays / giftDeltas | 7 / 3 / 6,8,12；D 期机制预留 |
| relationships.mentorCooldownDays / mentorExperienceBp / mentorMinRealmGap / duelDailyBp | 30 / 2500 / 3 / 500；D 期机制预留 |
| world.initialRealmWeights / npcLifespanDays | 各 13 项，权重按相对权重抽样 |
| presentation.exactRelationshipNumbersVisibleByDefault / relationshipStageVisible | false / true |

## 第 6 节文件地图核对

- 境界：rules、official、cultivation、daily-simulation、npc-life、actor-factory、worldgen、migrations、training-preview、advance；全仓索引审计。
- 命令：types、protocol、commands、action-cost、validate、sect-validation。
- 日常：daily-events（新增）、events.json（新增）、story/content-story、knowledge 相关投影、内容验证与准备流程。
- 经济：economy、commands、sects、sect-simulation、main-story；新增可测试的纯规则处理器。
- 故事与引导：main-quest/story.json、main-story 内容锁迁移、growth.json、growth.ts、ui-presentation.json、journey-actions；presentation 仅必要境界适配，A 期负责 UI 目标重构。
- Worker：simulation.worker、types 的 progress；保存后发送当日玩家已知新事件 ID。
- 留给后续：combat/encounters/explore、宗门任务链、护法泛化、relationships 新互动、技能执行、章末秘境、全部 UI 组件。
- 测试：现有规则/内容/扩展/经济/存储/客户端/压力，新增 B 期规则与迁移回归、量化与浏览器脚本。

## 已识别的设计接口缺口

- 聚气丹未列 Actor 库存字段：新增 `qi: number`，旧档默认 0。
- 第 3.3 把价格归 economy，第 5 节功法与洞府价格放 cultivation：保留第 5 节指定路径，economy 命令共用这些配置，避免双份价格漂移。
- 旧 work 无 job 的 UI：兼容省略 job 为 chores，新增入口发送显式 job；规则地点仍按新表。
- 普通事件池、冷却、延后赠礼缺少具体数值结构：事件自带 cooldownDays，延后回礼记录指定 NPC 与到期日，存档校验覆盖；不创造过去事件。
- C/D 配置仅预留；skills、terms、rank、questStep 等类型不代表后续玩法已完成。
- 真实 UI 仪式和事件流属于 A 期；B 提供 realm 变化、pendingDailyEventId、progress.newEventIds 及可执行临时入口。
