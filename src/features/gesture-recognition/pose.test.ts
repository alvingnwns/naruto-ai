import { describe, expect, it } from 'vitest'
import type { Landmark } from './features'
import { extractHandPose, poseFromEuler } from './pose'

const ASPECT = 16 / 9

/** Flat hand facing the camera, fingers pointing `angle` radians clockwise from screen-up. */
function flatHand(angle = 0, depthTilt = 0): Landmark[] {
  const lm: Landmark[] = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5, z: 0 }))
  const rot = (x: number, y: number) => ({
    // rotate in the image plane around the wrist (y down in image space)
    x: 0.5 + (x * Math.cos(angle) - y * Math.sin(angle)) / ASPECT,
    y: 0.5 + (x * Math.sin(angle) + y * Math.cos(angle)),
  })
  const wrist = rot(0, 0)
  lm[0] = { ...wrist, z: 0 }
  const mid = rot(0, -0.2)
  lm[9] = { ...mid, z: 0 }
  const idx = rot(-0.07, -0.18)
  const pinky = rot(0.09, -0.15)
  // depthTilt makes the pinky side farther from the camera than the index side (palm yaws).
  lm[5] = { ...idx, z: -depthTilt }
  lm[17] = { ...pinky, z: depthTilt }
  return lm
}

describe('extractHandPose', () => {
  it('reports fingers pointing up and palm facing the camera for an upright flat hand', () => {
    const p = extractHandPose(flatHand(), ASPECT)!
    expect(p.up.y).toBeGreaterThan(0.95)
    expect(Math.abs(p.up.x)).toBeLessThan(0.1)
    expect(p.normal.z).toBeGreaterThan(0.95)
  })

  it('follows in-plane rotation of the hand (mirrored: image-right appears screen-left)', () => {
    // Fingers rotated clockwise in the un-mirrored image => lean towards image-right => display-left.
    const p = extractHandPose(flatHand(0.6), ASPECT)!
    expect(p.up.x).toBeLessThan(-0.4)
    expect(p.up.y).toBeGreaterThan(0.5)
  })

  it('tilts the palm normal sideways when the hand yaws, and keeps it facing the viewer', () => {
    const p = extractHandPose(flatHand(0, 0.06), ASPECT)!
    expect(Math.abs(p.normal.x)).toBeGreaterThan(0.2)
    expect(p.normal.z).toBeGreaterThan(0)
  })

  it('returns an orthonormal basis', () => {
    const p = extractHandPose(flatHand(0.4, 0.04), ASPECT)!
    const len = (v: { x: number; y: number; z: number }) => Math.hypot(v.x, v.y, v.z)
    expect(len(p.up)).toBeCloseTo(1, 5)
    expect(len(p.normal)).toBeCloseTo(1, 5)
    expect(p.up.x * p.normal.x + p.up.y * p.normal.y + p.up.z * p.normal.z).toBeCloseTo(0, 5)
  })

  it('rejects incomplete or degenerate input', () => {
    expect(extractHandPose([], ASPECT)).toBeNull()
    const flat = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5, z: 0 }))
    expect(extractHandPose(flat, ASPECT)).toBeNull()
  })
})

describe('poseFromEuler', () => {
  it('is the identity at zero and orthonormal otherwise', () => {
    const id = poseFromEuler(0, 0)
    expect(id.up).toEqual({ x: -0, y: 1, z: 0 })
    const p = poseFromEuler(0.7, -0.4)
    expect(p.up.x * p.normal.x + p.up.y * p.normal.y + p.up.z * p.normal.z).toBeCloseTo(0, 6)
    expect(Math.hypot(p.up.x, p.up.y, p.up.z)).toBeCloseTo(1, 6)
  })
})
