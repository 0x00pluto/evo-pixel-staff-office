import Phaser from 'phaser'
import { SKIN_COUNT } from '../catalog/skinCount'
import type { AgentPersona } from '../catalog/types'
import { hashPick, nextMode, type AgentRuntime } from './agentFsm'
import {
  DEFAULT_MAP_ID,
  getMapEntry,
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
/**
 * Foot hitbox. Sprite origin is (0.5, 1) = feet center.
 * Height 16 aligns with WA CHARACTER_BODY_HEIGHT; width 24 is office visual margin
 * so arms/hair don't paint over wall tiles (WA physics body is 16×16).
 */
const BODY_W = 24
const BODY_H = 16
/** World px above sprite top so the plate sits fully over the head (WA ≈ 2; we have 2 lines + hats). */
const NAMEPLATE_GAP = 12

type Point = { x: number; y: number }

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
    this.spawnAgents(this.agents, 'start')
  }

  reloadAgents(agents: AgentPersona[]) {
    this.agents = agents
    this.clearAgents()
    if (this.assetsFailed || !this.tilemap) return
    const nextId = selectOfficeMapId(agents.length)
    if (nextId !== this.currentMapId && isRegisteredMapId(nextId)) {
      const ok = this.mountMap(nextId, 'start')
      if (!ok) return
    }
    this.spawnAgents(agents, null)
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
  }

  private clearAgents() {
    for (const s of this.sprites.values()) s.destroy()
    this.sprites.clear()
    for (const sh of this.shadows.values()) sh.destroy()
    this.shadows.clear()
    this.runtimes.clear()
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
    for (const ts of TILESET_ASSETS) {
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

    const depthFor = (name: string): number => {
      if (name === 'floor') return 0
      if (name === 'walls') return 1
      if (name === 'furniture') return 2
      if (name === 'aboveFurniture') return 3
      if (name.startsWith('abovePlayer') || name.startsWith('above')) return 10_000
      return 1
    }

    const visibleNames = [
      'floor',
      'walls',
      'furniture',
      'aboveFurniture',
      'abovePlayer1',
      'abovePlayer2',
      'abovePlayer3',
    ]
    for (const name of visibleNames) {
      if (!map.getLayer(name)) continue
      const layer = map.createLayer(name, tilesets, 0, 0)
      if (!layer) continue
      layer.setDepth(depthFor(name))
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
    const byIndex = new Map<number, { spawn?: Point; computer?: Point }>()

    for (const obj of map.getObjectLayer('objects')?.objects ?? []) {
      const name = obj.name || ''
      const pt: Point = { x: obj.x ?? 0, y: obj.y ?? 0 }
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

  private workstationFor(id: string): Workstation | null {
    if (!this.workstations.length) return null
    return hashPick(id, this.workstations)
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

    const ok = this.mountMap(exitMap, entryName)
    if (!ok) {
      this.switching = false
      return
    }

    this.spawnAgents(this.agents, entryName)
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

  private spawnAgents(agents: AgentPersona[], entryName: string | null) {
    const entryPoint =
      this.tilemap && entryName
        ? this.resolveEntryPoint(this.tilemap, entryName)
        : null

    agents.forEach((persona, i) => {
      let spawn: Point = { x: this.cell * 2, y: this.cell * 2 }
      const desk = this.workstationFor(persona.id)
      if (entryPoint && i === 0) {
        spawn = entryPoint
      } else if (desk) {
        spawn = desk.spawn
      } else if (entryPoint) {
        spawn = {
          x: entryPoint.x + ((i % 5) - 2) * 8,
          y: entryPoint.y + Math.floor(i / 5) * 8,
        }
      }
      spawn = this.snapToWalkable(spawn)

      const skin = ((persona.skin % SKIN_COUNT) + SKIN_COUNT) % SKIN_COUNT
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
      const shadow = this.add.ellipse(spawn.x, spawn.y - 2, 18, 8, 0x000000, 0.35)
      shadow.setDepth(spawn.y - 1)

      const { mode, durationMs } = nextMode()
      this.runtimes.set(persona.id, {
        persona: { ...persona, skin },
        mode,
        modeUntil: this.time.now + durationMs,
        targetX: spawn.x,
        targetY: spawn.y,
        dir: 0,
        frameTick: 0,
        walkFrame: 0,
      })
      this.sprites.set(persona.id, sprite)
      this.shadows.set(persona.id, shadow)
      sprite.play(`idle-${skin}-0`)
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
   * Origin (0.5, 1): box is [x−BODY_W/2, y−BODY_H] → [x+BODY_W/2, y].
   * Corners (+ center) must clear.
   */
  private walkableWorld(wx: number, wy: number): boolean {
    const hw = BODY_W / 2
    const top = wy - BODY_H
    const samples: Point[] = [
      { x: wx - hw, y: top },
      { x: wx + hw, y: top },
      { x: wx - hw, y: wy },
      { x: wx + hw, y: wy },
      { x: wx, y: wy - BODY_H / 2 },
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

  private randomWalkTarget(): Point {
    for (let n = 0; n < 40; n++) {
      const tx = 1 + Math.floor(Math.random() * Math.max(1, this.mapW - 2))
      const ty = 1 + Math.floor(Math.random() * Math.max(1, this.mapH - 2))
      const cand = {
        x: tx * this.cell + this.cell / 2,
        y: ty * this.cell + this.cell / 2,
      }
      if (this.walkableWorld(cand.x, cand.y)) return cand
    }
    return this.snapToWalkable({ x: 5 * this.cell, y: 5 * this.cell })
  }

  update(_time: number, delta: number) {
    if (this.assetsFailed || this.switching) return
    const now = this.time.now
    const plates: NameplateView[] = []
    const cam = this.cameras.main

    for (const [id, rt] of this.runtimes) {
      const sprite = this.sprites.get(id)
      if (!sprite) continue

      if (now >= rt.modeUntil) {
        const n = nextMode()
        rt.mode = n.mode
        rt.modeUntil = now + n.durationMs
        if (rt.mode === 'wander') {
          const t = this.randomWalkTarget()
          rt.targetX = t.x
          rt.targetY = t.y
        } else if (rt.mode === 'working') {
          const desk = this.workstationFor(id)
          if (desk?.computer) {
            const work = this.snapToWalkable({
              x: desk.computer.x,
              y: desk.computer.y + this.cell * 0.9,
            })
            rt.targetX = work.x
            rt.targetY = work.y
          } else {
            rt.mode = 'idle'
          }
        }
      }

      if (
        rt.mode === 'wander' ||
        (rt.mode === 'working' && !this.near(sprite.x, sprite.y, rt.targetX, rt.targetY, 6))
      ) {
        this.stepToward(sprite, rt, delta)
      } else if (rt.mode === 'working') {
        rt.dir = 3
        const anim = `idle-${rt.persona.skin}-${rt.dir}`
        if (sprite.anims.currentAnim?.key !== anim) sprite.play(anim)
      } else {
        const anim = `idle-${rt.persona.skin}-${rt.dir}`
        if (sprite.anims.currentAnim?.key !== anim) sprite.play(anim)
      }

      sprite.setDepth(sprite.y)
      const shadow = this.shadows.get(id)
      if (shadow) {
        shadow.setPosition(sprite.x, sprite.y - 2)
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
      const anim = `idle-${rt.persona.skin}-${rt.dir}`
      if (sprite.anims.currentAnim?.key !== anim) sprite.play(anim)
      return
    }
    const step = (SPEED * CHAR_SCALE * delta) / 1000
    const nx = sprite.x + (dx / dist) * Math.min(step, dist)
    const ny = sprite.y + (dy / dist) * Math.min(step, dist)

    if (this.walkableWorld(nx, sprite.y)) sprite.x = nx
    else rt.targetX = sprite.x
    if (this.walkableWorld(sprite.x, ny)) sprite.y = ny
    else rt.targetY = sprite.y

    if (Math.abs(dx) > Math.abs(dy)) rt.dir = dx < 0 ? 1 : 2
    else rt.dir = dy < 0 ? 3 : 0

    const anim = `walk-${rt.persona.skin}-${rt.dir}`
    if (sprite.anims.currentAnim?.key !== anim) sprite.play(anim)
  }
}
