import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import {
  EnergyOrb,
  Halo,
  ImpactFx,
  MeshParticleField,
  makeStreakGeometry,
  presence,
  useGeometry,
  useGlowMaterial,
  type EffectProps,
  type ParticleSpec,
} from '../shared'

/** Four-bladed pinwheel outline in the XY plane, unit radius. */
function makeBladeShape(): THREE.Shape {
  const pt = (r: number, a: number) => [Math.cos(a) * r, Math.sin(a) * r] as const
  const s = new THREE.Shape()
  s.moveTo(...pt(0.18, 0))
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2
    s.quadraticCurveTo(...pt(0.8, a + 0.05), ...pt(1, a + 0.95)) // convex leading edge to the tip
    s.quadraticCurveTo(...pt(0.5, a + 0.9), ...pt(0.18, a + Math.PI / 2)) // concave trailing edge back to the hub
  }
  return s
}

/** Thick, bevelled blades: a real solid, so it has visible depth when the hand tilts. */
function makeBladeGeometry(): THREE.BufferGeometry {
  const g = new THREE.ExtrudeGeometry(makeBladeShape(), {
    depth: 0.14,
    bevelEnabled: true,
    bevelThickness: 0.06,
    bevelSize: 0.035,
    bevelSegments: 3,
    curveSegments: 14,
  })
  g.translate(0, 0, -0.07) // centre the thickness on the blade plane
  return g
}

/** Base radius in world units at normal hand scale (was 1.35; now 3x). Raise toward 4.7 (3.5x) if you want it to overflow the stage. */
const SIZE = 4.0

/** Wind bands: partial 3D tori that spin at different speeds and tilts, like air wrapping the blades. */
const WIND_BANDS = [
  { r: 1.3, tube: 0.026, arc: 2.0, speed: 5.5, tilt: 0 },
  { r: 1.6, tube: 0.0195, arc: 1.5, speed: -7.5, tilt: 0 },
  { r: 1.95, tube: 0.026, arc: 2.4, speed: 4.2, tilt: 0 },
  { r: 2.3, tube: 0.0195, arc: 1.3, speed: -9, tilt: 0 },
  { r: 1.5, tube: 0.0195, arc: 2.1, speed: 6.5, tilt: 1.15 },
  { r: 1.85, tube: 0.0195, arc: 1.7, speed: -5, tilt: -1.0 },
]

/**
 * 3D Rasenshuriken: bevelled solid blades in fresnel glow, a swirling core, wind bands and
 * spiral gust streaks. The blade disc lies in the palm plane, so tilting the hand tilts the
 * shuriken (it goes edge-on when your hand does).
 */
export function Rasenshuriken({ fx, ctx, quality }: EffectProps) {
  const group = useRef<THREE.Group>(null)
  const blades = useRef<THREE.Group>(null)
  const bladesA = useRef<THREE.Mesh>(null)
  const bladesB = useRef<THREE.Mesh>(null)
  const bladesC = useRef<THREE.Mesh>(null)
  const wind = useRef<(THREE.Mesh | null)[]>([])
  const halo = useRef<THREE.Group>(null)
  const size = useRef(SIZE)

  const bladeGeo = useGeometry(makeBladeGeometry)
  const streak = useGeometry(makeStreakGeometry)
  const matBody = useGlowMaterial('#67e8f9', { power: 1.6, intensity: 1.5, base: 0.5 })
  const matCore = useGlowMaterial('#ecfeff', { power: 1.4, intensity: 1.0, base: 0.6 })
  const matHalo = useGlowMaterial('#0891b2', { power: 2.0, intensity: 1.2, base: 0.25 })
  const matWind = useGlowMaterial('#a5f3fc', { power: 1.2, intensity: 1.0, base: 0.55 })

  // Gusts: 3D streaks spawned near the blades and flung out on a spiral, tracing curved wind.
  const gust = useMemo<ParticleSpec>(
    () => ({
      count: Math.round(160 * quality),
      size: 0.22,
      from: '#ffffff',
      mid: '#67e8f9',
      to: '#0e7490',
      life: [0.5, 1.1],
      drag: 0.35,
      spawn: (o, origin) => {
        const th = Math.random() * Math.PI * 2
        const r = size.current * (0.5 + Math.random() * 0.6)
        o.x = origin.x + Math.cos(th) * r
        o.y = origin.y + Math.sin(th) * r
        o.z = origin.z + (Math.random() - 0.5) * 1.2
        const sp = 1.5 + Math.random() * 2
        o.vx = Math.cos(th) * sp
        o.vy = Math.sin(th) * sp
        o.vz = (Math.random() - 0.5) * 1.5
      },
      force: (p, origin, dt) => {
        const rx = p.x - origin.x
        const ry = p.y - origin.y
        // Strong tangential push + mild outward push = a widening spiral (wind).
        p.vx += (-ry * 7 + rx * 1.4) * dt
        p.vy += (rx * 7 + ry * 1.4) * dt
      },
    }),
    [quality],
  )

  useFrame((state, dt) => {
    const k = presence(fx)
    const g = group.current
    if (!g) return
    size.current = SIZE * fx.handScale * (fx.phase === 'released' ? 1.1 : 1)
    g.visible = k > 0.01
    g.position.copy(ctx.pos)
    g.quaternion.copy(ctx.quat)
    g.scale.setScalar(Math.max(1e-4, size.current * k))

    const t = state.clock.elapsedTime
    // Spin accelerates with charge, then runs flat out on release.
    const spin = (fx.phase === 'released' ? 30 : 9 + fx.charge * 16) * dt
    if (bladesA.current) bladesA.current.rotation.z += spin
    if (bladesB.current) bladesB.current.rotation.z -= spin * 0.7
    if (bladesC.current) bladesC.current.rotation.z += spin * 0.4
    // A little precession so the solid's thickness is always visible.
    if (blades.current) blades.current.rotation.set(Math.sin(t * 3) * 0.18, Math.cos(t * 2.3) * 0.18, 0)

    const windBoost = fx.phase === 'released' ? 1.8 : 1
    WIND_BANDS.forEach((b, i) => {
      const m = wind.current[i]
      if (m) m.rotation.set(b.tilt, b.tilt * 0.6, t * b.speed * windBoost)
    })
    if (halo.current) halo.current.scale.setScalar(1 + Math.sin(t * 12) * 0.08)
  })

  return (
    <>
      <group ref={group} visible={false}>
        <group ref={blades}>
          <mesh ref={bladesC} geometry={bladeGeo} material={matHalo} scale={1.3} />
          <mesh ref={bladesA} geometry={bladeGeo} material={matBody} />
          <mesh ref={bladesB} geometry={bladeGeo} material={matCore} scale={0.7} />
        </group>
        <group scale={0.42}>
          <EnergyOrb inner="#ffffff" outer="#22d3ee" speed={16} />
        </group>
        {WIND_BANDS.map((b, i) => (
          <mesh key={i} ref={(m) => void (wind.current[i] = m)} material={matWind}>
            <torusGeometry args={[b.r, b.tube, 8, 40, b.arc]} />
          </mesh>
        ))}
        <group ref={halo}>
          <Halo color="#22d3ee" size={2.2} />
          <Halo color="#0891b2" size={3.5} />
        </group>
      </group>
      <MeshParticleField
        spec={gust}
        geometry={streak}
        origin={ctx.pos}
        additive
        orient
        stretch={0.22}
        emit={() => presence(fx)}
      />
      <ImpactFx fx={fx} ctx={ctx} quality={quality} color="#67e8f9" color2="#ffffff" radius={14} duration={0.95} />
    </>
  )
}
