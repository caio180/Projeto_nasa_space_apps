// Medidas ambientais do ponto na Terra, organizadas pelas dimensões do desafio,
// com a referência de Marte ou da Lua ao lado (NASA Planetary Fact Sheets).
// Cada linha diz de onde veio o dado; fontes que falharam aparecem como indisponíveis.

import type { Corpo, MedidasAmbientais } from '../types.ts';

interface Props {
  medidas: MedidasAmbientais | null;
  carregando: boolean;
  erro: string | null;
  /** Corpo com que a Terra está sendo comparada (para a coluna de referência). */
  alvo: Exclude<Corpo, 'Terra'>;
}

const f = (n: number, casas = 1) => n.toLocaleString('pt-BR', { maximumFractionDigits: casas });

/** Leitura simples do NDVI (índice de vegetação). */
function lerNdvi(ndvi: number) {
  if (ndvi < 0.1) return 'sem vegetação (árido, rocha, sal, gelo ou água)';
  if (ndvi < 0.3) return 'vegetação esparsa';
  return 'vegetação presente — analogia biológica fraca';
}

interface Linha {
  dimensao: string;
  medida: string;
  terra: string | null; // null = fonte indisponível
  referencia?: string;
  fonte: string;
  erro?: string;
}

export function PainelAmbiente({ medidas, carregando, erro, alvo }: Props) {
  if (carregando) {
    return (
      <section className="painel">
        <h2>Medidas ambientais</h2>
        <p className="ajuda">Consultando NASA POWER, NASA MODIS, SoilGrids e Macrostrat…</p>
      </section>
    );
  }
  if (erro || !medidas) {
    return erro ? (
      <section className="painel">
        <h2>Medidas ambientais</h2>
        <p className="erro-texto">{erro}</p>
      </section>
    ) : null;
  }

  const { clima, temperaturaSuperficie: lst, vegetacao, solo, geologia, erros, referencias } = medidas;
  const ref = referencias.corpos[alvo];
  const fracaoLuz = Math.round((100 * ref.irradiancia) / referencias.corpos.Terra.irradiancia);

  const linhas: Linha[] = [
    {
      dimensao: 'Temperatura',
      medida: `Ar a 2 m — média anual (mín. / máx.) ${clima ? clima.periodo : ''}`,
      terra: clima
        ? `${f(clima.temperaturaMedia)} °C (${f(clima.temperaturaMinima)} / ${f(clima.temperaturaMaxima)} °C)`
        : null,
      referencia: ref.temperatura,
      fonte: 'NASA POWER',
      erro: erros.clima,
    },
    {
      dimensao: 'Temperatura',
      medida: `Superfície — dia / noite ${lst ? `(${lst.ano}, ${lst.amostras} amostras)` : ''}`,
      terra: lst
        ? `${f(lst.mediaDia)} / ${f(lst.mediaNoite)} °C (máx. ${f(lst.maximaDia)}, mín. ${f(lst.minimaNoite)} °C)`
        : null,
      fonte: 'NASA MODIS',
      erro: erros.temperaturaSuperficie,
    },
    {
      dimensao: 'Iluminação',
      medida: 'Radiação solar na superfície',
      terra: clima ? `${f(clima.radiacaoSolar, 2)} kWh/m²/dia` : null,
      referencia: `${alvo} recebe ${fracaoLuz}% da luz do Sol que chega à Terra (${f(ref.irradiancia)} W/m²)`,
      fonte: 'NASA POWER',
      erro: erros.clima,
    },
    {
      dimensao: 'Poeira e vento',
      medida: 'Vento médio a 10 m',
      terra: clima ? `${f(clima.vento)} m/s` : null,
      fonte: 'NASA POWER',
      erro: erros.clima,
    },
    {
      dimensao: 'Água',
      medida: 'Umidade do ar / chuva',
      terra: clima ? `${f(clima.umidade, 0)}% / ${f(clima.precipitacao, 2)} mm por dia` : null,
      fonte: 'NASA POWER',
      erro: erros.clima,
    },
    {
      dimensao: 'Biologia',
      medida: `Vegetação (NDVI médio) ${vegetacao ? `(${vegetacao.ano})` : ''}`,
      terra: vegetacao ? `${f(vegetacao.ndviMedio, 2)} — ${lerNdvi(vegetacao.ndviMedio)}` : null,
      referencia: 'nenhuma vegetação',
      fonte: 'NASA MODIS',
      erro: erros.vegetacao,
    },
    {
      dimensao: 'Materiais da superfície',
      medida: 'Solo (0–5 cm): areia / silte / argila · pH · carbono',
      terra: solo
        ? solo.semSoloMapeado
          ? 'sem solo mapeado (rocha exposta, gelo ou água)'
          : `${solo.areia ?? '—'}% / ${solo.silte ?? '—'}% / ${solo.argila ?? '—'}% · pH ${solo.ph ?? '—'} · ${solo.carbonoOrganico ?? '—'} g/kg`
        : null,
      referencia: 'regolito sem matéria orgânica',
      fonte: 'ISRIC SoilGrids',
      erro: erros.solo,
    },
    {
      dimensao: 'Geologia',
      medida: 'Unidade geológica',
      terra: geologia
        ? [geologia.litologia, geologia.unidade, geologia.idade].filter((t) => t && t.trim()).join(' · ')
        : null,
      fonte: 'Macrostrat',
      erro: erros.geologia,
    },
  ];

  return (
    <section className="painel">
      <h2>Medidas ambientais</h2>
      <p className="ajuda">
        Ponto {f(medidas.lat, 3)}°, {f(medidas.lon, 3)}° · comparado com {alvo}
      </p>

      <div className="tabela-rolagem">
        <table className="tabela-comparacao tabela-ambiente">
          <thead>
            <tr>
              <th scope="col">Medida</th>
              <th scope="col">Terra</th>
              <th scope="col">{alvo}</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l, i) => (
              <tr key={i}>
                <th scope="row">
                  <span className="dimensao">{l.dimensao}</span>
                  {l.medida}
                  <span className="fonte-linha">{l.fonte}</span>
                </th>
                <td>{l.terra ?? <span className="indisponivel">indisponível{l.erro ? `: ${l.erro}` : ''}</span>}</td>
                <td>{l.referencia ?? '—'}</td>
              </tr>
            ))}
            <tr>
              <th scope="row">
                <span className="dimensao">Limites da Terra</span>
                Pressão do ar / gravidade
                <span className="fonte-linha">NASA Fact Sheets</span>
              </th>
              <td>
                {referencias.corpos.Terra.pressao} / {f(referencias.corpos.Terra.gravidade, 2)} m/s²
              </td>
              <td>
                {ref.pressao} / {f(ref.gravidade, 2)} m/s²
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <details className="fontes">
        <summary>Fontes e citações</summary>
        <ul>
          {[...medidas.fontes, { nome: referencias.fonte, url: referencias.url, citacao: '' }].map((fo) => (
            <li key={fo.nome}>
              <a href={fo.url} target="_blank" rel="noreferrer">
                {fo.nome}
              </a>
              {fo.citacao && ` — ${fo.citacao}`}
            </li>
          ))}
          {geologia?.referencia && <li>Mapa geológico: {geologia.referencia}</li>}
        </ul>
        <p className="ajuda">
          O NASA POWER usa grades de 50 a 100 km e o MODIS pixels de 250 m a 1 km: os valores representam a região em
          volta do ponto, não um metro exato.
        </p>
      </details>
    </section>
  );
}
