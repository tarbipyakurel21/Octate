import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';

const apiProxy = {
  '/api': {
    target: process.env.API_SERVER_URL ?? 'http://localhost:8080',
    changeOrigin: true,
  },
};

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 3000,
    proxy: apiProxy,
  },
  preview: {
    host: '0.0.0.0',
    port: 3000,
    proxy: apiProxy,
  },
});
