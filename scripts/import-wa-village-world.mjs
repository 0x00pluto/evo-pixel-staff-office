#!/usr/bin/env node
/**
 * Import wa-village headquarters as world-map for local testing.
 *
 *   EVO_WA_VILLAGE=/path/to/wa-village node scripts/import-wa-village-world.mjs
 *
 * Copies used tileset PNGs → public/assets/maps/tilesets/village/
 * Writes public/assets/maps/world-map.json (Phaser-ready, flattened layers).
 * Does NOT copy src/, scavenger/, or unused seasonal assets.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const defaultVillage = path.resolve(root, '../../参考项目/wa-village')
const villageRoot = process.env.EVO_WA_VILLAGE
  ? path.resolve(process.env.EVO_WA_VILLAGE)
  : defaultVillage
const srcMap = path.join(villageRoot, 'wa-headquarters.tmj')
const outMap = path.join(root, 'public', 'assets', 'maps', 'world-map.json')
const outTilesDir = path.join(root, 'public', 'assets', 'maps', 'tilesets', 'village')
const registryPath = path.join(root, 'public', 'assets', 'maps', 'registry.json')

/** Office building door cells (WA lobby / zone_office). */
const EXIT_CELLS = [
  [103, 73],
  [104, 73],
  [105, 73],
  [103, 74],
  [104, 74],
  [105, 74],
  [103, 75],
  [104, 75],
  [105, 75],
  [103, 76],
  [104, 76],
  [105, 76],
]
/** South of door — camera land when leaving company-25. */
const FROM_OFFICE_CELLS = [
  [103, 77],
  [104, 77],
  [105, 77],
]

/** Keep closed doors (visible) and open conference door; drop open office doors / closed conference. */
const KEEP_GROUP_CHILDREN = new Set([
  'conferenceDoor/open',
  'doors/door_office_closed',
  'doors/door_coworking_closed',
  'doors/door2_office_closed',
  'doors/door_office_meeting_closed',
  'doors/door3_meeting_closed',
  'doors/door4_meeting_closed',
])

const DROP_LAYER_NAMES = new Set(['silentOverlay', 'floorLayer', 'configuration'])

if (!fs.existsSync(srcMap)) {
  console.error(`FAIL: missing village map: ${srcMap}`)
  process.exit(1)
}

const d = JSON.parse(fs.readFileSync(srcMap, 'utf8'))
const W = d.width
const H = d.height

function emptyData() {
  return Array.from({ length: W * H }, () => 0)
}

