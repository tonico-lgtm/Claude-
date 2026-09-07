/**
 * Raiz do app — roteador de telas: setup → sessão → fim de sessão.
 *
 * É o único lugar que importa a `plataforma` concreta; as telas a recebem
 * por props (`screens/contratos.ts`). Aqui vivem a configuração (com a
 * pasta já resolvida), o progresso lido dessa pasta e a tela atual.
 */

import { useEffect, useRef, useState } from 'react';
import { plataforma } from './platform';
import type { Plataforma } from './platform';
import { FimDeSessao } from './screens/FimDeSessao';
import { Sessao } from './screens/Sessao';
import { Setup } from './screens/Setup';
import type { ResultadoSessao } from './screens/contratos';
import { paraErroApp } from './shared/tipos';
import type { ConfiguracaoApp, InfoSistema, NumeroSessao, Progresso } from './shared/tipos';
import './App.css';

type Tela =
  | { readonly nome: 'setup' }
  | { readonly nome: 'sessao'; readonly sessao: NumeroSessao; readonly retomarDoBlocoId: string | null }
  | { readonly nome: 'fim'; readonly resultado: ResultadoSessao };

/** O que o app precisa ter em mãos antes de mostrar qualquer tela. */
interface Dados {
  readonly info: InfoSistema;
  /** `pasta` sempre resolvida: a escolhida ou a padrão da plataforma. */
  readonly config: ConfiguracaoApp;
  readonly progresso: Progresso;
}

type Carga =
  | { readonly fase: 'carregando' }
  | { readonly fase: 'erro'; readonly mensagem: string }
  | { readonly fase: 'pronto'; readonly dados: Dados };

async function carregarDados(p: Plataforma): Promise<Dados> {
  const [info, lida] = await Promise.all([p.sistema.info(), p.config.ler()]);
  const pasta = lida.pasta ?? (await p.destino.padrao());
  const progresso = await p.progresso.ler(pasta);
  return { info, config: { ...lida, pasta }, progresso };
}

function registrarFalha(contexto: string, e: unknown): void {
  console.error(`[app] ${contexto}`, paraErroApp(e));
}

