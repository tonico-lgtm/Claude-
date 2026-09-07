import { describe, expect, it } from 'vitest';

import { FECHAMENTO, perguntasDaSessao } from '../roteiro/roteiro';
import type { DecisaoConducao } from '../shared/tipos';
import {
  chipsDeBlocos,
  criarSessao,
  ehUltima,
  perguntaAtual,
  podeAprofundar,
  progressoDaSessao,
  reduzir,
  rotuloAprofundar,
  rotuloFase,
  rotuloPergunta,
} from './sessao';
import type { Acao, Efeito, EstadoSessao } from './sessao';

const T = '2026-09-06T14:00:00-03:00';

const decisao = (aprofundar: boolean, pergunta: string | null = null): DecisaoConducao => ({
  aprofundar,
  pergunta,
  motivo: aprofundar ? 'Faltou exemplo concreto.' : 'A resposta já traz exemplo.',
  origem: 'claude',
});

/** Aplica as ações em sequência e junta os efeitos. */
function sequencia(
  inicial: EstadoSessao,
  acoes: readonly Acao[],
): { estado: EstadoSessao; efeitos: Efeito[] } {
  let estado = inicial;
  const efeitos: Efeito[] = [];
  for (const acao of acoes) {
    const r = reduzir(estado, acao);
    estado = r.estado;
    efeitos.push(...r.efeitos);
  }
  return { estado, efeitos };
}

const tipos = (efeitos: readonly Efeito[]): string[] => efeitos.map((f) => f.tipo);

/** Responde a pergunta atual (no modo em vigor) e fecha a decisão sem aprofundar. */
function responderSemAprofundar(e: EstadoSessao, texto = 'Resposta com exemplo concreto.'): EstadoSessao {
  const r =
    e.modo === 'voz'
      ? sequencia(e, [
          { tipo: 'leituraConcluida' },
          { tipo: 'capturaConcluida' },
          { tipo: 'respostaRegistrada', texto, origem: 'voz', instante: T },
        ])
      : reduzir(e, { tipo: 'respostaRegistrada', texto, origem: 'escrita', instante: T });
  if (r.estado.fase !== 'decidindo') return r.estado;
  return reduzir(r.estado, { tipo: 'decisaoConducao', decisao: decisao(false), instante: T }).estado;
}

/** Percorre toda a fila, respondendo tudo no modo em vigor. */
function responderTudo(inicial: EstadoSessao): EstadoSessao {
  let e = inicial;
  for (let i = 0; i < e.fila.length; i += 1) {
    e = reduzir(e, { tipo: 'perguntar', indice: i, instante: T }).estado;
    e = responderSemAprofundar(e);
  }
  return e;
}

describe('criarSessao', () => {
  it('monta a fila da sessão com o cursor no início', () => {
    const e = criarSessao({ sessao: 1, modo: 'voz', voz: 'helios' });
    expect(e.fila).toEqual(perguntasDaSessao(1));
    expect(e.fila).toHaveLength(10);
    expect(e.indice).toBe(0);
    expect(e.fase).toBe('ociosa');
    expect(e.visitadas).toEqual([]);
    expect(e.linhas).toEqual([]);
    expect(e.segundos).toBe(0);
  });

  it('retomada do bloco 2 da sessão 1 corta a fila (regra 8)', () => {
    const e = criarSessao({ sessao: 1, modo: 'escrita', voz: 'leo', retomarDoBlocoId: 'trajetoria' });
    expect(e.fila).toHaveLength(7);
    expect(perguntaAtual(e).id).toBe('q04');
    expect(e.visitadas).toEqual([]);
    expect(e.respondidas).toEqual([]);
    expect(progressoDaSessao(e)).toBe(0);
    const chips = chipsDeBlocos(e);
    expect(chips[0]).toMatchObject({ estado: 'concluido', navegavel: false });
    expect(chips[1]).toMatchObject({ estado: 'atual', navegavel: false });
    expect(chips[2]).toMatchObject({ estado: 'pendente', navegavel: false });
    const lida = reduzir(e, { tipo: 'perguntar', indice: 0, instante: T }).estado;
    expect(rotuloPergunta(lida)).toBe('Pergunta 4 de 26');
  });

  it('bloco de retomada desconhecido cai na fila inteira', () => {
    const e = criarSessao({ sessao: 2, modo: 'escrita', voz: 'leo', retomarDoBlocoId: 'nao-existe' });
    expect(e.fila).toHaveLength(9);
  });
});

