# V0.1 本地候选版验收记录

日期：2026-09-07。范围：M0—M10 共34项与 CP-01—03 当前 Web 原型；本地可执行实现与验证已完成。**64 条 AC 本地通过，5 条外部／发布关口 blocked；并非正式发布验收全部通过。**未部署，未联系外部人员，未调用真实 AI 供应方。

## 构建与环境

- 开发分支 `codex/complete-v01`，起点 `49ca87f`；实现提交 `7e50281`；最终源码以随本报告的 Git 提交及 `clean-checkout.json` 为准。
- macOS 26.5.1（25F80），Node 26.3.0，npm 11.16.0；Chrome 152.0.7977.77，Playwright Firefox 153.0（v1538），Playwright 1.62.1。
- format `xiantu-web-1`、schema 4、rules 0.1.2；官方 API 1 `official.qingshi@0.1.1`，精确锁见 HANDOFF；扩展 API 2，`guest.roadside@1.0.0`。
- 生产核心指纹 `d6f57fc358106ef4bcaa`，22项资源。最终本地源代码复现记录包含干净检出、npm ci、verify 和真实浏览器存储检查。
- 本地使用完整 URL 的刷新曾被 Vinext 0.0.50 误当路由返回404；已在 `scripts/start-local.mjs` 规范化同源 request target，单测及 Firefox 原故障用例重跑通过。

## 实际执行

| 验证 | 结果与入口 |
| --- | --- |
| verify | 71项自动测试通过：3边界/HTTP、7内容、5扩展、6AI、15Worker、5回调、30规则；strict和五阶段生产构建成功 |
| Chrome | 完整26项通过；最终检查点ID补强和官方预览演示后的相关回归见 browser-final.json；无产品失败保留 |
| Firefox | 原23项全部通过；追加2项第4检查点恢复通过；最终离线安全更新及预览检查见 browser-final.json |
| 五 Seed | 5项全部通过，855.28秒，每局100NPC/3650日；schema4最终报告见 final-stress.json |
| 跨浏览器 | 7份真实下载/上传全部通过；仅剔除导入新身份saveId与revision，其余数据完整对比 |
| 界面 | 1440×900与390×844截图已目视；320px＋200%字故障测试、对话框键盘Tab/Esc通过 |

命令为 `npm run verify`、`XIANTU_STRESS_OUTPUT=/tmp/xiantu-final-stress npm run test:stress`、`PLAYWRIGHT_CHANNEL=chrome XIANTU_TEST_URL=http://127.0.0.1:3100 XIANTU_STRESS_OUTPUT=/tmp/xiantu-final-stress npm run test:browser:existing`，Firefox使用 `PLAYWRIGHT_BROWSER=firefox`。跨浏览器为 `PLAYWRIGHT_CHANNEL=chrome npm run test:portability`。成功运行退出码均为0；Firefox曾有60/90秒测试异常累计到16.6/12.3/8.9分钟的计时中断，保留失败记录，未放宽超时、未改运行代码重跑3项在33.9秒全部通过；中间失败的测试定位／夹具和HTTP路由问题有修复后重跑，不计作最终通过。

### 测量

100 NPC十年档 compact 7,482,006—7,693,939 bytes，格式化导出 11,073,297—11,393,666 bytes，导入上限16 MiB。Chrome最终一轮导入1078ms，30日闭关13182ms，50ms主线程采样最大间隔78.3ms；Firefox最终重跑导入1105ms，30日20290ms，最大间隔98ms。是本机前台实测，不能推算手机或其他设备。十年5局均100存活/0死亡，教学配置默认关闭后台致命冲突；死亡另用明确开启的规则夹具验证，未移除死者以凑人数。

### 证据与比较边界

`tests/game/worker.test.mjs` 使用 fake-indexeddb；`tests/browser/faults.spec.ts` 才是真浏览器IndexedDB。配额为同步QuotaExceededError注入，并非填满磁盘；终止的是模拟Worker，并非杀死操作系统。主线是正常UI操作，测试直接读IDB仅用于观察。

