import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
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
  /** Hand orientation (display space: +x right, +y up, +z toward viewer). See gesture-recognition/pose.ts. */
  handUp: { x: number; y: number; z: number }
  handNormal: { x: number; y: number; z: number }
}

/** World-space values derived from FxState once per frame by the scene. */
export interface FxCtx {
  /** Smoothed hand anchor. */
  anchor: THREE.Vector3
  /** Where the anchor was at the moment of release. */
  launch: THREE.Vector3
  /** Current effect position: the anchor, or the projectile once released. */
  pos: THREE.Vector3
  /** Flight direction chosen at release (unit). */
  dir: THREE.Vector3
  /** Smoothed hand orientation: local +Y = fingers, local +Z = palm normal. Apply to a group to follow the hand. */
  quat: THREE.Quaternion
  /** Smoothed finger direction in world space (unit). */
  up: THREE.Vector3
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

// ---------------------------------------------------------------- shared geometry

/** Creates a geometry once per component instance and disposes it on unmount. */
export function useGeometry<T extends THREE.BufferGeometry>(factory: () => T): T {
  const geo = useMemo(factory, [])
  useEffect(() => () => geo.dispose(), [geo])
  return geo
}

/** Teardrop flame tongue along +Y (pointed tip), centred so scaling pivots around its middle. */
export function makeFlameGeometry(): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = []
  const steps = 10
  for (let i = 0; i <= steps; i++) {
    const y = i / steps
    // Round belly low, sharp tip high.
    const r = 0.46 * Math.pow(Math.sin(Math.PI * Math.pow(y, 0.62)), 0.9)
    pts.push(new THREE.Vector2(Math.max(r, 0.0001), y))
  }
  const g = new THREE.LatheGeometry(pts, 9) // 9 sides: faceted on purpose, reads as toon-shaded
  g.translate(0, -0.4, 0)
  return g
}

/** Pointed streak along +Y (apex at +Y), for sparks, wind and shards. */
export function makeStreakGeometry(): THREE.BufferGeometry {
  return new THREE.ConeGeometry(0.2, 1, 5)
}

export function makeBeadGeometry(): THREE.BufferGeometry {
  return new THREE.IcosahedronGeometry(0.5, 1)
}

// ---------------------------------------------------------------- glow textures / materials

let glowTexture: THREE.CanvasTexture | null = null
/** Soft radial sprite for halos. Created once and shared. */
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

const glowVertex = /* glsl */ `
  varying vec3 vNormalV;
  varying vec3 vViewDir;
  void main() {
    vNormalV = normalize(normalMatrix * normal);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vViewDir = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`

// Fresnel rim glow: bright where the surface is seen edge-on, dim facing the camera. Applied to
// real 3D meshes it makes them read as volumetric glowing energy rather than flat shapes.
const glowFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uPower;
  uniform float uIntensity;
  uniform float uBase;
  uniform float uFade;
  varying vec3 vNormalV;
  varying vec3 vViewDir;
  void main() {
    float f = pow(1.0 - abs(dot(normalize(vNormalV), normalize(vViewDir))), uPower);
    float a = clamp(uBase + f * uIntensity, 0.0, 1.0) * uFade;
    gl_FragColor = vec4(uColor * (0.6 + f * 1.4), a);
  }
