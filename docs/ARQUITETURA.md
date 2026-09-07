# Entrevista Twin — arquitetura da implementação

Este documento fixa os contratos entre os módulos do diretório `app/`. Ele
complementa o `HANDOFF.md` (decisões travadas) e o `BRIEF-v2.md` (produto).
Quem implementar ou revisar um módulo lê primeiro este arquivo, depois o
código dos contratos citados aqui.

Data: 2026-09-06.

---

## 1. Mapa de diretórios

```
app/
  index.html                  CSP de produção: connect-src 'none' (renderer não fala com a rede)
  vite.config.ts              renderer (Vite + React); plugin que afrouxa a CSP só em `npm run dev`
  vitest.config.ts            testes puros (node), `src/**/*.test.ts`
  tsconfig.json               renderer: inclui `src/` inteiro, lib DOM, types só `vite/client`
  electron/tsconfig.json      main + preload: inclui electron/, src/roteiro, src/engine, src/shared, src/services
  electron/main.ts            janela, IPC, safeStorage, disco, clientes Claude e Grok
  electron/preload.ts         contextBridge → window.entrevistaTwin (mesma forma de `Plataforma`)
  src/main.tsx                raiz React
  src/App.tsx                 roteador de telas: setup → sessao → fim
  src/shared/tipos.ts         tipos, constantes, canais IPC, validadores (puro)  ← CONTRATO
  src/roteiro/roteiro.ts      roteiro v1 (pronto)                                ← CONTRATO
  src/engine/sessao.ts        máquina de estados pura da sessão (reduzir + efeitos)
  src/engine/transcricao.ts   Markdown da transcrição, nome do arquivo (puro)
  src/engine/progresso.ts     progresso.json entre sessões (puro)
  src/engine/*.test.ts        testes do motor
  src/services/claude.ts      decisão de aprofundamento (roda no main)
  src/services/grok.ts        TTS e transcrição (roda no main; endpoint configurável)
  src/services/simulacao.ts   respostas fictícias e condução simulada (puro; roda em qualquer lado)
  src/platform/plataforma.ts  interface `Plataforma`                             ← CONTRATO
  src/platform/electron.ts    implementação via window.entrevistaTwin
  src/platform/navegador.ts   implementação para `npm run dev` (localStorage + simulação + speechSynthesis)
  src/platform/index.ts       escolhe a implementação
  src/audio/reprodutor.ts     toca ArrayBuffer de áudio (Blob URL)
  src/audio/gravador.ts       microfone → WAV 16 kHz mono; detecção de silêncio
  src/hooks/useSessao.ts      controlador: liga motor, plataforma e áudio
  src/screens/Setup.tsx       tela 1
  src/screens/Sessao.tsx      tela 2
  src/screens/FimDeSessao.tsx tela 3
  src/components/Icones.tsx   ícones SVG (pronto)                                ← CONTRATO
  src/components/*.tsx        componentes de tela
  src/styles/global.css       tokens, fontes empacotadas, primitivos (pronto)    ← CONTRATO
```

Regras de dependência (violá-las quebra o typecheck ou o isolamento de segurança):

- `shared/`, `roteiro/`, `engine/`, `services/simulacao.ts`: **puros**. Sem React, sem DOM, sem Node.
- `services/claude.ts` e `services/grok.ts`: só APIs web-padrão (`fetch`, `FormData`, `Blob`,
  `Uint8Array`) e o SDK da Anthropic. Nada de `Buffer`, `process`, `fs`. Eles são
  typecheckados pelos dois `tsconfig`, embora só executem no main.
- `electron/`: pode usar Node e Electron. É o único lugar onde uma chave de API existe em claro.
- `screens/`, `components/`, `hooks/`, `audio/`, `platform/*.ts` (exceto a interface): renderer.
  Falam com o mundo **só** pela interface `Plataforma`.

---

## 2. Fluxo geral

