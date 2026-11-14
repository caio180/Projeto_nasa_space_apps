// =============================================================================
// MODEL — validação científica da comparação Terra × Marte/Lua.
//
// Os mentores pediram duas coisas:
//   1. EXPLICAR como a similaridade é medida;
//   2. COMPENSAR as diferenças de ESCALA e de ATMOSFERA entre os sensores
//      da Terra e os planetários.
//
// Escala:
//   - mesma janela física (km × km) e mesmo pixel nos dois corpos;
//   - o pixel comum nunca é mais fino que a resolução NATIVA mais grossa dos
//     dois modelos de relevo (nenhum lado "vê" detalhe que o outro não vê);
//   - rugosidade MULTIESCALA (Shepard et al. 2001): desvio RMS de altura
//     entre pontos separados por 1, 2, 4, 8… pixels. Comparamos os dois corpos
//     na MESMA distância em metros, em todas as escalas, e o expoente de Hurst
//     diz como a rugosidade cresce com a escala.
//
// Atmosfera:
//   - as NOTAS usam só altimetria (geometria do terreno). Altura e declive não
//     dependem de brilho, cor, poeira ou névoa;
//   - as FOTOS (qualitativas) são compensadas: Terra em refletância de
//     superfície (atmosfera removida pelo Sen2Cor), simulada na faixa de
//     comprimento de onda da câmera alvo, e as duas fotos recebem a MESMA
//     normalização de contraste (percentis 1–99%, equivalente à subtração do
//     "objeto escuro" de Chavez 1988 para a névoa aditiva).
// =============================================================================

import type { Corpo } from './planetaModel.ts';
import type { Relevo } from './relevoModel.ts';

export interface PontoRugosidade {
  baseM: number; // distância entre os dois pontos (m)
  desvioM: number; // desvio RMS de altura nessa distância (m)
  declivRmsGraus: number; // declividade RMS equivalente: atan(desvio / base)
  pares: number; // quantos pares de pixels entraram na conta
}

export interface Rugosidade {
  pontos: PontoRugosidade[];
  /** Expoente de Hurst: desvio ∝ base^H (0,5 = aleatório; perto de 1 = autossimilar, "liso" em escala grande). */
  hurst: number | null;
}

export interface ComparacaoRugosidade {
  terra: Rugosidade;
  alvo: Rugosidade;
  /** Razão desvio Terra / desvio alvo em cada distância. */
  razoes: { baseM: number; razao: number }[];
  nota: number | null;
  regra: string;
  leitura: string;
}

export interface Escala {
  pixelComumM: number;
  nativaTerraM: number;
  nativaAlvoM: number;
  nativaMaisGrossaM: number;
  /** true = o pixel comum é mais fino que um dos sensores (detalhe inventado pela reamostragem). */
  superamostrado: boolean;
  janelaKm: number;
  texto: string;
}

export interface Sensor {
  corpo: Corpo;
  relevo: { produto: string; tecnica: string; nativaM: number };
  foto: { produto: string; faixa: string; pixelNativoM: number };
  atmosfera: string;
  compensacao: string;
}

export interface ValidacaoCientifica {
  passos: { titulo: string; texto: string }[];
  escala: Escala;
  rugosidade: ComparacaoRugosidade;
  sensores: Sensor[];
  limites: string[];
  referencias: { titulo: string; url: string }[];
}

const r1 = (n: number) => Math.round(n * 10) / 10;
/** Precisão vertical da grade (m): as alturas são arredondadas para 0,1 m. */
const PRECISAO_M = 0.1;
const f = (n: number, casas = 1) => n.toLocaleString('pt-BR', { maximumFractionDigits: casas });

/**
 * Desvio RMS de altura (Shepard et al. 2001, "RMS deviation") para distâncias
 * de 1, 2, 4, 8… pixels, nas duas direções (leste-oeste e norte-sul). Só entram
 * pares em que os dois pixels têm dado.
 */
