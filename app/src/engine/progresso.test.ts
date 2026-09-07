import { describe, expect, it } from 'vitest';
import type { Progresso } from '../shared/tipos';
import {
  aoAvancar,
  aoEncerrar,
  aoIniciar,
  interpretarProgresso,
  progressoInicial,
  proximaSessao,
  resumoParaSetup,
  rotuloDoBotao,
} from './progresso';

const T0 = '2026-09-06T14:00:00-03:00';
const T1 = '2026-09-06T14:30:00-03:00';
const T2 = '2026-09-07T10:00:00-03:00';
const T3 = '2026-09-07T10:40:00-03:00';

/** Sessão 1 concluída, o resto pendente. */
function aposSessao1(): Progresso {
  const iniciada = aoIniciar(progressoInicial(T0), 1, { arquivo: 'sessao-1-quem-e-2026-09-06.md', modo: 'voz', agora: T0 });
  return aoEncerrar(iniciada, 1, { concluida: true, blocoAtual: 'voz-e-escrita', perguntasRespondidas: [], agora: T1 });
}

/** Sessão 1 concluída, sessão 2 incompleta no bloco 5. */
function comSessao2Incompleta(): Progresso {
  const iniciada = aoIniciar(aposSessao1(), 2, { arquivo: 'sessao-2-como-trabalha-2026-09-07.md', modo: 'escrita', agora: T2 });
  return aoEncerrar(iniciada, 2, {
    concluida: false,
    blocoAtual: 'valores-e-limites',
    perguntasRespondidas: ['q11', 'q12', 'q13', 'q14'],
    agora: T3,
  });
}

function tudoConcluido(): Progresso {
  let p = aposSessao1();
  p = aoIniciar(p, 2, { arquivo: 'sessao-2-como-trabalha-2026-09-07.md', modo: 'voz', agora: T2 });
  p = aoEncerrar(p, 2, { concluida: true, blocoAtual: 'pessoas-e-tom', perguntasRespondidas: [], agora: T3 });
  p = aoIniciar(p, 3, { arquivo: 'sessao-3-como-vive-2026-09-08.md', modo: 'voz', agora: '2026-09-08T10:00:00-03:00' });
  return aoEncerrar(p, 3, { concluida: true, blocoAtual: 'fora-do-escritorio', perguntasRespondidas: [], agora: '2026-09-08T10:30:00-03:00' });
}

describe('progressoInicial', () => {
  it('tem as três sessões pendentes, versão 1 e roteiro v1', () => {
    expect(progressoInicial(T0)).toEqual({
      versao: 1,
      roteiro: 'v1',
      atualizadoEm: T0,
      sessoes: { 1: { estado: 'pendente' }, 2: { estado: 'pendente' }, 3: { estado: 'pendente' } },
    });
  });
});

