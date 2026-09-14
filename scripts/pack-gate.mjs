#!/usr/bin/env node
/**
 * npm pack gate for @huyuan-ai/pixel-office.
 * Hard fail if tarball lacks dist/index.html, contains art/, maps/reference,
 * or any village path outside the company-25 allowlist.
 *
 *   node scripts/pack-gate.mjs
 */
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')

const VILLAGE_ALLOW = new Set([
  'fountain-sculptures.png',
  'decor-rugs-1.png',
])

function fail(msg) {
  console.error(`FAIL pack-gate: ${msg}`)
  process.exit(1)
}

const raw = execFileSync('npm', ['pack', '--dry-run', '--json'], {
  cwd: root,
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
})

let parsed
try {
  parsed = JSON.parse(raw)
} catch {
  fail(`npm pack --json parse failed:\n${raw.slice(0, 500)}`)
}

const entry = Array.isArray(parsed) ? parsed[0] : parsed
const files = entry?.files
if (!Array.isArray(files) || !files.length) {
  fail('npm pack --dry-run returned no files list')
}

const paths = files.map((f) => String(f.path || f).replace(/\\/g, '/'))
const size = typeof entry.size === 'number' ? entry.size : null

let hasIndex = false
for (const p of paths) {
  if (p === 'dist/index.html' || p.endsWith('/dist/index.html')) hasIndex = true
  if (p === 'art' || p.startsWith('art/') || p.includes('/art/')) {
    fail(`art/ must not be packed: ${p}`)
  }
  if (p.includes('maps/reference') || p.includes('assets/maps/reference')) {
    fail(`maps/reference must not be packed: ${p}`)
  }
  if (p.includes('village')) {
    const base = path.posix.basename(p)
    if (!VILLAGE_ALLOW.has(base)) {
      fail(`village path not allowlisted: ${p}`)
    }
  }
}

if (!hasIndex) fail('missing dist/index.html in pack list')

const mb = size != null ? (size / (1024 * 1024)).toFixed(2) : '?'
console.log(`pack-gate OK — ${paths.length} files, tarball ≈ ${mb} MiB`)
if (size != null && size > 40 * 1024 * 1024) {
  console.warn(
    `WARN pack-gate: tarball ${mb} MiB is large (soft target ≪ 71 MiB full dist)`,
  )
}
