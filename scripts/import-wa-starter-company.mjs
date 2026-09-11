#!/usr/bin/env node
/**
 * Rebuild company-25.json from WorkAdventure starter map.json (keep furniture),
 * plus evo exit / office-door / ≥25 spawn·computer pairs. No dynamic desks.
 *
 *   EVO_WA_STARTER=/path/to/map.json node scripts/import-wa-starter-company.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const defaultStarter = path.resolve(
  root,
  '../../参考项目/workadventure/maps/starter/map.json',
)
const starterPath = process.env.EVO_WA_STARTER
  ? path.resolve(process.env.EVO_WA_STARTER)
  : defaultStarter
const outPath = path.join(root, 'public', 'assets', 'maps', 'company-25.json')
const NEED_DESKS = 25

if (!fs.existsSync(starterPath)) {
  console.error(`FAIL: missing WA starter map: ${starterPath}`)
  process.exit(1)
}

const d = JSON.parse(fs.readFileSync(starterPath, 'utf8'))
const W = d.width
const H = d.height

for (const t of d.tilesets || []) {
  t.image = 'tilesets/' + path.basename(t.image)
}

const skip = new Set(['jitsiMeetingRoom', 'jitsiChillzone', 'clockZone'])
d.layers = (d.layers || []).filter((L) => !skip.has(L.name))

const empty = () => Array.from({ length: W * H }, () => 0)
const layer = (name) => d.layers.find((L) => L.name === name)

const walls = layer('walls')
const coll = layer('collisions')
const furn = layer('furniture')
const floor = layer('floor')

const COLLIDE = 443
const START_MARK = 444
const doorXs = [15, 16]

for (const x of doorXs) {
  for (const y of [14, 15, 16]) {
    if (y < H && x < W) {
      walls.data[y * W + x] = 0
      coll.data[y * W + x] = 0
    }
  }
}

const exitData = empty()
const officeDoor = empty()
for (const x of doorXs) {
  exitData[16 * W + x] = COLLIDE
  officeDoor[13 * W + x] = START_MARK
}

const deskAnchors = []
for (let i = 0; i < (furn?.data || []).length; i++) {
  if (furn.data[i] === 325) deskAnchors.push([i % W, Math.floor(i / W)])
}

const objects = []
deskAnchors.forEach(([gx, gy], i) => {
  objects.push({
    height: 0,
    id: 100 + i,
    name: `computer_${i}`,
    point: true,
    rotation: 0,
    type: '',
    visible: true,
    width: 0,
    x: (gx + 1.5) * 32,
    y: (gy + 0.5) * 32,
  })
  objects.push({
    height: 0,
    id: 200 + i,
    name: `spawn_${i}`,
    point: true,
    rotation: 0,
    type: '',
    visible: true,
    width: 0,
    x: (gx + 1.5) * 32,
    y: (gy + 2.5) * 32,
  })
})

const need = NEED_DESKS - deskAnchors.length
if (need > 0) {
  const walkable = []
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x
      if (floor?.data?.[i] && !coll.data[i] && !walls.data[i]) walkable.push([x, y])
    }
  }
  const step = Math.max(1, Math.floor(walkable.length / Math.max(need, 1)))
  const extra = walkable.filter((_, idx) => idx % step === 0).slice(0, need)
  const base = deskAnchors.length
  extra.forEach(([x, y], j) => {
    const i = base + j
    objects.push({
      height: 0,
      id: 100 + i,
      name: `computer_${i}`,
      point: true,
      rotation: 0,
      type: '',
      visible: true,
      width: 0,
      x: x * 32 + 16,
      y: y * 32 + 16,
    })
    objects.push({
      height: 0,
      id: 200 + i,
      name: `spawn_${i}`,
      point: true,
      rotation: 0,
      type: '',
      visible: true,
      width: 0,
      x: x * 32 + 16,
      y: y * 32 + 16,
    })
  })
}

let nextId = Math.max(0, ...d.layers.map((L) => L.id || 0)) + 1
const officeDoorLayer = {
  data: officeDoor,
  height: H,
  id: nextId++,
  name: 'office-door',
  opacity: 1,
  type: 'tilelayer',
  visible: false,
  width: W,
  x: 0,
  y: 0,
  properties: [{ name: 'startLayer', type: 'bool', value: true }],
}
const exitLayer = {
  data: exitData,
  height: H,
  id: nextId++,
  name: 'exit',
  opacity: 1,
  type: 'tilelayer',
  visible: false,
  width: W,
  x: 0,
  y: 0,
  properties: [
    { name: 'exitMap', type: 'string', value: 'world-map' },
    { name: 'entryName', type: 'string', value: 'from-office' },
  ],
}
const objectsLayer = {
  draworder: 'topdown',
  id: nextId++,
  name: 'objects',
  objects,
  opacity: 1,
  type: 'objectgroup',
  visible: true,
  x: 0,
  y: 0,
}

const newLayers = []
for (const L of d.layers) {
  newLayers.push(L)
  if (L.name === 'start') newLayers.push(officeDoorLayer)
  if (L.name === 'furniture') {
    newLayers.push(exitLayer)
    newLayers.push(objectsLayer)
  }
}
d.layers = newLayers
d.nextlayerid = nextId
d.nextobjectid = 400

d.properties = (d.properties || []).filter(
  (p) =>
    p.name !== 'script' &&
    p.name !== 'dynamicDesks' &&
    p.name !== 'evoNote' &&
    p.name !== 'headcountMax' &&
    p.name !== 'mapName',
)
d.properties.push({ name: 'mapName', type: 'string', value: 'company-25' })
d.properties.push({ name: 'headcountMax', type: 'int', value: 25 })
d.properties.push({
  name: 'evoNote',
  type: 'string',
  value:
    'WA starter visuals + exit/office-door/objects (≥25). Static desks; tier ≤25.',
})

fs.writeFileSync(outPath, JSON.stringify(d))

const spawnN = objects.filter((o) => o.name.startsWith('spawn_')).length
console.log(
  `Wrote ${outPath} (${W}x${H}, deskAnchors=${deskAnchors.length}, spawns=${spawnN})`,
)
console.log('Layers:', d.layers.map((L) => L.name).join(', '))

const pack = spawnSync(process.execPath, [path.join(__dirname, 'pack-external-tilesets.mjs')], {
  stdio: 'inherit',
})
if (pack.status) process.exit(pack.status)
