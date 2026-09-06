/**
 * Roteiro v1 — fixo e embutido. O app não deixa montar nem escolher roteiro.
 *
 * 8 blocos, 26 perguntas + fechamento, divididos em 3 sessões de ~25 min.
 * O fechamento fica fora da contagem: é a pergunta 27 no arquivo, mas a
 * interface nunca o numera junto com as outras.
 */

export type TipoPergunta = 'aberta' | 'multipla';

export interface Pergunta {
  /** Estável e legível — vai para o arquivo de transcrição. */
  readonly id: string;
  /** Número dentro da contagem de 26. `null` no fechamento. */
  readonly numero: number | null;
  readonly texto: string;
  /** Instrução de condução mostrada no card "Claude" e enviada ao modelo. */
  readonly regra: string;
  readonly tipo: TipoPergunta;
  readonly opcoes?: readonly string[];
  /**
   * A regra de condução permite UMA pergunta de aprofundamento por resposta.
   * Algumas perguntas a proíbem de saída ("Não aprofundar" na regra).
   */
  readonly permiteAprofundamento: boolean;
}

export interface Bloco {
  readonly id: string;
  readonly numero: number;
  readonly nome: string;
  readonly perguntas: readonly Pergunta[];
}

export interface Sessao {
  readonly numero: 1 | 2 | 3;
  readonly nome: string;
  readonly blocos: readonly Bloco[];
  /** Slug usado no nome do arquivo: `sessao-1-quem-e-2026-09-06.md`. */
  readonly slug: string;
}

const aberta = (
  id: string,
  numero: number | null,
  texto: string,
  regra: string,
  permiteAprofundamento = true,
): Pergunta => ({ id, numero, texto, regra, tipo: 'aberta', permiteAprofundamento });

const multipla = (
  id: string,
  numero: number,
  texto: string,
  opcoes: readonly string[],
  regra: string,
): Pergunta => ({
  id,
  numero,
  texto,
  regra,
  tipo: 'multipla',
  opcoes,
  permiteAprofundamento: true,
});

const b1: Bloco = {
  id: 'quem-e',
  numero: 1,
  nome: 'Quem é',
  perguntas: [
    aberta(
      'q01',
      1,
      'Como você se apresenta quando alguém pergunta o que você faz?',
      'Ler como está. Se a resposta vier em uma frase, pedir um exemplo de situação em que essa apresentação foi usada.',
    ),
    aberta(
      'q02',
      2,
      'O que as pessoas costumam errar sobre você numa primeira impressão?',
      'Não comentar. Aprofundar apenas se não houver exemplo concreto.',
    ),
    aberta(
      'q03',
      3,
      'Que três palavras alguém que trabalha com você há dez anos usaria para descrevê-lo?',
      'Registrar as três palavras literalmente. Aprofundar pedindo a história por trás de uma delas.',
    ),
  ],
};

const b2: Bloco = {
  id: 'trajetoria',
  numero: 2,
  nome: 'Trajetória',
  perguntas: [
    aberta(
      'q04',
      4,
      'Qual foi a decisão que mais mudou o rumo da sua carreira?',
      'Pedir o ano e o contexto, se não vierem.',
    ),
    aberta(
      'q05',
      5,
      'Que trabalho você fez de que mais se orgulha — e por quê?',
      'Se o porquê for abstrato, pedir o que exatamente aconteceu.',
    ),
    aberta(
      'q06',
      6,
      'Houve um fracasso que ensinou mais do que qualquer acerto?',
      'Aceitar silêncio. Não pressionar além de uma tentativa.',
    ),
  ],
};

