// =============================================================================
// MODEL — representa e organiza os dados usados pelo sistema.
//
// Este arquivo tem 3 partes:
//   1. Tipos STAC   → o formato que a Planetary Computer DEVOLVE (conferido na
//                     resposta real de /api/stac/v1/search).
//   2. Tipos nossos → o formato que o NOSSO backend devolve ao frontend
//                     (menor, em português, só com o que interessa).
//   3. Regras       → validação dos parâmetros recebidos e conversão
//                     STAC → formato nosso.
// =============================================================================

// -----------------------------------------------------------------------------
// 1. Tipos STAC (resposta da Planetary Computer)
// -----------------------------------------------------------------------------

/** [lonMin, latMin, lonMax, latMax] em graus (WGS84). Padrão STAC/GeoJSON. */
export type BBox = [number, number, number, number];

/** Link STAC. O link rel="next" de um POST /search traz `body.token` para paginação. */
export interface StacLink {
  rel: string;
  href: string;
  type?: string;
  method?: string;
  title?: string;
  body?: Record<string, unknown> & { token?: string };
}

/** Um arquivo do Item (banda, imagem, metadado...). `href` aponta para o Azure Blob. */
export interface StacAsset {
  href: string;
  title?: string;
  type?: string;
  roles?: string[];
  gsd?: number;
}

/** Item STAC = uma "cena" (ex.: uma imagem Sentinel-2 de um tile em uma data). */
export interface StacItem {
  id: string;
  type: 'Feature';
  collection: string;
  bbox: number[];
  geometry: Geometria;
  properties: Record<string, unknown> & {
    datetime: string | null;
    'eo:cloud_cover'?: number;
    platform?: string;
  };
  assets: Record<string, StacAsset>;
  links: StacLink[];
}

/** Resposta de POST /search: um GeoJSON FeatureCollection. */
export interface StacItemCollection {
  type: 'FeatureCollection';
  features: StacItem[];
  links: StacLink[];
  numberReturned?: number;
}

/** Collection STAC = um conjunto de dados (ex.: sentinel-2-l2a, cop-dem-glo-30). */
export interface StacCollection {
  id: string;
  title?: string;
  description: string;
  keywords?: string[];
  license: string;
  extent: {
    spatial: { bbox: number[][] };
    temporal: { interval: (string | null)[][] };
  };
  item_assets?: Record<string, StacAsset>;
  links: StacLink[];
}

/** Geometria GeoJSON genérica (Polygon, MultiPolygon...). Não precisamos detalhar no protótipo. */
export interface Geometria {
  type: string;
  coordinates: unknown;
}

/** Corpo enviado para POST /search (só os parâmetros que usamos). */
export interface StacSearchBody {
  collections: string[];
  bbox: BBox;
  datetime?: string;
  limit: number;
  query?: Record<string, Record<string, number>>;
  sortby?: { field: string; direction: 'asc' | 'desc' }[];
  token?: string;
}

// -----------------------------------------------------------------------------
// 2. Tipos do nosso backend (o que o frontend recebe)
// -----------------------------------------------------------------------------

/** Parâmetros de busca já validados (vêm do body da nossa rota). */
export interface ParametrosBusca {
  colecao: string;
  bbox: BBox;
  dataInicio?: string; // YYYY-MM-DD
  dataFim?: string; // YYYY-MM-DD
  limite: number;
  maxNuvens?: number; // 0–100 (%)
  token?: string; // paginação
}

export interface CenaSatelite {
  id: string;
  colecao: string;
  data: string | null;
  nuvens: number | null;
  plataforma: string | null;
  bbox: number[];
  geometria: Geometria;
  /** PNG pronto para exibir (gerado pela Data API da Microsoft, não precisa de SAS). */
  preview: string | null;
  /** Mapa interativo da cena no site da Planetary Computer. */
  mapa: string | null;
  /** Lista de arquivos disponíveis. O href exige SAS token para download. */
  arquivos: { chave: string; titulo: string | null; tipo: string | null }[];
}

