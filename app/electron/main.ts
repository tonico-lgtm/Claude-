/**
 * Processo principal — janela, IPC, chaves cifradas, disco e os clientes
 * Claude e Grok.
 *
 * É o único lugar onde uma chave de API existe em claro, e mesmo aqui só
 * dentro do handler que a usa: descriptografa, chama, descarta. Nada de
 * chave no renderer, nada de chave em log.
 *
 * Convenção de erro no IPC: o `invoke` não preserva classes nem campos
 * extras de um erro. Cada handler captura qualquer falha, converte com
 * `paraErroApp` e lança um `Error` cuja `message` é o JSON desse `ErroApp`.
 * O lado renderer (`src/platform/electron.ts`) faz o caminho inverso.
 *
 * Compilado como CommonJS pelo `electron/tsconfig.json`; `__dirname` aponta
 * para `dist/electron/electron`.
 */

import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  safeStorage,
  session,
  shell,
  systemPreferences,
} from 'electron';
import type { MenuItemConstructorOptions, OpenDialogOptions } from 'electron';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { FECHAMENTO, PERGUNTAS_NUMERADAS } from '../src/roteiro/roteiro';
import { interpretarProgresso, progressoInicial } from '../src/engine/progresso';
import { criarCondutor, validarChaveClaude } from '../src/services/claude';
import { criarVozGrok, validarChaveGrok } from '../src/services/grok';
import { condutorSimulado, vozSimulada } from '../src/services/simulacao';
import {
  CANAIS,
  CONFIGURACAO_PADRAO,
  FRASE_DE_AMOSTRA,
  NOME_ARQUIVO_PROGRESSO,
  chaveTemFormatoValido,
  paraErroApp,
} from '../src/shared/tipos';
import type {
  AudioFalado,
  ConfiguracaoApp,
  DecisaoConducao,
  EntradaConducao,
  ErroApp,
  EstadoChaves,
  InfoSistema,
  Modo,
  Motor,
  Progresso,
  ResultadoValidacaoChave,
  Transcrito,
  VozId,
} from '../src/shared/tipos';

// ---------------------------------------------------------------------------
// Ambiente
// ---------------------------------------------------------------------------

const EM_DESENVOLVIMENTO = process.env['ENTREVISTA_TWIN_DEV'] === '1';
const SIMULACAO = process.env['ENTREVISTA_TWIN_SIMULACAO'] === '1';
const XAI_BASE_URL = process.env['ENTREVISTA_TWIN_XAI_BASE_URL'];
const URL_DEV = 'http://localhost:5273';

const NOME_ARQUIVO_CHAVES = 'chaves.json';
const NOME_ARQUIVO_CONFIG = 'config.json';
const NOME_PASTA_PADRAO = 'Entrevista Twin';

const MOTORES: readonly Motor[] = ['claude', 'grok'];
const VOZES_VALIDAS: readonly VozId[] = ['helios', 'leo'];
const MODOS_VALIDOS: readonly Modo[] = ['voz', 'escrita'];

let janela: BrowserWindow | null = null;

// ---------------------------------------------------------------------------
// Erros
// ---------------------------------------------------------------------------

function erro(codigo: ErroApp['codigo'], mensagem: string, detalhe?: string): ErroApp {
  return { codigo, mensagem, ...(detalhe ? { detalhe } : {}) };
}

/** Falha de argumento vinda do renderer: nunca deveria acontecer, mas o IPC é uma fronteira. */
function erroDeArgumento(nome: string, esperado: string): ErroApp {
  return erro('desconhecido', `Argumento inválido no IPC: «${nome}» deveria ser ${esperado}.`);
}

function ehErroDeArquivoInexistente(e: unknown): boolean {
  return typeof e === 'object' && e !== null && 'code' in e && e.code === 'ENOENT';
}

