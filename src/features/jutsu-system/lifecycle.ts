import { JUTSU_BY_ID, type JutsuId } from '../../config/jutsu'

/** idle -> charging -> ready -> released -> impact -> idle */
export type JutsuPhase = 'idle' | 'charging' | 'ready' | 'released' | 'impact'

export interface JutsuState {
  jutsu: JutsuId | null
  phase: JutsuPhase
  /** ms timestamp the current phase started. */
  since: number
}

export const IDLE_STATE: JutsuState = { jutsu: null, phase: 'idle', since: 0 }

export function activate(jutsu: JutsuId, now: number): JutsuState {
  return { jutsu, phase: 'charging', since: now }
}

/** Release is only meaningful once charging has begun; otherwise the state is unchanged. */
export function release(state: JutsuState, now: number): JutsuState {
  if (state.phase !== 'charging' && state.phase !== 'ready') return state
  return { ...state, phase: 'released', since: now }
}

/** Advances timed transitions. Returns the same object when nothing changed. */
export function tick(state: JutsuState, now: number): JutsuState {
  if (!state.jutsu || state.phase === 'idle') return state
  const def = JUTSU_BY_ID[state.jutsu]
  const elapsed = now - state.since
  switch (state.phase) {
    case 'charging':
      return elapsed >= def.chargeMs ? { ...state, phase: 'ready', since: now } : state
    case 'released':
      return elapsed >= def.releaseMs ? { ...state, phase: 'impact', since: now } : state
    case 'impact':
      return elapsed >= def.impactMs ? IDLE_STATE : state
    default:
      return state
  }
}

/** Charge level 0..1, used to scale effects while charging. */
export function chargeLevel(state: JutsuState, now: number): number {
  if (!state.jutsu || state.phase === 'idle') return 0
  if (state.phase === 'charging') return Math.min(1, (now - state.since) / JUTSU_BY_ID[state.jutsu].chargeMs)
  return 1
}
