/**
 * Tela 1 — Setup.
 *
 * Esquerda: modo, voz, pasta de destino e o botão principal. Direita: o
 * roteiro carregado, agrupado por sessão. As chaves de API não aparecem
 * aqui: são provisionadas fora da tela (variáveis de ambiente ou
 * `chaves.local.json`) e a tela só sabe se estão presentes. Tudo o que toca
 * o mundo passa pela `plataforma` recebida por props; o `App` persiste a
 * configuração (`aoMudarConfig`) e troca de tela (`aoIniciar`).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { IconeAlerta, IconeLapis, IconeMicrofone, IconePasta } from '../components/Icones';
import { RoteiroCarregado } from '../components/RoteiroCarregado';
import { SeletorModo } from '../components/SeletorModo';
import { SeletorVoz } from '../components/SeletorVoz';
import { proximaSessao, rotuloDoBotao } from '../engine/progresso';
import { nomeDoArquivoDaSessao } from '../engine/transcricao';
import { PREFIXO_CHAVE, VARIAVEL_DE_CHAVE, VOZES, paraErroApp } from '../shared/tipos';
import type { EstadoChaves, InfoSistema, Motor, NumeroSessao, Progresso } from '../shared/tipos';
import type { PropsSetup } from './contratos';
import './Setup.css';

const NOME_MOTOR: Readonly<Record<Motor, string>> = { claude: 'Claude', grok: 'Grok' };

/** Enquanto `chaves.estado()` não responde, tudo conta como ausente. */
const CHAVES_DESCONHECIDAS: EstadoChaves = { claude: 'ausente', grok: 'ausente' };

