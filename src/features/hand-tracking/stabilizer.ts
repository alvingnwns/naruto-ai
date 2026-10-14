import { TRACKING } from '../../config/tracking'
import type { Landmark } from '../gesture-recognition/features'
import { OneEuroFilter } from './oneEuro'

export interface TrackedHand {
  /** Stable across frames, so two hands never swap roles when MediaPipe reorders its output. */
  id: number
  /** Smoothed landmarks (image space, un-mirrored). */
  landmarks: Landmark[]
  /** True when this frame had no detection for the hand and it is being held at its last pose. */
  coasting: boolean
}

type Options = Partial<typeof TRACKING>

interface Track {
  id: number
  filters: OneEuroFilter[]
  landmarks: Landmark[]
  center: { x: number; y: number }
  size: number
  lastSeen: number
  /** Was within merge distance of another hand when last seen (likely occluded by it). */
  nearOther: boolean
}

const PALM = [0, 5, 9, 13, 17]

function centreAndSize(lm: Landmark[]) {
  let x = 0
  let y = 0
  for (const i of PALM) {
    x += lm[i].x
    y += lm[i].y
  }
  return { center: { x: x / PALM.length, y: y / PALM.length }, size: Math.hypot(lm[9].x - lm[0].x, lm[9].y - lm[0].y) }
}

/**
 * Sits between MediaPipe and the recogniser. It (1) gives each hand a persistent id, (2) smooths
 * landmarks with a One Euro filter, (3) holds a vanished hand briefly so a single missed frame
 * doesn't break a gesture, and (4) holds a hand longer if it vanished while overlapping another,
 * since overlapped hands are a common cause of dropped detections (e.g. a two-hand clasp).
 */
export class HandStabilizer {
  private tracks: Track[] = []
  private nextId = 1
  private cfg: typeof TRACKING

  constructor(opts: Options = {}) {
    this.cfg = { ...TRACKING, ...opts }
  }

  reset() {
    this.tracks = []
  }

  /** Feed one detection result (possibly empty). `nowMs` must increase. */
  update(detections: Landmark[][], nowMs: number) {
    const t = nowMs / 1000
    const dets = detections.filter((d) => d.length >= 21).map((lm) => ({ lm, ...centreAndSize(lm) }))

    // Greedy nearest-neighbour matching, closest pairs first.
    const pairs: { d: number; di: number; ti: number }[] = []
    dets.forEach((det, di) =>
      this.tracks.forEach((tr, ti) => {
        const dist = Math.hypot(det.center.x - tr.center.x, det.center.y - tr.center.y)
        if (dist <= Math.max(this.cfg.matchDistance, tr.size * 3)) pairs.push({ d: dist, di, ti })
      }),
    )
    pairs.sort((a, b) => a.d - b.d)
    const detUsed = new Set<number>()
    const trUsed = new Set<number>()
    const seen: Track[] = []

    for (const { di, ti } of pairs) {
      if (detUsed.has(di) || trUsed.has(ti)) continue
      detUsed.add(di)
      trUsed.add(ti)
      const tr = this.tracks[ti]
      this.apply(tr, dets[di].lm, t)
      tr.center = dets[di].center
      tr.size = dets[di].size
      tr.lastSeen = nowMs
      seen.push(tr)
    }
    dets.forEach((det, di) => {
      if (detUsed.has(di)) return
      const { minCutoff, beta, dCutoff } = this.cfg.oneEuro
      const tr: Track = {
        id: this.nextId++,
        filters: Array.from({ length: 63 }, () => new OneEuroFilter(minCutoff, beta, dCutoff)),
        landmarks: [],
        center: det.center,
        size: det.size,
        lastSeen: nowMs,
        nearOther: false,
      }
      this.apply(tr, det.lm, t)
      this.tracks.push(tr)
      seen.push(tr)
    })

    // Update "overlapping" flags for hands seen this frame (against every live hand).
    for (const tr of seen) {
      tr.nearOther = this.tracks.some(
        (o) =>
          o !== tr &&
          Math.hypot(o.center.x - tr.center.x, o.center.y - tr.center.y) < this.cfg.mergeDistance * Math.max(tr.size, o.size),
      )
    }

    this.tracks = this.tracks.filter((tr) => nowMs - tr.lastSeen <= this.holdMs(tr))
  }

  /** Hands that are live or still being held at `nowMs`, oldest track first (stable primary hand). */
  hands(nowMs: number): TrackedHand[] {
    return this.tracks
      .filter((tr) => nowMs - tr.lastSeen <= this.holdMs(tr))
      .map((tr) => ({ id: tr.id, landmarks: tr.landmarks, coasting: nowMs - tr.lastSeen > 1 }))
      .sort((a, b) => a.id - b.id)
  }

  private holdMs(tr: Track) {
    return tr.nearOther ? this.cfg.mergeCoastMs : this.cfg.coastMs
  }

  private apply(tr: Track, lm: Landmark[], t: number) {
    const out: Landmark[] = new Array(lm.length)
    for (let i = 0; i < lm.length; i++) {
      out[i] = {
        x: tr.filters[i * 3].filter(lm[i].x, t),
        y: tr.filters[i * 3 + 1].filter(lm[i].y, t),
        z: tr.filters[i * 3 + 2].filter(lm[i].z, t),
      }
    }
    tr.landmarks = out
  }
}
