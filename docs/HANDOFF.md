# 当前本地开发交接

2026-09-07。当前工作分支 `codex/maintainability-scale-mobile`，在 V0.1 本地候选提交 `1fe5a23` 上完成维护性、存档规模、Worker、移动端和资源优化。玩家创建角色，Web 图文形式和原站点身份保持不变。当前仍为本地候选版，未发布或推送本轮改动到远端。本轮验收见 [MAINTAINABILITY-SCALE-MOBILE](reports/MAINTAINABILITY-SCALE-MOBILE.md)；原里程碑结果见 [V01-LOCAL-ACCEPTANCE](reports/V01-LOCAL-ACCEPTANCE.md)，其中 schema 4 数据是历史基线。

## 启动与构建

```bash
npm ci
npm run dev:local
npm run verify
npm run start:local -- --hostname 127.0.0.1 --port 3100
```

Node 最低 22.13.0，推荐 Node 24；本轮 macOS 26.5.1／Node 26.3.0／npm 11.16.0。`dev:local` 默认 3000，生产预览默认 3000，可用 `--port` 指定 3100。勿双击 dist HTML 代替 HTTP 服务。生产服务启动时缓存静态字节，重建后必须重启。`scripts/start-local.mjs` 调用固定版本 Vinext 的公开服务入口，只补完整 URL 请求目标的同源路径规范化；不充当外部 HTTP 代理。原 Sites 构建／部署配置保留。

`.env.production.local`、`.env.local`、`.env.production`、`.env` 按优先顺序加载；现有环境变量优先。固定剧情无需 AI 配置。可选 AI 密钥仅放服务端，见 [AI-CONFIG](AI-CONFIG.md)。浏览器发到本站 `/api/negotiation`，不能选择上游。公开部署配置 `XIANTU_ALLOWED_ORIGINS`（逗号分隔完整来源），避免 HTTPS 终结后拿内部 URL 误拒绝请求；未配置时仅接受与本地请求 URL 相同的来源。默认签名 HttpOnly、SameSite=Strict 匿名会话各有 6 次／分钟额度；仅在源站限制直连时启用 `XIANTU_TRUST_CF_IP=1` 按 CF 客户端 IP 限流。额度表及会话签名密钥仍是进程内状态，不是分布式限流或账号防滥用方案。AI 只产出一套标准同行约定，不支持自由分配或价格。真实供应方烟测为 not_run。

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

`verify` 包含 Prettier、游戏 strict 检查及其 UI 依赖、82 项自动测试和生产构建；不等于全仓 lint 或真机验收。`npm test` 保留 Sites 构建入口，游戏本地验收使用 `verify`。五 Seed 固定为 1、42、12345、20260906、987654321；历史五 Seed 十年报告对应 schema 4。本轮逐份迁移这五个旧档，新增 200 NPC／365 日模拟和两浏览器十年档续跑；未将旧报告当作重新运行 schema 5 五 Seed 十年的证据。

## 存档与恢复

| 字段 | 当前值 |
| --- | --- |
| format / schema | xiantu-web-1 / 5 |
| rulesVersion | 0.1.2 |
| IndexedDB | xiantu-qingshi，物理版本 2，saves / backups / drafts |
| draft format | xiantu-creation-draft-1，draft version 1 |
| official pack | official.qingshi 0.1.1 |
| official lock | official.qingshi@0.1.1:c7402c381fe903eaa99784deae2066993da76500f5ea9422e61ae40779670cd9 |
| extension API | 2；精确版本与 SHA-256 存入 contentLocks |
| 导入上限 | 人生存档 16 MiB；创角草稿 64 KiB |

进入“存档与设置”可导出、导入、查看本机备份。导入／新角色需确认；“本机备份”可导出指定旧快照、确认恢复。恢复也会保存被替换的当前进度。坏档不会自动清空，仍可导出原始进度再从有效备份恢复。无 schema／schema 1、2、3、4 经副本迁移到 5，保存原始备份后原子切换；未来格式和未知包锁拒绝读取并保留原件。

`knowledge` 为 `eventId → [knowerIndex, sourceIndex, sourceActorIndex, learnedDay][]`；人物索引指向 `[player, ...npcs]`，必须保留人物顺序及身份，来源人物为空用 `-1`。来源码 participant=0、witness=1、told=2、public=3、legacy=4，读取工具为 `knowledgeEntries`。每条知情事实及来源保留，不删除死亡或旧事件压缩测试结果。

`commandReceipts` 只保留最近 128 条完整载荷指纹；被淘汰回执进入 `receiptHistory.{count,hash}` 的 SHA-256 累计校验链。`appliedCommands` 仍保存全部精确命令 ID。近期同 ID 同载荷重试幂等；历史 ID 已无载荷可核实时拒绝重放并提示重新读取，不靠哈希猜测是否执行。累计哈希只作审计校验，不具备认证／防篡改能力。导出改为紧凑 JSON，导入上限仍为 16 MiB；事件与命令 ID 增长问题只是缓解，完整 seed＋命令日志存档尚未实现。

两个页面同时操作时，saveId 与 revision 都在事务内比较；收到冲突应“重新读取”，不可强制覆盖。配额不足可先导出当前进度，释放其他占用后重试。不要删除原 IndexedDB 来“解决”失败。关闭页面不会推进时间；闭关按完整日保存，重开处于暂停计算，主动点“继续”；普通闭关可以“结束修行”，突破尝试不可自愿中断。

