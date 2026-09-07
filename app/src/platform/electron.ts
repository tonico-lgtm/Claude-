/**
 * Plataforma Electron — embrulha `window.entrevistaTwin` (ver `ponte.d.ts`).
 *
 * Convenção de erro no IPC (o lado inverso está em `electron/main.ts`): o
 * main lança um `Error` cuja `message` é o JSON de um `ErroApp`; o Electron
 * embrulha isso em "Error invoking remote method 'canal': Error: {…}". Aqui
 * se extrai o JSON e se relança um `ErroApp` literal, para que as telas
 * vejam sempre o mesmo formato de erro em qualquer plataforma.
 */

import { NOME_PONTE } from '../shared/tipos';
import type { AudioFalado, ErroApp } from '../shared/tipos';
import type { Plataforma } from './plataforma';

function ehErroApp(valor: unknown): valor is ErroApp {
  return (
    typeof valor === 'object' &&
    valor !== null &&
    'codigo' in valor &&
    typeof valor.codigo === 'string' &&
    'mensagem' in valor &&
    typeof valor.mensagem === 'string'
  );
}

/** Tenta ler o `ErroApp` embutido na mensagem; sem JSON legível, devolve 'desconhecido'. */
export function interpretarErroIpc(erro: unknown): ErroApp {
  if (ehErroApp(erro)) return erro;
  const mensagem = erro instanceof Error ? erro.message : String(erro);
  const inicio = mensagem.indexOf('{');
  const fim = mensagem.lastIndexOf('}');
  if (inicio !== -1 && fim > inicio) {
    try {
      const json: unknown = JSON.parse(mensagem.slice(inicio, fim + 1));
      if (ehErroApp(json)) {
        return { codigo: json.codigo, mensagem: json.mensagem, ...(json.detalhe ? { detalhe: json.detalhe } : {}) };
      }
    } catch {
      // Não era JSON: cai no genérico abaixo.
    }
  }
  return { codigo: 'desconhecido', mensagem: mensagem.replace(/^Error invoking remote method '[^']*': (?:Error: )?/, '') };
}

async function chamar<T>(operacao: () => Promise<T>): Promise<T> {
  try {
    return await operacao();
  } catch (e) {
    throw interpretarErroIpc(e);
  }
}

/** O IPC pode entregar `Uint8Array` no lugar de `ArrayBuffer`; o reprodutor quer `ArrayBuffer`. */
function normalizarAudio(falado: AudioFalado): AudioFalado {
  const bruto: unknown = falado.audio;
  if (bruto instanceof Uint8Array) {
    const copia = new ArrayBuffer(bruto.byteLength);
    new Uint8Array(copia).set(bruto);
    return { audio: copia, mime: falado.mime };
  }
  return falado;
}

export function plataformaElectron(): Plataforma {
  const ponte = window[NOME_PONTE];
  if (!ponte) {
    throw new Error('A ponte do Electron (window.entrevistaTwin) não está disponível.');
  }
  return {
    chaves: {
      estado: () => chamar(() => ponte.chaves.estado()),
      prepararArquivo: () => chamar(() => ponte.chaves.prepararArquivo()),
      validar: (motores) => chamar(() => ponte.chaves.validar(motores)),
    },
    config: {
      ler: () => chamar(() => ponte.config.ler()),
      gravar: (config) => chamar(() => ponte.config.gravar(config)),
    },
    destino: {
      padrao: () => chamar(() => ponte.destino.padrao()),
      escolher: (atual) => chamar(() => ponte.destino.escolher(atual)),
    },
    progresso: {
      ler: (pasta) => chamar(() => ponte.progresso.ler(pasta)),
      gravar: (pasta, progresso) => chamar(() => ponte.progresso.gravar(pasta, progresso)),
    },
    transcricao: {
      anexar: (pasta, arquivo, texto) => chamar(() => ponte.transcricao.anexar(pasta, arquivo, texto)),
      tamanho: (pasta, arquivo) => chamar(() => ponte.transcricao.tamanho(pasta, arquivo)),
    },
    voz: {
      falar: (texto, voz) => chamar(async () => normalizarAudio(await ponte.voz.falar(texto, voz))),
      transcrever: (audio, mime) => chamar(() => ponte.voz.transcrever(audio, mime)),
    },
    conducao: {
      decidir: (entrada) => chamar(() => ponte.conducao.decidir(entrada)),
    },
    sistema: {
      info: () => chamar(() => ponte.sistema.info()),
      abrirPasta: (pasta) => chamar(() => ponte.sistema.abrirPasta(pasta)),
      fechar: () => chamar(() => ponte.sistema.fechar()),
    },
  };
}
