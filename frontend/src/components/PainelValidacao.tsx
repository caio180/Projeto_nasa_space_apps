// Validação científica: COMO a similaridade é medida e COMO as diferenças de
// escala e de atmosfera entre os sensores da Terra e os planetários são
// compensadas (pedido dos mentores da NASA). Tudo vem do backend
// (/api/compatibilidade → validacao).

import { useState } from 'react';
import type { Rugosidade, ValidacaoCientifica } from '../types.ts';

interface Props {
  validacao: ValidacaoCientifica;
  nomeTerra: string;
  nomeAlvo: string;
}

const f = (n: number, casas = 1) => n.toLocaleString('pt-BR', { maximumFractionDigits: casas });
const distancia = (m: number) => (m >= 1000 ? `${f(m / 1000)} km` : `${f(m, 0)} m`);

// ---- Gráfico log-log: desvio de altura × distância ----
const L = 560;
const A = 260;
const M = { esq: 56, dir: 150, topo: 16, base: 40 }; // margem direita = rótulos diretos

/** Marcas 1, 2, 5 × 10ⁿ dentro do intervalo. */
function marcasLog(min: number, max: number) {
  const marcas: number[] = [];
  for (let p = Math.floor(Math.log10(min)); p <= Math.ceil(Math.log10(max)); p++) {
    for (const m of [1, 2, 5]) {
      const v = m * 10 ** p;
      if (v >= min && v <= max) marcas.push(v);
    }
  }
  return marcas;
}

