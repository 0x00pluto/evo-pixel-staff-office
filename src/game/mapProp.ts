/**
 * Causal map props: same poiKind + 4-connected (incl. same-cell layers)
 * = one appliance. Collision is per-cell `collides`. Animation tiles become
 * sprites; static poiKind tiles stay on the layer for connectivity only.
 *
 * Stand pads (where agents dwell): default seed = collides neighbors (soft
 * footprint cells allowed); optional poiStand marks override; multi-slot keys
 * `poi_print_0#3`. Activation `any` = one dweller → using.
 */
import { faceToward, type PoiKind } from './agentFsm'

/** Tile layers scanned for poiKind stamps. */
export const PROP_SCAN_LAYERS = [
  'furniture',
  'aboveFurniture',
  'abovePlayer1',
  'abovePlayer2',
  'abovePlayer3',
] as const

export type PropScanLayer = (typeof PROP_SCAN_LAYERS)[number]

export type StandSide = 'left' | 'right' | 'up' | 'down'

export type PropActivation = 'any' | 'all'

/** Auto stand-pad seed: collides (default) or full footprint ring. */
export type StandSeed = 'collides' | 'footprint'

export type PropCell = {
  tx: number
  ty: number
  layerName: string
  /** Global Tiled GID (no flip flags). */
  gid: number
  localId: number
  tilesetName: string
  kind: PoiKind
  collides: boolean
  hasAnimation: boolean
  /** Layer sits above floorLayer (covers agents). */
  overlay: boolean
  /** Optional author filter from this tile's `standSides`. */
  standSides?: StandSide[] | null
  /** Optional `poiActivation` from this tile. */
  activation?: PropActivation | null
  /** Optional `standSeed` from this tile. */
  standSeed?: StandSeed | null
  /** Manual stand pad (`poiStand=true`). */
  poiStand?: boolean
}

export type PropStandSlot = {
  id: number
  tx: number
  ty: number
  dwellFacing: 0 | 1 | 2 | 3
}

export type PropCluster = {
  key: string
  kind: PoiKind
  cells: PropCell[]
  collideCells: Array<{ tx: number; ty: number }>
  slots: PropStandSlot[]
  activation: PropActivation
  /** null = all four outer sides. */
  standSides: StandSide[] | null
  standSeed: StandSeed
}

/**
 * Tile-stamp appliances (not Point seats). New *instances* only need map tiles;
 * a brand-new kind still needs `PoiKind` + this set + FSM dwell once.
 * Lounge / meeting stay Points (chairs / seats).
 */
export const CAUSAL_POI_KINDS: ReadonlySet<PoiKind> = new Set([
  'print',
  'coffee',
])

export function isCausalPoiKind(kind: string): kind is PoiKind {
  return CAUSAL_POI_KINDS.has(kind as PoiKind)
}

const SIDE_SET: ReadonlySet<string> = new Set(['left', 'right', 'up', 'down'])

type TileProps =
  | Record<string, unknown>
  | Array<{ name: string; value: unknown }>
  | null
  | undefined

function propValue(props: TileProps, name: string): unknown {
  if (!props) return undefined
  if (Array.isArray(props)) {
    return props.find((p) => p.name === name)?.value
  }
  return props[name]
}

export function parseTilePoiKind(props: TileProps): PoiKind | null {
  const raw = propValue(props, 'poiKind')
  if (typeof raw !== 'string') return null
  const kind = raw.trim().toLowerCase()
  return isCausalPoiKind(kind) ? kind : null
}

export function tilePropCollides(props: TileProps): boolean {
  return propValue(props, 'collides') === true
}

/** `left,right` → sides; empty / missing → null (all sides). */
export function parseStandSides(props: TileProps): StandSide[] | null {
  const raw = propValue(props, 'standSides')
  if (typeof raw !== 'string') return null
  const parts = raw
    .split(/[,|;/\s]+/)
    .map((s) => s.trim().toLowerCase())
    .filter((s) => SIDE_SET.has(s)) as StandSide[]
  return parts.length ? [...new Set(parts)] : null
}

export function parsePropActivation(props: TileProps): PropActivation | null {
  const raw = propValue(props, 'poiActivation')
  if (typeof raw !== 'string') return null
  const v = raw.trim().toLowerCase()
  if (v === 'any' || v === 'all') return v
  return null
}

