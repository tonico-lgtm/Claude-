import { describe, expect, it } from 'vitest';
import type { LinhaTranscricao } from '../shared/tipos';
import {
  cabecalhoDaSessao,
  marcadorDeRetomada,
  nomeDoArquivoDaSessao,
  rodapeDaSessao,
  trechoDaLinha,
} from './transcricao';

/** Linha de teste com defaults plausíveis; só o que importa é sobrescrito. */
function linha(parcial: Partial<LinhaTranscricao> & Pick<LinhaTranscricao, 'id'>): LinhaTranscricao {
  return {
    quem: 'entrevistadora',
    texto: 'Texto',
    segundos: 0,
    instante: '2026-09-06T14:03:11-03:00',
    perguntaId: 'q01',
    blocoId: 'quem-e',
    origem: 'pergunta',
    ...parcial,
  };
}

describe('nomeDoArquivoDaSessao', () => {
  it('usa o slug da sessão e a data local em AAAA-MM-DD', () => {
    expect(nomeDoArquivoDaSessao(1, new Date(2026, 8, 6))).toBe('sessao-1-quem-e-2026-09-06.md');
    expect(nomeDoArquivoDaSessao(2, new Date(2026, 8, 6))).toBe('sessao-2-como-trabalha-2026-09-06.md');
    expect(nomeDoArquivoDaSessao(3, new Date(2026, 8, 6))).toBe('sessao-3-como-vive-2026-09-06.md');
  });

  it('preenche mês e dia de um dígito com zero', () => {
    expect(nomeDoArquivoDaSessao(1, new Date(2027, 0, 3))).toBe('sessao-1-quem-e-2027-01-03.md');
  });
});

describe('cabecalhoDaSessao', () => {
  it('produz o Markdown do §4 com o nome da voz e os blocos da sessão', () => {
    const texto = cabecalhoDaSessao({
      sessao: 1,
      modo: 'voz',
      voz: 'helios',
      inicio: '2026-09-06T14:03:11-03:00',
      arquivo: 'sessao-1-quem-e-2026-09-06.md',
    });
    expect(texto).toBe(
      [
        '# Entrevista Twin — Sessão 1 de 3: Quem é',
        '',
        '- Roteiro: v1',
        '- Início: 2026-09-06T14:03:11-03:00',
        '- Modo inicial: voz (Helios)',
        '- Arquivo: sessao-1-quem-e-2026-09-06.md',
        '- Blocos: 1 Quem é · 2 Trajetória · 3 Voz e escrita',
        '',
        '---',
        '',
        '',
      ].join('\n'),
    );
  });

  it('aceita modo escrita e a voz Leo; a sessão 3 lista dois blocos', () => {
    const texto = cabecalhoDaSessao({
      sessao: 3,
      modo: 'escrita',
      voz: 'leo',
      inicio: '2026-10-01T09:00:00-03:00',
      arquivo: 'sessao-3-como-vive-2026-10-01.md',
    });
    expect(texto).toContain('# Entrevista Twin — Sessão 3 de 3: Como vive');
    expect(texto).toContain('- Modo inicial: escrita (Leo)');
    expect(texto).toContain('- Blocos: 7 Rotina e ferramentas · 8 Fora do escritório');
  });
});

describe('marcadorDeRetomada', () => {
  it('é uma citação isolada por linhas em branco', () => {
    expect(marcadorDeRetomada('2026-09-07T10:00:00-03:00', 'Trajetória')).toBe(
      '\n> Sessão retomada em 2026-09-07T10:00:00-03:00 a partir do bloco «Trajetória».\n\n',
    );
  });
});

