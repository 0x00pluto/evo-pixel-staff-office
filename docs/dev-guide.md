# 新人开发指南

面向第一次进仓的开发者：讲清本项目做什么、怎么跑起来、代码按层怎么走、改功能该动哪里。最短启动命令见 [`README.md`](../README.md)；仓规与能力边界见 [`AGENTS.md`](../AGENTS.md)。

## 先读什么

| 文档 | 用途 |
|---|---|
| [`AGENTS.md`](../AGENTS.md) | 目录语义、能力声明（owns / not）、Agent 协作约定 |
| [`README.md`](../README.md) | 30 秒启动、素材准备、操作说明 |
| [`docs/doc_index.md`](./doc_index.md) | 技术文档地图 |
| [`docs/map-editing.md`](./map-editing.md) | Tiled 改办公室地图：图层、碰撞、出门、预览回流 |
| [`specs/prds/`](../specs/prds/) | 产品规格（PRD） |
| [`.cursor/commands/team/`](../.cursor/commands/team/) | Cursor 团队命令（产品 / 验收 / 游戏前端 / 测试 / 自主交付） |

## 做什么 / 不做什么

**做：**

- 把 AgentWikiIndex 的 `CATALOG.json` 花名册渲染成像素风办公室大屏
- 每个 `workspace` 一个会走路的小人，显示名字与状态，点击查看详情
- 本地一键预览（`pixel-office` CLI）

**不做（见 AGENTS.md `not`）：**

- Agent 业务实现
- 实时任务状态监控
- 发布到 npm registry
- SQLite / Postgres 建表（仅预留 `CatalogSource` 接口）

## 技术栈与运行时

| 层 | 选型 |
|---|---|
| 前端壳 | Vite 8 + React 19 + TypeScript + Tailwind CSS 4 |
| 办公室世界 | Phaser 4（`pixelArt` / `OfficeScene`） |
| 花名册 API | Node ESM；开发态 Vite 插件，预览态 `pixel-office` |
| 包管理 | **pnpm**（`packageManager: pnpm@10.26.2`） |
| Lint | `oxlint`（`pnpm lint`） |

环境建议：Node 20 LTS 或 22+。花名册来自环境变量 `EVO_AGENT_CATALOG`，或同级 `../AgentWikiIndex/CATALOG.json`，或当前目录 `CATALOG.json`。

目前仓库**没有**自动化测试目录（无 `*.test.*`）；质量门禁以 `pnpm lint` + `pnpm build` 为主。

## 仓库地图

改动落进既有目录语义，**不新增平级顶层目录**。`cache/`、`temp/`、`output/`、`node_modules/`、`dist/` 全部 gitignore。

| 路径 | 职责 |
|---|---|
| [`src/App.tsx`](../src/App.tsx) | 拉取 `/api/catalog`、挂载 Phaser、HUD 状态 |
| [`src/catalog/`](../src/catalog/) | `AgentPersona` 类型与 TS 侧映射（[`mapPersona.ts`](../src/catalog/mapPersona.ts)） |
| [`src/cli/catalog.mjs`](../src/cli/catalog.mjs) | **运行时真正读 JSON 的地方**（Vite 插件与 CLI 共用） |
| [`src/cli/vite-plugin-catalog.ts`](../src/cli/vite-plugin-catalog.ts) | 开发态 `GET /api/catalog` |
| [`src/cli/run.mjs`](../src/cli/run.mjs) / [`static.mjs`](../src/cli/static.mjs) | 预览态静态托管 + 同路径 API |
| [`src/game/`](../src/game/) | Phaser 场景、小人 FSM、相机拖拽/缩放 |
| [`src/ui/`](../src/ui/) | 名牌层、详情卡、顶栏（React overlay，不是 Phaser 文本） |
| [`bin/pixel-office.mjs`](../bin/pixel-office.mjs) | CLI 入口 → `src/cli/run.mjs` |
| [`scripts/`](../scripts/) | `pack:assets` / `gen:assets` |
| [`public/assets/`](../public/assets/) | 像素素材、`maps/`、CREDITS |

## 架构与数据流

```mermaid
flowchart LR
  catalogJson["CATALOG.json"]
  source["JsonFileSource"]
  api["GET /api/catalog"]
  app["App.tsx"]
  game["OfficeScene"]
  hud["React HUD"]

  catalogJson --> source
  source --> api
  api --> app
  app --> game
  app --> hud
  game -->|"onSelect / onNameplates"| hud
```

两种进程共用同一套 `CatalogSource`（v1 = `JsonFileSource`）：

