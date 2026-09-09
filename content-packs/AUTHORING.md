# 支线作者工作流

当前内容 API 2：JSON Schema 由 `npm run content:prepare` 从正式 Zod 契约生成到 `schema/extension.schema.json`。跨文件引用、能力、命名空间、依赖摘要、合法参与者仍由构建校验和规则校验负责，Schema 不代替运行验收。

1. 复制 `guest-roadside/` 到新的目录，修改 manifest 的 packId、版本、作者与许可；本包所有自有 ID 使用 `<packId>.` 前缀。依赖需精确版本与 SHA-256。官方包的摘要在 `official-qingshi/integrity.json`。
2. 定义角色或引用官方角色，写故事与退出选择、视觉槽位。只有 `progress.v1`、`meet.v1`、`starterManual.v1`、`buyItem.v1`、`experience.v1`、`agreement.v1` 能力可用。不能任意赋值资源、生死、信任或执行脚本。
3. 运行 `npm run content:prepare`，错误给出包和节点字段。构建自动扫描新目录，不需添加引擎或 UI 分支。运行期间不接受任意 ZIP。
4. 打开 `/author`，选择本支线创建测试角色。这里复用正式 Worker、规则、存档验证和画面，数据库为 `xiantu-author-preview`，与正式游戏 `xiantu-qingshi` 隔离。浏览器导入也只写此预览库。
5. `npm run content:fixtures` 生成隔离的场景夹具到 `/tmp/xiantu-author-fixtures`，仅供作者导入预览：首见、缺席、死亡、零资源和有资源状态。夹具不是已完成游戏验收的证据。
6. 按包内 acceptance 正常游玩，确认历史、重复选择、缺图和不兼容版本，记录实际结果。图片替换使用视觉映射，正文不能写 HTML。

当前地点每次只显示满足资格的一个支线节点，全局按 priority、ID 排序。participants 必须存活且同地。选择完整提交后节点终身消费，包括 effects 为空的退出；可用 flags 控制后续阶段，历史会保存当时正文和选择。图片／阅读不消耗 RNG。`experience` 仅记真实当面经历，不伪造好感奖励；`buyItem` 在坊市按正式药铺价格扣款；失败候选整笔回滚。

新局明确选择启用集合，存档锁定每包版本与摘要；旧局保留原集合。官方 API 1 包经兼容适配保留原角色与节点 ID、原内容锁，API 2 新包不能覆盖它。升级内容时保留旧构建供旧局恢复，未知锁保留原档并拒绝读取，不自动重写。将来增加并行保留多版本的目录时必须继续拒绝同版本不同内容的替换。

## 自有图片与人物立绘（2026-09-08）

API 2 支持三种视觉状态：`reused` 仍引用官方资源，`planned` 保留待绘占位，`owned` 引用本包 `art.assets`。需要自有图片时，在 `manifest.entryFiles` 增加 `"art": "art/manifest.json"`，并创建清单，例如：

```json
{
  "assets": {
    "example.story.art.heroine": {
      "file": "art/images/heroine.png",
      "url": "/art/example.story/heroine.png",
      "alt": "成年女修的全身立绘",
      "width": 1024,
      "height": 1536,
      "kind": "portrait"
    }
  }
}
```

此例的 `packId` 为 `example.story`。资源 ID 必须以本包 ID 加点开头；文件只允许 `art/images/[a-z0-9-]+.png`，URL 必须是 `/art/<packId>/<同一文件名>.png`。构建检查 PNG 签名、IHDR 尺寸、文件存在及全局 URL 唯一性；`kind` 只允许 `scene` 或 `portrait`。

在 `visuals.json` 声明 `"example.story.heroine.portrait": {"assetId":"example.story.art.heroine","alt":"成年女修的全身立绘","status":"owned"}`，再在 `definitions.characters` 对应人物增加 `"portraitId":"example.story.heroine.portrait"`。它必须指向本包视觉槽位，owned 资源必须是 portrait。支线卡片会展示第一个有立绘的参与者；NPC 列表、详情也会使用它。这里的内容定义 `portraitId` 是视觉槽位，不是存档 Actor 中的自定义图片哈希，不需要写入或升级存档。玩家仍由用户创建。

`npm run content:prepare` 统一生成最长边 1152 的 WebP（1024×1536 → 768×1152；1672×941 → 1152×648），在 `images.json` 登记尺寸与 `lazy: true`，按需加载、缓存，排除在 PWA 离线核心之外。原 PNG 保留不改；离线时尚未访问的图片可能显示占位。

