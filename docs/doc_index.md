# Document index

技术文档入口。新增或改动文档后在本文件 Index 追加（或更新）一行摘要。

## Index

- `AGENTS.md`: 工作区约定、目录语义、能力声明；团队 Cursor 命令见 `.cursor/commands/team/`
- `README.md`: 启动方式、技术栈、操作说明与数据约定；含 Tiled maps / `pack:assets` / `gen:assets` 校验
- `docs/dev-guide.md`: 新人开发指南——架构、数据流、本地启动、游戏层约定；**对齐 WA 人物做法**（非 24 套数量）、脚底碰撞盒 24×16
- `docs/map-editing.md`: Tiled 改办公室——**collides**、分档地图、静态工位；**WA 人物做法对照**（帧规格 / 脚底盒；池大小本仓自定）
- `public/assets/CREDITS.md`: WA 风瓦片（CC-BY-SA 3.0）、Pipoya、缝合像素 Fusion Pixel（HUD 字体 OFL）署名
- `public/fonts/`: Fusion Pixel 12px proportional zh_hans（`src/index.css` `@font-face`）
- `public/assets/maps/`: `company-25`（≤25）/ `outside-stub`；`tilesets/*.png` + **共享 `*.tsj`（collides）**；见 `docs/map-editing.md`
- `src/game/mapRegistry.ts`: 地图 id 注册 + `selectOfficeMapId` 分档选图
- `src/catalog/skinCount.json`: 皮肤池大小 `SKIN_COUNT`（现 64，可扩；与 manifest / pack 对齐）
- **参考项目（本机，勿拷 play/）**: `/Users/peng.zhi/Documents/Object/参考项目/workadventure`（相对本仓 `../../参考项目/workadventure`）；地图蓝本 `maps/starter/`；人物**做法**对照 `play/src/pusher/data/woka.json`（默认 24 只是对方池大小，不是本仓上限）
- `specs/prds/prd-wiki-index.md`: PRD 索引（产品经理落盘后追加）
- `specs/prds/prd-00001-office-asset-redesign.md`: （历史验收）Pixel Life / Pipoya 素材重布——**勿当现行工作流**
- `specs/prds/prd-00002-tiled-office-world.md`: （历史验收）WA 风 Tiled 多层办公室——**勿当现行工作流**；现行见 `docs/map-editing.md`
- `specs/prds/prd-00003-pixel-hud.md`: 像素 HUD（工牌常显 + 顶栏/详情卡）与脚底阴影；工程 accepted（R0）
- `.cursor/commands/team/`: Vibecoding 团队命令（产品 / 验收 / 游戏前端 / 测试 / 自主交付）；母版维护于 Obsidian Vibecoding 库