export function rugosidadeMultiescala(r: Relevo): Rugosidade {
  const { largura: w, altura: h, elevacoes: z } = r;
  const px = (r.metrosPorPixel.x + r.metrosPorPixel.y) / 2;
  const pontos: PontoRugosidade[] = [];

  for (let passo = 1; passo <= Math.min(w, h) / 4; passo *= 2) {
    let soma = 0;
    let pares = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const a = z[y * w + x];
        if (a === null) continue;
        if (x + passo < w) {
          const b = z[y * w + x + passo];
          if (b !== null) {
            soma += (a - b) ** 2;
            pares++;
          }
        }
        if (y + passo < h) {
          const b = z[(y + passo) * w + x];
          if (b !== null) {
            soma += (a - b) ** 2;
            pares++;
          }
        }
      }
    }
    if (pares < 50) continue;
    const baseM = passo * px;
    const desvioM = Math.sqrt(soma / pares);
    pontos.push({
      baseM: Math.round(baseM),
      desvioM: r1(desvioM),
      declivRmsGraus: r1((Math.atan(desvioM / baseM) * 180) / Math.PI),
      pares,
    });
  }

  // Hurst: inclinação da reta log(desvio) × log(base), por mínimos quadrados.
  const validos = pontos.filter((p) => p.desvioM > 0);
  let hurst: number | null = null;
  if (validos.length >= 3) {
    const xs = validos.map((p) => Math.log10(p.baseM));
    const ys = validos.map((p) => Math.log10(p.desvioM));
    const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
    const my = ys.reduce((a, b) => a + b, 0) / ys.length;
    const num = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0);
    const den = xs.reduce((s, x) => s + (x - mx) ** 2, 0);
    hurst = den > 0 ? Math.round((num / den) * 100) / 100 : null;
  }
  return { pontos, hurst };
}

/**
 * Compara a rugosidade nas MESMAS distâncias. Nota = 100 × (1 − média de
 * |log10(razão)|): razão 1 → 100; o dobro (ou a metade) → 70; 10× → 0.
 */
export function compararRugosidade(rt: Relevo, ra: Relevo, nomeAlvo: string): ComparacaoRugosidade {
  const terra = rugosidadeMultiescala(rt);
  const alvo = rugosidadeMultiescala(ra);
  const n = Math.min(terra.pontos.length, alvo.pontos.length);
  // Piso = precisão da grade (as alturas são guardadas com 0,1 m). Um terreno
  // totalmente plano, como um salar, tem desvio 0: sem o piso a razão seria 0 ou ∞.
  const razoes = Array.from({ length: n }, (_, i) => ({
    baseM: Math.round((terra.pontos[i].baseM + alvo.pontos[i].baseM) / 2),
    razao: Math.max(terra.pontos[i].desvioM, PRECISAO_M) / Math.max(alvo.pontos[i].desvioM, PRECISAO_M),
  }));
  const finitas = razoes;
  const nota = finitas.length
    ? Math.round(
        100 * Math.max(0, 1 - finitas.reduce((s, x) => s + Math.abs(Math.log10(x.razao)), 0) / finitas.length),
      )
    : null;

  // Leitura em uma frase: onde a Terra é mais/menos rugosa e o que o Hurst diz.
  const media = finitas.length ? 10 ** (finitas.reduce((s, x) => s + Math.log10(x.razao), 0) / finitas.length) : 1;
  if (!finitas.length) {
    return {
      terra,
      alvo,
      razoes: [],
      nota: null,
      regra: '',
      leitura: 'Não há pontos com dado suficientes para medir a rugosidade nas mesmas distâncias.',
    };
  }
  // Terreno abaixo da precisão em TODAS as escalas: salar/lago (muito plano de verdade
  // ou achatado na edição do DEM). A razão exata não existe — só um limite.
  const planoTerra = terra.pontos.every((p) => p.desvioM < PRECISAO_M);
  const planoAlvo = alvo.pontos.every((p) => p.desvioM < PRECISAO_M);
  const comparacao = planoTerra
    ? `O análogo é plano abaixo da precisão da grade (0,1 m) em todas as escalas — salar ou lago, que o Copernicus DEM também achata na edição. Ele é PELO MENOS ${f(1 / media, 0)}× mais liso que ${nomeAlvo}`
    : planoAlvo
      ? `${nomeAlvo} é plano abaixo da precisão da grade (0,1 m) em todas as escalas; o análogo é PELO MENOS ${f(media, 0)}× mais rugoso`
      : media > 1.25
        ? `O análogo é em média ${f(media)}× mais rugoso que ${nomeAlvo}`
        : media < 0.8
          ? `O análogo é em média ${f(1 / media)}× mais liso que ${nomeAlvo}`
          : `O análogo tem rugosidade parecida com a de ${nomeAlvo}`;
  const hurstTexto =
    terra.hurst !== null && alvo.hurst !== null
      ? ` Hurst ${f(terra.hurst, 2)} contra ${f(alvo.hurst, 2)}: ${
          Math.abs(terra.hurst - alvo.hurst) < 0.15
            ? 'a rugosidade cresce com a escala do mesmo jeito nos dois — mesmo tipo de processo formador.'
            : terra.hurst > alvo.hurst
              ? 'na Terra a rugosidade cresce mais com a escala (relevo dominado por formas grandes, como vales e montanhas).'
              : 'no alvo a rugosidade cresce mais com a escala (formas grandes, como crateras, dominam).'
        }`
      : '';

  return {
    terra,
    alvo,
    razoes: razoes.map((x) => ({ baseM: x.baseM, razao: Math.round(x.razao * 100) / 100 })),
    nota,
    regra:
      '100 × (1 − média de |log₁₀(desvio Terra ÷ desvio alvo)|) nas mesmas distâncias (1, 2, 4, 8… pixels). Razão 1 → 100; o dobro ou a metade → 70; 10× → 0. Desvio = raiz da média de (altura₁ − altura₂)² entre pontos a essa distância (Shepard et al. 2001).',
    leitura: `${comparacao} nas mesmas distâncias.${hurstTexto}`,
  };
}

