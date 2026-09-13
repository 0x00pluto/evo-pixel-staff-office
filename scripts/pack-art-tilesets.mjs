#!/usr/bin/env node
/**
 * Pack art/tilesets/<pack>/src/*.png into 32×32 grid tilesets (append-only).
 *
 * - Each subdirectory of art/tilesets/ with manifest.json is one pack.
 * - Directory name = tileset name = public/.../tilesets/<name>.{png,tsj}
 * - Only top-level src/*.png are packed (horizontal = footprint, vertical = frames).
 * - raw/ is author originals (WA crops, .piskel) — never scanned or packed.
 * - Frame 0 (map-painted tiles) never moves. Extra frames spill elsewhere.
 * - Cells claimed by an entry are lifetime-owned (shrink/delete keep holes).
 * - .tsj animations are authored in Tiled; pack merges/preserves existing tiles[].
 * - columns frozen; atlas width/height hard-capped at 2048px.
 *   Over limit → fail; create art/tilesets/<name>-2/ for more.
 *
 *   pnpm pack:art-tilesets
 *   pnpm pack:office-anim   (alias)
 */
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const artTilesetsDir = path.join(root, 'art', 'tilesets')
const outDir = path.join(root, 'public', 'assets', 'maps', 'tilesets')

const TW = 32
const HARD_MAX_ATLAS_PX = 2048
const DEFAULT_MAX_ATLAS_HEIGHT_PX = HARD_MAX_ATLAS_PX

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

