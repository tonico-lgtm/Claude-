/**
 * Tipos compartilhados entre o processo principal (Electron) e o renderer.
 *
 * Regra de ouro: nada aqui depende de Node, de DOM ou de React. Este arquivo
 * é compilado pelos dois `tsconfig` (renderer e electron) e importado pelos
 * testes. Só tipos, constantes e funções puras.
 */

import type { Pergunta, TipoPergunta } from '../roteiro/roteiro';

// ---------------------------------------------------------------------------
// Motores e chaves
// ---------------------------------------------------------------------------

export type Motor = 'claude' | 'grok';

export const PREFIXO_CHAVE: Readonly<Record<Motor, string>> = {
  claude: 'sk-ant-',
  grok: 'xai-',
};

/** Validação de formato (e só de formato). Mesma regra do protótipo. */
export const REGEX_CHAVE: Readonly<Record<Motor, RegExp>> = {
  claude: /^sk-ant-[A-Za-z0-9_-]{20,}$/,
  grok: /^xai-[A-Za-z0-9_-]{20,}$/,
};

export function chaveTemFormatoValido(motor: Motor, chave: string): boolean {
  return REGEX_CHAVE[motor].test(chave.trim());
}

/**
 * O renderer nunca vê a chave: só sabe se há uma provisionada. As chaves não
 * são digitadas na tela; o main as lê das variáveis de ambiente ou do arquivo
 * local `chaves.local.json` (ver `shared/chaves.ts`).
 */
export type SituacaoChave = 'ausente' | 'invalida' | 'presente';

export interface EstadoChaves {
  readonly claude: SituacaoChave;
  readonly grok: SituacaoChave;
}

/** Nome do arquivo local de chaves, ao lado do `package.json` do app (ou em userData). */
export const NOME_ARQUIVO_CHAVES_LOCAL = 'chaves.local.json';

/** Variáveis de ambiente que também provisionam as chaves; têm precedência sobre o arquivo. */
export const VARIAVEL_DE_CHAVE: Readonly<Record<Motor, string>> = {
  claude: 'ENTREVISTA_TWIN_CLAUDE_KEY',
  grok: 'ENTREVISTA_TWIN_GROK_KEY',
};

export interface ResultadoValidacaoChave {
  readonly motor: Motor;
  readonly ok: boolean;
  /** Mensagem curta, em português, apta a aparecer na tela. */
  readonly mensagem: string;
}

// ---------------------------------------------------------------------------
// Modo, vozes
// ---------------------------------------------------------------------------

/** Livre escolha do cliente; pode alternar a qualquer momento da sessão. */
export type Modo = 'voz' | 'escrita';

export type VozId = 'helios' | 'leo';

export interface Voz {
  readonly id: VozId;
  readonly nome: string;
  readonly descricao: string;
}

/** Decisão fechada: Helios e Leo. Os placeholders Ana/Beatriz/Clara saíram. */
export const VOZES: readonly Voz[] = [
  { id: 'helios', nome: 'Helios', descricao: 'Catálogo Grok Voice · leitura em português' },
  { id: 'leo', nome: 'Leo', descricao: 'Catálogo Grok Voice · leitura em português' },
];

export const VOZ_PADRAO: VozId = 'helios';

/** Frase curta usada pelo botão "Ouvir amostra" da tela de setup. */
export const FRASE_DE_AMOSTRA = 'Olá. Sou a entrevistadora desta sessão. Começamos quando você quiser.';

// ---------------------------------------------------------------------------
// Transcrição
// ---------------------------------------------------------------------------

export type Interlocutor = 'entrevistadora' | 'cliente';

export interface LinhaTranscricao {
  /** Único dentro da sessão (ex.: `l0007`). */
  readonly id: string;
  readonly quem: Interlocutor;
  readonly texto: string;
  /** Segundos decorridos desde o início desta execução da sessão. */
  readonly segundos: number;
  /** Instante absoluto (ISO 8601), gravado no arquivo. */
  readonly instante: string;
  /** Pergunta a que a fala pertence; `null` só na fala de despedida. */
  readonly perguntaId: string | null;
  readonly blocoId: string | null;
  /**
   * Como a fala chegou. Entrevistadora: 'pergunta' | 'aprofundamento' |
   * 'despedida'. Cliente: 'voz' | 'escrita'.
   */
  readonly origem: 'pergunta' | 'aprofundamento' | 'despedida' | 'voz' | 'escrita';
}

