# 办公室地图编辑指南

面向美术与工程师：用 **Tiled** 可视化改本仓办公室 / 世界园区图，保存后本地预览即可看到效果。不依赖 Agent 重算布局，也不使用 WorkAdventure 在线编辑器。

产品规格见 [`specs/prds/prd-00002-tiled-office-world.md`](../specs/prds/prd-00002-tiled-office-world.md)（办公室）与 [`specs/prds/prd-00004-world-map.md`](../specs/prds/prd-00004-world-map.md)（世界图）。

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
| [`public/assets/maps/company-25.json`](../public/assets/maps/company-25.json) | **主图（≤25 人）** WA starter 静态桌 + exit/入口/objects |
| [`public/assets/maps/world-map.json`](../public/assets/maps/world-map.json) | **世界园区图**（出门往返；`kind: world`；本地测试导入自 wa-village） |
| [`public/assets/maps/registry.json`](../public/assets/maps/registry.json) | map id → JSON 路径 + `kind`；exit 只引用 id |
| [`public/assets/maps/tilesets/`](../public/assets/maps/tilesets/) | 办公室瓦片调色板（地板在 **tileset1.png**；另有 skins/） |
| [`public/assets/maps/tilesets/village/`](../public/assets/maps/tilesets/village/) | 园区瓦片 PNG + **共享 `*.tsj`**（`pnpm import:wa-world`） |
| [`public/assets/maps/reference/`](../public/assets/maps/reference/) | WA starter / chatzone / collections 对照（不进游戏） |
| [`public/assets/maps/maps.tiled-project`](../public/assets/maps/maps.tiled-project) | 可选：Tiled 工程入口 |
| [`public/assets/maps/README.md`](../public/assets/maps/README.md) | 工作区一页纸 |
| [`src/game/mapRegistry.ts`](../src/game/mapRegistry.ts) | 注册表 + `selectOfficeMapId` 分档选图 |
| [`src/game/OfficeScene.ts`](../src/game/OfficeScene.ts) | 加载 Tilemap、碰撞、切图 |
| [`public/assets/CREDITS.md`](../public/assets/CREDITS.md) | 瓦片许可与署名 |

## 人数分档

| 档 | 人数 | map id | 本轮 |
|----|------|--------|------|
| S | ≤10 | `company-10` | 预留 → 回退 `company-25` |
| M | ≤25 | `company-25` | **已落地** |
| L | ≤100 | `company-100` | 预留 → 回退 `company-25` |

启动时 `selectOfficeMapId(agents.length)` 选办公室图；超过工位数则 hash 复用桌。

## 地板贴图在哪？（必读）

**没有单独的 `floor.png`。** 地板是图集里的格子：

1. Tiled 右侧 **Tilesets** 面板点选 **`tileset1`**（不要选 Special_Zones / tileset5）
2. 木地板主格 ≈ 图集左上第一格（地图 GID **201**）；变体格 GID **223**
3. 文件：[`public/assets/maps/tilesets/tileset1.png`](../public/assets/maps/tilesets/tileset1.png)

家具桌椅多在 **`tileset1-repositioning`** / **`tileset5_export`**；墙在 **`tileset5_export`**（如 58/63/73/45）。

## 协同约定（人 + Agent）

| 角色 | 做什么 |
|------|--------|
| 你（Tiled） | 在 `public/assets/maps/` 打开 JSON，摆图后 **Save**（保持 JSON） |
| Agent | 素材同步、校验、修运行时；**按你保存的 JSON 验收** |
| 预览 | `pnpm gen:assets` → `pnpm dev:office` → 硬刷新 |

硬规则：

1. 日常只在 Tiled 里 **Save JSON**，不要手写覆盖主图。
2. 从 WA starter **重置**主图：`pnpm import:wa-company`（写 `company-25.json`）。
3. 你改完后可对 Agent 说：「已保存 company-25，请按新图验收」。
4. 补瓦片库（不改地图 JSON）：`pnpm sync:map-palette`。
5. 对照家具目录：`public/assets/maps/reference/collections/`（不进 Phaser）。