describe('fluxo em voz de uma pergunta (regras 1, 2 e 9)', () => {
  it('perguntar → falar → ouvir → transcrever → decidir → aprofundar → responder → ociosa', () => {
    const inicial = criarSessao({ sessao: 1, modo: 'voz', voz: 'helios' });

    let r = reduzir(inicial, { tipo: 'perguntar', indice: 0, instante: T });
    expect(r.estado.fase).toBe('falando');
    expect(r.estado.visitadas).toEqual(['q01']);
    expect(tipos(r.efeitos)).toEqual(['anexarLinha', 'gravarProgresso', 'falar']);
    const linhaPergunta = r.estado.linhas[0];
    expect(linhaPergunta).toMatchObject({
      id: 'l0001',
      quem: 'entrevistadora',
      origem: 'pergunta',
      perguntaId: 'q01',
      blocoId: 'quem-e',
      segundos: 0,
      instante: T,
    });
    expect(r.efeitos[0]).toEqual({ tipo: 'anexarLinha', linha: linhaPergunta });
    expect(r.efeitos[2]).toEqual({ tipo: 'falar', texto: perguntaAtual(inicial).texto });

    r = reduzir(r.estado, { tipo: 'leituraConcluida' });
    expect(r.estado.fase).toBe('ouvindo');
    expect(r.efeitos).toEqual([{ tipo: 'ouvir' }]);

    r = reduzir(r.estado, { tipo: 'capturaConcluida' });
    expect(r.estado.fase).toBe('transcrevendo');
    expect(r.efeitos).toEqual([]);

    r = reduzir(r.estado, { tipo: 'respostaRegistrada', texto: 'Sou advogada.', origem: 'voz', instante: T });
    expect(r.estado.fase).toBe('decidindo');
    expect(r.estado.respondidas).toEqual(['q01']);
    expect(tipos(r.efeitos)).toEqual(['anexarLinha', 'gravarProgresso', 'decidir']);
    const decidir = r.efeitos[2];
    expect(decidir?.tipo === 'decidir' && decidir.entrada).toMatchObject({
      sessao: 1,
      blocoNome: 'Quem é',
      resposta: 'Sou advogada.',
      forcar: false,
    });
    expect(r.estado.linhas[1]).toMatchObject({ id: 'l0002', quem: 'cliente', origem: 'voz', perguntaId: 'q01' });

    const pergunta = 'Pode me dar um exemplo de quando disse isso?';
    r = reduzir(r.estado, { tipo: 'decisaoConducao', decisao: decisao(true, pergunta), instante: T });
    expect(r.estado.fase).toBe('falando');
    expect(r.estado.aprofundadas).toEqual(['q01']);
    expect(r.estado.aprofundamentoAberto).toEqual({ perguntaId: 'q01', texto: pergunta });
    expect(r.estado.ultimaDecisao?.aprofundar).toBe(true);
    expect(tipos(r.efeitos)).toEqual(['anexarLinha', 'falar']);
    expect(r.estado.linhas[2]).toMatchObject({ id: 'l0003', quem: 'entrevistadora', origem: 'aprofundamento', perguntaId: 'q01' });
    expect(r.efeitos[1]).toEqual({ tipo: 'falar', texto: pergunta });

    r = reduzir(r.estado, { tipo: 'leituraConcluida' });
    expect(r.estado.fase).toBe('ouvindo');
    expect(r.efeitos).toEqual([{ tipo: 'ouvir' }]);

    r = reduzir(r.estado, { tipo: 'capturaConcluida' });
    r = reduzir(r.estado, { tipo: 'respostaRegistrada', texto: 'Numa reunião.', origem: 'voz', instante: T });
    expect(r.estado.fase).toBe('ociosa');
    expect(r.estado.aprofundamentoAberto).toBeNull();
    expect(tipos(r.efeitos)).toEqual(['anexarLinha']);
    expect(r.estado.linhas).toHaveLength(4);
    expect(r.estado.linhas[3]).toMatchObject({ id: 'l0004', quem: 'cliente', perguntaId: 'q01' });
    expect(podeAprofundar(r.estado)).toBe(false);
    expect(rotuloAprofundar(r.estado)).toBe('Aprofundamento usado');
  });

  it('toda linha nova sai em anexarLinha na mesma transição (regra 9)', () => {
    const inicial = criarSessao({ sessao: 1, modo: 'voz', voz: 'helios' });
    const { estado, efeitos } = sequencia(inicial, [
      { tipo: 'perguntar', indice: 0, instante: T },
      { tipo: 'leituraConcluida' },
      { tipo: 'capturaConcluida' },
      { tipo: 'respostaRegistrada', texto: 'Sou advogada.', origem: 'voz', instante: T },
      { tipo: 'decisaoConducao', decisao: decisao(true, 'Exemplo?'), instante: T },
      { tipo: 'leituraConcluida' },
      { tipo: 'capturaConcluida' },
      { tipo: 'respostaRegistrada', texto: 'Numa reunião.', origem: 'voz', instante: T },
    ]);
    const anexadas = efeitos.flatMap((f) => (f.tipo === 'anexarLinha' ? [f.linha] : []));
    expect(anexadas).toEqual(estado.linhas);
    expect(estado.linhas.map((l) => l.id)).toEqual(['l0001', 'l0002', 'l0003', 'l0004']);
  });
});

