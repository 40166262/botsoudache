import { defineConfig } from 'vite';
import { resolve } from 'path';
export default defineConfig({
  base: './',
  build: {
    target: 'es2019',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        sdktest: resolve(__dirname, 'sdk-test.html'),
      },
    },
  },
});
