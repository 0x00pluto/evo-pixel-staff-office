#!/usr/bin/env node
/**
 * Validate Tiled office maps (company-a / outside-stub).
 * Does NOT write or overwrite any PNG / JSON map files.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const mapsDir = path.join(root, 'public', 'assets', 'maps')
const registryPath = path.join(mapsDir, 'registry.json')

const REQUIRED_LAYERS = ['floor', 'walls', 'furniture', 'collisions', 'start', 'exit']
const PNG_GUARD = [
  path.join(mapsDir, 'tilesets', 'tileset1.png'),
  path.join(mapsDir, 'tilesets', 'tileset5_export.png'),
  path.join(mapsDir, 'tilesets', 'Special_Zones.png'),
  path.join(root, 'public', 'assets', 'characters.png'),
]

function fail(msg) {
  console.error(`FAIL: ${msg}`)
  process.exitCode = 1
}

function loadJson(p) {
  if (!fs.existsSync(p)) {
    fail(`missing ${p}`)
    return null
  }
  return JSON.parse(fs.readFileSync(p, 'utf8'))
}

function layerByName(map, name) {
  return (map.layers || []).find((l) => l.name === name)
}

function nonzeroCells(layer) {
  if (!layer?.data) return 0
  return layer.data.filter((v) => v > 0).length
}

function walkableAtDoor(map) {
  const exit = layerByName(map, 'exit')
  const coll = layerByName(map, 'collisions')
  if (!exit?.data || !coll?.data) return false
  const w = map.width
  for (let i = 0; i < exit.data.length; i++) {
    if (exit.data[i] > 0 && coll.data[i] > 0) {
      // exit tile itself may sit on former wall; adjacent north/south should be walkable for approach
      const x = i % w
      const y = Math.floor(i / w)
      const neighbors = [
        [x, y - 1],
        [x, y + 1],
        [x - 1, y],
        [x + 1, y],
      ]
      for (const [nx, ny] of neighbors) {
        if (nx < 0 || ny < 0 || nx >= w || ny >= map.height) continue
        if (coll.data[ny * w + nx] === 0) return true
      }
    }
  }
  // Also accept: exit cells with no collision on the exit cell itself
  for (let i = 0; i < exit.data.length; i++) {
    if (exit.data[i] > 0 && coll.data[i] === 0) return true
  }
  return false
}

function prop(layer, name) {
  const props = layer?.properties
  if (!Array.isArray(props)) return undefined
  return props.find((p) => p.name === name)?.value
}

const mtimesBefore = new Map()
for (const p of PNG_GUARD) {
  if (fs.existsSync(p)) mtimesBefore.set(p, fs.statSync(p).mtimeMs)
}

const registry = loadJson(registryPath)
if (!registry?.maps) {
  fail('registry.json missing maps')
} else {
  const ids = Object.keys(registry.maps)
  if (!ids.includes('company-a') || !ids.includes('outside-stub')) {
    fail('registry must register company-a and outside-stub')
  }
}

for (const [id, entry] of Object.entries(registry?.maps || {})) {
  const rel = String(entry.json || '').replace(/^\/assets\/maps\//, '')
  const mapPath = path.join(mapsDir, rel)
  const map = loadJson(mapPath)
  if (!map) continue

  console.log(`Checking ${id} (${map.width}x${map.height})…`)

  if (map.orientation !== 'orthogonal' || map.tilewidth !== 32 || map.tileheight !== 32) {
    fail(`${id}: must be orthogonal 32×32`)
  }

  for (const name of REQUIRED_LAYERS) {
    if (!layerByName(map, name)) fail(`${id}: missing layer ${name}`)
  }

  if (nonzeroCells(layerByName(map, 'start')) < 1) fail(`${id}: start layer empty`)
  if (nonzeroCells(layerByName(map, 'collisions')) < 1) fail(`${id}: collisions empty`)
  if (nonzeroCells(layerByName(map, 'exit')) < 1) fail(`${id}: exit empty`)

  const exit = layerByName(map, 'exit')
  const exitMap = prop(exit, 'exitMap')
  const entryName = prop(exit, 'entryName')
  if (!exitMap) fail(`${id}: exit missing exitMap`)
  else if (!registry.maps[exitMap]) fail(`${id}: exitMap «${exitMap}» not in registry`)
  if (!entryName) fail(`${id}: exit missing entryName`)

  if (!walkableAtDoor(map)) fail(`${id}: door/exit appears sealed (no walkable neighbor)`)

  const objects = layerByName(map, 'objects')?.objects || []
  const spawns = objects.filter((o) => String(o.name || '').startsWith('spawn_'))
  const computers = objects.filter((o) => String(o.name || '').startsWith('computer_'))
  if (id === 'company-a') {
    if (spawns.length < 21) fail(`${id}: need ≥21 spawn_* (got ${spawns.length})`)
    if (computers.length < 21) fail(`${id}: need ≥21 computer_* (got ${computers.length})`)
  } else {
    if (spawns.length < 1) fail(`${id}: need ≥1 spawn_*`)
  }

  // named entry layers referenced by the other map
  const namedEntries = (map.layers || []).filter(
    (l) => l.type === 'tilelayer' && prop(l, 'startLayer') === true,
  )
  console.log(
    `  ok layers; spawns=${spawns.length} computers=${computers.length} namedEntries=${namedEntries.map((l) => l.name).join(',') || '(none)'} exit→${exitMap}#${entryName}`,
  )
}

// Prove we did not touch PNGs
for (const [p, before] of mtimesBefore) {
  const after = fs.statSync(p).mtimeMs
  if (after !== before) fail(`PNG was modified (forbidden): ${p}`)
}

if (process.exitCode) {
  console.error('gen:assets validation FAILED')
  process.exit(1)
}

console.log('gen:assets validation OK — did not write any PNG or map JSON.')
