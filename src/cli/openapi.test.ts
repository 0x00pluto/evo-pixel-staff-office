import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  buildOpenApiDocument,
  serializeOpenApiDocument,
} from './openapi.mjs'
import {
  BLOCKED_TTL_MS,
  PRESENCE_STATES,
  WORKING_TTL_MS,
} from './presence-store.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')
const publicPath = join(root, 'public', 'openapi.json')

describe('buildOpenApiDocument', () => {
  it('is OpenAPI 3.1 with catalog, presence, and openapi paths', () => {
    const doc = buildOpenApiDocument()
    expect(doc.openapi).toBe('3.1.0')
    expect(doc.paths['/api/catalog']).toBeDefined()
    expect(doc.paths['/api/presence']).toBeDefined()
    expect(doc.paths['/api/openapi.json']).toBeDefined()
    expect(doc.paths['/api/catalog'].get.operationId).toBe('getCatalog')
    expect(doc.paths['/api/presence'].get.operationId).toBe('getPresence')
    expect(doc.paths['/api/presence'].post.operationId).toBe('postPresence')
  })

  it('PresenceState enum matches PRESENCE_STATES; TTL from constants', () => {
    const doc = buildOpenApiDocument()
    const schema = doc.components.schemas.PresenceState
    expect(schema.enum).toEqual([...PRESENCE_STATES])
    const desc = `${doc.info.description}\n${schema.description}`
    expect(desc).toContain(String(WORKING_TTL_MS / 1000))
    expect(desc).toContain(String(BLOCKED_TTL_MS / 1000))
  })

  it('serializes as valid JSON', () => {
    const text = serializeOpenApiDocument()
    expect(() => JSON.parse(text)).not.toThrow()
    expect(text.endsWith('\n')).toBe(true)
  })
})

describe('public/openapi.json', () => {
  it('matches buildOpenApiDocument() byte-for-byte (run pnpm gen:openapi)', () => {
    const onDisk = readFileSync(publicPath, 'utf8')
    expect(onDisk).toBe(serializeOpenApiDocument())
  })
})
