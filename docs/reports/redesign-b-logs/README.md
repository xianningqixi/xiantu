# B 期实际执行日志

普通命令见对应名称 `.log`；`stress-before` 为原0.1.6基线，`stress-realms` 是日常/经济实现前的境界迁移阶段，`stress-final` 为完整B。`initial-*` 保留中间失败，均在执行报告中说明原因和修正。

为便于审阅，仅将失败堆栈中 data:text/javascript;base64 的内联编译模块长路径替换成 `[bundled module path omitted]`，未删去失败消息和断言。未处理原始日志位于本机 `/tmp/xiantu-b-*.log`；压力数据与原始存档分别在 `/tmp/xiantu-redesign-b-before`、`/tmp/xiantu-redesign-b-realms`、`/tmp/xiantu-redesign-b-after-final`。

浏览器3项测试通过的范围是迁移、真实生产Worker协议与经济按钮；测试刻意记录 `uiChoiceBlocked:true`，不会把旧UI缺失的仪式、实时事件流和日常按钮兼容冒充已通过。
