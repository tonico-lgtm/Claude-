/**
 * Coluna lateral: a transcrição rolando, com carimbo de tempo e distinção
 * entre entrevistadora e cliente. Rola até o fim sempre que entra uma fala
 * ou a fase muda (a linha "transcrevendo…" aparece e some).
 */

import { useEffect, useRef } from 'react';

import type { Fase } from '../engine/sessao';
import { formatarCarimbo } from '../shared/tipos';
import type { LinhaTranscricao } from '../shared/tipos';

export interface PropsTranscricao {
  readonly linhas: readonly LinhaTranscricao[];
  readonly fase: Fase;
  /** Segundos decorridos — carimbo da linha "transcrevendo…". */
  readonly segundos: number;
}

function rotuloDeQuem(linha: LinhaTranscricao): string {
  if (linha.quem === 'cliente') return linha.origem === 'escrita' ? 'Cliente · digitado' : 'Cliente';
  return linha.origem === 'aprofundamento' ? 'Entrevistadora · aprofundamento' : 'Entrevistadora';
}

export function Transcricao({ linhas, fase, segundos }: PropsTranscricao): JSX.Element {
  const lista = useRef<HTMLDivElement>(null);
  const capturando = fase === 'ouvindo' || fase === 'transcrevendo';

  useEffect(() => {
    const el = lista.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [linhas.length, fase]);

  return (
    <>
      <div className="ss-transcricao__cabecalho">
        <span>Transcrição</span>
        <span className="ss-transcricao__contagem">{linhas.length} falas</span>
      </div>
      <div className="ss-transcricao__lista" ref={lista}>
        {linhas.map((linha) => {
          const entrevistadora = linha.quem === 'entrevistadora';
          return (
            <div key={linha.id} className="ss-fala">
              <span className="ss-fala__carimbo">{formatarCarimbo(linha.segundos)}</span>
              <div className="ss-fala__corpo">
                <span className={`ss-fala__quem${entrevistadora ? ' ss-fala__quem--entrevistadora' : ''}`}>
                  {rotuloDeQuem(linha)}
                </span>
                <span className={entrevistadora ? 'ss-fala__texto--entrevistadora' : 'ss-fala__texto--cliente'}>
                  {linha.texto}
                </span>
              </div>
            </div>
          );
        })}
        {capturando && (
          <div className="ss-fala">
            <span className="ss-fala__carimbo">{formatarCarimbo(segundos)}</span>
            <span className="ss-fala__transcrevendo">transcrevendo…</span>
          </div>
        )}
      </div>
    </>
  );
}