export function Setup(props: PropsSetup): JSX.Element {
  const { plataforma, info, config, progresso, aoMudarConfig, aoIniciar } = props;

  const [estadoChaves, setEstadoChaves] = useState<EstadoChaves>(CHAVES_DESCONHECIDAS);
  const [verificandoChaves, setVerificandoChaves] = useState(false);
  const [validando, setValidando] = useState(false);
  /** Falhas da validação real das chaves (ou erro de plataforma), sob o botão. */
  const [avisos, setAvisos] = useState<readonly string[]>([]);
  const [erroDestino, setErroDestino] = useState<string | null>(null);
  // A data entra uma vez por abertura da tela: o nome do próximo arquivo não muda a cada render.
  const [hoje] = useState(() => new Date());
  const montado = useRef(true);

  useEffect(() => {
    montado.current = true;
    return () => {
      montado.current = false;
    };
  }, []);

  // Só se sabe a situação de cada chave; o texto dela nunca chega aqui.
  const verificarChaves = useCallback(async (): Promise<void> => {
    setVerificandoChaves(true);
    try {
      const estado = await plataforma.chaves.estado();
      if (montado.current) setEstadoChaves(estado);
    } catch (e) {
      if (montado.current) setAvisos([paraErroApp(e).mensagem]);
    } finally {
      if (montado.current) setVerificandoChaves(false);
    }
  }, [plataforma]);

  useEffect(() => {
    void verificarChaves();
  }, [verificarChaves]);

  const escolherPasta = async (): Promise<void> => {
    setErroDestino(null);
    try {
      const nova = await plataforma.destino.escolher(config.pasta);
      if (!montado.current || nova === null || nova === config.pasta) return;
      aoMudarConfig({ ...config, pasta: nova });
    } catch (e) {
      if (montado.current) setErroDestino(paraErroApp(e).mensagem);
    }
  };

  const escrita = config.modo === 'escrita';
  const motoresNecessarios: readonly Motor[] = escrita ? ['claude'] : ['claude', 'grok'];
  const grokPresente = estadoChaves.grok === 'presente';
  const pronto = motoresNecessarios.every((m) => estadoChaves[m] === 'presente');
  const problemasDeChaves = descreverProblemas(estadoChaves, motoresNecessarios, info);
  const proxima = proximaSessao(progresso);
  const concluida = proxima === null;
  const pasta = config.pasta ?? '';
  const nomeVoz = VOZES.find((v) => v.id === config.voz)?.nome ?? config.voz;

  const iniciar = async (): Promise<void> => {
    if (proxima === null || !pronto || validando) return;
    setValidando(true);
    setAvisos([]);
    try {
      const resultados = await plataforma.chaves.validar(motoresNecessarios);
      if (!montado.current) return;
      const falhas = resultados.filter((r) => !r.ok);
      if (falhas.length > 0) {
        setAvisos(falhas.map((f) => `${NOME_MOTOR[f.motor]}: ${f.mensagem}`));
        return;
      }
      aoIniciar(proxima.numero, proxima.acao === 'retomar' ? blocoDeRetomada(progresso, proxima.numero) : null);
    } catch (e) {
      if (montado.current) setAvisos([paraErroApp(e).mensagem]);
    } finally {
      if (montado.current) setValidando(false);
    }
  };

  const dicaDoBotao = (): string => {
    if (validando) return 'Confirmando o acesso às APIs…';
    if (concluida) return 'As três sessões foram concluídas. As transcrições estão na pasta de destino.';
    if (pronto) return `${escrita ? 'Modo escrita' : `Voz ${nomeVoz}`} · gravação em ${pasta}`;
    return escrita
      ? 'Habilita quando a chave do Claude estiver provisionada.'
      : 'Habilita quando as chaves do Claude e do Grok estiverem provisionadas.';
  };

  const dicaDoDestino = (): string => {
    if (proxima === null) return 'As três transcrições estão nesta pasta.';
    const gravada = progresso.sessoes[proxima.numero];
    const meio = 'Uma transcrição por sessão, em texto simples, gravada nesta pasta.';
    if (proxima.acao === 'retomar' && gravada.estado === 'incompleta') {
      return `${meio} A sessão ${proxima.numero} continua em «${gravada.arquivo}». Nada é enviado para a nuvem.`;
    }
    return `${meio} A próxima será «${nomeDoArquivoDaSessao(proxima.numero, hoje)}». Nada é enviado para a nuvem.`;
  };

  const estadoDoCabecalho = concluida ? 'entrevista concluída' : pronto ? 'pronto para iniciar' : 'sem chaves';

  return (
    <div className="app">
      <header className="cabecalho">
        <span className="marca">Entrevista Twin</span>
        <span className="selo">roteiro v1</span>
        {info.simulada ? <span className="selo selo--ambar">SIMULAÇÃO</span> : null}
        <span className={`st-estado${pronto ? ' st-estado--pronto' : ''}`} aria-live="polite">
          <span className={`ponto${pronto ? ' ponto--verde' : ''}`} aria-hidden="true" />
          <span>{estadoDoCabecalho}</span>
        </span>
      </header>

      <div className="st-corpo">
        <section className="st-coluna" aria-label="Configuração da sessão">
          <div className="st-intro">
            <h1 className="titulo st-titulo">Configuração da sessão</h1>
            <p className="st-subtitulo">
              As chaves das duas APIs ficam nesta máquina, fora da tela. Nada sai daqui além das chamadas ao
              Claude e ao Grok.
            </p>
          </div>

          <SeletorModo modo={config.modo} aoMudar={(modo) => aoMudarConfig({ ...config, modo })} />

          <SeletorVoz
            voz={config.voz}
            modo={config.modo}
            amostraDisponivel={grokPresente}
            aoMudar={(voz) => aoMudarConfig({ ...config, voz })}
            falar={plataforma.voz.falar}
          />

          <div className="st-secao">
            <div className="rotulo">Destino das transcrições</div>
            <div className="st-destino">
              <div className="campo st-destino__campo">
                <IconePasta tamanho={14} />
                <input value={pasta} readOnly spellCheck={false} aria-label="Pasta de destino das transcrições" />
              </div>
              <button type="button" className="botao st-destino__botao" onClick={() => void escolherPasta()}>
                Escolher…
              </button>
            </div>
            <div className={erroDestino !== null ? 'dica dica--erro' : 'st-nota'}>{erroDestino ?? dicaDoDestino()}</div>
          </div>

          <div className="st-iniciar">
            <button
              type="button"
              className="botao botao--cheio"
              disabled={!pronto || concluida || validando}
              onClick={() => void iniciar()}
            >
              {escrita ? <IconeLapis tamanho={15} espessura={2} /> : <IconeMicrofone tamanho={15} espessura={2} />}
              {rotuloDoBotao(progresso)}
            </button>
            <div className="st-nota">{dicaDoBotao()}</div>
            {problemasDeChaves.length > 0 ? (
              <div className="aviso" role="alert">
                {problemasDeChaves.map((problema) => (
                  <div key={problema} className="aviso__linha">
                    <span className="aviso__icone">
                      <IconeAlerta tamanho={13} />
                    </span>
                    <span className="aviso__texto">{problema}</span>
                  </div>
                ))}
                <div className="st-chaves__acao">
                  <button
                    type="button"
                    className="botao botao--discreto"
                    disabled={verificandoChaves}
                    onClick={() => void verificarChaves()}
                  >
                    {verificandoChaves ? 'Verificando…' : 'Verificar de novo'}
                  </button>
                </div>
              </div>
            ) : null}
            {avisos.length > 0 ? (
              <div className="aviso" role="alert">
                {avisos.map((aviso) => (
                  <div key={aviso} className="aviso__linha">
                    <span className="aviso__icone">
                      <IconeAlerta tamanho={13} />
                    </span>
                    <span className="aviso__texto">{aviso}</span>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </section>

        <div className="st-divisor" aria-hidden="true" />

        <section className="st-coluna st-coluna--roteiro" aria-label="Roteiro carregado">
          <RoteiroCarregado progresso={progresso} />
        </section>
      </div>
    </div>
  );
}

/**
 * Uma linha por chave necessária que falta ou está mal formada, mais a
 * instrução de onde colocá-la. Vazio quando nada falta.
 */
function descreverProblemas(
  estado: EstadoChaves,
  necessarios: readonly Motor[],
  info: InfoSistema,
): readonly string[] {
  const linhas: string[] = [];
  for (const motor of necessarios) {
    const situacao = estado[motor];
    if (situacao === 'ausente') {
      linhas.push(`Chave do ${NOME_MOTOR[motor]} não encontrada.`);
    } else if (situacao === 'invalida') {
      linhas.push(
        `A chave do ${NOME_MOTOR[motor]} não tem o formato esperado (começa com «${PREFIXO_CHAVE[motor]}»).`,
      );
    }
  }
  if (linhas.length === 0) return linhas;
  const variaveis = necessarios.map((m) => VARIAVEL_DE_CHAVE[m]).join(' e ');
  linhas.push(`Coloque-a em «${info.arquivoDeChaves}» (ou na variável de ambiente ${variaveis}) e verifique de novo.`);
  return linhas;
}

/** Bloco de onde a sessão incompleta recomeça; `null` se o progresso não a marca assim. */
function blocoDeRetomada(progresso: Progresso, numero: NumeroSessao): string | null {
  const gravada = progresso.sessoes[numero];
  return gravada.estado === 'incompleta' ? gravada.blocoAtual : null;
}