function GraficoRugosidade({
  terra,
  alvo,
  nomeTerra,
  nomeAlvo,
}: {
  terra: Rugosidade;
  alvo: Rugosidade;
  nomeTerra: string;
  nomeAlvo: string;
}) {
  const [foco, setFoco] = useState<number | null>(null);
  const todos = [...terra.pontos, ...alvo.pontos];
  if (todos.length === 0) return null;

  const xMin = Math.min(...todos.map((p) => p.baseM)) / 1.3;
  const xMax = Math.max(...todos.map((p) => p.baseM)) * 1.3;
  // 0,1 m = precisão da grade: um terreno totalmente plano fica no piso do gráfico.
  const yMin = Math.max(0.08, Math.min(...todos.map((p) => Math.max(p.desvioM, 0.1))) / 1.6);
  const yMax = Math.max(...todos.map((p) => p.desvioM)) * 1.6;
  const x = (v: number) =>
    M.esq + ((Math.log10(v) - Math.log10(xMin)) / (Math.log10(xMax) - Math.log10(xMin))) * (L - M.esq - M.dir);
  const y = (v: number) =>
    A - M.base - ((Math.log10(Math.max(v, 0.1)) - Math.log10(yMin)) / (Math.log10(yMax) - Math.log10(yMin))) * (A - M.topo - M.base);

  const series = [
    { nome: nomeTerra, classe: 'serie-terra', dados: terra },
    { nome: nomeAlvo, classe: 'serie-alvo', dados: alvo },
  ];
  const linha = (r: Rugosidade) => r.pontos.map((p, i) => `${i ? 'L' : 'M'}${x(p.baseM)},${y(p.desvioM)}`).join(' ');
  const n = Math.max(terra.pontos.length, alvo.pontos.length);
  const pontoFoco = foco !== null ? (terra.pontos[foco] ?? alvo.pontos[foco]) : null;

  return (
    <figure className="grafico-rugosidade">
      <div className="legenda-series" aria-hidden="true">
        {series.map((s) => (
          <span key={s.classe}>
            <span className={`amostra-serie ${s.classe}`} /> {s.nome}
          </span>
        ))}
      </div>
      <div className="grafico-area">
        <svg
          viewBox={`0 0 ${L} ${A}`}
          role="img"
          aria-label={`Desvio de altura por distância, em escala logarítmica, para ${nomeTerra} e ${nomeAlvo}`}
          onMouseLeave={() => setFoco(null)}
        >
          {/* grade e eixos recessivos */}
          {marcasLog(yMin, yMax).map((v) => (
            <g key={`y${v}`} className="grade">
              <line x1={M.esq} x2={L - M.dir} y1={y(v)} y2={y(v)} />
              <text x={M.esq - 6} y={y(v)} textAnchor="end" dominantBaseline="middle">
                {f(v, 1)}
              </text>
            </g>
          ))}
          {marcasLog(xMin, xMax).map((v) => (
            <text key={`x${v}`} className="grade" x={x(v)} y={A - M.base + 16} textAnchor="middle">
              {distancia(v)}
            </text>
          ))}
          <text className="titulo-eixo" x={M.esq} y={A - 6}>
            distância entre os pontos →
          </text>
          <text className="titulo-eixo" x={10} y={M.topo} transform={`rotate(-90 10 ${M.topo})`} textAnchor="end">
            desvio de altura (m)
          </text>

          {/* mira vertical no ponto em foco */}
          {pontoFoco && (
            <line className="mira" x1={x(pontoFoco.baseM)} x2={x(pontoFoco.baseM)} y1={M.topo} y2={A - M.base} />
          )}

          {series.map((s) => (
            <g key={s.classe} className={s.classe}>
              <path d={linha(s.dados)} className="linha-serie" />
              {s.dados.pontos.map((p, i) => (
                <circle key={i} cx={x(p.baseM)} cy={y(p.desvioM)} r={foco === i ? 5.5 : 4} className="ponto-serie" />
              ))}
              {/* rótulo direto no fim da linha */}
              {s.dados.pontos.length > 0 && (
                <text
                  className="rotulo-direto"
                  x={x(s.dados.pontos[s.dados.pontos.length - 1].baseM) + 10}
                  y={y(s.dados.pontos[s.dados.pontos.length - 1].desvioM)}
                  dominantBaseline="middle"
                >
                  {s.nome.length > 20 ? `${s.nome.slice(0, 19)}…` : s.nome}
                </text>
              )}
            </g>
          ))}

          {/* áreas de toque (maiores que o ponto), uma por distância */}
          {Array.from({ length: n }, (_, i) => {
            const base = (terra.pontos[i] ?? alvo.pontos[i]).baseM;
            const largura = (L - M.esq - M.dir) / n;
            return (
              <rect
                key={i}
                x={x(base) - largura / 2}
                y={M.topo}
                width={largura}
                height={A - M.topo - M.base}
                fill="transparent"
                onMouseEnter={() => setFoco(i)}
                onFocus={() => setFoco(i)}
                tabIndex={0}
                aria-label={`${distancia(base)}: ${nomeTerra} ${f(terra.pontos[i]?.desvioM ?? 0)} m, ${nomeAlvo} ${f(alvo.pontos[i]?.desvioM ?? 0)} m`}
              />
            );
          })}
        </svg>
        {foco !== null && pontoFoco && (
          <div
            className="dica-grafico"
            style={{ left: `${(x(pontoFoco.baseM) / L) * 100}%` }}
            role="status"
          >
            <strong>{distancia(pontoFoco.baseM)}</strong>
            {series.map((s) => {
              const p = s.dados.pontos[foco];
              return (
                p && (
                  <span key={s.classe}>
                    <span className={`amostra-serie ${s.classe}`} /> {s.nome}: {f(p.desvioM)} m ({f(p.declivRmsGraus)}°)
                  </span>
                )
              );
            })}
          </div>
        )}
      </div>
      <figcaption className="ajuda">
        Escala logarítmica nos dois eixos. Linhas paralelas = mesmo tipo de rugosidade; distância vertical entre elas =
        quantas vezes um terreno é mais rugoso que o outro. A inclinação é o expoente de Hurst.
      </figcaption>
    </figure>
  );
}

