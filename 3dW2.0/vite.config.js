import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Reemplazá 'inventory-3d' con el nombre de tu repo de GitHub
export default defineConfig({
  plugins: [react()],
  base: '/warehouse/',
})