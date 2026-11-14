// =============================================================================
// MODEL do relevo — tipos, validação e regras para montar uma grade de
// elevação a partir do Copernicus DEM (Planetary Computer).
//
// Fluxo:
//   1. validarRelevo()      → confere bbox e resolução
//   2. calcularGrade()      → decide largura × altura em pixels sem distorcer
//   3. lerNpy()             → lê cada recorte .npy que a Data API devolve
//   4. combinarRecortes()   → junta os tiles (cada um cobre 1° × 1°)
//   5. calcularEstatisticas → altitude, amplitude e declividade
// =============================================================================

import { AppError, validarBBox } from './model.ts';
import type { BBox } from './model.ts';
import type { Corpo } from './planetaModel.ts';

export const COLECAO_DEM = 'cop-dem-glo-30';
const RESOLUCAO_PADRAO = 128;
const RESOLUCAO_MIN = 16;
const RESOLUCAO_MAX = 512;
const SPAN_MAX_GRAUS = 2; // até 2° × 2° → no máximo 9 tiles do DEM
const LIMIAR_PLANO_GRAUS = 5; // declividade abaixo disso conta como "plano"

export interface ParametrosRelevo {
  bbox: BBox;
  resolucao: number; // pixels no lado maior da grade
}

export interface EstatisticasRelevo {
  minimo: number;
  maximo: number;
  media: number;
  amplitude: number;
  declividadeMedia: number; // graus
  percentualPlano: number; // % de pixels com declividade < LIMIAR_PLANO_GRAUS
  limiarPlanoGraus: number;
  pixelsSemDado: number;
}

export interface Relevo {
  corpo: Corpo;
  /** Nome do local (planetas) — na Terra, a área é definida pelo bbox. */
  nome?: string;
  descricao?: string;
  gravidade: number; // m/s²
  fonte: string;
  bbox: BBox;
  largura: number; // colunas (oeste → leste)
  altura: number; // linhas (norte → sul)
  metrosPorPixel: { x: number; y: number };
  /** Resolução NATIVA do modelo de relevo (m): detalhe real que o sensor consegue ver. */
  resolucaoNativa: number;
  /** Elevação em metros, linha a linha, começando no canto noroeste. null = sem dado. */
  elevacoes: (number | null)[];
  estatisticas: EstatisticasRelevo;
  itens: string[];
}

/**
 * Recorte devolvido pela Data API em .npy: as bandas pedidas e, por último, a máscara.
 * DEM: (2, h, w) em float32. Foto Sentinel-2 "visual": (4, h, w) em uint8 (R, G, B, máscara).
 */
export interface RecorteNpy {
  forma: number[];
  dados: Float32Array | Uint8Array | Uint16Array;
}

/** Resolução da grade (pixels no lado maior). Usada pela Terra e pelos planetas. */
export function validarResolucao(valor: unknown, erros: string[]): number {
  if (valor === undefined) return RESOLUCAO_PADRAO;
  if (typeof valor !== 'number' || !Number.isInteger(valor) || valor < RESOLUCAO_MIN || valor > RESOLUCAO_MAX) {
    erros.push(`resolucao deve ser um inteiro entre ${RESOLUCAO_MIN} e ${RESOLUCAO_MAX}.`);
    return RESOLUCAO_PADRAO;
  }
  return valor;
}

export function validarRelevo(body: unknown): ParametrosRelevo {
  const erros: string[] = [];
  const b = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>;

  const bbox = validarBBox(b.bbox, erros);
  if (erros.length === 0) {
    const [lonMin, latMin, lonMax, latMax] = bbox;
    if (lonMax - lonMin > SPAN_MAX_GRAUS || latMax - latMin > SPAN_MAX_GRAUS) {
      erros.push(`Área grande demais para o relevo: use no máximo ${SPAN_MAX_GRAUS}° de largura e de altura.`);
    }
  }

  const resolucao = validarResolucao(b.resolucao, erros);

  if (erros.length > 0) throw new AppError(400, 'Parâmetros de relevo inválidos.', erros);
  return { bbox, resolucao };
}

/** Tamanho de 1° em metros na latitude média (aproximação esférica, boa para o protótipo). */
function metrosPorGrau(latMedia: number) {
  const rad = (latMedia * Math.PI) / 180;
  return { lon: 111_320 * Math.cos(rad), lat: 110_574 };
}

/**
 * Decide largura × altura da grade mantendo a proporção REAL em metros
 * (1° de longitude encolhe perto dos polos). O lado maior recebe `resolucao` pixels.
 */
export function calcularGrade({ bbox, resolucao }: ParametrosRelevo) {
  const [lonMin, latMin, lonMax, latMax] = bbox;
  const m = metrosPorGrau((latMin + latMax) / 2);
  const larguraM = (lonMax - lonMin) * m.lon;
  const alturaM = (latMax - latMin) * m.lat;

  const largura = larguraM >= alturaM ? resolucao : Math.max(2, Math.round((resolucao * larguraM) / alturaM));
  const altura = alturaM > larguraM ? resolucao : Math.max(2, Math.round((resolucao * alturaM) / larguraM));

  return {
    largura,
    altura,
    metrosPorPixel: { x: larguraM / largura, y: alturaM / altura },
  };
}

/**
 * Lê um arquivo .npy (formato do NumPy) sem biblioteca.
 * Layout: "\x93NUMPY" + versão (2 bytes) + tamanho do cabeçalho + cabeçalho
 * em texto (ex.: {'descr': '<f4', 'shape': (2, 4, 8)}) + dados brutos.
 */
