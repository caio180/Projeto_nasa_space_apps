// =============================================================================
// CONTROLLER — recebe a requisição, chama model/service e monta a resposta.
//
// No Express 5, se uma função async lançar erro, ele vai automaticamente para
// o error handler do index.ts. Por isso não precisamos de try/catch aqui.
// =============================================================================

import type { Request, Response } from 'express';
import {
  AppError,
  extrairProximaPagina,
  montarCorpoStac,
  paraCena,
  paraResumoColecao,
  validarBusca,
} from '../model/model.ts';
import type { ResultadoBusca } from '../model/model.ts';
import { buscarItens, listarColecoes, obterColecao, obterQueryables } from '../services/planetaryService.ts';
import { janelaTerraNoPonto, validarRelevo, validarResolucao } from '../model/relevoModel.ts';
import { ehPolar, GRAVIDADE, ladoDoLocal, LADO_JANELA_KM, LOCAIS, obterLocal } from '../model/planetaModel.ts';
import { ANALOGOS, DIMENSOES } from '../model/analogosModel.ts';
import { REFERENCIAS_CORPOS, validarPonto } from '../model/ambienteModel.ts';
import { calcularCompatibilidade } from '../model/compatibilidadeModel.ts';
import { relevoLocal, relevoTerra } from '../services/relevoService.ts';
import { medirAmbiente } from '../services/ambienteService.ts';
import { composicaoDoLocal } from '../services/composicaoService.ts';
import { avaliarEquipamentos } from '../model/equipamentosModel.ts';
import { validarComparacao } from '../model/validacaoModel.ts';
import { FORMULA_DISTANCIA, NOTA_PESOS, OBJETIVOS, VARIAVEIS } from '../model/objetivosModel.ts';
import { rankingDe } from '../services/rankingService.ts';
import { passaporte } from '../services/passaporteService.ts';
import { validarLadoImagem } from '../model/imagemModel.ts';
import { imagemLocal, imagemTerra } from '../services/imagemService.ts';

/** Lê ?resolucao= da query (padrão 128) e valida. */
function resolucaoDaQuery(req: Request) {
  const erros: string[] = [];
  const texto = req.query.resolucao;
  const resolucao = validarResolucao(typeof texto === 'string' ? Number(texto) : undefined, erros);
  if (erros.length > 0) throw new AppError(400, 'Parâmetros de relevo inválidos.', erros);
  return resolucao;
}

/** GET /api/colecoes?busca=texto — lista coleções (filtro opcional por texto). */
export async function getColecoes(req: Request, res: Response) {
  const busca = typeof req.query.busca === 'string' ? req.query.busca.toLowerCase() : '';
  const colecoes = (await listarColecoes()).map(paraResumoColecao);

  const filtradas = busca
    ? colecoes.filter((c) =>
        [c.id, c.titulo, ...c.palavrasChave].some((t) => t.toLowerCase().includes(busca)),
      )
    : colecoes;

  // A descrição completa é longa; na listagem mandamos só o necessário.
  res.json({
    quantidade: filtradas.length,
    colecoes: filtradas.map(({ id, titulo, palavrasChave, periodo }) => ({ id, titulo, palavrasChave, periodo })),
  });
}

/** GET /api/colecoes/:id — detalhes de uma coleção. */
export async function getColecao(req: Request<{ id: string }>, res: Response) {
  const colecao = await obterColecao(req.params.id);
  res.json(paraResumoColecao(colecao));
}

/** POST /api/satelite/busca — busca cenas com parâmetros dinâmicos. */
export async function postBuscaSatelite(req: Request, res: Response) {
  const parametros = validarBusca(req.body); // lança AppError 400 se inválido

  // Filtro de nuvens numa coleção sem essa propriedade (ex.: DEM) faria a
  // STAC devolver zero itens sem avisar. Melhor recusar com uma mensagem clara.
  if (parametros.maxNuvens !== undefined) {
    const propriedades = await obterQueryables(parametros.colecao);
    if (!propriedades.includes('eo:cloud_cover')) {
      throw new AppError(400, 'Parâmetros de busca inválidos.', [
        `A coleção "${parametros.colecao}" não tem cobertura de nuvens (eo:cloud_cover). Remova maxNuvens.`,
      ]);
    }
  }

  const resposta = await buscarItens(montarCorpoStac(parametros));

  const resultado: ResultadoBusca = {
    quantidade: resposta.features.length,
    proximaPagina: extrairProximaPagina(resposta.links),
    cenas: resposta.features.map(paraCena),
  };
  res.json(resultado);
}

