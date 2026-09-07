/**
 * Tela 3 — Fim de sessão.
 *
 * Curta, sem colunas: sessão encerrada (ou incompleta), blocos cobertos,
 * arquivo gravado e a próxima sessão em uma linha. Nada de resumo
 * interpretado nem análise: só o caminho do arquivo e o que vem depois.
 */

import { useEffect, useState } from 'react';
import { IconeAlerta, IconeArquivo, IconeCheque, IconeChequeCirculo, IconePasta } from '../components/Icones';
import { BLOCOS, FECHAMENTO, resumoDaSessao, sessaoPorNumero } from '../roteiro/roteiro';
import { formatarDuracao, paraErroApp } from '../shared/tipos';
import type { NumeroSessao } from '../shared/tipos';
import type { PropsFimDeSessao, ResultadoSessao } from './contratos';
import './FimDeSessao.css';

const TAMANHO_INDISPONIVEL = 'tamanho indisponível';

function proximoNumero(n: NumeroSessao): NumeroSessao | null {
  switch (n) {
    case 1:
      return 2;
    case 2:
      return 3;
    case 3:
      return null;
  }
}

function nomeDoBloco(id: string): string {
  return BLOCOS.find((b) => b.id === id)?.nome ?? id;
}

/** Junta pasta e arquivo com o separador que a própria pasta usa. */
function caminhoCompleto(pasta: string, arquivo: string): string {
  const separador = pasta.includes('\\') ? '\\' : '/';
  const base = pasta.endsWith(separador) ? pasta.slice(0, -1) : pasta;
  return `${base}${separador}${arquivo}`;
}

/** KB com uma casa, vírgula decimal. */
function formatarTamanho(bytes: number): string {
  return `${(bytes / 1024).toFixed(1).replace('.', ',')} KB`;
}

function tituloDaTela(r: ResultadoSessao): string {
  if (!r.concluida) {
    return `A sessão parou no bloco «${nomeDoBloco(r.blocoAtual)}». Ela recomeça daí na próxima abertura.`;
  }
  if (r.sessao === 3) return 'A entrevista terminou. As três transcrições estão nesta máquina.';
  return 'A transcrição bruta desta sessão foi gravada nesta máquina.';
}

function linhaDaProxima(r: ResultadoSessao): string {
  if (!r.concluida) return `Retomar a sessão ${r.sessao} a partir do bloco «${nomeDoBloco(r.blocoAtual)}»`;
  const proxima = proximoNumero(r.sessao);
  if (proxima === null) return 'Não há próxima sessão. A captação termina aqui.';
  const s = sessaoPorNumero(proxima);
  const blocos = s.blocos.map((b) => b.nome).join(', ');
  return `Sessão ${s.numero} — ${s.nome} · ${blocos} · ${resumoDaSessao(s)}`;
}

