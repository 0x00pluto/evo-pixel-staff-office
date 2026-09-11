/**
 * Pipoya skin pool size (single source: skinCount.json).
 * Must match scripts/pipoya-64-manifest.txt line count after `pnpm pack:assets`.
 *
 * Aligns with WA character *method* (32×32 frames, foot hitbox), not WA's
 * default pool size of 24. To grow (e.g. 128): extend the manifest, bump
 * skinCount.json, then `pnpm pack:assets`.
 */
import data from './skinCount.json'

export const SKIN_COUNT: number = data.SKIN_COUNT
