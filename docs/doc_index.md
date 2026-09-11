# Document index

技术文档入口。新增或改动文档后在本文件 Index 追加（或更新）一行摘要。

## Index

- `AGENTS.md`: 工作区约定、目录语义、能力声明；团队 Cursor 命令见 `.cursor/commands/team/`
- `README.md`: 启动方式、技术栈、操作说明与数据约定；含 Tiled maps / `pack:assets` / `gen:assets` 校验
- `docs/dev-guide.md`: 新人开发指南——架构、数据流、本地启动、游戏层约定、常改落点与坑
- `docs/map-editing.md`: Tiled 可视化改办公室地图——工具、图层/碰撞/exit 约定、预览回流；为何不用 WA 在线编辑器
- `public/assets/CREDITS.md`: WA 风瓦片（CC-BY-SA 3.0）与 Pipoya 署名；旧 atlas 停用说明
- `public/assets/maps/`: Tiled `company-a` / `outside-stub` JSON、`registry.json`、tilesets
- `src/game/mapRegistry.ts`: 地图 id → JSON 路径静态注册表（exit 只引用 id）
- `specs/prds/prd-wiki-index.md`: PRD 索引（产品经理落盘后追加）
- `specs/prds/prd-00001-office-asset-redesign.md`: 用 Pixel Life 重布分区办公室，用 Pipoya 64 套替换员工小人
- `specs/prds/prd-00002-tiled-office-world.md`: WA 风 32×32 瓦片 + Phaser Tiled 多层；一家公司多房间与室外桩图往返
- `.cursor/commands/team/`: Vibecoding 团队命令（产品 / 验收 / 游戏前端 / 测试 / 自主交付）；母版维护于 Obsidian Vibecoding 库
