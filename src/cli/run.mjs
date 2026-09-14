import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createCatalogSource, resolveCatalogPath } from './catalog.mjs'
import {
  createPresenceHandler,
  createPresenceStore,
} from './presence-http.mjs'
import { handleOpenApi } from './openapi.mjs'
import { createStaticHandler } from './static.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '../..')

function parseArgs(argv) {
  const opts = { port: 3780, catalog: null, openBrowser: true, help: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--catalog' || a === '-c') opts.catalog = argv[++i]
    else if (a === '--port' || a === '-p') opts.port = Number(argv[++i])
    else if (a === '--no-open') opts.openBrowser = false
    else if (a === '--help' || a === '-h') opts.help = true
  }
  return opts
}

function printHelp() {
  console.log(`pixel-office — 像素数字员工办公室大屏

用法:
  pnpm pixel-office --catalog <CATALOG.json路径>
  pnpm pixel-office -c ~/Documents/Codex/AgentWikiIndex/CATALOG.json

选项:
  -c, --catalog <path>   花名册 CATALOG.json 路径
  -p, --port <n>         端口（默认 3780）
  --no-open              不自动打开浏览器
  -h, --help             帮助

环境变量:
  EVO_AGENT_CATALOG      与 --catalog 等效
  EVO_PRESENCE_TOKEN     可选；设置后跨机 POST /api/presence 需 Bearer
`)
}

async function openUrl(url) {
  try {
    const open = (await import('open')).default
    await open(url)
  } catch {
    console.warn('[pixel-office] 无法自动打开浏览器，请手动访问', url)
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2))
  if (opts.help) {
    printHelp()
    process.exit(0)
  }

  let catalogPath
  try {
    catalogPath = resolveCatalogPath({
      cliPath: opts.catalog,
      envPath: process.env.EVO_AGENT_CATALOG,
      cwd: process.cwd(),
    })
  } catch (err) {
    console.error('[pixel-office]', err instanceof Error ? err.message : err)
    process.exit(1)
  }

  const source = createCatalogSource({ kind: 'json', path: catalogPath })
  const distDir = path.join(root, 'dist')
  if (!fs.existsSync(path.join(distDir, 'index.html'))) {
    console.error(
      `[pixel-office] 未找到构建产物 ${distDir}/index.html\n请先执行: pnpm build`,
    )
    process.exit(1)
  }

  let cached
  const presenceStore = createPresenceStore()

  async function loadPayload() {
    cached = await source.load()
    presenceStore.retainIds(cached.agents.map((a) => a.id))
    return cached
  }

  try {
    await loadPayload()
  } catch (err) {
    console.error('[pixel-office] 读取花名册失败:', err instanceof Error ? err.message : err)
    process.exit(1)
  }

  const presence = createPresenceHandler({
    store: presenceStore,
    getCatalogIds: async () => {
      const payload = cached ?? (await loadPayload())
      return payload.agents.map((a) => a.id)
    },
    getToken: () => process.env.EVO_PRESENCE_TOKEN,
  })

  const staticHandler = createStaticHandler(distDir)

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)

    try {
      if (handleOpenApi(req, res)) return
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }))
      return
    }

    try {
      if (await presence.handle(req, res)) return
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }))
      return
    }

    if (url.pathname === '/api/catalog') {
      try {
        const payload =
          url.searchParams.get('refresh') === '1'
            ? await loadPayload()
            : (cached ?? (await loadPayload()))
        res.writeHead(200, {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store',
        })
        res.end(JSON.stringify(payload))
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' })
        res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }))
      }
      return
    }

    staticHandler(req, res)
  })

  server.listen(opts.port, async () => {
    const url = `http://localhost:${opts.port}`
    console.log(`[pixel-office] ${url}`)
    console.log(`[pixel-office] catalog: ${catalogPath}`)
    console.log(`[pixel-office] agents: ${cached.agents.length}`)
    if (opts.openBrowser) await openUrl(url)
  })
}

main()
