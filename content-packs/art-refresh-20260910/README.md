# 2026-09-10 真人仙侠美术更新

使用已安装的 [xianxia-visual-director](https://github.com/liyue-aigc/xianxia-visual-director) 与 [female-portrait-director](https://github.com/liyue-aigc/female-portrait-director) 导演技能。沿用项目配置的生图 API，实际请求模型为 `gpt-image-2.5-flare`。人物为成年人；服装采用高开叉、丝袜、高跟鞋等元素，私密部位保持覆盖。剧情威胁、伤后疗愈等画面按非性化叙事处理。

覆盖原有 257 个素材位：120 张新立绘 + 123 张新场景 + 14 张保留原图。129 张独立头像中，120 张来自新立绘，9 张沿用旧图及其裁切。全部 19 个地点均已重绘。
本批共记录 378 次逻辑 CLI 请求，包含初次生成、技术重试和局部修复；该数字不代表底层 HTTP 重试次数或计费次数。

`catalog.json` 保存运行时图片摘要与人物/地点映射；`review.json` 记录逐图审核、最终 SHA、头像裁切及限制；`prompts.json` 保存实际请求提示词和来源摘要。243 张原生 PNG 位于项目 `output/imagegen/refresh-20260910/`。旧的 20260909 素材包保留。

## 保留原图的 14 个素材位

6 项被接口明确拒绝，未改写提示词绕过；8 项在已记录的技术重试后仍返回 502。以下均未计为新生成图。

| 素材 | ID | 原因 |
| --- | --- | --- |
| 公孙缨禾 | `npc_0060` | 接口明确拒绝 |
| 沈万山 | `shichai.xiaye.shenwanshan` | 接口明确拒绝 |
| 白无咎 | `shichai.qiudeng.baiwujiu` | 接口明确拒绝 |
| 严孤鹤 | `shichai.dongxue.yanguhe` | 接口明确拒绝 |
| 凌见微 | `npc_0054` | 502 技术错误，最终重试失败 |
| 温知微 | `shichai.chunshui.wenzhiwei` | 502 技术错误，最终重试失败 |
| 沈栖月 | `shichai.xiaye.shenqiyue` | 502 技术错误，最终重试失败 |
| 柳含烟 | `shichai.xiaye.liuhanyan` | 502 技术错误，最终重试失败 |
| 段绮旋 | `npc_0085` | 502 技术错误，最终重试失败 |
| 柳含烟初遇场景 | `shichai.xiaye.liuhanyan.cg.meet` | 接口明确拒绝 |
| 客栈阁楼，红绳落枕边 | `shichai.chunshui.wenzhiwei.cg.night` | 接口明确拒绝 |
| 雪夜猎屋外，猎叉插雪，踮脚亲下巴 | `shichai.dongxue.songxiaoman.cg.spark` | 502 技术错误，最终重试失败 |
| 火塘旁解辫子，皮腰带落地 | `shichai.dongxue.songxiaoman.cg.night` | 502 技术错误，最终重试失败 |
| 药庐后院，解下围裙回望 | `shichai.chunshui.suqingyan.cg.night` | 502 技术错误，最终重试失败 |

## 验收范围与限制

逐张检查最终原图，审核由 SHA 绑定；120 张新头像另行检查并与最终裁切逐字节核对。部分场景取景较近、旧设计参考人物仍略带 CG 质感；柳含烟旧信纸面保留不可辨淡排痕。这些限制均在逐图记录中列明。个别场景的原始高度与目标相差 1 像素时，按逐项记录适配，原图保留。

本轮更新素材、构建选择与相应测试路径，并修正一处旧档测试样本。没有修改故事、人物身份、规则和存档逻辑；接入前已存在的三个内容文件变化另有快照记录。构建、测试和本地映射核验结果见制作目录的 `RESULT.md`。浏览器/手机交互验收及部署不在本轮验收记录中。
