/**
 * Runtime help document: GET /help.md (and /help → redirect).
 * Template: src/cli/help.md with {{ORIGIN}} placeholders.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const TEMPLATE_PATH = path.join(__dirname, 'help.md')

let cachedTemplate = null

export function loadHelpTemplate() {
  if (cachedTemplate != null) return cachedTemplate
  cachedTemplate = fs.readFileSync(TEMPLATE_PATH, 'utf8')
  return cachedTemplate
}

/** @param {string} origin e.g. http://localhost:3780 (no trailing slash) */
export function renderHelpMarkdown(origin) {
  const base = String(origin || '').replace(/\/$/, '') || 'http://localhost:3780'
  return loadHelpTemplate().split('{{ORIGIN}}').join(base)
}

/**
 * Resolve request origin from Host (+ forwarded proto).
 * @param {import('http').IncomingMessage} req
 */
export function originFromRequest(req) {
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:3780'
  const protoHeader = req.headers['x-forwarded-proto']
  const proto = typeof protoHeader === 'string' ? protoHeader.split(',')[0].trim() : 'http'
  return `${proto}://${host}`
}

/**
 * @param {import('http').IncomingMessage} req
 * @param {import('http').ServerResponse} res
 * @returns {boolean} true if handled
 */
export function handleHelp(req, res) {
  const method = req.method || 'GET'
  if (method !== 'GET' && method !== 'HEAD') return false

  let pathname
  try {
    pathname = new URL(req.url || '/', 'http://localhost').pathname
  } catch {
    return false
  }

  if (pathname === '/help') {
    res.writeHead(302, { Location: '/help.md' })
    res.end()
    return true
  }

  if (pathname !== '/help.md') return false

  const body = renderHelpMarkdown(originFromRequest(req))
  res.writeHead(200, {
    'Content-Type': 'text/markdown; charset=utf-8',
    'Cache-Control': 'no-store',
  })
  if (method === 'HEAD') {
    res.end()
  } else {
    res.end(body)
  }
  return true
}
