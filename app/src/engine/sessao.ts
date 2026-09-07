/**
 * Motor da sessão — máquina de estados pura.
 *
 * `reduzir(estado, acao)` devolve o novo estado e a lista de efeitos que o
 * controlador (`hooks/useSessao.ts`) executa: falar, ouvir, decidir, anexar
 * ao arquivo… O resultado de cada efeito volta como nova ação. Nada aqui
 * toca em I/O, `Promise` ou relógio: instantes e segundos chegam nas ações.
 */

import type { Bloco, Pergunta } from '../roteiro/roteiro';
import {
  FECHAMENTO,
  TOTAL_PERGUNTAS,
  blocoDaPergunta,
  perguntasDaSessao,
  sessaoPorNumero,
} from '../roteiro/roteiro';
import type {
  DecisaoConducao,
  EntradaConducao,
  ErroApp,
  LinhaTranscricao,
  Modo,
  NumeroSessao,
  VozId,
} from '../shared/tipos';
import { entradaDeConducao } from '../shared/tipos';

// ---------------------------------------------------------------------------
// Estado, ações, efeitos
// ---------------------------------------------------------------------------

export type Fase = 'ociosa' | 'falando' | 'ouvindo' | 'transcrevendo' | 'decidindo' | 'pausada';

export interface EstadoSessao {
  readonly sessao: NumeroSessao;
  readonly modo: Modo;
  readonly voz: VozId;
  /** `perguntasDaSessao(sessao)`, possivelmente cortada na retomada. */
  readonly fila: readonly Pergunta[];
  /** Posição na fila. */
  readonly indice: number;
  /** Ids de perguntas já lidas. */
  readonly visitadas: readonly string[];
  /** Ids com resposta registrada. */
  readonly respondidas: readonly string[];
  /** Ids em que o (único) aprofundamento foi usado. */
  readonly aprofundadas: readonly string[];
  readonly aprofundamentoAberto: { readonly perguntaId: string; readonly texto: string } | null;
  /** Para o card "Claude". */
  readonly ultimaDecisao: DecisaoConducao | null;
  readonly fase: Fase;
  readonly pausada: boolean;
  readonly encerrada: boolean;
  readonly linhas: readonly LinhaTranscricao[];
  /** Decorridos nesta execução. */
  readonly segundos: number;
  /** Último erro exibível; some no próximo avanço. */
  readonly erro: ErroApp | null;
  /** Para gerar ids l0001… */
  readonly contadorLinhas: number;
}

export type Acao =
  | { tipo: 'perguntar'; indice: number; instante: string }
  | { tipo: 'leituraConcluida' }
  | { tipo: 'capturaConcluida' }
  | { tipo: 'respostaRegistrada'; texto: string; origem: 'voz' | 'escrita'; instante: string }
  | { tipo: 'decisaoConducao'; decisao: DecisaoConducao; instante: string }
  | { tipo: 'aprofundar'; instante: string }
  | { tipo: 'pausar' }
  | { tipo: 'retomar'; instante: string }
  | { tipo: 'anterior'; instante: string }
  | { tipo: 'proxima'; instante: string }
  | { tipo: 'irParaBloco'; blocoId: string; instante: string }
  | { tipo: 'alternarModo'; modo: Modo }
  | { tipo: 'tique' }
  | { tipo: 'encerrar'; instante: string }
  | { tipo: 'erro'; erro: ErroApp }
  | { tipo: 'limparErro' };

export type Efeito =
  | { tipo: 'falar'; texto: string }
  | { tipo: 'ouvir' }
  | { tipo: 'pararAudio' }
  | { tipo: 'decidir'; entrada: EntradaConducao }
  | { tipo: 'anexarLinha'; linha: LinhaTranscricao }
  | { tipo: 'gravarProgresso' }
  | { tipo: 'finalizar'; concluida: boolean };

export interface Transicao {
  readonly estado: EstadoSessao;
  readonly efeitos: readonly Efeito[];
}

const DESPEDIDA_SESSAO = 'Obrigada. Esta sessão está encerrada.';
const DESPEDIDA_ENTREVISTA = 'Obrigada. A entrevista está encerrada.';
const MENSAGEM_RESPOSTA_VAZIA = 'A resposta veio vazia.';
const MOTIVO_REGRA = 'A regra desta pergunta não permite aprofundamento.';