/** Erros de disco viram `ErroApp 'arquivo'` com o caminho no detalhe. */
function erroDeDisco(e: unknown, mensagem: string): ErroApp {
  return erro('arquivo', mensagem, e instanceof Error ? e.message : String(e));
}

// ---------------------------------------------------------------------------
// Validação de argumentos do IPC
// ---------------------------------------------------------------------------

function exigirString(valor: unknown, nome: string): string {
  if (typeof valor !== 'string') throw erroDeArgumento(nome, 'texto');
  return valor;
}

function exigirTextoNaoVazio(valor: unknown, nome: string): string {
  const texto = exigirString(valor, nome);
  if (texto.trim() === '') throw erroDeArgumento(nome, 'texto não vazio');
  return texto;
}

function exigirObjeto(valor: unknown, nome: string): Record<string, unknown> {
  if (typeof valor !== 'object' || valor === null || Array.isArray(valor)) {
    throw erroDeArgumento(nome, 'objeto');
  }
  return valor as Record<string, unknown>;
}

function exigirMotor(valor: unknown, nome: string): Motor {
  if (valor === 'claude' || valor === 'grok') return valor;
  throw erroDeArgumento(nome, "'claude' ou 'grok'");
}

function exigirVoz(valor: unknown, nome: string): VozId {
  if (valor === 'helios' || valor === 'leo') return valor;
  throw erroDeArgumento(nome, "'helios' ou 'leo'");
}

function exigirModo(valor: unknown, nome: string): Modo {
  if (valor === 'voz' || valor === 'escrita') return valor;
  throw erroDeArgumento(nome, "'voz' ou 'escrita'");
}

/** Nome de arquivo simples: sem separadores nem `..` — a pasta é quem manda no caminho. */
function exigirNomeDeArquivo(valor: unknown, nome: string): string {
  const texto = exigirTextoNaoVazio(valor, nome);
  if (texto !== path.basename(texto) || texto === '.' || texto === '..') {
    throw erroDeArgumento(nome, 'nome de arquivo sem pasta');
  }
  return texto;
}

/** O IPC entrega `ArrayBuffer` ou `Uint8Array` conforme a versão; aceita os dois e normaliza. */
function exigirBytes(valor: unknown, nome: string): ArrayBuffer {
  if (valor instanceof ArrayBuffer) return valor;
  if (valor instanceof Uint8Array) {
    // Cópia explícita: `.buffer` pode ser SharedArrayBuffer e o tipo não fecha.
    const copia = new ArrayBuffer(valor.byteLength);
    new Uint8Array(copia).set(valor);
    return copia;
  }
  throw erroDeArgumento(nome, 'ArrayBuffer');
}

function exigirListaDeMotores(valor: unknown, nome: string): readonly Motor[] {
  if (!Array.isArray(valor)) throw erroDeArgumento(nome, 'lista de motores');
  return valor.map((m, i) => exigirMotor(m, `${nome}[${i}]`));
}

function exigirConfiguracao(valor: unknown, nome: string): ConfiguracaoApp {
  const o = exigirObjeto(valor, nome);
  const pasta = o['pasta'];
  if (pasta !== null && typeof pasta !== 'string') throw erroDeArgumento(`${nome}.pasta`, 'texto ou null');
  return { pasta, modo: exigirModo(o['modo'], `${nome}.modo`), voz: exigirVoz(o['voz'], `${nome}.voz`) };
}

