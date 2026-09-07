# 领域命令目录 V0.1.1

这里定义 payload 的必填字段、可选字段和实际含义。未列字段一律拒绝；枚举和ID必须存在。该目录与 `contracts/game.ts` 联合构成实现契约，M0编写具体运行时schema，不能把 `Record<string, unknown>` 当成免校验接口。

所有来自用户界面的actorId若存在必须为PLAYER。NPC决策由内部调度器调用同一规则服务，不通过伪造用户命令改变控制对象。payload不得自行指定success、关系分数、资源收益、世界day或新revision。

## 1. 创建与常规操作

| type | args | 条件及后果 |
| --- | --- | --- |
| FinalizeCreateRun | draftId:string | 草稿已完整、Seed合法、法宝三选一；M2生成全世界后一次保存。重复ID返回同一局，不再抽世界 |
| ClaimStarterManual | sourceLocationId:LOC_INN | 玩家在客栈、存活；领取并学习ITEM_MANUAL，登记角色级starter-manual claimKey。与Talk赠功法共用，0天 |
| Work | actorId:PLAYER, durationDays:1 | 存活且无冲突占用，在允许地点；完成规定天数后给配置收益。开始／完成分开事件，不预付劳动收益 |
| Rest | actorId:PLAYER, durationDays:1 | 安全允许地点，无冲突占用；按配置恢复HP和伤势并推进天数 |
| Wait | actorId:PLAYER, durationDays:1或3或7 | 允许等待的安全地点，无冲突占用；仅推进世界，不凭等待刷关系 |
| BuyItem | itemId:string, quantity:正整数 | 玩家在坊市商店；白名单物品、余额充足；原子扣灵石并入物，价格只读配置，0天 |
| ExchangePill | quantity:正整数 | 玩家在坊市；每份草与灵石充足；原子换取突破丹，0天，不制作通用炼丹系统 |
| Travel | toLocationId:string | 只允许安全边及已resolved探索的返程边；入遗迹方向仅由StartExpedition调用底层旅行。存在合法边且无人被冲突占用；带上当前有效同行队伍，耗时读配置；无隐式跨节点瞬移 |

零天Travel也提交一次位置与事件，但不做NPC日结算。批量数量上限使用 `limits.maxTradeQuantity`，库存和货币不允许越界；同一数量按整数计算，拒绝NaN、小数、负数与溢出。

CreationDraft不是已开始的世界存档，独立保存在drafts记录中。重掷更新草稿及creation随机流，不生成NPC。FinalizeCreateRun成功后才允许“继续本局”。

## 2. 图文与对话

| type | args | 条件及后果 |
| --- | --- | --- |
| Talk | targetId:string, topicId:白名单, claimId?:string | 当前有效会话和在场存活对象；处理明确话题与一次事实，0天 |
| AdvanceDialogue | topicId:白名单 | ACKNOWLEDGE_FULFILLED／ACKNOWLEDGE_BREACHED／ACKNOWLEDGE_EXCEPTION_SETTLEMENT，只确认已发生结果并推进会话，0天 |
| LeaveInteraction | destinationView?:active-expedition | 关闭当前会话；指定视图仅在已有有效探索时打开其控制器，不创建探索、不退还资源 |
| OpenProfile | entityId?:string, tab?:shared-experiences, view?:agreement, storyScopeId?:string | UI查询动作；entityId分支或agreement+scope分支二选一，不发领域写命令 |

Talk话题白名单：LIN_FIRST_MEETING、CLAIM_BEGINNER_MANUAL、LIN_COMMON_GOAL、LIN_REUNION_FULFILLED、LIN_REUNION_BREACHED。CLAIM_BEGINNER_MANUAL的claimId必须为starter-manual。重逢话题只登记一次已见面事实，不因重复交谈再次应用履约／违约数值。

首次相识、共同胜利、履约和违约以对应事件ID去重。角色级领取记录比剧情节点是否出现更强：无论通过林晚还是客栈保底领过，另一入口均不再发物品；界面可显示已经学会。

## 3. 修炼与长行动

