// =============================================================================
// MODEL dos locais em Marte e na Lua.
//
// Fonte: catálogo STAC da USGS Astrogeology (stac.astrogeology.usgs.gov/api),
// com modelos de relevo (DTM) em COG:
//   - Marte: mro_ctx_controlled_usgs_dtms              (câmera CTX, ~20 m)
//   - Lua:   kaguya_terrain_camera_usgs_dtms_v2_equi   (câmera Kaguya TC, ~15–35 m)
//   - Lua, polo sul: kaguya_terrain_camera_usgs_dtms_v2_southpolar (estereográfica polar)
//
// Cada DTM cobre só uma faixa de ~30–40 km, então trabalhamos com uma LISTA de
// locais escolhidos e recortamos uma janela quadrada centrada em cada um.
// A Terra usa a mesma janela na comparação, para o pixel ter o mesmo tamanho.
// =============================================================================

import { AppError } from './model.ts';

export type Corpo = 'Terra' | 'Marte' | 'Lua';

/** Gravidade média na superfície (m/s²). Relevo igual ≠ esforço igual. */
export const GRAVIDADE: Record<Corpo, number> = { Terra: 9.82, Marte: 3.73, Lua: 1.62 }; // NASA Planetary Fact Sheets

/** Lado da janela quadrada recortada em volta de cada local (km de chão). */
export const LADO_JANELA_KM = 15;

/** Raio das esferas de referência da IAU 2015 (os mesmos do WKT dos DTMs). */
export const RAIO_M: Record<Exclude<Corpo, 'Terra'>, number> = { Marte: 3_396_190, Lua: 1_737_400 };

/** Abaixo disto, a janela tem buraco demais e tentamos outro DTM. */
export const COBERTURA_MINIMA = 0.6;

/** Valores da janela → elevações (m), com null onde não há dado. */
export function paraElevacoes(valores: ArrayLike<number>, nodata: number | null): (number | null)[] {
  const saida: (number | null)[] = new Array(valores.length);
  for (let i = 0; i < valores.length; i++) {
    const v = valores[i];
    // Além do nodata declarado, os DTMs usam valores absurdos (ex.: -3.4e38) como vazio.
    saida[i] = v === nodata || !Number.isFinite(v) || v < -1e5 || v > 1e5 ? null : Math.round(v * 10) / 10;
  }
  return saida;
}


/** Tipo de rocha esperado no local (usado na compatibilidade de geologia). */
export type CategoriaGeologica = 'basalto' | 'sedimentar' | 'anortosito';

export interface LocalPlanetario {
  id: string;
  nome: string;
  corpo: Exclude<Corpo, 'Terra'>;
  lon: number; // -180 a 180, leste positivo
  lat: number;
  colecao: string;
  descricao: string;
  /** Lado da janela em km (padrão LADO_JANELA_KM). Crateras pedem janela maior. */
  ladoKm?: number;
  geologiaAlvo: { categoria: CategoriaGeologica; descricao: string };
  /** Região candidata oficial do Artemis III (NASA, out/2024). */
  artemis?: boolean;
  /** De onde vem a coordenada, quando não é o centro oficial da IAU. */
  fonteCoordenada?: string;
}

const CTX = 'mro_ctx_controlled_usgs_dtms';
const KAGUYA = 'kaguya_terrain_camera_usgs_dtms_v2_equi';
const KAGUYA_POLO_SUL = 'kaguya_terrain_camera_usgs_dtms_v2_southpolar';

