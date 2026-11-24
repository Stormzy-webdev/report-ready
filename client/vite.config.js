import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    // In development the API runs separately; proxy /api so no CORS setup is needed.
    proxy: { '/api': 'http://localhost:4000' },
    // Lets "Share ReportReady.bat" give someone a temporary link through a
    // Cloudflare quick tunnel. Other unknown host names are still refused.
    allowedHosts: ['.trycloudflare.com'],
  },
});
