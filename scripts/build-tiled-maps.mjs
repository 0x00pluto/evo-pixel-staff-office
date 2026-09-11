#!/usr/bin/env node
/**
 * One-shot / rebuild helper: write company-a.json + outside-stub.json
 * using WA starter tileset firstgids. Does NOT overwrite tileset PNGs.
 * Runtime validation is `pnpm gen:assets`.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const outDir = path.join(__dirname, '..', 'public', 'assets', 'maps')

const TILESETS = [
  {
    name: 'tileset5_export',
    firstgid: 1,
    tilecount: 100,
    columns: 10,
    image: 'tilesets/tileset5_export.png',
    imagewidth: 320,
    imageheight: 320,
  },
  {
    name: 'tileset6_export',
    firstgid: 101,
    tilecount: 100,
    columns: 10,
    image: 'tilesets/tileset6_export.png',
    imagewidth: 320,
    imageheight: 320,
  },
  {
    name: 'tileset1',
    firstgid: 201,
    tilecount: 121,
    columns: 11,
    image: 'tilesets/tileset1.png',
    imagewidth: 352,
    imageheight: 352,
  },
  {
    name: 'tileset1-repositioning',
    firstgid: 322,
    tilecount: 121,
    columns: 11,
    image: 'tilesets/tileset1-repositioning.png',
    imagewidth: 352,
    imageheight: 352,
  },
  {
    name: 'Special_Zones',
    firstgid: 443,
    tilecount: 12,
    columns: 6,
    image: 'tilesets/Special_Zones.png',
    imagewidth: 192,
    imageheight: 64,
  },
]

const FLOOR = 201
/** WA starter wall tiles (tileset5) — do NOT use 56 (magenta placeholder). */
const WALL_H_TOP = 58
const WALL_H = 63
const WALL_V = 73
const WALL_CORNER = 45
const COLLIDE = 443
const START_MARK = 444
const DESK_L = 325
const DESK_M = 340
const DESK_R = 326
const MONITOR = 351
const CHAIR = 340
const PLANT = 220
const SOFA = 275
const TABLE = 333
const TABLE2 = 334
const TABLE_SIDE = 344
const TABLE_SIDE2 = 345
const TREE = 107
const BENCH = 128
const GRASS = 223
const PATH = 201
const DOOR_FRAME = 63
const MONITOR_ABOVE = 261


function empty(w, h) {
  return Array.from({ length: w * h }, () => 0)
}

function set(data, w, x, y, gid) {
  if (x < 0 || y < 0 || x >= w) return
  const i = y * w + x
  if (i >= 0 && i < data.length) data[i] = gid
}

function tileLayer(id, name, w, h, data, extra = {}) {
  return {
    data,
    height: h,
    id,
    name,
    opacity: 1,
    type: 'tilelayer',
    visible: extra.visible !== false,
    width: w,
    x: 0,
    y: 0,
    ...extra.props ? { properties: extra.props } : {},
  }
}

function makeTilesets() {
  return TILESETS.map((t) => ({
    columns: t.columns,
    firstgid: t.firstgid,
    image: t.image,
    imageheight: t.imageheight,
    imagewidth: t.imagewidth,
    margin: 0,
    name: t.name,
    spacing: 0,
    tilecount: t.tilecount,
    tileheight: 32,
    tilewidth: 32,
  }))
}

