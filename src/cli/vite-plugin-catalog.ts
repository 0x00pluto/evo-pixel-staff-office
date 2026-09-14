import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'

/**
 * Vite plugin: serves GET/POST /api/catalog, GET/POST /api/presence, and GET /api/openapi.json
 * during `pnpm dev` using the same RuntimeCatalog / presence store as the production CLI.
 */
export function catalogApiPlugin(): Plugin {
  return {
    name: 'pixel-office-catalog-api',
    async configureServer(server) {
      // Runtime ESM; typings live in catalog.mjs / presence-*.mjs / openapi.mjs (plain JS).
      const catalogMod = (await import(
        /* @vite-ignore */
        new URL('./catalog.mjs', import.meta.url).href
      )) as {
        RuntimeCatalog: new (opts: {
          userPath?: string
          seedPath?: string | null
          explicitSeed?: boolean
          log?: (msg: string) => void
        }) => {
          boot: () => { agents: Array<{ id: string }>; sourcePath: string }
          load: (opts?: { refresh?: boolean }) => Promise<{
            agents: Array<{ id: string }>
            sourcePath: string
          }>
          replace: (body: unknown) =>
            | { ok: true; payload: { agents: Array<{ id: string }> } }
            | { ok: false; error: string }
        }
        resolveSeedForBoot: (opts: {
          cliPath: string | null
          envPath: string | undefined
          cwd: string
        }) => {
          seedPath: string | null
          explicitSeed: boolean
          missingExplicit?: string
        }
        userCatalogPath: () => string
      }

      const catalogHttpMod = (await import(
        /* @vite-ignore */
        new URL('./catalog-http.mjs', import.meta.url).href
      )) as {
        createCatalogHandler: (opts: {
          catalog: InstanceType<typeof catalogMod.RuntimeCatalog>
          presenceStore: { retainIds: (ids: Iterable<string>) => void }
          getToken?: () => string | undefined
        }) => {
          handle: (req: IncomingMessage, res: ServerResponse) => Promise<boolean>
        }
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

      const seed = catalogMod.resolveSeedForBoot({
        cliPath: null,
        envPath: process.env.EVO_AGENT_CATALOG,
        cwd: process.cwd(),
      })

      if (seed.missingExplicit) {
        console.error(
          `[pixel-office] 花名册不存在: ${seed.missingExplicit}`,
        )
        // Dev: still start empty rather than crash Vite; log loudly.
      }

      let catalog = new catalogMod.RuntimeCatalog({
        userPath: catalogMod.userCatalogPath(),
        seedPath: seed.missingExplicit ? null : seed.seedPath,
        explicitSeed: seed.explicitSeed && !seed.missingExplicit,
        log: (msg) => console.warn('[pixel-office]', msg),
      })

      const presenceStore = presenceMod.createPresenceStore()

      try {
        const payload = catalog.boot()
        presenceStore.retainIds(payload.agents.map((a) => a.id))
      } catch (err) {
        console.error(
          '[pixel-office] catalog boot failed, empty:',
          err instanceof Error ? err.message : err,
        )
        catalog = new catalogMod.RuntimeCatalog({
          userPath: catalogMod.userCatalogPath(),
          seedPath: null,
          explicitSeed: false,
          log: (msg) => console.warn('[pixel-office]', msg),
        })
        const payload = catalog.boot()
        presenceStore.retainIds(payload.agents.map((a) => a.id))
      }

      const catalogApi = catalogHttpMod.createCatalogHandler({
        catalog,
        presenceStore,
        getToken: () => process.env.EVO_PRESENCE_TOKEN,
      })

      const presence = presenceMod.createPresenceHandler({
        store: presenceStore,
        getCatalogIds: async () => {
          const payload = await catalog.load()
          return payload.agents.map((a) => a.id)
        },
        getToken: () => process.env.EVO_PRESENCE_TOKEN,
      })

      server.middlewares.use(async (req, res, next) => {
        try {
          if (req.url?.startsWith('/api/openapi.json')) {
            if (openapiMod.handleOpenApi(req, res)) return
          }

          if (req.url?.startsWith('/api/catalog')) {
            const handled = await catalogApi.handle(req, res)
            if (handled) return
          }

          if (req.url?.startsWith('/api/presence')) {
            const handled = await presence.handle(req, res)
            if (handled) return
          }

          next()
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
