# 像素素材说明

本目录为游戏运行用切片与地图（**不是** itch / 上游原包 zip）。

## 运行时文件

| 文件 / 目录 | 说明 |
|---|---|
| `maps/company-25.json` | 公司主图（≤25 人，WA starter 静态桌） |
| `maps/outside-stub.json` | 室外/园区桩图（往返办公室） |
| `maps/registry.json` | 地图 id 注册表（与 `src/game/mapRegistry.ts` 对齐） |
| `maps/tilesets/*.png` | WA 风 32×32 瓦片图（地板在 **tileset1.png**；CC-BY-SA 3.0） |
| `maps/tilesets/*.tsj` | 共享 Tiled tileset（`collides` 一处维护；`pnpm pack:tilesets` 灌进地图） |
| `maps/tilesets/skins/*.png` | WA starter 皮肤色块（调色板备用，默认未挂进运行时 tileset 列表） |
| `maps/reference/` | WA starter / chatzone / collections 对照（不进游戏） |
| `characters.png` | Pipoya 64 套 × 四向 × 3 帧行走 atlas（12 列 × 64 行） |

旧 atlas 办公室（`office.png` / `office-layout.json` 等）已从仓库删除。

## 组装与校验

### 地图

主图视觉：`pnpm import:wa-company`（从 WA starter 导入）。日常改图用 Tiled 保存 JSON。日常门禁：

```bash
pnpm gen:assets   # pack tilesets/*.tsj → 校验图层 / exit / spawn；不覆盖 PNG
```

### Pipoya 角色

原包解压到 `temp/vendor/pipoya/`（或 `EVO_VENDOR_PIPOYA`），清单见 `scripts/pipoya-64-manifest.txt`：

```bash
pnpm pack:assets   # → characters.png
```

## 署名与许可

### WorkAdventure starter 瓦片（`maps/tilesets/`）

- 作者：[Valdo Romao](https://www.linkedin.com/in/valdo-romao/)
- 来源：[WorkAdventure](https://github.com/workadventure/workadventure) starter maps assets（`maps/assets/*.png`）
- 许可：[CC-BY-SA 3.0](http://creativecommons.org/licenses/by-sa/3.0/)
- 约束：衍生地图须 share-alike；**禁止**将瓦片作为独立素材包再分发；本仓库仅含游戏切片与自绘布局 JSON，**未**复制 WorkAdventure `play/` 后端或 AGPL 源码。

`company-25` 视觉层基于 WA starter `maps/starter/map.json`（CC-BY-SA）；本仓追加 exit / 命名入口 / objects。`outside-stub` 为自绘桩图。未复制 WorkAdventure `play/` AGPL 源码；`reference/collections/` 仅供对照。

### PIPOYA FREE RPG Character Sprites 32x32

- 作者：[Pipoya](https://pipoya.itch.io/)
- 页面：[PIPOYA FREE RPG Character Sprites 32x32](https://pipoya.itch.io/pipoya-free-rpg-character-sprites-32x32)
- 许可：可个人/商业使用与修改；**禁止**再分发或转售素材本体；本仓库仅含组装后的 atlas 切片。

### 缝合像素字体 / Fusion Pixel Font（HUD）

- 字体：Fusion Pixel 12px proportional（简体中文 `zh_hans`）
- 作者：[TakWolf](https://github.com/TakWolf) / 像素字体工房
- 来源：[TakWolf/fusion-pixel-font](https://github.com/TakWolf/fusion-pixel-font)（本仓用 release `2026.09.01` 的 otf.woff2）
- 许可：[SIL Open Font License 1.1](https://github.com/TakWolf/fusion-pixel-font/blob/master/LICENSE-OFL)
- 本仓库文件：`public/fonts/fusion-pixel-12px-proportional-zh_hans.woff2`（仅入库简体中文一份，供顶栏 / 工牌 / 详情卡 / 素材错误条使用）

### （历史）办公室 atlas / Pixel Life

早期曾用维护者提供的 office atlas，以及 [Chris Perich / Pixel Life](https://christianperich.itch.io/pixel-life-office-essentials)（CC BY 4.0）试验瓦片。当前运行路径为 Tiled + WA 风瓦片，相关文件已删除。
