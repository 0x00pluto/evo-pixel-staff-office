/** Static map id → Tiled JSON path. Exit targets must be registered here. */

export interface MapEntry {
  id: string
  /** Absolute URL path served from public/ */
  json: string
  label: string
  /** Soft headcount this art is sized for (documentation / future select). */
  headcountMax?: number
}

export interface TilesetEntry {
  /** Name as in Tiled tilesets[].name */
  name: string
  /** Phaser texture key */
  key: string
  url: string
}

/** ≤10 / ≤25 / ≤100 tiers; only company-25 is shipped this round. */
export const OFFICE_TIER_IDS = {
  /** Reserved — falls back to company-25 until art exists */
  s10: 'company-10',
  m25: 'company-25',
  l100: 'company-100',
} as const

export const MAP_REGISTRY: Record<string, MapEntry> = {
  'company-25': {
    id: 'company-25',
    json: '/assets/maps/company-25.json',
    label: 'Office (≤25)',
    headcountMax: 25,
  },
  'outside-stub': {
    id: 'outside-stub',
    json: '/assets/maps/outside-stub.json',
    label: 'Outside plaza stub',
  },
}

export const DEFAULT_MAP_ID = 'company-25'

export const TILESET_ASSETS: TilesetEntry[] = [
  {
    name: 'tileset5_export',
    key: 'ts_tileset5_export',
    url: '/assets/maps/tilesets/tileset5_export.png',
  },
  {
    name: 'tileset6_export',
    key: 'ts_tileset6_export',
    url: '/assets/maps/tilesets/tileset6_export.png',
  },
  {
    name: 'tileset1',
    key: 'ts_tileset1',
    url: '/assets/maps/tilesets/tileset1.png',
  },
  {
    name: 'tileset1-repositioning',
    key: 'ts_tileset1-repositioning',
    url: '/assets/maps/tilesets/tileset1-repositioning.png',
  },
  {
    name: 'Special_Zones',
    key: 'ts_Special_Zones',
    url: '/assets/maps/tilesets/Special_Zones.png',
  },
]

export function getMapEntry(id: string): MapEntry | undefined {
  return MAP_REGISTRY[id]
}

export function isRegisteredMapId(id: string): boolean {
  return Object.prototype.hasOwnProperty.call(MAP_REGISTRY, id)
}

/**
 * Pick office map by headcount.
 * Thresholds: ≤10 → company-10 (fallback 25), ≤25 → company-25, ≤100 → company-100 (fallback 25).
 * This round only company-25 exists; all tiers resolve to it.
 */
export function selectOfficeMapId(agentCount: number): string {
  const n = Math.max(0, agentCount)
  if (n <= 10 && isRegisteredMapId(OFFICE_TIER_IDS.s10)) return OFFICE_TIER_IDS.s10
  if (n <= 25) return OFFICE_TIER_IDS.m25
  if (n <= 100 && isRegisteredMapId(OFFICE_TIER_IDS.l100)) return OFFICE_TIER_IDS.l100
  return OFFICE_TIER_IDS.m25
}
