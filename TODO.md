# Checkpoints

- [x] 0 Recon: empty repo, Node 24
- [x] 1 Foundation: Vite + React + TS + Tailwind, R3F stage, build passes
- [x] 2 Camera: permissions, start/stop, cleanup, error mapping (tested)
- [x] 3 MediaPipe: self-hosted model/WASM, landmark overlay, FPS readout (verified with fake camera)
- [x] 4 Gestures: features, classifier, sequence engine, practice HUD (unit-tested)
- [x] 5 Rasengan: charge, hold at palm, release, impact, reset (verified in demo mode)
- [x] 6 Chidori, Rasenshuriken, Katon on shared VFX utilities (verified in demo mode)
- [x] 7 Asset pipeline: manifest, GLB probe/validate, procedural fallback (kunai)
- [x] 8 UX/audio/perf: modes, settings, synthesised SFX (opt-in), reduced-effects toggle
- [x] 9 Verification + docs: typecheck, tests, build, README

## Open
- [ ] Tune thresholds/flick speed against real hands (needs a person at a webcam)
- [ ] Test on a real GPU / weaker laptop and measure fps there
- [ ] Optional: generate a real kunai GLB with Meshy and drop it at `public/models/kunai.glb`
