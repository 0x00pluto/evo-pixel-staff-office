# art/ — 作者工作区（不进 dist / npx）

本目录给人和编辑器用，**不是** Vite `public/`。打包预览只会带走 `public/`。

```
art/
  maps/                 Tiled 工程（不参与打包扫描）
    maps.tiled-project
  tilesets/             图集源：一类一目录 → 打成一份交货图集
    office-anim/        # 示例：会换帧的条带（植物等）
      raw/              # 原始稿：WA 抠格、.piskel（不进合成）
      src/              # 合成条带 PNG（横=占格，竖=帧）
      manifest.json
    couches/            # 示例：沙发 couches（静态家具）
      raw/
      src/
      manifest.json
```

| Pack 目录 | 中文 | 用途 |
|-----------|------|------|
| `office-anim/` | 办公室动画 | 会换帧的条带（盆栽等）；**animation 在 Tiled 里绑** |
| `couches/` | 沙发 | 几乎定稿的家具 |

二者都是真实可扫目录：`pnpm pack:art-tilesets` 会打出对应的 `public/.../office-anim.*` 与 `couches.*`（`couches` 在 `src/` 放进 PNG 之前几乎是空图）。

| 路径 | 用途 |
|------|------|
| [`maps/maps.tiled-project`](./maps/maps.tiled-project) | **唯一** Tiled 工程入口（`folders` → `../../public/assets/maps`） |
| `maps/maps.tiled-session` | 本机会话（gitignore） |
| [`tilesets/<pack>/raw/`](./tilesets/) | **原始稿**（抠格 PNG、`.piskel`）；入库；**永不**扫进 pack |
| [`tilesets/<pack>/src/`](./tilesets/) | **合成条带**（仅顶层 `*.png`）；打包器只读这里 |
| [`tilesets/<pack>/`](./tilesets/) | append-only `manifest.json`；**目录名 = 输出 tileset 名** |

## 图集打包（多目录）

1. 在 `art/tilesets/` 下新建目录，例如 `couches/`（与 `office-anim` 同级）
2. 原始稿放 `raw/`；导出条带放 `src/*.png`（RGBA，宽高为 32 倍数；横=占格，竖=帧）+ `manifest.json`（可复制 `office-anim` 的模板）
3. `pnpm pack:art-tilesets`（或 `pnpm gen:assets`）
4. 交货：`public/assets/maps/tilesets/<pack>.{png,tsj}`
5. 进地图：Tiled unpack → Add External → 铺瓦片保存 → `pnpm gen:assets`（会 **自动同步** Phaser 预加载列表）
6. **绑动画**：在 Tiled 打开 `public/.../<pack>.tsj` → Tile Animation Editor；打包器**不**自动写 playlist

### 规则

- **`raw/` 不进合成**：WA 抠格、Piskel 工程只放 `raw/`；**不要**把原抠格丢进 `src/`（打包器会当成新条带 append）。
- **`src/` 只放条带**：仅顶层 `*.png`；`.piskel` / 子目录放错会警告。
- **一类一目录**；沙发、植物、灯不要混进同一个 pack（心智清晰；常改帧的与几乎定稿的可分开）。
- **紧贴打包**：新条带按空位紧贴放置；不预留空行。
- **第 0 帧钉死**：地图铺的是第 0 帧格子；加帧时优先往脚下长，脚下被占则**只把多出的帧**塞到别处，**不搬家第 0 帧**，桌上已铺物件不用重刷。
- **终身占格**：某条目占用过的格子永久归它（缩帧、删源 PNG 也留洞），别人不能踩；碎片用 `<pack>-2/` 消化。
- **加宽占格**：`cols` 不能原地改（会动第 0 帧 footprint）→ 新文件名 append，地图改铺。
- **硬顶 2048**：宽高均 ≤2048px（`maxAtlasHeightPx` 默认即上限；`columns×32` 同限）。超限请新建 `art/tilesets/<name>-2/`，不要改已锁定的 `columns`。
- **顺序锁定**：`manifest.entries` 只追加；`frames[]` / `owned[]` 记录帧位置与终身占用。
- **`.tsj` 合并保留**：`pnpm pack:art-tilesets` 会更新 PNG 与几何字段，但**保留**已有 `tiles[]`（含你在 Tiled 绑的 animation / properties）。新条带要自己在 Tiled 再绑 playlist；`defaultDurationMs` 仅作作者备忘。
- 打包器**只扫** `art/tilesets/*/manifest.json` + 对应 `src/*.png`，不会碰到 `raw/` 或 `art/maps/`。

详见 [`docs/map-editing.md`](../docs/map-editing.md)「作者工作区」。
