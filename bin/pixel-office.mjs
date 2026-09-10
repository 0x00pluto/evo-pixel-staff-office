#!/usr/bin/env node
import { pathToFileURL } from 'node:url'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const mjs = path.join(root, 'src', 'cli', 'run.mjs')

try {
  await import(pathToFileURL(mjs).href)
} catch (err) {
  console.error('[pixel-office] failed to start:', err instanceof Error ? err.message : err)
  process.exit(1)
}