| 模式 | 入口 | 默认地址 |
|---|---|---|
| 开发 | `pnpm dev` → Vite + [`catalogApiPlugin`](../src/cli/vite-plugin-catalog.ts) | `http://localhost:5173` |
| 一键预览 | `pnpm build` 后 `pnpm pixel-office` 托管 `dist/` | `http://localhost:3780` |

### 花名册映射约定

权威实现在 [`src/cli/catalog.mjs`](../src/cli/catalog.mjs)。[`src/catalog/mapPersona.ts`](../src/catalog/mapPersona.ts) 是 TypeScript 孪生实现——**改映射逻辑必须两边一起改**。

- 只渲染 `workspaces[]`；`unmanaged` **不进**办公室
- `id` ← `dirname`
- `name` ← `title` 中破折号（`—` / `–` / `-`）前半段
- `status` ← `lifecycle === 'experiment'` →「实验中」；否则 `owns[0]` / `blurb` 截断 /「待命」
- `skin` ← `hash(id) % 64`（Pipoya 64 套皮肤）
- `CatalogSource` 只预留换源接口，本仓**不**实现 SQLite / Postgres

顶栏「刷新花名册」请求 `/api/catalog?refresh=1`，清缓存后重新读 JSON。

## 第一次把项目跑起来

按顺序执行（安装命令请在本机终端手动跑）：

### 1. 安装依赖

```bash
pnpm install
```

### 2. 准备花名册

任选其一：

```bash
# 推荐：显式指定路径
export EVO_AGENT_CATALOG=~/Documents/Codex/AgentWikiIndex/CATALOG.json

# 或保证同级存在 ../AgentWikiIndex/CATALOG.json
# 或当前目录有 CATALOG.json
```

### 3. 准备像素素材

仓库内通常已有 [`public/assets/maps/`](../public/assets/maps/)（`company-a.json` / `outside-stub.json` + tilesets）与 [`CREDITS.md`](../public/assets/CREDITS.md)。`characters.png` 需本地组装：

1. 从 itch 下载 Pipoya 角色包（**不要**提交 zip/rar）
2. 解压到 `temp/vendor/pipoya/`（或 `EVO_VENDOR_PIPOYA`）
3. 组装与校验：

```bash
pnpm pack:assets   # → public/assets/characters.png
pnpm gen:assets    # 校验 Tiled 地图；不覆盖任何 PNG
```

重建办公室/桩图布局：

```bash
node scripts/build-tiled-maps.mjs
```

署名与许可见 [`public/assets/CREDITS.md`](../public/assets/CREDITS.md)。

### 4. 开发启动

```bash
EVO_AGENT_CATALOG=~/path/to/CATALOG.json pnpm dev
```

浏览器打开终端提示的地址（默认 `http://localhost:5173`）。

### 5. 一键预览（可选）

```bash
pnpm build
pnpm pixel-office --catalog ~/path/to/CATALOG.json
```

常用参数：`-c/--catalog`、`-p/--port`（默认 `3780`）、`--no-open`。

### 6. 质量门禁

```bash
pnpm lint
pnpm build
```

### 操作速查

- 拖拽：移动相机
- 滚轮：缩放
- 点击小人 / 名牌：右侧详情卡
- 点击大门 / 回门：办公室 ↔ 室外桩图
- 顶栏「刷新花名册」：重新读取 JSON

## 游戏层要点

核心在 [`src/game/OfficeScene.ts`](../src/game/OfficeScene.ts)，由 [`createGame.ts`](../src/game/createGame.ts) 创建 Phaser 实例。地图 id 见 [`mapRegistry.ts`](../src/game/mapRegistry.ts)。

### 资源

| 路径 | 说明 |
|---|---|
| `/assets/maps/company-a.json` | 公司主图（Tiled） |
| `/assets/maps/outside-stub.json` | 室外桩图 |
| `/assets/maps/tilesets/*.png` | 32×32 瓦片 |
| `/assets/characters.png` | Pipoya 64 套 × 四向 × 3 帧 atlas（12 列 × 64 行） |

加载失败或未注册 `exitMap` 会走 `onAssetsError`，页面顶部显示提示。相机 bounds 等于当前地图像素尺寸；切图后落到 entry/start，仍可自由拖拽。

旧 `office.png` / `office-layout.json` **不再加载**（可留仓）。

### 地图图层

| 层 | 用途 |
|---|---|
| `floor` / `walls` / `furniture` / `above*` | 可见分层；`abovePlayer*` 深度高于角色 |
| `collisions` | 碰撞（不可见）；`index > 0` 不可走 |
| `start` | 默认出生 |
| `office-door` / `from-office` 等 | `startLayer=true` 命名入口 |
| `exit` | 属性 `exitMap` + `entryName`；踩格或点击切图 |
| `objects` | `spawn_*` / `computer_*` |

