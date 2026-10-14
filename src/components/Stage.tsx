import { lazy, Suspense } from 'react'
import { JUTSU_BY_ID, type JutsuId } from '../config/jutsu'
import { SIGN_BY_ID } from '../config/signs'
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
    <div
      className="relative mx-auto overflow-hidden rounded-sm border border-(--color-line) bg-black"
      style={{ aspectRatio: String(camera.aspect), width: `min(100%, calc((100vh - 170px) * ${camera.aspect}))` }}
      onPointerMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect()
        onPointer((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height)
      }}
    >
      {/* Mirrored selfie preview; dimmed so additive effects stay readable on bright rooms. */}
      <video
        ref={videoRef}
        playsInline
        muted
        className="absolute inset-0 h-full w-full object-fill transition-opacity"
        style={{ transform: 'scaleX(-1)', opacity: cameraLive ? 1 : 0, filter: 'brightness(0.72) contrast(1.05)' }}
      />
      {!cameraLive && (
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_60%,#10203f_0%,#060a14_70%)]" />
      )}
      <canvas ref={overlayRef} className="pointer-events-none absolute inset-0 h-full w-full" />
      <Suspense fallback={null}>
        <JutsuStage fx={fx} jutsu={ui.jutsu} quality={quality} />
      </Suspense>
      <div className="hud-frame pointer-events-none absolute inset-2 opacity-70" />

      {/* Top-left: tracking status + measured performance */}
      <div className="pointer-events-none absolute left-4 top-4 flex flex-col gap-1">
        <div className="flex items-center gap-2 rounded-sm bg-black/55 px-2.5 py-1 text-sm">
          <span className={`h-2 w-2 rounded-full ${TONE[status.tone]}`} />
          <span>{status.text}</span>
        </div>
        {(cameraLive || mode === 'demo') && (
          <div className="px-1 font-mono text-[11px] text-slate-400">
            render {ui.renderFps} fps{cameraLive ? ` · track ${ui.trackFps} fps · ${ui.hands} hand${ui.hands === 1 ? '' : 's'}` : ''}
          </div>
        )}
      </div>

      {mode === 'demo' && (
        <div className="pointer-events-none absolute right-4 top-4 rounded-sm border border-amber-400/60 bg-amber-400/10 px-2.5 py-1 font-display text-sm tracking-widest text-amber-300">
          SIMULATED INPUT
        </div>
      )}

      {/* Jutsu activation banner */}
      {active && ui.phase === 'charging' && (
        <div key={active.id} className="jutsu-flash pointer-events-none absolute inset-x-0 top-[14%] text-center">
          <div className="font-display text-6xl tracking-wider" style={{ color: active.accent, textShadow: `0 0 24px ${active.accent}` }}>
            {active.name}
          </div>
          <div className="text-2xl text-white/80">{active.kanji}</div>
        </div>
      )}

      {ui.notice && (
        <div className="pointer-events-none absolute left-1/2 top-16 -translate-x-1/2 rounded-sm bg-black/70 px-3 py-1 text-sm text-amber-200">
          {ui.notice}
        </div>
      )}

      {/* Bottom: current sign + sequence progress */}
      <div className="pointer-events-none absolute inset-x-0 bottom-4 flex flex-col items-center gap-2 px-4">
        {ui.sign && mode !== 'demo' && (
          <div className="flex items-center gap-3 rounded-sm bg-black/65 px-3 py-1.5">
            <SignGlyph sign={ui.sign} size={30} color="#7dd3fc" />
            <div>
              <div className="font-display text-xl leading-none tracking-wide">{SIGN_BY_ID[ui.sign].label}</div>
              <div className="mt-1 h-1 w-28 overflow-hidden rounded bg-white/15" title="Recognition confidence">
                <div className="h-full bg-sky-400 transition-all" style={{ width: `${ui.confidence * 100}%` }} />
              </div>
            </div>
          </div>
        )}
        <div className="flex items-center gap-2 rounded-sm bg-black/65 px-3 py-2">
          <span className="mr-1 font-display text-sm tracking-widest text-slate-300">{def.name.toUpperCase()}</span>
          {def.sequence.map((s, i) => {
            const done = i < progress
            const holding = i === progress && ui.holdProgress > 0 && ui.sign === s
            return (
              <div
                key={i}
                className="relative flex h-11 w-11 items-center justify-center rounded-sm border transition-colors"
                style={{
                  borderColor: done ? def.accent : 'rgba(148,163,184,0.35)',
                  background: done ? `${def.accent}33` : 'transparent',
                  color: done ? def.accent : '#94a3b8',
                }}
                title={SIGN_BY_ID[s].label}
              >
                <SignGlyph sign={s} size={26} />
                {holding && (
                  <span className="absolute inset-x-0 bottom-0 h-0.5 bg-sky-300" style={{ width: `${ui.holdProgress * 100}%` }} />
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Camera call-to-action / failure states */}
      {needsCamera && (
        <div className="absolute inset-0 flex items-center justify-center p-6">
          <div className="panel max-w-md rounded-sm p-6 text-center">
            <div className="font-display text-3xl tracking-wide">
              {camera.status === 'starting' ? 'Starting camera…' : 'Show me your hand signs'}
            </div>
            <p className="mt-2 text-sm text-slate-300">
              {camera.message ??
                'Hand tracking runs entirely in your browser. Video never leaves your device.'}
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-3">
              <button
                className="rounded-sm bg-sky-500 px-5 py-2 font-display tracking-wider text-black hover:bg-sky-400 disabled:opacity-50"
                onClick={onStartCamera}
                disabled={camera.status === 'starting'}
              >
                {camera.status === 'denied' || camera.status === 'error' ? 'TRY AGAIN' : 'ENABLE CAMERA'}
              </button>
              <button
                className="rounded-sm border border-(--color-line) px-5 py-2 font-display tracking-wider hover:bg-white/5"
                onClick={onUseDemo}
              >
                DEMO MODE
              </button>
            </div>
          </div>
        </div>
      )}
      {cameraLive && ui.status === 'model-loading' && (
        <div className="pointer-events-none absolute inset-x-0 top-1/2 text-center text-sm text-sky-200">Loading hand tracker…</div>
      )}
      {cameraLive && ui.status === 'model-error' && (
        <div className="absolute inset-x-0 top-1/2 text-center text-sm text-red-300">
          The hand tracker could not be loaded. Run <code>npm run setup:mediapipe</code>, or use Demo mode.
        </div>
      )}
    </div>
  )
}
