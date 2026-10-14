import { describe, expect, it } from 'vitest'
import { classifySign } from './classify'
import { extractHandFeatures, type Landmark } from './features'
import { SequenceEngine, sequenceProgress } from './sequence'
import { JUTSU } from '../../config/jutsu'
import { SIGNS, type SignId } from '../../config/signs'

const ASPECT = 16 / 9

/** Builds a 21-point hand with the given [index, middle, ring, pinky] extension, palm at (cx, 0.8). */
function makeHand(fingers: [boolean, boolean, boolean, boolean], cx = 0.5, scale = 1): Landmark[] {
  const lm: Landmark[] = Array.from({ length: 21 }, () => ({ x: cx, y: 0.8, z: 0 }))
  const mcpOffsets = [-0.05, 0, 0.05, 0.1]
  const mcpIdx = [5, 9, 13, 17]
  const tipIdx = [8, 12, 16, 20]
  fingers.forEach((ext, i) => {
    const mcp = { x: cx + mcpOffsets[i] * scale, y: 0.8 - 0.16 * scale, z: 0 }
    lm[mcpIdx[i]] = mcp
    lm[tipIdx[i]] = ext ? { x: mcp.x, y: mcp.y - 0.16 * scale, z: 0 } : { x: mcp.x, y: mcp.y + 0.03 * scale, z: 0 }
  })
  return lm
}

const feats = (f: [boolean, boolean, boolean, boolean], cx = 0.5, scale = 1) =>
  extractHandFeatures(makeHand(f, cx, scale), ASPECT)!

describe('extractHandFeatures', () => {
  it('reports extended fingers with ratios above the threshold and curled below', () => {
    const f = feats([true, false, true, false])
    expect(f.fingerRatios[0]).toBeGreaterThan(1.5)
    expect(f.fingerRatios[1]).toBeLessThan(1.5)
    expect(f.fingerMargins[0]).toBeGreaterThan(0)
    expect(f.fingerMargins[1]).toBeLessThan(0)
  })

  it('is invariant to hand scale (distance from camera)', () => {
    const near = feats([true, true, false, false], 0.5, 1)
    const far = feats([true, true, false, false], 0.5, 0.5)
    near.fingerRatios.forEach((r, i) => expect(far.fingerRatios[i]).toBeCloseTo(r, 3))
    expect(far.handSize).toBeLessThan(near.handSize)
  })

  it('rejects incomplete or degenerate landmark sets', () => {
    expect(extractHandFeatures([], ASPECT)).toBeNull()
    const flat = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5, z: 0 }))
    expect(extractHandFeatures(flat, ASPECT)).toBeNull()
  })
})

describe('classifySign', () => {
  const patterns: [SignId, [boolean, boolean, boolean, boolean]][] = [
    ['ox', [false, false, false, false]],
    ['tiger', [true, false, false, false]],
    ['ram', [true, true, false, false]],
    ['dog', [true, true, true, false]],
    ['boar', [true, true, true, true]],
  ]
  it.each(patterns)('recognises %s', (sign, fingers) => {
    const r = classifySign([feats(fingers)], ASPECT)
    expect(r?.sign).toBe(sign)
    expect(r!.confidence).toBeGreaterThan(0.5)
  })

  it('returns null with no hands, and null for patterns outside the vocabulary', () => {
    expect(classifySign([], ASPECT)).toBeNull()
    expect(classifySign([feats([false, true, false, true])], ASPECT)).toBeNull()
  })

  it('recognises clasp only when two hands are close together', () => {
    const near = [feats([true, true, true, true], 0.45), feats([true, true, true, true], 0.55)]
    const far = [feats([true, true, true, true], 0.2), feats([true, true, true, true], 0.8)]
    expect(classifySign(near, ASPECT)?.sign).toBe('clasp')
    expect(classifySign(far, ASPECT)?.sign).toBe('boar')
  })

  it('covers every single-hand sign defined in config', () => {
    for (const def of SIGNS.filter((s) => s.fingers)) {
      expect(classifySign([feats(def.fingers!)], ASPECT)?.sign).toBe(def.id)
    }
  })
})

describe('sequenceProgress', () => {
  it('counts the longest prefix matched by the buffer tail', () => {
    const seq: SignId[] = ['tiger', 'ram', 'boar']
    expect(sequenceProgress([], seq)).toBe(0)
    expect(sequenceProgress(['tiger'], seq)).toBe(1)
    expect(sequenceProgress(['ox', 'tiger', 'ram'], seq)).toBe(2)
    expect(sequenceProgress(['tiger', 'ram', 'ox'], seq)).toBe(0)
  })
})

