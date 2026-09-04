---
name: skillNetworkName
desc: skillNetworkDesc
builtin: true
---

# 联网

本技能提供发起 HTTP 请求与网页搜索的能力，以获得实时网页/接口数据。

- **fetch\_url**：由 MyZone 主进程发起，不受网页跨域/CSP 限制。仅当需要实时数据、用户明确要求联网或任务依赖外部内容时才使用；不要用它替代本地文件读取。返回 `status` 与正文（正文截断），对大型响应用结果里的信息做概括，不要原样复述长文。

- **web\_search**：搜索获取最新信息，返回 `answer` 与若干搜索结果（标题/链接/摘要）。需要最新资讯、事实核查或联网检索时优先用它，并在回答中给出来源链接。

执行纪律：

- 发起 GET 之外的方法（POST/PUT/DELETE 等）需用户确认。