export function PainelValidacao({ validacao: v, nomeTerra, nomeAlvo }: Props) {
  const { escala, rugosidade } = v;
  return (
    <section className="painel">
      <div>
        <h2>Validação científica</h2>
        <p className="ajuda">
          Como a similaridade é medida e como compensamos as diferenças de escala e de atmosfera entre os sensores da
          Terra e os de {nomeAlvo}.
        </p>
      </div>

      <ol className="passos-metodo">
        {v.passos.map((p) => (
          <li key={p.titulo}>
            <strong>{p.titulo}</strong>
            <span>{p.texto}</span>
          </li>
        ))}
      </ol>

      <div className={escala.superamostrado ? 'alerta' : 'caixa-ok'} role={escala.superamostrado ? 'alert' : undefined}>
        <strong>Escala:</strong> pixel comum de {f(escala.pixelComumM)} m · resolução nativa da Terra {f(escala.nativaTerraM)}{' '}
        m e de {nomeAlvo} {f(escala.nativaAlvoM)} m ·{' '}
        {escala.superamostrado ? 'superamostrado — reduza a grade' : 'sem detalhe inventado'}
      </div>

      <div>
        <h3>
          Rugosidade em várias escalas{' '}
          {rugosidade.nota !== null && <span className="nota-pequena">nota {rugosidade.nota}</span>}
        </h3>
        <p>{rugosidade.leitura}</p>
        <GraficoRugosidade terra={rugosidade.terra} alvo={rugosidade.alvo} nomeTerra={nomeTerra} nomeAlvo={nomeAlvo} />
        <details className="fontes">
          <summary>Ver tabela e a regra da nota</summary>
          <div className="tabela-rolagem">
            <table className="tabela-comparacao">
              <thead>
                <tr>
                  <th scope="col">Distância</th>
                  <th scope="col">{nomeTerra}</th>
                  <th scope="col">{nomeAlvo}</th>
                  <th scope="col">Razão</th>
                </tr>
              </thead>
              <tbody>
                {rugosidade.razoes.map((r, i) => (
                  <tr key={r.baseM}>
                    <th scope="row">{distancia(r.baseM)}</th>
                    <td>
                      {f(rugosidade.terra.pontos[i].desvioM)} m ({f(rugosidade.terra.pontos[i].declivRmsGraus)}°)
                    </td>
                    <td>
                      {f(rugosidade.alvo.pontos[i].desvioM)} m ({f(rugosidade.alvo.pontos[i].declivRmsGraus)}°)
                    </td>
                    <td>{f(r.razao, 2)}×</td>
                  </tr>
                ))}
                <tr>
                  <th scope="row">Expoente de Hurst</th>
                  <td>{rugosidade.terra.hurst === null ? '—' : f(rugosidade.terra.hurst, 2)}</td>
                  <td>{rugosidade.alvo.hurst === null ? '—' : f(rugosidade.alvo.hurst, 2)}</td>
                  <td />
                </tr>
              </tbody>
            </table>
          </div>
          <p className="ajuda">{rugosidade.regra}</p>
        </details>
      </div>

      <div>
        <h3>Sensores e compensação de atmosfera</h3>
        <div className="tabela-rolagem">
          <table className="tabela-comparacao tabela-sensores">
            <thead>
              <tr>
                <th scope="col" />
                {v.sensores.map((s) => (
                  <th key={s.corpo} scope="col">
                    {s.corpo}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">Relevo</th>
                {v.sensores.map((s) => (
                  <td key={s.corpo}>
                    <strong>{s.relevo.produto}</strong> · {f(s.relevo.nativaM)} m nativo
                    <span className="sub">{s.relevo.tecnica}</span>
                  </td>
                ))}
              </tr>
              <tr>
                <th scope="row">Foto</th>
                {v.sensores.map((s) => (
                  <td key={s.corpo}>
                    <strong>{s.foto.produto}</strong> · {s.foto.faixa} · {f(s.foto.pixelNativoM)} m
                  </td>
                ))}
              </tr>
              <tr>
                <th scope="row">Atmosfera</th>
                {v.sensores.map((s) => (
                  <td key={s.corpo}>{s.atmosfera}</td>
                ))}
              </tr>
              <tr>
                <th scope="row">Compensação</th>
                {v.sensores.map((s) => (
                  <td key={s.corpo}>{s.compensacao}</td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <details className="fontes">
        <summary>Limitações conhecidas e referências</summary>
        <ul>
          {v.limites.map((l) => (
            <li key={l}>{l}</li>
          ))}
          {v.referencias.map((r) => (
            <li key={r.url}>
              <a href={r.url} target="_blank" rel="noreferrer">
                {r.titulo}
              </a>
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}
