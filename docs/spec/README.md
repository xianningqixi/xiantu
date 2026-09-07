# 修仙 Web 图文游戏：可执行规格包 V0.1.1

这是可以交给 Codex 开工的设计、契约、样例和任务包。它包含原型默认与静态一致性校验，尚未包含已实现的游戏页面、正式图片或通过运行验收的世界模拟。

## 从哪里开始

1. 阅读本页和 docs/GDD.md，了解已确认约束及本轮可直接实施的原型默认。
2. 按 docs/TASKS.md 选择可执行Task；对照 docs/ACCEPTANCE.md 的编号验收。
3. 将 START_WITH_CODEX.md 的正文交给目标项目中的Codex，从 M0-01 开始。
4. 实施时依 docs/TDD.md、docs/COMMANDS.md 和 docs/UX_CONTENT.md 接口协作。
5. 内容与图片协作按 docs/CONTENT_PACKS.md 的补充规范；其 CP-01—CP-03 为新增 planned 任务，包含对 M2、M8、M10 的前置门槛。

| 文件 | 用途 |
| --- | --- |
| docs/GDD.md | 产品目标、玩法闭环、带编号原型默认、成长与经济规则 |
| docs/TDD.md | 世界模型、Worker、时间随机、事务存档、内容选择和AI边界 |
| docs/COMMANDS.md | 逐命令字段、条件、实际后果、UI与领域动作区别 |
| docs/UX_CONTENT.md | 页面状态、14个图文节点、选项与异常分支 |
| docs/CONTENT_PACKS.md | 大纲、剧情、资源与存档边界，作者工作流及3项新增内容包任务 |
| docs/TASKS.md | M0–M10的任务依赖、产物及完成证据 |
| docs/ACCEPTANCE.md | 可定位的软件验收清单，初始均未执行 |
| contracts/game.ts | TypeScript数据与消息契约草案，需在目标工程strict检查 |
| content/prototype-balance.json | 统一原型数值和策略，版本prototype-0.1.1 |
| content/storylets.json | 首条人物故事、完整条款和条件选项 |
| content/assets.json | 所需素材清单，目前为planned资源，含画面替代描述 |
| content/registries.json | 人物、地点、物品和功法的稳定 ID，供内容引用与校验 |
| AGENTS.md | Codex修改边界、验证、报告与协作规范 |
| START_WITH_CODEX.md | 可直接复制的启动任务 |
| tools/verify_pack.py | 不依赖第三方库的静态一致性校验 |
| docs/PACK_CHECK.md | 本次规格包校验结果与验证范围 |

## 已收敛的原型方向

Web每幕文字与配图，预制背景和固定人物图复用；单人本地优先，IndexedDB自动保存与JSON导入导出；行动推进世界日，关页不挂机；回合战斗和最多三人队伍；首条故事从相识、邀约、分配走到履约或违约后的重逢。

突破失败非致命是硬约束。原型把炼气暂压缩为三层，用于尽快走完筑基前流程；并非永久缩减境界体系。概率、时间、报酬、临时法宝和战败代价均集中在配置，试玩后可调整。

获取功法、灵石、丹药和修为有明确保底入口；重点NPC离开或死亡时，角色仍有继续成长的路径。剧情每次执行、领取和费用都有去重范围，不允许通过刷新或重复对白刷奖励。

## 如何检查本包

在解压后的本目录运行：

```bash
python3 tools/verify_pack.py
```

可选使用支持原生TypeScript类型剥离的Node执行 `node --experimental-strip-types contracts/game.ts` 检查可解析性。它不等于 TypeScript strict 类型检查，后者由目标工程的 typecheck 验收。

本包校验器只检查JSON结构、配置范围、内容引用、命令与条件白名单、图文节点链接、Task／AC关联和关键硬约束；它没有运行世界模拟、IndexedDB、真实浏览器或AI。

M8 完成后可开展固定选项版本的内部试玩。本包完整 V0.1 交付仍包含 M9 的 AI 接口、校验和回退；玩家可关闭 AI，开发验收可使用固定 mock，真实供应方调用未执行时必须另行标明。M10 按任务表依赖完成整体交付。

## 版本与证据

版本日期：2026-09-06。原方案中的网页形态、NPC人生与关系记忆继续沿用；本包将此前“待定但阻塞编码”的内容收敛成注明来源的原型默认。仍可后续选择正式背景风格、更多恋爱内容和云同步，当前Task无须等待这些扩展。

调研参考保留在上一版主设计文档；本包引用必要的官方技术说明。实施时软件版本以实际解析并验证后锁定的版本为准，不虚构本次已安装依赖或构建通过。
