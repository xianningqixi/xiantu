# 仙途 · 青石人间

可玩的 Web 图文修仙原型。玩家先创建自己的角色，选择姓名、性别、外貌配置、资质和伴生法宝；林晚与周安是世界中的独立 NPC，不是固定男女主角或恋爱对象。

## 在自己的电脑继续开发

开发仓库：[xianningqixi/xiantu](https://github.com/xianningqixi/xiantu)。安装 Node.js 24（项目最低要求 22.13.0，附带 npm），然后执行：

```bash
git clone https://github.com/xianningqixi/xiantu.git
cd xiantu
npm ci
npm run dev:local
```

打开终端显示的本地网址。当前游戏不需要 OpenAI API Key、ChatGPT 登录或云数据库；存档保存在当前浏览器中。第一次安装需要访问 npm 下载依赖。

```bash
npm run verify
npm run start:local
```

`verify` 运行游戏类型检查、内容／存档／回调／规则测试和生产构建；`start:local` 启动构建后的服务。普通开发请使用以上跨平台命令，原 `install:ci`、`build`、`dev` 等命令保留供 Sites 环境使用。依赖版本和锁文件未升级。开发交接、目录分工、存档迁移和待办详见 [docs/HANDOFF.md](docs/HANDOFF.md)。

## 当前可玩

- 自建角色、无限资质重掷、三件法宝选一、简单／复杂模式。
- Seed 确定的 40 人初始世界，NPC 随行动推进修炼、移动、交往、突破及寿元变化。
- 青石坊市、听雨客栈、山门古道和残碑秘境的图文探索。
- 免费功法、杂务收入、基础／灵石修炼、闭关、凡人至筑基、非致命突破失败。
- 三人队伍、玩家手动／自动战斗、NPC 自动、剑诀、防御、回春丹、撤退与掉落。
- 同行约定、履约／违约、补偿及再次见面时的记忆。
- Web Worker 单写入规则，IndexedDB 自动存档、JSON 导入导出、原子修订检查和命令去重。
- 桌面与手机响应式页面；背景、NPC 立绘、剧情数据与规则分开维护。

## 实现入口

- `components/game`：创建角色与五个游戏页面。
- `lib/game/engine.ts`：纯规则、确定性演化、命令校验。
- `lib/game/simulation.worker.ts`：单队列世界处理与原子本地保存。
- `content-packs/official-qingshi`：网页实际读取的大纲、故事 JSON、NPC 初值、过场、视觉清单和原图。
- `lib/game/content`：内容契约、薄载入层、文本占位符与数值配置。
- `public/art`：脚本从内容包同步的三张故事图片与六张 NPC 图集；源图在内容包中维护。
- `public/templates/qingshi-content-pack.zip`：自动导出的完整作者模板，可从创角页或设置下载。
- `docs/spec`：此前开发规格包，原验收条目仍是计划，不能因本次构建通过全部改成 done。
- `docs/IMPLEMENTATION.md`：本次实现、验证范围与未完成项。

## 检查

使用现有锁文件安装依赖。普通 Node.js 环境可逐项运行：

```bash
npm run content:prepare
npm run typecheck:game
npm run test:content
npm run test:storage
npm run test:client
npm run test:game
npm run build:local
```

`typecheck:game`检查游戏和直接依赖的 UI 代码；不冒称未配置环境的 Cloudflare 示例类型检查已通过。规则测试使用已有 esbuild 和 Node test runner；存档事务集成测试使用唯一新增的开发依赖 fake-indexeddb，自动推进回调测试直接提取生产组件回调。两者均不代替浏览器操作。

## 内容协作边界

正文、条件和选项来自 `content-packs/official-qingshi/storylets.json`，过场来自 `presentation.json`，图片通过稳定视觉 ID 与素材清单关联。改故事、现有条件和图片不需要修改页面布局。作者流程、能力表和验收见包内 README 与 AUTHORING。`npm run content:prepare` 校验引用、同步图片并生成内容锁和同源下载包；`npm run build` 前自动执行。

当前是构建时一个官方包，完整多包协议、游戏内 ZIP 导入、作者编辑器和旧档迁移尚未实现。存档按内容版本和摘要严格锁定，更新原故事、规则相关初值与三张原图后应在新局测试；仅改独立 NPC 展示补充包不会改变此锁；旧局不兼容会明确报错并保留原数据。

## 数据边界

当前明确采用既有方案的单设备本地存档，不使用云同步。关闭页面不推进现实时间；闭关以完整游戏日为保存检查点，重新打开后需主动继续。开始新局和导入均需界面确认，旧快照在本机备份存储中保留；跨设备请主动导出 JSON。

NPC 资料和图集入口是 `content-packs/official-qingshi/npc-presentation.json`；默认世界的人物都有资料和固定面孔。54 个新增修士形象按性别和初始年龄匹配，另保留林晚原立绘；这是预制图池，不是实时生图。详细试玩结果与未完成的浏览器项目见 `docs/QA-2026-09-06.md`；新增 13 项存档／回调复测及本轮修复见 `docs/QA-2026-09-07.md`。

游戏尚未接入外部 AI 服务或实时人物生图。不同外貌配置作为玩家数据保存和文字展示，当前不会为每个玩家实时生成专属立绘。林晚插图始终绑定其 NPC 身份。
