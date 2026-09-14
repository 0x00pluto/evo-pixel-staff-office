import Phaser from 'phaser'
import { SKIN_COUNT } from '../catalog/skinCount'
import type { AgentPersona } from '../catalog/types'
import { isLiveLocked } from '../presence/liveLock'
import type { PresenceRecord, PresenceState } from '../presence/types'
import {
  dwellMs,
  faceToward,
  glanceDir,
  hashPick,
  initialWorkingMode,
  meetingCooldownMs,
  meetingSize,
  nextDeskMode,
  parseDwellFacing,
  pickSoloPoi,
  rescheduleFidgetMs,
  scheduleFidgetMs,
  travelTimeoutMs,
  workingDurationMs,
  type AgentRuntime,
  type PoiKind,
  type WanderTargetKind,
} from './agentFsm'
import {
  FOOT_BODY_H,
  FOOT_BODY_SOUTH,
  FOOT_BODY_W,
  footBoxClear,
  footSafePointInCell,
} from './footHitbox'
import {
  applianceKeyFromSlotKey,
  buildPropClusters,
  isCausalPoiKind,
  isOverlayPropLayer,
  parsePoiStand,
  parsePropActivation,
  parseStandSeed,
  parseStandSides,
  parseTilePoiKind,
  PROP_SCAN_LAYERS,
  slotKeyFor,
  tilePropCollides,
  type PropCell,
  type PropCluster,
} from './mapProp'
import { isWallHugMiddleNode } from './pathClearance'
import {
  DEFAULT_MAP_ID,
  getMapEntry,
  getMapKind,
  isRegisteredMapId,
  MAP_REGISTRY,
  selectOfficeMapId,
  TILESET_ASSETS,
} from './mapRegistry'
import type { NameplateView, OfficeGameCallbacks } from './types'

const TILE = 32
const CHAR_SCALE = 1
const CELL = TILE * CHAR_SCALE
const SPEED = 55
/** No meaningful foot movement for this long → repath (corner slide lock). */
const STUCK_REPATH_MS = 500
const STUCK_MOVE_EPS = 1.5
/** Max repaths per setWalkGoal (avoid oscillation). */
const STUCK_REPATH_MAX = 3
/** Align WA DEPTH_OVERLAY_INDEX: layers after floorLayer draw above agents. */
const DEPTH_OVERLAY = 1_000_000
/** World px above sprite top so the plate sits just over the head (WA ≈ 2). */
const NAMEPLATE_GAP = 2

type Point = { x: number; y: number }
/** Map POI with Tiled object name as soft-claim key (e.g. poi_meeting_0). */
type MapPoi = {
  key: string
  point: Point
  kind: PoiKind
  /** Idle facing while dwelling; 0=down … 3=up (from dwellFacing). */
  dwellFacing: 0 | 1 | 2 | 3
}

type WanderDest = { point: Point; kind: WanderTargetKind; claimKey: string | null }

const POI_KINDS: PoiKind[] = ['lounge', 'coffee', 'meeting', 'print']

type MapPropRuntime = {
  key: string
  kind: PoiKind
  activation: 'any' | 'all'
  slotKeys: string[]
  sprites: Phaser.GameObjects.Sprite[]
  setState: (state: 'idle' | 'using') => void
}

/** `poi_lounge_0` → lounge; unknown kind ignored. */
function parsePoiKind(name: string): PoiKind | null {
  if (!name.startsWith('poi_')) return null
  const kind = name.slice(4).split('_')[0]
  return (POI_KINDS as string[]).includes(kind) ? (kind as PoiKind) : null
}

/** One desk: same N in spawn_N + computer_N. */
type Workstation = {
  spawn: Point
  computer: Point | null
}

type ExitZone = {
  exitMap: string
  entryName: string
  cells: Set<string>
}

function parseObjectIndex(name: string, prefix: string): number | null {
  if (!name.startsWith(prefix)) return null
  const n = Number(name.slice(prefix.length))
  return Number.isInteger(n) && n >= 0 ? n : null
}

function cellKey(tx: number, ty: number) {
  return `${tx},${ty}`
}

function layerProp(
  layer: Phaser.Tilemaps.LayerData | undefined,
  name: string,
): string | boolean | number | undefined {
  const props = layer?.properties as
    | Array<{ name: string; value: string | boolean | number }>
    | Record<string, string | boolean | number>
    | undefined
  if (!props) return undefined
  if (Array.isArray(props)) {
    return props.find((p) => p.name === name)?.value
  }
  return props[name]
}

/** Tiled object custom property (array or record form from Phaser). */
function objectProp(
  obj: Phaser.Types.Tilemaps.TiledObject,
  name: string,
): string | boolean | number | undefined {
  const props = obj.properties as
    | Array<{ name: string; value: string | boolean | number }>
    | Record<string, string | boolean | number>
    | undefined
  if (!props) return undefined
  if (Array.isArray(props)) {
    return props.find((p) => p.name === name)?.value
  }
  return props[name]
}

export class OfficeScene extends Phaser.Scene {
  private agents: AgentPersona[] = []
  private callbacks!: OfficeGameCallbacks
  private collision: boolean[][] = []
  private mapW = 0
  private mapH = 0
  private cell = CELL
  private spawns: Point[] = []
  private workstations: Workstation[] = []
  /** Wander destinations from poi_* objects + causal tile props. */
  private pois: MapPoi[] = []
  /** Causal appliances (printer…): claim key → runtime sprites. */
  private mapProps = new Map<string, MapPropRuntime>()
  /** Collide cells kept after createFromTiles removes animated stamps. */
  private propCollideCells = new Set<string>()
  /** Layer name → depth assigned in mountMap (for prop sprites). */
  private layerDepthByName = new Map<string, number>()
  /** One desk per agent id; rebuilt on each spawnAgents. */
  private deskByAgentId = new Map<string, Workstation>()
  private sprites = new Map<string, Phaser.GameObjects.Sprite>()
  /** Soft foot shadow under each agent; destroyed with clearAgents. */
  private shadows = new Map<string, Phaser.GameObjects.Ellipse>()
  private runtimes = new Map<string, AgentRuntime>()
  /** Live presence by agent id (parallel to catalog; not written into AgentPersona). */
  private presenceById = new Map<string, PresenceRecord>()
  private footDebug = false
  private footDebugGfx: Phaser.GameObjects.Graphics | null = null
  private footDebugLabels: Phaser.GameObjects.Text[] = []
  private drag = false
  private dragLast = new Phaser.Math.Vector2()
  private _lastPlateAt = 0
  private assetsFailed = false
  private currentMapId = DEFAULT_MAP_ID
  private tilemap: Phaser.Tilemaps.Tilemap | null = null
  private mapLayers: Array<{ destroy: () => void; setDepth: (d: number) => unknown }> = []
  private exitZones: ExitZone[] = []
  private exitCooldownUntil = 0
  /** Next time a scene-level meeting event may fire (0 = ASAP after load). */
  private meetingCooldownUntil = 0
  /** Active meeting: recruited agent ids (shrinks on travel timeout / leave). */
  private meetingMemberIds = new Set<string>()
  /** Subset of members who have arrived at their meeting seat. */
  private meetingArrivedIds = new Set<string>()
  /** Shared adjourn time; null until all remaining members have arrived. */
  private meetingEndsAt: number | null = null
  private switching = false
  /** Min zoom: whole map fits in viewport (contain); gutters OK. */
  private minZoom = 1
  private static readonly MAX_ZOOM = 2.2

  constructor() {
    super('OfficeScene')
  }

  init(data: { agents: AgentPersona[]; callbacks: OfficeGameCallbacks }) {
    this.agents = data.agents
    this.callbacks = data.callbacks
  }

  preload() {
    this.load.on('loaderror', (file: Phaser.Loader.File) => {
      this.assetsFailed = true
      const key = file?.key ?? 'unknown'
      const url = typeof file?.url === 'string' ? file.url : String(file?.url ?? '')
      this.callbacks.onAssetsError?.(
        `素材加载失败：${key}${url ? `（${url}）` : ''}。请确认 public/assets/maps 下有 Tiled JSON / tileset PNG，以及 characters.png。`,
      )
    })

    for (const ts of TILESET_ASSETS) {
      this.load.image(ts.key, ts.url)
      // Same PNG as a spritesheet so causal props can play Tiled tile animations.
      this.load.spritesheet(`${ts.key}__sheet`, ts.url, {
        frameWidth: TILE,
        frameHeight: TILE,
      })
    }
    for (const entry of Object.values(MAP_REGISTRY)) {
      this.load.tilemapTiledJSON(entry.id, entry.json)
    }
    this.load.spritesheet('characters', '/assets/characters.png', {
      frameWidth: TILE,
      frameHeight: TILE,
    })
  }

