# Entrevista Twin — pacote de retomada

Este arquivo existe para que a implementação continue **em outra máquina ou outra
conta**, sem perder nada do que foi decidido. Leia-o antes de qualquer código.

Data do pacote: 2026-09-07 (substitui o de 2026-09-06).

---

## 1. Estado atual, sem maquiagem

A implementação da etapa 1 está **escrita por inteiro e verificada por tipo, por teste
e por dois testes de fumaça completos em modo simulação** (o renderer no Chromium e o
Electron real sob Xvfb). Não foi executada contra as APIs reais do Claude nem do Grok,
não foi testada com microfone real e **não passou por revisão de código independente**
(a revisão adversarial planejada foi pulada por decisão do cliente em 2026-09-07).

| Arquivo | Estado |
|---|---|
| `app/package.json`, `tsconfig.json`, `electron/tsconfig.json`, `vite.config.ts`, `vitest.config.ts`, `index.html` | Pronto. Corrigidos nesta sessão: `main` apontava para `dist/electron/main.js`, mas `rootDir: ".."` emite em `dist/electron/electron/main.js`; o SDK da Anthropic fixado (0.71) não tinha `messages.parse` nem `helpers/zod` e foi atualizado para 0.124; fontes IBM Plex Mono e Spectral empacotadas via `@fontsource` (a CSP proíbe fontes remotas); CSP afrouxada só em `npm run dev` para o HMR |
| `app/src/roteiro/roteiro.ts` | Pronto — roteiro v1: 8 blocos, 26 perguntas + fechamento, 3 sessões |
| `app/src/shared/tipos.ts`, `src/platform/plataforma.ts`, `src/screens/contratos.ts` | Pronto — contratos entre módulos (tipos, canais IPC, interface do adaptador, props das telas) |
| `app/src/engine/sessao.ts` | Pronto — máquina de estados pura da sessão (33 testes) |
| `app/src/engine/transcricao.ts`, `engine/progresso.ts` | Pronto — Markdown incremental e `progresso.json` (42 testes) |
| `app/src/services/claude.ts` | Pronto — decisão de aprofundamento com `claude-opus-5`, `messages.parse` + `zodOutputFormat` (15 testes com `fetch` falso). **Nunca chamou a API real** |
| `app/src/services/grok.ts` | **Provisório** — TTS (`POST /v1/tts`) e transcrição (`POST /v1/stt`) escritos a partir de fontes secundárias, porque `docs.x.ai` estava bloqueado na sessão (17 testes com `fetch` falso). **Nunca chamou a API real** |
| `app/src/services/simulacao.ts` | Pronto — respostas fictícias do protótipo, condutor e voz simulados (13 testes) |
| `app/electron/main.ts`, `electron/preload.ts` | Pronto — janela, IPC com validação de argumentos, chaves provisionadas por ambiente ou `chaves.local.json` (sem `safeStorage`), escrita em disco, clientes Claude e Grok; preload compatível com `sandbox: true` |
| `app/src/platform/electron.ts`, `navegador.ts`, `index.ts`, `ponte.d.ts` | Pronto — adaptador Electron e adaptador de navegador (para `npm run dev`, tudo simulado) |
| `app/src/audio/gravador.ts`, `reprodutor.ts` | Escrito — captura do microfone em WAV 16 kHz mono com detecção de silêncio; reprodução por Blob URL. **Não testado com microfone real** |
| `app/src/hooks/useSessao.ts` | Pronto — controlador que liga motor, plataforma e áudio |
| `app/src/screens/Setup.tsx`, `Sessao.tsx`, `FimDeSessao.tsx`, `App.tsx`, `src/components/*` | Pronto — as três telas, fiéis ao protótipo e ao brief v2 |
| `docs/ARQUITETURA.md` | Pronto — contratos e regras de cada módulo; leia depois deste arquivo |

### O que foi verificado

