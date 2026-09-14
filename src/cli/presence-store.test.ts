import { describe, expect, it } from 'vitest'
import {
  authorizePresencePost,
} from './presence-http.mjs'
import {
  BLOCKED_TTL_MS,
  createPresenceStore,
  effectiveState,
  isLiveLocked,
  SUMMARY_MAX_CHARS,
  truncateSummary,
  WORKING_TTL_MS,
} from './presence-store.mjs'

const IDS = ['pixel-office', 'other-agent']

describe('truncateSummary', () => {
  it('trims and caps at 40 chars with ellipsis', () => {
    expect(truncateSummary('  hi  ')).toBe('hi')
    expect(truncateSummary('')).toBe('')
    expect(truncateSummary(null)).toBe('')
    const long = '啊'.repeat(45)
    const out = truncateSummary(long)
    expect([...out].length).toBe(SUMMARY_MAX_CHARS)
    expect(out.endsWith('…')).toBe(true)
  })
})

describe('effectiveState / TTL', () => {
  it('synthesizes idle after working 600s', () => {
    const t0 = 1_000_000
    expect(effectiveState('working', t0, t0 + WORKING_TTL_MS - 1)).toBe(
      'working',
    )
    expect(effectiveState('working', t0, t0 + WORKING_TTL_MS)).toBe('idle')
  })

  it('keeps blocked yellow past 600s; idle only after 3600s', () => {
    const t0 = 1_000_000
    expect(effectiveState('blocked', t0, t0 + WORKING_TTL_MS + 1_000)).toBe(
      'blocked',
    )
    expect(effectiveState('blocked', t0, t0 + BLOCKED_TTL_MS - 1)).toBe(
      'blocked',
    )
    expect(effectiveState('blocked', t0, t0 + BLOCKED_TTL_MS)).toBe('idle')
  })
})

describe('isLiveLocked', () => {
  it('locks working and blocked only', () => {
    expect(isLiveLocked('working')).toBe(true)
    expect(isLiveLocked('blocked')).toBe(true)
    expect(isLiveLocked('idle')).toBe(false)
    expect(isLiveLocked(undefined)).toBe(false)
  })
})

describe('createPresenceStore', () => {
  it('upserts known id and returns record', () => {
    let now = 5_000
    const store = createPresenceStore({ now: () => now })
    const r = store.upsert(
      { id: 'pixel-office', state: 'working', summary: '改 mapProp' },
      IDS,
    )
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.record).toEqual({
      id: 'pixel-office',
      state: 'working',
      summary: '改 mapProp',
      updatedAt: 5_000,
    })
  })

  it('rejects unknown id with 404', () => {
    const store = createPresenceStore()
    const r = store.upsert(
      { id: 'ghost', state: 'working', summary: 'nope' },
      IDS,
    )
    expect(r).toEqual({
      ok: false,
      status: 404,
      error: 'unknown id: ghost',
    })
  })

  it('rejects bad state with 400', () => {
    const store = createPresenceStore()
    const r = store.upsert({ id: 'pixel-office', state: 'thinking' }, IDS)
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.status).toBe(400)
  })

  it('omits / empty summary keeps previous (heartbeat)', () => {
    let now = 1_000
    const store = createPresenceStore({ now: () => now })
    store.upsert(
      { id: 'pixel-office', state: 'working', summary: '第一句' },
      IDS,
    )
    now = 2_000
    const r = store.upsert({ id: 'pixel-office', state: 'working' }, IDS)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.record.summary).toBe('第一句')
    expect(r.record.updatedAt).toBe(2_000)

    now = 3_000
    const r2 = store.upsert(
      { id: 'pixel-office', state: 'working', summary: '   ' },
      IDS,
    )
    expect(r2.ok).toBe(true)
    if (!r2.ok) return
    expect(r2.record.summary).toBe('第一句')
  })

  it('snapshot applies TTL and fills implicit idle', () => {
    let now = 10_000
    const store = createPresenceStore({ now: () => now })
    store.upsert(
      { id: 'pixel-office', state: 'blocked', summary: '请验收' },
      IDS,
    )
    now = 10_000 + WORKING_TTL_MS + 5_000
    let snap = store.snapshot(IDS, now)
    expect(snap.find((a) => a.id === 'pixel-office')?.state).toBe('blocked')
    expect(snap.find((a) => a.id === 'other-agent')).toEqual({
      id: 'other-agent',
      state: 'idle',
      summary: '',
      updatedAt: 0,
    })

    now = 10_000 + BLOCKED_TTL_MS
    snap = store.snapshot(IDS, now)
    expect(snap.find((a) => a.id === 'pixel-office')?.state).toBe('idle')
    // Stored summary remains for display until overwritten; effective state idle.
    expect(snap.find((a) => a.id === 'pixel-office')?.summary).toBe('请验收')
  })

  it('retainIds drops rows no longer in catalog', () => {
    const store = createPresenceStore()
    store.upsert(
      { id: 'pixel-office', state: 'working', summary: 'x' },
      IDS,
    )
    store.upsert({ id: 'other-agent', state: 'blocked', summary: 'y' }, IDS)
    store.retainIds(['pixel-office'])
    const snap = store.snapshot(['pixel-office', 'other-agent'])
    expect(snap.find((a) => a.id === 'pixel-office')?.state).toBe('working')
    expect(snap.find((a) => a.id === 'other-agent')?.state).toBe('idle')
    expect(snap.find((a) => a.id === 'other-agent')?.updatedAt).toBe(0)
  })
})

describe('authorizePresencePost', () => {
  it('allows all when token unset', () => {
    expect(
      authorizePresencePost({ headers: {} } as never, undefined).ok,
    ).toBe(true)
  })

  it('accepts matching Bearer', () => {
    expect(
      authorizePresencePost(
        { headers: { authorization: 'Bearer secret' } } as never,
        'secret',
      ).ok,
    ).toBe(true)
  })

  it('rejects wrong Bearer without same-origin Origin', () => {
    const r = authorizePresencePost(
      { headers: { authorization: 'Bearer wrong', host: 'localhost:5173' } } as never,
      'secret',
    )
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.status).toBe(401)
  })

  it('allows same-origin Origin without Bearer (dashboard ack)', () => {
    expect(
      authorizePresencePost(
        {
          headers: {
            host: 'localhost:5173',
            origin: 'http://localhost:5173',
          },
        } as never,
        'secret',
      ).ok,
    ).toBe(true)
  })
})