const b3: Bloco = {
  id: 'voz-e-escrita',
  numero: 3,
  nome: 'Voz e escrita',
  perguntas: [
    aberta(
      'q07',
      7,
      'Quando escreve para um cliente, como você começa um texto?',
      'Pedir a primeira frase de um texto real, de memória.',
    ),
    multipla(
      'q08',
      8,
      'Qual destas frases soa mais como você?',
      [
        'Segue a análise solicitada, conforme conversamos.',
        'Conforme alinhado, encaminho abaixo os pontos principais.',
        'Vamos direto ao ponto: há três questões a resolver.',
        'Prezado, cumpre-nos informar o que segue.',
      ],
      'Ler as quatro opções pausadamente. Registrar a letra escolhida e, se houver, o comentário.',
    ),
    aberta(
      'q09',
      9,
      'Que palavras ou expressões você nunca usaria por escrito?',
      'Registrar literalmente. Não sugerir exemplos.',
    ),
    aberta(
      'q10',
      10,
      'Como você quer que um texto seu termine — com pedido, com resumo ou com silêncio?',
      'Pedir um exemplo de fechamento recente.',
    ),
  ],
};

const b4: Bloco = {
  id: 'dominio',
  numero: 4,
  nome: 'Domínio',
  perguntas: [
    aberta(
      'q11',
      11,
      'Em que assunto as pessoas te procuram sabendo que você é a referência?',
      'Pedir um caso concreto em que isso aconteceu.',
    ),
    multipla(
      'q12',
      12,
      'Quando um tema sai da sua especialidade, o que você faz?',
      [
        'Estudo e respondo.',
        'Encaminho a quem sabe.',
        'Respondo com ressalva explícita.',
        'Depende do cliente.',
      ],
      'Ler as quatro opções. Registrar a letra e o complemento, se houver.',
    ),
    aberta(
      'q13',
      13,
      'Qual é a pergunta que você mais responde no trabalho — e qual é a resposta?',
      'Registrar a resposta na íntegra; é material de voz.',
    ),
  ],
};

const b5: Bloco = {
  id: 'valores-e-limites',
  numero: 5,
  nome: 'Valores e limites',
  perguntas: [
    aberta(
      'q14',
      14,
      'O que você recusa fazer, mesmo quando pagam bem?',
      'Não opinar. Pedir uma situação em que isso foi testado.',
    ),
    aberta(
      'q15',
      15,
      'Qual é a linha que você não cruza numa negociação?',
      'Pedir exemplo concreto, sem nomes.',
    ),
    aberta(
      'q16',
      16,
      'O que te faz perder a paciência no trabalho?',
      'Aceitar respostas curtas. Uma tentativa de aprofundamento, no máximo.',
    ),
  ],
};

const b6: Bloco = {
  id: 'pessoas-e-tom',
  numero: 6,
  nome: 'Pessoas e tom',
  perguntas: [
    aberta(
      'q17',
      17,
      'Como você dá uma notícia ruim a um cliente?',
      'Pedir a última vez que precisou fazer isso e como começou a conversa.',
    ),
    aberta(
      'q18',
      18,
      'Com quem você é mais formal — e com quem se permite ser direto?',
      'Registrar os dois polos. Não aprofundar.',
      false,
    ),
    aberta(
      'q19',
      19,
      'O que você espera de alguém que trabalha para você?',
      'Pedir um exemplo de quando essa expectativa não foi atendida.',
    ),
  ],
};

const b7: Bloco = {
  id: 'rotina-e-ferramentas',
  numero: 7,
  nome: 'Rotina e ferramentas',
  perguntas: [
    aberta(
      'q20',
      20,
      'Como começa o seu dia de trabalho?',
      'Pedir horário e a primeira coisa que abre.',
    ),
    multipla(
      'q21',
      21,
      'Onde você escreve a maior parte do que produz?',
      ['Word', 'E-mail', 'WhatsApp e mensagens', 'Papel, e depois digito'],
      'Ler as opções. Registrar a letra e o complemento, se houver.',
    ),
    aberta(
      'q22',
      22,
      'Que ferramenta você abandonaria hoje se pudesse?',
      'Aceitar a resposta como vier. Não aprofundar.',
      false,
    ),
  ],
};

