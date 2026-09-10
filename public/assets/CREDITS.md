# 像素素材说明

本目录为游戏运行用切片与 atlas（**不是** itch 原包 zip/rar）。

## 文件

| 文件 | 说明 |
|---|---|
| `office.png` | 办公室家具 TexturePacker 风格雪碧图（1254×1254） |
| `office_core_atlas.json` | Hash atlas（`office_core_001`…），供 Phaser `load.atlas` |
| `office-frame-roles.json` | 语义角色 → 帧名映射（地板/墙/桌/植物等） |
| `office-layout.json` | 分区办公室摆件、碰撞、spawn / computer |
| `characters.png` | Pipoya 64 套 × 四向 × 3 帧行走 atlas（12 列 × 64 行） |

旧版 `tileset.png` / `office.json`（Desk Essentials 瓦片地图）已弃用，可忽略。

## 组装与生成

### 办公室 atlas

将 `office.png` 与 `office_core_atlas.json` 放入本目录（`meta.image` 须为 `office.png`）。改角色映射后重跑：

```bash
pnpm gen:assets
```

只写出 `office-layout.json`，**不会**覆盖 `office.png` / `characters.png`。

### Pipoya 角色

原包解压到 `temp/vendor/pipoya/`（或 `EVO_VENDOR_PIPOYA`），清单见 `scripts/pipoya-64-manifest.txt`：

```bash
pnpm pack:assets
```

## 署名与许可

### 办公室 atlas（`office.png`）

本仓库使用的办公室雪碧图 / atlas 由维护者提供并入库为游戏切片。请在分发时保留本 CREDITS；勿将雪碧图作为独立素材包再分发（若上游另有条款，以其为准）。

### PIPOYA FREE RPG Character Sprites 32x32

- 作者：[Pipoya](https://pipoya.itch.io/)
- 页面：[PIPOYA FREE RPG Character Sprites 32x32](https://pipoya.itch.io/pipoya-free-rpg-character-sprites-32x32)
- 许可：可个人/商业使用与修改；**禁止**再分发或转售素材本体；本仓库仅含组装后的 atlas 切片。

### （历史）Pixel Life Desk Essentials

早期原型曾用 [Chris Perich / Pixel Life](https://christianperich.itch.io/pixel-life-office-essentials)（CC BY 4.0）生成临时瓦片；当前运行路径已改用 `office.png` atlas，不再依赖 Desk Essentials。
