import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['brand/apple-touch-icon.png', 'brand/favicon-64.png', 'brand/logo-256.png'],
      manifest: {
        name: 'FutebolB3 — Gestão de Baba',
        short_name: 'FutebolB3',
        description: 'Plataforma de gerenciamento de baba e ligas de futebol amador',
        theme_color: '#000000',
        background_color: '#000000',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: '/brand/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/brand/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
    host: true,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          firebase: ['firebase/app', 'firebase/auth', 'firebase/firestore', 'firebase/storage'],
          icons: ['lucide-react'],
        },
      },
    },
  },
});
