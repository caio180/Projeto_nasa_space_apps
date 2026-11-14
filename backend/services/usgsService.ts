// =============================================================================
// SERVICE — USGS Astrogeology (Marte e Lua).
//
// 1. STAC da USGS: descobre quais DTMs cobrem um local (mesmo padrão STAC
//    que usamos com a Microsoft).
// 2. COG: lê SÓ a janela pedida do GeoTIFF, por requisições parciais (HTTP
//    Range), com a biblioteca `geotiff`. A USGS não tem uma "Data API" que
//    recorte para nós, como a Microsoft tem.
// =============================================================================

import { fromUrl } from 'geotiff';
import { AppError } from '../model/model.ts';
import type { ItemUsgs } from '../model/planetaModel.ts';

const USGS_STAC_URL = process.env.URL_USGS_STAC;
const TIMEOUT_MS = 45_000;

/** Rejeita a promessa se ela demorar mais que `ms` (a lib geotiff não tem timeout próprio). */
function comTimeout<T>(promessa: Promise<T>, ms: number, mensagem: string): Promise<T> {
  let id: ReturnType<typeof setTimeout>;
  const limite = new Promise<never>((_, rejeitar) => {
    id = setTimeout(() => rejeitar(new AppError(504, mensagem)), ms);
  });
  return Promise.race([promessa, limite]).finally(() => clearTimeout(id));
}

/** POST /search no STAC da USGS, filtrando por bbox (graus). */
export function buscarItensUsgs(colecao: string, bbox: number[], limite = 20): Promise<ItemUsgs[]> {
  return pesquisarUsgs({ collections: [colecao], bbox, limit: limite });
}

/** POST /search no STAC da USGS: itens que CONTÊM o ponto (usado perto dos polos). */
export function buscarItensUsgsNoPonto(colecao: string, lon: number, lat: number, limite = 50): Promise<ItemUsgs[]> {
  return pesquisarUsgs({ collections: [colecao], intersects: { type: 'Point', coordinates: [lon, lat] }, limit: limite });
}

async function pesquisarUsgs(corpo: Record<string, unknown>): Promise<ItemUsgs[]> {
  let resposta: Response;
  try {
    resposta = await fetch(`${USGS_STAC_URL}/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    if (e instanceof Error && e.name === 'TimeoutError') {
      throw new AppError(504, 'O catálogo da USGS demorou demais para responder.');
    }
    throw new AppError(502, 'Não foi possível conectar ao catálogo da USGS.');
  }
  if (!resposta.ok) {
    throw new AppError(502, `Erro ${resposta.status} no catálogo da USGS.`, (await resposta.text()).slice(0, 500));
  }
  const dados = (await resposta.json()) as { features?: ItemUsgs[] };
  return dados.features ?? [];
}

export interface JanelaLida {
  valores: ArrayLike<number>;
  largura: number;
  altura: number;
  nodata: number | null;
}

/**
 * Lê uma janela (bbox nas coordenadas da projeção do arquivo) de um COG,
 * reamostrada para largura × altura. A lib escolhe sozinha a versão reduzida
 * (overview) mais leve que ainda tem detalhe suficiente.
 */
export async function lerJanelaCog(
  url: string,
  bbox: number[],
  largura: number,
  altura: number,
  mensagemDemora = 'A leitura do relevo na USGS demorou demais.',
): Promise<JanelaLida> {
  const leitura = async () => {
    const tiff = await fromUrl(url);
    const imagem = await tiff.getImage(0);
    const nodata = imagem.getGDALNoData();
    const rasters = await tiff.readRasters({
      bbox,
      width: largura,
      height: altura,
      samples: [0],
      fillValue: nodata ?? Number.NaN, // fora do arquivo = sem dado
    });
    const banda = Array.isArray(rasters) ? rasters[0] : rasters;
    return { valores: banda as ArrayLike<number>, largura, altura, nodata };
  };

  try {
    return await comTimeout(leitura(), TIMEOUT_MS, mensagemDemora);
  } catch (e) {
    if (e instanceof AppError) throw e;
    throw new AppError(502, 'Falha ao ler o arquivo da USGS.', e instanceof Error ? e.message : String(e));
  }
}