function buildCompanyA() {
  const W = 42
  const H = 30
  const floor = empty(W, H)
  const walls = empty(W, H)
  const furniture = empty(W, H)
  const aboveFurniture = empty(W, H)
  const collisions = empty(W, H)
  const start = empty(W, H)
  const officeDoor = empty(W, H)
  const exitLayer = empty(W, H)
  const abovePlayer1 = empty(W, H)

  // Uniform wood floor (no blue stripe alt)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      set(floor, W, x, y, FLOOR)
    }
  }

  // Outer walls — WA orientation: top 58+63, bottom 63+58, sides 73, corners 45
  for (let x = 1; x < W - 1; x++) {
    set(walls, W, x, 0, WALL_H_TOP)
    set(walls, W, x, 1, WALL_H)
    set(collisions, W, x, 0, COLLIDE)
    set(collisions, W, x, 1, COLLIDE)
    set(walls, W, x, H - 2, WALL_H)
    set(walls, W, x, H - 1, WALL_H_TOP)
    set(collisions, W, x, H - 2, COLLIDE)
    set(collisions, W, x, H - 1, COLLIDE)
  }
  for (let y = 0; y < H; y++) {
    set(walls, W, 0, y, y === 0 || y === H - 1 ? WALL_CORNER : WALL_V)
    set(walls, W, W - 1, y, y === 0 || y === H - 1 ? WALL_CORNER : WALL_V)
    set(collisions, W, 0, y, COLLIDE)
    set(collisions, W, W - 1, y, COLLIDE)
  }
  // Inner corner accents on second ring
  set(walls, W, 0, 1, WALL_CORNER)
  set(walls, W, W - 1, 1, WALL_CORNER)
  set(walls, W, 0, H - 2, WALL_CORNER)
  set(walls, W, W - 1, H - 2, WALL_CORNER)

  // Front door (south, center)
  const doorX = 20
  for (let dx = 0; dx < 2; dx++) {
    set(walls, W, doorX + dx, H - 1, 0)
    set(walls, W, doorX + dx, H - 2, 0)
    set(collisions, W, doorX + dx, H - 1, 0)
    set(collisions, W, doorX + dx, H - 2, 0)
    set(exitLayer, W, doorX + dx, H - 1, COLLIDE)
    set(officeDoor, W, doorX + dx, H - 3, START_MARK)
    set(furniture, W, doorX + dx, H - 2, DOOR_FRAME)
  }

  set(start, W, 21, 15, START_MARK)
  set(start, W, 22, 15, START_MARK)

  // Meeting room NW
  for (let y = 2; y <= 11; y++) {
    if (y === 7) continue
    set(walls, W, 12, y, WALL_V)
    set(collisions, W, 12, y, COLLIDE)
  }
  for (let x = 1; x <= 12; x++) {
    set(walls, W, x, 11, WALL_H)
    set(collisions, W, x, 11, COLLIDE)
  }
  set(walls, W, 12, 11, WALL_CORNER)
  set(walls, W, 12, 7, 0)
  set(collisions, W, 12, 7, 0)

  // Lounge NE
  for (let y = 2; y <= 11; y++) {
    if (y === 6) continue
    set(walls, W, 30, y, WALL_V)
    set(collisions, W, 30, y, COLLIDE)
  }
  for (let x = 30; x < W - 1; x++) {
    set(walls, W, x, 11, WALL_H)
    set(collisions, W, x, 11, COLLIDE)
  }
  set(walls, W, 30, 11, WALL_CORNER)

  // Reception near entrance
  for (let x = 18; x <= 23; x++) {
    set(furniture, W, x, H - 6, x % 2 === 0 ? TABLE : TABLE2)
    set(collisions, W, x, H - 6, COLLIDE)
  }
  set(furniture, W, 17, H - 6, PLANT)
  set(furniture, W, 24, H - 6, PLANT)
  set(furniture, W, 19, H - 5, CHAIR)
  set(furniture, W, 22, H - 5, CHAIR)

  // Meeting: long table + chairs
  for (let x = 3; x <= 9; x++) {
    set(furniture, W, x, 5, x % 2 === 0 ? TABLE : TABLE2)
    set(furniture, W, x, 6, x % 2 === 0 ? TABLE_SIDE : TABLE_SIDE2)
    set(collisions, W, x, 5, COLLIDE)
    set(collisions, W, x, 6, COLLIDE)
  }
  set(furniture, W, 4, 4, CHAIR)
  set(furniture, W, 6, 4, CHAIR)
  set(furniture, W, 8, 4, CHAIR)
  set(furniture, W, 4, 7, CHAIR)
  set(furniture, W, 6, 7, CHAIR)
  set(furniture, W, 8, 7, CHAIR)
  set(aboveFurniture, W, 3, 3, PLANT)
  set(aboveFurniture, W, 10, 3, PLANT)

  // Lounge
  set(furniture, W, 32, 4, SOFA)
  set(furniture, W, 34, 4, SOFA)
  set(collisions, W, 32, 4, COLLIDE)
  set(collisions, W, 34, 4, COLLIDE)
  set(furniture, W, 33, 6, TABLE)
  set(furniture, W, 31, 7, CHAIR)
  set(furniture, W, 35, 7, CHAIR)
  set(furniture, W, 37, 3, PLANT)
  set(furniture, W, 37, 8, PLANT)
  set(abovePlayer1, W, 36, 5, TREE)

  /**
   * WA-style workstation (4×3):
   *   325 340 340 326  desk
   *     351 351        monitors
   *     340 340        chairs
   */
  function placeWorkstation(gx, gy, deskIdx, objects) {
    // Desk top row
    set(furniture, W, gx, gy, DESK_L)
    set(furniture, W, gx + 1, gy, DESK_M)
    set(furniture, W, gx + 2, gy, DESK_M)
    set(furniture, W, gx + 3, gy, DESK_R)
    set(collisions, W, gx, gy, COLLIDE)
    set(collisions, W, gx + 1, gy, COLLIDE)
    set(collisions, W, gx + 2, gy, COLLIDE)
    set(collisions, W, gx + 3, gy, COLLIDE)

    // Monitors on desk (furniture + above for readability)
    set(furniture, W, gx + 1, gy + 1, MONITOR)
    set(furniture, W, gx + 2, gy + 1, MONITOR)
    set(aboveFurniture, W, gx + 1, gy, MONITOR_ABOVE)
    set(aboveFurniture, W, gx + 2, gy, MONITOR_ABOVE)
    set(collisions, W, gx + 1, gy + 1, COLLIDE)
    set(collisions, W, gx + 2, gy + 1, COLLIDE)

    // Chairs (walkable)
    set(furniture, W, gx + 1, gy + 2, CHAIR)
    set(furniture, W, gx + 2, gy + 2, CHAIR)

    if (deskIdx % 3 === 0) set(aboveFurniture, W, gx + 3, gy + 2, PLANT)

    objects.push({
      height: 0,
      id: 100 + deskIdx,
      name: `computer_${deskIdx}`,
      point: true,
      rotation: 0,
      type: '',
      visible: true,
      width: 0,
      x: (gx + 1.5) * 32,
      y: (gy + 1) * 32 + 16,
    })
    objects.push({
      height: 0,
      id: 200 + deskIdx,
      name: `spawn_${deskIdx}`,
      point: true,
      rotation: 0,
      type: '',
      visible: true,
      width: 0,
      x: (gx + 1.5) * 32,
      y: (gy + 2.5) * 32,
    })
  }

  const objects = []
  const deskPositions = []
  // 4 cols × 5 rows = 20 + 1 = 21；步长 4 避免撞上右侧休息区墙 (x=30)
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 4; col++) {
      deskPositions.push([13 + col * 4, 3 + row * 4])
    }
  }
  deskPositions.push([17, 23]) // 21st

  let deskIdx = 0
  for (const [gx, gy] of deskPositions) {
    placeWorkstation(gx, gy, deskIdx, objects)
    deskIdx++
  }

  let lid = 1
  const layers = [
    tileLayer(lid++, 'floor', W, H, floor),
    tileLayer(lid++, 'start', W, H, start, { visible: false }),
    tileLayer(lid++, 'office-door', W, H, officeDoor, {
      visible: false,
      props: [{ name: 'startLayer', type: 'bool', value: true }],
    }),
    tileLayer(lid++, 'collisions', W, H, collisions, { visible: false }),
    tileLayer(lid++, 'walls', W, H, walls),
    tileLayer(lid++, 'furniture', W, H, furniture),
    tileLayer(lid++, 'aboveFurniture', W, H, aboveFurniture),
    tileLayer(lid++, 'exit', W, H, exitLayer, {
      visible: false,
      props: [
        { name: 'exitMap', type: 'string', value: 'outside-stub' },
        { name: 'entryName', type: 'string', value: 'from-office' },
      ],
    }),
    {
      draworder: 'topdown',
      id: lid++,
      name: 'objects',
      objects,
      opacity: 1,
      type: 'objectgroup',
      visible: true,
      x: 0,
      y: 0,
    },
    tileLayer(lid++, 'abovePlayer1', W, H, abovePlayer1),
  ]

  return {
    compressionlevel: -1,
    height: H,
    infinite: false,
    layers,
    nextlayerid: lid,
    nextobjectid: 400,
    orientation: 'orthogonal',
    renderorder: 'right-down',
    tiledversion: '1.10.2',
    tileheight: 32,
    tilesets: makeTilesets(),
    tilewidth: 32,
    type: 'map',
    version: '1.10',
    width: W,
    properties: [
      {
        name: 'mapCopyright',
        type: 'string',
        value:
          'Tiles: Valdo Romao / WorkAdventure starter kit — CC-BY-SA 3.0. Map layout: evo-agent-team.',
      },
      { name: 'mapName', type: 'string', value: 'company-a' },
      { name: 'deskCount', type: 'int', value: deskIdx },
    ],
  }
}

