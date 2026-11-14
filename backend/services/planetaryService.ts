// =============================================================================
// SERVICE — conversa com a API externa (Microsoft Planetary Computer / STAC).
//
// Por que separar do controller?
//   - O controller cuida de HTTP do NOSSO servidor (req/res).
//   - O service cuida de HTTP da API EXTERNA (fetch, timeout, erros dela).
//   Assim, quando entrarem NASA POWER, Trek etc., cada fonte ganha seu service
//   e os controllers continuam simples.
// =============================================================================

import { AppError } from '../model/model.ts';
import type { StacCollection, StacItemCollection, StacSearchBody } from '../model/model.ts';

// URL_API vem do .env (obrigatório).
const STAC_URL = process.env.URL_API;
const TIMEOUT_MS = 20_000;

/**
 * Faz a requisição e trata os erros num lugar só.
 * - Timeout          → 504
 * - Falha de rede    → 502
 * - 404 da STAC      → 404
 * - 400 da STAC      → 400 (repassa a mensagem dela)
 * - Outros erros     → 502
 */
async function requisitarStac<T>(caminho: string, init?: RequestInit): Promise<T> {
  let resposta: Response;
  try {
    resposta = await fetch(`${STAC_URL}${caminho}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...init?.headers },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    if (e instanceof Error && e.name === 'TimeoutError') {
      throw new AppError(504, 'A Planetary Computer demorou demais para responder.');
    }
    throw new AppError(502, 'Não foi possível conectar à Planetary Computer.');
  }

  if (!resposta.ok) {
    const texto = await resposta.text();
    let detalhes: unknown = texto;
    try {
      detalhes = JSON.parse(texto);
    } catch {
      // resposta não era JSON; mantém o texto
    }
    if (resposta.status === 404) throw new AppError(404, 'Recurso não encontrado na Planetary Computer.', detalhes);
    if (resposta.status === 400) throw new AppError(400, 'A Planetary Computer recusou os parâmetros.', detalhes);
    throw new AppError(502, `Erro ${resposta.status} na Planetary Computer.`, detalhes);
  }

  // O corpo chega depois do cabeçalho: o tempo limite também pode estourar aqui.
  try {
    return (await resposta.json()) as T;
  } catch {
    throw new AppError(504, 'A Planetary Computer demorou demais para enviar a resposta.');
  }
}

/** POST /search — busca Items (cenas) por coleção, área e período. */
export function buscarItens(corpo: StacSearchBody): Promise<StacItemCollection> {
  return requisitarStac<StacItemCollection>('/search', {
    method: 'POST',
    body: JSON.stringify(corpo),
  });
}

/** GET /collections — lista todas as coleções do catálogo. */
export async function listarColecoes(): Promise<StacCollection[]> {
  const dados = await requisitarStac<{ collections: StacCollection[] }>('/collections');
  return dados.collections;
}

// Cache em memória: as propriedades de uma coleção quase nunca mudam, então
// consultamos uma vez por coleção enquanto o servidor estiver rodando.
const cacheQueryables = new Map<string, string[]>();

/**
 * GET /collections/{id}/queryables — nomes das propriedades que podem ser
 * filtradas nessa coleção (ex.: "eo:cloud_cover" existe no Sentinel-2,
 * mas não no DEM).
 */
export async function obterQueryables(id: string): Promise<string[]> {
  const emCache = cacheQueryables.get(id);
  if (emCache) return emCache;
  const dados = await requisitarStac<{ properties?: Record<string, unknown> }>(
    `/collections/${encodeURIComponent(id)}/queryables`,
  );
  const nomes = Object.keys(dados.properties ?? {});
  cacheQueryables.set(id, nomes);
  return nomes;
}

/** GET /collections/{id} — detalhes de uma coleção. */
export function obterColecao(id: string): Promise<StacCollection> {
  return requisitarStac<StacCollection>(`/collections/${encodeURIComponent(id)}`);
}
