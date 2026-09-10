import type { Plugin } from 'vite'

/**
 * Vite plugin: serves GET /api/catalog during `pnpm dev`
 * using the same CatalogSource as the production CLI.
 */
export function catalogApiPlugin(): Plugin {
  return {
    name: 'pixel-office-catalog-api',
    async configureServer(server) {
      // Runtime ESM; typings live in catalog.mjs (plain JS).
      const catalog = (await import(
        /* @vite-ignore */
        new URL('./catalog.mjs', import.meta.url).href
      )) as {
        createCatalogSource: (opts: { kind: 'json'; path: string }) => {
          load: () => Promise<unknown>
        }
        resolveCatalogPath: (opts: {
          cliPath: string | null
          envPath: string | undefined
          cwd: string
        }) => string
      }

      let cached: unknown = null
      let source: { load: () => Promise<unknown> } | null = null

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

      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/catalog')) {
          next()
          return
        }
        try {
          const url = new URL(req.url, 'http://localhost')
          const src = ensureSource()
          if (url.searchParams.get('refresh') === '1' || !cached) {
            cached = await src.load()
          }
          res.setHeader('Content-Type', 'application/json; charset=utf-8')
          res.setHeader('Cache-Control', 'no-store')
          res.end(JSON.stringify(cached))
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
