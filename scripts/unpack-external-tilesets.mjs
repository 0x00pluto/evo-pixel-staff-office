#!/usr/bin/env node
/**
 * Rewrite map tilesets to external `source` (.tsj) for Tiled editing.
 * Phaser cannot load `source` — run `pnpm pack:tilesets` / `pnpm gen:assets` before preview.
 *
 *   node scripts/unpack-external-tilesets.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const mapsDir = path.join(__dirname, '..', 'public', 'assets', 'maps')
const tilesetsDir = path.join(mapsDir, 'tilesets')
const villageDir = path.join(tilesetsDir, 'village')

const MAP_FILES = ['company-25.json', 'world-map.json']

function findTsjFor(ts) {
  if (ts.image) {
    const pngAbs = path.resolve(mapsDir, String(ts.image).replace(/^\//, ''))
    const tsjAbs = pngAbs.replace(/\.png$/i, '.tsj')
    if (fs.existsSync(tsjAbs)) return tsjAbs
  }
  const office = path.join(tilesetsDir, `${ts.name}.tsj`)
  if (fs.existsSync(office)) return office
  const village = path.join(villageDir, `${ts.name}.tsj`)
  if (fs.existsSync(village)) return village
  // nested village (giving-tuesday etc.): search by name
  if (fs.existsSync(villageDir)) {
    const stack = [villageDir]
    while (stack.length) {
      const dir = stack.pop()
      for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        const abs = path.join(dir, ent.name)
        if (ent.isDirectory()) stack.push(abs)
        else if (ent.name === `${ts.name}.tsj`) return abs
      }
    }
  }
  return null
}

function unpackMap(fileName) {
  const p = path.join(mapsDir, fileName)
  if (!fs.existsSync(p)) {
    console.warn(`skip missing ${fileName}`)
    return
  }
  const map = JSON.parse(fs.readFileSync(p, 'utf8'))
  const next = []
  const seen = new Set()
  for (const ts of map.tilesets || []) {
    const name = ts.name || path.basename(String(ts.source || ''), '.tsj')
    if (!name) {
      console.warn(`${fileName}: skip tileset without name/source firstgid=${ts.firstgid}`)
      continue
    }
    if (seen.has(name)) {
      console.warn(`${fileName}: drop duplicate tileset «${name}» firstgid=${ts.firstgid}`)
      continue
    }
    seen.add(name)

    if (ts.source && !ts.image) {
      // already external
      next.push({ firstgid: ts.firstgid, source: ts.source })
      continue
    }

    const tsjAbs = findTsjFor({ ...ts, name })
    if (!tsjAbs) {
      console.warn(`${fileName}: no .tsj for «${name}» — keep embedded`)
      next.push(ts)
      continue
    }
    const rel = path.relative(mapsDir, tsjAbs).split(path.sep).join('/')
    next.push({ firstgid: ts.firstgid, source: rel })
  }
  map.tilesets = next
  fs.writeFileSync(p, JSON.stringify(map))
  console.log(`unpacked ${fileName} → ${next.length} external tilesets`)
}

for (const f of MAP_FILES) unpackMap(f)
console.log('done — open maps in Tiled; before pnpm dev run: pnpm gen:assets')
