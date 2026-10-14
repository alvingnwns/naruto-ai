import { RECOGNITION } from '../../config/signs'

export interface Landmark {
  x: number
  y: number
  z: number
}

export interface HandFeatures {
  /** |wrist to tip| / |wrist to mcp| for [index, middle, ring, pinky]. */
  fingerRatios: [number, number, number, number]
  /** Per-finger extension margin in [-1, 1]; positive = extended, magnitude = certainty. */
  fingerMargins: [number, number, number, number]
  /** Palm centre in normalised image coordinates (0..1, y down, NOT mirrored). */
  palmCenter: { x: number; y: number }
  /** Wrist to middle-MCP distance in image-height units: a proxy for distance to camera. */
  handSize: number
}

const WRIST = 0
const TIPS = [8, 12, 16, 20] as const
const MCPS = [5, 9, 13, 17] as const
const PALM_POINTS = [0, 5, 9, 13, 17] as const

/**
 * Distance with x/z scaled by the image aspect ratio so units are isotropic
 * (MediaPipe's normalised x is relative to width, y to height; z shares x's scale).
 */
function dist(a: Landmark, b: Landmark, aspect: number): number {
  const dx = (a.x - b.x) * aspect
  const dy = a.y - b.y
  const dz = (a.z - b.z) * aspect
  return Math.hypot(dx, dy, dz)
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/** Derives scale-invariant features from the 21 MediaPipe hand landmarks. */
export function extractHandFeatures(lm: Landmark[], aspect = 16 / 9): HandFeatures | null {
  if (lm.length < 21) return null
  const wrist = lm[WRIST]
  const handSize = dist(wrist, lm[9], aspect)
  if (handSize < 1e-4) return null

  const fingerRatios = TIPS.map(
    (t, i) => dist(wrist, lm[t], aspect) / dist(wrist, lm[MCPS[i]], aspect),
  ) as HandFeatures['fingerRatios']
  const { fingerExtendedRatio: thr, fingerRatioMargin: margin } = RECOGNITION
  const fingerMargins = fingerRatios.map((r) => clamp((r - thr) / margin, -1, 1)) as HandFeatures['fingerMargins']

  let cx = 0
  let cy = 0
  for (const i of PALM_POINTS) {
    cx += lm[i].x
    cy += lm[i].y
  }
  return {
    fingerRatios,
    fingerMargins,
    palmCenter: { x: cx / PALM_POINTS.length, y: cy / PALM_POINTS.length },
    handSize,
  }
}