// ---------------------------------------------------------------------------
// Condução (Claude)
// ---------------------------------------------------------------------------

export interface EntradaConducao {
  readonly sessao: 1 | 2 | 3;
  readonly blocoNome: string;
  readonly pergunta: {
    readonly id: string;
    readonly numero: number | null;
    readonly texto: string;
    readonly regra: string;
    readonly tipo: TipoPergunta;
    readonly opcoes?: readonly string[];
    readonly permiteAprofundamento: boolean;
  };
  /** Resposta do cliente, transcrita ou digitada, literal. */
  readonly resposta: string;
  /**
   * `true` quando quem conduz a sessão apertou "Aprofundar": o modelo deve
   * formular a pergunta de aprofundamento, não decidir se cabe.
   */
  readonly forcar: boolean;
}

export interface DecisaoConducao {
  readonly aprofundar: boolean;
  /** A pergunta de aprofundamento, pronta para ser lida. `null` se não aprofundar. */
  readonly pergunta: string | null;
  /** Justificativa curta. Não vai para a transcrição; aparece no card "Claude". */
  readonly motivo: string;
  /**
   * De onde saiu a decisão: 'claude' (modelo), 'recusa' (stop_reason refusal →
   * não aprofundar), 'erro' (falha de rede/API → não aprofundar), 'regra'
   * (pergunta não permite aprofundamento → nem chamou o modelo), 'simulacao'.
   */
  readonly origem: 'claude' | 'recusa' | 'erro' | 'regra' | 'simulacao';
}

export function entradaDeConducao(
  sessao: 1 | 2 | 3,
  blocoNome: string,
  pergunta: Pergunta,
  resposta: string,
  forcar: boolean,
): EntradaConducao {
  return {
    sessao,
    blocoNome,
    pergunta: {
      id: pergunta.id,
      numero: pergunta.numero,
      texto: pergunta.texto,
      regra: pergunta.regra,
      tipo: pergunta.tipo,
      ...(pergunta.opcoes ? { opcoes: pergunta.opcoes } : {}),
      permiteAprofundamento: pergunta.permiteAprofundamento,
    },
    resposta,
    forcar,
  };
}

// ---------------------------------------------------------------------------
// Voz (Grok)
// ---------------------------------------------------------------------------

export interface AudioFalado {
  /** Bytes do áudio, prontos para virar Blob no renderer. */
  readonly audio: ArrayBuffer;
  readonly mime: string;
}

export interface Transcrito {
  readonly texto: string;
  /** Duração do áudio em segundos, quando a API devolve. */
  readonly duracao?: number;
}

// ---------------------------------------------------------------------------
// Progresso entre sessões (arquivo `progresso.json` ao lado das transcrições)
// ---------------------------------------------------------------------------

export type NumeroSessao = 1 | 2 | 3;

export type SessaoGravada =
  | { readonly estado: 'pendente' }
  | {
      readonly estado: 'incompleta';
      readonly arquivo: string;
      readonly iniciadaEm: string;
      readonly modo: Modo;
      /** Bloco onde parou: a sessão recomeça dele. */
      readonly blocoAtual: string;
      readonly perguntasRespondidas: readonly string[];
    }
  | {
      readonly estado: 'concluida';
      readonly arquivo: string;
      readonly iniciadaEm: string;
      readonly concluidaEm: string;
      readonly modo: Modo;
    };

export interface Progresso {
  readonly versao: 1;
  readonly roteiro: 'v1';
  readonly atualizadoEm: string;
  readonly sessoes: {
    readonly 1: SessaoGravada;
    readonly 2: SessaoGravada;
    readonly 3: SessaoGravada;
  };
}

export const NOME_ARQUIVO_PROGRESSO = 'progresso.json';

// ---------------------------------------------------------------------------
// Configuração persistida do app (userData) — nada sensível aqui
// ---------------------------------------------------------------------------

export interface ConfiguracaoApp {
  readonly pasta: string | null;
  readonly modo: Modo;
  readonly voz: VozId;
}

export const CONFIGURACAO_PADRAO: ConfiguracaoApp = { pasta: null, modo: 'voz', voz: VOZ_PADRAO };

// ---------------------------------------------------------------------------
// Informações do sistema (para rodapés e diagnóstico)
// ---------------------------------------------------------------------------

export interface InfoSistema {
  readonly plataforma: 'electron' | 'navegador';
  /** `true` quando os serviços de voz e condução são simulados (sem rede). */
  readonly simulada: boolean;
  readonly versaoApp: string;
  readonly so: string;
  /** Caminho completo onde o app procura `chaves.local.json`; aparece na tela quando falta chave. */
  readonly arquivoDeChaves: string;
}

