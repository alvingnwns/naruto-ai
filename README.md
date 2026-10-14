# Hand Sign Jutsu

Perform hand signs to your webcam and trigger real-time 3D jutsu effects (Rasengan, Chidori,
Rasenshuriken, Katon) in the browser. Hand tracking is real (MediaPipe) and runs entirely
client-side: webcam frames never leave your device.

## Run it

Requires Node 20+.

```bash
npm install
npm run dev        # http://localhost:5173
```

`predev` / `prebuild` run `scripts/setup-mediapipe.mjs`, which copies the MediaPipe WASM runtime
from `node_modules` and downloads the ~8 MB `hand_landmarker.task` model into `public/`
(both git-ignored). That download is the only network access the setup needs; at runtime the
app makes no third-party requests. Camera access needs `localhost` or HTTPS.

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server |
| `npm run build` | Typecheck + production build to `dist/` |
| `npm run preview` | Serve the production build |
| `npm run typecheck` | `tsc -b` |
| `npm test` | Vitest unit tests |

## How to use it

1. Pick a **mode**: *Practice* (only the selected jutsu triggers), *Free-play* (any sequence
   triggers), or *Demo* (no webcam; input is simulated and labelled as such).
2. Click **Enable camera**. Hold each sign for ~0.35 s; the HUD shows the recognised sign,
   confidence, and sequence progress.
3. Complete the sequence → the jutsu charges at your palm. **Release** with Space, the Release
   button, or a quick flick of your hand (the flick direction aims it). **R** resets.

### Signs and sequences

The signs are *simplified finger-extension poses* that borrow Naruto sign names. They are not
the canonical interlocking seals, and the sequences are demo combinations, not lore.

| Sign | Pose |
| --- | --- |
| Ox | Closed fist |
| Tiger | Index finger up |
| Ram | Index + middle up |
| Dog | Index, middle, ring up |
| Boar | Open palm |
| Clasp | Both hands brought together |

| Jutsu | Sequence |
| --- | --- |
| Rasengan | Tiger → Ram → Boar |
| Chidori | Ox → Tiger → Dog |
| Rasenshuriken | Ram → Dog → Clasp |
| Katon | Ram → Ox → Boar |

Both tables live in `src/config/signs.ts` and `src/config/jutsu.ts`; edit them to change
poses, thresholds, hold time, or combinations.

## Architecture

```
src/
  config/          signs + thresholds, jutsu + sequences, asset manifest
  features/
    camera/              getUserMedia lifecycle + error mapping
    hand-tracking/       MediaPipe HandLandmarker wrapper
    gesture-recognition/ features -> static classifier -> sequence state machine (pure TS)
    jutsu-system/        jutsu lifecycle (charge/ready/release/impact) + tracking status
    vfx/                 R3F stage, shared particles/orb/impact, one file per jutsu
  app/             App + useExperience (the per-frame loop)
  components/      Stage/HUD, control panel, sign glyphs
  lib/             coordinate mapping, synthesised audio
```

Recognition pipeline:

1. **Features** (`features.ts`): per-finger `|wrist→tip| / |wrist→mcp|` ratio, aspect-corrected
   and scale-invariant, plus palm centre and hand size.
2. **Static classification** (`classify.ts`): finger-extension patterns, with confidence from
   how far each finger is from the threshold. Clasp = two palms within 1.4 hand-sizes.
3. **Sequence engine** (`sequence.ts`): hold time, flicker grace, cooldown, no repeat while a
   pose is held, timeout, reset, suffix-matching against each jutsu's sequence.

Performance: the frame loop works in refs; React gets a snapshot only when something visible
changes (quantised confidence/hold progress). Particles are CPU-updated into one draw call per
field. The HUD shows measured render and tracking FPS.

### Coordinates

MediaPipe gives 2D image coordinates (no metric depth). `src/lib/coords.ts` documents the
mapping: image → mirrored display space → Three.js plane at z = 0. Depth is *approximated* by
scaling effects with apparent hand size. If the hand leaves the frame, effects fade to a floor
and hold their last position; after 3 s the jutsu is cancelled.

## 3D assets (Meshy)

Core chakra effects are procedural (shaders + particles); no model is required. One optional
asset slot exists: a decorative kunai, listed in `src/config/assets.ts`.

1. Generate/export a **GLB** (Meshy's free tier exports GLB; keep it low-poly, < 2 MB).
2. Save it as `public/models/kunai.glb` (the path in the manifest).
3. Reload. The loader checks the file is a real GLB and within `maxBytes`; if not, it logs the
   reason and keeps the procedural kunai.

To add another asset, add an entry to `ASSET_MANIFEST` and render `<AssetModel id="..." />`.
No Meshy account, key, or API is used or needed by the app.

## Deploy

It is a static site: `npm run build`, then publish `dist/`. On Vercel, import the repo with the
Vite preset (build `npm run build`, output `dist`). The build step downloads the model, so the
build environment needs outbound HTTPS to `storage.googleapis.com`. No environment variables are
required. Serve over HTTPS so the browser permits camera access.

## Testing and known limitations

- Unit tests cover feature extraction, classification, sequence timing/timeout/reset, jutsu
  trigger mapping, lifecycle, status derivation, asset manifest/probing and camera error mapping.
- The production build and the app were also exercised in headless Chrome with a *fake* camera
  device and software WebGL: the page loads, MediaPipe initialises and runs, demo-mode casts
  render all four effects.
- **Not verified with a real hand**: recognition thresholds are reasoned from hand geometry, not
  tuned on real footage. Expect to adjust `fingerExtendedRatio` / hold time. Hand flick-to-release
  speed (`FLICK_SPEED` in `useExperience.ts`) is likewise untuned.
- A single 2D camera can't resolve every hand seal; poses with heavy occlusion (e.g. the clasp
  when one hand hides the other) may drop a hand.
- No temporal/ML model is trained or shipped. A sequence model (e.g. LSTM over landmark
  windows) would be a possible future extension.
- Sound is synthesised with WebAudio, opt-in, and off by default.
- Glow is additive sprites rather than post-process bloom (bloom is unreliable on transparent
  canvases and costs fill-rate).
- No ESLint is configured; `npm run typecheck` is the static check.
