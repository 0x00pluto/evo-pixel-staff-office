import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { SKIN_COUNT } from '../catalog/skinCount.mjs'

/** POST /api/catalog body hard limit (2 MiB). */
export const CATALOG_MAX_BYTES = 2 * 1024 * 1024

/** Empty-state sourcePath marker (no userdir / seed). */
export const RUNTIME_EMPTY_SOURCE = 'runtime:empty'

function hashString(s) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function shortName(title, dirname) {
  if (!title) return dirname
  const parts = title.split(/\s*[—–-]\s*/)
  return (parts[0] || dirname).trim() || dirname
}

function deriveStatus(ws) {
  if (ws.lifecycle === 'experiment') return '实验中'
  if (Array.isArray(ws.owns) && ws.owns[0]) {
    const s = String(ws.owns[0])
    return s.length > 28 ? `${s.slice(0, 28)}…` : s
  }
  if (ws.blurb) {
    const s = String(ws.blurb).replace(/\s+/g, ' ').trim()
    return s.length > 28 ? `${s.slice(0, 28)}…` : s
  }
  return '待命'
}

export function workspaceToPersona(ws) {
  const id = ws.dirname
  return {
    id,
    name: shortName(ws.title || '', id),
    title: ws.title || id,
    status: deriveStatus(ws),
    blurb: ws.blurb || '',
    lifecycle: ws.lifecycle || 'active',
    owns: Array.isArray(ws.owns) ? ws.owns.map(String) : [],
    not: ws.not || '',
    siblings: Array.isArray(ws.siblings)
      ? ws.siblings.map((s) => ({
          project: s.project || '',
          relation: s.relation || '',
          capability: s.capability || '',
          reference: s.reference || '',
        }))
      : [],
    skin: hashString(id) % SKIN_COUNT,
    tint: hashString(`${id}:tint`) % 360,
  }
}

export function mapCatalogJson(raw, sourcePath) {
  const workspaces = Array.isArray(raw.workspaces) ? raw.workspaces : []
  return {
    sourcePath,
    wiki_index_version: raw.wiki_index_version,
    generated_at: raw.generated_at,
    agents: workspaces.map(workspaceToPersona),
  }
}

/**
 * Resolve optional seed path. Missing → null (empty / userdir path).
 * Does not throw when nothing is found.
 *
 * @param {{ cliPath?: string | null, envPath?: string | null, cwd: string }} opts
 * @returns {string | null}
 */
export function resolveCatalogPath({ cliPath, envPath, cwd }) {
  const candidates = []
  if (cliPath) candidates.push(path.resolve(cwd, cliPath))
  if (envPath) candidates.push(path.resolve(cwd, envPath))
  candidates.push(path.join(cwd, 'CATALOG.json'))
  candidates.push(path.join(cwd, '..', 'AgentWikiIndex', 'CATALOG.json'))

  for (const p of candidates) {
    if (p && fs.existsSync(p) && fs.statSync(p).isFile()) return p
  }
  return null
}

/**
 * Resolve seed for RuntimeCatalog boot.
 * Explicit `--catalog` / `EVO_AGENT_CATALOG`: fail-fast if missing (caller must throw on boot).
 * Probe-only paths: soft miss → null.
 *
 * @param {{ cliPath?: string | null, envPath?: string | null, cwd: string }} opts
 * @returns {{ seedPath: string | null, explicitSeed: boolean, missingExplicit?: string }}
 */
export function resolveSeedForBoot({ cliPath, envPath, cwd }) {
  const explicit = cliPath || envPath
  if (explicit) {
    const resolved = path.resolve(cwd, explicit)
    if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
      return {
        seedPath: null,
        explicitSeed: true,
        missingExplicit: resolved,
      }
    }
    return { seedPath: resolved, explicitSeed: true }
  }
  return {
    seedPath: resolveCatalogPath({
      cliPath: null,
      envPath: null,
      cwd,
    }),
    explicitSeed: false,
  }
}

/**
 * User-directory catalog path.
 * `PIXEL_OFFICE_HOME` overrides the parent of `catalog.json`.
 *
 * @param {{ home?: string, envHome?: string | null }} [opts]
 * @returns {string}
 */
export function userCatalogPath(opts = {}) {
  const envHome =
    opts.envHome !== undefined
      ? opts.envHome
      : process.env.PIXEL_OFFICE_HOME
  const base =
    envHome && String(envHome).trim()
      ? path.resolve(String(envHome).trim())
      : path.join(opts.home ?? os.homedir(), '.pixel-office')
  return path.join(base, 'catalog.json')
}

/**
 * Validate raw CATALOG.json shape. Empty workspaces[] is allowed.
 *
 * @param {unknown} raw
 * @returns {{ ok: true, raw: Record<string, unknown> } | { ok: false, error: string }}
 */
export function parseCatalogBody(raw) {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'body must be a JSON object' }
  }
  if (!Array.isArray(/** @type {Record<string, unknown>} */ (raw).workspaces)) {
    return { ok: false, error: 'missing workspaces array' }
  }
  return { ok: true, raw: /** @type {Record<string, unknown>} */ (raw) }
}

/**
 * @param {string} [sourcePath]
 */
export function emptyCatalogPayload(sourcePath = RUNTIME_EMPTY_SOURCE) {
  return {
    sourcePath,
    agents: [],
  }
}

/**
 * Read + validate a catalog file on disk.
 * @param {string} filePath
 * @returns {Record<string, unknown>}
 */
