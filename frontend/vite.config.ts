import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// Dev: run the PHP API with `php -S localhost:8080 -t backend backend/index.php`
// (config.php: base_path '') and the proxy below strips the /api prefix.
// Base path: dev serves at '/'; production builds read VITE_BASE from .env.production
// (e.g. '/irdevice/' when the app is hosted in a subfolder). The API is expected at <base>api.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    base: env.VITE_BASE || '/',
    plugins: [react()],
    server: {
      proxy: {
        '/api': {
          target: 'http://localhost:8080',
          rewrite: (p) => p.replace(/^\/api/, ''),
        },
      },
    },
  };
});
