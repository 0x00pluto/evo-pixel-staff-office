#!/usr/bin/env node
/**
 * Assemble characters.png from Pipoya vendor (64 skins).
 * Office furniture atlas (office.png + office_core_atlas.json) is maintained separately —
 * this script does NOT touch office atlas or tileset.png.
 *
 *   temp/vendor/pipoya/<manifest paths>
 * Env: EVO_VENDOR_PIPOYA
 */
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const outDir = path.join(root, 'public', 'assets')
const TW = 32

const pipoyaDir =
  process.env.EVO_VENDOR_PIPOYA || path.join(root, 'temp', 'vendor', 'pipoya')
const manifestPath = path.join(__dirname, 'pipoya-64-manifest.txt')

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

function paeth(a, b, c) {
  const p = a + b - c
  const pa = Math.abs(p - a)
  const pb = Math.abs(p - b)
  const pc = Math.abs(p - c)
  if (pa <= pb && pa <= pc) return a
  if (pb <= pc) return b
  return c
}

function decodePng(filePath) {
  const data = fs.readFileSync(filePath)
  if (data.subarray(0, 8).toString('binary') !== '\x89PNG\r\n\x1a\n') {
    throw new Error(`Not a PNG: ${filePath}`)
  }
  let i = 8
  let width = 0
  let height = 0
  let bitDepth = 0
  let colorType = 0
  const idatParts = []
  while (i < data.length) {
    const length = data.readUInt32BE(i)
    i += 4
    const type = data.subarray(i, i + 4).toString('ascii')
    i += 4
    const chunkData = data.subarray(i, i + length)
    i += length
    i += 4
    if (type === 'IHDR') {
      width = chunkData.readUInt32BE(0)
      height = chunkData.readUInt32BE(4)
      bitDepth = chunkData[8]
      colorType = chunkData[9]
    } else if (type === 'IDAT') {
      idatParts.push(chunkData)
    } else if (type === 'IEND') {
      break
    }
  }
  if (bitDepth !== 8 || colorType !== 6) {
    throw new Error(`Unsupported PNG (need 8-bit RGBA): ${filePath}`)
  }
  const raw = zlib.inflateSync(Buffer.concat(idatParts))
  const bpp = 4
  const stride = width * bpp
  const rgba = Buffer.alloc(height * stride)
  let prev = Buffer.alloc(stride)
  let pos = 0
  for (let y = 0; y < height; y++) {
    const filter = raw[pos++]
    const row = Buffer.from(raw.subarray(pos, pos + stride))
    pos += stride
    if (filter === 0) {
      // none
    } else if (filter === 1) {
      for (let x = 0; x < stride; x++) {
        const left = x >= bpp ? row[x - bpp] : 0
        row[x] = (row[x] + left) & 255
      }
    } else if (filter === 2) {
      for (let x = 0; x < stride; x++) row[x] = (row[x] + prev[x]) & 255
    } else if (filter === 3) {
      for (let x = 0; x < stride; x++) {
        const left = x >= bpp ? row[x - bpp] : 0
        row[x] = (row[x] + ((left + prev[x]) >> 1)) & 255
      }
    } else if (filter === 4) {
      for (let x = 0; x < stride; x++) {
        const left = x >= bpp ? row[x - bpp] : 0
        const up = prev[x]
        const ul = x >= bpp ? prev[x - bpp] : 0
        row[x] = (row[x] + paeth(left, up, ul)) & 255
      }
    } else {
      throw new Error(`PNG filter ${filter} in ${filePath}`)
    }
    row.copy(rgba, y * stride)
    prev = row
  }
  return { width, height, rgba }
}

function blit(dst, dw, src, sw, sx, sy, dx, dy, tw, th) {
  for (let y = 0; y < th; y++) {
    for (let x = 0; x < tw; x++) {
      const si = ((sy + y) * sw + (sx + x)) * 4
      const di = ((dy + y) * dw + (dx + x)) * 4
      dst[di] = src[si]
      dst[di + 1] = src[si + 1]
      dst[di + 2] = src[si + 2]
      dst[di + 3] = src[si + 3]
    }
  }
}

function fail(msg) {
  console.error(msg)
  process.exit(1)
}

if (!fs.existsSync(pipoyaDir)) {
  fail(
    `Missing Pipoya vendor dir:\n  ${pipoyaDir}\n` +
      `Place under temp/vendor/pipoya/ or set EVO_VENDOR_PIPOYA.`,
  )
}
if (!fs.existsSync(manifestPath)) {
  fail(`Missing manifest: ${manifestPath}`)
}

const lines = fs
  .readFileSync(manifestPath, 'utf8')
  .split(/\r?\n/)
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith('#'))
if (lines.length !== 64) {
  fail(`Manifest must list exactly 64 paths, got ${lines.length}`)
}

const atlasW = TW * 12
const atlasH = TW * 64
const atlas = Buffer.alloc(atlasW * atlasH * 4)

for (let skin = 0; skin < 64; skin++) {
  const rel = lines[skin]
  const abs = path.join(pipoyaDir, rel)
  if (!fs.existsSync(abs)) fail(`Missing Pipoya sprite [${skin}]: ${abs}`)
  const char = decodePng(abs)
  if (char.width !== 96 || char.height !== 128) {
    fail(`Pipoya sprite must be 96x128 (3x4 of 32): ${rel} got ${char.width}x${char.height}`)
  }
  for (let dir = 0; dir < 4; dir++) {
    for (let f = 0; f < 3; f++) {
      const sx = f * TW
      const sy = dir * TW
      const dx = (dir * 3 + f) * TW
      const dy = skin * TW
      blit(atlas, atlasW, char.rgba, char.width, sx, sy, dx, dy, TW, TW)
    }
  }
}

fs.mkdirSync(outDir, { recursive: true })
fs.writeFileSync(path.join(outDir, 'characters.png'), encodePng(atlasW, atlasH, atlas))
console.log('Packed characters.png ->', outDir)
console.log('  characters: 12x64 @32px (Pipoya 64 skins)')
console.log('  (office.png atlas is separate; not modified)')
