---
name: skillScriptName
desc: skillScriptDesc
builtin: true
---

# 代码执行

本技能执行 JavaScript（网页版仅提供隔离沙箱形态）：

- **run_script（隔离沙箱）**：在 Worker 中运行，**无 DOM / 无浏览器自动化 / 无网络**，只能纯计算（数据处理、算法、数学）。

执行契约：
- 用 `return <表达式>;` 返回结果；支持顶层 `await`。
- 纯计算请用 run_script；它安全、无需确认，适合对返回的数据做加工、排序、统计等。
- 结果会序列化回填模型，过大输出会被截断。