describe('SequenceEngine', () => {
  const opts = { holdMs: 300, graceMs: 100, cooldownMs: 100, timeoutMs: 2000, minConfidence: 0.5 }
  const make = () => {
    const e = new SequenceEngine(opts)
    e.setSequences({ rasengan: ['tiger', 'ram', 'boar'], katon: ['ram', 'ox', 'boar'] })
    return e
  }
  /** Feed `sign` every 30ms over [from, to). Returns all events. */
  const hold = (e: SequenceEngine, sign: SignId | null, from: number, to: number, conf = 0.9) => {
    const out = []
    for (let t = from; t < to; t += 30) out.push(...e.update(sign, conf, t))
    return out
  }

  it('registers a sign only after it is held long enough', () => {
    const e = make()
    expect(hold(e, 'tiger', 0, 200)).toEqual([])
    expect(hold(e, 'tiger', 200, 400)).toEqual([{ type: 'sign', sign: 'tiger' }])
  })

  it('does not re-register a sign that is held continuously', () => {
    const e = make()
    const events = hold(e, 'tiger', 0, 3000)
    expect(events.filter((x) => x.type === 'sign')).toHaveLength(1)
  })

  it('triggers a jutsu when the full sequence is performed', () => {
    const e = make()
    const events = [...hold(e, 'tiger', 0, 400), ...hold(e, 'ram', 450, 850), ...hold(e, 'boar', 900, 1300)]
    expect(events.at(-1)).toEqual({ type: 'jutsu', jutsu: 'rasengan' })
    expect(e.signs).toEqual([])
  })

  it('discriminates between sequences sharing a prefix', () => {
    const e = make()
    const events = [...hold(e, 'ram', 0, 400), ...hold(e, 'ox', 450, 850), ...hold(e, 'boar', 900, 1300)]
    expect(events.at(-1)).toEqual({ type: 'jutsu', jutsu: 'katon' })
  })

  it('tolerates brief classification flicker without losing the hold', () => {
    const e = make()
    hold(e, 'tiger', 0, 150)
    e.update(null, 0, 150) // one dropped frame, within grace
    const events = hold(e, 'tiger', 180, 400)
    expect(events).toContainEqual({ type: 'sign', sign: 'tiger' })
  })

  it('ignores low-confidence readings', () => {
    const e = make()
    expect(hold(e, 'tiger', 0, 1000, 0.2)).toEqual([])
  })

  it('allows the same sign again after it has been released', () => {
    const e = make()
    const first = hold(e, 'tiger', 0, 400)
    hold(e, null, 400, 700)
    const second = hold(e, 'tiger', 700, 1100)
    expect(first).toHaveLength(1)
    expect(second).toEqual([{ type: 'sign', sign: 'tiger' }])
  })

  it('times out a partial sequence', () => {
    const e = make()
    hold(e, 'tiger', 0, 400)
    expect(e.signs).toEqual(['tiger'])
    const events = hold(e, null, 400, 3000)
    expect(events).toContainEqual({ type: 'timeout' })
    expect(e.signs).toEqual([])
  })

  it('resets on demand', () => {
    const e = make()
    hold(e, 'tiger', 0, 400)
    expect(e.reset()).toEqual([{ type: 'reset' }])
    expect(e.signs).toEqual([])
    expect(e.reset()).toEqual([])
  })

  it('wrong sign breaks progress towards the target', () => {
    const e = make()
    hold(e, 'tiger', 0, 400)
    hold(e, 'ox', 450, 850)
    expect(sequenceProgress(e.signs, ['tiger', 'ram', 'boar'])).toBe(0)
  })
})

describe('jutsu config', () => {
  it('uses only defined signs and unique, non-overlapping sequences', () => {
    const ids = new Set(SIGNS.map((s) => s.id))
    for (const j of JUTSU) {
      expect(j.sequence.length).toBeGreaterThanOrEqual(2)
      j.sequence.forEach((s) => expect(ids.has(s)).toBe(true))
    }
    for (const a of JUTSU) {
      for (const b of JUTSU) {
        if (a === b) continue
        // a's full sequence must never be a suffix of b's (would trigger ambiguously)
        const tail = b.sequence.slice(-a.sequence.length).join()
        expect(tail === a.sequence.join() && a.sequence.length <= b.sequence.length).toBe(false)
      }
    }
  })

  it('triggers each configured jutsu via its own sequence', () => {
    for (const j of JUTSU) {
      const e = new SequenceEngine(opts())
      e.setSequences(Object.fromEntries(JUTSU.map((x) => [x.id, x.sequence])))
      let t = 0
      const events = []
      for (const sign of j.sequence) {
        for (let i = 0; i < 15; i++) events.push(...e.update(sign, 0.9, (t += 30)))
        for (let i = 0; i < 6; i++) events.push(...e.update(null, 0, (t += 30)))
      }
      expect(events.filter((x) => x.type === 'jutsu')).toEqual([{ type: 'jutsu', jutsu: j.id }])
    }
  })
})

function opts() {
  return { holdMs: 300, graceMs: 100, cooldownMs: 100, timeoutMs: 5000, minConfidence: 0.5 }
}
