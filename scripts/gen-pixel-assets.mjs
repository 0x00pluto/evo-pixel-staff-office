#!/usr/bin/env node
/**
 * Generate office-layout.json for atlas-based office (office.png + office_core_atlas.json).
 * Does NOT write tileset.png / characters.png / office.png.
 *
 * Minimal layout: floor tiles + one desk per workstation + trash beside each desk.
 * Characters still render at TILE*CHAR_SCALE in OfficeScene.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const outDir = path.join(__dirname, '..', 'public', 'assets')
const rolesPath = path.join(outDir, 'office-frame-roles.json')

const CELL = 64 // world px per grid cell (matches TILE 32 * CHAR_SCALE 2)
const MAP_W = 28
const MAP_H = 22

function loadRoles() {
  if (!fs.existsSync(rolesPath)) {
    throw new Error(`Missing ${rolesPath}`)
  }
  return JSON.parse(fs.readFileSync(rolesPath, 'utf8'))
}

function makeLayout(roles) {
  const desks = roles.desk
  const trash = roles.trash?.[0]
  const floorPrimary = roles.floor[0]

  if (!desks?.length) throw new Error('office-frame-roles.json needs desk[]')
  if (!floorPrimary) throw new Error('office-frame-roles.json needs floor[0]')

  const furniture = []
  const collision = Array.from({ length: MAP_H }, () => Array.from({ length: MAP_W }, () => false))
  const spawns = []
  const computers = []

  const mark = (gx, gy, gw = 1, gh = 1) => {
    for (let y = gy; y < gy + gh && y < MAP_H; y++) {
      for (let x = gx; x < gx + gw && x < MAP_W; x++) {
        if (x >= 0 && y >= 0) collision[y][x] = true
      }
    }
  }

  const place = (frame, gx, gy, opts = {}) => {
    const { collide = true, cw = 2, ch = 2, role = 'prop' } = opts
    const x = gx * CELL + CELL
    const y = gy * CELL + CELL * 1.5
    furniture.push({ frame, x, y, role, collide })
    if (collide) mark(gx, gy, cw, ch)
  }

  // Upper desk cluster: 4 cols × 3 rows = 12
  const upperDesks = []
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 4; col++) {
      upperDesks.push([3 + col * 5, 3 + row * 3])
    }
  }
  // Lower desk cluster: 3 cols × 3 rows = 9 → 21
  const lowerDesks = []
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      lowerDesks.push([5 + col * 6, 13 + row * 3])
    }
  }
  const allDesks = [...upperDesks, ...lowerDesks]

  allDesks.forEach(([gx, gy], i) => {
    const frame = desks[i % desks.length]
    place(frame, gx, gy, { role: 'desk', cw: 2, ch: 2 })
    if (trash) {
      place(trash, gx + 2, gy, { role: 'trash', collide: false, cw: 1, ch: 1 })
    }
    const cx = gx * CELL + CELL
    const cy = gy * CELL + CELL
    computers.push({ x: cx, y: cy })
    spawns.push({ x: cx, y: cy + CELL * 1.2 })
  })

  const collisionFlat = []
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      const edge = x === 0 || y === 0 || x === MAP_W - 1 || y === MAP_H - 1
      collisionFlat.push(edge || collision[y][x] ? 1 : 0)
    }
  }

  return {
    version: 1,
    cell: CELL,
    width: MAP_W,
    height: MAP_H,
    floor: {
      frame: floorPrimary,
      altFrame: roles.floor[1] || floorPrimary,
    },
    furniture,
    collision: collisionFlat,
    spawns,
    computers,
    deskCount: allDesks.length,
  }
}

const roles = loadRoles()
const layout = makeLayout(roles)

fs.mkdirSync(outDir, { recursive: true })
fs.writeFileSync(path.join(outDir, 'office-layout.json'), JSON.stringify(layout, null, 2))

const needed = ['office.png', 'office_core_atlas.json', 'characters.png']
for (const f of needed) {
  if (!fs.existsSync(path.join(outDir, f))) {
    console.warn(`Warning: missing ${f} — run pack:assets for characters; copy office atlas assets.`)
  }
}

console.log(
  `Wrote office-layout.json (${layout.width}x${layout.height}, desks=${layout.deskCount}, furniture=${layout.furniture.length}) ->`,
  outDir,
)
console.log('Did NOT write office.png / characters.png / tileset.png.')