  create() {
    if (this.assetsFailed) return
    if (!this.textures.exists('characters')) {
      this.assetsFailed = true
      this.callbacks.onAssetsError?.(
        '素材缺失：characters.png 未能进入缓存。请检查 public/assets 并运行 pnpm pack:assets。',
      )
      return
    }

    this.setupCameraInput()
    this.ensureAnims()

    this.currentMapId = selectOfficeMapId(this.agents.length)
    const ok = this.mountMap(this.currentMapId, 'start')
    if (!ok) return
    if (getMapKind(this.currentMapId) === 'world') {
      this.callbacks.onNameplates([])
      return
    }
    this.spawnAgents(this.agents)
    this.enforcePresenceLocks(this.time.now)
  }

  reloadAgents(agents: AgentPersona[]) {
    this.agents = agents
    // World map: keep park view; roster count lives in React toolbar.
    if (getMapKind(this.currentMapId) === 'world') return
    this.clearAgents()
    if (this.assetsFailed || !this.tilemap) return
    const nextId = selectOfficeMapId(agents.length)
    if (nextId !== this.currentMapId && isRegisteredMapId(nextId)) {
      const ok = this.mountMap(nextId, 'start')
      if (!ok) return
    }
    this.spawnAgents(agents)
    this.enforcePresenceLocks(this.time.now)
  }

  /**
   * Apply live presence snapshot from App poll. Does not mutate AgentPersona.
   * Live-locked agents walk home / stay at desk; blocked disables fidget.
   */
  applyPresence(records: PresenceRecord[]) {
    this.presenceById.clear()
    for (const r of records) this.presenceById.set(r.id, r)
    if (getMapKind(this.currentMapId) === 'world') return
    if (this.assetsFailed || this.switching) return
    this.enforcePresenceLocks(this.time.now)
  }

  private presenceState(id: string): PresenceState {
    return this.presenceById.get(id)?.state ?? 'idle'
  }

  private presenceSummary(id: string): string {
    return this.presenceById.get(id)?.summary?.trim() ?? ''
  }

  /**
   * Presence overlay: working/blocked cancel wander/meeting and return to desk.
   * working enables fidget; blocked stands still (no fidget).
   */
  private enforcePresenceLocks(now: number) {
    for (const [id, rt] of this.runtimes) {
      const state = this.presenceState(id)
      if (!isLiveLocked(state)) continue
      const sprite = this.sprites.get(id)
      if (!sprite) continue

      const needsHome =
        rt.mode === 'wander' ||
        rt.poiClaimKey != null ||
        this.meetingMemberIds.has(id)

      if (needsHome) {
        this.beginWalkHome(id, sprite, rt, now)
      } else if (rt.mode !== 'working') {
        rt.mode = 'working'
        rt.wanderPhase = 'none'
        rt.poiKind = null
        rt.modeUntil = now + workingDurationMs()
        const desk = this.workstationFor(id)
        if (desk) {
          if (desk.computer) {
            rt.faceDir = faceToward(desk.spawn, desk.computer)
          }
          this.setWalkGoal(sprite, rt, desk.spawn, { stretchTimer: true })
        }
      }

      if (state === 'blocked') {
        rt.fidget = 'none'
        rt.dir = rt.faceDir
        // Far future: updateWorkingFidget won't start a new fidget.
        rt.fidgetUntil = now + 86_400_000
        rt.fidgetEndsAt = 0
        const anim = `idle-${rt.persona.skin}-${rt.faceDir}`
        if (sprite.anims.currentAnim?.key !== anim) sprite.play(anim)
      } else if (state === 'working') {
        // Re-enable fidget schedule if we had parked it for blocked.
        if (rt.fidgetUntil > now + 60_000) {
          rt.fidgetUntil = now + scheduleFidgetMs()
        }
      }
    }
  }

