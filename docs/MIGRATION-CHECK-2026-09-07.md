# 迁移检查记录 · 2026-09-07

本轮整理迁移入口、文档与可公开的测试夹具生成方式，不改变游戏逻辑、存档格式或故事内容锁。原站点线上第 3 版保持原样，没有另建或重新发布站点。

## 独立目录执行结果

环境：Linux，Node.js v24.19.0。从项目源文件复制到不含 `node_modules`、`dist`、Sites 缓存或本地凭据的新目录，然后安装。没有复用原项目的依赖目录。

| 检查 | 结果 | 证据范围 |
| --- | --- | --- |
| `npm ci --no-audit --no-fund` | PASS | 按原锁文件全新安装 678 个依赖包；退出码 0 |
| `npm run verify` | PASS | 整个串行检查命令退出码 0 |
| 游戏 TypeScript 检查 | PASS | `typecheck:game` |
| 内容契约测试 | 7 / 7 PASS | 引用、替换、人物绑定、条件和不兼容锁 |
| 存档 Worker 集成测试 | 8 / 8 PASS | 内存 IndexedDB 中执行生产存档代码 |
| 自动推进回调测试 | 5 / 5 PASS | 实际组件回调的受控异步时序 |
| 世界规则测试 | 21 / 21 PASS | 包含 100 NPC / 3650 日，长模拟约 39 秒 |
| 跨平台命令生产构建 | PASS | `prebuild:local` 自动准备内容后，`vinext build` 完成五阶段构建 |
| 生产服务 HTTP 检查 | PASS | 执行 `start:local` 对应的 Vinext start 入口；首页 200，中文 HTML 与游戏标题正确 |
| 静态资源与作者模板 | PASS | 16 个 HTML 引用／资源请求均 200；包含全部 9 张图片和模板 ZIP，下载 ZIP 与源文件 SHA-256 相同 |
| 历史 Web 规格包 | PASS | 原 ZIP 的 17 个规格文件与 `docs/spec/` 完全一致，额外调研主文档与 `docs/history/WEB-RESEARCH-V0.1.1.md` 完全一致 |

`.gitattributes` 固定文本为 LF，避免 Windows 自动转换换行影响内容摘要；PNG 和 ZIP 标为二进制。`.nvmrc` 指定本次检查使用的 Node 主版本 24。没有改依赖版本或锁文件。

## 未覆盖的范围

以上为依赖安装、自动测试、编译和 Node 生产服务 HTTP 检查，**不是新一轮浏览器点击验收**。没有执行原生 Mac / Windows、iOS / Safari、导入弹窗、多标签页点击、懒加载绘制或真实磁盘故障。此前真实浏览器遗留项仍以 `QA-2026-09-07.md` 和 `HANDOFF.md` 为准。

GitHub 插件已确认账号 `xianningqixi` 的有效连接。用户随后创建 [xianningqixi/xiantu](https://github.com/xianningqixi/xiantu)，并明确允许公开项目源码、文档与素材。上传核验以 GitHub `main` 的实际文件树与本地源快照逐项比对为准，结果在完成后追加记录。

## 公开迁移的调整

- 自动审批拒绝将浏览器导出的测试存档发布到公开仓库。公开分支因此排除两份 JSON 快照及包含它们的原提交历史，改为 `tests/game/synthetic-world.ts` 在测试运行时生成全新的合成世界；生成器不读取或重建被拒绝的快照。8 项存档测试在此调整后重新运行并全部通过。它们验证当前规则生成的数据，不能据此声称旧浏览器快照兼容性重新通过。
- 作者模板 ZIP 的大文件请求发生传输错误。其 24 个源文件（含全部 9 张图片）完整保留；`predev:local` 与现有构建准备步骤自动生成同一模板包，避免 Git 克隆依赖压缩包上传。ZIP 内容逐条与源目录一致，SHA-256 为 `f1a21ffc03ddc724a5789267e37cd31f01c7ddd148aeca22c5e9bcdb7ed9f73a`。

## GitHub 上传与克隆核对：已完成

- 仓库：[xianningqixi/xiantu](https://github.com/xianningqixi/xiantu)，公开，分支 `main`。
- 完整导入基线提交：[`8bbdd8d026b6fbdce7bd16c409e7111e489190fe`](https://github.com/xianningqixi/xiantu/commit/8bbdd8d026b6fbdce7bd16c409e7111e489190fe)。该基线对应本地源快照 `66ec27afbe0c2664a81fc0ae716b1692b1dc7770`，Git 文件树均为 `0df81f71e0f90aaad7f703421e83700033ae73be`。
- 实际从 GitHub 重新克隆到独立目录：179 个已跟踪文件，逐个读取落盘字节计算 Git blob SHA，全部与源清单一致；全部 9 张源图及静态副本存在。
- 仓库无浏览器导出的存档 JSON。另在只含公开源文件的目录中运行存档测试，8 / 8 通过；运行 `npm run predev:local` 成功生成完整模板 ZIP，摘要与上文一致。该检查使用前次按未变锁文件全新安装的依赖，没有把复用依赖称为另一次全新安装。
- 本节是在完整导入基线核对后追加的交接记录，只修改文档；最终文档提交的文件树另行与本地核对。

现在可按根目录 README 克隆、安装并继续开发。剩余真实浏览器／设备复测仍见 `HANDOFF.md`，本次上传完成不等于这些项目已经验收。
