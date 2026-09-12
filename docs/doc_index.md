# Document index

技术文档入口。新增或改动文档后在本文件 Index 追加（或更新）一行摘要。

## Index

- `AGENTS.md`: 工作区约定、目录语义（含 `art/` 作者工作区 vs `public/` 运行时）、能力声明；本仓 MCP 项目名 `Users-peng.zhi-Documents-Object-huyuan-evo-agent-team`（**先 MCP 再 Grep**）；团队 Cursor 命令见 `.cursor/commands/team/`
- `README.md`: 启动方式、技术栈、操作说明与数据约定；含 Tiled maps / `pack:assets` / `gen:assets` 校验
- `docs/dev-guide.md`: 新人开发指南——架构、数据流、本地启动、游戏层约定、**代码检索顺序**；**对齐 WA 人物做法**（非 24 套数量）、脚底碰撞盒 24×24；Vitest 单测（`src/**/*.test.ts`，`pnpm test`）
- `docs/map-editing.md`: 改图交接手册——心智模型（`floorLayer`）、任务菜谱、碰撞 / exit / objects、踩坑清单；**art/maps + art/tilesets**、`pack:art-tilesets` 多目录顺序锁定
- `docs/map-poi.md`: 闲逛 POI 约定——arity×place（solo 差事软占 vs meeting 集体事件）；命名、摆点、Tiled 菜谱、运行时语义；单一事实源
- `docs/map-facing.md`: 朝向约定——工位 spawn→computer vs POI `dwellFacing`（up/down/left/right；漏标朝南）；不用 `direction`/`facing`
- `art/`: 作者工作区——`maps/`（Tiled 工程）、`tilesets/<pack>/`（条带 + manifest）；不进 dist / npx
- `public/assets/CREDITS.md`: WA 风瓦片（CC-BY-SA 3.0）、Pipoya、缝合像素 Fusion Pixel（HUD 字体 OFL）署名；含 world-map 本地测试导入说明
- `public/fonts/`: Fusion Pixel 12px proportional zh_hans（`src/index.css` `@font-face`）
- `public/assets/maps/`: `company-25`（≤25）/ `world-map`（园区）；`tilesets/*.png` + **共享 `*.tsj`（collides）** + `tilesets/village/` + 生成的 `art/tilesets` 图集；交接见 `docs/map-editing.md`
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
- `.cursor/commands/team/`: Vibecoding 团队命令（产品 / 验收 / 游戏前端 / 测试 / 自主交付）；母版维护于 Obsidian Vibecoding 库
