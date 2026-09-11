#!/usr/bin/env node
/**
 * Inline shared tilesets/*.tsj into map JSON for Phaser (no external `source`).
 *
 * - If a tileset has `source`, load that .tsj and embed.
 * - If already embedded but a matching .tsj exists, refresh tile properties from .tsj
 *   (keeps collides as single source of truth).
 *
 * Maps written: company-25, outside-stub.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const mapsDir = path.join(__dirname, '..', 'public', 'assets', 'maps')
const tilesetsDir = path.join(mapsDir, 'tilesets')

const MAP_FILES = ['company-25.json', 'outside-stub.json']

function loadTsj(sourceRel, mapFile) {
  // source like "tilesets/foo.tsj" relative to map dir
  const abs = path.resolve(path.dirname(path.join(mapsDir, mapFile)), sourceRel)
  if (!fs.existsSync(abs)) {
    throw new Error(`missing tileset ${sourceRel} (resolved ${abs})`)
  }
  return JSON.parse(fs.readFileSync(abs, 'utf8'))
}

function tsjPathForName(name) {
  return path.join(tilesetsDir, `${name}.tsj`)
}

function embedFromTsj(tsj, firstgid) {
  const image =
    tsj.image && !String(tsj.image).startsWith('tilesets/')
      ? `tilesets/${path.basename(tsj.image)}`
      : tsj.image
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

function packMap(fileName) {
  const p = path.join(mapsDir, fileName)
  if (!fs.existsSync(p)) {
    console.warn(`skip missing ${fileName}`)
    return
  }
  const map = JSON.parse(fs.readFileSync(p, 'utf8'))
  const next = []
  for (const ts of map.tilesets || []) {
    if (ts.source) {
      const tsj = loadTsj(ts.source, fileName)
      next.push(embedFromTsj(tsj, ts.firstgid))
      continue
    }
    const tsjFile = tsjPathForName(ts.name)
    if (fs.existsSync(tsjFile)) {
      const tsj = JSON.parse(fs.readFileSync(tsjFile, 'utf8'))
      next.push(embedFromTsj(tsj, ts.firstgid))
      continue
    }
    next.push(ts)
  }
  map.tilesets = next
  fs.writeFileSync(p, JSON.stringify(map))
  console.log(`packed ${fileName} (${next.length} tilesets, embedded)`)
}

for (const f of MAP_FILES) packMap(f)
console.log('done')
