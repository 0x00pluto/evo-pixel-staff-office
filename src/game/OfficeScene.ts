import Phaser from 'phaser'
import { SKIN_COUNT } from '../catalog/skinCount'
import type { AgentPersona } from '../catalog/types'
import {
  dwellMs,
  faceToward,
  glanceDir,
  hashPick,
  initialWorkingMode,
  meetingCooldownMs,
  meetingSize,
  nextDeskMode,
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
/** Align WA DEPTH_OVERLAY_INDEX: layers after floorLayer draw above agents. */
const DEPTH_OVERLAY = 1_000_000
/**
 * Foot hitbox. Sprite origin is (0.5, 1) = feet center.
 * Height 24 (taller than WA's 16) so feet stop short of desk overhang from the south;
 * BODY_SOUTH pads below the feet so approaching a desk from the north doesn't put
 * the foot shadow on the desk top; width 24 is office visual margin (WA body is 16×16).
 */
const BODY_W = 24
const BODY_H = 24
/** Extra hitbox below feet (south); keeps shadow off desk when closing from the north. */
const BODY_SOUTH = 8
/** World px above sprite top so the plate sits fully over the head (WA ≈ 2; we have 2 lines + hats). */
const NAMEPLATE_GAP = 12

type Point = { x: number; y: number }
/** Map POI with Tiled object name as soft-claim key (e.g. poi_meeting_0). */
type MapPoi = { key: string; point: Point; kind: PoiKind }

type WanderDest = { point: Point; kind: WanderTargetKind; claimKey: string | null }

const POI_KINDS: PoiKind[] = ['lounge', 'coffee', 'meeting']

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

export class OfficeScene extends Phaser.Scene {
  private agents: AgentPersona[] = []
  private callbacks!: OfficeGameCallbacks
  private collision: boolean[][] = []
  private mapW = 0
  private mapH = 0
  private cell = CELL
  private spawns: Point[] = []
  private workstations: Workstation[] = []
  /** Wander destinations from poi_* objects (lounge/coffee/meeting). */
  private pois: MapPoi[] = []
  /** One desk per agent id; rebuilt on each spawnAgents. */
  private deskByAgentId = new Map<string, Workstation>()
  private sprites = new Map<string, Phaser.GameObjects.Sprite>()
  /** Soft foot shadow under each agent; destroyed with clearAgents. */
  private shadows = new Map<string, Phaser.GameObjects.Ellipse>()
  private runtimes = new Map<string, AgentRuntime>()
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
    this.deskByAgentId.clear()
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
      layer.setDepth(depth++)
      this.mapLayers.push(layer)
    }

    this.exitZones = this.parseExitZones(map)
    this.parseObjects(map)
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
        this.pois.push({ key: name, point: pt, kind: poiKind })
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

  /** Cell under a world point is free (map bounds + collision grid). */
  private cellWalkable(wx: number, wy: number): boolean {
    const tx = Math.floor(wx / this.cell)
    const ty = Math.floor(wy / this.cell)
    if (tx < 0 || ty < 0 || tx >= this.mapW || ty >= this.mapH) return false
    return !this.collision[ty]?.[tx]
  }

  /**
   * Foot hitbox walkable check.
   * Origin (0.5, 1): box is [x−BODY_W/2, y−BODY_H] → [x+BODY_W/2, y+BODY_SOUTH].
   * Corners (+ center) must clear.
   */
  private walkableWorld(wx: number, wy: number): boolean {
    const hw = BODY_W / 2
    const top = wy - BODY_H
    const bottom = wy + BODY_SOUTH
    const samples: Point[] = [
      { x: wx - hw, y: top },
      { x: wx + hw, y: top },
      { x: wx - hw, y: bottom },
      { x: wx + hw, y: bottom },
      { x: wx, y: (top + bottom) / 2 },
    ]
    return samples.every((p) => this.cellWalkable(p.x, p.y))
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
    rt.mode = 'working'
    rt.wanderPhase = 'none'
    rt.poiKind = null
    rt.poiClaimKey = null
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
    const anim = `idle-${rt.persona.skin}-${rt.dir}`
    if (sprite.anims.currentAnim?.key !== anim) sprite.play(anim)

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
   * Empty = no path. Walk anim stays 4-dir (Pipoya).
   */
  private findPath(from: Point, to: Point): Point[] {
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
        if (!this.cellCenterWalkable(nx, ny)) continue
        // Diagonal: both cardinal neighbors must be free (don't clip desk corners).
        if (dx !== 0 && dy !== 0) {
          if (!this.cellCenterWalkable(tx + dx, ty) || !this.cellCenterWalkable(tx, ty + dy)) {
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
    return cells.map(({ tx, ty }) => ({
      x: tx * this.cell + this.cell / 2,
      y: ty * this.cell + this.cell / 2,
    }))
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
    const path = this.findPath({ x: sprite.x, y: sprite.y }, goal)
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
    }
    this.stepToward(sprite, rt, delta)
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

      if (now >= rt.modeUntil) {
        if (rt.mode === 'wander') {
          // Travel timeout or dwell finished → home (never flash mid-trip via short clock).
          this.beginWalkHome(id, sprite, rt, now)
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
        this.updateWorkingFidget(sprite, rt, now)
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

      plates.push({
        id,
        name: rt.persona.name,
        status: rt.persona.status,
        lifecycle: rt.persona.lifecycle,
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