export function App(): JSX.Element {
  const [carga, setCarga] = useState<Carga>({ fase: 'carregando' });
  const [tela, setTela] = useState<Tela>({ nome: 'setup' });
  const [tentativa, setTentativa] = useState(0);
  // Guarda contra o efeito duplo do StrictMode; muda só em "Tentar de novo".
  const tentativaCarregada = useRef(-1);
  const montado = useRef(true);
  // Última configuração commitada, para quem decide fora do render.
  const configRef = useRef<ConfiguracaoApp | null>(null);

  useEffect(() => {
    montado.current = true;
    return () => {
      montado.current = false;
    };
  }, []);

  useEffect(() => {
    configRef.current = carga.fase === 'pronto' ? carga.dados.config : null;
  });

  useEffect(() => {
    if (tentativaCarregada.current === tentativa) return;
    tentativaCarregada.current = tentativa;
    setCarga({ fase: 'carregando' });
    carregarDados(plataforma)
      .then((dados) => {
        if (montado.current) setCarga({ fase: 'pronto', dados });
      })
      .catch((e: unknown) => {
        if (montado.current) setCarga({ fase: 'erro', mensagem: paraErroApp(e).mensagem });
      });
  }, [tentativa]);

  /** Só mexe nos dados quando já carregados; fora disso, ignora. */
  const atualizarDados = (f: (d: Dados) => Dados): void => {
    setCarga((c) => (c.fase === 'pronto' ? { fase: 'pronto', dados: f(c.dados) } : c));
  };

  const relerProgresso = (pasta: string, pastaAnterior: string | null): void => {
    plataforma.progresso
      .ler(pasta)
      .then((progresso) => {
        if (!montado.current) return;
        // Só vale se a pasta ainda for esta: o usuário pode ter trocado de novo.
        atualizarDados((d) => (d.config.pasta === pasta ? { ...d, progresso } : d));
      })
      .catch((e: unknown) => {
        if (!montado.current) return;
        registrarFalha(`falha ao ler o progresso em «${pasta}»`, e);
        // Sem leitura não se sabe o estado dessa pasta: volta só a pasta à
        // anterior, preservando o que mais tenha mudado nesse meio-tempo.
        const atual = configRef.current;
        if (atual === null || atual.pasta !== pasta) return;
        const revertida: ConfiguracaoApp = { ...atual, pasta: pastaAnterior };
        atualizarDados((d) => ({ ...d, config: revertida }));
        plataforma.config.gravar(revertida).catch((erro: unknown) => registrarFalha('falha ao gravar a configuração', erro));
      });
  };

  const aoMudarConfig = (nova: ConfiguracaoApp): void => {
    if (carga.fase !== 'pronto') return;
    const pastaAnterior = carga.dados.config.pasta;
    atualizarDados((d) => ({ ...d, config: nova }));
    plataforma.config.gravar(nova).catch((e: unknown) => registrarFalha('falha ao gravar a configuração', e));
    if (nova.pasta !== null && nova.pasta !== pastaAnterior) relerProgresso(nova.pasta, pastaAnterior);
  };

  const aoIniciar = (sessao: NumeroSessao, retomarDoBlocoId: string | null): void => {
    setTela({ nome: 'sessao', sessao, retomarDoBlocoId });
  };

  const aoEncerrar = (resultado: ResultadoSessao): void => {
    atualizarDados((d) => ({ ...d, progresso: resultado.progresso }));
    setTela({ nome: 'fim', resultado });
  };

  // Emendar a próxima sessão ou retomar a atual. O progresso em memória já é
  // o gravado no encerramento; a releitura é só uma segurança a mais.
  const aoContinuar = (sessao: NumeroSessao, retomarDoBlocoId: string | null): void => {
    if (carga.fase !== 'pronto') return;
    const pasta = carga.dados.config.pasta;
    const seguir = (): void => {
      if (montado.current) setTela({ nome: 'sessao', sessao, retomarDoBlocoId });
    };
    if (pasta === null) {
      seguir();
      return;
    }
    plataforma.progresso
      .ler(pasta)
      .then((progresso) => {
        if (montado.current) atualizarDados((d) => ({ ...d, progresso }));
      })
      .catch((e: unknown) => registrarFalha('falha ao reler o progresso antes de continuar', e))
      .finally(seguir);
  };

  const aoFechar = (): void => {
    plataforma.sistema.fechar().catch((e: unknown) => registrarFalha('falha ao fechar o app', e));
  };

  const tentarDeNovo = (): void => {
    setTentativa((t) => t + 1);
  };

  if (carga.fase === 'carregando') {
    return (
      <div className="app app-carga" role="status" aria-live="polite">
        <span className="marca">Entrevista Twin</span>
        <span className="app-carga__texto">carregando…</span>
      </div>
    );
  }

  if (carga.fase === 'erro') {
    return (
      <div className="app app-carga" role="alert">
        <span className="marca">Entrevista Twin</span>
        <h1 className="titulo app-carga__titulo">Não foi possível abrir o app.</h1>
        <p className="app-carga__erro">{carga.mensagem}</p>
        <div className="app-carga__acoes">
          <button type="button" className="botao" onClick={tentarDeNovo}>
            Tentar de novo
          </button>
        </div>
      </div>
    );
  }

  const { dados } = carga;

  switch (tela.nome) {
    case 'setup':
      return (
        <Setup
          plataforma={plataforma}
          info={dados.info}
          config={dados.config}
          progresso={dados.progresso}
          aoMudarConfig={aoMudarConfig}
          aoIniciar={aoIniciar}
        />
      );
    case 'sessao':
      return (
        <Sessao
          // Cada sessão nasce num componente novo: o controlador começa do zero.
          key={`sessao-${tela.sessao}`}
          plataforma={plataforma}
          info={dados.info}
          config={dados.config}
          progresso={dados.progresso}
          sessao={tela.sessao}
          retomarDoBlocoId={tela.retomarDoBlocoId}
          aoMudarConfig={aoMudarConfig}
          aoEncerrar={aoEncerrar}
        />
      );
    case 'fim':
      return (
        <FimDeSessao
          plataforma={plataforma}
          info={dados.info}
          config={dados.config}
          resultado={tela.resultado}
          aoContinuar={aoContinuar}
          aoFechar={aoFechar}
        />
      );
  }
}