```
Setup ──INICIAR/RETOMAR/CONTINUAR──▶ Sessão ──encerrar──▶ Fim de sessão ──emendar──▶ Sessão (próxima)
  ▲                                                             │ fechar o app
  └────────────── reabrir o app: lê progresso.json ◀────────────┘
```

- **Três sessões, na ordem.** `progresso.json` (na pasta de destino) diz o estado de cada uma.
  O botão principal do setup vem de `engine/progresso.ts → rotuloDoBotao()`:
  `INICIAR SESSÃO 1` / `RETOMAR SESSÃO 2` (incompleta) / `CONTINUAR — SESSÃO 3` (anterior concluída) /
  `ENTREVISTA CONCLUÍDA` (tudo feito; botão desabilitado).
- **Retomada de sessão incompleta** recomeça do bloco onde parou, **no mesmo arquivo** (append), com um
  marcador de retomada. As perguntas dos blocos anteriores àquele não são refeitas.
- **Modo voz / escrita:** livre escolha no setup e alternância a qualquer momento da sessão. Voz exige a
  chave do Grok; escrita exige só a do Claude. O modo escrita é recurso de primeira classe, não fallback.

---

## 3. Motor da sessão (`src/engine/sessao.ts`)

Máquina de estados **pura**: `reduzir(estado, acao) → { estado, efeitos }`. O controlador
(`hooks/useSessao.ts`) executa os efeitos (falar, ouvir, decidir, anexar ao arquivo…) e devolve o
resultado como nova ação. Nenhum `Promise`, `Date.now()` ou I/O dentro do motor: o instante e os
segundos vêm nas ações.

### 3.1 Estado

```ts
export type Fase = 'ociosa' | 'falando' | 'ouvindo' | 'transcrevendo' | 'decidindo' | 'pausada';

export interface EstadoSessao {
  readonly sessao: NumeroSessao;
  readonly modo: Modo;
  readonly voz: VozId;
  readonly fila: readonly Pergunta[];       // perguntasDaSessao(sessao), possivelmente cortada na retomada
  readonly indice: number;                   // posição na fila
  readonly visitadas: readonly string[];     // ids de perguntas já lidas
  readonly respondidas: readonly string[];   // ids com resposta registrada
  readonly aprofundadas: readonly string[];  // ids em que o (único) aprofundamento foi usado
  readonly aprofundamentoAberto: { readonly perguntaId: string; readonly texto: string } | null;
  readonly ultimaDecisao: DecisaoConducao | null;   // para o card "Claude"
  readonly fase: Fase;
  readonly pausada: boolean;
  readonly encerrada: boolean;
  readonly linhas: readonly LinhaTranscricao[];
  readonly segundos: number;                 // decorridos nesta execução
  readonly erro: ErroApp | null;             // último erro exibível; some no próximo avanço
  readonly contadorLinhas: number;           // para gerar ids l0001…
}
```

### 3.2 Ações

```ts
export type Acao =
  | { tipo: 'perguntar'; indice: number; instante: string }        // lê a pergunta `indice` (marca visitada)
  | { tipo: 'leituraConcluida' }                                    // TTS terminou → 'ouvindo' (voz) / 'ociosa' (escrita)
  | { tipo: 'capturaConcluida' }                                    // microfone parou → 'transcrevendo'
  | { tipo: 'respostaRegistrada'; texto: string; origem: 'voz' | 'escrita'; instante: string }
  | { tipo: 'decisaoConducao'; decisao: DecisaoConducao; instante: string }
  | { tipo: 'aprofundar'; instante: string }                        // botão: pede decisão forçada
  | { tipo: 'pausar' } | { tipo: 'retomar'; instante: string }
  | { tipo: 'anterior'; instante: string } | { tipo: 'proxima'; instante: string }
  | { tipo: 'irParaBloco'; blocoId: string; instante: string }      // chip: só blocos já iniciados
  | { tipo: 'alternarModo'; modo: Modo }
  | { tipo: 'tique' }                                               // +1 s quando não pausada
  | { tipo: 'encerrar'; instante: string }                          // fim da sessão (completa ou não)
  | { tipo: 'erro'; erro: ErroApp }                                 // volta a 'ociosa' e guarda o erro
  | { tipo: 'limparErro' };
```

