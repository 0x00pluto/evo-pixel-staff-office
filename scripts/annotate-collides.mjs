#!/usr/bin/env node
/**
 * Ensure collides=true on shared tilesets/*.tsj (source of truth), then pack into maps.
 *
 *   pnpm annotate:collides
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const tilesetsDir = path.join(__dirname, '..', 'public', 'assets', 'maps', 'tilesets')

const COLLIDES_LOCAL_IDS = {
  tileset5_export: [
    44, 45, 46, 47, 48, 54, 55, 57, 58, 59, 62, 63, 64, 65, 72, 73, 74, 75,
  ],
  'tileset1-repositioning': [
    3, 4, 29, // desk L/R, monitor
    11, 12, 13, 14, // meeting table 333–336
    22, 23, 24, 25, // meeting table 344–347
  ],
  tileset1: [60], // monitorAbove
  Special_Zones: [0],
}

function ensureCollides(tileset, localIds) {
  if (!tileset.tiles) tileset.tiles = []
  let added = 0
  for (const id of localIds) {
    let tile = tileset.tiles.find((t) => t.id === id)
    if (!tile) {
      tile = { id }
      tileset.tiles.push(tile)
    }
    if (!tile.properties) tile.properties = []
    const prop = tile.properties.find((p) => p.name === 'collides')
    if (prop) {
      if (prop.value !== true) {
        prop.type = 'bool'
        prop.value = true
        added++
      }
    } else {
      tile.properties.push({ name: 'collides', type: 'bool', value: true })
      added++
    }
  }
  tileset.tiles.sort((a, b) => a.id - b.id)
  return added
}

let total = 0
for (const [name, locals] of Object.entries(COLLIDES_LOCAL_IDS)) {
  const p = path.join(tilesetsDir, `${name}.tsj`)
  if (!fs.existsSync(p)) {
    console.warn(`skip missing ${name}.tsj — run: node scripts/export-shared-tilesets.mjs`)
    continue
  }
  const tsj = JSON.parse(fs.readFileSync(p, 'utf8'))
  const n = ensureCollides(tsj, locals)
  fs.writeFileSync(p, JSON.stringify(tsj, null, 2) + '\n')
  console.log(`annotate ${name}.tsj: +${n} collides`)
  total += n
}

const pack = spawnSync(process.execPath, [path.join(__dirname, 'pack-external-tilesets.mjs')], {
  stdio: 'inherit',
})
if (pack.status) process.exit(pack.status)
console.log(`annotate:collides done (tsj updates=${total})`)
