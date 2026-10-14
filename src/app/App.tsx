import { useCallback, useEffect, useRef, useState } from 'react'
import { type JutsuId } from '../config/jutsu'
import { RECOGNITION } from '../config/signs'
import { TomoeEmblem } from '../components/Brand'
import { ControlPanel } from '../components/ControlPanel'
import { Stage } from '../components/Stage'
import { useCamera } from '../features/camera/useCamera'
import type { Mode } from '../features/jutsu-system/status'
import { useExperience, type Settings } from './useExperience'

const MODES: { id: Mode; label: string; jp: string }[] = [
  { id: 'practice', label: 'PRACTICE', jp: '修行' },
  { id: 'freeplay', label: 'FREE-PLAY', jp: '自由' },
  { id: 'demo', label: 'DEMO', jp: '見本' },
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

  return (
    <div className="flex min-h-full flex-col">
      <header className="relative flex flex-wrap items-center justify-between gap-4 border-b border-(--color-line) bg-black/40 px-5 py-3">
        {/* flame-coloured underline */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[2px] bg-linear-to-r from-transparent via-gold to-transparent opacity-70" />
        <div className="flex items-center gap-3">
          <TomoeEmblem />
          <div>
            <h1 className="font-brush text-3xl leading-none tracking-wide">
              <span className="text-white [text-shadow:0_2px_0_#000]">HAND SIGN </span>
              <span className="bg-linear-to-b from-[#fff2a8] via-gold to-[#ff7a00] bg-clip-text text-transparent [filter:drop-shadow(0_0_10px_rgba(255,140,0,0.65))]">
                JUTSU
              </span>
            </h1>
            <div className="mt-1 hidden font-display text-[11px] tracking-[0.35em] text-chakra sm:block">
              九尾チャクラモード · NINE-TAILS CHAKRA MODE
            </div>
          </div>
        </div>
        <nav className="flex gap-2" aria-label="Mode">
          {MODES.map((m) => (
            <button
              key={m.id}
              onClick={() => changeMode(m.id)}
              aria-pressed={mode === m.id}
              className="btn btn-ghost btn-tab flex items-baseline gap-1.5 text-sm"
            >
              <span className="font-brush text-xs opacity-80">{m.jp}</span>
              <span>{m.label}</span>
            </button>
          ))}
        </nav>
      </header>

      <main className="grid flex-1 gap-5 p-4 lg:grid-cols-[minmax(0,1fr)_350px]">
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
