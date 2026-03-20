import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

const BACKEND_PORT = process.env.BACKEND_PORT || 3104;

export default defineConfig({
  plugins: [svelte(), tailwindcss()],
  base: '/nats-dashboard/',
  resolve: {
    alias: {
      $lib: path.resolve('./src/lib'),
    },
  },
  server: {
    proxy: {
      '/nats-dashboard/api': {
        target: `http://localhost:${BACKEND_PORT}`,
        rewrite: (path) => path.replace('/nats-dashboard/api', '/api'),
        changeOrigin: true,
        headers: { Authorization: 'Bearer dev-nats-plugin-key' },
      },
    },
  },
  build: {
    outDir: 'dist',
    emptyDirFirst: true,
  },
});
