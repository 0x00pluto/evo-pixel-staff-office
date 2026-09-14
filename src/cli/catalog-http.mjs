/**
 * HTTP helpers for GET/POST /api/catalog (Vite middleware + Node http).
 * Shared with presence auth / CORS helpers.
 */

import {
  CATALOG_MAX_BYTES,
  RuntimeCatalog,
} from './catalog.mjs'
import {
  authorizePresencePost,
  readJsonBody,
  setPresenceCors,
} from './presence-http.mjs'

/**
 * @param {object} opts
 * @param {RuntimeCatalog} opts.catalog
 * @param {{ retainIds: (ids: Iterable<string>) => void }} opts.presenceStore
 * @param {() => string | undefined} [opts.getToken]
 */
export function createCatalogHandler(opts) {
  const { catalog, presenceStore } = opts
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
    const url = new URL(
      req.url || '/',
      `http://${req.headers.host || 'localhost'}`,
    )
    if (url.pathname !== '/api/catalog') return false

    setPresenceCors(res, req)

    if (req.method === 'OPTIONS') {
      res.statusCode = 204
      res.end()
      return true
    }

    if (req.method === 'GET' || req.method === 'HEAD') {
      try {
        const payload = await catalog.load({
          refresh: url.searchParams.get('refresh') === '1',
        })
        res.statusCode = 200
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.setHeader('Cache-Control', 'no-store')
        if (req.method === 'HEAD') {
          res.end()
        } else {
          res.end(JSON.stringify(payload))
        }
      } catch (err) {
        res.statusCode = 500
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.end(
          JSON.stringify({
            error: err instanceof Error ? err.message : String(err),
          }),
        )
      }
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
        body = await readJsonBody(req, { maxBytes: CATALOG_MAX_BYTES })
      } catch (err) {
        const status =
          err && typeof err === 'object' && 'status' in err
            ? /** @type {{ status?: number }} */ (err).status
            : undefined
        res.statusCode = status === 413 ? 413 : 400
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.end(
          JSON.stringify({
            error:
              status === 413
                ? 'payload too large'
                : err instanceof Error
                  ? err.message
                  : 'invalid JSON',
          }),
        )
        return true
      }

      const result = catalog.replace(body)
      if (!result.ok) {
        res.statusCode = 400
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.end(JSON.stringify({ error: result.error }))
        return true
      }

      presenceStore.retainIds(result.payload.agents.map((a) => a.id))

      res.statusCode = 200
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.setHeader('Cache-Control', 'no-store')
      res.end(JSON.stringify(result.payload))
      return true
    }

    res.statusCode = 405
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.end(JSON.stringify({ error: 'method not allowed' }))
    return true
  }

  return { handle, catalog }
}

export { RuntimeCatalog, CATALOG_MAX_BYTES }
