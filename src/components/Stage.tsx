import { lazy, Suspense } from 'react'
import { JUTSU_BY_ID, type JutsuId } from '../config/jutsu'
import { SIGN_BY_ID, type SignId } from '../config/signs'
import type { CameraApi } from '../features/camera/useCamera'
import { sequenceProgress } from '../features/gesture-recognition/sequence'
import { STATUS_LABEL, type Mode } from '../features/jutsu-system/status'
import type { FxState } from '../features/vfx/shared'
import type { UiSnapshot } from '../app/useExperience'
import { SignGlyph } from './SignGlyph'

const JutsuStage = lazy(() => import('../features/vfx/JutsuStage'))

const TONE: Record<string, string> = {
  neutral: 'bg-slate-400',
  warn: 'bg-amber-400',
  bad: 'bg-red-500',
  good: 'bg-emerald-400',
  hot: 'bg-orange-400',
}

/** A diamond "seal" tile. Fills gold when achieved; while its sign is being held a conic ring fills clockwise. */
function SealTile({ sign, done, hold, size = 40 }: { sign: SignId; done: boolean; hold: number; size?: number }) {
  const ring = done
    ? '#ffcf33'
    : hold > 0
      ? `conic-gradient(#ffcf33 ${hold * 360}deg, rgba(255,160,30,0.35) 0)`
      : 'rgba(255,160,30,0.35)'
  return (
    <div className="relative rotate-45" style={{ width: size, height: size, background: ring }} title={SIGN_BY_ID[sign].label}>
      <div className="absolute inset-[2.5px] flex items-center justify-center" style={{ background: done ? '#ffcf33' : '#0a0604' }}>
        <div className="-rotate-45">
          <SignGlyph sign={sign} size={size * 0.6} color={done ? '#1a0b02' : '#ffb02e'} />
        </div>
      </div>
    </div>
  )
}

interface Props {
  mode: Mode
  selected: JutsuId
  ui: UiSnapshot & { tracker: string }
  camera: CameraApi
  fx: FxState
  quality: number
  videoRef: React.RefObject<HTMLVideoElement | null>
  overlayRef: React.RefObject<HTMLCanvasElement | null>
  onStartCamera: () => void
  onUseDemo: () => void
  onPointer: (x: number, y: number) => void
}

