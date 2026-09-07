# V0.1 本地开发交接

2026-09-07。本轮基于 `49ca87f`，工作分支 `codex/complete-v01`。玩家创建角色，Web 图文形式和原站点身份保持不变；不另建 Unity 工程。当前是本地候选版，未发布或推送本轮改动到远端。完整验收状态见 [V01-LOCAL-ACCEPTANCE](reports/V01-LOCAL-ACCEPTANCE.md)。

## 启动与构建

```bash
npm ci
npm run dev:local
npm run verify
npm run start:local -- --hostname 127.0.0.1 --port 3100
```

Node 最低 22.13.0，推荐 Node 24；本轮 macOS 26.5.1／Node 26.3.0／npm 11.16.0。`dev:local` 默认 3000，生产预览默认 3000，可用 `--port` 指定 3100。勿双击 dist HTML 代替 HTTP 服务。生产服务启动时缓存静态字节，重建后必须重启。`scripts/start-local.mjs` 调用固定版本 Vinext 的公开服务入口，只补完整 URL 请求目标的同源路径规范化；不充当外部 HTTP 代理。原 Sites 构建／部署配置保留。

`.env.production.local`、`.env.local`、`.env.production`、`.env` 按优先顺序加载；现有环境变量优先。固定剧情无需 AI 配置。可选 AI 密钥仅放服务端，见 [AI-CONFIG](AI-CONFIG.md)。浏览器发到本站 `/api/negotiation`，不能选择上游。当前每服务进程共享 6 次／分钟的原型限额；上线前需单独评估多人服务容量。真实供应方烟测为 not_run。

## 测试命令及准备

```bash
npx playwright install chromium firefox
npm run verify
npm run test:stress
npm run test:browser
```

`test:browser:existing` 自动生成 `/tmp/xiantu-author-fixtures`。大档性能测试读取 `${XIANTU_STRESS_OUTPUT:-/tmp/xiantu-stress}/save-1.json`；无此文件会明确 skip，不能作为发布回归通过。`verify:release` 顺序完成 verify、五 Seed 压力测试和真实浏览器测试。已运行的生产服务须与当前 dist 对应；测试更新使用独立 HTTP 端口 3125，不要并行运行两个 offline.spec 实例。

```bash
# 以下为 macOS / Linux 示例
PLAYWRIGHT_CHANNEL=chrome XIANTU_TEST_URL=http://127.0.0.1:3100 npm run test:browser:existing
PLAYWRIGHT_BROWSER=firefox XIANTU_TEST_URL=http://127.0.0.1:3100 npm run test:browser:existing
PLAYWRIGHT_CHANNEL=chrome XIANTU_TEST_URL=http://127.0.0.1:3100 npm run test:portability
```

先运行 Chrome story.spec，再运行 portability；后者读取 `/tmp/xiantu-story-chromium/{honor,breach}.json`，通过真实文件控件从 Chrome 下载后在 Firefox 导入并重新导出。它只剔除导入时重新分配的 `saveId` 与 `revision`，其他全部数据比较。每个检查点的 SHA-256 见 portability 报告。所有这些快照是测试新局，未读取用户真实浏览器存档；不随 Git 提交。

`verify` 覆盖游戏 strict 检查及其 UI 依赖，不等于继承的 Cloudflare 示例全部类型检查或全仓 lint。`npm test` 仍是旧 Sites 脚手架入口。五 Seed 固定为 1、42、12345、20260906、987654321；无失败 Seed 被跳过。

## 存档与恢复

| 字段 | 当前值 |
| --- | --- |
| format / schema | xiantu-web-1 / 4 |
| rulesVersion | 0.1.2 |
| IndexedDB | xiantu-qingshi，物理版本 2，saves / backups / drafts |
| draft format | xiantu-creation-draft-1，draft version 1 |
| official pack | official.qingshi 0.1.1 |
| official lock | official.qingshi@0.1.1:c7402c381fe903eaa99784deae2066993da76500f5ea9422e61ae40779670cd9 |
| extension API | 2；精确版本与 SHA-256 存入 contentLocks |
| 导入上限 | 人生存档 16 MiB；创角草稿 64 KiB |

