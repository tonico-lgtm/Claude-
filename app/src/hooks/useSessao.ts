/**
 * Controlador da sessão — liga o motor puro (`engine/sessao.ts`), a
 * plataforma e o áudio do renderer.
 *
 * `despachar(acao)` reduz o estado e executa os efeitos devolvidos, na
 * ordem, fora do render. O resultado de cada efeito volta ao motor como nova
 * ação. Todo instante (`new Date()`) nasce aqui, nunca no motor.
 *
 * Efeitos longos (TTS, microfone, transcrição, decisão do Claude) recebem uma
 * "ficha" que `pararAudio` invalida: um resultado que chega depois de o
 * operador navegar, pausar ou trocar de modo é descartado aqui, antes de o
 * motor o ver — o motor também se protege pela fase, mas a ficha evita que
 * um resultado atrasado caia numa fase igual de outra pergunta.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { iniciarCaptura } from '../audio/gravador';
import type { Captura } from '../audio/gravador';
import { tocar } from '../audio/reprodutor';
import { aoAvancar, aoEncerrar, aoIniciar } from '../engine/progresso';
import { blocoAtual, criarSessao, reduzir } from '../engine/sessao';
import type { Acao, Efeito, EstadoSessao } from '../engine/sessao';
import {
  cabecalhoDaSessao,
  marcadorDeRetomada,
  nomeDoArquivoDaSessao,
  rodapeDaSessao,
  trechoDaLinha,
} from '../engine/transcricao';
import { FECHAMENTO, perguntasDaSessao, sessaoPorNumero } from '../roteiro/roteiro';
import type { PropsSessao, ResultadoSessao } from '../screens/contratos';
import { instanteLocalIso, paraErroApp } from '../shared/tipos';
import type {
  CodigoErro,
  EntradaConducao,
  EstadoChaves,
  LinhaTranscricao,
  Modo,
  NumeroSessao,
  Progresso,
} from '../shared/tipos';

export interface AcoesSessao {
  proxima(): void;
  anterior(): void;
  pausarOuRetomar(): void;
  aprofundar(): void;
  irParaBloco(blocoId: string): void;
  alternarModo(modo: Modo): void;
  registrarEscrita(texto: string): void;
  /** Parada manual da captura (botão "Concluir resposta"). */
  concluirResposta(): void;
  encerrar(): void;
  limparErro(): void;
}

export interface ControleSessao {
  readonly estado: EstadoSessao;
  /** RMS 0..1 do microfone, para as barras de áudio. */
  readonly nivel: number;
  /** Voz só com chave do Grok guardada (ou em simulação). */
  readonly vozDisponivel: boolean;
  despachar(acao: Acao): void;
  readonly acoes: AcoesSessao;
}

/** Marca um efeito longo em curso; `cancelada` corta o resultado atrasado. */
interface Ficha {
  cancelada: boolean;
  parar(): void;
}

const MENSAGEM_SEM_PASTA = 'Nenhuma pasta de destino definida; a transcrição não pode ser gravada.';

const agoraIso = (): string => instanteLocalIso(new Date());

/** União preservando a ordem: os antigos primeiro. */
function unir(antigos: readonly string[], novos: readonly string[]): readonly string[] {
  const vistos = new Set(antigos);
  const resultado = [...antigos];
  for (const id of novos) {
    if (!vistos.has(id)) {
      vistos.add(id);
      resultado.push(id);
    }
  }
  return resultado;
}

function ultimoBlocoDaSessao(numero: NumeroSessao): string {
  const blocos = sessaoPorNumero(numero).blocos;
  const ultimo = blocos[blocos.length - 1];
  if (!ultimo) throw new Error(`A sessão ${numero} não tem blocos.`);
  return ultimo.id;
}

