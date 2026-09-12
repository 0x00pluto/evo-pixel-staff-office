import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  createCatalogSource,
  JsonFileSource,
  mapCatalogJson,
  resolveCatalogPath,
} from './catalog.mjs'

const SAMPLE = {
  wiki_index_version: '2.3.0',
  workspaces: [
    {
      dirname: 'pixel-office',
      title: '像素办公室 — evo-agent-team',
      owns: ['像素办公室大屏'],
    },
  ],
  unmanaged: [{ dirname: 'ghost' }],
}

let scratch: string | undefined

function makeScratch(): string {
  scratch = mkdtempSync(path.join(tmpdir(), 'evo-catalog-'))
  return scratch
}

afterEach(() => {
  if (scratch) rmSync(scratch, { recursive: true, force: true })
  scratch = undefined
})

describe('mapCatalogJson', () => {
  it('drops unmanaged rows', () => {
    const payload = mapCatalogJson(SAMPLE, '/tmp/CATALOG.json')
    expect(payload.agents.map((a: { id: string }) => a.id)).toEqual([
      'pixel-office',
    ])
  })
})

describe('JsonFileSource', () => {
  it('loads a valid catalog', async () => {
    const dir = makeScratch()
    const filePath = path.join(dir, 'CATALOG.json')
    writeFileSync(filePath, JSON.stringify(SAMPLE), 'utf8')
    const payload = await new JsonFileSource(filePath).load()
    expect(payload.sourcePath).toBe(filePath)
    expect(payload.agents).toHaveLength(1)
    expect(payload.agents[0].name).toBe('像素办公室')
  })

  it('rejects a missing file', async () => {
    const filePath = path.join(makeScratch(), 'missing.json')
    await expect(new JsonFileSource(filePath).load()).rejects.toThrow(
      /花名册不存在/,
    )
  })

  it('rejects invalid JSON', async () => {
    const filePath = path.join(makeScratch(), 'CATALOG.json')
    writeFileSync(filePath, '{not json', 'utf8')
    await expect(new JsonFileSource(filePath).load()).rejects.toThrow(
      /不是合法 JSON/,
    )
  })

  it('rejects catalogs without a workspaces array', async () => {
    const filePath = path.join(makeScratch(), 'CATALOG.json')
    writeFileSync(filePath, JSON.stringify({ unmanaged: [] }), 'utf8')
    await expect(new JsonFileSource(filePath).load()).rejects.toThrow(
      /缺少 workspaces 数组/,
    )
  })
})

describe('resolveCatalogPath', () => {
  it('prefers --catalog over env and cwd fallbacks', () => {
    const dir = makeScratch()
    const cliPath = path.join(dir, 'cli.json')
    const envPath = path.join(dir, 'env.json')
    writeFileSync(cliPath, '{}')
    writeFileSync(envPath, '{}')
    writeFileSync(path.join(dir, 'CATALOG.json'), '{}')
    expect(
      resolveCatalogPath({
        cliPath,
        envPath,
        cwd: dir,
      }),
    ).toBe(path.resolve(cliPath))
  })

  it('uses EVO_AGENT_CATALOG when --catalog is omitted', () => {
    const dir = makeScratch()
    const envPath = path.join(dir, 'env.json')
    writeFileSync(envPath, '{}')
    writeFileSync(path.join(dir, 'CATALOG.json'), '{}')
    expect(
      resolveCatalogPath({
        cliPath: undefined,
        envPath,
        cwd: dir,
      }),
    ).toBe(path.resolve(envPath))
  })

  it('falls back to ../AgentWikiIndex/CATALOG.json', () => {
    const root = makeScratch()
    const cwd = path.join(root, 'evo-agent-team')
    const wiki = path.join(root, 'AgentWikiIndex')
    mkdirSync(cwd)
    mkdirSync(wiki)
    const catalog = path.join(wiki, 'CATALOG.json')
    writeFileSync(catalog, '{}')
    expect(
      resolveCatalogPath({
        cliPath: undefined,
        envPath: undefined,
        cwd,
      }),
    ).toBe(catalog)
  })

  it('throws with the tried paths when nothing exists', () => {
    const dir = makeScratch()
    expect(() =>
      resolveCatalogPath({
        cliPath: undefined,
        envPath: undefined,
        cwd: dir,
      }),
    ).toThrow(/找不到 CATALOG.json/)
  })
})

describe('createCatalogSource', () => {
  it('builds JsonFileSource for kind json', () => {
    expect(createCatalogSource({ kind: 'json', path: '/tmp/x.json' })).toBeInstanceOf(
      JsonFileSource,
    )
  })

  it('rejects unknown source kinds', () => {
    expect(() => createCatalogSource({ kind: 'sqlite', path: 'x' })).toThrow(
      /不支持的数据源/,
    )
  })
})
