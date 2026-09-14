# Document index

技术文档入口。新增或改动文档后在本文件 Index 追加（或更新）一行摘要。

## Index

- `AGENTS.md`: 工作区约定、目录语义（含 `art/` 作者工作区 vs `public/` 运行时）、能力声明（含运行时花名册 POST + 用户目录持久化、出勤窄例外、公开发布 `@huyuan/pixel-office` + 25×25 世界桩图）；本仓 MCP 项目名 `Users-peng.zhi-Documents-Object-huyuan-evo-agent-team`（**先 MCP 再 Grep**）；团队 Cursor 命令见 `.cursor/commands/team/`
- `README.md`: 首要 `npx @huyuan/pixel-office`；开发路径次之；运行时花名册 / 出勤 curl 验收与数据约定；OpenAPI 见 `docs/openapi.md`；含 Tiled maps / `pack:assets` / `gen:assets` / `gen:world-stub` / 发版门禁
- `docs/dev-guide.md`: 新人开发指南——架构、数据流（RuntimeCatalog + presence + openapi）、本地启动、游戏层约定、**代码检索顺序**；**对齐 WA 人物做法**（非 24 套数量）、脚底碰撞盒 24×24；Vitest 单测（`src/**/*.test.ts`，`pnpm test`）
- `docs/openapi.md`: OpenAPI 3.1 JSON 合同用法——`GET /api/openapi.json`（无 Swagger UI）；Agent 调法（先 POST catalog 再 presence）；`pnpm gen:openapi` 防漂移；字段以 JSON 为准
- `docs/map-editing.md`: 改图交接手册——心智模型（`floorLayer`）、任务菜谱、碰撞 / exit / objects、踩坑清单；**art/maps + art/tilesets**、`pack:art-tilesets` 多目录顺序锁定；世界图为 25×25 色块桩图；WA 抠格执行清单见 `docs/workflows/crop-wa-tiles.md`
- `docs/workflows/_TEMPLATE.md`: 业务 workflow 六段骨架；新建可复跑流程时复制并改名，写完后登记本索引
- `docs/workflows/crop-wa-tiles.md`: 从 WA `tileset*_export` 只读抠格 → `temp/crops/`（`pnpm crop:tiles`）；禁止写回；晋升 `raw/` → 条带 `src/` → `pack:art-tilesets`
- `docs/map-poi.md`: 闲逛 POI；因果连通块（`CAUSAL_POI_KINDS`：print/coffee）；**站位垫**三层与情况 A/B/C；改 `.tsj` 只跑 `pnpm gen:assets`
- `docs/map-facing.md`: 朝向约定——工位 spawn→computer vs POI `dwellFacing`（up/down/left/right；漏标朝南）；不用 `direction`/`facing`
- `art/`: 作者工作区——`maps/`（Tiled 工程）、`tilesets/<pack>/raw/`（原始稿）+ `src/`（合成条带）+ manifest；不进 dist / npx
- `public/assets/CREDITS.md`: WA 风瓦片（CC-BY-SA 3.0）、Pipoya、缝合像素 Fusion Pixel（HUD 字体 OFL）署名；世界图为 25×25 桩图；village 仅办公室两 PNG 进发行版
- `public/fonts/`: Fusion Pixel 12px proportional zh_hans（`src/index.css` `@font-face`）
- `public/assets/maps/`: `company-25`（≤25）/ `world-map`（25×25 色块桩图）；`tilesets/*.png` + **共享 `*.tsj`（collides）** + 办公室用 village 两 PNG + `world-stub.png` + 生成的 `art/tilesets` 图集；交接见 `docs/map-editing.md`
- `src/game/mapRegistry.ts`: 地图 id 注册（含 `kind: office | world`）+ `selectOfficeMapId` 分档选图
- `src/catalog/skinCount.json`: 皮肤池大小 `SKIN_COUNT`（现 64，可扩；与 manifest / pack 对齐）
- `docs/wa-reference.md`: WA 双参考仓查找约定——**首选 Codebase Memory MCP**（`workadventure` / `wa-village`），MCP 不可用或图缺口再降级读本机文件；勿拷 `play/` / 脚本 / scavenger；本地测试可用 `pnpm import:wa-world`
- **参考项目（本机）**: `…/参考项目/workadventure`（引擎）+ `…/参考项目/wa-village`（Map Starter）；查法见 `docs/wa-reference.md`；引擎路径表见 `docs/map-editing.md`
- `specs/prds/prd-wiki-index.md`: PRD 索引（产品经理落盘后追加）
- `specs/prds/prd-00001-office-asset-redesign.md`: （历史验收）Pixel Life / Pipoya 素材重布——**勿当现行工作流**
- `specs/prds/prd-00002-tiled-office-world.md`: （历史验收）WA 风 Tiled 多层办公室——**勿当现行工作流**；现行见 `docs/map-editing.md`
- `specs/prds/prd-00003-pixel-hud.md`: 像素 HUD（工牌常显 + 顶栏/详情卡）与脚底阴影；工程 accepted（R0）
- `specs/prds/prd-00004-world-map.md`: 用 wa-village 园区替换室外桩图；世界图不显示员工；本地测试导入原图；工程 backlog
- `specs/prds/prd-00005-team-at-work.md`: 团队在岗——一人一桌、工作默认、工牌 status 行；不做坐下/CEO/siblings 排座；工程 partial（R0；工牌 UI 仅名字）
- `specs/prds/prd-00006-meaningful-wander-events.md`: 有意义闲逛——solo 差事软占 + meeting 集体事件（arity×place）；工程 accepted（R0）
- `specs/prds/prd-00007-live-presence.md`: 实时出勤——完工必 blocked；大屏点击已读灭黄；working 600s / blocked 3600s TTL；工牌/活锁/稀疏气泡；工程 backlog
- `specs/prds/prd-00008-runtime-catalog.md`: 运行时花名册——无本地 JSON 可启动；`POST /api/catalog` + 用户目录持久化；顶栏选文件；工程 accepted（R0）
- `specs/prds/prd-00009-npx-publish.md`: 公开发布 `@huyuan/pixel-office`；R0 预构建 + pack 门禁；世界图为 25×25 色块桩图（相对初稿「不含 world-map」的工程取舍见验收章）
- `.cursor/commands/team/`: Vibecoding 团队命令（产品 / 验收 / 游戏前端 / 测试 / 自主交付）；母版维护于 Obsidian Vibecoding 库