describe('fluxo em escrita', () => {
  it('não fala; aprofundamento automático fica em aberto e a resposta digitada o fecha', () => {
    const inicial = criarSessao({ sessao: 1, modo: 'escrita', voz: 'helios' });

    let r = reduzir(inicial, { tipo: 'perguntar', indice: 0, instante: T });
    expect(r.estado.fase).toBe('ociosa');
    expect(tipos(r.efeitos)).toEqual(['anexarLinha', 'gravarProgresso']);
    expect(rotuloFase(r.estado)).toEqual({ texto: 'Escrita — digite e registre a resposta', cor: 'neutra' });

    r = reduzir(r.estado, { tipo: 'respostaRegistrada', texto: 'Digo que sou advogada.', origem: 'escrita', instante: T });
    expect(r.estado.fase).toBe('decidindo');
    expect(tipos(r.efeitos)).toContain('decidir');
    expect(r.estado.linhas[1]).toMatchObject({ quem: 'cliente', origem: 'escrita' });
    expect(rotuloFase(r.estado)).toEqual({ texto: 'Claude avaliando a resposta…', cor: 'ambar' });

    r = reduzir(r.estado, { tipo: 'decisaoConducao', decisao: decisao(true, 'Um exemplo?'), instante: T });
    expect(r.estado.fase).toBe('ociosa');
    expect(r.estado.aprofundamentoAberto).toEqual({ perguntaId: 'q01', texto: 'Um exemplo?' });
    expect(tipos(r.efeitos)).toEqual(['anexarLinha']);
    expect(rotuloFase(r.estado)).toEqual({ texto: 'Aprofundamento em aberto — registre a resposta', cor: 'neutra' });

    r = reduzir(r.estado, { tipo: 'respostaRegistrada', texto: 'No congresso do ano passado.', origem: 'escrita', instante: T });
    expect(r.estado.fase).toBe('ociosa');
    expect(r.estado.aprofundamentoAberto).toBeNull();
    expect(tipos(r.efeitos)).toEqual(['anexarLinha']);
    expect(rotuloFase(r.estado)).toEqual({ texto: 'Resposta registrada — aprofundar ou avançar', cor: 'neutra' });
    expect(r.estado.linhas).toHaveLength(4);
  });

  it('múltipla escolha registra o texto montado pela tela literalmente (regra 7)', () => {
    const inicial = criarSessao({ sessao: 1, modo: 'escrita', voz: 'helios' });
    const lida = reduzir(inicial, { tipo: 'perguntar', indice: 7, instante: T }).estado;
    expect(perguntaAtual(lida).tipo).toBe('multipla');
    const texto = 'C — Vamos direto ao ponto: há três questões a resolver. Sem rodeio.';
    const r = reduzir(lida, { tipo: 'respostaRegistrada', texto, origem: 'escrita', instante: T });
    expect(r.estado.linhas[1]?.texto).toBe(texto);
  });
});

describe('botão aprofundar (regra 1)', () => {
  it('força a decisão e é bloqueado na segunda vez', () => {
    const inicial = criarSessao({ sessao: 1, modo: 'escrita', voz: 'helios' });
    let e = reduzir(inicial, { tipo: 'perguntar', indice: 0, instante: T }).estado;
    expect(podeAprofundar(e)).toBe(false); // ainda sem resposta

    e = responderSemAprofundar(e, 'Sou advogada de empresas de família.');
    expect(e.fase).toBe('ociosa');
    expect(e.ultimaDecisao?.aprofundar).toBe(false);
    expect(podeAprofundar(e)).toBe(true);
    expect(rotuloAprofundar(e)).toBe('Aprofundar');

    let r = reduzir(e, { tipo: 'aprofundar', instante: T });
    expect(r.estado.fase).toBe('decidindo');
    expect(r.efeitos).toHaveLength(1);
    const decidir = r.efeitos[0];
    expect(decidir?.tipo === 'decidir' && decidir.entrada).toMatchObject({
      forcar: true,
      resposta: 'Sou advogada de empresas de família.',
    });
    expect(podeAprofundar(r.estado)).toBe(false); // fase não é ociosa

    r = reduzir(r.estado, { tipo: 'decisaoConducao', decisao: decisao(true, 'Qual empresa?'), instante: T });
    expect(r.estado.aprofundadas).toEqual(['q01']);
    expect(r.estado.aprofundamentoAberto?.texto).toBe('Qual empresa?');
    expect(podeAprofundar(r.estado)).toBe(false); // aprofundamento em aberto

    r = reduzir(r.estado, { tipo: 'respostaRegistrada', texto: 'Uma indústria.', origem: 'escrita', instante: T });
    expect(r.estado.fase).toBe('ociosa');
    expect(podeAprofundar(r.estado)).toBe(false);
    expect(rotuloAprofundar(r.estado)).toBe('Aprofundamento usado');

    const bloqueado = reduzir(r.estado, { tipo: 'aprofundar', instante: T });
    expect(bloqueado.estado).toBe(r.estado);
    expect(bloqueado.efeitos).toEqual([]);
  });

  it('decisão que manda aprofundar sem trazer pergunta fica ociosa', () => {
    const inicial = criarSessao({ sessao: 1, modo: 'escrita', voz: 'helios' });
    const lida = reduzir(inicial, { tipo: 'perguntar', indice: 0, instante: T }).estado;
    const respondida = reduzir(lida, { tipo: 'respostaRegistrada', texto: 'Sim.', origem: 'escrita', instante: T }).estado;
    const r = reduzir(respondida, { tipo: 'decisaoConducao', decisao: decisao(true, null), instante: T });
    expect(r.estado.fase).toBe('ociosa');
    expect(r.estado.aprofundadas).toEqual([]);
    expect(r.efeitos).toEqual([]);
  });
});

