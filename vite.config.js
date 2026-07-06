import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'dashboard.html'),
        login: resolve(__dirname, 'index.html')
      }
    }
  }
});
