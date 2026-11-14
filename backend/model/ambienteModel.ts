// =============================================================================
// MODEL das medidas ambientais de um ponto da Terra + referências de Marte/Lua.
//
// Cada dimensão do desafio passa a ter uma MEDIDA de fonte confiável:
//   temperatura do ar, radiação, vento, umidade, chuva → NASA POWER
//   temperatura da superfície (dia/noite)              → NASA MODIS (MOD/MYD11A2)
//   vegetação (aridez / habitabilidade)                → NASA MODIS (MOD/MYD13Q1, NDVI)
//   solo (areia, argila, carbono)                      → ISRIC SoilGrids
//   geologia (tipo de rocha, idade)                    → Macrostrat
//
// Cada fonte é independente: se uma falhar, as outras continuam (o erro vai
// em `erros`, e o frontend mostra "indisponível" só naquela linha).
// =============================================================================

import { AppError } from './model.ts';

export interface Clima {
  temperaturaMedia: number; // °C, média anual do ar a 2 m
  temperaturaMinima: number; // °C, menor valor da climatologia
  temperaturaMaxima: number; // °C, maior valor da climatologia
  radiacaoSolar: number; // kWh/m²/dia na superfície
  vento: number; // m/s a 10 m
  umidade: number; // %
  precipitacao: number; // mm/dia
  periodo: string; // ex.: "2001–2025"
}

export interface TemperaturaSuperficie {
  mediaDia: number; // °C
  mediaNoite: number; // °C
  maximaDia: number; // °C
  minimaNoite: number; // °C
  amostras: number; // composições de 8 dias usadas
  ano: number;
}

export interface Vegetacao {
  ndviMedio: number; // -1 a 1 (perto de 0 = sem vegetação)
  ndviMaximo: number;
  amostras: number;
  ano: number;
}

export interface Solo {
  areia: number | null; // %
  silte: number | null; // %
  argila: number | null; // %
  carbonoOrganico: number | null; // g/kg
  ph: number | null; // pH em água
  ctc: number | null; // capacidade de troca de cátions, cmol(c)/kg
  densidade: number | null; // g/cm³
  cascalho: number | null; // % do volume com fragmentos > 2 mm
  semSoloMapeado: boolean; // rocha exposta, gelo ou água
}

export interface Geologia {
  unidade: string;
  litologia: string;
  /** Litologias de TODAS as unidades que o Macrostrat devolve para o ponto (mapas de escalas diferentes). */
  litologias: string[];
  idade: string;
  idadeMaximaMa: number | null; // milhões de anos
  referencia: string | null;
}

export interface MedidasAmbientais {
  lon: number;
  lat: number;
  clima: Clima | null;
  temperaturaSuperficie: TemperaturaSuperficie | null;
  vegetacao: Vegetacao | null;
  solo: Solo | null;
  geologia: Geologia | null;
  /** Fonte → motivo, para as que falharam. */
  erros: Record<string, string>;
  fontes: { nome: string; url: string; citacao: string }[];
}

/** Fontes e como citá-las (exigência de licença de várias delas). */
export const FONTES = [
  {
    nome: 'NASA POWER',
    url: 'https://power.larc.nasa.gov/',
    citacao: 'Dados do projeto NASA Langley Research Center (LaRC) POWER, financiado pelo NASA Earth Science Applied Sciences.',
  },
  {
    nome: 'NASA MODIS (MOD11A2/MYD11A2, MOD13Q1/MYD13Q1) via Microsoft Planetary Computer',
    url: 'https://planetarycomputer.microsoft.com/dataset/group/modis',
    citacao: 'NASA LP DAAC — produtos MODIS coleção 6.1.',
  },
  {
    nome: 'ISRIC SoilGrids 2.0',
    url: 'https://soilgrids.org/',
    citacao: 'Poggio et al. (2021), SoilGrids 2.0, SOIL 7, 217–240. Licença CC-BY 4.0.',
  },
  {
    nome: 'Macrostrat',
    url: 'https://macrostrat.org/',
    citacao: 'Macrostrat (Universidade de Wisconsin–Madison). Licença CC-BY 4.0.',
  },
];

/** Valida lon/lat vindos da query string. */
export function validarPonto(lonTexto: unknown, latTexto: unknown) {
  const lon = Number(lonTexto);
  const lat = Number(latTexto);
  const erros: string[] = [];
  if (typeof lonTexto !== 'string' || !Number.isFinite(lon) || lon < -180 || lon > 180) {
    erros.push('lon deve ser um número entre -180 e 180.');
  }
  if (typeof latTexto !== 'string' || !Number.isFinite(lat) || lat < -90 || lat > 90) {
    erros.push('lat deve ser um número entre -90 e 90.');
  }
  if (erros.length > 0) throw new AppError(400, 'Ponto inválido.', erros);
  return { lon, lat };
}

/** Média com arredondamento a 0,1. */
export const media = (v: number[]) => Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10;

/** Escolhe até `n` itens espaçados ao longo do ano (evita baixar todos). */
export function amostrarEspacado<T>(itens: T[], n: number): T[] {
  if (itens.length <= n) return itens;
  const passo = itens.length / n;
  return Array.from({ length: n }, (_, i) => itens[Math.floor(i * passo)]);
}

// -----------------------------------------------------------------------------
// Referências de Marte e da Lua — NASA Planetary Fact Sheets (NSSDC/GSFC)
// https://nssdc.gsfc.nasa.gov/planetary/factsheet/
// -----------------------------------------------------------------------------

export const REFERENCIAS_CORPOS = {
  fonte: 'NASA Planetary Fact Sheets (NSSDC/GSFC)',
  url: 'https://nssdc.gsfc.nasa.gov/planetary/factsheet/',
  corpos: {
    Terra: {
      pressao: '1.014 mb',
      temperatura: 'média 15 °C',
      irradiancia: 1361.0,
      gravidade: 9.82,
    },
    Marte: {
      pressao: '6,36 mb (4,0 a 8,7 mb conforme a estação)',
      temperatura: 'média −59 °C; de −89 a −31 °C no local da Viking 1',
      irradiancia: 586.2,
      gravidade: 3.73,
    },
    Lua: {
      pressao: '3 × 10⁻¹⁵ bar à noite (praticamente vácuo)',
      temperatura: 'de −178 a +117 °C no equador (95 a 390 K)',
      irradiancia: 1361.0,
      gravidade: 1.62,
    },
  },
} as const;
