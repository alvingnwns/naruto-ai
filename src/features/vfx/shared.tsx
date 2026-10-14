import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { JutsuId } from '../../config/jutsu'
import type { JutsuPhase } from '../jutsu-system/lifecycle'

/** Mutable per-frame state written by the experience loop and read by the effects. Never React state. */
export interface FxState {
  jutsu: JutsuId | null
  phase: JutsuPhase
  /** Seconds spent in the current phase. */
  phaseTime: number
  /** 0..1 charge level. */
  charge: number
  /** Hand anchor in display space (0..1, mirrored, y down). */
  anchor: { x: number; y: number }
  /** Approximate depth cue from apparent hand size. */
  handScale: number
  /** 1 when the hand is tracked, fades towards a floor when it is lost. */
  visibility: number
  /** Unit aim direction in world XY, set at release. */
  aim: { x: number; y: number }
}

/** World-space positions derived from FxState once per frame by the scene. */
export interface FxCtx {
  /** Smoothed hand anchor. */
  anchor: THREE.Vector3
  /** Where the anchor was at the moment of release. */
  launch: THREE.Vector3
  /** Current effect position: the anchor, or the projectile once released. */
  pos: THREE.Vector3
  /** Aim direction (unit). */
  dir: THREE.Vector3
}

export interface EffectProps {
  fx: FxState
  ctx: FxCtx
  /** Particle-count multiplier from the quality setting. */
  quality: number
}

export const easeOutCubic = (t: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3)

/** 0..1 presence of a "held" effect: ramps up during charge, drops to 0 on impact, fades if the hand is lost. */
export function presence(fx: FxState): number {
  if (fx.phase === 'idle' || fx.phase === 'impact') return 0
  const charge = fx.phase === 'charging' ? easeOutCubic(fx.charge) : 1
  return charge * fx.visibility
}

// ---------------------------------------------------------------- glow texture

let glowTexture: THREE.CanvasTexture | null = null
/** Soft radial sprite used for every particle and halo. Created once and shared. */
export function getGlowTexture(): THREE.CanvasTexture {
  if (glowTexture) return glowTexture
  const size = 64
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const g = canvas.getContext('2d')!
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  grad.addColorStop(0, 'rgba(255,255,255,1)')
  grad.addColorStop(0.25, 'rgba(255,255,255,0.55)')
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, size, size)
  glowTexture = new THREE.CanvasTexture(canvas)
  return glowTexture
}

// ---------------------------------------------------------------- particles

export interface Emitted {
  x: number
  y: number
  z: number
  vx: number
  vy: number
  vz: number
}

export interface ParticleSpec {
  count: number
  size: number
  /** Colour at birth and at death; brightness additionally fades with age. */
  from: THREE.ColorRepresentation
  to: THREE.ColorRepresentation
  life: [number, number]
  /** Velocity damping per second (0 = none). */
  drag?: number
  /** Constant acceleration. */
  gravity?: [number, number, number]
  /** Called each time a particle is (re)born. `origin` is world space. */
  spawn: (out: Emitted, origin: THREE.Vector3, i: number) => void
  /** Optional per-particle force, e.g. swirl. Mutates velocity. */
  force?: (p: Emitted, origin: THREE.Vector3, dt: number) => void
}

interface ParticleFieldProps {
  spec: ParticleSpec
  origin: THREE.Vector3
  /** Fraction (0..1) of particle slots allowed to (re)spawn. 0 lets the field die out. */
  emit: () => number
}

/**
 * CPU particle field rendered as additive sprites. Particles live in world space, so moving the
 * emitter leaves a natural trail. One draw call per field.
 */
