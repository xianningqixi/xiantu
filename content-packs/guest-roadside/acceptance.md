# 独立作者验证记录与复现步骤

作者：独立内容代理 `second_content_author`。日期：2026-09-07。

范围严格限定为本目录的 6 个文件：`manifest.json`、`definitions.json`、`storylets.json`、`visuals.json`、`outline.md`、`acceptance.md`。本作者没有修改引擎、UI、官方包、注册生成文件或部署配置。

## 已实际执行

| 检查 | 结果 | 证据与边界 |
| --- | --- | --- |
| JSON 读取和严格协议验证 | PASS | 通过当前 `validateExtension`：7 个节点、4 个局部标记、4 项能力、1 个既有角色引用，所有节点均有无效果退出 |
| 官方依赖版本和摘要 | PASS | 通过当前 `validateRegistry`，精确依赖 `official.qingshi@0.1.1`，摘要 `c7402c381fe903eaa99784deae2066993da76500f5ea9422e61ae40779670cd9`，取自本次实际读取的官方完整性文件 |
| 作者侧条件与优先级演算 | PASS | 用本包 JSON 在内存中检查 13 种条件组合：首见、首见缺席、0/7/8 灵石、已准备、两条回访、等待、准备前后死亡、收束以及退出备药后的兜底；这不是生产引擎测试 |
| 新增角色和资产引用检查 | PASS | `definitions.characters=[]`；只引用 `NPC_ZHOU_AN`；复用两个实际存在的官方场景 ID，另有一个明确 `planned` 的本包插图 ID |

上述检查不等于运行成功。尚未由本作者执行：正式规则命令、Worker 与 IndexedDB 保存、作者预览器、真实浏览器、手机、图片阻断与版本不匹配恢复。主代理接入后的实际结果应另行补充，不能把下表预期写成已通过。

## 正常游戏与预览验收矩阵

所有测试世界必须是独立的作者预览世界，或明确创建的新测试局。不得将 fixture 写入玩家正在使用的正式存档。改变测试初值只用于建立测试世界；点击后仍走正式规则与 Worker 入口。

| 场景 | 复现步骤 | 必须观察的实际结果 | 本作者运行状态 |
| --- | --- | --- | --- |
| 正常备药支线 | 新局启用本包；周安在古道且存活时接受相识；移到坊市，有至少 8 灵石；选买药；回古道当面送达 | 只扣 8 灵石、玩家回春丹只加 1；相识与回访形成真实双方经历；回访不转移丹药，不添加奖励或直接改关系数值；正文进历史 | not_run |
| 无资源完整路径 | 独立世界令玩家剩 0 灵石；完成相识后到坊市，选“记下灯火”；回古道送达 | 仍可完整收束；灵石、物品均无变化；不存在免费购药或被迫做杂务的门槛 | not_run |
| 保留资源路径 | 玩家有至少 8 灵石；在高优先级备药节点选择“留着灵石” | 无扣款无物品；`ready=true`；低优先级坊市节点不再出现，进入只带口信回访 | not_run |
| 退出备药后兜底 | 在备药节点选无效果“先离开药摊” | 当前备药节点一次消费并留历史；没有扣款；未准备的玩家仍能进入低优先级纯口信节点 | not_run |
| 首见拒绝 | 在相识节点选“拱手别过” | 相识节点消费，`started` 不置真；不打开后续支线，没有物资约定或强制相识奖励 | not_run |
| 周安缺席 | 准备完口信；正常世界中周安仍活着但不在古道；玩家到古道 | 显示一次缺席文字；无在场交谈、无口信送达、无召回或传送；以后真正同地时能回访 | not_run |
| 相识前已死亡 | 独立预览世界中周安已死亡且从未接受支线 | 不出现活人相识或回访，不为本包创建替代周安 | not_run |
| 接受后死亡 | 相识后、备药前或后建立周安死亡的独立预览世界 | 死亡解释优先；没有活人参与节点；收束不扣款、不退药、不复活、不加“已送达”共同经历或违约事实 | not_run |
| 买药后已使用 | 正常购买后在规则允许的场景使用该药，再回访 | 仍按“曾买过药”的历史走备药回访；不要求仍持有药，不再次扣取或补发 | not_run |
| 重复操作 | 在购买、相识、回访时重发同一有效请求；随后尝试同节点的新请求，再回看历史 | Worker 去重与节点一次消费阻止重复扣款、发药和共同经历；历史按钮不可再次执行；拒绝不改变世界 | not_run |
| 保存和恢复 | 在相识后、购买后、缺席后、收束后分别关闭重开并导出检查 | 局部进度、消费记录、参与者、已确认正文、购买记录与包锁保持一致；重开不补发或重演 | not_run |
| 缺图 | 到两个 `return-*` 节点；保留 `planned` 映射或阻断场景请求 | 显示明确插图占位与替代描述；玩家与周安身份仍明确，正文和选项可用；加载/失败不推进世界 | not_run |
| 新局包锁 | 新建启用支线的世界，导出包集合 | 包 ID、版本、实际内容哈希与官方精确依赖被锁定；固定 Seed + 同包集合可复现 | not_run |
| 官方旧局 | 加载没有启用本包的旧官方局 | 不自动安装本包、不重写旧锁、不追加支线角色或事件；原有世界仍可继续 | not_run |
| 版本不匹配 | 复制导出数据到隔离测试世界，把本包版本/摘要改为未安装值后尝试导入 | 明确拒绝缺失版本，原存档和可导出的原数据保留；不降级、替换或静默重开 | not_run |
| 完成后反复进入 | 通过实际效果把 `closed` 置真，再次进出坊市/古道与重开 | 本包无后续活动节点；既有历史完整；不会再次出现低资源、回访或死亡节点 | not_run |

