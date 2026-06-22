import { useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'

export default function ProductBox({ item, position }) {
  const meshRef = useRef()
  const [hovered, setHovered] = useState(false)
  const [selected, setSelected] = useState(false)

  // Cargar la imagen subida como textura
  const texture = item.logoUrl ? new URL(item.logoUrl, window.location.origin).href : null

  useFrame((state, delta) => {
    if (hovered) {
      meshRef.current.rotation.y += delta * 0.5
    }
  })

  const daysUntilExpiry = Math.ceil(
    (new Date(item.expirationDate) - new Date()) / (1000 * 60 * 60 * 24)
  )

  const getStatusColor = () => {
    if (daysUntilExpiry < 0) return '#ff4444'
    if (daysUntilExpiry < 30) return '#ffaa00'
    return '#44ff44'
  }

  return (
    <group position={position}>
      <mesh
        ref={meshRef}
        onPointerOver={() => setHovered(true)}
        onPointerOut={() => setHovered(false)}
        onClick={() => setSelected(!selected)}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[0.8, 0.8, 0.8]} />
        <meshStandardMaterial
          color={hovered ? '#ffffff' : '#f0f0f0'}
          map={texture ? new THREE.TextureLoader().load(texture) : null}
        />
      </mesh>

      {/* Indicador de estado (vencimiento) */}
      <mesh position={[0, 0.5, 0]}>
        <sphereGeometry args={[0.1, 16, 16]} />
        <meshStandardMaterial color={getStatusColor()} emissive={getStatusColor()} />
      </mesh>

      {/* Panel de info al hacer click */}
      {selected && (
        <Html position={[0, 1, 0]} center>
          <div className="product-info-panel">
            <h3>{item.name}</h3>
            <p><strong>SKU:</strong> {item.sku}</p>
            <p><strong>Cantidad:</strong> {item.quantity}</p>
            <p><strong>Agregado:</strong> {new Date(item.dateAdded).toLocaleDateString()}</p>
            <p><strong>Vence:</strong> {new Date(item.expirationDate).toLocaleDateString()}</p>
            <p style={{ color: getStatusColor() }}>
              <strong>Estado:</strong> {daysUntilExpiry < 0 ? 'Vencido' : daysUntilExpiry < 30 ? 'Por vencer' : 'OK'}
            </p>
          </div>
        </Html>
      )}
    </group>
  )
}