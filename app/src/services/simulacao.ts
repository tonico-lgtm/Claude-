/**
 * Simulação — respostas fictícias e condução/voz simuladas, para o app ser
 * demonstrável sem chave e para o `npm run dev` no navegador.
 *
 * Puro: sem rede, sem Node, sem DOM, sem relógio. As 27 respostas vêm do
 * protótipo (`project/Entrevista Twin.dc.html`): uma cliente fictícia,
 * advogada de empresas de família. Conteúdo claramente inventado, de
 * propósito — nada aqui é de cliente real.
 */

import { FECHAMENTO, PERGUNTAS_NUMERADAS } from '../roteiro/roteiro';
import type { AudioFalado, DecisaoConducao, EntradaConducao, Transcrito, VozId } from '../shared/tipos';
import type { Condutor } from './claude';

export interface RespostaFicticia {
  readonly resposta: string;
  /** Pergunta de aprofundamento que a simulação faria; ausente quando a regra proíbe. */
  readonly aprofundamento?: string;
  readonly respostaAoAprofundamento?: string;
  /** Índice (0-based) da opção escolhida nas perguntas de múltipla escolha. */
  readonly escolha?: number;
}

/** Mesma frase de reserva do condutor real; duplicada para manter este módulo puro. */
const PERGUNTA_GENERICA = 'Pode me dar um exemplo concreto disso?';

/** Abaixo disso a resposta conta como curta e a simulação pede exemplo. */
const LIMITE_RESPOSTA_CURTA = 120;

/** Fala simulada: ~60 ms por palavra, entre 0,4 s e 6 s. */
const SEGUNDOS_POR_PALAVRA = 0.06;
const FALA_MINIMA_S = 0.4;
const FALA_MAXIMA_S = 6;

/** Transcrição simulada: ritmo aproximado de fala, só para preencher `duracao`. */
const SEGUNDOS_POR_PALAVRA_OUVIDA = 0.4;

const TAXA_AMOSTRAGEM = 16_000;

/** Quando a pergunta lida não tem resposta fictícia (não deveria acontecer com o roteiro v1). */
const RESPOSTA_DE_RESERVA = 'Não tenho o que acrescentar a essa.';

// ---------------------------------------------------------------------------
// As 27 respostas do protótipo, na ordem de PERGUNTAS_NUMERADAS + FECHAMENTO
// ---------------------------------------------------------------------------

