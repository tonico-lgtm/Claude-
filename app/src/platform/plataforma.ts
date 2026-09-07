/**
 * Adaptador de plataforma — a única porta entre as telas e o mundo exterior.
 *
 * Trocar Electron por navegador (ou por Tauri) deve mexer só nas
 * implementações deste contrato (`electron.ts`, `navegador.ts`), nunca nas
 * telas nem no motor da sessão.
 *
 * Toda operação é assíncrona porque no Electron ela atravessa o IPC. Erros
 * chegam como `ErroApp` (ver `paraErroApp` em `shared/tipos.ts`).
 */

import type {
  AudioFalado,
  ConfiguracaoApp,
  DecisaoConducao,
  EntradaConducao,
  EstadoChaves,
  InfoSistema,
  Motor,
  Progresso,
  ResultadoValidacaoChave,
  Transcrito,
  VozId,
} from '../shared/tipos';

export interface Plataforma {
  readonly chaves: {
    /**
     * Só diz a situação de cada chave provisionada (ambiente ou
     * `chaves.local.json`); nunca devolve a chave. Relê as fontes a cada
     * chamada, para que um arquivo recém-criado valha sem reabrir o app.
     */
    estado(): Promise<EstadoChaves>;
    /** Faz uma chamada mínima a cada API para confirmar que a chave é aceita. */
    validar(motores: readonly Motor[]): Promise<readonly ResultadoValidacaoChave[]>;
  };

  readonly config: {
    ler(): Promise<ConfiguracaoApp>;
    gravar(config: ConfiguracaoApp): Promise<void>;
  };

  readonly destino: {
    /** Pasta sugerida quando o usuário nunca escolheu uma. */
    padrao(): Promise<string>;
    /** Abre o seletor de pasta; `null` se o usuário cancelou. */
    escolher(atual: string | null): Promise<string | null>;
  };

  readonly progresso: {
    /** Lê `progresso.json` da pasta; devolve o progresso inicial se não existir. */
    ler(pasta: string): Promise<Progresso>;
    gravar(pasta: string, progresso: Progresso): Promise<void>;
  };

  readonly transcricao: {
    /** Anexa texto ao arquivo (cria a pasta e o arquivo se preciso). */
    anexar(pasta: string, arquivo: string, texto: string): Promise<void>;
    /** Tamanho em bytes; 0 se o arquivo não existe. */
    tamanho(pasta: string, arquivo: string): Promise<number>;
  };

  readonly voz: {
    falar(texto: string, voz: VozId): Promise<AudioFalado>;
    transcrever(audio: ArrayBuffer, mime: string): Promise<Transcrito>;
  };

  readonly conducao: {
    decidir(entrada: EntradaConducao): Promise<DecisaoConducao>;
  };

  readonly sistema: {
    info(): Promise<InfoSistema>;
    abrirPasta(pasta: string): Promise<void>;
    fechar(): Promise<void>;
  };
}
