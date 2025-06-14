import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  root: './src/renderer',
  build: {
    target: 'es2020',
    outDir: '../../dist/renderer',
    emptyOutDir: true,
  },
  publicDir: '../../public',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src/renderer'),
      '@shared': path.resolve(__dirname, './src/shared'),
    },
  },
  server: {
    port: 5173,
  },
  define: {
    // Electron環境判定用
    __ELECTRON__: JSON.stringify(process.env.NODE_ENV === 'development' && process.env.ELECTRON === 'true')
  }
})