- `npm run typecheck` limpo nos dois projetos (renderer e Electron).
- `npm test`: 135 testes passando (motor, transcrição, progresso, serviços, simulação, tipos, chaves).
- `npm run build`: renderer e main emitidos em `dist/`.
- **Fumaça do Setup sem chaves na tela** (2026-09-07, depois do PR 1; Electron real sob Xvfb e navegador):
  fora da simulação e sem `chaves.local.json`, o Setup não tem campo de chave, o cabeçalho diz "sem
  chaves", o aviso aponta as duas chaves ausentes com o caminho do arquivo e a variável de ambiente, e o
  botão fica desabilitado; em modo escrita só a chave do Claude é cobrada; arquivo com formato errado →
  "não tem o formato esperado" após "Verificar de novo"; arquivo com formato válido → aviso some, botão e
  amostra de voz habilitam, sem reabrir o app; "Iniciar" com chaves fictícias voltou "Chave do Claude
  recusada" / "Chave do Grok recusada". **Correção posterior:** só a recusa do Claude veio da API
  (`api.anthropic.com` é alcançado diretamente; a Anthropic devolve `authentication_error`); a do Grok veio
  do proxy desta sessão, que bloqueia `api.x.ai` (CONNECT 403, "Host not in allowlist") e cujo 403 o
  serviço interpreta como chave recusada. O texto das chaves não aparece no DOM do renderer; em simulação,
  nada é cobrado e a sessão abre. No navegador, idem, sem aviso algum.
- **Fumaça do app empacotado** (2026-09-07; `npm run empacotar:linux`, binário de `release/linux-unpacked`
  sob Xvfb): sobe do `app.asar` (main, preload, renderer, SDK da Anthropic dentro; `chaves.local.json`
  fora); em simulação abre pronto; fora dela aponta `<userData>/Entrevista Twin/chaves.local.json`;
  "Abrir o arquivo de chaves" cria o modelo com as duas chaves vazias; JSON quebrado → "não pôde ser lido
  como JSON"; arquivo com aspas tipográficas e chaves de formato válido → aceito sem reabrir.
- **Fumaça no Electron real** (Linux, Xvfb, `ENTREVISTA_TWIN_SIMULACAO=1`, Playwright): janela abre;
  `window.entrevistaTwin` expõe exatamente os oito grupos do contrato; `require`, `process` e
  `Buffer` indefinidos no renderer; `fetch` e WebSocket bloqueados pela CSP (`connect-src 'none'`);
  o `preload.js` emitido só faz `require("electron")`; sessão 1 em escrita com aprofundamento automático,
  troca para voz com leitura do WAV simulado, "Concluir resposta", volta a escrita, diálogo de
  encerrar, tela de fim incompleta, `sessao-1-quem-e-<data>.md` e `progresso.json` em disco, reabertura
  com "RETOMAR SESSÃO 1", retomada no bloco 2 (o bloco onde parou) e novo encerramento.
- **Fumaça no navegador** (`npm run dev`, Chromium headless, Playwright, 29 capturas): os doze passos
  do roteiro, do setup à retomada da sessão 2 — validação das chaves, amostra de voz, modo escrita com
  aprofundamento automático e forçado, navegação, pausa, múltipla escolha, troca para voz com leitura,
  captura, "Concluir resposta", transcrição e aprofundamento por voz, encerramento com despedida, emenda
  da sessão 2, encerramento antecipado, reabertura com "RETOMAR SESSÃO 2" e retomada no bloco certo.
  Markdown e `progresso.json` conferidos contra os §4 e §5 de `ARQUITETURA.md`.

### O que a fumaça encontrou e foi corrigido na própria sessão

- A CSP de desenvolvimento não era aplicada: o plugin do `vite.config.ts` trocava a primeira
  ocorrência de `connect-src 'none'`, que estava no comentário do `index.html`, e o WebSocket do
  HMR ficava bloqueado. Agora a troca é feita só dentro da meta.
- A nota de privacidade da tela de fim afirmava "só chamadas de condução" mesmo quando houve troca
  para voz no meio da sessão. Agora deriva de `usouVoz` no resultado da sessão.
- Os instantes do cabeçalho, marcador, rodapé e `progresso.json` saíam em UTC ("Z") enquanto o nome
  do arquivo usa a data local. Agora tudo sai em ISO 8601 com o fuso local (`instanteLocalIso`).
- A dica "Verifique a permissão do microfone" era anexada a todo erro de microfone, inclusive
  "Nenhum microfone encontrado". Agora só aparece quando o sistema negou o acesso.
- A simulação só aprofundava respostas com menos de 120 caracteres e duas respostas fictícias
  (q01 e q05) ficavam sem aprofundamento na demonstração. Limiar elevado para 160.

### O que a fumaça mostrou e ainda não foi tratado

- "Registrar resposta" continua habilitado depois de a pergunta já ter resposta: um novo registro
  grava outra fala do cliente na mesma pergunta. Fiel ao que foi dito, mas permite duplicar por
  descuido. Avaliar se o botão deve ser desabilitado depois de registrar.
