# maps/ — Tiled 工作区（也是运行时资源）

| 文件 | 用途 |
|------|------|
| `company-25.json` | **主图（≤25 人）** — 布局；tileset 属性由 pack 灌入 |
| `world-map.json` | **世界园区图**（`kind: world`；`pnpm import:wa-world`） |
| `registry.json` | map id 注册（含 `kind`） |
| `tilesets/*.png` | 办公室瓦片图（地板在 **tileset1.png**） |
| `tilesets/*.tsj` | **共享 tileset + collides（办公室；打标只改这里）** |
| `tilesets/village/*.png` + `*.tsj` | 园区瓦片与共享 tileset（`pnpm import:wa-world` 一并写出） |
| `reference/` | WA 对照（不进游戏） |

## 碰撞（共享 .tsj）

1. Tiled 打开 `tilesets/tileset1-repositioning.tsj`（或其它办公室 `.tsj`）
2. Custom Properties 加 `collides`（bool）— **不要**填 Class
3. Save → `pnpm pack:tilesets` 或 `pnpm gen:assets`
4. `pnpm dev:office` 硬刷新

批量：`pnpm annotate:collides`。Phaser 只读 pack 后的 embedded 地图。世界图 tileset 已 embedded，一般不走 `.tsj`。

## 人数分档

| 档 | 人数 | map id | 状态 |
|----|------|--------|------|
| S | ≤10 | `company-10` | 预留 → `company-25` |
| M | ≤25 | `company-25` | **已落地** |
| L | ≤100 | `company-100` | 预留 → `company-25` |
| 世界 | — | `world-map` | **已落地**（不显示员工） |

## 最短路径

1. 改办公室：Tiled → `company-25.json`
2. 改碰撞：Tiled → `tilesets/*.tsj`
3. 重置世界图：`pnpm import:wa-world`
4. `pnpm gen:assets` → `pnpm dev:office` → 硬刷新

完整约定见 [`docs/map-editing.md`](../../../docs/map-editing.md)。
