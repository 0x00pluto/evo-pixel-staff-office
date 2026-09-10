#!/usr/bin/env node
/**
 * Generate minimal 16x16 pixel tileset + character sheet + Tiled office map.
 * Procedural CC0-style assets (original); see public/assets/CREDITS.md.
 */
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const outDir = path.join(__dirname, '..', 'public', 'assets')

function crc32(buf) {
  let c = ~0
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i]
    for (let k = 0; k < 8; k++) c = c & 1 ? (0xedb88320 ^ (c >>> 1)) : c >>> 1
  }
  return ~c >>> 0
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type)
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const crcBuf = Buffer.alloc(4)
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])))
  return Buffer.concat([len, typeBuf, data, crcBuf])
}

function encodePng(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0
    for (let x = 0; x < width; x++) {
      const si = (y * width + x) * 4
      const di = y * (width * 4 + 1) + 1 + x * 4
      raw[di] = rgba[si]
      raw[di + 1] = rgba[si + 1]
      raw[di + 2] = rgba[si + 2]
      raw[di + 3] = rgba[si + 3]
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

function px(rgba, w, x, y, r, g, b, a = 255) {
  if (x < 0 || y < 0 || x >= w) return
  const i = (y * w + x) * 4
  rgba[i] = r
  rgba[i + 1] = g
  rgba[i + 2] = b
  rgba[i + 3] = a
}

function fillRect(rgba, w, x0, y0, tw, th, r, g, b, a = 255) {
  for (let y = y0; y < y0 + th; y++) {
    for (let x = x0; x < x0 + tw; x++) px(rgba, w, x, y, r, g, b, a)
  }
}

function makeTileset() {
  const tw = 16
  const cols = 8
  const w = tw * cols
  const h = tw
  const rgba = Buffer.alloc(w * h * 4)

  fillRect(rgba, w, 0, 0, 16, 16, 194, 158, 110)
  for (let y = 0; y < 16; y += 4) fillRect(rgba, w, 0, y, 16, 1, 170, 136, 90)

  fillRect(rgba, w, 16, 0, 16, 16, 92, 108, 128)
  fillRect(rgba, w, 16, 14, 16, 2, 70, 84, 100)

  fillRect(rgba, w, 32, 0, 16, 16, 194, 158, 110, 0)
  fillRect(rgba, w, 32, 6, 16, 8, 120, 78, 48)
  fillRect(rgba, w, 32, 5, 16, 2, 150, 100, 60)

  fillRect(rgba, w, 48, 0, 16, 16, 194, 158, 110, 0)
  fillRect(rgba, w, 48, 6, 16, 8, 120, 78, 48)
  fillRect(rgba, w, 51, 2, 10, 7, 40, 44, 52)
  fillRect(rgba, w, 52, 3, 8, 5, 90, 200, 160)

  fillRect(rgba, w, 64, 0, 16, 16, 194, 158, 110, 0)
  fillRect(rgba, w, 69, 10, 6, 5, 110, 70, 40)
  fillRect(rgba, w, 68, 4, 8, 7, 60, 150, 70)

  fillRect(rgba, w, 80, 0, 16, 16, 120, 80, 90)

  fillRect(rgba, w, 96, 0, 16, 16, 194, 158, 110, 0)
  fillRect(rgba, w, 99, 8, 10, 6, 60, 70, 90)
  fillRect(rgba, w, 100, 4, 8, 5, 70, 90, 130)

  fillRect(rgba, w, 112, 0, 16, 16, 194, 158, 110)

  return encodePng(w, h, rgba)
}

function makeCharacters() {
  const skins = [
    [70, 130, 200],
    [200, 90, 90],
    [90, 170, 110],
    [180, 140, 60],
  ]
  const tw = 16
  const framesPerDir = 3
  const dirs = 4
  const cols = dirs * framesPerDir
  const rows = skins.length
  const w = tw * cols
  const h = tw * rows
  const rgba = Buffer.alloc(w * h * 4)

  for (let s = 0; s < skins.length; s++) {
    const [cr, cg, cb] = skins[s]
    for (let d = 0; d < dirs; d++) {
      for (let f = 0; f < framesPerDir; f++) {
        const ox = (d * framesPerDir + f) * tw
        const oy = s * tw
        for (let y = 0; y < tw; y++) {
          for (let x = 0; x < tw; x++) px(rgba, w, ox + x, oy + y, 0, 0, 0, 0)
        }
        const bob = f === 1 ? 0 : f === 2 ? 1 : 0
        const leg = f === 0 ? 0 : f === 1 ? 1 : -1
        fillRect(rgba, w, ox + 5, oy + 6 + bob, 6, 6, cr, cg, cb)
        fillRect(rgba, w, ox + 5, oy + 2 + bob, 6, 5, 235, 200, 170)
        fillRect(rgba, w, ox + 5, oy + 1 + bob, 6, 2, 40, 30, 25)
        if (d === 0) {
          px(rgba, w, ox + 6, oy + 4 + bob, 30, 30, 30)
          px(rgba, w, ox + 9, oy + 4 + bob, 30, 30, 30)
        } else if (d === 1) {
          px(rgba, w, ox + 6, oy + 4 + bob, 30, 30, 30)
        } else if (d === 2) {
          px(rgba, w, ox + 9, oy + 4 + bob, 30, 30, 30)
        }
        fillRect(rgba, w, ox + 5, oy + 12 + bob, 2, 3 + (leg > 0 ? 1 : 0), 50, 50, 70)
        fillRect(rgba, w, ox + 9, oy + 12 + bob, 2, 3 + (leg < 0 ? 1 : 0), 50, 50, 70)
      }
    }
  }

  return encodePng(w, h, rgba)
}

function makeOfficeMap() {
  const W = 40
  const H = 28
  const ground = []
  const furniture = []
  const collision = []

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const edge = x === 0 || y === 0 || x === W - 1 || y === H - 1
      ground.push(edge ? 2 : y >= 12 && y <= 15 && x >= 8 && x <= 31 ? 6 : 1)
      furniture.push(0)
      collision.push(edge ? 1 : 0)
    }
  }

  const desks = [
    [4, 4], [10, 4], [16, 4], [22, 4], [28, 4], [34, 4],
    [4, 9], [10, 9], [16, 9], [22, 9], [28, 9], [34, 9],
    [4, 18], [10, 18], [16, 18], [22, 18], [28, 18], [34, 18],
    [7, 23], [16, 23], [25, 23],
  ]

  const objects = []
  desks.forEach(([tx, ty], i) => {
    const idx = ty * W + tx
    furniture[idx] = 4
    furniture[idx + 1] = 3
    collision[idx] = 1
    collision[idx + 1] = 1
    objects.push({
      id: i + 1,
      name: `desk_${i}`,
      type: 'desk',
      x: tx * 16,
      y: ty * 16,
      width: 32,
      height: 16,
    })
    objects.push({
      id: 100 + i,
      name: `spawn_${i}`,
      type: 'spawn',
      x: tx * 16 + 8,
      y: (ty + 2) * 16 + 8,
      width: 16,
      height: 16,
    })
    objects.push({
      id: 200 + i,
      name: `computer_${i}`,
      type: 'computer',
      x: tx * 16 + 8,
      y: ty * 16 + 8,
      width: 16,
      height: 16,
    })
  })

  ;[
    [8, 12],
    [31, 12],
    [8, 15],
    [31, 15],
  ].forEach(([tx, ty]) => {
    furniture[ty * W + tx] = 5
    collision[ty * W + tx] = 1
  })

  return {
    compressionlevel: -1,
    height: H,
    width: W,
    infinite: false,
    layers: [
      {
        data: ground,
        height: H,
        width: W,
        id: 1,
        name: 'ground',
        opacity: 1,
        type: 'tilelayer',
        visible: true,
        x: 0,
        y: 0,
      },
      {
        data: furniture,
        height: H,
        width: W,
        id: 2,
        name: 'furniture',
        opacity: 1,
        type: 'tilelayer',
        visible: true,
        x: 0,
        y: 0,
      },
      {
        data: collision,
        height: H,
        width: W,
        id: 3,
        name: 'collision',
        opacity: 0,
        type: 'tilelayer',
        visible: false,
        x: 0,
        y: 0,
      },
      {
        draworder: 'topdown',
        id: 4,
        name: 'objects',
        objects,
        opacity: 1,
        type: 'objectgroup',
        visible: true,
        x: 0,
        y: 0,
      },
    ],
    nextlayerid: 5,
    nextobjectid: 400,
    orientation: 'orthogonal',
    renderorder: 'right-down',
    tiledversion: '1.10.2',
    tileheight: 16,
    tilewidth: 16,
    tilesets: [
      {
        columns: 8,
        firstgid: 1,
        image: 'tileset.png',
        imageheight: 16,
        imagewidth: 128,
        margin: 0,
        name: 'office',
        spacing: 0,
        tilecount: 8,
        tileheight: 16,
        tilewidth: 16,
      },
    ],
    type: 'map',
    version: '1.10',
  }
}

fs.mkdirSync(outDir, { recursive: true })
fs.writeFileSync(path.join(outDir, 'tileset.png'), makeTileset())
fs.writeFileSync(path.join(outDir, 'characters.png'), makeCharacters())
fs.writeFileSync(path.join(outDir, 'office.json'), JSON.stringify(makeOfficeMap(), null, 2))
console.log('Wrote tileset.png, characters.png, office.json ->', outDir)
