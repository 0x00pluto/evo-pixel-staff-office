# 像素素材说明

本目录为游戏运行用切片与地图（**不是** itch / 上游原包 zip）。

## 运行时文件

| 文件 / 目录 | 说明 |
|---|---|
| `maps/company-25.json` | 公司主图（≤25 人，WA starter 静态桌） |
| `maps/world-map.json` | 世界图：**25×25 色块桩图**（蓝底 + 中间白格回办公室；`pnpm gen:world-stub`） |
| `maps/registry.json` | 地图 id 注册表（与 `src/game/mapRegistry.ts` 对齐；含 `kind`） |
| `maps/tilesets/*.png` | WA 风 32×32 瓦片图（地板在 **tileset1.png**；CC-BY-SA 3.0） |
| `maps/tilesets/world-stub.png` | 世界桩图两色瓦片（蓝 / 白） |
| `maps/tilesets/village/` | 办公室仍用的切片：`fountain-sculptures.png`、`decor-rugs-1.png`；其余 PNG 可留在 git 供 `import:wa-world`，**不进** npm dist |
| `maps/tilesets/*.tsj` | 共享 Tiled tileset（`collides` 一处维护；`pnpm pack:tilesets` 灌进地图） |
| `maps/tilesets/skins/*.png` | WA starter 皮肤色块（调色板备用，默认未挂进运行时 tileset 列表） |
| `maps/reference/` | WA starter / chatzone / collections 对照（不进游戏 / 不进 npm） |
| `characters.png` | Pipoya 行走 atlas（**已入库的最终产物**；12 列 × `SKIN_COUNT` 行，现 64）。协作者直接用此文件，无需原包 |

旧 atlas 办公室（`office.png` / `office-layout.json` 等）已从仓库删除。

## 组装与校验

### 地图

主图视觉：`pnpm import:wa-company`（从 WA starter 导入）。日常改图用 Tiled 保存 JSON。日常门禁：

```bash
pnpm gen:assets   # pack tilesets/*.tsj → 校验图层 / exit / spawn；不覆盖 PNG
```

### Pipoya 角色（维护者偶发重打）

**日常开发不需要这一步**——仓库已含 `characters.png`。仅当改皮肤清单 / 扩池时：

原包解压到 `temp/vendor/pipoya/`（gitignore，**永不入库**；许可禁止再分发素材本体）或设 `EVO_VENDOR_PIPOYA`。清单见 `scripts/pipoya-64-manifest.txt`（行数须等于 [`src/catalog/skinCount.json`](../src/catalog/skinCount.json) 的 `SKIN_COUNT`）：

```bash
pnpm pack:assets   # → 覆盖 characters.png；提交该 PNG 即可，协作者只拉 atlas
```

扩池（如 128）：加长 manifest → 改 `skinCount.json` →（可选）`EVO_SKIN_COUNT=128` → `pnpm pack:assets` → 提交新 atlas。对齐的是 WA **帧/碰撞做法**，不是 WA 默认 24 套数量。

## 署名与许可

### WorkAdventure starter 瓦片（`maps/tilesets/`）

- 作者：[Valdo Romao](https://www.linkedin.com/in/valdo-romao/)
- 来源：[WorkAdventure](https://github.com/workadventure/workadventure) starter maps assets（`maps/assets/*.png`）
- 许可：[CC-BY-SA 3.0](http://creativecommons.org/licenses/by-sa/3.0/)
- 约束：衍生地图须 share-alike；**禁止**将瓦片作为独立素材包再分发；本仓库仅含游戏切片与自绘布局 JSON，**未**复制 WorkAdventure `play/` 后端或 AGPL 源码。

`company-25` 视觉层基于 WA starter `maps/starter/map.json`（CC-BY-SA）；本仓追加 exit / 命名入口 / objects。未复制 WorkAdventure `play/` AGPL 源码；`reference/collections/` 仅供对照。

### 世界桩图（运行时默认）

- 地图：`maps/world-map.json` — **25×25** 正交色块（蓝可走 / 中心两格白 = 回 `company-25`）
- 瓦片：`maps/tilesets/world-stub.png`（本仓生成；`pnpm gen:world-stub`）
- 世界图**不显示员工**；开发与 npm 发行版同一套

### WA Village 大图（可选导入，非默认运行时）

- 脚本：`pnpm import:wa-world` 自 [`wa-headquarters.tmj`](https://github.com/workadventure/wa-village) 覆盖 `world-map.json` + 拷贝 `tilesets/village/`
- **会盖掉**运行时桩图；恢复：`pnpm gen:world-stub` → `pnpm gen:assets`
- 许可：见对方仓库 `LICENSE.map` / `LICENSE.assets`；地图属性注明 **100 Roads / WA-only** 条款
- **npm 包不含** wa-village 园区大图与除办公室两 PNG 外的 village 瓦片
- 查法约定：[`docs/wa-reference.md`](../../docs/wa-reference.md)

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
