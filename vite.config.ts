import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  // Rutas relativas: funciona en GitHub Pages (usuario.github.io/repositorio/)
  base: './',
  plugins: [react(), tailwindcss()],
  server: { port: 5180 },
})
