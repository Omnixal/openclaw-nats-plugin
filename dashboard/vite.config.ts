import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

export default defineConfig({
  plugins: [svelte(), tailwindcss()],
  base: '/nats-dashboard/',
  resolve: {
    alias: {
      $lib: path.resolve('./src/lib'),
    },
  },
  build: {
    outDir: 'dist',
    emptyDirFirst: true,
  },
});
