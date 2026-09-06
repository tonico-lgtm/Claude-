# Brief para o Claude Design — App de Entrevista do Twin (Etapa 1)

> **Versão 2** — substitui `project/uploads/brief-claude-design-entrevista-twin.md`.
> Diferença principal: a entrevista passa a rodar em **três sessões** com retomada,
> a contagem vira **26 perguntas + fechamento**, o destino vira **pasta** em vez de
> arquivo, e entra uma terceira tela (**fim de sessão**).

## O que é

Um app de desktop de tela única cuja função é **conduzir uma entrevista de identidade por voz** com um cliente do escritório (público jurídico) e gravar o resultado. Nada além disso.

O produto final do projeto maior é um **agente twin**: uma pasta de arquivos Markdown que captura a identidade de uma pessoa — como fala, como escreve, o que fez, o que prefere, o que recusa — para que outros agentes leiam e ajam com essa base. O twin **não executa tarefas**: é artefato de identidade e conhecimento.

Este app é só a **primeira camada de captação** desse twin.

## Portão de parada (IMPORTANTE)

**O escopo termina no fim da entrevista.** O app é considerado completo quando:

1. as chaves de API foram inseridas e validadas;
2. as **três sessões** rodaram, cobrindo os 8 blocos do roteiro;
3. a transcrição bruta de cada sessão foi gravada em disco na máquina do cliente.

**Não projetar nem sugerir**, nesta etapa:

- destilação da transcrição em arquivos MD;
- a pasta `twin/` e sua estrutura;
- ingestão de obras, posts, processos ou pastas do Dropbox;
- formulário de revisão, edição ou aprovação do conteúdo destilado;
- qualquer agente que consuma o twin.

Tudo isso é etapa 2 e será especificado depois. Se a tela precisar apontar para o futuro, o máximo permitido é indicar o caminho do arquivo de transcrição gerado — sem prometer o que acontece com ele.

## Arquitetura dos dois motores

| Motor | Papel | O que faz |
|---|---|---|
| **Claude** | Inteligência | Conduz a entrevista. Escolhe a próxima pergunta, decide quando fazer a única pergunta de aprofundamento permitida, controla o ritmo, não opina. |
| **Grok** | Voz | Fala em voz alta o texto que o Claude mandou e devolve o áudio do entrevistado transcrito. Não decide nada. |

O app precisa de **um campo de chave de API para cada um**:

- Claude — prefixo `sk-ant-`
- Grok — prefixo `xai-`

Ambos com mostrar/ocultar, validação de formato ao vivo, e a informação de que a chave fica só na máquina (keychain do sistema). O botão de iniciar só habilita quando as duas chaves passam.

## O roteiro já vem carregado

O app **não pede** para o usuário montar ou escolher roteiro. A versão v1 é fixa e vem embutida: **8 blocos, 26 perguntas + fechamento**, divididos em **três sessões de ~25 min**. O usuário só vê o roteiro para conferir antes de começar.

### A entrevista roda em 3 sessões, não numa sentada

Esta é uma decisão de produto, não uma sugestão: a entrevista é longa e cansa quem responde. O app trata cada sessão como uma unidade fechada, com abertura, encerramento e arquivo próprio.

**Sessão 1 — Quem é** (~25 min, 10 perguntas)

1. **Quem é** — 3 perguntas abertas
2. **Trajetória** — 3 perguntas abertas
3. **Voz e escrita** — 4 perguntas, 1 de múltipla escolha

**Sessão 2 — Como trabalha** (~25 min, 9 perguntas)

4. **Domínio** — 3 perguntas, 1 de múltipla escolha
5. **Valores e limites** — 3 perguntas abertas
6. **Pessoas e tom** — 3 perguntas abertas

**Sessão 3 — Como vive** (~25 min, 7 perguntas + fechamento)

7. **Rotina e ferramentas** — 3 perguntas, 1 de múltipla escolha
8. **Fora do escritório** — 4 perguntas abertas

Fechamento, só na sessão 3, fora da contagem: *"Se um assistente fosse escrever no seu lugar amanhã, o que ele precisaria saber que ninguém pensaria em perguntar?"*

### Regras das sessões

