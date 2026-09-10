import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { catalogApiPlugin } from './src/cli/vite-plugin-catalog.ts'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), catalogApiPlugin()],
  server: {
    port: 5173,
  },
})