/** Reconstrói a `EntradaConducao` campo a campo: nada do renderer passa sem conferência. */
function exigirEntradaConducao(valor: unknown, nome: string): EntradaConducao {
  const o = exigirObjeto(valor, nome);
  const sessao = o['sessao'];
  if (sessao !== 1 && sessao !== 2 && sessao !== 3) throw erroDeArgumento(`${nome}.sessao`, '1, 2 ou 3');
  const p = exigirObjeto(o['pergunta'], `${nome}.pergunta`);
  const numero = p['numero'];
  if (numero !== null && typeof numero !== 'number') throw erroDeArgumento(`${nome}.pergunta.numero`, 'número ou null');
  const tipo = p['tipo'];
  if (tipo !== 'aberta' && tipo !== 'multipla') throw erroDeArgumento(`${nome}.pergunta.tipo`, "'aberta' ou 'multipla'");
  const permite = p['permiteAprofundamento'];
  if (typeof permite !== 'boolean') throw erroDeArgumento(`${nome}.pergunta.permiteAprofundamento`, 'booleano');
  const forcar = o['forcar'];
  if (typeof forcar !== 'boolean') throw erroDeArgumento(`${nome}.forcar`, 'booleano');
  const opcoesBrutas = p['opcoes'];
  let opcoes: readonly string[] | undefined;
  if (opcoesBrutas !== undefined) {
    if (!Array.isArray(opcoesBrutas)) throw erroDeArgumento(`${nome}.pergunta.opcoes`, 'lista de textos');
    opcoes = opcoesBrutas.map((x, i) => exigirString(x, `${nome}.pergunta.opcoes[${i}]`));
  }
  return {
    sessao,
    blocoNome: exigirString(o['blocoNome'], `${nome}.blocoNome`),
    pergunta: {
      id: exigirTextoNaoVazio(p['id'], `${nome}.pergunta.id`),
      numero,
      texto: exigirString(p['texto'], `${nome}.pergunta.texto`),
      regra: exigirString(p['regra'], `${nome}.pergunta.regra`),
      tipo,
      ...(opcoes ? { opcoes } : {}),
      permiteAprofundamento: permite,
    },
    resposta: exigirString(o['resposta'], `${nome}.resposta`),
    forcar,
  };
}

// ---------------------------------------------------------------------------
// Disco
// ---------------------------------------------------------------------------

async function lerJson(caminho: string): Promise<unknown> {
  let texto: string;
  try {
    texto = await fs.readFile(caminho, 'utf-8');
  } catch (e) {
    if (ehErroDeArquivoInexistente(e)) return undefined;
    throw erroDeDisco(e, `Não foi possível ler ${path.basename(caminho)}.`);
  }
  try {
    return JSON.parse(texto) as unknown;
  } catch {
    // Arquivo corrompido: quem chama decide o que fazer com `undefined`.
    return undefined;
  }
}

/** Escrita atômica: grava num temporário e renomeia por cima. */
async function gravarJson(caminho: string, valor: unknown): Promise<void> {
  const temporario = `${caminho}.${process.pid}.tmp`;
  try {
    await fs.mkdir(path.dirname(caminho), { recursive: true });
    await fs.writeFile(temporario, JSON.stringify(valor, null, 2) + '\n', 'utf-8');
    await fs.rename(temporario, caminho);
  } catch (e) {
    await fs.rm(temporario, { force: true }).catch(() => undefined);
    throw erroDeDisco(e, `Não foi possível gravar ${path.basename(caminho)}.`);
  }
}

const caminhoEmUserData = (nome: string): string => path.join(app.getPath('userData'), nome);

// ---------------------------------------------------------------------------
// Chaves (safeStorage → base64 em <userData>/chaves.json)
// ---------------------------------------------------------------------------

type ChavesCifradas = Partial<Record<Motor, string>>;

async function lerChavesCifradas(): Promise<ChavesCifradas> {
  const json = await lerJson(caminhoEmUserData(NOME_ARQUIVO_CHAVES));
  if (typeof json !== 'object' || json === null) return {};
  const o = json as Record<string, unknown>;
  const resultado: { claude?: string; grok?: string } = {};
  for (const motor of MOTORES) {
    const valor = o[motor];
    if (typeof valor === 'string' && valor !== '') resultado[motor] = valor;
  }
  return resultado;
}