/** Pixel comum × resolução nativa dos dois modelos de relevo. */
export function avaliarEscala(rt: Relevo, ra: Relevo): Escala {
  const pixelComumM = r1((rt.metrosPorPixel.x + rt.metrosPorPixel.y + ra.metrosPorPixel.x + ra.metrosPorPixel.y) / 4);
  const nativaMaisGrossaM = Math.max(rt.resolucaoNativa, ra.resolucaoNativa);
  const superamostrado = pixelComumM < nativaMaisGrossaM * 0.95;
  const janelaKm = r1((ra.largura * ra.metrosPorPixel.x) / 1000);
  return {
    pixelComumM,
    nativaTerraM: rt.resolucaoNativa,
    nativaAlvoM: ra.resolucaoNativa,
    nativaMaisGrossaM,
    superamostrado,
    janelaKm,
    texto: superamostrado
      ? `Atenção: o pixel comum (${f(pixelComumM)} m) é mais fino que a resolução nativa mais grossa (${f(nativaMaisGrossaM)} m). Os detalhes abaixo de ${f(nativaMaisGrossaM)} m vêm da reamostragem, não do sensor — use uma grade menor.`
      : `Os dois relevos foram reamostrados para o mesmo pixel de ${f(pixelComumM)} m, mais grosso que a resolução nativa dos dois sensores (Terra ${f(rt.resolucaoNativa)} m, alvo ${f(ra.resolucaoNativa)} m). Assim nenhum lado tem detalhe que o outro não consegue ver.`,
  };
}

const SENSORES: Record<Corpo, Omit<Sensor, 'relevo'> & { relevo: Omit<Sensor['relevo'], 'nativaM'> }> = {
  Terra: {
    corpo: 'Terra',
    relevo: {
      produto: 'Copernicus DEM GLO-30',
      tecnica: 'Radar interferométrico (TanDEM-X, banda X): atravessa nuvens; mede o topo da vegetação e das construções',
    },
    foto: { produto: 'Sentinel-2 MSI, nível L2A', faixa: '13 bandas de 443 a 2190 nm', pixelNativoM: 10 },
    atmosfera: 'Densa (1.014 mb), com vapor, aerossóis e nuvens.',
    compensacao:
      'Foto em refletância de superfície (L2A): a ESA já remove o espalhamento e a absorção da atmosfera (Sen2Cor). Cenas com < 5% de nuvens e com menos neve.',
  },
  Marte: {
    corpo: 'Marte',
    relevo: {
      produto: 'MRO CTX DTM (USGS)',
      tecnica: 'Estéreo de fotos de 6 m (Ames Stereo Pipeline), alinhado ao laser MOLA',
    },
    foto: { produto: 'MRO CTX (ortoimagem)', faixa: 'pancromática, 500–800 nm', pixelNativoM: 6 },
    atmosfera: 'Fina (6,36 mb), mas com poeira em suspensão que deixa as fotos com névoa e menos contraste.',
    compensacao:
      'A névoa de poeira não é removida no produto. Compensação: as notas usam só a geometria (altura e declive, que a névoa não muda) e a foto recebe a mesma normalização de contraste da Terra (percentis 1–99%, que retira a névoa aditiva como a subtração do objeto escuro).',
  },
  Lua: {
    corpo: 'Lua',
    relevo: {
      produto: 'Kaguya TC DTM v2 (USGS)',
      tecnica: 'Estéreo da Terrain Camera (~10 m), alinhado ao laser LOLA',
    },
    foto: { produto: 'Kaguya Terrain Camera (ortoimagem)', faixa: 'pancromática, 430–850 nm', pixelNativoM: 10 },
    atmosfera: 'Praticamente vácuo (3 × 10⁻¹⁵ bar): sem névoa; sombras totalmente pretas e iluminação rasante nos polos.',
    compensacao:
      'Sem atmosfera para corrigir. A diferença que pesa é a luz: perto do polo o Sol fica a poucos graus do horizonte. Por isso a comparação numérica usa o relevo, que não depende da luz.',
  },
};

