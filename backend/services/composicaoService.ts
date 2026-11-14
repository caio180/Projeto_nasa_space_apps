// =============================================================================
// SERVICE — composição química de Marte e da Lua a partir das tabelas do PDS.
//
// As tabelas são arquivos de texto pequenos (centenas a poucos milhares de
// linhas). Baixamos UMA vez, guardamos em memória e procuramos a célula que
// contém o local. Formato conferido nos rótulos (.lbl/.fmt) do próprio PDS.
// =============================================================================

import { AppError } from '../model/model.ts';
import { FATOR_OXIDO, r2, REFERENCIAS_COMPOSICAO } from '../model/composicaoModel.ts';
import type { ComposicaoAlvo } from '../model/composicaoModel.ts';
import type { LocalPlanetario } from '../model/planetaModel.ts';

const PDS_URL = process.env.URL_PDS_GEOSCIENCES;
const MARTE_GRS = '/ody/ody-m-grs-5-elements-v1/odgm_xxxx/data/smoothed';
const LUA_LP = '/lunar/lp-l-grs-5-elem-abundance-v1/lp_9001/data/lpgrs_high1_elem_abundance_5deg.tab';
const SEM_DADO_MARTE = 9999.999;

const cacheTabelas = new Map<string, number[][]>();

/** Baixa uma tabela ASCII de colunas separadas por espaço e devolve as linhas numéricas. */
async function tabela(caminho: string): Promise<number[][]> {
  const emCache = cacheTabelas.get(caminho);
  if (emCache) return emCache;

  let resposta: Response;
  try {
    resposta = await fetch(`${PDS_URL}${caminho}`, { signal: AbortSignal.timeout(60_000) });
  } catch {
    throw new AppError(502, 'Não foi possível baixar a tabela de composição do PDS (NASA).');
  }
  if (!resposta.ok) throw new AppError(502, `O PDS respondeu ${resposta.status} para ${caminho}.`);

  const linhas = (await resposta.text())
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => l.split(/[\s,]+/).map(Number))
    .filter((cols) => cols.every((n) => Number.isFinite(n)));
  cacheTabelas.set(caminho, linhas);
  return linhas;
}

// ---------------------------------------------------------------------------
// Marte — Odyssey GRS. Colunas: LATITUDE, LONGITUDE (0–360 leste, centro da
// célula de 5°), CONCENTRATION, SIGMA, SIGMA WITH CFS. 9999.999 = sem dado.
// ---------------------------------------------------------------------------
async function composicaoMarte(lon: number, lat: number): Promise<ComposicaoAlvo> {
  const lon360 = ((lon % 360) + 360) % 360;
  const latCentro = Math.floor((lat + 90) / 5) * 5 - 90 + 2.5;
  const lonCentro = Math.floor(lon360 / 5) * 5 + 2.5;

  const elementos = ['fe', 'si', 'k', 'cl', 'h2o', 'th'] as const;
  const tabelas = await Promise.all(elementos.map((e) => tabela(`${MARTE_GRS}/${e}_sr_5x5.tab`)));
  const linhaDe = (i: number) => tabelas[i].find((c) => c[0] === latCentro && c[1] === lonCentro);
  const valor = (i: number) => {
    const v = linhaDe(i)?.[2];
    return v === undefined || v >= SEM_DADO_MARTE ? null : v;
  };
  // Coluna 5 = SIGMA WITH CFS: incerteza total (estatística + fator de correção).
  // Alguns elementos (ex.: K) não têm essa coluna (9999.999): usamos a coluna 4 (SIGMA).
  const sigma = (i: number) => {
    const linha = linhaDe(i);
    const valido = (v: number | undefined) => (v === undefined || v >= SEM_DADO_MARTE ? null : v);
    return valido(linha?.[4]) ?? valido(linha?.[3]);
  };
  const [fe, si, k, cl, h2o, th] = elementos.map((_, i) => valor(i));
  const [sFe, sSi, sK] = [sigma(0), sigma(1), sigma(2)];
  if (fe === null && si === null) {
    throw new AppError(404, 'O Odyssey GRS não tem dado para esta latitude (o mapa cobre ~±50°).');
  }

  return {
    corpo: 'Marte',
    fonte: 'NASA PDS — Mars Odyssey GRS (células de 5° × 5°)',
    instrumento: 'Espectrômetro de raios gama (GRS) do 2001 Mars Odyssey',
    celula: { latMin: latCentro - 2.5, latMax: latCentro + 2.5, lonMin: lonCentro - 2.5, lonMax: lonCentro + 2.5 },
    oxidos: {
      ...(fe !== null && { FeO: r2(fe * FATOR_OXIDO.FeO) }),
      ...(si !== null && { SiO2: r2(si * FATOR_OXIDO.SiO2) }),
      ...(k !== null && { K2O: r2(k * FATOR_OXIDO.K2O) }),
    },
    incerteza: {
      ...(sFe !== null && { FeO: r2(sFe * FATOR_OXIDO.FeO) }),
      ...(sSi !== null && { SiO2: r2(sSi * FATOR_OXIDO.SiO2) }),
      ...(sK !== null && { K2O: r2(sK * FATOR_OXIDO.K2O) }),
    },
    agua: h2o === null ? null : r2(h2o),
    cloro: cl === null ? null : r2(cl),
    torio: th === null ? null : r2(th),
    notas: [
      'Óxidos convertidos dos elementos medidos (Fe→FeO, Si→SiO₂, K→K₂O); o GRS não mede Al, Mg, Ca, Ti neste produto.',
      'H₂O é a água equivalente ao hidrogênio na camada de ~dezenas de cm — gelo e minerais hidratados, um recurso para a base.',
      'Valor médio de uma célula de ~300 × 300 km.',
    ],
    referencias: REFERENCIAS_COMPOSICAO.Marte,
  };
}

