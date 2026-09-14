# OpenAPI 合同（给 AI / curl）

本仓 HTTP API 的机器可读说明。**合同字段、枚举、TTL 以 JSON 为准**；本文只讲怎么读、怎么调、怎么改。

- **格式**：OpenAPI **3.1** JSON
- **不要**：Swagger UI / Redoc / 其它 HTML 文档站

## 怎么读

| 方式 | 地址 |
|---|---|
| 开发（`pnpm dev`） | `http://localhost:5173/api/openapi.json` |
| 一键预览（`pnpm pixel-office`） | `http://localhost:3780/api/openapi.json` |
| 不启动服务 | 仓库内 [`public/openapi.json`](../public/openapi.json) |

```bash
curl -sS http://localhost:5173/api/openapi.json | head
```

运行时由 [`src/cli/openapi.mjs`](../src/cli/openapi.mjs) 的 `buildOpenApiDocument()` 生成；与落盘文件应一致。

## 给 Agent 怎么调

1. （可选）`GET /api/catalog` — 空态时 `agents: []` 合法。
2. `POST /api/catalog` — 注入完整 CATALOG.json（必须含 `workspaces` 数组）；成功后持久化到 `~/.pixel-office/catalog.json`。
3. `GET /api/catalog` → 取 `agents[].id`。
4. `POST /api/presence` 报到：
   - 开干 → `working`
   - 卡住 **或** 做完待验收 → `blocked`（**禁止**刚做完直接 `idle`）
   - 灭灯 / 已读 → `idle`（与大屏点黄灯等价）
5. `GET /api/presence` 自检全员有效出勤。

可选鉴权：设了 `EVO_PRESENCE_TOKEN` 时，跨机 `POST /api/catalog` 与 `POST /api/presence` 需 `Authorization: Bearer <token>`；同源浏览器可免。未设则开放。

最短 curl 示例见 [`README.md`](../README.md)「运行时花名册」与「实时出勤」节。

## 怎么改合同

1. 改实现（[`catalog.mjs`](../src/cli/catalog.mjs) / [`catalog-http.mjs`](../src/cli/catalog-http.mjs) / [`presence-store.mjs`](../src/cli/presence-store.mjs) / [`presence-http.mjs`](../src/cli/presence-http.mjs)）以及 [`src/cli/openapi.mjs`](../src/cli/openapi.mjs)。
2. 跑 `pnpm gen:openapi` 更新 `public/openapi.json`。
3. 跑 `pnpm test`：落盘 JSON 必须与 `buildOpenApiDocument()` 序列化结果一致；漏跑生成会红。

**不要手改** `public/openapi.json`（会被生成脚本覆盖；测试也会抓漂移）。

## 不要做什么

- 不要加 Swagger UI / Redoc
- 不要手改 `public/openapi.json`
- 不要把出勤写进 `CATALOG.json` / `AgentPersona`（两张表）

相关：PRD [`specs/prds/prd-00008-runtime-catalog.md`](../specs/prds/prd-00008-runtime-catalog.md)、[`prd-00007-live-presence.md`](../specs/prds/prd-00007-live-presence.md)；开发指南 [`docs/dev-guide.md`](./dev-guide.md)。