/**
 * POST /api/relevo — grade de elevação (metros) de uma área da Terra, pronta para 3D.
 * Corpo: { bbox: [lonMin, latMin, lonMax, latMax], resolucao?: 16–256 }
 */
export async function postRelevo(req: Request, res: Response) {
  res.json(await relevoTerra(validarRelevo(req.body)));
}

/** GET /api/locais — locais de Marte e da Lua disponíveis para comparação. */
export function getLocais(_req: Request, res: Response) {
  res.json({
    ladoJanelaKm: LADO_JANELA_KM,
    gravidade: GRAVIDADE,
    locais: LOCAIS.map((l) => ({
      id: l.id,
      nome: l.nome,
      corpo: l.corpo,
      lon: l.lon,
      lat: l.lat,
      descricao: l.descricao,
      ladoKm: ladoDoLocal(l),
      polar: ehPolar(l.lat),
      artemis: l.artemis ?? false,
      fonteCoordenada: l.fonteCoordenada ?? null,
      geologiaAlvo: l.geologiaAlvo.descricao,
    })),
  });
}

/**
 * GET /api/locais/:id/relevo?resolucao=128 — relevo de uma janela de
 * ladoKm × ladoKm km centrada no local (Marte ou Lua, inclusive polo sul).
 */
export async function getRelevoLocal(req: Request<{ id: string }>, res: Response) {
  const local = obterLocal(req.params.id); // 404 se não existir
  res.json(await relevoLocal(local, resolucaoDaQuery(req)));
}

/**
 * GET /api/analogos — locais da Terra candidatos a análogos de Marte e da Lua,
 * com as dimensões de analogia do desafio, semelhanças e limitações.
 */
export function getAnalogos(_req: Request, res: Response) {
  res.json({ dimensoes: DIMENSOES, analogos: ANALOGOS });
}

/**
 * GET /api/ambiente?lon=&lat= — medidas ambientais de um ponto da Terra
 * (NASA POWER, NASA MODIS, ISRIC SoilGrids, Macrostrat) + referências de
 * Marte e da Lua (NASA Fact Sheets). Fontes que falham não derrubam as outras.
 */
export async function getAmbiente(req: Request, res: Response) {
  const { lon, lat } = validarPonto(req.query.lon, req.query.lat);
  res.json({ ...(await medirAmbiente(lon, lat)), referencias: REFERENCIAS_CORPOS });
}

/**
 * GET /api/compatibilidade?local=<id>&analogo=<id>        (análogo do catálogo)
 * GET /api/compatibilidade?local=<id>&lon=&lat=&nome=      (qualquer ponto da Terra)
 *   &resolucao=128
 *
 * Compara a Terra com o local de Marte/Lua na MESMA janela e grade, mede o
 * ambiente da Terra e devolve a % de compatibilidade por dimensão, o índice
 * geral, as incompatibilidades com o provável motivo e os limites da Terra.
 */
