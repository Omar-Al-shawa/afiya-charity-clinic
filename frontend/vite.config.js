import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    // في التطوير تُمرَّر طلبات /api إلى خادم Express (المنفذ الافتراضي 3001) فتبقى الواجهة وAPI على الأصل نفسه
    proxy: {
      '/api': 'http://127.0.0.1:3001',
    },
  },
});