export function FimDeSessao(props: PropsFimDeSessao): JSX.Element {
  const { plataforma, info, resultado, aoContinuar, aoFechar } = props;
  const [tamanho, setTamanho] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;
    plataforma.transcricao
      .tamanho(resultado.pasta, resultado.arquivo)
      .then((bytes) => {
        if (ativo) setTamanho(formatarTamanho(bytes));
      })
      .catch(() => {
        if (ativo) setTamanho(TAMANHO_INDISPONIVEL);
      });
    return () => {
      ativo = false;
    };
  }, [plataforma, resultado.pasta, resultado.arquivo]);

  const abrirPasta = (): void => {
    setAviso(null);
    plataforma.sistema.abrirPasta(resultado.pasta).catch((e: unknown) => setAviso(paraErroApp(e).mensagem));
  };

  const n = resultado.sessao;
  const concluida = resultado.concluida;
  const sessao = sessaoPorNumero(n);
  const proxima = concluida ? proximoNumero(n) : null;
  const cobertos = new Set(resultado.blocosCobertos);
  // Só se afirma que não houve chamada de voz quando de fato não houve
  // nenhuma nesta execução — uma troca para voz no meio conta.
  const soEscrita = !resultado.usouVoz;

  return (
    <div className="app">
      <header className="cabecalho">
        <span className="marca">Entrevista Twin</span>
        <span className="selo">roteiro v1</span>
        {info.simulada ? <span className="selo selo--ambar">SIMULAÇÃO</span> : null}
        <span className="fs-estado">
          <span className="ponto" aria-hidden="true" />
          <span>microfone fechado</span>
        </span>
      </header>

      <div className="fs-corpo">
        <main className="fs-coluna">
          <div className={`fs-situacao${concluida ? '' : ' fs-situacao--incompleta'}`}>
            {concluida ? <IconeChequeCirculo tamanho={14} /> : <IconeAlerta tamanho={14} />}
            <span>{concluida ? `Sessão ${n} encerrada` : `Sessão ${n} incompleta`}</span>
          </div>

          <h1 className="titulo fs-titulo">{tituloDaTela(resultado)}</h1>

          <div className="fs-numeros">
            <div className="fs-numero">
              <span className="fs-numero__rotulo">Duração</span>
              <span className="fs-numero__valor">{formatarDuracao(resultado.segundos)}</span>
            </div>
            <div className="fs-numero">
              <span className="fs-numero__rotulo">Perguntas</span>
              <span className="fs-numero__valor">
                {resultado.perguntasRespondidas.filter((id) => id !== FECHAMENTO.id).length} de{' '}
                {resultado.totalPerguntas}
                {resultado.perguntasRespondidas.includes(FECHAMENTO.id) && (
                  <span className="fs-numero__extra"> + fechamento</span>
                )}
              </span>
            </div>
            <div className="fs-numero">
              <span className="fs-numero__rotulo">Falas transcritas</span>
              <span className="fs-numero__valor">{resultado.falas}</span>
            </div>
          </div>

          <section className="fs-secao" aria-label="Blocos cobertos">
            <div className="rotulo">Blocos cobertos</div>
            <ul className="fs-blocos">
              {sessao.blocos.map((b) => {
                const coberto = cobertos.has(b.id);
                return (
                  <li key={b.id} className={`fs-bloco${coberto ? ' fs-bloco--coberto' : ''}`}>
                    {coberto ? <IconeCheque tamanho={10} espessura={2.5} className="fs-bloco__check" /> : null}
                    <span className="tabular">{b.numero}</span>
                    <span>{b.nome}</span>
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="fs-secao" aria-label="Arquivo gerado">
            <div className="rotulo">Arquivo gerado</div>
            <div className="fs-arquivo">
              <IconeArquivo tamanho={15} className="fs-arquivo__icone" />
              <span className="fs-arquivo__caminho">{caminhoCompleto(resultado.pasta, resultado.arquivo)}</span>
              {tamanho !== null ? <span className="fs-arquivo__tamanho">{tamanho}</span> : null}
            </div>
          </section>

          <section className="fs-secao" aria-label="Próxima sessão">
            <div className="rotulo">Próxima sessão</div>
            <p className="fs-proxima">{linhaDaProxima(resultado)}</p>
          </section>

          <div className="fs-acoes">
            <button type="button" className="botao" onClick={abrirPasta}>
              <IconePasta tamanho={13} />
              Abrir pasta
            </button>
            {concluida && proxima !== null ? (
              <>
                <button type="button" className="botao botao--ambar" onClick={() => aoContinuar(proxima, null)}>
                  Emendar a sessão {proxima} agora
                </button>
                <button type="button" className="botao" onClick={aoFechar}>
                  Fechar o app
                </button>
              </>
            ) : null}
            {!concluida ? (
              <>
                <button
                  type="button"
                  className="botao botao--ambar"
                  onClick={() => aoContinuar(n, resultado.blocoAtual)}
                >
                  Retomar agora
                </button>
                <button type="button" className="botao" onClick={aoFechar}>
                  Fechar o app
                </button>
              </>
            ) : null}
            {concluida && proxima === null ? (
              <button type="button" className="botao botao--cheio fs-botao-final" onClick={aoFechar}>
                ENTREVISTA CONCLUÍDA
              </button>
            ) : null}
          </div>

          {aviso !== null ? (
            <div className="dica dica--erro" role="alert">
              {aviso}
            </div>
          ) : null}

          <p className="fs-nota">
            {soEscrita
              ? 'As chaves permanecem nesta máquina. Durante a sessão, nada além das chamadas de condução saiu daqui.'
              : 'As chaves permanecem nesta máquina. Durante a sessão, nada além das chamadas de voz e de condução saiu daqui.'}
          </p>
        </main>
      </div>
    </div>
  );
}
