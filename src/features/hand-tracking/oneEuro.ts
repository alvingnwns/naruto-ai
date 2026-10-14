/**
 * One Euro filter (Casiez et al., CHI 2012): an adaptive low-pass filter. The cutoff rises with
 * the signal's speed, so slow motion is smoothed hard (no jitter) and fast motion passes almost
 * unfiltered (no lag), which is exactly what hand landmarks need.
 */
export class OneEuroFilter {
  private xPrev = 0
  private dxPrev = 0
  private tPrev = -1

  constructor(
    private minCutoff: number,
    private beta: number,
    private dCutoff: number,
  ) {}

  private static alpha(cutoff: number, dt: number): number {
    const tau = 1 / (2 * Math.PI * cutoff)
    return 1 / (1 + tau / dt)
  }

  /** `tSec` is a monotonically increasing timestamp in seconds. */
  filter(x: number, tSec: number): number {
    if (this.tPrev < 0) {
      this.xPrev = x
      this.tPrev = tSec
      return x
    }
    const dt = tSec - this.tPrev
    if (dt <= 0) return this.xPrev
    this.tPrev = tSec

    const dx = (x - this.xPrev) / dt
    const aD = OneEuroFilter.alpha(this.dCutoff, dt)
    this.dxPrev = aD * dx + (1 - aD) * this.dxPrev

    const cutoff = this.minCutoff + this.beta * Math.abs(this.dxPrev)
    const a = OneEuroFilter.alpha(cutoff, dt)
    this.xPrev = a * x + (1 - a) * this.xPrev
    return this.xPrev
  }
}
