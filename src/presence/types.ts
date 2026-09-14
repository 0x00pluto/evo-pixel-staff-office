/** Live presence (PRD-00007) — parallel to catalog, not part of AgentPersona. */

export type PresenceState = 'working' | 'blocked' | 'idle'

export interface PresenceRecord {
  id: string
  state: PresenceState
  summary: string
  /** Server receive time (ms). 0 = never reported (implicit idle). */
  updatedAt: number
}

export interface PresenceSnapshot {
  agents: PresenceRecord[]
}
