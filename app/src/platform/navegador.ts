/**
 * Plataforma de navegador — para `npm run dev` sem Electron.
 *
 * Tudo vive em `localStorage` sob o prefixo `entrevista-twin:`. Não há rede,
 * não há chave real: as chaves só passam pela validação de formato (e nem o
 * texto delas fica guardado, só a marca de que existe), a voz é a simulação
 * (WAV mudo, com `speechSynthesis` em paralelo quando o navegador tem) e a
 * condução é a simulada. Serve para trabalhar nas telas, nada mais.
 */

import { interpretarProgresso, progressoInicial } from '../engine/progresso';
import { FECHAMENTO, PERGUNTAS_NUMERADAS } from '../roteiro/roteiro';
import {
  condutorSimulado,
  gerarWavMudo,
  segundosDeFalaSimulada,
  vozSimulada,
} from '../services/simulacao';
import {
  CONFIGURACAO_PADRAO,
  FRASE_DE_AMOSTRA,
  NOME_ARQUIVO_CHAVES_LOCAL,
} from '../shared/tipos';
import type {
  AudioFalado,
  ConfiguracaoApp,
  ErroApp,
  EstadoChaves,
  Motor,
  Progresso,
  ResultadoValidacaoChave,
} from '../shared/tipos';
import type { Plataforma } from './plataforma';

const PREFIXO = 'entrevista-twin:';
const PASTA_PADRAO = '~/Documentos/Entrevista Twin';

// ---------------------------------------------------------------------------
// localStorage
// ---------------------------------------------------------------------------

function ler(chave: string): string | null {
  try {
    return window.localStorage.getItem(PREFIXO + chave);
  } catch {
    return null;
  }
}

function gravar(chave: string, valor: string): void {
  try {
    window.localStorage.setItem(PREFIXO + chave, valor);
  } catch (e) {
    const falha: ErroApp = {
      codigo: 'arquivo',
      mensagem: 'Não foi possível gravar no localStorage.',
      ...(e instanceof Error ? { detalhe: e.message } : {}),
    };
    throw falha;
  }
}

