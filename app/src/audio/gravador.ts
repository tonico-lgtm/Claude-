/**
 * Gravador — microfone → WAV 16 kHz mono 16 bits, com nível RMS por bloco e
 * detecção de silêncio.
 *
 * Usa `ScriptProcessorNode`, que está deprecated mas continua funcionando no
 * Chromium do Electron: dispensa um arquivo de AudioWorklet separado (que a
 * CSP e o empacotamento por `file://` complicariam) e entrega o PCM em
 * `Float32Array` no próprio thread, o que basta para uma captura de fala.
 *
 * Detecção de silêncio: o silêncio só começa a contar depois de haver fala
 * acumulada (`minFalaMs`); `silencioMs` seguidos abaixo do limiar encerram
 * a captura por `fimAutomatico`. `maxMs` encerra de qualquer jeito, com o
 * áudio que houver. O tempo vem da contagem de amostras, não do relógio.
 */

import type { ErroApp } from '../shared/tipos';

export interface OpcoesCaptura {
  /** Chamado a cada bloco com o RMS (0..1) — alimenta o indicador de áudio. */
  aoNivel?(rms: number): void;
  /** Silêncio contínuo, após fala, que encerra a captura. Padrão 2500. */
  readonly silencioMs?: number;
  /** Duração máxima da captura. Padrão 300000 (5 min). */
  readonly maxMs?: number;
  /** Fala mínima acumulada antes de o silêncio passar a contar. Padrão 600. */
  readonly minFalaMs?: number;
}

export interface ResultadoCaptura {
  readonly audio: ArrayBuffer;
  readonly mime: 'audio/wav';
}

export interface Captura {
  /** Parada manual: fecha o microfone e devolve o WAV. */
  parar(): Promise<ResultadoCaptura>;
  /** Descarta tudo; `fimAutomatico` nunca resolve depois disto. */
  cancelar(): void;
  /** Resolve quando o silêncio ou o tempo máximo encerram a captura — ou quando `parar()` é chamado. */
  readonly fimAutomatico: Promise<ResultadoCaptura>;
}

const TAXA_ALVO = 16_000;
const TAMANHO_DO_BLOCO = 4096;
/** RMS abaixo disto é silêncio; acima, fala. Calibrado para microfone de mesa com supressão de ruído. */
const LIMIAR_DE_FALA = 0.015;

const PADRAO = { silencioMs: 2500, maxMs: 300_000, minFalaMs: 600 } as const;

// ---------------------------------------------------------------------------
// Erros
// ---------------------------------------------------------------------------

function erroDeMicrofone(mensagem: string, detalhe?: string): ErroApp {
  return { codigo: 'microfone', mensagem, ...(detalhe ? { detalhe } : {}) };
}

/** Traduz os `DOMException` do `getUserMedia` em mensagens que a tela pode mostrar. */
function interpretarErroDeCaptura(e: unknown): ErroApp {
  const nome = e instanceof DOMException ? e.name : e instanceof Error ? e.name : '';
  const detalhe = e instanceof Error ? e.message : undefined;
  switch (nome) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
    case 'SecurityError':
      return erroDeMicrofone('Microfone não autorizado.', detalhe);
    case 'NotFoundError':
    case 'DevicesNotFoundError':
    case 'OverconstrainedError':
      return erroDeMicrofone('Nenhum microfone encontrado.', detalhe);
    case 'NotReadableError':
    case 'TrackStartError':
      return erroDeMicrofone('O microfone está em uso por outro programa ou indisponível.', detalhe);
    default:
      return erroDeMicrofone('Não foi possível abrir o microfone.', detalhe);
  }
}

// ---------------------------------------------------------------------------
// PCM → WAV
// ---------------------------------------------------------------------------

/** Reamostragem por interpolação linear — suficiente para fala que vai para transcrição. */
export function reamostrar(amostras: Float32Array, taxaOrigem: number, taxaDestino: number): Float32Array {
  if (taxaOrigem === taxaDestino || amostras.length === 0) return amostras;
  const razao = taxaOrigem / taxaDestino;
  const total = Math.max(1, Math.round(amostras.length / razao));
  const saida = new Float32Array(total);
  const ultimo = amostras.length - 1;
  for (let i = 0; i < total; i++) {
    const posicao = i * razao;
    const indice = Math.min(ultimo, Math.floor(posicao));
    const proximo = Math.min(ultimo, indice + 1);
    const fracao = posicao - indice;
    const a = amostras[indice] ?? 0;
    const b = amostras[proximo] ?? a;
    saida[i] = a + (b - a) * fracao;
  }
  return saida;
}

