// Mostra a nota de cada critério (0% a 100%, com a regra escrita), Terra × Marte/Lua,
// o Resultado Geral (média dos critérios avaliados), as incompatibilidades com o
// provável motivo e os limites que a Terra não reproduz. O cálculo é feito no
// backend (model/compatibilidadeModel.ts). A ordem entre os locais analisados
// continua usando a distância ponderada do objetivo escolhido (painel do ranking).

import type { ResultadoCompatibilidade } from '../types.ts';

interface Props {
  resultado: ResultadoCompatibilidade | null;
  carregando: boolean;
  erro: string | null;
}

/** Cor da barra conforme a nota (mesmo limiar das incompatibilidades). */
function classeNota(n: number | null, limiar: number) {
  if (n === null) return 'nota-vazia';
  if (n < limiar) return 'nota-baixa';
  if (n < 75) return 'nota-media';
  return 'nota-alta';
}

export function PainelCompatibilidade({ resultado, carregando, erro }: Props) {
  if (carregando) {
    return (
      <section className="painel">
        <h2>Notas por critério</h2>
        <p className="ajuda">Calculando: relevo, clima, vegetação, solo e geologia…</p>
      </section>
    );
  }
  if (erro) {
    return (
      <section className="painel">
        <h2>Notas por critério</h2>
        <p className="erro-texto">{erro}</p>
      </section>
    );
  }
  if (!resultado) return null;

  const r = resultado;
  const limiar = r.metodo.limiarIncompatibilidade;

  return (
    <section className="painel compatibilidade">
      <div>
        <h2>Notas por critério</h2>
        <p className="ajuda">
          {r.terra.nome} × {r.alvo.corpo} · {r.alvo.nome}. Cada critério vai de 0% a 100% de semelhança, pela regra
          escrita nele.
        </p>
      </div>

      <ul className="barras" aria-label="Nota por dimensão">
        {r.dimensoes.map((d) => (
          <li key={d.chave}>
            <div className="barra-topo">
              <span>{d.nome}</span>
              <strong>{d.pontuacao === null ? 'sem dado' : `${d.pontuacao}%`}</strong>
            </div>
            <div className="barra-trilho" aria-hidden="true">
              <div
                className={`barra-preenchida ${classeNota(d.pontuacao, limiar)}`}
                style={{ width: `${d.pontuacao ?? 0}%` }}
              />
            </div>
            <details>
              <summary>
                Terra: {d.terra} · {r.alvo.corpo}: {d.alvo}
              </summary>
              <p className="ajuda">
                <strong>Como foi calculado:</strong> {d.regra} <em>Fonte: {d.fonte}.</em>
              </p>
            </details>
          </li>
        ))}
      </ul>

      {/* Resultado Geral: consolida todos os critérios avaliados acima. */}
      <div className="resultado-geral">
        <h3>Resultado Geral</h3>
        <div className="resultado-geral-corpo">
          <span className={`resultado-geral-valor ${classeNota(r.geral, limiar)}`}>
            {r.geral === null ? '—' : `${r.geral}%`}
          </span>
          <div className="resultado-geral-texto">
            <strong>
              de similaridade entre {r.terra.nome} e {r.alvo.nome} ({r.alvo.corpo})
            </strong>
            <div className="barra-trilho" aria-hidden="true">
              <div
                className={`barra-preenchida ${classeNota(r.geral, limiar)}`}
                style={{ width: `${r.geral ?? 0}%` }}
              />
            </div>
            <span className="ajuda">
              Média, com o mesmo peso, dos {r.dimensoes.filter((d) => d.pontuacao !== null).length} critérios com dado
              {r.dimensoes.some((d) => d.pontuacao === null) &&
                (() => {
                  const n = r.dimensoes.filter((d) => d.pontuacao === null).length;
                  return n === 1 ? ' (1 critério sem dado fica fora da conta)' : ` (${n} critérios sem dado ficam fora da conta)`;
                })()}
              .{r.foco !== null && ` Só nos critérios em que este análogo é forte: ${r.foco}%.`} Não inclui gravidade,
              pressão e radiação, que nenhum lugar da Terra reproduz.
            </span>
          </div>
        </div>
      </div>

      {r.incompatibilidades.length > 0 && (
        <div className="incompatibilidades">
          <h3>Incompatibilidades detectadas (nota abaixo de {limiar}% ou sem dado)</h3>
          <ul>
            {r.incompatibilidades.map((i) => (
              <li key={i.nome}>
                <strong>
                  {i.nome} — {i.pontuacao === null ? 'sem dado' : `${i.pontuacao}%`}
                </strong>
                <p>{i.motivo}</p>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <h3>Limites que nenhum lugar da Terra reproduz (fora da média)</h3>
        <div className="tabela-rolagem">
          <table className="tabela-comparacao">
            <thead>
              <tr>
                <th scope="col">Item</th>
                <th scope="col">Terra</th>
                <th scope="col">{r.alvo.corpo}</th>
                <th scope="col">Consequência</th>
              </tr>
            </thead>
            <tbody>
              {r.limitesTerra.map((l) => (
                <tr key={l.item}>
                  <th scope="row">{l.item}</th>
                  <td>{l.terra}</td>
                  <td>{l.alvo}</td>
                  <td>{l.consequencia}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <details className="fontes">
        <summary>Método e referências</summary>
        <p className="ajuda">{r.metodo.resumo}</p>
        <ul>
          {r.metodo.referencias.map((ref) => (
            <li key={ref.url}>
              <a href={ref.url} target="_blank" rel="noreferrer">
                {ref.titulo}
              </a>
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}
