# 仙途 · 青石人间

可玩的 Web 图文修仙原型。玩家创建自己的角色；林晚、周安是世界中的独立 NPC。当前交付为 **V0.1 本地候选版**，实现与本地测试结果见 [验收报告](docs/reports/V01-LOCAL-ACCEPTANCE.md)。真实 iPhone、Windows、独立评审／试玩和真实 AI 供应方尚未验收，未进行远端部署。

## 启动

使用 Node.js 24（最低 22.13.0），依赖以 `package-lock.json` 为准。本轮实际环境为 macOS 26.5.1、Node 26.3.0、npm 11.16.0。

```bash
git clone https://github.com/xianningqixi/xiantu.git
cd xiantu
npm ci
npm run dev:local
```

开发页默认在 http://localhost:3000。固定选项游戏不需要账号、API Key 或云数据库。

```bash
npm run verify
npm run start:local -- --hostname 127.0.0.1 --port 3100
```

生产预览打开 http://127.0.0.1:3100。`verify` 包含游戏 strict 类型检查、依赖边界、内容、扩展、AI、存储、回调和规则测试，以及完整生产构建。每次重新构建后应重启生产服务；静态资源在服务启动时加载。`start:local` 保留 Vinext 渲染与静态服务，并处理本机浏览器／代理发来的完整 URL 请求，防止刷新 404。

## 当前功能

- 姓名、性别、外貌、模式、三件法宝、无限资质重掷；创角草稿自动保存及文件导入导出。
- Seed 确定的 40 NPC 世界；共用修炼／突破、旅行、交往、知情记忆、寿元与死亡生命周期。
- 坊市、客栈、古道、秘境，免费功法与劳务恢复，凡人至筑基，非致命突破失败与合法重试。
- 三人手动／自动战斗、四技能槽、丹药、防御、撤退、掉落与履约／违约／补偿／重逢。
- Worker 完整事务保存、重复命令保护、跨标签冲突、旧档迁移、备份导出／确认恢复及损坏原档保留。
- 可选的“周安的归途口信”独立支线包；[作者预览](http://127.0.0.1:3100/author)与正式存档隔离。
- 服务端可选 AI 交涉：白名单提案、澄清、用户确认、迟到响应作废。默认关闭，配置见 [AI-CONFIG](docs/AI-CONFIG.md)。
- 生产 PWA：首次在线看到“离线可用”后，可断网重开继续固定剧情；更新需结束当前行动并关闭其他游戏页。

## 验证

```bash
npx playwright install chromium firefox
npm run test:browser
npm run test:stress
npm run verify:release
```

五 Seed 长模拟单列为 `test:stress`，每局 100 NPC／3650 日，本机整组约 14 分钟。`test:browser` 构建后启动独立生产服务；浏览器测试使用隔离上下文。若未先生成十年存档，单次浏览器测试会明确跳过大档性能项；`verify:release` 先运行压力测试，因此会执行这一项。测试已在启动的服务上执行时使用 `XIANTU_TEST_URL` 和 `test:browser:existing`。

```bash
# macOS / Linux；PowerShell 使用相应的 $env:变量设置方式
PLAYWRIGHT_BROWSER=firefox npm run test:browser:existing
PLAYWRIGHT_CHANNEL=chrome npm run test:portability
```

跨浏览器脚本需先完成 Chrome 的 `story.spec.ts`，读取该脚本生成的独立测试检查点。更多命令、证据位置、备份与故障恢复见 [开发交接](docs/HANDOFF.md)。`npm test`、`build`、`dev` 保留原 Sites 脚手架流程；本地游戏使用上面的命令。

## 内容与数据

- `content-packs/official-qingshi/`：官方故事、NPC、视觉清单及原图；旧 API 1 内容锁保持兼容。
- `content-packs/guest-roadside/`：独立作者只改内容目录完成的 7 节点支线。
- `content-packs/AUTHORING.md`：API 2 能力、精确依赖、校验及预览流程。`npm run content:prepare` 自动扫描、校验并生成静态登记表及官方模板 ZIP。
- `lib/game/`：纯规则、类型、知识、故事、Worker 与存储；`components/game/`：图文界面；`lib/server/`：可选 AI 代理。
- `docs/spec/`：规格基线及逐项结果链接；历史报告保留其当时的状态，以本轮验收报告为准。

存档仅在当前浏览器和来源（域名／端口）内保存。换浏览器或端口前导出 JSON，再在新页面确认导入。新局、导入、恢复均保留被替换的旧档；不要用清空浏览器数据修复读档问题。

金丹以上、完整恋爱／道侣、宗门经营、云存档、多人、实时人物生图、任意脚本与完整 Mod 编辑器仍在本版之外。当前一个包 ID 只登记一个版本；新内容用于新局，不支持进行中存档热装卸或自动升级支线。未知锁会保留原档并提示恢复对应旧构建。预制图池可能在大世界复用面孔；支线两张未完成插图明确使用占位。
