import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom', 'axios'],
        },
      },
    },
  },
  server: {
    port: 3000,
    host: true,
    proxy: {
      '/api': process.env.VITE_API_URL || 'http://127.0.0.1:8000',
      '/ws': { 
        target: process.env.VITE_WS_URL || 'ws://127.0.0.1:8000', 
        ws: true 
      },
      '/media': process.env.VITE_API_URL || 'http://127.0.0.1:8000',
    }
  }
})