export const LOCAIS: LocalPlanetario[] = [
  {
    id: 'jezero',
    nome: 'Cratera Jezero',
    corpo: 'Marte',
    lon: 77.45,
    lat: 18.44,
    colecao: CTX,
    descricao: 'Pouso do rover Perseverance (2021). Antigo lago com delta de rio, bom para coleta de amostras.',
    geologiaAlvo: { categoria: 'sedimentar', descricao: 'sedimentos de lago e delta sobre basalto' },
  },
  {
    id: 'gale',
    nome: 'Cratera Gale',
    corpo: 'Marte',
    lon: 137.44,
    lat: -4.59,
    colecao: CTX,
    descricao: 'Pouso do rover Curiosity (2012). Planície na base do Monte Sharp, perto do equador.',
    geologiaAlvo: { categoria: 'sedimentar', descricao: 'argilitos e camadas sedimentares do Monte Sharp' },
  },
  {
    id: 'utopia',
    nome: 'Utopia Planitia',
    corpo: 'Marte',
    lon: 134.29,
    lat: 47.64,
    colecao: CTX,
    descricao: 'Pouso da Viking 2 (1976). Planície em latitude média, região com gelo de água no subsolo.',
    geologiaAlvo: { categoria: 'basalto', descricao: 'planície vulcânica com blocos de basalto' },
  },
  {
    id: 'apollo11',
    nome: 'Mar da Tranquilidade (Apollo 11)',
    corpo: 'Lua',
    lon: 23.47,
    lat: 0.67,
    colecao: KAGUYA,
    descricao: 'Primeiro pouso tripulado (1969). Planície de basalto, plana e fácil de alcançar.',
    geologiaAlvo: { categoria: 'basalto', descricao: 'basalto de mar lunar' },
  },
  {
    id: 'apollo15',
    nome: 'Hadley Rille (Apollo 15)',
    corpo: 'Lua',
    lon: 3.63,
    lat: 26.13,
    colecao: KAGUYA,
    descricao: 'Pouso da Apollo 15 (1971), entre um canal de lava e as montanhas dos Apeninos lunares.',
    geologiaAlvo: { categoria: 'basalto', descricao: 'basalto de mar lunar junto às montanhas' },
  },
  {
    id: 'marius',
    nome: 'Colinas de Marius',
    corpo: 'Lua',
    lon: -56.69,
    lat: 14.09,
    colecao: KAGUYA,
    descricao: 'Tem uma claraboia de tubo de lava, candidata a abrigo natural contra radiação e micrometeoritos.',
    geologiaAlvo: { categoria: 'basalto', descricao: 'domos e derrames vulcânicos basálticos' },
  },
  {
    id: 'bessel',
    nome: 'Cratera Bessel',
    corpo: 'Lua',
    lon: 17.92,
    lat: 21.76,
    colecao: KAGUYA,
    descricao: 'Cratera de impacto simples de ~16 km no Mar da Serenidade, do tamanho de crateras terrestres como El’gygytgyn.',
    ladoKm: 30,
    geologiaAlvo: { categoria: 'basalto', descricao: 'basalto de mar lunar escavado por impacto' },
  },

  // ---------------- Polo sul da Lua: alvo das bases permanentes (Artemis) ----------------
  {
    id: 'nobile-rim-2',
    nome: 'Nobile Rim 2 (Artemis III)',
    corpo: 'Lua',
    lon: 60.69989,
    lat: -84.20156,
    colecao: KAGUYA_POLO_SUL,
    descricao:
      'Uma das 9 regiões candidatas ao pouso do Artemis III (NASA, 2024). Borda iluminada perto de crateras em sombra permanente, que podem guardar gelo de água.',
    geologiaAlvo: { categoria: 'anortosito', descricao: 'crosta das terras altas lunares (anortosito)' },
    artemis: true,
    fonteCoordenada: 'Ponto ótimo do estudo multicritério de Peña-Asensio et al. (2025), Acta Astronautica, doi:10.1016/j.actaastro.2024.10.049',
  },
  {
    id: 'mons-mouton',
    nome: 'Mons Mouton (Artemis III)',
    corpo: 'Lua',
    lon: 31.0,
    lat: -84.6,
    colecao: KAGUYA_POLO_SUL,
    descricao: 'Região candidata ao pouso do Artemis III (NASA, 2024): maciço alto e iluminado perto do polo sul.',
    geologiaAlvo: { categoria: 'anortosito', descricao: 'crosta das terras altas lunares (anortosito)' },
    artemis: true,
    fonteCoordenada: 'Centro do Mons Mouton no catálogo de nomes IAU/USGS',
  },
  // Shackleton foi testada, mas os DTMs Kaguya v2 cobrem só ~3% da janela (o interior fica
  // em sombra permanente, sem estéreo). Fica de fora até termos o DEM LOLA polar.
];