describe('pergunta sem aprofundamento (regra 2)', () => {
  it('não chama decidir e registra a decisão de origem regra', () => {
    const inicial = criarSessao({ sessao: 2, modo: 'escrita', voz: 'leo' });
    const indiceQ18 = inicial.fila.findIndex((q) => q.id === 'q18');
    const lida = reduzir(inicial, { tipo: 'perguntar', indice: indiceQ18, instante: T }).estado;
    expect(perguntaAtual(lida).permiteAprofundamento).toBe(false);
    expect(rotuloAprofundar(lida)).toBe('Sem aprofundamento');

    const r = reduzir(lida, { tipo: 'respostaRegistrada', texto: 'Formal com juízes.', origem: 'escrita', instante: T });
    expect(r.estado.fase).toBe('ociosa');
    expect(r.estado.respondidas).toEqual(['q18']);
    expect(r.estado.ultimaDecisao).toMatchObject({ aprofundar: false, pergunta: null, origem: 'regra' });
    expect(tipos(r.efeitos)).not.toContain('decidir');
    expect(podeAprofundar(r.estado)).toBe(false);

    const botao = reduzir(r.estado, { tipo: 'aprofundar', instante: T });
    expect(botao.estado).toBe(r.estado);
    expect(botao.efeitos).toEqual([]);
  });
});

describe('navegação (regra 3)', () => {
  it('proxima lê a pergunta nova; anterior e irParaBloco não releem', () => {
    const inicial = criarSessao({ sessao: 1, modo: 'escrita', voz: 'helios' });
    let r = reduzir(inicial, { tipo: 'perguntar', indice: 0, instante: T });

    r = reduzir(r.estado, { tipo: 'proxima', instante: T });
    expect(r.estado.indice).toBe(1);
    expect(r.estado.visitadas).toEqual(['q01', 'q02']);
    expect(tipos(r.efeitos)).toContain('anexarLinha');

    r = reduzir(r.estado, { tipo: 'anterior', instante: T });
    expect(r.estado.indice).toBe(0);
    expect(r.estado.fase).toBe('ociosa');
    expect(r.efeitos).toEqual([]);
    expect(r.estado.linhas).toHaveLength(2);

    const noInicio = reduzir(r.estado, { tipo: 'anterior', instante: T });
    expect(noInicio.estado).toBe(r.estado);

    // Bloco ainda não iniciado: proibido pular.
    const pulo = reduzir(r.estado, { tipo: 'irParaBloco', blocoId: 'trajetoria', instante: T });
    expect(pulo.estado).toBe(r.estado);
    expect(pulo.efeitos).toEqual([]);

    const { estado: noBloco2 } = sequencia(r.estado, [
      { tipo: 'proxima', instante: T },
      { tipo: 'proxima', instante: T },
      { tipo: 'proxima', instante: T },
    ]);
    expect(perguntaAtual(noBloco2).id).toBe('q04');
    expect(noBloco2.visitadas).toEqual(['q01', 'q02', 'q03', 'q04']);

    const volta = reduzir(noBloco2, { tipo: 'irParaBloco', blocoId: 'quem-e', instante: T });
    expect(volta.estado.indice).toBe(0);
    expect(volta.efeitos).toEqual([]);

    const ida = reduzir(volta.estado, { tipo: 'irParaBloco', blocoId: 'trajetoria', instante: T });
    expect(ida.estado.indice).toBe(3);
    expect(ida.efeitos).toEqual([]);

    const chips = chipsDeBlocos(ida.estado);
    expect(chips.map((c) => c.bloco.id)).toEqual(['quem-e', 'trajetoria', 'voz-e-escrita']);
    expect(chips.map((c) => c.navegavel)).toEqual([true, true, false]);
    expect(chips.map((c) => c.estado)).toEqual(['pendente', 'atual', 'pendente']);
  });

  it('em voz, navegar interrompe o áudio antes de ler a próxima', () => {
    const inicial = criarSessao({ sessao: 1, modo: 'voz', voz: 'helios' });
    const falando = reduzir(inicial, { tipo: 'perguntar', indice: 0, instante: T }).estado;
    const r = reduzir(falando, { tipo: 'proxima', instante: T });
    expect(tipos(r.efeitos)).toEqual(['pararAudio', 'anexarLinha', 'falar']);
    expect(r.estado.fase).toBe('falando');
    const volta = reduzir(r.estado, { tipo: 'anterior', instante: T });
    expect(volta.efeitos).toEqual([{ tipo: 'pararAudio' }]);
    expect(volta.estado.fase).toBe('ociosa');
  });

  it('mudar de pergunta descarta o aprofundamento em aberto e a última decisão', () => {
    const inicial = criarSessao({ sessao: 1, modo: 'escrita', voz: 'helios' });
    const { estado } = sequencia(inicial, [
      { tipo: 'perguntar', indice: 0, instante: T },
      { tipo: 'respostaRegistrada', texto: 'Sim.', origem: 'escrita', instante: T },
      { tipo: 'decisaoConducao', decisao: decisao(true, 'Exemplo?'), instante: T },
    ]);
    expect(estado.aprofundamentoAberto).not.toBeNull();
    const r = reduzir(estado, { tipo: 'proxima', instante: T });
    expect(r.estado.aprofundamentoAberto).toBeNull();
    expect(r.estado.ultimaDecisao).toBeNull();
  });

  it('chip fica concluído quando todas as perguntas do bloco foram respondidas', () => {
    const inicial = criarSessao({ sessao: 1, modo: 'escrita', voz: 'helios' });
    let e = inicial;
    for (let i = 0; i < 3; i += 1) {
      e = reduzir(e, { tipo: 'perguntar', indice: i, instante: T }).estado;
      e = responderSemAprofundar(e);
    }
    e = reduzir(e, { tipo: 'proxima', instante: T }).estado;
    expect(chipsDeBlocos(e).map((c) => c.estado)).toEqual(['concluido', 'atual', 'pendente']);
    expect(progressoDaSessao(e)).toBeCloseTo(0.3);
  });
});

