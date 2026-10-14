import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { EnergyOrb, Halo, ImpactFx, ParticleField, presence, type EffectProps, type ParticleSpec } from '../shared'

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

/** Spinning four-blade shuriken with an energy core, tilted rings, and radial particles. */
export function Rasenshuriken({ fx, ctx, quality }: EffectProps) {
  const group = useRef<THREE.Group>(null)
  const bladesA = useRef<THREE.Mesh>(null)
  const bladesB = useRef<THREE.Mesh>(null)
  const ringA = useRef<THREE.Mesh>(null)
  const ringB = useRef<THREE.Mesh>(null)
  const size = useRef(0.8)

  const shape = useMemo(() => new THREE.ShapeGeometry(makeBladeShape(), 12), [])

  const spec = useMemo<ParticleSpec>(
    () => ({
      count: Math.round(170 * quality),
      size: 0.1,
      from: '#ffffff',
      to: '#0891b2',
      life: [0.35, 0.8],
      drag: 0.8,
      spawn: (o, origin) => {
        const th = Math.random() * Math.PI * 2
        const r = size.current * (0.5 + Math.random() * 0.5)
        const sp = 2 + Math.random() * 3
        o.x = origin.x + Math.cos(th) * r
        o.y = origin.y + Math.sin(th) * r
        o.z = origin.z
        // Mostly radial, with a sideways component so the stream spirals outward.
        o.vx = Math.cos(th) * sp - Math.sin(th) * sp * 0.8
        o.vy = Math.sin(th) * sp + Math.cos(th) * sp * 0.8
        o.vz = (Math.random() - 0.5) * 1.5
      },
    }),
    [quality],
  )

  useFrame((state, dt) => {
    const k = presence(fx)
    const g = group.current
    if (!g) return
    size.current = 1.1 * fx.handScale * (fx.phase === 'released' ? 1.25 : 1)
    g.visible = k > 0.01
    g.position.copy(ctx.pos)
    g.scale.setScalar(Math.max(1e-4, size.current * k))
    // Spin accelerates with charge, then runs flat out on release.
    const spin = (fx.phase === 'released' ? 26 : 8 + fx.charge * 14) * dt
    if (bladesA.current) bladesA.current.rotation.z += spin
    if (bladesB.current) bladesB.current.rotation.z -= spin * 0.6
    if (ringA.current) ringA.current.rotation.set(1.2, 0.2, state.clock.elapsedTime * 6)
    if (ringB.current) ringB.current.rotation.set(0.4, 1.3, -state.clock.elapsedTime * 8)
  })

  return (
    <>
      <group ref={group} visible={false}>
        <mesh ref={bladesA} geometry={shape}>
          <meshBasicMaterial color="#67e8f9" transparent opacity={0.55} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} depthWrite={false} />
        </mesh>
        <mesh ref={bladesB} geometry={shape} scale={0.72}>
          <meshBasicMaterial color="#ecfeff" transparent opacity={0.85} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} depthWrite={false} />
        </mesh>
        <group scale={0.32}>
          <EnergyOrb inner="#ffffff" outer="#22d3ee" speed={14} />
        </group>
        <mesh ref={ringA}>
          <torusGeometry args={[1.1, 0.02, 8, 64]} />
          <meshBasicMaterial color="#a5f3fc" transparent opacity={0.8} blending={THREE.AdditiveBlending} depthWrite={false} />
        </mesh>
        <mesh ref={ringB}>
          <torusGeometry args={[1.3, 0.015, 8, 64]} />
          <meshBasicMaterial color="#22d3ee" transparent opacity={0.6} blending={THREE.AdditiveBlending} depthWrite={false} />
        </mesh>
        <Halo color="#22d3ee" size={4.5} />
      </group>
      <ParticleField spec={spec} origin={ctx.pos} emit={() => presence(fx)} />
      <ImpactFx fx={fx} ctx={ctx} quality={quality} color="#67e8f9" color2="#ffffff" radius={5} duration={0.8} />
    </>
  )
}
