import { describe, expect, it } from 'vitest'
import { cellTouchesBlocked, isWallHugMiddleNode } from './pathClearance'

describe('pathClearance', () => {
  const blocked = (tx: number, ty: number) => tx === 1 && (ty === 8 || ty === 9)

  it('detects orthogonal touch to blocked cells', () => {
    expect(cellTouchesBlocked(2, 9, blocked)).toBe(true)
    expect(cellTouchesBlocked(5, 5, blocked)).toBe(false)
  })

  it('allows start/goal even when wall-hugging; blocks middle hug cells', () => {
    const start = { tx: 4, ty: 9 }
    const goal = { tx: 8, ty: 10 }
    // (2,9) touches blocked (1,9) — middle hug
    expect(isWallHugMiddleNode(2, 9, start, goal, blocked)).toBe(true)
    // start/goal exempt even if they hug
    expect(isWallHugMiddleNode(4, 9, start, goal, blocked)).toBe(false)
    expect(isWallHugMiddleNode(8, 10, start, goal, blocked)).toBe(false)
    expect(isWallHugMiddleNode(5, 5, start, goal, blocked)).toBe(false)
  })
})
