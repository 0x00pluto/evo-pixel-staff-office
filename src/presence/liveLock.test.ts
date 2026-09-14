import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  BUBBLE_FADE_MS,
  bubbleOpacity,
  bubbleStillVisible,
  isLiveLocked,
  nextPresenceBubbles,
} from './liveLock'

describe('isLiveLocked', () => {
  it('matches CLI semantics', () => {
    expect(isLiveLocked('working')).toBe(true)
    expect(isLiveLocked('blocked')).toBe(true)
    expect(isLiveLocked('idle')).toBe(false)
  })
})

describe('nextPresenceBubbles', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('holds 3–5s randomly then keeps through fade window', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5) // mid → 4s hold
    const t0 = 1_000
    let bubbles = nextPresenceBubbles([], [{ id: 'a', text: 'hello' }], t0)
    expect(bubbles).toHaveLength(1)
    expect(bubbles[0].until).toBe(5_000) // 1000 + 4000

    // Still holding
    expect(bubbleStillVisible(bubbles[0], 4_999)).toBe(true)
    expect(bubbleOpacity(bubbles[0], 4_999)).toBe(1)

    // Mid fade
    const midFade = 5_000 + BUBBLE_FADE_MS / 2
    expect(bubbleStillVisible(bubbles[0], midFade)).toBe(true)
    expect(bubbleOpacity(bubbles[0], midFade)).toBeCloseTo(0.5)

    // After fade
    bubbles = nextPresenceBubbles(bubbles, [], 5_000 + BUBBLE_FADE_MS)
    expect(bubbles).toHaveLength(0)
  })

  it('accepts explicit ttlMs for tests', () => {
    const t0 = 1_000
    const bubbles = nextPresenceBubbles(
      [],
      [{ id: 'a', text: 'hello' }],
      t0,
      { ttlMs: 3_000 },
    )
    expect(bubbles[0].until).toBe(4_000)
  })

  it('drops newcomers when already at max 3', () => {
    const t0 = 1_000
    let bubbles = nextPresenceBubbles(
      [],
      [
        { id: 'a', text: '1' },
        { id: 'b', text: '2' },
        { id: 'c', text: '3' },
      ],
      t0,
      { ttlMs: 3_000 },
    )
    expect(bubbles.map((b) => b.id)).toEqual(['a', 'b', 'c'])
    bubbles = nextPresenceBubbles(bubbles, [{ id: 'd', text: '4' }], t0 + 100, {
      ttlMs: 3_000,
    })
    expect(bubbles.map((b) => b.id)).toEqual(['a', 'b', 'c'])
  })

  it('replaces same id without counting as newcomer overflow', () => {
    const t0 = 1_000
    let bubbles = nextPresenceBubbles(
      [],
      [
        { id: 'a', text: '1' },
        { id: 'b', text: '2' },
        { id: 'c', text: '3' },
      ],
      t0,
      { ttlMs: 3_000 },
    )
    bubbles = nextPresenceBubbles(bubbles, [{ id: 'a', text: '1b' }], t0 + 50, {
      ttlMs: 3_000,
    })
    expect(bubbles.find((b) => b.id === 'a')?.text).toBe('1b')
    expect(bubbles).toHaveLength(3)
  })
})
