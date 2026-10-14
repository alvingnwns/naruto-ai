/**
 * Hand-tracking sensitivity. Trade-off: lower confidences and longer coasting keep fast or
 * partially hidden hands tracked, at the cost of more false positives and a bit of ghosting.
 * These values are reasoned, not tuned on real footage.
 */
export const TRACKING = {
  /** MediaPipe thresholds (library default is 0.5 for all three). */
  detectionConfidence: 0.4,
  presenceConfidence: 0.4,
  trackingConfidence: 0.4,

  /**
   * One Euro filter: heavy smoothing when the hand is slow (kills jitter), almost none when it is
   * fast (no lag). cutoff = minCutoff + beta * speed, with speed in image-widths per second.
   */
  oneEuro: { minCutoff: 1.2, beta: 14, dCutoff: 1.0 },

  /** Largest palm-centre jump (normalised image units) between frames still treated as the same hand. */
  matchDistance: 0.35,
  /** A hand that vanishes is held at its last position for this long before being dropped. */
  coastMs: 160,
  /**
   * Overlapping hands often collapse into one detection. If a hand vanishes while it was within
   * `mergeDistance` hand-sizes of another, it is held this long (so a clasp survives).
   */
  mergeCoastMs: 700,
  mergeDistance: 1.8,

  /** Requested camera mode: a lower resolution at a higher frame rate catches fast motion better. */
  camera: { width: 960, height: 540, frameRate: 60 },
}