export function parseStandSeed(props: TileProps): StandSeed | null {
  const raw = propValue(props, 'standSeed')
  if (typeof raw !== 'string') return null
  const v = raw.trim().toLowerCase()
  if (v === 'collides' || v === 'footprint') return v
  return null
}

export function parsePoiStand(props: TileProps): boolean {
  return propValue(props, 'poiStand') === true
}

export function isOverlayPropLayer(name: string): boolean {
  return name.startsWith('abovePlayer')
}

/** `poi_print_0#3` → `poi_print_0`; plain keys unchanged. */
export function applianceKeyFromSlotKey(slotKey: string): string {
  const i = slotKey.indexOf('#')
  return i >= 0 ? slotKey.slice(0, i) : slotKey
}

export function slotKeyFor(applianceKey: string, slotId: number): string {
  return `${applianceKey}#${slotId}`
}

/** Union-find: same cell (any layer) or 4-neighbor same kind. */
export function clusterPropCells(cells: PropCell[]): PropCell[][] {
  if (!cells.length) return []
  const parent = new Map<string, string>()
  const cellKey = (c: PropCell) => `${c.tx},${c.ty},${c.layerName},${c.gid}`
  const find = (k: string): string => {
    let p = parent.get(k) ?? k
    while (p !== (parent.get(p) ?? p)) p = parent.get(p)!
    parent.set(k, p)
    return p
  }
  const unite = (a: string, b: string) => {
    const ra = find(a)
    const rb = find(b)
    if (ra !== rb) parent.set(ra, rb)
  }

  for (const c of cells) parent.set(cellKey(c), cellKey(c))

  const byXy = new Map<string, PropCell[]>()
  for (const c of cells) {
    const xy = `${c.tx},${c.ty}`
    const list = byXy.get(xy) ?? []
    list.push(c)
    byXy.set(xy, list)
  }
  for (const list of byXy.values()) {
    for (let i = 1; i < list.length; i++) {
      if (list[i].kind === list[0].kind) unite(cellKey(list[0]), cellKey(list[i]))
    }
  }

  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as const
  const byXyKind = new Map<string, PropCell[]>()
  for (const c of cells) {
    const k = `${c.kind}:${c.tx},${c.ty}`
    const list = byXyKind.get(k) ?? []
    list.push(c)
    byXyKind.set(k, list)
  }
  for (const c of cells) {
    for (const [dx, dy] of dirs) {
      const nk = `${c.kind}:${c.tx + dx},${c.ty + dy}`
      const neighbors = byXyKind.get(nk)
      if (!neighbors?.length) continue
      unite(cellKey(c), cellKey(neighbors[0]))
    }
  }

  const groups = new Map<string, PropCell[]>()
  for (const c of cells) {
    const root = find(cellKey(c))
    const list = groups.get(root) ?? []
    list.push(c)
    groups.set(root, list)
  }
  return [...groups.values()]
}

function footprintBBox(tiles: Array<{ tx: number; ty: number }>) {
  let minX = tiles[0].tx
  let maxX = tiles[0].tx
  let minY = tiles[0].ty
  let maxY = tiles[0].ty
  for (const t of tiles) {
    if (t.tx < minX) minX = t.tx
    if (t.tx > maxX) maxX = t.tx
    if (t.ty < minY) minY = t.ty
    if (t.ty > maxY) maxY = t.ty
  }
  return { minX, maxX, minY, maxY }
}

/** Which outer side of the seed bbox a neighbor sits on. */
export function sideOfFootprintNeighbor(
  nx: number,
  ny: number,
  bbox: { minX: number; maxX: number; minY: number; maxY: number },
): StandSide | null {
  if (nx < bbox.minX) return 'left'
  if (nx > bbox.maxX) return 'right'
  if (ny < bbox.minY) return 'up'
  if (ny > bbox.maxY) return 'down'
  return null
}

