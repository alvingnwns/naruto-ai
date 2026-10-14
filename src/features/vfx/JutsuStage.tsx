import { lazy, Suspense, useMemo, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { JUTSU_BY_ID, type JutsuId } from '../../config/jutsu'
import { displayToWorld } from '../../lib/coords'
import { AssetModel } from './AssetModel'
import { easeOutCubic, type FxCtx, type FxState } from './shared'

// Effects are code-split so the landing UI paints before the VFX bundle is parsed.
const Rasengan = lazy(() => import('./effects/Rasengan').then((m) => ({ default: m.Rasengan })))
const Chidori = lazy(() => import('./effects/Chidori').then((m) => ({ default: m.Chidori })))
const Rasenshuriken = lazy(() => import('./effects/Rasenshuriken').then((m) => ({ default: m.Rasenshuriken })))
const Katon = lazy(() => import('./effects/Katon').then((m) => ({ default: m.Katon })))

const EFFECTS = { rasengan: Rasengan, chidori: Chidori, rasenshuriken: Rasenshuriken, katon: Katon }

function Scene({ fx, jutsu, quality }: { fx: FxState; jutsu: JutsuId | null; quality: number }) {
  const { viewport } = useThree()
  const kunai = useRef<THREE.Group>(null)
  const ctx = useMemo<FxCtx>(
    () => ({
      anchor: new THREE.Vector3(),
      launch: new THREE.Vector3(),
      pos: new THREE.Vector3(),
      dir: new THREE.Vector3(0, 1, 0),
    }),
    [],
  )
  const prevPhase = useRef(fx.phase)
  const target = useMemo(() => new THREE.Vector3(), [])

  // Priority -1: derive world-space state before the effects' own useFrame callbacks read it.
  useFrame((_, dt) => {
    const w = displayToWorld(fx.anchor.x, fx.anchor.y, viewport.width, viewport.height)
    target.set(w.x, w.y, 0)
    // Frame-rate independent smoothing hides landmark jitter without adding noticeable lag.
    ctx.anchor.lerp(target, 1 - Math.exp(-dt * 18))

    if (fx.phase === 'released' && prevPhase.current !== 'released') {
      ctx.launch.copy(ctx.anchor)
      ctx.dir.set(fx.aim.x, fx.aim.y, 0).normalize()
    }
    prevPhase.current = fx.phase

    if (fx.phase === 'released' && fx.jutsu) {
      const t = fx.phaseTime / (JUTSU_BY_ID[fx.jutsu].releaseMs / 1000)
      const travel = viewport.height * 0.55 * easeOutCubic(t)
      ctx.pos.copy(ctx.launch).addScaledVector(ctx.dir, travel)
    } else if (fx.phase === 'impact') {
      ctx.pos.copy(ctx.launch).addScaledVector(ctx.dir, viewport.height * 0.55)
    } else {
      ctx.pos.copy(ctx.anchor)
    }
  }, -1)

  useFrame((_, dt) => {
    if (!kunai.current) return
    kunai.current.rotation.z += dt * 0.6
    kunai.current.position.set(-viewport.width * 0.42, -viewport.height * 0.36, 0)
  })

  const Effect = jutsu ? EFFECTS[jutsu] : null
  return (
    <>
      <ambientLight intensity={0.9} />
      <directionalLight position={[3, 4, 6]} intensity={2} />
      <group ref={kunai} scale={1.3}>
        <AssetModel id="kunai" />
      </group>
      {Effect && (
        <Suspense fallback={null}>
          <Effect fx={fx} ctx={ctx} quality={quality} />
        </Suspense>
      )}
    </>
  )
}

interface Props {
  fx: FxState
  /** Which effect to mount. Changes rarely (React state), unlike `fx` which is mutated per frame. */
  jutsu: JutsuId | null
  quality: number
}

/** Transparent WebGL canvas layered over the (mirrored) camera feed. */
export default function JutsuStage({ fx, jutsu, quality }: Props) {
  return (
    <Canvas
      className="absolute inset-0"
      camera={{ position: [0, 0, 10], fov: 50 }}
      dpr={[1, 2]}
      gl={{ alpha: true, antialias: true, powerPreference: 'high-performance' }}
      style={{ pointerEvents: 'none' }}
    >
      <Scene fx={fx} jutsu={jutsu} quality={quality} />
    </Canvas>
  )
}