describe('pausa (regra 4)', () => {
  it('em voz, pausar para o áudio e retomar relê a pergunta sem resposta', () => {
    const inicial = criarSessao({ sessao: 1, modo: 'voz', voz: 'helios' });
    const falando = reduzir(inicial, { tipo: 'perguntar', indice: 0, instante: T }).estado;

    let r = reduzir(falando, { tipo: 'pausar' });
    expect(r.estado.pausada).toBe(true);
    expect(r.estado.fase).toBe('pausada');
    expect(r.efeitos).toEqual([{ tipo: 'pararAudio' }]);
    expect(rotuloFase(r.estado)).toEqual({ texto: 'Pausado — microfone fechado', cor: 'ambar' });

    const parado = reduzir(r.estado, { tipo: 'tique' });
    expect(parado.estado.segundos).toBe(0);

    // Uma leitura concluída atrasada não abre o microfone em pausa.
    const atrasada = reduzir(r.estado, { tipo: 'leituraConcluida' });
    expect(atrasada.estado.fase).toBe('pausada');
    expect(atrasada.efeitos).toEqual([]);

    r = reduzir(r.estado, { tipo: 'retomar', instante: T });
    expect(r.estado.pausada).toBe(false);
    expect(r.estado.fase).toBe('falando');
    expect(r.efeitos).toEqual([{ tipo: 'falar', texto: perguntaAtual(inicial).texto }]);
    expect(r.estado.linhas).toHaveLength(1); // releitura não gera linha
  });

  it('retomar com a pergunta respondida fica ociosa; em escrita nunca fala', () => {
    const inicial = criarSessao({ sessao: 1, modo: 'voz', voz: 'helios' });
    const { estado: respondida } = sequencia(inicial, [
      { tipo: 'perguntar', indice: 0, instante: T },
      { tipo: 'leituraConcluida' },
      { tipo: 'capturaConcluida' },
      { tipo: 'respostaRegistrada', texto: 'Sou advogada.', origem: 'voz', instante: T },
      { tipo: 'decisaoConducao', decisao: decisao(false), instante: T },
    ]);
    const r = sequencia(respondida, [{ tipo: 'pausar' }, { tipo: 'retomar', instante: T }]);
    expect(r.estado.fase).toBe('ociosa');
    expect(tipos(r.efeitos)).toEqual(['pararAudio']);

    const escrita = criarSessao({ sessao: 1, modo: 'escrita', voz: 'helios' });
    const lida = reduzir(escrita, { tipo: 'perguntar', indice: 0, instante: T }).estado;
    const pausada = reduzir(lida, { tipo: 'pausar' }).estado;
    expect(rotuloFase(pausada)).toEqual({ texto: 'Pausado — o tempo está parado', cor: 'ambar' });
    const retomada = reduzir(pausada, { tipo: 'retomar', instante: T });
    expect(retomada.estado.fase).toBe('ociosa');
    expect(retomada.efeitos).toEqual([]);
  });

  it('relê o aprofundamento em aberto ao retomar em voz', () => {
    const inicial = criarSessao({ sessao: 1, modo: 'voz', voz: 'helios' });
    const { estado } = sequencia(inicial, [
      { tipo: 'perguntar', indice: 0, instante: T },
      { tipo: 'leituraConcluida' },
      { tipo: 'capturaConcluida' },
      { tipo: 'respostaRegistrada', texto: 'Sou advogada.', origem: 'voz', instante: T },
      { tipo: 'decisaoConducao', decisao: decisao(true, 'Um exemplo?'), instante: T },
      { tipo: 'pausar' },
    ]);
    const r = reduzir(estado, { tipo: 'retomar', instante: T });
    expect(r.efeitos).toEqual([{ tipo: 'falar', texto: 'Um exemplo?' }]);
  });
});