### 3.3 Efeitos

```ts
export type Efeito =
  | { tipo: 'falar'; texto: string }                 // voz: TTS e, ao terminar, despachar 'leituraConcluida'
  | { tipo: 'ouvir' }                                // voz: abrir microfone; ao parar, 'capturaConcluida' → transcrever → 'respostaRegistrada'
  | { tipo: 'pararAudio' }                           // interromper TTS/microfone (pausa, navegação, troca de modo)
  | { tipo: 'decidir'; entrada: EntradaConducao }    // Claude → 'decisaoConducao'
  | { tipo: 'anexarLinha'; linha: LinhaTranscricao } // gravar no arquivo (usar transcricao.trechoDaLinha)
  | { tipo: 'gravarProgresso' }                      // sessão incompleta: atualizar progresso.json
  | { tipo: 'finalizar'; concluida: boolean };       // gravar rodapé + progresso; ir para a tela de fim
```

### 3.4 Regras que o motor garante (e os testes cobrem)

1. **Uma pergunta de aprofundamento por resposta.** `aprofundar` só se a pergunta atual está em
   `respondidas`, não está em `aprofundadas`, não há `aprofundamentoAberto`, `permiteAprofundamento`
   é `true` e a fase é `'ociosa'`. Ao registrar a decisão com `aprofundar: true`, o id vai para
   `aprofundadas` e a pergunta de aprofundamento entra como linha da entrevistadora (`origem:
   'aprofundamento'`); em voz emite `falar`; em escrita fica `'ociosa'` com `aprofundamentoAberto`.
2. **Após cada resposta à pergunta principal**, o motor emite `decidir` (fase `'decidindo'`) — salvo
   quando a pergunta não permite aprofundamento, caso em que registra `ultimaDecisao` com `origem:
   'regra'` e fica `'ociosa'`. A resposta ao aprofundamento **não** gera nova decisão.
3. **Sem pular bloco.** `proxima` avança um índice; se a pergunta ainda não foi visitada, é lida.
   `irParaBloco` só aceita blocos com ao menos uma pergunta visitada; leva à primeira pergunta do bloco
   sem relê-la. `anterior` volta um índice sem reler.
4. **Pausa.** `pausar` → `pausada: true`, fase `'pausada'`, efeito `pararAudio`. `retomar` → se a
   pergunta atual ainda não tem resposta registrada e o modo é voz, relê a pergunta (efeito `falar`);
   senão fica `'ociosa'`. O relógio (`tique`) não conta em pausa.
5. **Troca de modo** a qualquer momento: `pararAudio`; fase `'ociosa'`; `aprofundamentoAberto`
   preservado. Se passou para voz e a pergunta atual não tem resposta, relê a pergunta.
6. **Encerrar.** Marca `encerrada`. `concluida = todas as perguntas da fila em respondidas`. Se
   concluída, acrescenta a fala de despedida (`origem: 'despedida'`): sessão 3 → "Obrigada. A
   entrevista está encerrada."; sessões 1 e 2 → "Obrigada. Esta sessão está encerrada." Em voz emite
   `falar` antes de `finalizar`. Sempre emite `finalizar`.
7. **Múltipla escolha.** Em escrita o texto registrado é `"C — <opção> <comentário opcional>"`
   (montado pela tela). Em voz registra-se a transcrição literal.
8. **Retomada** (`criarSessao({ retomarDoBlocoId })`): a fila começa na primeira pergunta do bloco
   indicado; `visitadas`/`respondidas` vazias; o controlador acrescenta o marcador ao arquivo.
9. Toda linha nova passa por `anexarLinha` na mesma transição em que entra em `linhas`.

### 3.5 API pública