`tests/game/semantic.ts` 对象键递归排序，数组保持语义顺序。分段行动比较仅排除顶层saveId、revision、commandReceipts、appliedCommands、notice，以及train/wait完成摘要及其知情条目；实际人物、资源、关键事实、关系、承诺、RNG、当前行动保留，关键事实引用按内容摘要规范化。这样1×30日和30×1日的不同结束提示不误报玩法差异。原子恢复及五Seed的40→100日比较不使用此排除，直接比较完整存档及命令记录。跨浏览器只排除被导入入口重新分配的saveId/revision。

兼容选择：保留发布版FNV派生字符串 `seed:stream:1` 和确定性worldgen/creation生成方式；不以新规格派生字符串重抽旧世界。simulation/combat保存实际xorshift状态；创建由seed＋roll恢复，无叙事随机抽取（固定priority/ID排序），因此没有伪造未使用流的drawCount。RNG与生成行为被rules版本和内容锁共同固定，不能只凭Seed跨版本比较。UI检查点ID现在固定为saveId:longActionId:step:n。

官方API1 manifest保留旧ID和摘要，由兼容层接入；API2新包使用严格必需元数据。一个包ID当前只登记一个版本，旧局用匹配旧构建继续；无热安装、任意脚本或自动剧情包升级。M0演示入口整合到/author而非保留另一套临时引擎；明确“演示数据”的两分支夹具不能替代正常主线证据。

## 逐条验收

类型和原始Given/When/Then仍在 `docs/spec/docs/ACCEPTANCE.md`，此表记录本轮结果；不删除原验收要求。