export function Stage({ mode, selected, ui, camera, fx, quality, videoRef, overlayRef, onStartCamera, onUseDemo, onPointer }: Props) {
  const status = STATUS_LABEL[ui.status]
  const def = JUTSU_BY_ID[selected]
  const progress = sequenceProgress(ui.registered, def.sequence)
  const cameraLive = camera.status === 'ready' && mode !== 'demo'
  const needsCamera = mode !== 'demo' && camera.status !== 'ready'
  const active = ui.jutsu ? JUTSU_BY_ID[ui.jutsu] : null

  return (
    <div className="chakra-frame mx-auto self-start" style={{ width: `min(100%, calc((100vh - 150px) * ${camera.aspect}))` }}>
      <div
        className="relative overflow-hidden bg-black"
        style={{ aspectRatio: String(camera.aspect) }}
        onPointerMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect()
          onPointer((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height)
        }}
      >
        {/* Mirrored selfie preview; dimmed and warmed so additive effects stay readable. */}
        <video
          ref={videoRef}
          playsInline
          muted
          className="absolute inset-0 h-full w-full object-fill transition-opacity"
          style={{ transform: 'scaleX(-1)', opacity: cameraLive ? 1 : 0, filter: 'brightness(0.7) contrast(1.05) sepia(0.15)' }}
        />
        {!cameraLive && (
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_75%,#4a1d05_0%,#150803_55%,#050302_100%)]" />
        )}
        <canvas ref={overlayRef} className="pointer-events-none absolute inset-0 h-full w-full" />
        <Suspense fallback={null}>
          <JutsuStage fx={fx} jutsu={ui.jutsu} quality={quality} />
        </Suspense>

        {/* Top-left: tracking status + measured performance */}
        <div className="pointer-events-none absolute left-3 top-3 flex flex-col gap-1">
          <div className="chip flex items-center gap-2 text-sm">
            <span className={`h-2 w-2 rotate-45 ${TONE[status.tone]}`} />
            <span className="font-display tracking-wider">{status.text}</span>
          </div>
          {(cameraLive || mode === 'demo') && (
            <div className="px-1 font-mono text-[11px] text-chakra/80">
              render {ui.renderFps} fps
              {cameraLive ? ` · track ${ui.trackFps} fps · ${ui.hands} hand${ui.hands === 1 ? '' : 's'}` : ''}
            </div>
          )}
        </div>

        {mode === 'demo' && (
          <div className="pointer-events-none absolute right-3 top-3 border border-red-500/70 bg-red-950/70 px-3 py-1 font-display text-sm tracking-[0.25em] text-red-300">
            SIMULATED INPUT
          </div>
        )}

        {/* Jutsu activation banner */}
        {active && ui.phase === 'charging' && (
          <div key={active.id} className="jutsu-flash pointer-events-none absolute inset-x-0 top-[8%] text-center">
            <div className="burst" />
            <div className="relative">
              <div
                className="brush-outline font-brush text-7xl tracking-wide"
                style={{ color: '#ffd23a', textShadow: '0 0 28px rgba(255,140,0,0.9), 0 0 60px rgba(255,80,0,0.6)' }}
              >
                {active.name.toUpperCase()}
              </div>
              <div className="brush-outline font-brush text-3xl text-white">{active.kanji}</div>
            </div>
          </div>
        )}

        {ui.notice && (
          <div className="chip pointer-events-none absolute left-1/2 top-16 -translate-x-1/2 text-sm text-amber-200">{ui.notice}</div>
        )}

        {/* Bottom: current sign + sequence progress */}
        <div className="pointer-events-none absolute inset-x-0 bottom-3 flex flex-col items-center gap-3 px-4">
          {ui.sign && mode !== 'demo' && (
            <div className="chip flex items-center gap-3 py-1.5!">
              <SealTile sign={ui.sign} done={false} hold={ui.holdProgress} size={34} />
              <div className="pl-1">
                <div className="font-brush text-2xl leading-none text-gold">{SIGN_BY_ID[ui.sign].label.toUpperCase()}</div>
                <div className="mt-1.5 h-1.5 w-28 bg-white/10" title="Recognition confidence">
                  <div
                    className="h-full bg-linear-to-r from-gold to-flame transition-all"
                    style={{ width: `${ui.confidence * 100}%` }}
                  />
                </div>
              </div>
            </div>
          )}
          <div className="chip flex items-center gap-4 py-2! pr-6!">
            <span className="font-brush text-lg tracking-wider text-gold">{def.name.toUpperCase()}</span>
            <div className="flex items-center gap-4 pl-1">
              {def.sequence.map((s, i) => (
                <SealTile
                  key={i}
                  sign={s}
                  done={i < progress}
                  hold={i === progress && ui.sign === s ? ui.holdProgress : 0}
                  size={34}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Camera call-to-action / failure states */}
        {needsCamera && (
          <div className="absolute inset-0 flex items-center justify-center p-6">
            <div className="panel max-w-md p-6 text-center">
              <div className="font-brush text-4xl leading-tight text-gold [text-shadow:0_0_18px_rgba(255,130,0,0.6)]">
                {camera.status === 'starting' ? 'Starting camera…' : 'SHOW ME YOUR SEALS'}
              </div>
              <div className="mt-1 font-brush text-2xl text-white/70">印</div>
              <p className="mt-3 text-sm text-slate-300">
                {camera.message ?? 'Hand tracking runs entirely in your browser. Video never leaves your device.'}
              </p>
              <div className="mt-5 flex flex-wrap justify-center gap-3">
                <button className="btn btn-gold" onClick={onStartCamera} disabled={camera.status === 'starting'}>
                  {camera.status === 'denied' || camera.status === 'error' ? 'TRY AGAIN' : 'ENABLE CAMERA'}
                </button>
                <button className="btn btn-ghost" onClick={onUseDemo}>
                  DEMO MODE
                </button>
              </div>
            </div>
          </div>
        )}
        {cameraLive && ui.status === 'model-loading' && (
          <div className="pointer-events-none absolute inset-x-0 top-1/2 text-center font-display tracking-widest text-gold">
            LOADING HAND TRACKER…
          </div>
        )}
        {cameraLive && ui.status === 'model-error' && (
          <div className="absolute inset-x-0 top-1/2 text-center text-sm text-red-300">
            The hand tracker could not be loaded. Run <code>npm run setup:mediapipe</code>, or use Demo mode.
          </div>
        )}
      </div>
    </div>
  )
}
