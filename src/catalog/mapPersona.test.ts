import { describe, expect, it } from 'vitest'
import { mapCatalogJson as mapCatalogFromCli } from '../cli/catalog.mjs'
import { SKIN_COUNT } from './skinCount'
import {
  deriveStatus,
  mapCatalogJson,
  shortName,
  workspaceToPersona,
  type CatalogJson,
  type CatalogWorkspace,
} from './mapPersona'

const SAMPLE_WORKSPACE: CatalogWorkspace = {
  dirname: 'pixel-office',
  title: '像素办公室 — evo-agent-team',
  blurb: '把花名册渲染成会走路的小人',
  lifecycle: 'active',
  owns: ['像素办公室大屏'],
  not: 'Agent 业务实现',
  siblings: [{ project: 'AgentWikiIndex', relation: 'catalog' }],
}

function sampleCatalog(): CatalogJson {
  return {
    wiki_index_version: '2.3.0',
    generated_at: '2026-09-12T00:00:00Z',
    workspaces: [SAMPLE_WORKSPACE],
  }
}

describe('shortName', () => {
  it('empty title falls back to dirname', () => {
    expect(shortName('', 'pixel-office')).toBe('pixel-office')
  })

  it.each([
    ['像素办公室 — evo-agent-team', '像素办公室'],
    ['像素办公室 – evo-agent-team', '像素办公室'],
    ['像素办公室 - evo-agent-team', '像素办公室'],
  ])('splits %s on dash variants', (title, expected) => {
    expect(shortName(title, 'pixel-office')).toBe(expected)
  })

  it('uses dirname when the title is only a dash suffix', () => {
    expect(shortName(' — leftover', 'pixel-office')).toBe('pixel-office')
  })
})

describe('deriveStatus', () => {
  it('marks experiment lifecycle first', () => {
    expect(
      deriveStatus({
        dirname: 'x',
        lifecycle: 'experiment',
        owns: ['should-not-win'],
      }),
    ).toBe('实验中')
  })

  it('uses owns[0] when short enough', () => {
    expect(deriveStatus({ dirname: 'x', owns: ['像素办公室大屏'] })).toBe(
      '像素办公室大屏',
    )
  })

  it('truncates long owns[0] to 28 chars plus ellipsis', () => {
    const owns = ['一二三四五六七八九十一二三四五六七八九十一二三四五六七八九十']
    expect(owns[0].length).toBeGreaterThan(28)
    expect(deriveStatus({ dirname: 'x', owns })).toBe(`${owns[0].slice(0, 28)}…`)
  })

  it('collapses blurb whitespace and truncates', () => {
    const blurb = '把   花名册\n渲染成会走路的小人并且状态行必须截断到二十八字以外'
    const status = deriveStatus({ dirname: 'x', blurb })
    expect(status.endsWith('…')).toBe(true)
    expect(status.replace('…', '').length).toBe(28)
    expect(status).not.toMatch(/\s{2,}/)
  })

  it('falls back to 待命', () => {
    expect(deriveStatus({ dirname: 'x' })).toBe('待命')
  })
})

describe('workspaceToPersona', () => {
  it('maps catalog fields and hashes a stable skin', () => {
    const persona = workspaceToPersona(SAMPLE_WORKSPACE)
    expect(persona.id).toBe('pixel-office')
    expect(persona.name).toBe('像素办公室')
    expect(persona.status).toBe('像素办公室大屏')
    expect(persona.lifecycle).toBe('active')
    expect(persona.owns).toEqual(['像素办公室大屏'])
    expect(persona.siblings).toEqual([
      {
        project: 'AgentWikiIndex',
        relation: 'catalog',
        capability: '',
        reference: '',
      },
    ])
    expect(persona.skin).toBeGreaterThanOrEqual(0)
    expect(persona.skin).toBeLessThan(SKIN_COUNT)
    expect(persona.tint).toBeGreaterThanOrEqual(0)
    expect(persona.tint).toBeLessThan(360)
    expect(workspaceToPersona(SAMPLE_WORKSPACE).skin).toBe(persona.skin)
  })

  it('fills defaults when optional fields are missing', () => {
    const persona = workspaceToPersona({ dirname: 'bare' })
    expect(persona).toMatchObject({
      id: 'bare',
      name: 'bare',
      title: 'bare',
      status: '待命',
      blurb: '',
      lifecycle: 'active',
      owns: [],
      not: '',
      siblings: [],
    })
  })
})

describe('mapCatalogJson', () => {
  it('only renders workspaces and ignores unmanaged', () => {
    const raw = {
      ...sampleCatalog(),
      unmanaged: [{ dirname: 'ghost', title: '不进办公室' }],
    }
    const payload = mapCatalogJson(raw, '/tmp/CATALOG.json')
    expect(payload.sourcePath).toBe('/tmp/CATALOG.json')
    expect(payload.wiki_index_version).toBe('2.3.0')
    expect(payload.agents).toHaveLength(1)
    expect(payload.agents[0]?.id).toBe('pixel-office')
  })

  it('treats missing workspaces as an empty office', () => {
    expect(mapCatalogJson({}, '/tmp/CATALOG.json').agents).toEqual([])
  })
})

describe('TS / CLI mapping twins', () => {
  it('mapCatalogJson matches catalog.mjs for the same fixture', () => {
    const raw = sampleCatalog()
    expect(mapCatalogJson(raw, '/tmp/CATALOG.json')).toEqual(
      mapCatalogFromCli(raw, '/tmp/CATALOG.json'),
    )
  })
})
