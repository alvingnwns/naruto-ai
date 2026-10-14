import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { EnergyOrb, Halo, ImpactFx, ParticleField, presence, type EffectProps, type ParticleSpec } from '../shared'

const ARCS = 7
const SEGMENTS = 9
const COPIES = 3 // each arc is drawn 3x with a tiny offset: 1px GL lines otherwise look too thin

/** Jagged lightning bolts regenerated ~20x/sec, radiating from the palm. */
function Arcs({ fx, ctx }: Pick<EffectProps, 'fx' | 'ctx'>) {
  const lines = useRef<THREE.LineSegments>(null)
  const timer = useRef(0)
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(ARCS * COPIES * SEGMENTS * 2 * 3), 3))
    return g
  }, [])
  useEffect(() => () => geometry.dispose(), [geometry])

  useFrame((_, dt) => {
    const l = lines.current
    if (!l) return
    const k = presence(fx)
    l.visible = k > 0.01
    l.position.copy(ctx.pos)
    timer.current += dt
    if (timer.current < 0.05 || !l.visible) return
    timer.current = 0

    const pos = geometry.attributes.position as THREE.BufferAttribute
    const reach = (fx.phase === 'released' ? 2.6 : 1.5) * fx.handScale * k
    let v = 0
    for (let a = 0; a < ARCS; a++) {
      const ang = Math.random() * Math.PI * 2
      const dx = Math.cos(ang)
      const dy = Math.sin(ang)
      const len = reach * (0.5 + Math.random() * 0.7)
      // Midpoint-style jitter perpendicular to the bolt direction.
      const pts: [number, number][] = []
      for (let s = 0; s <= SEGMENTS; s++) {
        const t = s / SEGMENTS
        const jag = (Math.random() - 0.5) * 0.45 * Math.sin(Math.PI * t) * len
        pts.push([dx * len * t - dy * jag, dy * len * t + dx * jag])
      }
      for (let c = 0; c < COPIES; c++) {
        const off = (c - 1) * 0.02
        for (let s = 0; s < SEGMENTS; s++) {
          pos.setXYZ(v++, pts[s][0] + off, pts[s][1] - off, 0)
          pos.setXYZ(v++, pts[s + 1][0] + off, pts[s + 1][1] - off, 0)
        }
      }
    }
    pos.needsUpdate = true
  })

  return (
    <lineSegments ref={lines} geometry={geometry} frustumCulled={false} visible={false}>
      <lineBasicMaterial color="#c7d2fe" transparent opacity={0.95} blending={THREE.AdditiveBlending} depthWrite={false} />
    </lineSegments>
  )
}

/** Compact white-blue core, crackling arcs, fast sparks and a flickering halo. */
export function Chidori({ fx, ctx, quality }: EffectProps) {
  const group = useRef<THREE.Group>(null)
  const halo = useRef<THREE.Group>(null)

  const sparks = useMemo<ParticleSpec>(
    () => ({
      count: Math.round(120 * quality),
      size: 0.09,
      from: '#ffffff',
      to: '#6366f1',
      life: [0.15, 0.4],
      drag: 1.5,
      spawn: (o, origin) => {
        const th = Math.random() * Math.PI * 2
        const sp = 3 + Math.random() * 7
        o.x = origin.x
        o.y = origin.y
        o.z = origin.z
        o.vx = Math.cos(th) * sp
        o.vy = Math.sin(th) * sp
        o.vz = (Math.random() - 0.5) * 2
      },
    }),
    [quality],
  )

  useFrame(() => {
    const k = presence(fx)
    const g = group.current
    if (!g) return
    g.visible = k > 0.01
    g.position.copy(ctx.pos)
    g.scale.setScalar(Math.max(1e-4, 0.42 * fx.handScale * k * (0.9 + Math.random() * 0.25)))
    // Flicker: random per-frame brightness rather than a smooth pulse.
    if (halo.current) halo.current.scale.setScalar(0.7 + Math.random() * 0.8)
  })

  return (
    <>
      <group ref={group} visible={false}>
        <EnergyOrb inner="#ffffff" outer="#818cf8" speed={20} />
        <group ref={halo}>
          <Halo color="#a5b4fc" size={9} />
        </group>
      </group>
      <Arcs fx={fx} ctx={ctx} />
      <ParticleField spec={sparks} origin={ctx.pos} emit={() => presence(fx)} />
      <ImpactFx fx={fx} ctx={ctx} quality={quality} color="#a5b4fc" color2="#ffffff" radius={3.6} duration={0.45} />
    </>
  )
}
