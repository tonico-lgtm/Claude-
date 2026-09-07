/**
 * Tela 2 — Sessão em curso. Reproduz o protótipo (bloco "Sessão em curso"):
 * barra de progresso, cabeçalho com estado e relógio, coluna principal com a
 * pergunta, o card "Claude" e os controles, coluna lateral com a transcrição
 * e os chips dos blocos da sessão.
 *
 * Toda a lógica mora em `useSessao`; aqui só se desenha o estado.
 */

import { useEffect, useState } from 'react';

import { BarrasAudio } from '../components/BarrasAudio';
import { ChipsDeBlocos } from '../components/ChipsDeBlocos';
import { DialogoEncerrar } from '../components/DialogoEncerrar';
import { FormularioEscrita, letraDaOpcao } from '../components/FormularioEscrita';
import {
  IconeAlerta,
  IconeAnterior,
  IconeAprofundar,
  IconeCheque,
  IconeLapis,
  IconeMicrofone,
  IconeParar,
  IconePausa,
  IconeSetaDireita,
  IconeTocar,
} from '../components/Icones';
import { Transcricao } from '../components/Transcricao';
import {
  blocoAtual,
  chipsDeBlocos,
  ehUltima,
  perguntaAtual,
  podeAprofundar,
  progressoDaSessao,
  rotuloAprofundar,
  rotuloFase,
  rotuloPergunta,
} from '../engine/sessao';
import type { EstadoSessao } from '../engine/sessao';
import { useSessao } from '../hooks/useSessao';
import { BLOCOS, FECHAMENTO, SESSOES } from '../roteiro/roteiro';
import { VOZES, formatarDuracao } from '../shared/tipos';
import type { DecisaoConducao, ErroApp } from '../shared/tipos';
import type { PropsSessao } from './contratos';
import './Sessao.css';

const DICA_MICROFONE = 'Verifique a permissão do microfone nas configurações do sistema.';
const TITULO_VOZ_INDISPONIVEL = 'Chave do Grok necessária para o modo voz';
const TITULO_VOZ = 'Alternar para voz';

/** Prefixo do motivo no card "Claude", conforme a origem da decisão. */
function prefixoDaDecisao(d: DecisaoConducao): string {
  switch (d.origem) {
    case 'recusa':
      return 'Claude recusou avaliar — ';
    case 'erro':
      return `Sem avaliação do Claude (${d.motivo}) — `;
    case 'regra':
      return 'Sem aprofundamento por regra — ';
    case 'simulacao':
      return 'Simulação — ';
    case 'claude':
      return '';
  }
}

function textoDaDecisao(d: DecisaoConducao): string {
  const prefixo = prefixoDaDecisao(d);
  if (d.origem === 'erro') return `${prefixo}${d.aprofundar ? 'aprofundamento mantido' : 'sem aprofundamento'}`;
  return `${prefixo}Claude: ${d.motivo}`;
}

function mensagemDoErro(erro: ErroApp): string {
  return erro.codigo === 'microfone' ? `${erro.mensagem} ${DICA_MICROFONE}` : erro.mensagem;
}

function rotuloDaSessao(e: EstadoSessao): string {
  const pergunta = perguntaAtual(e);
  const bloco = blocoAtual(e);
  const parte = pergunta.numero === null ? 'Fechamento' : `Bloco ${bloco.numero} de ${BLOCOS.length}`;
  return `Sessão ${e.sessao} de ${SESSOES.length} · ${parte}`;
}