## 日常改图流程

```text
1. 安装并打开 Tiled
2. File → Open → public/assets/maps/company-25.json
3. 右侧选 tileset1 铺地板；选其它 tileset 摆墙/家具
4. File → Save（保持 JSON）
5. pnpm gen:assets
6. pnpm dev:office → 浏览器硬刷新
7. 提交改过的 .json / .png
```

**反映修改：** Phaser 直接读 `public/assets/maps/*.json`，无需编译地图。

当前 `company-25` 视觉来自 **WA starter**（静态烘焙桌），**不做**运行时动态摆桌。

## 图层约定（WA 视觉 + 本仓必需）

`pnpm gen:assets` 按 `kind` 分档：

- **office**（如 `company-25`）：至少 `floor`、`walls`、`furniture`、`collisions`、`start`、`exit`。
- **world**（如 `world-map`）：至少 `collisions`、`start`、`exit`；**不**要求 walls/furniture/objects。视觉层用 Village 命名（`GroundWorld`、`AboveWorld`、`roof*` 等）。

| 图层名 | 来源 | 美术可改？ | 作用 |
|--------|------|------------|------|
| `floor` | WA | 可 | 地板（用 **tileset1**；办公室） |
| `GroundWorld` | Village | 可 | 园区地面（世界图） |
| `walls` | WA | 可 | 外墙 / 隔断（办公室） |
| `furniture` | WA | 可 | 桌椅等（角色下方；办公室） |
| `aboveFurniture` | WA | 可 | 家具上方装饰 |
| `abovePlayer1`…`3` / `AboveWorld*` / `roof*` | WA / Village | 可 | 盖在角色之上（世界图无角色仍渲染） |
| `floorLayer` | WA | 慎改 | WA objectgroup；本仓可不依赖 |
| `collisions` | 本仓约定 | **必查** | 有瓦不可走（世界图由 `collision` 改名） |
| `start` | WA / 本仓 | 慎改 | 默认出生 / 落点 |
| `office-door` | 本仓 | 慎改 | 命名入口 `startLayer=true`（办公室） |
| `from-office` | 本仓 | 慎改 | 出门落点（世界图） |
| `exit` | 本仓 | 慎改 | 切图；`exitMap` + `entryName` |
| `objects` | 本仓 | 可 | `spawn_*` / `computer_*`（company-25 ≥25；世界图不需要） |

Jitsi / clock / website / audio 等 WA 功能层**不导入**（本仓非目标）。

### exit 层属性（本仓，不是 WA 的 exitUrl）

| 地图 | 层属性 | 含义 |
|------|--------|------|
| `company-25` 的 `exit` | `exitMap=world-map`，`entryName=from-office` | 出门 → 园区的 `from-office` |
| `world-map` 的 `exit` | `exitMap=company-25`，`entryName=office-door` | 回来 → 办公室门口 |

`exitMap` 必须是 [`registry.json`](../public/assets/maps/registry.json) 里已有的 id。不要写公网 URL。

### objects（工位，静态）

**一对工位 = `spawn_N` + `computer_N`（同一数字 N）**

- `company-25` 校验 ≥25 对；美术在 Tiled 里摆好桌子与 objects。
- 人少：空桌仍在图上（静态图）。人多：hash 复用同一对。
- **已取消**运行时动态摆桌。

## 碰撞怎么做

对齐 WorkAdventure：**给瓦片加布尔属性 `collides`**（Custom Properties，不要填 Class）。

### 共享 tileset（一处打标）

碰撞属性维护在 [`public/assets/maps/tilesets/*.tsj`](../public/assets/maps/tilesets/)（Tiled JSON tileset），**不是**每张地图各改一遍。

| 操作 | 命令 / 做法 |
|------|-------------|
| 批量补常用墙/会议桌 collides | `pnpm annotate:collides`（写 `.tsj` 再 pack） |
| 手改 collides | Tiled → File → Open → 打开某个 `tilesets/*.tsj` → Custom Properties 加 `collides` bool |
| Tiled 改图（避免 tileset 成对） | `pnpm unpack:tilesets` → 打开地图 → Save → `pnpm gen:assets` |
| 灌进各地图给 Phaser | `pnpm pack:tilesets`（`gen:assets` 会自动先跑） |

