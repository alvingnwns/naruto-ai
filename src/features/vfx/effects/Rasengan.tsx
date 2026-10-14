import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import {
  EnergyOrb,
  Halo,
  ImpactFx,
  MeshParticleField,
  makeBeadGeometry,
  makeStreakGeometry,
  presence,
  useGeometry,
  useGlowMaterial,
  type EffectProps,
  type ParticleSpec,
} from '../shared'

const ORBITERS = 120
const TRAIL = 4 // beads per orbiter: head + fading tail

const _m = new THREE.Matrix4()
const _q = new THREE.Quaternion()
const _p = new THREE.Vector3()
const _s = new THREE.Vector3()
const _c = new THREE.Color()

/**
 * Chakra beads on tilted circular orbits around the orb. Each orbiter has its own random orbital
 * plane, radius and angular speed, so together they cover the full sphere (360 degrees) and never
 * stop; the whole cloud also precesses slowly. Every bead is a real 3D mesh (instanced), in
 * unit-orb space: the parent group scales and orients it.
 */
function OrbitingChakra({ quality }: { quality: number }) {
  const cloud = useRef<THREE.Group>(null)
  const count = Math.round(ORBITERS * quality)
  const bead = useGeometry(makeBeadGeometry)

  const built = useMemo(() => {
    const total = count * TRAIL
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })
    const mesh = new THREE.InstancedMesh(bead, mat, total)
    mesh.frustumCulled = false
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    const orbits = Array.from({ length: count }, (_, i) => {
      // Random orbital plane: pick a unit normal, then two perpendicular in-plane axes.
      const n = new THREE.Vector3().randomDirection()
      const u = new THREE.Vector3().randomDirection().cross(n).normalize()
      const v = new THREE.Vector3().crossVectors(n, u)
      const bright = 0.75 + Math.random() * 0.25
      for (let k = 0; k < TRAIL; k++) {
        const f = bright * Math.pow(1 - k / TRAIL, 1.4)
        mesh.setColorAt(i * TRAIL + k, _c.setRGB(0.5 * f + 0.2, 0.9 * f, f))
      }
      return {
        u,
        v,
        radius: 1.25 + Math.random() * 0.9,
        speed: (3.5 + Math.random() * 5) * (Math.random() < 0.8 ? 1 : -1), // mostly one spin direction
        phase: Math.random() * Math.PI * 2,
        size: 0.09 + Math.random() * 0.07,
      }
    })
    return { mat, mesh, orbits }
  }, [count, bead])

  useEffect(
    () => () => {
      built.mesh.dispose()
      built.mat.dispose()
    },
    [built],
  )

  useFrame((state, dt) => {
    const t = state.clock.elapsedTime
    const { mesh, orbits } = built
    for (let i = 0; i < orbits.length; i++) {
      const { u, v, radius, speed, phase, size } = orbits[i]
      for (let k = 0; k < TRAIL; k++) {
        // Tail beads lag behind the head along the orbit and shrink.
        const a = phase + speed * t - Math.sign(speed) * k * 0.12
        const c = Math.cos(a) * radius
        const s = Math.sin(a) * radius
        _p.set(u.x * c + v.x * s, u.y * c + v.y * s, u.z * c + v.z * s)
        const sc = size * (1 - (k / TRAIL) * 0.65)
        mesh.setMatrixAt(i * TRAIL + k, _m.compose(_p, _q.identity(), _s.set(sc, sc, sc)))
      }
    }
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    if (cloud.current) {
      cloud.current.rotation.y += dt * 0.9
      cloud.current.rotation.x += dt * 0.55
    }
  })

  return (
    <group ref={cloud}>
      <primitive object={built.mesh} />
    </group>
  )
}

/**
 * 3D Rasengan: swirling core, fresnel-glow shell, three gyroscope rings, and a non-stop 360-degree
 * chakra orbit. The whole assembly takes the hand's orientation: the big ring lies in the palm
 * plane and another ring runs along the fingers, so rotating your hand visibly rotates it.
 */
