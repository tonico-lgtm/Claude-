/**
 * Serialização Markdown da transcrição bruta e nome do arquivo de cada sessão.
 *
 * Puro: sem I/O, sem relógio. Cada função devolve exatamente o texto que o
 * controlador deve anexar ao arquivo (append). O arquivo é montado por
 * concatenação: cabeçalho, trechos de linha, marcador de retomada, rodapé.
 * Por isso cada trecho termina em linha em branco, salvo o rodapé, que
 * fecha o arquivo.
 *
 * Sem resumo, sem análise, sem nada além do que foi dito.
 */

import {
  FECHAMENTO,
  PERGUNTAS_NUMERADAS,
  SESSOES,
  blocoDaPergunta,
  sessaoPorNumero,
} from '../roteiro/roteiro';
import type { Bloco, Pergunta } from '../roteiro/roteiro';
import { VOZES, dataLocalIso, formatarCarimbo, formatarDuracao } from '../shared/tipos';
import type { LinhaTranscricao, Modo, NumeroSessao, VozId } from '../shared/tipos';

/** `sessao-1-quem-e-2026-09-06.md` — data local, slug do roteiro. */
export function nomeDoArquivoDaSessao(numero: NumeroSessao, data: Date): string {
  const sessao = sessaoPorNumero(numero);
  return `sessao-${numero}-${sessao.slug}-${dataLocalIso(data)}.md`;
}

/** Abertura do arquivo. Termina em `---` e linha em branco. */
export function cabecalhoDaSessao(p: {
  sessao: NumeroSessao;
  modo: Modo;
  voz: VozId;
  inicio: string;
  arquivo: string;
}): string {
  const sessao = sessaoPorNumero(p.sessao);
  const blocos = sessao.blocos.map((b) => `${b.numero} ${b.nome}`).join(' · ');
  return [
    `# Entrevista Twin — Sessão ${sessao.numero} de ${SESSOES.length}: ${sessao.nome}`,
    '',
    '- Roteiro: v1',
    `- Início: ${p.inicio}`,
    `- Modo inicial: ${p.modo} (${nomeDaVoz(p.voz)})`,
    `- Arquivo: ${p.arquivo}`,
    `- Blocos: ${blocos}`,
    '',
    '---',
    '',
    '',
  ].join('\n');
}

/**
 * Anexado ao mesmo arquivo quando uma sessão incompleta recomeça. Começa com
 * quebra para se separar do que veio antes (um rodapé de sessão incompleta
 * termina em quebra simples) e termina em linha em branco para não grudar
 * no `##` do bloco que vem a seguir.
 */
export function marcadorDeRetomada(instante: string, blocoNome: string): string {
  return `\n> Sessão retomada em ${instante} a partir do bloco «${blocoNome}».\n\n`;
}

/**
 * O que anexar ao arquivo por causa de `linha`. Emite `## Bloco N · Nome` na
 * primeira aparição do bloco e `### Pergunta N — texto` (ou `### Fechamento —
 * texto`) na primeira aparição da pergunta, considerando `linhasAnteriores`.
 * A despedida nunca abre cabeçalho. Depois vem a fala, seguida de linha em branco.
 */
export function trechoDaLinha(
  linhasAnteriores: readonly LinhaTranscricao[],
  linha: LinhaTranscricao,
): string {
  const partes: string[] = [];

  if (linha.origem !== 'despedida') {
    const bloco = blocoDaLinha(linha);
    if (bloco && !linhasAnteriores.some((l) => idDoBloco(l) === bloco.id)) {
      partes.push(`## Bloco ${bloco.numero} · ${bloco.nome}\n\n`);
    }
    const pergunta = linha.perguntaId === null ? null : perguntaPorId(linha.perguntaId);
    if (pergunta && !linhasAnteriores.some((l) => l.perguntaId === pergunta.id)) {
      const titulo = pergunta.numero === null ? 'Fechamento' : `Pergunta ${pergunta.numero}`;
      partes.push(`### ${titulo} — ${pergunta.texto}\n\n`);
    }
  }

  partes.push(`**[${formatarCarimbo(linha.segundos)}] ${rotuloDaFala(linha)}:** ${umParagrafo(linha.texto)}\n\n`);
  return partes.join('');
}

/** Fecho do arquivo (ou de uma execução, quando incompleta). Termina em quebra simples. */
export function rodapeDaSessao(p: {
  concluida: boolean;
  instante: string;
  segundos: number;
  perguntasRespondidas: number;
  totalPerguntas: number;
  blocoDeRetomadaNome?: string;
}): string {
  const situacao = p.concluida
    ? 'concluída'
    : p.blocoDeRetomadaNome
      ? `incompleta (recomeça do bloco «${p.blocoDeRetomadaNome}»)`
      : 'incompleta';
  return [
    '---',
    '',
    `- Encerrada em ${p.instante}`,
    `- Duração: ${formatarDuracao(p.segundos)}`,
    `- Perguntas respondidas: ${p.perguntasRespondidas} de ${p.totalPerguntas}`,
    `- Situação: ${situacao}`,
    '',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Apoio
// ---------------------------------------------------------------------------

function nomeDaVoz(voz: VozId): string {
  return VOZES.find((v) => v.id === voz)?.nome ?? voz;
}

/** `Entrevistadora` / `Entrevistadora (aprofundamento)` / `Cliente (voz)` / `Cliente (escrita)`. */
function rotuloDaFala(linha: LinhaTranscricao): string {
  if (linha.quem === 'cliente') return `Cliente (${linha.origem === 'escrita' ? 'escrita' : 'voz'})`;
  return linha.origem === 'aprofundamento' ? 'Entrevistadora (aprofundamento)' : 'Entrevistadora';
}

/** A transcrição bruta é uma fala por parágrafo: quebras internas viram um espaço. */
function umParagrafo(texto: string): string {
  return texto.replace(/[ \t]*(?:\r\n|\r|\n)+[ \t]*/g, ' ').trim();
}

/** O bloco da linha: pelo `blocoId` quando há, senão pela pergunta. */
function idDoBloco(linha: LinhaTranscricao): string | null {
  if (linha.blocoId !== null) return linha.blocoId;
  return linha.perguntaId === null ? null : blocoDaPergunta(linha.perguntaId).id;
}

function blocoDaLinha(linha: LinhaTranscricao): Bloco | null {
  const id = idDoBloco(linha);
  if (id === null) return null;
  return SESSOES.flatMap((s) => s.blocos).find((b) => b.id === id) ?? null;
}

function perguntaPorId(id: string): Pergunta | null {
  if (id === FECHAMENTO.id) return FECHAMENTO;
  return PERGUNTAS_NUMERADAS.find((p) => p.id === id) ?? null;
}
