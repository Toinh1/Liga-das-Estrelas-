import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { babaSqliteApiPlugin } from './server/sqliteApiPlugin';

export default defineConfig({
  plugins: [react(), tailwindcss(), babaSqliteApiPlugin()],
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
