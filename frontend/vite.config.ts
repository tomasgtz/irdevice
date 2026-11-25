import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dev: run the PHP API with `php -S localhost:8080 -t backend backend/index.php`
// (config.php: base_path '') and the proxy below strips the /api prefix.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        rewrite: (p) => p.replace(/^\/api/, ''),
      },
    },
  },
});
