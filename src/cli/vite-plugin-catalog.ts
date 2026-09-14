import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'

/**
 * Vite plugin: serves GET /api/catalog, GET/POST /api/presence, and GET /api/openapi.json
 * during `pnpm dev` using the same CatalogSource / presence store as the production CLI.
 */
export function catalogApiPlugin(): Plugin {
  return {
    name: 'pixel-office-catalog-api',
    async configureServer(server) {
      // Runtime ESM; typings live in catalog.mjs / presence-*.mjs / openapi.mjs (plain JS).
      const catalog = (await import(
        /* @vite-ignore */
        new URL('./catalog.mjs', import.meta.url).href
      )) as {
        createCatalogSource: (opts: { kind: 'json'; path: string }) => {
          load: () => Promise<{ agents: Array<{ id: string }> }>
        }
        resolveCatalogPath: (opts: {
          cliPath: string | null
          envPath: string | undefined
          cwd: string
        }) => string
      }

      const presenceMod = (await import(
        /* @vite-ignore */
        new URL('./presence-http.mjs', import.meta.url).href
      )) as {
        createPresenceStore: () => {
          retainIds: (ids: Iterable<string>) => void
        }
        createPresenceHandler: (opts: {
          store: { retainIds: (ids: Iterable<string>) => void }
          getCatalogIds: () => Promise<string[]>
          getToken?: () => string | undefined
        }) => {
          handle: (req: IncomingMessage, res: ServerResponse) => Promise<boolean>
        }
      }

      const openapiMod = (await import(
        /* @vite-ignore */
        new URL('./openapi.mjs', import.meta.url).href
      )) as {
        handleOpenApi: (req: IncomingMessage, res: ServerResponse) => boolean
      }

      let cached: { agents: Array<{ id: string }> } | null = null
      let source: {
        load: () => Promise<{ agents: Array<{ id: string }> }>
      } | null = null
      const presenceStore = presenceMod.createPresenceStore()

      function ensureSource() {
        if (source) return source
        const catalogPath = catalog.resolveCatalogPath({
          cliPath: null,
          envPath: process.env.EVO_AGENT_CATALOG,
          cwd: process.cwd(),
        })
        source = catalog.createCatalogSource({ kind: 'json', path: catalogPath })
        return source
      }

      async function loadCatalog(refresh: boolean) {
        const src = ensureSource()
        if (refresh || !cached) {
          cached = await src.load()
          presenceStore.retainIds(cached.agents.map((a) => a.id))
        }
        return cached
      }

      const presence = presenceMod.createPresenceHandler({
        store: presenceStore,
        getCatalogIds: async () => {
          const payload = await loadCatalog(false)
          return payload.agents.map((a) => a.id)
        },
        getToken: () => process.env.EVO_PRESENCE_TOKEN,
      })

      server.middlewares.use(async (req, res, next) => {
        try {
          if (req.url?.startsWith('/api/openapi.json')) {
            if (openapiMod.handleOpenApi(req, res)) return
          }

          if (req.url?.startsWith('/api/presence')) {
            const handled = await presence.handle(req, res)
            if (handled) return
          }

          if (!req.url?.startsWith('/api/catalog')) {
            next()
            return
          }

          const url = new URL(req.url, 'http://localhost')
          const payload = await loadCatalog(
            url.searchParams.get('refresh') === '1',
          )
          res.setHeader('Content-Type', 'application/json; charset=utf-8')
          res.setHeader('Cache-Control', 'no-store')
          res.end(JSON.stringify(payload))
        } catch (err) {
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json; charset=utf-8')
          res.end(
            JSON.stringify({
              error: err instanceof Error ? err.message : String(err),
            }),
          )
        }
      })
    },
  }
}