长行动发送一次 `advance`（最多 30 日），Worker 内逐日计算并提交 IndexedDB，每日成功后只发轻量 `progress`，结束才返回一次完整世界。为中断恢复保留每日事务，并非一批只写一次。步骤 ID 继续为 `${saveId}:${actionId}:step:${checkpoint}`，部分成功后的重试沿原批次终点，不追加天数。暂停请求走队列外通道，当日落盘后才确认暂停；异常返回最后一个成功检查点。可选条件为修为圆满、指定人物到达、得知重要事件时暂停。

## 代码与界面边界

`engine.ts` 是兼容出口；`rng`、`worldgen`、`daily-simulation`、`combat`、`agreement`、`story`、`validate` 分责，`commands.ts` 使用处理器表。经济与时间成本分别经 `economy.ts`、`action-cost.ts` 共用 `balance.json`；真实行囊渲染价格与实际扣款有一致性回归。规则拒绝也使用 `GameError.code`，界面将正常规则提示和需重新读档的协议／存储错误区别呈现。

旅程、侧栏、设置、战利品、历程和闭关摘要为独立组件。移动状态条展示钱、目标、队伍、法宝；目标定位数据放在官方包 `ui-presentation.json`。行动成功提示只跟随已保存结果；摘要只展示玩家已知重要近况。历程支持人物／类型／年份筛选、按年分组、每页 50 条和本机上次查看标记，不写世界。关系箭头依据事件记录的实际好感／信任变化，上限不显示虚假增加，旧事件无数据则不推测。

已清理 D1／Drizzle 示例、未用依赖和 52 个 UI 组件，保留原 Sites 身份、Vinext Worker 与部署适配。`esbuild`、`sharp` 为显式开发依赖，不依赖已删库的传递安装。`npm run format` 格式化维护源码，`format:check` 已纳入 verify；首次纯格式化提交为 `9739b70`。

## 内容与作者

`npm run content:prepare` 校验官方 API 1 与扩展 API 2，生成 `lib/game/content/extensions.json`、JSON Schema、WebP 展示衍生图与官方模板 ZIP。原 PNG 保存在内容包和模板中；`scripts/prepare-images.mjs` 生成带内容哈希的 `public/art/optimized/` 及尺寸清单。只改内容包源文件，勿只改 `public/art`。`ui-presentation.json` 和展示衍生图独立于旧游戏内容摘要，保持原官方锁。`npm run content:fixtures` 生成首见、缺席、死亡、贫穷等预览夹具，夹具不能冒称正常游玩结果。

`/author` 共用正式渲染与规则，独立 Worker 数据库 `xiantu-author-preview`；预览 saveId 以 `preview:` 开头，正式入口拒绝导入。独立作者包为 `guest.roadside@1.0.0`，只新增六个内容／文档文件；实际规则和浏览器验证由主开发流程补上。作者修改方式见 [AUTHORING](../content-packs/AUTHORING.md)。

官方包维持原 ID／摘要，通过兼容层登记，未强行改为 API 2 以破坏旧锁。本版构建中一个包 ID 只保留一个版本；保留旧构建供对应旧局继续。没有运行时 ZIP 安装、自动迁移剧情包、可视化编辑器或脚本插件。

## 离线与更新

仅生产构建启用 PWA。先在线打开，等待底部“离线可用”，再关闭并离线重开；未首次安装的设备不能离线启动。核心 HTML、脚本、Worker、三张场景／主立绘、图标与 manifest 按构建版本原子缓存。六张 NPC 图集按需进入资源缓存，每版最多 8 项并保留最近两版；初次未看过的图集离线时可能显示占位，不影响操作。开发服务不注册离线包。

更新先准备完整新缓存，不会自动刷新。长行动／战斗／正在保存时按钮不可用；安全点“应用更新并重开”，还需关闭其他正式或预览页。新版本资源下载失败会删除不完整缓存，保留旧版本；保留最近两版缓存。数据迁移仍由 Worker 独立验证，失败不改原存档。离线 AI 显示不可用，固定剧情照常运行。

## 证据与外部验收

- [本轮改进报告](reports/MAINTAINABILITY-SCALE-MOBILE.md)：当前 schema 5、体积／性能变化、浏览器复测与依赖清理后的干净安装证据。
- [验收矩阵](reports/V01-LOCAL-ACCEPTANCE.md)：69 条 AC 与 34＋3 项任务的真实结果。
- [五 Seed 最终报告](reports/final-stress.json)：schema 4，不与中间 schema 3 报告混淆。
- [跨浏览器报告](reports/portability.json)：实际 Chrome、Firefox 和文件往返。
- [界面截图](reports/screenshots/)：桌面作者预览、390px 作者预览与明确标注 mock 的 AI 确认。
- [试玩包](reports/PLAYTEST-PACKET.md)：共同前置、两分支步骤、待填记录，无已完成外部试玩的暗示。
- 素材来源：`content-packs/official-qingshi/art/` 清单和包内说明、`npc-presentation.json`；预制图片，非实时生图，保留 vendor 许可。

尚缺真实 iPhone Safari、Windows Chromium、未参与实现的评审者、3—5 名试玩者及真实 AI 供应方验证。桌面移动视口、故障注入和模型 mock 均不替代这些证据。金丹以上、完整亲密路线、宗门经营、云存档、多人、实时生图仍延期。当前没有已知未修的本地阻断缺陷，但发布前须完成剩余设备和外部体验验收。
