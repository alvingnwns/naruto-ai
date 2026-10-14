import { useCallback, useEffect, useRef, useState } from 'react'
import { JUTSU_BY_ID, type JutsuId } from '../config/jutsu'
import { RECOGNITION } from '../config/signs'
import { ControlPanel } from '../components/ControlPanel'
import { Stage } from '../components/Stage'
import { useCamera } from '../features/camera/useCamera'
import type { Mode } from '../features/jutsu-system/status'
import { useExperience, type Settings } from './useExperience'

const MODES: { id: Mode; label: string }[] = [
  { id: 'practice', label: 'PRACTICE' },
  { id: 'freeplay', label: 'FREE-PLAY' },
  { id: 'demo', label: 'DEMO' },
]

const prefersReducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

export default function App() {
  const [mode, setMode] = useState<Mode>('practice')
  const [selected, setSelected] = useState<JutsuId>('rasengan')
  const [settings, setSettings] = useState<Settings>({
    showLandmarks: true,
    sound: false, // opt-in
    holdMs: RECOGNITION.holdMs,
    lowQuality: prefersReducedMotion(),
  })

  const videoRef = useRef<HTMLVideoElement>(null)
  const overlayRef = useRef<HTMLCanvasElement>(null)
  const camera = useCamera(videoRef)

  const { ui, fx, releaseJutsu, resetSequence, castDemo, setDemoAnchor } = useExperience({
    mode,
    selected,
    settings,
    camera,
    videoRef,
    overlayRef,
    onJutsu: setSelected,
  })

  const changeMode = useCallback(
    (next: Mode) => {
      if (next === 'demo') camera.stop() // demo never touches the webcam
      setMode(next)
    },
    [camera],
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return
      if (e.code === 'Space') {
        e.preventDefault()
        releaseJutsu()
      } else if (e.code === 'KeyR') resetSequence()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [releaseJutsu, resetSequence])

  const accent = JUTSU_BY_ID[selected].accent

  return (
    <div className="flex min-h-full flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-(--color-line) px-5 py-3">
        <div className="flex items-baseline gap-3">
          <h1 className="font-display text-3xl font-semibold tracking-[0.12em]" style={{ textShadow: `0 0 18px ${accent}66` }}>
            HAND SIGN <span style={{ color: accent }}>JUTSU</span>
          </h1>
          <span className="hidden text-sm text-slate-400 sm:inline">印 · real-time hand tracking</span>
        </div>
        <nav className="flex gap-1" aria-label="Mode">
          {MODES.map((m) => (
            <button
              key={m.id}
              onClick={() => changeMode(m.id)}
              aria-pressed={mode === m.id}
              className="rounded-sm border px-4 py-1.5 font-display text-sm tracking-[0.18em] transition-colors"
              style={{
                borderColor: mode === m.id ? accent : 'var(--color-line)',
                color: mode === m.id ? accent : '#94a3b8',
                background: mode === m.id ? `${accent}14` : 'transparent',
              }}
            >
              {m.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="grid flex-1 gap-5 p-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Stage
          mode={mode}
          selected={selected}
          ui={ui}
          camera={camera}
          fx={fx}
          quality={settings.lowQuality ? 0.5 : 1}
          videoRef={videoRef}
          overlayRef={overlayRef}
          onStartCamera={() => void camera.start()}
          onUseDemo={() => changeMode('demo')}
          onPointer={setDemoAnchor}
        />
        <ControlPanel
          mode={mode}
          selected={selected}
          ui={ui}
          camera={camera}
          settings={settings}
          onSelect={setSelected}
          onSettings={(p) => setSettings((s) => ({ ...s, ...p }))}
          onReset={resetSequence}
          onRelease={releaseJutsu}
          onCast={() => castDemo(selected)}
        />
      </main>
    </div>
  )
}
