# 帮助文档

产品运行时帮助的**导航入口**。完整正文（含「给 Evo Agent」专章）只维护一份：

- 仓库内权威稿：[`src/cli/help.md`](../../src/cli/help.md)
- 运行中实例：`GET /help.md`（`/help` → `/help.md`）；curl 示例里的 origin 由服务端按当前 Host 注入

人用：打开大屏后看顶栏「复制帮助」，或浏览器打开 `{origin}/help.md`。  
Agent：读 `{origin}/help.md#agent`，再按需拉 `{origin}/api/openapi.json`。

合同细节（字段 / 枚举 / TTL）仍以 OpenAPI 为准，见 [`docs/openapi.md`](../openapi.md)。