进入“存档与设置”可导出、导入、查看本机备份。导入／新角色需确认；“本机备份”可导出指定旧快照、确认恢复。恢复也会保存被替换的当前进度。坏档不会自动清空，仍可导出原始进度再从有效备份恢复。无 schema／schema 1、2、3 经副本迁移到 4，保存原始备份后原子切换；未来格式和未知包锁拒绝读取并保留原件。

两个页面同时操作时，saveId 与 revision 都在事务内比较；收到冲突应“重新读取”，不可强制覆盖。配额不足可先导出当前进度，释放其他占用后重试。不要删除原 IndexedDB 来“解决”失败。关闭页面不会推进时间；闭关按完整日保存，重开处于暂停计算，主动点“继续”；普通闭关可以“结束修行”，突破尝试不可自愿中断。

## 内容与作者

`npm run content:prepare` 校验官方 API 1 与扩展 API 2，生成 `lib/game/content/extensions.json`、JSON Schema、图片副本与官方模板 ZIP。只改内容包源文件，勿只改 `public/art`。`npm run content:fixtures` 生成首见、缺席、死亡、贫穷等预览夹具，夹具不能冒称正常游玩结果。

`/author` 共用正式渲染与规则，独立 Worker 数据库 `xiantu-author-preview`；预览 saveId 以 `preview:` 开头，正式入口拒绝导入。独立作者包为 `guest.roadside@1.0.0`，只新增六个内容／文档文件；实际规则和浏览器验证由主开发流程补上。作者修改方式见 [AUTHORING](../content-packs/AUTHORING.md)。

官方包维持原 ID／摘要，通过兼容层登记，未强行改为 API 2 以破坏旧锁。本版构建中一个包 ID 只保留一个版本；保留旧构建供对应旧局继续。没有运行时 ZIP 安装、自动迁移剧情包、可视化编辑器或脚本插件。

## 离线与更新

仅生产构建启用 PWA。先在线打开，等待底部“离线可用”，再关闭并离线重开；未首次安装的设备不能离线启动。核心 HTML、脚本、Worker、配图、图标与 manifest 按构建版本原子缓存。开发服务不注册离线包。

更新先准备完整新缓存，不会自动刷新。长行动／战斗／正在保存时按钮不可用；安全点“应用更新并重开”，还需关闭其他正式或预览页。新版本资源下载失败会删除不完整缓存，保留旧版本；保留最近两版缓存。数据迁移仍由 Worker 独立验证，失败不改原存档。离线 AI 显示不可用，固定剧情照常运行。

## 证据与外部验收

- [验收矩阵](reports/V01-LOCAL-ACCEPTANCE.md)：69 条 AC 与 34＋3 项任务的真实结果。
- [五 Seed 最终报告](reports/final-stress.json)：schema 4，不与中间 schema 3 报告混淆。
- [跨浏览器报告](reports/portability.json)：实际 Chrome、Firefox 和文件往返。
- [界面截图](reports/screenshots/)：桌面作者预览、390px 作者预览与明确标注 mock 的 AI 确认。
- [试玩包](reports/PLAYTEST-PACKET.md)：共同前置、两分支步骤、待填记录，无已完成外部试玩的暗示。
- 素材来源：`content-packs/official-qingshi/art/` 清单和包内说明、`npc-presentation.json`；预制图片，非实时生图，保留 vendor 许可。

尚缺真实 iPhone Safari、Windows Chromium、未参与实现的评审者、3—5 名试玩者及真实 AI 供应方验证。桌面移动视口、故障注入和模型 mock 均不替代这些证据。金丹以上、完整亲密路线、宗门经营、云存档、多人、实时生图仍延期。当前没有已知未修的本地阻断缺陷，但发布前须完成剩余设备和外部体验验收。
