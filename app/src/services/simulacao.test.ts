import { describe, expect, it } from 'vitest';
import { FECHAMENTO, PERGUNTAS_NUMERADAS, blocoDaPergunta } from '../roteiro/roteiro';
import { entradaDeConducao } from '../shared/tipos';
import {
  IDS_COM_RESPOSTA_FICTICIA,
  RESPOSTAS_FICTICIAS,
  condutorSimulado,
  gerarWavMudo,
  respostaFicticia,
  segundosDeFalaSimulada,
  vozSimulada,
} from './simulacao';

const pergunta = (id: string) => {
  const p = id === FECHAMENTO.id ? FECHAMENTO : PERGUNTAS_NUMERADAS.find((x) => x.id === id);
  if (!p) throw new Error(`Sem pergunta ${id}.`);
  return p;
};

const entrada = (id: string, resposta: string, forcar = false) =>
  entradaDeConducao(1, blocoDaPergunta(id).nome, pergunta(id), resposta, forcar);

const ascii = (buffer: ArrayBuffer, inicio: number, tamanho: number): string =>
  String.fromCharCode(...new Uint8Array(buffer, inicio, tamanho));

describe('RESPOSTAS_FICTICIAS', () => {
  it('tem as 27 entradas, com os ids do roteiro na ordem', () => {
    const esperados = [...PERGUNTAS_NUMERADAS.map((p) => p.id), FECHAMENTO.id];
    expect(esperados).toHaveLength(27);
    expect(IDS_COM_RESPOSTA_FICTICIA).toEqual(esperados);
    expect(Object.keys(RESPOSTAS_FICTICIAS)).toEqual(esperados);
  });

  it('só as perguntas sem aprofundamento ficam sem pergunta de aprofundamento', () => {
    const semAprofundamento = Object.entries(RESPOSTAS_FICTICIAS)
      .filter(([, r]) => r.aprofundamento === undefined)
      .map(([id]) => id);
    expect(semAprofundamento).toEqual(['q18', 'q22', 'fechamento']);
    for (const id of semAprofundamento) expect(pergunta(id).permiteAprofundamento).toBe(false);
    for (const [id, r] of Object.entries(RESPOSTAS_FICTICIAS)) {
      if (r.aprofundamento !== undefined) {
        expect(r.respostaAoAprofundamento, id).toBeTruthy();
      }
      expect(r.resposta.length, id).toBeGreaterThan(0);
    }
  });

  it('as múltiplas escolhas trazem a opção escolhida', () => {
    expect(RESPOSTAS_FICTICIAS['q08']?.escolha).toBe(2);
    expect(RESPOSTAS_FICTICIAS['q12']?.escolha).toBe(1);
    expect(RESPOSTAS_FICTICIAS['q21']?.escolha).toBe(1);
    for (const [id, r] of Object.entries(RESPOSTAS_FICTICIAS)) {
      const p = pergunta(id);
      if (r.escolha !== undefined) {
        expect(p.tipo, id).toBe('multipla');
        expect(r.escolha, id).toBeLessThan(p.opcoes?.length ?? 0);
      } else {
        expect(p.tipo, id).toBe('aberta');
      }
    }
  });
});

describe('respostaFicticia', () => {
  it('devolve a resposta principal ou a do aprofundamento', () => {
    expect(respostaFicticia('q01', false)).toBe(RESPOSTAS_FICTICIAS['q01']?.resposta);
    expect(respostaFicticia('q01', true)).toBe(RESPOSTAS_FICTICIAS['q01']?.respostaAoAprofundamento);
    expect(respostaFicticia('q18', true)).toBeNull();
    expect(respostaFicticia('fechamento', false)).toContain('espero que esteja bem');
    expect(respostaFicticia('inexistente', false)).toBeNull();
  });
});

