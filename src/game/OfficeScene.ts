import Phaser from 'phaser'
import type { AgentPersona } from '../catalog/types'
import { hashPick, hueTint, nextMode, type AgentRuntime } from './agentFsm'
import type { NameplateView, OfficeGameCallbacks } from './types'

const TILE = 16
const SCALE = 3
const SPEED = 40

type Point = { x: number; y: number }

export class OfficeScene extends Phaser.Scene {
  private agents: AgentPersona[] = []
  private callbacks!: OfficeGameCallbacks
  private collision: boolean[][] = []
  private mapW = 0
  private mapH = 0
  private spawns: Point[] = []
  private computers: Point[] = []
  private sprites = new Map<string, Phaser.GameObjects.Sprite>()
  private runtimes = new Map<string, AgentRuntime>()
  private drag = false
  private dragLast = new Phaser.Math.Vector2()
  private _lastPlateAt = 0

  constructor() {
    super('OfficeScene')
  }

  init(data: { agents: AgentPersona[]; callbacks: OfficeGameCallbacks }) {
    this.agents = data.agents
    this.callbacks = data.callbacks
  }

  preload() {
    this.load.image('tiles', '/assets/tileset.png')
    this.load.tilemapTiledJSON('office', '/assets/office.json')
    this.load.spritesheet('characters', '/assets/characters.png', {
      frameWidth: 16,
      frameHeight: 16,
    })
  }

  create() {
    const map = this.make.tilemap({ key: 'office' })
    const tiles = map.addTilesetImage('office', 'tiles')
    if (!tiles) throw new Error('tileset missing')

    const ground = map.createLayer('ground', tiles, 0, 0)
    const furniture = map.createLayer('furniture', tiles, 0, 0)
    const collisionLayer = map.createLayer('collision', tiles, 0, 0)
    ground?.setScale(SCALE)
    furniture?.setScale(SCALE)
    collisionLayer?.setScale(SCALE)
    collisionLayer?.setVisible(false)
    ground?.setDepth(0)
    furniture?.setDepth(1)

    this.mapW = map.width
    this.mapH = map.height
    this.collision = Array.from({ length: this.mapH }, () =>
      Array.from({ length: this.mapW }, () => false),
    )

    for (let y = 0; y < this.mapH; y++) {
      for (let x = 0; x < this.mapW; x++) {
        const t = map.getTileAt(x, y, true, 'collision')
        this.collision[y][x] = !!t && t.index > 0
      }
    }

    const objLayer = map.getObjectLayer('objects')
    this.spawns = []
    this.computers = []
    for (const obj of objLayer?.objects ?? []) {
      const wx = (obj.x ?? 0) * SCALE
      const wy = (obj.y ?? 0) * SCALE
      if (obj.type === 'spawn' || obj.name?.startsWith('spawn')) {
        this.spawns.push({ x: wx, y: wy })
      }
      if (obj.type === 'computer' || obj.name?.startsWith('computer')) {
        this.computers.push({ x: wx, y: wy })
      }
    }

    this.cameras.main.setBounds(0, 0, map.widthInPixels * SCALE, map.heightInPixels * SCALE)
    this.cameras.main.centerOn((map.widthInPixels * SCALE) / 2, (map.heightInPixels * SCALE) / 2)
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
    this.spawnAgents(agents)
  }

  private ensureAnims() {
    for (let skin = 0; skin < 4; skin++) {
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
        const idleKey = `idle-${skin}-${dir}`
        this.anims.create({
          key: idleKey,
          frames: [{ key: 'characters', frame: base }],
          frameRate: 1,
        })
      }
    }
  }

  private spawnAgents(agents: AgentPersona[]) {
    const used = new Set<number>()
    agents.forEach((persona, i) => {
      let spawn = this.spawns[i]
      if (!spawn || used.has(i)) {
        spawn = hashPick(persona.id, this.spawns.length ? this.spawns : [{ x: 80, y: 80 }])
      }
      used.add(i)
      // stable desk assignment by hash among spawns
      if (this.spawns.length) {
        spawn = hashPick(persona.id, this.spawns)
      }

      const sprite = this.add.sprite(spawn.x, spawn.y, 'characters', persona.skin * 12)
      sprite.setScale(SCALE)
      sprite.setDepth(10)
      sprite.setInteractive({ useHandCursor: true })
      sprite.setTint(hueTint(persona.tint))
      sprite.on('pointerdown', (p: Phaser.Input.Pointer) => {
        p.event.stopPropagation()
        this.callbacks.onSelect(persona)
      })

      const { mode, durationMs } = nextMode()
      this.runtimes.set(persona.id, {
        persona,
        mode,
        modeUntil: this.time.now + durationMs,
        targetX: spawn.x,
        targetY: spawn.y,
        dir: 0,
        frameTick: 0,
        walkFrame: 0,
      })
      this.sprites.set(persona.id, sprite)
      sprite.play(`idle-${persona.skin}-0`)
    })
  }

  private walkableWorld(wx: number, wy: number): boolean {
    const tx = Math.floor(wx / (TILE * SCALE))
    const ty = Math.floor(wy / (TILE * SCALE))
    if (tx < 0 || ty < 0 || tx >= this.mapW || ty >= this.mapH) return false
    return !this.collision[ty][tx]
  }

  private randomWalkTarget(): Point {
    for (let n = 0; n < 40; n++) {
      const tx = 1 + Math.floor(Math.random() * (this.mapW - 2))
      const ty = 1 + Math.floor(Math.random() * (this.mapH - 2))
      if (!this.collision[ty][tx]) {
        return {
          x: tx * TILE * SCALE + (TILE * SCALE) / 2,
          y: ty * TILE * SCALE + (TILE * SCALE) / 2,
        }
      }
    }
    return { x: 5 * TILE * SCALE, y: 5 * TILE * SCALE }
  }

  update(_time: number, delta: number) {
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
          // stand just below computer
          rt.targetX = c.x
          rt.targetY = c.y + TILE * SCALE
        }
      }

      if (rt.mode === 'wander' || (rt.mode === 'working' && !this.near(sprite.x, sprite.y, rt.targetX, rt.targetY, 4))) {
        this.stepToward(sprite, rt, delta)
      } else if (rt.mode === 'working') {
        rt.dir = 3
        const anim = `idle-${rt.persona.skin}-${rt.dir}`
        if (sprite.anims.currentAnim?.key !== anim) sprite.play(anim)
      } else {
        const anim = `idle-${rt.persona.skin}-${rt.dir}`
        if (sprite.anims.currentAnim?.key !== anim) sprite.play(anim)
      }

      sprite.setDepth(10 + sprite.y / 1000)

      // world → canvas-local screen (overlay shares the game host box)
      const sx = (sprite.x - cam.worldView.x) * cam.zoom
      const sy = (sprite.y - cam.worldView.y) * cam.zoom

      plates.push({
        id,
        name: rt.persona.name,
        status: rt.persona.status,
        lifecycle: rt.persona.lifecycle,
        screenX: sx,
        screenY: sy - 12 * SCALE,
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
    const step = (SPEED * SCALE * delta) / 1000
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