```ts
export function criarSessao(p: {
  sessao: NumeroSessao; modo: Modo; voz: VozId; retomarDoBlocoId?: string;
}): EstadoSessao;
export function reduzir(estado: EstadoSessao, acao: Acao): { estado: EstadoSessao; efeitos: readonly Efeito[] };
// seletores
export function perguntaAtual(e: EstadoSessao): Pergunta;
export function blocoAtual(e: EstadoSessao): Bloco;
export function ehUltima(e: EstadoSessao): boolean;
export function podeAprofundar(e: EstadoSessao): boolean;
export function rotuloAprofundar(e: EstadoSessao): 'Aprofundar' | 'Aprofundamento usado' | 'Sem aprofundamento';
export function progressoDaSessao(e: EstadoSessao): number;  // 0..1, perguntas respondidas / fila
export function chipsDeBlocos(e: EstadoSessao): readonly { bloco: Bloco; estado: 'concluido' | 'atual' | 'pendente'; navegavel: boolean }[];
export function rotuloPergunta(e: EstadoSessao): string;     // "Pergunta 12 de 26" | "Fechamento · fora da contagem"
export function rotuloFase(e: EstadoSessao): { texto: string; cor: 'azul' | 'ambar' | 'neutra' };
```

---

## 4. Transcrição (`src/engine/transcricao.ts`)

- `nomeDoArquivoDaSessao(n, data: Date)` → `sessao-1-quem-e-2026-09-06.md` (slug de `SESSOES`).
- `cabecalhoDaSessao({ sessao, modo, voz, inicio: string, arquivo })` → Markdown:

```markdown
# Entrevista Twin — Sessão 1 de 3: Quem é

- Roteiro: v1
- Início: 2026-09-06T14:03:11-03:00
- Modo inicial: voz (Helios)
- Arquivo: sessao-1-quem-e-2026-09-06.md
- Blocos: 1 Quem é · 2 Trajetória · 3 Voz e escrita

---
```

- `marcadorDeRetomada(instante, blocoNome)` → `\n> Sessão retomada em … a partir do bloco «Trajetória».\n`
- `trechoDaLinha(linhasAnteriores, linha)` → o que anexar ao arquivo. Emite `## Bloco N · Nome` na
  primeira linha de um bloco e `### Pergunta N — texto` (ou `### Fechamento — texto`) na primeira
  linha de uma pergunta; depois a fala:
  `**[00:06] Entrevistadora:** …` / `**[00:31] Entrevistadora (aprofundamento):** …` /
  `**[01:16] Cliente (voz):** …` / `**[01:16] Cliente (escrita):** …`, cada fala seguida de linha em branco.
- `rodapeDaSessao({ concluida, instante, segundos, perguntasRespondidas, totalPerguntas })` →
  `---` + `- Encerrada em …` + `- Duração: hh:mm:ss` + `- Perguntas respondidas: 9 de 10` +
  `- Situação: concluída | incompleta (recomeça do bloco «…»)`.

Sem resumo, sem análise, sem nada além do que foi dito.

---

## 5. Progresso (`src/engine/progresso.ts`)

- `progressoInicial(agora)` — as três sessões `pendente`.
- `interpretarProgresso(json: unknown, agora)` — valida com zod; se inválido, devolve o inicial.
- `proximaSessao(p)` → `{ numero, acao: 'iniciar' | 'retomar' | 'continuar' } | null` (null = tudo concluído).
  A ordem é obrigatória: a sessão 2 só depois da 1 concluída, etc.
- `rotuloDoBotao(p)` → os quatro rótulos do §2.
- `aoIniciar(p, numero, { arquivo, modo, agora })` → marca `incompleta` com `blocoAtual` = primeiro bloco.
- `aoAvancar(p, numero, { blocoAtual, perguntasRespondidas, agora })` → atualiza a incompleta.
- `aoEncerrar(p, numero, { concluida, blocoAtual, perguntasRespondidas, agora })` → `concluida` ou `incompleta`.
- `resumoParaSetup(p)` → por sessão: `{ numero, nome, estado, data?: string }` para o roteiro agrupado.

