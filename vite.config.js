import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'dashboard.html'),
        staff: resolve(__dirname, 'staff_dashboard.html'),
        login: resolve(__dirname, 'index.html'),
        reset_password: resolve(__dirname, 'reset-password.html')
      }
    }
  }
});