export interface ResultadoBusca {
  quantidade: number;
  /** Envie este valor como `token` na próxima requisição para pegar a próxima página. */
  proximaPagina: string | null;
  cenas: CenaSatelite[];
}

export interface ResumoColecao {
  id: string;
  titulo: string;
  descricao: string;
  palavrasChave: string[];
  bbox: number[];
  periodo: (string | null)[];
}

// -----------------------------------------------------------------------------
// 3. Erros e regras de negócio
// -----------------------------------------------------------------------------

/**
 * Erro "esperado" da aplicação. O error handler do index.ts converte em JSON
 * com o status HTTP correto. Qualquer outro erro vira 500.
 */
export class AppError extends Error {
  constructor(
    public status: number,
    message: string,
    public detalhes?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

const COLECAO_PADRAO = 'sentinel-2-l2a';
const LIMITE_PADRAO = 10;
const LIMITE_MAXIMO = 100;
const REGEX_DATA = /^\d{4}-\d{2}-\d{2}$/;
const REGEX_COLECAO = /^[a-z0-9-]+$/;

function dataValida(texto: string): boolean {
  if (!REGEX_DATA.test(texto)) return false;
  const d = new Date(`${texto}T00:00:00Z`);
  // Rejeita datas como 2025-02-31 (o Date "corrige" para março).
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(texto);
}

/**
 * Valida um bbox [lonMin, latMin, lonMax, latMax]. Não lança erro: acrescenta
 * as mensagens em `erros`, para quem chama juntar com outros problemas.
 * Usado pela busca de cenas e pelo relevo.
 */
export function validarBBox(valor: unknown, erros: string[]): BBox {
  if (!Array.isArray(valor) || valor.length !== 4 || !valor.every((n) => typeof n === 'number' && Number.isFinite(n))) {
    erros.push('bbox é obrigatório: [lonMin, latMin, lonMax, latMax] com 4 números.');
    return [0, 0, 0, 0];
  }
  const [lonMin, latMin, lonMax, latMax] = valor as number[];
  if (lonMin < -180 || lonMax > 180) erros.push('Longitudes do bbox devem estar entre -180 e 180.');
  if (latMin < -90 || latMax > 90) erros.push('Latitudes do bbox devem estar entre -90 e 90.');
  if (lonMin >= lonMax) erros.push('bbox: lonMin deve ser menor que lonMax.');
  if (latMin >= latMax) erros.push('bbox: latMin deve ser menor que latMax.');
  return [lonMin, latMin, lonMax, latMax];
}

/**
 * Valida o body recebido do cliente e devolve parâmetros tipados.
 * Junta TODOS os problemas encontrados para o cliente corrigir de uma vez.
 */
export function validarBusca(body: unknown): ParametrosBusca {
  const erros: string[] = [];
  const b = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>;

  // colecao (opcional)
  let colecao = COLECAO_PADRAO;
  if (b.colecao !== undefined) {
    if (typeof b.colecao !== 'string' || !REGEX_COLECAO.test(b.colecao)) {
      erros.push('colecao deve ser um id de coleção STAC, ex.: "sentinel-2-l2a".');
    } else {
      colecao = b.colecao;
    }
  }

  // bbox (obrigatório)
  const bbox = validarBBox(b.bbox, erros);

  // datas (opcionais, mas em par)
  const { dataInicio, dataFim } = b;
  if ((dataInicio === undefined) !== (dataFim === undefined)) {
    erros.push('Informe dataInicio e dataFim juntas (ou nenhuma).');
  } else if (dataInicio !== undefined) {
    if (typeof dataInicio !== 'string' || !dataValida(dataInicio)) erros.push('dataInicio deve estar no formato YYYY-MM-DD.');
    if (typeof dataFim !== 'string' || !dataValida(dataFim)) erros.push('dataFim deve estar no formato YYYY-MM-DD.');
    if (typeof dataInicio === 'string' && typeof dataFim === 'string' && dataInicio > dataFim) {
      erros.push('dataInicio deve ser anterior ou igual a dataFim.');
    }
  }

  // limite (opcional)
  let limite = LIMITE_PADRAO;
  if (b.limite !== undefined) {
    if (typeof b.limite !== 'number' || !Number.isInteger(b.limite) || b.limite < 1 || b.limite > LIMITE_MAXIMO) {
      erros.push(`limite deve ser um inteiro entre 1 e ${LIMITE_MAXIMO}.`);
    } else {
      limite = b.limite;
    }
  }

  // maxNuvens (opcional)
  if (b.maxNuvens !== undefined && (typeof b.maxNuvens !== 'number' || b.maxNuvens < 0 || b.maxNuvens > 100)) {
    erros.push('maxNuvens deve ser um número entre 0 e 100.');
  }

  // token (opcional)
  if (b.token !== undefined && (typeof b.token !== 'string' || b.token.length === 0)) {
    erros.push('token deve ser o texto recebido em "proximaPagina".');
  }

  if (erros.length > 0) {
    throw new AppError(400, 'Parâmetros de busca inválidos.', erros);
  }

  return {
    colecao,
    bbox,
    dataInicio: dataInicio as string | undefined,
    dataFim: dataFim as string | undefined,
    limite,
    maxNuvens: b.maxNuvens as number | undefined,
    token: b.token as string | undefined,
  };
}

/** Converte nossos parâmetros no corpo que a STAC API espera. */
export function montarCorpoStac(p: ParametrosBusca): StacSearchBody {
  const corpo: StacSearchBody = {
    collections: [p.colecao],
    bbox: p.bbox,
    limit: p.limite,
    sortby: [{ field: 'properties.datetime', direction: 'desc' }],
  };
  if (p.dataInicio && p.dataFim) {
    // Intervalo RFC 3339 exigido pelo STAC: "inicio/fim".
    corpo.datetime = `${p.dataInicio}T00:00:00Z/${p.dataFim}T23:59:59Z`;
  }
  if (p.maxNuvens !== undefined) {
    // Extensão "query" do STAC (listada em /conformance). Só faz sentido
    // em coleções ópticas que têm a propriedade eo:cloud_cover.
    corpo.query = { 'eo:cloud_cover': { lte: p.maxNuvens } };
  }
  if (p.token) corpo.token = p.token;
  return corpo;
}

/** STAC Item → CenaSatelite (o que o frontend precisa). */
export function paraCena(item: StacItem): CenaSatelite {
  const preview = item.assets.rendered_preview?.href ?? null;
  const mapa = item.links.find((l) => l.rel === 'preview')?.href ?? null;

  return {
    id: item.id,
    colecao: item.collection,
    data: item.properties.datetime,
    nuvens: item.properties['eo:cloud_cover'] ?? null,
    plataforma: item.properties.platform ?? null,
    bbox: item.bbox,
    geometria: item.geometry,
    preview,
    mapa,
    arquivos: Object.entries(item.assets).map(([chave, a]) => ({
      chave,
      titulo: a.title ?? null,
      tipo: a.type ?? null,
    })),
  };
}

/** Lê o token da próxima página no link rel="next" (null = acabou). */
export function extrairProximaPagina(links: StacLink[]): string | null {
  return links.find((l) => l.rel === 'next')?.body?.token ?? null;
}

/** STAC Collection → ResumoColecao. */
export function paraResumoColecao(c: StacCollection): ResumoColecao {
  return {
    id: c.id,
    titulo: c.title ?? c.id,
    descricao: c.description,
    palavrasChave: c.keywords ?? [],
    bbox: c.extent.spatial.bbox[0] ?? [],
    periodo: c.extent.temporal.interval[0] ?? [],
  };
}