function estadoDasChaves(cifradas: ChavesCifradas): EstadoChaves {
  return {
    claude: cifradas.claude ? 'guardada' : 'ausente',
    grok: cifradas.grok ? 'guardada' : 'ausente',
  };
}

function exigirKeychain(): void {
  if (!safeStorage.isEncryptionAvailable()) {
    throw erro(
      'desconhecido',
      'O keychain do sistema não está disponível; não é possível guardar nem ler chaves com segurança nesta máquina.',
    );
  }
}

/** A chave em claro só existe no retorno desta função, dentro do handler que a chamou. */
async function chaveEmClaro(motor: Motor): Promise<string | null> {
  const cifradas = await lerChavesCifradas();
  const cifrada = cifradas[motor];
  if (!cifrada) return null;
  exigirKeychain();
  try {
    return safeStorage.decryptString(Buffer.from(cifrada, 'base64'));
  } catch (e) {
    throw erro(
      'desconhecido',
      `Não foi possível descriptografar a chave do ${motor}; guarde-a de novo.`,
      e instanceof Error ? e.message : undefined,
    );
  }
}

async function guardarChave(motor: Motor, chave: string): Promise<EstadoChaves> {
  const limpa = chave.trim();
  if (!chaveTemFormatoValido(motor, limpa)) {
    throw erro('chave-invalida', `A chave do ${motor} não tem o formato esperado.`);
  }
  exigirKeychain();
  const cifradas = await lerChavesCifradas();
  const novas: ChavesCifradas = { ...cifradas, [motor]: safeStorage.encryptString(limpa).toString('base64') };
  await gravarJson(caminhoEmUserData(NOME_ARQUIVO_CHAVES), novas);
  return estadoDasChaves(novas);
}

async function removerChave(motor: Motor): Promise<EstadoChaves> {
  const cifradas = await lerChavesCifradas();
  const novas: { claude?: string; grok?: string } = { ...cifradas };
  delete novas[motor];
  await gravarJson(caminhoEmUserData(NOME_ARQUIVO_CHAVES), novas);
  return estadoDasChaves(novas);
}

async function validarChave(motor: Motor): Promise<ResultadoValidacaoChave> {
  if (SIMULACAO) {
    // Simulação é sem rede por definição: não se confirma nada na API.
    return { motor, ok: true, mensagem: 'Simulação: chave não verificada na API.' };
  }
  const chave = await chaveEmClaro(motor);
  if (chave === null) return { motor, ok: false, mensagem: 'Nenhuma chave guardada.' };
  return motor === 'claude'
    ? validarChaveClaude(chave)
    : validarChaveGrok(chave, XAI_BASE_URL ? { baseUrl: XAI_BASE_URL } : {});
}

// ---------------------------------------------------------------------------
// Configuração (<userData>/config.json)
// ---------------------------------------------------------------------------

async function lerConfiguracao(): Promise<ConfiguracaoApp> {
  const json = await lerJson(caminhoEmUserData(NOME_ARQUIVO_CONFIG));
  if (typeof json !== 'object' || json === null) return CONFIGURACAO_PADRAO;
  const o = json as Record<string, unknown>;
  const pasta = o['pasta'];
  const modo = o['modo'];
  const voz = o['voz'];
  return {
    pasta: typeof pasta === 'string' && pasta !== '' ? pasta : null,
    modo: MODOS_VALIDOS.find((m) => m === modo) ?? CONFIGURACAO_PADRAO.modo,
    voz: VOZES_VALIDAS.find((v) => v === voz) ?? CONFIGURACAO_PADRAO.voz,
  };
}

// ---------------------------------------------------------------------------
// Destino, progresso e transcrição (pasta escolhida pelo usuário)
// ---------------------------------------------------------------------------

const pastaPadrao = (): string => path.join(app.getPath('documents'), NOME_PASTA_PADRAO);

