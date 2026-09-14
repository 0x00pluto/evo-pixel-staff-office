# 像素员工办公室（evo-agent-team）

把 AgentWikiIndex 的 `CATALOG.json` 花名册渲染成像素风办公室大屏：每个 workspace 是一个会走路的小人，头顶显示名字与状态，点击查看 owns / blurb / siblings。

## 技术栈

- Vite + React + TypeScript + Tailwind CSS
- Phaser 4（Tiled 多层办公室 / 小人 FSM）
- Vitest 单测（花名册映射 / 选图 / FSM；`pnpm test`）
- 本地 Node CLI（读花名册 + 静态托管）
- 包管理：**pnpm**

完整架构、目录约定与常改落点见 [`docs/dev-guide.md`](docs/dev-guide.md)。

## 准备

依赖已装则可跳过：

```bash
pnpm install
```

### 像素素材

仓库已含运行时切片，**clone 后即可开发，无需再下 Pipoya 原包、也无需跑 `pnpm pack:assets`**：

- 地图：`public/assets/maps/company-25.json` / `world-map.json` + `tilesets/*.png`（办公室地板在 **tileset1.png**；园区瓦片在 `tilesets/village/`）
- 角色：`public/assets/characters.png`（已入库的 atlas）
- 改图指南：[`docs/map-editing.md`](docs/map-editing.md)
- 地图校验（可选）：`pnpm gen:assets`（**不**覆盖 PNG）

署名与许可见 [`public/assets/CREDITS.md`](public/assets/CREDITS.md)。

从 WA starter **重置**主图（覆盖 `company-25.json`，维护者偶发）：

```bash
pnpm import:wa-company
```

从 wa-village **重置**世界图（覆盖 `world-map.json` + `tilesets/village/`，本地测试）：

```bash
pnpm import:wa-world
```
#### 维护者：重打角色 atlas（偶发）

仅当改皮肤清单 / 扩池时需要。原包**不要**提交 git（许可禁止再分发素材本体；`temp/` 已 gitignore）。协作者只拉更新后的 `characters.png`。

