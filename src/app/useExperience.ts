import { useCallback, useEffect, useRef, useState } from 'react'
import { HandLandmarker } from '@mediapipe/tasks-vision'
import { JUTSU, JUTSU_BY_ID, type JutsuId } from '../config/jutsu'
import type { SignId } from '../config/signs'
import { handScaleFromSize, imageToDisplay } from '../lib/coords'
import { playSfx, setMuted } from '../lib/audio'
import type { CameraApi } from '../features/camera/useCamera'
import { classifySign } from '../features/gesture-recognition/classify'
import { extractHandFeatures, type HandFeatures, type Landmark } from '../features/gesture-recognition/features'
import { IDENTITY_POSE, extractHandPose, poseFromEuler } from '../features/gesture-recognition/pose'
import { SequenceEngine } from '../features/gesture-recognition/sequence'
import { createHandTracker, type HandTracker } from '../features/hand-tracking/handTracker'
import { IDLE_STATE, activate, chargeLevel, release, tick, type JutsuPhase, type JutsuState } from '../features/jutsu-system/lifecycle'
import { deriveStatus, type Mode, type TrackerState, type TrackingStatus } from '../features/jutsu-system/status'
import type { FxState } from '../features/vfx/shared'

export interface Settings {
  showLandmarks: boolean
  sound: boolean
  /** How long a pose must be held to register, in ms. */
  holdMs: number
  lowQuality: boolean
}

export interface UiSnapshot {
  status: TrackingStatus
  hands: number
  sign: SignId | null
  /** 0..1, quantised to limit React re-renders. */
  confidence: number
  holdProgress: number
  registered: SignId[]
  jutsu: JutsuId | null
  phase: JutsuPhase
  trackFps: number
  renderFps: number
  notice: string | null
}

const INITIAL_UI: UiSnapshot = {
  status: 'camera-off',
  hands: 0,
  sign: null,
  confidence: 0,
  holdProgress: 0,
  registered: [],
  jutsu: null,
  phase: 'idle',
  trackFps: 0,
  renderFps: 0,
  notice: null,
}

/** Hand speed (screen-heights per second) above which a quick flick releases a charged jutsu. */
const FLICK_SPEED = 2.2
/** If a jutsu is active and the hand has been gone this long, cancel it. */
const HAND_LOST_CANCEL_MS = 3000
const SIM_GAP_MS = 220

const quant = (v: number, step: number) => Math.round(v / step) * step

interface Options {
  mode: Mode
  selected: JutsuId
  settings: Settings
  camera: CameraApi
  videoRef: React.RefObject<HTMLVideoElement | null>
  overlayRef: React.RefObject<HTMLCanvasElement | null>
  /** Called when a jutsu is triggered (so free-play can follow the active jutsu in the UI). */
  onJutsu: (id: JutsuId) => void
}

/**
 * The per-frame brain. Owns the rAF loop and keeps everything hot (landmarks, FX state) in refs;
 * React only receives a small snapshot that changes at human speed.
 */
