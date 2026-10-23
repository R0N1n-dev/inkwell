import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  build: {
    // Capacitor serves everything from the local filesystem (capacitor://localhost)
    target: 'es2022',
    chunkSizeWarningLimit: 2500,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/rxdb') || id.includes('node_modules/dexie')) return 'rxdb';
          if (id.includes('node_modules/primevue') || id.includes('node_modules/@primeuix') || id.includes('node_modules/quill')) return 'primevue';
          if (id.includes('node_modules/vue') || id.includes('node_modules/rxjs')) return 'vendor';
          return undefined;
        }
      }
    }
  },
  server: {
    port: 5173,
    host: true
  }
});
