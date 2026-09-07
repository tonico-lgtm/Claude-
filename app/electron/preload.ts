/**
 * Preload — expõe `window.entrevistaTwin` ao renderer via `contextBridge`.
 *
 * Roda com `sandbox: true`: aqui só se pode requerer `electron`; nenhum
 * módulo local entra em runtime. Por isso os nomes dos canais são literais
 * repetidos deste lado e conferidos em tempo de compilação com `satisfies`
 * contra o contrato de `shared/tipos.ts` (o `import type` é apagado na
 * compilação e não gera `require`).
 *
 * O objeto exposto tem exatamente a forma de `Plataforma`; cada método é um
 * `ipcRenderer.invoke` no canal correspondente. Erros do main chegam ao
 * renderer como `Error` com a mensagem em JSON (ver `platform/electron.ts`).
 */

import { contextBridge, ipcRenderer } from 'electron';
import type {
  AudioFalado,
  CANAIS,
  ConfiguracaoApp,
  DecisaoConducao,
  EntradaConducao,
  EstadoChaves,
  InfoSistema,
  Motor,
  NOME_PONTE,
  Progresso,
  ResultadoValidacaoChave,
  Transcrito,
  VozId,
} from '../src/shared/tipos';
import type { Plataforma } from '../src/platform/plataforma';

/** Deve bater com `CANAIS` de `shared/tipos.ts`; o `satisfies` garante. */
const CANAL = {
  chavesEstado: 'chaves:estado',
  chavesGuardar: 'chaves:guardar',
  chavesRemover: 'chaves:remover',
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
} as const satisfies typeof CANAIS;

/** Deve bater com `NOME_PONTE`; idem. */
const NOME = 'entrevistaTwin' satisfies typeof NOME_PONTE;

const api: Plataforma = {
  chaves: {
    estado: (): Promise<EstadoChaves> => ipcRenderer.invoke(CANAL.chavesEstado),
    guardar: (motor: Motor, chave: string): Promise<EstadoChaves> =>
      ipcRenderer.invoke(CANAL.chavesGuardar, motor, chave),
    remover: (motor: Motor): Promise<EstadoChaves> => ipcRenderer.invoke(CANAL.chavesRemover, motor),
    validar: (motores: readonly Motor[]): Promise<readonly ResultadoValidacaoChave[]> =>
      ipcRenderer.invoke(CANAL.chavesValidar, [...motores]),
  },

  config: {
    ler: (): Promise<ConfiguracaoApp> => ipcRenderer.invoke(CANAL.configLer),
    gravar: (config: ConfiguracaoApp): Promise<void> => ipcRenderer.invoke(CANAL.configGravar, config),
  },

  destino: {
    padrao: (): Promise<string> => ipcRenderer.invoke(CANAL.destinoPadrao),
    escolher: (atual: string | null): Promise<string | null> =>
      ipcRenderer.invoke(CANAL.destinoEscolher, atual),
  },

  progresso: {
    ler: (pasta: string): Promise<Progresso> => ipcRenderer.invoke(CANAL.progressoLer, pasta),
    gravar: (pasta: string, progresso: Progresso): Promise<void> =>
      ipcRenderer.invoke(CANAL.progressoGravar, pasta, progresso),
  },

  transcricao: {
    anexar: (pasta: string, arquivo: string, texto: string): Promise<void> =>
      ipcRenderer.invoke(CANAL.transcricaoAnexar, pasta, arquivo, texto),
    tamanho: (pasta: string, arquivo: string): Promise<number> =>
      ipcRenderer.invoke(CANAL.transcricaoTamanho, pasta, arquivo),
  },

  voz: {
    falar: (texto: string, voz: VozId): Promise<AudioFalado> => ipcRenderer.invoke(CANAL.vozFalar, texto, voz),
    transcrever: (audio: ArrayBuffer, mime: string): Promise<Transcrito> =>
      ipcRenderer.invoke(CANAL.vozTranscrever, audio, mime),
  },

  conducao: {
    decidir: (entrada: EntradaConducao): Promise<DecisaoConducao> =>
      ipcRenderer.invoke(CANAL.conducaoDecidir, entrada),
  },

  sistema: {
    info: (): Promise<InfoSistema> => ipcRenderer.invoke(CANAL.sistemaInfo),
    abrirPasta: (pasta: string): Promise<void> => ipcRenderer.invoke(CANAL.sistemaAbrirPasta, pasta),
    fechar: (): Promise<void> => ipcRenderer.invoke(CANAL.sistemaFechar),
  },
};

contextBridge.exposeInMainWorld(NOME, api);
