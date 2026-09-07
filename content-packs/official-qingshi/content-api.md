# 内容接口 1

这是当前网页已实现的接口，优先于 `docs/spec/` 中尚未全部落地的长期规划。

## 条件

所有条件为 AND；节点按数组顺序取第一个匹配项。`eq` 支持同类型精确比较，`gte` 仅支持数字。时间不会因阅读、筛选或打开人物界面而前进。

| fact | 类型／取值 | 含义 |
| --- | --- | --- |
| location | market / inn / gate / ruins | 玩家当前地点 |
| primaryPresent | boolean | primary 存活且与玩家同地 |
| manual | boolean | 玩家已学入门功法 |
| outcome | none / fulfilled / breached / not_triggered | 当前故事的真实结果 |
| sinceSettlement | number | 距首次有效结算的日数，未结算为 -1 |
| hasAgreement | boolean | 有 accepted 或 active 约定 |
| canInvite | boolean | 是否满足现行关系与履约规则 |
| met / goal / reunion | boolean | 系统使用的三种故事进度 |
| 自定义已声明标记 | boolean | 初始为 false，可用 flag 效果设为 true |

## 选项效果

| effects 元素 | 真实行为 |
| --- | --- |
| `{ "kind": "meet", "target": "primary" }` | 与在场存活 NPC 相识；target 也可为 companion |
| `{ "kind": "learn" }` | 学会入门功法；已学会时拒绝重复执行 |
| `{ "kind": "flag", "key": "my_scene_seen" }` | 将 manifest 中声明的标记设为 true |
| `{ "kind": "agreement" }` | 校验邀请条件并记录现有的三人同行条款 |

没有任意状态赋值、随机脚本、金钱奖励或关系值写入接口。全部效果按一条原子游戏命令执行，有任何规则拒绝便不会写入本次修改。

## 新增一幕的最小示例

先在 `manifest.declaredFlags` 加入 `heard_rain`，再把以下节点放在两种 `reunion-*` 之后、`agreement` 之前：

```json
{
  "id": "rain-after-promise",
  "eyebrow": "闲谈 · 雨后",
  "title": "檐下一阵雨",
  "body": "{{primary.name}}收起药谱，与你说起雨后山路。短短一席话，不必总是为了出发。",
  "portrait": true,
  "visualId": "scene.market.dusk",
  "portraitId": "portrait.primary",
  "conditions": [
    { "fact": "location", "op": "eq", "value": "market" },
    { "fact": "primaryPresent", "op": "eq", "value": true },
    { "fact": "reunion", "op": "eq", "value": true },
    { "fact": "hasAgreement", "op": "eq", "value": false },
    { "fact": "heard_rain", "op": "eq", "value": false }
  ],
  "choices": [{
    "id": "listen-rain",
    "label": "再坐片刻",
    "hint": "闲谈 · 不消耗时间",
    "effects": [{ "kind": "flag", "key": "heard_rain" }],
    "reply": "雨停了。你们各自起身，把这段清静留在身后。"
  }]
}
```

这是作者扩展示例，默认故事未加入这一幕。将标记置 true 后它会退出候选。更靠前的专门节点如果仍满足条件，会优先展示；测试时需检查这一点。

## 图片与世界的边界

每个故事节点必须有 `visualId`，显示人物时需有 `portraitId`。地点与三种展示过场也各自引用视觉 ID。映射无效时构建报错；浏览器临时加载失败时用替代文字保留阅读与选择入口。

四个地点 ID、两个角色位和已有规则命令是当前引擎契约。`manifest.files` 的入口路径也是固定格式。不要把大纲中的任意段落、`next` 字段或新命令当作已支持接口。
