import type { JutsuId } from '../../config/jutsu'
import { RECOGNITION, type SignId } from '../../config/signs'

export type SequenceEvent =
  | { type: 'sign'; sign: SignId }
  | { type: 'jutsu'; jutsu: JutsuId }
  | { type: 'timeout' }
  | { type: 'reset' }

export interface SequenceOptions {
  holdMs: number
  graceMs: number
  cooldownMs: number
  timeoutMs: number
  minConfidence: number
}

export const defaultSequenceOptions: SequenceOptions = {
  holdMs: RECOGNITION.holdMs,
  graceMs: RECOGNITION.graceMs,
  cooldownMs: RECOGNITION.cooldownMs,
  timeoutMs: RECOGNITION.timeoutMs,
  minConfidence: RECOGNITION.minConfidence,
}

/** Number of leading signs of `sequence` that the tail of `buffer` currently satisfies. */
export function sequenceProgress(buffer: readonly SignId[], sequence: readonly SignId[]): number {
  for (let k = Math.min(buffer.length, sequence.length); k > 0; k--) {
    let ok = true
    for (let i = 0; i < k; i++) {
      if (buffer[buffer.length - k + i] !== sequence[i]) {
        ok = false
        break
      }
    }
    if (ok) return k
  }
  return 0
}

/**
 * Turns a noisy per-frame stream of (sign, confidence) into debounced sign events and jutsu
 * triggers. Time is injected via `now` (ms), so it is deterministic and testable.
 */
export class SequenceEngine {
  private opts: SequenceOptions
  private sequences: Partial<Record<JutsuId, readonly SignId[]>> = {}

  private buffer: SignId[] = []
  /** The pose currently being held (tolerating `graceMs` of flicker). */
  private pending: SignId | null = null
  private pendingSince = 0
  private pendingLastSeen = 0
  /**
   * The sign that just registered. It cannot register again until it has been absent for longer
   * than `graceMs`, so holding one pose never fires repeatedly.
   */
  private lastRegistered: SignId | null = null
  private lastRegisteredSeen = 0
  private lastRegisterTime = -Infinity

  constructor(opts: Partial<SequenceOptions> = {}) {
    this.opts = { ...defaultSequenceOptions, ...opts }
  }

  setOptions(opts: Partial<SequenceOptions>) {
    this.opts = { ...this.opts, ...opts }
  }

  /** Sequences allowed to trigger right now (practice: one; free-play: all). */
  setSequences(seqs: Partial<Record<JutsuId, readonly SignId[]>>) {
    this.sequences = seqs
  }

  get signs(): readonly SignId[] {
    return this.buffer
  }

  get holding(): SignId | null {
    return this.pending
  }

  /** 0..1 progress of the currently-held pose towards registering. */
  holdProgress(now: number): number {
    if (!this.pending || this.pending === this.lastRegistered) return 0
    return Math.min(1, Math.max(0, (now - this.pendingSince) / this.opts.holdMs))
  }

  reset(): SequenceEvent[] {
    const had = this.buffer.length > 0
    this.buffer = []
    this.pending = null
    return had ? [{ type: 'reset' }] : []
  }

  update(sign: SignId | null, confidence: number, now: number): SequenceEvent[] {
    const events: SequenceEvent[] = []
    const reading = sign !== null && confidence >= this.opts.minConfidence ? sign : null

    if (this.buffer.length > 0 && now - this.lastRegisterTime > this.opts.timeoutMs) {
      this.buffer = []
      events.push({ type: 'timeout' })
    }

    // Re-arm the registered sign once it has been gone for longer than the grace window.
    if (this.lastRegistered !== null) {
      if (reading === this.lastRegistered) this.lastRegisteredSeen = now
      else if (now - this.lastRegisteredSeen > this.opts.graceMs) this.lastRegistered = null
    }

    // Track the held pose; a different reading only takes over after the grace window.
    if (reading !== null && reading === this.pending) {
      this.pendingLastSeen = now
    } else if (reading !== this.pending && (this.pending === null || now - this.pendingLastSeen > this.opts.graceMs)) {
      this.pending = reading
      this.pendingSince = now
      this.pendingLastSeen = now
    }

    if (
      this.pending !== null &&
      this.pending !== this.lastRegistered &&
      now - this.pendingSince >= this.opts.holdMs &&
      now - this.lastRegisterTime >= this.opts.cooldownMs
    ) {
      events.push(...this.register(this.pending, now))
    }
    return events
  }

  private register(sign: SignId, now: number): SequenceEvent[] {
    const events: SequenceEvent[] = [{ type: 'sign', sign }]
    this.lastRegistered = sign
    this.lastRegisteredSeen = now
    this.lastRegisterTime = now
    this.buffer.push(sign)
    const maxLen = Math.max(1, ...Object.values(this.sequences).map((s) => s?.length ?? 0))
    if (this.buffer.length > maxLen) this.buffer.splice(0, this.buffer.length - maxLen)

    for (const [id, seq] of Object.entries(this.sequences) as [JutsuId, readonly SignId[]][]) {
      if (seq.length > 0 && sequenceProgress(this.buffer, seq) === seq.length) {
        events.push({ type: 'jutsu', jutsu: id })
        this.buffer = []
        break
      }
    }
    return events
  }
}