---

## 6. Serviços (rodam no processo principal)

### 6.1 `services/claude.ts`

```ts
export function criarCondutor(opcoes: { chave: string; modelo?: string; fetch?: typeof fetch }): { decidir(entrada: EntradaConducao): Promise<DecisaoConducao> };
export function validarChaveClaude(chave: string): Promise<ResultadoValidacaoChave>;  // client.models.list({ limit: 1 })
export const SCHEMA_DECISAO: z.ZodType<{ aprofundar: boolean; pergunta: string | null; motivo: string }>;
export function montarSistema(): string;                     // prompt fixo (cacheável)
export function montarPedido(entrada: EntradaConducao): string;
```

- Modelo `claude-opus-5`; `client.messages.parse({ model, max_tokens: 1024, system, messages,
  output_config: { effort: 'low', format: zodOutputFormat(SCHEMA_DECISAO) } })`. Não enviar `thinking`
  (o padrão do Opus 5 já é adaptativo). `system` como bloco com `cache_control: { type: 'ephemeral' }`.
- `stop_reason === 'refusal'` → `{ aprofundar: false, pergunta: null, motivo: 'O modelo recusou avaliar esta resposta.', origem: 'recusa' }`.
- Qualquer erro (`Anthropic.APIError` ou rede) → `origem: 'erro'`, `motivo` curto e legível. Nunca lança.
- `parsed_output` nulo → tratar como erro.
- Se `entrada.pergunta.permiteAprofundamento === false` → nem chama: `origem: 'regra'`.
- Se `entrada.forcar` → a saída deve trazer `aprofundar: true` e uma pergunta; se o modelo voltar sem
  pergunta, usar a genérica "Pode me dar um exemplo concreto disso?" com `origem: 'claude'`.
- Prompt: regra de condução geral (`REGRA_DE_CONDUCAO`), a regra da pergunta, "não opinar, não
  resumir, não elogiar, uma única pergunta, sempre pedindo exemplo concreto, português do Brasil,
  no máximo 25 palavras, sem preâmbulo, sem citar o nome do cliente".

### 6.2 `services/grok.ts` (**provisório até uma chamada real passar**)

Base URL padrão `https://api.x.ai/v1`, configurável por opção e pela variável de ambiente
`ENTREVISTA_TWIN_XAI_BASE_URL` (lida no main, não aqui).

- TTS: `POST {base}/tts`, `Authorization: Bearer <chave>`, JSON
  `{ text, voice_id: 'helios' | 'leo', language: 'pt', output_format: { codec: 'mp3', sample_rate: 44100, bit_rate: 192000 } }`.
  Resposta: bytes de áudio (`audio/mpeg`). Devolver `{ audio: ArrayBuffer, mime }`.
- STT: `POST {base}/stt`, multipart: campos `language=pt`, `format=true` e, **por último**, `file`
  (Blob, nome `resposta.wav`, tipo `audio/wav`). Resposta JSON `{ text, language?, duration?, words? }`.
  Devolver `{ texto: text.trim(), duracao }`.
- Validação de chave: `GET {base}/models` com o bearer; 200 → ok; 401/403 → "chave recusada";
  outros → mensagem com o status.
- Erros: lançar `ErroApp` (`codigo: 'api' | 'rede' | 'chave-invalida'`) com mensagem curta.
- Exportar funções puras testáveis: `montarCorpoTts(texto, voz)`, `interpretarRespostaStt(json)`.

### 6.3 `services/simulacao.ts` (puro)

- `RESPOSTAS_FICTICIAS: Record<perguntaId, { resposta: string; aprofundamento?: string; respostaAoAprofundamento?: string; escolha?: number }>` —
  as 27 do protótipo (cliente fictícia, advogada de empresas de família), chaveadas por `q01…q26` e `fechamento`.
