# 仙途 · 青石人间：开发交接

交接日期：2026-09-07。产品形态已经确定为 Web 文字与配图交互；早期 Unity 方案属于历史规划，不应据此另起 Unity 工程。

本次整理基于线上第 3 版对应的源代码 `84f8898ec9c5fcc3a166c0e14b46370355873fb8`。迁移补充只涉及开发命令、换行规则和文档，不更改游戏规则、故事内容锁及原站点身份。用户已创建并授权公开的接续开发仓库是 [xianningqixi/xiantu](https://github.com/xianningqixi/xiantu)。远端文件核验结果见迁移检查记录。

## 1. 十分钟开始工作

使用 Node.js 24，项目最低要求 22.13.0。`.nvmrc` 提供已用于本次迁移检查的主版本提示；依赖以 `package-lock.json` 为准，先不要升级框架。

```bash
npm ci
npm run dev:local
```

进入包含 `package.json` 的项目根目录执行。打开命令打印的本地网址，默认端口 3000；需要改端口时使用 `npm run dev:local -- --port 3001`。这些 npm 命令可在 Bash 或 PowerShell 中使用，不依赖 Linux 的 `flock`、`timeout`、`sha256sum`。Mac 和 Windows 真机验证情况以第 7 节为准。

生产构建和本地预览：

```bash
npm run build:local
npm run start:local
```

`dev:local` 和 `build:local` 都自动先准备内容包；构建产物在 `dist/`。本地运行不需要 ChatGPT / GitHub 登录、OpenAI API Key、D1 数据库或 R2 存储。首次依赖安装需要网络；游戏当前没有 AI 请求或云存档。浏览器 Worker 与 IndexedDB 应通过本地 HTTP 服务使用，不能双击 HTML 代替服务启动。

## 2. 阅读顺序与事实来源

| 文件 | 用途 |
| --- | --- |
| `README.md`、根目录 `AGENTS.md` | 当前入口与编码约束 |
| `docs/HANDOFF.md` | 本次交接、环境与未完成项 |
| `docs/MIGRATION-CHECK-2026-09-07.md` | 干净安装、41 项测试、构建和生产服务 HTTP 检查 |
| `docs/QA-2026-09-07.md` | 最新自动复测和浏览器阻塞情况 |
| `docs/QA-2026-09-06.md` | 实际主线试玩、修复及早先验证证据 |
| `docs/IMPLEMENTATION.md` | 实现记录，保留了标明日期的历史描述 |
| `docs/spec/docs/GDD.md`、`TDD.md`、`TASKS.md` | 产品与工程规格基线；计划验收不等于已经完成 |
| `docs/history/` | 原始 Web 调研与更早的 Unity 规划，保留原文用于追溯 |
| `content-packs/official-qingshi/AUTHORING.md` | 外部剧情／美术作者直接接手的说明 |

发生冲突时遵守用户最新确认的 Web 方案，并用实际代码和最新 QA 记录判断当前完成度。不要把历史文档中的“尚无浏览器测试”“仅三张图”等早期状态覆盖到本次状态上。

## 3. 代码与内容的边界

| 目录或文件 | 维护职责 |
| --- | --- |
| `components/game/` | 创角、游历、修行、故人、行囊、历程及设置 UI |
| `lib/game/engine.ts`、`types.ts` | 纯规则、命令、不变量、Seed 和世界演化 |
| `lib/game/simulation.worker.ts`、`save-guard.ts` | Worker 命令队列、IndexedDB、存档身份与原子修订检查 |
| `lib/game/continuation.ts`、`use-game.ts` | UI 消息桥及暂停后的异步响应处理 |
| `lib/game/npc-profile.ts` | NPC 资料和稳定立绘映射 |
| `content-packs/official-qingshi/` | 大纲、剧情、过场、地点、人物初值、资料、素材清单与原图 |
| `scripts/prepare-content.mjs` | 校验引用、计算内容锁、同步资源与导出模板 ZIP |
| `public/art/`、`public/templates/` | 自动同步的图片和作者下载包，修改源文件后重新生成 |
| `tests/game/` | 规则、内容、生产存档 Worker、回调时序测试及合成存档夹具 |
| `components/ui/`、`vendor/` | 保留的 UI 组件和第三方样式、许可证 |
| `build/`、`worker/`、`vite.config.ts` | Vinext / Cloudflare / Sites 运行与构建包装 |
| `db/`、`drizzle/`、`examples/d1/` | 继承的数据库示例；当前游戏没有启用云数据库 |

玩家主角必须来自创角数据。林晚、周安是独立 NPC，不是固定男女主，也不自动绑定恋爱关系。玩家与 NPC 使用同一套修炼和突破规则；不能另写玩家专用数值引擎。世界改变必须经模拟 Worker，保存成功才向界面确认；图片加载、渲染、切换页面不能消耗随机数或推进时间。

## 4. 交给剧情与美术作者的内容

故事大纲在 `outline.md`，可执行节点在 `storylets.json`，过场映射在 `presentation.json`，视觉 ID 在 `art/manifest.json`，原图在 `art/images/`。修改后执行：

```bash
npm run content:prepare
npm run test:content
```

生成的 `public/templates/qingshi-content-pack.zip` 是完整作者模板，当前包含 24 个文件，可以直接交给其他人替换。由于连接的大文件传输失败，Git 仓库保留完整作者源文件和原图，ZIP 在本地启动或构建时自动生成；也可单独运行 `npm run content:prepare` 获得它。不要只交生成的网页或只改 `public/art` 的副本。

新增 NPC 资料在 `npc-presentation.json`；六张 3×3 图集提供 54 个成年修士形象，林晚原图另行保留。默认 40 人世界有资料和稳定面孔；它是预制图池，超出图池的更大世界可能复用面孔，不是实时生图服务。人物展示补充包的摘要与原故事内容锁分开计算，保持外观更新和旧档兼容的边界。

当前只在构建时装入一个官方包。运行时多包安装、游戏内导入作者 ZIP、包迁移和作者编辑器仍未实现，不能写成现成功能。

## 5. 存档与换站点

源代码仓库不会包含玩家浏览器中的实际进度。换域名、换端口、换浏览器都会进入另一个本地存储空间。迁移进度应先在原游戏设置中导出 JSON，再到新页面确认导入；原页面及原进度应保留到导入核对完成。公开自动测试通过 `tests/game/synthetic-world.ts` 在内存中生成全新的合成世界，不读取或发布浏览器导出的 JSON 快照。

| 兼容字段 | 当前值 |
| --- | --- |
| `format` | `xiantu-web-1` |
| `rulesVersion` | `0.1.1` |
| `packLock` | `official.qingshi@0.1.1:c7402c381fe903eaa99784deae2066993da76500f5ea9422e61ae40779670cd9` |

不要修改上述字段来强行接受不兼容的存档。`saveId` 与 `revision` 一同用于识别过期页面；即便两个不同角色都处于 revision 0，也必须阻止旧页面写入新角色。格式或规则变更需要显式迁移和回归测试。

## 6. 检查命令

```bash
npm run verify
```

它按顺序执行类型检查、7 项内容测试、8 项存档集成测试、5 项回调时序测试、21 项规则测试和生产构建。规则测试包含 100 NPC / 3650 日长模拟，会比其余测试慢。需要只检查局部问题时，分别运行 `typecheck:game`、`test:content`、`test:storage`、`test:client`、`test:game`。

原 `npm test` 仍保留起始站点的组件和预览元数据测试，不是游戏验收入口；其中预览元数据的要求属于旧脚手架，不应用来宣称游戏已完成端到端验收。全项目示例类型检查、通用 lint 与真实设备检查也未包含在 `verify` 中。

## 7. 已有证据与下一批工作

已有真实浏览器试玩覆盖独立角色从第 1 日创角到第 40 日筑基，包括修炼、三人探险、手动战斗、履约、重逢记忆、闭关暂停／恢复和导出检查点；曾检查 390 与 320 像素窄屏。随后新增 13 项存档事务／回调时序自动测试并修复迟到响应重新开启自动推进的问题。

最新浏览器测试服务连接失败，因此**完整真实浏览器复测尚未完成**。内存 IndexedDB 测试不是浏览器磁盘测试，受控回调测试不是页面点击测试，Chrome 窄视口也不是 iPhone / Safari 真机。Mac / Windows 原生安装启动仍需在目标机器复核；迁移命令在当前 Linux 环境的执行结果见交付时的迁移检查记录。

继续开发时优先完成以下真实操作：

1. 导入按钮、确认与取消、非法文件提示、重载恢复；在自己的独立测试局生成并导出进度后进行测试。
2. 两个标签页创建不同角色且 revision 都为 0，核对旧页写入和迟到确认都被拒绝；复查快速双击及自动推进暂停。
3. 第二次探险违约、重逢、补偿、撤退和冷却；核对会合、取消会合、等待突破结束的界面提示。
4. 默认 40 位 NPC 的详情、立绘加载、长资料与手机弹窗布局。
5. iOS / Safari 真机、触摸、200% 字体、断网和真实存储配额／崩溃情况。

产品扩展继续遵循人物记忆、玩家修仙经历、成长与世界演化的优先级。AI 自由交涉接口、恋爱／道侣完整支线、云存档、PWA、多包运行时和更多境界都属于后续工作。

## 8. 原站点与迁移安全

`.openai/hosting.json` 保留原站点身份，`build/sites-vite-plugin.ts` 保留原部署适配。该身份文件不含登录令牌。本地启动不会重新发布原站点；原 Sites 私有访问控制也不会自动成为新域名的访问控制，另行部署时须自行配置访问范围。

普通 Node 开发不要调用只适用于当前 Sites Linux 环境的 `install:ci`、`scripts/sites-env.sh` 或 `scripts/build-verified.sh`。保留它们是为了原平台的可追溯性，使用 `npm ci` 和 `*:local` 命令即可。

交接源文件包括所有游戏代码、文档、图片、模板源文件、测试代码和许可证；不包含 `node_modules`、缓存、构建产物、凭据或浏览器导出的存档 JSON。用户已明确允许将项目代码、文档和素材上传至公开仓库 `xianningqixi/xiantu`；该授权不包括个人进度或凭据。GitHub 从迁移快照开始记录提交，不将含被审批拒绝快照的原站点历史包公开发布。