async function escolherPasta(atual: string | null): Promise<string | null> {
  const opcoes: OpenDialogOptions = {
    title: 'Pasta de destino das transcrições',
    defaultPath: atual ?? pastaPadrao(),
    properties: ['openDirectory', 'createDirectory'],
  };
  const resultado = janela ? await dialog.showOpenDialog(janela, opcoes) : await dialog.showOpenDialog(opcoes);
  if (resultado.canceled) return null;
  return resultado.filePaths[0] ?? null;
}

async function lerProgresso(pasta: string, agora: string): Promise<Progresso> {
  const json = await lerJson(path.join(pasta, NOME_ARQUIVO_PROGRESSO));
  if (json === undefined) return progressoInicial(agora);
  return interpretarProgresso(json, agora);
}

async function anexarTranscricao(pasta: string, arquivo: string, texto: string): Promise<void> {
  try {
    await fs.mkdir(pasta, { recursive: true });
    await fs.appendFile(path.join(pasta, arquivo), texto, 'utf-8');
  } catch (e) {
    throw erroDeDisco(e, `Não foi possível gravar em ${arquivo}.`);
  }
}

async function tamanhoDaTranscricao(pasta: string, arquivo: string): Promise<number> {
  try {
    const info = await fs.stat(path.join(pasta, arquivo));
    return info.size;
  } catch (e) {
    if (ehErroDeArquivoInexistente(e)) return 0;
    throw erroDeDisco(e, `Não foi possível ler ${arquivo}.`);
  }
}

// ---------------------------------------------------------------------------
// Serviços: voz e condução (reais ou simulados)
// ---------------------------------------------------------------------------

/**
 * Contexto da voz simulada. O contrato do IPC não diz qual pergunta está em
 * curso, então o main deduz pelo texto lido em `voz:falar`: se é uma pergunta
 * do roteiro, passa a ser a atual; se é outra fala (aprofundamento), a
 * próxima transcrição responde ao aprofundamento. A frase de amostra e a
 * despedida não mexem no contexto.
 */
const ID_POR_TEXTO_DE_PERGUNTA: ReadonlyMap<string, string> = new Map(
  [...PERGUNTAS_NUMERADAS, FECHAMENTO].map((p) => [p.texto.trim(), p.id]),
);

const DESPEDIDAS: readonly string[] = [
  'Obrigada. Esta sessão está encerrada.',
  'Obrigada. A entrevista está encerrada.',
];

const contextoSimulado = { perguntaId: null as string | null, aprofundamentoAberto: false };

function registrarFalaSimulada(texto: string): void {
  const limpo = texto.trim();
  const id = ID_POR_TEXTO_DE_PERGUNTA.get(limpo);
  if (id !== undefined) {
    contextoSimulado.perguntaId = id;
    contextoSimulado.aprofundamentoAberto = false;
    return;
  }
  if (limpo === FRASE_DE_AMOSTRA || DESPEDIDAS.includes(limpo)) return;
  if (contextoSimulado.perguntaId !== null) contextoSimulado.aprofundamentoAberto = true;
}

const vozDeSimulacao = vozSimulada({
  perguntaAtual: () => contextoSimulado.perguntaId,
  aprofundamentoAberto: () => contextoSimulado.aprofundamentoAberto,
});

const condutorDeSimulacao = condutorSimulado();

async function falar(texto: string, voz: VozId): Promise<AudioFalado> {
  if (SIMULACAO) {
    registrarFalaSimulada(texto);
    return vozDeSimulacao.falar(texto, voz);
  }
  const chave = await chaveEmClaro('grok');
  if (chave === null) throw erro('chave-ausente', 'Guarde a chave do Grok para usar o modo voz.');
  return criarVozGrok({ chave, ...(XAI_BASE_URL ? { baseUrl: XAI_BASE_URL } : {}) }).falar(texto, voz);
}