/** Lado da janela de um local (km). */
export const ladoDoLocal = (l: LocalPlanetario) => l.ladoKm ?? LADO_JANELA_KM;

/** Perto dos polos o bbox em graus deixa de fazer sentido; buscamos pelo ponto. */
export const ehPolar = (lat: number) => Math.abs(lat) > 75;

export function obterLocal(id: string): LocalPlanetario {
  const local = LOCAIS.find((l) => l.id === id);
  if (!local) throw new AppError(404, `Local "${id}" não existe. Veja GET /api/locais.`);
  return local;
}

// -----------------------------------------------------------------------------
// Projeções dos DTMs da USGS: equirretangular (faixa equatorial) e
// estereográfica polar (polos). Ambas sobre esfera (IAU 2015).
// Fórmulas: Snyder (1987), "Map Projections — A Working Manual", USGS.
// -----------------------------------------------------------------------------

export type Projecao =
  | {
      tipo: 'equirretangular';
      raio: number;
      meridianoCentral: number;
      paraleloPadrao: number;
      falsoLeste: number;
      falsoNorte: number;
    }
  | {
      tipo: 'polar';
      polo: 'sul' | 'norte';
      raio: number;
      meridianoCentral: number;
      k0: number; // fator de escala no polo
      falsoLeste: number;
      falsoNorte: number;
    };

/**
 * Lê os parâmetros da projeção no WKT do item STAC (propriedade proj:wkt2).
 * Exemplos reais:
 *   PROJECTION["Equirectangular"], PARAMETER["central_meridian",0], PARAMETER["standard_parallel_1",0]
 *   PROJECTION["Polar_Stereographic"], PARAMETER["latitude_of_origin",-90], PARAMETER["scale_factor",1]
 */
