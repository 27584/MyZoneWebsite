---
name: skillNetworkName
desc: skillNetworkDesc
builtin: true
---
# 联网

本技能提供发起 HTTP 请求以获得实时网页/接口数据的能力。

- **fetch_url**：由 MyZone 主进程发起，不受网页跨域/CSP 限制。仅当需要实时数据、用户明确要求联网或任务依赖外部内容时才使用；不要用它替代本地文件读取。返回 `status` 与正文（正文截断），对大型响应用结果里的信息做概括，不要原样复述长文。

执行纪律：
- 发起 GET 之外的方法（POST/PUT/DELETE 等）需用户确认。