`

export interface GlowOptions {
  /** Higher = thinner, sharper rim. */
  power?: number
  intensity?: number
  /** Minimum opacity on the face-on parts. */
  base?: number
}

/** Additive fresnel-glow material. Drive `uniforms.uFade.value` (0..1) to fade it out. */
export function createGlowMaterial(color: THREE.ColorRepresentation, o: GlowOptions = {}): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: glowVertex,
    fragmentShader: glowFragment,
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uPower: { value: o.power ?? 2.0 },
      uIntensity: { value: o.intensity ?? 1.2 },
      uBase: { value: o.base ?? 0.25 },
      uFade: { value: 1 },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  })
}

export function useGlowMaterial(color: THREE.ColorRepresentation, o: GlowOptions = {}): THREE.ShaderMaterial {
  const mat = useMemo(() => createGlowMaterial(color, o), [color, o.power, o.intensity, o.base])
  useEffect(() => () => mat.dispose(), [mat])
  return mat
}

// ---------------------------------------------------------------- particle simulation

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
  /** Base size in world units. */
  size: number
  /** Colour at birth, (optionally) midway, and at death. */
  from: THREE.ColorRepresentation
  mid?: THREE.ColorRepresentation
  to: THREE.ColorRepresentation
  life: [number, number]
  /** Velocity damping per second (0 = none). */
  drag?: number
  /** Constant acceleration. */
  gravity?: [number, number, number]
  /** Size multiplier over normalised age 0..1. */
  sizeOverLife?: (t: number) => number
  /** Called each time a particle is (re)born. `origin` is world space. */
  spawn: (out: Emitted, origin: THREE.Vector3, i: number) => void
  /** Optional per-particle force, e.g. swirl. Mutates velocity. */
  force?: (p: Emitted, origin: THREE.Vector3, dt: number) => void
}

/** Position/velocity/lifetime integrator shared by the sprite and mesh particle fields. */
class ParticleSim {
  readonly pos: Float32Array
  readonly vel: Float32Array
  private age: Float32Array
  private life: Float32Array
  private tmp: Emitted = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 }

  constructor(readonly n: number) {
    this.pos = new Float32Array(n * 3)
    this.vel = new Float32Array(n * 3)
    // Start dead (age >= life) so nothing appears until the first emit.
    this.age = new Float32Array(n).fill(1)
    this.life = new Float32Array(n).fill(1)
  }

  /**
   * Advances one frame. `emit` (0..1) is the fraction of slots allowed to respawn.
   * Returns the number of live particles.
   */
  step(
    spec: ParticleSpec,
    dtRaw: number,
    emit: number,
    origin: THREE.Vector3,
    onAlive: (i: number, t: number) => void,
    onDead: (i: number) => void,
  ): number {
    const dt = Math.min(dtRaw, 0.05)
    const { pos, vel, age, life, tmp } = this
    const allow = emit * this.n
    const drag = Math.exp(-(spec.drag ?? 0) * dt)
    const g = spec.gravity
    let alive = 0

    for (let i = 0; i < this.n; i++) {
      const i3 = i * 3
      age[i] += dt
      if (age[i] >= life[i]) {
        if (i >= allow) {
          onDead(i)
          continue
        }
        spec.spawn(tmp, origin, i)
        pos[i3] = tmp.x
        pos[i3 + 1] = tmp.y
        pos[i3 + 2] = tmp.z
        vel[i3] = tmp.vx
        vel[i3 + 1] = tmp.vy
        vel[i3 + 2] = tmp.vz
        age[i] = 0
        life[i] = spec.life[0] + Math.random() * (spec.life[1] - spec.life[0])
      } else {
        tmp.x = pos[i3]
        tmp.y = pos[i3 + 1]
        tmp.z = pos[i3 + 2]
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
        pos[i3] = tmp.x + vel[i3] * dt
        pos[i3 + 1] = tmp.y + vel[i3 + 1] * dt
        pos[i3 + 2] = tmp.z + vel[i3 + 2] * dt
      }
      onAlive(i, age[i] / life[i])
      alive++
    }
    return alive
  }
}

function makeGradient(spec: ParticleSpec) {
  const c0 = new THREE.Color(spec.from)
  const cm = new THREE.Color(spec.mid ?? spec.from)
  const c1 = new THREE.Color(spec.to)
  const hasMid = spec.mid !== undefined
  return (t: number, out: THREE.Color) => {
    if (hasMid) {
      if (t < 0.5) out.copy(c0).lerp(cm, t * 2)
      else out.copy(cm).lerp(c1, (t - 0.5) * 2)
    } else out.copy(c0).lerp(c1, t)
    return out
  }
}

// ---------------------------------------------------------------- 3D mesh particles

const _m = new THREE.Matrix4()
const _q = new THREE.Quaternion()
const _p = new THREE.Vector3()
const _s = new THREE.Vector3()
const _v = new THREE.Vector3()
const _c = new THREE.Color()
const _Y = new THREE.Vector3(0, 1, 0)
const _ZERO = new THREE.Matrix4().makeScale(0, 0, 0)

interface MeshFieldProps {
  spec: ParticleSpec
  /** Shared mesh, e.g. from makeFlameGeometry(). Owned (and disposed) by the caller. */
  geometry: THREE.BufferGeometry
  origin: THREE.Vector3
  /** Fraction (0..1) of slots allowed to (re)spawn. 0 lets the field die out. */
  emit: () => number
  /** Align each mesh's +Y to its velocity. */
  orient?: boolean
  /** Extra length along +Y per unit of speed (0 = no stretch). */
  stretch?: number
  /** Additive glowing look (fades via brightness) instead of solid colour (fades via shrinking). */
  additive?: boolean
  /** If set, draws a dark inverted-hull outline in this colour: the cel-shading look. */
  outline?: THREE.ColorRepresentation
}

/**
 * Real 3D particles: every particle is an instanced mesh (one draw call per field, plus one for
 * the outline). Particles live in world space, so moving the emitter leaves a natural trail.
 */
export function MeshParticleField({ spec, geometry, origin, emit, orient, stretch = 0, additive, outline }: MeshFieldProps) {
  const built = useMemo(() => {
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: !!additive,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      depthWrite: !additive,
    })
    const mesh = new THREE.InstancedMesh(geometry, mat, spec.count)
    mesh.frustumCulled = false
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    for (let i = 0; i < spec.count; i++) {
      mesh.setMatrixAt(i, _ZERO)
      mesh.setColorAt(i, _c.set(0xffffff)) // allocates instanceColor
    }
    mesh.instanceColor!.setUsage(THREE.DynamicDrawUsage)

    let hull: THREE.InstancedMesh | null = null
    let hullMat: THREE.MeshBasicMaterial | null = null
    if (outline !== undefined) {
      hullMat = new THREE.MeshBasicMaterial({ color: outline, side: THREE.BackSide })
      hull = new THREE.InstancedMesh(geometry, hullMat, spec.count)
      hull.frustumCulled = false
      hull.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
      for (let i = 0; i < spec.count; i++) hull.setMatrixAt(i, _ZERO)
    }
    return { mat, mesh, hull, hullMat, sim: new ParticleSim(spec.count), gradient: makeGradient(spec) }
  }, [spec.count, geometry, additive, outline])

  useEffect(
    () => () => {
      built.mesh.dispose()
      built.mat.dispose()
      built.hull?.dispose()
      built.hullMat?.dispose()
    },
    [built],
  )

  useFrame((_, dt) => {
    const { mesh, hull, sim, gradient } = built
    const vel = sim.vel
    const pos = sim.pos
    const alive = sim.step(
      spec,
      dt,
      emit(),
      origin,
      (i, t) => {
        const i3 = i * 3
        _p.set(pos[i3], pos[i3 + 1], pos[i3 + 2])
        const speed = Math.hypot(vel[i3], vel[i3 + 1], vel[i3 + 2])
        if (orient && speed > 1e-4) {
          _v.set(vel[i3] / speed, vel[i3 + 1] / speed, vel[i3 + 2] / speed)
          _q.setFromUnitVectors(_Y, _v)
        } else _q.identity()
        const base = spec.size * (spec.sizeOverLife ? spec.sizeOverLife(t) : 1)
        _s.set(base, base * (1 + stretch * speed), base)
        mesh.setMatrixAt(i, _m.compose(_p, _q, _s))
        if (hull) {
          _s.set(base * 1.22, base * (1 + stretch * speed) * 1.1, base * 1.22)
          hull.setMatrixAt(i, _m.compose(_p, _q, _s))
        }
        gradient(t, _c)
        if (additive) _c.multiplyScalar(Math.pow(1 - t, 0.8))
        mesh.setColorAt(i, _c)
      },
      (i) => {
        mesh.setMatrixAt(i, _ZERO)
        hull?.setMatrixAt(i, _ZERO)
      },
    )
    mesh.instanceMatrix.needsUpdate = true
    mesh.instanceColor!.needsUpdate = true
    mesh.visible = alive > 0
    if (hull) {
      hull.instanceMatrix.needsUpdate = true
      hull.visible = alive > 0
    }
  })

  return (
    <>
      <primitive object={built.mesh} />
      {built.hull && <primitive object={built.hull} />}
    </>
  )
}

// ---------------------------------------------------------------- sprite particles (soft glow dust)

interface ParticleFieldProps {
  spec: ParticleSpec
  origin: THREE.Vector3
  emit: () => number
}

const particleVertex = /* glsl */ `
  attribute float aSize;
  attribute vec4 aColor;
  uniform float uScale;
  varying vec4 vColor;
  void main() {
    vColor = aColor;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    // Same perspective sizing as PointsMaterial: world size * (half viewport height / depth).
    gl_PointSize = aSize * uScale / -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`

const particleFragment = /* glsl */ `
  varying vec4 vColor;
  void main() {
    float d = length(gl_PointCoord * 2.0 - 1.0);
    if (d > 1.0) discard;
    gl_FragColor = vec4(vColor.rgb, vColor.a * clamp(pow(1.0 - d, 1.4) * 1.15, 0.0, 1.0));
    #include <colorspace_fragment>
  }
`

/** Soft additive glow dust. Used only as a fine accent around the real 3D geometry. */
export function ParticleField({ spec, origin, emit }: ParticleFieldProps) {
  const gl = useThree((s) => s.gl)
  const sizeVec = useMemo(() => new THREE.Vector2(), [])
  const built = useMemo(() => {
    const sim = new ParticleSim(spec.count)
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(sim.pos, 3))
    geo.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(spec.count), 1))
    geo.setAttribute('aColor', new THREE.BufferAttribute(new Float32Array(spec.count * 4), 4))
    const mat = new THREE.ShaderMaterial({
      vertexShader: particleVertex,
      fragmentShader: particleFragment,
      uniforms: { uScale: { value: 300 } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
    return { sim, geo, mat, gradient: makeGradient(spec) }
  }, [spec.count])

  useEffect(
    () => () => {
      built.geo.dispose()
      built.mat.dispose()
    },
    [built],
  )

  const points = useRef<THREE.Points>(null)

  useFrame((_, dt) => {
    const { sim, geo, mat, gradient } = built
    const size = geo.attributes.aSize as THREE.BufferAttribute
    const col = geo.attributes.aColor as THREE.BufferAttribute
    mat.uniforms.uScale.value = gl.getDrawingBufferSize(sizeVec).height / 2
    const alive = sim.step(
      spec,
      dt,
      emit(),
      origin,
      (i, t) => {
        gradient(t, _c)
        col.setXYZW(i, _c.r, _c.g, _c.b, Math.pow(1 - t, 0.8))
        size.setX(i, spec.size * (spec.sizeOverLife ? spec.sizeOverLife(t) : 1))
      },
      (i) => {
        size.setX(i, 0)
        col.setW(i, 0)
      },
    )
    ;(geo.attributes.position as THREE.BufferAttribute).needsUpdate = true
    size.needsUpdate = true
    col.needsUpdate = true
    if (points.current) points.current.visible = alive > 0
  })

  return <points ref={points} geometry={built.geo} material={built.mat} frustumCulled={false} />
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

/** Additive glow billboard: a soft bloom stand-in around the real geometry. */
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
  /** Final shockwave radius in world units. */
  radius: number
  /** Duration of the shell/shockwave in seconds. */
  duration: number
}

/** Shared 3D impact: expanding glow shell, tilted torus shockwave, flash, and a burst of shards. */
export function ImpactFx({ fx, ctx, quality, color, color2, radius, duration }: ImpactProps) {
  const group = useRef<THREE.Group>(null)
  const shell = useRef<THREE.Mesh>(null)
  const ring = useRef<THREE.Mesh>(null)
  const flash = useRef<THREE.Sprite>(null)
  const shellMat = useGlowMaterial(color, { power: 1.6, intensity: 1.4, base: 0.1 })
  const ringMat = useGlowMaterial(color2, { power: 1.0, intensity: 0.6, base: 0.7 })
  const shard = useGeometry(makeStreakGeometry)

  const spec = useMemo<ParticleSpec>(
    () => ({
      count: Math.round(70 * quality),
      size: 0.14,
      from: color2,
      mid: color,
      to: color,
      life: [0.35, 0.8],
      drag: 2,
      spawn: (o, origin) => {
        const th = Math.random() * Math.PI * 2
        const ph = Math.acos(2 * Math.random() - 1)
        const sp = (2 + Math.random() * 5) * (radius / 2)
        o.x = origin.x
        o.y = origin.y
        o.z = origin.z
        o.vx = Math.sin(ph) * Math.cos(th) * sp
        o.vy = Math.sin(ph) * Math.sin(th) * sp
        o.vz = Math.cos(ph) * sp
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
    shell.current?.scale.setScalar(0.2 + easeOutCubic(t) * radius * 0.55)
    shellMat.uniforms.uFade.value = Math.pow(1 - t, 1.5)
    ring.current?.scale.setScalar(0.2 + easeOutCubic(t) * radius)
    ringMat.uniforms.uFade.value = 1 - t
    flash.current?.scale.setScalar(radius * (1.4 - t) * 1.1)
    ;(flash.current?.material as THREE.SpriteMaterial).opacity = Math.pow(1 - t, 2)
  })

  return (
    <>
      <group ref={group} visible={false}>
        <mesh ref={shell} material={shellMat}>
          <sphereGeometry args={[1, 32, 20]} />
        </mesh>
        <mesh ref={ring} material={ringMat} rotation={[1.15, 0.3, 0]}>
          <torusGeometry args={[1, 0.05, 12, 64]} />
        </mesh>
        <sprite ref={flash}>
          <spriteMaterial map={getGlowTexture()} color={color2} transparent depthWrite={false} blending={THREE.AdditiveBlending} />
        </sprite>
      </group>
      {/* Burst is gated to the first instant of impact so each shard spawns once. */}
      <MeshParticleField
        spec={spec}
        geometry={shard}
        origin={ctx.pos}
        additive
        orient
        stretch={0.5}
        emit={() => (fx.phase === 'impact' && fx.phaseTime < 0.08 ? 1 : 0)}
      />
    </>
  )
}
