import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [react()],
  resolve: {
    // Linked SDK and Anchor packages must share one PublicKey constructor in
    // both development and production bundles.
    dedupe: ['@solana/web3.js'],
    alias: {
      '@anchor-lang/core': fileURLToPath(new URL('./src/wallet/anchor-core-shim.ts', import.meta.url)),
      '@dividendx/sdk': fileURLToPath(new URL('../../packages/sdk/src/index.ts', import.meta.url)),
      '@fixtures': fileURLToPath(new URL('../../packages/demo-fixtures', import.meta.url)),
      '@tokens': fileURLToPath(new URL('../../packages/design-tokens', import.meta.url)),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        product: fileURLToPath(new URL('./index.html', import.meta.url)),
        rehearsal: fileURLToPath(new URL('./rehearsal/index.html', import.meta.url)),
        wallet: fileURLToPath(new URL('./app/index.html', import.meta.url)),
        demos: fileURLToPath(new URL('./demos/index.html', import.meta.url)),
      },
    },
  },
  server: { port: 4174, strictPort: true },
  preview: { port: 4174, strictPort: true },
});
