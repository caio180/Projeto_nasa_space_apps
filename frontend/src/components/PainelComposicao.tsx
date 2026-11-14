// Composição da superfície: química medida no alvo (NASA GRS, com incerteza)
// ao lado do que já é medido no solo e na rocha da Terra. A química de rochas
// da Terra (óxidos) aparece como pendente: não estimamos para não fingir precisão.

import type { ComposicaoAlvo, MedidasAmbientais, Oxido } from '../types.ts';

interface Props {
  alvo: ComposicaoAlvo | null;
  nomeAlvo: string;
  ambiente: MedidasAmbientais | null;
}

const ORDEM: Oxido[] = ['SiO2', 'Al2O3', 'FeO', 'MgO', 'CaO', 'TiO2', 'K2O'];
const NOME: Record<Oxido, string> = {
  SiO2: 'SiO₂ (sílica)',
  Al2O3: 'Al₂O₃ (alumina)',
  FeO: 'FeO (ferro)',
  MgO: 'MgO (magnésio)',
  CaO: 'CaO (cálcio)',
  TiO2: 'TiO₂ (titânio)',
  K2O: 'K₂O (potássio)',
};

const f = (n: number, casas = 1) => n.toLocaleString('pt-BR', { maximumFractionDigits: casas });

export function PainelComposicao({ alvo, nomeAlvo, ambiente }: Props) {
  if (!alvo) return null;
  const solo = ambiente?.solo;
  const geo = ambiente?.geologia;

  return (
    <section className="painel">
      <div>
        <h2>Composição da superfície</h2>
        <p className="ajuda">
          {alvo.corpo} · {nomeAlvo} — {alvo.instrumento}, célula {f(alvo.celula.latMin)}° a {f(alvo.celula.latMax)}° de
          latitude, {f(alvo.celula.lonMin)}° a {f(alvo.celula.lonMax)}° de longitude.
        </p>
      </div>

      <div className="tabela-rolagem">
        <table className="tabela-comparacao">
          <thead>
            <tr>
              <th scope="col">Óxido (% do peso)</th>
              <th scope="col">{alvo.corpo} (medido ± 1σ)</th>
              <th scope="col">Terra</th>
            </tr>
          </thead>
          <tbody>
            {ORDEM.filter((o) => alvo.oxidos[o] !== undefined).map((o) => {
              const v = alvo.oxidos[o]!;
              const s = alvo.incerteza[o];
              const impreciso = s !== undefined && s >= v; // a incerteza é do tamanho do valor
              return (
                <tr key={o}>
                  <th scope="row">{NOME[o]}</th>
                  <td className={impreciso ? 'valor-impreciso' : undefined}>
                    {f(v, 2)}
                    {s !== undefined && ` ± ${f(s, 2)}`}
                    {impreciso && ' (pouco preciso)'}
                  </td>
                  <td>
                    <span className="indisponivel">pendente</span>
                  </td>
                </tr>
              );
            })}
            {alvo.agua !== null && (
              <tr>
                <th scope="row">H₂O no subsolo raso</th>
                <td>{f(alvo.agua, 2)} (gelo e minerais hidratados — recurso para a base)</td>
                <td>—</td>
              </tr>
            )}
            {alvo.cloro !== null && (
              <tr>
                <th scope="row">Cl (sais)</th>
                <td>{f(alvo.cloro, 2)}</td>
                <td>—</td>
              </tr>
            )}
            {alvo.torio !== null && (
              <tr>
                <th scope="row">Th (ppm)</th>
                <td>{f(alvo.torio, 2)}</td>
                <td>—</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div>
        <h3>O que já é medido na Terra (mesmo ponto do análogo)</h3>
        <dl className="estatisticas">
          <dt>Rocha (Macrostrat)</dt>
          <dd>{geo ? [geo.litologia, geo.unidade, geo.idade].filter(Boolean).join(' · ') : 'indisponível'}</dd>
          {solo && !solo.semSoloMapeado ? (
            <>
              <dt>Textura (areia / silte / argila)</dt>
              <dd>
                {solo.areia ?? '—'}% / {solo.silte ?? '—'}% / {solo.argila ?? '—'}%
              </dd>
              <dt>pH (água)</dt>
              <dd>{solo.ph ?? '—'}</dd>
              <dt>CTC</dt>
              <dd>{solo.ctc ?? '—'} cmol(c)/kg</dd>
              <dt>Densidade</dt>
              <dd>{solo.densidade ?? '—'} g/cm³</dd>
              <dt>Cascalho (&gt; 2 mm)</dt>
              <dd>{solo.cascalho ?? '—'}% do volume</dd>
              <dt>Carbono orgânico</dt>
              <dd>{solo.carbonoOrganico ?? '—'} g/kg</dd>
            </>
          ) : (
            <>
              <dt>Solo (SoilGrids)</dt>
              <dd>{solo ? 'sem solo mapeado (rocha exposta, gelo ou água)' : 'indisponível'}</dd>
            </>
          )}
        </dl>
      </div>

      <p className="ajuda">
        <strong>Por que a coluna Terra está pendente:</strong> os óxidos do alvo vêm de espectrômetros de raios gama em
        órbita (média de centenas de km). Na Terra não existe um mapa global equivalente; a fonte certa são amostras de
        rocha (EarthChem), cuja exportação exige cadastro. Preferimos mostrar &quot;pendente&quot; a estimar.
      </p>

      <details className="fontes">
        <summary>Notas e referências</summary>
        <ul>
          {alvo.notas.map((n) => (
            <li key={n}>{n}</li>
          ))}
          {alvo.referencias.map((r) => (
            <li key={r.url}>
              <a href={r.url} target="_blank" rel="noreferrer">
                {r.titulo}
              </a>
            </li>
          ))}
          <li>
            <a href="https://soilgrids.org/" target="_blank" rel="noreferrer">
              ISRIC SoilGrids 2.0
            </a>{' '}
            e{' '}
            <a href="https://macrostrat.org/" target="_blank" rel="noreferrer">
              Macrostrat
            </a>{' '}
            (Terra).
          </li>
        </ul>
      </details>
    </section>
  );
}
