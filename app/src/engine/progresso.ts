/**
 * Progresso entre sessões — o conteúdo de `progresso.json`, gravado na pasta
 * de destino ao lado das transcrições.
 *
 * Puro: sem I/O, sem relógio (o instante vem por parâmetro). Toda função que
 * altera o progresso devolve um objeto novo com `atualizadoEm = agora`.
 *
 * Invariantes que este módulo garante:
 * - as sessões seguem a ordem 1 → 2 → 3: só se inicia a que `proximaSessao`
 *   aponta;
 * - uma sessão `concluida` nunca volta a `incompleta`;
 * - o que se grava aqui passa pelo próprio `interpretarProgresso` — senão a
 *   releitura descartaria o arquivo e o progresso se perderia.
 */

import { z } from 'zod';
import { SESSOES, sessaoPorNumero } from '../roteiro/roteiro';
import type { Modo, NumeroSessao, Progresso, SessaoGravada } from '../shared/tipos';

export type AcaoDaSessao = 'iniciar' | 'retomar' | 'continuar';

export interface ResumoSessao {
  readonly numero: NumeroSessao;
  readonly nome: string;
  /** 'atual' é a pendente que `proximaSessao` aponta; a incompleta continua 'incompleta'. */
  readonly estado: 'concluida' | 'incompleta' | 'atual' | 'pendente';
  /** Conclusão (concluída) ou início (incompleta); `null` se pendente. */
  readonly data: string | null;
  readonly arquivo: string | null;
}

const PENDENTE: SessaoGravada = { estado: 'pendente' };

const NUMEROS: readonly NumeroSessao[] = [1, 2, 3];

// ---------------------------------------------------------------------------
// Validação (zod) — estrita: chave desconhecida ou ordem incoerente invalida o arquivo
// ---------------------------------------------------------------------------

const schemaModo = z.enum(['voz', 'escrita']);

const schemaPendente = z.object({ estado: z.literal('pendente') }).strict();

const schemaIncompleta = z
  .object({
    estado: z.literal('incompleta'),
    arquivo: z.string().min(1),
    iniciadaEm: z.string(),
    modo: schemaModo,
    blocoAtual: z.string().min(1),
    perguntasRespondidas: z.array(z.string()),
  })
  .strict();

const schemaConcluida = z
  .object({
    estado: z.literal('concluida'),
    arquivo: z.string().min(1),
    iniciadaEm: z.string(),
    concluidaEm: z.string(),
    modo: schemaModo,
  })
  .strict();

const schemaSessaoGravada = z.discriminatedUnion('estado', [
  schemaPendente,
  schemaIncompleta,
  schemaConcluida,
]);

const schemaProgresso = z
  .object({
    versao: z.literal(1),
    roteiro: z.literal('v1'),
    atualizadoEm: z.string(),
    sessoes: z
      .object({ 1: schemaSessaoGravada, 2: schemaSessaoGravada, 3: schemaSessaoGravada })
      .strict(),
  })
  .strict()
  .superRefine((p, ctx) => {
    // Ordem obrigatória: concluídas primeiro, no máximo uma incompleta, depois só pendentes.
    let fechado = false;
    for (const numero of NUMEROS) {
      const s = p.sessoes[numero];
      if (fechado && s.estado !== 'pendente') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `A sessão ${numero} não pode estar ${s.estado} antes de a anterior ser concluída.`,
          path: ['sessoes', numero],
        });
        return;
      }
      if (s.estado !== 'concluida') fechado = true;
      if (s.estado === 'incompleta' && !blocoPertenceASessao(numero, s.blocoAtual)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `O bloco «${s.blocoAtual}» não pertence à sessão ${numero}.`,
          path: ['sessoes', numero, 'blocoAtual'],
        });
        return;
      }
    }
  });

// ---------------------------------------------------------------------------
// Leitura
// ---------------------------------------------------------------------------