export function Rasengan({ fx, ctx, quality }: EffectProps) {
  const group = useRef<THREE.Group>(null)
  const ringA = useRef<THREE.Mesh>(null)
  const ringB = useRef<THREE.Mesh>(null)
  const ringC = useRef<THREE.Mesh>(null)
  const halo = useRef<THREE.Group>(null)
  const radius = useRef(0.5)
  const shellMat = useGlowMaterial('#38bdf8', { power: 2.4, intensity: 1.5, base: 0.12 })
  const streak = useGeometry(makeStreakGeometry)

  // Wake shards that trail behind the orb once it is released.
  const wake = useMemo<ParticleSpec>(
    () => ({
      count: Math.round(60 * quality),
      size: 0.1,
      from: '#ffffff',
      mid: '#7dd3fc',
      to: '#0369a1',
      life: [0.3, 0.7],
      drag: 1.2,
      spawn: (o, origin) => {
        const d = new THREE.Vector3().randomDirection()
        const r = radius.current * 1.3
        o.x = origin.x + d.x * r
        o.y = origin.y + d.y * r
        o.z = origin.z + d.z * r
        o.vx = d.x * 1.5 - ctx.dir.x * 2
        o.vy = d.y * 1.5 - ctx.dir.y * 2
        o.vz = d.z * 1.5
      },
    }),
    [quality, ctx],
  )

  useFrame((state, dt) => {
    const k = presence(fx)
    const g = group.current
    if (!g) return
    const pulse = 1 + Math.sin(state.clock.elapsedTime * 28) * 0.05
    const boost = fx.phase === 'released' ? 1.2 : 1
    radius.current = 0.75 * fx.handScale * boost
    g.visible = k > 0.01
    g.position.copy(ctx.pos)
    g.quaternion.copy(ctx.quat)
    g.scale.setScalar(Math.max(1e-4, radius.current * k * pulse))
    // Palm-plane ring spins about the palm normal (local Z); finger-axis ring about local Y.
    if (ringA.current) ringA.current.rotation.z += dt * 9
    if (ringB.current) ringB.current.rotation.y += dt * 12
    if (ringC.current) ringC.current.rotation.set(0.9, ringC.current.rotation.y - dt * 7, 0)
    if (halo.current) halo.current.scale.setScalar(1 + Math.sin(state.clock.elapsedTime * 15) * 0.1)
  })

  const ringMat = { transparent: true, blending: THREE.AdditiveBlending, depthWrite: false } as const

  return (
    <>
      <group ref={group} visible={false}>
        <EnergyOrb inner="#ffffff" outer="#22b8ff" />
        <mesh material={shellMat}>
          <sphereGeometry args={[1.3, 32, 24]} />
        </mesh>
        <mesh ref={ringA} rotation={[0, 0, 0]}>
          <torusGeometry args={[1.5, 0.035, 12, 72]} />
          <meshBasicMaterial color="#bae6fd" opacity={0.9} {...ringMat} />
        </mesh>
        <mesh ref={ringB} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[1.7, 0.03, 12, 72]} />
          <meshBasicMaterial color="#38bdf8" opacity={0.75} {...ringMat} />
        </mesh>
        <mesh ref={ringC}>
          <torusGeometry args={[1.95, 0.025, 12, 72]} />
          <meshBasicMaterial color="#7dd3fc" opacity={0.6} {...ringMat} />
        </mesh>
        <OrbitingChakra quality={quality} />
        <group ref={halo}>
          <Halo color="#38bdf8" size={5} />
        </group>
      </group>
      <MeshParticleField
        spec={wake}
        geometry={streak}
        origin={ctx.pos}
        additive
        orient
        stretch={0.3}
        emit={() => (fx.phase === 'released' ? 1 : 0)}
      />
      <ImpactFx fx={fx} ctx={ctx} quality={quality} color="#38bdf8" color2="#ffffff" radius={3.4} duration={0.6} />
    </>
  )
}
