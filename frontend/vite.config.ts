import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Env was consolidated into the repo-root .env on 2026-05-05.
  // Only VITE_-prefixed vars are exposed to the client bundle.
  envDir: path.resolve(__dirname, '..'),
  build: {
    outDir: 'dist',
    minify: 'esbuild',
    rollupOptions: {
      output: {
        // Targeted manualChunks — keeps heavy dashboard-only dependencies
        // out of the marketing-page critical path. Tested against bundle
        // analyzer to ensure no single chunk exceeds ~500 KB gzipped.
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          // Monaco editor is huge (~2 MB) and only used on Settings.
          if (id.includes('@monaco-editor') || id.includes('monaco-editor')) {
            return 'monaco';
          }
          // Recharts pulls in d3 + lodash; only the dashboard analytics
          // pages need it.
          if (id.includes('recharts') || id.includes('d3-')) {
            return 'charts';
          }
          // Framer-motion is used across the app; keep it grouped so
          // route chunks don't each re-import it.
          if (id.includes('framer-motion')) {
            return 'motion';
          }
          // country-state-city has a ~1 MB JSON dataset; only the
          // discovery target / profile pages reach for it.
          if (id.includes('country-state-city')) {
            return 'csc';
          }
          // Capacitor is mobile-only; keep it isolated so web users
          // don't pay for it.
          if (id.includes('@capacitor')) {
            return 'capacitor';
          }
          // React core + ReactDOM + react-router stay in a small core
          // vendor so the first paint cost stays low.
          if (
            id.includes('react/') ||
            id.includes('react-dom') ||
            id.includes('react-router') ||
            id.includes('scheduler/') ||
            id.includes('@tanstack/react-query')
          ) {
            return 'vendor-core';
          }
          return 'vendor';
        },
      },
    },
    chunkSizeWarningLimit: 1000,
    manifest: true,
  },
})