/** Fases em que há TTS, microfone ou pedido em curso que a navegação interrompe. */
const FASES_INTERROMPIVEIS: readonly Fase[] = ['falando', 'ouvindo', 'transcrevendo', 'decidindo'];

// ---------------------------------------------------------------------------
// Criação
// ---------------------------------------------------------------------------

export function criarSessao(p: {
  sessao: NumeroSessao;
  modo: Modo;
  voz: VozId;
  retomarDoBlocoId?: string;
}): EstadoSessao {
  const completa = perguntasDaSessao(p.sessao);
  // Retomada: a fila começa na primeira pergunta do bloco indicado. Bloco
  // desconhecido (ou de outra sessão) cai na fila inteira, sem quebrar.
  const inicio = p.retomarDoBlocoId
    ? completa.findIndex((q) => blocoDaPergunta(q.id).id === p.retomarDoBlocoId)
    : 0;
  const fila = inicio > 0 ? completa.slice(inicio) : completa;
  return {
    sessao: p.sessao,
    modo: p.modo,
    voz: p.voz,
    fila,
    indice: 0,
    visitadas: [],
    respondidas: [],
    aprofundadas: [],
    aprofundamentoAberto: null,
    ultimaDecisao: null,
    fase: 'ociosa',
    pausada: false,
    encerrada: false,
    linhas: [],
    segundos: 0,
    erro: null,
    contadorLinhas: 0,
  };
}

// ---------------------------------------------------------------------------
// Auxiliares internos
// ---------------------------------------------------------------------------

function inalterado(estado: EstadoSessao): Transicao {
  return { estado, efeitos: [] };
}

function respondida(e: EstadoSessao, perguntaId: string): boolean {
  return e.respondidas.includes(perguntaId);
}

/** Há fala da entrevistadora esperando resposta (pergunta ou aprofundamento). */
function aguardaResposta(e: EstadoSessao): boolean {
  if (e.aprofundamentoAberto) return true;
  const atual = perguntaAtual(e);
  return e.visitadas.includes(atual.id) && !respondida(e, atual.id);
}

/** O que reler quando a resposta ainda não veio. */
function textoPendente(e: EstadoSessao): string {
  return e.aprofundamentoAberto ? e.aprofundamentoAberto.texto : perguntaAtual(e).texto;
}

/** `pararAudio` só quando há algo a interromper e o modo é voz. */
function interromperAudio(e: EstadoSessao): readonly Efeito[] {
  return e.modo === 'voz' && FASES_INTERROMPIVEIS.includes(e.fase) ? [{ tipo: 'pararAudio' }] : [];
}

/** Regra 1 sem a exigência de fase: usada pela decisão do Claude e pelo botão. */
function aprofundamentoDisponivel(e: EstadoSessao): boolean {
  const atual = perguntaAtual(e);
  return (
    !e.encerrada &&
    atual.permiteAprofundamento &&
    respondida(e, atual.id) &&
    !e.aprofundadas.includes(atual.id) &&
    e.aprofundamentoAberto === null
  );
}

/** Última fala do cliente sobre a pergunta — vai como `resposta` ao Claude. */
function ultimaRespostaDoCliente(e: EstadoSessao, perguntaId: string): string {
  for (let i = e.linhas.length - 1; i >= 0; i -= 1) {
    const linha = e.linhas[i];
    if (linha && linha.quem === 'cliente' && linha.perguntaId === perguntaId) return linha.texto;
  }
  return '';
}

type DadosDaLinha = Omit<LinhaTranscricao, 'id' | 'segundos'>;

/** Cria a linha com id sequencial e a coloca em `linhas`; quem chama emite `anexarLinha`. */
function comLinha(e: EstadoSessao, dados: DadosDaLinha): { estado: EstadoSessao; linha: LinhaTranscricao } {
  const contadorLinhas = e.contadorLinhas + 1;
  const linha: LinhaTranscricao = {
    id: `l${String(contadorLinhas).padStart(4, '0')}`,
    segundos: e.segundos,
    ...dados,
  };
  return { estado: { ...e, linhas: [...e.linhas, linha], contadorLinhas }, linha };
}

