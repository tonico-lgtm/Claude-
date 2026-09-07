/**
 * Reprodutor — toca os bytes de áudio que a plataforma devolve.
 *
 * `Blob` → `URL.createObjectURL` → `HTMLAudioElement`. A CSP do renderer
 * permite `media-src blob:` justamente para isto. A URL é revogada no fim,
 * seja por término, por erro ou por `parar()`.
 */

import type { ErroApp } from '../shared/tipos';

export interface Reproducao {
  /** Resolve quando o áudio termina ou é parado; rejeita com `ErroApp` se não tocar. */
  readonly fim: Promise<void>;
  parar(): void;
}

export function tocar(audio: ArrayBuffer, mime: string): Reproducao {
  const url = URL.createObjectURL(new Blob([audio], { type: mime }));
  const elemento = new Audio(url);
  elemento.preload = 'auto';

  let encerrada = false;
  let resolver: () => void = () => undefined;
  let rejeitar: (erro: ErroApp) => void = () => undefined;
  const fim = new Promise<void>((res, rej) => {
    resolver = res;
    rejeitar = rej;
  });

  const encerrar = (falha: ErroApp | null): void => {
    if (encerrada) return;
    encerrada = true;
    elemento.onended = null;
    elemento.onerror = null;
    URL.revokeObjectURL(url);
    if (falha) rejeitar(falha);
    else resolver();
  };

  elemento.onended = () => encerrar(null);
  elemento.onerror = () =>
    encerrar({ codigo: 'desconhecido', mensagem: 'Não foi possível tocar o áudio.', detalhe: mime });

  elemento.play().catch((e: unknown) => {
    encerrar({
      codigo: 'desconhecido',
      mensagem: 'O navegador não deixou tocar o áudio.',
      ...(e instanceof Error ? { detalhe: e.message } : {}),
    });
  });

  return {
    fim,
    parar: () => {
      elemento.pause();
      encerrar(null);
    },
  };
}
