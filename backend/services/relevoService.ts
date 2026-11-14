// =============================================================================
// SERVICE — monta o relevo (grade de elevação + estatísticas) da Terra e dos
// locais de Marte/Lua. Antes isso ficava no controller; saiu daqui para ser
// reaproveitado pela rota de relevo E pela de compatibilidade.
// =============================================================================

import { AppError } from '../model/model.ts';
import {
  calcularEstatisticas,
  calcularGrade,
  COLECAO_DEM,
  combinarRecortes,
  lerNpy,
} from '../model/relevoModel.ts';
import type { ParametrosRelevo, Relevo } from '../model/relevoModel.ts';
import {
  COBERTURA_MINIMA,
  ehPolar,
  GRAVIDADE,
  janelaGraus,
  janelaProjetada,
  ladoDoLocal,
  lerProjecao,
  ordenarCandidatos,
  paraElevacoes,
  RAIO_M,
  urlDoDtm,
} from '../model/planetaModel.ts';
import type { ItemUsgs, LocalPlanetario } from '../model/planetaModel.ts';
import { buscarItens } from './planetaryService.ts';
import { obterRecorteNpy } from './elevacaoService.ts';
import { buscarItensUsgs, buscarItensUsgsNoPonto, lerJanelaCog } from './usgsService.ts';

const arred = (n: number) => Math.round(n * 10) / 10;

/** Copernicus DEM GLO-30: 1 segundo de arco ≈ 30 m. */
const RESOLUCAO_NATIVA_DEM_TERRA = 30;

// Caches em memória (o relevo de um lugar não muda).
const cacheTerra = new Map<string, Relevo>();
const cacheLocal = new Map<string, Relevo>();

/**
 * Qual produto (item STAC) e qual janela foram usados em cada local. A foto
 * de satélite lê a ortoimagem do MESMO item e da MESMA janela, para ficar
 * alinhada pixel a pixel com o relevo 3D.
 */
const janelaDoLocal = new Map<string, { item: ItemUsgs; bboxProjetado: number[] }>();

/** Item e janela do relevo do local (calcula o relevo se ainda não foi calculado). */
export async function janelaUsadaNoLocal(local: LocalPlanetario) {
  if (!janelaDoLocal.has(local.id)) await relevoLocal(local, 128);
  return janelaDoLocal.get(local.id)!;
}

/** Relevo da Terra: Copernicus DEM pela Planetary Computer (STAC + Data API). */
export async function relevoTerra(parametros: ParametrosRelevo): Promise<Relevo> {
  const chave = `${parametros.bbox.map((n) => n.toFixed(5)).join(',')}:${parametros.resolucao}`;
  const emCache = cacheTerra.get(chave);
  if (emCache) return emCache;

  const { largura, altura, metrosPorPixel } = calcularGrade(parametros);

  // 1. Quais tiles do DEM (1° × 1° cada) cobrem a área?
  const busca = await buscarItens({ collections: [COLECAO_DEM], bbox: parametros.bbox, limit: 20 });
  const itens = busca.features.map((f) => f.id);
  if (itens.length === 0) {
    throw new AppError(404, 'Não há dados de relevo para esta área (provavelmente só oceano).');
  }

  // 2. Recorta o MESMO bbox em cada tile, em paralelo (Data API, .npy).
  const buffers = await Promise.all(
    itens.map((id) => obterRecorteNpy(COLECAO_DEM, id, parametros.bbox, largura, altura)),
  );

  // 3. Junta os tiles pela máscara e calcula as estatísticas.
  const elevacoes = combinarRecortes(buffers.map(lerNpy), largura, altura);
  const relevo: Relevo = {
    corpo: 'Terra',
    gravidade: GRAVIDADE.Terra,
    fonte: 'Copernicus DEM GLO-30 (Microsoft Planetary Computer)',
    bbox: parametros.bbox,
    largura,
    altura,
    metrosPorPixel: { x: arred(metrosPorPixel.x), y: arred(metrosPorPixel.y) },
    resolucaoNativa: RESOLUCAO_NATIVA_DEM_TERRA,
    elevacoes,
    estatisticas: calcularEstatisticas(elevacoes, largura, altura, metrosPorPixel),
    itens,
  };
  cacheTerra.set(chave, relevo);
  return relevo;
}

