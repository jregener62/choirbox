import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

const apiPort = process.env.VITE_API_PORT || '8001'
const apiTarget = `http://127.0.0.1:${apiPort}`

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5174,
    proxy: {
      '/api': {
        target: apiTarget,
        changeOrigin: true,
      },
      '/impressum': {
        target: apiTarget,
        changeOrigin: true,
      },
      '/datenschutz': {
        target: apiTarget,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: '../static/react',
    emptyOutDir: true,
    sourcemap: false,
  },
})
