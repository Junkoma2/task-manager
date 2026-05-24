import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages: https://junkoma2.github.io/task-manager/
// Source: main branch /docs
export default defineConfig({
  plugins: [react()],
  base: '/task-manager/',
  build: {
    outDir: 'docs',
    emptyOutDir: false,
  },
})
