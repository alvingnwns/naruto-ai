import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision'
import { TRACKING } from '../../config/tracking'
import type { Landmark } from '../gesture-recognition/features'

export interface HandTracker {
  /** Returns landmarks (0..1, un-mirrored image space) for each detected hand. */
  detect: (video: HTMLVideoElement, timestampMs: number) => Landmark[][]
  close: () => void
}

/**
 * Loads MediaPipe Hand Landmarker from self-hosted files (see scripts/setup-mediapipe.mjs).
 * Tries the GPU delegate first and falls back to CPU. All inference is local; no frames leave the browser.
 */
export async function createHandTracker(): Promise<HandTracker> {
  const base = import.meta.env.BASE_URL
  const fileset = await FilesetResolver.forVisionTasks(`${base}mediapipe/wasm`)
  const create = (delegate: 'GPU' | 'CPU') =>
    HandLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: `${base}models/hand_landmarker.task`, delegate },
      runningMode: 'VIDEO',
      numHands: 2,
      minHandDetectionConfidence: TRACKING.detectionConfidence,
      minHandPresenceConfidence: TRACKING.presenceConfidence,
      minTrackingConfidence: TRACKING.trackingConfidence,
    })

  let landmarker: HandLandmarker
  try {
    landmarker = await create('GPU')
  } catch {
    landmarker = await create('CPU')
  }

  return {
    detect: (video, timestampMs) => landmarker.detectForVideo(video, timestampMs).landmarks,
    close: () => landmarker.close(),
  }
}