## 一次消费与退出语义

引擎规定同包每次仅开放符合条件的最高优先级节点；同优先级按节点 ID 稳定排序。每个节点成功选择后自动消费一次，自动保存选择正文。这个约束由主工程验证，本包不私自实现另一套去重。

所有 `effects: []` 都是无代价退出当前节点，但仍会消费并保存该选择。它们不设置故事标记、不花钱、不授药，也不制造共同经历。备药退出后可进入纯口信兜底；回访退出后不会重新开放同一回访。未显式置 `closed` 的路径，今后可能再出现一次缺席或死亡说明，不能把普通退出表述为删除整个支线和全部历史。

购买与纯口信准备共享 `ready`，这是阻止两个准备节点都执行的内容条件；仍需以生产规则实际验证同请求去重和跨请求拒绝，不能仅凭这条条件宣称事务正确。

## 协议重验命令

从仓库根目录执行以下只读命令。此命令仅检查内容与依赖，不生成注册表或修改源文件。

```bash
node --input-type=module <<'JS'
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { validateExtension, validateRegistry } from './lib/game/content/extension-contract.mjs';
const root = 'content-packs/guest-roadside/';
const read = name => JSON.parse(readFileSync(root + name + '.json', 'utf8'));
const official = JSON.parse(readFileSync('content-packs/official-qingshi/manifest.json', 'utf8'));
const integrity = JSON.parse(readFileSync('content-packs/official-qingshi/integrity.json', 'utf8'));
const art = JSON.parse(readFileSync('content-packs/official-qingshi/art/manifest.json', 'utf8'));
const data = validateExtension({ manifest: read('manifest'), definitions: read('definitions'),
  storylets: read('storylets'), visuals: read('visuals') },
  { roles: official.roles, assets: Object.keys(art.assets) });
validateRegistry([{ data, hash: createHash('sha256').update(JSON.stringify(data)).digest('hex') }],
  { version: official.version, hash: integrity.contentHash });
console.log('内容严格校验与精确依赖校验 PASS');
JS
```

命令中的本包内存摘要只用于本次注册校验调用，不是发布锁。最终本包内容锁应以主工程的正式准备脚本生成结果为准。本作者没有运行准备脚本或写入生成文件。
