# Entrevista Twin — pacote de retomada

Este arquivo existe para que a implementação continue **em outra máquina ou outra
conta**, sem perder nada do que foi decidido. Leia-o antes de qualquer código.

Data do pacote: 2026-09-07 (substitui o de 2026-09-06).

---

## 1. Estado atual, sem maquiagem

A implementação da etapa 1 está **escrita por inteiro e verificada por tipo, por teste
e por um teste de fumaça no Electron real em modo simulação**. Não foi executada contra
as APIs reais do Claude nem do Grok, não foi testada com microfone real e **não passou
por revisão de código independente** (a revisão adversarial planejada foi pulada por
decisão do cliente em 2026-09-07).

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
| `app/electron/main.ts`, `electron/preload.ts` | Pronto — janela, IPC com validação de argumentos, `safeStorage`, escrita em disco, clientes Claude e Grok; preload compatível com `sandbox: true` |
| `app/src/platform/electron.ts`, `navegador.ts`, `index.ts`, `ponte.d.ts` | Pronto — adaptador Electron e adaptador de navegador (para `npm run dev`, tudo simulado) |
| `app/src/audio/gravador.ts`, `reprodutor.ts` | Escrito — captura do microfone em WAV 16 kHz mono com detecção de silêncio; reprodução por Blob URL. **Não testado com microfone real** |
| `app/src/hooks/useSessao.ts` | Pronto — controlador que liga motor, plataforma e áudio |
| `app/src/screens/Setup.tsx`, `Sessao.tsx`, `FimDeSessao.tsx`, `App.tsx`, `src/components/*` | Pronto — as três telas, fiéis ao protótipo e ao brief v2 |
| `docs/ARQUITETURA.md` | Pronto — contratos e regras de cada módulo; leia depois deste arquivo |

### O que foi verificado

- `npm run typecheck` limpo nos dois projetos (renderer e Electron).
- `npm test`: 120 testes passando (motor, transcrição, progresso, serviços, simulação).
- `npm run build`: renderer e main emitidos em `dist/`.
- **Fumaça no Electron real** (Linux, Xvfb, `ENTREVISTA_TWIN_SIMULACAO=1`, Playwright): janela abre;
  `window.entrevistaTwin` expõe exatamente os oito grupos do contrato; `require`, `process` e
  `Buffer` indefinidos no renderer; `fetch` e WebSocket bloqueados pela CSP (`connect-src 'none'`);
  o `preload.js` emitido só faz `require("electron")`; as chaves em `chaves.json` ficam cifradas
  (prefixo `v10` do OSCrypt, sem o texto da chave); sessão 1 em escrita com aprofundamento automático,
  troca para voz com leitura do WAV simulado, "Concluir resposta", volta a escrita, diálogo de
  encerrar, tela de fim incompleta, `sessao-1-quem-e-<data>.md` e `progresso.json` em disco, reabertura
  com "RETOMAR SESSÃO 1", retomada no bloco 2 (o bloco onde parou) e novo encerramento.
- **Fumaça no navegador** (parcial): setup, validação das chaves, sessão em escrita, transcrição
  gravada com o formato do §4 de `ARQUITETURA.md`.

### O que a fumaça mostrou e ainda não foi tratado

- Neste Linux sem keyring, `safeStorage.isEncryptionAvailable()` é `false` e o app **recusa guardar
  as chaves**, com a mensagem explicando. É o comportamento desenhado (decisão 10); em macOS e
  Windows o keychain existe. Se o cliente usar Linux, é preciso decidir o que fazer (ver §3).
- Registrar duas vezes a mesma resposta (o campo é limpo e "Preencher com exemplo" o reenche) grava
  duas falas iguais na transcrição. Não é defeito do motor; é comportamento do operador. Avaliar se
  o botão deve ser desabilitado depois de registrar.
- Sob Xvfb a janela abriu com 1279×799 em vez de 1280×800. Ambiente, não código.

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
10. **Sem keychain, sem chaves.** Se `safeStorage.isEncryptionAvailable()` for falso, o app recusa guardar e explica. Não há fallback em texto claro.

### Técnicas

11. **Stack: Electron 33 + React 18 + Vite 6 + TypeScript 5.** Confirmada pelo uso; não foi contestada.
12. **Plataforma atrás de um adaptador fino** (`src/platform/plataforma.ts`). Keychain, disco, microfone, voz e condução ficam atrás da interface. O adaptador de navegador prova que as telas não dependem do Electron.
13. **As chaves nunca entram no processo renderer.** Toda chamada às APIs roda no main, onde a chave vive (`safeStorage`). `index.html` declara `connect-src 'none'`; `sandbox: true` e `contextIsolation: true` na janela; o preload não faz `require` de módulo local. Verificado na fumaça.
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
   `ENTREVISTA_TWIN_XAI_BASE_URL` sobrescreve a base URL sem tocar no código.
2. **Chamada real ao Claude** com uma chave `sk-ant-`: confirmar `messages.parse` com `claude-opus-5`,
   medir a latência com `effort: 'low'` e ler algumas decisões para calibrar o prompt de sistema
   (`montarSistema` em `claude.ts`). Avaliar o parâmetro `fallbacks` (beta) para recusas.
3. **Microfone real:** calibrar o limiar de silêncio (0,015 RMS) e os 2,5 s de silêncio em
   `src/audio/gravador.ts`; confirmar que "Concluir resposta" e a pausa fecham o microfone.
4. **Revisão de código independente** (pulada em 2026-09-07): motor, controlador (`useSessao`),
   Electron/segurança, serviços, telas e escopo. As dimensões e os critérios estão descritos no
   histórico desta sessão; qualquer revisor pode partir de `docs/ARQUITETURA.md`.
5. **Empacotamento:** não existe. Escolher electron-builder ou Forge; no macOS, incluir
   `NSMicrophoneUsageDescription` no `Info.plist` e assinar/notarizar.
6. **Decisões pequenas que pedem o cliente:** Linux sem keyring (recusar, como hoje, ou aceitar com
   aviso); botão "Reler" quando o TTS falha (hoje: Pausar → Retomar relê); esconder "Preencher com
   exemplo" fora da simulação; desabilitar "Registrar resposta" depois de registrar.
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

# 6. Rodar o app de verdade contra as APIs (chaves digitadas na tela)
npm start

# Variáveis úteis
#   ENTREVISTA_TWIN_DEV=1            carrega o renderer do servidor do Vite (rode `npm run dev` antes)
#   ENTREVISTA_TWIN_SIMULACAO=1      voz e condução simuladas
#   ENTREVISTA_TWIN_XAI_BASE_URL     base URL do Grok (padrão https://api.x.ai/v1)
```

**Prompt sugerido para abrir a nova sessão de Claude Code:**

> Leia `docs/HANDOFF.md`, `docs/BRIEF-v2.md` e `docs/ARQUITETURA.md` neste repositório, depois
> `project/Entrevista Twin.dc.html` (é a especificação visual — não copie a estrutura interna
> dele, só o resultado visual). Continue a partir da seção 3 do HANDOFF. As decisões da seção 2
> estão travadas: não as reabra sem me perguntar.

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
  contratos de `ARQUITETURA.md`; integrou sem erro de tipo e passou nos testes e na fumaça, mas ninguém
  o leu de ponta a ponta com olhar adversarial.
- **Só Linux foi exercitado** (sob Xvfb). macOS e Windows dependem do keychain e do microfone reais.
- **Sem empacotamento.** `npm start` roda o Electron de desenvolvimento; não há instalador.