describe('interpretarProgresso', () => {
  it('aceita o JSON que o próprio módulo produz (ida e volta)', () => {
    const p = comSessao2Incompleta();
    const relido = interpretarProgresso(JSON.parse(JSON.stringify(p)), 'agora');
    expect(relido).toEqual(p);
    expect(relido.atualizadoEm).toBe(T3);
  });

  it('devolve o inicial para lixo, null, versão errada, roteiro errado e chave extra', () => {
    const esperado = progressoInicial(T0);
    expect(interpretarProgresso(null, T0)).toEqual(esperado);
    expect(interpretarProgresso('texto', T0)).toEqual(esperado);
    expect(interpretarProgresso({}, T0)).toEqual(esperado);

    const valido = JSON.parse(JSON.stringify(aposSessao1())) as Record<string, unknown>;
    expect(interpretarProgresso({ ...valido, versao: 2 }, T0)).toEqual(esperado);
    expect(interpretarProgresso({ ...valido, roteiro: 'v2' }, T0)).toEqual(esperado);
    expect(interpretarProgresso({ ...valido, extra: true }, T0)).toEqual(esperado);
  });

  it('rejeita sessão com estado desconhecido ou campos faltando', () => {
    const base = JSON.parse(JSON.stringify(progressoInicial(T1))) as { sessoes: Record<string, unknown> };
    expect(interpretarProgresso({ ...base, sessoes: { ...base.sessoes, 1: { estado: 'andando' } } }, T0)).toEqual(progressoInicial(T0));
    expect(
      interpretarProgresso({ ...base, sessoes: { ...base.sessoes, 1: { estado: 'incompleta', arquivo: 'a.md' } } }, T0),
    ).toEqual(progressoInicial(T0));
  });

  it('rejeita ordem incoerente (sessão 2 concluída com a 1 pendente) e bloco de outra sessão', () => {
    const base = JSON.parse(JSON.stringify(progressoInicial(T1))) as { sessoes: Record<string, unknown> };
    const concluida = { estado: 'concluida', arquivo: 'x.md', iniciadaEm: T0, concluidaEm: T1, modo: 'voz' };
    expect(interpretarProgresso({ ...base, sessoes: { ...base.sessoes, 2: concluida } }, T0)).toEqual(progressoInicial(T0));

    const incompletaForaDaSessao = {
      estado: 'incompleta',
      arquivo: 'x.md',
      iniciadaEm: T0,
      modo: 'voz',
      blocoAtual: 'dominio',
      perguntasRespondidas: [],
    };
    expect(interpretarProgresso({ ...base, sessoes: { ...base.sessoes, 1: incompletaForaDaSessao } }, T0)).toEqual(progressoInicial(T0));
  });
});

describe('proximaSessao e rotuloDoBotao', () => {
  it('inicial → iniciar 1', () => {
    expect(proximaSessao(progressoInicial(T0))).toEqual({ numero: 1, acao: 'iniciar' });
    expect(rotuloDoBotao(progressoInicial(T0))).toBe('INICIAR SESSÃO 1');
  });

  it('sessão 1 concluída → continuar 2', () => {
    expect(proximaSessao(aposSessao1())).toEqual({ numero: 2, acao: 'continuar' });
    expect(rotuloDoBotao(aposSessao1())).toBe('CONTINUAR — SESSÃO 2');
  });

  it('sessão 2 incompleta → retomar 2', () => {
    expect(proximaSessao(comSessao2Incompleta())).toEqual({ numero: 2, acao: 'retomar' });
    expect(rotuloDoBotao(comSessao2Incompleta())).toBe('RETOMAR SESSÃO 2');
  });

  it('tudo concluído → null e ENTREVISTA CONCLUÍDA', () => {
    expect(proximaSessao(tudoConcluido())).toBeNull();
    expect(rotuloDoBotao(tudoConcluido())).toBe('ENTREVISTA CONCLUÍDA');
  });
});

