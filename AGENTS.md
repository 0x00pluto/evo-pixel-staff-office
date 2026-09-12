# evo-agent-team — 像素数字员工办公室大屏

把 AgentWikiIndex 的 `CATALOG.json` 花名册渲染成像素风办公室：每个 workspace 一个会走路的小人，显示名字与状态，点击查看详情。一行命令本地启动预览。

## 开始工作前

1. 先读 [`README.md`](./README.md) 了解启动方式与目录；文档地图见 [`docs/doc_index.md`](./docs/doc_index.md)。
2. 改动落进既有目录语义（见下表），不新增平级顶层目录。
3. 若同级存在 [`../AgentWikiIndex/`](../AgentWikiIndex/)，改完「能力声明」后执行：
   `python3 ../AgentWikiIndex/scripts/refresh_catalog.py`
   若不存在该目录，**跳过**，不要报错、不要去建。
4. 团队 Cursor 命令见 [`.cursor/commands/team/`](./.cursor/commands/team/)（产品 / 验收 / 游戏前端 / 测试 / 自主交付）；母版维护于 Obsidian Vibecoding 库，勿在本仓另起一套命令体系。
5. 查代码时 **首选 Codebase Memory MCP**，再降级全文检索：
   - 本仓：`project="Users-peng.zhi-Documents-Object-huyuan-evo-agent-team"`，用 `search_graph` / `search_code` / `trace_path` / `get_code_snippet`
   - WA 参考仓：项目名 `workadventure` / `wa-village`，约定见 [`docs/wa-reference.md`](./docs/wa-reference.md)（勿拷 `play/` / 整套 village）
   - **降级**：MCP 未接入、项目不在列表、查询失败、或目标落在图覆盖缺口（PNG / 字体 / 大地图瓦片等）时，再用 `Grep` / `Read`（大地图用 Tiled）

## 目录约定

| 目录 | 用途 | 入库 |
|---|---|---|
| `src/` | 前端、游戏、CLI、花名册映射 | 是 |
| `bin/` | `pixel-office` CLI 入口 | 是 |
| `scripts/` | 素材生成等脚本入口 | 是 |
| `public/` | 静态资源与像素素材 | 是 |
| `docs/` | 技术文档 | 是 |
| `specs/` | 产品规格（PRD 等） | 是 |
| `cache/` | 可重建缓存 | 否 |
| `temp/` | 中间产物 | 否 |
| `output/` | 最终产物归档 | 否 |

约束：`cache/`、`temp/`、`output/`、`node_modules/`、`dist/` 全部 gitignore。

## 环境

Node 用 **pnpm** 管理：`pnpm install` / `pnpm <script>`（安装命令只给用户手动执行，不代跑）。

```bash
EVO_AGENT_CATALOG=~/Documents/Codex/AgentWikiIndex/CATALOG.json pnpm dev
pnpm build
pnpm pixel-office --catalog ~/Documents/Codex/AgentWikiIndex/CATALOG.json
```

## 能力声明

| 字段 | 值 |
|---|---|
| lifecycle | active |
| owns | 像素办公室大屏；CATALOG.json 花名册可视化；pixel-office 本地一键预览 |
| not | Agent 业务实现；实时任务状态监控；发布 npm registry；SQLite/Postgres 建表（仅预留 CatalogSource 接口） |
