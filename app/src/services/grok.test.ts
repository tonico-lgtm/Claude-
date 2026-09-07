import { describe, expect, it } from 'vitest';
import {
  BASE_URL_PADRAO,
  criarVozGrok,
  interpretarRespostaStt,
  montarCorpoTts,
  nomeDoArquivoDeAudio,
  validarChaveGrok,
} from './grok';

const CHAVE = 'xai-teste-0123456789abcdefghijklmnop';

interface Chamada {
  readonly url: string;
  readonly init: RequestInit | undefined;
}

function fetchFalso(responder: (chamada: Chamada) => Response): { fetch: typeof fetch; chamadas: Chamada[] } {
  const chamadas: Chamada[] = [];
  const fn: typeof fetch = async (input, init) => {
    const chamada = { url: String(input), init };
    chamadas.push(chamada);
    return responder(chamada);
  };
  return { fetch: fn, chamadas };
}

const respostaJson = (corpo: unknown, status = 200): Response =>
  new Response(JSON.stringify(corpo), { status, headers: { 'content-type': 'application/json' } });

const respostaAudio = (bytes: number[], tipo = 'audio/mpeg'): Response =>
  new Response(new Uint8Array(bytes), { status: 200, headers: { 'content-type': tipo } });

const cabecalho = (chamada: Chamada | undefined, nome: string): string | null =>
  new Headers(chamada?.init?.headers).get(nome);

describe('montarCorpoTts', () => {
  it('tem exatamente os campos do contrato', () => {
    expect(montarCorpoTts('Olá.', 'leo')).toEqual({
      text: 'Olá.',
      voice_id: 'leo',
      language: 'pt',
      output_format: { codec: 'mp3', sample_rate: 44100, bit_rate: 192000 },
    });
  });
});

describe('interpretarRespostaStt', () => {
  it('lê text e duration', () => {
    expect(interpretarRespostaStt({ text: 'Sou advogada.', language: 'pt', duration: 2.5 })).toEqual({
      texto: 'Sou advogada.',
      duracao: 2.5,
    });
  });

  it('apara espaços e omite duracao quando não vem', () => {
    expect(interpretarRespostaStt({ text: '  Sou advogada. \n' })).toEqual({ texto: 'Sou advogada.' });
  });

  it('lança ErroApp sem text', () => {
    expect(() => interpretarRespostaStt({ language: 'pt' })).toThrow();
    try {
      interpretarRespostaStt({ text: 42 });
      throw new Error('deveria ter lançado');
    } catch (erro) {
      expect(erro).toMatchObject({ codigo: 'api' });
      expect(erro).not.toBeInstanceOf(Error);
    }
  });
});

describe('nomeDoArquivoDeAudio', () => {
  it('segue o mime', () => {
    expect(nomeDoArquivoDeAudio('audio/wav')).toBe('resposta.wav');
    expect(nomeDoArquivoDeAudio('audio/webm;codecs=opus')).toBe('resposta.webm');
    expect(nomeDoArquivoDeAudio('audio/mpeg')).toBe('resposta.mp3');
    expect(nomeDoArquivoDeAudio('')).toBe('resposta.wav');
  });
});

describe('falar', () => {
  it('POST /tts com bearer, JSON e devolve os bytes do áudio', async () => {
    const { fetch, chamadas } = fetchFalso(() => respostaAudio([1, 2, 3]));
    const voz = criarVozGrok({ chave: CHAVE, fetch });

    const falado = await voz.falar('Olá.', 'helios');

    expect(chamadas).toHaveLength(1);
    const chamada = chamadas[0];
    expect(chamada?.url).toBe(`${BASE_URL_PADRAO}/tts`);
    expect(chamada?.init?.method).toBe('POST');
    expect(cabecalho(chamada, 'authorization')).toBe(`Bearer ${CHAVE}`);
    expect(cabecalho(chamada, 'content-type')).toBe('application/json');
    expect(chamada?.init?.signal).toBeInstanceOf(AbortSignal);
    expect(JSON.parse(String(chamada?.init?.body))).toEqual(montarCorpoTts('Olá.', 'helios'));
    expect(falado.mime).toBe('audio/mpeg');
    expect(Array.from(new Uint8Array(falado.audio))).toEqual([1, 2, 3]);
  });

  it('respeita baseUrl configurada (com barra final)', async () => {
    const { fetch, chamadas } = fetchFalso(() => respostaAudio([0], 'application/octet-stream'));
    const falado = await criarVozGrok({ chave: CHAVE, baseUrl: 'http://localhost:9999/v1/', fetch }).falar('a', 'leo');
    expect(chamadas[0]?.url).toBe('http://localhost:9999/v1/tts');
    expect(falado.mime).toBe('audio/mpeg');
  });

  it('401 → chave-invalida', async () => {
    const { fetch } = fetchFalso(() => respostaJson({ error: 'unauthorized' }, 401));
    await expect(criarVozGrok({ chave: CHAVE, fetch }).falar('a', 'leo')).rejects.toMatchObject({
      codigo: 'chave-invalida',
      mensagem: 'Chave do Grok recusada.',
    });
  });

  it('500 → api com o status e o começo do corpo', async () => {
    const { fetch } = fetchFalso(() => new Response('internal boom', { status: 500 }));
    await expect(criarVozGrok({ chave: CHAVE, fetch }).falar('a', 'leo')).rejects.toMatchObject({
      codigo: 'api',
      mensagem: 'Erro na API do Grok (500).',
      detalhe: 'internal boom',
    });
  });

  it('JSON em vez de áudio → api', async () => {
    const { fetch } = fetchFalso(() => respostaJson({ audio: 'base64...' }));
    await expect(criarVozGrok({ chave: CHAVE, fetch }).falar('a', 'leo')).rejects.toMatchObject({
      codigo: 'api',
    });
  });

  it('falha de rede → rede', async () => {
    const fetchQuebrado: typeof fetch = async () => {
      throw new TypeError('fetch failed');
    };
    await expect(criarVozGrok({ chave: CHAVE, fetch: fetchQuebrado }).falar('a', 'leo')).rejects.toMatchObject({
      codigo: 'rede',
    });
  });
});

