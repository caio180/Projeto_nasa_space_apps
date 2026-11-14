// Ficha de um análogo terrestre, no formato que o desafio pede:
// em que ele é parecido, onde a analogia falha e como ajuda a exploração.

import type { AnalogoTerrestre, Dimensao } from '../types.ts';

interface Props {
  analogo: AnalogoTerrestre;
  rotulosDimensoes: Record<Dimensao, string>;
}

export function FichaAnalogo({ analogo, rotulosDimensoes }: Props) {
  return (
    <section className="painel ficha-analogo">
      <div>
        <p className="ficha-alvo">Análogo de {analogo.alvo}</p>
        <h2>{analogo.nome}</h2>
        <p className="ajuda">
          {analogo.pais} · {analogo.lat.toFixed(2)}°, {analogo.lon.toFixed(2)}°
          {analogo.coordenadaAproximada && ' (ponto aproximado da região)'}
        </p>
      </div>

      <ul className="selos" aria-label="Dimensões de analogia">
        {analogo.destaque && <li className="selo selo-destaque">Destaque</li>}
        <li className={analogo.situacao === 'proposto' ? 'selo selo-proposto' : 'selo selo-estudado'}>
          {analogo.situacao === 'proposto' ? 'Proposto pelo projeto' : 'Estudado na literatura'}
        </li>
        {analogo.dimensoes.map((d) => (
          <li key={d} className="selo">
            {rotulosDimensoes[d] ?? d}
          </li>
        ))}
      </ul>

      <dl className="ficha-texto">
        <dt>O que é parecido</dt>
        <dd>{analogo.semelhancas}</dd>
        <dt>Onde a analogia falha</dt>
        <dd>{analogo.ondeFalha}</dd>
        <dt>Como ajuda a exploração</dt>
        <dd>{analogo.usoNaExploracao}</dd>
        {analogo.jaUsadoComoAnalogo && (
          <>
            <dt>Já usado como análogo</dt>
            <dd>{analogo.jaUsadoComoAnalogo}</dd>
          </>
        )}
      </dl>

      <div>
        <h3 className="ficha-subtitulo">Base científica</h3>
        {analogo.referencias.length > 0 && (
          <ul className="ficha-referencias">
            {analogo.referencias.map((r) => (
              <li key={r.url}>
                <a href={r.url} target="_blank" rel="noreferrer">
                  {r.titulo}
                </a>
              </li>
            ))}
          </ul>
        )}
        {analogo.situacao === 'proposto' && (
          <p className="ajuda">
            Não encontramos artigo revisado por pares que trate este local como análogo{' '}
            {analogo.alvo === 'Lua' ? 'lunar' : 'de Marte'}. É uma proposta nova deste projeto — o desafio pede
            exatamente isso — e se apoia nas medidas abaixo, não em literatura.
          </p>
        )}
      </div>

      <p className="ajuda">
        Medidos pela plataforma: relevo, rugosidade, temperatura, iluminação, vento, umidade, vegetação, solo, geologia
        e a composição do alvo (veja as tabelas). Subsolo e processos ainda são qualitativos.
      </p>
    </section>
  );
}
