#!/usr/bin/env node
/**
 * Inline shared tilesets/*.tsj into map JSON for Phaser (no external `source`).
 *
 * - If a tileset has `source`, load that .tsj and embed.
 * - If already embedded but a matching .tsj exists, refresh tile properties from .tsj
 *   (keeps collides as single source of truth).
 *
 * Maps written: company-25, world-map.
 * Office: public/assets/maps/tilesets/*.tsj
 * Village: public/assets/maps/tilesets/village/ (and subdirs) *.tsj
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const mapsDir = path.join(__dirname, '..', 'public', 'assets', 'maps')
const tilesetsDir = path.join(mapsDir, 'tilesets')
const villageDir = path.join(tilesetsDir, 'village')

const MAP_FILES = ['company-25.json', 'world-map.json']

function loadTsj(sourceRel, mapFile) {
  // source like "tilesets/foo.tsj" relative to map dir
  const abs = path.resolve(path.dirname(path.join(mapsDir, mapFile)), sourceRel)
  if (!fs.existsSync(abs)) {
    throw new Error(`missing tileset ${sourceRel} (resolved ${abs})`)
  }
  return JSON.parse(fs.readFileSync(abs, 'utf8'))
}

/** Resolve .tsj for an embedded tileset entry. */
function resolveTsjForTileset(ts) {
  // Prefer path sibling to the PNG already referenced by the map.
  if (ts.image) {
    const imgRel = String(ts.image).replace(/^\//, '')
    // image is relative to maps/ (e.g. tilesets/village/GroundWorld.png)
    const pngAbs = path.resolve(mapsDir, imgRel)
    const tsjAbs = pngAbs.replace(/\.png$/i, '.tsj')
    if (fs.existsSync(tsjAbs)) return tsjAbs
  }

  // Office flat: tilesets/<name>.tsj
  const office = path.join(tilesetsDir, `${ts.name}.tsj`)
  if (fs.existsSync(office)) return office

  // Village flat / nested by name
  const villageFlat = path.join(villageDir, `${ts.name}.tsj`)
  if (fs.existsSync(villageFlat)) return villageFlat

  return null
}

/**
 * Embed tsj into map tileset.
 * @param imageRelUnderMaps  e.g. "tilesets/village/GroundWorld.png" or "tilesets/tileset1.png"
 */
function embedFromTsj(tsj, firstgid, imageRelUnderMaps) {
  let image = imageRelUnderMaps
  if (!image) {
    // Fallback: office convention — image sits next to .tsj under tilesets/
    image =
      tsj.image && !String(tsj.image).startsWith('tilesets/')
        ? `tilesets/${path.basename(tsj.image)}`
        : tsj.image
  }
  const embedded = {
    columns: tsj.columns,
    firstgid,
    image,
    imageheight: tsj.imageheight,
    imagewidth: tsj.imagewidth,
    margin: tsj.margin ?? 0,
    name: tsj.name,
    spacing: tsj.spacing ?? 0,
    tilecount: tsj.tilecount,
    tileheight: tsj.tileheight || 32,
    tilewidth: tsj.tilewidth || 32,
  }
  if (Array.isArray(tsj.tiles) && tsj.tiles.length) {
    embedded.tiles = structuredClone(tsj.tiles)
  }
  return embedded
}

function imageRelFromTsjPath(tsjAbs, tsj) {
  // Keep PNG next to the .tsj (office or village[/subdir]).
  const dir = path.dirname(tsjAbs)
  const pngName = path.basename(tsj.image || `${tsj.name}.png`)
  const pngAbs = path.join(dir, pngName)
  const rel = path.relative(mapsDir, pngAbs).split(path.sep).join('/')
  return rel
}

function packMap(fileName) {
  const p = path.join(mapsDir, fileName)
  if (!fs.existsSync(p)) {
    console.warn(`skip missing ${fileName}`)
    return
  }
  const map = JSON.parse(fs.readFileSync(p, 'utf8'))
  const next = []
  const seenNames = new Set()
  for (const ts of map.tilesets || []) {
    let embedded
    if (ts.source) {
      const tsj = loadTsj(ts.source, fileName)
      const tsjAbs = path.resolve(path.dirname(path.join(mapsDir, fileName)), ts.source)
      embedded = embedFromTsj(tsj, ts.firstgid, imageRelFromTsjPath(tsjAbs, tsj))
    } else {
      const tsjAbs = resolveTsjForTileset(ts)
      if (tsjAbs) {
        const tsj = JSON.parse(fs.readFileSync(tsjAbs, 'utf8'))
        const imageRel = ts.image || imageRelFromTsjPath(tsjAbs, tsj)
        embedded = embedFromTsj(tsj, ts.firstgid, imageRel)
      } else {
        embedded = ts
      }
    }
    if (!embedded.name) {
      throw new Error(`${fileName}: packed tileset missing name (firstgid=${embedded.firstgid})`)
    }
    if (seenNames.has(embedded.name)) {
      console.warn(
        `skip duplicate tileset «${embedded.name}» in ${fileName} (firstgid=${embedded.firstgid}) — keep first only`,
      )
      continue
    }
    seenNames.add(embedded.name)
    if (embedded.source) delete embedded.source
    next.push(embedded)
  }
  map.tilesets = next
  fs.writeFileSync(p, JSON.stringify(map))
  console.log(`packed ${fileName} (${next.length} tilesets, embedded)`)
}

for (const f of MAP_FILES) packMap(f)
console.log('done')
