import type { Landmark } from './features'

export interface Vec3 {
  x: number
  y: number
  z: number
}

/**
 * Hand orientation in DISPLAY space (what the user sees, mirrored): +x right, +y up, +z toward
 * the viewer. Both vectors are unit length and orthogonal.
 *
 *  up      the direction the fingers point (wrist -> middle-finger knuckle)
 *  normal  perpendicular to the palm plane. Its sign is ambiguous from a single 2D camera
 *          without handedness, so it is forced to face the viewer (z >= 0). The effects that use
 *          it are plane-symmetric, so the ambiguity is harmless.
 */
export interface HandPose {
  up: Vec3
  normal: Vec3
}

export const IDENTITY_POSE: HandPose = { up: { x: 0, y: 1, z: 0 }, normal: { x: 0, y: 0, z: 1 } }

const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z })
const dot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z
const cross = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
})
function norm(a: Vec3): Vec3 | null {
  const l = Math.hypot(a.x, a.y, a.z)
  return l < 1e-6 ? null : { x: a.x / l, y: a.y / l, z: a.z / l }
}

/**
 * Estimates the palm frame from MediaPipe landmarks. x/z are scaled by the image aspect so the
 * axes are isotropic (as in features.ts). MediaPipe's z is only a relative depth estimate, so
 * the tilt toward/away from the camera is approximate and noisy; callers should smooth it.
 */
export function extractHandPose(lm: Landmark[], aspect: number): HandPose | null {
  if (lm.length < 21) return null
  // Mirror x (selfie view), flip y (up positive), and flip z (MediaPipe: smaller z = closer).
  const P = (i: number): Vec3 => ({ x: (1 - lm[i].x) * aspect, y: -lm[i].y, z: -lm[i].z * aspect })

  const up = norm(sub(P(9), P(0))) // wrist -> middle MCP
  const across = norm(sub(P(17), P(5))) // index MCP -> pinky MCP
  if (!up || !across) return null

  let normal = norm(cross(across, up))
  if (!normal) return null
  if (normal.z < 0) normal = { x: -normal.x, y: -normal.y, z: -normal.z }

  // Re-orthogonalise so the three axes form a clean basis even with noisy landmarks.
  const d = dot(normal, up)
  const fixed = norm({ x: normal.x - d * up.x, y: normal.y - d * up.y, z: normal.z - d * up.z })
  return fixed ? { up, normal: fixed } : null
}

/** Synthetic pose for demo mode: roll about the view axis and pitch about the horizontal axis (radians). */
export function poseFromEuler(roll: number, pitch: number): HandPose {
  const cr = Math.cos(roll)
  const sr = Math.sin(roll)
  const cp = Math.cos(pitch)
  const sp = Math.sin(pitch)
  // Start from up=(0,1,0), normal=(0,0,1); apply pitch about X, then roll about Z.
  const up = { x: -sr * cp, y: cr * cp, z: sp }
  const normal = { x: sr * sp, y: -cr * sp, z: cp }
  return { up, normal }
}