export type CollectStandSlotsArgs = {
  /** Cells whose 4-neighbors become candidates (collides or footprint). */
  seeds: Array<{ tx: number; ty: number }>
  /** Bbox for standSides (usually same as seeds). */
  sideBBoxTiles: Array<{ tx: number; ty: number }>
  focus: { tx: number; ty: number }
  isWalkable: (tx: number, ty: number) => boolean
  standSides: StandSide[] | null
  /** Collide cells — never stand here. Soft footprint is NOT blocked. */
  collideBlocked: ReadonlySet<string>
  /** If non-empty, only these pads (manual poiStand); skip auto ring. */
  manualPads?: Array<{ tx: number; ty: number }>
}

/**
 * Build stand pads: manual poiStand wins; else 4-neighbors of seeds that are
 * walkable and not on a collide cell (soft footprint OK).
 */
export function collectStandSlots(args: CollectStandSlotsArgs): PropStandSlot[] {
  const {
    seeds,
    sideBBoxTiles,
    focus,
    isWalkable,
    standSides,
    collideBlocked,
    manualPads,
  } = args

  const finalize = (list: Array<{ tx: number; ty: number }>) => {
    const sorted = [...list].sort((a, b) =>
      a.ty !== b.ty ? a.ty - b.ty : a.tx - b.tx,
    )
    return sorted.map((c, id) => ({
      id,
      tx: c.tx,
      ty: c.ty,
      dwellFacing: clusterDwellFacing(c, focus, sideBBoxTiles),
    }))
  }

  if (manualPads?.length) {
    const pads = manualPads.filter(
      (p) =>
        isWalkable(p.tx, p.ty) && !collideBlocked.has(`${p.tx},${p.ty}`),
    )
    return finalize(pads)
  }

  if (!seeds.length) return []

  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as const
  const candidates = new Map<string, { tx: number; ty: number }>()
  for (const s of seeds) {
    for (const [dx, dy] of dirs) {
      const tx = s.tx + dx
      const ty = s.ty + dy
      const k = `${tx},${ty}`
      if (collideBlocked.has(k) || candidates.has(k)) continue
      if (!isWalkable(tx, ty)) continue
      candidates.set(k, { tx, ty })
    }
  }
  let list = [...candidates.values()]
  if (standSides?.length && sideBBoxTiles.length) {
    const bbox = footprintBBox(sideBBoxTiles)
    const allow = new Set(standSides)
    // Strict: never fall back to disallowed sides (e.g. north) when filter is empty.
    list = list.filter((c) => {
      const side = sideOfFootprintNeighbor(c.tx, c.ty, bbox)
      return side !== null && allow.has(side)
    })
  }
  return finalize(list)
}

/**
 * Dwell facing for a causal stand pad: face the appliance by stand side
 * (right pad → look left). Avoids faceToward diagonal ties that preferred "up"
 * when focus was footprint top-left (coffee). Soft pads inside bbox fall back
 * to nearest footprint cell, then focus.
 */
export function clusterDwellFacing(
  stand: { tx: number; ty: number },
  focus: { tx: number; ty: number },
  sideBBoxTiles: Array<{ tx: number; ty: number }> = [],
): 0 | 1 | 2 | 3 {
  if (sideBBoxTiles.length) {
    const side = sideOfFootprintNeighbor(
      stand.tx,
      stand.ty,
      footprintBBox(sideBBoxTiles),
    )
    if (side === 'left') return 2
    if (side === 'right') return 1
    if (side === 'up') return 0
    if (side === 'down') return 3

    let best = sideBBoxTiles[0]
    let bestD = Infinity
    for (const t of sideBBoxTiles) {
      const d =
        (t.tx + 0.5 - (stand.tx + 0.5)) ** 2 +
        (t.ty + 0.5 - (stand.ty + 0.5)) ** 2
      if (d < bestD) {
        bestD = d
        best = t
      }
    }
    return faceToward(
      { x: stand.tx + 0.5, y: stand.ty + 0.5 },
      { x: best.tx + 0.5, y: best.ty + 0.5 },
    )
  }
  return faceToward(
    { x: stand.tx + 0.5, y: stand.ty + 0.5 },
    { x: focus.tx + 0.5, y: focus.ty + 0.5 },
  )
}

function mergeStandSides(group: PropCell[]): StandSide[] | null {
  for (const c of group) {
    if (c.standSides?.length) return c.standSides
  }
  return null
}