describe('aoIniciar', () => {
  it('marca incompleta no primeiro bloco da sessão, sem perguntas respondidas', () => {
    const p = aoIniciar(progressoInicial(T0), 1, { arquivo: 'sessao-1-quem-e-2026-09-06.md', modo: 'voz', agora: T1 });
    expect(p.atualizadoEm).toBe(T1);
    expect(p.sessoes[1]).toEqual({
      estado: 'incompleta',
      arquivo: 'sessao-1-quem-e-2026-09-06.md',
      iniciadaEm: T1,
      modo: 'voz',
      blocoAtual: 'quem-e',
      perguntasRespondidas: [],
    });
    expect(p.sessoes[2]).toEqual({ estado: 'pendente' });
  });

  it('a sessão 2 começa no bloco «dominio»', () => {
    const p = aoIniciar(aposSessao1(), 2, { arquivo: 's2.md', modo: 'escrita', agora: T2 });
    expect(p.sessoes[2]).toMatchObject({ estado: 'incompleta', blocoAtual: 'dominio', modo: 'escrita' });
  });

  it('lança ao iniciar a 2 antes da 1', () => {
    expect(() => aoIniciar(progressoInicial(T0), 2, { arquivo: 's2.md', modo: 'voz', agora: T0 })).toThrow(/sessão 2/);
  });

  it('lança ao iniciar a 1 de novo depois de concluída, e ao iniciar qualquer uma com tudo concluído', () => {
    expect(() => aoIniciar(aposSessao1(), 1, { arquivo: 's1.md', modo: 'voz', agora: T2 })).toThrow(Error);
    expect(() => aoIniciar(tudoConcluido(), 3, { arquivo: 's3.md', modo: 'voz', agora: T2 })).toThrow(/concluída/);
  });

  it('lança sem nome de arquivo', () => {
    expect(() => aoIniciar(progressoInicial(T0), 1, { arquivo: '  ', modo: 'voz', agora: T0 })).toThrow(/arquivo/);
  });

  it('na retomada preserva arquivo, início, bloco e respondidas; só o modo muda', () => {
    const antes = comSessao2Incompleta();
    const p = aoIniciar(antes, 2, { arquivo: 'outro-nome.md', modo: 'voz', agora: '2026-09-08T09:00:00-03:00' });
    expect(p.atualizadoEm).toBe('2026-09-08T09:00:00-03:00');
    expect(p.sessoes[2]).toEqual({
      estado: 'incompleta',
      arquivo: 'sessao-2-como-trabalha-2026-09-07.md',
      iniciadaEm: T2,
      modo: 'voz',
      blocoAtual: 'valores-e-limites',
      perguntasRespondidas: ['q11', 'q12', 'q13', 'q14'],
    });
  });

  it('não altera o objeto de entrada', () => {
    const antes = progressoInicial(T0);
    aoIniciar(antes, 1, { arquivo: 's1.md', modo: 'voz', agora: T1 });
    expect(antes).toEqual(progressoInicial(T0));
  });
});

describe('aoAvancar', () => {
  it('atualiza bloco e acumula perguntas respondidas', () => {
    let p = aoIniciar(progressoInicial(T0), 1, { arquivo: 's1.md', modo: 'voz', agora: T0 });
    p = aoAvancar(p, 1, { blocoAtual: 'quem-e', perguntasRespondidas: ['q01', 'q02'], agora: T1 });
    p = aoAvancar(p, 1, { blocoAtual: 'trajetoria', perguntasRespondidas: ['q02', 'q03', 'q04'], agora: T2 });
    expect(p.atualizadoEm).toBe(T2);
    expect(p.sessoes[1]).toMatchObject({
      estado: 'incompleta',
      blocoAtual: 'trajetoria',
      perguntasRespondidas: ['q01', 'q02', 'q03', 'q04'],
    });
  });

  it('lança para sessão não iniciada ou bloco de outra sessão; não mexe em sessão concluída', () => {
    expect(() => aoAvancar(progressoInicial(T0), 1, { blocoAtual: 'quem-e', perguntasRespondidas: [], agora: T0 })).toThrow(/iniciada/);
    const iniciada = aoIniciar(progressoInicial(T0), 1, { arquivo: 's1.md', modo: 'voz', agora: T0 });
    expect(() => aoAvancar(iniciada, 1, { blocoAtual: 'dominio', perguntasRespondidas: [], agora: T0 })).toThrow(/dominio/);

    const concluida = aposSessao1();
    const depois = aoAvancar(concluida, 1, { blocoAtual: 'quem-e', perguntasRespondidas: ['q01'], agora: T2 });
    expect(depois.sessoes[1]).toEqual(concluida.sessoes[1]);
    expect(depois.atualizadoEm).toBe(T2);
  });
});