/** Relê a fala pendente em voz (retomada da pausa, troca para voz); sem nova linha. */
function relerSePendente(e: EstadoSessao): Transicao {
  if (e.modo === 'voz' && aguardaResposta(e)) {
    return { estado: { ...e, fase: 'falando' }, efeitos: [{ tipo: 'falar', texto: textoPendente(e) }] };
  }
  return { estado: { ...e, fase: 'ociosa' }, efeitos: [] };
}

// ---------------------------------------------------------------------------
// Transições
// ---------------------------------------------------------------------------

function perguntar(e: EstadoSessao, indice: number, instante: string): Transicao {
  const pergunta = e.fila[indice];
  if (!pergunta || e.pausada) return inalterado(e);

  const efeitos: Efeito[] = [...interromperAudio(e)];
  const mudou = indice !== e.indice;
  const base: EstadoSessao = {
    ...e,
    indice,
    fase: 'ociosa',
    erro: null,
    // Mudar de pergunta descarta o aprofundamento em aberto e o card da decisão.
    aprofundamentoAberto: mudou ? null : e.aprofundamentoAberto,
    ultimaDecisao: mudou ? null : e.ultimaDecisao,
  };
  if (e.visitadas.includes(pergunta.id)) return { estado: base, efeitos };

  const bloco = blocoDaPergunta(pergunta.id);
  const { estado, linha } = comLinha(base, {
    quem: 'entrevistadora',
    texto: pergunta.texto,
    instante,
    perguntaId: pergunta.id,
    blocoId: bloco.id,
    origem: 'pergunta',
  });
  efeitos.push({ tipo: 'anexarLinha', linha });
  // Primeira pergunta de um bloco: o progresso.json passa a apontar para ele.
  const blocoNovo = !e.visitadas.some((id) => blocoDaPergunta(id).id === bloco.id);
  if (blocoNovo) efeitos.push({ tipo: 'gravarProgresso' });

  const visitado: EstadoSessao = { ...estado, visitadas: [...estado.visitadas, pergunta.id] };
  if (visitado.modo === 'voz') {
    efeitos.push({ tipo: 'falar', texto: pergunta.texto });
    return { estado: { ...visitado, fase: 'falando' }, efeitos };
  }
  return { estado: visitado, efeitos };
}

function leituraConcluida(e: EstadoSessao): Transicao {
  // Só vale para a leitura em curso; uma conclusão atrasada é ignorada.
  if (e.fase !== 'falando') return inalterado(e);
  if (e.encerrada) return { estado: { ...e, fase: 'ociosa' }, efeitos: [] };
  if (e.modo === 'voz' && aguardaResposta(e)) {
    return { estado: { ...e, fase: 'ouvindo' }, efeitos: [{ tipo: 'ouvir' }] };
  }
  return { estado: { ...e, fase: 'ociosa' }, efeitos: [] };
}

function capturaConcluida(e: EstadoSessao): Transicao {
  if (e.fase !== 'ouvindo') return inalterado(e);
  return { estado: { ...e, fase: 'transcrevendo' }, efeitos: [] };
}

