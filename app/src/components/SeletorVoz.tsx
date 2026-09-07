/**
 * Voz da entrevistadora — Helios e Leo, do catálogo Grok Voice.
 *
 * Cada cartão é um rádio; dentro dele, "Ouvir amostra" pede o TTS da frase de
 * amostra à plataforma (o main usa a chave provisionada) e toca o áudio aqui.
 * Como um botão não pode conter outro, o cartão é um `div` com papel de
 * rádio e teclado próprio.
 */

import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent, MouseEvent } from 'react';
import { tocar } from '../audio/reprodutor';
import type { Reproducao } from '../audio/reprodutor';
import { FRASE_DE_AMOSTRA, VOZES, paraErroApp } from '../shared/tipos';
import type { AudioFalado, Modo, VozId } from '../shared/tipos';
import { IconeAltoFalante } from './Icones';

export interface PropsSeletorVoz {
  readonly voz: VozId;
  readonly modo: Modo;
  /** Só com a chave do Grok provisionada a amostra faz sentido. */
  readonly amostraDisponivel: boolean;
  aoMudar(voz: VozId): void;
  /** `plataforma.voz.falar`, passado pelo pai. */
  falar(texto: string, voz: VozId): Promise<AudioFalado>;
}

export function SeletorVoz(props: PropsSeletorVoz): JSX.Element {
  const { voz, modo, amostraDisponivel, aoMudar, falar } = props;
  const [tocando, setTocando] = useState<VozId | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const reproducao = useRef<Reproducao | null>(null);
  /** Número do último pedido: um clique novo descarta o áudio de um pedido antigo. */
  const pedido = useRef(0);
  const montado = useRef(true);

  useEffect(() => {
    montado.current = true;
    return () => {
      montado.current = false;
      reproducao.current?.parar();
      reproducao.current = null;
    };
  }, []);

  const ouvir = async (escolhida: VozId): Promise<void> => {
    reproducao.current?.parar();
    reproducao.current = null;
    const meu = ++pedido.current;
    setErro(null);
    setTocando(escolhida);
    try {
      const audio = await falar(FRASE_DE_AMOSTRA, escolhida);
      if (!montado.current || meu !== pedido.current) return;
      const atual = tocar(audio.audio, audio.mime);
      reproducao.current = atual;
      await atual.fim;
      if (reproducao.current === atual) reproducao.current = null;
    } catch (e) {
      if (montado.current && meu === pedido.current) setErro(paraErroApp(e).mensagem);
    } finally {
      if (montado.current && meu === pedido.current) setTocando(null);
    }
  };

  const aoClicarAmostra = (evento: MouseEvent<HTMLButtonElement>, escolhida: VozId): void => {
    // O clique no botão não deve também selecionar o cartão.
    evento.stopPropagation();
    void ouvir(escolhida);
  };

  const aoTeclaCartao = (evento: KeyboardEvent<HTMLDivElement>, escolhida: VozId): void => {
    if (evento.key === 'Enter' || evento.key === ' ') {
      evento.preventDefault();
      aoMudar(escolhida);
    }
  };

  const escrita = modo === 'escrita';

  return (
    <div className={`st-secao st-secao--voz${escrita ? ' st-secao--apagada' : ''}`}>
      <div className="rotulo st-voz-rotulo">
        <span>Voz da entrevistadora</span>
        {escrita ? <span className="st-voz-rotulo__nota">— não usada no modo escrita</span> : null}
      </div>
      <div role="radiogroup" aria-label="Voz da entrevistadora" className="st-vozes">
        {VOZES.map((v) => {
          const ativa = v.id === voz;
          const tocandoEsta = tocando === v.id;
          return (
            <div
              key={v.id}
              role="radio"
              aria-checked={ativa}
              tabIndex={0}
              className={`st-voz${ativa ? ' st-voz--ativa' : ''}`}
              onClick={() => aoMudar(v.id)}
              onKeyDown={(e) => aoTeclaCartao(e, v.id)}
            >
              <span className="st-voz__cabeca">
                <span className="st-voz__ponto" aria-hidden="true" />
                <span className="st-voz__nome">{v.nome}</span>
                <button
                  type="button"
                  className={`st-voz__amostra${tocandoEsta ? ' st-voz__amostra--tocando' : ''}`}
                  disabled={!amostraDisponivel}
                  title={amostraDisponivel ? `Ouvir uma amostra de ${v.nome}` : 'A amostra precisa da chave do Grok'}
                  aria-label={`Ouvir amostra da voz ${v.nome}`}
                  onClick={(e) => aoClicarAmostra(e, v.id)}
                >
                  <IconeAltoFalante tamanho={11} />
                  {tocandoEsta ? 'Tocando…' : 'Ouvir amostra'}
                </button>
              </span>
              <span className="st-voz__desc">{v.descricao}</span>
            </div>
          );
        })}
      </div>
      <div className="st-nota">Vozes do catálogo Grok Voice. A amostra usa a chave do Grok.</div>
      {erro !== null ? (
        <div className="dica dica--erro" role="alert">
          {erro}
        </div>
      ) : null}
    </div>
  );
}
