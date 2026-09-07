/**
 * Roteiro carregado — a coluna direita do setup.
 *
 * O roteiro v1 vem embutido e só se confere aqui: três grupos de sessão, cada
 * um com o seu estado (concluída com data, atual, incompleta, pendente), os
 * blocos em acordeão dentro e, no fim da sessão 3, o fechamento fora da
 * contagem. Abaixo, o card com a regra de condução.
 */

import { useState } from 'react';
import { resumoParaSetup } from '../engine/progresso';
import type { ResumoSessao } from '../engine/progresso';
import {
  BLOCOS,
  FECHAMENTO,
  REGRA_DE_CONDUCAO,
  SESSOES,
  TOTAL_PERGUNTAS,
  resumoDaSessao,
  resumoDoBloco,
} from '../roteiro/roteiro';
import type { Bloco, Sessao } from '../roteiro/roteiro';
import type { Progresso } from '../shared/tipos';
import { IconeCadeado, IconeSetaBaixo, IconeSetaCima } from './Icones';

export interface PropsRoteiroCarregado {
  readonly progresso: Progresso;
}

const dois = (n: number): string => String(n).padStart(2, '0');

export function RoteiroCarregado(props: PropsRoteiroCarregado): JSX.Element {
  const { progresso } = props;
  const resumos = resumoParaSetup(progresso);
  // Abre de saída o bloco por onde a próxima sessão começa (ou recomeça).
  const [abertos, setAbertos] = useState<readonly string[]>(() => [blocoInicial(progresso, resumos)]);

  const alternar = (blocoId: string): void => {
    setAbertos((atuais) =>
      atuais.includes(blocoId) ? atuais.filter((id) => id !== blocoId) : [...atuais, blocoId],
    );
  };

  return (
    <>
      <div className="st-roteiro__cabeca">
        <h2 className="titulo st-roteiro__titulo">Roteiro carregado</h2>
        <span className="selo selo--ambar">v1 · fixo</span>
        <span className="st-roteiro__resumo">
          {`${BLOCOS.length} blocos · ${TOTAL_PERGUNTAS} perguntas + fechamento · ${SESSOES.length} sessões de ~25 min`}
        </span>
      </div>

      <div className="st-roteiro__lista">
        {SESSOES.map((sessao) => {
          const resumo = resumos.find((r) => r.numero === sessao.numero);
          return (
            <div key={sessao.numero} className="st-sessao">
              <div className="st-sessao__cabeca">
                <span className="st-sessao__nome">{`Sessão ${sessao.numero} — ${sessao.nome}`}</span>
                <span className="st-sessao__meta">{resumoDaSessao(sessao)}</span>
                {resumo ? <SeloDaSessao resumo={resumo} progresso={progresso} /> : null}
              </div>
              {sessao.blocos.map((bloco) => (
                <BlocoDoRoteiro
                  key={bloco.id}
                  bloco={bloco}
                  aberto={abertos.includes(bloco.id)}
                  aoAlternar={() => alternar(bloco.id)}
                />
              ))}
              {sessao.numero === 3 ? <Fechamento /> : null}
            </div>
          );
        })}
      </div>

      <div className="card st-regra">
        <div className="rotulo st-regra__rotulo">
          <span className="marcador marcador--ambar" />
          Regra de condução
        </div>
        <p className="st-regra__texto">{REGRA_DE_CONDUCAO}</p>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Partes
// ---------------------------------------------------------------------------

function SeloDaSessao(p: { resumo: ResumoSessao; progresso: Progresso }): JSX.Element {
  const { resumo, progresso } = p;
  switch (resumo.estado) {
    case 'concluida':
      return (
        <span className="selo selo--verde st-sessao__selo">
          {`concluída${resumo.data ? ` · ${dataCurta(resumo.data)}` : ''}`}
        </span>
      );
    case 'incompleta': {
      const gravada = progresso.sessoes[resumo.numero];
      const bloco =
        gravada.estado === 'incompleta' ? BLOCOS.find((b) => b.id === gravada.blocoAtual) : undefined;
      return (
        <span className="selo selo--ambar st-sessao__selo">
          {bloco ? `incompleta · recomeça do bloco ${bloco.numero}` : 'incompleta'}
        </span>
      );
    }
    case 'atual':
      return <span className="selo selo--ambar st-sessao__selo">atual</span>;
    case 'pendente':
      return <span className="selo st-sessao__selo">pendente</span>;
  }
}

function BlocoDoRoteiro(p: { bloco: Bloco; aberto: boolean; aoAlternar(): void }): JSX.Element {
  const { bloco, aberto, aoAlternar } = p;
  const idCorpo = `st-bloco-${bloco.id}`;
  return (
    <div className="st-bloco">
      <button
        type="button"
        className="st-bloco__cabeca"
        aria-expanded={aberto}
        aria-controls={idCorpo}
        onClick={aoAlternar}
      >
        <span className="st-bloco__num">{dois(bloco.numero)}</span>
        <span className="st-bloco__nome">{bloco.nome}</span>
        <span className="st-bloco__meta">{resumoDoBloco(bloco)}</span>
        <span className={`st-bloco__seta${aberto ? ' st-bloco__seta--aberta' : ''}`}>
          {aberto ? <IconeSetaCima tamanho={16} /> : <IconeSetaBaixo tamanho={16} />}
        </span>
      </button>
      {aberto ? (
        <div id={idCorpo} className="st-bloco__corpo">
          {bloco.perguntas.map((pergunta) => (
            <div key={pergunta.id} className="st-pergunta">
              <span className="st-pergunta__num">{pergunta.numero === null ? '—' : dois(pergunta.numero)}</span>
              <div className="st-pergunta__corpo">
                <span className="st-pergunta__texto">{pergunta.texto}</span>
                {pergunta.tipo === 'multipla' ? (
                  <span className="st-pergunta__tipo">
                    {`múltipla escolha · ${pergunta.opcoes?.length ?? 0} opções`}
                  </span>
                ) : null}
              </div>
            </div>
          ))}
          <div className="st-bloco__nota">
            <IconeCadeado tamanho={11} />
            <span>Versão fixa · roteiro v1 — este bloco não é editável no app.</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Fechamento(): JSX.Element {
  return (
    <div className="st-fechamento">
      <span className="st-fechamento__traco">—</span>
      <div className="st-fechamento__corpo">
        <span className="st-fechamento__rotulo">Fechamento · fora da contagem</span>
        <span className="st-fechamento__texto">“{FECHAMENTO.texto}”</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Apoio
// ---------------------------------------------------------------------------

/** O bloco que a próxima ação do botão principal alcança; o primeiro do roteiro se tudo concluído. */
function blocoInicial(progresso: Progresso, resumos: readonly ResumoSessao[]): string {
  const proxima = resumos.find((r) => r.estado === 'atual' || r.estado === 'incompleta');
  const primeiro = BLOCOS[0]?.id ?? '';
  if (!proxima) return primeiro;
  const gravada = progresso.sessoes[proxima.numero];
  if (gravada.estado === 'incompleta') return gravada.blocoAtual;
  const sessao: Sessao | undefined = SESSOES.find((s) => s.numero === proxima.numero);
  return sessao?.blocos[0]?.id ?? primeiro;
}

/** `06/09/2026` a partir de um instante ISO; devolve o texto original se não for data. */
function dataCurta(iso: string): string {
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return iso;
  return `${dois(data.getDate())}/${dois(data.getMonth() + 1)}/${data.getFullYear()}`;
}
