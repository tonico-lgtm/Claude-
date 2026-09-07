/**
 * Ícones em SVG traçado (traços do protótipo, sem emoji). Cada ícone herda a
 * cor de `currentColor` salvo quando recebe `cor`.
 */

import type { SVGProps } from 'react';

interface PropsIcone extends Omit<SVGProps<SVGSVGElement>, 'stroke'> {
  readonly tamanho?: number;
  readonly cor?: string;
  readonly espessura?: number;
}

function base(
  { tamanho = 13, cor = 'currentColor', espessura = 1.75, ...resto }: PropsIcone,
  filhos: JSX.Element,
): JSX.Element {
  return (
    <svg
      width={tamanho}
      height={tamanho}
      viewBox="0 0 24 24"
      fill="none"
      stroke={cor}
      strokeWidth={espessura}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...resto}
    >
      {filhos}
    </svg>
  );
}

export const IconeMicrofone = (p: PropsIcone) =>
  base(
    p,
    <>
      <path d="M12 19v3" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <rect x="9" y="2" width="6" height="13" rx="3" />
    </>,
  );

export const IconeLapis = (p: PropsIcone) =>
  base(
    p,
    <>
      <path d="M12 20h9" />
      <path d="M16.376 3.622a1 1 0 0 1 3.002 3.002L7.368 18.635a2 2 0 0 1-.855.506l-2.872.838a.5.5 0 0 1-.62-.62l.838-2.872a2 2 0 0 1 .506-.854z" />
    </>,
  );

export const IconeCheque = (p: PropsIcone) => base({ espessura: 2, ...p }, <path d="M20 6 9 17l-5-5" />);

export const IconeChequeCirculo = (p: PropsIcone) =>
  base(
    { espessura: 2, ...p },
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="m9 12 2 2 4-4" />
    </>,
  );

export const IconeOlho = (p: PropsIcone) =>
  base(
    p,
    <>
      <path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" />
      <circle cx="12" cy="12" r="3" />
    </>,
  );

export const IconeOlhoFechado = (p: PropsIcone) =>
  base(
    p,
    <>
      <path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49" />
      <path d="M14.084 14.158a3 3 0 0 1-4.242-4.242" />
      <path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143" />
      <path d="m2 2 20 20" />
    </>,
  );

export const IconeCadeado = (p: PropsIcone) =>
  base(
    p,
    <>
      <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </>,
  );

export const IconePasta = (p: PropsIcone) =>
  base(
    p,
    <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />,
  );

export const IconeArquivo = (p: PropsIcone) =>
  base(
    p,
    <>
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
    </>,
  );

export const IconeSetaBaixo = (p: PropsIcone) => base(p, <path d="m6 9 6 6 6-6" />);

export const IconeSetaCima = (p: PropsIcone) => base(p, <path d="m18 15-6-6-6 6" />);

export const IconeSetaDireita = (p: PropsIcone) =>
  base(
    p,
    <>
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </>,
  );

export const IconeAnterior = (p: PropsIcone) =>
  base(
    p,
    <>
      <polygon points="19 20 9 12 19 4 19 20" />
      <line x1="5" x2="5" y1="19" y2="5" />
    </>,
  );

export const IconePausa = (p: PropsIcone) =>
  base(
    p,
    <>
      <rect x="14" y="4" width="4" height="16" rx="1" />
      <rect x="6" y="4" width="4" height="16" rx="1" />
    </>,
  );

export const IconeTocar = (p: PropsIcone) => base(p, <polygon points="6 3 20 12 6 21 6 3" />);

export const IconeAprofundar = (p: PropsIcone) =>
  base(
    p,
    <>
      <polyline points="15 10 20 15 15 20" />
      <path d="M4 4v7a4 4 0 0 0 4 4h12" />
    </>,
  );

export const IconeParar = (p: PropsIcone) => base({ espessura: 2, ...p }, <rect width="18" height="18" x="3" y="3" rx="1" />);

export const IconeAlerta = (p: PropsIcone) =>
  base(
    p,
    <>
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </>,
  );

export const IconeAltoFalante = (p: PropsIcone) =>
  base(
    p,
    <>
      <path d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z" />
      <path d="M16 9a5 5 0 0 1 0 6" />
      <path d="M19.364 18.364a9 9 0 0 0 0-12.728" />
    </>,
  );

export const IconeFechar = (p: PropsIcone) =>
  base(
    p,
    <>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </>,
  );
