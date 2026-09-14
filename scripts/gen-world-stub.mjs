#!/usr/bin/env node
/**
 * Generate a 25×25 colored-tile world stub (blue floor + center white exit).
 * Writes:
 *   public/assets/maps/tilesets/world-stub.png
 *   public/assets/maps/world-map.json
 * Updates registry.json label for world-map.
 *
 *   node scripts/gen-world-stub.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import zlib from 'node:zlib'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const mapsDir = path.join(root, 'public', 'assets', 'maps')
const tilesetPath = path.join(mapsDir, 'tilesets', 'world-stub.png')
const mapPath = path.join(mapsDir, 'world-map.json')
const registryPath = path.join(mapsDir, 'registry.json')

const TILE = 32
const W = 25
const H = 25
/** Local tile ids in world-stub.png: 0=blue, 1=white. firstgid=1 → GIDs 1 / 2. */
const GID_BLUE = 1
const GID_WHITE = 2

/** Two white exit cells in the center (horizontal). */
const EXIT_CELLS = [
  [12, 12],
  [13, 12],
]
/** Land south of exit so switchMap cooldown does not bounce immediately. */
const FROM_OFFICE_CELLS = [
  [12, 13],
  [13, 13],
]

function crc32(buf) {
  let c = ~0
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i]
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1
    }
  }
  return ~c >>> 0
}

function pngChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii')
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const crcBuf = Buffer.alloc(4)
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0)
  return Buffer.concat([len, typeBuf, data, crcBuf])
}

/** 64×32 RGB PNG: left blue tile, right white tile. */
function writeStubPng(outPath) {
  const width = TILE * 2
  const height = TILE
  const blue = [0x2e, 0x5c, 0x9a]
  const white = [0xf2, 0xf4, 0xf8]
  const raw = Buffer.alloc((width * 3 + 1) * height)
  for (let y = 0; y < height; y++) {
    const row = y * (width * 3 + 1)
    raw[row] = 0
    for (let x = 0; x < width; x++) {
      const [r, g, b] = x < TILE ? blue : white
      const o = row + 1 + x * 3
      raw[o] = r
      raw[o + 1] = g
      raw[o + 2] = b
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 2
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
  fs.mkdirSync(path.dirname(outPath), { recursive: true })
  fs.writeFileSync(outPath, png)
}

function emptyData() {
  return Array.from({ length: W * H }, () => 0)
}

function fill(data, gid) {
  for (let i = 0; i < data.length; i++) data[i] = gid
}

function stamp(data, cells, gid) {
  for (const [x, y] of cells) {
    data[y * W + x] = gid
  }
}

function writeWorldMap(outPath) {
  const ground = emptyData()
  fill(ground, GID_BLUE)
  stamp(ground, EXIT_CELLS, GID_WHITE)

  const exitData = emptyData()
  stamp(exitData, EXIT_CELLS, GID_WHITE)

  const startData = emptyData()
  stamp(startData, FROM_OFFICE_CELLS, GID_BLUE)

  const fromOfficeData = emptyData()
  stamp(fromOfficeData, FROM_OFFICE_CELLS, GID_BLUE)

  const collisions = emptyData()

  const map = {
    compressionlevel: -1,
    height: H,
    infinite: false,
    layers: [
      {
        data: startData,
        height: H,
        id: 1,
        name: 'start',
        opacity: 1,
        type: 'tilelayer',
        visible: false,
        width: W,
        x: 0,
        y: 0,
      },
      {
        data: fromOfficeData,
        height: H,
        id: 2,
        name: 'from-office',
        opacity: 1,
        type: 'tilelayer',
        visible: false,
        width: W,
        x: 0,
        y: 0,
        properties: [{ name: 'startLayer', type: 'bool', value: true }],
      },
      {
        data: collisions,
        height: H,
        id: 3,
        name: 'collisions',
        opacity: 1,
        type: 'tilelayer',
        visible: false,
        width: W,
        x: 0,
        y: 0,
      },
      {
        data: ground,
        height: H,
        id: 4,
        name: 'ground',
        opacity: 1,
        type: 'tilelayer',
        visible: true,
        width: W,
        x: 0,
        y: 0,
      },
      {
        data: exitData,
        height: H,
        id: 5,
        name: 'exit',
        opacity: 1,
        type: 'tilelayer',
        visible: false,
        width: W,
        x: 0,
        y: 0,
        properties: [
          { name: 'exitMap', type: 'string', value: 'company-25' },
          { name: 'entryName', type: 'string', value: 'office-door' },
        ],
      },
    ],
    nextlayerid: 6,
    nextobjectid: 1,
    orientation: 'orthogonal',
    renderorder: 'right-down',
    tiledversion: '1.11.2',
    tileheight: TILE,
    tilesets: [
      {
        columns: 2,
        firstgid: 1,
        image: 'tilesets/world-stub.png',
        imageheight: TILE,
        imagewidth: TILE * 2,
        margin: 0,
        name: 'world-stub',
        spacing: 0,
        tilecount: 2,
        tileheight: TILE,
        tilewidth: TILE,
      },
    ],
    tilewidth: TILE,
    type: 'map',
    version: '1.10',
    width: W,
    properties: [
      {
        name: 'note',
        type: 'string',
        value:
          '25×25 color stub (blue floor, white center exit). Replaces wa-village HQ for runtime/npm. Regenerate: node scripts/gen-world-stub.mjs. import:wa-world overwrites this.',
      },
    ],
  }

  fs.writeFileSync(outPath, `${JSON.stringify(map)}\n`)
}

function updateRegistryLabel() {
  if (!fs.existsSync(registryPath)) return
  const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'))
  if (registry.maps?.['world-map']) {
    registry.maps['world-map'].label = 'World stub (25×25 color exit)'
  }
  fs.writeFileSync(registryPath, `${JSON.stringify(registry, null, 2)}\n`)
}

writeStubPng(tilesetPath)
writeWorldMap(mapPath)
updateRegistryLabel()
console.log(`gen-world-stub → ${path.relative(root, tilesetPath)}`)
console.log(`gen-world-stub → ${path.relative(root, mapPath)} (${W}×${H})`)
console.log('gen-world-stub → registry world-map label updated')
