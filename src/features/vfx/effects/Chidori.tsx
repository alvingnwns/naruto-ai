import { useEffect, useMemo, useRef } from 'react'
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

const ARCS = 12
const SEGMENTS = 8
const BRANCHES = 2 // forks per bolt
const BRANCH_SEGMENTS = 4
const SEGS_PER_ARC = SEGMENTS + BRANCHES * BRANCH_SEGMENTS
const TOTAL = ARCS * SEGS_PER_ARC
const REFRESH = 0.03 // seconds between bolt re-rolls: fast enough to read as crackling

const _m = new THREE.Matrix4()
const _q = new THREE.Quaternion()
const _mid = new THREE.Vector3()
const _d = new THREE.Vector3()
const _s = new THREE.Vector3()
const _Y = new THREE.Vector3(0, 1, 0)
const _dir = new THREE.Vector3()
const _u = new THREE.Vector3()
const _w = new THREE.Vector3()
const _bias = new THREE.Vector3(0, 0.9, 0.2)

type P3 = THREE.Vector3

/**
 * Forked lightning built from real 3D tubes (instanced thin cylinders, two layers: a hot white
 * core and a wider blue glow). Bolts radiate in all three dimensions, biased towards the
 * fingertips, and are re-rolled ~33x/sec. Lives in the hand's local frame.
 */
function LightningBolts({ fx }: { fx: EffectProps['fx'] }) {
  const root = useRef<THREE.Group>(null)
  const timer = useRef(0)
  const tube = useGeometry(() => new THREE.CylinderGeometry(1, 1, 1, 6, 1, true))

  const built = useMemo(() => {
    const coreMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })
    const glowMat = new THREE.MeshBasicMaterial({ color: '#4f8dff', transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false })
    const core = new THREE.InstancedMesh(tube, coreMat, TOTAL)
    const glow = new THREE.InstancedMesh(tube, glowMat, TOTAL)
    for (const m of [core, glow]) {
      m.frustumCulled = false
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    }
    return { core, glow, coreMat, glowMat }
  }, [tube])

  useEffect(
    () => () => {
      built.core.dispose()
      built.glow.dispose()
      built.coreMat.dispose()
      built.glowMat.dispose()
    },
    [built],
  )

  useFrame((_, dt) => {
    const k = presence(fx)
    const g = root.current
    if (!g) return
    g.visible = k > 0.01
    timer.current += dt
    if (timer.current < REFRESH || !g.visible) return
    timer.current = 0

    const { core, glow } = built
    const reach = (fx.phase === 'released' ? 3.4 : 2.4) * fx.handScale
    let n = 0
    // Writes one cylinder spanning a->b into both layers.
    const seg = (a: P3, b: P3, r: number) => {
      _d.subVectors(b, a)
      const len = _d.length()
      if (len < 1e-5) return
      _mid.addVectors(a, b).multiplyScalar(0.5)
      _q.setFromUnitVectors(_Y, _d.multiplyScalar(1 / len))
      core.setMatrixAt(n, _m.compose(_mid, _q, _s.set(r, len, r)))
      glow.setMatrixAt(n, _m.compose(_mid, _q, _s.set(r * 3.2, len, r * 3.2)))
      n++
    }

    for (let a = 0; a < ARCS; a++) {
      // Random 3D direction biased towards the fingertips (+Y of the hand frame).
      _dir.randomDirection().add(_bias).normalize()
      const len = reach * (Math.random() < 0.18 ? 1.5 + Math.random() * 0.6 : 0.4 + Math.random() * 0.7)
      // Two axes perpendicular to the bolt for 3D jitter.
      _u.crossVectors(_dir, _w.randomDirection()).normalize()
      _w.crossVectors(_dir, _u)

      const pts: P3[] = []
      for (let s = 0; s <= SEGMENTS; s++) {
        const t = s / SEGMENTS
        const amp = 0.5 * Math.sin(Math.PI * t) * len
        pts.push(
          new THREE.Vector3()
            .copy(_dir)
            .multiplyScalar(len * t)
            .addScaledVector(_u, (Math.random() - 0.5) * amp)
            .addScaledVector(_w, (Math.random() - 0.5) * amp),
        )
      }
      for (let s = 0; s < SEGMENTS; s++) seg(pts[s], pts[s + 1], 0.024)

      // Forks leave the main bolt at a random point and wander off at an angle.
      for (let b = 0; b < BRANCHES; b++) {
        const from = pts[2 + Math.floor(Math.random() * (SEGMENTS - 3))]
        const bd = new THREE.Vector3().randomDirection().add(_dir).normalize()
        const bl = len * (0.25 + Math.random() * 0.25)
        let prev = from
        for (let s = 1; s <= BRANCH_SEGMENTS; s++) {
          const t = s / BRANCH_SEGMENTS
          const next = new THREE.Vector3()
            .copy(from)
            .addScaledVector(bd, bl * t)
            .add(new THREE.Vector3().randomDirection().multiplyScalar(0.12 * bl))
          seg(prev, next, 0.016)
          prev = next
        }
      }
    }
    // Unused slots (degenerate segments) collapse to nothing.
    for (; n < TOTAL; n++) {
      core.setMatrixAt(n, _m.makeScale(0, 0, 0))
      glow.setMatrixAt(n, _m.makeScale(0, 0, 0))
    }
    core.instanceMatrix.needsUpdate = true
    glow.instanceMatrix.needsUpdate = true
  })

  return (
    <group ref={root}>
      <primitive object={built.glow} />
      <primitive object={built.core} />
    </group>
  )
}

