import fs from 'node:fs'
import path from 'node:path'

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.map': 'application/json',
}

/**
 * @param {string} rootDir
 */
export function createStaticHandler(rootDir) {
  return function staticHandler(req, res) {
    try {
      const url = new URL(req.url || '/', 'http://localhost')
      let pathname = decodeURIComponent(url.pathname)
      if (pathname === '/') pathname = '/index.html'
      const filePath = path.normalize(path.join(rootDir, pathname))
      if (!filePath.startsWith(rootDir)) {
        res.writeHead(403)
        res.end('Forbidden')
        return
      }
      if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        // SPA fallback
        const index = path.join(rootDir, 'index.html')
        if (fs.existsSync(index)) {
          res.writeHead(200, { 'Content-Type': MIME['.html'] })
          res.end(fs.readFileSync(index))
          return
        }
        res.writeHead(404)
        res.end('Not Found')
        return
      }
      const ext = path.extname(filePath).toLowerCase()
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' })
      res.end(fs.readFileSync(filePath))
    } catch (err) {
      res.writeHead(500)
      res.end(err instanceof Error ? err.message : String(err))
    }
  }
}