- A retomada recomeça na primeira pergunta do bloco onde parou (decisão 9), o que relê perguntas
  daquele bloco já respondidas na execução anterior; a contagem "N de M" usa a união. Se preferir
  retomar na primeira pergunta ainda não respondida, é ajuste em `criarSessao`.
- Depois de uma retomada, o `.md` repete os cabeçalhos `## Bloco` e `### Pergunta` do bloco retomado,
  porque a nova execução não sabe o que já foi titulado. Cosmético; o marcador separa as execuções.
- `gravador.ts` usa `ScriptProcessorNode`, que o Chromium marca como obsoleto (aviso no console).
  Escolha deliberada, documentada no arquivo; migrar para `AudioWorklet` quando o empacotamento
  permitir servir o worklet.
- Sob Xvfb a janela abriu com 1279×799 em vez de 1280×800. Ambiente, não código (confirmado com
  uma tela maior).

---

## 2. Decisões travadas (não reabrir sem motivo)

### Produto

1. **Três sessões, na ordem, com retomada.** Sessão 1 "Quem é" (blocos 1–3, 10 perguntas), Sessão 2 "Como trabalha" (blocos 4–6, 9 perguntas), Sessão 3 "Como vive" (blocos 7–8, 7 perguntas + fechamento).
2. **26 perguntas + fechamento**, e não "27". O fechamento é numerado como `null` e a interface nunca o soma à contagem: a sessão 3 mostra "7 de 7 + fechamento", nunca "8 de 8".
3. **Destino é uma pasta**, não um arquivo. O app nomeia cada transcrição: `sessao-1-quem-e-2026-09-06.md`.
4. **Estado de progresso em arquivo local, ao lado das transcrições** (`progresso.json`). Confirmado pelo cliente.
5. **Vozes do Grok: Helios e Leo.** Os placeholders Ana / Beatriz / Clara saíram. Ambas constam do catálogo Grok Voice (Leo entre as cinco originais; Helios entre as 21 acrescentadas em 2026).
6. **Sem MCP de transcrição.** A API do Grok transcreve direto.
7. **Modo escrita existe, é prioritário e é alternável a qualquer momento da sessão.** Confirmado pelo cliente em 2026-09-07 ("é prioritário e modo escrita já implementado"). A dúvida do pacote anterior está encerrada.
8. **Aprofundamento.** Depois de cada resposta à pergunta principal, o Claude decide sozinho se faz a única pergunta de aprofundamento (e a formula). O botão "Aprofundar" força a formulação quando o Claude não aprofundou. Uma vez por resposta, nunca em perguntas com `permiteAprofundamento: false`, nunca depois da resposta ao aprofundamento.
9. **Sessão incompleta recomeça do bloco onde parou, no mesmo arquivo**, com um marcador de retomada; a contagem "N de M" na tela de fim e no rodapé usa a união das execuções.
10. **Chaves provisionadas fora da tela, nunca digitadas.** Pedido do cliente em 2026-09-07 ("remover a necessidade de fornecer chaves para iniciar a sessão"). O main lê, a cada uso, as variáveis `ENTREVISTA_TWIN_CLAUDE_KEY` e `ENTREVISTA_TWIN_GROK_KEY` e, na falta delas, o arquivo `chaves.local.json` (primeiro ao lado do `package.json` do app, depois em userData). A primeira fonte com valor vale; formato errado é apontado e não é mascarado por outra fonte (`src/shared/chaves.ts`). O Setup não tem campos de chave: só um aviso com o caminho do arquivo quando falta alguma, o botão "Abrir o arquivo de chaves" (cria o modelo com as chaves vazias e o abre no editor do sistema) e o botão "Verificar de novo". A leitura do arquivo tolera BOM e aspas tipográficas; JSON quebrado aparece como "ilegível", não como "não encontrada". Empacotado, o arquivo fica em `~/Library/Application Support/Entrevista Twin/`; em `npm start`, ao lado do `package.json`. Esta decisão substitui a anterior ("sem keychain, sem chaves", com `safeStorage`): o app não guarda mais chave nenhuma, e `chaves.local.json` está no `.gitignore`. Contrapartida assumida: a chave fica em texto claro num arquivo local do cliente, e não cifrada no keychain.

### Técnicas

