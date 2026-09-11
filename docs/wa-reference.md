# WA 参考仓查找约定

本仓对齐的是 **地图分层 / 瓦片 / 人物帧与碰撞做法**，不是 WA 产品本身。本机有两套互补参考仓；查法见本文，引擎仓蓝本路径表见 [`docs/map-editing.md`](./map-editing.md)「参考路径速查」。

**禁止**把 WA `play/` 后端、聊天、Jitsi、AGPL 源码，或 village 的 `src/` 地图脚本 / `scavenger/` **拷进本仓**。

**本地测试例外（PRD-00004）：** 允许用 `pnpm import:wa-world` 导入 `wa-headquarters.tmj` + **运行所需** tileset PNG 到 `public/assets/maps/world-map.json` 与 `tilesets/village/`。公开仓库 / 商用前须换图或取得授权（见 [`CREDITS.md`](../public/assets/CREDITS.md)）。village 许可见对方仓库根下 `LICENSE.*`。

## 两套参考仓

| 项目 | MCP 项目名 | 本机绝对路径 | 相对本仓 | 主要对照什么 |
|------|------------|--------------|----------|--------------|
| WorkAdventure 引擎仓 | `workadventure` | `/Users/peng.zhi/Documents/Object/参考项目/workadventure` | `../../参考项目/workadventure` | 人物帧/碰撞、`play/src`、starter 小图蓝本 |
| Map Starter / Village | `wa-village` | `/Users/peng.zhi/Documents/Object/参考项目/wa-village` | `../../参考项目/wa-village` | 大型总部图布局、`tilesets/`、`src/` 地图脚本、`wa-headquarters.tmj` |

若本机缺少目录：向维护者索取同路径克隆，或从 GitHub 克隆后把本地根写回本文与相关文档。

- 引擎仓：[workadventure/workadventure](https://github.com/workadventure/workadventure)
- Village：[workadventure/wa-village](https://github.com/workadventure/wa-village)

## 查找顺序（必须）

1. **首选 Codebase Memory MCP**（按上表选对项目名：`workadventure` 或 `wa-village`）
2. **降级读本机文件**：MCP 未接入、项目不在列表、查询失败、或目标落在「图覆盖缺口」时，再用 `Read` / `Grep`（大地图用 Tiled 打开）

不要用带中文路径派生的项目名。

## Codebase Memory MCP

### 已建索引

| 项目名 | 模式 | 规模（约） |
|--------|------|------------|
| `workadventure` | `fast`（无 similarity / semantic 边；测试与大量资源按 fast 排除） | 1.9 万节点 / 5.6 万边 |
| `wa-village` | `fast` | 105 节点 / 207 边 |

### 查询前

1. `list_projects` — 确认目标项目名存在
2. 若不存在或明显过期：重建索引（见下）
3. 再用 `search_graph` / `search_code` / `get_code_snippet` / `trace_path`，参数里一律带对应 `project`

### 重建索引

```text
index_repository(
  repo_path="/Users/peng.zhi/Documents/Object/参考项目/workadventure",
  name="workadventure",
  mode="fast"
)

index_repository(
  repo_path="/Users/peng.zhi/Documents/Object/参考项目/wa-village",
  name="wa-village",
  mode="fast"
)
```

需要更完整的相似边 / 语义边时，可再跑 `mode="full"`（更慢）。

### workadventure：图里有什么 / 没有什么

**优先用 MCP：**

- `play/src/` 人物与 Phaser（如 `Character.ts`）
- pusher 数据（如 `woka.json`）
- 地图 JSON 蓝本等可解析源码

**即使 MCP 可用，也直接读文件：**

| 缺口 | 典型用途 |
|------|----------|
| WA `docs/` | `entry-exit.md`、`wa-maps.md`、Tiled 入门 |
| `maps/assets/` | tileset PNG、`Special_Zones.png` |
| `play/public/` | Woka 精灵目录、换装资源、collections |
| 测试 / 图片 / 音视频 | 对照用资源，fast 模式本来就不进图 |

### wa-village：图里有什么 / 没有什么

**优先用 MCP：**

- `src/` 地图脚本（如 `main.ts`、分区脚本）

**即使 MCP 可用，也直接读文件（瓦片与大地图）：**

| 缺口 | 典型用途 |
|------|----------|
| `tilesets/` PNG | 瓦片构图对照 |
| `wa-headquarters.tmj` 及预览图 | 大型总部图层 / 布局；大 `.tmj` 优先用 Tiled 打开 |
| `public/` | 静态资源（fast 常整目录排除） |

缺索引时不要猜：先 `index_status(project="…")`，再决定是否重建或直接读文件。

## 最短示例

### 人物碰撞盒（引擎仓）

1. MCP：`search_graph(project="workadventure", name_pattern=".*Character.*")`
2. 取到准确符号后：`get_code_snippet(project="workadventure", qualified_name=…)`
3. 失败或 MCP 不可用：读本机  
   `…/workadventure/play/src/front/Phaser/Entity/Character.ts`  
   （WA 脚底盒约 16×16；本仓高 24 × 宽 24，见 [`docs/dev-guide.md`](./dev-guide.md)）

### 总部图层命名（Village）

1. MCP：`search_code(project="wa-village", …)` 或 `search_graph` 查 `src/` 脚本里对图层/区域的引用
2. 失败或要看完整图层表：本机用 Tiled 打开 `…/wa-village/wa-headquarters.tmj`（不要指望 MCP 替代大地图编辑）

## 相关文档

| 文档 | 用途 |
|------|------|
| [`docs/map-editing.md`](./map-editing.md) | Tiled 工作流 + 引擎仓路径速查表 |
| [`docs/dev-guide.md`](./dev-guide.md) | 本仓人物做法与碰撞约定 |
| [`public/assets/CREDITS.md`](../public/assets/CREDITS.md) | 瓦片许可与署名 |
