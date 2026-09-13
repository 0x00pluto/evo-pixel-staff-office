import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  applianceKeyFromSlotKey,
  buildPropClusters,
  clusterPropCells,
  collectStandSlots,
  parsePoiStand,
  parsePropActivation,
  parseStandSeed,
  parseStandSides,
  parseTilePoiKind,
  sideOfFootprintNeighbor,
  slotKeyFor,
  tilePropCollides,
  type PropCell,
} from './mapProp'

afterEach(() => {
  vi.restoreAllMocks()
})

function cell(
  partial: Partial<PropCell> &
    Pick<PropCell, 'tx' | 'ty' | 'layerName' | 'gid' | 'localId'>,
): PropCell {
  return {
    tilesetName: 'office-anim',
    kind: 'print',
    collides: false,
    hasAnimation: false,
    overlay: partial.layerName.startsWith('abovePlayer'),
    ...partial,
  }
}

describe('parseTilePoiKind', () => {
  it('accepts causal kinds (print / coffee) from record or array props', () => {
    expect(parseTilePoiKind({ poiKind: 'print' })).toBe('print')
    expect(parseTilePoiKind({ poiKind: 'coffee' })).toBe('coffee')
    expect(
      parseTilePoiKind([{ name: 'poiKind', value: 'Print' }]),
    ).toBe('print')
    expect(
      parseTilePoiKind([{ name: 'poiKind', value: 'Coffee' }]),
    ).toBe('coffee')
  })

  it('rejects seat kinds and missing values', () => {
    expect(parseTilePoiKind({ poiKind: 'lounge' })).toBeNull()
    expect(parseTilePoiKind({ poiKind: 'meeting' })).toBeNull()
    expect(parseTilePoiKind(undefined)).toBeNull()
  })
})

describe('tile props parsers', () => {
  it('reads collides / standSides / activation / standSeed / poiStand', () => {
    expect(tilePropCollides({ collides: true })).toBe(true)
    expect(parseStandSides({ standSides: 'left,right' })).toEqual([
      'left',
      'right',
    ])
    expect(parseStandSeed({ standSeed: 'footprint' })).toBe('footprint')
    expect(parseStandSeed({})).toBeNull()
    expect(parsePropActivation({ poiActivation: 'all' })).toBe('all')
    expect(parsePoiStand({ poiStand: true })).toBe(true)
    expect(parsePoiStand({})).toBe(false)
  })
})

describe('applianceKeyFromSlotKey', () => {
  it('strips slot suffix', () => {
    expect(applianceKeyFromSlotKey('poi_print_0#2')).toBe('poi_print_0')
    expect(slotKeyFor('poi_print_0', 2)).toBe('poi_print_0#2')
  })
})

describe('clusterPropCells', () => {
  it('merges same-cell layers and keeps gapped printers apart', () => {
    expect(
      clusterPropCells([
        cell({ tx: 5, ty: 5, layerName: 'furniture', gid: 1, localId: 20 }),
        cell({
          tx: 5,
          ty: 5,
          layerName: 'abovePlayer1',
          gid: 2,
          localId: 3,
        }),
      ]),
    ).toHaveLength(1)
    expect(
      clusterPropCells([
        cell({ tx: 2, ty: 2, layerName: 'furniture', gid: 1, localId: 20 }),
        cell({ tx: 5, ty: 2, layerName: 'furniture', gid: 2, localId: 20 }),
      ]),
    ).toHaveLength(2)
  })
})

