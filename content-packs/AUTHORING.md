# 支线作者工作流

当前内容 API 2：JSON Schema 由 `npm run content:prepare` 从正式 Zod 契约生成到 `schema/extension.schema.json`。跨文件引用、能力、命名空间、依赖摘要、合法参与者仍由构建校验和规则校验负责，Schema 不代替运行验收。

1. 复制 `guest-roadside/` 到新的目录，修改 manifest 的 packId、版本、作者与许可；本包所有自有 ID 使用 `<packId>.` 前缀。依赖需精确版本与 SHA-256。官方包的摘要在 `official-qingshi/integrity.json`。
2. 定义角色或引用官方角色，写故事与退出选择、视觉槽位。只有 `progress.v1`、`meet.v1`、`starterManual.v1`、`buyItem.v1`、`experience.v1`、`agreement.v1` 能力可用。不能任意赋值资源、生死、信任或执行脚本。
3. 运行 `npm run content:prepare`，错误给出包和节点字段。构建自动扫描新目录，不需添加引擎或 UI 分支。运行期间不接受任意 ZIP。
4. 打开 `/author`，选择本支线创建测试角色。这里复用正式 Worker、规则、存档验证和画面，数据库为 `xiantu-author-preview`，与正式游戏 `xiantu-qingshi` 隔离。浏览器导入也只写此预览库。
5. `npm run content:fixtures` 生成隔离的场景夹具到 `/tmp/xiantu-author-fixtures`，仅供作者导入预览：首见、缺席、死亡、零资源和有资源状态。夹具不是已完成游戏验收的证据。
6. 按包内 acceptance 正常游玩，确认历史、重复选择、缺图和不兼容版本，记录实际结果。图片替换使用视觉映射，正文不能写 HTML。

同一个包每次只显示满足资格的最高 priority 节点，同值按 ID 排序。participants 必须存活且同地。选择完整提交后节点终身消费，包括 effects 为空的退出；可用 flags 控制后续阶段，历史会保存当时正文和选择。图片／阅读不消耗 RNG。`experience` 仅记真实当面经历，不伪造好感奖励；`buyItem` 在坊市按正式药铺价格扣款；失败候选整笔回滚。

新局明确选择启用集合，存档锁定每包版本与摘要；旧局保留原集合。官方 API 1 包经兼容适配保留原角色与节点 ID、原内容锁，API 2 新包不能覆盖它。升级内容时保留旧构建供旧局恢复，未知锁保留原档并拒绝读取，不自动重写。将来增加并行保留多版本的目录时必须继续拒绝同版本不同内容的替换。