describe('trechoDaLinha', () => {
  const pergunta1 = linha({
    id: 'l0001',
    segundos: 6,
    texto: 'Como você se apresenta quando alguém pergunta o que você faz?',
  });

  it('na primeira linha do bloco emite ## e ### antes da fala', () => {
    expect(trechoDaLinha([], pergunta1)).toBe(
      '## Bloco 1 · Quem é\n\n' +
        '### Pergunta 1 — Como você se apresenta quando alguém pergunta o que você faz?\n\n' +
        '**[00:06] Entrevistadora:** Como você se apresenta quando alguém pergunta o que você faz?\n\n',
    );
  });

  it('na segunda pergunta do mesmo bloco emite só ###', () => {
    const resposta = linha({ id: 'l0002', quem: 'cliente', origem: 'voz', segundos: 76, texto: 'Digo que sou advogada.' });
    const pergunta2 = linha({
      id: 'l0003',
      perguntaId: 'q02',
      segundos: 80,
      texto: 'O que as pessoas costumam errar sobre você numa primeira impressão?',
    });
    expect(trechoDaLinha([pergunta1, resposta], pergunta2)).toBe(
      '### Pergunta 2 — O que as pessoas costumam errar sobre você numa primeira impressão?\n\n' +
        '**[01:20] Entrevistadora:** O que as pessoas costumam errar sobre você numa primeira impressão?\n\n',
    );
  });

  it('cliente (voz e escrita) e aprofundamento não abrem cabeçalho', () => {
    const voz = linha({ id: 'l0002', quem: 'cliente', origem: 'voz', segundos: 76, texto: 'Digo que sou advogada.' });
    expect(trechoDaLinha([pergunta1], voz)).toBe('**[01:16] Cliente (voz):** Digo que sou advogada.\n\n');

    const aprofundamento = linha({
      id: 'l0003',
      origem: 'aprofundamento',
      segundos: 91,
      texto: 'Pode me dar um exemplo concreto disso?',
    });
    expect(trechoDaLinha([pergunta1, voz], aprofundamento)).toBe(
      '**[01:31] Entrevistadora (aprofundamento):** Pode me dar um exemplo concreto disso?\n\n',
    );

    const escrita = linha({ id: 'l0004', quem: 'cliente', origem: 'escrita', segundos: 130, texto: 'Na semana passada, numa reunião.' });
    expect(trechoDaLinha([pergunta1, voz, aprofundamento], escrita)).toBe(
      '**[02:10] Cliente (escrita):** Na semana passada, numa reunião.\n\n',
    );
  });

  it('a despedida não tem ### nem ## novo, mesmo sem bloco anterior', () => {
    const despedida = linha({
      id: 'l0099',
      origem: 'despedida',
      perguntaId: null,
      blocoId: null,
      segundos: 1500,
      texto: 'Obrigada. Esta sessão está encerrada.',
    });
    expect(trechoDaLinha([pergunta1], despedida)).toBe('**[25:00] Entrevistadora:** Obrigada. Esta sessão está encerrada.\n\n');
    expect(trechoDaLinha([], despedida)).toBe('**[25:00] Entrevistadora:** Obrigada. Esta sessão está encerrada.\n\n');

    const despedidaComBloco = linha({
      id: 'l0100',
      origem: 'despedida',
      perguntaId: null,
      blocoId: 'fora-do-escritorio',
      segundos: 1500,
      texto: 'Obrigada. A entrevista está encerrada.',
    });
    expect(trechoDaLinha([], despedidaComBloco)).not.toContain('##');
  });

  it('o fechamento recebe ### Fechamento, sem número', () => {
    const fechamento = linha({
      id: 'l0050',
      perguntaId: 'fechamento',
      blocoId: 'fora-do-escritorio',
      segundos: 3661,
      texto: 'Se um assistente fosse escrever no seu lugar amanhã, o que ele precisaria saber que ninguém pensaria em perguntar?',
    });
    const anterior = linha({ id: 'l0049', perguntaId: 'q26', blocoId: 'fora-do-escritorio' });
    expect(trechoDaLinha([anterior], fechamento)).toBe(
      '### Fechamento — Se um assistente fosse escrever no seu lugar amanhã, o que ele precisaria saber que ninguém pensaria em perguntar?\n\n' +
        '**[1:01:01] Entrevistadora:** Se um assistente fosse escrever no seu lugar amanhã, o que ele precisaria saber que ninguém pensaria em perguntar?\n\n',
    );
  });

  it('um bloco novo no meio da sessão abre ## e ###', () => {
    const pergunta4 = linha({ id: 'l0010', perguntaId: 'q04', blocoId: 'trajetoria', segundos: 400, texto: 'Qual foi a decisão que mais mudou o rumo da sua carreira?' });
    expect(trechoDaLinha([pergunta1], pergunta4)).toBe(
      '## Bloco 2 · Trajetória\n\n' +
        '### Pergunta 4 — Qual foi a decisão que mais mudou o rumo da sua carreira?\n\n' +
        '**[06:40] Entrevistadora:** Qual foi a decisão que mais mudou o rumo da sua carreira?\n\n',
    );
  });

  it('quebras de linha no texto do cliente viram um espaço simples', () => {
    const escrita = linha({
      id: 'l0002',
      quem: 'cliente',
      origem: 'escrita',
      segundos: 76,
      texto: '  Primeira linha.\n\nSegunda linha.\r\n   Terceira linha.  ',
    });
    expect(trechoDaLinha([pergunta1], escrita)).toBe(
      '**[01:16] Cliente (escrita):** Primeira linha. Segunda linha. Terceira linha.\n\n',
    );
  });
});

describe('rodapeDaSessao', () => {
  it('sessão concluída', () => {
    expect(
      rodapeDaSessao({
        concluida: true,
        instante: '2026-09-06T14:30:23-03:00',
        segundos: 1632,
        perguntasRespondidas: 10,
        totalPerguntas: 10,
      }),
    ).toBe(
      [
        '---',
        '',
        '- Encerrada em 2026-09-06T14:30:23-03:00',
        '- Duração: 00:27:12',
        '- Perguntas respondidas: 10 de 10',
        '- Situação: concluída',
        '',
      ].join('\n'),
    );
  });

  it('sessão incompleta diz de que bloco recomeça', () => {
    const texto = rodapeDaSessao({
      concluida: false,
      instante: '2026-09-06T14:20:00-03:00',
      segundos: 3725,
      perguntasRespondidas: 9,
      totalPerguntas: 10,
      blocoDeRetomadaNome: 'Voz e escrita',
    });
    expect(texto).toContain('- Duração: 01:02:05');
    expect(texto).toContain('- Perguntas respondidas: 9 de 10');
    expect(texto.endsWith('- Situação: incompleta (recomeça do bloco «Voz e escrita»)\n')).toBe(true);
  });

  it('sessão incompleta sem bloco informado não inventa um', () => {
    const texto = rodapeDaSessao({
      concluida: false,
      instante: '2026-09-06T14:20:00-03:00',
      segundos: 10,
      perguntasRespondidas: 0,
      totalPerguntas: 10,
    });
    expect(texto.endsWith('- Situação: incompleta\n')).toBe(true);
  });
});