支线锁按 `sha256(JSON.stringify({content: data, images: hashes}))` 计算，`images` 为资源 ID 到原 PNG 的 SHA-256，无自有图时为 `{}`。自有图包生成 `integrity.json`，登记表也包含图片摘要。修改资源或数据会改变支线锁，本次升级同样会改变没有自有图的 roadside 摘要；旧档必须使用原构建恢复，不自动换锁。官方内容锁及官方模板 ZIP 不受支线资源影响。

## 地域与成长旅程（2026-09-08）

可选 `manifest.entryFiles.journey: "journey.json"` 声明旅程数据。`definitions.locations` 的键使用包命名空间，每个地点包含 `name`、`subtitle`、`body`、`kind`（market／inn／gate）、`destinations` 和 `visualId`。本包只能引用自己的地点及原有 market／inn／gate；远方城门连接由已选旅程顺序生成，正文或视觉回调不能直接传送角色。

`journey.json` 用 `order`、`regionName`、`locations: {market, inn, gate}` 指定区域与顺序，`minRealm`、`minExpeditions` 指定成长及探索要求，`travelDays` 指定由前一已选区域抵达的天数，`clueCount` 指定本卷至少消费几个节点后提供下一段路的线索。`introId` 指定当地引子，`sceneIntervalDays` 指定两次场景之间的游戏日数，`lead` 和 `routeLead` 提供当前目标与远行理由。未选前卷时道路直接连接相邻已选卷，不强制安装缺失卷；回程无成长门槛。

《青石十钗》0.2.0 的四卷门槛依次为炼气一层、二层、三层、筑基，后三地由「残碑寻源」的前一已选地域主线线索解锁，不再要求完成固定数量的支线。四卷独立故事和恋爱选择都可不推进，地图主线仍可继续。跨城依次为 3／4／5 日；同城市集与客舍往返零日，城外一步一日。每卷引子先于人物阶段，每两日才可进入下一场。节点可另设 `minRealm`，新增可查询事实 `player.realm` 和 `player.expeditions`。深入阶段提高一层门槛，最高筑基。探索次数记录进入秘境的经历，撤退也算探索，战斗／战利品未结束时不能远行。

人物 `homeVisitIntervalDays` 可声明 1—30 日的常驻地回访间隔。十钗为七日；突破、护法、队伍及已约会合优先，同一天不重复获得其他日常收益。人物随机移动只在当前城镇内，会合不能跨城瞬移。

存档事件可选 `storyNodeId` 用于阶段间隔，消费标记继续防重放。本次仅对 `lib/game/content/journey-migrations.json` 登记的四个旧 0.1.0 精确锁做 0.2.0 升级：迁移在副本执行，保留原档、玩家与队伍位置、身份、形貌、资源和已发生故事，仅把未同行的外地支线 NPC 安置到对应城镇。旧事件没有该字段时不反推或伪造时间间隔。未知内容锁仍拒绝读取。其他包不能借此自动换锁。


## 地图主线与支线的边界

`main-quest/story.json` 是全局四章主线数据，包含 NPC、地点、最低境界、抵达等待期、调查间隔和选项文本。`main-story-contract.mjs` 校验引用与占位符，准备内容时生成独立版本摘要。新增主线版本不能静默替换已锁定的历史；当前旧档仅支持从缺少 `campaignLock` 的版本补锁，未知主线锁仍拒绝并保留原档。

主线进度来自 `WorldEvent.mainStory`，不借用支线的 `contentState`，不以支线节点数量决定城市通行。渲染只选择一个当前有效事件：主线优先，其次当地支线，再次原青石故事。`chooseMain` 在纯规则内再次校验人物、地点、日数和前置证据，完整保存后 UI 才确认。对话即刻完成，等候与旅行使用真实天数；图片和地图展开不能触发剧情写入。

青石开始调查前，玩家必须炼气入门并取得残碑证据：独自到山门古道执行 `surveyRuins`（共享数据定义的两日勘察，无战利品），或完成原秘境探索并结算。每个地域先当面找指定 NPC，至少两日后到指定地点核对证据；后三城对话还需抵达满两日。NPC 身故时读取当地客舍留存的档案，历史参与者仅写玩家。未选择的地域不加入本局主线；青石章节始终存在。地图按相邻城门实际旅行，允许留在当地修行、见人或触发支线。