export function lerNpy(buffer: ArrayBuffer): RecorteNpy {
  const bytes = new Uint8Array(buffer);
  const assinatura = String.fromCharCode(...bytes.slice(1, 6));
  if (bytes[0] !== 0x93 || assinatura !== 'NUMPY') {
    throw new AppError(502, 'A Data API devolveu um arquivo que não é .npy.');
  }

  const versao = bytes[6];
  const view = new DataView(buffer);
  const tamCabecalho = versao === 1 ? view.getUint16(8, true) : view.getUint32(8, true);
  const inicioCabecalho = versao === 1 ? 10 : 12;
  const cabecalho = new TextDecoder().decode(bytes.slice(inicioCabecalho, inicioCabecalho + tamCabecalho));

  const ehFloat = cabecalho.includes("'<f4'");
  const ehU16 = cabecalho.includes("'<u2'"); // bandas de refletância do Sentinel-2
  if (!ehFloat && !ehU16 && !cabecalho.includes("'|u1'")) {
    throw new AppError(502, `Tipo de dado .npy inesperado: ${cabecalho}`);
  }
  const formaTexto = /'shape':\s*\(([^)]*)\)/.exec(cabecalho)?.[1] ?? '';
  const forma = formaTexto
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map(Number);

  // slice() copia para um ArrayBuffer novo, garantindo alinhamento de 4 bytes.
  const bruto = buffer.slice(inicioCabecalho + tamCabecalho);
  const dados = ehFloat ? new Float32Array(bruto) : ehU16 ? new Uint16Array(bruto) : new Uint8Array(bruto);
  return { forma, dados };
}

/**
 * Junta os recortes de vários tiles. Todos foram pedidos com o MESMO bbox e
 * tamanho, então o pixel (i) de cada um corresponde ao mesmo lugar no chão.
 * A máscara (banda 1) diz quais pixels aquele tile realmente cobre.
 */
export function combinarRecortes(recortes: RecorteNpy[], largura: number, altura: number): (number | null)[] {
  const total = largura * altura;
  const saida: (number | null)[] = new Array(total).fill(null);

  for (const { forma, dados } of recortes) {
    const [bandas, linhas, colunas] = forma;
    if (bandas < 2 || linhas !== altura || colunas !== largura) {
      throw new AppError(502, `Recorte com formato inesperado: (${forma.join(', ')}).`);
    }
    for (let i = 0; i < total; i++) {
      if (saida[i] === null && dados[total + i] > 0) {
        saida[i] = Math.round(dados[i] * 10) / 10; // 0,1 m basta e encolhe o JSON
      }
    }
  }
  return saida;
}

/** Declividade (graus) dos pixels com dado, por diferenças centrais. */
export function declividades(elev: (number | null)[], largura: number, altura: number, mx: number, my: number) {
  return gradeDeclividades(elev, largura, altura, mx, my).filter((d): d is number => d !== null);
}

/** Declividade (graus) pixel a pixel, na mesma ordem da grade. null = sem dado em volta. */
export function gradeDeclividades(elev: (number | null)[], largura: number, altura: number, mx: number, my: number) {
  const valor = (x: number, y: number) => elev[y * largura + x];
  const resultado: (number | null)[] = new Array(largura * altura).fill(null);

  for (let y = 0; y < altura; y++) {
    for (let x = 0; x < largura; x++) {
      const xa = Math.max(0, x - 1);
      const xb = Math.min(largura - 1, x + 1);
      const ya = Math.max(0, y - 1);
      const yb = Math.min(altura - 1, y + 1);
      const e1 = valor(xa, y);
      const e2 = valor(xb, y);
      const n1 = valor(x, ya);
      const n2 = valor(x, yb);
      if (e1 === null || e2 === null || n1 === null || n2 === null || xa === xb || ya === yb) continue;
      const dzdx = (e2 - e1) / ((xb - xa) * mx);
      const dzdy = (n2 - n1) / ((yb - ya) * my);
      resultado[y * largura + x] = (Math.atan(Math.hypot(dzdx, dzdy)) * 180) / Math.PI;
    }
  }
  return resultado;
}

export function calcularEstatisticas(
  elev: (number | null)[],
  largura: number,
  altura: number,
  metrosPorPixel: { x: number; y: number },
): EstatisticasRelevo {
  const validos = elev.filter((v): v is number => v !== null);
  if (validos.length === 0) {
    throw new AppError(404, 'Não há dados de relevo para esta área (provavelmente só oceano).');
  }

  let minimo = Infinity;
  let maximo = -Infinity;
  let soma = 0;
  for (const v of validos) {
    if (v < minimo) minimo = v;
    if (v > maximo) maximo = v;
    soma += v;
  }

  const decl = declividades(elev, largura, altura, metrosPorPixel.x, metrosPorPixel.y);
  const mediaDecl = decl.length ? decl.reduce((a, b) => a + b, 0) / decl.length : 0;
  const planos = decl.filter((d) => d < LIMIAR_PLANO_GRAUS).length;

  const arred = (n: number) => Math.round(n * 10) / 10;
  return {
    minimo: arred(minimo),
    maximo: arred(maximo),
    media: arred(soma / validos.length),
    amplitude: arred(maximo - minimo),
    declividadeMedia: arred(mediaDecl),
    percentualPlano: decl.length ? arred((100 * planos) / decl.length) : 0,
    limiarPlanoGraus: LIMIAR_PLANO_GRAUS,
    pixelsSemDado: elev.length - validos.length,
  };
}

/** Janela quadrada de `ladoKm` km de chão centrada em (lon, lat) na Terra. */
export function janelaTerraNoPonto(lon: number, lat: number, ladoKm: number): BBox {
  const m = metrosPorGrau(lat);
  const meioLon = (ladoKm * 1000) / 2 / m.lon;
  const meioLat = (ladoKm * 1000) / 2 / m.lat;
  return [lon - meioLon, lat - meioLat, lon + meioLon, lat + meioLat];
}