function listPackDirs() {
  if (!fs.existsSync(artTilesetsDir)) return []
  return fs
    .readdirSync(artTilesetsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .filter((name) => {
      const packDir = path.join(artTilesetsDir, name)
      return (
        fs.existsSync(path.join(packDir, 'manifest.json')) &&
        fs.existsSync(path.join(packDir, 'src'))
      )
    })
    .sort()
}

const SRC_WARN_EXTS = new Set(['.piskel', '.aseprite', '.ase', '.psd', '.gif'])

/** Top-level src/*.png only; warn on author-source leftovers that belong in raw/. */
function listSrcPngs(srcDir, packName) {
  if (!fs.existsSync(srcDir)) return []
  const names = fs.readdirSync(srcDir, { withFileTypes: true })
  const pngs = []
  for (const ent of names) {
    if (ent.name.startsWith('.')) continue
    if (ent.isDirectory()) {
      console.warn(
        `WARN: [${packName}] unexpected directory art/tilesets/${packName}/src/${ent.name}/ — ` +
          `packer only reads top-level *.png; put originals under raw/`,
      )
      continue
    }
    const lower = ent.name.toLowerCase()
    if (lower.endsWith('.png')) {
      pngs.push(ent.name)
      continue
    }
    const ext = path.extname(lower)
    if (SRC_WARN_EXTS.has(ext)) {
      console.warn(
        `WARN: [${packName}] ${ent.name} under src/ is ignored — move to art/tilesets/${packName}/raw/`,
      )
    }
  }
  return pngs.sort()
}

function loadManifest(manifestPath, packName) {
  if (!fs.existsSync(manifestPath)) {
    fail(`[${packName}] Missing manifest: ${manifestPath}`)
  }
  const m = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  if (!Number.isInteger(m.columns) || m.columns < 1) {
    fail(`[${packName}] manifest.columns must be a positive integer (locked forever once set)`)
  }
  const atlasW = m.columns * TW
  if (atlasW > HARD_MAX_ATLAS_PX) {
    fail(
      `[${packName}] columns=${m.columns} → width ${atlasW}px exceeds hard cap ${HARD_MAX_ATLAS_PX}px`,
    )
  }
  if (m.tileSize != null && m.tileSize !== TW) {
    fail(`[${packName}] manifest.tileSize must be ${TW}`)
  }
  if (!Array.isArray(m.entries)) m.entries = []
  m.tileSize = TW
  // Author hint for Tiled frame duration; packer does not write animations.
  m.defaultDurationMs = Number(m.defaultDurationMs) || 250
  delete m.tileAnimations

  const maxH = Number(m.maxAtlasHeightPx)
  let resolved = Number.isFinite(maxH) && maxH > 0 ? maxH : DEFAULT_MAX_ATLAS_HEIGHT_PX
  if (resolved > HARD_MAX_ATLAS_PX) {
    fail(
      `[${packName}] maxAtlasHeightPx=${resolved} exceeds hard cap ${HARD_MAX_ATLAS_PX}px (mobile-safe)`,
    )
  }
  m.maxAtlasHeightPx = resolved
  return m
}

function originKey(x, y) {
  return `${x},${y}`
}

function claimStrip(ownerByCell, file, x, y, cols) {
  for (let c = 0; c < cols; c++) {
    ownerByCell.set(originKey(x + c, y), file)
  }
}

/** Lifetime ownership from every entry's `owned` strip origins. */
function buildOwnerMap(entries) {
  const ownerByCell = new Map()
  for (const e of entries) {
    for (const o of e.owned || []) {
      claimStrip(ownerByCell, e.file, o.x, o.y, e.cols)
    }
  }
  return ownerByCell
}

function buildActiveCells(entries) {
  const active = new Set()
  for (const e of entries) {
    for (const f of e.frames || []) {
      for (let c = 0; c < e.cols; c++) {
        active.add(originKey(f.x + c, f.y))
      }
    }
  }
  return active
}

/** Cell is free to paint a strip: not an active frame, and unowned or owned by `file`. */
function stripPlaceable(ownerByCell, activeCells, file, x, y, cols) {
  for (let c = 0; c < cols; c++) {
    const k = originKey(x + c, y)
    if (activeCells.has(k)) return false
    const owner = ownerByCell.get(k)
    if (owner != null && owner !== file) return false
  }
  return true
}

function ensureFramesShape(e, packName) {
  if (!e.file || !Number.isInteger(e.cols) || e.cols < 1) {
    fail(`[${packName}] Bad entry (need file + cols): ${JSON.stringify(e)}`)
  }

  // Migrate legacy x,y,rows → frames[]
  if (!Array.isArray(e.frames) || e.frames.length === 0) {
    if (!Number.isInteger(e.x) || !Number.isInteger(e.y) || !Number.isInteger(e.rows)) {
      fail(`[${packName}] Bad entry (need frames[] or x,y,rows): ${JSON.stringify(e)}`)
    }
    e.frames = []
    for (let i = 0; i < e.rows; i++) {
      e.frames.push({ x: e.x, y: e.y + i })
    }
  }

  for (const f of e.frames) {
    if (!Number.isInteger(f.x) || !Number.isInteger(f.y)) {
      fail(`[${packName}] Bad frame origin in ${e.file}: ${JSON.stringify(f)}`)
    }
  }

  if (!Array.isArray(e.owned) || e.owned.length === 0) {
    e.owned = e.frames.map((f) => ({ x: f.x, y: f.y }))
  } else {
    // Ensure every active frame origin is in owned
    const seen = new Set(e.owned.map((o) => originKey(o.x, o.y)))
    for (const f of e.frames) {
      const k = originKey(f.x, f.y)
      if (!seen.has(k)) {
        e.owned.push({ x: f.x, y: f.y })
        seen.add(k)
      }
    }
  }

  // Mirror legacy fields from frames[0] / length (docs / grepping)
  e.x = e.frames[0].x
  e.y = e.frames[0].y
  e.rows = e.frames.length
}

function addOwned(e, x, y) {
  const k = originKey(x, y)
  if (!e.owned.some((o) => originKey(o.x, o.y) === k)) {
    e.owned.push({ x, y })
  }
}

function atlasHeightFor(entries) {
  let maxBottom = 0
  for (const e of entries) {
    for (const o of e.owned || []) {
      maxBottom = Math.max(maxBottom, o.y + 1)
    }
    for (const f of e.frames || []) {
      maxBottom = Math.max(maxBottom, f.y + 1)
    }
  }
  return Math.max(1, maxBottom) * TW
}

function maxYHint(entries) {
  let maxY = 0
  for (const e of entries) {
    for (const o of e.owned || []) maxY = Math.max(maxY, o.y)
    for (const f of e.frames || []) maxY = Math.max(maxY, f.y)
  }
  return maxY
}

/**
 * Find a free cols×1 strip. `forFile` may reuse its own lifetime cells.
 * Scans from y=0 (tight); does not skip owned holes of others.
 */
function findFreeStrip(entries, columns, cols, forFile, packName, maxH) {
  const ownerByCell = buildOwnerMap(entries)
  const activeCells = buildActiveCells(entries)
  const maxTileRows = Math.floor(maxH / TW)
  const endY = Math.max(maxTileRows - 1, maxYHint(entries) + cols + 8)

  for (let y = 0; y <= endY; y++) {
    for (let x = 0; x <= columns - cols; x++) {
      if (!stripPlaceable(ownerByCell, activeCells, forFile, x, y, cols)) continue
      const trialH = Math.max(atlasHeightFor(entries), (y + 1) * TW)
      if (trialH > maxH) continue
      return { x, y }
    }
  }
  const next = suggestSplitDir(packName)
  fail(
    `[${packName}] No free ${cols}×1 strip for ${forFile} within maxAtlasHeightPx=${maxH}. ` +
      `Create art/tilesets/${next}/ for more (do not change columns).`,
  )
}

function placeNewEntry(entries, columns, cols, rows, file, packName, maxH) {
  const ownerByCell = buildOwnerMap(entries)
  const activeCells = buildActiveCells(entries)
  const maxTileRows = Math.floor(maxH / TW)

  for (let y = 0; y <= maxTileRows - rows; y++) {
    for (let x = 0; x <= columns - cols; x++) {
      let ok = true
      for (let r = 0; r < rows && ok; r++) {
        if (!stripPlaceable(ownerByCell, activeCells, file, x, y + r, cols)) ok = false
      }
      if (!ok) continue
      const trialH = Math.max(atlasHeightFor(entries), (y + rows) * TW)
      if (trialH > maxH) continue
      return { x, y }
    }
  }
  const next = suggestSplitDir(packName)
  fail(
    `[${packName}] Could not place ${file} ${cols}x${rows} within maxAtlasHeightPx=${maxH}. ` +
      `Create art/tilesets/${next}/.`,
  )
}

function suggestSplitDir(packName) {
  if (/-\d+$/.test(packName)) {
    const base = packName.replace(/-\d+$/, '')
    const n = Number(packName.match(/-(\d+)$/)[1]) + 1
    return `${base}-${n}`
  }
  return `${packName}-2`
}

/**
 * Keep hand-edited Tiled tile data (animation, properties, …) across pack runs.
 * Drop entries whose id falls outside the new tilecount.
 */
function mergePreservedTiles(prevTsjPath, tilecount, packName) {
  if (!fs.existsSync(prevTsjPath)) return []
  let prev
  try {
    prev = JSON.parse(fs.readFileSync(prevTsjPath, 'utf8'))
  } catch (err) {
    console.warn(`WARN: [${packName}] could not parse existing ${path.basename(prevTsjPath)}: ${err.message}`)
    return []
  }
  if (!Array.isArray(prev.tiles)) return []
  const kept = []
  for (const t of prev.tiles) {
    if (!t || !Number.isInteger(t.id)) continue
    if (t.id < 0 || t.id >= tilecount) {
      console.warn(
        `WARN: [${packName}] dropping preserved tile id=${t.id} (out of range for tilecount=${tilecount})`,
      )
      continue
    }
    kept.push(t)
  }
  return kept
}

function measurePng(filePath, packName) {
  const img = decodePng(filePath)
  if (img.width % TW !== 0 || img.height % TW !== 0) {
    fail(
      `[${packName}] ${path.basename(filePath)}: size ${img.width}x${img.height} must be multiples of ${TW}`,
    )
  }
  return {
    img,
    cols: img.width / TW,
    rows: img.height / TW,
  }
}

/** Grow/shrink frames for an existing entry; frames[0] never moves. */
function syncEntryFrames(e, newRows, entries, columns, packName, maxH) {
  const oldLen = e.frames.length
  if (newRows === oldLen) return

  if (newRows < oldLen) {
    // Shrink: drop active frames, keep owned lifetime claims
    e.frames = e.frames.slice(0, newRows)
    e.rows = e.frames.length
    console.log(
      `[${packName}] SHRINK ${e.file}: ${oldLen} → ${newRows} frames (holes stay owned)`,
    )
    return
  }

  // Grow: add frames without moving frames[0]
  const f0 = e.frames[0]

  for (let i = oldLen; i < newRows; i++) {
    const ownerByCell = buildOwnerMap(entries)
    const activeCells = buildActiveCells(entries)
    const prefer = { x: f0.x, y: f0.y + i }
    let placed = null

    if (
      prefer.x + e.cols <= columns &&
      stripPlaceable(ownerByCell, activeCells, e.file, prefer.x, prefer.y, e.cols)
    ) {
      const trialH = Math.max(atlasHeightFor(entries), (prefer.y + 1) * TW)
      if (trialH <= maxH) placed = prefer
    }

    if (!placed) {
      // Reuse own owned strip not currently active
      for (const o of e.owned) {
        if (!stripPlaceable(ownerByCell, activeCells, e.file, o.x, o.y, e.cols)) continue
        placed = { x: o.x, y: o.y }
        break
      }
    }

    if (!placed) {
      placed = findFreeStrip(entries, columns, e.cols, e.file, packName, maxH)
      console.log(
        `[${packName}] SPILL ${e.file} frame ${i} → (${placed.x},${placed.y}) ` +
          `(frame 0 stays at (${f0.x},${f0.y}); map tiles unchanged)`,
      )
    } else if (placed.x !== prefer.x || placed.y !== prefer.y) {
      console.log(
        `[${packName}] REUSE ${e.file} frame ${i} → (${placed.x},${placed.y})`,
      )
    } else {
      console.log(`[${packName}] GROW ${e.file} frame ${i} → (${placed.x},${placed.y})`)
    }

    e.frames.push({ x: placed.x, y: placed.y })
    addOwned(e, placed.x, placed.y)
  }

  e.rows = e.frames.length
  e.x = e.frames[0].x
  e.y = e.frames[0].y
}

function packOne(packName) {
  const packDir = path.join(artTilesetsDir, packName)
  const srcDir = path.join(packDir, 'src')
  const manifestPath = path.join(packDir, 'manifest.json')
  const outPng = path.join(outDir, `${packName}.png`)
  const outTsj = path.join(outDir, `${packName}.tsj`)

  const manifest = loadManifest(manifestPath, packName)
  const columns = manifest.columns
  const maxH = manifest.maxAtlasHeightPx
  const diskFiles = listSrcPngs(srcDir, packName)
  const diskSet = new Set(diskFiles)

  for (const e of manifest.entries) {
    ensureFramesShape(e, packName)
  }

  // Existing entries: resize frames (spill) or warn on missing source
  for (const e of manifest.entries) {
    if (!diskSet.has(e.file)) {
      console.warn(
        `WARN: [${packName}] ${e.file} missing under art/tilesets/${packName}/src/ — ` +
          `keeping lifetime hole (frame0 at (${e.x},${e.y}), ${e.cols} cols, owned=${e.owned.length})`,
      )
      continue
    }
    const abs = path.join(srcDir, e.file)
    const { cols, rows } = measurePng(abs, packName)
    if (cols !== e.cols) {
      fail(
        `[${packName}] ${e.file}: width changed to ${cols} tiles but manifest has cols=${e.cols}. ` +
          `Footprint (frame 0) cannot change in place — add a new file and re-paint the map.`,
      )
    }
    if (rows !== e.frames.length) {
      syncEntryFrames(e, rows, manifest.entries, columns, packName, maxH)
    }
  }

  // New files: tight contiguous place
  const known = new Set(manifest.entries.map((e) => e.file))
  for (const file of diskFiles) {
    if (known.has(file)) continue
    const abs = path.join(srcDir, file)
    const { cols, rows } = measurePng(abs, packName)
    if (cols > columns) {
      fail(`[${packName}] ${file}: width ${cols} tiles exceeds locked columns=${columns}`)
    }
    const pos = placeNewEntry(manifest.entries, columns, cols, rows, file, packName, maxH)
    const frames = []
    for (let i = 0; i < rows; i++) frames.push({ x: pos.x, y: pos.y + i })
    const entry = {
      id: path.parse(file).name,
      file,
      cols,
      frames,
      owned: frames.map((f) => ({ x: f.x, y: f.y })),
      x: pos.x,
      y: pos.y,
      rows,
    }
    manifest.entries.push(entry)
    console.log(`[${packName}] APPEND ${file} → (${pos.x},${pos.y}) ${cols}x${rows} tiles`)
  }

  const atlasH = atlasHeightFor(manifest.entries)
  if (atlasH > maxH) {
    const next = suggestSplitDir(packName)
    fail(
      `[${packName}] atlas height ${atlasH}px exceeds maxAtlasHeightPx=${maxH}. ` +
        `Move newer strips to art/tilesets/${next}/ (do not change columns).`,
    )
  }

  const atlasRows = Math.max(1, atlasH / TW)
  const atlasW = columns * TW
  if (atlasW > HARD_MAX_ATLAS_PX) {
    fail(`[${packName}] atlas width ${atlasW}px exceeds hard cap ${HARD_MAX_ATLAS_PX}px`)
  }
  const atlas = Buffer.alloc(atlasW * atlasH * 4)

  for (const e of manifest.entries) {
    const abs = path.join(srcDir, e.file)
    if (!fs.existsSync(abs)) continue
    const { img, rows } = measurePng(abs, packName)
    if (rows !== e.frames.length) {
      fail(`[${packName}] Internal error: ${e.file} rows=${rows} frames=${e.frames.length}`)
    }
    for (let i = 0; i < e.frames.length; i++) {
      const f = e.frames[i]
      blit(
        atlas,
        atlasW,
        img.rgba,
        img.width,
        0,
        i * TW,
        f.x * TW,
        f.y * TW,
        e.cols * TW,
        TW,
      )
    }
  }

  // Drop reservedRows-era noise if any; keep frames + owned + mirrors
  for (const e of manifest.entries) {
    delete e.reservedRows
    delete e.tileAnimations
    e.x = e.frames[0].x
    e.y = e.frames[0].y
    e.rows = e.frames.length
  }

  const tilecount = columns * atlasRows
  // Animations / properties: bind in Tiled; pack only preserves existing tiles[].
  const tiles = mergePreservedTiles(outTsj, tilecount, packName)

  const tsj = {
    columns,
    image: `${packName}.png`,
    imageheight: atlasH,
    imagewidth: atlasW,
    margin: 0,
    name: packName,
    spacing: 0,
    tilecount,
    tiledversion: '1.10.2',
    tileheight: TW,
    tiles,
    tilewidth: TW,
    type: 'tileset',
    version: '1.10',
  }

  fs.mkdirSync(outDir, { recursive: true })
  fs.writeFileSync(outPng, encodePng(atlasW, atlasH, atlas))
  fs.writeFileSync(outTsj, `${JSON.stringify(tsj, null, 2)}\n`)
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)

  const animCount = tiles.filter((t) => Array.isArray(t.animation) && t.animation.length).length
  console.log(
    `[${packName}] Packed ${packName}.png ${atlasW}x${atlasH} (${columns} cols × ${atlasRows} rows)`,
  )
  console.log(
    `  entries: ${manifest.entries.length}, preserved tile records: ${tiles.length} (${animCount} with animation)`,
  )
  console.log(`  → ${outPng}`)
  console.log(`  → ${outTsj}`)
}

function main() {
  const packs = listPackDirs()
  if (!packs.length) {
    console.log('No packs under art/tilesets/*/manifest.json — nothing to do.')
    return
  }
  for (const name of packs) {
    packOne(name)
  }
  console.log(`packed ${packs.join(', ')} (${packs.length} pack${packs.length === 1 ? '' : 's'})`)
}

main()
