import { describe, expect, it } from 'vitest';
import { REGRA_DE_CONDUCAO, blocoDaPergunta, PERGUNTAS_NUMERADAS } from '../roteiro/roteiro';
import { entradaDeConducao, type EntradaConducao } from '../shared/tipos';
import {
  PERGUNTA_GENERICA,
  criarCondutor,
  montarPedido,
  montarSistema,
  validarChaveClaude,
} from './claude';

const CHAVE = 'sk-ant-teste-0123456789abcdefghijklmnop';

const q01 = PERGUNTAS_NUMERADAS[0];
const q18 = PERGUNTAS_NUMERADAS.find((p) => p.id === 'q18');
if (!q01 || !q18) throw new Error('Roteiro v1 sem q01/q18.');

const entrada = (resposta: string, forcar = false): EntradaConducao =>
  entradaDeConducao(1, blocoDaPergunta(q01.id).nome, q01, resposta, forcar);

/** Mensagem no formato da API (`interface Message` do SDK) com um único bloco de texto. */
function mensagemDaApi(texto: string, stopReason: 'end_turn' | 'refusal' = 'end_turn'): unknown {
  return {
    id: 'msg_teste',
    type: 'message',
    role: 'assistant',
    model: 'claude-opus-5',
    content: stopReason === 'refusal' ? [] : [{ type: 'text', text: texto, citations: null }],
    stop_reason: stopReason,
    stop_sequence: null,
    stop_details: stopReason === 'refusal' ? { type: 'refusal', category: null, explanation: null } : null,
    container: null,
    usage: {
      input_tokens: 10,
      output_tokens: 5,
      cache_creation_input_tokens: null,
      cache_read_input_tokens: null,
      cache_creation: null,
      inference_geo: null,
      output_tokens_details: null,
      server_tool_use: null,
      service_tier: null,
      speed: null,
    },
  };
}

interface Chamada {
  readonly url: string;
  readonly init: RequestInit | undefined;
}

/** `fetch` falso: registra as chamadas e devolve sempre a mesma resposta. */
function fetchFalso(corpo: unknown, status = 200): { fetch: typeof fetch; chamadas: Chamada[] } {
  const chamadas: Chamada[] = [];
  const fn: typeof fetch = async (input, init) => {
    chamadas.push({ url: String(input), init });
    return new Response(JSON.stringify(corpo), {
      status,
      headers: { 'content-type': 'application/json', 'request-id': 'req_teste' },
    });
  };
  return { fetch: fn, chamadas };
}

function corpoDaChamada(chamada: Chamada | undefined): Record<string, unknown> {
  const corpo = chamada?.init?.body;
  if (typeof corpo !== 'string') throw new Error('Corpo da chamada não é string.');
  return JSON.parse(corpo) as Record<string, unknown>;
}

describe('montarSistema', () => {
  it('inclui a regra geral de condução e o esquema esperado', () => {
    const sistema = montarSistema();
    expect(sistema).toContain(REGRA_DE_CONDUCAO);
    expect(sistema).toContain('"aprofundar"');
    expect(sistema).toContain('"pergunta"');
    expect(sistema).toContain('"motivo"');
    expect(sistema).toContain('25 palavras');
    expect(sistema).toContain('Português do Brasil');
  });

  it('é estável entre chamadas (cacheável)', () => {
    expect(montarSistema()).toBe(montarSistema());
  });
});

describe('montarPedido', () => {
  it('leva a pergunta, a regra e a resposta literal', () => {
    const pedido = montarPedido(entrada('Sou advogada.'));
    expect(pedido).toContain(q01.texto);
    expect(pedido).toContain(q01.regra);
    expect(pedido).toContain('Sou advogada.');
    expect(pedido).toContain('Pergunta 1');
    expect(pedido).toContain('Bloco: Quem é');
    expect(pedido).not.toContain('FORÇADO');
  });

  it('marca o pedido forçado e lista as opções da múltipla escolha', () => {
    const q08 = PERGUNTAS_NUMERADAS.find((p) => p.id === 'q08');
    if (!q08) throw new Error('Sem q08.');
    const pedido = montarPedido(entradaDeConducao(1, 'Voz e escrita', q08, 'C — a terceira', true));
    expect(pedido).toContain('FORÇADO');
    expect(pedido).toContain('múltipla escolha');
    expect(pedido).toContain('A. Segue a análise solicitada, conforme conversamos.');
  });
});

