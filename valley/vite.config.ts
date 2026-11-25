import { defineConfig } from 'vitest/config';
import { glslSlim } from './tools/vite-plugin-glsl-slim';

export default defineConfig({
  base: './',
  plugins: [glslSlim()],
  server: {
    port: 5173,
    watch: { ignored: ['**/trailer/**', '**/dist/**', '**/docs/**'] },
  },
  build: {
    target: 'es2022',
    sourcemap: true,
    chunkSizeWarningLimit: 1200,
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
