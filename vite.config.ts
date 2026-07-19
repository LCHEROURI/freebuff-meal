import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

/**
 * Per-library vendor splitting.
 *
 * Group node_modules into one chunk per major dependency family so that the
 * browser can download the chunks in parallel and cache each one
 * independently. Anything that doesn't belong to a named family falls into
 * a small `vendor` catch-all.
 *
 * The chunk names below intentionally include transitive helpers so they
 * ship alongside the library that owns them (e.g. `scheduler` never lands
 * outside the react chunk).
 */
const libraryChunk = (id: string): string | undefined => {
  if (!id.includes('node_modules')) return undefined;
  // Firebase modular SDK + admin (server contexts) + sub-packages.
  if (
    id.includes('/node_modules/firebase/') ||
    id.includes('/node_modules/@firebase/')
  )
    return 'firebase';
  // React core + scheduler + react-is (used by react-router & react-hook-form).
  if (
    id.includes('/node_modules/react/') ||
    id.includes('/node_modules/react-dom/') ||
    id.includes('/node_modules/react-is/') ||
    id.includes('/node_modules/scheduler/')
  )
    return 'react';
  // Router + history + remix helpers. `@babel/runtime/*` deliberately lands
  // in the catch-all `vendor` chunk because every Babel-compiled ESM
  // library (router, react-hook-form, zod, …) uses those helpers —
  // letting them co-locate in `vendor` keeps the per-library chunks clean.
  if (
    id.includes('/node_modules/react-router/') ||
    id.includes('/node_modules/react-router-dom/') ||
    id.includes('/node_modules/@remix-run/') ||
    id.includes('/node_modules/history/')
  )
    return 'router';
  // TanStack Query + any of its sub-packages.
  if (id.includes('/node_modules/@tanstack/')) return 'tanstack';
  // Forms: react-hook-form + @hookform resolvers + zod (they're used together
  // so co-locating them in one chunk avoids a second HTTP round-trip).
  if (
    id.includes('/node_modules/react-hook-form/') ||
    id.includes('/node_modules/@hookform/') ||
    id.includes('/node_modules/zod/')
  )
    return 'forms';
  // Lucide icon set tree-shakes per import, so the chunk is just the small
  // shim + the icons actually referenced from the app.
  if (id.includes('/node_modules/lucide-react/')) return 'icons';
  // Catch-all for anything else (`clsx`, dayjs maybe, etc.).
  return 'vendor';
};

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    host: '127.0.0.1',
  },
  build: {
    sourcemap: true,
    target: 'es2022',
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks: libraryChunk,
      },
    },
  },
});
