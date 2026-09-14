import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createCatalogHandler } from './catalog-http.mjs'
import {
  resolveSeedForBoot,
  RuntimeCatalog,
  userCatalogPath,
} from './catalog.mjs'
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
  npx @huyuan/pixel-office
  npx @huyuan/pixel-office --catalog <CATALOG.json路径>
  pnpm pixel-office -c ~/Documents/Codex/AgentWikiIndex/CATALOG.json

选项:
  -c, --catalog <path>   可选种子 CATALOG.json（无用户目录持久化时加载进内存）
  -p, --port <n>         端口（默认 3780）
  --no-open              不自动打开浏览器
  -h, --help             帮助

环境变量:
  EVO_AGENT_CATALOG      与 --catalog 等效（可选种子）
  PIXEL_OFFICE_HOME      用户目录父路径（默认 ~/.pixel-office）；持久化 catalog.json
  EVO_PRESENCE_TOKEN     可选；设置后跨机 POST /api/catalog 与 /api/presence 需 Bearer

无本地 CATALOG.json 也可启动（空办公室）。运行时注入：
  curl -X POST http://localhost:3780/api/catalog -H 'Content-Type: application/json' -d @CATALOG.json
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

  const seed = resolveSeedForBoot({
    cliPath: opts.catalog,
    envPath: process.env.EVO_AGENT_CATALOG,
    cwd: process.cwd(),
  })
  if (seed.missingExplicit) {
    console.error(`[pixel-office] 花名册不存在: ${seed.missingExplicit}`)
    process.exit(1)
  }

  const catalog = new RuntimeCatalog({
    userPath: userCatalogPath(),
    seedPath: seed.seedPath,
    explicitSeed: seed.explicitSeed,
    log: (msg) => console.warn('[pixel-office]', msg),
  })

  const distDir = path.join(root, 'dist')
  if (!fs.existsSync(path.join(distDir, 'index.html'))) {
    const inRepo = fs.existsSync(path.join(root, 'package.json')) &&
      fs.existsSync(path.join(root, 'vite.config.ts'))
    if (inRepo) {
      console.error(
        `[pixel-office] 未找到构建产物 ${distDir}/index.html\n请先执行: pnpm build`,
      )
    } else {
      console.error(
        `[pixel-office] 未找到构建产物 ${distDir}/index.html\n包可能损坏或非官方安装；请重新执行: npx @huyuan/pixel-office`,
      )
    }
    process.exit(1)
  }

  const presenceStore = createPresenceStore()

  let cached
  try {
    cached = catalog.boot()
    presenceStore.retainIds(cached.agents.map((a) => a.id))
  } catch (err) {
    console.error(
      '[pixel-office] 读取花名册失败:',
      err instanceof Error ? err.message : err,
    )
    process.exit(1)
  }

  const catalogApi = createCatalogHandler({
    catalog,
    presenceStore,
    getToken: () => process.env.EVO_PRESENCE_TOKEN,
  })

  const presence = createPresenceHandler({
    store: presenceStore,
    getCatalogIds: async () => {
      const payload = await catalog.load()
      return payload.agents.map((a) => a.id)
    },
    getToken: () => process.env.EVO_PRESENCE_TOKEN,
  })

  const staticHandler = createStaticHandler(distDir)

  const server = http.createServer(async (req, res) => {
    try {
      if (handleOpenApi(req, res)) return
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }))
      return
    }

    try {
      if (await catalogApi.handle(req, res)) return
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

    staticHandler(req, res)
  })

  server.listen(opts.port, async () => {
    const url = `http://localhost:${opts.port}`
    console.log(`[pixel-office] ${url}`)
    console.log(`[pixel-office] catalog: ${cached.sourcePath}`)
    console.log(`[pixel-office] agents: ${cached.agents.length}`)
    if (opts.openBrowser) await openUrl(url)
  })
}

main()
