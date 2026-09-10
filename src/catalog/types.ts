/**
 * CatalogSource — v1: JsonFileSource；后期可换 SqliteSource / PostgresSource。
 * 机器权威仍是 AgentWikiIndex 的 CATALOG.json 字段语义。
 */

export interface CatalogSibling {
  project: string
  relation: string
  capability?: string
  reference?: string
}

export interface AgentPersona {
  id: string
  name: string
  title: string
  status: string
  blurb: string
  lifecycle: string
  owns: string[]
  not: string
  siblings: CatalogSibling[]
  /** 0–63 Pipoya character skin index (hash(id) % 64) */
  skin: number
  /** Deprecated for rendering (R0+); kept for payload stability. Was hue offset 0–359. */
  tint: number
}

export interface CatalogPayload {
  sourcePath: string
  wiki_index_version?: string
  generated_at?: string
  agents: AgentPersona[]
}

export interface CatalogSource {
  load(): Promise<CatalogPayload>
}
