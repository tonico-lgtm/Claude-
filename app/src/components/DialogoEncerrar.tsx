/**
 * Confirmação de encerramento da sessão. Clique no véu ou Escape cancelam.
 */

import { useEffect } from 'react';

export interface PropsDialogoEncerrar {
  readonly respondidas: number;
  readonly total: number;
  aoContinuar(): void;
  aoConfirmar(): void;
}

export function DialogoEncerrar(p: PropsDialogoEncerrar): JSX.Element {
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault();
        p.aoContinuar();
      }
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [p]);

  return (
    <div className="veu" onClick={p.aoContinuar}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="ss-dialogo-titulo"
        className="dialogo"
        onClick={(e) => e.stopPropagation()}
      >
        <div id="ss-dialogo-titulo" className="dialogo__titulo">
          Encerrar a sessão agora?
        </div>
        <p className="dialogo__texto">
          {p.respondidas} de {p.total} perguntas foram respondidas. A transcrição é gravada até este
          ponto, em texto simples, na pasta escolhida.
        </p>
        <div className="dialogo__acoes">
          <button type="button" className="botao ss-dialogo__botao" onClick={p.aoContinuar} autoFocus>
            Continuar
          </button>
          <button type="button" className="botao botao--ambar ss-dialogo__botao" onClick={p.aoConfirmar}>
            Encerrar e gravar
          </button>
        </div>
      </div>
    </div>
  );
}
