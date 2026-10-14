import { describe, expect, it } from 'vitest'
import type { Landmark } from '../gesture-recognition/features'
import { OneEuroFilter } from './oneEuro'
import { HandStabilizer } from './stabilizer'

/** A 21-point hand whose palm centre is at (cx, cy); hand size is ~0.1. */
function hand(cx: number, cy: number): Landmark[] {
  const lm: Landmark[] = Array.from({ length: 21 }, () => ({ x: cx, y: cy, z: 0 }))
  lm[0] = { x: cx, y: cy + 0.1, z: 0 }
  lm[9] = { x: cx, y: cy, z: 0 }
  lm[5] = { x: cx - 0.04, y: cy, z: 0 }
  lm[13] = { x: cx + 0.04, y: cy, z: 0 }
  lm[17] = { x: cx + 0.08, y: cy, z: 0 }
  return lm
}

const rng = (() => {
  let s = 12345
  return () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296 - 0.5)
})()

describe('OneEuroFilter', () => {
  it('passes the first sample and a constant signal through unchanged', () => {
    const f = new OneEuroFilter(1, 10, 1)
    expect(f.filter(0.5, 0)).toBe(0.5)
    expect(f.filter(0.5, 0.033)).toBeCloseTo(0.5, 6)
  })

  it('reduces jitter on a stationary signal', () => {
    const f = new OneEuroFilter(1.2, 14, 1)
    let rawVar = 0
    let filtVar = 0
    const n = 200
    for (let i = 0; i < n; i++) {
      const noisy = 0.5 + rng() * 0.01
      const out = f.filter(noisy, i * 0.033)
      if (i > 20) {
        rawVar += (noisy - 0.5) ** 2
        filtVar += (out - 0.5) ** 2
      }
    }
    expect(filtVar).toBeLessThan(rawVar * 0.5)
  })

  it('follows a fast sweep with little lag', () => {
    const f = new OneEuroFilter(1.2, 14, 1)
    let out = 0
    // 3 image-widths per second sweep for 0.3 s
    for (let i = 0; i <= 9; i++) out = f.filter(i * 0.033 * 3, i * 0.033)
    const target = 9 * 0.033 * 3
    expect(target - out).toBeLessThan(0.12)
  })
})

describe('HandStabilizer', () => {
  it('keeps hand ids stable when MediaPipe swaps the output order', () => {
    const s = new HandStabilizer()
    const L = hand(0.25, 0.5)
    const R = hand(0.75, 0.5)
    s.update([L, R], 0)
    const first = s.hands(0)
    s.update([R, L], 33) // reversed order
    const second = s.hands(33)
    expect(second.map((h) => h.id)).toEqual(first.map((h) => h.id))
    // the track that started on the left is still on the left
    expect(second[0].landmarks[9].x).toBeLessThan(0.5)
    expect(second[1].landmarks[9].x).toBeGreaterThan(0.5)
  })

  it('holds a vanished hand briefly, then drops it', () => {
    const s = new HandStabilizer({ coastMs: 160 })
    s.update([hand(0.5, 0.5)], 0)
    s.update([], 33)
    expect(s.hands(60)).toHaveLength(1)
    expect(s.hands(60)[0].coasting).toBe(true)
    s.update([], 300)
    expect(s.hands(300)).toHaveLength(0)
  })

  /** Keeps feeding one hand at 30 fps from `from` to `to` (ms). */
  const feed = (s: HandStabilizer, lm: Landmark[], from: number, to: number) => {
    for (let t = from; t <= to; t += 33) s.update([lm], t)
  }

  it('holds a hand longer when it vanished while overlapping the other (clasp survives merge)', () => {
    const s = new HandStabilizer({ coastMs: 160, mergeCoastMs: 700 })
    s.update([hand(0.45, 0.5), hand(0.55, 0.5)], 0) // hands close together
    feed(s, hand(0.5, 0.5), 33, 400) // merged into one detection that keeps being tracked
    expect(s.hands(400)).toHaveLength(2) // vanished hand still held, well past the normal coast time
    feed(s, hand(0.5, 0.5), 433, 900)
    expect(s.hands(900)).toHaveLength(1) // ...but not forever
  })

  it('does not hold a hand that vanished far from the other', () => {
    const s = new HandStabilizer({ coastMs: 160, mergeCoastMs: 700 })
    s.update([hand(0.2, 0.5), hand(0.8, 0.5)], 0)
    feed(s, hand(0.8, 0.5), 33, 400)
    expect(s.hands(400)).toHaveLength(1)
  })

  it('smooths jitter on a stationary hand', () => {
    const s = new HandStabilizer()
    let rawVar = 0
    let filtVar = 0
    for (let i = 0; i < 120; i++) {
      const jx = rng() * 0.01
      s.update([hand(0.5 + jx, 0.5)], i * 33)
      const x = s.hands(i * 33)[0].landmarks[9].x
      if (i > 20) {
        rawVar += jx ** 2
        filtVar += (x - 0.5) ** 2
      }
    }
    expect(filtVar).toBeLessThan(rawVar * 0.5)
  })

  it('tracks a fast-moving hand without losing it (large jump per frame)', () => {
    const s = new HandStabilizer()
    let id = -1
    for (let i = 0; i < 6; i++) {
      s.update([hand(0.2 + i * 0.12, 0.5)], i * 33) // 0.12 per frame ~ 3.6 widths/sec at 30 fps
      const hs = s.hands(i * 33)
      expect(hs).toHaveLength(1)
      if (id < 0) id = hs[0].id
      expect(hs[0].id).toBe(id)
    }
  })
})
