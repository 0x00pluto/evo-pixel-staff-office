# 像素员工办公室 — 帮助

运行中的大屏实例帮助。把本页 URL 发给人或 Evo Agent 即可上手。

**Base：** `{{ORIGIN}}`

---

## 给人类

- **拖拽**画布移动相机；**滚轮**缩放。
- **点击小人 / 名牌**：右侧详情；黄灯（blocked）再点一次 = 已读灭黄。
- **大门**：进入 25×25 世界桩图；点中间白格返回办公室。
- 顶栏 **「选择花名册」**：读本地 `CATALOG.json` → `POST /api/catalog`。
- 顶栏 **「刷新花名册」**：`GET /api/catalog?refresh=1`。
- 顶栏 **「复制帮助」**：复制本帮助链接（含 Agent 锚点），可贴进对话。

无花名册时空办公室仍可开；注入后小人才会出现。

---

## 给 Evo Agent

<a id="agent"></a>

你不负责业务实现。你只做两件事：**注入花名册**、**上报出勤**。

### 合同（字段权威）

```text
{{ORIGIN}}/api/openapi.json
```

### 1. 注入花名册（通常一次 / 整表覆盖）

Body = 完整 AgentWikiIndex `CATALOG.json`（必须含 `workspaces` 数组）。

```bash
curl -sS -X POST "{{ORIGIN}}/api/catalog" \
  -H 'Content-Type: application/json' \
  -d @/path/to/CATALOG.json
```

成功后写入用户目录 `~/.pixel-office/catalog.json`（可用 `PIXEL_OFFICE_HOME` 覆盖）。非法 body → `400`，旧表保留。

### 2. 出勤上报

`id` = 花名册映射后的 `agents[].id`（通常即 workspace `dirname`）。先有 catalog 再 presence；未知 id → `404`。

| 时机 | `state` | 说明 |
|------|---------|------|
| 开干 | `working` | 绿灯 |
| 卡住 **或** 做完待验收 | `blocked` | 黄灯；**禁止**刚做完直接 `idle` |
| 已读 / 灭灯 | `idle` | 一般由老板点大屏完成；Agent 勿用 idle 表示「做完了」 |

```bash
# 开干
curl -sS -X POST "{{ORIGIN}}/api/presence" \
  -H 'Content-Type: application/json' \
  -d '{"id":"<dirname>","state":"working","summary":"开始做某事"}'

# 做完 / 喊人
curl -sS -X POST "{{ORIGIN}}/api/presence" \
  -H 'Content-Type: application/json' \
  -d '{"id":"<dirname>","state":"blocked","summary":"改完了，请验收"}'
```

### 3. 自检

```bash
curl -sS "{{ORIGIN}}/api/catalog" | head
curl -sS "{{ORIGIN}}/api/presence" | head
```

### 鉴权

若环境设置了 `EVO_PRESENCE_TOKEN`，跨机 `POST /api/catalog` 与 `POST /api/presence` 需：

```text
Authorization: Bearer <token>
```

未设则本机开放。

---

## 更多

- 本页运行时地址：`{{ORIGIN}}/help.md`（`/help` 会转到此处）
- 开发者合同说明（仓库）：`docs/openapi.md`
- 包：`npx @huyuan-ai/pixel-office`