export const RESPOSTAS_FICTICIAS: Readonly<Record<string, RespostaFicticia>> = {
  q01: {
    resposta:
      'Digo que sou advogada de empresas de família. Se insistem, explico que passo o dia evitando que sócios que são parentes virem ex-parentes.',
    aprofundamento: 'Pode me dar um exemplo de uma situação em que usou essa apresentação?',
    respostaAoAprofundamento: 'Num jantar, mês passado. A pessoa riu e no dia seguinte mandou o contato do irmão.',
  },
  q02: {
    resposta: 'Acham que sou dura. Sou só objetiva — a dureza aparece depois, quando precisa.',
    aprofundamento: 'Lembra de um caso concreto em que isso aconteceu?',
    respostaAoAprofundamento:
      'Um cliente novo pediu para falar com “alguém mais acessível”. Três meses depois, só queria falar comigo.',
  },
  q03: {
    resposta: 'Precisa, impaciente e leal. Nessa ordem, provavelmente.',
    aprofundamento: 'Qual é a história por trás de uma dessas palavras?',
    respostaAoAprofundamento:
      'Leal: fiquei no escritório antigo dois anos além do que devia porque o sócio estava doente.',
  },
  q04: {
    resposta:
      'Sair da banca grande em 2014 para abrir o escritório com duas pessoas. Perdi salário e ganhei a agenda.',
    aprofundamento: 'Qual era o contexto naquele momento?',
    respostaAoAprofundamento: 'Tinha acabado de perder uma promoção para alguém que faturava mais e sabia menos.',
  },
  q05: {
    resposta:
      'Um acordo de sócios que evitou a venda de uma fábrica de oitenta anos. Porque ninguém saiu perdendo e ninguém saiu ganhando.',
    aprofundamento: 'O que exatamente aconteceu para chegar a esse resultado?',
    respostaAoAprofundamento: 'Onze reuniões. Na sétima, tirei os advogados da sala e deixei os irmãos conversarem.',
  },
  q06: {
    resposta:
      'Perdi um cliente por mandar um parecer correto na hora errada. Aprendi que timing é parte do conteúdo.',
    aprofundamento: 'Pode contar como foi esse momento?',
    respostaAoAprofundamento: 'Mandei numa sexta à noite, véspera do casamento da filha dele. Ele leu no sábado.',
  },
  q07: {
    resposta: 'Com a conclusão. A primeira frase diz o que ele precisa fazer; o resto explica por quê.',
    aprofundamento: 'Lembra da primeira frase de um texto real que escreveu recentemente?',
    respostaAoAprofundamento: '“Não assine antes de quinta.” Foi isso. O e-mail tinha quatro parágrafos depois.',
  },
  q08: {
    resposta: 'A terceira. As outras parecem escritas por outra pessoa.',
    aprofundamento: 'Há algo nas outras opções que você evitaria de propósito?',
    respostaAoAprofundamento: '“Cumpre-nos.” Nunca escrevi isso na vida.',
    escolha: 2,
  },
  q09: {
    resposta: '“Outrossim”, “destarte”, “no aguardo”. E ponto de exclamação.',
    aprofundamento: 'Pode dar um exemplo de quando alguém usou e você reescreveu?',
    respostaAoAprofundamento:
      'Um associado escreveu “no aguardo de um breve retorno”. Troquei por “me responda até terça”.',
  },
  q10: {
    resposta: 'Com pedido. Um texto sem próximo passo é um texto que não terminou.',
    aprofundamento: 'Qual foi o fechamento do último texto que enviou?',
    respostaAoAprofundamento: '“Me diga até sexta se seguimos.” Cinco palavras.',
  },
  q11: {
    resposta: 'Conflito entre sócios em empresa familiar. Quando o problema é jurídico e afetivo ao mesmo tempo.',
    aprofundamento: 'Pode contar um caso em que isso aconteceu?',
    respostaAoAprofundamento:
      'Três irmãos, uma rede de farmácias. Vieram por indicação de um contador que eu nunca conheci.',
  },
  q12: {
    resposta: 'Encaminho. Tenho três nomes para tributário e dois para trabalhista, e digo isso ao cliente.',
    aprofundamento: 'Como você comunica isso ao cliente?',
    respostaAoAprofundamento:
      '“Isso não é comigo, é com a Fernanda. Vou te apresentar hoje.” Nunca perdi cliente por isso.',
    escolha: 1,
  },
  q13: {
    resposta:
      '“Posso tirar meu irmão da sociedade?” Pode, mas vai custar mais do que imagina — em dinheiro e em Natal.',
    aprofundamento: 'Pode dar um exemplo de como essa conversa costuma se desenrolar?',
    respostaAoAprofundamento:
      'Eles perguntam quanto. Eu pergunto quantos anos de família querem preservar. Aí a conversa muda.',
  },
  q14: {
    resposta: 'Blindagem patrimonial para quem está prestes a dar calote. Já recusei duas vezes este ano.',
    aprofundamento: 'Pode contar uma situação em que isso foi testado?',
    respostaAoAprofundamento:
      'Um empresário ofereceu o triplo da minha hora. Disse não em dez minutos e ele foi ao concorrente.',
  },
  q15: {
    resposta: 'Não blefo com fato. Posso não revelar, mas nunca afirmo o que não é.',
    aprofundamento: 'Lembra de um exemplo concreto, sem nomes?',
    respostaAoAprofundamento:
      'A outra parte perguntou se meu cliente tinha outra proposta. Não tinha. Eu disse: “Não vou responder isso.”',
  },
  q16: {
    resposta: 'Gente que responde e-mail sem ler o e-mail.',
    aprofundamento: 'Pode dar um exemplo recente?',
    respostaAoAprofundamento: 'Ontem. Mandei três perguntas numeradas e recebi “ok” de volta.',
  },
  q17: {
    resposta: 'Por telefone, no mesmo dia, começando pela notícia. Nunca por e-mail e nunca com preâmbulo.',
    aprofundamento: 'Como começou a última conversa desse tipo?',
    respostaAoAprofundamento: '“Perdemos o prazo. A culpa é minha. Aqui está o que fazemos agora.”',
  },
  q18: {
    resposta: 'Formal com juiz e com cliente novo. Direta com sócio, com associado e com cliente de mais de um ano.',
  },
  q19: {
    resposta: 'Que me avise antes de eu descobrir. Erro eu perdoo; surpresa, não.',
    aprofundamento: 'Pode dar um exemplo de quando essa expectativa não foi atendida?',
    respostaAoAprofundamento: 'Um associado escondeu um prazo perdido por dois dias. Saiu no mês seguinte.',
  },
  q20: {
    resposta: 'Às 6h40, com café e a lista de prazos do dia. E-mail só depois das nove.',
    aprofundamento: 'Qual é a primeira coisa que você abre?',
    respostaAoAprofundamento: 'A planilha de prazos. É a mesma desde 2014, com uma aba por ano.',
  },
  q21: {
    resposta: 'E-mail. Parecer longo é raro; o trabalho de verdade são vinte e-mails curtos por dia.',
    aprofundamento: 'Há algo que você escreve sempre em outro lugar?',
    respostaAoAprofundamento: 'Cláusula de acordo, só no Word. Anotação de reunião, só à mão.',
    escolha: 1,
  },
  q22: {
    resposta: 'WhatsApp com cliente. Mas não dá.',
  },
  q23: {
    resposta: 'Biografia de gente que fracassou. E receita, que eu nunca faço.',
    aprofundamento: 'Qual foi o último título?',
    respostaAoAprofundamento: 'Uma biografia do Getúlio. A parte de 1954, principalmente.',
  },
  q24: {
    resposta: 'Dirigindo. Estrada, sem rádio.',
    aprofundamento: 'Pode descrever brevemente esse lugar?',
    respostaAoAprofundamento:
      'A Castelo Branco às sete da manhã de domingo. Quarenta minutos, e volto com o problema resolvido.',
  },
  q25: {
    resposta: 'Corrigir a redação dos outros. Inclusive em mensagem de aniversário.',
    aprofundamento: 'Pode dar um exemplo?',
    respostaAoAprofundamento: 'Minha filha me mandou “parabéns pra você” e eu respondi com a vírgula.',
  },
  q26: {
    resposta: 'Sucessão em empresa familiar. E vinho do Douro, mas isso é outra entrevista.',
    aprofundamento: 'Quais seriam os dois ou três pontos que abririam essa hora?',
    respostaAoAprofundamento:
      'Primeiro: herdeiro não é sócio. Segundo: acordo bom se faz com todo mundo vivo. Terceiro: quem manda paga.',
  },
  fechamento: {
    resposta:
      'Que eu nunca escrevo “espero que esteja bem”. E que, se o texto tem mais de cinco parágrafos, eu já desconfio de mim mesma.',
  },
};