function respostaRegistrada(
  e: EstadoSessao,
  acao: { texto: string; origem: 'voz' | 'escrita'; instante: string },
): Transicao {
  // Voz: só a transcrição da captura em curso. Escrita: quando nada está em
  // andamento. O resto é resposta atrasada (ex.: transcrição após navegar).
  const aceita = e.fase === 'transcrevendo' || (e.fase === 'ociosa' && acao.origem === 'escrita');
  if (!aceita) return inalterado(e);

  const texto = acao.texto.trim();
  if (texto === '') {
    // Em voz, é a transcrição que não captou nada.
    const erro: ErroApp = { codigo: 'desconhecido', mensagem: MENSAGEM_RESPOSTA_VAZIA };
    return { estado: { ...e, fase: 'ociosa', erro }, efeitos: [] };
  }

  const pergunta = perguntaAtual(e);
  const bloco = blocoAtual(e);
  const { estado, linha } = comLinha(
    { ...e, erro: null },
    {
      quem: 'cliente',
      texto,
      instante: acao.instante,
      perguntaId: pergunta.id,
      blocoId: bloco.id,
      origem: acao.origem,
    },
  );
  const efeitos: Efeito[] = [{ tipo: 'anexarLinha', linha }];

  // Resposta ao aprofundamento: fecha-o e não gera nova decisão (regra 2).
  if (e.aprofundamentoAberto) {
    return { estado: { ...estado, aprofundamentoAberto: null, fase: 'ociosa' }, efeitos };
  }

  const respondidas = respondida(e, pergunta.id) ? e.respondidas : [...e.respondidas, pergunta.id];
  efeitos.push({ tipo: 'gravarProgresso' });
  const comResposta: EstadoSessao = { ...estado, respondidas };

  if (!pergunta.permiteAprofundamento) {
    const ultimaDecisao: DecisaoConducao = {
      aprofundar: false,
      pergunta: null,
      motivo: MOTIVO_REGRA,
      origem: 'regra',
    };
    return { estado: { ...comResposta, ultimaDecisao, fase: 'ociosa' }, efeitos };
  }
  // Complemento a uma pergunta cujo aprofundamento já foi usado: só registra.
  if (e.aprofundadas.includes(pergunta.id)) {
    return { estado: { ...comResposta, fase: 'ociosa' }, efeitos };
  }
  efeitos.push({
    tipo: 'decidir',
    entrada: entradaDeConducao(e.sessao, bloco.nome, pergunta, texto, false),
  });
  return { estado: { ...comResposta, fase: 'decidindo' }, efeitos };
}

function aplicarAprofundamento(e: EstadoSessao, texto: string, instante: string): Transicao {
  const pergunta = perguntaAtual(e);
  const bloco = blocoAtual(e);
  const { estado, linha } = comLinha(e, {
    quem: 'entrevistadora',
    texto,
    instante,
    perguntaId: pergunta.id,
    blocoId: bloco.id,
    origem: 'aprofundamento',
  });
  const aberto: EstadoSessao = {
    ...estado,
    aprofundadas: [...estado.aprofundadas, pergunta.id],
    aprofundamentoAberto: { perguntaId: pergunta.id, texto },
  };
  const efeitos: Efeito[] = [{ tipo: 'anexarLinha', linha }];
  if (aberto.modo === 'voz') {
    efeitos.push({ tipo: 'falar', texto });
    return { estado: { ...aberto, fase: 'falando' }, efeitos };
  }
  return { estado: { ...aberto, fase: 'ociosa' }, efeitos };
}

function decisaoConducao(e: EstadoSessao, decisao: DecisaoConducao, instante: string): Transicao {
  // Decisão atrasada (o usuário navegou, pausou…): não mexe em nada.
  if (e.fase !== 'decidindo') return inalterado(e);
  const base: EstadoSessao = { ...e, ultimaDecisao: decisao, fase: 'ociosa' };
  if (decisao.aprofundar && decisao.pergunta && aprofundamentoDisponivel(e)) {
    return aplicarAprofundamento(base, decisao.pergunta, instante);
  }
  return { estado: base, efeitos: [] };
}

function aprofundar(e: EstadoSessao): Transicao {
  if (!podeAprofundar(e)) return inalterado(e);
  const pergunta = perguntaAtual(e);
  const entrada = entradaDeConducao(
    e.sessao,
    blocoAtual(e).nome,
    pergunta,
    ultimaRespostaDoCliente(e, pergunta.id),
    true,
  );
  return { estado: { ...e, fase: 'decidindo', erro: null }, efeitos: [{ tipo: 'decidir', entrada }] };
}

function pausar(e: EstadoSessao): Transicao {
  if (e.pausada) return inalterado(e);
  return {
    estado: { ...e, pausada: true, fase: 'pausada' },
    efeitos: [{ tipo: 'pararAudio' }],
  };
}

function retomar(e: EstadoSessao): Transicao {
  if (!e.pausada) return inalterado(e);
  return relerSePendente({ ...e, pausada: false });
}

function proxima(e: EstadoSessao, instante: string): Transicao {
  if (e.pausada) return inalterado(e);
  if (ehUltima(e)) return encerrar(e, instante);
  return perguntar(e, e.indice + 1, instante);
}