1. 自备 itch [PIPOYA FREE RPG Character Sprites 32x32](https://pipoya.itch.io/pipoya-free-rpg-character-sprites-32x32)
2. 解压到 `temp/vendor/pipoya/`（或 `EVO_VENDOR_PIPOYA=…`）
3. `pnpm pack:assets` → 覆盖 `public/assets/characters.png` → **提交该 PNG**

## 开发

无本地 `CATALOG.json` 也可启动（空办公室）；也可用可选种子：

```bash
# 空态 / 读用户目录 ~/.pixel-office/catalog.json
pnpm dev

# 推荐：Vite --force（避免旧依赖缓存）
pnpm dev:office

# 或显式指定可选种子
EVO_AGENT_CATALOG=~/Documents/Codex/AgentWikiIndex/CATALOG.json pnpm dev:office
```

浏览器打开终端提示的本地地址（默认 `http://localhost:5173`），**请硬刷新**（Cmd+Shift+R）。

## 测试

纯逻辑单测与源码放在一起（`src/**/*.test.ts`），不测 Phaser 画布：

```bash
pnpm test
```

## 一键预览（构建后）

```bash
pnpm build
pnpm pixel-office
# 可选种子：
pnpm pixel-office --catalog ~/Documents/Codex/AgentWikiIndex/CATALOG.json
```

常用参数：

| 参数 | 说明 |
|---|---|
| `-c, --catalog <path>` | 可选种子 `CATALOG.json`（无用户目录持久化时加载进内存） |
| `-p, --port <n>` | 端口，默认 `3780` |
| `--no-open` | 不自动打开浏览器 |

也可设 `EVO_AGENT_CATALOG`（可选种子）。启动顺序：用户目录 `~/.pixel-office/catalog.json` → 可选种子 → 空态。`PIXEL_OFFICE_HOME` 可覆盖用户目录父路径。出勤 / 写花名册可选 `EVO_PRESENCE_TOKEN`。

## 操作

- 拖拽：移动相机
- 滚轮：缩放
- 点击小人 / 名牌：右侧详情卡；**黄灯（blocked）再点一次 = 已读灭黄**
- 点击大门 / 回门区域：办公室 ↔ 世界地图（园区；世界图不显示员工）
- 顶栏「选择花名册」：读本地 JSON → `POST /api/catalog`（与 curl 同一写入）
- 顶栏「刷新花名册」：`GET /api/catalog?refresh=1`

## 运行时花名册（Runtime Catalog）

无 wiki 机器上可先起大屏，再注入花名册。合法 POST 写入 `~/.pixel-office/catalog.json`，重启仍在。

```bash
# 注入整表（body = CATALOG.json）
curl -sS -X POST "$ORIGIN/api/catalog" \
  -H 'Content-Type: application/json' \
  -d @/path/to/CATALOG.json

# 自检
curl -sS "$ORIGIN/api/catalog" | head
```

非法 body → `400`，旧花名册（内存与磁盘）保留。设了 `EVO_PRESENCE_TOKEN` 时跨机 POST 需 Bearer。

## 实时出勤（Live Presence）

跨机报到谁在干活 / 谁在喊老板。花名册走 `GET/POST /api/catalog`；出勤另走 `GET/POST /api/presence`（内存表，进程重启清空）。**先注入花名册再报出勤**；未知 id → 404。

**语义：** `working`=在干（绿）；`blocked`=需要老板——卡住 **或** 做完待验收（黄）；`idle`=灭灯（灰）。**任务正常结束必须 POST `blocked`，禁止刚做完直接 `idle`。**

在当前预览 origin 上验收（dev 默认 `http://localhost:5173`，CLI 默认 `3780`）：

```bash
# 开干 → 绿
curl -sS -X POST "$ORIGIN/api/presence" \
  -H 'Content-Type: application/json' \
  -d '{"id":"<某个 agents[].id>","state":"working","summary":"curl 试出勤"}'

# 做完 / 喊人 → 黄（勿用 idle 表示做完）
curl -sS -X POST "$ORIGIN/api/presence" \
  -H 'Content-Type: application/json' \
  -d '{"id":"<某个 agents[].id>","state":"blocked","summary":"改完了，请验收"}'

# 灭灯 → 灰（等价大屏点击已读）
curl -sS -X POST "$ORIGIN/api/presence" \
  -H 'Content-Type: application/json' \
  -d '{"id":"<某个 agents[].id>","state":"idle"}'
```

可选鉴权：设 `EVO_PRESENCE_TOKEN` 后，跨机 POST 需 `Authorization: Bearer <token>`（未设则本机开放）。挂局域网时应当设 token。

TTL：`working` 10 分钟无新包 → 合成 idle；`blocked` **1 小时**兜底灭黄（不是 10 分钟）。

机器可读合同（OpenAPI 3.1，无 Swagger UI）：`GET /api/openapi.json`；完整用法见 [`docs/openapi.md`](docs/openapi.md)。改协议后跑 `pnpm gen:openapi`。

## 数据约定

- 只渲染 `workspaces[]`；`unmanaged` 不进办公室
- `name` ← `title` 中 `—` 前半段
- `status` ← experiment / `owns[0]` / `blurb` 截断 /「待命」
- 运行时权威为用户目录 JSON（`RuntimeCatalog`）；可选种子仅启动加载；`CatalogSource` / `JsonFileSource` 仍预留换源，本仓**不**实现 SQLite / Postgres
- 地图用静态 id 注册（`company-25`、`world-map`；`kind: office | world`）；花名册**不加** company 字段

## 目录

```
src/catalog/   类型与映射
src/cli/       RuntimeCatalog、出勤 API、静态服务、Vite 插件
src/presence/  前端出勤类型与气泡队列
src/game/      Phaser 办公室、地图注册表与小人 FSM
src/ui/        名牌、详情卡、工具条
public/assets/ 像素素材、maps/、CREDITS
bin/           pixel-office CLI
```
