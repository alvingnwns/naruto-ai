import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import {
  Halo,
  MeshParticleField,
  easeOutCubic,
  makeFlameGeometry,
  useGeometry,
  useGlowMaterial,
  type EffectProps,
  type ParticleSpec,
} from '../shared'

/**
 * Anime-style 3D fire. Every flame is a real teardrop mesh, flat-coloured (no lighting) with a
 * dark inverted-hull outline: the classic cel-shaded look. Three stacked layers (red body, orange
 * middle, yellow-white core) billow outward and shrink away. Colours are fully saturated on purpose.
 *
 * Charging: a small plume licks along the live finger direction (follows hand rotation).
 * Release: a fire NOVA. Flames erupt in every direction around the palm (full sphere, with only a
 * mild lean along the fingers), with an expanding glow shell and shockwave rings, so the fire
 * spreads all around instead of firing as a single line.
 */

/** Billow: grows fast, holds, then shrinks away. Gives the lumpy "cartoon fire" silhouette. */
const billow = (t: number) => (0.35 + 1.15 * Math.sin(Math.min(1, t * 1.6) * Math.PI * 0.5)) * (1 - t * t * 0.9)

export function Katon({ fx, ctx, quality }: EffectProps) {
  const halo = useRef<THREE.Group>(null)
  const haloScale = useRef(0)
  const flame = useGeometry(makeFlameGeometry)
  const jetSrc = useMemo(() => new THREE.Vector3(), [])
  const nova = useRef<THREE.Group>(null)
  const novaShell = useRef<THREE.Mesh>(null)
  const novaRingA = useRef<THREE.Mesh>(null)
  const novaRingB = useRef<THREE.Mesh>(null)
  const shellMat = useGlowMaterial('#ff6a00', { power: 1.3, intensity: 1.3, base: 0.2 })
  const ringMat = useGlowMaterial('#ffd23a', { power: 1.0, intensity: 0.6, base: 0.85 })

  /** Shared spawn: `speedMul` and `jitter` make inner layers hug the centre and outer ones fly further. */
  const makeSpawn = (speedMul: number, jitter: number): ParticleSpec['spawn'] => {
    const d = new THREE.Vector3()
    return (o) => {
      const burst = fx.phase === 'released'
      if (burst) {
        // Nova: any direction on the sphere, leaning gently towards the fingertips.
        d.randomDirection().addScaledVector(ctx.up, 0.35).normalize()
      } else {
        // Charging plume: a loose cone around the live finger direction.
        d.randomDirection().multiplyScalar(0.5).add(ctx.up).normalize()
      }
      const speed = (burst ? 4.5 + Math.random() * 7.5 : 1.1 + Math.random() * 1.6) * speedMul
      const r = (burst ? 0.35 : 0.3 * fx.handScale) * jitter
      o.x = jetSrc.x + (Math.random() - 0.5) * r
      o.y = jetSrc.y + (Math.random() - 0.5) * r
      o.z = jetSrc.z + (Math.random() - 0.5) * r
      o.vx = d.x * speed
      o.vy = d.y * speed
      o.vz = d.z * speed
    }
  }

  // Lumpy wobble across the flow so the plume writhes rather than flies straight.
  const writhe: ParticleSpec['force'] = (p, _o, dt) => {
    p.vx += Math.sin(p.x * 2.3 + p.y * 3.1) * 2.5 * dt
    p.vy += Math.cos(p.x * 3.3 - p.y * 2.1) * 4 * dt
  }

  const body = useMemo<ParticleSpec>(
    () => ({
      count: Math.round(480 * quality),
      size: 0.62,
      from: '#ff7a00',
      mid: '#ff3300',
      to: '#c00000',
      life: [0.5, 1.0],
      drag: 0.7,
      gravity: [0, 1.2, 0],
      sizeOverLife: billow,
      spawn: makeSpawn(1, 1.2),
      force: writhe,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [quality, fx, ctx],
  )
  const middle = useMemo<ParticleSpec>(
    () => ({
      count: Math.round(340 * quality),
      size: 0.48,
      from: '#ffc400',
      mid: '#ff8a00',
      to: '#ff3a00',
      life: [0.4, 0.85],
      drag: 0.7,
      gravity: [0, 1.4, 0],
      sizeOverLife: billow,
      spawn: makeSpawn(0.85, 0.9),
      force: writhe,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [quality, fx, ctx],
  )
  const core = useMemo<ParticleSpec>(
    () => ({
      count: Math.round(220 * quality),
      size: 0.34,
      from: '#fffbc0',
      mid: '#ffee00',
      to: '#ffa800',
      life: [0.3, 0.7],
      drag: 0.8,
      gravity: [0, 1.6, 0],
      sizeOverLife: billow,
      spawn: makeSpawn(0.65, 0.5),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [quality, fx, ctx],
  )

  const emit = () => {
    switch (fx.phase) {
      case 'charging':
        return easeOutCubic(fx.charge) * 0.35 * fx.visibility
      case 'ready':
        return 0.4 * fx.visibility
      case 'released':
        return 1
      case 'impact':
        return Math.max(0, 0.35 * (1 - fx.phaseTime / 0.5)) // dissipating embers
      default:
        return 0
    }
  }

  useFrame((state, dt) => {
    // The jet is rooted just in front of the palm and follows the hand live.
    jetSrc.copy(ctx.anchor).addScaledVector(ctx.up, 0.5 * fx.handScale)

    haloScale.current += (emit() - haloScale.current) * Math.min(1, dt * 10)
    const g = halo.current
    if (!g) return
    const lead = fx.phase === 'released' ? 1.5 : 0
    g.position.copy(jetSrc).addScaledVector(ctx.up, lead)
    const flicker = 0.85 + Math.sin(state.clock.elapsedTime * 40) * 0.1 + Math.random() * 0.1
    g.scale.setScalar(Math.max(1e-4, haloScale.current * 4.2 * flicker * fx.handScale))
    g.visible = haloScale.current > 0.02

    // Expanding shell and shockwave rings at the start of the release.
    const n = nova.current
    if (n) {
      const dur = 0.9
      const on = fx.phase === 'released' && fx.phaseTime < dur
      n.visible = on
      if (on) {
        const t = fx.phaseTime / dur
        n.position.copy(jetSrc)
        novaShell.current?.scale.setScalar((0.4 + easeOutCubic(t) * 4.2) * fx.handScale)
        shellMat.uniforms.uFade.value = Math.pow(1 - t, 1.3) * 0.85
        const rs = (0.4 + easeOutCubic(t) * 5.5) * fx.handScale
        novaRingA.current?.scale.setScalar(rs)
        novaRingB.current?.scale.setScalar(rs * 0.8)
        ringMat.uniforms.uFade.value = 1 - t
      }
    }
  })

  return (
    <>
      <group ref={halo} visible={false}>
        <Halo color="#ff4d00" size={1} />
      </group>
      <group ref={nova} visible={false}>
        <mesh ref={novaShell} material={shellMat}>
          <sphereGeometry args={[1, 28, 18]} />
        </mesh>
        <mesh ref={novaRingA} material={ringMat} rotation={[1.2, 0.2, 0]}>
          <torusGeometry args={[1, 0.018, 8, 64]} />
        </mesh>
        <mesh ref={novaRingB} material={ringMat} rotation={[0.3, 1.25, 0.4]}>
          <torusGeometry args={[1, 0.014, 8, 64]} />
        </mesh>
      </group>
      <MeshParticleField spec={body} geometry={flame} origin={jetSrc} emit={emit} orient stretch={0.1} outline="#4a0500" />
      <MeshParticleField spec={middle} geometry={flame} origin={jetSrc} emit={emit} orient stretch={0.1} outline="#7a1800" />
      <MeshParticleField spec={core} geometry={flame} origin={jetSrc} emit={emit} orient stretch={0.1} outline="#a84300" />
    </>
  )
}
