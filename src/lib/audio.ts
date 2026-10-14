/**
 * Synthesised sound effects (WebAudio), so there are no audio assets and no licensing concerns.
 * Opt-in: muted until the user enables it, and the AudioContext is only created on first unmute
 * (which satisfies browser autoplay policies since that happens inside a click).
 */
export type SfxName = 'sign' | 'charge' | 'activate' | 'launch' | 'impact'

let ctx: AudioContext | null = null
let muted = true

function getCtx(): AudioContext | null {
  if (muted) return null
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return null
    ctx = new Ctor()
  }
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

export function setMuted(value: boolean) {
  muted = value
  if (!value) getCtx()
}

function tone(c: AudioContext, type: OscillatorType, f0: number, f1: number, dur: number, gain: number) {
  const t = c.currentTime
  const osc = c.createOscillator()
  const g = c.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(f0, t)
  osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur)
  g.gain.setValueAtTime(gain, t)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  osc.connect(g).connect(c.destination)
  osc.start(t)
  osc.stop(t + dur)
}

function noise(c: AudioContext, f0: number, f1: number, dur: number, gain: number) {
  const t = c.currentTime
  const buf = c.createBuffer(1, Math.ceil(c.sampleRate * dur), c.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
  const src = c.createBufferSource()
  src.buffer = buf
  const filter = c.createBiquadFilter()
  filter.type = 'bandpass'
  filter.frequency.setValueAtTime(f0, t)
  filter.frequency.exponentialRampToValueAtTime(f1, t + dur)
  const g = c.createGain()
  g.gain.setValueAtTime(gain, t)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  src.connect(filter).connect(g).connect(c.destination)
  src.start(t)
}

export function playSfx(name: SfxName) {
  const c = getCtx()
  if (!c) return
  switch (name) {
    case 'sign':
      tone(c, 'triangle', 660, 990, 0.12, 0.15)
      break
    case 'charge':
      tone(c, 'sawtooth', 120, 520, 1.1, 0.06)
      noise(c, 300, 2400, 1.1, 0.08)
      break
    case 'activate':
      tone(c, 'sine', 160, 50, 0.5, 0.35)
      noise(c, 2000, 400, 0.4, 0.15)
      break
    case 'launch':
      noise(c, 400, 4000, 0.5, 0.25)
      break
    case 'impact':
      tone(c, 'sine', 120, 35, 0.6, 0.45)
      noise(c, 1200, 120, 0.6, 0.3)
      break
  }
}