export function Sessao(props: PropsSessao): JSX.Element {
  const { estado, nivel, vozDisponivel, acoes } = useSessao(props);
  const [confirmando, setConfirmando] = useState(false);
  const [escolha, setEscolha] = useState<number | null>(null);

  const pergunta = perguntaAtual(estado);
  const bloco = blocoAtual(estado);
  const escrita = estado.modo === 'escrita';
  const multipla = pergunta.tipo === 'multipla';
  const respondida = estado.respondidas.includes(pergunta.id);
  const fase = rotuloFase(estado);
  const nomeDaVoz = VOZES.find((v) => v.id === estado.voz)?.nome ?? estado.voz;
  const emTransito = estado.fase === 'transcrevendo' || estado.fase === 'decidindo';
  const travada = estado.pausada || estado.encerrada;
  const aprofundamentoAberto = estado.aprofundamentoAberto !== null;

  // A escolha da múltipla escolha morre ao mudar de pergunta.
  useEffect(() => {
    setEscolha(null);
  }, [pergunta.id]);

  const estadoDasBarras = estado.fase === 'falando' ? 'falando' : estado.fase === 'ouvindo' ? 'ouvindo' : 'parada';

  return (
    <div className="ss-tela">
      <div className="ss-progresso" aria-hidden="true">
        <div className="ss-progresso__barra" style={{ width: `${Math.round(progressoDaSessao(estado) * 100)}%` }} />
      </div>

      <header className="cabecalho cabecalho--sessao">
        <span className="marca">Entrevista Twin</span>
        {props.info.simulada && <span className="selo selo--ambar">SIMULAÇÃO</span>}
        <span className="ss-separador" />
        <span className="ss-sessao-rotulo">{rotuloDaSessao(estado)}</span>
        <span className="ss-estado">
          {estado.pausada ? (
            <>
              <span className="ss-estado__pausado" />
              <span className="ss-estado__texto ss-estado__texto--pausado">PAUSADO</span>
            </>
          ) : escrita ? (
            <>
              <span className="ss-estado__escrita" />
              <span className="ss-estado__texto ss-estado__texto--escrita">ESCRITA</span>
            </>
          ) : (
            <>
              <span className="ss-estado__gravando" />
              <span className="ss-estado__texto ss-estado__texto--gravando">GRAVANDO</span>
            </>
          )}
          <span className="ss-relogio tabular">{formatarDuracao(estado.segundos)}</span>
        </span>
        <div role="radiogroup" aria-label="Modo da entrevista" className="ss-modos">
          <button
            type="button"
            role="radio"
            aria-checked={!escrita}
            className="ss-modo"
            disabled={!vozDisponivel || estado.encerrada}
            title={vozDisponivel ? TITULO_VOZ : TITULO_VOZ_INDISPONIVEL}
            onClick={() => acoes.alternarModo('voz')}
          >
            <IconeMicrofone tamanho={11} />
            Voz
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={escrita}
            className="ss-modo"
            disabled={estado.encerrada}
            title="Alternar para escrita"
            onClick={() => acoes.alternarModo('escrita')}
          >
            <IconeLapis tamanho={11} />
            Escrita
          </button>
        </div>
        <button
          type="button"
          className="botao botao--baixo ss-encerrar"
          disabled={estado.encerrada}
          onClick={() => setConfirmando(true)}
        >
          <IconeParar tamanho={11} />
          Encerrar
        </button>
      </header>

      <div className="ss-corpo">
        <main className="ss-main">
          <div className="ss-main__conteudo">
            <div className="ss-bloco-linha">
              <span>
                Bloco {bloco.numero} · {bloco.nome}
              </span>
              <span className={`ss-tipo${multipla ? ' ss-tipo--multipla' : ''}`}>
                {multipla ? 'múltipla escolha' : 'pergunta aberta'}
              </span>
              <span className="ss-contagem tabular">{rotuloPergunta(estado)}</span>
            </div>

            <h1 className="ss-pergunta">{pergunta.texto}</h1>

            {multipla && pergunta.opcoes && (
              <ol className="ss-opcoes" role={escrita ? 'radiogroup' : undefined} aria-label="Opções">
                {pergunta.opcoes.map((opcao, i) =>
                  escrita ? (
                    <li key={i}>
                      <button
                        type="button"
                        role="radio"
                        aria-checked={escolha === i}
                        className="ss-opcao ss-opcao--radio"
                        disabled={travada}
                        onClick={() => setEscolha(i)}
                      >
                        <span className="ss-opcao__letra">{letraDaOpcao(i)}</span>
                        <span className="ss-opcao__texto">{opcao}</span>
                        {escolha === i && <IconeCheque tamanho={14} cor="var(--azul)" />}
                      </button>
                    </li>
                  ) : (
                    <li key={i}>
                      <div className="ss-opcao">
                        <span className="ss-opcao__letra">{letraDaOpcao(i)}</span>
                        <span className="ss-opcao__texto">{opcao}</span>
                      </div>
                    </li>
                  ),
                )}
              </ol>
            )}

            <div className="card ss-card-claude">
              <div className="ss-card-claude__titulo">
                <span className="marcador marcador--ambar" />
                Claude · condução desta pergunta
              </div>
              <p className="ss-card-claude__regra">{pergunta.regra}</p>
              {estado.ultimaDecisao && (
                <p className="ss-card-claude__decisao">{textoDaDecisao(estado.ultimaDecisao)}</p>
              )}
            </div>

            {escrita && (
              <FormularioEscrita
                key={`${pergunta.id}:${aprofundamentoAberto ? 'aprofundamento' : 'principal'}`}
                pergunta={pergunta}
                aprofundamentoAberto={aprofundamentoAberto}
                respondida={respondida}
                podeRegistrar={estado.fase === 'ociosa' && !travada}
                escolha={escolha}
                aoEscolher={setEscolha}
                aoRegistrar={acoes.registrarEscrita}
              />
            )}

            {estado.erro && (
              <div className="aviso ss-aviso" role="alert">
                <IconeAlerta tamanho={14} cor="var(--vermelho)" />
                <span className="aviso__texto">{mensagemDoErro(estado.erro)}</span>
                <button type="button" className="botao botao--discreto botao--baixo" onClick={acoes.limparErro}>
                  Fechar
                </button>
              </div>
            )}

            {escrita ? (
              <div className="ss-rodape-escrita">
                <IconeLapis tamanho={13} cor="var(--azul)" />
                <span className={`ss-fase ss-fase--${fase.cor}`}>{fase.texto}</span>
                <span className="ss-rodape-escrita__nota">Microfone fechado · alterne para voz no cabeçalho</span>
              </div>
            ) : (
              <div className="ss-audio">
                <BarrasAudio estado={estadoDasBarras} nivel={nivel} />
                <span className={`ss-fase ss-fase--${fase.cor}`}>{fase.texto}</span>
                {estado.fase === 'ouvindo' && (
                  <button type="button" className="botao botao--baixo" onClick={acoes.concluirResposta}>
                    <IconeCheque tamanho={12} />
                    Concluir resposta
                  </button>
                )}
                <span className="ss-motor">
                  <span className="ss-motor__ponto" />
                  Grok · voz {nomeDaVoz}
                </span>
              </div>
            )}
          </div>

          <div className="ss-controles">
            <button
              type="button"
              className="botao"
              disabled={estado.indice === 0 || travada || emTransito}
              onClick={acoes.anterior}
            >
              <IconeAnterior />
              Anterior
            </button>
            <button
              type="button"
              className="botao"
              disabled={estado.encerrada}
              onClick={acoes.pausarOuRetomar}
            >
              {estado.pausada ? <IconeTocar /> : <IconePausa />}
              <span>{estado.pausada ? 'Retomar' : 'Pausar'}</span>
            </button>
            <button
              type="button"
              className="botao"
              disabled={!podeAprofundar(estado)}
              onClick={acoes.aprofundar}
            >
              <IconeAprofundar />
              {rotuloAprofundar(estado)}
            </button>
            <span className="espaco" />
            <button
              type="button"
              className="botao botao--ambar ss-proxima"
              disabled={travada || emTransito}
              onClick={acoes.proxima}
            >
              {ehUltima(estado) ? 'Encerrar e gravar' : 'Próxima'}
              <IconeSetaDireita />
            </button>
          </div>
        </main>

        <aside className="ss-aside">
          <Transcricao linhas={estado.linhas} fase={estado.fase} segundos={estado.segundos} />
          <ChipsDeBlocos chips={chipsDeBlocos(estado)} pausada={travada} aoIr={acoes.irParaBloco} />
        </aside>
      </div>

      {confirmando && (
        <DialogoEncerrar
          respondidas={estado.respondidas.filter((id) => id !== FECHAMENTO.id).length}
          total={estado.fila.filter((p) => p.numero !== null).length}
          aoContinuar={() => setConfirmando(false)}
          aoConfirmar={() => {
            setConfirmando(false);
            acoes.encerrar();
          }}
        />
      )}
    </div>
  );
}
