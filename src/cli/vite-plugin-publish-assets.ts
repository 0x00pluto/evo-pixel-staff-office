/**
 * After Vite copies public/ → dist/, strip bulky assets that must not ship in npm:
 * - maps/reference/** (author reference packs)
 * - tilesets/village/** except company-25 allowlist PNGs
 */
import fs from 'node:fs'
import path from 'node:path'
import type { Plugin } from 'vite'

/** Village PNGs still painted on company-25; keep these in dist. */
export const VILLAGE_DIST_ALLOWLIST = new Set([
  'fountain-sculptures.png',
  'decor-rugs-1.png',
])

function rmRecursive(target: string) {
  if (!fs.existsSync(target)) return
  fs.rmSync(target, { recursive: true, force: true })
}

function stripVillageExceptAllowlist(villageDir: string) {
  if (!fs.existsSync(villageDir)) return
  const walk = (dir: string) => {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name)
      const st = fs.statSync(full)
      if (st.isDirectory()) {
        walk(full)
        // Remove empty dirs after pruning
        if (fs.readdirSync(full).length === 0) rmRecursive(full)
        continue
      }
      if (!VILLAGE_DIST_ALLOWLIST.has(name)) {
        fs.unlinkSync(full)
      }
    }
  }
  walk(villageDir)
  // If allowlist files were nested under giving-tuesday etc., keep only top-level allowlist
  for (const name of fs.readdirSync(villageDir)) {
    const full = path.join(villageDir, name)
    if (fs.statSync(full).isDirectory()) rmRecursive(full)
  }
}

export function publishAssetsPlugin(): Plugin {
  return {
    name: 'pixel-office-publish-assets',
    apply: 'build',
    closeBundle() {
      const outDir = path.resolve(process.cwd(), 'dist')
      const mapsDir = path.join(outDir, 'assets', 'maps')
      rmRecursive(path.join(mapsDir, 'reference'))
      stripVillageExceptAllowlist(path.join(mapsDir, 'tilesets', 'village'))
    },
  }
}
