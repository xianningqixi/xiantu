# TDD：Web 图文修仙 V0.1.1 执行契约

状态：规格已定义，功能待开发。本文规定本轮原型的实现默认；领域数值的唯一来源是 `content/prototype-balance.json`。用户硬约束见 GDD，具体任务及验收见 TASKS、ACCEPTANCE。

## 1. 开工技术基线

采用 React、TypeScript、Vite、原生专用 Web Worker、IndexedDB、Vitest、Playwright。M0-01 解析相互兼容的实际包版本并提交锁文件；此包不包含已安装依赖或虚构的 package-lock。

Node 选择满足所选 Vite 和测试工具要求的版本，在 `.nvmrc`／`engines` 固定实测版本。Vite 当前入门文档列出 Node 20.19+、22.12+ 等要求，同时提醒模板可能要求更高版本，因此不要仅凭主版本号认定兼容。[Vite 入门](https://vite.dev/guide/)

初始建仓命令是实施步骤，不是本次已执行结果：`npm create vite@latest xiuxian-web -- --template react-ts`。生成后立即固定实际依赖；后续安装走 `npm ci`。若目标目录已有仓库，先读取既有规范并按 Task 集成，不覆盖现有文件。

M0 建立脚本：`dev`、`build`、`typecheck`、`test:unit`、`test:browser`、`test:content`。`typecheck` 独立执行 TypeScript 检查，`test:content` 接入本包校验器。具体脚本命令由工程实际布局确定并写入 README。

## 2. 目录与依赖

| 目录 | 责任 | 可依赖 |
| --- | --- | --- |
| src/core | 纯数据、随机、时间、修炼、战斗、关系、不变量 | 本目录及纯数据 contracts |
| src/application | 领域命令、校验、长行动、事务提交编排 | core；持久化、时钟等抽象端口 |
| src/infrastructure | IndexedDB、导入导出、日志、AI 客户端适配 | application、core |
| src/worker | 实例装配、串行消息处理、进度 | 前三层；浏览器 Worker API |
| src/ui | 页面、人物卡、输入、已提交视图 | contracts；查询/命令客户端 |
| src/content | 校验过的剧情、数值、物品定义及映射 | 纯数据，不含任意脚本 |
| public/assets | 图片与版本清单 | 不含游戏事实或密钥 |

禁止 UI import 可变 World 实例，禁止 core import React、DOM、文件、HTTP、IndexedDB。约束通过 lint／依赖检查执行。React 重绘与开发期重复挂载不能导致创建角色、抽随机或提交行动。

只保留一份可写世界：每个存档的 Worker 运行宿主。UI 保存只读投影；AI 代理不保存并裁定玩家世界。前端本地权威用于单人体验，不作防篡改、可信交易或排行榜保证。

## 3. 存档与核心模型

`contracts/game.ts` 是可移植的数据契约草案，实际实现需开启 TypeScript strict 检查并扩充合法 payload 的逐命令 schema。所有持久化数值须为安全整数；概率使用 bp，0–10000；浮点时间和现实时间不进入规则结算。

| 模型 | 必须保存的内容 |
| --- | --- |
| SaveEnvelope | saveId、版本组、revision、世界快照、内容哈希、最近命令索引 |
| WorldState | seed、day、playerId、characters、locations、factions、inventory、relationships、agreements、parties、expeditions、storyScopes |
| CharacterState | id、固定外貌ID、性别、出生游戏日、资质、境界、当前层修为、生命／伤势、位置、势力、目标、行动占用 |
| LocationState | 地点ID、可连接节点、设施、资源定义，路径耗时读取配置 |
| Relationship | 有向好感／信任／吸引、显式关系标签、变化事件引用 |
| Agreement | 当事人、版本、条款、接受记录、状态、关联探索与结算事件 |
| ExpeditionState | 成员、阶段、报酬支付记录、遭遇、掉落池、分配状态 |
| StoryScope | 人物故事当前 agreement/party/expedition ID、已领取claim、已发生故事事实 |
| InteractionSession | 当前storyletId、参与者、已展示正文／选项、故事节点、所据revision |
| LongAction | 父行动ID、角色占用、剩余天数、检查点序号、已支付费用、输入参数 |
| BattleState | 参战者、轮次、当前行动者、行动队列、资源、随机状态引用、待写回结果 |
| WorldEvent | eventId、day、类型、参与者、地点、事实payload、causeId |
| Memory | 原事实eventId、知晓者、来源、知晓游戏日、重要程度 |

人物死亡保留实体或身份墓碑，不删除历史引用。`PLAYER` 是该存档唯一玩家角色，`NPC_LIN_WAN`、`NPC_ZHOU_AN` 是本包重点剧情模板ID；其余NPC按固定顺序生成。全世界约40名NPC，玩家另计。

同一角色的位置只能是 `at(locationId)` 或 `travel(from,to,arrivalDay,actionId)` 之一。旅途中的人物不同时出现在出发地和目的地；日末抵达的实际时点按结算阶段处理。

## 4. 世界操作的统一过程

消息信封：`protocolVersion`、`requestId`、`saveId`、`commandId`、`expectedRevision`、`type`、`args`。查询消息与领域命令分开，查询不能推进世界或消耗随机。

处理顺序固定：

1. 在活动存档串行队列中接收消息，校验协议与具体 payload。
2. 先查命令去重表。相同 commandId 与相同 payload 返回原结果；相同ID但不同payload报 `COMMAND_ID_REUSE`。
3. 对比世界 revision。失配返回 `STALE_REVISION` 及最新投影，不能静默按新状态执行旧同意。
4. 校验人物资格、会话、资源、承诺、时间及目标；错误不消耗规则随机。
5. 基于不可变快照与随机副本计算候选状态、事件、记忆和新会话。
6. 做不变量检查。开启 IndexedDB 读写事务，在事务内重新检查 revision，写入同一笔全部相关数据和去重记录。
7. 事务 complete 后替换 Worker 内存状态，并发 `committed` 结果。事务失败抛弃候选，保持旧状态。
8. 若事务已提交但 UI 未收到结果，重发同一 commandId 返回已经保存的结果；不得再结算。

不要在已开启的 IndexedDB 事务中等待网络、AI或其他不受事务控制的异步工作；候选计算在事务前完成，事务内只做必要数据库操作。MDN说明事务有活动状态及自动提交生命周期，单个写请求成功不能代替整笔事务完成。[IndexedDB 使用说明](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API/Using_IndexedDB)

`OpenProfile`、打开背包、回看历史是UI查询动作。`AdvanceDialogue`、`LeaveInteraction`仅保存会话进度，无时间和奖励。`Talk`只接受白名单话题；一次性功法领取以claimId原子登记。任何内容节点都不能直接执行任意stat修改。

### 4.1 必须实现的错误码

| 错误码 | 界面行为 | 状态影响 |
| --- | --- | --- |
| VALIDATION_ERROR | 显示可修正输入 | 无 |
| PRECONDITION_FAILED | 解释资格／资源条件，刷新选项 | 无 |
| STALE_REVISION | 显示情况已变化，加载当前结果 | 无新结算 |
| COMMAND_ID_REUSE | 拒绝并记录开发诊断 | 无 |
| SAVE_WRITE_FAILED | 保持上一次成功状态，允许重试同一命令 | 无候选提交 |
| SAVE_VERSION_UNSUPPORTED | 提供备份／兼容版本处理入口 | 不覆盖原档 |
| SAVE_MIGRATION_BLOCKED | 提示关闭旧页，暂停写入 | 无 |
| CONTENT_MISSING | 退到可用地点页／素材占位，记录缺失ID | 不生成替代世界事实 |
| AI_UNAVAILABLE / AI_INVALID_PROPOSAL | 继续提供固定交涉选项 | 无 |
| RUN_ENDED | 展示本局结局及历史 | 不再推进本局 |

## 5. 时间、长行动与资源占用

世界日是整数；对白、查看档案、战斗单次行动为零天或由配置明确规定；Travel、修炼、突破、劳务通过配置推进时间。现实等待、网络延迟、素材下载、浏览器重启和系统日期不推进游戏日。

日处理使用以下阶段：期初状态/寿命 → 旅途抵达 → 收集行动提案 → 按优先级及稳定ID裁决共享资源 → 行动/遭遇结算 → 关系与承诺后果 → 不变量检查 → 检查点。每个阶段读取上一阶段已计算的候选状态，阶段间不单独持久化，完整游戏日后统一提交，处理器不得依赖对象枚举顺序。死亡结算后马上取消该角色剩余阶段行动。

长行动开始单独提交一次准备费用和占用，生成 longActionId。其第n个检查点命令ID固定为 `longActionId:step:n`；每检查点推进一完整游戏日并同时保存剩余天数、随机和资源状态。所有已占用人物不再选择第二个冲突行动，NPC护法、同行也遵守。

暂停计算只影响计算调度，角色仍在原行动中。`StopLongAction`是实际提前结束，按GDD原型规则处理已花时间、费用和占用。恢复先读取最后已提交编号，不能从前端百分比反推世界进度。

StartExpedition在山门接收：检查三人资格、接受条款、玩家报酬余额和准备状态，一次性支付每NPC的约定报酬并占用队伍，生成探索ID，然后执行山门至遗迹的旅行阶段。已知无资格或支付失败不产生半队伍或半支付；途中后续失败按实际事件处理，不能把已经发生的过去回滚为未出发。

原型Travel图：坊市↔客栈0天；坊市↔山门1天；山门↔遗迹1天。实际数据以prototype-balance文件中对应边为准。队伍旅行操作作用于全体有效同行者，成员不重复各扣一遍世界天数；更改目的地、成员退出或死亡需要重新判断探索资格。

## 6. 随机和可复现性

算法默认 `xorshift32-v1`，每个流保存非零uint32状态与drawCount。流名为 `worldgen`、`creation`、`simulation`、`combat`、`narrative`。根Seed限定0..4294967295，派生Seed使用ASCII字符串 `rootSeed:streamName:xorshift32-v1` 的FNV-1a 32位哈希；结果为0时固定替换为0x6d2b79f5。用户名、现实时间、图片加载顺序不参与派生。

每次取值依序：`x ^= x << 13; x ^= x >>> 17; x ^= x << 5; x >>>= 0`，再保存状态和drawCount。生成整数 `[0,n)` 用拒绝采样：只接受小于 `floor(2^32/n)*n` 的uint32，然后取模；n限定1..2^32。成功概率为 `uniformInt(10000) < probabilityBp`。数值和算法版本进入存档。

资质重掷仅推进creation流；剧情候选随机仅推进narrative流且将已选事件入档；NPC突破和玩家突破使用同一修炼计算，随机源由被明确声明的规则域决定。AI自由回应不参与可复现承诺，但接受后的结构化命令和重要展示文本保存。

规范化摘要按对象键排序，数组保留具有语义的稳定顺序，仅比较规则状态、随机、当前行动与关键事实；日志现实时间、requestId、UI滚动、动画帧和缓存目录不进入摘要。初始世界摘要不包含可任意变化的玩家姓名与创建UI操作。

## 7. 事件协议、条件与故事导航

`content/storylets.json`给出本包完整首条故事。所有模板字段通过结构检查；条件与选项条件都按AND求值。条件引用仅允许固定投影，不允许任意JavaScript、表达式eval或任意对象路径。

| kind | 允许key | subject |
| --- | --- | --- |
| entity | alive、locationId、realmTier | PLAYER或已存在NPC ID；realmTier为0凡人/1炼气/2筑基 |
| fact | lin.firstMeetingRecorded、lin.manualClaimed、lin.goalKnown、lin.storySettlementResult、lin.reunionRecorded、player.canBreakthroughToQi | STORY_LIN_WAN_01作用域 |
| agreement | status | 故事作用域绑定的当前agreement |
| party | memberCount、memberIds | 故事作用域绑定的当前party |
| expedition | phase、hasPromisedGrass、settlementReady、exceptionSettlementRequired | 故事作用域绑定的当前expedition |
| clock | daysSinceStorySettlement | 故事的真实结算事件时间 |

op为eq/ne/gte/in/contains。`contains`仅对集合字段使用；`in`右值为已校验的枚举数组；`{ruleRef: ...}`只解析配置白名单键。缺失必需对象、未知字段、故事尚未结算等均不满足条件；不把缺失天数转成0，也不能用ne条件意外放行未知状态。

每个storylet是内容定义，每次实际出现需要持久化InteractionSession。`nextStoryletId`是完成命令后的导航候选，目标仍必须满足角色、地点和故事条件；不能因为文本跳转让角色瞬移。若候选失效，重新选择当前地点有效事件或显示常规行动入口。

事件选择优先当前未结束合法会话、必须反馈的已结算后果、重点故事、通用事件。候选再按优先级、冷却、最近出现次数过滤；选择时仅保存随机结果与会话；once只在合法Talk或AdvanceDialogue完成节点时保存。纯渲染、档案查看、离开和旅行均不消耗关键节点once资格。

`effectRef`如存在，只指向注册处理器或配置中的已允许变化。它是内容到规则的标识，不能独立运行；由对应命令确认事实成立后应用，且按eventId去重。奖励、首次相识、违约等都不能在渲染节点时执行。

## 8. 约定、掉落、分配与死亡

本包剧情采用明确条款：本次实际获得的第一株凝元草归林晚；其余战利品归玩家；林晚与周安各领取一次1灵石出征报酬，StartExpedition开始时支付。完整条款必须显示，接受与组队本身不重复支付。

状态建议使用 draft → accepted → active → fulfilled / breached / not_triggered / cancelled。accepted只代表双方同意；active与探索ID绑定。未掉落凝元草为not_triggered，不能制造违约惩罚；不存在的物品不可凭约定生成。

所有掉落先进入有所有权/待分配记录的LootPool。AllocateLoot逐项校验、一次提交分配、承诺状态和关系事件；每个lootEntry只能结算一次。若玩家明确选择保留本来应给NPC的已获得药草，规则允许产生违约结果，不能把一切违约都当无效命令拦截。

NPC在过程中死亡或离队时，停止无效行动。V0.1剧情中的未触发未来物品义务按GDD具体规则取消或标记条件未发生，不能自动把不可履行都算玩家违约；已领取报酬不因取消凭空退还。历史保留当时条款及终止原因。

## 9. 存储事务、导入与版本

数据库固定logical name `xiuxian-web`，初版结构版本1；object stores：drafts、saves、events、commands、backups、settings。每条记录包含saveId或复合键；当前快照、事件与命令在同一事务范围内提交。settings只存界面偏好，不放游戏权威数据或API密钥。

同一存档默认一个活动写入页面；存储内revision比较是跨标签页最后防线。旧连接收到versionchange停止新命令并关闭连接；新升级blocked时提示关闭旧页。广播只是体验优化，不取代事务检查。

导出Envelope JSON，导入体积上限读取limits.maxImportBytes（当前原型5MiB），校验版本、整数范围、唯一ID、位置、实体引用、资源、命令去重和长行动状态。原型先支持本包版本；遇到未来版本保留原档并拒绝，不盲目猜迁移。

迁移流程：导入至临时副本→只运行已登记迁移→完整不变量检查→保留旧备份→切换指针。失败停留旧版本。前端缓存版本和规则内容版本相符；离线缓存失败不能说明数据迁移失败，反之亦然。

## 10. 战斗、突破与跨模块责任

CombatService只接收规则状态和合法行动，产生新的BattleState或最终BattleResult；UI动画可跳过但不能跳过结算。每个完整行动或回合边界的保存粒度按M6任务选定并在UI说明，首版默认完整回合保存。死亡行动者立即退出后续队列。

CultivationService接受角色状态、准备、规则配置、时间与随机输入，返回成功／普通失败／严重失败。任何失败分支都不返回死亡结果。原型压缩炼气层数只服务此次可玩测试，规则配置决定上限。

一笔突破长行动开始登记丹药与护法占用；结束按照已声明的概率计算时点结算。准备条件失效按配置处理并显示原因。不能前端显示一个概率、后台用另一个概率。

## 11. AI代理和Proposal契约

建议一个受控接口 `POST /api/negotiation`：请求包含protocolVersion、requestId、conversationId、playerText及经筛选的交涉上下文；结果为proposal或可处理错误。客户端关联原世界revision；服务端无权宣称世界已改变。

Proposal含intent、npcId、scopeId、terms、unresolvedTerms、reason。intent白名单：invite、counter_offer、accept、reject。任何新条件需明确同意；未解决条款阻止提交。转换成GameCommand后仍完整校验；reason不作为新增物品、修为或NPC目标的依据。

服务器配置上游URL、模型、密钥、timeout和输出上限；前端不保存平台共享key，不接受任意上游地址作为公开代理。按部署范围配置访问控制和用量限制。请求取消后丢弃迟到结果，重试不复用已经失效的同意。

M9只做交涉。图像每次实时生成、开放闲聊、动态写世界设定不在该任务内。固定选项和预制配图始终提供可完成故事的路径。

## 12. 规格包和软件验收的界限

本次包校验负责JSON可读、内容引用、ID唯一、任务依赖、验收关联和配置硬约束等静态一致性；不冒充浏览器、IndexedDB、世界模拟或AI的实际运行测试。软件测试状态全部由后续实施填入ACCEPTANCE，除明确报告外均为not_run。

## 13. 内容数据到运行时对象的映射补充

agreementTemplates 是静态模板，出征报酬中的ruleRef在建立draft时解析并写入条款快照。内容kind departureFee/futureDrop/remainder分别映射运行时upfront_fee/first_matching_loot/remaining_loot，不把人类解释字符串当执行代码。未来掉落选择先按掉落事件sequence，再按同事件物品单元序号；多出的草属于余物。

只读投影有明确缺省：无绑定agreement为none，未组队视作仅PLAYER的单人队；accepted且三名成员均符合准备条件时，未出征的phase投影为ready，不要求先凭空生成active探索。其余缺失或类型错误条件一律不满足。

首次STORY_LIN_WAN_01结算后将作用域标为finalized，保留原agreementId、expeditionId和结算日。后续普通探索用新的scopeId，不能覆盖首条故事的重逢事实。重新邀请与补偿由人物页常规命令提供，使用共用关系和明确新条款；不靠重新播放14节点重开同一次故事。

当前会话不允许从任意choiceId提交Talk等剧情动作：UI写命令附source=sessionId/storyletId/choiceId，Worker检查该选项确实来自当前会话并仍有效。常规行动来自固定注册表，不能伪造故事奖励来源。

图文内容初始facts中firstMeetingRecorded/manualClaimed/goalKnown/reunionRecorded为false；manualClaimed投影直接读取玩家starter-manual知识与领取状态。未结算result为缺失，daysSinceSettlement为不可比较。领取知识与主故事claim信息在同一事务更新，不能因为历史字段名带lin而捏造见过林晚。

待分配物品可以随队按既定回程返回坊市，保持LootPool锁定；不能在回程出售、使用、转移或私藏。禁止的是未结算就解散/开始新探索，不是禁止旅行回分配地点。

## 14. 最小生成器与NPC决策的实施顺序

静态注册表见content/registries.json。生成顺序固定为配置中的区域/地点/势力 → 林晚/周安固定模板 → NPC_0001开始的其余38人 → 初始关系。固定人物ID不消耗普通人物的ID序号；总数包含两位固定人物。普通NPC的性别、姓名、年龄、资质、性格、境界、位置按上述顺序从worldgen流取值；列表按注册表序列索引，境界按initialRealmWeights的显式realmOrder加权。年龄以startDay-ageYears*daysPerYear转出生游戏日，允许负的出生日期。

普通修士以配置概率加入占位青云门，否则独立；凡人全部独立。初始位置在safeLocationIds均匀选取；修为从0到本层阈值以下均匀产生，HP取当前境界上限。凡人未学功法，修士已学习；固定人物用story配置覆盖。每人最多连接同地点按ID排序的前两位为有向相识关系，初始数值取relationships.initial。没有候选时允许零关系，不为凑数虚构跨地点相识。

每天NPC先处理生死/占用，再完成必要目标：没功法去客栈领取；修为达小层阈值由同一服务自动晋升；到大阶段阈值时按其准备目标、资源和条件决定开始突破。玩家和NPC均在完整修炼日结束时自动小层晋升，当前层溢出丢弃，新层修为归零；MORTAL与QI_3只到阈值，不自动大阶段成功。

其余可用行动按npcActionWeights加性格修正后，过滤不合法行动，再使用simulation流加权选一个；当天最多一次普通行动。资金不足时Work，HP不足时可Rest；移动一次即占当日行动预算，0日同聚落移动也不在一天无限循环。不得让NPC普通移动进入需遭遇的遗迹；后台冲突通过显式测试夹具启用。具体选择理由进入开发诊断，不暴露所有NPC秘密给玩家。

林晚的准备计划是记录获得药草事实，再通过兑换/购买取得丹药，当前持有丹药才尝试；药草消耗后不要求仍同时持有草。固定NPC日常以坊市为据点，每配置周期日优先安排在该日结束前回坊市；已有同行/护法占用优先，不瞬移打断。该日程属于NPC决策，仍通过正常Travel和世界日结算。

## 15. 可携带存档与记忆的完整性

SaveEnvelope是数据库中的世界快照，不等于导出文件。PortableSave还必须包含属于同一saveId/revision的外置events、memories、journals和commandRecords。导出从一致只读事务读取这些数据；导入先在临时区校验事件/记忆/当前会话/去重记录引用，再原子切换，不能只恢复人物数值。

数据库新增memories和journals两表；WorldState中角色与story scope保留索引，历史文本、记忆知情来源与事件ID在导出中保持。活动长行动所有检查点去重信息、当前交互及待结算战斗不能丢失。已归档且不会再次执行的旧命令可在明确保留策略下压缩，但不能为了导入大小静默删关键历史。

导出超过limits.maxImportBytes时必须显示体积并明确不能被当前默认导入配置接收，提供保留完整备份与调整受控上限的处理；不能声称已经完成可迁移备份。测试应覆盖自导出文件能按同一配置导入，必要时在M3按实测增长调高预算，不能删除事实掩盖超限。

## 16. 日额度、闲置队伍与终局恢复补充

完成非零旅行、护法、突破或其他长行动的角色，在完成当日仍记录lastConsumedActionDay，即使占用已释放，也不得再获得一次普通修炼/劳务收益。玩家零日坊市-客栈切换不消费新游戏日；NPC日常选择移动仍占其当日一次普通行动预算，防止零时动作循环。

accepted只表示条款同意，不占用NPC日程。FormParty后闲置队员保持共同位置，可以同地点修炼、休息或劳务；实际Travel/StartExpedition/护法等才占用相应天数。独自离队须有显式事件并重验剩余队伍资格，不能后台无提示移动。

非致命故事胜利时，存活倒地队员恢复max(1,floor(maxHp*nonlethalVictoryDownedHpRestoreBp/10000))，与战斗胜利、掉落和释放战斗占用同一终局事务提交。不能把HP=0的存活主角留在胜利后无法旅行的状态；致命遭遇仍按单独死亡规则处理，不自动复活真实死亡角色。


## 17. 内容协作补充

剧情大纲、可执行故事、图片资源和运行存档的边界，以及作者包协议与新增 CP-01—CP-03 任务，见 `CONTENT_PACKS.md`。当前契约和 JSON 仍为官方原型样例；新增包清单、通用故事能力及存档包锁定信息须在对应 CP 任务中实现并更新版本，不能把文档补充视作加载器已经可用。旧的 `lin.*` 专用投影保留兼容映射，逐步由通用能力承载，不允许为解耦而放宽领域校验。
