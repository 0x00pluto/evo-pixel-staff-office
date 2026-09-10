import type { AgentPersona, CatalogPayload, CatalogSibling } from './types'

/** Raw workspace row from AgentWikiIndex CATALOG.json */
export interface CatalogWorkspace {
  dirname: string
  title?: string
  blurb?: string
  lifecycle?: string
  owns?: string[]
  not?: string
  siblings?: Array<{
    project?: string
    relation?: string
    capability?: string
    reference?: string
  }>
}

export interface CatalogJson {
  wiki_index_version?: string
  generated_at?: string
  workspaces?: CatalogWorkspace[]
}

function hashString(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

export function shortName(title: string, dirname: string): string {
  if (!title) return dirname
  const parts = title.split(/\s*[—–-]\s*/)
  return (parts[0] || dirname).trim() || dirname
}

export function deriveStatus(ws: CatalogWorkspace): string {
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

export function workspaceToPersona(ws: CatalogWorkspace): AgentPersona {
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
      ? ws.siblings.map(
          (s): CatalogSibling => ({
            project: s.project || '',
            relation: s.relation || '',
            capability: s.capability || '',
            reference: s.reference || '',
          }),
        )
      : [],
    skin: hashString(id) % 64,
    tint: hashString(`${id}:tint`) % 360,
  }
}

/** unmanaged is ignored — only workspaces become agents */
export function mapCatalogJson(raw: CatalogJson, sourcePath: string): CatalogPayload {
  const workspaces = Array.isArray(raw.workspaces) ? raw.workspaces : []
  return {
    sourcePath,
    wiki_index_version: raw.wiki_index_version,
    generated_at: raw.generated_at,
    agents: workspaces.map(workspaceToPersona),
  }
}
