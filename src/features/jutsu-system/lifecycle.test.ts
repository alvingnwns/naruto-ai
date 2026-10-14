import { describe, expect, it } from 'vitest'
import { JUTSU_BY_ID } from '../../config/jutsu'
import { IDLE_STATE, activate, chargeLevel, release, tick } from './lifecycle'

describe('jutsu lifecycle', () => {
  const def = JUTSU_BY_ID.rasengan

  it('walks charging -> ready -> released -> impact -> idle on timers', () => {
    let s = activate('rasengan', 0)
    expect(s.phase).toBe('charging')
    s = tick(s, def.chargeMs)
    expect(s.phase).toBe('ready')
    s = release(s, 2000)
    expect(s.phase).toBe('released')
    s = tick(s, 2000 + def.releaseMs)
    expect(s.phase).toBe('impact')
    s = tick(s, 2000 + def.releaseMs + def.impactMs)
    expect(s).toBe(IDLE_STATE)
  })

  it('allows releasing mid-charge but not when idle or already released', () => {
    expect(release(IDLE_STATE, 10)).toBe(IDLE_STATE)
    const charging = activate('katon', 0)
    const released = release(charging, 100)
    expect(released.phase).toBe('released')
    expect(release(released, 200)).toBe(released)
  })

  it('does not change state before a timer elapses', () => {
    const s = activate('chidori', 0)
    expect(tick(s, 10)).toBe(s)
  })

  it('reports charge level 0..1', () => {
    const s = activate('rasengan', 0)
    expect(chargeLevel(s, def.chargeMs / 2)).toBeCloseTo(0.5)
    expect(chargeLevel(s, def.chargeMs * 3)).toBe(1)
    expect(chargeLevel(IDLE_STATE, 0)).toBe(0)
  })
})