export function useSessao(props: PropsSessao): ControleSessao {
  const [estado, setEstado] = useState<EstadoSessao>(() =>
    criarSessao({
      sessao: props.sessao,
      modo: props.config.modo,
      voz: props.config.voz,
      retomarDoBlocoId: props.retomarDoBlocoId ?? undefined,
    }),
  );
  const [nivel, setNivel] = useState(0);
  const [chaves, setChaves] = useState<EstadoChaves | null>(null);

  // Espelhos fora do render: o estado que os efeitos assíncronos leem, as
  // props mais recentes (callbacks do App), o arquivo e o progresso em curso.
  const estadoRef = useRef(estado);
  const propsRef = useRef(props);
  propsRef.current = props;
  const arquivoRef = useRef('');
  /** Houve ao menos uma leitura ou transcrição por voz nesta execução. */
  const usouVoz = useRef(false);
  const progressoRef = useRef<Progresso>(props.progresso);
  const iniciado = useRef(false);
  const desmonteAgendado = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fila de escritas em disco: mantém a ordem das linhas e do progresso.
  const filaDeEscrita = useRef<Promise<void>>(Promise.resolve());

  // Efeitos longos em curso.
  const reproducao = useRef<Ficha | null>(null);
  // `controle` é null enquanto o microfone ainda está abrindo.
  const captura = useRef<{ ficha: Ficha; controle: Captura | null } | null>(null);
  const decisao = useRef<Ficha | null>(null);

  const pasta = (): string => propsRef.current.config.pasta ?? '';

  // -------------------------------------------------------------------------
  // Despacho
  // -------------------------------------------------------------------------

  const despacharRef = useRef<(acao: Acao) => void>(() => undefined);

  const despacharErro = useCallback((e: unknown, codigo: CodigoErro): void => {
    despacharRef.current({ tipo: 'erro', erro: paraErroApp(e, codigo) });
  }, []);

  /** Coloca uma escrita na fila; falhas viram ação `erro` e não derrubam a fila. */
  const enfileirar = useCallback(
    (tarefa: () => Promise<void>, codigo: CodigoErro): Promise<void> => {
      const proxima = filaDeEscrita.current.then(tarefa).catch((e: unknown) => {
        console.error('[sessão] falha ao gravar', e);
        despacharErro(e, codigo);
      });
      filaDeEscrita.current = proxima;
      return proxima;
    },
    [despacharErro],
  );

  // -------------------------------------------------------------------------
  // Efeitos
  // -------------------------------------------------------------------------

  const pararAudio = useCallback((): void => {
    if (reproducao.current) {
      reproducao.current.cancelada = true;
      reproducao.current.parar();
      reproducao.current = null;
    }
    if (captura.current) {
      captura.current.ficha.cancelada = true;
      captura.current.controle?.cancelar();
      captura.current = null;
    }
    if (decisao.current) {
      decisao.current.cancelada = true;
      decisao.current = null;
    }
    // No navegador a fala real vem do speechSynthesis, que a plataforma
    // dispara e não sabe interromper pelo contrato.
    if (propsRef.current.info.plataforma === 'navegador') window.speechSynthesis?.cancel();
    setNivel(0);
  }, []);

  const falar = useCallback(
    async (texto: string): Promise<void> => {
      // Só a leitura anterior é interrompida; captura e decisão em curso já
      // foram tratadas pelo `pararAudio` que o motor emite quando cabe.
      if (reproducao.current) {
        reproducao.current.cancelada = true;
        reproducao.current.parar();
      }
      const ficha: Ficha = { cancelada: false, parar: () => undefined };
      reproducao.current = ficha;
      try {
        usouVoz.current = true;
        const audio = await propsRef.current.plataforma.voz.falar(texto, estadoRef.current.voz);
        if (ficha.cancelada) return;
        const r = tocar(audio.audio, audio.mime);
        ficha.parar = r.parar;
        await r.fim;
        if (ficha.cancelada) return;
        reproducao.current = null;
        despacharRef.current({ tipo: 'leituraConcluida' });
      } catch (e) {
        if (ficha.cancelada) return;
        reproducao.current = null;
        despacharErro(e, 'api');
      }
    },
    [despacharErro],
  );

  const ouvir = useCallback(async (): Promise<void> => {
    const ficha: Ficha = { cancelada: false, parar: () => undefined };
    // A ficha entra antes de o microfone abrir: `pararAudio` nesse meio-tempo
    // a cancela e a captura é descartada assim que existir.
    const atual = { ficha, controle: null as Captura | null };
    captura.current = atual;
    let controle: Captura;
    try {
      controle = await iniciarCaptura({ aoNivel: setNivel });
    } catch (e) {
      if (ficha.cancelada) return;
      captura.current = null;
      despacharErro(e, 'microfone');
      return;
    }
    // Pausa, navegação ou erro enquanto o microfone abria: descarta sem despachar.
    if (ficha.cancelada || estadoRef.current.fase !== 'ouvindo') {
      controle.cancelar();
      if (captura.current === atual) captura.current = null;
      return;
    }
    atual.controle = controle;
    try {
      // `parar()` também resolve `fimAutomatico`; `cancelar()` o deixa pendente.
      const resultado = await controle.fimAutomatico;
      if (ficha.cancelada) return;
      setNivel(0);
      despacharRef.current({ tipo: 'capturaConcluida' });
      // A ficha continua registrada durante a transcrição: navegar ou pausar
      // nesse intervalo descarta o texto que ainda vai chegar.
      usouVoz.current = true;
      const transcrito = await propsRef.current.plataforma.voz.transcrever(resultado.audio, resultado.mime);
      if (ficha.cancelada) return;
      captura.current = null;
      despacharRef.current({
        tipo: 'respostaRegistrada',
        texto: transcrito.texto,
        origem: 'voz',
        instante: agoraIso(),
      });
    } catch (e) {
      if (ficha.cancelada) return;
      captura.current = null;
      despacharErro(e, 'api');
    }
  }, [despacharErro]);

  const decidir = useCallback(
    async (entrada: EntradaConducao): Promise<void> => {
      const ficha: Ficha = { cancelada: false, parar: () => undefined };
      decisao.current = ficha;
      try {
        const d = await propsRef.current.plataforma.conducao.decidir(entrada);
        if (ficha.cancelada || decisao.current !== ficha) return;
        decisao.current = null;
        despacharRef.current({ tipo: 'decisaoConducao', decisao: d, instante: agoraIso() });
      } catch (e) {
        if (ficha.cancelada || decisao.current !== ficha) return;
        decisao.current = null;
        despacharErro(e, 'api');
      }
    },
    [despacharErro],
  );

  const anexarLinha = useCallback(
    (linha: LinhaTranscricao, estadoNovo: EstadoSessao): void => {
      // A linha nova já está em `linhas`; o trecho é calculado contra as anteriores.
      const posicao = estadoNovo.linhas.findIndex((l) => l.id === linha.id);
      const anteriores = posicao >= 0 ? estadoNovo.linhas.slice(0, posicao) : estadoNovo.linhas;
      const texto = trechoDaLinha(anteriores, linha);
      const arquivo = arquivoRef.current;
      const destino = pasta();
      void enfileirar(
        () => propsRef.current.plataforma.transcricao.anexar(destino, arquivo, texto),
        'arquivo',
      );
    },
    [enfileirar],
  );

  const gravarProgresso = useCallback(
    (estadoNovo: EstadoSessao): void => {
      try {
        progressoRef.current = aoAvancar(progressoRef.current, estadoNovo.sessao, {
          blocoAtual: blocoAtual(estadoNovo).id,
          perguntasRespondidas: estadoNovo.respondidas,
          agora: agoraIso(),
        });
      } catch (e) {
        despacharErro(e, 'arquivo');
        return;
      }
      const progresso = progressoRef.current;
      const destino = pasta();
      void enfileirar(() => propsRef.current.plataforma.progresso.gravar(destino, progresso), 'arquivo');
    },
    [enfileirar, despacharErro],
  );

  const finalizar = useCallback(
    async (concluida: boolean, estadoFinal: EstadoSessao): Promise<void> => {
      const numero = estadoFinal.sessao;
      const instante = agoraIso();
      const gravada = progressoRef.current.sessoes[numero];
      // Numa retomada, o que foi respondido em execuções anteriores continua respondido.
      const previas = gravada.estado === 'incompleta' ? gravada.perguntasRespondidas : [];
      const respondidas = unir(previas, estadoFinal.respondidas);
      // O fechamento fica fora da contagem (decisão 2 do HANDOFF): "7 de 7", nunca "8 de 8".
      const totalPerguntas = perguntasDaSessao(numero).filter((p) => p.numero !== null).length;
      const respondidasNumeradas = respondidas.filter((id) => id !== FECHAMENTO.id).length;
      const blocoDeRetomada = blocoAtual(estadoFinal);
      const blocoAtualId = concluida ? ultimoBlocoDaSessao(numero) : blocoDeRetomada.id;

      const rodape = rodapeDaSessao({
        concluida,
        instante,
        segundos: estadoFinal.segundos,
        perguntasRespondidas: respondidasNumeradas,
        totalPerguntas,
        ...(concluida ? {} : { blocoDeRetomadaNome: blocoDeRetomada.nome }),
      });
      const arquivo = arquivoRef.current;
      const destino = pasta();
      await enfileirar(() => propsRef.current.plataforma.transcricao.anexar(destino, arquivo, rodape), 'arquivo');

      try {
        progressoRef.current = aoEncerrar(progressoRef.current, numero, {
          concluida,
          blocoAtual: blocoAtualId,
          perguntasRespondidas: estadoFinal.respondidas,
          agora: instante,
        });
        const progresso = progressoRef.current;
        await enfileirar(() => propsRef.current.plataforma.progresso.gravar(destino, progresso), 'arquivo');
      } catch (e) {
        // Depois de encerrada o motor ignora `erro`; fica o registro e a tela segue.
        console.error('[sessão] falha ao fechar o progresso', e);
      }

      const blocosCobertos = sessaoPorNumero(numero)
        .blocos.filter((b) => b.perguntas.some((q) => respondidas.includes(q.id)))
        .map((b) => b.id);
      const resultado: ResultadoSessao = {
        sessao: numero,
        concluida,
        arquivo,
        pasta: destino,
        segundos: estadoFinal.segundos,
        perguntasRespondidas: respondidas,
        totalPerguntas,
        blocosCobertos,
        blocoAtual: blocoAtualId,
        falas: estadoFinal.linhas.length,
        usouVoz: usouVoz.current,
        progresso: progressoRef.current,
      };
      propsRef.current.aoEncerrar(resultado);
    },
    [enfileirar],
  );

  /** Executa os efeitos na ordem; os longos ficam por último em cada transição. */
  const executarEfeitos = useCallback(
    async (efeitos: readonly Efeito[], estadoNovo: EstadoSessao): Promise<void> => {
      for (const efeito of efeitos) {
        try {
          switch (efeito.tipo) {
            case 'pararAudio':
              pararAudio();
              break;
            case 'anexarLinha':
              anexarLinha(efeito.linha, estadoNovo);
              break;
            case 'gravarProgresso':
              gravarProgresso(estadoNovo);
              break;
            case 'falar':
              await falar(efeito.texto);
              break;
            case 'ouvir':
              await ouvir();
              break;
            case 'decidir':
              await decidir(efeito.entrada);
              break;
            case 'finalizar':
              await finalizar(efeito.concluida, estadoNovo);
              break;
          }
        } catch (e) {
          despacharErro(e, 'desconhecido');
        }
      }
    },
    [pararAudio, anexarLinha, gravarProgresso, falar, ouvir, decidir, finalizar, despacharErro],
  );

  const despachar = useCallback(
    (acao: Acao): void => {
      const t = reduzir(estadoRef.current, acao);
      if (t.estado === estadoRef.current && t.efeitos.length === 0) return;
      estadoRef.current = t.estado;
      setEstado(t.estado);
      if (t.efeitos.length > 0) void executarEfeitos(t.efeitos, t.estado);
    },
    [executarEfeitos],
  );
  despacharRef.current = despachar;

  // -------------------------------------------------------------------------
  // Início, relógio, chaves, desmontagem
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (desmonteAgendado.current !== null) {
      // Remontagem imediata (StrictMode): a parada de áudio agendada não vale.
      clearTimeout(desmonteAgendado.current);
      desmonteAgendado.current = null;
    }
    if (!iniciado.current) {
      iniciado.current = true;
      const { sessao, retomarDoBlocoId, progresso, config, plataforma } = propsRef.current;
      const data = new Date();
      const instante = instanteLocalIso(data);
      const gravada = progresso.sessoes[sessao];
      const retomando = retomarDoBlocoId !== null && gravada.estado === 'incompleta';
      const arquivo = retomando ? gravada.arquivo : nomeDoArquivoDaSessao(sessao, data);
      arquivoRef.current = arquivo;
      const destino = config.pasta ?? '';

      if (destino === '') {
        despacharRef.current({ tipo: 'erro', erro: { codigo: 'arquivo', mensagem: MENSAGEM_SEM_PASTA } });
      }

      const abertura = retomando
        ? marcadorDeRetomada(instante, blocoAtual(estadoRef.current).nome)
        : cabecalhoDaSessao({ sessao, modo: config.modo, voz: config.voz, inicio: instante, arquivo });
      void enfileirar(() => plataforma.transcricao.anexar(destino, arquivo, abertura), 'arquivo');

      try {
        progressoRef.current = aoIniciar(progresso, sessao, { arquivo, modo: config.modo, agora: instante });
        const novo = progressoRef.current;
        void enfileirar(() => plataforma.progresso.gravar(destino, novo), 'arquivo');
      } catch (e) {
        despacharErro(e, 'arquivo');
      }

      despacharRef.current({ tipo: 'perguntar', indice: 0, instante: agoraIso() });
    }
    return () => {
      desmonteAgendado.current = setTimeout(() => {
        desmonteAgendado.current = null;
        pararAudio();
      }, 0);
    };
  }, [enfileirar, despacharErro, pararAudio]);

  useEffect(() => {
    const relogio = setInterval(() => despacharRef.current({ tipo: 'tique' }), 1000);
    return () => clearInterval(relogio);
  }, []);

  useEffect(() => {
    let ativo = true;
    propsRef.current.plataforma.chaves
      .estado()
      .then((e) => {
        if (ativo) setChaves(e);
      })
      .catch(() => {
        if (ativo) setChaves({ claude: 'ausente', grok: 'ausente' });
      });
    return () => {
      ativo = false;
    };
  }, []);

  // -------------------------------------------------------------------------
  // Ações da tela
  // -------------------------------------------------------------------------

  const vozDisponivel = props.info.simulada || chaves?.grok === 'guardada' || estado.modo === 'voz';

  const acoes: AcoesSessao = {
    proxima: () => despachar({ tipo: 'proxima', instante: agoraIso() }),
    anterior: () => despachar({ tipo: 'anterior', instante: agoraIso() }),
    pausarOuRetomar: () => {
      if (estadoRef.current.pausada) despachar({ tipo: 'retomar', instante: agoraIso() });
      else despachar({ tipo: 'pausar' });
    },
    aprofundar: () => despachar({ tipo: 'aprofundar', instante: agoraIso() }),
    irParaBloco: (blocoId) => despachar({ tipo: 'irParaBloco', blocoId, instante: agoraIso() }),
    alternarModo: (modo) => {
      if (modo === estadoRef.current.modo) return;
      if (modo === 'voz' && !vozDisponivel) return;
      despachar({ tipo: 'alternarModo', modo });
      propsRef.current.aoMudarConfig({ ...propsRef.current.config, modo });
    },
    registrarEscrita: (texto) =>
      despachar({ tipo: 'respostaRegistrada', texto, origem: 'escrita', instante: agoraIso() }),
    concluirResposta: () => {
      const controle = captura.current?.controle;
      if (!controle) return;
      // `parar()` resolve `fimAutomatico`, que o efeito `ouvir` está esperando.
      void controle.parar().catch((e: unknown) => despacharErro(e, 'microfone'));
    },
    encerrar: () => despachar({ tipo: 'encerrar', instante: agoraIso() }),
    limparErro: () => despachar({ tipo: 'limparErro' }),
  };

  return { estado, nivel, vozDisponivel, despachar, acoes };
}