export async function getCompatibilidade(req: Request, res: Response) {
  if (typeof req.query.local !== 'string') {
    throw new AppError(400, 'Informe ?local=<id> (veja GET /api/locais).');
  }
  const local = obterLocal(req.query.local);
  const resolucao = resolucaoDaQuery(req);

  // Ponto da Terra: um análogo do catálogo ou lon/lat livres.
  let ponto: { nome: string; lon: number; lat: number; foco: (typeof ANALOGOS)[number]['dimensoes'] };
  if (typeof req.query.analogo === 'string') {
    const a = ANALOGOS.find((x) => x.id === req.query.analogo);
    if (!a) throw new AppError(404, `Análogo "${req.query.analogo}" não existe. Veja GET /api/analogos.`);
    ponto = { nome: a.nome, lon: a.lon, lat: a.lat, foco: a.dimensoes };
  } else {
    const { lon, lat } = validarPonto(req.query.lon, req.query.lat);
    const nome = typeof req.query.nome === 'string' && req.query.nome.trim() ? req.query.nome.trim() : 'Ponto na Terra';
    ponto = { nome, lon, lat, foco: [] };
  }

  // Mesma janela do local (ex.: 15 × 15 km) → mesmo tamanho de pixel nos dois lados.
  const bboxTerra = janelaTerraNoPonto(ponto.lon, ponto.lat, ladoDoLocal(local));
  const [rTerra, rAlvo, ambiente, composicaoAlvo] = await Promise.all([
    relevoTerra(validarRelevo({ bbox: bboxTerra, resolucao })),
    relevoLocal(local, resolucao),
    medirAmbiente(ponto.lon, ponto.lat),
    composicaoDoLocal(local).catch(() => null), // se o PDS falhar, o resto continua
  ]);

  res.json({
    ...calcularCompatibilidade({
      nomeTerra: ponto.nome,
      lon: ponto.lon,
      lat: ponto.lat,
      dimensoesFoco: ponto.foco,
      relevoTerra: rTerra,
      relevoAlvo: rAlvo,
      ambiente,
      local,
      composicaoAlvo,
    }),
    // Como Perseverance, VIPER, jipe do Apollo e o módulo de pouso se sairiam nos dois relevos.
    equipamentos: avaliarEquipamentos(rTerra, rAlvo),
    // Como a similaridade é medida e como escala e atmosfera dos sensores são compensadas.
    validacao: validarComparacao(rTerra, rAlvo),
  });
}

/** GET /api/locais/:id/composicao — química da superfície no local (NASA GRS, via PDS). */
export async function getComposicaoLocal(req: Request<{ id: string }>, res: Response) {
  res.json(await composicaoDoLocal(obterLocal(req.params.id)));
}

/** POST /api/imagem — foto Sentinel-2 da Terra no bbox (o mesmo do relevo). Corpo: { bbox, tamanho?, nome?, simular? } */
export async function postImagem(req: Request, res: Response) {
  const b = (typeof req.body === 'object' && req.body !== null ? req.body : {}) as Record<string, unknown>;
  // Reaproveita a validação do relevo (bbox válido e no máximo 2° × 2°).
  const { bbox } = validarRelevo({ bbox: b.bbox });
  const nome = typeof b.nome === 'string' ? b.nome : undefined;
  // simular: 'Marte' | 'Lua' → também devolve a Terra como a câmera desse corpo a veria.
  const simular = b.simular === 'Marte' || b.simular === 'Lua' ? b.simular : undefined;
  res.json(await imagemTerra(bbox, validarLadoImagem(b.tamanho), nome, simular));
}

/** GET /api/locais/:id/imagem?tamanho=512 — ortoimagem de Marte/Lua na janela do relevo. */
export async function getImagemLocal(req: Request<{ id: string }>, res: Response) {
  res.json(await imagemLocal(obterLocal(req.params.id), validarLadoImagem(req.query.tamanho)));
}

/** GET /api/objetivos — objetivos de teste, critérios, pesos e a fórmula do índice. */
export function getObjetivos(_req: Request, res: Response) {
  res.json({
    formula: FORMULA_DISTANCIA,
    notaPesos: NOTA_PESOS,
    variaveis: VARIAVEIS,
    objetivos: Object.values(OBJETIVOS).map(({ experimento: _e, ...o }) => o),
  });
}

/** GET /api/ranking?objetivo=rover|astrobiologia|base&local=<id> — candidatos ordenados pela distância ponderada. */
export async function getRanking(req: Request, res: Response) {
  res.json(await rankingDe(req.query.objetivo, req.query.local));
}

/** GET /api/passaporte?objetivo=&local=&candidato= — passaporte científico do candidato, com proveniência. */
export async function getPassaporte(req: Request, res: Response) {
  res.json(await passaporte(req.query.objetivo, req.query.local, req.query.candidato));
}