export function ParticleField({ spec, origin, emit }: ParticleFieldProps) {
  const { geometry, state } = useMemo(() => {
    const n = spec.count
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3))
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3), 3))
    const st = {
      vel: new Float32Array(n * 3),
      // Start dead (age >= life) so nothing appears until the first emit.
      age: new Float32Array(n).fill(1),
      life: new Float32Array(n).fill(1),
      tmp: { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 } as Emitted,
      c0: new THREE.Color(spec.from),
      c1: new THREE.Color(spec.to),
      col: new THREE.Color(),
    }
    return { geometry: geo, state: st }
  }, [spec.count])

  useEffect(() => () => geometry.dispose(), [geometry])

  const points = useRef<THREE.Points>(null)

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const pos = geometry.attributes.position as THREE.BufferAttribute
    const col = geometry.attributes.color as THREE.BufferAttribute
    const { vel, age, life, tmp, c0, c1, col: c } = state
    const allow = emit() * spec.count
    const drag = Math.exp(-(spec.drag ?? 0) * dt)
    const g = spec.gravity
    let alive = 0

    for (let i = 0; i < spec.count; i++) {
      const i3 = i * 3
      age[i] += dt
      if (age[i] >= life[i]) {
        if (i >= allow) {
          col.setXYZ(i, 0, 0, 0)
          continue
        }
        spec.spawn(tmp, origin, i)
        pos.setXYZ(i, tmp.x, tmp.y, tmp.z)
        vel[i3] = tmp.vx
        vel[i3 + 1] = tmp.vy
        vel[i3 + 2] = tmp.vz
        age[i] = 0
        life[i] = spec.life[0] + Math.random() * (spec.life[1] - spec.life[0])
      } else {
        tmp.x = pos.getX(i)
        tmp.y = pos.getY(i)
        tmp.z = pos.getZ(i)
        tmp.vx = vel[i3]
        tmp.vy = vel[i3 + 1]
        tmp.vz = vel[i3 + 2]
        spec.force?.(tmp, origin, dt)
        if (g) {
          tmp.vx += g[0] * dt
          tmp.vy += g[1] * dt
          tmp.vz += g[2] * dt
        }
        vel[i3] = tmp.vx * drag
        vel[i3 + 1] = tmp.vy * drag
        vel[i3 + 2] = tmp.vz * drag
        pos.setXYZ(i, tmp.x + vel[i3] * dt, tmp.y + vel[i3 + 1] * dt, tmp.z + vel[i3 + 2] * dt)
      }
      const t = age[i] / life[i]
      c.copy(c0).lerp(c1, t).multiplyScalar(Math.pow(1 - t, 0.8))
      col.setXYZ(i, c.r, c.g, c.b)
      alive++
    }
    pos.needsUpdate = true
    col.needsUpdate = true
    if (points.current) points.current.visible = alive > 0
  })

  return (
    <points ref={points} geometry={geometry} frustumCulled={false}>
      <pointsMaterial
        size={spec.size}
        map={getGlowTexture()}
        vertexColors
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        sizeAttenuation
      />
    </points>
  )
}

// ---------------------------------------------------------------- orb shader

const orbVertex = /* glsl */ `
  varying vec3 vObj;
  varying vec3 vNormalV;
  varying vec3 vViewDir;
  void main() {
    vObj = position;
    vNormalV = normalize(normalMatrix * normal);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vViewDir = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`

// Swirling bands: stripes that wind around the Y axis with latitude, plus a fresnel rim.
// Not a physical model; chosen to read as "spinning chakra" at small sizes.
const orbFragment = /* glsl */ `
  uniform float uTime;
  uniform float uSpeed;
  uniform vec3 uInner;
  uniform vec3 uOuter;
  varying vec3 vObj;
  varying vec3 vNormalV;
  varying vec3 vViewDir;
  void main() {
    vec3 p = normalize(vObj);
    float a = atan(p.z, p.x);
    float bands = sin(a * 5.0 + p.y * 9.0 - uTime * uSpeed) * 0.5 + 0.5;
    float fine  = sin(a * 14.0 - p.y * 16.0 + uTime * uSpeed * 1.7) * 0.5 + 0.5;
    float fres = pow(1.0 - max(dot(normalize(vNormalV), normalize(vViewDir)), 0.0), 2.2);
    vec3 col = mix(uOuter, uInner, bands * 0.7 + fine * 0.3);
    col += fres * 1.2 * uOuter + 0.35 * (1.0 - fres);
    gl_FragColor = vec4(col, 0.55 + 0.45 * fres);
  }
`

