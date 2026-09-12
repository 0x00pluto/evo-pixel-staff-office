# 地图 POI（闲逛目的地）

办公室小人「呼吸」用的站位点约定。与工位（`spawn_*` / `computer_*`）分开；**本文件是单一事实源**。改图交接总览见 [`map-editing.md`](./map-editing.md)。

## 目的

闲逛事件按两轴建模：**arity**（人数语义）× **place**（POI kind）。观众应读出「有人去办差事」「一伙人在开会」，而不是梦游或叠人。

| POI 是 | POI 不是 |
|--------|----------|
| 短时目的地（地毯前、咖啡台侧、会议桌旁可走格） | 出生点（`spawn_*`） |
| | 电脑点（`computer_*`） |
| | 运行时动态生成的桌子 |

## 模型：arity × place

| 轴 | 取值 | 含义 |
|----|------|------|
| arity | `solo` | 个人差事：一人从工位出发 → 到站 dwell → 回家 |
| arity | `group` | 集体事件：场景拉多人几乎同时出发 |
| place | `lounge` / `coffee` / `meeting`（及未来 print/trash） | 地图 `poi_<kind>_<n>` |

| kind | R0 arity | 谁触发 |
|------|----------|--------|
| `lounge` / `coffee` | **solo** | 工位时钟 `nextDeskMode` → wander |
| `meeting` | **group** | 场景 `tryStartMeeting`（**禁止**单人 desk wander 选中） |
| `random` | solo 回退 | 无空闲 solo 点或约 15% 概率 |

扩展新 place（如 print）：加 kind + 地图点 + 进 solo 池即可，不必新 FSM 模式名。R0 **不**强制 `poi_print_*` / `poi_trash_*`。

## 图层

必须放在地图的 **`objects`** objectgroup（与 `spawn_*` / `computer_*` 同层）。该层**不参与绘制**，只存坐标。

世界图（`kind: world`）不 spawn 员工，**不要**往 `world-map` 加员工用 POI。

## 命名

```text
poi_<kind>_<n>
```

| 段 | 规则 |
|----|------|
| 前缀 | 固定 `poi_` |
| `kind` | 仅三选一：`lounge`（休息/沙发）、`coffee`（咖啡台）、`meeting`（会议室） |
| `n` | 从 `0` 起的非负整数；同类内建议连续，允许断号 |

示例：`poi_lounge_0`、`poi_coffee_1`、`poi_meeting_2`。

运行时只认此前缀；其它 object 名忽略。object 名即软占 key（`poiClaimKey`）。

## 摆点规则

1. 对象类型：**Point**（Tiled Insert Point）。
2. 落在**可走格**：脚底 hitbox 能站住；地毯/椅前地板 OK；**不要**标了 `collides` 的桌面/墙心。
3. **避开**任意 `computer_*` 所在格（不要站到别人桌上）。
4. 与最近家具看起来「人站在旁边用」即可，不必叠在沙发精灵正中。
5. 数量建议：每类 **2–3** 个；`meeting` 至少 **2** 才能触发集体开会。无任何 `poi_*` 时，solo 闲逛回退为全图随机可走点。

## Tiled 菜谱

```bash
pnpm unpack:tilesets   # 可选：改 collides 前
# Tiled: File → Open → public/assets/maps/company-25.json
# Layers → objects → Insert Point → 命名 poi_<kind>_<n> → 拖到可走位置
# File → Save（JSON）
pnpm gen:assets        # pack + 现有校验（当前不强制 POI 数量）
pnpm dev:office        # 硬刷新观察闲逛目的地
```

微调：只拖 Point 坐标，**不要改名**成非约定字符串，否则运行时收不到。

## 运行时语义

见 [`OfficeScene`](../src/game/OfficeScene.ts) / [`agentFsm.ts`](../src/game/agentFsm.ts)：

### 个人差事（solo）

1. 加载办公室图时解析 `objects` 中所有合法 `poi_<kind>_<n>` → `{ key, point, kind }`。
2. 工位时钟触发 wander → `pickSoloWanderTarget`：仅 `lounge` / `coffee` / `random`（**不含 meeting**）。
3. 约 **85%** 优先空闲同类点（`poiClaimKey` 不在 busy 集合）；该 kind 全满 → 另一 solo kind；再无 → `random`。
4. 出发写入 `poiClaimKey`；`wanderPhase=to`；旅行时钟约 **25–40s**（防卡死，不会因短时钟中途闪回）。
5. 到站 → `dwell`（按 kind 停留）；结束或超时 → 清空 claim，BFS 走回自己的 `spawn`。

### 开会事件（group / meeting）

1. 场景冷却到期后 `tryStartMeeting`（约 **40–80s** 一轮；硬刷新后冷却为 0，可尽快首场）。
2. 前置：空闲 `poi_meeting_*` ≥2，且可拉在岗（`working`、已在工位附近、未 wander）≥2。
3. 拉 `k = 2 … min(3, 空闲椅, 可拉人)`；每人不同会议椅、同时出发。
4. 先到者站着 **waiting**（不计短 dwell）；**本场剩余成员全部到预定椅位后**才开钟：`meetingEndsAt = now + dwellMs('meeting')`，全员同一结束时刻 → 同时回家。
5. 旅行超时者从本场剔除；若剩余 &lt;2 则取消本场（已到者直接回家），避免永远等幽灵席位。

### 到站停留时间（均匀随机）

| kind | 停留 |
|------|------|
| `lounge` | 3–8s |
| `coffee` | 2–5s |
| `meeting` | 4–10s |
| `random`（无 POI / 未选中） | 1–3s |

**不**根据家具 GID 自动推断沙发/咖啡机。无坐下帧、无开会/喝咖啡专用动画。无硬互斥队列。

## 与工位对象对照

| 名称模式 | 用途 |
|----------|------|
| `spawn_N` + `computer_N` | 一人一桌、在岗朝向 |
| `poi_lounge_*` / `poi_coffee_*` | solo 差事目的地 |
| `poi_meeting_*` | group 开会席位（非单人闲逛点） |

## 校验说明

`pnpm gen:assets` **不强制**办公室必须有 POI（无 POI = 合法回退）。工位成对 / 距离规则仍只约束 `spawn_*` / `computer_*`。