describe('troca de modo (regra 5)', () => {
  it('voz → escrita para o áudio e fica ociosa; escrita → voz relê a pergunta sem resposta', () => {
    const inicial = criarSessao({ sessao: 1, modo: 'voz', voz: 'helios' });
    const falando = reduzir(inicial, { tipo: 'perguntar', indice: 0, instante: T }).estado;

    let r = reduzir(falando, { tipo: 'alternarModo', modo: 'escrita' });
    expect(r.estado.modo).toBe('escrita');
    expect(r.estado.fase).toBe('ociosa');
    expect(r.efeitos).toEqual([{ tipo: 'pararAudio' }]);

    r = reduzir(r.estado, { tipo: 'alternarModo', modo: 'voz' });
    expect(r.estado.modo).toBe('voz');
    expect(r.estado.fase).toBe('falando');
    expect(r.efeitos).toEqual([{ tipo: 'falar', texto: perguntaAtual(inicial).texto }]);
    expect(r.estado.linhas).toHaveLength(1);

    const mesmo = reduzir(r.estado, { tipo: 'alternarModo', modo: 'voz' });
    expect(mesmo.estado).toBe(r.estado);
  });

  it('preserva o aprofundamento em aberto e o relê ao passar para voz', () => {
    const inicial = criarSessao({ sessao: 1, modo: 'escrita', voz: 'helios' });
    const { estado } = sequencia(inicial, [
      { tipo: 'perguntar', indice: 0, instante: T },
      { tipo: 'respostaRegistrada', texto: 'Sim.', origem: 'escrita', instante: T },
      { tipo: 'decisaoConducao', decisao: decisao(true, 'Um exemplo?'), instante: T },
    ]);
    const r = reduzir(estado, { tipo: 'alternarModo', modo: 'voz' });
    expect(r.estado.aprofundamentoAberto).toEqual({ perguntaId: 'q01', texto: 'Um exemplo?' });
    expect(r.efeitos).toEqual([{ tipo: 'falar', texto: 'Um exemplo?' }]);
    // Respondido o aprofundamento em voz, nada de nova decisão.
    const fim = sequencia(r.estado, [
      { tipo: 'leituraConcluida' },
      { tipo: 'capturaConcluida' },
      { tipo: 'respostaRegistrada', texto: 'Ontem.', origem: 'voz', instante: T },
    ]);
    expect(fim.estado.fase).toBe('ociosa');
    expect(tipos(fim.efeitos)).not.toContain('decidir');
  });

  it('trocar de modo em pausa mantém a pausa', () => {
    const inicial = criarSessao({ sessao: 1, modo: 'escrita', voz: 'helios' });
    const { estado } = sequencia(inicial, [{ tipo: 'perguntar', indice: 0, instante: T }, { tipo: 'pausar' }]);
    const r = reduzir(estado, { tipo: 'alternarModo', modo: 'voz' });
    expect(r.estado.fase).toBe('pausada');
    expect(r.estado.pausada).toBe(true);
    expect(r.efeitos).toEqual([]);
  });
});