- Cada sessão gera **seu próprio arquivo de transcrição**, datado e numerado.
- As sessões são feitas **na ordem**, em dias diferentes ou não — o app não deixa começar a 2 antes de fechar a 1.
- Ao reabrir o app, ele mostra em que sessão a entrevista parou e oferece **retomar dali**, sem repetir o que já foi.
- No fim de cada sessão, uma tela curta de encerramento: o que foi coberto, o que falta, e o caminho do arquivo gravado. Nada além disso — sem resumo interpretado, sem análise.
- Dentro de uma sessão, pausar e retomar é permitido; sair no meio deixa a sessão marcada como incompleta e ela recomeça do bloco onde parou.

### Regra de condução (aparece na interface)

A voz lê a pergunta exatamente como está escrita. Uma única pergunta de aprofundamento por resposta, sempre pedindo exemplo concreto. Sem opinar, sem resumir, sem pular bloco.

## Telas

### 1 — Setup

Duas colunas.

**Esquerda:** as duas chaves de API, escolha de voz da entrevistadora, caminho da pasta de destino das transcrições, botão de iniciar (habilitado condicionalmente). Indicador de estado no topo: "aguardando chaves" → "pronto para iniciar".

**Direita:** o roteiro carregado, agrupado pelas **três sessões**, com os 8 blocos em acordeão dentro delas — cada bloco abre mostrando as perguntas. Cada sessão traz seu estado: concluída (com data), atual, ou pendente. Abaixo, o card com a regra de condução.

O botão principal muda de rótulo conforme o estado: **INICIAR SESSÃO 1** / **RETOMAR SESSÃO 2** / **CONTINUAR — SESSÃO 3**.

### 2 — Sessão em curso

**Coluna principal (larga):** identificação do bloco atual, tipo da pergunta (aberta ou múltipla escolha), a pergunta em tipografia grande, e um card "Claude" com a instrução de condução específica daquela pergunta. Indicador visual de áudio. Controles na base: anterior, pausar/retomar, aprofundar, próxima.

**Coluna lateral:** transcrição rolando com carimbo de tempo e distinção entre entrevistadora e cliente; chips dos blocos **da sessão atual** para navegar, marcando concluídos, atual e pendentes.

Barra de progresso fina no topo, medindo a sessão atual — não a entrevista inteira. Cabeçalho traz sessão (ex.: "SESSÃO 2 DE 3"), estado de gravação e tempo decorrido.

### 3 — Fim de sessão

Tela curta, sem colunas: sessão encerrada, blocos cobertos, caminho do arquivo gravado, e o que vem na próxima sessão em uma linha. Dois botões: fechar o app, ou emendar a próxima sessão agora. Na sessão 3, o botão vira **ENTREVISTA CONCLUÍDA** — e é aí que o app para. Nada depois disso.

## Direção visual

Técnico sóbrio, coerente com o blueprint já feito:

- Fundo grafite `#16181b`, painéis `#1d2024`, fundo de campo `#101215`
- Linhas finas `#2c3037` / `#33373e`
- Texto `#e4e2dd`, secundário `#8d9098`, terciário `#6e7178`
- Acento primário `oklch(0.74 0.11 65)` (âmbar) — Claude, ações principais
- Acento secundário `oklch(0.74 0.11 215)` (azul) — Grok, voz, marcadores de tipo
- Verde `oklch(0.7 0.12 145)` para validado, vermelho `oklch(0.62 0.17 25)` para gravando
- Tipografia: **IBM Plex Mono** na interface, **Spectral** nos títulos e nas perguntas
- Ícones em SVG traçado, sem emoji
- Nada de gradiente, nada de canto muito arredondado, nada de card com barra colorida à esquerda

## O que NÃO fazer

- Não inventar telas de onboarding, tutorial, login ou configurações gerais.
- Não adicionar métricas, gráficos ou "insights" da entrevista.
- Não colocar dados sensíveis de cliente real em exemplo — usar conteúdo claramente fictício.
- Não propor envio da transcrição para nuvem: o app roda e grava na máquina do cliente.
- Não avançar o escopo além do portão de parada acima. Se algo parecer faltar, é porque é etapa 2.

## Pontos em aberto — TODOS FECHADOS

Os três pontos que o brief v2 deixou em aberto foram decididos depois, em conversa:

- ~~Catálogo real de vozes do Grok~~ → **Helios** e **Leo**. Os placeholders Ana / Beatriz / Clara saem.
- ~~Qual conector/MCP de transcrição será usado~~ → **Nenhum MCP.** A API do Grok faz a transcrição direto.
- ~~Onde fica o estado de progresso entre sessões~~ → **Arquivo local ao lado das transcrições.**
