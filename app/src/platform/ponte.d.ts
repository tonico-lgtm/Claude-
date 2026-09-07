/**
 * Declaração global do objeto que o preload expõe em `window`.
 *
 * O nome da propriedade tem de ser o literal de `NOME_PONTE`
 * (`shared/tipos.ts`); `platform/index.ts` confere isso em tempo de
 * compilação ao indexar `window[NOME_PONTE]`. Ausente fora do Electron.
 */

import type { Plataforma } from './plataforma';

declare global {
  interface Window {
    readonly entrevistaTwin?: Plataforma;
  }
}

export {};