export function lerProjecao(wkt: string | undefined): Projecao {
  if (!wkt) throw new AppError(502, 'O DTM não informa a projeção (proj:wkt2).');
  const parametro = (nome: string) => {
    const m = new RegExp(`PARAMETER\\["${nome}",(-?[\\d.]+)\\]`).exec(wkt);
    return m ? Number(m[1]) : null;
  };
  const raio = Number(/SPHEROID\["[^"]*",([\d.]+)/.exec(wkt)?.[1]);
  if (!raio) throw new AppError(502, 'Não encontrei o raio do corpo no WKT do DTM.');
  const base = {
    raio,
    meridianoCentral: parametro('central_meridian') ?? 0,
    falsoLeste: parametro('false_easting') ?? 0,
    falsoNorte: parametro('false_northing') ?? 0,
  };

  if (/PROJECTION\["Equirectangular"\]/.test(wkt)) {
    return { tipo: 'equirretangular', ...base, paraleloPadrao: parametro('standard_parallel_1') ?? 0 };
  }
  if (/PROJECTION\["Polar_Stereographic"\]/.test(wkt)) {
    const origem = parametro('latitude_of_origin') ?? -90;
    // Variante A traz scale_factor; a B traz o paralelo de escala verdadeira.
    const paraleloEscala = parametro('standard_parallel_1');
    const k0 =
      parametro('scale_factor') ??
      (paraleloEscala !== null ? (1 + Math.sin(Math.abs(paraleloEscala) * RAD)) / 2 : 1);
    return { tipo: 'polar', ...base, polo: origem < 0 ? 'sul' : 'norte', k0 };
  }
  throw new AppError(502, 'O DTM usa uma projeção que este protótipo ainda não suporta.');
}

const RAD = Math.PI / 180;

/** Diferença de longitude no intervalo -180..180 graus. */
const difLon = (lon: number, lon0: number) => ((((lon - lon0 + 180) % 360) + 360) % 360) - 180;

/**
 * bbox projetado (metros da projeção) de uma janela de `ladoKm` × `ladoKm` de CHÃO
 * centrada em (lon, lat). Corrigimos pela escala da projeção naquele ponto, para
 * a janela ter o mesmo tamanho real em qualquer latitude.
 */
export function janelaProjetada(p: Projecao, lon: number, lat: number, ladoKm: number) {
  const meio = (ladoKm * 1000) / 2;
  const phi = lat * RAD;
  const dLambda = difLon(lon, p.meridianoCentral) * RAD;

  if (p.tipo === 'equirretangular') {
    const x = p.falsoLeste + p.raio * Math.cos(p.paraleloPadrao * RAD) * dLambda;
    const y = p.falsoNorte + p.raio * phi;
    // 1 m projetado em X vale cos(lat)/cos(paraleloPadrao) m de chão.
    const meioX = (meio * Math.cos(p.paraleloPadrao * RAD)) / Math.cos(phi);
    return [x - meioX, y - meio, x + meioX, y + meio];
  }

  // Estereográfica polar (Snyder, eq. 21-5 a 21-10, esfera).
  const sul = p.polo === 'sul';
  const rho = 2 * p.raio * p.k0 * Math.tan(Math.PI / 4 + (sul ? phi : -phi) / 2);
  const x = p.falsoLeste + rho * Math.sin(dLambda);
  const y = p.falsoNorte + (sul ? 1 : -1) * rho * Math.cos(dLambda);
  const escala = (2 * p.k0) / (1 + (sul ? -1 : 1) * Math.sin(phi)); // k no ponto
  const meioP = meio * escala;
  return [x - meioP, y - meioP, x + meioP, y + meioP];
}

/** Janela em graus (para mostrar no mapa e na resposta), mesma ideia da Terra. */
export function janelaGraus(lon: number, lat: number, ladoKm: number, raio: number) {
  const meioGrausLat = ((ladoKm * 1000) / 2 / raio) / RAD;
  // Perto do polo a largura em longitude explode; limitamos a ±180.
  const meioGrausLon = Math.min(180, meioGrausLat / Math.max(Math.cos(lat * RAD), 1e-6));
  return [
    Math.max(-180, lon - meioGrausLon),
    Math.max(-90, lat - meioGrausLat),
    Math.min(180, lon + meioGrausLon),
    Math.min(90, lat + meioGrausLat),
  ] as [number, number, number, number];
}

/** Item STAC mínimo que usamos da USGS. */
export interface ItemUsgs {
  id: string;
  bbox: number[];
  properties: { gsd?: number; 'proj:wkt2'?: string; datetime?: string | null; start_datetime?: string; license?: string };
  assets: Record<string, { href: string; type?: string }>;
}

/** URL do DTM dentro do item (o nome do asset muda entre coleções). */
export function urlDoDtm(item: ItemUsgs): string | null {
  const a = item.assets.geoid_adjusted_dem ?? item.assets.dem ?? item.assets.dtm;
  return a?.href ?? null;
}

/**
 * Ordena os candidatos: primeiro os que cobrem mais da janela (pelo bbox em
 * graus do item), depois o de pixel menor (gsd). Assim evitamos faixas que
 * só tocam a borda do local.
 */
export function ordenarCandidatos(itens: ItemUsgs[], janela: [number, number, number, number]): ItemUsgs[] {
  const [x0, y0, x1, y1] = janela;
  const areaJanela = (x1 - x0) * (y1 - y0);
  const cobertura = (b: number[]) => {
    const w = Math.max(0, Math.min(x1, b[2]) - Math.max(x0, b[0]));
    const h = Math.max(0, Math.min(y1, b[3]) - Math.max(y0, b[1]));
    return (w * h) / areaJanela;
  };
  return itens
    .filter((i) => urlDoDtm(i))
    .map((i) => ({ i, c: cobertura(i.bbox) }))
    .sort((a, b) => b.c - a.c || (a.i.properties.gsd ?? 99) - (b.i.properties.gsd ?? 99))
    .map(({ i }) => i);
}