11. **Stack: Electron 33 + React 18 + Vite 6 + TypeScript 5.** Confirmada pelo uso; não foi contestada.
12. **Plataforma atrás de um adaptador fino** (`src/platform/plataforma.ts`). Keychain, disco, microfone, voz e condução ficam atrás da interface. O adaptador de navegador prova que as telas não dependem do Electron.
13. **As chaves nunca entram no processo renderer.** Toda chamada às APIs roda no main, que lê a chave das fontes da decisão 10 na hora de usar. `index.html` declara `connect-src 'none'`; `sandbox: true` e `contextIsolation: true` na janela; o preload não faz `require` de módulo local. Verificado na fumaça.
14. **Modelo do Claude: `claude-opus-5`**, via `client.messages.parse()` com `output_config: { effort: 'low', format: zodOutputFormat(...) }` e sem `thinking` (o padrão do Opus 5 já é adaptativo). `stop_reason === "refusal"` → não aprofundar. Qualquer erro → não aprofundar, com o motivo no card "Claude". O SDK exige `zod/v4` no `zodOutputFormat`; por isso `claude.ts` importa `from 'zod/v4'` (o pacote `zod` 3.25 traz esse subcaminho).
15. **Transcrição gravada incrementalmente (append).** Cabeçalho ao abrir, uma fala por escrita, rodapé ao encerrar. Um crash não perde nada.
16. **Simulação sem rede.** `ENTREVISTA_TWIN_SIMULACAO=1` no Electron troca voz e condução pelos serviços de `simulacao.ts`; o adaptador de navegador é sempre simulado. Selo "SIMULAÇÃO" no cabeçalho.
17. **Áudio de captura em WAV 16 kHz mono 16-bit**, convertido no renderer, para não depender de o STT aceitar WebM/Opus.

---

## 3. O que falta fazer

Na ordem em que eu faria:

1. **Chamada real ao Grok** com uma chave `xai-`: rodar o app fora da simulação, ler uma pergunta e
   transcrever uma resposta. Conferir em `docs.x.ai` rota, campos (`voice_id`, `language`,
   `output_format`) e a forma da resposta do `/v1/stt`; ajustar `src/services/grok.ts` e os testes.
   `ENTREVISTA_TWIN_XAI_BASE_URL` sobrescreve a base URL sem tocar no código. **Tentativa em
   2026-09-07 com a chave real do cliente:** bloqueada pelo proxy da sessão de Claude Code (`api.x.ai`
   fora da lista de egress do ambiente; `api.anthropic.com` é liberado). Para repetir daqui é preciso
   incluir `api.x.ai` nas permissões de rede do ambiente, em claude.ai/code; o roteiro do teste está
   pronto (validar a chave, TTS com Helios e Leo, STT com o MP3 devolvido e com WAV 16 kHz mono como o app
   envia). Alternativa: rodar o app no Mac com a chave em `chaves.local.json` e relatar o que acontecer.
2. **Chamada real ao Claude** com uma chave `sk-ant-`: confirmar `messages.parse` com `claude-opus-5`,
   medir a latência com `effort: 'low'` e ler algumas decisões para calibrar o prompt de sistema
   (`montarSistema` em `claude.ts`). Avaliar o parâmetro `fallbacks` (beta) para recusas.
3. **Microfone real:** calibrar o limiar de silêncio (0,015 RMS) e os 2,5 s de silêncio em
   `src/audio/gravador.ts`; confirmar que "Concluir resposta" e a pausa fecham o microfone.
4. **Revisão de código independente** (pulada em 2026-09-07): motor, controlador (`useSessao`),
   Electron/segurança, serviços, telas e escopo. As dimensões e os critérios estão descritos no
   histórico desta sessão; qualquer revisor pode partir de `docs/ARQUITETURA.md`.
5. **Empacotamento (macOS):** feito em 2026-09-07 com electron-builder (`app/electron-builder.yml`) e a
   esteira `.github/workflows/empacotar-mac.yml`, que compila num macOS da GitHub e publica DMG e ZIP
   (app universal) na página de Releases; instruções em §4. A esteira rodou com sucesso (execução 2,
   ~3 min; a execução 1 falhou porque o segredo `CSC_LINK` ausente chegava como texto vazio e o
   electron-builder tentava importá-lo — corrigido) e publicou a Release `v0.1.0-b2`:
   https://github.com/tonico-lgtm/Claude-/releases/tag/v0.1.0-b2 (DMG e ZIP, ~187 MB cada). O ZIP foi
   baixado e inspecionado daqui: binário universal (`cafebabe`), `_CodeSignature` presente,
   `NSMicrophoneUsageDescription`, `CFBundleIdentifier` e `LSMinimumSystemVersion 12.0` no `Info.plist`,
   `app.asar` e `icon.icns` em `Resources`, nenhum `chaves.local.json`. O que falta: (a) abrir o `.app` num Mac real
   (só o pacote Linux foi exercitado, sob Xvfb); (b) certificado "Developer ID" e notarização — a esteira
   já aceita os segredos `CSC_LINK`, `CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD` e
   `APPLE_TEAM_ID`, caminho ainda não exercitado; sem eles o app sai com assinatura ad hoc e o macOS pede
   "Abrir mesmo assim" na primeira abertura; (c) Windows e Linux, se algum dia forem pedidos.
