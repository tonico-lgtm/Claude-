/**
 * Provisionamento das chaves de API.
 *
 * As chaves não são digitadas na tela. O processo principal as lê de fontes
 * externas, em ordem de precedência (variáveis de ambiente, depois o arquivo
 * local `chaves.local.json`), e este módulo decide, para cada motor, qual
 * chave vale e em que situação ela está. É puro: quem lê disco ou ambiente
 * monta as `FonteDeChaves` e chama `provisionarChaves`.
 *
 * Regra: para cada motor, vale a primeira fonte que traz um valor não vazio.
 * Se esse valor não tem o formato esperado, a chave conta como `invalida` e
 * as fontes seguintes não são consultadas — um erro de digitação não pode
 * ser mascarado por uma chave antiga em outra fonte. Uma fonte `ilegivel`
 * (arquivo presente, mas que não pôde ser lido como JSON) também interrompe
 * a busca, para que o problema apareça na tela em vez de "não encontrada".
 */

import { chaveTemFormatoValido } from './tipos';
import type { EstadoChaves, Motor, SituacaoChave } from './tipos';

export interface FonteDeChaves {
  /** Nome curto para diagnóstico ("ambiente", "chaves.local.json"). */
  readonly nome: string;
  /** Valores brutos; só strings não vazias contam. */
  readonly valores: Readonly<Partial<Record<Motor, unknown>>>;
  /** `true` quando a fonte existe mas não pôde ser interpretada (JSON malformado). */
  readonly ilegivel?: boolean;
}

export interface ChaveProvisionada {
  readonly situacao: SituacaoChave;
  /** Nome da fonte de onde a chave veio (ou onde está inválida); `null` se ausente. */
  readonly fonte: string | null;
  /** A chave em claro; só existe quando `situacao === 'presente'`. */
  readonly chave: string | null;
}

export interface ChavesProvisionadas {
  readonly claude: ChaveProvisionada;
  readonly grok: ChaveProvisionada;
}

export const MOTORES: readonly Motor[] = ['claude', 'grok'];

function provisionarUma(motor: Motor, fontes: readonly FonteDeChaves[]): ChaveProvisionada {
  for (const fonte of fontes) {
    if (fonte.ilegivel) return { situacao: 'ilegivel', fonte: fonte.nome, chave: null };
    const bruto = fonte.valores[motor];
    if (typeof bruto !== 'string') continue;
    const limpa = bruto.trim();
    if (limpa === '') continue;
    return chaveTemFormatoValido(motor, limpa)
      ? { situacao: 'presente', fonte: fonte.nome, chave: limpa }
      : { situacao: 'invalida', fonte: fonte.nome, chave: null };
  }
  return { situacao: 'ausente', fonte: null, chave: null };
}

export function provisionarChaves(fontes: readonly FonteDeChaves[]): ChavesProvisionadas {
  return { claude: provisionarUma('claude', fontes), grok: provisionarUma('grok', fontes) };
}

export function estadoDasChaves(provisionadas: ChavesProvisionadas): EstadoChaves {
  return { claude: provisionadas.claude.situacao, grok: provisionadas.grok.situacao };
}

/**
 * Interpreta o texto de `chaves.local.json` com tolerância ao que um editor de
 * texto comum faz: BOM no início e aspas tipográficas (“ ” „ ‘ ’) no lugar das
 * retas. Devolve `null` quando nem assim é JSON.
 */
export function interpretarTextoDeChaves(texto: string): unknown | null {
  const normalizado = texto
    .replace(/^\uFEFF/, '')
    .replace(/[\u201C\u201D\u201E\u201F\u00AB\u00BB]/g, '"')
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'");
  try {
    return JSON.parse(normalizado) as unknown;
  } catch {
    return null;
  }
}

/** Interpreta o conteúdo bruto de `chaves.local.json`; qualquer coisa que não seja objeto vira vazio. */
export function valoresDoArquivoDeChaves(json: unknown): Readonly<Partial<Record<Motor, unknown>>> {
  if (typeof json !== 'object' || json === null || Array.isArray(json)) return {};
  const o = json as Record<string, unknown>;
  const valores: Partial<Record<Motor, unknown>> = {};
  for (const motor of MOTORES) {
    if (motor in o) valores[motor] = o[motor];
  }
  return valores;
}
