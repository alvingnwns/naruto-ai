import { RECOGNITION, SIGNS, type SignId } from '../../config/signs'
import type { HandFeatures } from './features'

export interface SignResult {
  sign: SignId
  /** 0..1. Mean per-finger certainty (or closeness, for two-hand signs). */
  confidence: number
}

/** Static (single-frame) classification. Returns null when no sign matches. */
export function classifySign(hands: HandFeatures[], aspect = 16 / 9): SignResult | null {
  if (hands.length === 0) return null

  // Two-hand sign: palm centres close together, measured in hand-sizes. It outranks per-hand poses.
  if (hands.length >= 2) {
    const [a, b] = hands
    const d = Math.hypot((a.palmCenter.x - b.palmCenter.x) * aspect, a.palmCenter.y - b.palmCenter.y)
    const ratio = d / ((a.handSize + b.handSize) / 2)
    if (ratio < RECOGNITION.claspDistance) {
      const confidence = Math.min(1, 0.5 + (RECOGNITION.claspDistance - ratio) / RECOGNITION.claspDistance)
      return { sign: 'clasp', confidence }
    }
  }

  let best: SignResult | null = null
  for (const hand of hands) {
    for (const def of SIGNS) {
      if (!def.fingers) continue
      // Agreement per finger: positive when the finger matches the required state.
      const agree = def.fingers.map((ext, i) => (ext ? hand.fingerMargins[i] : -hand.fingerMargins[i]))
      if (Math.min(...agree) <= 0) continue
      const confidence = agree.reduce((s, v) => s + v, 0) / agree.length
      if (!best || confidence > best.confidence) best = { sign: def.id, confidence }
    }
  }
  return best
}