/** Ids na ordem do roteiro — as 26 numeradas e o fechamento. */
export const IDS_COM_RESPOSTA_FICTICIA: readonly string[] = [
  ...PERGUNTAS_NUMERADAS.map((p) => p.id),
  FECHAMENTO.id,
];

/** Para o botão "Preencher com exemplo" do modo escrita. `null` se não há texto para esse caso. */
export function respostaFicticia(perguntaId: string, aoAprofundamento: boolean): string | null {
  const entrada = RESPOSTAS_FICTICIAS[perguntaId];
  if (!entrada) return null;
  return aoAprofundamento ? (entrada.respostaAoAprofundamento ?? null) : entrada.resposta;
}

// ---------------------------------------------------------------------------
// Condução simulada
// ---------------------------------------------------------------------------

const decisao = (
  aprofundar: boolean,
  pergunta: string | null,
  motivo: string,
  origem: DecisaoConducao['origem'],
): DecisaoConducao => ({ aprofundar, pergunta, motivo, origem });

/**
 * Aprofunda quando há pergunta de aprofundamento no protótipo e a resposta
 * é curta (menos de 120 caracteres), ou quando o condutor forçou.
 */
export function condutorSimulado(): Condutor {
  return {
    async decidir(entrada: EntradaConducao): Promise<DecisaoConducao> {
      if (!entrada.pergunta.permiteAprofundamento) {
        return decisao(false, null, 'A regra desta pergunta não permite aprofundamento.', 'regra');
      }
      const aprofundamento = RESPOSTAS_FICTICIAS[entrada.pergunta.id]?.aprofundamento;
      if (entrada.forcar) {
        return decisao(
          true,
          aprofundamento ?? PERGUNTA_GENERICA,
          'Aprofundamento pedido por quem conduz a sessão.',
          'simulacao',
        );
      }
      if (!aprofundamento) {
        return decisao(false, null, 'A regra desta pergunta não pede aprofundamento.', 'simulacao');
      }
      if (entrada.resposta.trim().length < LIMITE_RESPOSTA_CURTA) {
        return decisao(true, aprofundamento, 'Resposta curta, sem exemplo concreto; cabe pedir um.', 'simulacao');
      }
      return decisao(false, null, 'Resposta já traz exemplo concreto; segue para a próxima.', 'simulacao');
    },
  };
}

