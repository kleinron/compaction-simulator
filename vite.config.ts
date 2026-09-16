import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// Project GitHub Pages site: https://kleinron.github.io/compaction-simulator/
export default defineConfig({
  base: '/compaction-simulator/',
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
