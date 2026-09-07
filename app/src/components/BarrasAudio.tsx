/**
 * Indicador de áudio: sete barras finas que pulsam enquanto a entrevistadora
 * lê (azul) ou o cliente fala (âmbar). Ouvindo, o nível RMS do microfone
 * escala as barras além da animação.
 */

export interface PropsBarrasAudio {
  readonly estado: 'falando' | 'ouvindo' | 'parada';
  /** RMS 0..1 do microfone; só importa quando `estado` é 'ouvindo'. */
  readonly nivel: number;
}

const ALTURAS: readonly number[] = [10, 18, 26, 16, 24, 14, 20];

/** RMS de fala fica em torno de 0,02–0,2: amplia para a escala das barras. */
function escalaDoNivel(nivel: number): number {
  return Math.min(1.4, Math.max(0.5, 0.5 + nivel * 6));
}

export function BarrasAudio({ estado, nivel }: PropsBarrasAudio): JSX.Element {
  const ativa = estado !== 'parada';
  const escala = estado === 'ouvindo' ? escalaDoNivel(nivel) : 1;
  return (
    <span className={`ss-barras ss-barras--${estado}`} aria-hidden="true">
      {ALTURAS.map((altura, i) => (
        <span
          key={i}
          className="ss-barras__nivel"
          style={{ transform: `scaleY(${escala})` }}
        >
          <span
            className={`ss-barras__barra${ativa ? ' ss-barras__barra--ativa' : ''}`}
            style={{
              height: altura,
              animationDuration: `${0.9 + (i % 3) * 0.18}s`,
              animationDelay: `${i * 0.09}s`,
            }}
          />
        </span>
      ))}
    </span>
  );
}
