import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// CRM-PLAN A4. В разработке /api проксируется на локальный сервер
// (server/src/config: PORT по умолчанию 3000). В продакшене CRM и /api
// на одном домене crm.chitatel.app (nginx, deploy/nginx/crm.chitatel.app.conf),
// поэтому VITE_API_URL обычно не нужен.
const API_TARGET = process.env.CRM_API_TARGET || 'http://localhost:3000';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: API_TARGET, changeOrigin: true },
    },
  },
});
