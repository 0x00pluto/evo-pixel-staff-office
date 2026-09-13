#!/usr/bin/env node
/**
 * Extract a tile rectangle from a 32×32 tileset PNG into temp/ for editing.
 *
 * Read-only: never writes back into WA tilesets (no stamp/apply).
 * Next: promote crop → art/tilesets/<pack>/raw/ (originals); Piskel also stays in raw/;
 * export the strip PNG into src/ then run pack:art-tilesets. Do not put raw crops in src/.
 *
 *   pnpm crop:tiles extract --from tileset6_export --x 1 --y 5 --w 1 --h 2 --out temp/crops/printer.png
 *   pnpm crop:tiles extract --from tileset6_export --id 51 --w 1 --h 2 --out temp/crops/printer.png
 */
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const tilesetsDir = path.join(root, 'public', 'assets', 'maps', 'tilesets')

const TW = 32

function fail(msg) {
  console.error(`FAIL: ${msg}`)
  process.exit(1)
}

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

function usage() {
  console.log(`Usage:
  pnpm crop:tiles extract --from <name|path> --x <col> --y <row> --w <cols> --h <rows> --out <png>
  pnpm crop:tiles extract --from <name|path> --id <localId> --w <cols> --h <rows> --out <png>

  --from   short name → public/assets/maps/tilesets/<name>.png, or a path
  --x/--y  top-left tile column/row (0-based); or --id Tiled local tile id
  --w/--h  size in tiles (default 1×1)
  --out    output PNG path (e.g. temp/crops/printer.png)

  Extract only — never writes WA tilesets. Edit then pack:art-tilesets into a new pack.`)
}

function parseArgs(argv) {
  const args = { _: [] }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a.startsWith('--')) {
      const key = a.slice(2)
      const next = argv[i + 1]
      if (next == null || next.startsWith('--')) {
        args[key] = true
      } else {
        args[key] = next
        i++
      }
    } else {
      args._.push(a)
    }
  }
  return args
}

function resolveTilesetPng(from) {
  if (!from) fail('missing --from')
  if (from.includes('/') || from.includes('\\') || from.endsWith('.png')) {
    const abs = path.isAbsolute(from) ? from : path.join(root, from)
    if (!fs.existsSync(abs)) fail(`PNG not found: ${abs}`)
    return abs
  }
  const abs = path.join(tilesetsDir, `${from}.png`)
  if (!fs.existsSync(abs)) fail(`tileset not found: ${abs}`)
  return abs
}

function intOpt(args, key, fallback) {
  if (args[key] == null || args[key] === true) return fallback
  const n = Number(args[key])
  if (!Number.isInteger(n) || n < 0) fail(`--${key} must be a non-negative integer`)
  return n
}

function extract(args) {
  const srcPath = resolveTilesetPng(args.from)
  const outRel = args.out
  if (!outRel || outRel === true) fail('missing --out')
  const outPath = path.isAbsolute(outRel) ? outRel : path.join(root, outRel)

  const w = intOpt(args, 'w', 1)
  const h = intOpt(args, 'h', 1)
  if (w < 1 || h < 1) fail('--w and --h must be >= 1')

  const img = decodePng(srcPath)
  if (img.width % TW !== 0 || img.height % TW !== 0) {
    fail(`source size ${img.width}x${img.height} must be multiples of ${TW}`)
  }
  const cols = img.width / TW
  const rows = img.height / TW

  let col
  let row
  if (args.id != null && args.id !== true) {
    const id = intOpt(args, 'id')
    col = id % cols
    row = Math.floor(id / cols)
  } else if (args.x != null && args.y != null && args.x !== true && args.y !== true) {
    col = intOpt(args, 'x')
    row = intOpt(args, 'y')
  } else {
    fail('need --x/--y or --id')
  }

  if (col + w > cols || row + h > rows) {
    fail(
      `crop (${col},${row}) ${w}x${h} tiles out of bounds for ${cols}x${rows} tileset (${path.basename(srcPath)})`,
    )
  }

  const outW = w * TW
  const outH = h * TW
  const rgba = Buffer.alloc(outW * outH * 4)
  blit(rgba, outW, img.rgba, img.width, col * TW, row * TW, 0, 0, outW, outH)

  fs.mkdirSync(path.dirname(outPath), { recursive: true })
  fs.writeFileSync(outPath, encodePng(outW, outH, rgba))
  console.log(
    `OK: extracted ${w}x${h} tiles @ (${col},${row}) = ${outW}x${outH}px → ${path.relative(root, outPath)}`,
  )
  console.log('(read-only extract; promote to art/tilesets/<pack>/raw/, export strip to src/, then pack)')
}

const argv = process.argv.slice(2)
const cmd = argv[0]
const args = parseArgs(argv.slice(1))

if (cmd === 'extract') {
  extract(args)
} else if (cmd === 'stamp' || cmd === 'apply') {
  fail(
    `${cmd} is intentionally unsupported. WA tilesets are read-only; extract → edit → pack:art-tilesets into a new pack.`,
  )
} else {
  usage()
  if (cmd) fail(`unknown command: ${cmd}`)
  process.exit(cmd ? 1 : 0)
}