describe('collectStandSlots stand pads', () => {
  it('footprint seed: 3x3 outer ring has 12 slots', () => {
    const footprint: Array<{ tx: number; ty: number }> = []
    for (let ty = 1; ty <= 3; ty++) {
      for (let tx = 1; tx <= 3; tx++) footprint.push({ tx, ty })
    }
    const blocked = new Set(footprint.map((t) => `${t.tx},${t.ty}`))
    const walkable = (tx: number, ty: number) =>
      tx >= 0 && tx <= 4 && ty >= 0 && ty <= 4 && !blocked.has(`${tx},${ty}`)
    const slots = collectStandSlots({
      seeds: footprint,
      sideBBoxTiles: footprint,
      focus: { tx: 2, ty: 2 },
      isWalkable: walkable,
      standSides: null,
      collideBlocked: blocked,
    })
    expect(slots).toHaveLength(12)
  })

  it('case A: collides seed + left,right → soft side pads, not top-left outer', () => {
    // 2x3 printer; only center-bottom collides
    const collide = { tx: 23, ty: 17 }
    const soft = [
      { tx: 22, ty: 16 },
      { tx: 23, ty: 16 },
      { tx: 24, ty: 16 },
      { tx: 22, ty: 17 },
      { tx: 24, ty: 17 },
    ]
    const collideBlocked = new Set(['23,17'])
    const walkable = (tx: number, ty: number) => {
      if (collideBlocked.has(`${tx},${ty}`)) return false
      // open floor + soft cells
      return (
        soft.some((s) => s.tx === tx && s.ty === ty) ||
        (tx === 21 && ty === 16) || // old bad top-left outer
        (tx === 23 && ty === 18) // below body
      )
    }
    const slots = collectStandSlots({
      seeds: [collide],
      sideBBoxTiles: [collide],
      focus: collide,
      isWalkable: walkable,
      standSides: ['left', 'right'],
      collideBlocked,
    })
    expect(slots.map((s) => ({ tx: s.tx, ty: s.ty }))).toEqual([
      { tx: 22, ty: 17 },
      { tx: 24, ty: 17 },
    ])
    expect(slots.some((s) => s.tx === 21 && s.ty === 16)).toBe(false)
  })

  it('case A with down: includes floor below collide', () => {
    const collide = { tx: 23, ty: 17 }
    const collideBlocked = new Set(['23,17'])
    const walkable = (tx: number, ty: number) =>
      !collideBlocked.has(`${tx},${ty}`) &&
      ((tx === 22 && ty === 17) ||
        (tx === 24 && ty === 17) ||
        (tx === 23 && ty === 18) ||
        (tx === 23 && ty === 16))
    const slots = collectStandSlots({
      seeds: [collide],
      sideBBoxTiles: [collide],
      focus: collide,
      isWalkable: walkable,
      standSides: ['left', 'right', 'down'],
      collideBlocked,
    })
    expect(slots.map((s) => `${s.tx},${s.ty}`).sort()).toEqual([
      '22,17',
      '23,18',
      '24,17',
    ])
  })

  it('case B: no collides → 1x2 footprint has 6 outer neighbors', () => {
    const footprint = [
      { tx: 5, ty: 5 },
      { tx: 6, ty: 5 },
    ]
    const blocked = new Set(['5,5', '6,5'])
    const walkable = (tx: number, ty: number) =>
      tx >= 4 && tx <= 7 && ty >= 4 && ty <= 6 && !blocked.has(`${tx},${ty}`)
    const slots = collectStandSlots({
      seeds: footprint,
      sideBBoxTiles: footprint,
      focus: { tx: 5, ty: 5 },
      isWalkable: walkable,
      standSides: null,
      collideBlocked: blocked,
    })
    expect(slots).toHaveLength(6)
  })

  it('case C: poiStand manual pads override auto ring', () => {
    const slots = collectStandSlots({
      seeds: [{ tx: 23, ty: 17 }],
      sideBBoxTiles: [{ tx: 23, ty: 17 }],
      focus: { tx: 23, ty: 17 },
      isWalkable: () => true,
      standSides: ['left', 'right', 'down'],
      collideBlocked: new Set(['23,17']),
      manualPads: [
        { tx: 22, ty: 17 },
        { tx: 24, ty: 17 },
      ],
    })
    expect(slots.map((s) => ({ tx: s.tx, ty: s.ty }))).toEqual([
      { tx: 22, ty: 17 },
      { tx: 24, ty: 17 },
    ])
  })

  it('classifies neighbor sides from bbox', () => {
    const bbox = { minX: 1, maxX: 3, minY: 1, maxY: 3 }
    expect(sideOfFootprintNeighbor(0, 2, bbox)).toBe('left')
    expect(sideOfFootprintNeighbor(4, 2, bbox)).toBe('right')
  })

  it('strict standSides: does not fall back to north when L/R/down blocked', () => {
    // Coffee 1x2; north (1,7) free; only right-of-bottom (2,9) among allowed sides free
    const footprint = [
      { tx: 1, ty: 8 },
      { tx: 1, ty: 9 },
    ]
    const blocked = new Set([
      '1,8',
      '1,9',
      '0,8',
      '0,9',
      '2,8',
      '1,10',
    ])
    const walkable = (tx: number, ty: number) =>
      !blocked.has(`${tx},${ty}`) &&
      ((tx === 1 && ty === 7) || (tx === 2 && ty === 9) || (tx === 3 && ty === 9))
    const slots = collectStandSlots({
      seeds: footprint,
      sideBBoxTiles: footprint,
      focus: { tx: 1, ty: 8 },
      isWalkable: walkable,
      standSides: ['left', 'right', 'down'],
      collideBlocked: blocked,
    })
    expect(slots.map((s) => `${s.tx},${s.ty}`)).toEqual(['2,9'])
    expect(slots.some((s) => s.tx === 1 && s.ty === 7)).toBe(false)
  })
})