/** Relevo de um local de Marte/Lua: DTM da USGS (STAC + leitura parcial de COG). */
export async function relevoLocal(local: LocalPlanetario, resolucao: number): Promise<Relevo> {
  const chave = `${local.id}:${resolucao}`;
  const emCache = cacheLocal.get(chave);
  if (emCache) return emCache;

  const ladoKm = ladoDoLocal(local);
  const bboxGraus = janelaGraus(local.lon, local.lat, ladoKm, RAIO_M[local.corpo]);

  // 1. Candidatos. Perto do polo o bbox em graus não serve: buscamos os DTMs
  //    que contêm o ponto central e ordenamos pelo menor pixel (gsd).
  let candidatos: ItemUsgs[];
  if (ehPolar(local.lat)) {
    candidatos = (await buscarItensUsgsNoPonto(local.colecao, local.lon, local.lat, 50))
      .filter((i) => urlDoDtm(i))
      .sort((a, b) => (a.properties.gsd ?? 99) - (b.properties.gsd ?? 99));
  } else {
    candidatos = ordenarCandidatos(await buscarItensUsgs(local.colecao, bboxGraus), bboxGraus);
  }
  if (candidatos.length === 0) {
    throw new AppError(404, `A USGS não tem modelo de relevo para ${local.nome}.`);
  }

  // 2. Lê a janela no melhor candidato; se vier com muito buraco, tenta o próximo.
  //    No polo há mais buracos (sombra permanente não tem estéreo), então tentamos mais.
  const tentativas = ehPolar(local.lat) ? 5 : 3;
  let melhor: { item: ItemUsgs; bboxProjetado: number[]; elevacoes: (number | null)[]; cobertura: number } | null =
    null;
  for (const item of candidatos.slice(0, tentativas)) {
    const projecao = lerProjecao(item.properties['proj:wkt2']);
    const bboxProjetado = janelaProjetada(projecao, local.lon, local.lat, ladoKm);
    const janela = await lerJanelaCog(urlDoDtm(item)!, bboxProjetado, resolucao, resolucao);
    const elevacoes = paraElevacoes(janela.valores, janela.nodata);
    const cobertura = elevacoes.filter((v) => v !== null).length / elevacoes.length;

    if (!melhor || cobertura > melhor.cobertura) melhor = { item, bboxProjetado, elevacoes, cobertura };
    if (cobertura >= COBERTURA_MINIMA) break;
  }

  // 3. Mesmo formato do relevo da Terra → o frontend reaproveita tudo.
  const metros = (ladoKm * 1000) / resolucao;
  const relevo: Relevo = {
    corpo: local.corpo,
    nome: local.nome,
    descricao: local.descricao,
    gravidade: GRAVIDADE[local.corpo],
    fonte: `USGS Astrogeology — ${local.corpo === 'Marte' ? 'MRO CTX DTM' : 'Kaguya TC DTM v2'}`,
    bbox: bboxGraus,
    largura: resolucao,
    altura: resolucao,
    metrosPorPixel: { x: arred(metros), y: arred(metros) },
    // gsd do item STAC = espaçamento real do DTM (ex.: 20 m no CTX, ~26 m no Kaguya polar).
    resolucaoNativa: arred(melhor!.item.properties.gsd ?? metros),
    elevacoes: melhor!.elevacoes,
    estatisticas: calcularEstatisticas(melhor!.elevacoes, resolucao, resolucao, { x: metros, y: metros }),
    itens: [melhor!.item.id],
  };
  cacheLocal.set(chave, relevo);
  janelaDoLocal.set(local.id, { item: melhor!.item, bboxProjetado: melhor!.bboxProjetado });
  return relevo;
}