/**
 * 3D Chidori: hot core in a flickering plasma shell, a glowing spike pointing along the fingers,
 * forked 3D lightning tubes, and hard sparks. All of it is in the hand's frame, so tilting your
 * hand swings the spike and bolts with it.
 */
export function Chidori({ fx, ctx, quality }: EffectProps) {
  const group = useRef<THREE.Group>(null)
  const orb = useRef<THREE.Group>(null)
  const spike = useRef<THREE.Mesh>(null)
  const shell = useRef<THREE.Mesh>(null)
  const halo = useRef<THREE.Group>(null)
  const haloB = useRef<THREE.Group>(null)
  const shellMat = useGlowMaterial('#60a5fa', { power: 1.8, intensity: 1.6, base: 0.15 })
  const spikeMat = useGlowMaterial('#a5b4fc', { power: 1.4, intensity: 1.4, base: 0.3 })
  const streak = useGeometry(makeStreakGeometry)
  // Spike cone: base at the palm, apex out past the fingertips (+Y).
  const spikeGeo = useGeometry(() => new THREE.ConeGeometry(0.5, 1, 16).translate(0, 0.5, 0))

  const sparks = useMemo<ParticleSpec>(
    () => ({
      count: Math.round(120 * quality),
      size: 0.09,
      from: '#ffffff',
      mid: '#7dd3fc',
      to: '#4f46e5',
      life: [0.12, 0.4],
      drag: 1.2,
      spawn: (o, origin) => {
        const d = new THREE.Vector3().randomDirection().add(ctx.up.clone().multiplyScalar(0.6)).normalize()
        const sp = 4 + Math.random() * 10
        o.x = origin.x
        o.y = origin.y
        o.z = origin.z
        o.vx = d.x * sp
        o.vy = d.y * sp
        o.vz = d.z * sp
      },
    }),
    [quality, ctx],
  )

  useFrame(() => {
    const k = presence(fx)
    const g = group.current
    if (!g) return
    g.visible = k > 0.01
    g.position.copy(ctx.pos)
    g.quaternion.copy(ctx.quat)
    g.scale.setScalar(Math.max(1e-4, fx.handScale * k))
    const flicker = 0.85 + Math.random() * 0.35
    orb.current?.scale.setScalar(0.42 * flicker)
    // Spike length jitters hard, like a live arc.
    spike.current?.scale.set(0.5, (1.6 + Math.random() * 1.2) * (fx.phase === 'released' ? 1.4 : 1), 0.5)
    shell.current?.scale.setScalar(0.75 * (0.85 + Math.random() * 0.5))
    shellMat.uniforms.uFade.value = 0.5 + Math.random() * 0.5
    spikeMat.uniforms.uFade.value = 0.4 + Math.random() * 0.6
    const flash = Math.random() < 0.08 ? 1.9 : 1
    halo.current?.scale.setScalar((0.5 + Math.random() * 1.0) * flash)
    haloB.current?.scale.setScalar(0.6 + Math.random() * 0.9)
  })

  return (
    <>
      <group ref={group} visible={false}>
        <group ref={orb}>
          <EnergyOrb inner="#ffffff" outer="#60a5fa" speed={26} />
        </group>
        <mesh ref={shell} material={shellMat}>
          <sphereGeometry args={[1, 24, 16]} />
        </mesh>
        <mesh ref={spike} geometry={spikeGeo} material={spikeMat} />
        <LightningBolts fx={fx} />
        <group ref={halo}>
          <Halo color="#93c5fd" size={4.5} />
        </group>
        <group ref={haloB}>
          <Halo color="#8b5cf6" size={7} />
        </group>
      </group>
      <MeshParticleField
        spec={sparks}
        geometry={streak}
        origin={ctx.pos}
        additive
        orient
        stretch={0.12}
        emit={() => presence(fx)}
      />
      <ImpactFx fx={fx} ctx={ctx} quality={quality} color="#93c5fd" color2="#ffffff" radius={4.2} duration={0.5} />
    </>
  )
}
