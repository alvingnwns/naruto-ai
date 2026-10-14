import { useCallback, useEffect, useRef, useState } from 'react'
import { TRACKING } from '../../config/tracking'

export type CameraStatus = 'off' | 'starting' | 'ready' | 'denied' | 'unavailable' | 'error'

/** Maps a getUserMedia failure to a UI status. Pure so it can be unit-tested. */
export function mapCameraError(err: unknown): { status: CameraStatus; message: string } {
  const name = err instanceof DOMException || err instanceof Error ? err.name : ''
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return { status: 'denied', message: 'Camera permission was denied. Allow access in your browser, or use Demo mode.' }
    case 'NotFoundError':
    case 'OverconstrainedError':
    case 'DevicesNotFoundError':
      return { status: 'unavailable', message: 'No camera was found on this device.' }
    case 'NotReadableError':
    case 'TrackStartError':
      return { status: 'error', message: 'The camera is in use by another application.' }
    default:
      return { status: 'error', message: 'The camera could not be started.' }
  }
}

export interface CameraApi {
  status: CameraStatus
  message: string | null
  /** Native video aspect ratio once known (width / height). */
  aspect: number
  start: () => Promise<void>
  stop: () => void
}

/** Owns the webcam stream lifecycle for the given <video> element. */
export function useCamera(videoRef: React.RefObject<HTMLVideoElement | null>): CameraApi {
  const [status, setStatus] = useState<CameraStatus>('off')
  const [message, setMessage] = useState<string | null>(null)
  const [aspect, setAspect] = useState(16 / 9)
  const streamRef = useRef<MediaStream | null>(null)
  /** Guards against a slow getUserMedia resolving after stop() or unmount. */
  const generation = useRef(0)

  const stop = useCallback(() => {
    generation.current++
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    setStatus('off')
    setMessage(null)
  }, [videoRef])

  const start = useCallback(async () => {
    if (streamRef.current) return
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus('unavailable')
      setMessage('This browser does not support camera access (HTTPS or localhost is required).')
      return
    }
    const gen = ++generation.current
    setStatus('starting')
    setMessage(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: TRACKING.camera.width },
          height: { ideal: TRACKING.camera.height },
          frameRate: { ideal: TRACKING.camera.frameRate },
          facingMode: 'user',
        },
        audio: false,
      })
      if (gen !== generation.current) {
        stream.getTracks().forEach((t) => t.stop())
        return
      }
      streamRef.current = stream
      const video = videoRef.current
      if (!video) throw new Error('video element missing')
      video.srcObject = stream
      await video.play()
      if (video.videoWidth && video.videoHeight) setAspect(video.videoWidth / video.videoHeight)
      setStatus('ready')
    } catch (err) {
      if (gen !== generation.current) return
      streamRef.current?.getTracks().forEach((t) => t.stop())
      streamRef.current = null
      const mapped = mapCameraError(err)
      setStatus(mapped.status)
      setMessage(mapped.message)
    }
  }, [videoRef])

  useEffect(() => () => {
    generation.current++
    streamRef.current?.getTracks().forEach((t) => t.stop())
  }, [])

  return { status, message, aspect, start, stop }
}