6. **Decisões pequenas que pedem o cliente:** botão "Reler" quando o TTS falha (hoje: Pausar →
   Retomar relê); esconder "Preencher com exemplo" fora da simulação; desabilitar "Registrar
   resposta" depois de registrar.
7. **Consolidar duplicatas:** o mapa texto→pergunta da simulação está em `electron/main.ts` e em
   `src/platform/navegador.ts`; o lugar natural é `simulacao.ts`.

---

## 4. Como retomar em outra máquina

```bash
# 1. Recuperar este repositório
cd Claude-   # ou o nome que a pasta tiver

# 2. Instalar
cd app && npm install

# 3. Verificar
npm run typecheck && npm test && npm run build

# 4. Rodar só o renderer, no navegador, tudo simulado (útil para as telas)
npm run dev            # http://localhost:5273

# 5. Rodar o app de verdade, em simulação (sem chave, sem rede)
ENTREVISTA_TWIN_SIMULACAO=1 npm start

# 6. Rodar o app de verdade contra as APIs: as chaves vêm de um arquivo local, nunca da tela.
#    Copie o exemplo, preencha as duas chaves e rode. O arquivo está no .gitignore.
cp chaves.local.exemplo.json chaves.local.json   # edite: { "claude": "sk-ant-…", "grok": "xai-…" }
npm start

# Variáveis úteis
#   ENTREVISTA_TWIN_CLAUDE_KEY       chave do Claude (tem precedência sobre o arquivo)
#   ENTREVISTA_TWIN_GROK_KEY         chave do Grok (idem)
#   ENTREVISTA_TWIN_DEV=1            carrega o renderer do servidor do Vite (rode `npm run dev` antes)
#   ENTREVISTA_TWIN_SIMULACAO=1      voz e condução simuladas (sem chave, sem rede)
#   ENTREVISTA_TWIN_XAI_BASE_URL     base URL do Grok (padrão https://api.x.ai/v1)
```

**Prompt sugerido para abrir a nova sessão de Claude Code:**

> Leia `docs/HANDOFF.md`, `docs/BRIEF-v2.md` e `docs/ARQUITETURA.md` neste repositório, depois
> `project/Entrevista Twin.dc.html` (é a especificação visual — não copie a estrutura interna
> dele, só o resultado visual). Continue a partir da seção 3 do HANDOFF. As decisões da seção 2
> estão travadas: não as reabra sem me perguntar.

---

### Instalar o app no Mac (para o cliente, sem terminal)

1. No GitHub, abrir **Actions › "Empacotar para macOS" › "Run workflow"** (branch `main`) e aguardar
   uns dez minutos. Só quem tem acesso de escrita ao repositório consegue acionar.
2. Abrir a página de **Releases** do repositório e baixar o arquivo `Entrevista-Twin-<versão>-universal.dmg`.
3. Abrir o DMG e arrastar o **Entrevista Twin** para a pasta Aplicativos.
4. Na primeira abertura, se o macOS disser que não pôde verificar o app, ir a **Ajustes do Sistema ›
   Privacidade e Segurança** e clicar em **"Abrir mesmo assim"** (uma vez só). Isso desaparece quando
   houver certificado "Developer ID" e notarização (ver §3, item 5).
5. Se a tela disser "sem chaves", clicar em **"Abrir o arquivo de chaves"**: o app cria
   `~/Library/Application Support/Entrevista Twin/chaves.local.json` com as duas chaves vazias e o abre no
   editor de texto. Colar cada chave entre as aspas, salvar e clicar em **"Verificar de novo"**. O app
   tolera as aspas tipográficas que o TextEdit costuma inserir.
6. Na primeira gravação, o macOS pede permissão de microfone.

