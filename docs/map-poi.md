# 地图 POI（闲逛目的地）

办公室小人「呼吸」用的站位点约定。与工位（`spawn_*` / `computer_*`）分开；**本文件是单一事实源**。改图交接总览见 [`map-editing.md`](./map-editing.md)。

## 目的

闲逛事件按两轴建模：**arity**（人数语义）× **place**（POI kind）。观众应读出「有人去办差事」「一伙人在开会」，而不是梦游或叠人。

| POI 是 | POI 不是 |
|--------|----------|
| 短时目的地（地毯前、咖啡台侧、会议桌旁可走格） | 出生点（`spawn_*`） |
| 因果家具连通块（打印机等，见下） | 电脑点（`computer_*`） |
| | 运行时动态生成的桌子 |

## 模型：arity × place

| 轴 | 取值 | 含义 |
|----|------|------|
| arity | `solo` | 个人差事：一人从工位出发 → 到站 dwell → 回家 |
| arity | `group` | 集体事件：场景拉多人几乎同时出发 |
| place | `lounge` / `coffee` / `meeting` / `print` | 地图 Point 或瓦片 `poiKind` |

| kind | arity | 谁触发 | 地图怎么标 |
|------|-------|--------|------------|
| `lounge` | **solo** | 工位时钟 | `objects` 上 `poi_lounge_<n>` Point（座位） |
| `coffee` / `print` | **solo** | 工位时钟 | **瓦片** `poiKind` 连通块（不要 Point；白名单见 `CAUSAL_POI_KINDS`） |
| `meeting` | **group** | 场景 `tryStartMeeting`（**禁止**单人 desk wander） | `poi_meeting_*` Point |
| `random` | solo 回退 | — | 无空闲 solo 点或约 15% 概率 |

**因果白名单**（`src/game/mapProp.ts` → `CAUSAL_POI_KINDS`）：现有 `print`、`coffee`。同 kind 再铺一台只需瓦片，**不用改代码**。全新 kind（如衣柜）要同时进 `PoiKind` / 此集合 / FSM dwell——座位类（lounge/meeting）继续用 Point，勿塞进白名单。

扩展同白名单内的新实例：图集瓦片标同一 `poiKind` + 需要的 `collides` / animation，铺进图层即可。
## 两条动画路（别混）

| | 环境循环（花、水） | 因果家具（打印机） |
|--|-------------------|-------------------|
| 怎么标 | Tiled Animation + 铺在瓦片层 | 瓦片 `poiKind` +（可选）Animation |
| 运行时 | Phaser 图层永远换帧 | 收成精灵；**idle** 静帧，人到站 **using** 才播 |
| 多台 | 同 GID 一起闪 | **四连通**分台；中间留空格 |

**不要**抄 WorkAdventure 的门：WA 是 `door_opened` / `door_closed` **整层 show/hide** + doorstep，不是逐台 GID playlist。

## Point POI（lounge / meeting）

### 图层

必须放在 **`objects`** objectgroup（与 `spawn_*` / `computer_*` 同层）。该层**不参与绘制**，只存坐标。

世界图（`kind: world`）不 spawn 员工，**不要**往 `world-map` 加员工用 POI。

### 命名

```text
poi_<kind>_<n>
```

| 段 | 规则 |
|----|------|
| 前缀 | 固定 `poi_` |
| `kind` | `lounge` / `meeting`（**不要**再为 print / coffee 插 Point） |
| `n` | 从 `0` 起的非负整数；同类内建议连续，允许断号 |

运行时只认此前缀；object 名即软占 key（`poiClaimKey`）。

### 摆点规则

1. 对象类型：**Point**（Tiled Insert Point）。
2. 落在**可走格**：脚底 hitbox 能站住；地毯/椅前地板 OK；**不要**标了 `collides` 的桌面/墙心。
3. **避开**任意 `computer_*` 所在格。
4. 数量建议：每类 **2–3** 个；`meeting` 至少 **2**。
5. **到站朝向**：自定义属性 **`dwellFacing`** = `up` / `down` / `left` / `right`；漏标朝南。详见 [`map-facing.md`](./map-facing.md)。

