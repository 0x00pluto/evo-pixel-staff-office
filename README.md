# 像素员工办公室（evo-agent-team）

把 AgentWikiIndex 的 `CATALOG.json` 花名册渲染成像素风办公室大屏：每个 workspace 是一个会走路的小人，头顶显示名字与状态，点击查看 owns / blurb / siblings。

## 技术栈

- Vite + React + TypeScript + Tailwind CSS
- Phaser 4（Tiled 多层办公室 / 小人 FSM）
- 本地 Node CLI（读花名册 + 静态托管）
- 包管理：**pnpm**

完整架构、目录约定与常改落点见 [`docs/dev-guide.md`](docs/dev-guide.md)。

## 准备

依赖已装则可跳过：

```bash
pnpm install
```

### 像素素材

办公室世界用 Tiled JSON + 32×32 瓦片（主图视觉对齐 WA starter）：

- `public/assets/maps/company-25.json` / `outside-stub.json`
- `public/assets/maps/tilesets/*.png`（地板在 **tileset1.png**；CC-BY-SA 3.0，见 CREDITS）
- 改图指南：[`docs/map-editing.md`](docs/map-editing.md)
- 校验：`pnpm gen:assets`（**不**覆盖 PNG）

Pipoya 角色原包解压到 `temp/vendor/pipoya/`（或 `EVO_VENDOR_PIPOYA`），组装：

```bash
pnpm pack:assets   # → characters.png
pnpm gen:assets    # 校验 Tiled 地图；不写 PNG
```

从 WA starter **重置**主图（覆盖 `company-25.json`）：

```bash
pnpm import:wa-company
```

署名与许可见 [`public/assets/CREDITS.md`](public/assets/CREDITS.md)。

## 开发

指定花名册路径后启动 Vite（开发态 `/api/catalog` 与 CLI 同源）：

```bash
# 推荐：带默认花名册 + Vite --force（避免旧依赖缓存）
pnpm dev:office

# 或显式指定花名册
EVO_AGENT_CATALOG=~/Documents/Codex/AgentWikiIndex/CATALOG.json pnpm dev
```

浏览器打开终端提示的本地地址（默认 `http://localhost:5173`），**请硬刷新**（Cmd+Shift+R）。

## 一键预览（构建后）

```bash
pnpm build
pnpm pixel-office --catalog ~/Documents/Codex/AgentWikiIndex/CATALOG.json
```

常用参数：

| 参数 | 说明 |
|---|---|
| `-c, --catalog <path>` | `CATALOG.json` 路径 |
| `-p, --port <n>` | 端口，默认 `3780` |
| `--no-open` | 不自动打开浏览器 |

也可设环境变量 `EVO_AGENT_CATALOG`。未指定时依次尝试：当前目录 `CATALOG.json`、`../AgentWikiIndex/CATALOG.json`。

## 操作

- 拖拽：移动相机
- 滚轮：缩放
- 点击小人 / 名牌：右侧详情卡
- 点击大门 / 回门区域：办公室 ↔ 室外桩图
- 顶栏「刷新花名册」：重新读取 JSON

## 数据约定

- 只渲染 `workspaces[]`；`unmanaged` 不进办公室
- `name` ← `title` 中 `—` 前半段
- `status` ← experiment / `owns[0]` / `blurb` 截断 /「待命」
- 数据源接口为 `CatalogSource`（v1 = `JsonFileSource`），便于以后换 SQLite / Postgres
- 地图用静态 id 注册（`company-25`、`outside-stub`）；花名册**不加** company 字段

## 目录

```
src/catalog/   类型与映射
src/cli/       CatalogSource、静态服务、Vite 插件
src/game/      Phaser 办公室、地图注册表与小人 FSM
src/ui/        名牌、详情卡、工具条
public/assets/ 像素素材、maps/、CREDITS
bin/           pixel-office CLI
```