describe('aoEncerrar', () => {
  it('concluída: guarda concluidaEm e descarta bloco e perguntas', () => {
    const p = aposSessao1();
    expect(p.atualizadoEm).toBe(T1);
    expect(p.sessoes[1]).toEqual({
      estado: 'concluida',
      arquivo: 'sessao-1-quem-e-2026-09-06.md',
      iniciadaEm: T0,
      concluidaEm: T1,
      modo: 'voz',
    });
  });

  it('incompleta: guarda o bloco de retomada e acumula perguntas', () => {
    const p = comSessao2Incompleta();
    expect(p.atualizadoEm).toBe(T3);
    expect(p.sessoes[2]).toEqual({
      estado: 'incompleta',
      arquivo: 'sessao-2-como-trabalha-2026-09-07.md',
      iniciadaEm: T2,
      modo: 'escrita',
      blocoAtual: 'valores-e-limites',
      perguntasRespondidas: ['q11', 'q12', 'q13', 'q14'],
    });

    const retomada = aoIniciar(p, 2, { arquivo: 'ignorado.md', modo: 'escrita', agora: '2026-09-08T09:00:00-03:00' });
    const deNovo = aoEncerrar(retomada, 2, {
      concluida: false,
      blocoAtual: 'pessoas-e-tom',
      perguntasRespondidas: ['q14', 'q15', 'q16', 'q17'],
      agora: '2026-09-08T09:30:00-03:00',
    });
    expect(deNovo.sessoes[2]).toMatchObject({
      blocoAtual: 'pessoas-e-tom',
      perguntasRespondidas: ['q11', 'q12', 'q13', 'q14', 'q15', 'q16', 'q17'],
    });
  });

  it('uma concluída nunca volta a incompleta', () => {
    const p = aposSessao1();
    const depois = aoEncerrar(p, 1, { concluida: false, blocoAtual: 'quem-e', perguntasRespondidas: [], agora: T2 });
    expect(depois.sessoes[1]).toEqual(p.sessoes[1]);
    expect(depois.atualizadoEm).toBe(T2);
  });

  it('lança para sessão não iniciada e para bloco de outra sessão', () => {
    expect(() => aoEncerrar(progressoInicial(T0), 1, { concluida: true, blocoAtual: 'quem-e', perguntasRespondidas: [], agora: T0 })).toThrow(/iniciada/);
    const iniciada = aoIniciar(progressoInicial(T0), 1, { arquivo: 's1.md', modo: 'voz', agora: T0 });
    expect(() => aoEncerrar(iniciada, 1, { concluida: false, blocoAtual: 'dominio', perguntasRespondidas: [], agora: T0 })).toThrow(/dominio/);
  });

  it('o que grava passa pela própria validação', () => {
    for (const p of [aposSessao1(), comSessao2Incompleta(), tudoConcluido()]) {
      expect(interpretarProgresso(JSON.parse(JSON.stringify(p)), 'x')).toEqual(p);
    }
  });
});

describe('resumoParaSetup', () => {
  it('inicial: a 1 é atual, as outras pendentes', () => {
    expect(resumoParaSetup(progressoInicial(T0))).toEqual([
      { numero: 1, nome: 'Quem é', estado: 'atual', data: null, arquivo: null },
      { numero: 2, nome: 'Como trabalha', estado: 'pendente', data: null, arquivo: null },
      { numero: 3, nome: 'Como vive', estado: 'pendente', data: null, arquivo: null },
    ]);
  });

  it('concluída com data de conclusão, incompleta com data de início, pendente sem data', () => {
    expect(resumoParaSetup(comSessao2Incompleta())).toEqual([
      { numero: 1, nome: 'Quem é', estado: 'concluida', data: T1, arquivo: 'sessao-1-quem-e-2026-09-06.md' },
      { numero: 2, nome: 'Como trabalha', estado: 'incompleta', data: T2, arquivo: 'sessao-2-como-trabalha-2026-09-07.md' },
      { numero: 3, nome: 'Como vive', estado: 'pendente', data: null, arquivo: null },
    ]);
  });

  it('sessão 1 concluída: a 2 é atual', () => {
    expect(resumoParaSetup(aposSessao1()).map((s) => s.estado)).toEqual(['concluida', 'atual', 'pendente']);
  });

  it('tudo concluído: nenhuma atual', () => {
    expect(resumoParaSetup(tudoConcluido()).map((s) => s.estado)).toEqual(['concluida', 'concluida', 'concluida']);
  });
});