### 小人 FSM

见 [`agentFsm.ts`](../src/game/agentFsm.ts)：`idle` / `wander` / `working` 三种模式随机切换。皮肤索引 `0–63`（`hash(id) % 64`），无 hue tint；`CHAR_SCALE≈1` 对齐 32px 格。动画 key 形如 `walk-{skin}-{dir}` / `idle-{skin}-{dir}`。

### React ↔ Phaser

`App` 通过 `createOfficeGame` 拿到：

- `reloadAgents(agents)`：刷新花名册后在**当前图**重建小人
- `destroy()`：卸载时销毁游戏
- 回调：`onSelect`、`onNameplates`、`onAssetsError`

名牌坐标由 Phaser 每帧算出屏幕位置，再交给 React [`NameplateLayer`](../src/ui/NameplateLayer.tsx) 渲染。

## 常见改动落点

| 你想改… | 去哪 |
|---|---|
| 详情卡字段 / 布局 | [`src/ui/AgentCard.tsx`](../src/ui/AgentCard.tsx) |
| 名牌样式 | [`src/ui/NameplateLayer.tsx`](../src/ui/NameplateLayer.tsx) |
| 顶栏文案 / 刷新 | [`src/ui/Toolbar.tsx`](../src/ui/Toolbar.tsx) |
| 状态文案、皮肤规则、字段映射 | [`src/cli/catalog.mjs`](../src/cli/catalog.mjs) **和** [`src/catalog/mapPersona.ts`](../src/catalog/mapPersona.ts) |
| 走路、碰撞、相机、切图 | [`src/game/OfficeScene.ts`](../src/game/OfficeScene.ts) + [`mapRegistry.ts`](../src/game/mapRegistry.ts) |
| 办公室 / 桩图布局 | [`scripts/build-tiled-maps.mjs`](../scripts/build-tiled-maps.mjs) → 再 `pnpm gen:assets` 校验 |
| 角色 atlas / 皮肤清单 | [`scripts/pack-office-assets.mjs`](../scripts/pack-office-assets.mjs) + [`scripts/pipoya-64-manifest.txt`](../scripts/pipoya-64-manifest.txt) → `pnpm pack:assets` |
| 开发态 API | [`src/cli/vite-plugin-catalog.ts`](../src/cli/vite-plugin-catalog.ts) |
| 预览 CLI | [`src/cli/run.mjs`](../src/cli/run.mjs) |

## 边界与坑

1. **目录**：不新增平级顶层目录；产物进 `cache/` / `temp/` / `output/`，不入库。
2. **能力声明**：改 `AGENTS.md` 的 owns/not 后，若同级存在 `../AgentWikiIndex/`，执行 `python3 ../AgentWikiIndex/scripts/refresh_catalog.py`；**没有该目录则跳过**，不要报错、不要去建。
3. **不要提交**：`temp/` 里的 itch 原包、`.env`、`dist/`、`node_modules/`。
4. **映射双份**：`catalog.mjs`（运行时）与 `mapPersona.ts`（类型/前端）必须保持一致。
5. **素材缺失**：办公室空白或顶部报错时，先确认 `maps/*.json` / `maps/tilesets/*.png` / `characters.png` 齐全。
6. **静态托管**：[`src/cli/static.mjs`](../src/cli/static.mjs) 有路径穿越防护（禁止读出 `dist/` 根外），改静态服务时不要拆掉。
7. **团队命令**：母版维护于 Obsidian Vibecoding 库；本仓 `.cursor/commands/team/` 只作安装稿，勿另起一套命令体系。
8. **包管理**：只用 pnpm；需要新增依赖时只给出 `pnpm add …` 命令供本机执行，不擅自改 lockfile。

## 相关脚本速查

| 命令 | 作用 |
|---|---|
| `pnpm dev` | Vite 开发服务器 |
| `pnpm build` | `tsc -b` + Vite 生产构建 |
| `pnpm lint` | oxlint |
| `pnpm preview` | Vite 预览（不含花名册 API；日常用 `pixel-office`） |
| `pnpm pixel-office` | 构建产物 + `/api/catalog` 一键预览 |
| `pnpm pack:assets` | vendor → `characters.png` |
| `pnpm gen:assets` | 校验 Tiled 地图（不写 PNG） |
| `node scripts/build-tiled-maps.mjs` | 重建 `company-a` / `outside-stub` JSON |
