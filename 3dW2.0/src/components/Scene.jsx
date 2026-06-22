import { Canvas } from '@react-three/fiber'
import { OrbitControls, Environment, ContactShadows } from '@react-three/drei'
import Shelf3D from './Shelf3D'
import { useInventoryStore } from '../store'

export default function Scene() {
  const items = useInventoryStore(state => state.items)
  const itemsPerShelf = useInventoryStore(state => state.itemsPerShelf)

  // Calcular estantes dinámicamente
  const shelves = []
  for (let i = 0; i < items.length; i += itemsPerShelf) {
    shelves.push(items.slice(i, i + itemsPerShelf))
  }

  return (
    <Canvas
      shadows
      camera={{ position: [8, 8, 8], fov: 50 }}
      style={{ height: '100vh', width: '100%' }}
    >
      <ambientLight intensity={0.5} />
      <directionalLight
        position={[10, 10, 5]}
        intensity={1}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
      />

      {shelves.map((shelfItems, index) => (
        <Shelf3D
          key={index}
          items={shelfItems}
          shelfIndex={index}
        />
      ))}

      <ContactShadows
        position={[0, -0.5, 0]}
        opacity={0.4}
        scale={20}
        blur={2}
      />

      <Environment preset="city" />

      <OrbitControls
        enablePan={true}
        enableZoom={true}
        enableRotate={true}
        minDistance={5}
        maxDistance={20}
      />
    </Canvas>
  )
}