function buildOutsideStub() {
  const W = 24
  const H = 16
  const floor = empty(W, H)
  const walls = empty(W, H)
  const furniture = empty(W, H)
  const aboveFurniture = empty(W, H)
  const collisions = empty(W, H)
  const start = empty(W, H)
  const fromOffice = empty(W, H)
  const exitLayer = empty(W, H)
  const abovePlayer1 = empty(W, H)

  // Path / plaza ground (R1: more park-like)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const path = x >= 8 && x <= 15 && y >= 2
      set(floor, W, x, y, path ? PATH : GRASS)
    }
  }

  // Soft border hedges
  for (let x = 1; x < W - 1; x++) {
    set(walls, W, x, 0, WALL_H_TOP)
    set(collisions, W, x, 0, COLLIDE)
    set(walls, W, x, H - 1, WALL_H_TOP)
    set(collisions, W, x, H - 1, COLLIDE)
  }
  for (let y = 0; y < H; y++) {
    set(walls, W, 0, y, y === 0 || y === H - 1 ? WALL_CORNER : WALL_V)
    set(collisions, W, 0, y, COLLIDE)
    set(walls, W, W - 1, y, y === 0 || y === H - 1 ? WALL_CORNER : WALL_V)
    set(collisions, W, W - 1, y, COLLIDE)
  }

  // Office building facade at north — return door aligned
  for (let x = 9; x <= 14; x++) {
    set(walls, W, x, 1, WALL_H)
    set(collisions, W, x, 1, COLLIDE)
  }
  // Door opening back to office
  for (let dx = 0; dx < 2; dx++) {
    set(walls, W, 11 + dx, 1, 0)
    set(collisions, W, 11 + dx, 1, 0)
    set(exitLayer, W, 11 + dx, 1, COLLIDE)
    set(fromOffice, W, 11 + dx, 2, START_MARK)
    set(furniture, W, 11 + dx, 1, DOOR_FRAME)
  }

  set(start, W, 12, 8, START_MARK)
  set(start, W, 13, 8, START_MARK)

  // Park benches / trees (R1 denser plaza)
  set(furniture, W, 5, 5, BENCH)
  set(furniture, W, 5, 10, BENCH)
  set(furniture, W, 18, 5, BENCH)
  set(furniture, W, 18, 10, BENCH)
  set(collisions, W, 5, 5, COLLIDE)
  set(collisions, W, 5, 10, COLLIDE)
  set(collisions, W, 18, 5, COLLIDE)
  set(collisions, W, 18, 10, COLLIDE)
  set(abovePlayer1, W, 3, 4, TREE)
  set(abovePlayer1, W, 3, 12, TREE)
  set(abovePlayer1, W, 20, 4, TREE)
  set(abovePlayer1, W, 20, 12, TREE)
  set(furniture, W, 10, 11, TABLE)
  set(furniture, W, 14, 11, CHAIR)
  set(aboveFurniture, W, 7, 7, PLANT)
  set(aboveFurniture, W, 16, 7, PLANT)

  const objects = [
    {
      height: 0,
      id: 1,
      name: 'spawn_0',
      point: true,
      rotation: 0,
      type: '',
      visible: true,
      width: 0,
      x: 12 * 32 + 16,
      y: 8 * 32 + 16,
    },
    {
      height: 0,
      id: 2,
      name: 'computer_0',
      point: true,
      rotation: 0,
      type: '',
      visible: true,
      width: 0,
      x: 14 * 32,
      y: 11 * 32,
    },
  ]

  let lid = 1
  const layers = [
    tileLayer(lid++, 'floor', W, H, floor),
    tileLayer(lid++, 'start', W, H, start, { visible: false }),
    tileLayer(lid++, 'from-office', W, H, fromOffice, {
      visible: false,
      props: [{ name: 'startLayer', type: 'bool', value: true }],
    }),
    tileLayer(lid++, 'collisions', W, H, collisions, { visible: false }),
    tileLayer(lid++, 'walls', W, H, walls),
    tileLayer(lid++, 'furniture', W, H, furniture),
    tileLayer(lid++, 'aboveFurniture', W, H, aboveFurniture),
    tileLayer(lid++, 'exit', W, H, exitLayer, {
      visible: false,
      props: [
        { name: 'exitMap', type: 'string', value: 'company-a' },
        { name: 'entryName', type: 'string', value: 'office-door' },
      ],
    }),
    {
      draworder: 'topdown',
      id: lid++,
      name: 'objects',
      objects,
      opacity: 1,
      type: 'objectgroup',
      visible: true,
      x: 0,
      y: 0,
    },
    tileLayer(lid++, 'abovePlayer1', W, H, abovePlayer1),
  ]

  return {
    compressionlevel: -1,
    height: H,
    infinite: false,
    layers,
    nextlayerid: lid,
    nextobjectid: 10,
    orientation: 'orthogonal',
    renderorder: 'right-down',
    tiledversion: '1.10.2',
    tileheight: 32,
    tilesets: makeTilesets(),
    tilewidth: 32,
    type: 'map',
    version: '1.10',
    width: W,
    properties: [
      {
        name: 'mapCopyright',
        type: 'string',
        value:
          'Tiles: Valdo Romao / WorkAdventure starter kit — CC-BY-SA 3.0. Map layout: evo-agent-team.',
      },
      { name: 'mapName', type: 'string', value: 'outside-stub' },
    ],
  }
}