| type | args | 条件及后果 |
| --- | --- | --- |
| StartTraining | actorId:PLAYER, methodId:METHOD_BASIC或METHOD_SPIRIT_STONE, durationDays:配置允许值 | 已习得功法且处可修炼地点、无冲突占用；按日规则计算收益。需要灵石的方法先检查总预算，逐日扣除已结算部分 |
| StartBreakthrough | actorId:PLAYER, targetRealmId:QI_1或FOUNDATION_1, usePill:boolean, guardianId:string或null | 目标是当前有效下一大阶段、修为足够、准备合法；原子扣开始费用和占用护法，保存概率快照与结束时点 |
| StopLongAction | actionId:string | 本局拥有的可中断修炼/劳务/等待；在完整检查点后结束，已经结算费用和天数不回退。不可中断突破返回条件错误 |
| RunCheckpoint | actionId:string, stepIndex:正整数 | 仅Worker内部；stepIndex必须是上次已提交+1，完整一日结算并提交所有后果 |

PauseComputation／ResumeComputation是Worker控制消息，不是改变角色状态的领域行动。暂停期间角色仍占用，不能同时Work、Travel或另开修炼。普通修炼的未花预算不是实际扣费，不因中止吞掉未来费用。

护法需在同地点、存活、满足配置境界与关系条件且无占用。突破开始快照计算概率，之后按既定规则占用至结束，成功或失败都释放占用。突破失败不生成死亡事件。

## 4. 约定与三人探索

| type | args | 条件及后果 |
| --- | --- | --- |
| ProposeAgreement | storyScopeId:string, templateId:string, participantIds:string[] | 使用本包合法模板；校验目标与人物，创建draft，不扣报酬、不组队 |
| ProposeAgreement（AI入口） | storyScopeId:string, proposalId:string | 从已通过结构检查的候选缓存读取完整条款；与模板分支互斥。未解决条件仍只保留协商状态 |
| AcceptAgreement | storyScopeId:string | 玩家确认当前draft的具体条款版本；NPC规则同意后登记各方接受，变accepted。NPC不同意时保留draft并返回可解释反应 |
| FormParty | storyScopeId:string, memberIds:string[] | 约定已接受，三人均在场存活、自由且符合目标；形成队伍并记录关系，不扣报酬 |
| StartExpedition | storyScopeId:string, destinationId:LOC_RUINS | 队伍在LOC_GATE、成员资格、余额、约定齐全；只在本探索启动时扣付两笔报酬并生成entry长行动 |
| AllocateLoot | storyScopeId:string, policy:下列枚举 | 必须探索已resolved、物品待结算、满足回城分配条件；一次完成物品归属、约定结果、关系和历史 |
| CompensateAgreement | agreementId:string | 历史已违约、当事人可交涉、尚未补偿、有规定补偿物；补偿事件与关系只发生一次，不删除曾经违约事实 |
| DisbandParty | partyId:string | 无正在进行的战斗／旅途／未解决战利品；解除队伍占用，已结算的关系和历史保留 |

AllocateLoot政策：HONOR_AGREEMENT按条款分配；TAKE_ALL_DECLARE_BREACH要求明确确认，允许据为己有并承担违约后果；RESOLVE_CONDITION_OR_IMPOSSIBILITY处理无草、当事人死亡等例外。policy只表达意图，规则检查实际掉落与资格，不接受客户端伪造库存或声明NPC死亡。

accepted的条款修改必须产生新draft版本，旧接受记录失效。active中的已接受条款不能由一方悄悄重写。报酬是出征费用，生成feePaymentEventId后不因重试、读档或结算再次扣付。

## 5. 战斗

| type | args | 条件及后果 |
| --- | --- | --- |
| BattleAction | battleId:string, action:attack或skill或guard或pill或retreat, targetId?:string, skillSlot?:0..3 | 当前轮到玩家；按action严格检查必要字段，目标、技能冷却、丹药与撤退条件；每活角色每轮一次行动 |
| SetAutoBattle | battleId:string, enabled:boolean | 在可切换的回合边界设置玩家自动策略，不额外推进轮次或消耗随机 |

attack/skill需要合法目标，skill还需已解锁槽位；guard/retreat不接受伤害目标；pill目标限有效己方对象并扣配置丹药。NPC使用同一CombatService自动选动作，不调用LLM。

确定性顺序按速度降序、相同速度actorId升序，每轮开始快照排序。HP归零先标倒地，不自动等同死亡；遭遇结果按模式和明确的致命标志处理。原型故事遭遇非致命，但仍用专项测试覆盖复杂模式真死亡结束。

## 6. 验证位置

客户端可预检查以改善体验；Worker每次完整校验。内容schema校验引用，运行时schema校验参数，不变量校验结果；三者不能互相代替。所有允许类型、话题、ID、配置路径应从单一注册表导出给内容校验器与命令校验器，避免分散维护字符串。
