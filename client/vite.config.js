import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    // In development the API runs separately; proxy /api so no CORS setup is needed.
    proxy: { '/api': 'http://localhost:4000' },
  },
});
