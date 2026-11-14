// =============================================================================
// MODEL das imagens de satélite (foto real do chão) — Terra, Marte e Lua.
//
// A foto é recortada na MESMA janela do relevo 3D. Assim ela serve para:
//   1. comparar lado a lado o terreno da Terra com o de Marte/Lua;
//   2. "vestir" a malha 3D (textura) com a cor real do chão.
//
// Para não depender de biblioteca de imagem, o PNG é montado aqui mesmo:
// assinatura + IHDR + IDAT (zlib, que já vem no Node) + IEND.
// =============================================================================

import { crc32, deflateSync } from 'node:zlib';
import type { BBox } from './model.ts';
import type { Corpo } from './planetaModel.ts';

export const COLECAO_FOTO_TERRA = 'sentinel-2-l2a';
export const NUVENS_MAX = 30; // % de nuvens aceito no tile (a nuvem é tirada depois, pixel a pixel)
export const COBERTURA_FOTO = 0.995; // para de juntar cenas quando 99,5% da janela tem foto
export const LADO_IMAGEM_PADRAO = 512;
const LADO_IMAGEM_MIN = 128;
const LADO_IMAGEM_MAX = 1024;

export interface ImagemSatelite {
  corpo: Corpo;
  nome?: string;
  fonte: string;
  instrumento: string;
  /** Data(s) das cenas usadas (Terra) ou id do produto (Marte/Lua). */
  datas: string[];
  itens: string[];
  bbox: BBox;
  largura: number;
  altura: number;
  metrosPorPixel: number;
  /** 'cor' = RGB verdadeiro (Sentinel-2); 'pancromatica' = tons de cinza (CTX, Kaguya). */
  tipo: 'cor' | 'pancromatica';
  /** PNG pronto para <img src> e para textura do three.js. */
  png: string;
  cobertura: number; // 0–1 da janela com foto
  /** Altura do Sol na hora da foto (só o Sentinel-2 informa; USGS não). */
  sol: { elevacao: number; azimute: number } | null;
  /** Terra "vista" pela câmera de Marte ou da Lua (só na foto da Terra). */
  simulacao: SimulacaoSensor | null;
  notas: string[];
}

export interface SimulacaoSensor {
  corpo: 'Marte' | 'Lua';
  sensor: string;
  faixa: string;
  bandas: string[];
  png: string;
}

/**
 * Bandas do Sentinel-2 dentro da faixa de cada câmera pancromática.
 * Centros: B02 490, B03 560, B04 665, B05 705, B06 740, B07 783, B08 842 nm.
 * CTX (Marte): 500–800 nm (Malin Space Science Systems).
 * Kaguya TC (Lua): 430–850 nm (JAXA).
 */
export const BANDAS_SIMULACAO = {
  Marte: { sensor: 'MRO CTX', faixa: '500–800 nm', bandas: ['B03', 'B04', 'B05', 'B06', 'B07'] },
  Lua: { sensor: 'Kaguya Terrain Camera', faixa: '430–850 nm', bandas: ['B02', 'B03', 'B04', 'B05', 'B06', 'B07', 'B08'] },
} as const;

/** Lado da imagem em pixels (?tamanho=). */
export function validarLadoImagem(valor: unknown): number {
  const n = Number(valor);
  if (valor === undefined || valor === '' || !Number.isInteger(n)) return LADO_IMAGEM_PADRAO;
  return Math.min(LADO_IMAGEM_MAX, Math.max(LADO_IMAGEM_MIN, n));
}

function bloco(tipo: string, dados: Buffer) {
  const tamanho = Buffer.alloc(4);
  tamanho.writeUInt32BE(dados.length);
  const tipoEDados = Buffer.concat([Buffer.from(tipo, 'ascii'), dados]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(tipoEDados) >>> 0);
  return Buffer.concat([tamanho, tipoEDados, crc]);
}

/**
 * Monta um PNG de 8 bits. `canais`: 1 = cinza, 3 = RGB, 4 = RGBA (alfa 0 = sem foto,
 * para os buracos aparecerem transparentes e não pretos).
 */
export function codificarPng(largura: number, altura: number, canais: 1 | 3 | 4, pixels: Uint8Array): string {
  const tipoCor = { 1: 0, 3: 2, 4: 6 }[canais];
  const cabecalho = Buffer.alloc(13);
  cabecalho.writeUInt32BE(largura, 0);
  cabecalho.writeUInt32BE(altura, 4);
  cabecalho.writeUInt8(8, 8); // bits por canal
  cabecalho.writeUInt8(tipoCor, 9);
  // compressão, filtro e entrelaçamento = 0

  // Cada linha começa com o byte de filtro (0 = nenhum).
  const linha = largura * canais;
  const cru = Buffer.alloc((linha + 1) * altura);
  for (let y = 0; y < altura; y++) {
    cru[y * (linha + 1)] = 0;
    cru.set(pixels.subarray(y * linha, (y + 1) * linha), y * (linha + 1) + 1);
  }

  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    bloco('IHDR', cabecalho),
    bloco('IDAT', deflateSync(cru, { level: 6 })),
    bloco('IEND', Buffer.alloc(0)),
  ]);
  return `data:image/png;base64,${png.toString('base64')}`;
}

/**
 * Converte valores brutos (DN ou refletância, qualquer faixa) em cinza 0–255,
 * esticando entre os percentis 1% e 99%. Sem dado → alfa 0.
 * Devolve RGBA (cinza repetido) e a fração da janela com dado.
 */
export function cinzaComContraste(valores: ArrayLike<number>, nodata: number | null) {
  const validos: number[] = [];
  for (let i = 0; i < valores.length; i++) {
    const v = valores[i];
    if (Number.isFinite(v) && v !== nodata && v > -3e38) validos.push(v);
  }
  const rgba = new Uint8Array(valores.length * 4);
  if (validos.length === 0) return { rgba, cobertura: 0 };

  validos.sort((a, b) => a - b);
  const baixo = validos[Math.floor(validos.length * 0.01)];
  const alto = validos[Math.floor(validos.length * 0.99)];
  const faixa = alto - baixo || 1;
  for (let i = 0; i < valores.length; i++) {
    const v = valores[i];
    if (!Number.isFinite(v) || v === nodata || v <= -3e38) continue; // alfa fica 0
    const c = Math.round(Math.min(255, Math.max(0, ((v - baixo) / faixa) * 255)));
    rgba.set([c, c, c, 255], i * 4);
  }
  return { rgba, cobertura: validos.length / valores.length };
}
