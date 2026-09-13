# 从 WA 图集抠格

无原文件时，从 `tileset*_export.png` **只读**抠出矩形瓦片到 `temp/crops/`，再晋升到 `art/tilesets/<pack>/raw/`、编辑后导出条带到 `src/` 再 pack。禁止手改或写回 WA 图集 PNG。背景见 [`docs/map-editing.md`](../map-editing.md)「从 WA 图集抠格」。

## 入口

```bash
pnpm crop:tiles extract --help
# 实现：scripts/crop-tiles.mjs（故意无 stamp/apply；传了会失败）
```

## 参数

| 参数 | 说明 |
|---|---|
| `--from` | 短名 → `public/assets/maps/tilesets/<name>.png`，或 PNG 路径 |
| `--id` | Tiled local tile id（物体**左上角**）；与 `--x/--y` 二选一 |
| `--x` / `--y` | 左上角格子列/行（0-based）；像素 Rectangle÷32 |
| `--w` / `--h` | 占格宽/高（横×竖，默认 1×1） |
| `--out` | 输出 PNG，例 `temp/crops/coffee-machine.png` |

多格物体：下一行同列 id = 当前 id + 图集列数（如 `tileset6_export` 为 10 列，65 下方同列是 75）。

## 日常步骤

1. Tiled 打开对应 `.tsj`，选中物体**左上角**格，读 Tile ID 与 Rectangle（或列/行）。
2. 确认占格：`--w` = 横几格，`--h` = 竖几格（勿颠倒）。
3. **只跑一条** extract，不要多裁对照图：

```bash
pnpm crop:tiles extract \
  --from tileset6_export \
  --id <左上ID> --w <横> --h <竖> \
  --out temp/crops/<name>.png
```

4. 目测输出：宽高应为 `w*32` × `h*32`，内容是目标物体，无邻格杂物。
5. （抠完之后）拷进 `art/tilesets/<pack>/raw/`（入库原始稿）→ Piskel / Aseprite 工程也放 `raw/` → 导出**条带** PNG（横=占格，竖=帧）到 `src/` → `pnpm pack:art-tilesets` → Tiled 铺新图层。**不要**把原抠格直接丢进 `src/`。本步不在「仅抠格」范围内。

## 产物

- `temp/crops/*.png`（gitignore；一次性刮板）
- 晋升后：`art/tilesets/<pack>/raw/`（入库）；条带在 `src/`（进 pack）

## 失败排查

| 现象 | 处理 |
|---|---|
| 横竖反了 / 只抠到半截 | 核对「横×竖」→ `--w` / `--h`；以左上角为起点向下向右扩展 |
| 下半格是柜子或其它家具 | 起点选错；用物体最上格的 id，不要用底格当 `--id` |
| 多裁了 context / 对照图 | 停；删多余文件；只保留一篇 `--out` |
| `stamp` / `apply` / 手改 `tileset*_export.png` | 禁止；脚本会失败；改完应进 `art/tilesets/<pack>/raw/` + 条带进 `src/` |
| 原抠格丢进 `src/` | 会当成新条带 append；应放 `raw/`，只把导出条带放 `src/` |
| 找不到脚本 | `package.json` 的 `crop:tiles`；先读本篇再动手，勿先试裁 PNG |

## 测试

```bash
# 咖啡机：ID 65 + 75（1×2）→ 32×64
pnpm crop:tiles extract \
  --from tileset6_export \
  --id 65 --w 1 --h 2 \
  --out temp/crops/coffee-machine.png

# 打印机：ID 50 起横 3 × 竖 2 → 96×64
pnpm crop:tiles extract \
  --from tileset6_export \
  --id 50 --w 3 --h 2 \
  --out temp/crops/printer.png
```

目测两图无马桶、无邻柜；尺寸分别为 32×64 与 96×64。
