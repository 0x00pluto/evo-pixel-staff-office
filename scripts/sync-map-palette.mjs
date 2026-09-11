#!/usr/bin/env node
/**
 * Sync WorkAdventure maps/assets tileset PNGs into public/assets/maps/tilesets/.
 * Does NOT touch company-25.json / world-map.json / registry.json.
 *
 * Usage:
 *   node scripts/sync-map-palette.mjs
 *   EVO_WA_MAPS_ASSETS=/path/to/workadventure/maps/assets node scripts/sync-map-palette.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const destRoot = path.join(root, 'public', 'assets', 'maps', 'tilesets')

const defaultWa =
  process.env.EVO_WA_MAPS_ASSETS ||
  path.resolve(root, '../../参考项目/workadventure/maps/assets')

const srcRoot = path.resolve(defaultWa)

if (!fs.existsSync(srcRoot)) {
  console.error(`FAIL: WA maps/assets not found: ${srcRoot}`)
  console.error('Set EVO_WA_MAPS_ASSETS to the absolute path of workadventure/maps/assets')
  process.exit(1)
}

fs.mkdirSync(path.join(destRoot, 'skins'), { recursive: true })

const ROOT_PNGS = [
  'tileset1.png',
  'tileset1-repositioning.png',
  'tileset5_export.png',
  'tileset6_export.png',
  'Special_Zones.png',
]

let copied = 0
for (const name of ROOT_PNGS) {
  const from = path.join(srcRoot, name)
  const to = path.join(destRoot, name)
  if (!fs.existsSync(from)) {
    console.warn(`skip missing: ${from}`)
    continue
  }
  fs.copyFileSync(from, to)
  copied++
  console.log(`copied ${name}`)
}

const skinsDir = path.join(srcRoot, 'skins')
if (fs.existsSync(skinsDir)) {
  for (const name of fs.readdirSync(skinsDir)) {
    if (!name.endsWith('.png')) continue
    fs.copyFileSync(path.join(skinsDir, name), path.join(destRoot, 'skins', name))
    copied++
    console.log(`copied skins/${name}`)
  }
}

console.log(`sync-map-palette OK — ${copied} files → ${destRoot}`)
console.log('Did NOT modify company-25.json / world-map.json / registry.json.')