function anterior(e: EstadoSessao, instante: string): Transicao {
  if (e.indice === 0 || e.pausada) return inalterado(e);
  return perguntar(e, e.indice - 1, instante);
}

function irParaBloco(e: EstadoSessao, blocoId: string, instante: string): Transicao {
  if (e.pausada) return inalterado(e);
  const doBloco = e.fila.filter((q) => blocoDaPergunta(q.id).id === blocoId);
  // Regra 3: só blocos já iniciados. A primeira pergunta do bloco já foi
  // visitada, então `perguntar` apenas move o cursor.
  if (!doBloco.some((q) => e.visitadas.includes(q.id))) return inalterado(e);
  const indice = e.fila.findIndex((q) => blocoDaPergunta(q.id).id === blocoId);
  return perguntar(e, indice, instante);
}

function alternarModo(e: EstadoSessao, modo: Modo): Transicao {
  if (modo === e.modo) return inalterado(e);
  const efeitos: Efeito[] = [...interromperAudio(e)];
  const trocado: EstadoSessao = { ...e, modo };
  // Em pausa, a releitura fica para o `retomar`.
  if (e.pausada) return { estado: { ...trocado, fase: 'pausada' }, efeitos };
  const r = relerSePendente(trocado);
  return { estado: r.estado, efeitos: [...efeitos, ...r.efeitos] };
}

function tique(e: EstadoSessao): Transicao {
  if (e.pausada || e.encerrada) return inalterado(e);
  return { estado: { ...e, segundos: e.segundos + 1 }, efeitos: [] };
}

function encerrar(e: EstadoSessao, instante: string): Transicao {
  const efeitos: Efeito[] = [...interromperAudio(e)];
  const concluida = e.fila.every((q) => respondida(e, q.id));
  let estado: EstadoSessao = {
    ...e,
    encerrada: true,
    pausada: false,
    fase: 'ociosa',
    aprofundamentoAberto: null,
    erro: null,
  };
  if (concluida) {
    const texto = e.sessao === 3 ? DESPEDIDA_ENTREVISTA : DESPEDIDA_SESSAO;
    const r = comLinha(estado, {
      quem: 'entrevistadora',
      texto,
      instante,
      perguntaId: null,
      blocoId: null,
      origem: 'despedida',
    });
    estado = r.estado;
    efeitos.push({ tipo: 'anexarLinha', linha: r.linha });
    if (estado.modo === 'voz') {
      efeitos.push({ tipo: 'falar', texto });
      estado = { ...estado, fase: 'falando' };
    }
  }
  efeitos.push({ tipo: 'finalizar', concluida });
  return { estado, efeitos };
}

function erro(e: EstadoSessao, erroApp: ErroApp): Transicao {
  return {
    estado: { ...e, fase: e.pausada ? 'pausada' : 'ociosa', erro: erroApp },
    efeitos: [{ tipo: 'pararAudio' }],
  };
}

export function reduzir(estado: EstadoSessao, acao: Acao): Transicao {
  // Depois de encerrada só a despedida termina de ser lida e o relógio para.
  if (estado.encerrada && acao.tipo !== 'leituraConcluida' && acao.tipo !== 'tique') {
    return inalterado(estado);
  }
  switch (acao.tipo) {
    case 'perguntar':
      return perguntar(estado, acao.indice, acao.instante);
    case 'leituraConcluida':
      return leituraConcluida(estado);
    case 'capturaConcluida':
      return capturaConcluida(estado);
    case 'respostaRegistrada':
      return respostaRegistrada(estado, acao);
    case 'decisaoConducao':
      return decisaoConducao(estado, acao.decisao, acao.instante);
    case 'aprofundar':
      return aprofundar(estado);
    case 'pausar':
      return pausar(estado);
    case 'retomar':
      return retomar(estado);
    case 'anterior':
      return anterior(estado, acao.instante);
    case 'proxima':
      return proxima(estado, acao.instante);
    case 'irParaBloco':
      return irParaBloco(estado, acao.blocoId, acao.instante);
    case 'alternarModo':
      return alternarModo(estado, acao.modo);
    case 'tique':
      return tique(estado);
    case 'encerrar':
      return encerrar(estado, acao.instante);
    case 'erro':
      return erro(estado, acao.erro);
    case 'limparErro':
      return { estado: { ...estado, erro: null }, efeitos: [] };
  }
}