function lerJson(chave: string): unknown {
  const texto = ler(chave);
  if (texto === null) return undefined;
  try {
    return JSON.parse(texto) as unknown;
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Chaves — no navegador não há chave nenhuma: tudo é simulado, e o app se
// comporta como se as duas estivessem provisionadas.
// ---------------------------------------------------------------------------

const CHAVES_SIMULADAS: EstadoChaves = { claude: 'presente', grok: 'presente' };

function validarChave(motor: Motor): ResultadoValidacaoChave {
  return { motor, ok: true, mensagem: 'Simulação no navegador: chave não verificada na API.' };
}

// ---------------------------------------------------------------------------
// Configuração
// ---------------------------------------------------------------------------

function lerConfiguracao(): ConfiguracaoApp {
  const json = lerJson('config');
  if (typeof json !== 'object' || json === null) return CONFIGURACAO_PADRAO;
  const o = json as Record<string, unknown>;
  const pasta = o['pasta'];
  const modo = o['modo'];
  const voz = o['voz'];
  return {
    pasta: typeof pasta === 'string' && pasta !== '' ? pasta : null,
    modo: modo === 'voz' || modo === 'escrita' ? modo : CONFIGURACAO_PADRAO.modo,
    voz: voz === 'helios' || voz === 'leo' ? voz : CONFIGURACAO_PADRAO.voz,
  };
}

// ---------------------------------------------------------------------------
// Progresso e transcrição (por pasta / por arquivo)
// ---------------------------------------------------------------------------

const chaveDeProgresso = (pasta: string): string => `progresso:${pasta}`;
const chaveDeTranscricao = (pasta: string, arquivo: string): string => `transcricao:${pasta}/${arquivo}`;

function lerProgresso(pasta: string, agora: string): Progresso {
  const json = lerJson(chaveDeProgresso(pasta));
  if (json === undefined) return progressoInicial(agora);
  return interpretarProgresso(json, agora);
}

/** Tamanho em bytes UTF-8, como `fs.stat` daria no Electron. */
function tamanhoEmBytes(texto: string): number {
  return new TextEncoder().encode(texto).length;
}

// ---------------------------------------------------------------------------
// Voz: WAV mudo + speechSynthesis
// ---------------------------------------------------------------------------

/**
 * Mesmo truque do main em simulação: a pergunta atual é deduzida pelo texto
 * lido, porque `transcrever` não recebe a pergunta pelo contrato.
 */
const ID_POR_TEXTO_DE_PERGUNTA: ReadonlyMap<string, string> = new Map(
  [...PERGUNTAS_NUMERADAS, FECHAMENTO].map((p) => [p.texto.trim(), p.id]),
);

const DESPEDIDAS: readonly string[] = [
  'Obrigada. Esta sessão está encerrada.',
  'Obrigada. A entrevista está encerrada.',
];

const contexto = { perguntaId: null as string | null, aprofundamentoAberto: false };

function registrarFala(texto: string): void {
  const limpo = texto.trim();
  const id = ID_POR_TEXTO_DE_PERGUNTA.get(limpo);
  if (id !== undefined) {
    contexto.perguntaId = id;
    contexto.aprofundamentoAberto = false;
    return;
  }
  if (limpo === FRASE_DE_AMOSTRA || DESPEDIDAS.includes(limpo)) return;
  if (contexto.perguntaId !== null) contexto.aprofundamentoAberto = true;
}

const vozDeSimulacao = vozSimulada({
  perguntaAtual: () => contexto.perguntaId,
  aprofundamentoAberto: () => contexto.aprofundamentoAberto,
});

/** Fala de verdade pelo navegador, quando há `speechSynthesis`; cancela a anterior. */
function sintetizar(texto: string): void {
  const sintese = window.speechSynthesis;
  if (!sintese) return;
  try {
    sintese.cancel();
    const fala = new SpeechSynthesisUtterance(texto);
    fala.lang = 'pt-BR';
    sintese.speak(fala);
  } catch {
    // Sem síntese disponível o WAV mudo continua valendo como fala.
  }
}

async function falar(texto: string): Promise<AudioFalado> {
  registrarFala(texto);
  sintetizar(texto);
  return { audio: gerarWavMudo(segundosDeFalaSimulada(texto)), mime: 'audio/wav' };
}

const condutor = condutorSimulado();

// ---------------------------------------------------------------------------
// Plataforma
// ---------------------------------------------------------------------------

export function plataformaNavegador(): Plataforma {
  return {
    chaves: {
      estado: async () => CHAVES_SIMULADAS,
      prepararArquivo: async () => {
        console.info('[navegador] não há arquivo de chaves fora do Electron');
        return NOME_ARQUIVO_CHAVES_LOCAL;
      },
      validar: async (motores) => motores.map((m) => validarChave(m)),
    },

    config: {
      ler: async () => lerConfiguracao(),
      gravar: async (config) => {
        gravar('config', JSON.stringify(config));
      },
    },

    destino: {
      padrao: async () => PASTA_PADRAO,
      escolher: async (atual) => window.prompt('Pasta de destino', atual ?? PASTA_PADRAO) ?? null,
    },

    progresso: {
      ler: async (pasta) => lerProgresso(pasta, new Date().toISOString()),
      gravar: async (pasta, progresso) => {
        gravar(chaveDeProgresso(pasta), JSON.stringify(progresso));
      },
    },

    transcricao: {
      anexar: async (pasta, arquivo, texto) => {
        const chave = chaveDeTranscricao(pasta, arquivo);
        gravar(chave, (ler(chave) ?? '') + texto);
      },
      tamanho: async (pasta, arquivo) => tamanhoEmBytes(ler(chaveDeTranscricao(pasta, arquivo)) ?? ''),
    },

    voz: {
      falar: (texto) => falar(texto),
      transcrever: (audio, mime) => vozDeSimulacao.transcrever(audio, mime),
    },

    conducao: {
      decidir: (entrada) => condutor.decidir(entrada),
    },

    sistema: {
      info: async () => ({
        plataforma: 'navegador',
        simulada: true,
        versaoApp: 'dev',
        so: navigator.platform,
        arquivoDeChaves: `${NOME_ARQUIVO_CHAVES_LOCAL} (não se aplica no navegador)`,
      }),
      abrirPasta: async (pasta) => {
        console.info(`[navegador] abrir pasta: ${pasta}`);
      },
      // Sem app para fechar: recarregar volta ao setup.
      fechar: async () => {
        window.speechSynthesis?.cancel();
        window.location.reload();
      },
    },
  };
}