describe('encerrar (regra 6)', () => {
  it('sessão 1 concluída em escrita: despedida da sessão e finalizar', () => {
    const e = responderTudo(criarSessao({ sessao: 1, modo: 'escrita', voz: 'helios' }));
    expect(progressoDaSessao(e)).toBe(1);
    const r = reduzir(e, { tipo: 'encerrar', instante: T });
    expect(r.estado.encerrada).toBe(true);
    expect(r.estado.fase).toBe('ociosa');
    expect(tipos(r.efeitos)).toEqual(['anexarLinha', 'finalizar']);
    expect(r.efeitos[1]).toEqual({ tipo: 'finalizar', concluida: true });
    const despedida = r.estado.linhas[r.estado.linhas.length - 1];
    expect(despedida).toMatchObject({
      quem: 'entrevistadora',
      origem: 'despedida',
      texto: 'Obrigada. Esta sessão está encerrada.',
      perguntaId: null,
      blocoId: null,
    });
    expect(rotuloFase(r.estado)).toEqual({ texto: 'Sessão encerrada', cor: 'neutra' });
  });

  it('sessão 3 concluída em voz: despedida da entrevista falada antes de finalizar', () => {
    const e = responderTudo(criarSessao({ sessao: 3, modo: 'voz', voz: 'leo' }));
    const r = reduzir(e, { tipo: 'encerrar', instante: T });
    expect(tipos(r.efeitos)).toEqual(['anexarLinha', 'falar', 'finalizar']);
    expect(r.efeitos[1]).toEqual({ tipo: 'falar', texto: 'Obrigada. A entrevista está encerrada.' });
    expect(r.efeitos[2]).toEqual({ tipo: 'finalizar', concluida: true });
    expect(r.estado.fase).toBe('falando');

    const lida = reduzir(r.estado, { tipo: 'leituraConcluida' });
    expect(lida.estado.fase).toBe('ociosa');
    expect(lida.efeitos).toEqual([]);

    // Depois de encerrada, nada mais anda.
    const ignorada = reduzir(lida.estado, { tipo: 'proxima', instante: T });
    expect(ignorada.estado).toBe(lida.estado);
    expect(ignorada.efeitos).toEqual([]);
  });

  it('incompleta: sem despedida, finalizar com concluida false', () => {
    const inicial = criarSessao({ sessao: 1, modo: 'voz', voz: 'helios' });
    const { estado } = sequencia(inicial, [
      { tipo: 'perguntar', indice: 0, instante: T },
      { tipo: 'leituraConcluida' },
    ]);
    const r = reduzir(estado, { tipo: 'encerrar', instante: T });
    expect(r.estado.encerrada).toBe(true);
    expect(r.efeitos).toEqual([{ tipo: 'pararAudio' }, { tipo: 'finalizar', concluida: false }]);
    expect(r.estado.linhas).toHaveLength(1);
  });

  it('proxima na última pergunta equivale a encerrar', () => {
    const inicial = criarSessao({ sessao: 1, modo: 'escrita', voz: 'helios' });
    const ultima = reduzir(inicial, { tipo: 'perguntar', indice: 9, instante: T }).estado;
    expect(ehUltima(ultima)).toBe(true);
    const r = reduzir(ultima, { tipo: 'proxima', instante: T });
    expect(r.estado.encerrada).toBe(true);
    expect(r.efeitos).toEqual([{ tipo: 'finalizar', concluida: false }]);
  });
});

describe('relógio', () => {
  it('tique conta só fora da pausa e antes do fim', () => {
    const inicial = criarSessao({ sessao: 1, modo: 'escrita', voz: 'helios' });
    let e = reduzir(inicial, { tipo: 'tique' }).estado;
    e = reduzir(e, { tipo: 'tique' }).estado;
    expect(e.segundos).toBe(2);
    e = reduzir(e, { tipo: 'pausar' }).estado;
    e = reduzir(e, { tipo: 'tique' }).estado;
    expect(e.segundos).toBe(2);
    e = reduzir(e, { tipo: 'retomar', instante: T }).estado;
    e = reduzir(e, { tipo: 'tique' }).estado;
    expect(e.segundos).toBe(3);
    e = reduzir(e, { tipo: 'encerrar', instante: T }).estado;
    e = reduzir(e, { tipo: 'tique' }).estado;
    expect(e.segundos).toBe(3);
  });

  it('a linha carrega os segundos decorridos no momento', () => {
    const inicial = criarSessao({ sessao: 1, modo: 'escrita', voz: 'helios' });
    const { estado } = sequencia(inicial, [
      { tipo: 'tique' },
      { tipo: 'tique' },
      { tipo: 'tique' },
      { tipo: 'perguntar', indice: 0, instante: T },
    ]);
    expect(estado.linhas[0]?.segundos).toBe(3);
  });
});

describe('numeração e fechamento', () => {
  it('a sessão 3 tem 7 perguntas mais o fechamento, fora da contagem', () => {
    const inicial = criarSessao({ sessao: 3, modo: 'escrita', voz: 'helios' });
    expect(inicial.fila).toHaveLength(8);
    expect(inicial.fila[7]).toBe(FECHAMENTO);

    const q20 = reduzir(inicial, { tipo: 'perguntar', indice: 0, instante: T }).estado;
    expect(rotuloPergunta(q20)).toBe('Pergunta 20 de 26');

    const fechamento = reduzir(inicial, { tipo: 'perguntar', indice: 7, instante: T }).estado;
    expect(rotuloPergunta(fechamento)).toBe('Fechamento · fora da contagem');
    expect(fechamento.linhas[0]).toMatchObject({ perguntaId: 'fechamento', blocoId: 'fora-do-escritorio' });
    expect(rotuloAprofundar(fechamento)).toBe('Sem aprofundamento');

    let e = inicial;
    for (let i = 0; i < 7; i += 1) {
      e = reduzir(e, { tipo: 'perguntar', indice: i, instante: T }).estado;
      e = responderSemAprofundar(e);
    }
    expect(progressoDaSessao(e)).toBeCloseTo(7 / 8);
    e = reduzir(e, { tipo: 'proxima', instante: T }).estado;
    expect(chipsDeBlocos(e).map((c) => c.estado)).toEqual(['concluido', 'atual']);
    e = responderSemAprofundar(e);
    expect(progressoDaSessao(e)).toBe(1);
  });

  it('sessão 2 numera globalmente', () => {
    const inicial = criarSessao({ sessao: 2, modo: 'escrita', voz: 'helios' });
    const e = reduzir(inicial, { tipo: 'perguntar', indice: 0, instante: T }).estado;
    expect(rotuloPergunta(e)).toBe('Pergunta 11 de 26');
  });
});