// ---------------------------------------------------------------------------
// Seletores
// ---------------------------------------------------------------------------

export function perguntaAtual(e: EstadoSessao): Pergunta {
  const pergunta = e.fila[e.indice];
  // O motor nunca move o cursor para fora da fila; se acontecer, é bug.
  if (!pergunta) throw new Error(`Índice ${e.indice} fora da fila da sessão ${e.sessao}.`);
  return pergunta;
}

export function blocoAtual(e: EstadoSessao): Bloco {
  return blocoDaPergunta(perguntaAtual(e).id);
}

export function ehUltima(e: EstadoSessao): boolean {
  return e.indice === e.fila.length - 1;
}

export function podeAprofundar(e: EstadoSessao): boolean {
  return e.fase === 'ociosa' && !e.pausada && aprofundamentoDisponivel(e);
}

export function rotuloAprofundar(
  e: EstadoSessao,
): 'Aprofundar' | 'Aprofundamento usado' | 'Sem aprofundamento' {
  const atual = perguntaAtual(e);
  if (!atual.permiteAprofundamento) return 'Sem aprofundamento';
  if (e.aprofundadas.includes(atual.id)) return 'Aprofundamento usado';
  return 'Aprofundar';
}

/** 0..1 — perguntas da fila respondidas (o fechamento conta na sessão 3). */
export function progressoDaSessao(e: EstadoSessao): number {
  if (e.fila.length === 0) return 0;
  const feitas = e.fila.filter((q) => respondida(e, q.id)).length;
  return feitas / e.fila.length;
}

export function chipsDeBlocos(
  e: EstadoSessao,
): readonly { bloco: Bloco; estado: 'concluido' | 'atual' | 'pendente'; navegavel: boolean }[] {
  const atual = blocoAtual(e).id;
  return sessaoPorNumero(e.sessao).blocos.map((bloco) => {
    const naFila = e.fila.filter((q) => blocoDaPergunta(q.id).id === bloco.id);
    // Bloco fora da fila (retomada) foi feito numa execução anterior.
    const concluido = naFila.every((q) => respondida(e, q.id));
    const estado = bloco.id === atual ? 'atual' : concluido ? 'concluido' : 'pendente';
    const navegavel = naFila.some((q) => e.visitadas.includes(q.id));
    return { bloco, estado, navegavel };
  });
}

export function rotuloPergunta(e: EstadoSessao): string {
  const atual = perguntaAtual(e);
  if (atual.id === FECHAMENTO.id || atual.numero === null) return 'Fechamento · fora da contagem';
  return `Pergunta ${atual.numero} de ${TOTAL_PERGUNTAS}`;
}

export function rotuloFase(e: EstadoSessao): { texto: string; cor: 'azul' | 'ambar' | 'neutra' } {
  if (e.encerrada && e.fase !== 'falando') return { texto: 'Sessão encerrada', cor: 'neutra' };
  switch (e.fase) {
    case 'falando':
      return { texto: 'Entrevistadora lendo a pergunta', cor: 'azul' };
    case 'ouvindo':
      return { texto: 'Ouvindo o cliente · transcrevendo', cor: 'ambar' };
    case 'transcrevendo':
      return { texto: 'Transcrevendo a resposta…', cor: 'ambar' };
    case 'decidindo':
      return { texto: 'Claude avaliando a resposta…', cor: 'ambar' };
    case 'pausada':
      return e.modo === 'escrita'
        ? { texto: 'Pausado — o tempo está parado', cor: 'ambar' }
        : { texto: 'Pausado — microfone fechado', cor: 'ambar' };
    case 'ociosa': {
      if (e.modo === 'voz') return { texto: 'Aguardando — aprofundar ou avançar', cor: 'neutra' };
      if (e.aprofundamentoAberto) {
        return { texto: 'Aprofundamento em aberto — registre a resposta', cor: 'neutra' };
      }
      if (respondida(e, perguntaAtual(e).id)) {
        return { texto: 'Resposta registrada — aprofundar ou avançar', cor: 'neutra' };
      }
      return { texto: 'Escrita — digite e registre a resposta', cor: 'neutra' };
    }
  }
}
