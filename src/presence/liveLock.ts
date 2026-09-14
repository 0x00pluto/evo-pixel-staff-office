import type { PresenceState } from './types'

/** Live lock: working/blocked stay at desk (mirror of CLI presence-store). */
export function isLiveLocked(state: PresenceState | string | null | undefined): boolean {
  return state === 'working' || state === 'blocked'
}

/** Hold visible 3–5s (random), then fade out over this many ms. */
export const BUBBLE_HOLD_MIN_MS = 3_000
export const BUBBLE_HOLD_MAX_MS = 5_000
export const BUBBLE_FADE_MS = 800

/**
 * Sparse summary toast queue: max concurrent; drop newcomers when full.
 * Pure helper for React overlay (PRD-00007).
 */
export interface PresenceBubble {
  id: string
  text: string
  /** Wall clock ms when the hold ends and fade-out starts. */
  until: number
}

export function randomBubbleHoldMs(): number {
  return (
    BUBBLE_HOLD_MIN_MS +
    Math.random() * (BUBBLE_HOLD_MAX_MS - BUBBLE_HOLD_MIN_MS)
  )
}

/** Keep bubble through hold + fade; remove after fade completes. */
export function bubbleStillVisible(b: PresenceBubble, now: number): boolean {
  return now < b.until + BUBBLE_FADE_MS
}

/**
 * 1 during hold; eases to 0 over BUBBLE_FADE_MS after `until`.
 */
export function bubbleOpacity(b: PresenceBubble, now: number): number {
  if (now <= b.until) return 1
  const t = (now - b.until) / BUBBLE_FADE_MS
  if (t >= 1) return 0
  return 1 - t
}

export function nextPresenceBubbles(
  prev: PresenceBubble[],
  changes: Array<{ id: string; text: string }>,
  now: number,
  opts: { ttlMs?: number; max?: number } = {},
): PresenceBubble[] {
  const max = opts.max ?? 3
  let next = prev.filter((b) => bubbleStillVisible(b, now))
  for (const c of changes) {
    if (!c.text) continue
    // Replace existing bubble for same id if still visible.
    next = next.filter((b) => b.id !== c.id)
    if (next.length >= max) continue // drop newcomer
    const ttlMs = opts.ttlMs ?? randomBubbleHoldMs()
    next.push({ id: c.id, text: c.text, until: now + ttlMs })
  }
  return next
}
