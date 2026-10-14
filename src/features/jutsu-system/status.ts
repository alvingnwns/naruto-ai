import type { CameraStatus } from '../camera/useCamera'
import type { SignId } from '../../config/signs'
import type { JutsuPhase } from './lifecycle'

export type Mode = 'practice' | 'freeplay' | 'demo'
export type TrackerState = 'idle' | 'loading' | 'ready' | 'error'

/** The distinct states the UI must never conflate (camera, tracker, hand, sign, sequence, jutsu). */
export type TrackingStatus =
  | 'demo-simulated'
  | 'camera-off'
  | 'camera-starting'
  | 'camera-denied'
  | 'camera-unavailable'
  | 'camera-error'
  | 'model-loading'
  | 'model-error'
  | 'no-hand'
  | 'hand-detected'
  | 'sign-recognized'
  | 'sequence-in-progress'
  | 'jutsu-active'

export interface StatusInput {
  mode: Mode
  camera: CameraStatus
  tracker: TrackerState
  hands: number
  /** The sign currently being recognised (above confidence threshold), if any. */
  sign: SignId | null
  registeredSigns: number
  phase: JutsuPhase
}

export function deriveStatus(i: StatusInput): TrackingStatus {
  if (i.phase !== 'idle') return 'jutsu-active'
  if (i.mode === 'demo') return 'demo-simulated'
  switch (i.camera) {
    case 'off':
      return 'camera-off'
    case 'starting':
      return 'camera-starting'
    case 'denied':
      return 'camera-denied'
    case 'unavailable':
      return 'camera-unavailable'
    case 'error':
      return 'camera-error'
  }
  if (i.tracker === 'error') return 'model-error'
  if (i.tracker !== 'ready') return 'model-loading'
  if (i.hands === 0) return 'no-hand'
  if (i.sign) return 'sign-recognized'
  if (i.registeredSigns > 0) return 'sequence-in-progress'
  return 'hand-detected'
}

export const STATUS_LABEL: Record<TrackingStatus, { text: string; tone: 'neutral' | 'warn' | 'bad' | 'good' | 'hot' }> = {
  'demo-simulated': { text: 'Demo: gestures are simulated', tone: 'warn' },
  'camera-off': { text: 'Camera off', tone: 'neutral' },
  'camera-starting': { text: 'Starting camera…', tone: 'neutral' },
  'camera-denied': { text: 'Camera permission denied', tone: 'bad' },
  'camera-unavailable': { text: 'No camera available', tone: 'bad' },
  'camera-error': { text: 'Camera error', tone: 'bad' },
  'model-loading': { text: 'Loading hand tracker…', tone: 'neutral' },
  'model-error': { text: 'Hand tracker failed to load', tone: 'bad' },
  'no-hand': { text: 'No hand detected', tone: 'neutral' },
  'hand-detected': { text: 'Hand detected', tone: 'good' },
  'sign-recognized': { text: 'Sign recognised', tone: 'good' },
  'sequence-in-progress': { text: 'Sequence in progress', tone: 'good' },
  'jutsu-active': { text: 'Jutsu active', tone: 'hot' },
}
