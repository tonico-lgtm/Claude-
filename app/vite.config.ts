import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// O renderer é servido de `file://` dentro do Electron, então os assets precisam
// de caminhos relativos — daí `base: './'`.
export default defineConfig({
  base: './',
  plugins: [react()],
  build: { outDir: 'dist/renderer', emptyOutDir: true },
  server: { port: 5273, strictPort: true },
});
