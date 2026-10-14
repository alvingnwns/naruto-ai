/**
 * Coordinate spaces used across the app:
 *
 *  image   MediaPipe output. x,y in 0..1, origin top-left, NOT mirrored.
 *  display What the user sees. The <video> is mirrored with CSS, so display.x = 1 - image.x.
 *          Overlay canvas and VFX anchors use this space.
 *  world   Three.js units at z = 0. The camera sits on the +z axis, so
 *          world.x = (display.x - 0.5) * viewportWidth, world.y = (0.5 - display.y) * viewportHeight.
 *
 * MediaPipe's 2D landmarks carry no metric depth, so effects stay on the z = 0 plane and
 * "depth" is approximated by scaling with apparent hand size (see handScaleFromSize).
 */

export function imageToDisplay(x: number, y: number): { x: number; y: number } {
  return { x: 1 - x, y }
}

export function displayToWorld(x: number, y: number, viewportW: number, viewportH: number): { x: number; y: number } {
  return { x: (x - 0.5) * viewportW, y: (0.5 - y) * viewportH }
}

/** Approximate depth cue: apparent hand size relative to a typical arm's-length hand. Clamped. */
export function handScaleFromSize(handSize: number): number {
  return Math.min(1.8, Math.max(0.6, handSize / 0.2))
}