- `condutorSimulado()` → `{ decidir }`: aprofunda quando existe `aprofundamento` e a resposta tem
  menos de 160 caracteres ou quando `forcar`; `origem: 'simulacao'`.
- `vozSimulada()` → `{ falar(texto, voz): Promise<AudioFalado>; transcrever(...) }`: `falar` devolve um
  WAV mudo curto (proporcional ao tamanho do texto, ~60 ms por palavra, máx. 6 s) gerado em memória;
  `transcrever` devolve a resposta fictícia da **última pergunta lida** — para isso `vozSimulada`
  recebe `{ perguntaAtual(): string | null; aprofundamentoAberto(): boolean }`.
- `respostaFicticia(perguntaId, aoAprofundamento)` para o botão "Preencher com exemplo" do modo escrita.

---

## 7. Electron (`electron/main.ts`, `electron/preload.ts`)

- `BrowserWindow` 1280×800 (mín. 1100×700), `backgroundColor '#16181b'`, `contextIsolation: true`,
  `nodeIntegration: false`, `sandbox: true`, `webPreferences.preload`. Menu mínimo (Editar/Visualizar em
  desenvolvimento). `session.setPermissionRequestHandler` permite só `media` (microfone). No macOS,
  `systemPreferences.askForMediaAccess('microphone')` antes da primeira captura.
- Produção: `loadFile(path.join(__dirname, '../../renderer/index.html'))`. Desenvolvimento
  (`ENTREVISTA_TWIN_DEV=1`): `loadURL('http://localhost:5273')`.
- Chaves: `safeStorage.encryptString` → base64 em `<userData>/chaves.json` (`{ claude?: string, grok?: string }`).
  Se `safeStorage.isEncryptionAvailable()` for falso, recusar guardar e explicar. Descriptografar só na hora
  de usar; nunca enviar ao renderer.
- Config (`<userData>/config.json`): `ConfiguracaoApp`.
- Destino padrão: `path.join(app.getPath('documents'), 'Entrevista Twin')`. `dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] })`.
- Transcrição: `fs.promises.appendFile` com `mkdir -p` antes. Progresso: escrita atômica (`tmp` + `rename`).
- Serviços: `ENTREVISTA_TWIN_SIMULACAO=1` → usa `simulacao.ts` para voz e condução (sem rede). Senão,
  Grok e Claude reais com as chaves descriptografadas. Sem chave → `ErroApp 'chave-ausente'`.
- Cada `ipcMain.handle` valida o tipo dos argumentos (strings, números, ArrayBuffer) e converte erros com
  `paraErroApp` — o IPC não preserva classes de erro.
- Preload: `contextBridge.exposeInMainWorld(NOME_PONTE, api)` onde `api` tem exatamente a forma de
  `Plataforma` (`chaves`, `config`, `destino`, `progresso`, `transcricao`, `voz`, `conducao`, `sistema`),
  cada método = `ipcRenderer.invoke(CANAIS.x, ...args)`.

---

## 8. Plataforma no renderer

- `platform/electron.ts`: `export function plataformaElectron(): Plataforma` → embrulha `window.entrevistaTwin`
  (declaração global em `platform/ponte.d.ts` ou no próprio arquivo).
- `platform/navegador.ts`: chaves em `localStorage` (só formato; aviso de que é ambiente de
  desenvolvimento), config e progresso em `localStorage`, transcrição acumulada em `localStorage` por
  arquivo, `destino.escolher` devolve a própria string, `voz.falar` usa `speechSynthesis` (pt-BR) e
  devolve um WAV mudo do mesmo tamanho que a simulação (o controlador toca o WAV enquanto o
  `speechSynthesis` fala — ou, mais simples, `falar` só devolve o WAV mudo e a fala real fica a cargo
  de `reprodutor` quando `info().simulada`). `voz.transcrever` e `conducao.decidir` usam `simulacao.ts`.
  `sistema.fechar` volta ao setup.
