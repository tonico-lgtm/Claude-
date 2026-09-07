/**
 * Escolhe a implementação da plataforma: Electron quando o preload expôs a
 * ponte em `window`, senão o navegador (`npm run dev`).
 */

import { NOME_PONTE } from '../shared/tipos';
import { plataformaElectron } from './electron';
import { plataformaNavegador } from './navegador';
import type { Plataforma } from './plataforma';

export type { Plataforma } from './plataforma';

export const plataforma: Plataforma = window[NOME_PONTE] ? plataformaElectron() : plataformaNavegador();
