/**
 * Write public/openapi.json from buildOpenApiDocument() (single source of truth).
 * Usage: pnpm gen:openapi
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { serializeOpenApiDocument } from '../src/cli/openapi.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outPath = path.join(root, 'public', 'openapi.json')

fs.mkdirSync(path.dirname(outPath), { recursive: true })
fs.writeFileSync(outPath, serializeOpenApiDocument(), 'utf8')
console.log(`[gen:openapi] wrote ${path.relative(root, outPath)}`)