const b8: Bloco = {
  id: 'fora-do-escritorio',
  numero: 8,
  nome: 'Fora do escritório',
  perguntas: [
    aberta('q23', 23, 'O que você lê que não tem nada a ver com trabalho?', 'Pedir o último título.'),
    aberta(
      'q24',
      24,
      'Há um lugar onde você pensa melhor?',
      'Pedir uma descrição breve do lugar.',
    ),
    aberta(
      'q25',
      25,
      'O que a sua família diria que você faz demais?',
      'Não comentar. Registrar literalmente.',
    ),
    aberta(
      'q26',
      26,
      'Que assunto você poderia falar por uma hora sem preparo?',
      'Pedir os dois ou três pontos que abririam essa hora.',
    ),
  ],
};

/** Fora da contagem, só na sessão 3, no fim do bloco 8. */
export const FECHAMENTO: Pergunta = aberta(
  'fechamento',
  null,
  'Se um assistente fosse escrever no seu lugar amanhã, o que ele precisaria saber que ninguém pensaria em perguntar?',
  'Ler exatamente como está. Não aprofundar. Agradecer e encerrar.',
  false,
);

export const SESSOES: readonly Sessao[] = [
  { numero: 1, nome: 'Quem é', slug: 'quem-e', blocos: [b1, b2, b3] },
  { numero: 2, nome: 'Como trabalha', slug: 'como-trabalha', blocos: [b4, b5, b6] },
  { numero: 3, nome: 'Como vive', slug: 'como-vive', blocos: [b7, b8] },
];

export const BLOCOS: readonly Bloco[] = SESSOES.flatMap((s) => s.blocos);

/** As 26 perguntas numeradas, na ordem. O fechamento não entra. */
export const PERGUNTAS_NUMERADAS: readonly Pergunta[] = BLOCOS.flatMap((b) => b.perguntas);

export const TOTAL_PERGUNTAS = PERGUNTAS_NUMERADAS.length; // 26

/**
 * A fila de uma sessão: todas as perguntas dos seus blocos, na ordem, com o
 * fechamento emendado no fim da sessão 3.
 */
export function perguntasDaSessao(numero: 1 | 2 | 3): readonly Pergunta[] {
  const sessao = sessaoPorNumero(numero);
  const base = sessao.blocos.flatMap((b) => b.perguntas);
  return numero === 3 ? [...base, FECHAMENTO] : base;
}

export function sessaoPorNumero(numero: 1 | 2 | 3): Sessao {
  const s = SESSOES.find((x) => x.numero === numero);
  if (!s) throw new Error(`Sessão ${numero} não existe no roteiro v1.`);
  return s;
}

export function blocoDaPergunta(perguntaId: string): Bloco {
  if (perguntaId === FECHAMENTO.id) return b8;
  const bloco = BLOCOS.find((b) => b.perguntas.some((p) => p.id === perguntaId));
  if (!bloco) throw new Error(`Pergunta ${perguntaId} não pertence a nenhum bloco.`);
  return bloco;
}

export function sessaoDoBloco(blocoId: string): Sessao {
  const s = SESSOES.find((x) => x.blocos.some((b) => b.id === blocoId));
  if (!s) throw new Error(`Bloco ${blocoId} não pertence a nenhuma sessão.`);
  return s;
}

/** "3 perguntas · abertas" / "4 perguntas · 1 múltipla escolha" */
export function resumoDoBloco(bloco: Bloco): string {
  const n = bloco.perguntas.length;
  const mc = bloco.perguntas.filter((p) => p.tipo === 'multipla').length;
  return `${n} perguntas · ${mc === 0 ? 'abertas' : `${mc} múltipla escolha`}`;
}

/** "10 perguntas" / "7 perguntas + fechamento" */
export function resumoDaSessao(sessao: Sessao): string {
  const n = sessao.blocos.reduce((acc, b) => acc + b.perguntas.length, 0);
  return sessao.numero === 3 ? `${n} perguntas + fechamento` : `${n} perguntas`;
}

export const REGRA_DE_CONDUCAO =
  'A voz lê a pergunta exatamente como está escrita. Uma única pergunta de aprofundamento por resposta, sempre pedindo exemplo concreto. Sem opinar, sem resumir, sem pular bloco.';