/** As três sessões pendentes. */
export function progressoInicial(agora: string): Progresso {
  return {
    versao: 1,
    roteiro: 'v1',
    atualizadoEm: agora,
    sessoes: { 1: PENDENTE, 2: PENDENTE, 3: PENDENTE },
  };
}

/**
 * Interpreta o JSON já desserializado. Qualquer falha (forma, versão, roteiro,
 * ordem incoerente) devolve o progresso inicial: não há reparo parcial.
 */
export function interpretarProgresso(json: unknown, agora: string): Progresso {
  const resultado = schemaProgresso.safeParse(json);
  if (!resultado.success) return progressoInicial(agora);
  const p: Progresso = resultado.data;
  return p;
}

/** A sessão que o botão principal aciona; `null` quando as três estão concluídas. */
export function proximaSessao(p: Progresso): { numero: NumeroSessao; acao: AcaoDaSessao } | null {
  for (const numero of NUMEROS) {
    const s = p.sessoes[numero];
    if (s.estado === 'incompleta') return { numero, acao: 'retomar' };
    if (s.estado === 'pendente') return { numero, acao: numero === 1 ? 'iniciar' : 'continuar' };
  }
  return null;
}

/** Os quatro rótulos do botão principal do setup. */
export function rotuloDoBotao(p: Progresso): string {
  const proxima = proximaSessao(p);
  if (proxima === null) return 'ENTREVISTA CONCLUÍDA';
  switch (proxima.acao) {
    case 'iniciar':
      return `INICIAR SESSÃO ${proxima.numero}`;
    case 'retomar':
      return `RETOMAR SESSÃO ${proxima.numero}`;
    case 'continuar':
      return `CONTINUAR — SESSÃO ${proxima.numero}`;
  }
}

// ---------------------------------------------------------------------------
// Transições
// ---------------------------------------------------------------------------

/**
 * Marca a sessão como `incompleta` no primeiro bloco. Só aceita a sessão que
 * `proximaSessao` aponta. Na retomada de uma incompleta, preserva arquivo,
 * início, bloco e perguntas já respondidas — a sessão continua no mesmo
 * arquivo — e registra só o modo escolhido agora.
 */
export function aoIniciar(
  p: Progresso,
  numero: NumeroSessao,
  x: { arquivo: string; modo: Modo; agora: string },
): Progresso {
  const proxima = proximaSessao(p);
  if (proxima === null) {
    throw new Error(`Não é possível iniciar a sessão ${numero}: a entrevista já está concluída.`);
  }
  if (proxima.numero !== numero) {
    throw new Error(
      `Não é possível iniciar a sessão ${numero}: a sessão ${proxima.numero} vem antes (${proxima.acao}).`,
    );
  }
  const atual = p.sessoes[numero];
  if (atual.estado === 'incompleta') {
    return comSessao(p, numero, { ...atual, modo: x.modo }, x.agora);
  }
  if (x.arquivo.trim() === '') {
    throw new Error(`Não é possível iniciar a sessão ${numero} sem nome de arquivo.`);
  }
  return comSessao(
    p,
    numero,
    {
      estado: 'incompleta',
      arquivo: x.arquivo,
      iniciadaEm: x.agora,
      modo: x.modo,
      blocoAtual: primeiroBloco(numero),
      perguntasRespondidas: [],
    },
    x.agora,
  );
}

/**
 * Atualiza a sessão incompleta durante a execução. As perguntas respondidas
 * acumulam com as de execuções anteriores (uma retomada recomeça com a lista
 * vazia no motor, mas o que foi respondido antes continua respondido).
 */
export function aoAvancar(
  p: Progresso,
  numero: NumeroSessao,
  x: { blocoAtual: string; perguntasRespondidas: readonly string[]; agora: string },
): Progresso {
  const atual = p.sessoes[numero];
  if (atual.estado === 'concluida') return { ...p, atualizadoEm: x.agora };
  if (atual.estado === 'pendente') {
    throw new Error(`Não é possível avançar a sessão ${numero}: ela ainda não foi iniciada.`);
  }
  exigirBlocoDaSessao(numero, x.blocoAtual);
  return comSessao(
    p,
    numero,
    {
      ...atual,
      blocoAtual: x.blocoAtual,
      perguntasRespondidas: unir(atual.perguntasRespondidas, x.perguntasRespondidas),
    },
    x.agora,
  );
}

