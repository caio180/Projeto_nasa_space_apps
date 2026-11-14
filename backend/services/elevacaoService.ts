// =============================================================================
// SERVICE — Data API da Planetary Computer (TiTiler).
//
// A STAC API (planetaryService.ts) diz QUAIS arquivos existem. A Data API
// LÊ esses arquivos no servidor da Microsoft e devolve só o pedaço pedido,
// já reamostrado. Assim não baixamos o GeoTIFF inteiro nem precisamos de SAS.
//
// Endpoint usado (conferido em /api/data/v1/openapi.json):
//   GET /item/bbox/{minx},{miny},{maxx},{maxy}/{width}x{height}.npy
//       ?collection=...&item=...&assets=data
// =============================================================================

import { AppError } from '../model/model.ts';
import type { BBox } from '../model/model.ts';

const DATA_URL = process.env.URL_DATA_API;
// O tempo limite vale até o fim do download (fotos com várias bandas são maiores).
const TIMEOUT_MS = 60_000;

/** Recorte de um item no bbox pedido, em formato .npy (`assets`: "data" no DEM, "visual" na foto do Sentinel-2). */
export async function obterRecorteNpy(
  colecao: string,
  item: string,
  bbox: BBox,
  largura: number,
  altura: number,
  assets: string | readonly string[] = 'data',
): Promise<ArrayBuffer> {
  const params = new URLSearchParams({ collection: colecao, item });
  // Vários assets = várias bandas empilhadas na mesma resposta (?assets=B03&assets=B04…).
  for (const a of typeof assets === 'string' ? [assets] : assets) params.append('assets', a);
  const url = `${DATA_URL}/item/bbox/${bbox.join(',')}/${largura}x${altura}.npy?${params}`;

  let resposta: Response;
  try {
    resposta = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (e) {
    if (e instanceof Error && e.name === 'TimeoutError') {
      throw new AppError(504, 'A Data API da Planetary Computer demorou demais para responder.');
    }
    throw new AppError(502, 'Não foi possível conectar à Data API da Planetary Computer.');
  }

  if (!resposta.ok) {
    const texto = await resposta.text();
    throw new AppError(502, `Erro ${resposta.status} na Data API ao ler o item ${item}.`, texto.slice(0, 500));
  }
  // O corpo chega depois do cabeçalho: o tempo limite também pode estourar aqui.
  try {
    return await resposta.arrayBuffer();
  } catch {
    throw new AppError(504, `A Data API demorou demais para enviar o item ${item}.`);
  }
}
