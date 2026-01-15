import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { crx } from '@crxjs/vite-plugin';
import manifest from './src/manifest.json';
import path from 'path';

export default defineConfig({
  plugins: [
    react(),
    crx({ manifest }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      input: {
        // Include offscreen document as an entry point
        // crxjs doesn't auto-detect it since it's not in a standard manifest field
        offscreen: path.resolve(__dirname, 'src/offscreen/index.html'),
      },
    },
  },
});
