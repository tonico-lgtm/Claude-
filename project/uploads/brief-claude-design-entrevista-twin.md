# Brief para o Claude Design — App de Entrevista do Twin (Etapa 1)

## O que é

Um app de desktop de tela única cuja função é **conduzir uma entrevista de identidade por voz** com um cliente do escritório (público jurídico) e gravar o resultado. Nada além disso.

O produto final do projeto maior é um **agente twin**: uma pasta de arquivos Markdown que captura a identidade de uma pessoa — como fala, como escreve, o que fez, o que prefere, o que recusa — para que outros agentes leiam e ajam com essa base. O twin **não executa tarefas**: é artefato de identidade e conhecimento.

Este app é só a **primeira camada de captação** desse twin.

## Portão de parada (IMPORTANTE)

**O escopo termina no fim da entrevista.** O app é considerado completo quando:

1. as chaves de API foram inseridas e validadas;
2. a entrevista rodou pelos 8 blocos do roteiro;
3. a transcrição bruta foi gravada em disco na máquina do cliente.

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

O app **não pede** para o usuário montar ou escolher roteiro. A versão v1 é fixa e vem embutida: **8 blocos, 27 perguntas, ~75 min** (ou 3 sessões de 25 min). O usuário só vê o roteiro para conferir antes de começar.

Blocos:

1. **Quem é** — 3 perguntas abertas
2. **Trajetória** — 3 perguntas abertas
3. **Voz e escrita** — 4 perguntas, 1 de múltipla escolha
4. **Domínio** — 3 perguntas, 1 de múltipla escolha
5. **Valores e limites** — 3 perguntas abertas
6. **Pessoas e tom** — 3 perguntas abertas
7. **Rotina e ferramentas** — 3 perguntas, 1 de múltipla escolha
8. **Fora do escritório** — 4 perguntas abertas

Fechamento, fora da contagem: *"Se um assistente fosse escrever no seu lugar amanhã, o que ele precisaria saber que ninguém pensaria em perguntar?"*

### Regra de condução (aparece na interface)

A voz lê a pergunta exatamente como está escrita. Uma única pergunta de aprofundamento por resposta, sempre pedindo exemplo concreto. Sem opinar, sem resumir, sem pular bloco.

## Telas

### 1 — Setup

Duas colunas.

**Esquerda:** as duas chaves de API, escolha de voz da entrevistadora, caminho do arquivo de destino da transcrição, botão de iniciar (habilitado condicionalmente). Indicador de estado no topo: "aguardando chaves" → "pronto para iniciar".

**Direita:** o roteiro carregado, com os 8 blocos em acordeão — cada bloco abre mostrando as perguntas e um selo de versão fixa. Abaixo, o card com a regra de condução.

### 2 — Sessão em curso

**Coluna principal (larga):** identificação do bloco atual, tipo da pergunta (aberta ou múltipla escolha), a pergunta em tipografia grande, e um card "Claude" com a instrução de condução específica daquela pergunta. Indicador visual de áudio. Controles na base: anterior, pausar/retomar, aprofundar, próxima.

**Coluna lateral:** transcrição rolando com carimbo de tempo e distinção entre entrevistadora e cliente; chips dos 8 blocos para navegar, marcando concluídos, atual e pendentes.

Barra de progresso fina no topo. Estado de gravação e tempo decorrido no cabeçalho.

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

## Pontos ainda em aberto

- Catálogo real de vozes do Grok (as três atuais são placeholder).
- Qual conector/MCP de transcrição será usado.
- Se a entrevista roda em sessão única ou em três blocos com retomada — hoje o app assume sessão única com pausa.
