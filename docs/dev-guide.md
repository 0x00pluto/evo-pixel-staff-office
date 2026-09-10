# 新人开发指南

面向第一次进仓的开发者：讲清本项目做什么、怎么跑起来、代码按层怎么走、改功能该动哪里。最短启动命令见 [`README.md`](../README.md)；仓规与能力边界见 [`AGENTS.md`](../AGENTS.md)。

## 先读什么

| 文档 | 用途 |
|---|---|
| [`AGENTS.md`](../AGENTS.md) | 目录语义、能力声明（owns / not）、Agent 协作约定 |
| [`README.md`](../README.md) | 30 秒启动、素材准备、操作说明 |
| [`docs/doc_index.md`](./doc_index.md) | 技术文档地图 |
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
| [`public/assets/`](../public/assets/) | 像素切片、`office.json`、CREDITS |

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

仓库内通常已有 [`public/assets/office.json`](../public/assets/office.json) 与 [`CREDITS.md`](../public/assets/CREDITS.md)。`tileset.png` / `characters.png` 需本地组装：

1. 从 itch 下载 Pixel Life Desk Essentials 与 Pipoya 角色包（**不要**提交 zip/rar）
2. 解压到 `temp/vendor/`（已 gitignore），或用环境变量覆盖：
   - `temp/vendor/pixel-life/spritesheet.png`（或 `EVO_VENDOR_PIXEL_LIFE`）
   - `temp/vendor/pipoya/`（或 `EVO_VENDOR_PIPOYA`）
3. 组装切片：

```bash
pnpm pack:assets   # → public/assets/tileset.png + characters.png
pnpm gen:assets    # → 只写 office.json，不覆盖第三方 PNG
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
- 顶栏「刷新花名册」：重新读取 JSON

## 游戏层要点

核心在 [`src/game/OfficeScene.ts`](../src/game/OfficeScene.ts)，由 [`createGame.ts`](../src/game/createGame.ts) 创建 Phaser 实例。

### 资源

| 路径 | 说明 |
|---|---|
| `/assets/tileset.png` | 32×32 办公室瓦片 |
| `/assets/characters.png` | Pipoya 64 套 × 四向 × 3 帧 atlas（12 列 × 64 行） |
| `/assets/office.json` | Tiled 兼容正交地图 |

加载失败会走 `onAssetsError`，页面顶部显示提示；先查 `public/assets` 是否缺 PNG，必要时重跑 `pnpm pack:assets`。

### 地图图层

| 层 | 用途 |
|---|---|
| `ground` | 地板 |
| `furniture` | 家具；运行时拆成独立精灵做 Y-sort 遮挡 |
| `collision` | 碰撞（不可见）；`index > 0` 不可走 |
| `objects` | `spawn_*` 出生点、`computer_*` 工位（working 模式目标） |

### 小人 FSM

见 [`agentFsm.ts`](../src/game/agentFsm.ts)：`idle` / `wander` / `working` 三种模式随机切换。皮肤索引 `0–63`，动画 key 形如 `walk-{skin}-{dir}` / `idle-{skin}-{dir}`。

### React ↔ Phaser

`App` 通过 `createOfficeGame` 拿到：

- `reloadAgents(agents)`：刷新花名册后重建小人
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
| 走路、碰撞、相机、生成 | [`src/game/OfficeScene.ts`](../src/game/OfficeScene.ts) + [`agentFsm.ts`](../src/game/agentFsm.ts) |
| 办公室地图布局 | [`scripts/gen-pixel-assets.mjs`](../scripts/gen-pixel-assets.mjs) → `pnpm gen:assets` |
| 角色 atlas / 皮肤清单 | [`scripts/pack-office-assets.mjs`](../scripts/pack-office-assets.mjs) + [`scripts/pipoya-64-manifest.txt`](../scripts/pipoya-64-manifest.txt) → `pnpm pack:assets` |
| 开发态 API | [`src/cli/vite-plugin-catalog.ts`](../src/cli/vite-plugin-catalog.ts) |
| 预览 CLI | [`src/cli/run.mjs`](../src/cli/run.mjs) |

## 边界与坑

1. **目录**：不新增平级顶层目录；产物进 `cache/` / `temp/` / `output/`，不入库。
2. **能力声明**：改 `AGENTS.md` 的 owns/not 后，若同级存在 `../AgentWikiIndex/`，执行 `python3 ../AgentWikiIndex/scripts/refresh_catalog.py`；**没有该目录则跳过**，不要报错、不要去建。
3. **不要提交**：`temp/` 里的 itch 原包、`.env`、`dist/`、`node_modules/`。
4. **映射双份**：`catalog.mjs`（运行时）与 `mapPersona.ts`（类型/前端）必须保持一致。
5. **素材缺失**：办公室空白或顶部报错时，先确认 `tileset.png` / `characters.png` / `office.json` 齐全。
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
| `pnpm pack:assets` | vendor → `tileset.png` / `characters.png` |
| `pnpm gen:assets` | 生成 `office.json` |
