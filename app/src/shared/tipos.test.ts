import { describe, expect, it } from 'vitest';

import {
  chaveTemFormatoValido,
  dataLocalIso,
  formatarCarimbo,
  formatarDuracao,
  instanteLocalIso,
} from './tipos';

describe('instanteLocalIso', () => {
  it('formata na hora local, com milissegundos e o deslocamento do fuso', () => {
    const data = new Date(2026, 8, 6, 22, 30, 11, 45);
    const texto = instanteLocalIso(data);
    expect(texto.startsWith('2026-09-06T22:30:11.045')).toBe(true);
    expect(texto).toMatch(/[+-]\d{2}:\d{2}$/);
  });

  it('é lido de volta como o mesmo instante', () => {
    const data = new Date(2026, 8, 6, 22, 30, 11, 45);
    expect(new Date(instanteLocalIso(data)).getTime()).toBe(data.getTime());
  });

  it('a data do texto é a mesma do nome do arquivo, mesmo perto da meia-noite', () => {
    const data = new Date(2026, 8, 6, 23, 59, 59);
    expect(dataLocalIso(data)).toBe('2026-09-06');
    expect(instanteLocalIso(data).slice(0, 10)).toBe('2026-09-06');
  });
});

describe('formatação de tempo', () => {
  it('duração em hh:mm:ss', () => {
    expect(formatarDuracao(0)).toBe('00:00:00');
    expect(formatarDuracao(3661)).toBe('01:01:01');
  });

  it('carimbo em mm:ss até uma hora e h:mm:ss depois', () => {
    expect(formatarCarimbo(65)).toBe('01:05');
    expect(formatarCarimbo(3665)).toBe('1:01:05');
  });
});

describe('chaveTemFormatoValido', () => {
  it('aceita os prefixos com ao menos vinte caracteres depois', () => {
    expect(chaveTemFormatoValido('claude', 'sk-ant-api03-Xk9pQ2mL7vR4tY8wZ1aB3cD5eF6gH0jK')).toBe(true);
    expect(chaveTemFormatoValido('grok', 'xai-7Hq2Lm9Pz4Rt6Vw8Yb1Nc3Df5Gh0Jk2Lm')).toBe(true);
  });

  it('recusa prefixo trocado ou chave curta', () => {
    expect(chaveTemFormatoValido('claude', 'xai-7Hq2Lm9Pz4Rt6Vw8Yb1Nc3Df5Gh0Jk2Lm')).toBe(false);
    expect(chaveTemFormatoValido('grok', 'xai-curta')).toBe(false);
  });
});