function mergeActivation(group: PropCell[]): PropActivation {
  for (const c of group) {
    if (c.activation === 'any' || c.activation === 'all') return c.activation
  }
  return 'any'
}

function mergeStandSeed(group: PropCell[]): StandSeed {
  for (const c of group) {
    if (c.standSeed === 'collides' || c.standSeed === 'footprint') {
      return c.standSeed
    }
  }
  return 'collides'
}

/** Stable key prefix + index by top-left collide (else bbox) of each group. */
export function buildPropClusters(
  cells: PropCell[],
  isWalkable: (tx: number, ty: number) => boolean,
): PropCluster[] {
  const groups = clusterPropCells(cells)
  type Draft = {
    kind: PoiKind
    cells: PropCell[]
    collideCells: Array<{ tx: number; ty: number }>
    sortX: number
    sortY: number
    standSides: StandSide[] | null
    activation: PropActivation
    standSeed: StandSeed
  }
  const drafts: Draft[] = groups.map((group) => {
    const kind = group[0].kind
    const collideSet = new Map<string, { tx: number; ty: number }>()
    for (const c of group) {
      if (!c.collides) continue
      collideSet.set(`${c.tx},${c.ty}`, { tx: c.tx, ty: c.ty })
    }
    const collideCells = [...collideSet.values()]
    const anchor = collideCells.length
      ? collideCells.reduce((a, b) =>
          b.ty < a.ty || (b.ty === a.ty && b.tx < a.tx) ? b : a,
        )
      : group.reduce(
          (a, b) =>
            b.ty < a.ty || (b.ty === a.ty && b.tx < a.tx) ? b : a,
          group[0],
        )
    return {
      kind,
      cells: group,
      collideCells,
      sortX: anchor.tx,
      sortY: anchor.ty,
      standSides: mergeStandSides(group),
      activation: mergeActivation(group),
      standSeed: mergeStandSeed(group),
    }
  })

  drafts.sort((a, b) =>
    a.kind !== b.kind
      ? a.kind < b.kind
        ? -1
        : 1
      : a.sortY !== b.sortY
        ? a.sortY - b.sortY
        : a.sortX - b.sortX,
  )

  const indexByKind = new Map<string, number>()
  return drafts.map((d) => {
    const i = indexByKind.get(d.kind) ?? 0
    indexByKind.set(d.kind, i + 1)
    const footprintMap = new Map<string, { tx: number; ty: number }>()
    for (const c of d.cells) {
      footprintMap.set(`${c.tx},${c.ty}`, { tx: c.tx, ty: c.ty })
    }
    const footprint = [...footprintMap.values()]
    const collideBlocked = new Set(
      d.collideCells.map((c) => `${c.tx},${c.ty}`),
    )
    const focus =
      d.collideCells[0] ??
      d.cells.reduce(
        (a, b) =>
          b.ty < a.ty || (b.ty === a.ty && b.tx < a.tx) ? b : a,
        d.cells[0],
      )

    const manualPadMap = new Map<string, { tx: number; ty: number }>()
    for (const c of d.cells) {
      if (!c.poiStand || c.collides) continue
      manualPadMap.set(`${c.tx},${c.ty}`, { tx: c.tx, ty: c.ty })
    }
    const manualPads = [...manualPadMap.values()]

    const useFootprintSeed =
      d.standSeed === 'footprint' || d.collideCells.length === 0
    const seeds = useFootprintSeed ? footprint : d.collideCells
    const sideBBoxTiles = useFootprintSeed ? footprint : d.collideCells

    // footprint seed: exclude entire footprint (old ring). collides seed: only
    // collide cells blocked so soft pads are allowed.
    const blocked =
      useFootprintSeed && !manualPads.length
        ? new Set(footprint.map((t) => `${t.tx},${t.ty}`))
        : collideBlocked

    const slots = collectStandSlots({
      seeds,
      sideBBoxTiles,
      focus,
      isWalkable,
      standSides: d.standSides,
      collideBlocked: blocked,
      manualPads: manualPads.length ? manualPads : undefined,
    })

    return {
      key: `poi_${d.kind}_${i}`,
      kind: d.kind,
      cells: d.cells,
      collideCells: d.collideCells,
      slots,
      activation: d.activation,
      standSides: d.standSides,
      standSeed: d.standSeed,
    }
  })
}
