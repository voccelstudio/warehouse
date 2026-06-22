import { useState } from 'react'
import { useInventoryStore } from '../store'

export default function InventoryForm() {
  const addItem = useInventoryStore(state => state.addItem)
  const [formData, setFormData] = useState({
    name: '',
    sku: '',
    quantity: 1,
    expirationDate: '',
    logoUrl: null
  })

  const handleImageUpload = (e) => {
    const file = e.target.files[0]
    if (file) {
      const reader = new FileReader()
      reader.onloadend = () => {
        setFormData({ ...formData, logoUrl: reader.result })
      }
      reader.readAsDataURL(file)
    }
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    addItem(formData)
    setFormData({
      name: '',
      sku: '',
      quantity: 1,
      expirationDate: '',
      logoUrl: null
    })
  }

  return (
    <div className="inventory-form">
      <h2>Agregar Producto</h2>
      <form onSubmit={handleSubmit}>
        <input
          type="text"
          placeholder="Nombre del producto"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          required
        />
        <input
          type="text"
          placeholder="SKU"
          value={formData.sku}
          onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
          required
        />
        <input
          type="number"
          placeholder="Cantidad"
          value={formData.quantity}
          onChange={(e) => setFormData({ ...formData, quantity: parseInt(e.target.value) })}
          min="1"
          required
        />
        <input
          type="date"
          value={formData.expirationDate}
          onChange={(e) => setFormData({ ...formData, expirationDate: e.target.value })}
          required
        />
        <div className="file-upload">
          <label htmlFor="logo-upload">
            {formData.logoUrl ? '✓ Logo cargado' : '📷 Subir logo del producto'}
          </label>
          <input
            id="logo-upload"
            type="file"
            accept="image/*"
            onChange={handleImageUpload}
          />
        </div>
        {formData.logoUrl && (
          <img src={formData.logoUrl} alt="Preview" className="logo-preview" />
        )}
        <button type="submit">Agregar al Inventario</button>
      </form>
    </div>
  )
}