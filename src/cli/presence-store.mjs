/**
 * In-memory live presence table (PRD-00007 R0).
 * Shared by Vite catalog plugin and pixel-office CLI.
 */

export const PRESENCE_STATES = Object.freeze(['working', 'blocked', 'idle'])

/** working: 10 min without heartbeat → synthetic idle */
export const WORKING_TTL_MS = 600_000
/** blocked: 1 h without refresh → synthetic idle (yellow fallback) */
export const BLOCKED_TTL_MS = 3_600_000
/** Live summary visual/API cap (chars); longer strings truncated with … */
export const SUMMARY_MAX_CHARS = 40

/**
 * @param {string | undefined | null} raw
 * @returns {string}
 */
export function truncateSummary(raw) {
  if (raw == null) return ''
  const s = String(raw).trim()
  if (!s) return ''
  if ([...s].length <= SUMMARY_MAX_CHARS) return s
  const chars = [...s]
  return `${chars.slice(0, SUMMARY_MAX_CHARS - 1).join('')}…`
}

/**
 * @param {string} state
 * @param {number} updatedAt
 * @param {number} now
 * @returns {'working' | 'blocked' | 'idle'}
 */
export function effectiveState(state, updatedAt, now = Date.now()) {
  if (state === 'working' && now - updatedAt >= WORKING_TTL_MS) return 'idle'
  if (state === 'blocked' && now - updatedAt >= BLOCKED_TTL_MS) return 'idle'
  if (state === 'working' || state === 'blocked' || state === 'idle') return state
  return 'idle'
}

/**
 * @param {{ id: string, state: string, summary?: string, updatedAt: number } | null | undefined} record
 * @param {number} [now]
 */
export function effectiveRecord(record, now = Date.now()) {
  if (!record) return null
  const state = effectiveState(record.state, record.updatedAt, now)
  return {
    id: record.id,
    state,
    summary: record.summary ?? '',
    updatedAt: record.updatedAt,
  }
}

/**
 * Live lock: working/blocked (after TTL) must stay at desk — not fishbowl wander/meeting.
 * @param {string | null | undefined} state
 */
export function isLiveLocked(state) {
  return state === 'working' || state === 'blocked'
}

/**
 * @param {object} [opts]
 * @param {() => number} [opts.now]
 */
export function createPresenceStore(opts = {}) {
  /** @type {Map<string, { id: string, state: string, summary: string, updatedAt: number }>} */
  const byId = new Map()
  const clock = typeof opts.now === 'function' ? opts.now : () => Date.now()

  /**
   * Drop rows whose id is no longer in the catalog; unknown catalog ids stay implicit idle.
   * @param {Iterable<string>} catalogIds
   */
  function retainIds(catalogIds) {
    const keep = new Set(catalogIds)
    for (const id of byId.keys()) {
      if (!keep.has(id)) byId.delete(id)
    }
  }

  /**
   * @param {string[]} catalogIds
   * @param {number} [now]
   */
  function snapshot(catalogIds, now = clock()) {
    return catalogIds.map((id) => {
      const raw = byId.get(id)
      if (!raw) {
        return { id, state: 'idle', summary: '', updatedAt: 0 }
      }
      return (
        effectiveRecord(raw, now) ?? {
          id,
          state: 'idle',
          summary: '',
          updatedAt: 0,
        }
      )
    })
  }

  /**
   * @param {object} body
   * @param {string} body.id
   * @param {string} body.state
   * @param {string} [body.summary]
   * @param {Iterable<string>} catalogIds
   * @param {number} [now]
   * @returns {{ ok: true, record: object } | { ok: false, status: number, error: string }}
   */
  function upsert(body, catalogIds, now = clock()) {
    if (!body || typeof body !== 'object') {
      return { ok: false, status: 400, error: 'body must be a JSON object' }
    }
    const id = typeof body.id === 'string' ? body.id.trim() : ''
    if (!id) {
      return { ok: false, status: 400, error: 'id is required' }
    }
    const known = new Set(catalogIds)
    if (!known.has(id)) {
      return { ok: false, status: 404, error: `unknown id: ${id}` }
    }
    const state = typeof body.state === 'string' ? body.state.trim() : ''
    if (!PRESENCE_STATES.includes(state)) {
      return {
        ok: false,
        status: 400,
        error: `state must be one of: ${PRESENCE_STATES.join(', ')}`,
      }
    }

    const prev = byId.get(id)
    let summary = prev?.summary ?? ''
    if (Object.prototype.hasOwnProperty.call(body, 'summary')) {
      const next = truncateSummary(body.summary)
      // Empty / whitespace-only = leave previous summary (heartbeat renew).
      if (next) summary = next
    }

    const record = {
      id,
      state,
      summary,
      updatedAt: now,
    }
    byId.set(id, record)
    return { ok: true, record: effectiveRecord(record, now) }
  }

  /**
   * @param {string} id
   * @param {number} [now]
   */
  function get(id, now = clock()) {
    const raw = byId.get(id)
    if (!raw) return { id, state: 'idle', summary: '', updatedAt: 0 }
    return (
      effectiveRecord(raw, now) ?? {
        id,
        state: 'idle',
        summary: '',
        updatedAt: 0,
      }
    )
  }

  return {
    upsert,
    snapshot,
    retainIds,
    get,
    /** @internal test helper */
    _raw: byId,
  }
}
