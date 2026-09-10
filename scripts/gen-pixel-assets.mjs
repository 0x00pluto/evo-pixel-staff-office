#!/usr/bin/env node
/**
 * Generate office-layout.json for atlas-based office (office.png + office_core_atlas.json).
 * Does NOT write tileset.png / characters.png / office.png.
 *
 * Layout uses a logical grid: cell = 32px atlas world units at furniture scale 1.
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
  const plants = roles.plant
  const walls = roles.wall
  const shelves = roles.shelf
  const decor = roles.decor
  const windows = roles.window
  const conference = roles.conference
  const floorPrimary = roles.floor[0]

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

  // Outer walls / partitions along top and sides
  for (let x = 1; x < MAP_W - 1; x += 2) {
    place(walls[x % walls.length], x, 0, { role: 'wall', cw: 2, ch: 1 })
  }
  // Door gap in top center — skip wall, place window beside
  place(windows[0], Math.floor(MAP_W / 2) - 1, 0, { role: 'window', collide: false, cw: 2, ch: 1 })
  // Clear collision for door walkway under window
  for (let x = Math.floor(MAP_W / 2) - 1; x <= Math.floor(MAP_W / 2) + 1; x++) {
    if (x >= 0 && x < MAP_W) collision[0][x] = false
    if (x >= 0 && x < MAP_W) collision[1][x] = false
  }

  for (let y = 2; y < MAP_H - 1; y += 2) {
    place(walls[y % walls.length], 0, y, { role: 'wall', cw: 1, ch: 2 })
    place(walls[(y + 1) % walls.length], MAP_W - 2, y, { role: 'wall', cw: 1, ch: 2 })
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
    // spawn south of desk, computer at desk center
    const cx = gx * CELL + CELL
    const cy = gy * CELL + CELL
    computers.push({ x: cx, y: cy })
    spawns.push({ x: cx, y: cy + CELL * 1.2 })
  })

  // Mid aisle decorations (dense) around y=10–11
  const aisleY = 10
  const aisleItems = [
    [3, aisleY, plants[0], true],
    [6, aisleY, shelves[0], true],
    [9, aisleY, plants[1 % plants.length], true],
    [12, aisleY, decor[0], true],
    [15, aisleY, plants[2 % plants.length], true],
    [18, aisleY, shelves[1 % shelves.length], true],
    [21, aisleY, plants[0], true],
    [24, aisleY, decor[1 % decor.length], true],
    [4, aisleY + 1, plants[3 % plants.length], false],
    [11, aisleY + 1, plants[1 % plants.length], false],
    [20, aisleY + 1, plants[2 % plants.length], false],
  ]
  for (const [gx, gy, frame, col] of aisleItems) {
    place(frame, gx, gy, { role: 'decor', collide: col, cw: 1, ch: 1 })
  }

  // Side plants near walls
  ;[
    [2, 6, plants[0]],
    [MAP_W - 4, 6, plants[1 % plants.length]],
    [2, 16, plants[2 % plants.length]],
    [MAP_W - 4, 16, plants[3 % plants.length]],
  ].forEach(([gx, gy, frame]) => {
    place(frame, gx, gy, { role: 'plant', cw: 1, ch: 1 })
  })

  // Small conference nook in lower-right corner of aisle
  if (conference[0]) {
    place(conference[0], 20, 8, { role: 'conference', cw: 3, ch: 2 })
  }

  // Flatten collision for JSON
  const collisionFlat = []
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      const edge = x === 0 || y === 0 || x === MAP_W - 1 || y === MAP_H - 1
      collisionFlat.push(edge || collision[y][x] ? 1 : 0)
    }
  }
  // Keep door walkable
  const doorX = Math.floor(MAP_W / 2)
  collisionFlat[doorX] = 0
  collisionFlat[MAP_W + doorX] = 0
  collisionFlat[MAP_W + doorX - 1] = 0
  collisionFlat[MAP_W + doorX + 1] = 0

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
