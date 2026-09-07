/**
 * Campo de chave de API — um por motor (Claude, Grok).
 *
 * O renderer nunca tem a chave guardada: quando `situacao === 'guardada'` e
 * não há rascunho, o campo mostra só uma máscara e o botão "Trocar". Ao
 * digitar, valida o formato ao vivo; quando o formato fica válido, guarda
 * sozinho (debounce curto) pela função `aoGuardar`, que o pai liga à
 * plataforma. Erros ao guardar viram a dica vermelha.
 */

import { useEffect, useRef, useState } from 'react';
import type { FocusEvent, KeyboardEvent } from 'react';
import { PREFIXO_CHAVE, chaveTemFormatoValido, paraErroApp } from '../shared/tipos';
import type { Motor, SituacaoChave } from '../shared/tipos';
import { IconeCheque, IconeOlho, IconeOlhoFechado } from './Icones';

export interface PropsCampoChave {
  readonly motor: Motor;
  /** "Claude" / "Grok". */
  readonly rotulo: string;
  /** Texto cinza ao lado do rótulo: "· inteligência — conduz a entrevista". */
  readonly descricao: string;
  readonly situacao: SituacaoChave;
  /** Rascunho digitado (vive no pai; vazio quando nada foi digitado). */
  readonly valor: string;
  aoMudar(valor: string): void;
  /** Cifra e guarda; rejeita com `ErroApp`. O pai limpa o rascunho ao resolver. */
  aoGuardar(chave: string): Promise<void>;
  aoRemover(): Promise<void>;
  /** Grok no modo escrita: selo e dica diferentes. */
  readonly opcional?: boolean;
}

/** Espera entre o formato ficar válido e a gravação no keychain. */
const ATRASO_GUARDAR_MS = 400;

const MASCARA = '••••••••••••';