export function useExperience(opts: Options) {
  const optsRef = useRef(opts)
  optsRef.current = opts

  const [ui, setUi] = useState<UiSnapshot>(INITIAL_UI)
  const [trackerState, setTrackerState] = useState<TrackerState>('idle')
  const trackerRef = useRef<HandTracker | null>(null)
  const trackerStateRef = useRef<TrackerState>('idle')

  const fx = useRef<FxState>({
    jutsu: null,
    phase: 'idle',
    phaseTime: 0,
    charge: 0,
    anchor: { x: 0.5, y: 0.55 },
    handScale: 1,
    visibility: 1,
    aim: { x: 1, y: 0.1 },
    handUp: { ...IDENTITY_POSE.up },
    handNormal: { ...IDENTITY_POSE.normal },
  }).current

  const engine = useRef(new SequenceEngine()).current
  const lifecycle = useRef<JutsuState>(IDLE_STATE)
  const demoAnchor = useRef({ x: 0.5, y: 0.55 })
  const sim = useRef<{ signs: SignId[]; start: number } | null>(null)
  const notice = useRef<{ text: string; until: number } | null>(null)
  const pendingRelease = useRef(false)
  const pendingReset = useRef(false)

  // ---- load the hand tracker once the camera is actually delivering frames
  const camReady = opts.camera.status === 'ready' && opts.mode !== 'demo'
  useEffect(() => {
    if (!camReady || trackerRef.current || trackerStateRef.current === 'loading') return
    trackerStateRef.current = 'loading'
    setTrackerState('loading')
    createHandTracker().then(
      (t) => {
        trackerRef.current = t
        trackerStateRef.current = 'ready'
        setTrackerState('ready')
      },
      (err) => {
        console.error('[hand-tracking] failed to load', err)
        trackerStateRef.current = 'error'
        setTrackerState('error')
      },
    )
  }, [camReady])
  useEffect(() => () => trackerRef.current?.close(), [])

  // ---- which sequences may trigger
  useEffect(() => {
    engine.setSequences(
      opts.mode === 'practice'
        ? { [opts.selected]: JUTSU_BY_ID[opts.selected].sequence }
        : Object.fromEntries(JUTSU.map((j) => [j.id, j.sequence])),
    )
    engine.reset()
  }, [engine, opts.mode, opts.selected])

  useEffect(() => {
    engine.setOptions({ holdMs: opts.settings.holdMs })
  }, [engine, opts.settings.holdMs])

  useEffect(() => {
    setMuted(!opts.settings.sound)
  }, [opts.settings.sound])

  // Leaving or entering demo cancels any running jutsu and simulation.
  useEffect(() => {
    sim.current = null
    lifecycle.current = IDLE_STATE
    engine.reset()
  }, [engine, opts.mode])

  // ---- the frame loop
  useEffect(() => {
    let raf = 0
    let lastVideoTime = -1
    let lastLandmarks: Landmark[][] = []
    let lastSeen = -Infinity
    let lastTs = performance.now()
    let trackCount = 0
    let renderCount = 0
    let fpsStart = lastTs
    let trackFps = 0
    let renderFps = 0
    let drewOverlay = false
    let handScale = 1
    const trail: { t: number; x: number; y: number }[] = []
    let prevUi = INITIAL_UI
    let prevPhase: JutsuPhase = 'idle'

    const setLifecycle = (next: JutsuState) => {
      lifecycle.current = next
    }

    const startJutsu = (id: JutsuId, now: number) => {
      // Aim across the screen towards the side with more room; flicks override this at release.
      fx.aim.x = fx.anchor.x > 0.5 ? -1 : 1
      fx.aim.y = 0.1
      setLifecycle(activate(id, now))
      optsRef.current.onJutsu(id)
    }

    const doRelease = (now: number, aim?: { x: number; y: number }) => {
      if (aim) {
        fx.aim.x = aim.x
        fx.aim.y = aim.y
      } else {
        // Fire along the direction the fingers point (falls back to the default aim if the hand
        // is pointing mostly at/away from the camera).
        const len = Math.hypot(fx.handUp.x, fx.handUp.y)
        if (len > 0.3) {
          fx.aim.x = fx.handUp.x / len
          fx.aim.y = fx.handUp.y / len
        }
      }
      setLifecycle(release(lifecycle.current, now))
    }

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop)
      const o = optsRef.current
      const dtSec = Math.min(0.1, (now - lastTs) / 1000)
      lastTs = now
      renderCount++

      let features: HandFeatures[] = []
      let inputSign: SignId | null = null
      let inputConf = 0
      let handsCount = 0
      let newDetection = false

      // ---------- input: real camera or simulation
      const tracker = trackerRef.current
      const video = o.videoRef.current
      const live = o.mode !== 'demo' && o.camera.status === 'ready' && tracker !== null && video !== null
      if (live) {
        if (video.readyState >= 2 && video.currentTime !== lastVideoTime) {
          lastVideoTime = video.currentTime
          try {
            lastLandmarks = tracker.detect(video, now)
            newDetection = true
            trackCount++
          } catch (err) {
            console.warn('[hand-tracking] detect failed', err)
          }
        }
        features = lastLandmarks.map((lm) => extractHandFeatures(lm, o.camera.aspect)).filter((f): f is HandFeatures => f !== null)
        handsCount = features.length
        const res = classifySign(features, o.camera.aspect)
        inputSign = res?.sign ?? null
        inputConf = res?.confidence ?? 0

        if (handsCount > 0) {
          lastSeen = now
          // Anchor: midpoint between hands for a clasp, otherwise the first hand's palm.
          const pts = inputSign === 'clasp' ? features : [features[0]]
          const cx = pts.reduce((s, f) => s + f.palmCenter.x, 0) / pts.length
          const cy = pts.reduce((s, f) => s + f.palmCenter.y, 0) / pts.length
          const d = imageToDisplay(cx, cy)
          fx.anchor.x = d.x
          fx.anchor.y = d.y
          handScale += (handScaleFromSize(features[0].handSize) - handScale) * Math.min(1, dtSec * 6)
          const pose = extractHandPose(lastLandmarks[0], o.camera.aspect)
          if (pose) {
            Object.assign(fx.handUp, pose.up)
            Object.assign(fx.handNormal, pose.normal)
          }
          fx.handScale = handScale
          if (newDetection) {
            trail.push({ t: now, x: d.x * o.camera.aspect, y: d.y })
            while (trail.length > 1 && now - trail[0].t > 160) trail.shift()
          }
        }
      } else if (o.mode === 'demo') {
        fx.anchor.x = demoAnchor.current.x
        fx.anchor.y = demoAnchor.current.y
        fx.handScale = 1
        handsCount = 1
        // Simulated hand rotation: pointer x rolls the "hand", pointer y pitches it.
        const sp = poseFromEuler((demoAnchor.current.x - 0.5) * 1.6, (demoAnchor.current.y - 0.55) * 1.0)
        Object.assign(fx.handUp, sp.up)
        Object.assign(fx.handNormal, sp.normal)
        const s = sim.current
        if (s) {
          const slot = o.settings.holdMs + 150 + SIM_GAP_MS
          const idx = Math.floor((now - s.start) / slot)
          if (idx >= s.signs.length) sim.current = null
          else if ((now - s.start) % slot < slot - SIM_GAP_MS) {
            inputSign = s.signs[idx]
            inputConf = 0.95
          }
        }
      }

      // ---------- hand visibility (live mode): fade gracefully when the hand leaves the frame
      if (live) {
        const lostMs = now - lastSeen
        const target = lostMs < 250 ? 1 : Math.max(0.3, 1 - (lostMs - 250) / 700)
        fx.visibility += (target - fx.visibility) * Math.min(1, dtSec * 10)
        if (lifecycle.current.phase !== 'idle' && lostMs > HAND_LOST_CANCEL_MS) {
          setLifecycle(IDLE_STATE)
          notice.current = { text: 'Hand lost, jutsu cancelled', until: now + 2500 }
        }
      } else {
        fx.visibility = 1
      }

      // ---------- sequence engine (paused while a jutsu is playing out)
      const idle = lifecycle.current.phase === 'idle'
      if (pendingReset.current) {
        pendingReset.current = false
        engine.reset()
      }
      const events = engine.update(idle ? inputSign : null, inputConf, now)
      for (const ev of events) {
        if (ev.type === 'sign') playSfx('sign')
        else if (ev.type === 'jutsu') startJutsu(ev.jutsu, now)
        else if (ev.type === 'timeout') notice.current = { text: 'Sequence timed out', until: now + 2000 }
      }

      // ---------- release: button/key, or a quick hand flick
      if (pendingRelease.current) {
        pendingRelease.current = false
        doRelease(now)
      } else if (live && newDetection && trail.length > 1 && ['charging', 'ready'].includes(lifecycle.current.phase)) {
        const a = trail[0]
        const b = trail[trail.length - 1]
        const secs = (b.t - a.t) / 1000
        if (secs > 0.04 && now - lifecycle.current.since > 450) {
          const vx = (b.x - a.x) / secs
          const vy = (b.y - a.y) / secs
          const speed = Math.hypot(vx, vy)
          if (speed > FLICK_SPEED) doRelease(now, { x: vx / speed, y: -vy / speed }) // display y is down, world y is up
        }
      }

      // ---------- lifecycle timers + FX state
      setLifecycle(tick(lifecycle.current, now))
      const st = lifecycle.current
      fx.jutsu = st.jutsu
      fx.phase = st.phase
      fx.phaseTime = (now - st.since) / 1000
      fx.charge = chargeLevel(st, now)
      if (st.phase !== prevPhase) {
        if (st.phase === 'charging') playSfx('charge')
        else if (st.phase === 'released') playSfx('launch')
        else if (st.phase === 'impact') playSfx('impact')
        if (st.phase === 'idle') trail.length = 0
        prevPhase = st.phase
      }

      // ---------- landmark overlay (2D canvas, display space)
      const cv = o.overlayRef.current
      if (cv) {
        const dpr = window.devicePixelRatio || 1
        const w = Math.round(cv.clientWidth * dpr)
        const h = Math.round(cv.clientHeight * dpr)
        if (cv.width !== w || cv.height !== h) {
          cv.width = w
          cv.height = h
        }
        const g = cv.getContext('2d')
        if (g) {
          const draw = live && o.settings.showLandmarks && lastLandmarks.length > 0
          if (draw || drewOverlay) g.clearRect(0, 0, w, h)
          drewOverlay = draw
          if (draw) {
            g.lineWidth = 2 * dpr
            for (const lm of lastLandmarks) {
              g.strokeStyle = 'rgba(56,189,248,0.85)'
              g.beginPath()
              for (const { start, end } of HandLandmarker.HAND_CONNECTIONS) {
                g.moveTo((1 - lm[start].x) * w, lm[start].y * h)
                g.lineTo((1 - lm[end].x) * w, lm[end].y * h)
              }
              g.stroke()
              g.fillStyle = '#e0f2fe'
              for (const p of lm) {
                g.beginPath()
                g.arc((1 - p.x) * w, p.y * h, 3 * dpr, 0, Math.PI * 2)
                g.fill()
              }
            }
          }
        }
      }

      // ---------- FPS
      if (now - fpsStart >= 500) {
        const s = (now - fpsStart) / 1000
        renderFps = Math.round(renderCount / s)
        trackFps = Math.round(trackCount / s)
        renderCount = trackCount = 0
        fpsStart = now
      }

      // ---------- publish a snapshot only when something a human can see changed
      if (notice.current && now > notice.current.until) notice.current = null
      const recognised = inputSign !== null && inputConf >= 0.45 ? inputSign : null
      const next: UiSnapshot = {
        status: deriveStatus({
          mode: o.mode,
          camera: o.camera.status,
          tracker: trackerStateRef.current,
          hands: handsCount,
          sign: recognised,
          registeredSigns: engine.signs.length,
          phase: st.phase,
        }),
        hands: handsCount,
        sign: recognised,
        confidence: quant(recognised ? inputConf : 0, 0.1),
        holdProgress: quant(engine.holdProgress(now), 0.1),
        registered: engine.signs.slice(),
        jutsu: st.jutsu,
        phase: st.phase,
        trackFps,
        renderFps,
        notice: notice.current?.text ?? null,
      }
      const p = prevUi
      if (
        next.status !== p.status ||
        next.hands !== p.hands ||
        next.sign !== p.sign ||
        next.confidence !== p.confidence ||
        next.holdProgress !== p.holdProgress ||
        next.registered.join() !== p.registered.join() ||
        next.jutsu !== p.jutsu ||
        next.phase !== p.phase ||
        next.trackFps !== p.trackFps ||
        next.renderFps !== p.renderFps ||
        next.notice !== p.notice
      ) {
        prevUi = next
        setUi(next)
      }
    }

    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
    // The loop reads everything else through refs.
  }, [])

  // ---- imperative controls
  const releaseJutsu = useCallback(() => {
    pendingRelease.current = true
  }, [])
  const resetSequence = useCallback(() => {
    pendingReset.current = true
    lifecycle.current = IDLE_STATE
  }, [])
  /** Demo mode: feed the selected jutsu's signs through the real sequence engine as simulated input. */
  const castDemo = useCallback((id: JutsuId) => {
    if (lifecycle.current.phase !== 'idle') return
    engine.reset()
    sim.current = { signs: JUTSU_BY_ID[id].sequence, start: performance.now() }
  }, [engine])
  const setDemoAnchor = useCallback((x: number, y: number) => {
    demoAnchor.current = { x, y }
  }, [])

  return { ui: { ...ui, tracker: trackerState }, fx, releaseJutsu, resetSequence, castDemo, setDemoAnchor }
}