  private setupCameraInput() {
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (p.rightButtonDown() || p.middleButtonDown()) return
      this.drag = true
      this.dragLast.set(p.x, p.y)
    })
    this.input.on('pointerup', () => {
      this.drag = false
    })
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!this.drag || !p.isDown) return
      const cam = this.cameras.main
      cam.scrollX -= (p.x - this.dragLast.x) / cam.zoom
      cam.scrollY -= (p.y - this.dragLast.y) / cam.zoom
      this.dragLast.set(p.x, p.y)
    })
    this.input.on(
      'wheel',
      (
        _p: Phaser.Input.Pointer,
        _gos: unknown,
        _dx: number,
        dy: number,
      ) => {
        const cam = this.cameras.main
        const next = Phaser.Math.Clamp(
          cam.zoom - dy * 0.001,
          this.minZoom,
          OfficeScene.MAX_ZOOM,
        )
        cam.setZoom(next)
      },
    )
    this.scale.on('resize', () => {
      if (!this.assetsFailed && this.tilemap) this.fitCameraToMap(true)
    })
    this.input.on(
      'pointerdown',
      (p: Phaser.Input.Pointer, currentlyOver: Phaser.GameObjects.GameObject[]) => {
        if (!p.leftButtonDown()) return
        if (currentlyOver.length) return
        this.callbacks.onSelect(null)
        // Click door/exit tiles to switch maps (dashboard demo + S2 UI-click)
        if (this.assetsFailed || this.switching) return
        if (this.time.now < this.exitCooldownUntil) return
        const world = this.cameras.main.getWorldPoint(p.x, p.y)
        const hit = this.exitAt(world.x, world.y)
        if (hit) this.switchMap(hit.exitMap, hit.entryName)
      },
    )
  }

  private destroyMapLayers() {
    this.clearMapProps()
    for (const layer of this.mapLayers) layer.destroy()
    this.mapLayers = []
    if (this.tilemap) {
      this.tilemap.destroy()
      this.tilemap = null
    }
    this.exitZones = []
    this.collision = []
    this.spawns = []
    this.workstations = []
    this.pois = []
    this.propCollideCells.clear()
    this.layerDepthByName.clear()
    this.deskByAgentId.clear()
  }

  private clearMapProps() {
    for (const prop of this.mapProps.values()) {
      for (const s of prop.sprites) s.destroy()
    }
    this.mapProps.clear()
  }

  private clearAgents() {
    for (const s of this.sprites.values()) s.destroy()
    this.sprites.clear()
    for (const sh of this.shadows.values()) sh.destroy()
    this.shadows.clear()
    this.runtimes.clear()
    this.deskByAgentId.clear()
    this.clearMeetingSession()
  }

  private clearMeetingSession() {
    this.meetingMemberIds.clear()
    this.meetingArrivedIds.clear()
    this.meetingEndsAt = null
  }

  /** Mount tilemap by registry id; returns false on failure (sets page error). */
  private mountMap(mapId: string, entryName: string | null): boolean {
    if (!isRegisteredMapId(mapId)) {
      this.assetsFailed = true
      this.callbacks.onAssetsError?.(
        `地图未注册：exitMap「${mapId}」不在地图注册表中（仅允许 ${Object.keys(MAP_REGISTRY).join(', ')}）。`,
      )
      return false
    }

    const entry = getMapEntry(mapId)!
    if (!this.cache.tilemap.exists(mapId)) {
      this.assetsFailed = true
      this.callbacks.onAssetsError?.(
        `地图 JSON 缺失：${mapId}（${entry.json}）未能进入缓存。请检查 public/assets/maps。`,
      )
      return false
    }

    this.destroyMapLayers()

    const map = this.make.tilemap({ key: mapId })
    this.tilemap = map
    this.currentMapId = mapId
    this.mapW = map.width
    this.mapH = map.height
    this.cell = map.tileWidth || CELL

    const tilesets: Phaser.Tilemaps.Tileset[] = []
    const mapTilesetNames = new Set(
      (map.tilesets ?? []).map((t) => t.name).filter(Boolean),
    )
    for (const ts of TILESET_ASSETS) {
      if (!mapTilesetNames.has(ts.name)) continue
      const added = map.addTilesetImage(ts.name, ts.key)
      if (added) tilesets.push(added)
    }
    if (!tilesets.length) {
      this.assetsFailed = true
      this.callbacks.onAssetsError?.(
        `地图 ${mapId} 未能绑定 tileset 贴图。请检查 public/assets/maps/tilesets。`,
      )
      return false
    }

    // WA z-order: Tiled list order; objectgroup "floorLayer" splits below/above agents.
    // Phaser map.layers is tilelayers-only — read raw JSON so floorLayer is visible.
    // Skip evo logic layers (Special Zones / markers) so they never paint.
    const logicLayer = (name: string) =>
      name === 'collisions' ||
      name === 'collision' ||
      name === 'start' ||
      name === 'exit' ||
      name.startsWith('exit') ||
      name === 'from-office' ||
      name === 'office-door' ||
      name === 'silentOverlay' ||
      name === 'objects'

    type TiledLayerRef = { name?: string; type?: string }
    const cached = this.cache.tilemap.get(mapId) as
      | { data?: { layers?: TiledLayerRef[] } }
      | undefined
    const tiledLayers = cached?.data?.layers ?? []

    let depth = 0
    this.layerDepthByName.clear()
    for (const layerData of tiledLayers) {
      const name = layerData.name ?? ''
      if (
        layerData.type === 'objectgroup' &&
        (name === 'floorLayer' || name.endsWith('/floorLayer'))
      ) {
        depth = DEPTH_OVERLAY
        continue
      }
      if (layerData.type !== 'tilelayer') continue
      if (logicLayer(name)) continue
      if (!map.getLayer(name)) continue
      const layer = map.createLayer(name, tilesets, 0, 0)
      if (!layer) continue
      layer.setDepth(depth)
      this.layerDepthByName.set(name, depth)
      depth += 1
      this.mapLayers.push(layer)
    }

    this.exitZones = this.parseExitZones(map)
    this.parseObjects(map)
    this.mountCausalProps(map)
    this.rebuildCollision(map)

    const worldW = this.mapW * this.cell
    const worldH = this.mapH * this.cell
    this.cameras.main.setBounds(0, 0, worldW, worldH)
    this.cameras.main.setRoundPixels(true)

    this.fitCameraToMap(false)
    const focus = this.resolveEntryPoint(map, entryName)
    this.cameras.main.centerOn(focus.x, focus.y)

    return true
  }

  private tileHasCollides(tile: Phaser.Tilemaps.Tile | null): boolean {
    if (!tile || tile.index <= 0) return false
    const props = tile.properties as
      | { collides?: boolean }
      | Array<{ name: string; value: unknown }>
      | undefined
    if (!props) return false
    if (Array.isArray(props)) {
      return props.some((p) => p.name === 'collides' && p.value === true)
    }
    return props.collides === true
  }

  private rebuildCollision(map: Phaser.Tilemaps.Tilemap) {
    const layers = ['walls', 'furniture', 'aboveFurniture', 'collisions'] as const
    this.collision = Array.from({ length: this.mapH }, (_, y) =>
      Array.from({ length: this.mapW }, (_, x) => {
        if (this.propCollideCells.has(cellKey(x, y))) return true
        for (const name of layers) {
          if (!map.getLayer(name)) continue
          const tile = map.getTileAt(x, y, true, name)
          if (!tile || tile.index <= 0) continue
          if (name === 'walls') return true
          if (name === 'collisions') return true
          if (this.tileHasCollides(tile)) return true
        }
        return false
      }),
    )
  }

  /** Fit camera: min = contain (full map + blue gutters); initial zoom = cover. */
  private fitCameraToMap(keepRelativeZoom: boolean) {
    const cam = this.cameras.main
    const worldW = this.mapW * this.cell
    const worldH = this.mapH * this.cell
    if (worldW <= 0 || worldH <= 0) return

    const viewW = cam.width || this.scale.width || 1
    const viewH = cam.height || this.scale.height || 1
    this.minZoom = Math.min(viewW / worldW, viewH / worldH)
    const coverZoom = Math.max(viewW / worldW, viewH / worldH)

    if (!keepRelativeZoom) {
      cam.setZoom(coverZoom)
      cam.centerOn(worldW / 2, worldH / 2)
      return
    }

    const midX = cam.scrollX + viewW / (2 * cam.zoom)
    const midY = cam.scrollY + viewH / (2 * cam.zoom)
    cam.setZoom(Phaser.Math.Clamp(cam.zoom, this.minZoom, OfficeScene.MAX_ZOOM))
    cam.centerOn(midX, midY)
  }

  private parseExitZones(map: Phaser.Tilemaps.Tilemap): ExitZone[] {
    const zones: ExitZone[] = []
    for (const layerData of map.layers) {
      if (layerData.name !== 'exit' && !layerData.name.startsWith('exit')) continue
      const exitMap = String(layerProp(layerData, 'exitMap') ?? '')
      const entryName = String(layerProp(layerData, 'entryName') ?? 'start')
      if (!exitMap) continue
      const cells = new Set<string>()
      for (let y = 0; y < map.height; y++) {
        for (let x = 0; x < map.width; x++) {
          const tile = map.getTileAt(x, y, true, layerData.name)
          if (tile && tile.index > 0) cells.add(cellKey(x, y))
        }
      }
      if (cells.size) zones.push({ exitMap, entryName, cells })
    }
    return zones
  }

  private parseObjects(map: Phaser.Tilemaps.Tilemap) {
    this.spawns = []
    this.workstations = []
    this.pois = []
    const byIndex = new Map<number, { spawn?: Point; computer?: Point }>()

    for (const obj of map.getObjectLayer('objects')?.objects ?? []) {
      const name = obj.name || ''
      const pt: Point = { x: obj.x ?? 0, y: obj.y ?? 0 }
      const poiKind = parsePoiKind(name)
      if (poiKind) {
        // Causal appliances come from tile poiKind stamps, not Points.
        if (isCausalPoiKind(poiKind)) continue
        this.pois.push({
          key: name,
          point: pt,
          kind: poiKind,
          dwellFacing: parseDwellFacing(objectProp(obj, 'dwellFacing')),
        })
        continue
      }
      const spawnIdx = parseObjectIndex(name, 'spawn_')
      if (spawnIdx !== null) {
        const slot = byIndex.get(spawnIdx) ?? {}
        slot.spawn = pt
        byIndex.set(spawnIdx, slot)
        continue
      }
      const computerIdx = parseObjectIndex(name, 'computer_')
      if (computerIdx !== null) {
        const slot = byIndex.get(computerIdx) ?? {}
        slot.computer = pt
        byIndex.set(computerIdx, slot)
      }
    }

    const complete: Workstation[] = []
    const spawnOnly: Workstation[] = []
    for (const idx of [...byIndex.keys()].sort((a, b) => a - b)) {
      const slot = byIndex.get(idx)!
      if (slot.spawn && slot.computer) {
        complete.push({ spawn: slot.spawn, computer: slot.computer })
      } else if (slot.spawn) {
        spawnOnly.push({ spawn: slot.spawn, computer: null })
      }
    }

    this.workstations = complete.length ? complete : spawnOnly
    this.spawns = this.workstations.map((w) => w.spawn)
  }

  /**
   * Scan furniture / abovePlayer* for tile `poiKind`, cluster into appliances,
   * turn animated stamps into sprites (idle until dwell), keep collide cells.
   */
  private mountCausalProps(map: Phaser.Tilemaps.Tilemap) {
    this.clearMapProps()
    this.propCollideCells.clear()

    const cells = this.scanPropCells(map)
    if (!cells.length) return

    // Stand pads use tile collision (not foot hitbox) so counter-adjacent
    // cells like coffee (2,9) still qualify when the cell itself is free.
    this.rebuildCollision(map)
    const clusters = buildPropClusters(cells, (tx, ty) =>
      this.tileWalkable(tx, ty),
    )

    for (const cluster of clusters) {
      for (const c of cluster.collideCells) {
        this.propCollideCells.add(cellKey(c.tx, c.ty))
      }
      this.spawnPropRuntime(map, cluster)
    }

    // Re-build walkability after prop collide set is filled (stand already chosen).
    this.rebuildCollision(map)
  }

  private scanPropCells(map: Phaser.Tilemaps.Tilemap): PropCell[] {
    const cells: PropCell[] = []
    for (const layerName of PROP_SCAN_LAYERS) {
      if (!map.getLayer(layerName)) continue
      for (let ty = 0; ty < map.height; ty++) {
        for (let tx = 0; tx < map.width; tx++) {
          const tile = map.getTileAt(tx, ty, true, layerName)
          if (!tile || tile.index <= 0) continue
          const tileset = tile.tileset
          if (!tileset) continue
          const props = tile.properties as
            | {
                poiKind?: unknown
                collides?: unknown
                standSides?: unknown
                poiActivation?: unknown
                standSeed?: unknown
                poiStand?: unknown
              }
            | Array<{ name: string; value: unknown }>
          const kind = parseTilePoiKind(props)
          if (!kind) continue
          const localId = tile.index - tileset.firstgid
          const tileData = (
            tileset as Phaser.Tilemaps.Tileset & {
              tileData?: Record<number, { animation?: unknown }>
            }
          ).tileData?.[localId]
          const hasAnimation = Array.isArray(tileData?.animation)
            && (tileData.animation as unknown[]).length > 0
          cells.push({
            tx,
            ty,
            layerName,
            gid: tile.index,
            localId,
            tilesetName: tileset.name,
            kind,
            collides: tilePropCollides(props),
            hasAnimation,
            overlay: isOverlayPropLayer(layerName),
            standSides: parseStandSides(props),
            activation: parsePropActivation(props),
            standSeed: parseStandSeed(props),
            poiStand: parsePoiStand(props),
          })
        }
      }
    }
    return cells
  }

  private tilesetAssetKey(tilesetName: string): string | null {
    return TILESET_ASSETS.find((t) => t.name === tilesetName)?.key ?? null
  }

  private ensurePropAnim(
    tilesetName: string,
    localId: number,
    sheetKey: string,
    map: Phaser.Tilemaps.Tilemap,
  ): string | null {
    const animKey = `prop-${tilesetName}-${localId}`
    if (this.anims.exists(animKey)) return animKey
    const tileset = map.getTileset(tilesetName)
    if (!tileset) return null
    const tileData = (
      tileset as Phaser.Tilemaps.Tileset & {
        tileData?: Record<
          number,
          { animation?: Array<{ tileid: number; duration: number }> }
        >
      }
    ).tileData?.[localId]
    const frames = tileData?.animation
    if (!frames?.length) return null
    this.anims.create({
      key: animKey,
      frames: frames.map((f) => ({
        key: sheetKey,
        frame: f.tileid,
        duration: f.duration,
      })),
      repeat: -1,
    })
    return animKey
  }

  private spawnPropRuntime(map: Phaser.Tilemaps.Tilemap, cluster: PropCluster) {
    if (!cluster.slots.length) return

    const sprites: Phaser.GameObjects.Sprite[] = []
    const animKeys: Array<string | null> = []
    const animatedCells = cluster.cells.filter((c) => c.hasAnimation)

    for (const c of animatedCells) {
      const assetKey = this.tilesetAssetKey(c.tilesetName)
      if (!assetKey) continue
      const sheetKey = `${assetKey}__sheet`
      if (!this.textures.exists(sheetKey)) continue

      const animKey = this.ensurePropAnim(
        c.tilesetName,
        c.localId,
        sheetKey,
        map,
      )
      const worldX = c.tx * this.cell
      const worldY = c.ty * this.cell
      const sprite = this.add.sprite(worldX, worldY, sheetKey, c.localId)
      sprite.setOrigin(0, 0)
      const layerDepth =
        this.layerDepthByName.get(c.layerName) ??
        (c.overlay ? DEPTH_OVERLAY : c.ty * this.cell)
      sprite.setDepth(layerDepth)
      sprites.push(sprite)
      animKeys.push(animKey)

      // Remove stamp so Tiled ambient loop does not fight the sprite.
      map.removeTileAt(c.tx, c.ty, true, true, c.layerName)
    }

    const setState = (state: 'idle' | 'using') => {
      sprites.forEach((sprite, i) => {
        const animKey = animKeys[i]
        if (state === 'using' && animKey) {
          sprite.play(animKey)
          return
        }
        sprite.anims.stop()
        const localId = animatedCells[i]?.localId
        if (typeof localId === 'number') sprite.setFrame(localId)
      })
    }

    setState('idle')

    const standPois: MapPoi[] = []
    for (const slot of cluster.slots) {
      const point = footSafePointInCell(
        slot.tx,
        slot.ty,
        (tx, ty) => this.tileWalkable(tx, ty),
        this.cell,
      )
      if (!point) continue
      standPois.push({
        key: slotKeyFor(cluster.key, slot.id),
        point,
        kind: cluster.kind,
        dwellFacing: slot.dwellFacing,
      })
    }
    if (!standPois.length) {
      for (const s of sprites) s.destroy()
      return
    }

    this.mapProps.set(cluster.key, {
      key: cluster.key,
      kind: cluster.kind,
      activation: cluster.activation,
      slotKeys: standPois.map((p) => p.key),
      sprites,
      setState,
    })
    for (const poi of standPois) this.pois.push(poi)
  }

  /** True if another agent still claims a slot on this appliance (to/dwell). */
  private applianceStillInUse(applianceKey: string, exceptId?: string): boolean {
    for (const [id, rt] of this.runtimes) {
      if (exceptId && id === exceptId) continue
      if (!rt.poiClaimKey) continue
      if (applianceKeyFromSlotKey(rt.poiClaimKey) !== applianceKey) continue
      if (rt.mode !== 'wander') continue
      if (rt.wanderPhase === 'to' || rt.wanderPhase === 'dwell') return true
    }
    return false
  }

  private setApplianceStateFromClaim(
    claimKey: string | null,
    state: 'idle' | 'using',
    exceptId?: string,
  ) {
    if (!claimKey) return
    const applianceKey = applianceKeyFromSlotKey(claimKey)
    const prop = this.mapProps.get(applianceKey)
    if (!prop) return
    if (state === 'idle') {
      if (this.applianceStillInUse(applianceKey, exceptId)) return
      prop.setState('idle')
      return
    }
    // `any`: one dweller is enough. `all` reserved for later group play.
    if (prop.activation === 'all') {
      // Period: treat like any until group recruitment exists.
      prop.setState('using')
      return
    }
    prop.setState('using')
  }

  /**
   * Stable 1:1 desks: agents sorted by id take workstations[0..k-1].
   * Only overflow (agents > desks) hash-reuses existing desks.
   */
  private assignDesks(agents: AgentPersona[]) {
    this.deskByAgentId.clear()
    if (!this.workstations.length) return
    const sorted = [...agents].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    const n = this.workstations.length
    sorted.forEach((persona, i) => {
      if (i < n) {
        this.deskByAgentId.set(persona.id, this.workstations[i])
      } else {
        this.deskByAgentId.set(persona.id, hashPick(persona.id, this.workstations))
      }
    })
  }

  private workstationFor(id: string): Workstation | null {
    return this.deskByAgentId.get(id) ?? null
  }

  private resolveEntryPoint(
    map: Phaser.Tilemaps.Tilemap,
    entryName: string | null,
  ): Point {
    const tryLayer = (name: string): Point | null => {
      if (!map.getLayer(name)) return null
      const pts: Point[] = []
      for (let y = 0; y < map.height; y++) {
        for (let x = 0; x < map.width; x++) {
          const tile = map.getTileAt(x, y, true, name)
          if (tile && tile.index > 0) {
            pts.push({
              x: x * this.cell + this.cell / 2,
              y: y * this.cell + this.cell / 2,
            })
          }
        }
      }
      if (!pts.length) return null
      return pts[Math.floor(Math.random() * pts.length)]
    }

    if (entryName && entryName !== 'start') {
      const named = tryLayer(entryName)
      if (named) return named
      console.warn(
        `[OfficeScene] 命名入口「${entryName}」缺失，回退默认 start（map=${this.currentMapId}）`,
      )
    }

    const start = tryLayer('start')
    if (start) return start

    if (this.spawns.length) return this.spawns[0]
    return {
      x: this.cell * 2,
      y: this.cell * 2,
    }
  }

  private switchMap(exitMap: string, entryName: string) {
    if (this.switching || this.assetsFailed) return
    if (!isRegisteredMapId(exitMap)) {
      this.callbacks.onAssetsError?.(
        `切图失败：exitMap「${exitMap}」未注册。当前图：${this.currentMapId}。`,
      )
      return
    }

    this.switching = true
    this.callbacks.onSelect(null)
    this.clearAgents()
    this.callbacks.onNameplates([])

    const ok = this.mountMap(exitMap, entryName)
    if (!ok) {
      this.switching = false
      return
    }

    if (getMapKind(exitMap) !== 'world') {
      // Camera already centered on entry; everyone returns to their own desk.
      this.spawnAgents(this.agents)
      this.enforcePresenceLocks(this.time.now)
    }
    this.exitCooldownUntil = this.time.now + 1200
    this.switching = false
  }

  private ensureAnims() {
    for (let skin = 0; skin < SKIN_COUNT; skin++) {
      for (let dir = 0; dir < 4; dir++) {
        const key = `walk-${skin}-${dir}`
        if (this.anims.exists(key)) continue
        const base = skin * 12 + dir * 3
        this.anims.create({
          key,
          frames: this.anims.generateFrameNumbers('characters', {
            frames: [base, base + 1, base + 2],
          }),
          frameRate: 6,
          repeat: -1,
        })
        this.anims.create({
          key: `idle-${skin}-${dir}`,
          frames: [{ key: 'characters', frame: base }],
          frameRate: 1,
        })
      }
    }
  }

  private spawnAgents(agents: AgentPersona[]) {
    this.assignDesks(agents)

    agents.forEach((persona) => {
      const desk = this.workstationFor(persona.id)
      let spawn: Point = desk?.spawn ?? { x: this.cell * 2, y: this.cell * 2 }
      spawn = this.snapToWalkable(spawn)

      const skin = ((persona.skin % SKIN_COUNT) + SKIN_COUNT) % SKIN_COUNT
      const dir = desk?.computer ? faceToward(desk.spawn, desk.computer) : 0
      const sprite = this.add.sprite(spawn.x, spawn.y, 'characters', skin * 12)
      sprite.setScale(CHAR_SCALE)
      sprite.setOrigin(0.5, 1)
      sprite.setDepth(spawn.y)
      sprite.setInteractive({ useHandCursor: true })
      sprite.on('pointerdown', (p: Phaser.Input.Pointer) => {
        p.event.stopPropagation()
        this.callbacks.onSelect(persona)
      })

      // Soft elliptical foot shadow (not Light2D); depth just below the sprite.
      const shadow = this.add.ellipse(spawn.x, spawn.y, 18, 6, 0x000000, 0.35)
      shadow.setDepth(spawn.y - 1)

      const { mode, durationMs } = initialWorkingMode()
      this.runtimes.set(persona.id, {
        persona: { ...persona, skin },
        mode,
        modeUntil: this.time.now + durationMs,
        targetX: spawn.x,
        targetY: spawn.y,
        goalX: spawn.x,
        goalY: spawn.y,
        path: [],
        progressAt: this.time.now,
        progressX: spawn.x,
        progressY: spawn.y,
        repathLeft: STUCK_REPATH_MAX,
        dir,
        faceDir: dir,
        fidgetUntil: this.time.now + scheduleFidgetMs(),
        fidget: 'none',
        fidgetEndsAt: 0,
        wanderPhase: 'none',
        poiKind: null,
        poiClaimKey: null,
        frameTick: 0,
        walkFrame: 0,
      })
      this.sprites.set(persona.id, sprite)
      this.shadows.set(persona.id, shadow)
      sprite.play(`idle-${skin}-${dir}`)
    })
  }

  /** Collision-grid only (no foot hitbox). Used for stand pads / tight POI cells. */
  private tileWalkable(tx: number, ty: number): boolean {
    if (tx < 0 || ty < 0 || tx >= this.mapW || ty >= this.mapH) return false
    return !this.collision[ty]?.[tx]
  }

  /**
   * Foot hitbox walkable check (see footHitbox.ts).
   * Origin (0.5, 1): box is [x−W/2, y−H] → [x+W/2, y+SOUTH].
   */
  private walkableWorld(wx: number, wy: number): boolean {
    return footBoxClear(wx, wy, (tx, ty) => this.tileWalkable(tx, ty), this.cell)
  }

  /** Snap feet to nearest cell center where the foot hitbox fits (BFS). */
  private snapToWalkable(p: Point): Point {
    if (this.walkableWorld(p.x, p.y)) return p
    const startTx = Math.floor(p.x / this.cell)
    const startTy = Math.floor(p.y / this.cell)
    const seen = new Set<string>()
    const q: Array<{ tx: number; ty: number }> = [{ tx: startTx, ty: startTy }]
    seen.add(cellKey(startTx, startTy))
    const dirs = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ]
    while (q.length) {
      const { tx, ty } = q.shift()!
      const cand = {
        x: tx * this.cell + this.cell / 2,
        y: ty * this.cell + this.cell / 2,
      }
      if (this.walkableWorld(cand.x, cand.y)) return cand
      for (const [dx, dy] of dirs) {
        const nx = tx + dx
        const ny = ty + dy
        if (nx < 0 || ny < 0 || nx >= this.mapW || ny >= this.mapH) continue
        const key = cellKey(nx, ny)
        if (seen.has(key)) continue
        seen.add(key)
        q.push({ tx: nx, ty: ny })
      }
    }
    return p
  }

  /** Tile keys occupied by any computer_* (don't stand on others' desks). */
  private computerCellKeys(): Set<string> {
    const keys = new Set<string>()
    for (const w of this.workstations) {
      if (!w.computer) continue
      keys.add(
        cellKey(
          Math.floor(w.computer.x / this.cell),
          Math.floor(w.computer.y / this.cell),
        ),
      )
    }
    return keys
  }

  private randomWalkTarget(): Point {
    const blocked = this.computerCellKeys()
    for (let n = 0; n < 40; n++) {
      const tx = 1 + Math.floor(Math.random() * Math.max(1, this.mapW - 2))
      const ty = 1 + Math.floor(Math.random() * Math.max(1, this.mapH - 2))
      if (blocked.has(cellKey(tx, ty))) continue
      const cand = {
        x: tx * this.cell + this.cell / 2,
        y: ty * this.cell + this.cell / 2,
      }
      if (this.walkableWorld(cand.x, cand.y)) return cand
    }
    return this.snapToWalkable({ x: 5 * this.cell, y: 5 * this.cell })
  }

  /** Soft-claimed POI keys across all agents (to + dwell). */
  private busyPoiKeys(): Set<string> {
    const busy = new Set<string>()
    for (const rt of this.runtimes.values()) {
      if (rt.poiClaimKey) busy.add(rt.poiClaimKey)
    }
    return busy
  }

  /**
   * Desk-clock solo errand: lounge/coffee with soft claim, else random.
   * Never picks meeting (group meetings are scene-scheduled).
   */
  private pickSoloWanderTarget(): WanderDest {
    const picked = pickSoloPoi(this.pois, this.busyPoiKeys())
    if (picked) {
      return {
        point: this.snapToWalkable(picked.point),
        kind: picked.kind,
        claimKey: picked.key,
      }
    }
    return { point: this.randomWalkTarget(), kind: 'random', claimKey: null }
  }

  /** End wander trip: walk back to desk as working. */
  private beginWalkHome(
    id: string,
    sprite: Phaser.GameObjects.Sprite,
    rt: AgentRuntime,
    now: number,
  ) {
    const wasMeetingMember = this.meetingMemberIds.has(id)
    const leavingClaim = rt.poiClaimKey
    rt.mode = 'working'
    rt.wanderPhase = 'none'
    rt.poiKind = null
    rt.poiClaimKey = null
    this.setApplianceStateFromClaim(leavingClaim, 'idle', id)
    rt.fidget = 'none'
    rt.modeUntil = now + workingDurationMs()
    const desk = this.workstationFor(id)
    if (desk) {
      if (desk.computer) {
        rt.faceDir = faceToward(desk.spawn, desk.computer)
      }
      this.setWalkGoal(sprite, rt, desk.spawn, { stretchTimer: true })
      rt.fidgetUntil = now + scheduleFidgetMs()
    } else {
      rt.mode = 'idle'
      rt.path = []
    }
    if (wasMeetingMember) {
      this.meetingMemberIds.delete(id)
      this.meetingArrivedIds.delete(id)
      this.afterMeetingMembershipChange(now)
    }
  }

  /**
   * Start outbound wander. Pass `dest` for scene meeting recruitment;
   * otherwise desk clock uses solo pool (no meeting).
   */
  private beginWanderTrip(
    sprite: Phaser.GameObjects.Sprite,
    rt: AgentRuntime,
    now: number,
    dest?: WanderDest,
  ) {
    const target = dest ?? this.pickSoloWanderTarget()
    rt.mode = 'wander'
    rt.wanderPhase = 'to'
    rt.poiKind = target.kind
    rt.poiClaimKey = target.claimKey
    rt.fidget = 'none'
    rt.modeUntil = now + travelTimeoutMs()
    this.setWalkGoal(sprite, rt, target.point)
  }

  /**
   * Scene-level group meeting: recruit 2–3 at-desk workers to free meeting seats.
   * Always re-arms cooldown (40–80s), including failed attempts.
   * Skips while a meeting session is already in progress.
   */
  private tryStartMeeting(now: number) {
    if (this.meetingMemberIds.size > 0) return
    if (now < this.meetingCooldownUntil) return
    this.meetingCooldownUntil = now + meetingCooldownMs()

    const busy = this.busyPoiKeys()
    const freeSeats = this.pois.filter(
      (p) => p.kind === 'meeting' && !busy.has(p.key),
    )
    if (freeSeats.length < 2) return

    const recruitable: Array<{ id: string; rt: AgentRuntime; sprite: Phaser.GameObjects.Sprite }> =
      []
    for (const [id, rt] of this.runtimes) {
      if (rt.mode !== 'working') continue
      // Live presence lock: exclude from meeting recruitment (PRD-00007).
      if (isLiveLocked(this.presenceState(id))) continue
      const sprite = this.sprites.get(id)
      if (!sprite) continue
      const atDesk =
        rt.path.length === 0 && this.near(sprite.x, sprite.y, rt.goalX, rt.goalY, 6)
      if (!atDesk) continue
      recruitable.push({ id, rt, sprite })
    }
    if (recruitable.length < 2) return

    const k = meetingSize(freeSeats.length, recruitable.length)
    if (k < 2) return

    // Shuffle copies so we don't bias toward Map insertion order.
    const seats = [...freeSeats]
    const agents = [...recruitable]
    for (let i = seats.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[seats[i], seats[j]] = [seats[j], seats[i]]
    }
    for (let i = agents.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[agents[i], agents[j]] = [agents[j], agents[i]]
    }

    this.clearMeetingSession()
    for (let i = 0; i < k; i++) {
      const seat = seats[i]
      const agent = agents[i]
      this.meetingMemberIds.add(agent.id)
      this.beginWanderTrip(agent.sprite, agent.rt, now, {
        point: this.snapToWalkable(seat.point),
        kind: 'meeting',
        claimKey: seat.key,
      })
    }
  }

  /**
   * After a member leaves/drops while gathering: start session if all arrived,
   * or cancel if fewer than 2 remain. No-op once the shared clock is running
   * (except clearing when the set empties via beginWalkHome).
   */
  private afterMeetingMembershipChange(now: number) {
    if (this.meetingMemberIds.size === 0) {
      this.meetingArrivedIds.clear()
      this.meetingEndsAt = null
      return
    }
    // In-session adjourn: members leave via shared endsAt; just wait until empty.
    if (this.meetingEndsAt != null) return

    if (this.meetingMemberIds.size < 2) {
      const leftover = [...this.meetingMemberIds]
      this.clearMeetingSession()
      for (const id of leftover) {
        const rt = this.runtimes.get(id)
        const sprite = this.sprites.get(id)
        if (rt && sprite) this.beginWalkHome(id, sprite, rt, now)
      }
      return
    }

    if (
      [...this.meetingMemberIds].every((mid) => this.meetingArrivedIds.has(mid))
    ) {
      this.beginMeetingSession(now)
    }
  }

  /** All remaining members are seated → start shared dwell clock. */
  private beginMeetingSession(now: number) {
    if (this.meetingEndsAt != null) return
    this.meetingEndsAt = now + dwellMs('meeting')
    for (const id of this.meetingMemberIds) {
      const rt = this.runtimes.get(id)
      if (!rt || rt.poiKind !== 'meeting') continue
      rt.modeUntil = this.meetingEndsAt
      rt.wanderPhase = 'dwell'
    }
  }

  private startPoiDwell(
    id: string,
    rt: AgentRuntime,
    sprite: Phaser.GameObjects.Sprite,
    now: number,
  ) {
    rt.wanderPhase = 'dwell'
    rt.path = []
    // Map dwellFacing when claimed; random / missing → south. Never touch desk faceDir.
    const claimed = rt.poiClaimKey
      ? this.pois.find((p) => p.key === rt.poiClaimKey)
      : undefined
    rt.dir = claimed?.dwellFacing ?? 0
    const anim = `idle-${rt.persona.skin}-${rt.dir}`
    if (sprite.anims.currentAnim?.key !== anim) sprite.play(anim)

    if (rt.poiClaimKey) {
      this.setApplianceStateFromClaim(rt.poiClaimKey, 'using')
    }

    // Solo (and random): personal dwell clock.
    if (rt.poiKind !== 'meeting' || !this.meetingMemberIds.has(id)) {
      rt.modeUntil = now + dwellMs(rt.poiKind ?? 'random')
      return
    }

    // Meeting: stand and wait until everyone arrives, then shared clock.
    this.meetingArrivedIds.add(id)
    if (this.meetingEndsAt != null) {
      rt.modeUntil = this.meetingEndsAt
      return
    }
    // Hold in place while others are still walking (travel upper bound ~40s).
    rt.modeUntil = now + 60_000
    if (
      [...this.meetingMemberIds].every((mid) => this.meetingArrivedIds.has(mid))
    ) {
      this.beginMeetingSession(now)
    }
  }

  /** Cell center is walkable for foot hitbox (BFS node test). */
  private cellCenterWalkable(tx: number, ty: number): boolean {
    if (tx < 0 || ty < 0 || tx >= this.mapW || ty >= this.mapH) return false
    return this.walkableWorld(
      tx * this.cell + this.cell / 2,
      ty * this.cell + this.cell / 2,
    )
  }

  /**
   * 8-dir BFS on collision grid → cell-center waypoints (excludes start cell).
   * Diagonal steps require both orthogonal neighbors walkable (no corner-cutting).
   * Goal cell may use the exact destination if that point is foot-clear (stand pad nudge).
   * `avoidWallHug`: skip middle nodes that touch collides (C-space lite / obstacle inflate).
   */
  private findPath(
    from: Point,
    to: Point,
    opts?: { avoidWallHug?: boolean },
  ): Point[] {
    const sx = Math.floor(from.x / this.cell)
    const sy = Math.floor(from.y / this.cell)
    const gx = Math.floor(to.x / this.cell)
    const gy = Math.floor(to.y / this.cell)
    if (sx === gx && sy === gy) return []

    const startKey = cellKey(sx, sy)
    const goalKey = cellKey(gx, gy)
    const came = new Map<string, string>()
    const q: Array<{ tx: number; ty: number }> = [{ tx: sx, ty: sy }]
    const seen = new Set<string>([startKey])
    const dirs = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ]
    const isBlocked = (tx: number, ty: number) => !this.tileWalkable(tx, ty)
    const start = { tx: sx, ty: sy }
    const goal = { tx: gx, ty: gy }

    const nodeOk = (tx: number, ty: number) => {
      if (tx === gx && ty === gy) {
        return (
          this.walkableWorld(to.x, to.y) || this.cellCenterWalkable(tx, ty)
        )
      }
      if (!this.cellCenterWalkable(tx, ty)) return false
      if (
        opts?.avoidWallHug &&
        isWallHugMiddleNode(tx, ty, start, goal, isBlocked)
      ) {
        return false
      }
      return true
    }

    let found = false
    while (q.length) {
      const { tx, ty } = q.shift()!
      if (tx === gx && ty === gy) {
        found = true
        break
      }
      for (const [dx, dy] of dirs) {
        const nx = tx + dx
        const ny = ty + dy
        const key = cellKey(nx, ny)
        if (seen.has(key)) continue
        if (!nodeOk(nx, ny)) continue
        if (dx !== 0 && dy !== 0) {
          if (
            !this.cellCenterWalkable(tx + dx, ty) ||
            !this.cellCenterWalkable(tx, ty + dy)
          ) {
            continue
          }
        }
        seen.add(key)
        came.set(key, cellKey(tx, ty))
        q.push({ tx: nx, ty: ny })
      }
    }

    if (!found) return []

    const cells: Array<{ tx: number; ty: number }> = []
    let cur = goalKey
    while (cur !== startKey) {
      const [cx, cy] = cur.split(',').map(Number)
      cells.push({ tx: cx, ty: cy })
      const prev = came.get(cur)
      if (!prev) return []
      cur = prev
    }
    cells.reverse()
    return cells.map(({ tx, ty }) => {
      if (tx === gx && ty === gy) return { x: to.x, y: to.y }
      return {
        x: tx * this.cell + this.cell / 2,
        y: ty * this.cell + this.cell / 2,
      }
    })
  }
  /**
   * Set walk goal + BFS path. Extends modeUntil for long paths when requested.
   * On failure: stand still (path empty, goal = current).
   */
  private setWalkGoal(
    sprite: Phaser.GameObjects.Sprite,
    rt: AgentRuntime,
    dest: Point,
    opts?: { stretchTimer?: boolean },
  ) {
    const goal = this.snapToWalkable(dest)
    rt.goalX = goal.x
    rt.goalY = goal.y
    rt.repathLeft = STUCK_REPATH_MAX
    rt.progressAt = this.time.now
    rt.progressX = sprite.x
    rt.progressY = sprite.y
    // Prefer inflated path (no wall-hug middles); fall back if aisle-only route.
    let path = this.findPath({ x: sprite.x, y: sprite.y }, goal, {
      avoidWallHug: true,
    })
    if (!path.length) {
      path = this.findPath({ x: sprite.x, y: sprite.y }, goal)
    }
    if (!path.length) {
      if (this.near(sprite.x, sprite.y, goal.x, goal.y, this.cell)) {
        rt.path = []
        rt.targetX = goal.x
        rt.targetY = goal.y
        return
      }
      // Unreachable: cancel trip, stay put.
      rt.path = []
      rt.goalX = sprite.x
      rt.goalY = sprite.y
      rt.targetX = sprite.x
      rt.targetY = sprite.y
      return
    }
    rt.path = path
    rt.targetX = path[0].x
    rt.targetY = path[0].y
    if (opts?.stretchTimer) {
      // ~cell / SPEED seconds per hop, plus a little slack.
      const extraMs = path.length * ((this.cell / (SPEED * CHAR_SCALE)) * 1000) * 0.35
      rt.modeUntil = Math.max(rt.modeUntil, this.time.now + extraMs + 1500)
    }
  }

  private followPath(
    sprite: Phaser.GameObjects.Sprite,
    rt: AgentRuntime,
    delta: number,
  ) {
    if (!rt.path.length) {
      if (this.near(sprite.x, sprite.y, rt.goalX, rt.goalY, 6)) {
        sprite.x = rt.goalX
        sprite.y = rt.goalY
        const anim = `idle-${rt.persona.skin}-${rt.dir}`
        if (sprite.anims.currentAnim?.key !== anim) sprite.play(anim)
      }
      return
    }

    rt.targetX = rt.path[0].x
    rt.targetY = rt.path[0].y
    if (this.near(sprite.x, sprite.y, rt.targetX, rt.targetY, 5)) {
      rt.path.shift()
      if (!rt.path.length) {
        sprite.x = rt.goalX
        sprite.y = rt.goalY
        const anim = `idle-${rt.persona.skin}-${rt.dir}`
        if (sprite.anims.currentAnim?.key !== anim) sprite.play(anim)
        return
      }
      rt.targetX = rt.path[0].x
      rt.targetY = rt.path[0].y
      rt.progressAt = this.time.now
      rt.progressX = sprite.x
      rt.progressY = sprite.y
    }
    this.stepToward(sprite, rt, delta)
    this.maybeRepathIfStuck(sprite, rt)
  }

  /**
   * Concave corner slide lock (coffee counter): nudge off collides, then
   * repath with wall-hug middle nodes banned so we don't get the same edge path.
   */
  private maybeRepathIfStuck(
    sprite: Phaser.GameObjects.Sprite,
    rt: AgentRuntime,
  ) {
    const now = this.time.now
    const moved = Math.hypot(sprite.x - rt.progressX, sprite.y - rt.progressY)
    if (moved >= STUCK_MOVE_EPS) {
      rt.progressAt = now
      rt.progressX = sprite.x
      rt.progressY = sprite.y
      return
    }
    if (rt.repathLeft <= 0) return
    if (now - rt.progressAt < STUCK_REPATH_MS) return

    rt.repathLeft -= 1
    this.nudgeAwayFromCollides(sprite)
    rt.progressAt = now
    rt.progressX = sprite.x
    rt.progressY = sprite.y
    const goal = { x: rt.goalX, y: rt.goalY }
    let path = this.findPath({ x: sprite.x, y: sprite.y }, goal, {
      avoidWallHug: true,
    })
    // Fallback: open path without hug ban (last resorts still better than freeze).
    if (!path.length) {
      path = this.findPath({ x: sprite.x, y: sprite.y }, goal)
    }
    if (!path.length) return
    rt.path = path
    rt.targetX = path[0].x
    rt.targetY = path[0].y
  }

  /** Push feet a few px away from collide tiles the foot box currently overlaps. */
  private nudgeAwayFromCollides(sprite: Phaser.GameObjects.Sprite) {
    const hw = FOOT_BODY_W / 2
    const samples: Point[] = [
      { x: sprite.x - hw, y: sprite.y - FOOT_BODY_H },
      { x: sprite.x + hw, y: sprite.y - FOOT_BODY_H },
      { x: sprite.x - hw, y: sprite.y + FOOT_BODY_SOUTH },
      { x: sprite.x + hw, y: sprite.y + FOOT_BODY_SOUTH },
      { x: sprite.x, y: sprite.y },
    ]
    let pushX = 0
    let pushY = 0
    for (const p of samples) {
      const tx = Math.floor(p.x / this.cell)
      const ty = Math.floor(p.y / this.cell)
      if (this.tileWalkable(tx, ty)) continue
      const cx = tx * this.cell + this.cell / 2
      const cy = ty * this.cell + this.cell / 2
      pushX += sprite.x - cx
      pushY += sprite.y - cy
    }
    const len = Math.hypot(pushX, pushY)
    if (len < 0.1) {
      // Default: push east then south (away from typical west counter).
      pushX = 1
      pushY = 0.25
    } else {
      pushX /= len
      pushY /= len
    }
    for (const dist of [4, 8, 12, 16]) {
      const nx = sprite.x + pushX * dist
      const ny = sprite.y + pushY * dist
      if (this.walkableWorld(nx, ny)) {
        sprite.x = nx
        sprite.y = ny
        return
      }
    }
  }
  update(_time: number, delta: number) {
    if (this.assetsFailed || this.switching) return
    const now = this.time.now
    const plates: NameplateView[] = []
    const cam = this.cameras.main

    this.tryStartMeeting(now)

    for (const [id, rt] of this.runtimes) {
      const sprite = this.sprites.get(id)
      if (!sprite) continue

      const liveState = this.presenceState(id)
      const locked = isLiveLocked(liveState)

      if (now >= rt.modeUntil) {
        if (rt.mode === 'wander') {
          // Travel timeout or dwell finished → home (never flash mid-trip via short clock).
          this.beginWalkHome(id, sprite, rt, now)
        } else if (locked) {
          // Live lock: renew desk clock only — no fishbowl wander.
          rt.mode = 'working'
          rt.wanderPhase = 'none'
          rt.poiKind = null
          rt.poiClaimKey = null
          rt.modeUntil = now + workingDurationMs()
          if (liveState === 'blocked') {
            rt.fidget = 'none'
            rt.dir = rt.faceDir
            rt.fidgetUntil = now + 86_400_000
          }
        } else {
          const n = nextDeskMode()
          if (n.mode === 'wander') {
            this.beginWanderTrip(sprite, rt, now)
          } else {
            rt.mode = 'working'
            rt.wanderPhase = 'none'
            rt.poiKind = null
            rt.poiClaimKey = null
            rt.fidget = 'none'
            rt.modeUntil = now + workingDurationMs()
          }
        }
      }

      // Arrived at POI while traveling → start dwell (stand idle).
      if (
        rt.mode === 'wander' &&
        rt.wanderPhase === 'to' &&
        rt.path.length === 0 &&
        this.near(sprite.x, sprite.y, rt.goalX, rt.goalY, 6)
      ) {
        this.startPoiDwell(id, rt, sprite, now)
      }

      const atDesk =
        rt.mode === 'working' &&
        rt.path.length === 0 &&
        this.near(sprite.x, sprite.y, rt.goalX, rt.goalY, 6)

      if (rt.mode === 'wander' && rt.wanderPhase === 'to') {
        this.followPath(sprite, rt, delta)
      } else if (rt.mode === 'wander' && rt.wanderPhase === 'dwell') {
        const anim = `idle-${rt.persona.skin}-${rt.dir}`
        if (sprite.anims.currentAnim?.key !== anim) sprite.play(anim)
      } else if (rt.mode === 'working' && !atDesk) {
        this.followPath(sprite, rt, delta)
      } else if (rt.mode === 'working' && atDesk) {
        if (liveState === 'blocked') {
          rt.fidget = 'none'
          rt.dir = rt.faceDir
          const anim = `idle-${rt.persona.skin}-${rt.faceDir}`
          if (sprite.anims.currentAnim?.key !== anim) sprite.play(anim)
        } else {
          this.updateWorkingFidget(sprite, rt, now)
        }
      } else {
        const anim = `idle-${rt.persona.skin}-${rt.dir}`
        if (sprite.anims.currentAnim?.key !== anim) sprite.play(anim)
      }

      sprite.setDepth(sprite.y)
      const shadow = this.shadows.get(id)
      if (shadow) {
        shadow.setPosition(sprite.x, sprite.y)
        shadow.setDepth(sprite.y - 1)
      }

      if (now >= this.exitCooldownUntil) {
        const hit = this.exitAt(sprite.x, sprite.y - this.cell * 0.25)
        if (hit) {
          this.switchMap(hit.exitMap, hit.entryName)
          return
        }
      }

      const sx = (sprite.x - cam.worldView.x) * cam.zoom
      const sy = (sprite.y - cam.worldView.y) * cam.zoom
      // Origin is feet (0.5, 1); lift by scaled sprite height + gap, then * zoom for screen px.
      const headLift = (sprite.displayHeight + NAMEPLATE_GAP) * cam.zoom
      const viewW = cam.width || this.scale.width || 1
      const viewH = cam.height || this.scale.height || 1
      const margin = 60 * cam.zoom
      const summary = this.presenceSummary(id)

      plates.push({
        id,
        name: rt.persona.name,
        status: rt.persona.status,
        lifecycle: rt.persona.lifecycle,
        presence: liveState,
        line2: summary || rt.persona.status,
        screenX: sx,
        screenY: sy - headLift,
        // Compare screen coords to viewport pixels (cam.width), not displayWidth (world width / zoom).
        visible:
          sx > -margin &&
          sy > -margin &&
          sx < viewW + margin &&
          sy < viewH + margin,
      })
    }

    if (!this._lastPlateAt || now - this._lastPlateAt > 100) {
      this._lastPlateAt = now
      this.callbacks.onNameplates(plates)
    }

    this.drawFootDebug()
  }

  /** Toggle foot-hitbox / map-collision / POI stand markers (Toolbar「碰撞盒」). */
  setFootDebug(on: boolean) {
    this.footDebug = on
    if (!on) {
      if (this.footDebugGfx) {
        this.footDebugGfx.destroy()
        this.footDebugGfx = null
      }
      for (const t of this.footDebugLabels) t.destroy()
      this.footDebugLabels = []
    }
  }

  private clearFootDebugLabels() {
    for (const t of this.footDebugLabels) t.destroy()
    this.footDebugLabels = []
  }

  private drawFootDebug() {
    if (!this.footDebug) return
    if (!this.footDebugGfx || !this.footDebugGfx.active) {
      this.footDebugGfx = this.add.graphics()
      this.footDebugGfx.setDepth(DEPTH_OVERLAY + 10)
    }
    const g = this.footDebugGfx
    g.clear()
    this.clearFootDebugLabels()

    // Full map collision grid (red).
    g.fillStyle(0xff2244, 0.22)
    g.lineStyle(1, 0xff2244, 0.55)
    for (let ty = 0; ty < this.mapH; ty++) {
      const row = this.collision[ty]
      if (!row) continue
      for (let tx = 0; tx < this.mapW; tx++) {
        if (!row[tx]) continue
        const x = tx * this.cell
        const y = ty * this.cell
        g.fillRect(x, y, this.cell, this.cell)
        g.strokeRect(x, y, this.cell, this.cell)
      }
    }

    // Causal stand pads: cyan crosshair at exact foot point.
    // Point POIs (lounge/meeting): yellow diamond.
    for (const poi of this.pois) {
      const causal = poi.key.includes('#')
      if (causal) {
        this.drawCrosshair(g, poi.point.x, poi.point.y, 0x00e5ff)
        const label = this.add
          .text(poi.point.x + 6, poi.point.y - 10, poi.key.replace(/^poi_/, ''), {
            fontSize: '9px',
            color: '#00e5ff',
            backgroundColor: '#000000aa',
          })
          .setDepth(DEPTH_OVERLAY + 11)
        this.footDebugLabels.push(label)
      } else {
        this.drawDiamond(g, poi.point.x, poi.point.y, 0xffee55)
      }
    }

    // Per-agent: foot AABB (green), feet origin (white crosshair), overlap (orange).
    const hw = FOOT_BODY_W / 2
    for (const [, sprite] of this.sprites) {
      const x = sprite.x
      const y = sprite.y
      const left = x - hw
      const top = y - FOOT_BODY_H
      const w = FOOT_BODY_W
      const h = FOOT_BODY_H + FOOT_BODY_SOUTH
      g.lineStyle(1, 0x22ff88, 0.95)
      g.strokeRect(left, top, w, h)
      this.drawCrosshair(g, x, y, 0xffffff)

      const t0 = Math.floor(left / this.cell)
      const t1 = Math.floor((left + w - 0.01) / this.cell)
      const u0 = Math.floor(top / this.cell)
      const u1 = Math.floor((top + h - 0.01) / this.cell)
      for (let ty = u0; ty <= u1; ty++) {
        for (let tx = t0; tx <= t1; tx++) {
          if (this.tileWalkable(tx, ty)) continue
          g.fillStyle(0xffaa00, 0.35)
          g.fillRect(tx * this.cell, ty * this.cell, this.cell, this.cell)
          g.lineStyle(1, 0xffaa00, 0.9)
          g.strokeRect(tx * this.cell, ty * this.cell, this.cell, this.cell)
        }
      }
    }
  }

  private drawCrosshair(
    g: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    color: number,
  ) {
    g.lineStyle(1, color, 1)
    g.strokeCircle(x, y, 5)
    g.lineBetween(x - 8, y, x + 8, y)
    g.lineBetween(x, y - 8, x, y + 8)
  }

  private drawDiamond(
    g: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    color: number,
  ) {
    g.lineStyle(1, color, 1)
    g.beginPath()
    g.moveTo(x, y - 6)
    g.lineTo(x + 5, y)
    g.lineTo(x, y + 6)
    g.lineTo(x - 5, y)
    g.closePath()
    g.strokePath()
  }

  private exitAt(wx: number, wy: number): ExitZone | null {
    const tx = Math.floor(wx / this.cell)
    const ty = Math.floor(wy / this.cell)
    const key = cellKey(tx, ty)
    for (const zone of this.exitZones) {
      if (zone.cells.has(key)) return zone
    }
    return null
  }

  /**
   * Fake-alive at desk: glance sideways or flash walk mid-frame, then restore faceDir.
   * Must not force faceToward every frame (that kills fidget).
   */
  private updateWorkingFidget(
    sprite: Phaser.GameObjects.Sprite,
    rt: AgentRuntime,
    now: number,
  ) {
    if (rt.fidget !== 'none') {
      if (now >= rt.fidgetEndsAt) {
        rt.fidget = 'none'
        rt.dir = rt.faceDir
        rt.fidgetUntil = now + rescheduleFidgetMs()
        const anim = `idle-${rt.persona.skin}-${rt.faceDir}`
        sprite.play(anim)
      }
      return
    }

    if (now >= rt.fidgetUntil) {
      if (Math.random() < 0.55) {
        rt.fidget = 'glance'
        rt.dir = glanceDir(rt.faceDir)
        rt.fidgetEndsAt = now + 1_000 + Math.random() * 1_000
        sprite.play(`idle-${rt.persona.skin}-${rt.dir}`)
      } else {
        rt.fidget = 'step'
        rt.dir = rt.faceDir
        rt.fidgetEndsAt = now + 250 + Math.random() * 250
        // Walk mid-frame for this facing (base + 1 of the 3-frame strip).
        const base = rt.persona.skin * 12 + rt.faceDir * 3
        sprite.anims.stop()
        sprite.setFrame(base + 1)
      }
      return
    }

    const anim = `idle-${rt.persona.skin}-${rt.dir}`
    if (sprite.anims.currentAnim?.key !== anim) sprite.play(anim)
  }

  private near(x: number, y: number, tx: number, ty: number, eps: number) {
    return Math.hypot(tx - x, ty - y) <= eps
  }

  private stepToward(
    sprite: Phaser.GameObjects.Sprite,
    rt: AgentRuntime,
    delta: number,
  ) {
    const dx = rt.targetX - sprite.x
    const dy = rt.targetY - sprite.y
    const dist = Math.hypot(dx, dy)
    if (dist < 2) {
      sprite.x = rt.targetX
      sprite.y = rt.targetY
      return
    }
    const step = (SPEED * CHAR_SCALE * delta) / 1000
    const nx = sprite.x + (dx / dist) * Math.min(step, dist)
    const ny = sprite.y + (dy / dist) * Math.min(step, dist)

    // Follow grid path: slide on one axis if the other is blocked; never cancel the goal.
    if (this.walkableWorld(nx, sprite.y)) sprite.x = nx
    if (this.walkableWorld(sprite.x, ny)) sprite.y = ny

    if (Math.abs(dx) > Math.abs(dy)) rt.dir = dx < 0 ? 1 : 2
    else rt.dir = dy < 0 ? 3 : 0

    const anim = `walk-${rt.persona.skin}-${rt.dir}`
    if (sprite.anims.currentAnim?.key !== anim) sprite.play(anim)
  }
}
