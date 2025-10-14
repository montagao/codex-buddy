import { defineConfig } from 'vite';
import { chromeExtension } from 'vite-plugin-chrome-extension';

export default defineConfig({
  plugins: [
    chromeExtension({
      manifest: './manifest.json',
    }),
  ],
  build: {
    rollupOptions: {
      input: {
        manifest: 'manifest.json',
      },
    },
    outDir: 'dist',
    sourcemap: process.env.NODE_ENV === 'development',
  },
});
