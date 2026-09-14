import { describe, expect, it } from 'vitest'
import {
  DEFAULT_MAP_ID,
  getMapKind,
  isRegisteredMapId,
  OFFICE_TIER_IDS,
  selectOfficeMapId,
} from './mapRegistry'

describe('map registry', () => {
  it('registers the shipped office and world stub maps', () => {
    expect(isRegisteredMapId('company-25')).toBe(true)
    expect(isRegisteredMapId('world-map')).toBe(true)
    expect(isRegisteredMapId(OFFICE_TIER_IDS.s10)).toBe(false)
    expect(isRegisteredMapId(OFFICE_TIER_IDS.l100)).toBe(false)
    expect(DEFAULT_MAP_ID).toBe('company-25')
  })

  it('defaults missing kind to office', () => {
    expect(getMapKind('company-25')).toBe('office')
    expect(getMapKind('world-map')).toBe('world')
    expect(getMapKind('not-a-map')).toBe('office')
  })
})

describe('selectOfficeMapId', () => {
  it('uses company-25 for every shipped tier until 10/100 art exists', () => {
    expect(selectOfficeMapId(0)).toBe('company-25')
    expect(selectOfficeMapId(10)).toBe('company-25')
    expect(selectOfficeMapId(11)).toBe('company-25')
    expect(selectOfficeMapId(25)).toBe('company-25')
    expect(selectOfficeMapId(26)).toBe('company-25')
    expect(selectOfficeMapId(100)).toBe('company-25')
    expect(selectOfficeMapId(101)).toBe('company-25')
  })

  it('clamps negative headcount', () => {
    expect(selectOfficeMapId(-3)).toBe('company-25')
  })
})
