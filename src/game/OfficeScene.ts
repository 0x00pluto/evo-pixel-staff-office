import Phaser from 'phaser'
import type { AgentPersona } from '../catalog/types'
import { hashPick, nextMode, type AgentRuntime } from './agentFsm'
import type { NameplateView, OfficeGameCallbacks } from './types'

const TILE = 32
const CHAR_SCALE = 2
const CELL = TILE * CHAR_SCALE
const SPEED = 40
const SKIN_COUNT = 64

type Point = { x: number; y: number }

interface LayoutFurniture {
  frame: string
  x: number
  y: number
  role?: string
  collide?: boolean
}

interface OfficeLayout {
  cell: number
  width: number
  height: number
  floor: { frame: string; altFrame?: string }
  furniture: LayoutFurniture[]
  collision: number[]
  spawns: Point[]
  computers: Point[]
}

export class OfficeScene extends Phaser.Scene {
  private agents: AgentPersona[] = []
  private callbacks!: OfficeGameCallbacks
  private collision: boolean[][] = []
  private mapW = 0
  private mapH = 0
  private cell = CELL
  private spawns: Point[] = []
  private computers: Point[] = []
  private sprites = new Map<string, Phaser.GameObjects.Sprite>()
  private runtimes = new Map<string, AgentRuntime>()
  private furnitureSprites: Phaser.GameObjects.Image[] = []
  private drag = false
  private dragLast = new Phaser.Math.Vector2()
  private _lastPlateAt = 0
  private assetsFailed = false

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
        `素材加载失败：${key}${url ? `（${url}）` : ''}。请确认 public/assets 下有 office.png / office_core_atlas.json / office-layout.json / characters.png。`,
      )
    })

    this.load.atlas('office_core', '/assets/office.png', '/assets/office_core_atlas.json')
    this.load.json('office_layout', '/assets/office-layout.json')
    this.load.spritesheet('characters', '/assets/characters.png', {
      frameWidth: TILE,
      frameHeight: TILE,
    })
  }

  create() {
    if (this.assetsFailed) return
    if (
      !this.textures.exists('office_core') ||
      !this.textures.exists('characters') ||
      !this.cache.json.exists('office_layout')
    ) {
      this.assetsFailed = true
      this.callbacks.onAssetsError?.(
        '素材缺失：office atlas / characters / office-layout 未能进入缓存。请检查 public/assets。',
      )
      return
    }

    const layout = this.cache.json.get('office_layout') as OfficeLayout
    this.cell = layout.cell || CELL
    this.mapW = layout.width
    this.mapH = layout.height
    this.collision = Array.from({ length: this.mapH }, (_, y) =>
      Array.from({ length: this.mapW }, (_, x) => {
        const v = layout.collision[y * this.mapW + x]
        return v > 0
      }),
    )

    this.paintFloor(layout)
    this.spawnFurniture(layout.furniture)

    this.spawns = (layout.spawns ?? []).map((p) => ({ x: p.x, y: p.y }))
    this.computers = (layout.computers ?? []).map((p) => ({ x: p.x, y: p.y }))

    const worldW = this.mapW * this.cell
    const worldH = this.mapH * this.cell
    this.cameras.main.setBounds(0, 0, worldW, worldH)
    this.cameras.main.centerOn(worldW / 2, worldH / 2)
    this.cameras.main.setRoundPixels(true)

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
        const next = Phaser.Math.Clamp(cam.zoom - dy * 0.001, 0.6, 2.2)
        cam.setZoom(next)
      },
    )

    this.ensureAnims()
    this.spawnAgents(this.agents)

    this.input.on(
      'pointerdown',
      (p: Phaser.Input.Pointer, currentlyOver: Phaser.GameObjects.GameObject[]) => {
        if (!p.leftButtonDown()) return
        if (!currentlyOver.length) this.callbacks.onSelect(null)
      },
    )
  }

  reloadAgents(agents: AgentPersona[]) {
    this.agents = agents
    for (const s of this.sprites.values()) s.destroy()
    this.sprites.clear()
    this.runtimes.clear()
    if (!this.assetsFailed) this.spawnAgents(agents)
  }

  private paintFloor(layout: OfficeLayout) {
    const frame = layout.floor?.frame || 'office_core_014'
    const alt = layout.floor?.altFrame || frame
    for (let y = 0; y < this.mapH; y++) {
      for (let x = 0; x < this.mapW; x++) {
        const useAlt = (x + y) % 7 === 0
        const key = useAlt ? alt : frame
        if (!this.textures.get('office_core').has(key)) continue
        const img = this.add.image(
          x * this.cell + this.cell / 2,
          y * this.cell + this.cell / 2,
          'office_core',
          key,
        )
        img.setDisplaySize(this.cell + 2, this.cell + 2)
        img.setDepth(0)
      }
    }
  }

  private spawnFurniture(items: LayoutFurniture[]) {
    for (const img of this.furnitureSprites) img.destroy()
    this.furnitureSprites = []

    for (const item of items) {
      if (!this.textures.get('office_core').has(item.frame)) continue
      const img = this.add.image(item.x, item.y, 'office_core', item.frame)
      img.setOrigin(0.5, 1)
      img.setDepth(item.y)
      this.furnitureSprites.push(img)
    }
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
    agents.forEach((persona) => {
      let spawn: Point = { x: this.cell * 2, y: this.cell * 2 }
      if (this.spawns.length) {
        spawn = hashPick(persona.id, this.spawns)
      }

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
      sprite.play(`idle-${skin}-0`)
    })
  }

  private walkableWorld(wx: number, wy: number): boolean {
    const tx = Math.floor(wx / this.cell)
    const ty = Math.floor(wy / this.cell)
    if (tx < 0 || ty < 0 || tx >= this.mapW || ty >= this.mapH) return false
    return !this.collision[ty][tx]
  }

  private randomWalkTarget(): Point {
    for (let n = 0; n < 40; n++) {
      const tx = 1 + Math.floor(Math.random() * (this.mapW - 2))
      const ty = 1 + Math.floor(Math.random() * (this.mapH - 2))
      if (!this.collision[ty][tx]) {
        return {
          x: tx * this.cell + this.cell / 2,
          y: ty * this.cell + this.cell / 2,
        }
      }
    }
    return { x: 5 * this.cell, y: 5 * this.cell }
  }

  update(_time: number, delta: number) {
    if (this.assetsFailed) return
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
        } else if (rt.mode === 'working' && this.computers.length) {
          const c = hashPick(id, this.computers)
          rt.targetX = c.x
          rt.targetY = c.y + this.cell * 0.9
        } else if (rt.mode === 'working' && !this.computers.length) {
          rt.mode = 'idle'
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

      const sx = (sprite.x - cam.worldView.x) * cam.zoom
      const sy = (sprite.y - cam.worldView.y) * cam.zoom

      plates.push({
        id,
        name: rt.persona.name,
        status: rt.persona.status,
        lifecycle: rt.persona.lifecycle,
        screenX: sx,
        screenY: sy - TILE * CHAR_SCALE,
        visible:
          sx > -60 &&
          sy > -60 &&
          sx < (cam.displayWidth || cam.width) + 60 &&
          sy < (cam.displayHeight || cam.height) + 60,
      })
    }

    if (!this._lastPlateAt || now - this._lastPlateAt > 100) {
      this._lastPlateAt = now
      this.callbacks.onNameplates(plates)
    }
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
