import { describe, expect, it } from 'vitest'
import { ASSET_MANIFEST, probeAsset, validateManifest, type AssetEntry } from './assets'
import { mapCameraError } from '../features/camera/useCamera'

const entry: AssetEntry = { id: 'kunai', path: 'models/kunai.glb', description: '', maxBytes: 100 }

const respond = (body: Uint8Array | string, init: { status?: number; type?: string } = {}) =>
  (async () =>
    new Response(body as BodyInit, {
      status: init.status ?? 200,
      headers: { 'content-type': init.type ?? 'model/gltf-binary' },
    })) as unknown as typeof fetch

describe('asset manifest', () => {
  it('ships a valid manifest', () => {
    expect(validateManifest(ASSET_MANIFEST)).toEqual([])
  })

  it('reports duplicates, bad ids, bad extensions and unsafe paths', () => {
    const errors = validateManifest([
      entry,
      { ...entry },
      { id: 'Bad Id', path: '/abs/x.png', description: '', maxBytes: 0 },
      { id: 'up', path: '../secret.glb', description: '', maxBytes: 1 },
    ])
    expect(errors.join('\n')).toMatch(/duplicate id/)
    expect(errors.join('\n')).toMatch(/duplicate path/)
    expect(errors.join('\n')).toMatch(/kebab-case/)
    expect(errors.join('\n')).toMatch(/\.glb or \.gltf/)
    expect(errors.join('\n')).toMatch(/relative/)
    expect(errors.join('\n')).toMatch(/maxBytes/)
  })
})

describe('probeAsset', () => {
  it('accepts a GLB with the glTF magic header', async () => {
    const bytes = new Uint8Array([0x67, 0x6c, 0x54, 0x46, 2, 0, 0, 0])
    expect((await probeAsset(entry, '/', respond(bytes))).ok).toBe(true)
  })

  it('rejects an HTML fallback served with HTTP 200', async () => {
    const r = await probeAsset(entry, '/', respond('<!doctype html>', { type: 'text/html' }))
    expect(r).toEqual({ ok: false, reason: 'file not found' })
  })

  it('rejects HTTP errors, wrong magic bytes, oversize files and network failures', async () => {
    expect(await probeAsset(entry, '/', respond('', { status: 404 }))).toEqual({ ok: false, reason: 'HTTP 404' })
    expect((await probeAsset(entry, '/', respond('PNG!....'))).ok).toBe(false)
    const big = new Uint8Array(200)
    big.set([0x67, 0x6c, 0x54, 0x46])
    expect(await probeAsset(entry, '/', respond(big))).toMatchObject({ ok: false })
    const failing = (async () => {
      throw new Error('offline')
    }) as unknown as typeof fetch
    expect(await probeAsset(entry, '/', failing)).toEqual({ ok: false, reason: 'offline' })
  })
})

describe('mapCameraError', () => {
  it('maps browser errors to UI statuses', () => {
    expect(mapCameraError(new DOMException('x', 'NotAllowedError')).status).toBe('denied')
    expect(mapCameraError(new DOMException('x', 'NotFoundError')).status).toBe('unavailable')
    expect(mapCameraError(new DOMException('x', 'NotReadableError')).status).toBe('error')
    expect(mapCameraError('weird').status).toBe('error')
  })
})
