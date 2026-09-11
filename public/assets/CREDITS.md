# 像素素材说明

本目录为游戏运行用切片与地图（**不是** itch / 上游原包 zip）。

## 运行时文件（当前）

| 文件 / 目录 | 说明 |
|---|---|
| `maps/company-a.json` | 公司主图（Tiled 正交 32×32，多层） |
| `maps/outside-stub.json` | 室外/园区桩图（往返办公室） |
| `maps/registry.json` | 地图 id 注册表（与 `src/game/mapRegistry.ts` 对齐） |
| `maps/tilesets/*.png` | WA 风 32×32 瓦片图（CC-BY-SA 3.0） |
| `characters.png` | Pipoya 64 套 × 四向 × 3 帧行走 atlas（12 列 × 64 行） |

## 历史 / 停用（可留仓，运行时不再加载）

| 文件 | 说明 |
|---|---|
| `office.png` + `office_core_atlas.json` | 旧斜侧 atlas 办公室 |
| `office-layout.json` / `office-frame-roles.json` | 旧程序布局 |
| `office.json` / `tileset.png` | 更早 Desk Essentials 试验 |

## 组装与校验

### 地图

布局由 `scripts/build-tiled-maps.mjs` 生成（可重跑）。日常门禁：

```bash
pnpm gen:assets   # 只校验 Tiled 图层 / exit / spawn；不覆盖任何 PNG
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

本仓地图布局（`company-a` / `outside-stub`）为 evo-agent-team 自绘，瓦片仍遵循上游 CC-BY-SA。

### PIPOYA FREE RPG Character Sprites 32x32

- 作者：[Pipoya](https://pipoya.itch.io/)
- 页面：[PIPOYA FREE RPG Character Sprites 32x32](https://pipoya.itch.io/pipoya-free-rpg-character-sprites-32x32)
- 许可：可个人/商业使用与修改；**禁止**再分发或转售素材本体；本仓库仅含组装后的 atlas 切片。

### （历史）办公室 atlas / Pixel Life

早期曾用维护者提供的 `office.png` atlas，以及 [Chris Perich / Pixel Life](https://christianperich.itch.io/pixel-life-office-essentials)（CC BY 4.0）试验瓦片。当前运行路径已改为 Tiled + WA 风瓦片，不再加载上述文件。
