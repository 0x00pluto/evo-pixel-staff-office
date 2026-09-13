import { describe, expect, it } from 'vitest'
import {
  FOOT_BODY_H,
  FOOT_BODY_SOUTH,
  FOOT_BODY_W,
  FOOT_TOP_CLEARANCE,
  footBoxClear,
  footSafePointInCell,
} from './footHitbox'

describe('foot hitbox constants', () => {
  it('keeps a slim foot pad under the shadow; H ~ headband', () => {
    expect(FOOT_BODY_W).toBe(16)
    expect(FOOT_BODY_H).toBe(18)
    expect(FOOT_BODY_SOUTH).toBe(3)
    expect(FOOT_TOP_CLEARANCE).toBe(3)
  })
})

describe('footSafePointInCell', () => {
  it('returns center when foot box already clear with top clearance', () => {
    const open = (tx: number, ty: number) => tx >= 0 && ty >= 0
    const p = footSafePointInCell(2, 9, open, 32)
    expect(p).toEqual({ x: 2 * 32 + 16, y: 9 * 32 + 16 })
  })

  it('nudges south in-cell when center hits northern collide tile', () => {
    // (2,8) blocked like counter; (2,9) free — center foot top samples (2,8)
    const open = (tx: number, ty: number) => !(tx === 2 && ty === 8)
    expect(footBoxClear(2 * 32 + 16, 9 * 32 + 16, open, 32)).toBe(false)
    const p = footSafePointInCell(2, 9, open, 32)
    expect(p).not.toBeNull()
    expect(Math.floor(p!.x / 32)).toBe(2)
    expect(Math.floor(p!.y / 32)).toBe(9)
    expect(footBoxClear(p!.x, p!.y, open, 32)).toBe(true)
    expect(
      footBoxClear(p!.x, p!.y, open, 32, FOOT_TOP_CLEARANCE),
    ).toBe(true)
    // Box top + clearance stays south of blocked cell bottom (y=288).
    expect(p!.y - FOOT_BODY_H - FOOT_TOP_CLEARANCE).toBeGreaterThanOrEqual(
      8 * 32 + 32,
    )
  })

  it('returns null when no foot-safe point exists in the cell', () => {
    const open = () => false
    expect(footSafePointInCell(2, 9, open, 32)).toBeNull()
  })
})
