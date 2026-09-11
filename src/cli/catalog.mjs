import fs from 'node:fs'
import path from 'node:path'
import { SKIN_COUNT } from '../catalog/skinCount.mjs'

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

export function resolveCatalogPath({ cliPath, envPath, cwd }) {
  const candidates = []
  if (cliPath) candidates.push(path.resolve(cwd, cliPath))
  if (envPath) candidates.push(path.resolve(cwd, envPath))
  candidates.push(path.join(cwd, 'CATALOG.json'))
  candidates.push(path.join(cwd, '..', 'AgentWikiIndex', 'CATALOG.json'))

  for (const p of candidates) {
    if (p && fs.existsSync(p) && fs.statSync(p).isFile()) return p
  }

  throw new Error(
    `找不到 CATALOG.json。请用 --catalog <path> 或设置 EVO_AGENT_CATALOG。\n已尝试:\n${candidates
      .map((c) => `  - ${c}`)
      .join('\n')}`,
  )
}

export class JsonFileSource {
  constructor(filePath) {
    this.filePath = filePath
  }

  async load() {
    if (!fs.existsSync(this.filePath)) {
      throw new Error(`花名册不存在: ${this.filePath}`)
    }
    const text = fs.readFileSync(this.filePath, 'utf8')
    let raw
    try {
      raw = JSON.parse(text)
    } catch {
      throw new Error(`花名册不是合法 JSON: ${this.filePath}`)
    }
    if (!raw || typeof raw !== 'object' || !Array.isArray(raw.workspaces)) {
      throw new Error(`花名册缺少 workspaces 数组: ${this.filePath}`)
    }
    return mapCatalogJson(raw, this.filePath)
  }
}

/** @param {{ kind: 'json', path: string }} opts */
export function createCatalogSource(opts) {
  if (opts.kind === 'json') return new JsonFileSource(opts.path)
  throw new Error(`不支持的数据源: ${opts.kind}`)
}
