import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { Halo, ParticleField, easeOutCubic, type EffectProps, type ParticleSpec } from '../shared'

/**
 * Fire plume: a small rising fireball while charging, a directional jet on release, and
 * drifting embers on dissipation. Unlike the other jutsu this does not travel; it streams from
 * where it was released.
 */
export function Katon({ fx, ctx, quality }: EffectProps) {
  const halo = useRef<THREE.Group>(null)
  const haloScale = useRef(0)

  const flame = useMemo<ParticleSpec>(
    () => ({
      count: Math.round(900 * quality),
      size: 0.5,
      from: '#fde047',
      to: '#b91c1c',
      life: [0.5, 1.1],
      drag: 0.6,
      gravity: [0, 1.6, 0], // flames rise
      spawn: (o) => {
        const jet = fx.phase === 'released'
        const src = jet ? ctx.launch : ctx.anchor
        const spread = (Math.random() - 0.5) * (jet ? 0.5 : 1.4)
        // Rotate the base direction (aim for the jet, straight up otherwise) by a random spread.
        const bx = jet ? ctx.dir.x : 0
        const by = jet ? ctx.dir.y : 1
        const c = Math.cos(spread)
        const s = Math.sin(spread)
        const dx = bx * c - by * s
        const dy = bx * s + by * c
        const speed = jet ? 6 + Math.random() * 5 : 0.8 + Math.random() * 1.6
        const r = jet ? 0.15 : 0.25 * fx.handScale
        o.x = src.x + (Math.random() - 0.5) * r
        o.y = src.y + (Math.random() - 0.5) * r
        o.z = src.z + (Math.random() - 0.5) * 0.4
        o.vx = dx * speed
        o.vy = dy * speed
        o.vz = (Math.random() - 0.5) * 1.2
      },
    }),
    [quality, fx, ctx],
  )

  const emit = () => {
    switch (fx.phase) {
      case 'charging':
        return easeOutCubic(fx.charge) * 0.3 * fx.visibility
      case 'ready':
        return 0.35 * fx.visibility
      case 'released':
        return 1
      case 'impact':
        return Math.max(0, 0.3 * (1 - fx.phaseTime / 0.45)) // dissipating embers
      default:
        return 0
    }
  }

  useFrame((state, dt) => {
    const target = emit()
    haloScale.current += (target - haloScale.current) * Math.min(1, dt * 10)
    const g = halo.current
    if (!g) return
    const src = fx.phase === 'released' || fx.phase === 'impact' ? ctx.launch : ctx.anchor
    // Halo sits at the source and leans along the jet while firing.
    const lead = fx.phase === 'released' ? 1.2 : 0
    g.position.set(src.x + ctx.dir.x * lead, src.y + ctx.dir.y * lead, 0)
    const flicker = 0.85 + Math.sin(state.clock.elapsedTime * 40) * 0.1 + Math.random() * 0.1
    g.scale.setScalar(Math.max(1e-4, haloScale.current * 3.2 * flicker * fx.handScale))
    g.visible = haloScale.current > 0.02
  })

  return (
    <>
      <group ref={halo} visible={false}>
        <Halo color="#fb923c" size={1} />
      </group>
      <ParticleField spec={flame} origin={ctx.anchor} emit={emit} />
    </>
  )
}
