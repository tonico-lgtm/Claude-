import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Em `npm run dev` o renderer roda no navegador, fora do Electron, e o Vite
 * precisa de um WebSocket para o HMR. A CSP de produção (`connect-src 'none'`,
 * em `index.html`) continua intacta: este plugin só afrouxa o `connect-src`
 * enquanto o servidor de desenvolvimento está de pé.
 */
function cspDeDesenvolvimento(): Plugin {
  return {
    name: 'csp-de-desenvolvimento',
    apply: 'serve',
    transformIndexHtml(html) {
      // Só dentro do atributo `content` da meta: o comentário do index.html
      // também contém o texto e a primeira ocorrência era a errada.
      return html.replace(
        /(http-equiv="Content-Security-Policy"[^>]*content="[^"]*?)connect-src 'none'/,
        "$1connect-src 'self' ws://localhost:5273 http://localhost:5273",
      );
    },
  };
}

// O renderer é servido de `file://` dentro do Electron, então os assets precisam
// de caminhos relativos — daí `base: './'`.
export default defineConfig({
  base: './',
  plugins: [react(), cspDeDesenvolvimento()],
  build: { outDir: 'dist/renderer', emptyOutDir: true },
  server: { port: 5273, strictPort: true },
});
