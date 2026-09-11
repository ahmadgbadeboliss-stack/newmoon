import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The Midnight SDK ships WASM and reaches for Node globals that a browser
// bundle does not provide. `global -> globalThis` and an explicit `Buffer`
// shim keep the ledger/compact-runtime packages working in the browser.
export default defineConfig({
  plugins: [react()],
  define: {
    global: 'globalThis',
  },
  optimizeDeps: {
    // WASM-backed packages must not be pre-bundled into a single chunk.
    exclude: ['@midnight-ntwrk/ledger-v8', '@midnight-ntwrk/compact-runtime'],
  },
  build: {
    target: 'esnext', // top-level await, used by the WASM loaders
    outDir: 'dist',
    sourcemap: true,
  },
  server: {
    port: 5173,
  },
});
