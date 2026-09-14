/**
 * HTTP helpers for GET/POST /api/presence (Vite middleware + Node http).
 */

import { createPresenceStore } from './presence-store.mjs'

/**
 * @param {import('http').IncomingMessage} req
 * @returns {Promise<unknown>}
 */
export function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8').trim()
      if (!raw) {
        resolve({})
        return
      }
      try {
        resolve(JSON.parse(raw))
      } catch {
        reject(new Error('invalid JSON'))
      }
    })
    req.on('error', reject)
  })
}

/**
 * Same-origin browser fetch (Origin matches Host) may POST without Bearer
 * so the dashboard can ack blocked→idle without embedding the token.
 * Cross-origin / curl must send Authorization when EVO_PRESENCE_TOKEN is set.
 *
 * @param {import('http').IncomingMessage} req
 * @param {string | undefined} token
 */
export function authorizePresencePost(req, token) {
  if (!token) return { ok: true }
  const auth = req.headers.authorization
  if (typeof auth === 'string' && auth === `Bearer ${token}`) {
    return { ok: true }
  }
  const origin = req.headers.origin
  const host = req.headers.host
  if (origin && host) {
    try {
      const o = new URL(origin)
      if (o.host === host) return { ok: true }
    } catch {
      /* ignore bad Origin */
    }
  }
  return { ok: false, status: 401, error: 'unauthorized' }
}

/**
 * @param {import('http').ServerResponse} res
 * @param {import('http').IncomingMessage} req
 */
export function setPresenceCors(res, req) {
  const origin = req.headers.origin
  res.setHeader('Access-Control-Allow-Origin', origin || '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization',
  )
  res.setHeader('Access-Control-Max-Age', '86400')
}

/**
 * @param {object} opts
 * @param {ReturnType<typeof createPresenceStore>} opts.store
 * @param {() => string[] | Promise<string[]>} opts.getCatalogIds
 * @param {() => string | undefined} [opts.getToken]
 */
export function createPresenceHandler(opts) {
  const { store, getCatalogIds } = opts
  const getToken =
    typeof opts.getToken === 'function'
      ? opts.getToken
      : () => process.env.EVO_PRESENCE_TOKEN

  /**
   * @param {import('http').IncomingMessage} req
   * @param {import('http').ServerResponse} res
   * @returns {Promise<boolean>} true if handled
   */
  async function handle(req, res) {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)
    if (url.pathname !== '/api/presence') return false

    setPresenceCors(res, req)

    if (req.method === 'OPTIONS') {
      res.statusCode = 204
      res.end()
      return true
    }

    const ids = await getCatalogIds()

    if (req.method === 'GET') {
      const agents = store.snapshot(ids)
      res.statusCode = 200
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.setHeader('Cache-Control', 'no-store')
      res.end(JSON.stringify({ agents }))
      return true
    }

    if (req.method === 'POST') {
      const auth = authorizePresencePost(req, getToken())
      if (!auth.ok) {
        res.statusCode = auth.status
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.end(JSON.stringify({ error: auth.error }))
        return true
      }

      let body
      try {
        body = await readJsonBody(req)
      } catch {
        res.statusCode = 400
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.end(JSON.stringify({ error: 'invalid JSON' }))
        return true
      }

      const result = store.upsert(body, ids)
      if (!result.ok) {
        res.statusCode = result.status
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.end(JSON.stringify({ error: result.error }))
        return true
      }

      res.statusCode = 200
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.setHeader('Cache-Control', 'no-store')
      res.end(JSON.stringify(result.record))
      return true
    }

    res.statusCode = 405
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.end(JSON.stringify({ error: 'method not allowed' }))
    return true
  }

  return { handle, store }
}

export { createPresenceStore }
