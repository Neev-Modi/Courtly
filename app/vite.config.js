import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, root, '');
  return {
    plugins: [react()],
    envDir: root,
    server: {
      port: 5173,
      strictPort: true,
      proxy: { '/api': env.API_ORIGIN || `http://localhost:${env.PORT || 8080}` },
    },
  };
});
