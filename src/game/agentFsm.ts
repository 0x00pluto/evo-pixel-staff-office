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

/** Initial at-desk state: working 20–60s. */
export function initialWorkingMode(): { mode: 'working'; durationMs: number } {
  return { mode: 'working', durationMs: 20_000 + Math.random() * 40_000 }
}

/**
 * Work-default FSM (R0): ~85% stay working (20–60s), ~15% short wander (6–12s).
 * Wander always returns to working. Idle is not emitted (at-desk idle anim only).
 */
export function nextMode(from: AgentMode): { mode: AgentMode; durationMs: number } {
  if (from === 'wander') {
    return { mode: 'working', durationMs: 20_000 + Math.random() * 40_000 }
  }
  // From working (or legacy idle treated as at-desk): mostly renew working
  if (Math.random() < 0.15) {
    return { mode: 'wander', durationMs: 6_000 + Math.random() * 6_000 }
  }
  return { mode: 'working', durationMs: 20_000 + Math.random() * 40_000 }
}

/**
 * Face computer from spawn. dir: 0 down / 1 left / 2 right / 3 up.
 * Dominant axis wins; ties prefer vertical.
 */
export function faceToward(
  from: { x: number; y: number },
  to: { x: number; y: number },
): 0 | 1 | 2 | 3 {
  const dx = to.x - from.x
  const dy = to.y - from.y
  if (Math.abs(dx) > Math.abs(dy)) {
    return dx < 0 ? 1 : 2
  }
  return dy < 0 ? 3 : 0
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
