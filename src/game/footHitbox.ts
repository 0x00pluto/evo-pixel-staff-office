/**
 * Agent foot hitbox (sprite origin = feet center). Shared by OfficeScene walk
 * checks and stand-pad foot-safe placement beside counters.
 *
 * Box: [x−W/2, y−H] → [x+W/2, y+SOUTH]
 * - W=16 (WA-ish): easier narrow aisles; was 24 and caught L-counter corners
 * - H=18: ~red headband / brows on 32px sprites (was 24 into hair; scraped counters)
 * - SOUTH=3: matches foot-shadow ellipse half-height (~3px); was 2 (1px peek) / 8 (too far)
 * - TOP_CLEARANCE: stand pads keep this many px of free space above the box top
 *
 * Debug (Toolbar「碰撞盒」): map collides=red, foot AABB=green, overlap=orange;
 * white crosshair=feet origin, cyan=causal stand, yellow diamond=Point POI.
 */
export const FOOT_BODY_W = 16
export const FOOT_BODY_H = 18
export const FOOT_BODY_SOUTH = 3
/** Extra free space above foot-box top when placing causal stand pads. */
export const FOOT_TOP_CLEARANCE = 3

export type FootPoint = { x: number; y: number }

/** True if foot AABB samples all land on walkable tiles. */
export function footBoxClear(
  wx: number,
  wy: number,
  isTileWalkable: (tx: number, ty: number) => boolean,
  cellSize = 32,
  topClearance = 0,
): boolean {
  const hw = FOOT_BODY_W / 2
  const top = wy - FOOT_BODY_H - topClearance
  const bottom = wy + FOOT_BODY_SOUTH
  const samples: FootPoint[] = [
    { x: wx - hw, y: top },
    { x: wx + hw, y: top },
    { x: wx - hw, y: bottom },
    { x: wx + hw, y: bottom },
    { x: wx, y: (top + bottom) / 2 },
  ]
  return samples.every((p) => {
    const tx = Math.floor(p.x / cellSize)
    const ty = Math.floor(p.y / cellSize)
    return isTileWalkable(tx, ty)
  })
}

/**
 * Prefer cell center; else nudge down/right within the same cell until the
 * foot box clears with top clearance (stand pads under counters). null = none.
 */
export function footSafePointInCell(
  tx: number,
  ty: number,
  isTileWalkable: (tx: number, ty: number) => boolean,
  cellSize = 32,
  step = 2,
): FootPoint | null {
  const x0 = tx * cellSize
  const y0 = ty * cellSize
  const x1 = x0 + cellSize
  const y1 = y0 + cellSize
  const cx = x0 + cellSize / 2
  const cy = y0 + cellSize / 2
  const clear = (x: number, y: number) =>
    footBoxClear(x, y, isTileWalkable, cellSize, FOOT_TOP_CLEARANCE)

  if (clear(cx, cy)) {
    return { x: cx, y: cy }
  }
  // Prefer south then east — clears northern counter overhang into this cell.
  for (let y = cy; y < y1 - 1; y += step) {
    for (let x = cx; x < x1 - 1; x += step) {
      if (clear(x, y)) return { x, y }
    }
    for (let x = cx; x > x0 + 1; x -= step) {
      if (clear(x, y)) return { x, y }
    }
  }
  for (let y = cy; y > y0 + FOOT_BODY_H; y -= step) {
    for (let x = cx; x < x1 - 1; x += step) {
      if (clear(x, y)) return { x, y }
    }
  }
  return null
}