async function transcrever(audio: ArrayBuffer, mime: string): Promise<Transcrito> {
  if (SIMULACAO) return vozDeSimulacao.transcrever(audio, mime);
  const chave = await chaveEmClaro('grok');
  if (chave === null) throw erro('chave-ausente', 'Guarde a chave do Grok para usar o modo voz.');
  return criarVozGrok({ chave, ...(XAI_BASE_URL ? { baseUrl: XAI_BASE_URL } : {}) }).transcrever(audio, mime);
}

async function decidir(entrada: EntradaConducao): Promise<DecisaoConducao> {
  if (SIMULACAO) return condutorDeSimulacao.decidir(entrada);
  const chave = await chaveEmClaro('claude');
  if (chave === null) throw erro('chave-ausente', 'Guarde a chave do Claude para conduzir a entrevista.');
  return criarCondutor({ chave }).decidir(entrada);
}

// ---------------------------------------------------------------------------
// Sistema
// ---------------------------------------------------------------------------

function infoDoSistema(): InfoSistema {
  return {
    plataforma: 'electron',
    simulada: SIMULACAO,
    versaoApp: app.getVersion(),
    so: `${process.platform} ${os.release()}`,
  };
}

async function abrirPasta(pasta: string): Promise<void> {
  const falha = await shell.openPath(pasta);
  if (falha !== '') throw erro('arquivo', 'Não foi possível abrir a pasta.', falha);
}

// ---------------------------------------------------------------------------
// IPC
// ---------------------------------------------------------------------------

type Handler = (...args: readonly unknown[]) => Promise<unknown>;

/**
 * Registra um canal com a convenção de erro do cabeçalho: qualquer falha sai
 * como `Error` cuja mensagem é o JSON de um `ErroApp`.
 */
function registrar(canal: string, handler: Handler): void {
  ipcMain.handle(canal, async (_evento, ...args: unknown[]) => {
    try {
      return await handler(...args);
    } catch (e) {
      const erroApp = paraErroApp(e);
      console.error(`[ipc] ${canal}: ${erroApp.codigo} — ${erroApp.mensagem}`);
      throw new Error(JSON.stringify(erroApp));
    }
  });
}

function registrarCanais(): void {
  registrar(CANAIS.chavesEstado, async () => estadoDasChaves(await lerChavesCifradas()));
  registrar(CANAIS.chavesGuardar, (motor, chave) =>
    guardarChave(exigirMotor(motor, 'motor'), exigirString(chave, 'chave')),
  );
  registrar(CANAIS.chavesRemover, (motor) => removerChave(exigirMotor(motor, 'motor')));
  registrar(CANAIS.chavesValidar, (motores) =>
    Promise.all(exigirListaDeMotores(motores, 'motores').map((m) => validarChave(m))),
  );

  registrar(CANAIS.configLer, () => lerConfiguracao());
  registrar(CANAIS.configGravar, (config) =>
    gravarJson(caminhoEmUserData(NOME_ARQUIVO_CONFIG), exigirConfiguracao(config, 'config')),
  );

  registrar(CANAIS.destinoPadrao, async () => pastaPadrao());
  registrar(CANAIS.destinoEscolher, (atual) =>
    escolherPasta(atual === null || atual === undefined ? null : exigirString(atual, 'atual')),
  );

  registrar(CANAIS.progressoLer, (pasta) =>
    lerProgresso(exigirTextoNaoVazio(pasta, 'pasta'), new Date().toISOString()),
  );
  registrar(CANAIS.progressoGravar, (pasta, progresso) =>
    gravarJson(
      path.join(exigirTextoNaoVazio(pasta, 'pasta'), NOME_ARQUIVO_PROGRESSO),
      exigirObjeto(progresso, 'progresso'),
    ),
  );

  registrar(CANAIS.transcricaoAnexar, (pasta, arquivo, texto) =>
    anexarTranscricao(
      exigirTextoNaoVazio(pasta, 'pasta'),
      exigirNomeDeArquivo(arquivo, 'arquivo'),
      exigirString(texto, 'texto'),
    ),
  );
  registrar(CANAIS.transcricaoTamanho, (pasta, arquivo) =>
    tamanhoDaTranscricao(exigirTextoNaoVazio(pasta, 'pasta'), exigirNomeDeArquivo(arquivo, 'arquivo')),
  );

  registrar(CANAIS.vozFalar, (texto, voz) => falar(exigirTextoNaoVazio(texto, 'texto'), exigirVoz(voz, 'voz')));
  registrar(CANAIS.vozTranscrever, (audio, mime) =>
    transcrever(exigirBytes(audio, 'audio'), exigirTextoNaoVazio(mime, 'mime')),
  );

  registrar(CANAIS.conducaoDecidir, (entrada) => decidir(exigirEntradaConducao(entrada, 'entrada')));

  registrar(CANAIS.sistemaInfo, async () => infoDoSistema());
  registrar(CANAIS.sistemaAbrirPasta, (pasta) => abrirPasta(exigirTextoNaoVazio(pasta, 'pasta')));
  registrar(CANAIS.sistemaFechar, async () => {
    app.quit();
  });
}