// ---------------------------------------------------------------------------
// Lua — Lunar Prospector GRS. Colunas (formato lpgrs_elem_abundance.fmt):
// 1 PIXEL_INDEX, 2 MIN_LAT, 3 MAX_LAT, 4 MIN_LON, 5 MAX_LON, 6 AM, 7 NEUTRON_DEN,
// 8 W_MGO, 9 W_AL2O3, 10 W_SIO2, 11 W_CAO, 12 TIO2, 13 W_FEO (frações do peso),
// 14 W_K, 15 W_TH, 16 W_U (ppm). Longitude de -180 a 180.
// ---------------------------------------------------------------------------
async function composicaoLua(lon: number, lat: number): Promise<ComposicaoAlvo> {
  const linhas = await tabela(LUA_LP);
  const lon180 = ((((lon + 180) % 360) + 360) % 360) - 180;
  const px = linhas.find((c) => lat >= c[1] && lat < c[2] && lon180 >= c[3] && lon180 < c[4]);
  if (!px) throw new AppError(404, 'Não achei o pixel do Lunar Prospector para este local.');

  const pct = (frac: number) => r2(frac * 100);
  // Diagonal da matriz de erro (variâncias) na ordem MgO, Al2O3, SiO2, CaO, TiO2, FeO, K:
  // colunas 17, 26, 34, 41, 47, 52, 56 do .fmt (índices base 0: 16, 25, 33, 40, 46, 51, 55).
  const sd = (indice: number) => Math.sqrt(Math.max(0, px[indice]));
  return {
    corpo: 'Lua',
    fonte: 'NASA PDS — Lunar Prospector GRS (pixels de 5° de área igual)',
    instrumento: 'Espectrômetro de raios gama (GRS) do Lunar Prospector',
    celula: { latMin: px[1], latMax: px[2], lonMin: px[3], lonMax: px[4] },
    oxidos: {
      SiO2: pct(px[9]),
      Al2O3: pct(px[8]),
      FeO: pct(px[12]),
      MgO: pct(px[7]),
      CaO: pct(px[10]),
      TiO2: pct(px[11]),
      K2O: r2((px[13] * FATOR_OXIDO.K2O) / 10_000), // K em ppm → K2O em %
    },
    incerteza: {
      MgO: pct(sd(16)),
      Al2O3: pct(sd(25)),
      SiO2: pct(sd(33)),
      CaO: pct(sd(40)),
      TiO2: pct(sd(46)),
      FeO: pct(sd(51)),
      K2O: r2((sd(55) * FATOR_OXIDO.K2O) / 10_000),
    },
    agua: null,
    cloro: null,
    torio: r2(px[14]),
    notas: [
      'Frações do peso medidas por espectroscopia de raios gama (Prettyman et al. 2006).',
      'O Lunar Prospector não mede água neste produto; gelo polar é inferido por outros instrumentos (LCROSS, Diviner, LEND).',
      'Valor médio de um pixel de ~150 km. Cada óxido traz a incerteza (1σ) da matriz de erro do produto: valores menores que a própria incerteza (ex.: Al₂O₃ em alguns mares) devem ser lidos como "perto de zero, pouco preciso".',
    ],
    referencias: REFERENCIAS_COMPOSICAO.Lua,
  };
}

/** Composição na célula do local de Marte ou da Lua. */
export function composicaoDoLocal(local: LocalPlanetario): Promise<ComposicaoAlvo> {
  return local.corpo === 'Marte' ? composicaoMarte(local.lon, local.lat) : composicaoLua(local.lon, local.lat);
}
