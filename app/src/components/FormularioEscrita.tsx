/**
 * Modo escrita: o cliente digita a resposta (ou o comentário da múltipla
 * escolha, ou a resposta ao aprofundamento) e registra. A escolha da opção
 * fica na tela, porque a lista de opções é desenhada acima do card "Claude";
 * aqui entra só o rascunho.
 *
 * O texto registrado numa múltipla escolha é "C — <opção>" + " <comentário>".
 */

import { useState } from 'react';
import type { KeyboardEvent } from 'react';

import type { Pergunta } from '../roteiro/roteiro';
import { RESPOSTAS_FICTICIAS, respostaFicticia } from '../services/simulacao';
import { IconeCheque } from './Icones';

export interface PropsFormularioEscrita {
  readonly pergunta: Pergunta;
  readonly aprofundamentoAberto: boolean;
  /** A pergunta principal já tem resposta registrada. */
  readonly respondida: boolean;
  /** Fase ociosa e sem pausa: o motor aceita `respostaRegistrada`. */
  readonly podeRegistrar: boolean;
  /** Opção escolhida (múltipla escolha), controlada pela tela. */
  readonly escolha: number | null;
  aoEscolher(indice: number): void;
  aoRegistrar(texto: string): void;
}

const LETRAS = 'ABCDEFGHIJ';

export function letraDaOpcao(indice: number): string {
  return LETRAS.charAt(indice) || String(indice + 1);
}

export function FormularioEscrita(p: PropsFormularioEscrita): JSX.Element {
  const [rascunho, setRascunho] = useState('');

  const multipla = p.pergunta.tipo === 'multipla' && !p.aprofundamentoAberto;
  const texto = rascunho.trim();
  const vazio = multipla ? p.escolha === null : texto === '';
  const desabilitado = !p.podeRegistrar || vazio;

  const rotulo = p.aprofundamentoAberto
    ? 'Resposta ao aprofundamento'
    : multipla
      ? 'Comentário (opcional)'
      : 'Sua resposta';
  const dica = p.aprofundamentoAberto
    ? 'Dê o exemplo concreto pedido…'
    : multipla
      ? 'Escolha uma opção acima; comente se quiser.'
      : 'Escreva a resposta como falaria.';

  const registrar = (): void => {
    if (desabilitado) return;
    let final = texto;
    if (multipla) {
      const indice = p.escolha ?? -1;
      const opcao = p.pergunta.opcoes?.[indice];
      if (opcao === undefined) return;
      final = `${letraDaOpcao(indice)} — ${opcao}${texto ? ` ${texto}` : ''}`;
    }
    if (final === '') return;
    p.aoRegistrar(final);
    setRascunho('');
  };

  const preencher = (): void => {
    if (p.aprofundamentoAberto) {
      setRascunho(respostaFicticia(p.pergunta.id, true) ?? '');
      return;
    }
    if (multipla) {
      p.aoEscolher(RESPOSTAS_FICTICIAS[p.pergunta.id]?.escolha ?? 0);
      setRascunho('');
      return;
    }
    setRascunho(respostaFicticia(p.pergunta.id, false) ?? '');
  };

  const aoTeclar = (e: KeyboardEvent<HTMLTextAreaElement>): void => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      registrar();
    }
  };

  return (
    <div className="ss-escrita">
      <div className="ss-escrita__rotulo">
        <span>{rotulo}</span>
        {p.respondida && (
          <span className="ss-escrita__registrada">
            <IconeCheque tamanho={12} />
            registrada na transcrição
          </span>
        )}
      </div>
      <textarea
        className="ss-escrita__texto"
        rows={4}
        value={rascunho}
        onChange={(e) => setRascunho(e.target.value)}
        onKeyDown={aoTeclar}
        placeholder={dica}
        spellCheck={false}
        aria-label={rotulo}
      />
      <div className="ss-escrita__acoes">
        <button type="button" className="ss-escrita__exemplo" onClick={preencher}>
          Preencher com exemplo
        </button>
        <span className="ss-escrita__atalho">Ctrl/⌘ + Enter registra</span>
        <span className="espaco" />
        <button
          type="button"
          className="botao botao--azul ss-escrita__registrar"
          disabled={desabilitado}
          onClick={registrar}
        >
          Registrar resposta
        </button>
      </div>
    </div>
  );
}
