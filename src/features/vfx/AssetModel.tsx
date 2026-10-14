import { useEffect, useState } from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { ASSET_BY_ID, probeAsset } from '../../config/assets'

function disposeObject(root: THREE.Object3D) {
  root.traverse((o) => {
    const m = o as THREE.Mesh
    if (!m.isMesh) return
    m.geometry.dispose()
    ;(Array.isArray(m.material) ? m.material : [m.material]).forEach((mat) => mat.dispose())
  })
}

/** Procedural stand-in used whenever the real kunai GLB is missing or invalid. */
function ProceduralKunai() {
  return (
    <group>
      <mesh position={[0, 0.25, 0]}>
        <coneGeometry args={[0.09, 0.55, 4]} />
        <meshStandardMaterial color="#9fb3c8" metalness={0.9} roughness={0.25} />
      </mesh>
      <mesh position={[0, -0.12, 0]}>
        <cylinderGeometry args={[0.035, 0.035, 0.3, 10]} />
        <meshStandardMaterial color="#1f2937" roughness={0.8} />
      </mesh>
      <mesh position={[0, -0.32, 0]}>
        <torusGeometry args={[0.07, 0.015, 8, 20]} />
        <meshStandardMaterial color="#9fb3c8" metalness={0.9} roughness={0.3} />
      </mesh>
    </group>
  )
}

/**
 * Loads a manifest asset, validating it first. Renders `fallback` (procedural by default) while
 * loading and on any failure; failures are logged once to the console, never thrown.
 */
export function AssetModel({ id, fallback = <ProceduralKunai /> }: { id: string; fallback?: React.ReactNode }) {
  const [scene, setScene] = useState<THREE.Object3D | null>(null)

  useEffect(() => {
    const entry = ASSET_BY_ID[id]
    if (!entry) {
      console.warn(`[assets] "${id}" is not in the manifest`)
      return
    }
    let cancelled = false
    let loaded: THREE.Object3D | null = null
    void probeAsset(entry, import.meta.env.BASE_URL).then((res) => {
      if (cancelled) return
      if (!res.ok) {
        console.info(`[assets] "${id}" unavailable (${res.reason}); using procedural fallback`)
        return
      }
      new GLTFLoader().parse(
        res.data,
        '',
        (gltf) => {
          if (cancelled) return disposeObject(gltf.scene)
          loaded = gltf.scene
          setScene(gltf.scene)
        },
        (err) => console.warn(`[assets] "${id}" failed to parse`, err),
      )
    })
    return () => {
      cancelled = true
      if (loaded) disposeObject(loaded)
    }
  }, [id])

  return scene ? <primitive object={scene} /> : <>{fallback}</>
}
