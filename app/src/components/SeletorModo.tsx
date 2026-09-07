/**
 * Modo da entrevista — voz ou escrita, dois rádios lado a lado.
 *
 * Livre escolha do cliente; o modo escrita é recurso de primeira classe, não
 * fallback, e a troca continua possível durante a sessão.
 */

import type { Modo } from '../shared/tipos';
import { IconeLapis, IconeMicrofone } from './Icones';

export interface PropsSeletorModo {
  readonly modo: Modo;
  aoMudar(modo: Modo): void;
}

export function SeletorModo(props: PropsSeletorModo): JSX.Element {
  const { modo, aoMudar } = props;
  return (
    <div className="st-secao">
      <div className="rotulo">Modo da entrevista</div>
      <div role="radiogroup" aria-label="Modo da entrevista" className="st-modos">
        <button
          type="button"
          role="radio"
          aria-checked={modo === 'voz'}
          className={`st-modo${modo === 'voz' ? ' st-modo--ativo' : ''}`}
          onClick={() => aoMudar('voz')}
        >
          <span className="st-modo__nome">
            <IconeMicrofone tamanho={13} />
            Voz
          </span>
          <span className="st-modo__desc">Grok lê e transcreve · 3 sessões de ~25 min</span>
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={modo === 'escrita'}
          className={`st-modo${modo === 'escrita' ? ' st-modo--ativo' : ''}`}
          onClick={() => aoMudar('escrita')}
        >
          <span className="st-modo__nome">
            <IconeLapis tamanho={13} />
            Escrita
          </span>
          <span className="st-modo__desc">Você digita as respostas · no seu ritmo</span>
        </button>
      </div>
      <div className="st-nota">
        Livre escolha do cliente — e é possível alternar entre voz e escrita a qualquer momento da sessão.
      </div>
    </div>
  );
}