// ---------------------------------------------------------------------------
// Janela, permissões e menu
// ---------------------------------------------------------------------------

function configurarPermissoes(): void {
  // Só o microfone. Qualquer outra permissão web é negada sem perguntar.
  session.defaultSession.setPermissionRequestHandler((_wc, permissao, callback) => {
    callback(permissao === 'media');
  });
  session.defaultSession.setPermissionCheckHandler((_wc, permissao) => permissao === 'media');
}

function configurarMenu(): void {
  if (EM_DESENVOLVIMENTO) return; // menu padrão do Electron, com DevTools e recarga
  if (process.platform !== 'darwin') {
    Menu.setApplicationMenu(null);
    return;
  }
  // No macOS sem menu não há copiar/colar nem Cmd+Q: fica o mínimo.
  const modelo: MenuItemConstructorOptions[] = [
    { role: 'appMenu' },
    { label: 'Editar', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
    { role: 'windowMenu' },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(modelo));
}

function pedirMicrofoneNoMac(): void {
  if (process.platform !== 'darwin') return;
  // Não bloqueia o arranque: se negado, o gravador do renderer falha com ErroApp 'microfone'.
  systemPreferences
    .askForMediaAccess('microphone')
    .then((concedido) => console.log(`[microfone] acesso ${concedido ? 'concedido' : 'negado'}`))
    .catch((e: unknown) => console.error('[microfone] falha ao pedir acesso', e));
}

function criarJanela(): void {
  janela = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: '#16181b',
    title: 'Entrevista Twin',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // A primeira pergunta toca logo depois de a tela montar, sem clique
      // intermediário; sem isto o Chromium bloquearia a reprodução.
      autoplayPolicy: 'no-user-gesture-required',
    },
  });

  janela.once('ready-to-show', () => janela?.show());
  janela.on('closed', () => {
    janela = null;
  });

  // O renderer não abre janelas nem navega para fora: só o próprio app.
  janela.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  janela.webContents.on('will-navigate', (evento, url) => {
    if (!EM_DESENVOLVIMENTO || !url.startsWith(URL_DEV)) evento.preventDefault();
  });

  if (EM_DESENVOLVIMENTO) {
    void janela.loadURL(URL_DEV);
  } else {
    void janela.loadFile(path.join(__dirname, '..', '..', 'renderer', 'index.html'));
  }
}

app.whenReady().then(() => {
  configurarPermissoes();
  configurarMenu();
  registrarCanais();
  pedirMicrofoneNoMac();
  criarJanela();
  if (SIMULACAO) console.log('[app] modo simulação: voz e condução sem rede');

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) criarJanela();
  });
});

// App de janela única: fechar a janela encerra o app em qualquer sistema.
app.on('window-all-closed', () => {
  app.quit();
});
