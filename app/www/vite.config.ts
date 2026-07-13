import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ['@powersync/web']
  },
  worker: {
    format: 'es'
  }
});
