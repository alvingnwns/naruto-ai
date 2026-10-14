/**
 * Hand signs and recognition thresholds.
 *
 * IMPORTANT: these are SIMPLIFIED, finger-extension-based stand-ins that borrow Naruto sign
 * names. They are not the canonical interlocking hand seals: a single 2D camera cannot
 * reliably resolve those (occlusion, overlapping fingers). Edit freely.
 */
export type SignId = 'ox' | 'tiger' | 'ram' | 'dog' | 'boar' | 'clasp'

export interface SignDef {
  id: SignId
  label: string
  /** How to perform it, shown in the practice UI. */
  hint: string
  /** Required extension of [index, middle, ring, pinky]; omitted for two-hand signs. */
  fingers?: [boolean, boolean, boolean, boolean]
  twoHands?: boolean
}

export const SIGNS: SignDef[] = [
  { id: 'ox', label: 'Ox', hint: 'Closed fist', fingers: [false, false, false, false] },
  { id: 'tiger', label: 'Tiger', hint: 'Index finger up', fingers: [true, false, false, false] },
  { id: 'ram', label: 'Ram', hint: 'Index + middle up', fingers: [true, true, false, false] },
  { id: 'dog', label: 'Dog', hint: 'Index, middle, ring up', fingers: [true, true, true, false] },
  { id: 'boar', label: 'Boar', hint: 'Open palm', fingers: [true, true, true, true] },
  { id: 'clasp', label: 'Clasp', hint: 'Bring both hands together', twoHands: true },
]

export const SIGN_BY_ID = Object.fromEntries(SIGNS.map((s) => [s.id, s])) as Record<SignId, SignDef>

export const RECOGNITION = {
  /**
   * A finger counts as extended when |wrist to tip| / |wrist to mcp| exceeds this. A straight
   * finger is ~1.9, a curled one ~0.9-1.2, so 1.5 sits in the gap. Scale-invariant by
   * construction. These numbers are reasoned, not tuned on real footage.
   */
  fingerExtendedRatio: 1.5,
  /** Half-width of the ratio band over which per-finger confidence ramps from 0 to 1. */
  fingerRatioMargin: 0.35,
  /** Two hands are "clasped" when palm centers are closer than this many hand-sizes. */
  claspDistance: 1.4,
  /** Frames below this confidence are treated as "no sign". */
  minConfidence: 0.45,
  /** Pose must be held this long before it registers. User-adjustable in settings. */
  holdMs: 350,
  /** Classification may flicker for this long without resetting the hold timer. */
  graceMs: 140,
  /** Minimum time between two registered signs. */
  cooldownMs: 250,
  /** A partial sequence is dropped after this much time without a new sign. */
  timeoutMs: 6000,
}
