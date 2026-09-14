# 地图朝向（工位 + POI dwell）

改图同事的朝向说明书。工位与闲逛 POI 分工不同；POI 到站朝向的单一事实源是本文件 + [`map-poi.md`](./map-poi.md) 摆点规则。

## 分工

| 场景 | 谁决定朝向 | 做法 |
|------|------------|------|
| 工位（在岗） | 地图两个点 | `spawn_N` 看向同号 `computer_N`（程序 `faceToward`） |
| lounge / meeting | 地图一个自定义属性 | 每个 `poi_*` Point 上的 **`dwellFacing`** |
| print / coffee（因果瓦片连通块） | 程序 | 各站位按相对机身边朝向（右站→朝左，左站→朝右，下站→朝上）；**不要**再插 Point，也**不用**瓦片标 `dwellFacing` |
| random 闲逛（无 POI） | 程序默认 | 朝南 `down` |

不要用 Tiled Point 的 **`rotation`**（常为 `0`，会被当成朝右）。不要根据家具瓦片 GID 猜朝向。

因果站位若用「看向 footprint 左上」的 `faceToward`，对角平局会误朝北（咖啡右侧站位）；现按站位边取对向，与打印机左右站一致。

## 属性名：`dwellFacing`

本仓图层属性已是复合名（`exitMap`、`entryName`、`startLayer`）。POI 朝向同样不要用单词：

| 候选 | 结论 | 原因 |
|------|------|------|
| `direction` | 禁用 | WA 家具图集已用 `direction` 表示椅子精灵朝哪 |
| `facing` | 不用 | 太泛；与走路 `dir`、工位 `faceDir` 易混 |
| `dwellFacing` | **采用** | 只表示「停在这个 `poi_*` 上时脸朝哪」 |

运行时**只从 `poi_*` 对象**读该属性；`spawn_*` / `exit` 上同名也当没有。

## 取值：只收 up / down / left / right

**不用数字。** `0–3` 是 Pipoya 图集行号（内部实现），不要写进 Tiled。

| Tiled `dwellFacing` | 含义（屏幕） |
|---------------------|--------------|
| `down` | 朝南 / 朝下 |
| `left` | 朝西 / 朝左 |
| `right` | 朝东 / 朝右 |
| `up` | 朝北 / 朝上 |

约定：

- 属性名：`dwellFacing`（camelCase，与 `exitMap` 一致）
- 取值：**仅**小写 `up` / `down` / `left` / `right`（大小写不敏感，`Up` 也认）
- **不写、写错、或 random 闲逛 → 一律朝南 `down`**
- 不接受 `0`–`3`、`north`、`南`，也不认 `facing` / `direction` 别名

刷点时对着家具想「人站在这是在用什么」（仅 Point POI）：

- 沙发/休息区：脸朝外或朝茶几
- 会议椅：脸朝桌心，不要朝墙

打印机 / 咖啡机：因果瓦片自动朝机身，不必手标。

## Tiled 步骤

1. File → Open → `public/assets/maps/company-25.json`
2. Layers → **`objects`** → 选中某个 `poi_*` Point
3. Custom Properties → 字符串 **`dwellFacing`**，取值 `up` / `down` / `left` / `right`
4. File → Save（JSON）
5. `pnpm dev:office` → 浏览器硬刷新；人到站应朝你填的方向

现有办公室图里每个 `poi_*` 已预置 `dwellFacing: down`；需要朝家具时再改。

## 附录：程序员（内部 dir）

Pipoya 四向行号（地图**禁止**写数字）：

| dir | 语义 |
|-----|------|
| 0 | down |
| 1 | left |
| 2 | right |
| 3 | up |

解析见 `parseDwellFacing`（[`src/game/agentFsm.ts`](../src/game/agentFsm.ts)）；到站套用见 `OfficeScene.startPoiDwell`。工位稳定朝向仍是 `faceDir`，dwell **不改**它。
