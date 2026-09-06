# Entrevista Twin — pacote de retomada

Este arquivo existe para que a implementação continue **em outra máquina ou outra
conta**, sem perder nada do que foi decidido. Leia-o antes de qualquer código.

Data do pacote: 2026-09-06.

---

## 1. Estado atual, sem maquiagem

A implementação **começou e está incompleta**. O que existe hoje no diretório `app/`:

| Arquivo | Estado |
|---|---|
| `app/package.json`, `tsconfig.json`, `electron/tsconfig.json`, `vite.config.ts`, `index.html` | Pronto — scaffolding Electron + React + Vite + TypeScript |
| `app/src/roteiro/roteiro.ts` | Pronto — roteiro v1 completo: 8 blocos, 26 perguntas + fechamento, 3 sessões, regras de condução |
| Todo o resto (telas, motor de sessão, adaptadores de plataforma, serviços Claude/Grok, testes) | **Não escrito ainda** |

Nada foi executado nem testado: `npm install` ainda não rodou nesta máquina.

O protótipo clicável original continua íntegro em `project/Entrevista Twin.dc.html`
— ele é a **especificação visual**, não código de produção. `project/support.js` é só
o runtime do Claude Design; não reaproveitar.

---

## 2. Decisões travadas (não reabrir sem motivo)

### Produto

1. **Três sessões, na ordem, com retomada.** Sessão 1 "Quem é" (blocos 1–3, 10 perguntas), Sessão 2 "Como trabalha" (blocos 4–6, 9 perguntas), Sessão 3 "Como vive" (blocos 7–8, 7 perguntas + fechamento).
2. **26 perguntas + fechamento**, e não "27". O fechamento é numerado como `null` e a interface nunca o soma à contagem. Isso corrige uma contradição do protótipo, onde a tela do roteiro dizia "fora da contagem" e o cabeçalho contava 27.
3. **Destino é uma pasta**, não um arquivo. O app nomeia cada transcrição: `sessao-1-quem-e-2026-09-06.md`.
4. **Estado de progresso em arquivo local, ao lado das transcrições.** Confirmado pelo cliente.
5. **Vozes do Grok: Helios e Leo.** Os placeholders Ana / Beatriz / Clara saem de vez.
6. **Sem MCP de transcrição.** A API do Grok transcreve direto.
7. **Modo escrita continua existindo.** ⚠️ **Ponto de atenção:** o brief v2 fala só em entrevista "por voz" e não menciona o modo escrita. Mas o cliente pediu explicitamente ("ele quer ter a opção de livre escolha", entre formulário e voz) e o protótipo o implementa. Mantido de propósito. **Se o brief v2 quis mesmo removê-lo, isso precisa ser dito em voz alta antes de arrancar o código.**

### Técnicas

8. **Stack: Electron + React + Vite + TypeScript.** Escolhida por ser o que o brief exige na prática — keychain do sistema e gravação em disco na máquina do cliente. *Assumida* após a recomendação não ser contestada em três oportunidades; se estiver errada, o custo de trocar é baixo por construção (ver item 9).
9. **Plataforma atrás de um adaptador fino.** Keychain, escrita de arquivo, microfone e estado de retomada ficam atrás de uma interface. Trocar Electron por web ou Tauri deve mexer só no adaptador, nunca nas telas nem no motor da entrevista.
10. **As chaves nunca entram no processo renderer.** Toda chamada às APIs roda no processo principal do Electron, onde a chave vive (via `safeStorage`). O `index.html` já declara `connect-src 'none'` na CSP — é a garantia mecânica de que o renderer não fala com a rede.
11. **Modelo do Claude: `claude-opus-5`.** A decisão de aprofundar sai de `client.messages.parse()` com `output_config: { format: zodOutputFormat(...) }` — saída estruturada, não tool use. Tratar `stop_reason === "refusal"` com o padrão seguro: não aprofundar.
12. **Transcrição gravada incrementalmente (append).** Cada fala é anexada ao arquivo assim que acontece. Consequências: um crash não perde nada, e retomar uma sessão incompleta continua no mesmo arquivo em vez de criar outro.

---

## 3. O que falta construir

Na ordem em que eu faria:

1. **`src/shared/tipos.ts`** — tipos compartilhados entre main e renderer (estado de progresso, linha de transcrição, resultado de condução).
2. **`src/engine/sessao.ts`** — máquina de estados pura da sessão: fila de perguntas, avanço, aprofundamento único por resposta, pausa. Sem React, sem I/O — é aqui que os testes valem a pena.
3. **`src/engine/transcricao.ts`** — serialização Markdown da transcrição, com carimbo de tempo e distinção entrevistadora/cliente.
4. **`src/platform/*.ts`** — interface do adaptador + implementação Electron (IPC) + implementação de navegador (para rodar `npm run dev` sem Electron).
5. **`electron/main.ts` / `electron/preload.ts`** — janela, IPC, `safeStorage`, escrita de arquivo, clientes Claude e Grok.
6. **`src/services/claude.ts`** — decisão de aprofundamento (ver item 11 acima).
7. **`src/services/grok.ts`** — TTS e transcrição. ⚠️ O endpoint exato da API de voz do xAI **não foi verificado** — implementar com base URL configurável e deixar isso explícito no código.
8. **`src/services/simulacao.ts`** — respostas fictícias do protótipo, para o app ser demonstrável sem chave.
9. **`src/screens/Setup.tsx`, `Sessao.tsx`, `FimDeSessao.tsx`** + componentes.
10. **Testes** do motor de sessão: avanço, um aprofundamento por resposta, ordem das sessões, retomada pelo bloco.

---

## 4. Como retomar em outra máquina

```bash
# 1. Recuperar este diretório (ver seção 5 se você só tem o .tar.gz)
cd entrevista-twin

# 2. Instalar
cd app && npm install

# 3. Rodar só o renderer, sem Electron (útil para trabalhar nas telas)
npm run dev

# 4. Rodar o app de verdade
npm start
```

**Prompt sugerido para abrir a nova sessão de Claude Code:**

> Leia `docs/HANDOFF.md` e `docs/BRIEF-v2.md` neste repositório, depois
> `project/Entrevista Twin.dc.html` (é a especificação visual — não copie a
> estrutura interna dele, só o resultado visual). Continue a implementação do
> diretório `app/` a partir da seção 3 do HANDOFF. As decisões da seção 2 estão
> travadas: não as reabra sem me perguntar.

---

## 5. O que este repositório contém

```
README.md                              instruções do bundle original do Claude Design
chats/chat1.md                         transcript da conversa de design (onde a intenção mora)
docs/BRIEF-v2.md                       o brief vigente ← leia este, não o de uploads/
docs/HANDOFF.md                        este arquivo
project/Entrevista Twin.dc.html        protótipo clicável = especificação visual
project/support.js                     runtime do Claude Design (descartável)
project/uploads/brief-...md            brief v1, superado pelo v2
project/_ds/classical-.../             design system "Classical" — NÃO foi seguido;
                                       a direção visual veio do brief
app/                                   a implementação (incompleta, ver seção 1)
```

---

## 6. Riscos conhecidos

- **Endpoint de voz do Grok não verificado.** Nada foi testado contra a API real do xAI, porque não houve chave nesta sessão. Trate `services/grok.ts` como provisório até uma chamada real passar.
- **Nenhuma chamada real ao Claude foi executada.** A camada de condução foi escrita a partir da referência do SDK, não de execução.
- **A stack foi assumida, não confirmada** (ver item 8).
- **O modo escrita pode ter sido removido sem querer no brief v2** (ver item 7).
