import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  createCatalogSource,
  emptyCatalogPayload,
  JsonFileSource,
  mapCatalogJson,
  parseCatalogBody,
  resolveCatalogPath,
  resolveSeedForBoot,
  RUNTIME_EMPTY_SOURCE,
  RuntimeCatalog,
  userCatalogPath,
} from './catalog.mjs'
import { createPresenceStore } from './presence-store.mjs'

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

describe('parseCatalogBody', () => {
  it('accepts empty workspaces', () => {
    expect(parseCatalogBody({ workspaces: [] })).toEqual({
      ok: true,
      raw: { workspaces: [] },
    })
  })

  it('rejects missing workspaces', () => {
    expect(parseCatalogBody({ unmanaged: [] }).ok).toBe(false)
  })

  it('rejects non-objects', () => {
    expect(parseCatalogBody(null).ok).toBe(false)
    expect(parseCatalogBody([]).ok).toBe(false)
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

  it('returns null when nothing exists', () => {
    const dir = makeScratch()
    expect(
      resolveCatalogPath({
        cliPath: undefined,
        envPath: undefined,
        cwd: dir,
      }),
    ).toBeNull()
  })
})

describe('resolveSeedForBoot', () => {
  it('marks missing explicit path', () => {
    const dir = makeScratch()
    const missing = path.join(dir, 'nope.json')
    const r = resolveSeedForBoot({
      cliPath: missing,
      envPath: undefined,
      cwd: dir,
    })
    expect(r.explicitSeed).toBe(true)
    expect(r.missingExplicit).toBe(path.resolve(missing))
    expect(r.seedPath).toBeNull()
  })

  it('probes cwd without fail-fast', () => {
    const dir = makeScratch()
    const r = resolveSeedForBoot({
      cliPath: null,
      envPath: undefined,
      cwd: dir,
    })
    expect(r.explicitSeed).toBe(false)
    expect(r.seedPath).toBeNull()
  })
})

describe('userCatalogPath', () => {
  it('uses PIXEL_OFFICE_HOME when set', () => {
    const dir = makeScratch()
    expect(userCatalogPath({ envHome: dir })).toBe(path.join(dir, 'catalog.json'))
  })

  it('defaults under ~/.pixel-office', () => {
    const home = makeScratch()
    expect(userCatalogPath({ home, envHome: null })).toBe(
      path.join(home, '.pixel-office', 'catalog.json'),
    )
  })
})

describe('RuntimeCatalog', () => {
  it('boots empty when no userdir and no seed', () => {
    const dir = makeScratch()
    const cat = new RuntimeCatalog({
      userPath: path.join(dir, 'catalog.json'),
      seedPath: null,
    })
    const payload = cat.boot()
    expect(payload.sourcePath).toBe(RUNTIME_EMPTY_SOURCE)
    expect(payload.agents).toEqual([])
    expect(emptyCatalogPayload().agents).toEqual([])
  })

  it('loads valid userdir over seed', () => {
    const dir = makeScratch()
    const userPath = path.join(dir, 'catalog.json')
    const seedPath = path.join(dir, 'seed.json')
    writeFileSync(
      userPath,
      JSON.stringify({
        workspaces: [{ dirname: 'from-user', title: 'User' }],
      }),
    )
    writeFileSync(
      seedPath,
      JSON.stringify({
        workspaces: [{ dirname: 'from-seed', title: 'Seed' }],
      }),
    )
    const cat = new RuntimeCatalog({ userPath, seedPath })
    const payload = cat.boot()
    expect(payload.agents.map((a: { id: string }) => a.id)).toEqual(['from-user'])
    expect(payload.sourcePath).toBe(userPath)
  })

  it('loads seed into memory when userdir missing (R0 no copy)', () => {
    const dir = makeScratch()
    const userPath = path.join(dir, 'user', 'catalog.json')
    const seedPath = path.join(dir, 'seed.json')
    writeFileSync(
      seedPath,
      JSON.stringify({
        workspaces: [{ dirname: 'seeded', title: 'Seeded — office' }],
      }),
    )
    const cat = new RuntimeCatalog({ userPath, seedPath })
    const payload = cat.boot()
    expect(payload.agents[0].id).toBe('seeded')
    expect(payload.sourcePath).toBe(seedPath)
    expect(fsExists(userPath)).toBe(false)
  })

  it('replace persists and updates cache; invalid leaves old intact', () => {
    const dir = makeScratch()
    const userPath = path.join(dir, 'catalog.json')
    const cat = new RuntimeCatalog({ userPath, seedPath: null })
    cat.boot()

    const ok = cat.replace(SAMPLE)
    expect(ok.ok).toBe(true)
    if (!ok.ok) return
    expect(ok.payload.agents[0].id).toBe('pixel-office')
    expect(ok.payload.sourcePath).toBe(userPath)
    const onDisk = JSON.parse(readFileSync(userPath, 'utf8'))
    expect(onDisk.workspaces[0].dirname).toBe('pixel-office')

    const before = readFileSync(userPath, 'utf8')
    const bad = cat.replace({ unmanaged: [] })
    expect(bad.ok).toBe(false)
    expect(readFileSync(userPath, 'utf8')).toBe(before)
    expect(cat.cached?.agents[0].id).toBe('pixel-office')
  })

  it('allows empty workspaces as clear-via-overwrite', () => {
    const dir = makeScratch()
    const userPath = path.join(dir, 'catalog.json')
    const cat = new RuntimeCatalog({ userPath })
    cat.boot()
    cat.replace(SAMPLE)
    const cleared = cat.replace({ workspaces: [] })
    expect(cleared.ok).toBe(true)
    if (!cleared.ok) return
    expect(cleared.payload.agents).toEqual([])
    expect(JSON.parse(readFileSync(userPath, 'utf8')).workspaces).toEqual([])
  })

  it('retainIds drops presence rows for removed agents after replace', () => {
    const dir = makeScratch()
    const userPath = path.join(dir, 'catalog.json')
    const cat = new RuntimeCatalog({ userPath })
    cat.boot()
    cat.replace({
      workspaces: [
        { dirname: 'a', title: 'A' },
        { dirname: 'b', title: 'B' },
      ],
    })
    const store = createPresenceStore()
    store.upsert({ id: 'a', state: 'working', summary: 'x' }, ['a', 'b'])
    store.upsert({ id: 'b', state: 'blocked', summary: 'y' }, ['a', 'b'])

    cat.replace({ workspaces: [{ dirname: 'a', title: 'A' }] })
    store.retainIds(cat.cached!.agents.map((a: { id: string }) => a.id))
    const snap = store.snapshot(['a'])
    expect(snap).toHaveLength(1)
    expect(snap[0].id).toBe('a')
    // b should be gone from internal map — snapshot for b alone would be implicit idle if listed
    expect(store.snapshot(['a', 'b']).find((r: { id: string }) => r.id === 'b')?.updatedAt).toBe(0)
  })

  it('fail-fast on explicit invalid seed', () => {
    const dir = makeScratch()
    const seedPath = path.join(dir, 'bad.json')
    writeFileSync(seedPath, '{not json', 'utf8')
    const cat = new RuntimeCatalog({
      userPath: path.join(dir, 'catalog.json'),
      seedPath,
      explicitSeed: true,
    })
    expect(() => cat.boot()).toThrow(/不是合法 JSON/)
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

function fsExists(p: string): boolean {
  return existsSync(p)
}