// ---------------------------------------------------------------------------
// Voz simulada
// ---------------------------------------------------------------------------

export interface ContextoVozSimulada {
  /** Id da última pergunta lida, ou `null` antes da primeira. */
  perguntaAtual(): string | null;
  /** `true` enquanto a pergunta de aprofundamento espera resposta. */
  aprofundamentoAberto(): boolean;
}

export interface VozSimulada {
  falar(texto: string, voz: VozId): Promise<AudioFalado>;
  transcrever(audio: ArrayBuffer, mime: string): Promise<Transcrito>;
}

const contarPalavras = (texto: string): number => texto.trim().split(/\s+/).filter((p) => p !== '').length;

const limitar = (valor: number, minimo: number, maximo: number): number =>
  Math.min(maximo, Math.max(minimo, valor));

/** Duração da fala simulada para um texto: clamp(palavras × 0,06 s, 0,4 s, 6 s). */
export function segundosDeFalaSimulada(texto: string): number {
  return limitar(contarPalavras(texto) * SEGUNDOS_POR_PALAVRA, FALA_MINIMA_S, FALA_MAXIMA_S);
}

/**
 * WAV PCM mudo: cabeçalho RIFF válido, 16 kHz, mono, 16 bits. Reusado pela
 * plataforma de navegador para "tocar" enquanto o `speechSynthesis` fala.
 */
export function gerarWavMudo(segundos: number): ArrayBuffer {
  const canais = 1;
  const bitsPorAmostra = 16;
  const bytesPorBloco = (canais * bitsPorAmostra) / 8;
  const amostras = Math.max(0, Math.round(segundos * TAXA_AMOSTRAGEM));
  const bytesDeDados = amostras * bytesPorBloco;

  const buffer = new ArrayBuffer(44 + bytesDeDados);
  const vista = new DataView(buffer);
  const ascii = (posicao: number, texto: string): void => {
    for (let i = 0; i < texto.length; i++) vista.setUint8(posicao + i, texto.charCodeAt(i));
  };

  ascii(0, 'RIFF');
  vista.setUint32(4, 36 + bytesDeDados, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  vista.setUint32(16, 16, true); // tamanho do trecho fmt (PCM)
  vista.setUint16(20, 1, true); // formato PCM
  vista.setUint16(22, canais, true);
  vista.setUint32(24, TAXA_AMOSTRAGEM, true);
  vista.setUint32(28, TAXA_AMOSTRAGEM * bytesPorBloco, true);
  vista.setUint16(32, bytesPorBloco, true);
  vista.setUint16(34, bitsPorAmostra, true);
  ascii(36, 'data');
  vista.setUint32(40, bytesDeDados, true);
  // O restante já é zero: silêncio.
  return buffer;
}

export function vozSimulada(contexto: ContextoVozSimulada): VozSimulada {
  return {
    async falar(texto: string, _voz: VozId): Promise<AudioFalado> {
      return { audio: gerarWavMudo(segundosDeFalaSimulada(texto)), mime: 'audio/wav' };
    },

    // Ignora o áudio: devolve a resposta fictícia da última pergunta lida.
    async transcrever(_audio: ArrayBuffer, _mime: string): Promise<Transcrito> {
      const perguntaId = contexto.perguntaAtual();
      const texto =
        (perguntaId === null ? null : respostaFicticia(perguntaId, contexto.aprofundamentoAberto())) ??
        RESPOSTA_DE_RESERVA;
      return { texto, duracao: contarPalavras(texto) * SEGUNDOS_POR_PALAVRA_OUVIDA };
    },
  };
}
