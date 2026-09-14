import type { AgentPersona } from '../catalog/types'
import type { PresenceRecord, PresenceState } from '../presence/types'

export interface NameplateView {
  id: string
  name: string
  /** Catalog-derived status (owns / blurb); used when no live summary. */
  status: string
  lifecycle: string
  /** Effective presence after TTL (idle if never reported). */
  presence: PresenceState
  /** Second line: live summary if non-empty, else catalog status. */
  line2: string
  screenX: number
  screenY: number
  visible: boolean
}

export interface OfficeGameCallbacks {
  onSelect: (agent: AgentPersona | null) => void
  onNameplates: (plates: NameplateView[]) => void
  /** Page-level asset failure (missing PNG/JSON); optional for callers that only need catalog errors. */
  onAssetsError?: (message: string) => void
}

export interface OfficeGameHandle {
  destroy: () => void
  reloadAgents: (agents: AgentPersona[]) => void
  setFootDebug: (on: boolean) => void
  /** Apply live presence snapshot (does not mutate AgentPersona). */
  applyPresence: (records: PresenceRecord[]) => void
}