function readRawCatalogFile(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`花名册不存在: ${filePath}`)
  }
  const text = fs.readFileSync(filePath, 'utf8')
  let raw
  try {
    raw = JSON.parse(text)
  } catch {
    throw new Error(`花名册不是合法 JSON: ${filePath}`)
  }
  const parsed = parseCatalogBody(raw)
  if (!parsed.ok) {
    throw new Error(`花名册缺少 workspaces 数组: ${filePath}`)
  }
  return parsed.raw
}

/**
 * Atomic write of raw catalog JSON to userdir.
 * @param {string} filePath
 * @param {Record<string, unknown>} raw
 */
function writeRawCatalogAtomic(filePath, raw) {
  const dir = path.dirname(filePath)
  fs.mkdirSync(dir, { recursive: true })
  const tmp = path.join(
    dir,
    `.catalog.${process.pid}.${Date.now()}.tmp`,
  )
  const text = `${JSON.stringify(raw, null, 2)}\n`
  fs.writeFileSync(tmp, text, 'utf8')
  fs.renameSync(tmp, filePath)
}

export class JsonFileSource {
  constructor(filePath) {
    this.filePath = filePath
  }

  async load() {
    const raw = readRawCatalogFile(this.filePath)
    return mapCatalogJson(raw, this.filePath)
  }
}

/**
 * In-memory catalog with user-directory persistence (PRD-00008 R0).
 * Boot order: valid userdir → optional seed (memory only) → empty.
 */
export class RuntimeCatalog {
  /**
   * @param {{
   *   userPath?: string,
   *   seedPath?: string | null,
   *   explicitSeed?: boolean,
   *   log?: (msg: string) => void,
   * }} [opts]
   */
  constructor(opts = {}) {
    this.userPath = opts.userPath ?? userCatalogPath()
    this.seedPath = opts.seedPath ?? null
    /** When true, invalid explicit seed fails boot (fail-fast). */
    this.explicitSeed = Boolean(opts.explicitSeed)
    this.log = typeof opts.log === 'function' ? opts.log : () => {}
    /** @type {ReturnType<typeof mapCatalogJson> | null} */
    this.cached = null
    /** @type {Record<string, unknown> | null} last persisted raw (userdir) */
    this.raw = null
    /** @type {'userdir' | 'seed' | 'empty'} */
    this.origin = 'empty'
  }

  /**
   * Load userdir if valid; else seed; else empty. Never throws for missing files.
   * Explicit seed that exists but is invalid → throws when explicitSeed.
   */
  boot() {
    // 1) userdir
    if (fs.existsSync(this.userPath) && fs.statSync(this.userPath).isFile()) {
      try {
        const raw = readRawCatalogFile(this.userPath)
        this.raw = raw
        this.cached = mapCatalogJson(raw, this.userPath)
        this.origin = 'userdir'
        return this.cached
      } catch (err) {
        this.log(
          `[catalog] userdir invalid, ignoring: ${err instanceof Error ? err.message : err}`,
        )
      }
    }

    // 2) optional seed
    if (this.seedPath) {
      const exists =
        fs.existsSync(this.seedPath) && fs.statSync(this.seedPath).isFile()
      if (exists) {
        try {
          const raw = readRawCatalogFile(this.seedPath)
          this.raw = null // seed is not userdir authority
          this.cached = mapCatalogJson(raw, this.seedPath)
          this.origin = 'seed'
          return this.cached
        } catch (err) {
          if (this.explicitSeed) {
            throw err
          }
          this.log(
            `[catalog] seed invalid, empty: ${err instanceof Error ? err.message : err}`,
          )
        }
      } else if (this.explicitSeed) {
        throw new Error(`花名册不存在: ${this.seedPath}`)
      }
    }

    // 3) empty
    this.raw = null
    this.cached = emptyCatalogPayload()
    this.origin = 'empty'
    return this.cached
  }

  /**
   * @param {{ refresh?: boolean }} [opts]
   */
  async load(opts = {}) {
    if (opts.refresh) {
      if (fs.existsSync(this.userPath) && fs.statSync(this.userPath).isFile()) {
        try {
          const raw = readRawCatalogFile(this.userPath)
          this.raw = raw
          this.cached = mapCatalogJson(raw, this.userPath)
          this.origin = 'userdir'
          return this.cached
        } catch (err) {
          this.log(
            `[catalog] refresh userdir failed: ${err instanceof Error ? err.message : err}`,
          )
        }
      }
      // Fall through: keep current cache if any, else boot
      if (this.cached) return this.cached
      return this.boot()
    }
    if (!this.cached) return this.boot()
    return this.cached
  }

  /**
   * Whole-table replace + persist to userdir. Validates first; on failure does not mutate.
   *
   * @param {unknown} body
   * @returns {{ ok: true, payload: ReturnType<typeof mapCatalogJson> } | { ok: false, error: string }}
   */
  replace(body) {
    const parsed = parseCatalogBody(body)
    if (!parsed.ok) return { ok: false, error: parsed.error }

    try {
      writeRawCatalogAtomic(this.userPath, parsed.raw)
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      }
    }

    this.raw = parsed.raw
    this.cached = mapCatalogJson(parsed.raw, this.userPath)
    this.origin = 'userdir'
    return { ok: true, payload: this.cached }
  }
}

/** @param {{ kind: 'json', path: string }} opts */
export function createCatalogSource(opts) {
  if (opts.kind === 'json') return new JsonFileSource(opts.path)
  throw new Error(`不支持的数据源: ${opts.kind}`)
}