Phaser **不支持** map JSON 里的 `source` 外部 tileset，所以预览 / 构建前必须 **pack 成 embedded**。

#### 为什么 Tiled 里 tileset「一对一对」？

常见两种原因：

1. **地图里挂了两份同名 tileset**（一份 embedded，又 `Add External Tileset` 加了同名 `.tsj`）。本仓 `pack` 会丢掉重名；请 **关闭 Tiled 后重新打开** `company-25.json`（Tiled 不会自动丢掉内存里的旧副本）。
2. **顶栏 Tab 打开了两份**：一份是地图里的 embedded tileset，一份是工程里的 `tilesets/*.tsj`。改 `collides` 时 **只打开 `.tsj` 文件**，不要再双击地图里的 tileset 面板。

正确改图顺序：

```bash
pnpm unpack:tilesets   # 地图改回 source → .tsj（Tiled 只显示一份）
# Tiled 打开 company-25.json / 改 .tsj → Save
pnpm gen:assets        # pack + 校验，供 Phaser 预览
```

**不要**对已经在地图上的 tileset 再点 `Add External Tileset...`。村庄装饰请优先在 `world-map` 上改，避免往 `company-25` 里乱加 `tilesets/village/*.tsj`。

### 运行时规则（本仓）

一格不可走，当且仅当：

1. 该格 `walls` / `furniture` / `aboveFurniture` / `collisions` 上瓦片的 **`collides === true`**，或  
2. **`walls` 层** `gid > 0`（兜底），或  
3. **`collisions` 层** `gid > 0`（补洞）

椅子（如 GID 340 / local id 18）默认**不**标 `collides`，方便站 spawn；座位瓦片（local 16–19）也不要批量打进 `annotate:collides`。

人物侧：本仓用脚底 **24×24** 盒查格（高 24 防贴桌 overhang；宽 24 为办公室视觉余量；见 [`docs/dev-guide.md`](./dev-guide.md)「人物碰撞」），不是整格 32×32，也不是脚底单点。

### 可选补洞：手刷 `collisions`

选 `collisions` → 工具 **`B`（图章）** → `Special_Zones` 的 `BLOCK` → 拖刷。仅用于漏标补洞。

## 出门 / 回来怎么验

1. `pnpm dev` 打开大屏，拖到公司大门附近  
2. 点大门 `exit` 瓦片（或等小人踩上）→ 应切到 `world-map`，镜头落到 `from-office` / `start`；**无员工精灵、无名牌**  
3. 再点园区办公楼门 `exit` → 应回到 `company-25` 的 **`office-door`**，员工重新 spawn  
4. 若黑屏或报「地图未注册」：检查 `exit` 层的 `exitMap` 是否在 `registry.json` 中  
5. 重置世界图：`pnpm import:wa-world`（需本机有 [`docs/wa-reference.md`](./wa-reference.md) 中的 wa-village 路径） 

概念参考（字段名用本仓 `exitMap` / `entryName`）：

`/Users/peng.zhi/Documents/Object/参考项目/workadventure/docs/map-building/tiled-editor/entry-exit.md`

## 为何不用 WorkAdventure 在线编辑器

WA Inline Map Editor 官方定位是：在**已有地图**上摆家具、画兴趣区，**不擅长**从零铺地板/墙/碰撞；且依赖整套 WA 登录、admin/editor 权限与 `.wam` 格式。

本仓是 Phaser 本地大屏，直接吃 Tiled JSON。接在线编辑器等于再背一套产品，接不上 `OfficeScene`。

**结论：本仓标准路径 = Tiled 桌面编辑 → 提交 `public/assets/maps/`。**

## 许可提醒

