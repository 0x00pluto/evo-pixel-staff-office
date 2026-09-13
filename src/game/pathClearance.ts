/**
 * Path helpers: wall-hug middle nodes force agents into concave corners
 * (coffee counter). Used when repathing after a stuck slide.
 */

/** True if any orthogonal neighbor is a collide / blocked tile. */
export function cellTouchesBlocked(
  tx: number,
  ty: number,
  isBlocked: (tx: number, ty: number) => boolean,
): boolean {
  return (
    isBlocked(tx - 1, ty) ||
    isBlocked(tx + 1, ty) ||
    isBlocked(tx, ty - 1) ||
    isBlocked(tx, ty + 1)
  )
}

/**
 * Intermediate BFS nodes that sit next to walls — skip these when seeking a
 * detour. Start and goal stay allowed (goal may be a tight causal stand pad).
 */
export function isWallHugMiddleNode(
  tx: number,
  ty: number,
  start: { tx: number; ty: number },
  goal: { tx: number; ty: number },
  isBlocked: (tx: number, ty: number) => boolean,
): boolean {
  if (tx === start.tx && ty === start.ty) return false
  if (tx === goal.tx && ty === goal.ty) return false
  if (isBlocked(tx, ty)) return true
  return cellTouchesBlocked(tx, ty, isBlocked)
}
