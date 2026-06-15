import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    include: ['html2canvas', 'jspdf'],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          if (/react|react-dom|react-router-dom/.test(id)) return 'vendor-react';
          if (/jspdf|html2canvas/.test(id)) return 'vendor-pdf';
          if (/lucide-react/.test(id)) return 'vendor-ui';
          if (/axios/.test(id)) return 'vendor-http';
        },
      },
    },
  },
})
