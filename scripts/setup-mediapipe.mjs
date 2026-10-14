// Self-hosts MediaPipe runtime files so the app makes no third-party requests at runtime:
//   - copies the WASM runtime from node_modules into public/mediapipe/wasm
//   - downloads the hand landmarker model into public/models (skipped if present)
import { cp, mkdir, access, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const wasmSrc = path.join(root, 'node_modules/@mediapipe/tasks-vision/wasm')
const wasmDst = path.join(root, 'public/mediapipe/wasm')
const modelDst = path.join(root, 'public/models/hand_landmarker.task')
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task'

const exists = (p) => access(p).then(() => true, () => false)

await mkdir(wasmDst, { recursive: true })
await cp(wasmSrc, wasmDst, { recursive: true })

if (!(await exists(modelDst))) {
  await mkdir(path.dirname(modelDst), { recursive: true })
  console.log('Downloading hand_landmarker.task ...')
  const res = await fetch(MODEL_URL)
  if (!res.ok) throw new Error(`Model download failed: ${res.status}`)
  await writeFile(modelDst, Buffer.from(await res.arrayBuffer()))
}
console.log('MediaPipe assets ready.')
