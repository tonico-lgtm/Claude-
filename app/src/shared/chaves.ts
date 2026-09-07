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
 * ser mascarado por uma chave antiga em outra fonte.
 */

import { chaveTemFormatoValido } from './tipos';
import type { EstadoChaves, Motor, SituacaoChave } from './tipos';

export interface FonteDeChaves {
  /** Nome curto para diagnóstico ("ambiente", "chaves.local.json"). */
  readonly nome: string;
  /** Valores brutos; só strings não vazias contam. */
  readonly valores: Readonly<Partial<Record<Motor, unknown>>>;
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