describe('condutorSimulado', () => {
  const condutor = condutorSimulado();

  it('aprofunda em resposta curta, com a pergunta do protótipo', async () => {
    const d = await condutor.decidir(entrada('q01', 'Sou advogada.'));
    expect(d.aprofundar).toBe(true);
    expect(d.pergunta).toBe(RESPOSTAS_FICTICIAS['q01']?.aprofundamento);
    expect(d.origem).toBe('simulacao');
    expect(d.motivo.length).toBeGreaterThan(0);
  });

  it('não aprofunda em resposta longa', async () => {
    const longa = 'x'.repeat(160);
    const d = await condutor.decidir(entrada('q01', longa));
    expect(d).toMatchObject({ aprofundar: false, pergunta: null, origem: 'simulacao' });
  });

  it('forçar aprofunda mesmo com resposta longa', async () => {
    const d = await condutor.decidir(entrada('q01', 'x'.repeat(300), true));
    expect(d.aprofundar).toBe(true);
    expect(d.pergunta).toBe(RESPOSTAS_FICTICIAS['q01']?.aprofundamento);
    expect(d.origem).toBe('simulacao');
  });

  it('forçar numa pergunta sem aprofundamento no protótipo usa a genérica', async () => {
    const q08 = pergunta('q08');
    const semAprof = entradaDeConducao(
      1,
      'Voz e escrita',
      { ...q08, id: 'q99', permiteAprofundamento: true },
      'C — a terceira',
      true,
    );
    const d = await condutor.decidir(semAprof);
    expect(d.aprofundar).toBe(true);
    expect(d.pergunta).toBe('Pode me dar um exemplo concreto disso?');
  });

  it('permiteAprofundamento=false → origem regra, mesmo forçando', async () => {
    const d = await condutor.decidir(entrada('q18', 'Formal com juiz.', true));
    expect(d).toMatchObject({ aprofundar: false, pergunta: null, origem: 'regra' });
  });
});

describe('gerarWavMudo', () => {
  it('escreve um cabeçalho RIFF/WAVE coerente com 16 kHz mono 16-bit', () => {
    const wav = gerarWavMudo(1);
    const vista = new DataView(wav);
    expect(wav.byteLength).toBe(44 + 16_000 * 2);
    expect(ascii(wav, 0, 4)).toBe('RIFF');
    expect(vista.getUint32(4, true)).toBe(wav.byteLength - 8);
    expect(ascii(wav, 8, 4)).toBe('WAVE');
    expect(ascii(wav, 12, 4)).toBe('fmt ');
    expect(vista.getUint32(16, true)).toBe(16);
    expect(vista.getUint16(20, true)).toBe(1);
    expect(vista.getUint16(22, true)).toBe(1);
    expect(vista.getUint32(24, true)).toBe(16_000);
    expect(vista.getUint32(28, true)).toBe(32_000);
    expect(vista.getUint16(32, true)).toBe(2);
    expect(vista.getUint16(34, true)).toBe(16);
    expect(ascii(wav, 36, 4)).toBe('data');
    expect(vista.getUint32(40, true)).toBe(32_000);
    expect(new Uint8Array(wav, 44).every((b) => b === 0)).toBe(true);
  });

  it('meio segundo tem metade dos dados; zero segundos só o cabeçalho', () => {
    expect(gerarWavMudo(0.5).byteLength).toBe(44 + 16_000);
    expect(gerarWavMudo(0).byteLength).toBe(44);
  });
});

describe('vozSimulada', () => {
  it('falar devolve WAV mudo com duração proporcional às palavras, entre 0,4 s e 6 s', async () => {
    const voz = vozSimulada({ perguntaAtual: () => null, aprofundamentoAberto: () => false });
    expect(segundosDeFalaSimulada('uma')).toBe(0.4);
    expect(segundosDeFalaSimulada(Array(20).fill('palavra').join(' '))).toBeCloseTo(1.2);
    expect(segundosDeFalaSimulada(Array(500).fill('palavra').join(' '))).toBe(6);

    const falado = await voz.falar(Array(20).fill('palavra').join(' '), 'helios');
    expect(falado.mime).toBe('audio/wav');
    expect(falado.audio.byteLength).toBe(44 + Math.round(1.2 * 16_000) * 2);
    expect(ascii(falado.audio, 0, 4)).toBe('RIFF');
  });

  it('transcrever devolve a resposta fictícia da pergunta lida, ou a do aprofundamento', async () => {
    let atual: string | null = 'q03';
    let aberto = false;
    const voz = vozSimulada({ perguntaAtual: () => atual, aprofundamentoAberto: () => aberto });

    const principal = await voz.transcrever(new ArrayBuffer(8), 'audio/wav');
    expect(principal.texto).toBe(RESPOSTAS_FICTICIAS['q03']?.resposta);
    expect(principal.duracao).toBeGreaterThan(0);

    aberto = true;
    const aprofundada = await voz.transcrever(new ArrayBuffer(8), 'audio/wav');
    expect(aprofundada.texto).toBe(RESPOSTAS_FICTICIAS['q03']?.respostaAoAprofundamento);

    atual = null;
    const semPergunta = await voz.transcrever(new ArrayBuffer(8), 'audio/wav');
    expect(semPergunta.texto.length).toBeGreaterThan(0);
  });
});
