import { describe, expect, it } from 'vitest'
import { deriveStatus, type StatusInput } from './status'

const base: StatusInput = {
  mode: 'practice',
  camera: 'ready',
  tracker: 'ready',
  hands: 0,
  sign: null,
  registeredSigns: 0,
  phase: 'idle',
}

describe('deriveStatus', () => {
  it('distinguishes every camera failure from a working camera', () => {
    expect(deriveStatus({ ...base, camera: 'off' })).toBe('camera-off')
    expect(deriveStatus({ ...base, camera: 'starting' })).toBe('camera-starting')
    expect(deriveStatus({ ...base, camera: 'denied' })).toBe('camera-denied')
    expect(deriveStatus({ ...base, camera: 'unavailable' })).toBe('camera-unavailable')
    expect(deriveStatus({ ...base, camera: 'error' })).toBe('camera-error')
  })

  it('reports tracker loading and failure before hand states', () => {
    expect(deriveStatus({ ...base, tracker: 'loading' })).toBe('model-loading')
    expect(deriveStatus({ ...base, tracker: 'error' })).toBe('model-error')
  })

  it('walks no-hand -> hand -> sign -> sequence -> jutsu', () => {
    expect(deriveStatus(base)).toBe('no-hand')
    expect(deriveStatus({ ...base, hands: 1 })).toBe('hand-detected')
    expect(deriveStatus({ ...base, hands: 1, sign: 'ram' })).toBe('sign-recognized')
    expect(deriveStatus({ ...base, hands: 1, registeredSigns: 2 })).toBe('sequence-in-progress')
    expect(deriveStatus({ ...base, hands: 1, phase: 'charging' })).toBe('jutsu-active')
  })

  it('never reports demo mode as real tracking', () => {
    expect(deriveStatus({ ...base, mode: 'demo', camera: 'off' })).toBe('demo-simulated')
    expect(deriveStatus({ ...base, mode: 'demo', hands: 1, sign: 'ram' })).toBe('demo-simulated')
  })
})
