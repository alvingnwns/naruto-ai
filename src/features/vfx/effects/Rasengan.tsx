import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { EnergyOrb, Halo, ImpactFx, ParticleField, presence, type EffectProps, type ParticleSpec } from '../shared'

/** Glowing swirling sphere with two counter-rotating rings and orbiting chakra particles. */
export function Rasengan({ fx, ctx, quality }: EffectProps) {
  const group = useRef<THREE.Group>(null)
  const ringA = useRef<THREE.Mesh>(null)
  const ringB = useRef<THREE.Mesh>(null)
  const halo = useRef<THREE.Group>(null)
  const radius = useRef(0.5)

  const spec = useMemo<ParticleSpec>(
    () => ({
      count: Math.round(150 * quality),
      size: 0.11,
      from: '#e6f9ff',
      to: '#0369a1',
      life: [0.5, 1.1],
      drag: 0.5,
      spawn: (o, origin) => {
        const th = Math.random() * Math.PI * 2
        const r = radius.current * (1.1 + Math.random() * 0.9)
        o.x = origin.x + Math.cos(th) * r
        o.y = origin.y + Math.sin(th) * r
        o.z = origin.z + (Math.random() - 0.5) * r
        o.vx = o.vy = o.vz = 0
      },
      // Tangential push (swirl) plus a weak pull inward so particles orbit instead of flying off.
      force: (p, origin, dt) => {
        const rx = p.x - origin.x
        const ry = p.y - origin.y
        const k = 9
        p.vx += (-ry * k - rx * 3) * dt
        p.vy += (rx * k - ry * 3) * dt
      },
    }),
    [quality],
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
    g.scale.setScalar(Math.max(1e-4, radius.current * k * pulse))
    if (ringA.current) ringA.current.rotation.set(1.1, 0, ringA.current.rotation.z + dt * 9)
    if (ringB.current) ringB.current.rotation.set(0.3, 1.2, ringB.current.rotation.z - dt * 12)
    if (halo.current) halo.current.scale.setScalar(1 + Math.sin(state.clock.elapsedTime * 15) * 0.1)
  })

  return (
    <>
      <group ref={group} visible={false}>
        <EnergyOrb inner="#ffffff" outer="#22b8ff" />
        <mesh ref={ringA}>
          <torusGeometry args={[1.35, 0.025, 8, 64]} />
          <meshBasicMaterial color="#bae6fd" transparent opacity={0.8} blending={THREE.AdditiveBlending} depthWrite={false} />
        </mesh>
        <mesh ref={ringB}>
          <torusGeometry args={[1.6, 0.02, 8, 64]} />
          <meshBasicMaterial color="#38bdf8" transparent opacity={0.6} blending={THREE.AdditiveBlending} depthWrite={false} />
        </mesh>
        <group ref={halo}>
          <Halo color="#38bdf8" size={5} />
        </group>
      </group>
      <ParticleField spec={spec} origin={ctx.pos} emit={() => presence(fx)} />
      <ImpactFx fx={fx} ctx={ctx} quality={quality} color="#7dd3fc" color2="#ffffff" radius={3.2} duration={0.55} />
    </>
  )
}
