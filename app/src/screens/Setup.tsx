/**
 * Tela 1 — Setup.
 *
 * Esquerda: modo, as duas chaves, voz, pasta de destino e o botão principal.
 * Direita: o roteiro carregado, agrupado por sessão. Tudo o que toca o mundo
 * passa pela `plataforma` recebida por props; o `App` persiste a configuração
 * (`aoMudarConfig`) e troca de tela (`aoIniciar`).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { CampoChave } from '../components/CampoChave';
import { IconeAlerta, IconeLapis, IconeMicrofone, IconePasta, IconeCadeado } from '../components/Icones';
import { RoteiroCarregado } from '../components/RoteiroCarregado';
import { SeletorModo } from '../components/SeletorModo';
import { SeletorVoz } from '../components/SeletorVoz';
import { proximaSessao, rotuloDoBotao } from '../engine/progresso';
import { nomeDoArquivoDaSessao } from '../engine/transcricao';
import { VOZES, paraErroApp } from '../shared/tipos';
import type { EstadoChaves, Motor, NumeroSessao, Progresso } from '../shared/tipos';
import type { PropsSetup } from './contratos';
import './Setup.css';

const NOME_MOTOR: Readonly<Record<Motor, string>> = { claude: 'Claude', grok: 'Grok' };

/** Enquanto `chaves.estado()` não responde, tudo conta como ausente. */
const CHAVES_DESCONHECIDAS: EstadoChaves = { claude: 'ausente', grok: 'ausente' };

export function Setup(props: PropsSetup): JSX.Element {
  const { plataforma, info, config, progresso, aoMudarConfig, aoIniciar } = props;

  const [rascunhos, setRascunhos] = useState<Record<Motor, string>>({ claude: '', grok: '' });
  const [estadoChaves, setEstadoChaves] = useState<EstadoChaves>(CHAVES_DESCONHECIDAS);
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

  // Só se sabe se há chave guardada; o texto dela nunca chega aqui.
  useEffect(() => {
    let ativo = true;
    plataforma.chaves
      .estado()
      .then((estado) => {
        if (ativo) setEstadoChaves(estado);
      })
      .catch((e: unknown) => {
        if (ativo) setAvisos([paraErroApp(e).mensagem]);
      });
    return () => {
      ativo = false;
    };
  }, [plataforma]);

  const mudarRascunho = useCallback((motor: Motor, valor: string): void => {
    setRascunhos((r) => ({ ...r, [motor]: valor }));
  }, []);

  const guardarChave = useCallback(
    async (motor: Motor, chave: string): Promise<void> => {
      const estado = await plataforma.chaves.guardar(motor, chave);
      if (!montado.current) return;
      setEstadoChaves(estado);
      setRascunhos((r) => ({ ...r, [motor]: '' }));
    },
    [plataforma],
  );

  const removerChave = useCallback(
    async (motor: Motor): Promise<void> => {
      const estado = await plataforma.chaves.remover(motor);
      if (montado.current) setEstadoChaves(estado);
    },
    [plataforma],
  );

  const guardarClaude = useCallback((chave: string) => guardarChave('claude', chave), [guardarChave]);
  const guardarGrok = useCallback((chave: string) => guardarChave('grok', chave), [guardarChave]);
  const removerClaude = useCallback(() => removerChave('claude'), [removerChave]);
  const removerGrok = useCallback(() => removerChave('grok'), [removerChave]);

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
  const claudeGuardada = estadoChaves.claude === 'guardada';
  const grokGuardada = estadoChaves.grok === 'guardada';
  const pronto = claudeGuardada && (escrita || grokGuardada);
  const proxima = proximaSessao(progresso);
  const concluida = proxima === null;
  const pasta = config.pasta ?? '';
  const nomeVoz = VOZES.find((v) => v.id === config.voz)?.nome ?? config.voz;

  const iniciar = async (): Promise<void> => {
    if (proxima === null || !pronto || validando) return;
    setValidando(true);
    setAvisos([]);
    try {
      const motores: readonly Motor[] = escrita ? ['claude'] : ['claude', 'grok'];
      const resultados = await plataforma.chaves.validar(motores);
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
    if (validando) return 'Validando as chaves na API…';
    if (concluida) return 'As três sessões foram concluídas. As transcrições estão na pasta de destino.';
    if (pronto) return `${escrita ? 'Modo escrita' : `Voz ${nomeVoz}`} · gravação em ${pasta}`;
    return escrita
      ? 'Habilita quando a chave do Claude passar na validação de formato.'
      : 'Habilita quando as duas chaves passarem na validação de formato.';
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

  return (
    <div className="app">
      <header className="cabecalho">
        <span className="marca">Entrevista Twin</span>
        <span className="selo">roteiro v1</span>
        {info.simulada ? <span className="selo selo--ambar">SIMULAÇÃO</span> : null}
        <span className={`st-estado${pronto ? ' st-estado--pronto' : ''}`} aria-live="polite">
          <span className={`ponto${pronto ? ' ponto--verde' : ''}`} aria-hidden="true" />
          <span>{concluida ? 'entrevista concluída' : pronto ? 'pronto para iniciar' : 'aguardando chaves'}</span>
        </span>
      </header>

      <div className="st-corpo">
        <section className="st-coluna" aria-label="Configuração da sessão">
          <div className="st-intro">
            <h1 className="titulo st-titulo">Configuração da sessão</h1>
            <p className="st-subtitulo">
              Dois motores, duas chaves. Nada sai desta máquina além das chamadas às duas APIs.
            </p>
          </div>

          <SeletorModo modo={config.modo} aoMudar={(modo) => aoMudarConfig({ ...config, modo })} />

          <div className="st-secao st-secao--chaves">
            <div className="rotulo">Chaves de API</div>
            <CampoChave
              motor="claude"
              rotulo="Claude"
              descricao="· inteligência — conduz a entrevista"
              situacao={estadoChaves.claude}
              valor={rascunhos.claude}
              aoMudar={(v) => mudarRascunho('claude', v)}
              aoGuardar={guardarClaude}
              aoRemover={removerClaude}
            />
            <CampoChave
              motor="grok"
              rotulo="Grok"
              descricao="· voz — lê as perguntas e transcreve as respostas"
              situacao={estadoChaves.grok}
              valor={rascunhos.grok}
              aoMudar={(v) => mudarRascunho('grok', v)}
              aoGuardar={guardarGrok}
              aoRemover={removerGrok}
              opcional={escrita}
            />
            <div className="st-cadeado">
              <IconeCadeado tamanho={12} />
              <span>
                As chaves ficam apenas nesta máquina, no keychain do sistema. Não são gravadas no arquivo de
                transcrição.
              </span>
            </div>
          </div>

          <SeletorVoz
            voz={config.voz}
            modo={config.modo}
            amostraDisponivel={grokGuardada}
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

/** Bloco de onde a sessão incompleta recomeça; `null` se o progresso não a marca assim. */
function blocoDeRetomada(progresso: Progresso, numero: NumeroSessao): string | null {
  const gravada = progresso.sessoes[numero];
  return gravada.estado === 'incompleta' ? gravada.blocoAtual : null;
}
