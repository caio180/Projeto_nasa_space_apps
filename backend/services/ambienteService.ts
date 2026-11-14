// =============================================================================
// SERVICE — medidas ambientais de um ponto da Terra.
// Cada função consulta UMA fonte e devolve dados já convertidos para o nosso
// formato (model/ambienteModel.ts). Erros viram AppError com mensagem clara.
// =============================================================================

import { AppError } from '../model/model.ts';
import { amostrarEspacado, FONTES, media } from '../model/ambienteModel.ts';
import type {
  Clima,
  Geologia,
  MedidasAmbientais,
  Solo,
  TemperaturaSuperficie,
  Vegetacao,
} from '../model/ambienteModel.ts';

const POWER_URL = process.env.URL_POWER_API;
const SOILGRIDS_URL = process.env.URL_SOILGRIDS_API;
const MACROSTRAT_URL = process.env.URL_MACROSTRAT_API;
const STAC_URL = process.env.URL_API;
const DATA_URL = process.env.URL_DATA_API;
const TIMEOUT_MS = 30_000;

/** GET/POST com timeout e erro padronizado. */
async function buscarJson<T>(fonte: string, url: string, init?: RequestInit): Promise<T> {
  let resposta: Response;
  try {
    resposta = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (e) {
    if (e instanceof Error && e.name === 'TimeoutError') throw new AppError(504, `${fonte} demorou demais para responder.`);
    throw new AppError(502, `Não foi possível conectar a ${fonte}.`);
  }
  if (!resposta.ok) throw new AppError(502, `${fonte} respondeu com erro ${resposta.status}.`);
  return (await resposta.json()) as T;
}

// ---------------------------------------------------------------------------
// NASA POWER — climatologia (médias de ~25 anos) num ponto
// Doc: https://power.larc.nasa.gov/docs/services/api/temporal/climatology/
// ---------------------------------------------------------------------------
const PARAMETROS_POWER = ['T2M', 'T2M_MIN', 'T2M_MAX', 'ALLSKY_SFC_SW_DWN', 'WS10M', 'RH2M', 'PRECTOTCORR'];

export async function obterClima(lon: number, lat: number): Promise<Clima> {
  const params = new URLSearchParams({
    parameters: PARAMETROS_POWER.join(','),
    community: 'RE',
    longitude: String(lon),
    latitude: String(lat),
    format: 'JSON',
  });
  const dados = await buscarJson<{
    header?: { fill_value?: number; range?: string };
    properties: { parameter: Record<string, { ANN: number }> };
  }>('NASA POWER', `${POWER_URL}/temporal/climatology/point?${params}`);

  const vazio = dados.header?.fill_value ?? -999;
  const valor = (p: string) => {
    const v = dados.properties.parameter[p]?.ANN;
    if (v === undefined || v === vazio) throw new AppError(502, `NASA POWER não tem ${p} para este ponto.`);
    return v;
  };
  const anos = /(\d{4})\D+?(\d{4})\D*$/.exec(dados.header?.range ?? '');

  return {
    temperaturaMedia: valor('T2M'),
    temperaturaMinima: valor('T2M_MIN'),
    temperaturaMaxima: valor('T2M_MAX'),
    radiacaoSolar: valor('ALLSKY_SFC_SW_DWN'),
    vento: valor('WS10M'),
    umidade: valor('RH2M'),
    precipitacao: valor('PRECTOTCORR'),
    periodo: anos ? `${anos[1]}–${anos[2]}` : (dados.header?.range ?? ''),
  };
}

// ---------------------------------------------------------------------------
// NASA MODIS pela Planetary Computer — amostras ao longo de um ano
// ---------------------------------------------------------------------------

/** Itens STAC de uma coleção MODIS que cobrem o ponto, no ano dado. */
async function itensModis(colecao: string, lon: number, lat: number, ano: number) {
  const dados = await buscarJson<{ features: { id: string }[] }>('Planetary Computer (STAC)', `${STAC_URL}/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      collections: [colecao],
      intersects: { type: 'Point', coordinates: [lon, lat] },
      datetime: `${ano}-01-01/${ano}-12-31`,
      limit: 100,
    }),
  });
  return dados.features.map((f) => f.id).sort(); // o id contém a data (A2025361 = dia 361)
}

/** Valor bruto dos assets no ponto (Data API: /item/point). */
async function valoresNoPonto(colecao: string, item: string, assets: string[], lon: number, lat: number) {
  const q = new URLSearchParams({ collection: colecao, item });
  assets.forEach((a) => q.append('assets', a));
  const dados = await buscarJson<{ values: number[] }>('Planetary Computer (Data API)', `${DATA_URL}/item/point/${lon},${lat}?${q}`);
  return dados.values;
}

const anoCompletoAnterior = () => new Date().getUTCFullYear() - 1;

/** Temperatura da superfície (MOD/MYD11A2, composições de 8 dias). Escala 0,02 K; 0 = sem dado (nuvem). */
export async function obterTemperaturaSuperficie(lon: number, lat: number): Promise<TemperaturaSuperficie> {
  const colecao = 'modis-11A2-061';
  const ano = anoCompletoAnterior();
  const itens = amostrarEspacado(await itensModis(colecao, lon, lat, ano), 8);
  if (itens.length === 0) throw new AppError(404, 'MODIS não tem temperatura de superfície para este ponto.');

  const leituras = await Promise.all(
    itens.map((id) => valoresNoPonto(colecao, id, ['LST_Day_1km', 'LST_Night_1km'], lon, lat).catch(() => null)),
  );
  const paraCelsius = (v: number) => Math.round((v * 0.02 - 273.15) * 10) / 10;
  const dia = leituras.flatMap((l) => (l && l[0] > 0 ? [paraCelsius(l[0])] : []));
  const noite = leituras.flatMap((l) => (l && l[1] > 0 ? [paraCelsius(l[1])] : []));
  if (dia.length === 0 || noite.length === 0) {
    throw new AppError(404, 'MODIS sem leituras válidas neste ponto (nuvens ou gelo o ano todo).');
  }

  return {
    mediaDia: media(dia),
    mediaNoite: media(noite),
    maximaDia: Math.max(...dia),
    minimaNoite: Math.min(...noite),
    amostras: Math.min(dia.length, noite.length),
    ano,
  };
}

/** Vegetação (MOD/MYD13Q1, 16 dias, 250 m). Escala 0,0001; -3000 = sem dado. */
export async function obterVegetacao(lon: number, lat: number): Promise<Vegetacao> {
  const colecao = 'modis-13Q1-061';
  const ano = anoCompletoAnterior();
  const itens = amostrarEspacado(await itensModis(colecao, lon, lat, ano), 6);
  if (itens.length === 0) throw new AppError(404, 'MODIS não tem NDVI para este ponto.');

  const leituras = await Promise.all(
    itens.map((id) => valoresNoPonto(colecao, id, ['250m_16_days_NDVI'], lon, lat).catch(() => null)),
  );
  const ndvi = leituras.flatMap((l) => (l && l[0] > -2000 ? [Math.round(l[0]) / 10000] : []));
  if (ndvi.length === 0) throw new AppError(404, 'MODIS sem NDVI válido neste ponto.');

  return {
    ndviMedio: Math.round((ndvi.reduce((a, b) => a + b, 0) / ndvi.length) * 100) / 100,
    ndviMaximo: Math.round(Math.max(...ndvi) * 100) / 100,
    amostras: ndvi.length,
    ano,
  };
}

// ---------------------------------------------------------------------------
// ISRIC SoilGrids — solo nos primeiros 5 cm (média)
// Doc: https://rest.isric.org/soilgrids/v2.0/docs
// ---------------------------------------------------------------------------
export async function obterSolo(lon: number, lat: number): Promise<Solo> {
  const params = new URLSearchParams({ lon: String(lon), lat: String(lat), depth: '0-5cm', value: 'mean' });
  // Textura (areia/silte/argila), carbono, pH, CTC, densidade e cascalho.
  ['sand', 'silt', 'clay', 'soc', 'phh2o', 'cec', 'bdod', 'cfvo'].forEach((p) => params.append('property', p));
  const dados = await buscarJson<{
    properties: {
      layers: { name: string; unit_measure: { d_factor: number }; depths: { values: { mean: number | null } }[] }[];
    };
  }>('ISRIC SoilGrids', `${SOILGRIDS_URL}/properties/query?${params}`);

  // O valor vem multiplicado por d_factor; dividir dá a unidade-alvo da API
  // (areia/silte/argila %, carbono g/kg, pH, CTC cmol(c)/kg, densidade g/cm³, cascalho % vol.).
  const camada = (nome: string, casas = 1) => {
    const l = dados.properties.layers.find((x) => x.name === nome);
    const v = l?.depths[0]?.values.mean;
    const m = 10 ** casas;
    return v === null || v === undefined || !l ? null : Math.round((v / l.unit_measure.d_factor) * m) / m;
  };
  const areia = camada('sand');
  const argila = camada('clay');
  return {
    areia,
    silte: camada('silt'),
    argila,
    carbonoOrganico: camada('soc'),
    ph: camada('phh2o'),
    ctc: camada('cec'),
    densidade: camada('bdod', 2),
    cascalho: camada('cfvo'),
    semSoloMapeado: areia === null && argila === null,
  };
}

// ---------------------------------------------------------------------------
// Macrostrat — unidade geológica no ponto
// Doc: https://macrostrat.org/api/v2
// ---------------------------------------------------------------------------
export async function obterGeologia(lon: number, lat: number): Promise<Geologia> {
  const dados = await buscarJson<{
    success: {
      data: { name: string; lith: string; best_int_name: string; b_age: number | null; source_id: number }[];
      refs?: Record<string, string>;
    };
  }>('Macrostrat', `${MACROSTRAT_URL}/geologic_units/map?lat=${lat}&lng=${lon}`);

  const unidades = dados.success.data;
  const u = unidades[0];
  if (!u) throw new AppError(404, 'Macrostrat não tem unidade geológica mapeada neste ponto.');
  const limpar = (t: string) => (t ?? '').replace(/[;,\s]+$/, '').trim(); // a fonte às vezes termina em "; "
  // O mesmo ponto aparece em mapas de escalas diferentes, às vezes discordando
  // (ex.: Putorana: "carbonates" num mapa e "flood basalt" em outros dois).
  // Guardamos todas para a compatibilidade decidir por maioria.
  const litologias = [...new Set(unidades.map((x) => limpar(x.lith)).filter(Boolean))];
  return {
    unidade: limpar(u.name),
    litologia: litologias.join(' | ') || limpar(u.lith),
    litologias,
    idade: limpar(u.best_int_name),
    idadeMaximaMa: u.b_age,
    referencia: dados.success.refs?.[String(u.source_id)] ?? null,
  };
}

// ---------------------------------------------------------------------------
// Todas as fontes de uma vez (usado pela rota /ambiente e pela compatibilidade)
// ---------------------------------------------------------------------------

// Cache por ponto (arredondado a ~100 m): clima e geologia não mudam entre cliques.
const cacheAmbiente = new Map<string, MedidasAmbientais>();

// Medições em andamento: se o mesmo ponto for pedido duas vezes ao mesmo tempo
// (ex.: aba de ambiente + compatibilidade), a segunda reaproveita a primeira.
const emAndamento = new Map<string, Promise<MedidasAmbientais>>();

/** Consulta as 5 fontes em paralelo. Uma falha não derruba as outras (vai em `erros`). */
export function medirAmbiente(lon: number, lat: number): Promise<MedidasAmbientais> {
  const chave = `${lon.toFixed(3)},${lat.toFixed(3)}`;
  const emCache = cacheAmbiente.get(chave);
  if (emCache) return Promise.resolve(emCache);
  const pendente = emAndamento.get(chave);
  if (pendente) return pendente;

  const medicao = medir(lon, lat, chave).finally(() => emAndamento.delete(chave));
  emAndamento.set(chave, medicao);
  return medicao;
}

async function medir(lon: number, lat: number, chave: string): Promise<MedidasAmbientais> {

  const nomes = ['clima', 'temperaturaSuperficie', 'vegetacao', 'solo', 'geologia'] as const;
  const resultados = await Promise.allSettled([
    obterClima(lon, lat),
    obterTemperaturaSuperficie(lon, lat),
    obterVegetacao(lon, lat),
    obterSolo(lon, lat),
    obterGeologia(lon, lat),
  ]);

  const erros: Record<string, string> = {};
  const valor = <T>(i: number): T | null => {
    const r = resultados[i];
    if (r.status === 'fulfilled') return r.value as T;
    erros[nomes[i]] = r.reason instanceof Error ? r.reason.message : String(r.reason);
    return null;
  };

  const medidas: MedidasAmbientais = {
    lon,
    lat,
    clima: valor(0),
    temperaturaSuperficie: valor(1),
    vegetacao: valor(2),
    solo: valor(3),
    geologia: valor(4),
    erros,
    fontes: FONTES,
  };

  // Só guarda em cache se nada falhou de forma temporária (timeout/conexão).
  const temporario = Object.values(erros).some((m) => /demorou|conectar|erro 5/i.test(m));
  if (!temporario) cacheAmbiente.set(chave, medidas);
  return medidas;
}