/**
 * Fecha a execução: `concluida` (definitivo) ou `incompleta` no bloco de onde
 * recomeça. Uma sessão já concluída não muda.
 */
export function aoEncerrar(
  p: Progresso,
  numero: NumeroSessao,
  x: { concluida: boolean; blocoAtual: string; perguntasRespondidas: readonly string[]; agora: string },
): Progresso {
  const atual = p.sessoes[numero];
  if (atual.estado === 'concluida') return { ...p, atualizadoEm: x.agora };
  if (atual.estado === 'pendente') {
    throw new Error(`Não é possível encerrar a sessão ${numero}: ela ainda não foi iniciada.`);
  }
  if (x.concluida) {
    return comSessao(
      p,
      numero,
      {
        estado: 'concluida',
        arquivo: atual.arquivo,
        iniciadaEm: atual.iniciadaEm,
        concluidaEm: x.agora,
        modo: atual.modo,
      },
      x.agora,
    );
  }
  exigirBlocoDaSessao(numero, x.blocoAtual);
  return comSessao(
    p,
    numero,
    {
      ...atual,
      blocoAtual: x.blocoAtual,
      perguntasRespondidas: unir(atual.perguntasRespondidas, x.perguntasRespondidas),
    },
    x.agora,
  );
}

// ---------------------------------------------------------------------------
// Para a tela de setup
// ---------------------------------------------------------------------------

/** Uma entrada por sessão, na ordem do roteiro, para o roteiro agrupado. */
export function resumoParaSetup(p: Progresso): readonly ResumoSessao[] {
  const proxima = proximaSessao(p);
  return SESSOES.map((sessao) => {
    const s = p.sessoes[sessao.numero];
    switch (s.estado) {
      case 'concluida':
        return { numero: sessao.numero, nome: sessao.nome, estado: 'concluida', data: s.concluidaEm, arquivo: s.arquivo };
      case 'incompleta':
        return { numero: sessao.numero, nome: sessao.nome, estado: 'incompleta', data: s.iniciadaEm, arquivo: s.arquivo };
      case 'pendente':
        return {
          numero: sessao.numero,
          nome: sessao.nome,
          estado: proxima !== null && proxima.numero === sessao.numero ? 'atual' : 'pendente',
          data: null,
          arquivo: null,
        };
    }
  });
}

// ---------------------------------------------------------------------------
// Apoio
// ---------------------------------------------------------------------------

function comSessao(p: Progresso, numero: NumeroSessao, sessao: SessaoGravada, agora: string): Progresso {
  return { ...p, atualizadoEm: agora, sessoes: { ...p.sessoes, [numero]: sessao } };
}

function primeiroBloco(numero: NumeroSessao): string {
  const primeiro = sessaoPorNumero(numero).blocos[0];
  if (!primeiro) throw new Error(`A sessão ${numero} não tem blocos no roteiro v1.`);
  return primeiro.id;
}

function blocoPertenceASessao(numero: NumeroSessao, blocoId: string): boolean {
  return sessaoPorNumero(numero).blocos.some((b) => b.id === blocoId);
}

function exigirBlocoDaSessao(numero: NumeroSessao, blocoId: string): void {
  if (!blocoPertenceASessao(numero, blocoId)) {
    throw new Error(`O bloco «${blocoId}» não pertence à sessão ${numero}.`);
  }
}

/** União preservando a ordem: os antigos primeiro, depois os novos ainda não vistos. */
function unir(antigos: readonly string[], novos: readonly string[]): readonly string[] {
  const vistos = new Set(antigos);
  const resultado = [...antigos];
  for (const id of novos) {
    if (!vistos.has(id)) {
      vistos.add(id);
      resultado.push(id);
    }
  }
  return resultado;
}
