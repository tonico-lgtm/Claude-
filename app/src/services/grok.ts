/**
 * Voz — TTS e transcrição pela API do Grok (xAI).
 *
 * PROVISÓRIO. Os endpoints `/tts` e `/stt`, os nomes dos campos e o formato
 * das respostas foram verificados apenas por fontes secundárias: docs.x.ai
 * estava inacessível nesta sessão e nenhuma chamada real foi feita. Este
 * módulo continua provisório até uma chamada real passar. Por isso a base
 * URL é configurável (opção `baseUrl`; o main a lê da variável
 * `ENTREVISTA_TWIN_XAI_BASE_URL`).
 *
 * Roda no processo principal, mas só usa APIs web-padrão (`fetch`,
 * `FormData`, `Blob`, `AbortController`): é compilado pelos dois `tsconfig`.
 * Erros saem como `ErroApp` (objeto literal — o IPC não preserva classes).
 */

import type { AudioFalado, ErroApp, ResultadoValidacaoChave, Transcrito, VozId } from '../shared/tipos';

export const BASE_URL_PADRAO = 'https://api.x.ai/v1';

const TIMEOUT_MS = 60_000;

/** Quanto do corpo de uma resposta de erro vai para `detalhe`. */
const LIMITE_DETALHE = 200;

export interface OpcoesGrok {
  readonly chave: string;
  readonly baseUrl?: string;
  readonly fetch?: typeof fetch;
}

export interface VozGrok {
  falar(texto: string, voz: VozId): Promise<AudioFalado>;
  transcrever(audio: ArrayBuffer, mime: string): Promise<Transcrito>;
}

// ---------------------------------------------------------------------------
// Funções puras (testáveis sem rede)
// ---------------------------------------------------------------------------

export interface CorpoTts {
  readonly text: string;
  readonly voice_id: VozId;
  readonly language: 'pt';
  readonly output_format: {
    readonly codec: 'mp3';
    readonly sample_rate: 44100;
    readonly bit_rate: 192000;
  };
}

export function montarCorpoTts(texto: string, voz: VozId): CorpoTts {
  return {
    text: texto,
    voice_id: voz,
    language: 'pt',
    output_format: { codec: 'mp3', sample_rate: 44100, bit_rate: 192000 },
  };
}

/** Lê `{ text, duration? }`; lança `ErroApp` se não houver `text` em string. */
export function interpretarRespostaStt(json: unknown): Transcrito {
  if (typeof json !== 'object' || json === null || !('text' in json) || typeof json.text !== 'string') {
    throw erroApi('Resposta da transcrição sem o campo "text".', resumo(JSON.stringify(json)));
  }
  const duracao = 'duration' in json && typeof json.duration === 'number' ? json.duration : undefined;
  return { texto: json.text.trim(), ...(duracao !== undefined ? { duracao } : {}) };
}

/** Nome do arquivo enviado no multipart, coerente com o mime do áudio. */
export function nomeDoArquivoDeAudio(mime: string): string {
  const base = mime.split(';')[0]?.trim().toLowerCase() ?? '';
  if (base === 'audio/webm') return 'resposta.webm';
  if (base === 'audio/ogg') return 'resposta.ogg';
  if (base === 'audio/mpeg' || base === 'audio/mp3') return 'resposta.mp3';
  if (base === 'audio/mp4' || base === 'audio/m4a') return 'resposta.m4a';
  return 'resposta.wav';
}

// ---------------------------------------------------------------------------
// Erros
// ---------------------------------------------------------------------------

const resumo = (texto: string | undefined): string | undefined =>
  texto ? texto.slice(0, LIMITE_DETALHE) : undefined;

function erroApi(mensagem: string, detalhe?: string): ErroApp {
  return { codigo: 'api', mensagem, ...(detalhe ? { detalhe } : {}) };
}

function erroDeStatus(status: number, corpo: string): ErroApp {
  if (status === 401 || status === 403) {
    return { codigo: 'chave-invalida', mensagem: 'Chave do Grok recusada.', ...(corpo ? { detalhe: resumo(corpo) } : {}) };
  }
  return erroApi(`Erro na API do Grok (${status}).`, resumo(corpo));
}

function erroDeRede(erro: unknown): ErroApp {
  const abortado = erro instanceof Error && erro.name === 'AbortError';
  return {
    codigo: 'rede',
    mensagem: abortado ? 'A API do Grok não respondeu a tempo.' : 'Sem conexão com a API do Grok.',
    ...(erro instanceof Error ? { detalhe: erro.message } : {}),
  };
}

function ehErroApp(erro: unknown): erro is ErroApp {
  return typeof erro === 'object' && erro !== null && 'codigo' in erro && 'mensagem' in erro;
}

