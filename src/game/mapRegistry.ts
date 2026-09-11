/** Static map id → Tiled JSON path. Exit targets must be registered here. */

export interface MapEntry {
  id: string
  /** Absolute URL path served from public/ */
  json: string
  label: string
}

export interface TilesetEntry {
  /** Name as in Tiled tilesets[].name */
  name: string
  /** Phaser texture key */
  key: string
  url: string
}

export const MAP_REGISTRY: Record<string, MapEntry> = {
  'company-a': {
    id: 'company-a',
    json: '/assets/maps/company-a.json',
    label: 'Company A Office',
  },
  'outside-stub': {
    id: 'outside-stub',
    json: '/assets/maps/outside-stub.json',
    label: 'Outside plaza stub',
  },
}

export const DEFAULT_MAP_ID = 'company-a'

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