describe('transcrever', () => {
  it('POST /stt multipart com language, format e file por último', async () => {
    const { fetch, chamadas } = fetchFalso(() => respostaJson({ text: ' Sou advogada. ', duration: 1.2 }));
    const audio = new Uint8Array([82, 73, 70, 70]).buffer;

    const transcrito = await criarVozGrok({ chave: CHAVE, fetch }).transcrever(audio, 'audio/wav');

    expect(transcrito).toEqual({ texto: 'Sou advogada.', duracao: 1.2 });
    const chamada = chamadas[0];
    expect(chamada?.url).toBe(`${BASE_URL_PADRAO}/stt`);
    expect(chamada?.init?.method).toBe('POST');
    expect(cabecalho(chamada, 'authorization')).toBe(`Bearer ${CHAVE}`);
    // O content-type do multipart (com boundary) fica a cargo do fetch.
    expect(cabecalho(chamada, 'content-type')).toBeNull();

    const corpo = chamada?.init?.body;
    expect(corpo).toBeInstanceOf(FormData);
    if (!(corpo instanceof FormData)) throw new Error('corpo não é FormData');
    const entradas = Array.from(corpo.entries());
    expect(entradas.map(([nome]) => nome)).toEqual(['language', 'format', 'file']);
    expect(corpo.get('language')).toBe('pt');
    expect(corpo.get('format')).toBe('true');
    const arquivo = corpo.get('file');
    expect(arquivo).toBeInstanceOf(Blob);
    if (!(arquivo instanceof Blob)) throw new Error('file não é Blob');
    expect(arquivo.type).toBe('audio/wav');
    expect(arquivo.size).toBe(4);
    expect((arquivo as Blob & { name?: string }).name).toBe('resposta.wav');
  });

  it('nome .webm quando o mime é webm', async () => {
    const { fetch, chamadas } = fetchFalso(() => respostaJson({ text: 'x' }));
    await criarVozGrok({ chave: CHAVE, fetch }).transcrever(new ArrayBuffer(2), 'audio/webm');
    const corpo = chamadas[0]?.init?.body;
    if (!(corpo instanceof FormData)) throw new Error('corpo não é FormData');
    expect((corpo.get('file') as Blob & { name?: string }).name).toBe('resposta.webm');
  });

  it('resposta sem text → api', async () => {
    const { fetch } = fetchFalso(() => respostaJson({ language: 'pt' }));
    await expect(criarVozGrok({ chave: CHAVE, fetch }).transcrever(new ArrayBuffer(2), 'audio/wav')).rejects.toMatchObject({
      codigo: 'api',
    });
  });

  it('403 → chave-invalida', async () => {
    const { fetch } = fetchFalso(() => respostaJson({ error: 'forbidden' }, 403));
    await expect(criarVozGrok({ chave: CHAVE, fetch }).transcrever(new ArrayBuffer(2), 'audio/wav')).rejects.toMatchObject({
      codigo: 'chave-invalida',
    });
  });
});

describe('validarChaveGrok', () => {
  it('GET /models 200 → ok', async () => {
    const { fetch, chamadas } = fetchFalso(() => respostaJson({ data: [] }));
    const resultado = await validarChaveGrok(CHAVE, { fetch });
    expect(resultado).toEqual({ motor: 'grok', ok: true, mensagem: 'Chave do Grok aceita.' });
    expect(chamadas[0]?.url).toBe(`${BASE_URL_PADRAO}/models`);
    expect(chamadas[0]?.init?.method).toBe('GET');
    expect(cabecalho(chamadas[0], 'authorization')).toBe(`Bearer ${CHAVE}`);
  });

  it('401 → recusada; 503 → mensagem com o status; rede → mensagem de rede', async () => {
    const r401 = await validarChaveGrok(CHAVE, { fetch: fetchFalso(() => respostaJson({}, 401)).fetch });
    expect(r401).toEqual({ motor: 'grok', ok: false, mensagem: 'Chave do Grok recusada.' });

    const r503 = await validarChaveGrok(CHAVE, { fetch: fetchFalso(() => respostaJson({}, 503)).fetch });
    expect(r503).toEqual({ motor: 'grok', ok: false, mensagem: 'Erro na API do Grok (503).' });

    const fetchQuebrado: typeof fetch = async () => {
      throw new TypeError('fetch failed');
    };
    const rRede = await validarChaveGrok(CHAVE, { fetch: fetchQuebrado });
    expect(rRede.ok).toBe(false);
    expect(rRede.mensagem).toBe('Sem conexão com a API do Grok.');
  });
});