/** Monta o relatório completo de validação para a comparação. */
export function validarComparacao(rt: Relevo, ra: Relevo): ValidacaoCientifica {
  const corpo = ra.corpo;
  const nomeAlvo = ra.nome ?? corpo;
  const escala = avaliarEscala(rt, ra);
  const rugosidade = compararRugosidade(rt, ra, nomeAlvo);
  const sensor = (c: Corpo, nativaM: number): Sensor => ({ ...SENSORES[c], relevo: { ...SENSORES[c].relevo, nativaM } });

  return {
    passos: [
      {
        titulo: '1. Mesma janela física',
        texto: `Os dois lados cobrem ${f(escala.janelaKm)} × ${f(escala.janelaKm)} km de chão, com o norte para cima.`,
      },
      {
        titulo: '2. Mesmo pixel, nunca mais fino que o sensor mais grosso',
        texto: escala.texto,
      },
      {
        titulo: '3. Só medidas relativas',
        texto:
          'Comparamos declividade, amplitude e rugosidade, nunca a altitude absoluta: a Terra mede a partir do nível do mar, Marte do areoide e a Lua de uma esfera de referência.',
      },
      {
        titulo: '4. Rugosidade em várias escalas',
        texto:
          'Medimos o desvio de altura entre pontos a 1, 2, 4, 8… pixels e comparamos os dois corpos na MESMA distância em metros. Assim, a nota não depende de uma única escala escolhida.',
      },
      {
        titulo: '5. Atmosfera fora da nota',
        texto:
          'Todas as notas de terreno vêm da altimetria (geometria), que não muda com névoa, poeira, cor ou brilho. As fotos são só para inspeção visual e recebem a compensação de cada sensor (tabela abaixo).',
      },
      {
        titulo: '6. Nota final transparente',
        texto:
          'Cada dimensão tem uma regra escrita (veja "Como cada nota foi calculada"). A nota geral é a média com pesos iguais das dimensões que têm dado; sem dado, a dimensão aparece como "sem dado" e não entra na média.',
      },
    ],
    escala,
    rugosidade,
    sensores: [sensor('Terra', rt.resolucaoNativa), sensor(corpo, ra.resolucaoNativa)],
    limites: [
      'O Copernicus DEM é um modelo de superfície (inclui árvores e prédios); os DTMs de Marte e da Lua medem o chão. Em análogos áridos a diferença é pequena.',
      'Os DTMs estéreo de Marte e da Lua têm buracos onde as fotos não deram par estéreo (sombra, poeira, gelo); esses pixels ficam de fora de todas as contas.',
      'A simulação da câmera de Marte/Lua com bandas do Sentinel-2 é uma aproximação: média simples das bandas dentro da faixa, sem a curva exata de resposta da câmera.',
      'O catálogo da USGS não informa o ângulo do Sol das fotos de Marte e da Lua; a do Sentinel-2 é informada. Sombras diferentes mudam a aparência, não as medidas.',
    ],
    referencias: [
      {
        titulo: 'Shepard et al. (2001) — The roughness of natural terrain: a planetary and remote sensing perspective, JGR',
        url: 'https://doi.org/10.1029/2000JE001429',
      },
      {
        titulo: 'Kreslavsky & Head (2000) — Kilometer-scale roughness of Mars: results from MOLA data analysis, JGR',
        url: 'https://doi.org/10.1029/2000JE001259',
      },
      {
        titulo: 'Chavez (1988) — An improved dark-object subtraction technique for atmospheric scattering correction',
        url: 'https://doi.org/10.1016/0034-4257(88)90019-3',
      },
      {
        titulo: 'Malin Space Science Systems — MRO Context Camera (CTX): faixa de 500 a 800 nm',
        url: 'https://www.msss.com/science/mro-ctx-instrument-description.php',
      },
      { titulo: 'JAXA — SELENE/Kaguya Terrain Camera: 430 a 850 nm', url: 'https://selene.tksc.jaxa.jp/en/equipment/tc_e.htm' },
      {
        titulo: 'Microsoft Planetary Computer — Sentinel-2 Level-2A (refletância de superfície)',
        url: 'https://planetarycomputer.microsoft.com/dataset/sentinel-2-l2a',
      },
    ],
  };
}