- `platform/index.ts`: `export const plataforma: Plataforma = window[NOME_PONTE] ? plataformaElectron() : plataformaNavegador()`.

---

## 9. Áudio no renderer

- `audio/reprodutor.ts`: `tocar(audio: ArrayBuffer, mime): { fim: Promise<void>; parar(): void }`.
  Cria `Blob` → `URL.createObjectURL` → `HTMLAudioElement`; revoga a URL ao fim.
- `audio/gravador.ts`: `iniciarCaptura(opcoes: { aoNivel?(rms: number): void; silencioMs?: number (2500); maxMs?: number (300000); minFalaMs?: number (600) })
  → Promise<{ parar(): Promise<{ audio: ArrayBuffer; mime: 'audio/wav' }>; cancelar(): void; fimAutomatico: Promise<...> }>`.
  `getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })` + `AudioContext` +
  `ScriptProcessorNode`/`AudioWorklet` para PCM e nível; converte para WAV 16 kHz mono 16-bit.
  Detecção: começa a contar silêncio só depois de detectar fala; ao completar `silencioMs`, resolve
  `fimAutomatico`. Sem fala em `maxMs` → também resolve (com o áudio que houver).
- Erros de permissão → `ErroApp 'microfone'`.

---

## 10. Telas — fidelidade ao protótipo

`project/Entrevista Twin.dc.html` é a especificação visual: **reproduzir os valores** (tamanhos,
cores, espaçamentos, fontes, textos) convertendo `style=""` em classes CSS num arquivo por tela
(`Setup.css`, `Sessao.css`, `FimDeSessao.css`) com prefixos `st-`, `ss-`, `fs-`. Usar os primitivos de
`styles/global.css` (`.cabecalho`, `.marca`, `.selo`, `.rotulo`, `.botao*`, `.card`, `.campo`,
`.dica*`, `.veu`, `.dialogo*`, `.aviso`) e os ícones de `components/Icones.tsx`.

Diferenças obrigatórias em relação ao protótipo (vêm do brief v2 e do HANDOFF):

- Contagem: **26 perguntas + fechamento**; nunca "27". Cabeçalho do roteiro: `8 blocos · 26 perguntas + fechamento · 3 sessões de ~25 min`.
- Roteiro agrupado por **sessão** (três grupos com estado: concluída com data / atual / pendente), blocos em acordeão dentro.
- Vozes **Helios** e **Leo**, sem selo "placeholder", com botão "Ouvir amostra" (só com chave do Grok válida).
- Destino é **pasta**; a dica diz que cada sessão gera um arquivo e mostra o nome que o próximo terá.
- Botão principal com os rótulos do §2. Abaixo dele, erro de validação real das chaves, se houver.
- Chaves guardadas aparecem como campo com `••••••••` e "Trocar"; digitar uma nova substitui.
- Sessão: cabeçalho `SESSÃO 2 DE 3 · Bloco 5 de 8`; barra de progresso mede a sessão atual;
  chips só dos blocos da sessão; rótulo `Pergunta 12 de 26`.
- Enquanto ouve, botão "Concluir resposta" ao lado do indicador de áudio (parada manual).
- Card "Claude": a regra da pergunta e, abaixo, a última decisão (`motivo`) em texto menor.
- Fim de sessão conforme brief v2 §3 (sem colunas): sessão encerrada, blocos cobertos, arquivo, próxima
  sessão em uma linha; botões "Fechar o app" e "Emendar a sessão N agora"; na sessão 3, "ENTREVISTA
  CONCLUÍDA". Se incompleta: dizer de que bloco recomeça e oferecer "Retomar agora".
- Selo `SIMULAÇÃO` no cabeçalho quando `info().simulada`.

---

## 11. O que não entra (portão de parada)

Destilação, pasta `twin/`, ingestão de documentos, revisão do conteúdo, agentes consumidores, nuvem,
onboarding, login, métricas. A tela final mostra o caminho do arquivo e nada mais.