Alternativa num Mac com Node instalado: `cd app && npm install && npm run empacotar:mac` gera o DMG em
`app/release/`.

**Chaves embutidas no pacote** (decisão do cliente em 2026-09-07: "pode salvar dentro do app"). A esteira
grava `Contents/Resources/chaves.local.json` a partir dos segredos `ENTREVISTA_TWIN_CLAUDE_KEY` e
`ENTREVISTA_TWIN_GROK_KEY` (Settings › Secrets and variables › Actions); cada chave presente entra, a
ausente fica vazia. Só faz isso se o repositório for **privado** (Settings › General › Danger Zone ›
Change visibility): num repositório público a Release é baixável por qualquer pessoa e a chave iria junto.
A assinatura ad hoc é feita depois da cópia, então o selo cobre o arquivo. Dentro do app, a ordem de
leitura é `<userData>/chaves.local.json` e depois `Contents/Resources/chaves.local.json`: um arquivo na
pasta de dados do usuário sobrepõe o embutido. Em repositório privado, cada execução da esteira consome
cerca de 30 minutos da cota mensal gratuita do Actions (runner macOS conta 10×); por isso o artefato do
workflow só é guardado quando não se publica Release.

---

## 5. O que este repositório contém

```
README.md                              instruções do bundle original do Claude Design
chats/chat1.md                         transcript da conversa de design (onde a intenção mora)
docs/BRIEF-v2.md                       o brief vigente ← leia este, não o de uploads/
docs/HANDOFF.md                        este arquivo
docs/ARQUITETURA.md                    contratos entre os módulos do app
project/Entrevista Twin.dc.html        protótipo clicável = especificação visual
project/support.js                     runtime do Claude Design (descartável)
project/uploads/brief-...md            brief v1, superado pelo v2
project/_ds/classical-.../             design system "Classical" — NÃO foi seguido;
                                       a direção visual veio do brief
app/                                   a implementação
  electron/                            main.ts, preload.ts
  src/shared/                          tipos, canais IPC, validadores
  src/roteiro/                         roteiro v1
  src/engine/                          sessao, transcricao, progresso (+ testes)
  src/services/                        claude, grok (provisório), simulacao (+ testes)
  src/platform/                        interface e adaptadores (electron, navegador)
  src/audio/                           gravador, reprodutor
  src/hooks/useSessao.ts               controlador da sessão
  src/screens/                         Setup, Sessao, FimDeSessao, contratos
  src/shared/chaves.ts                 provisionamento das chaves (puro, + testes)
  electron-builder.yml                 empacotamento (macOS universal: DMG e ZIP; Linux dir para validar)
  build/icon.png, build/entitlements.mac.plist, build/extra/   ícone, entitlements (microfone), chaves injetadas pela esteira
.github/workflows/empacotar-mac.yml    esteira: compila num macOS da GitHub e publica a Release
  src/components/                      componentes e ícones
  src/styles/global.css                tokens, fontes empacotadas, primitivos
```

---

## 6. Riscos conhecidos

- **Endpoint de voz do Grok não verificado contra a API real.** `grok.ts` foi escrito com base em
  fontes secundárias (`/v1/tts` com `text`, `voice_id`, `language`, `output_format`; `/v1/stt`
  multipart com `file`, resposta JSON com `text`). Trate-o como provisório até uma chamada real passar.
- **Nenhuma chamada real ao Claude foi executada.** A chamada foi validada contra os tipos do SDK 0.124
  e contra um `fetch` falso.
- **Captura de microfone não testada com hardware.** O gravador foi conferido por tipo e por script em
  Node (reamostragem e cabeçalho WAV); a detecção de silêncio pode precisar de calibração.
- **Sem revisão de código independente.** O código saiu de agentes paralelos escrevendo contra os
  contratos de `ARQUITETURA.md`; integrou sem erro de tipo e passou nos testes e nas duas fumaças
  completas, mas ninguém o leu de ponta a ponta com olhar adversarial.
- **Só Linux foi exercitado** (sob Xvfb). macOS e Windows dependem do microfone real.
- **O `.app` ainda não foi aberto num Mac real.** A configuração do empacotamento foi validada com o
  pacote Linux (`npm run empacotar:linux`, app sobe do `app.asar` sob Xvfb); o `.app` sai da esteira num
  macOS da GitHub. Sem certificado da Apple, a assinatura é ad hoc: o Gatekeeper pede confirmação uma vez.