当前瓦片来自 WorkAdventure starter 风格素材，许可多为 **CC-BY-SA 3.0**（衍生地图同样 share-alike）。署名与边界见 [`public/assets/CREDITS.md`](../public/assets/CREDITS.md)。不要把 tileset 当独立素材包再分发。

## 参考路径速查（结构学习用）

查 WA **先用 Codebase Memory MCP**（项目名 `workadventure` / `wa-village`），MCP 不可用或图缺口（如 `docs/`、`maps/assets/`、`play/public/`、`tilesets/` PNG）再读本机文件；约定见 [`docs/wa-reference.md`](./wa-reference.md)。

参考项目根（本机）：

- 引擎仓：`/Users/peng.zhi/Documents/Object/参考项目/workadventure`（相对本仓 `../../参考项目/workadventure`）
- Village（大图 / tilesets 对照）：`/Users/peng.zhi/Documents/Object/参考项目/wa-village`（相对本仓 `../../参考项目/wa-village`）；查法见 [`docs/wa-reference.md`](./wa-reference.md)

| 用途 | 绝对路径 |
|------|----------|
| 分层办公室蓝本 | `…/workadventure/maps/starter/map.json` |
| 瓦片 PNG | `…/workadventure/maps/assets/tileset*.png` |
| 碰撞色块 | `…/workadventure/maps/assets/Special_Zones.png` |
| 地图硬约束 | `…/workadventure/docs/map-building/tiled-editor/wa-maps.md` |
| 进出场景 | `…/workadventure/docs/map-building/tiled-editor/entry-exit.md` |
| Tiled 入门 | `…/workadventure/docs/map-building/tiled-editor/index.md` |
| 人物清单（Woka） | `…/workadventure/play/src/pusher/data/woka.json` |
| 默认完整精灵目录 | `…/workadventure/play/public/resources/characters/pipoya/` |
| 分层换装目录 | `…/workadventure/play/public/resources/customisation/` |
| 人物碰撞盒常量 | `…/workadventure/play/src/front/Phaser/Entity/Character.ts`（WA 为 16×16；本仓脚高 24、宽 24） |

### WA 人物资源（对照本仓——学做法，不锁数量）

WA 人物分两套，**帧规格与本仓一致**（32×32、四向、每向 3 帧）。对齐的是这套做法；**皮肤池大小本仓自定**（现 64，可扩），不要把 WA 默认 24 当成上限。

| 套系 | 位置 / 清单 | WA 默认数量 | 说明 |
|------|-------------|-------------|------|
| 完整精灵（默认 Woka） | `resources/characters/pipoya/`，`woka.json` → `woka` | **24**（男 12 + 女 12） | Pipoya；加载 `frameWidth/Height: 32` |
| 分层换装 | `resources/customisation/` | body/eyes/hair/… ≈ **272** 部件 | 本仓**不接**；碰撞盒思路仍脚底 |

本仓：`public/assets/characters.png` = Pipoya **`SKIN_COUNT` 套** atlas（清单 `scripts/pipoya-64-manifest.txt`，常量 [`src/catalog/skinCount.json`](../src/catalog/skinCount.json)）。碰撞盒高 24 × 宽 24（本仓余量；WA 脚高为 16）。混用不会导致格子尺寸错位。

只学结构与步骤，**禁止**把 `play/` 后端、聊天、Jitsi、AGPL 源码拷进本仓。完整表见 PRD 00002「参考项目路径」。

## 相关命令

```bash
pnpm gen:assets           # 先 pack:tilesets，再校验 maps
pnpm pack:tilesets        # 把 tilesets/*.tsj 的 collides 灌进各地图 JSON
pnpm annotate:collides    # 批量补 .tsj 的 collides，再 pack
pnpm sync:map-palette     # 从本机 WA maps/assets 再同步 tileset PNG
pnpm import:wa-company    # 用 WA starter 重置 company-25（结束后会 pack）
pnpm pack:assets          # 仅组装 Pipoya characters.png
pnpm dev:office           # 本地预览（推荐）
pnpm dev                  # 本地预览（需自备 EVO_AGENT_CATALOG）
```