### Tiled 菜谱（Point）

```bash
pnpm unpack:tilesets   # 可选：改 collides 前
# Tiled: objects → Insert Point → poi_<kind>_<n> → dwellFacing
# File → Save（JSON）
pnpm gen:assets
pnpm dev:office
```

## 因果家具（`CAUSAL_POI_KINDS` 连通块）

### 设计决策（为何是连通块）

**模型一句话**：同一 `poiKind` + **四连通**（上下左右；同一格不同层也算连）= 一台物件；人到站 `using`、离开 `idle`。两台机器中间至少留一格**没有** `poiKind` 的空，就是两台。

`poiKind` / `collides` 写在图集瓦片上（与现有碰撞一样，盖了这个章的格子共用）。**实例分组不能靠再写一个 id 属性**——写在 `.tsj` 上会让所有打印机都叫 `print_0`。

#### 否决过的路

| 做法 | 为何不行 |
|------|----------|
| `poiPart` 挂「距离 ≤2 的最近热格」 | 两台打印机并排或 3×2 外扩会粘成一台 |
| 在 `.tsj` 写实例 id（如 `print_0`） | 图集属性全局共享，所有打印机都会叫同一 id |
| 「每台物件只能一格 collides」 | 大衣柜下面多格都要挡路、上面盖人；碰撞必须跟**这一格**的 `collides` |
| 抄 WA 门（`door_opened` / `door_closed` 整层 show/hide + doorstep） | 适合全图几扇门、状态还要同步给所有玩家；办公室里 N 台打印机各自 idle/using，抄这套要为每台做 opened/closed 层，比连通块更重。本仓不引入 Scripting API Extra，也不做进门切层 |