interface EnergyOrbProps {
  inner: THREE.ColorRepresentation
  outer: THREE.ColorRepresentation
  speed?: number
}

/** Unit-radius swirling energy sphere. Scale the parent group to size it. */
export function EnergyOrb({ inner, outer, speed = 7 }: EnergyOrbProps) {
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uSpeed: { value: speed },
      uInner: { value: new THREE.Color(inner) },
      uOuter: { value: new THREE.Color(outer) },
    }),
    [inner, outer, speed],
  )
  useFrame((_, dt) => {
    uniforms.uTime.value += dt
  })
  return (
    <mesh>
      <sphereGeometry args={[1, 32, 24]} />
      <shaderMaterial
        vertexShader={orbVertex}
        fragmentShader={orbFragment}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </mesh>
  )
}

// ---------------------------------------------------------------- halo + impact

/** Additive glow billboard. Stands in for post-process bloom, which is unreliable on transparent canvases. */
export function Halo({ color, size }: { color: THREE.ColorRepresentation; size: number }) {
  return (
    <sprite scale={[size, size, 1]}>
      <spriteMaterial map={getGlowTexture()} color={color} transparent depthWrite={false} blending={THREE.AdditiveBlending} />
    </sprite>
  )
}

interface ImpactProps extends EffectProps {
  color: THREE.ColorRepresentation
  color2: THREE.ColorRepresentation
  /** Final ring radius in world units. */
  radius: number
  /** Duration of the ring/flash in seconds. */
  duration: number
}

/** Shared impact: expanding ring, flash, and a one-shot particle burst at ctx.pos. */
export function ImpactFx({ fx, ctx, quality, color, color2, radius, duration }: ImpactProps) {
  const group = useRef<THREE.Group>(null)
  const ring = useRef<THREE.Mesh>(null)
  const flash = useRef<THREE.Sprite>(null)

  const spec = useMemo<ParticleSpec>(
    () => ({
      count: Math.round(90 * quality),
      size: 0.16,
      from: color,
      to: color2,
      life: [0.35, 0.8],
      drag: 2.2,
      spawn: (o, origin) => {
        const th = Math.random() * Math.PI * 2
        const ph = Math.acos(2 * Math.random() - 1)
        const sp = (2 + Math.random() * 5) * (radius / 2)
        o.x = origin.x
        o.y = origin.y
        o.z = origin.z
        o.vx = Math.sin(ph) * Math.cos(th) * sp
        o.vy = Math.sin(ph) * Math.sin(th) * sp
        o.vz = Math.cos(ph) * sp * 0.5
      },
    }),
    [quality, color, color2, radius],
  )

  useFrame(() => {
    const g = group.current
    if (!g) return
    const active = fx.phase === 'impact' && fx.phaseTime < duration
    g.visible = active
    if (!active) return
    const t = fx.phaseTime / duration
    g.position.copy(ctx.pos)
    ring.current?.scale.setScalar(0.2 + easeOutCubic(t) * radius)
    ;(ring.current?.material as THREE.MeshBasicMaterial).opacity = 1 - t
    flash.current?.scale.setScalar(radius * (1.4 - t) * 1.1)
    ;(flash.current?.material as THREE.SpriteMaterial).opacity = Math.pow(1 - t, 2)
  })

  return (
    <>
      <group ref={group} visible={false}>
        <mesh ref={ring}>
          <ringGeometry args={[0.85, 1, 48]} />
          <meshBasicMaterial color={color} transparent depthWrite={false} blending={THREE.AdditiveBlending} side={THREE.DoubleSide} />
        </mesh>
        <sprite ref={flash}>
          <spriteMaterial map={getGlowTexture()} color={color2} transparent depthWrite={false} blending={THREE.AdditiveBlending} />
        </sprite>
      </group>
      {/* Burst is gated to the first instant of impact so each particle spawns once. */}
      <ParticleField spec={spec} origin={ctx.pos} emit={() => (fx.phase === 'impact' && fx.phaseTime < 0.08 ? 1 : 0)} />
    </>
  )
}
