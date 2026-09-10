import type { AgentPersona } from '../catalog/types'

export type AgentMode = 'idle' | 'wander' | 'working'

export interface AgentRuntime {
  persona: AgentPersona
  mode: AgentMode
  modeUntil: number
  targetX: number
  targetY: number
  dir: 0 | 1 | 2 | 3
  frameTick: number
  walkFrame: number
}

export function hashPick<T>(id: string, items: T[]): T {
  let h = 2166136261
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return items[(h >>> 0) % items.length]
}

export function nextMode(): { mode: AgentMode; durationMs: number } {
  const r = Math.random()
  if (r < 0.35) return { mode: 'idle', durationMs: 2000 + Math.random() * 3000 }
  if (r < 0.75) return { mode: 'wander', durationMs: 3000 + Math.random() * 5000 }
  return { mode: 'working', durationMs: 4000 + Math.random() * 4000 }
}

/** Approximate tint from hue degrees */
export function hueTint(hue: number): number {
  const h = ((hue % 360) + 360) % 360
  const s = 0.45
  const l = 0.62
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2
  let r = 0
  let g = 0
  let b = 0
  if (h < 60) [r, g, b] = [c, x, 0]
  else if (h < 120) [r, g, b] = [x, c, 0]
  else if (h < 180) [r, g, b] = [0, c, x]
  else if (h < 240) [r, g, b] = [0, x, c]
  else if (h < 300) [r, g, b] = [x, 0, c]
  else [r, g, b] = [c, 0, x]
  const R = Math.round((r + m) * 255)
  const G = Math.round((g + m) * 255)
  const B = Math.round((b + m) * 255)
  return (R << 16) | (G << 8) | B
}
