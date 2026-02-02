import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  
  // Tauri expects a fixed port
  server: {
    port: 1420,
    strictPort: true,
  },
  
  // Prevent vite from obscuring Rust errors
  clearScreen: false,
  
  // Environment variables
  envPrefix: ['VITE_', 'TAURI_'],
  
  build: {
    target: ['es2021', 'chrome100', 'safari13'],
    minify: !process.env.TAURI_DEBUG ? 'esbuild' : false,
    sourcemap: !!process.env.TAURI_DEBUG,
  },
})