export function CampoChave(props: PropsCampoChave): JSX.Element {
  const { motor, situacao, valor, aoGuardar, aoRemover } = props;
  const [mostrar, setMostrar] = useState(false);
  /** "Trocar" foi apertado: o campo abre vazio mesmo com chave guardada. */
  const [trocando, setTrocando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const entrada = useRef<HTMLInputElement>(null);
  const moldura = useRef<HTMLDivElement>(null);
  const montado = useRef(true);
  // A gravação lê a função pelo ref: uma closure nova do pai não reinicia o debounce.
  const guardar = useRef(aoGuardar);

  useEffect(() => {
    guardar.current = aoGuardar;
  }, [aoGuardar]);

  useEffect(() => {
    montado.current = true;
    return () => {
      montado.current = false;
    };
  }, []);

  const limpo = valor.trim();
  const formatoValido = limpo !== '' && chaveTemFormatoValido(motor, limpo);
  const formatoInvalido = limpo !== '' && !formatoValido;
  const mascarada = situacao === 'guardada' && limpo === '' && !trocando;

  // Guarda sozinho quando o formato fica válido; digitar de novo cancela.
  useEffect(() => {
    setErro(null);
    if (!formatoValido) return undefined;
    const temporizador = window.setTimeout(() => {
      setGuardando(true);
      guardar
        .current(limpo)
        .then(() => {
          if (montado.current) setTrocando(false);
        })
        .catch((e: unknown) => {
          if (montado.current) setErro(paraErroApp(e).mensagem);
        })
        .finally(() => {
          if (montado.current) setGuardando(false);
        });
    }, ATRASO_GUARDAR_MS);
    return () => window.clearTimeout(temporizador);
  }, [limpo, formatoValido]);

  // "Trocar" abre o campo e põe o cursor nele.
  useEffect(() => {
    if (trocando) entrada.current?.focus();
  }, [trocando]);

  const trocar = (): void => {
    setErro(null);
    setTrocando(true);
  };

  const remover = (): void => {
    setErro(null);
    aoRemover().catch((e: unknown) => {
      if (montado.current) setErro(paraErroApp(e).mensagem);
    });
  };

  // Sair do campo vazio (para fora da moldura) volta à máscara.
  const aoSair = (evento: FocusEvent<HTMLInputElement>): void => {
    if (!trocando || limpo !== '') return;
    const destino = evento.relatedTarget;
    if (destino instanceof Node && moldura.current?.contains(destino)) return;
    setTrocando(false);
  };

  const aoTecla = (evento: KeyboardEvent<HTMLInputElement>): void => {
    if (evento.key === 'Escape' && trocando && limpo === '') {
      evento.preventDefault();
      setTrocando(false);
    }
  };

  const prefixo = PREFIXO_CHAVE[motor];
  const dica = dicaDoCampo({ mascarada, erro, formatoValido, formatoInvalido, opcional: props.opcional === true, prefixo });
  const tom = erro !== null || formatoInvalido ? 'erro' : mascarada || formatoValido ? 'ok' : 'neutra';

  return (
    <div className="st-chave">
      <div className="st-chave__rotulo">
        <span className={`marcador ${motor === 'claude' ? 'marcador--ambar' : 'marcador--azul'}`} />
        <span>{props.rotulo}</span>
        <span className="st-chave__desc">{props.descricao}</span>
        {props.opcional ? <span className="st-chave__opcional">opcional no modo escrita</span> : null}
      </div>

      <div ref={moldura} className={`st-chave__campo${tom === 'ok' ? ' st-chave__campo--ok' : tom === 'erro' ? ' st-chave__campo--erro' : ''}`}>
        {mascarada ? (
          <>
            <span className="st-chave__mascara" aria-hidden="true">
              {MASCARA}
            </span>
            <span className="st-chave__valida" aria-hidden="true">
              <IconeCheque tamanho={14} />
            </span>
            <button type="button" className="st-chave__acao" onClick={trocar}>
              Trocar
            </button>
            <button type="button" className="st-chave__acao st-chave__acao--discreta" onClick={remover}>
              Remover
            </button>
          </>
        ) : (
          <>
            <input
              ref={entrada}
              type={mostrar ? 'text' : 'password'}
              value={valor}
              onChange={(e) => props.aoMudar(e.target.value)}
              onBlur={aoSair}
              onKeyDown={aoTecla}
              placeholder={`${prefixo}…`}
              spellCheck={false}
              autoComplete="off"
              autoCapitalize="off"
              aria-label={`Chave de API do ${props.rotulo}`}
              aria-invalid={formatoInvalido || erro !== null}
              readOnly={guardando}
            />
            {formatoValido ? (
              <span className="st-chave__valida" aria-hidden="true">
                <IconeCheque tamanho={14} />
              </span>
            ) : null}
            <button
              type="button"
              className="st-chave__olho"
              onClick={() => setMostrar((m) => !m)}
              aria-label="Mostrar ou ocultar a chave"
              aria-pressed={mostrar}
            >
              {mostrar ? <IconeOlhoFechado tamanho={15} /> : <IconeOlho tamanho={15} />}
            </button>
          </>
        )}
      </div>

      <div className={`st-chave__dica${tom === 'ok' ? ' st-chave__dica--ok' : tom === 'erro' ? ' st-chave__dica--erro' : ''}`} aria-live="polite">
        {dica}
      </div>
    </div>
  );
}

function dicaDoCampo(p: {
  mascarada: boolean;
  erro: string | null;
  formatoValido: boolean;
  formatoInvalido: boolean;
  opcional: boolean;
  prefixo: string;
}): string {
  if (p.erro !== null) return p.erro;
  if (p.mascarada) return 'Chave guardada no keychain do sistema.';
  // Texto do protótipo; a gravação segue em milissegundos e o campo vira a máscara.
  if (p.formatoValido) return 'Formato válido. Guardada no keychain do sistema.';
  if (p.formatoInvalido) {
    return `Formato inválido — a chave começa com ${p.prefixo} e tem ao menos vinte caracteres depois do prefixo.`;
  }
  if (p.opcional) {
    return 'Opcional no modo escrita — necessária apenas para alternar para voz durante a sessão.';
  }
  return `Prefixo ${p.prefixo}. Validação de formato ao digitar; a chave nunca é exibida por padrão.`;
}
