import type { AgentPersona } from '../catalog/types'

export type AgentMode = 'idle' | 'wander' | 'working'

/** Brief at-desk micro-motion while working (fake-alive). */
export type FidgetKind = 'none' | 'glance' | 'step'

export type PoiKind = 'lounge' | 'coffee' | 'meeting'

/** Wander trip: walking to POI → dwell → (then mode=working home). */
export type WanderPhase = 'none' | 'to' | 'dwell'

export type WanderTargetKind = PoiKind | 'random'

export interface AgentRuntime {
  persona: AgentPersona
  mode: AgentMode
  modeUntil: number
  targetX: number
  targetY: number
  /** Final walk destination (POI or desk); used for arrival checks. */
  goalX: number
  goalY: number
  /** Remaining grid waypoints (cell centers); empty = arrived at goal. */
  path: Array<{ x: number; y: number }>
  dir: 0 | 1 | 2 | 3
  /** Stable desk facing (spawn → computer); fidget may temporarily change `dir`. */
  faceDir: 0 | 1 | 2 | 3
  /** Next time to start a fidget (ms, Phaser time). */
  fidgetUntil: number
  fidget: FidgetKind
  /** When current fidget ends and we restore faceDir / idle. */
  fidgetEndsAt: number
  wanderPhase: WanderPhase
  /** Destination kind for dwell timing while on a wander trip. */
  poiKind: WanderTargetKind | null
  /**
   * Soft claim of a map POI key (`poi_lounge_0` …) while walking to / dwelling.
   * Cleared on walk-home or cancel. Meeting seats and solo chairs share this.
   */
  poiClaimKey: string | null
  frameTick: number
  walkFrame: number
}

/** Personal errands only — never meeting (group events are scene-scheduled). */
export const SOLO_POI_KINDS: ReadonlyArray<Exclude<PoiKind, 'meeting'>> = [
  'lounge',
  'coffee',
]

export type SoloPoiKind = (typeof SOLO_POI_KINDS)[number]

/** Minimal POI shape for solo pick (OfficeScene supplies full MapPoi). */
export type SoloPoiCandidate = {
  key: string
  kind: PoiKind
  point: { x: number; y: number }
}

/**
 * Desk-clock wander: ~85% pick a free solo POI (lounge/coffee); full kind →
 * try the other; all busy → null (caller falls back to random). Never meeting.
 */
export function pickSoloPoi(
  pois: SoloPoiCandidate[],
  busyKeys: ReadonlySet<string>,
): SoloPoiCandidate | null {
  if (Math.random() >= 0.85) return null

  const freeByKind = (kind: SoloPoiKind) =>
    pois.filter((p) => p.kind === kind && !busyKeys.has(p.key))

  const order: SoloPoiKind[] =
    Math.random() < 0.5 ? ['lounge', 'coffee'] : ['coffee', 'lounge']

  for (const kind of order) {
    const free = freeByKind(kind)
    if (free.length) return free[Math.floor(Math.random() * free.length)]
  }
  return null
}

/** Inclusive random int in [lo, hi]. */
export function randomInt(lo: number, hi: number): number {
  if (hi < lo) return lo
  return lo + Math.floor(Math.random() * (hi - lo + 1))
}

/**
 * Meeting recruitment size: 2 … min(3, freeSeats, freeAgents).
 * Returns 0 when either pool has fewer than 2.
 */
export function meetingSize(freeSeats: number, freeAgents: number): number {
  const cap = Math.min(3, freeSeats, freeAgents)
  if (cap < 2) return 0
  return randomInt(2, cap)
}

/** Scene meeting event cooldown: 40–80s. */
export function meetingCooldownMs(): number {
  return 40_000 + Math.random() * 40_000
}

export function hashPick<T>(id: string, items: T[]): T {
  let h = 2166136261
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return items[(h >>> 0) % items.length]
}

/**
 * Birth as mid-shift: remaining working time ~1–45s so the floor isn't
 * synchronized dead for the first half-minute.
 */
export function initialWorkingMode(): { mode: 'working'; durationMs: number } {
  return { mode: 'working', durationMs: 1_000 + Math.random() * 44_000 }
}

/** First fidget delay after spawn: 2–12s. */
export function scheduleFidgetMs(): number {
  return 2_000 + Math.random() * 10_000
}

/** Gap between fidgets while at desk: 4–14s. */
export function rescheduleFidgetMs(): number {
  return 4_000 + Math.random() * 10_000
}

/** Max time to walk to a POI before aborting home (anti-stuck). */
export function travelTimeoutMs(): number {
  return 25_000 + Math.random() * 15_000
}

/** At-POI dwell by kind (uniform random in range). */
export function dwellMs(kind: WanderTargetKind): number {
  switch (kind) {
    case 'lounge':
      return 3_000 + Math.random() * 5_000
    case 'coffee':
      return 2_000 + Math.random() * 3_000
    case 'meeting':
      return 4_000 + Math.random() * 6_000
    case 'random':
    default:
      return 1_000 + Math.random() * 2_000
  }
}

export function workingDurationMs(): number {
  return 20_000 + Math.random() * 40_000
}

/**
 * Desk clock only: ~85% renew working, ~15% leave for a wander trip.
 * Wander→home is handled by OfficeScene phases (to / dwell), not here.
 */
export function nextDeskMode(): { mode: 'working' | 'wander' } {
  if (Math.random() < 0.15) return { mode: 'wander' }
  return { mode: 'working' }
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

/** Pick a glance direction different from faceDir (left/right preferred). */
export function glanceDir(faceDir: 0 | 1 | 2 | 3): 0 | 1 | 2 | 3 {
  if (faceDir === 1 || faceDir === 2) {
    return Math.random() < 0.5 ? 0 : 3
  }
  return Math.random() < 0.5 ? 1 : 2
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
