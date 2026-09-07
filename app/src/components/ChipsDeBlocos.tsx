/**
 * Chips dos blocos da sessão atual: concluído (com check), atual (borda
 * âmbar) e pendente. Só blocos já iniciados são navegáveis; em pausa a
 * navegação fica desabilitada porque o motor a ignora.
 */

import type { chipsDeBlocos } from '../engine/sessao';
import { IconeCheque } from './Icones';

export interface PropsChipsDeBlocos {
  readonly chips: ReturnType<typeof chipsDeBlocos>;
  readonly pausada: boolean;
  aoIr(blocoId: string): void;
}

const TITULO_NAO_INICIADO = 'Este bloco ainda não começou';

export function ChipsDeBlocos({ chips, pausada, aoIr }: PropsChipsDeBlocos): JSX.Element {
  return (
    <div className="ss-blocos">
      <div className="ss-blocos__rotulo">Blocos</div>
      <div className="ss-blocos__lista">
        {chips.map(({ bloco, estado, navegavel }) => (
          <button
            key={bloco.id}
            type="button"
            className={`ss-chip ss-chip--${estado}`}
            disabled={!navegavel || pausada}
            title={navegavel ? `Ir para o bloco ${bloco.numero}` : TITULO_NAO_INICIADO}
            onClick={() => aoIr(bloco.id)}
          >
            {estado === 'concluido' && <IconeCheque tamanho={10} espessura={2.5} />}
            <span className="tabular">{bloco.numero}</span>
            <span>{bloco.nome}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
