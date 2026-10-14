import { JUTSU, type JutsuId } from '../config/jutsu'
import { SIGN_BY_ID, RECOGNITION } from '../config/signs'
import type { CameraApi } from '../features/camera/useCamera'
import { sequenceProgress } from '../features/gesture-recognition/sequence'
import type { Mode } from '../features/jutsu-system/status'
import type { Settings, UiSnapshot } from '../app/useExperience'
import { SectionTitle } from './Brand'
import { SignGlyph } from './SignGlyph'

interface Props {
  mode: Mode
  selected: JutsuId
  ui: UiSnapshot
  camera: CameraApi
  settings: Settings
  onSelect: (id: JutsuId) => void
  onSettings: (patch: Partial<Settings>) => void
  onReset: () => void
  onRelease: () => void
  onCast: () => void
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 py-1.5 text-sm">
      <span>{label}</span>
      <input type="checkbox" className="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  )
}

export function ControlPanel({ mode, selected, ui, camera, settings, onSelect, onSettings, onReset, onRelease, onCast }: Props) {
  const canRelease = ui.phase === 'charging' || ui.phase === 'ready'

  return (
    <aside className="flex flex-col gap-4">
      <section className="panel p-4">
        <SectionTitle jp="術">JUTSU</SectionTitle>
        <div className="flex flex-col gap-2.5">
          {JUTSU.map((j) => {
            const isSel = j.id === selected
            const progress = sequenceProgress(ui.registered, j.sequence)
            return (
              <button
                key={j.id}
                onClick={() => onSelect(j.id)}
                aria-pressed={isSel}
                className="group relative overflow-hidden border p-3 text-left transition-colors"
                style={{
                  borderColor: isSel ? '#ffcf33' : 'rgba(255,160,30,0.22)',
                  background: isSel
                    ? 'linear-gradient(100deg, rgba(255,150,20,0.22), rgba(60,20,4,0.6))'
                    : 'rgba(0,0,0,0.35)',
                  clipPath: 'polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 12px 100%, 0 calc(100% - 12px))',
                  boxShadow: isSel ? 'inset 0 0 24px rgba(255,140,0,0.18)' : undefined,
                }}
              >
                {/* oversized kanji watermark */}
                <span
                  className="pointer-events-none absolute -right-1 -top-1 select-none font-brush leading-none"
                  style={{
                    fontSize: j.kanji.length > 3 ? '2.4rem' : '3.6rem',
                    color: isSel ? 'rgba(255,200,60,0.22)' : 'rgba(255,255,255,0.05)',
                  }}
                >
                  {j.kanji}
                </span>
                {/* element colour tag */}
                <span className="absolute inset-y-0 left-0 w-1" style={{ background: j.accent }} />
                <div className="relative pl-1">
                  <div className="flex items-center gap-2">
                    <span className="font-brush text-xl tracking-wide" style={{ color: isSel ? '#ffd23a' : '#f6e7d2' }}>
                      {j.name}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {j.sequence.map((s, i) => {
                      const done = i < progress
                      return (
                        <span
                          key={i}
                          className="flex items-center gap-1 px-1.5 py-0.5 font-display text-xs tracking-wider"
                          style={{
                            background: done ? '#ffcf33' : 'rgba(255,160,30,0.1)',
                            color: done ? '#1a0b02' : '#e0b070',
                            clipPath: 'polygon(5px 0, 100% 0, calc(100% - 5px) 100%, 0 100%)',
                          }}
                        >
                          <SignGlyph sign={s} size={15} />
                          {SIGN_BY_ID[s].label}
                        </span>
                      )
                    })}
                  </div>
                </div>
              </button>
            )
          })}
        </div>
        <p className="mt-3 text-xs text-slate-400">
          {mode === 'practice'
            ? 'Practice: only the selected jutsu can trigger.'
            : mode === 'freeplay'
              ? 'Free-play: any sequence triggers its jutsu.'
              : 'Demo: signs are simulated, not recognised.'}
        </p>
      </section>

      <section className="panel p-4">
        <SectionTitle jp="操作">CONTROLS</SectionTitle>
        <div className="grid grid-cols-2 gap-2.5">
          {mode === 'demo' ? (
            <button className="btn btn-gold col-span-2" onClick={onCast} disabled={ui.phase !== 'idle'}>
              CAST (SIMULATED)
            </button>
          ) : (
            <button
              className={`btn col-span-2 ${camera.status === 'ready' ? 'btn-ghost' : 'btn-gold'}`}
              onClick={camera.status === 'ready' ? camera.stop : camera.start}
              disabled={camera.status === 'starting'}
            >
              {camera.status === 'ready' ? 'STOP CAMERA' : 'START CAMERA'}
            </button>
          )}
          <button className="btn btn-gold" onClick={onRelease} disabled={!canRelease} title="Space, or flick your hand">
            RELEASE
          </button>
          <button className="btn btn-ghost" onClick={onReset} title="R">
            RESET
          </button>
        </div>
        <p className="mt-3 text-xs text-slate-400">Release: Space, or flick your hand. Reset: R.</p>
      </section>

      <section className="panel p-4">
        <SectionTitle jp="設定">SETTINGS</SectionTitle>
        <Toggle label="Show hand landmarks" checked={settings.showLandmarks} onChange={(v) => onSettings({ showLandmarks: v })} />
        <Toggle label="Sound effects" checked={settings.sound} onChange={(v) => onSettings({ sound: v })} />
        <Toggle label="Reduced effects (faster)" checked={settings.lowQuality} onChange={(v) => onSettings({ lowQuality: v })} />
        <label className="mt-1 block py-1.5 text-sm">
          <span className="flex justify-between">
            <span>Sign hold time</span>
            <span className="font-mono text-chakra">{settings.holdMs} ms</span>
          </span>
          <input
            type="range"
            min={150}
            max={900}
            step={50}
            value={settings.holdMs}
            onChange={(e) => onSettings({ holdMs: Number(e.target.value) })}
            className="mt-1 w-full"
          />
        </label>
        <p className="mt-1 text-xs text-slate-400">Default {RECOGNITION.holdMs} ms. Raise it if signs trigger by accident.</p>
      </section>
    </aside>
  )
}
