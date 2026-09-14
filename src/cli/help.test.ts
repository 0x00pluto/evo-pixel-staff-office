import { describe, expect, it } from 'vitest'
import { createServer } from 'node:http'
import {
  handleHelp,
  originFromRequest,
  renderHelpMarkdown,
} from './help.mjs'

describe('help markdown', () => {
  it('substitutes ORIGIN placeholders', () => {
    const md = renderHelpMarkdown('http://127.0.0.1:3792')
    expect(md).toContain('http://127.0.0.1:3792')
    expect(md).not.toContain('{{ORIGIN}}')
    expect(md).toContain('POST')
    expect(md).toContain('/api/catalog')
    expect(md).toContain('blocked')
    expect(md).toContain('id="agent"')
  })

  it('strips trailing slash on origin', () => {
    const md = renderHelpMarkdown('http://localhost:3780/')
    expect(md).toContain('http://localhost:3780/api/openapi.json')
    expect(md).not.toContain('http://localhost:3780//')
  })

  it('builds origin from Host header', () => {
    expect(
      originFromRequest({
        headers: { host: 'example.test:3780' },
      } as never),
    ).toBe('http://example.test:3780')
    expect(
      originFromRequest({
        headers: {
          host: 'example.test',
          'x-forwarded-proto': 'https',
        },
      } as never),
    ).toBe('https://example.test')
  })
})

describe('handleHelp', () => {
  it('serves /help.md and redirects /help', async () => {
    const server = createServer((req, res) => {
      if (!handleHelp(req, res)) {
        res.writeHead(404)
        res.end('no')
      }
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const { port } = server.address() as { port: number }
    const base = `http://127.0.0.1:${port}`

    const redirect = await fetch(`${base}/help`, { redirect: 'manual' })
    expect(redirect.status).toBe(302)
    expect(redirect.headers.get('location')).toBe('/help.md')

    const page = await fetch(`${base}/help.md`)
    expect(page.status).toBe(200)
    expect(page.headers.get('content-type')).toMatch(/markdown/)
    const text = await page.text()
    expect(text).toContain(`${base}/api/openapi.json`)
    expect(text).toContain('working')

    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    )
  })
})
