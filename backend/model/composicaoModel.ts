// =============================================================================
// MODEL da composição química da superfície de Marte e da Lua.
//
// Fontes (NASA, Planetary Data System — PDS Geosciences Node):
//   Marte: Mars Odyssey GRS, ODY-M-GRS-5-ELEMENTS-V1.0 (Boynton et al. 2007)
//          Fe, Si, Cl, K, H2O em % do peso e Th em ppm; células de 5° × 5°
//          (versão suavizada, *_sr_5x5.tab).
//   Lua:   Lunar Prospector GRS, LP-L-GRS-5-ELEM-ABUNDANCE-V1
//          MgO, Al2O3, SiO2, CaO, TiO2, FeO (fração do peso), K, Th, U (ppm);
//          pixels de área igual de 5° (lpgrs_high1_elem_abundance_5deg.tab).
//
// Os espectrômetros de raios gama medem a camada mais rasa (dezenas de cm)
// e têm resolução de centenas de km: o valor é a MÉDIA REGIONAL da célula.
// =============================================================================

export type Oxido = 'SiO2' | 'Al2O3' | 'FeO' | 'MgO' | 'CaO' | 'TiO2' | 'K2O';

export interface ComposicaoAlvo {
  corpo: 'Marte' | 'Lua';
  fonte: string;
  instrumento: string;
  /** Limites da célula/pixel usada (graus). */
  celula: { latMin: number; latMax: number; lonMin: number; lonMax: number };
  /** Óxidos em % do peso (os que o instrumento mede ou dá para converter). */
  oxidos: Partial<Record<Oxido, number>>;
  /** Incerteza de 1 sigma de cada óxido (mesma unidade), vinda do próprio produto da NASA. */
  incerteza: Partial<Record<Oxido, number>>;
  /** Água (H2O equivalente) no subsolo raso, % do peso — só Marte (Odyssey). */
  agua: number | null;
  /** Cloro (% do peso) — sais; só Marte. */
  cloro: number | null;
  /** Tório (ppm) — marca de rochas KREEP/crosta evoluída. */
  torio: number | null;
  notas: string[];
  referencias: { titulo: string; url: string }[];
}

/** Fatores de conversão elemento → óxido (massas molares). */
export const FATOR_OXIDO = {
  FeO: 71.844 / 55.845, // 1,2865
  SiO2: 60.084 / 28.086, // 2,1393
  K2O: 94.196 / (2 * 39.098), // 1,2046
};

export const REFERENCIAS_COMPOSICAO = {
  Marte: [
    {
      titulo: 'PDS Geosciences — Mars Odyssey GRS Element Concentrations (ODY-M-GRS-5-ELEMENTS-V1.0)',
      url: 'https://pds-geosciences.wustl.edu/missions/odyssey/grs_elements.html',
    },
    {
      titulo: 'Boynton et al. (2007), Concentration of H, Si, Cl, K, Fe, and Th in the low- and mid-latitude regions of Mars, JGR',
      url: 'https://doi.org/10.1029/2007JE002887',
    },
  ],
  Lua: [
    {
      titulo: 'PDS Geosciences — Lunar Prospector GRS Elemental Abundance (LP-L-GRS-5-ELEM-ABUNDANCE-V1)',
      url: 'https://pds-geosciences.wustl.edu/lunar/lp-l-grs-5-elem-abundance-v1/',
    },
    {
      titulo: 'Prettyman et al. (2006), Elemental composition of the lunar surface: Lunar Prospector gamma ray spectroscopy, JGR',
      url: 'https://doi.org/10.1029/2005JE002656',
    },
  ],
};

/** Arredonda a 2 casas. */
export const r2 = (n: number) => Math.round(n * 100) / 100;