describe('proteções', () => {
  it('decisão atrasada depois de navegar é ignorada', () => {
    const inicial = criarSessao({ sessao: 1, modo: 'escrita', voz: 'helios' });
    const { estado } = sequencia(inicial, [
      { tipo: 'perguntar', indice: 0, instante: T },
      { tipo: 'respostaRegistrada', texto: 'Sim.', origem: 'escrita', instante: T },
      { tipo: 'proxima', instante: T },
    ]);
    expect(estado.fase).toBe('ociosa');
    expect(estado.indice).toBe(1);
    const r = reduzir(estado, { tipo: 'decisaoConducao', decisao: decisao(true, 'Exemplo?'), instante: T });
    expect(r.estado).toBe(estado);
    expect(r.efeitos).toEqual([]);
  });

  it('transcrição atrasada depois de navegar em voz é ignorada', () => {
    const inicial = criarSessao({ sessao: 1, modo: 'voz', voz: 'helios' });
    const { estado } = sequencia(inicial, [
      { tipo: 'perguntar', indice: 0, instante: T },
      { tipo: 'leituraConcluida' },
      { tipo: 'capturaConcluida' },
      { tipo: 'proxima', instante: T },
      { tipo: 'leituraConcluida' },
    ]);
    const r = reduzir(estado, { tipo: 'respostaRegistrada', texto: 'Tarde.', origem: 'voz', instante: T });
    expect(r.estado).toBe(estado);
  });

  it('resposta vazia não gera linha e registra erro', () => {
    const inicial = criarSessao({ sessao: 1, modo: 'voz', voz: 'helios' });
    const { estado } = sequencia(inicial, [
      { tipo: 'perguntar', indice: 0, instante: T },
      { tipo: 'leituraConcluida' },
      { tipo: 'capturaConcluida' },
    ]);
    const r = reduzir(estado, { tipo: 'respostaRegistrada', texto: '   ', origem: 'voz', instante: T });
    expect(r.estado.fase).toBe('ociosa');
    expect(r.estado.erro).toEqual({ codigo: 'desconhecido', mensagem: 'A resposta veio vazia.' });
    expect(r.estado.respondidas).toEqual([]);
    expect(r.estado.linhas).toHaveLength(1);
    expect(r.efeitos).toEqual([]);

    const limpo = reduzir(r.estado, { tipo: 'limparErro' });
    expect(limpo.estado.erro).toBeNull();
  });

  it('erro para o áudio, guarda a mensagem e o próximo avanço a limpa', () => {
    const inicial = criarSessao({ sessao: 1, modo: 'voz', voz: 'helios' });
    const falando = reduzir(inicial, { tipo: 'perguntar', indice: 0, instante: T }).estado;
    const erro = { codigo: 'api' as const, mensagem: 'O Grok não respondeu.' };
    const r = reduzir(falando, { tipo: 'erro', erro });
    expect(r.estado.fase).toBe('ociosa');
    expect(r.estado.erro).toEqual(erro);
    expect(r.efeitos).toEqual([{ tipo: 'pararAudio' }]);

    const avanco = reduzir(r.estado, { tipo: 'proxima', instante: T });
    expect(avanco.estado.erro).toBeNull();

    const pausada = reduzir(falando, { tipo: 'pausar' }).estado;
    const emPausa = reduzir(pausada, { tipo: 'erro', erro });
    expect(emPausa.estado.fase).toBe('pausada');
  });
});

describe('rotuloFase', () => {
  it('cobre as fases de voz', () => {
    const inicial = criarSessao({ sessao: 1, modo: 'voz', voz: 'helios' });
    expect(rotuloFase(inicial)).toEqual({ texto: 'Aguardando — aprofundar ou avançar', cor: 'neutra' });
    const falando = reduzir(inicial, { tipo: 'perguntar', indice: 0, instante: T }).estado;
    expect(rotuloFase(falando)).toEqual({ texto: 'Entrevistadora lendo a pergunta', cor: 'azul' });
    const ouvindo = reduzir(falando, { tipo: 'leituraConcluida' }).estado;
    expect(rotuloFase(ouvindo)).toEqual({ texto: 'Ouvindo o cliente · transcrevendo', cor: 'ambar' });
    const transcrevendo = reduzir(ouvindo, { tipo: 'capturaConcluida' }).estado;
    expect(rotuloFase(transcrevendo)).toEqual({ texto: 'Transcrevendo a resposta…', cor: 'ambar' });
    const decidindo = reduzir(transcrevendo, {
      tipo: 'respostaRegistrada',
      texto: 'Sou advogada.',
      origem: 'voz',
      instante: T,
    }).estado;
    expect(rotuloFase(decidindo)).toEqual({ texto: 'Claude avaliando a resposta…', cor: 'ambar' });
  });
});