// ---------------------------------------------------------------------------
// Canais IPC — a única lista; main, preload e renderer importam daqui.
// ---------------------------------------------------------------------------

export const CANAIS = {
  chavesEstado: 'chaves:estado',
  chavesValidar: 'chaves:validar',

  configLer: 'config:ler',
  configGravar: 'config:gravar',

  destinoPadrao: 'destino:padrao',
  destinoEscolher: 'destino:escolher',

  progressoLer: 'progresso:ler',
  progressoGravar: 'progresso:gravar',

  transcricaoAnexar: 'transcricao:anexar',
  transcricaoTamanho: 'transcricao:tamanho',

  vozFalar: 'voz:falar',
  vozTranscrever: 'voz:transcrever',

  conducaoDecidir: 'conducao:decidir',

  sistemaInfo: 'sistema:info',
  sistemaAbrirPasta: 'sistema:abrirPasta',
  sistemaFechar: 'sistema:fechar',
} as const;

export type Canal = (typeof CANAIS)[keyof typeof CANAIS];

/** Nome do objeto exposto pelo preload em `window`. */
export const NOME_PONTE = 'entrevistaTwin';

// ---------------------------------------------------------------------------
// Erros com mensagem apta à interface
// ---------------------------------------------------------------------------

export type CodigoErro =
  | 'chave-ausente'
  | 'chave-invalida'
  | 'rede'
  | 'api'
  | 'microfone'
  | 'arquivo'
  | 'desconhecido';

export interface ErroApp {
  readonly codigo: CodigoErro;
  readonly mensagem: string;
  readonly detalhe?: string;
}

/** Serializa qualquer erro num `ErroApp` estável (o IPC não preserva classes). */
export function paraErroApp(erro: unknown, codigo: CodigoErro = 'desconhecido'): ErroApp {
  if (typeof erro === 'object' && erro !== null && 'codigo' in erro && 'mensagem' in erro) {
    const e = erro as ErroApp;
    return { codigo: e.codigo, mensagem: e.mensagem, ...(e.detalhe ? { detalhe: e.detalhe } : {}) };
  }
  if (erro instanceof Error) return { codigo, mensagem: erro.message };
  return { codigo, mensagem: String(erro) };
}

// ---------------------------------------------------------------------------
// Formatação de tempo (compartilhada por telas e transcrição)
// ---------------------------------------------------------------------------

const dois = (n: number): string => String(n).padStart(2, '0');

/** `hh:mm:ss` — relógio do cabeçalho. */
export function formatarDuracao(segundos: number): string {
  const s = Math.max(0, Math.floor(segundos));
  return `${dois(Math.floor(s / 3600))}:${dois(Math.floor((s % 3600) / 60))}:${dois(s % 60)}`;
}

/** `mm:ss` (ou `h:mm:ss` a partir de uma hora) — carimbo das falas. */
export function formatarCarimbo(segundos: number): string {
  const s = Math.max(0, Math.floor(segundos));
  if (s >= 3600) return `${Math.floor(s / 3600)}:${dois(Math.floor((s % 3600) / 60))}:${dois(s % 60)}`;
  return `${dois(Math.floor(s / 60))}:${dois(s % 60)}`;
}

/** `AAAA-MM-DD` na hora local — vai para o nome do arquivo. */
export function dataLocalIso(data: Date): string {
  return `${data.getFullYear()}-${dois(data.getMonth() + 1)}-${dois(data.getDate())}`;
}

/**
 * ISO 8601 com o fuso local (`2026-09-06T22:30:11.045-03:00`) — vai para o
 * cabeçalho, o marcador, o rodapé e o `progresso.json`. Quem lê a transcrição
 * viveu a hora local; e a data bate com a do nome do arquivo.
 */
export function instanteLocalIso(data: Date): string {
  const deslocamento = -data.getTimezoneOffset();
  const sinal = deslocamento >= 0 ? '+' : '-';
  const absoluto = Math.abs(deslocamento);
  const ms = String(data.getMilliseconds()).padStart(3, '0');
  return (
    `${dataLocalIso(data)}T${dois(data.getHours())}:${dois(data.getMinutes())}:${dois(data.getSeconds())}.${ms}` +
    `${sinal}${dois(Math.floor(absoluto / 60))}:${dois(absoluto % 60)}`
  );
}