fs.mkdirSync(outDir, { recursive: true })
const company = buildCompanyA()
const outside = buildOutsideStub()
fs.writeFileSync(path.join(outDir, 'company-a.json'), JSON.stringify(company))
fs.writeFileSync(path.join(outDir, 'outside-stub.json'), JSON.stringify(outside))

const registry = {
  maps: {
    'company-a': {
      id: 'company-a',
      json: '/assets/maps/company-a.json',
      label: 'Company A Office',
    },
    'outside-stub': {
      id: 'outside-stub',
      json: '/assets/maps/outside-stub.json',
      label: 'Outside plaza stub',
    },
  },
  defaultMapId: 'company-a',
  tilesets: TILESETS.map((t) => ({
    name: t.name,
    key: `ts_${t.name}`,
    url: `/assets/maps/${t.image}`,
  })),
}

fs.writeFileSync(path.join(outDir, 'registry.json'), JSON.stringify(registry, null, 2))

const deskCount = company.properties.find((p) => p.name === 'deskCount')?.value
console.log(`Wrote company-a.json (${company.width}x${company.height}, desks=${deskCount})`)
console.log(`Wrote outside-stub.json (${outside.width}x${outside.height})`)
console.log('Wrote registry.json')
console.log('Did NOT write tileset PNGs.')
