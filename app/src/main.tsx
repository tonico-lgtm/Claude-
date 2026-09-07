/**
 * Raiz React. O CSS global entra antes de tudo para que os tokens e as
 * fontes empacotadas existam quando o `App` (e o CSS de cada tela) montar.
 */

import './styles/global.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';

const raiz = document.getElementById('root');
// O `index.html` sempre traz `#root`; sem ele não há onde renderizar.
if (!raiz) throw new Error('Elemento #root não encontrado em index.html.');

createRoot(raiz).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
