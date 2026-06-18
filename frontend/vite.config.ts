import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ['html2canvas', 'jspdf', 'jspdf-autotable'],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          if (/react|react-dom|react-router-dom/.test(id)) return 'vendor-react';
          // jspdf y html2canvas se cargan solo via dynamic import → sin chunk manual
          if (/lucide-react/.test(id)) return 'vendor-ui';
          if (/axios/.test(id)) return 'vendor-http';
        },
      },
    },
  },
})
