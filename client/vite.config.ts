import * as vite from 'vite';
import react from '@vitejs/plugin-react';

export default vite.defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true
      }
    }
  },
  build: {
    rollupOptions: {
      input: {
        main: './src/app/main.tsx',
      },
    },
  },
});
