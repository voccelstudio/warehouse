import ProductBox from './ProductBox'

export default function Shelf3D({ items, shelfIndex }) {
  const shelfWidth = 6
  const itemsPerRow = 3
  const spacing = 1

  return (
    <group position={[0, shelfIndex * 1.5, 0]}>
      {/* Estante físico */}
      <mesh position={[0, -0.5, 0]} receiveShadow>
        <boxGeometry args={[shelfWidth, 0.1, 1.5]} />
        <meshStandardMaterial color="#8B4513" />
      </mesh>

      {/* Soportes laterales */}
      <mesh position={[-shelfWidth/2, 0, 0]} castShadow>
        <boxGeometry args={[0.1, 1.5, 1.5]} />
        <meshStandardMaterial color="#654321" />
      </mesh>
      <mesh position={[shelfWidth/2, 0, 0]} castShadow>
        <boxGeometry args={[0.1, 1.5, 1.5]} />
        <meshStandardMaterial color="#654321" />
      </mesh>

      {/* Productos en el estante */}
      {items.map((item, index) => {
        const row = Math.floor(index / itemsPerRow)
        const col = index % itemsPerRow
        const x = (col - (itemsPerRow - 1) / 2) * spacing
        const z = (row - 0.5) * spacing

        return (
          <ProductBox
            key={item.id}
            item={item}
            position={[x, 0, z]}
          />
        )
      })}
    </group>
  )
}