// ---------------------------------------------------------------------------
// Transporte
// ---------------------------------------------------------------------------

interface Transporte {
  readonly base: string;
  readonly chave: string;
  readonly fetchFn: typeof fetch;
}

function criarTransporte(chave: string, baseUrl: string | undefined, fetchFn: typeof fetch | undefined): Transporte {
  const base = (baseUrl ?? BASE_URL_PADRAO).replace(/\/+$/, '');
  // Só se resolve o global na hora da chamada: no main ele existe; nos testes vem injetado.
  const fn: typeof fetch = fetchFn ?? ((entrada, init) => fetch(entrada, init));
  return { base, chave, fetchFn: fn };
}

/** Faz a chamada com bearer e timeout; lança `ErroApp` para status fora de 2xx e falha de rede. */
async function requisitar(
  t: Transporte,
  caminho: string,
  init: { method: 'GET' | 'POST'; body?: string | FormData; contentType?: string },
): Promise<Response> {
  const cabecalhos: Record<string, string> = { Authorization: `Bearer ${t.chave}` };
  if (init.contentType) cabecalhos['Content-Type'] = init.contentType;

  const controlador = new AbortController();
  const temporizador = setTimeout(() => controlador.abort(), TIMEOUT_MS);
  let resposta: Response;
  try {
    resposta = await t.fetchFn(`${t.base}${caminho}`, {
      method: init.method,
      headers: cabecalhos,
      ...(init.body !== undefined ? { body: init.body } : {}),
      signal: controlador.signal,
    });
  } catch (erro) {
    throw erroDeRede(erro);
  } finally {
    clearTimeout(temporizador);
  }

  if (!resposta.ok) {
    const corpo = await resposta.text().catch(() => '');
    throw erroDeStatus(resposta.status, corpo);
  }
  return resposta;
}

function tipoDoConteudo(resposta: Response): string {
  return (resposta.headers.get('content-type') ?? '').split(';')[0]?.trim().toLowerCase() ?? '';
}

// ---------------------------------------------------------------------------
// API pública
// ---------------------------------------------------------------------------

export function criarVozGrok(opcoes: OpcoesGrok): VozGrok {
  const t = criarTransporte(opcoes.chave, opcoes.baseUrl, opcoes.fetch);

  return {
    async falar(texto: string, voz: VozId): Promise<AudioFalado> {
      const resposta = await requisitar(t, '/tts', {
        method: 'POST',
        body: JSON.stringify(montarCorpoTts(texto, voz)),
        contentType: 'application/json',
      });
      const tipo = tipoDoConteudo(resposta);
      if (tipo.startsWith('audio/') || tipo === 'application/octet-stream') {
        const audio = await resposta.arrayBuffer();
        // Pedimos mp3; sem content-type específico, é isso que assumimos.
        return { audio, mime: tipo === 'application/octet-stream' ? 'audio/mpeg' : tipo };
      }
      const corpo = await resposta.text().catch(() => '');
      throw erroApi(
        tipo === 'application/json'
          ? 'A API do Grok devolveu JSON em vez de áudio.'
          : `A API do Grok devolveu um conteúdo inesperado (${tipo || 'sem content-type'}).`,
        resumo(corpo),
      );
    },

    async transcrever(audio: ArrayBuffer, mime: string): Promise<Transcrito> {
      // `file` por último: alguns servidores de multipart leem os campos em ordem.
      const corpo = new FormData();
      corpo.append('language', 'pt');
      corpo.append('format', 'true');
      corpo.append('file', new Blob([audio], { type: mime }), nomeDoArquivoDeAudio(mime));
      const resposta = await requisitar(t, '/stt', { method: 'POST', body: corpo });
      let json: unknown;
      try {
        json = await resposta.json();
      } catch (erro) {
        throw erroApi('Resposta da transcrição não é JSON.', erro instanceof Error ? erro.message : undefined);
      }
      return interpretarRespostaStt(json);
    },
  };
}

/** `GET {base}/models` com o bearer: 200 → ok; 401/403 → recusada; outros → mensagem com o status. */
export async function validarChaveGrok(
  chave: string,
  opcoes: { baseUrl?: string; fetch?: typeof fetch } = {},
): Promise<ResultadoValidacaoChave> {
  const t = criarTransporte(chave, opcoes.baseUrl, opcoes.fetch);
  try {
    await requisitar(t, '/models', { method: 'GET' });
    return { motor: 'grok', ok: true, mensagem: 'Chave do Grok aceita.' };
  } catch (erro) {
    const mensagem = ehErroApp(erro) ? erro.mensagem : erro instanceof Error ? erro.message : String(erro);
    return { motor: 'grok', ok: false, mensagem };
  }
}
