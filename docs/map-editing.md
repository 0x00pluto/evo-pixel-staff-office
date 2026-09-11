# 办公室地图编辑指南

面向美术与工程师：用 **Tiled** 可视化改本仓办公室 / 室外桩图，保存后本地预览即可看到效果。不依赖 Agent 重算布局，也不使用 WorkAdventure 在线编辑器。

产品规格见 [`specs/prds/prd-00002-tiled-office-world.md`](../specs/prds/prd-00002-tiled-office-world.md)。

## 需要什么工具

| 工具 | 是否必需 | 用途 |
|------|----------|------|
| [Tiled Map Editor](https://www.mapeditor.org/) 1.3+ | **必需** | 铺地板/墙/家具、标碰撞、做出入口 |
| 本仓地图 JSON + tileset PNG | **必需** | 见下方「本仓文件」 |
| `pnpm dev`（本仓） | **必需** | 改完刷新浏览器验收 |
| `pnpm gen:assets` | 建议 | 校验图层 / exit / spawn，不写 PNG |
| Piskel / Aseprite / Krita | 按需 | 自绘或改 32×32 瓦片 |
| WorkAdventure Inline Editor | **不需要** | 见「为何不用在线编辑器」 |
| WA Map Starter Kit 上传 | **不需要** | 本仓不发布到 WA 服务器 |

地图是 **正交、32×32**。Tiled 里请保持该设置。

## 本仓文件在哪

| 路径 | 说明 |
|------|------|
| [`public/assets/maps/company-a.json`](../public/assets/maps/company-a.json) | 唯一公司主图（多房间办公室） |
| [`public/assets/maps/outside-stub.json`](../public/assets/maps/outside-stub.json) | 室外/园区桩图（出门往返） |
| [`public/assets/maps/registry.json`](../public/assets/maps/registry.json) | map id → JSON 路径；exit 只引用 id |
| [`public/assets/maps/tilesets/`](../public/assets/maps/tilesets/) | `tileset1.png` 等 WA 风瓦片 + `Special_Zones.png` |
| [`src/game/mapRegistry.ts`](../src/game/mapRegistry.ts) | 运行时注册表（与 `registry.json` 对齐） |
| [`src/game/OfficeScene.ts`](../src/game/OfficeScene.ts) | 加载 Tilemap、碰撞、切图 |
| [`public/assets/CREDITS.md`](../public/assets/CREDITS.md) | 瓦片许可与署名 |

地图 JSON 内 tileset 的 `image` 为相对路径（如 `tilesets/tileset1.png`）。用 Tiled 打开 JSON 时，请从 `public/assets/maps/` 打开，保证相对路径能解析到 PNG。

## 日常改图流程

```text
1. 安装并打开 Tiled
2. File → Open → public/assets/maps/company-a.json
   （或 outside-stub.json）
3. 在对应图层上铺瓦 / 改 objects
4. File → Save（保持 JSON 格式；勿只存成 .tmx 却不提交 JSON）
5. 终端：pnpm gen:assets   # 校验，不应改写任何 PNG/JSON
6. 终端：EVO_AGENT_CATALOG=… pnpm dev
7. 浏览器硬刷新，拖相机检查房间、碰撞、出门再回来
8. 把改过的 .json（若改了瓦片则含 .png）提交进仓库
```

**反映修改：** Phaser 直接读 `public/assets/maps/*.json`。保存进仓库并刷新开发页即可，无需单独「编译地图」。

工程师若用脚本从零重建地图：[`scripts/build-tiled-maps.mjs`](../scripts/build-tiled-maps.mjs)（会写 JSON）。日常美术改图**不要**依赖该脚本覆盖手摆结果。

## 图层约定（本仓）

当前 `company-a` / `outside-stub` 图层如下。`pnpm gen:assets` 至少要求存在：`floor`、`walls`、`furniture`、`collisions`、`start`、`exit`。

| 图层名 | 类型 | 美术可改？ | 作用 |
|--------|------|------------|------|
| `floor` | tile | 可 | 地板 |
| `walls` | tile | 可 | 外墙 / 隔断 |
| `furniture` | tile | 可 | 桌椅等（角色下方） |
| `aboveFurniture` | tile | 可 | 家具上方装饰 |
| `abovePlayer1` | tile | 可 | 盖在角色之上（屋顶感） |
| `collisions` | tile | **可，且必查** | 有瓦片的格子不可走（见下节） |
| `start` | tile | 慎改 | 默认出生区；至少保留若干格 |
| `office-door`（仅 company-a） | tile | 慎改 | 命名入口：`startLayer=true`；从外面回来落这里 |
| `from-office`（仅 outside-stub） | tile | 慎改 | 命名入口：从办公室出来落这里 |
| `exit` | tile | 慎改 | 踩上切图；层属性见下表 |
| `objects` | object | 可（工位） | `spawn_*` / `computer_*` 对象 |

### exit 层属性（本仓，不是 WA 的 exitUrl）

| 地图 | 层属性 | 含义 |
|------|--------|------|
| `company-a` 的 `exit` | `exitMap=outside-stub`，`entryName=from-office` | 出门 → 桩图的 `from-office` |
| `outside-stub` 的 `exit` | `exitMap=company-a`，`entryName=office-door` | 回来 → 办公室门口 |

`exitMap` 必须是 [`registry.json`](../public/assets/maps/registry.json) 里已有的 id。不要写公网 URL。

### objects（工位）

- 命名：`spawn_0`、`computer_0`、`spawn_1`、`computer_1`…  
- `company-a` 需足够工位（产品要求 ≥ 21）；人数超额时运行时 hash 复用。  
- 改工位布局时：成对移动 spawn 与 computer，并保证周围可走、不被 `collisions` 封死。

## 碰撞怎么做

碰撞写在**地图 JSON 里**，游戏读入后建成可行走网格。不需要另装碰撞软件。

### 本仓当前采用：独立 `collisions` 层（方式 B）

1. 在 Tiled 左侧选中图层 **`collisions`**  
2. 选用 `Special_Zones`（或任意约定色块瓦片）铺在**不能走**的格子上（墙脚、桌下等）  
3. 门洞、过道、exit 前方必须留空（`collisions` 为 0）  
4. 保存后运行时：该层 `gid > 0` → 不可走  

`pnpm gen:assets` 会检查 exit 附近是否仍可接近（避免门被撞死）。

### 可选：瓦片属性 `collides`（方式 A，WA 文档推荐）

在 tileset 编辑模式里给墙/桌瓦片加自定义属性 `collides`（bool = true）。本仓运行时若以 `collisions` 层为准，方式 A 可作为补充约定；改之前先与工程师确认 `OfficeScene` 是否已读 tileset 属性。

步骤说明（参考，勿拷 WA 代码）：

`/Users/peng.zhi/Documents/Object/参考项目/workadventure/docs/map-building/tiled-editor/wa-maps.md`  
（章节 *Building walls and "collidable" areas*）

## 出门 / 回来怎么验

1. `pnpm dev` 打开大屏，拖到公司大门附近  
2. 等小人踩上 `exit` 瓦片 → 应切到 `outside-stub`，镜头落到 `from-office` / `start`  
3. 再踩桩图 `exit` → 应回到 `company-a` 的 **`office-door`**，而不是办公室中心  
4. 若黑屏或报「地图未注册」：检查 `exit` 层的 `exitMap` 是否在 `registry.json` 中  

概念参考（字段名用本仓 `exitMap` / `entryName`）：

`/Users/peng.zhi/Documents/Object/参考项目/workadventure/docs/map-building/tiled-editor/entry-exit.md`

## 为何不用 WorkAdventure 在线编辑器

WA Inline Map Editor 官方定位是：在**已有地图**上摆家具、画兴趣区，**不擅长**从零铺地板/墙/碰撞；且依赖整套 WA 登录、admin/editor 权限与 `.wam` 格式。

本仓是 Phaser 本地大屏，直接吃 Tiled JSON。接在线编辑器等于再背一套产品，接不上 `OfficeScene`。

**结论：本仓标准路径 = Tiled 桌面编辑 → 提交 `public/assets/maps/`。**

## 许可提醒

当前瓦片来自 WorkAdventure starter 风格素材，许可多为 **CC-BY-SA 3.0**（衍生地图同样 share-alike）。署名与边界见 [`public/assets/CREDITS.md`](../public/assets/CREDITS.md)。不要把 tileset 当独立素材包再分发。

## 参考路径速查（结构学习用）

参考项目根（本机）：

- 绝对路径：`/Users/peng.zhi/Documents/Object/参考项目/workadventure`  
- 相对本仓根：`../../参考项目/workadventure`

| 用途 | 绝对路径 |
|------|----------|
| 分层办公室蓝本 | `…/workadventure/maps/starter/map.json` |
| 瓦片 PNG | `…/workadventure/maps/assets/tileset*.png` |
| 碰撞色块 | `…/workadventure/maps/assets/Special_Zones.png` |
| 地图硬约束 | `…/workadventure/docs/map-building/tiled-editor/wa-maps.md` |
| 进出场景 | `…/workadventure/docs/map-building/tiled-editor/entry-exit.md` |
| Tiled 入门 | `…/workadventure/docs/map-building/tiled-editor/index.md` |

只学结构与步骤，**禁止**把 `play/` 后端、聊天、Jitsi、AGPL 源码拷进本仓。完整表见 PRD 00002「参考项目路径」。

## 相关命令

```bash
pnpm gen:assets    # 校验 maps；失败会打印 FAIL；不写 PNG/JSON
pnpm pack:assets   # 仅组装 Pipoya characters.png
pnpm dev           # 本地预览
```
