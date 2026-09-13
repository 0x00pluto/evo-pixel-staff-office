import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  dwellMs,
  faceToward,
  glanceDir,
  hashPick,
  hueTint,
  initialWorkingMode,
  meetingCooldownMs,
  meetingSize,
  nextDeskMode,
  parseDwellFacing,
  pickSoloPoi,
  randomInt,
  rescheduleFidgetMs,
  scheduleFidgetMs,
  SOLO_POI_KINDS,
  travelTimeoutMs,
  workingDurationMs,
  type SoloPoiCandidate,
} from './agentFsm'

afterEach(() => {
  vi.restoreAllMocks()
})

function stubRandom(...seq: number[]): void {
  let i = 0
  vi.spyOn(Math, 'random').mockImplementation(() => {
    const value = seq[Math.min(i, seq.length - 1)] ?? 0
    i += 1
    return value
  })
}

const POIS: SoloPoiCandidate[] = [
  { key: 'poi_lounge_0', kind: 'lounge', point: { x: 1, y: 1 } },
  { key: 'poi_lounge_1', kind: 'lounge', point: { x: 2, y: 1 } },
  { key: 'poi_coffee_0', kind: 'coffee', point: { x: 3, y: 1 } },
  { key: 'poi_meeting_0', kind: 'meeting', point: { x: 4, y: 1 } },
]

describe('pickSoloPoi', () => {
  it('never treats meeting as a personal errand', () => {
    expect(SOLO_POI_KINDS).toEqual(['lounge', 'coffee', 'print'])
    stubRandom(0, 0, 0, 0, 0)
    expect(
      pickSoloPoi(
        [{ key: 'poi_meeting_0', kind: 'meeting', point: { x: 0, y: 0 } }],
        new Set(),
      ),
    ).toBeNull()
  })

  it('returns null about 15% of the time even when chairs are free', () => {
    stubRandom(0.85)
    expect(pickSoloPoi(POIS, new Set())).toBeNull()
  })

  it('skips busy keys and tries other solo kinds when the first is full', () => {
    // shuffle: keep order lounge,coffee,print (randoms for swaps all 0)
    stubRandom(0, 0, 0, 0, 0)
    const picked = pickSoloPoi(
      POIS,
      new Set(['poi_lounge_0', 'poi_lounge_1']),
    )
    expect(picked?.kind).toBe('coffee')
    expect(picked?.key).toBe('poi_coffee_0')
  })

  it('can pick print when lounge and coffee are busy', () => {
    const withPrint: SoloPoiCandidate[] = [
      ...POIS,
      { key: 'poi_print_0', kind: 'print', point: { x: 5, y: 1 } },
    ]
    stubRandom(0, 0, 0, 0, 0)
    const picked = pickSoloPoi(
      withPrint,
      new Set(['poi_lounge_0', 'poi_lounge_1', 'poi_coffee_0']),
    )
    expect(picked?.kind).toBe('print')
    expect(picked?.key).toBe('poi_print_0')
  })

  it('returns null when every solo chair is claimed', () => {
    stubRandom(0, 0, 0, 0)
    expect(
      pickSoloPoi(
        [
          ...POIS,
          { key: 'poi_print_0', kind: 'print', point: { x: 5, y: 1 } },
        ],
        new Set([
          'poi_lounge_0',
          'poi_lounge_1',
          'poi_coffee_0',
          'poi_print_0',
        ]),
      ),
    ).toBeNull()
  })
})

describe('meetingSize', () => {
  it('needs at least two free seats and two free agents', () => {
    expect(meetingSize(1, 8)).toBe(0)
    expect(meetingSize(8, 1)).toBe(0)
    expect(meetingSize(0, 0)).toBe(0)
  })

  it('caps recruitment at 3', () => {
    stubRandom(0)
    expect(meetingSize(8, 8)).toBe(2)
    stubRandom(0.999)
    expect(meetingSize(8, 8)).toBe(3)
  })
})