| AC | 状态 | 内容 | 实际证据或剩余条件 |
| --- | --- | --- | --- |
| AC-001 | passed | 安装与构建 | verify、clean-checkout；构建和真实创建／刷新，见 clean-checkout.json |
| AC-002 | passed | 分层与日志 | 3 边界／HTTP 测试，含非法依赖与日志秘密负例 |
| AC-003 | passed | 图文视口 | 桌面 1440×900、手机 390×844 截图目视；键盘 Tab／Esc、320px 与 200% 字号 |
| AC-004 | passed | 隔离演示 | /author 的演示数据、两份重逢夹具与图片故障；正式库前后不变 |
| AC-005 | passed | Worker 协议 | 15 项 Worker 集成中的非法消息、排队、重放；浏览器重开 |
| AC-006 | passed | 完整保存再确认 | Worker transaction complete 后 ack；失败／中止保留完整旧状态 |
| AC-007 | passed | 随机恢复 | xorshift 五项固定向量、序列保存恢复、100 次角色重掷隔离 |
| AC-008 | passed | 稳定比较 | 对象插入顺序扰动、canonicalJson／simulationFingerprint；比较范围见下文 |
| AC-009 | passed | 原子事务 | 真实 IndexedDB abort、同步 quota 故障、提交前终止、丢 ack；整笔保存比较 |
| AC-010 | passed | 重复与并发 | 命令同 ID 异载荷拒绝、过期 revision、双击、跨标签换角色冲突 |
| AC-011 | passed | JSON 导入 | 文件控件真实往返，坏 JSON／未知版本／错引用拒绝；16 MiB 上限 |
| AC-012 | passed | 存储故障与迁移 | 真实 versionchange、旧格式迁移／原备份、坏档导出恢复；配额为注入 |
| AC-013 | blocked | 独立启动评审 | blocked：无未参与实现的评审者；已备 README 和干净检出记录 |
| AC-014 | passed | 角色资料 | 严格 profile schema；表单保存姓名／性别／外貌／模式／三选一 |
| AC-015 | passed | 重掷隔离 | 100 次合法资质，固定世界 NPC 不变；草稿刷新字段一致 |
| AC-016 | passed | 草稿往返 | 单独草稿导入／导出／刷新，尚未建局，Worker 串行 revision 保存 |
| AC-017 | passed | 40 NPC 建局 | 默认 40 人完整字段与真实玩家；validateWorld 每命令执行 |
| AC-018 | passed | 初始引用 | 多 Seed 的 ID、位置、人物、关系范围检查；无自动师徒 |
| AC-019 | passed | 固定 Seed | Seed 12345 重建与重掷隔离；五 Seed 实际不同指纹 |
| AC-020 | passed | 原子建局 | 生产 Worker create 事务与草稿保存；浏览器创建、重开、文件往返 |
| AC-021 | passed | 日调度 | 寿元死亡先于任何 NPC 行动，稳定 NPC 次序；旅行／护法／队伍资格 |
| AC-022 | passed | 分段一致 | 30×1日与1×30日关键语义指纹一致；五 Seed 的40日恢复到100日全档一致 |
| AC-023 | passed | 共同修炼 | 同输入玩家／NPC 普通失败、严重失败与成功逐字段对比 |
| AC-024 | passed | 非致命失败 | 定向三分支与 40 Seed 筑基失败，修为下限／境界／存活校验 |
| AC-025 | passed | NPC 生命周期 | 死亡停行动、同行／护法占用；显式开启后台冲突的致死夹具 |
| AC-026 | passed | 五 Seed 十年 | final-stress.json：5×100 NPC×3650日，0 失败，20,860 条命令 |
| AC-027 | passed | 检查点恢复 | 第4检查点 put前终止／commit后丢ack；保留3或4日，续完7日仅付7灵石；ID固定 |
| AC-028 | passed | 性能与暂停 | 100人十年档导入后30日闭关，可暂停和翻人物；计时与体积见下表 |
| AC-029 | passed | 有向关系 | 方向、范围、怨恨与多次真实经历门槛；不自动建立亲密标签 |
| AC-030 | passed | 关系幂等 | 履约／违约重复拒绝、补偿保留原事实；历史不改后续邀请资格 |
| AC-031 | passed | 知情来源 | 当事人／目击／告知／公开／旧档来源；AI仅双方共同知情事实 |
| AC-032 | passed | 历史与死者 | 死亡引用校验、旧档／当前档往返，人物身份保持；死者停止活动 |
| AC-033 | passed | 承诺状态 | accepted／active／fulfilled／breached／cancelled／not_triggered／impossible 分支 |
| AC-034 | passed | 转移守恒 | 待分配战利品只可清算一次；无草不构成违约，客观无法履行例外结算 |
| AC-035 | passed | 内容验证 | 官方7项、扩展5项；命名空间、引用、未知能力、依赖哈希、类型、退出选项 |
| AC-036 | passed | 事件选择 | 固定优先级／ID排序、已消费节点不重开、无叙事随机；过期资格再次验证 |
| AC-037 | passed | 已提交图文 | Worker ack后更新状态；正常主线和支线的物品／在场／文字对应 |
| AC-038 | passed | 旧选项与历史 | 重复选择、人物离场规则拒绝；浏览器连点／刷新／历史只读 |
| AC-039 | passed | 图片失败 | 320px阻断图片仍可行动；作者两分支重开不改RNG；占位有说明 |
| AC-040 | passed | 基础恢复路径 | 死亡主NPC仍可客栈领书；终身一次、免费训练／劳务、买药原子收支 |
| AC-041 | passed | 内容可达 | 官方8个节点＋独立7节点；两主线浏览器全程，支线有钱／贫穷／缺席／死亡 |
| AC-042 | passed | 队伍与顺序 | 最多三人，资格检查、技能冷却；NPC失能不能继续动作 |
| AC-043 | passed | 战斗行动 | 手动普攻／剑诀／防御、自动策略；丹药／撤退与非法目标规则入口 |
| AC-044 | passed | 回合恢复 | 主线实际打一完整回合后刷新，battle／RNG保留；通用提交故障覆盖同事务 |
| AC-045 | passed | 自动与手动 | 同一 battle 命令结算；自动策略只选动作，动画不写入；两主线分别手动／自动 |
| AC-046 | passed | 战斗终态 | 胜利／撤退／战败／致命冲突，一次性掉落与时间；重复命令去重 |
| AC-047 | passed | 分配与模式 | 履约／独占确认、复杂真实死亡结束、简单救援、教学战败不致死 |
| AC-048 | passed | 准备概率 | UI使用规则概率，同资格在命令开始再校验；护法／丹药／资源预约 |
| AC-049 | passed | 长行动生命周期 | 暂停／刷新续跑、普通提前结束、突破拒绝中断；固定检查点ID与已付资源 |
| AC-050 | passed | 凡人至筑基 | 正常UI两分支均达筑基；守诺分支真实失败后合法训练与再次突破 |
| AC-051 | passed | 出关知情 | knownEvents／knownNpcUpdates过滤；摘要与人物事实对应，不泄露未知秘密 |
| AC-052 | passed | 官方故事闭环 | story.spec：相识→目标→约定→三人探索→分配→闭关→重逢 |
| AC-053 | passed | 跨浏览器节点 | 7份Chrome下载→Firefox导入、刷新、再次下载，全字段仅saveId/revision变化 |
| AC-054 | passed | 两分支后果 | 履约可继续邀约；违约需补偿／更严条件，原违约记忆保留 |
| AC-055 | passed | 异常出口 | 无草、离队、护法突破占用、伤势／死亡的等待／取消／例外结算 |
| AC-056 | blocked | 独立故事评审 | blocked：缺未参与实现的评审者；试玩包、正常检查点与截图已备 |
| AC-057 | passed | AI配置与秘密 | 6项服务测试＋浏览器 mock；仅服务端配置，限大小／模型／次数／时长 |
| AC-058 | passed | AI故障回退 | 无配置、超时、429、无效JSON、取消、离线：不改世界，固定选项可玩 |
| AC-059 | passed | AI白名单 | 越权字段／错误ID／非在场／死者／不足资源／满队／过期全部拒绝 |
| AC-060 | passed | 条款澄清确认 | 含糊平分不产生承诺，标准条款完整后显式确认；HTML按文字显示 |
| AC-061 | passed | AI生命周期 | saveId/sessionId/revision绑定、取消与迟到作废、同提案只采用一次 |
| AC-062 | passed | AI等义与历史 | 固定按钮和合法提案后果一致；条款／正文保存，重开不再次调用；真实供应方另列not_run |
| AC-063 | passed | 生产离线 | 真实浏览器断网关页重开、行动与刷新保存，22项核心缓存核对，离线AI不可用 |
| AC-064 | passed | 版本安全更新 | 实际HTTP代理切换SW版本；失败下载保留旧缓存、其他页阻止、长行动禁用、安全点更新 |
| AC-065 | passed | 完整主流程 | Chrome／Firefox正常UI两分支达筑基；真实失败与再次尝试，无控制台改档 |
| AC-066 | blocked | 全部目标设备 | blocked：Mac Chrome与Firefox通过及跨浏览器导入；Windows和真实iPhone缺设备 |
| AC-067 | blocked | 发布候选关口 | blocked：本地规则／浏览器／压力回归通过，发布关口仍依赖AC-066真实设备 |
| AC-068 | blocked | 3—5人试玩 | blocked：无外部参与者，未发邀请；质性提纲及记录模板已交付 |
| AC-069 | passed | 交付材料 | 源码、运行入口、备份恢复、版本、真实测试数据、截图、来源和限制齐全；未部署 |

## 内容任务

CP-01、CP-02、CP-03 本地验收完成：严格Schema与依赖登记、六种有权限边界的通用能力、隔离作者预览；独立内容作者仅新增guest-roadside六个文件，主流程验证支线正常/贫穷/缺席/死亡/重复/未知锁/缺图。两个新插图槽位仍明确planned占位。

## 发布前仍需完成

AC-013/056独立评审、AC-066真实Windows与iPhone、AC-068的3—5名试玩者；AC-067发布关口随这些条件保持blocked。真实AI烟测单独not_run，步骤见AI-SMOKE.md。没有把这些项转换为通过，也没有未经授权发送邀请。当前没有本地已知未修阻断缺陷；未作市场或全设备兼容承诺。

干净检出最终结果：源码 `7e50281fecbffb810f748537f3ef1189b2cd6a95`，全新安装680依赖，verify的71项与Chrome存储9项全部通过；两份独立构建均为 `d6f57fc358106ef4bcaa`，SW SHA-256相同。生产客户端扫描未包含测试秘密标记。详见 `clean-checkout.json`。