WA 门官方模型见 [Adding doors](https://docs.workadventu.re/map-building/tiled-editor/extra-features/doors)：那是「一层门的开/关开关」，不是给某一扇门的 GID 播 playlist。

#### 连通示意

```text
打印机 A          空隙         打印机 B
[3][4][5]                      [3][4][5]
[19][20][21]                   [19][20][21]
 poiKind=print                 poiKind=print
 一台（连通）     隔开          另一台
```

```text
大衣柜 横2 竖3（同一模型；本期只做 print，衣柜以后同套路）
abovePlayer  [顶][顶]     无 collides，有动画，poiKind=wardrobe
furniture    [身][身]     collides + 动画
furniture    [身][身]     collides + 动画
 → 六格一块连通，四格挡路，六精灵同步
```

#### 明确不做

- `poiPart` 就近挂靠
- 抄 WA 门的整层 show/hide
- 本期实现衣柜（只保证模型吃得下）
- 沙发 / 投影 / 工位屏

### 图集（`.tsj`）怎么标

在 Tiled 打开 `public/assets/maps/tilesets/office-anim.tsj`（或对应 pack），选中瓦片 → Custom Properties（**Class 留空**）：

| 属性 | 谁要 | 含义 |
|------|------|------|
| `poiKind` = `print` | 凡属于这台机的格子（含静帧拼图） | 参与连通 / solo |
| `collides` = true | **挡路的格子**（打印机通常只有机身一格） | 每格独立；也是默认站位**种子** |
| `standSeed` | **可选**；默认 `collides` | `collides` = 围着实体扩邻；`footprint` = 旧行为（整块外观外环） |
| `standSides` = `left,right,down` | **可选**；写在该 kind **任意一块**带 `poiKind` 的瓦片上即可 | 过滤自动 pads（严格，不回退）；不写 = 四向都要。打印机常用 `left,right,down`；台边咖啡机常用 `right` |
| `poiStand` = true | **可选**；标在**本机软格**上 | 手标站位垫；集群内一旦出现则**只用手标** |
| `poiActivation` = `any` \| `all` | **可选**；默认 `any` | `any`：任一 slot dwell → using；`all` 下期 |
| Tile Animation | 要动的格子 | using 时播；无 animation 的格只连通、不收成精灵 |

**到站朝向**：因果站位由程序按相对机身边自动朝向（右站→朝左等），**无需**手标 `dwellFacing`。Point 类（lounge/meeting）仍用手标，见 [`map-facing.md`](./map-facing.md)。

示例（打印机 2 行 × 3 列）：

```text
abovePlayer1   [3][4][5]     poiKind 软格（虚边）
furniture      [19][20][21]  20 = collides + anim + standSides=left,right,down
```

改完 `.tsj` 后只跑 **`pnpm gen:assets`**。

### 站位垫 stand pads（最终方法）

因果物件分三层，互不替代：

| 层 | 属性 | 作用 |
|----|------|------|
| 连通 / 外观 | `poiKind` | 四连通成一台；动画格收精灵 |
| 挡路 | `collides` | 人走不过；**自动站位的种子** |
| 使用站位 | stand pads → slots | 小人办差事要走到的格（多 slot） |

#### 情况 A — 有碰撞格（打印机）

种子 = 所有 `collides` 格的四邻；**可站在软格上**（同机有 `poiKind`、无 `collides`）；再用 `standSides` 过滤。

```text
[3][4][5]           虚边软格
[19][20][21]        20 = collides
 standSides=left,right,down → pads ≈ 19、21、以及 20 下方地板
 （不会再出现顶排左侧远处那一格）
```

只要 `left,right` → 通常左右两软格；要「面前」再加 `down`。

#### 情况 B — 无碰撞（咖啡机等）

回退：整块 footprint 的**外邻**（不可站在机身格上）。横 1×2：

```text
  a a
b X Y c
  d d
 → 6 个 pad；可用 standSides 收窄
```

#### 情况 C — 手标 `poiStand=true`

只标在**本机软格**（须带 `poiKind`、无 `collides`）。地板没有 `poiKind` 扫不进来。  
集群内**任一** `poiStand` → **只用手标，不再自动扩邻**（因此不会自动出现「机身正下方地板」；要下边请用情况 A + `down`）。

### 地图怎么铺

1. 把带 `poiKind` 的瓦片盖在 `furniture` / `aboveFurniture` / `abovePlayer*`（视觉分层照旧）。
2. **不要**再放 `poi_print_*` Point（运行时忽略 objects 里的 print）。
3. 同类物件不要边贴边。

### 运行时（`mapProp.ts` + `OfficeScene`）

1. 扫上述图层 → 连通 → appliance key `poi_print_0`…。
2. 有 Tiled animation 的格 → 精灵；`removeTileAt` 去图层戳。
3. `collides` 记入阻挡表。
4. 按 stand pads 规则生成 slots（key `poi_print_0#N`）进 `pois`。
5. solo 随机占空闲 slot；dwell → 整台 `using`；离开且无人再用 → `idle`。

乒乓球 `poiActivation=all` + 双人：**玩法下期**。

### 常见疑问

权威操作菜谱仍见上文；本节澄清心智模型与边界。

#### 1. `.tsj` 和地图谁说了算？

**图集只盖章，实例看地图。** 改完只跑 `pnpm gen:assets`。

#### 2. 两台贴边会怎样？

**同 kind 四连通贴边 = 一台。** 中间留一格无同 kind。

#### 3. 部件动画帧数不同、分在不同层？

**可以。** 有 animation 的才收精灵同步 using/idle。

#### 4. 为何是 `poiKind=print`，不是 true/false？

kind 进 FSM / 防误粘 / 白名单；碰撞与站位另用 `collides` / stand pads。

#### 5. 人走过去为什么会动？还要插 Point 吗？

**不要**为 `print` / `coffee` 插 Point。随机占一个空闲 slot → dwell → using；路过不动。

#### 6. 同一种多台时长能否不同？

同 `poiKind` 共用 `dwellMs`；因果白名单现为 `print`、`coffee`。

#### 7. 碰撞格怎么来的？

集群里谁勾了 `collides` 谁挡路；不是自动外扩。

#### 8. 站位怎么来的？为什么以前站得很远 / 站到北面？

旧逻辑按**整块 footprint 外环**，顶排虚边会把站位扯到左上远处。  
现用 **情况 A/B/C**（见「站位垫」）：默认围着 **collides** 扩邻，可站软格；`standSides` **严格过滤**（空结果不回退到其它边）。

站位**选格**按碰撞格（该格无 `collides`）；**落点**再在同格内找脚盒可站坐标（略下移躲开北边台沿）。寻路/吸附仍走脚盒（宽 16、下沿 `SOUTH=3`）。会议 Point 在空地故少卡；因果站位贴台，轴滑易顶红边——卡住时先推离再**禁贴墙中间节点**绕行（同点重算无效）。顶栏「碰撞盒」：地图=红，脚盒=绿，因果站位=青十字准星，lounge/meeting=黄菱形。

#### 9. 台面上的咖啡机？

`poiKind=coffee`（无 collides → 情况 B）。只要右侧可贴邻站：`.tsj` 写 `standSides=right`，改完 `pnpm gen:assets`。不要 `poi_coffee_*` Point。

#### 10. 热区被不可走格围死？

允许边的四邻格都有 collides → slots 空 → 不注册（不会偷用北面）。

#### 11. 只想站左右 / 还要面前？

`standSides=left,right` 或 `left,right,down` 或只要 `right`，标一次后 `pnpm gen:assets`。

#### 12. 手标能不能标地板？

手标须在**本机软格**（有 `poiKind`）。地板无 kind 无效；给地板加 kind 又可能并台。

#### 13. 乒乓球两人同时用？

本期不做；预留 `poiActivation=all`。

## 运行时语义（Point + 因果）

见 [`OfficeScene`](../src/game/OfficeScene.ts) / [`agentFsm.ts`](../src/game/agentFsm.ts) / [`mapProp.ts`](../src/game/mapProp.ts)：

### 个人差事（solo）

1. 加载时：`objects` 的 lounge/meeting Point + 瓦片因果连通块（`print` / `coffee`）。
2. 工位时钟 → `pickSoloWanderTarget`：`lounge` / `coffee` / `print` / `random`（**不含 meeting**）。
3. 约 **85%** 优先空闲 solo 点；软占 `poiClaimKey`。
4. 到站 dwell；因果家具切 `using`；结束回家并 `idle`。

### 开会事件（group / meeting）

1. 场景冷却约 **40–80s**；硬刷新后冷却为 0。
2. 空闲 `poi_meeting_*` ≥2，可拉在岗 ≥2 → 拉 2…min(3,…) 分椅。
3. 先到者 waiting；**全员到齐**后共享 `dwellMs('meeting')`，同时回家。

### 到站停留时间（均匀随机）

| kind | 停留 |
|------|------|
| `lounge` | 3–8s |
| `coffee` / `print` | 2–5s |
| `meeting` | 4–10s |
| `random` | 1–3s |

无坐下帧、无硬互斥队列。

## 与工位对象对照

| 名称模式 | 用途 |
|----------|------|
| `spawn_N` + `computer_N` | 一人一桌、在岗朝向 |
| `poi_lounge_*` | solo Point（座位） |
| `poi_meeting_*` | group 开会席位 |
| 瓦片 `poiKind=print` / `coffee` | solo 因果家具（`CAUSAL_POI_KINDS`） |
| ~~`poi_coffee_*` / `poi_print_*`~~ | **不要**再插；运行时忽略 |

## 校验说明

`pnpm gen:assets` **不强制**办公室必须有 POI（无 POI = 合法回退）。工位成对 / 距离规则仍只约束 `spawn_*` / `computer_*`。
