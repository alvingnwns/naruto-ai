/**
 * Optional 3D asset manifest. Every entry is optional: if the file is absent or invalid the app
 * falls back to a procedural stand-in. To use a Meshy-generated model, export it as GLB, drop it
 * at the listed path under public/, and (optionally) tune maxBytes. See README "3D assets".
 */
export interface AssetEntry {
  id: string
  /** Relative to the site root, e.g. "models/kunai.glb". */
  path: string
  description: string
  /** Files larger than this are rejected (keeps load times sane). */
  maxBytes: number
}

export const ASSET_MANIFEST: AssetEntry[] = [
  {
    id: 'kunai',
    path: 'models/kunai.glb',
    description: 'Decorative kunai floating in the stage corner. Low-poly, ~1 unit long, facing +Y.',
    maxBytes: 2 * 1024 * 1024,
  },
]

export const ASSET_BY_ID = Object.fromEntries(ASSET_MANIFEST.map((a) => [a.id, a]))

/** Returns a list of human-readable problems; empty means the manifest is valid. */
export function validateManifest(manifest: AssetEntry[]): string[] {
  const errors: string[] = []
  const ids = new Set<string>()
  const paths = new Set<string>()
  for (const a of manifest) {
    if (!/^[a-z][a-z0-9-]*$/.test(a.id)) errors.push(`"${a.id}": id must be kebab-case`)
    if (ids.has(a.id)) errors.push(`"${a.id}": duplicate id`)
    ids.add(a.id)
    if (!/\.(glb|gltf)$/i.test(a.path)) errors.push(`"${a.id}": path must end in .glb or .gltf`)
    if (a.path.startsWith('/') || a.path.includes('..')) errors.push(`"${a.id}": path must be relative and stay inside public/`)
    if (paths.has(a.path)) errors.push(`"${a.id}": duplicate path ${a.path}`)
    paths.add(a.path)
    if (!(a.maxBytes > 0)) errors.push(`"${a.id}": maxBytes must be positive`)
  }
  return errors
}

export type ProbeResult = { ok: true; data: ArrayBuffer } | { ok: false; reason: string }

/**
 * Fetches an asset and verifies it really is a glTF/GLB. Needed because the dev server (and many
 * static hosts) answer a missing file with index.html and HTTP 200.
 */
export async function probeAsset(
  entry: AssetEntry,
  baseUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ProbeResult> {
  try {
    const res = await fetchImpl(`${baseUrl}${entry.path}`)
    if (!res.ok) return { ok: false, reason: `HTTP ${res.status}` }
    if ((res.headers.get('content-type') ?? '').includes('text/html')) return { ok: false, reason: 'file not found' }
    const data = await res.arrayBuffer()
    if (data.byteLength > entry.maxBytes) return { ok: false, reason: `too large (${data.byteLength} > ${entry.maxBytes} bytes)` }
    const head = new TextDecoder().decode(new Uint8Array(data, 0, Math.min(4, data.byteLength)))
    const valid = entry.path.toLowerCase().endsWith('.glb') ? head === 'glTF' : head.startsWith('{')
    return valid ? { ok: true, data } : { ok: false, reason: 'not a valid glTF/GLB file' }
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : 'network error' }
  }
}
