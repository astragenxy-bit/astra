// vite.config.js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    host: '0.0.0.0',
    proxy: {
      '/api': {
        target:    process.env.VITE_API_URL || 'http://backend:4000',
        changeOrigin: true,
      },
      '/webhooks': {
        target:    process.env.VITE_API_URL || 'http://backend:4000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir:        'dist',
    sourcemap:     false,
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'query':        ['@tanstack/react-query'],
        },
      },
    },
  },
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development'),
  },
});