function flattenLayers(layers, prefix = '') {
  const out = []
  for (const L of layers || []) {
    const full = prefix ? `${prefix}/${L.name}` : L.name
    if (L.type === 'group') {
      out.push(...flattenLayers(L.layers || [], full))
      continue
    }
    if (L.type === 'objectgroup') {
      if (DROP_LAYER_NAMES.has(L.name) || DROP_LAYER_NAMES.has(full)) continue
      continue
    }
    if (L.type !== 'tilelayer') continue
    if (DROP_LAYER_NAMES.has(L.name) || DROP_LAYER_NAMES.has(full)) continue
    if (prefix && !KEEP_GROUP_CHILDREN.has(full)) continue

    const flat = structuredClone(L)
    if (prefix) {
      // Phaser needs a flat name (no slash); keep group context.
      flat.name = full.replace(/\//g, '_')
    }
    out.push(flat)
  }
  return out
}

let layers = flattenLayers(d.layers)

// Rename collision → collisions (keep data); drop empty original start if present.
const collision = layers.find((L) => L.name === 'collision')
layers = layers.filter((L) => L.name !== 'collision' && L.name !== 'start')

const maxLayerId = Math.max(0, ...layers.map((L) => L.id || 0))
let nextLayerId = maxLayerId + 1

const collisionsLayer = {
  data: collision ? [...collision.data] : emptyData(),
  height: H,
  id: nextLayerId++,
  name: 'collisions',
  opacity: 1,
  type: 'tilelayer',
  visible: false,
  width: W,
  x: 0,
  y: 0,
}

const sz = (d.tilesets || []).find((t) => t.name === 'WA_Special_Zones')
if (!sz) {
  console.error('FAIL: WA_Special_Zones tileset missing in village map')
  process.exit(1)
}
const EXIT_GID = sz.firstgid + 2 // BLOCK (collides)
const START_GID = sz.firstgid + 1 // start mark

const exitData = emptyData()
for (const [x, y] of EXIT_CELLS) {
  exitData[y * W + x] = EXIT_GID
}
const exitLayer = {
  data: exitData,
  height: H,
  id: nextLayerId++,
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
}

const startData = emptyData()
const fromOfficeData = emptyData()
for (const [x, y] of FROM_OFFICE_CELLS) {
  startData[y * W + x] = START_GID
  fromOfficeData[y * W + x] = START_GID
}
const startLayer = {
  data: startData,
  height: H,
  id: nextLayerId++,
  name: 'start',
  opacity: 1,
  type: 'tilelayer',
  visible: false,
  width: W,
  x: 0,
  y: 0,
}
const fromOfficeLayer = {
  data: fromOfficeData,
  height: H,
  id: nextLayerId++,
  name: 'from-office',
  opacity: 1,
  type: 'tilelayer',
  visible: false,
  width: W,
  x: 0,
  y: 0,
  properties: [{ name: 'startLayer', type: 'bool', value: true }],
}

// Insert logic layers near the front (after we keep visual stack order for the rest).
layers = [startLayer, fromOfficeLayer, collisionsLayer, ...layers, exitLayer]

// Collect used GIDs (ignore flip flags).
const usedGids = new Set()
for (const L of layers) {
  if (!L.data) continue
  for (const v of L.data) {
    if (v) usedGids.add(v & 0x1fffffff)
  }
}

const tilesetsIn = d.tilesets || []
const ranges = tilesetsIn.map((t, i) => {
  const start = t.firstgid
  const end =
    i + 1 < tilesetsIn.length
      ? tilesetsIn[i + 1].firstgid - 1
      : start + t.tilecount - 1
  return { t, start, end, index: i }
})

const usedTilesets = []
for (const { t, start, end } of ranges) {
  let hit = false
  for (const g of usedGids) {
    if (g >= start && g <= end) {
      hit = true
      break
    }
  }
  if (!hit) continue
  usedTilesets.push(t)
}

fs.mkdirSync(outTilesDir, { recursive: true })

const seenNames = new Map()
const tilesetsOut = []
const registryTilesets = []

for (const t of usedTilesets) {
  const srcImage = t.image
  if (!srcImage) {
    console.error(`FAIL: tileset ${t.name} has no image`)
    process.exit(1)
  }
  const absSrc = path.resolve(villageRoot, srcImage)
  if (!fs.existsSync(absSrc)) {
    console.error(`FAIL: missing tileset image ${absSrc}`)
    process.exit(1)
  }

  // image like "tilesets/GroundWorld.png" or "tilesets/giving-tuesday/logos.png"
  const relUnderTilesets = srcImage.replace(/^tilesets\//, '')
  const destAbs = path.join(outTilesDir, relUnderTilesets)
  fs.mkdirSync(path.dirname(destAbs), { recursive: true })
  fs.copyFileSync(absSrc, destAbs)

  const occ = (seenNames.get(t.name) || 0) + 1
  seenNames.set(t.name, occ)
  // Disambiguate duplicate tileset names (e.g. mini-trees appears twice).
  const name = occ === 1 ? t.name : `${t.name}_${occ}`

  const imageRel = `tilesets/village/${relUnderTilesets}`
  const embedded = {
    columns: t.columns,
    firstgid: t.firstgid,
    image: imageRel,
    imageheight: t.imageheight,
    imagewidth: t.imagewidth,
    margin: t.margin ?? 0,
    name,
    spacing: t.spacing ?? 0,
    tilecount: t.tilecount,
    tileheight: t.tileheight || 32,
    tilewidth: t.tilewidth || 32,
  }
  if (Array.isArray(t.tiles) && t.tiles.length) {
    embedded.tiles = structuredClone(t.tiles)
  }
  tilesetsOut.push(embedded)

  // Sidecar .tsj next to PNG (Tiled shared tileset; pack refreshes collides from here).
  const tsjAbs = destAbs.replace(/\.png$/i, '.tsj')
  const tsj = {
    columns: t.columns,
    image: path.basename(destAbs),
    imageheight: t.imageheight,
    imagewidth: t.imagewidth,
    margin: t.margin ?? 0,
    name,
    spacing: t.spacing ?? 0,
    tilecount: t.tilecount,
    tiledversion: d.tiledversion || '1.10.2',
    tileheight: t.tileheight || 32,
    tilewidth: t.tilewidth || 32,
    type: 'tileset',
    version: d.version || '1.10',
  }
  if (Array.isArray(t.tiles) && t.tiles.length) {
    tsj.tiles = structuredClone(t.tiles)
  }
  fs.writeFileSync(tsjAbs, JSON.stringify(tsj, null, 2) + '\n')

  const key = `ts_village_${name.replace(/[^A-Za-z0-9_-]/g, '_')}`
  registryTilesets.push({
    name,
    key,
    url: `/assets/maps/${imageRel}`,
  })
}

const out = {
  compressionlevel: -1,
  height: H,
  infinite: false,
  layers,
  nextlayerid: nextLayerId,
  nextobjectid: 1,
  orientation: 'orthogonal',
  renderorder: 'right-down',
  tiledversion: d.tiledversion || '1.10.2',
  tileheight: 32,
  tilesets: tilesetsOut,
  tilewidth: 32,
  type: 'map',
  version: d.version || '1.10',
  width: W,
  properties: [
    {
      name: 'mapName',
      type: 'string',
      value: 'world-map',
    },
    {
      name: 'kind',
      type: 'string',
      value: 'world',
    },
    {
      name: 'evoNote',
      type: 'string',
      value:
        'Local-test import from wa-village wa-headquarters.tmj. No scripts/scavenger. Copyright: replace or license before public/commercial use.',
    },
    {
      name: 'mapCopyright',
      type: 'string',
      value:
        'Source: workadventure/wa-village (wa-headquarters). Local test import only — see CREDITS.md.',
    },
  ],
}

fs.writeFileSync(outMap, JSON.stringify(out))
console.log(
  `Wrote ${outMap} (${W}x${H}, layers=${layers.length}, tilesets=${tilesetsOut.length})`,
)
console.log('Layers:', layers.map((L) => L.name).join(', '))

// Merge village tilesets into registry.json (office tilesets kept).
const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'))
const officeTsNames = new Set(
  (registry.tilesets || [])
    .filter((t) => !String(t.url || '').includes('/village/'))
    .map((t) => t.name),
)
registry.tilesets = [
  ...(registry.tilesets || []).filter((t) => !String(t.url || '').includes('/village/')),
  ...registryTilesets.filter((t) => !officeTsNames.has(t.name) || true),
]
// Dedupe by name keeping last (village overwrites same name — shouldn't collide with office).
const byName = new Map()
for (const t of registry.tilesets) byName.set(t.name, t)
registry.tilesets = [...byName.values()]

registry.maps = registry.maps || {}
delete registry.maps['outside-stub']
registry.maps['company-25'] = {
  ...(registry.maps['company-25'] || {
    id: 'company-25',
    json: '/assets/maps/company-25.json',
    label: 'Office (≤25)',
    headcountMax: 25,
  }),
  kind: 'office',
}
registry.maps['world-map'] = {
  id: 'world-map',
  json: '/assets/maps/world-map.json',
  label: 'World map (WA Village HQ)',
  kind: 'world',
}
fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2) + '\n')
console.log(`Updated ${registryPath}`)

// Emit TS snippet for mapRegistry TILESET_ASSETS village entries.
const snippetPath = path.join(outTilesDir, '_tileset-assets.generated.json')
fs.writeFileSync(snippetPath, JSON.stringify(registryTilesets, null, 2) + '\n')
console.log(`Wrote ${snippetPath} (${registryTilesets.length} entries)`)
console.log('Done. Next: sync src/game/mapRegistry.ts TILESET_ASSETS with generated list.')
