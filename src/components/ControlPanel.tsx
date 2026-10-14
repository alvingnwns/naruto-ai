import { JUTSU, type JutsuId } from '../config/jutsu'
import { SIGN_BY_ID, RECOGNITION } from '../config/signs'
import type { CameraApi } from '../features/camera/useCamera'
import { sequenceProgress } from '../features/gesture-recognition/sequence'
import type { Mode } from '../features/jutsu-system/status'
import type { Settings, UiSnapshot } from '../app/useExperience'
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
      <input type="checkbox" className="h-4 w-4 accent-sky-400" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  )
}

export function ControlPanel({ mode, selected, ui, camera, settings, onSelect, onSettings, onReset, onRelease, onCast }: Props) {
  const canRelease = ui.phase === 'charging' || ui.phase === 'ready'
  const btn =
    'rounded-sm border border-(--color-line) px-3 py-2 font-display text-sm tracking-wider transition-colors hover:bg-white/5 disabled:opacity-40 disabled:hover:bg-transparent'

  return (
    <aside className="flex flex-col gap-4">
      <section className="panel rounded-sm p-3">
        <h2 className="mb-2 font-display text-sm tracking-[0.2em] text-slate-400">JUTSU</h2>
        <div className="flex flex-col gap-2">
          {JUTSU.map((j) => {
            const isSel = j.id === selected
            const progress = sequenceProgress(ui.registered, j.sequence)
            return (
              <button
                key={j.id}
                onClick={() => onSelect(j.id)}
                className="rounded-sm border p-2.5 text-left transition-colors hover:bg-white/5"
                style={{ borderColor: isSel ? j.accent : 'var(--color-line)', background: isSel ? `${j.accent}14` : undefined }}
                aria-pressed={isSel}
              >
                <div className="flex items-baseline justify-between">
                  <span className="font-display text-xl tracking-wide" style={{ color: isSel ? j.accent : undefined }}>
                    {j.name}
                  </span>
                  <span className="text-sm text-slate-400">{j.kanji}</span>
                </div>
                <div className="mt-2 flex items-center gap-1.5">
                  {j.sequence.map((s, i) => (
                    <span
                      key={i}
                      className="flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-xs"
                      style={{
                        background: i < progress ? `${j.accent}33` : 'rgba(255,255,255,0.05)',
                        color: i < progress ? j.accent : '#94a3b8',
                      }}
                    >
                      <SignGlyph sign={s} size={16} />
                      {SIGN_BY_ID[s].label}
                    </span>
                  ))}
                </div>
              </button>
            )
          })}
        </div>
        <p className="mt-2 text-xs text-slate-500">
          {mode === 'practice'
            ? 'Practice: only the selected jutsu can trigger.'
            : mode === 'freeplay'
              ? 'Free-play: any sequence triggers its jutsu.'
              : 'Demo: signs are simulated, not recognised.'}
        </p>
      </section>

      <section className="panel rounded-sm p-3">
        <h2 className="mb-2 font-display text-sm tracking-[0.2em] text-slate-400">CONTROLS</h2>
        <div className="grid grid-cols-2 gap-2">
          {mode === 'demo' ? (
            <button className={`${btn} col-span-2 border-amber-400/60 text-amber-200`} onClick={onCast} disabled={ui.phase !== 'idle'}>
              CAST (SIMULATED)
            </button>
          ) : (
            <button
              className={`${btn} col-span-2`}
              onClick={camera.status === 'ready' ? camera.stop : camera.start}
              disabled={camera.status === 'starting'}
            >
              {camera.status === 'ready' ? 'STOP CAMERA' : 'START CAMERA'}
            </button>
          )}
          <button className={btn} onClick={onRelease} disabled={!canRelease} title="Space, or flick your hand">
            RELEASE
          </button>
          <button className={btn} onClick={onReset} title="R">
            RESET
          </button>
        </div>
        <p className="mt-2 text-xs text-slate-500">Release: press Space or flick your hand. Reset: R.</p>
      </section>

      <section className="panel rounded-sm p-3">
        <h2 className="mb-1 font-display text-sm tracking-[0.2em] text-slate-400">SETTINGS</h2>
        <Toggle label="Show hand landmarks" checked={settings.showLandmarks} onChange={(v) => onSettings({ showLandmarks: v })} />
        <Toggle label="Sound effects" checked={settings.sound} onChange={(v) => onSettings({ sound: v })} />
        <Toggle label="Reduced effects (faster)" checked={settings.lowQuality} onChange={(v) => onSettings({ lowQuality: v })} />
        <label className="mt-1 block py-1.5 text-sm">
          <span className="flex justify-between">
            <span>Sign hold time</span>
            <span className="font-mono text-slate-400">{settings.holdMs} ms</span>
          </span>
          <input
            type="range"
            min={150}
            max={900}
            step={50}
            value={settings.holdMs}
            onChange={(e) => onSettings({ holdMs: Number(e.target.value) })}
            className="mt-1 w-full accent-sky-400"
          />
        </label>
        <p className="mt-1 text-xs text-slate-500">Default {RECOGNITION.holdMs} ms. Raise it if signs trigger by accident.</p>
      </section>
    </aside>
  )
}