describe('faceToward', () => {
  it('faces the dominant axis and prefers vertical on ties', () => {
    expect(faceToward({ x: 0, y: 0 }, { x: 10, y: 1 })).toBe(2)
    expect(faceToward({ x: 0, y: 0 }, { x: -10, y: 1 })).toBe(1)
    expect(faceToward({ x: 0, y: 0 }, { x: 1, y: -10 })).toBe(3)
    expect(faceToward({ x: 0, y: 0 }, { x: 1, y: 10 })).toBe(0)
    expect(faceToward({ x: 0, y: 0 }, { x: 5, y: -5 })).toBe(3)
  })
})

describe('parseDwellFacing', () => {
  it('maps up/down/left/right to Pipoya dirs', () => {
    expect(parseDwellFacing('down')).toBe(0)
    expect(parseDwellFacing('left')).toBe(1)
    expect(parseDwellFacing('right')).toBe(2)
    expect(parseDwellFacing('up')).toBe(3)
  })

  it('is case-insensitive and trims whitespace', () => {
    expect(parseDwellFacing('Up')).toBe(3)
    expect(parseDwellFacing('  LEFT  ')).toBe(1)
  })

  it('defaults to south for missing, digits, and aliases', () => {
    expect(parseDwellFacing(undefined)).toBe(0)
    expect(parseDwellFacing(null)).toBe(0)
    expect(parseDwellFacing(0)).toBe(0)
    expect(parseDwellFacing(3)).toBe(0)
    expect(parseDwellFacing('north')).toBe(0)
    expect(parseDwellFacing('facing')).toBe(0)
    expect(parseDwellFacing('direction')).toBe(0)
    expect(parseDwellFacing('')).toBe(0)
  })
})

describe('glanceDir', () => {
  it('looks up/down when already facing left/right', () => {
    stubRandom(0)
    expect(glanceDir(1)).toBe(0)
    stubRandom(0.9)
    expect(glanceDir(2)).toBe(3)
  })

  it('looks left/right when already facing up/down', () => {
    stubRandom(0)
    expect(glanceDir(0)).toBe(1)
    stubRandom(0.9)
    expect(glanceDir(3)).toBe(2)
  })
})

describe('hashPick', () => {
  it('is stable for the same id', () => {
    const items = ['a', 'b', 'c', 'd']
    expect(hashPick('desk-7', items)).toBe(hashPick('desk-7', items))
    expect(items).toContain(hashPick('alpha', items))
  })
})

describe('hueTint', () => {
  it('wraps hue into 0–359 and stays a 24-bit color', () => {
    expect(hueTint(0)).toBe(hueTint(360))
    expect(hueTint(-90)).toBe(hueTint(270))
    expect(hueTint(0)).toBeGreaterThan(0)
    expect(hueTint(180)).toBeLessThan(0x1000000)
  })
})

describe('timing helpers', () => {
  it('keeps dwell windows by POI kind', () => {
    stubRandom(0)
    expect(dwellMs('lounge')).toBe(3_000)
    expect(dwellMs('coffee')).toBe(2_000)
    expect(dwellMs('print')).toBe(2_000)
    expect(dwellMs('meeting')).toBe(4_000)
    expect(dwellMs('random')).toBe(1_000)
    stubRandom(0.5)
    expect(dwellMs('lounge')).toBe(5_500)
  })

  it('keeps other clocks inside documented ranges at the low end', () => {
    stubRandom(0)
    expect(initialWorkingMode()).toEqual({ mode: 'working', durationMs: 1_000 })
    expect(scheduleFidgetMs()).toBe(2_000)
    expect(rescheduleFidgetMs()).toBe(4_000)
    expect(travelTimeoutMs()).toBe(25_000)
    expect(workingDurationMs()).toBe(20_000)
    expect(meetingCooldownMs()).toBe(40_000)
    expect(nextDeskMode()).toEqual({ mode: 'wander' })
  })

  it('renews working when the desk clock stays below the wander roll', () => {
    stubRandom(0.15)
    expect(nextDeskMode()).toEqual({ mode: 'working' })
  })
})

describe('randomInt', () => {
  it('returns lo when the range is inverted', () => {
    expect(randomInt(5, 1)).toBe(5)
  })

  it('is inclusive on both ends', () => {
    stubRandom(0)
    expect(randomInt(2, 4)).toBe(2)
    stubRandom(0.999)
    expect(randomInt(2, 4)).toBe(4)
  })
})
