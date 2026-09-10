import type { AgentPersona } from '../catalog/types'

export interface NameplateView {
  id: string
  name: string
  status: string
  lifecycle: string
  screenX: number
  screenY: number
  visible: boolean
}

export interface OfficeGameCallbacks {
  onSelect: (agent: AgentPersona | null) => void
  onNameplates: (plates: NameplateView[]) => void
}

export interface OfficeGameHandle {
  destroy: () => void
  reloadAgents: (agents: AgentPersona[]) => void
}
