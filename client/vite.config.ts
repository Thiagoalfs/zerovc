import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { execSync } from 'child_process';

let commitHash = 'main';
try {
  commitHash = execSync('git rev-parse HEAD').toString().trim();
} catch {
  commitHash = 'main';
}

export default defineConfig({
  plugins: [react()],
  base: './',
  define: {
    __BUILD_COMMIT__: JSON.stringify(commitHash),
    __BUILD_DATE__: JSON.stringify(new Date().toISOString()),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
