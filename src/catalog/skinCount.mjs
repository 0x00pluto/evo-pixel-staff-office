/**
 * Pipoya skin pool size (single source: skinCount.json).
 * Used by catalog.mjs and pack-office-assets.mjs.
 */
import data from './skinCount.json' with { type: 'json' }

export const SKIN_COUNT = data.SKIN_COUNT