describe('decidir', () => {
  it('parseia a saída estruturada e devolve origem claude', async () => {
    const saida = { aprofundar: true, pergunta: 'Pode dar um exemplo de quando usou essa apresentação?', motivo: 'Sem exemplo.' };
    const { fetch, chamadas } = fetchFalso(mensagemDaApi(JSON.stringify(saida)));
    const condutor = criarCondutor({ chave: CHAVE, fetch });

    const decisao = await condutor.decidir(entrada('Sou advogada.'));

    expect(decisao).toEqual({ ...saida, origem: 'claude' });
    expect(chamadas).toHaveLength(1);
    expect(chamadas[0]?.url).toBe('https://api.anthropic.com/v1/messages');
    const corpo = corpoDaChamada(chamadas[0]);
    expect(corpo['model']).toBe('claude-opus-5');
    expect(corpo['max_tokens']).toBe(1024);
    expect(corpo['output_config']).toMatchObject({ effort: 'low', format: { type: 'json_schema' } });
    expect(corpo['system']).toEqual([
      { type: 'text', text: montarSistema(), cache_control: { type: 'ephemeral' } },
    ]);
    expect(corpo).not.toHaveProperty('thinking');
  });

  it('aprofundar=false vira pergunta null mesmo se o modelo mandou texto', async () => {
    const saida = { aprofundar: false, pergunta: 'Sobra.', motivo: 'Já tem exemplo.' };
    const { fetch } = fetchFalso(mensagemDaApi(JSON.stringify(saida)));
    const decisao = await criarCondutor({ chave: CHAVE, fetch }).decidir(entrada('Resposta com exemplo.'));
    expect(decisao).toEqual({ aprofundar: false, pergunta: null, motivo: 'Já tem exemplo.', origem: 'claude' });
  });

  it('stop_reason refusal → origem recusa, sem aprofundar', async () => {
    const { fetch } = fetchFalso(mensagemDaApi('', 'refusal'));
    const decisao = await criarCondutor({ chave: CHAVE, fetch }).decidir(entrada('Qualquer coisa.'));
    expect(decisao.origem).toBe('recusa');
    expect(decisao.aprofundar).toBe(false);
    expect(decisao.pergunta).toBeNull();
  });

  it('status 401 → origem erro com mensagem de chave recusada (nunca lança)', async () => {
    const { fetch } = fetchFalso(
      { type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } },
      401,
    );
    const decisao = await criarCondutor({ chave: CHAVE, fetch }).decidir(entrada('Sou advogada.'));
    expect(decisao).toEqual({
      aprofundar: false,
      pergunta: null,
      motivo: 'Chave do Claude recusada.',
      origem: 'erro',
    });
  });

  it('falha de rede → origem erro, sem lançar', async () => {
    const fetchQuebrado: typeof fetch = async () => {
      throw new TypeError('fetch failed');
    };
    const decisao = await criarCondutor({ chave: CHAVE, fetch: fetchQuebrado }).decidir(entrada('Oi.'));
    expect(decisao.origem).toBe('erro');
    expect(decisao.aprofundar).toBe(false);
    expect(decisao.motivo).toContain('Sem conexão');
  });

  it('texto que não é JSON válido → origem erro', async () => {
    const { fetch } = fetchFalso(mensagemDaApi('não sei'));
    const decisao = await criarCondutor({ chave: CHAVE, fetch }).decidir(entrada('Oi.'));
    expect(decisao.origem).toBe('erro');
    expect(decisao.aprofundar).toBe(false);
  });

  it('permiteAprofundamento=false → origem regra, sem chamar a API', async () => {
    const { fetch, chamadas } = fetchFalso(mensagemDaApi('{}'));
    const semAprofundamento = entradaDeConducao(2, 'Pessoas e tom', q18, 'Formal com juiz.', false);
    const decisao = await criarCondutor({ chave: CHAVE, fetch }).decidir(semAprofundamento);
    expect(decisao.origem).toBe('regra');
    expect(decisao.aprofundar).toBe(false);
    expect(chamadas).toHaveLength(0);
  });

  it('forçado com o modelo devolvendo aprofundar=false → pergunta genérica com aprofundar=true', async () => {
    const saida = { aprofundar: false, pergunta: null, motivo: 'Já está completa.' };
    const { fetch } = fetchFalso(mensagemDaApi(JSON.stringify(saida)));
    const decisao = await criarCondutor({ chave: CHAVE, fetch }).decidir(entrada('Resposta longa.', true));
    expect(decisao).toEqual({
      aprofundar: true,
      pergunta: PERGUNTA_GENERICA,
      motivo: 'Já está completa.',
      origem: 'claude',
    });
  });

  it('forçado com pergunta do modelo → usa a pergunta do modelo', async () => {
    const saida = { aprofundar: true, pergunta: 'Qual foi a última vez?', motivo: 'Forçado.' };
    const { fetch } = fetchFalso(mensagemDaApi(JSON.stringify(saida)));
    const decisao = await criarCondutor({ chave: CHAVE, fetch }).decidir(entrada('Resposta.', true));
    expect(decisao.pergunta).toBe('Qual foi a última vez?');
    expect(decisao.aprofundar).toBe(true);
  });
});

describe('validarChaveClaude', () => {
  it('200 em models.list → ok', async () => {
    const { fetch, chamadas } = fetchFalso({ data: [], has_more: false, first_id: null, last_id: null });
    const resultado = await validarChaveClaude(CHAVE, fetch);
    expect(resultado).toEqual({ motor: 'claude', ok: true, mensagem: 'Chave do Claude aceita.' });
    expect(chamadas[0]?.url).toContain('/v1/models');
    expect(chamadas[0]?.url).toContain('limit=1');
    const cabecalhos = new Headers(chamadas[0]?.init?.headers);
    expect(cabecalhos.get('x-api-key')).toBe(CHAVE);
  });

  it('401 → ok=false com chave recusada', async () => {
    const { fetch } = fetchFalso(
      { type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } },
      401,
    );
    const resultado = await validarChaveClaude(CHAVE, fetch);
    expect(resultado).toEqual({ motor: 'claude', ok: false, mensagem: 'Chave do Claude recusada.' });
  });
});
