/**
 * Props que ligam as três telas ao `App`. Ficam aqui, e não em cada tela,
 * para que Setup, Sessão e Fim de sessão possam ser escritas em paralelo
 * contra o mesmo contrato.
 */

import type { Plataforma } from '../platform/plataforma';
import type { ConfiguracaoApp, InfoSistema, NumeroSessao, Progresso } from '../shared/tipos';

/** O que a sessão devolve ao `App` quando encerra — completa ou não. */
export interface ResultadoSessao {
  readonly sessao: NumeroSessao;
  readonly concluida: boolean;
  /** Nome do arquivo (sem a pasta) da transcrição desta sessão. */
  readonly arquivo: string;
  readonly pasta: string;
  readonly segundos: number;
  readonly perguntasRespondidas: readonly string[];
  readonly totalPerguntas: number;
  /** Ids dos blocos com ao menos uma pergunta respondida. */
  readonly blocosCobertos: readonly string[];
  /** Bloco de onde uma sessão incompleta recomeça; igual ao último quando concluída. */
  readonly blocoAtual: string;
  readonly falas: number;
  /** Progresso já atualizado e gravado em `progresso.json`. */
  readonly progresso: Progresso;
}

export interface PropsSetup {
  readonly plataforma: Plataforma;
  readonly info: InfoSistema;
  /** `pasta` já resolvida pelo `App` (nunca `null` aqui). */
  readonly config: ConfiguracaoApp;
  readonly progresso: Progresso;
  /** O `App` grava a configuração e, se a pasta mudou, relê o progresso. */
  aoMudarConfig(config: ConfiguracaoApp): void;
  /** Chaves já validadas na API pela própria tela antes de chamar. */
  aoIniciar(sessao: NumeroSessao, retomarDoBlocoId: string | null): void;
}

export interface PropsSessao {
  readonly plataforma: Plataforma;
  readonly info: InfoSistema;
  readonly config: ConfiguracaoApp;
  readonly progresso: Progresso;
  readonly sessao: NumeroSessao;
  /** `null` quando a sessão começa do primeiro bloco. */
  readonly retomarDoBlocoId: string | null;
  /** O modo pode mudar durante a sessão; o `App` persiste a escolha. */
  aoMudarConfig(config: ConfiguracaoApp): void;
  aoEncerrar(resultado: ResultadoSessao): void;
}

export interface PropsFimDeSessao {
  readonly plataforma: Plataforma;
  readonly info: InfoSistema;
  readonly config: ConfiguracaoApp;
  readonly resultado: ResultadoSessao;
  /** Emendar a próxima sessão (ou retomar a atual, se incompleta). */
  aoContinuar(sessao: NumeroSessao, retomarDoBlocoId: string | null): void;
  aoFechar(): void;
}