describe('buildPropClusters', () => {
  it('numbers appliances; collides seed stands on soft L/R', () => {
    const clusters = buildPropClusters(
      [
        cell({
          tx: 5,
          ty: 5,
          layerName: 'furniture',
          gid: 100,
          localId: 20,
          collides: true,
          hasAnimation: true,
          standSides: ['left', 'right'],
        }),
        cell({
          tx: 4,
          ty: 5,
          layerName: 'furniture',
          gid: 99,
          localId: 19,
        }),
        cell({
          tx: 6,
          ty: 5,
          layerName: 'furniture',
          gid: 101,
          localId: 21,
        }),
        cell({
          tx: 11,
          ty: 5,
          layerName: 'furniture',
          gid: 200,
          localId: 20,
          collides: true,
        }),
        cell({
          tx: 10,
          ty: 5,
          layerName: 'furniture',
          gid: 199,
          localId: 19,
        }),
        cell({
          tx: 12,
          ty: 5,
          layerName: 'furniture',
          gid: 201,
          localId: 21,
        }),
      ],
      () => true,
    )
    expect(clusters.map((c) => c.key)).toEqual(['poi_print_0', 'poi_print_1'])
    expect(clusters[0].standSeed).toBe('collides')
    expect(clusters[0].slots.map((s) => ({ tx: s.tx, ty: s.ty }))).toEqual([
      { tx: 4, ty: 5 },
      { tx: 6, ty: 5 },
    ])
  })

  it('printer 2x3 does not offer top-left outer slot', () => {
    const cells: PropCell[] = []
    for (const tx of [22, 23, 24]) {
      cells.push(
        cell({
          tx,
          ty: 16,
          layerName: 'abovePlayer1',
          gid: 300 + tx,
          localId: 3,
        }),
        cell({
          tx,
          ty: 17,
          layerName: 'furniture',
          gid: 400 + tx,
          localId: 19,
          collides: tx === 23,
          standSides: tx === 23 ? ['left', 'right', 'down'] : null,
        }),
      )
    }
    const open = new Set([
      '21,16',
      '22,16',
      '23,16',
      '24,16',
      '25,16',
      '21,17',
      '22,17',
      '24,17',
      '25,17',
      '22,18',
      '23,18',
      '24,18',
    ])
    const clusters = buildPropClusters(cells, (tx, ty) =>
      open.has(`${tx},${ty}`),
    )
    expect(clusters).toHaveLength(1)
    const pads = clusters[0].slots.map((s) => `${s.tx},${s.ty}`)
    expect(pads).toContain('22,17')
    expect(pads).toContain('24,17')
    expect(pads).toContain('23,18')
    expect(pads).not.toContain('21,16')
  })

  it('poiStand on soft cells overrides auto', () => {
    const clusters = buildPropClusters(
      [
        cell({
          tx: 5,
          ty: 5,
          layerName: 'furniture',
          gid: 1,
          localId: 20,
          collides: true,
          standSides: ['left', 'right', 'down'],
        }),
        cell({
          tx: 4,
          ty: 5,
          layerName: 'furniture',
          gid: 2,
          localId: 19,
          poiStand: true,
        }),
      ],
      () => true,
    )
    expect(clusters[0].slots.map((s) => ({ tx: s.tx, ty: s.ty }))).toEqual([
      { tx: 4, ty: 5 },
    ])
  })

  it('standSeed=footprint restores full outer ring', () => {
    const clusters = buildPropClusters(
      [
        cell({
          tx: 5,
          ty: 5,
          layerName: 'furniture',
          gid: 1,
          localId: 20,
          collides: true,
          standSeed: 'footprint',
        }),
        cell({
          tx: 4,
          ty: 5,
          layerName: 'furniture',
          gid: 2,
          localId: 19,
        }),
        cell({
          tx: 6,
          ty: 5,
          layerName: 'furniture',
          gid: 3,
          localId: 21,
        }),
      ],
      (tx, ty) => !(tx >= 4 && tx <= 6 && ty === 5),
    )
    // footprint 4,5 / 5,5 / 6,5 — outer ring excludes soft interior
    expect(clusters[0].slots.length).toBeGreaterThanOrEqual(1)
    expect(
      clusters[0].slots.every(
        (s) => !(s.tx >= 4 && s.tx <= 6 && s.ty === 5),
      ),
    ).toBe(true)
  })

  it('coffee on counter: tile-walkable right pad only, never north', () => {
    const open = new Set(['2,9', '1,7', '3,9'])
    const clusters = buildPropClusters(
      [
        cell({
          tx: 1,
          ty: 8,
          layerName: 'aboveFurniture',
          gid: 1,
          localId: 9,
          kind: 'coffee',
        }),
        cell({
          tx: 1,
          ty: 9,
          layerName: 'aboveFurniture',
          gid: 2,
          localId: 25,
          kind: 'coffee',
          hasAnimation: true,
          standSides: ['right'],
        }),
      ],
      (tx, ty) => open.has(`${tx},${ty}`),
    )
    expect(clusters).toHaveLength(1)
    expect(clusters[0].slots.map((s) => `${s.tx},${s.ty}`)).toEqual(['2,9'])
  })
})