/** WAV PCM 16 bits mono na taxa indicada; cabeçalho RIFF de 44 bytes. */
export function codificarWav(amostras: Float32Array, taxa: number): ArrayBuffer {
  const bytesDeDados = amostras.length * 2;
  const buffer = new ArrayBuffer(44 + bytesDeDados);
  const vista = new DataView(buffer);
  const ascii = (posicao: number, texto: string): void => {
    for (let i = 0; i < texto.length; i++) vista.setUint8(posicao + i, texto.charCodeAt(i));
  };
  ascii(0, 'RIFF');
  vista.setUint32(4, 36 + bytesDeDados, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  vista.setUint32(16, 16, true);
  vista.setUint16(20, 1, true); // PCM
  vista.setUint16(22, 1, true); // mono
  vista.setUint32(24, taxa, true);
  vista.setUint32(28, taxa * 2, true);
  vista.setUint16(32, 2, true);
  vista.setUint16(34, 16, true);
  ascii(36, 'data');
  vista.setUint32(40, bytesDeDados, true);
  let posicao = 44;
  for (let i = 0; i < amostras.length; i++) {
    const valor = Math.max(-1, Math.min(1, amostras[i] ?? 0));
    vista.setInt16(posicao, valor < 0 ? valor * 0x8000 : valor * 0x7fff, true);
    posicao += 2;
  }
  return buffer;
}

function juntar(blocos: readonly Float32Array[], total: number): Float32Array {
  const saida = new Float32Array(total);
  let posicao = 0;
  for (const bloco of blocos) {
    saida.set(bloco, posicao);
    posicao += bloco.length;
  }
  return saida;
}

export function rmsDoBloco(bloco: Float32Array): number {
  if (bloco.length === 0) return 0;
  let soma = 0;
  for (let i = 0; i < bloco.length; i++) {
    const v = bloco[i] ?? 0;
    soma += v * v;
  }
  return Math.sqrt(soma / bloco.length);
}

// ---------------------------------------------------------------------------
// Captura
// ---------------------------------------------------------------------------

async function abrirMicrofone(): Promise<MediaStream> {
  const dispositivos = navigator.mediaDevices;
  if (!dispositivos || typeof dispositivos.getUserMedia !== 'function') {
    throw erroDeMicrofone('Captura de áudio não disponível neste ambiente.');
  }
  try {
    return await dispositivos.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 },
      video: false,
    });
  } catch (e) {
    throw interpretarErroDeCaptura(e);
  }
}

/** Pede o contexto já em 16 kHz; se o navegador recusar, reamostra na saída. */
function criarContexto(): AudioContext {
  try {
    return new AudioContext({ sampleRate: TAXA_ALVO });
  } catch {
    return new AudioContext();
  }
}

export async function iniciarCaptura(opcoes: OpcoesCaptura = {}): Promise<Captura> {
  const silencioMs = opcoes.silencioMs ?? PADRAO.silencioMs;
  const maxMs = opcoes.maxMs ?? PADRAO.maxMs;
  const minFalaMs = opcoes.minFalaMs ?? PADRAO.minFalaMs;

  const fluxo = await abrirMicrofone();
  let contexto: AudioContext;
  try {
    contexto = criarContexto();
  } catch (e) {
    fluxo.getTracks().forEach((t) => t.stop());
    throw erroDeMicrofone('Não foi possível iniciar o processamento de áudio.', e instanceof Error ? e.message : undefined);
  }
  const taxa = contexto.sampleRate;
  const fonte = contexto.createMediaStreamSource(fluxo);
  const processador = contexto.createScriptProcessor(TAMANHO_DO_BLOCO, 1, 1);
  // O ScriptProcessor só dispara ligado ao destino; o ganho zero evita ouvir o próprio microfone.
  const mudo = contexto.createGain();
  mudo.gain.value = 0;

  const blocos: Float32Array[] = [];
  let totalDeAmostras = 0;
  let falaMs = 0;
  let silencioSeguidoMs = 0;
  let encerrada = false;

  let resolverFim: (r: ResultadoCaptura) => void = () => undefined;
  const fimAutomatico = new Promise<ResultadoCaptura>((res) => {
    resolverFim = res;
  });

  const desligar = (): void => {
    processador.onaudioprocess = null;
    try {
      fonte.disconnect();
      processador.disconnect();
      mudo.disconnect();
    } catch {
      // Já desconectado.
    }
    fluxo.getTracks().forEach((t) => t.stop());
    void contexto.close().catch(() => undefined);
  };

  const montarResultado = (): ResultadoCaptura => {
    const pcm = reamostrar(juntar(blocos, totalDeAmostras), taxa, TAXA_ALVO);
    return { audio: codificarWav(pcm, TAXA_ALVO), mime: 'audio/wav' };
  };

  let resultado: ResultadoCaptura | null = null;
  const encerrar = (): ResultadoCaptura => {
    if (resultado) return resultado;
    encerrada = true;
    desligar();
    resultado = montarResultado();
    resolverFim(resultado);
    return resultado;
  };

  processador.onaudioprocess = (evento) => {
    if (encerrada) return;
    // Cópia: o buffer de entrada é reaproveitado pelo navegador no bloco seguinte.
    const bloco = new Float32Array(evento.inputBuffer.getChannelData(0));
    blocos.push(bloco);
    totalDeAmostras += bloco.length;
    const blocoMs = (bloco.length / taxa) * 1000;

    const rms = rmsDoBloco(bloco);
    opcoes.aoNivel?.(rms);

    if (rms >= LIMIAR_DE_FALA) {
      falaMs += blocoMs;
      silencioSeguidoMs = 0;
    } else if (falaMs >= minFalaMs) {
      silencioSeguidoMs += blocoMs;
    }

    const decorridoMs = (totalDeAmostras / taxa) * 1000;
    if (silencioSeguidoMs >= silencioMs || decorridoMs >= maxMs) encerrar();
  };

  fonte.connect(processador);
  processador.connect(mudo);
  mudo.connect(contexto.destination);
  if (contexto.state === 'suspended') await contexto.resume().catch(() => undefined);

  return {
    fimAutomatico,
    parar: async () => encerrar(),
    cancelar: () => {
      if (encerrada) return;
      encerrada = true;
      desligar();
      blocos.length = 0;
    },
  };
}
