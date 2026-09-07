import { describe, expect, it } from 'vitest';

import { estadoDasChaves, provisionarChaves, valoresDoArquivoDeChaves } from './chaves';

const CLAUDE_OK = 'sk-ant-api03-Xk9pQ2mL7vR4tY8wZ1aB3cD5eF6gH0jK';
const GROK_OK = 'xai-7Hq2Lm9Pz4Rt6Vw8Yb1Nc3Df5Gh0Jk2Lm';

describe('provisionarChaves', () => {
  it('sem fontes, tudo ausente', () => {
    const p = provisionarChaves([]);
    expect(p.claude).toEqual({ situacao: 'ausente', fonte: null, chave: null });
    expect(p.grok).toEqual({ situacao: 'ausente', fonte: null, chave: null });
    expect(estadoDasChaves(p)).toEqual({ claude: 'ausente', grok: 'ausente' });
  });

  it('lê as duas chaves de um arquivo, aparando espaços', () => {
    const p = provisionarChaves([{ nome: 'arquivo', valores: { claude: `  ${CLAUDE_OK}\n`, grok: GROK_OK } }]);
    expect(p.claude).toEqual({ situacao: 'presente', fonte: 'arquivo', chave: CLAUDE_OK });
    expect(p.grok).toEqual({ situacao: 'presente', fonte: 'arquivo', chave: GROK_OK });
  });

  it('a primeira fonte com valor vence, motor a motor', () => {
    const outraClaude = 'sk-ant-api03-OutraChaveValida0123456789';
    const p = provisionarChaves([
      { nome: 'ambiente', valores: { claude: outraClaude } },
      { nome: 'arquivo', valores: { claude: CLAUDE_OK, grok: GROK_OK } },
    ]);
    expect(p.claude).toEqual({ situacao: 'presente', fonte: 'ambiente', chave: outraClaude });
    expect(p.grok).toEqual({ situacao: 'presente', fonte: 'arquivo', chave: GROK_OK });
  });

  it('valor vazio, ausente ou de outro tipo não conta e deixa passar à fonte seguinte', () => {
    const p = provisionarChaves([
      { nome: 'ambiente', valores: { claude: '', grok: 42 } },
      { nome: 'arquivo', valores: { claude: CLAUDE_OK, grok: GROK_OK } },
    ]);
    expect(p.claude.fonte).toBe('arquivo');
    expect(p.grok.fonte).toBe('arquivo');
  });

  it('formato errado é «invalida» e não é mascarado por outra fonte', () => {
    const p = provisionarChaves([
      { nome: 'ambiente', valores: { claude: 'sk-ant-curta' } },
      { nome: 'arquivo', valores: { claude: CLAUDE_OK } },
    ]);
    expect(p.claude).toEqual({ situacao: 'invalida', fonte: 'ambiente', chave: null });
    expect(estadoDasChaves(p).claude).toBe('invalida');
  });

  it('prefixo trocado entre os motores é inválido', () => {
    const p = provisionarChaves([{ nome: 'arquivo', valores: { claude: GROK_OK, grok: CLAUDE_OK } }]);
    expect(p.claude.situacao).toBe('invalida');
    expect(p.grok.situacao).toBe('invalida');
  });
});

describe('valoresDoArquivoDeChaves', () => {
  it('só aproveita as duas chaves conhecidas de um objeto', () => {
    expect(valoresDoArquivoDeChaves({ claude: 'a', grok: 'b', outra: 'c' })).toEqual({ claude: 'a', grok: 'b' });
  });

  it('qualquer coisa que não seja objeto vira vazio', () => {
    expect(valoresDoArquivoDeChaves(undefined)).toEqual({});
    expect(valoresDoArquivoDeChaves('texto')).toEqual({});
    expect(valoresDoArquivoDeChaves(['claude'])).toEqual({});
    expect(valoresDoArquivoDeChaves(null)).toEqual({});
  });
});
