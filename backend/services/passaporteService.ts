// =============================================================================
// SERVICE — passaporte científico de um candidato (guia de mentoria, pág. 06).
//
// Campos: Referência · Métricas · Evidências · Diferenças · Aplicação, mais a
// PROVENIÊNCIA mínima de cada camada (pág. 03):
//   produto (nome, missão/instrumento, URL, versão, licença) · recorte
//   (coordenadas, época, sistema de referência, área) · qualidade (resolução,
//   pixels sem dado, incerteza) · reprodutibilidade (rotas e parâmetros).
// Tudo sai de dados já medidos; nada é estimado para "completar" o passaporte.
// =============================================================================

import type { MedidasAmbientais } from '../model/ambienteModel.ts';
import { REFERENCIAS_CORPOS } from '../model/ambienteModel.ts';
import { ANALOGOS } from '../model/analogosModel.ts';
import type { ComposicaoAlvo } from '../model/composicaoModel.ts';
import { AppError } from '../model/model.ts';
import { FORMULA_DISTANCIA, obterObjetivo } from '../model/objetivosModel.ts';
import { GRAVIDADE, ladoDoLocal, lerProjecao, obterLocal } from '../model/planetaModel.ts';
import { CANDIDATOS } from '../model/rankingModel.ts';
import { janelaTerraNoPonto, validarRelevo } from '../model/relevoModel.ts';
import type { Relevo } from '../model/relevoModel.ts';
import { medirAmbiente } from './ambienteService.ts';
import { composicaoDoLocal } from './composicaoService.ts';
import { rankingDe } from './rankingService.ts';
import { janelaUsadaNoLocal, relevoLocal, relevoTerra } from './relevoService.ts';

export interface Camada {
  camada: string;
  produto: { nome: string; missao: string; url: string; versao: string; licenca: string };
  recorte: { coordenadas: string; epoca: string; referencial: string; area: string };
  qualidade: { resolucao: string; semDado: string; incerteza: string };
}

const br = (n: number, casas = 1) => n.toLocaleString('pt-BR', { maximumFractionDigits: casas });
const pct = (n: number) => `${br(n)}%`;
const f = (n: number, casas = 4) => n.toFixed(casas);
const semDado = (r: Relevo) => pct((100 * r.estatisticas.pixelsSemDado) / r.elevacoes.length);

function camadaRelevoTerra(r: Relevo): Camada {
  const [x0, y0, x1, y1] = r.bbox;
  return {
    camada: 'Relevo da Terra',
    produto: {
      nome: 'Copernicus DEM GLO-30',
      missao: 'TanDEM-X (radar interferométrico, DLR/Airbus), programa Copernicus da UE/ESA',
      url: 'https://planetarycomputer.microsoft.com/dataset/cop-dem-glo-30',
      versao: `coleção cop-dem-glo-30 da Microsoft Planetary Computer; tiles ${r.itens.join(', ')}`,
      licenca: 'Copernicus DEM: uso livre, com atribuição (© DLR e.V. 2010-2014 e © Airbus 2014-2018, fornecido no programa Copernicus)',
    },
    recorte: {
      coordenadas: `lon ${f(x0)} a ${f(x1)}, lat ${f(y0)} a ${f(y1)}`,
      epoca: 'aquisição TanDEM-X, 2011–2015',
      referencial: 'WGS 84 geográfico (EPSG:4326); altitudes sobre o geoide EGM2008',
      area: `${Math.round((r.largura * r.metrosPorPixel.x) / 100) / 10} × ${Math.round((r.altura * r.metrosPorPixel.y) / 100) / 10} km`,
    },
    qualidade: {
      resolucao: `nativa ${br(r.resolucaoNativa)} m; reamostrada para ${br(r.metrosPorPixel.x)} m por pixel`,
      semDado: semDado(r),
      incerteza: 'especificação do produto: erro vertical absoluto < 4 m (LE90); é um modelo de SUPERFÍCIE (inclui vegetação e construções)',
    },
  };
}

async function camadaRelevoAlvo(r: Relevo, localId: string): Promise<Camada> {
  const local = obterLocal(localId);
  const { item } = await janelaUsadaNoLocal(local);
  const proj = lerProjecao(item.properties['proj:wkt2']);
  const ehMarte = local.corpo === 'Marte';
  const raioKm = Math.round(proj.raio / 100) / 10;
  return {
    camada: `Relevo de ${local.nome}`,
    produto: {
      nome: ehMarte ? 'MRO CTX DTM controlado (USGS Astrogeology)' : 'Kaguya Terrain Camera DTM v2 (USGS Astrogeology)',
      missao: ehMarte
        ? 'Mars Reconnaissance Orbiter, Context Camera (NASA/JPL/MSSS); estéreo alinhado ao laser MOLA'
        : 'SELENE/Kaguya, Terrain Camera (JAXA); estéreo alinhado ao laser LOLA (NASA LRO)',
      url: `${process.env.URL_USGS_STAC}/collections/${local.colecao}/items/${item.id}`,
      versao: `coleção ${local.colecao}; produto ${item.id}`,
      licenca: item.properties.license ? `${item.properties.license} (USGS)` : 'domínio público (USGS)',
    },
    recorte: {
      coordenadas: `centro lon ${f(local.lon)}, lat ${f(local.lat)}${local.fonteCoordenada ? ` — ${local.fonteCoordenada}` : ''}`,
      epoca: `data do produto no catálogo: ${(item.properties.start_datetime ?? item.properties.datetime ?? 'não informada').slice(0, 10)}`,
      referencial:
        proj.tipo === 'polar'
          ? `estereográfica polar ${proj.polo}, esfera de ${br(raioKm)} km`
          : `equirretangular, esfera de ${br(raioKm)} km${ehMarte ? ' (altitudes ajustadas ao areoide quando disponível)' : ''}`,
      area: `${ladoDoLocal(local)} × ${ladoDoLocal(local)} km`,
    },
    qualidade: {
      resolucao: `nativa ${br(r.resolucaoNativa)} m (gsd do item); reamostrada para ${br(r.metrosPorPixel.x)} m por pixel`,
      semDado: semDado(r),
      incerteza: 'erro de interseção estéreo publicado no próprio produto (asset intersection_error); buracos = sem par estéreo',
    },
  };
}

function camadasAmbiente(a: MedidasAmbientais): Camada[] {
  const ponto = `lon ${f(a.lon)}, lat ${f(a.lat)}`;
  const camadas: Camada[] = [];
  if (a.clima) {
    camadas.push({
      camada: 'Clima (chuva, temperatura do ar, radiação)',
      produto: {
        nome: 'NASA POWER — climatologia',
        missao: 'NASA Langley Research Center (MERRA-2 e CERES)',
        url: 'https://power.larc.nasa.gov/',
        versao: 'API de climatologia (temporal/climatology)',
        licenca: 'dado aberto da NASA, com citação do projeto POWER',
      },
      recorte: { coordenadas: ponto, epoca: a.clima.periodo, referencial: 'WGS 84', area: 'célula da grade POWER (~50 × 50 km)' },
      qualidade: { resolucao: '0,5° × 0,625° (meteorologia)', semDado: '—', incerteza: 'média de grade: representa a região, não o metro exato' },
    });
  }
  if (a.vegetacao || a.temperaturaSuperficie) {
    camadas.push({
      camada: 'Vegetação (NDVI) e temperatura da superfície',
      produto: {
        nome: 'MODIS MOD13Q1 / MOD11A2, coleção 6.1',
        missao: 'NASA Terra e Aqua, MODIS (NASA LP DAAC / Earthdata, via Planetary Computer)',
        url: 'https://planetarycomputer.microsoft.com/dataset/group/modis',
        versao: 'coleção 061',
        licenca: 'dado aberto da NASA EOSDIS, sem restrição de uso',
      },
      recorte: {
        coordenadas: ponto,
        epoca: `ano ${a.vegetacao?.ano ?? a.temperaturaSuperficie?.ano}`,
        referencial: 'grade senoidal do MODIS, amostrada no ponto',
        area: 'pixel de 250 m (NDVI) e 1 km (temperatura)',
      },
      qualidade: {
        resolucao: '250 m / 1 km',
        semDado: 'composições sem dado são descartadas',
        incerteza: 'NDVI escala 0,0001; temperatura escala 0,02 K',
      },
    });
  }
  if (a.solo) {
    camadas.push({
      camada: 'Solo (textura, pH, carbono)',
      produto: {
        nome: 'ISRIC SoilGrids 2.0',
        missao: 'ISRIC — World Soil Information (mapeamento digital por aprendizado de máquina)',
        url: 'https://soilgrids.org/',
        versao: '2.0 (Poggio et al. 2021)',
        licenca: 'CC-BY 4.0',
      },
      recorte: { coordenadas: ponto, epoca: 'produto de 2020', referencial: 'Homolosine de Goode', area: 'pixel de 250 m, 0–5 cm' },
      qualidade: {
        resolucao: '250 m',
        semDado: a.solo.semSoloMapeado ? 'sem solo mapeado (rocha, gelo ou água)' : '—',
        incerteza: 'previsão estatística (média); o SoilGrids publica também os quantis 5–95%',
      },
    });
  }
  return camadas;
}

function camadaComposicao(c: ComposicaoAlvo): Camada {
  return {
    camada: `Composição química (${c.corpo})`,
    produto: {
      nome: c.fonte,
      missao: c.instrumento,
      url: c.referencias[0]?.url ?? 'https://pds-geosciences.wustl.edu/',
      versao: c.corpo === 'Marte' ? 'ody-m-grs-5-elements-v1' : 'lp-l-grs-5-elem-abundance-v1',
      licenca: 'dado público da NASA (PDS)',
    },
    recorte: {
      coordenadas: `lat ${c.celula.latMin} a ${c.celula.latMax}, lon ${c.celula.lonMin} a ${c.celula.lonMax}`,
      epoca: c.corpo === 'Marte' ? 'missão 2001 Mars Odyssey' : 'missão Lunar Prospector (1998–1999)',
      referencial: c.corpo === 'Marte' ? 'longitude 0–360° leste, células de 5°' : 'pixels de área igual de 5°',
      area: 'centenas de quilômetros (resolução do espectrômetro)',
    },
    qualidade: { resolucao: 'células de 5°', semDado: '—', incerteza: 'incerteza 1σ por óxido, publicada no produto' },
  };
}

export async function passaporte(objetivoId: unknown, localId: unknown, candidatoId: unknown) {
  const objetivo = obterObjetivo(objetivoId);
  if (typeof localId !== 'string') throw new AppError(400, 'Informe ?local=<id>.');
  const local = obterLocal(localId);
  const candidato = CANDIDATOS.find((c) => c.id === candidatoId);
  if (!candidato) throw new AppError(404, `Local "${String(candidatoId)}" não existe. Veja GET /api/ranking.`);

  const ranking = await rankingDe(objetivo.id, local.id);
  const linha = ranking.linhas.find((l) => l.id === candidato.id)!;
  const analogo = ANALOGOS.find((a) => a.id === candidato.id);

  const bbox = janelaTerraNoPonto(candidato.lon, candidato.lat, ladoDoLocal(local));
  const [relT, relA, amb, comp] = await Promise.all([
    relevoTerra(validarRelevo({ bbox, resolucao: 128 })),
    relevoLocal(local, 128),
    medirAmbiente(candidato.lon, candidato.lat).catch(() => null),
    composicaoDoLocal(local).catch(() => null),
  ]);
  const camadas = [
    camadaRelevoTerra(relT),
    await camadaRelevoAlvo(relA, local.id),
    ...(amb ? camadasAmbiente(amb) : []),
    ...(comp ? [camadaComposicao(comp)] : []),
  ];

  const corpo = REFERENCIAS_CORPOS.corpos[local.corpo];
  const terra = REFERENCIAS_CORPOS.corpos.Terra;

  return {
    geradoEm: new Date().toISOString(),
    referencia: {
      alvo: `${local.nome} (${local.corpo})`,
      objetivo: objetivo.nome,
      pergunta: objetivo.pergunta,
      candidato: `${candidato.nome} — ${candidato.pais}`,
      papel:
        candidato.papel === 'referencia'
          ? 'Referência conhecida (estudada na literatura)'
          : 'Análogo proposto — hipótese a validar em campo',
      coordenadas: { lon: candidato.lon, lat: candidato.lat },
    },
    metricas: {
      distancia: linha.distancia,
      posicao: linha.posicao,
      total: ranking.validacao.total,
      formula: FORMULA_DISTANCIA,
      cobertura: `${linha.cobertura}% do peso com dado`,
      criterios: linha.parcelas,
      resolucao: `janela de ${ladoDoLocal(local)} × ${ladoDoLocal(local)} km, ${br(relT.metrosPorPixel.x)} m por pixel nos dois corpos`,
    },
    evidencias: {
      camadas,
      literatura: candidato.referencias,
    },
    diferencas: {
      fisicas: [
        `Gravidade: ${br(terra.gravidade, 2)} m/s² na Terra × ${br(corpo.gravidade, 2)} m/s² em ${local.corpo} (NASA Fact Sheets).`,
        `Pressão: ${terra.pressao} na Terra × ${corpo.pressao} em ${local.corpo}.`,
        `Radiação: o campo magnético e a atmosfera da Terra bloqueiam a maior parte; ${local.corpo === 'Lua' ? 'a Lua' : 'Marte'} não tem essa proteção.`,
      ],
      doLocal: analogo ? [analogo.ondeFalha] : ['Sem ficha de literatura: as diferenças vêm só das medidas abaixo.'],
      composicao: comp
        ? 'A química do alvo é medida pela NASA (GRS); a química de rochas da Terra em óxidos ainda não está disponível para comparação direta.'
        : 'Sem composição do alvo disponível.',
      criterioMaisDiferente: linha.maisDiferente,
      dadosAusentes: linha.ausentes,
      gravidadeRazao: Math.round((GRAVIDADE.Terra / GRAVIDADE[local.corpo]) * 10) / 10,
    },
    aplicacao: {
      experimento: objetivo.experimento(local.corpo, local.nome, candidato.nome),
      usoNaExploracao: analogo?.usoNaExploracao ?? null,
      naoConcluir: objetivo.naoConcluir,
    },
    reprodutibilidade: {
      rotas: [
        `GET /api/ranking?objetivo=${objetivo.id}&local=${local.id}`,
        `GET /api/passaporte?objetivo=${objetivo.id}&local=${local.id}&candidato=${candidato.id}`,
        `POST /api/relevo { bbox: [${bbox.map((n) => f(n)).join(', ')}], resolucao: 128 }`,
        `GET /api/locais/${local.id}/relevo?resolucao=128`,
      ],
      codigo: ['backend/model/objetivosModel.ts', 'backend/model/rankingModel.ts', 'backend/model/validacaoModel.ts'],
      parametros: `resolução 128 px; janela ${ladoDoLocal(local)} km; padronização z sobre ${ranking.validacao.total} locais; pesos em objetivosModel.ts`,
    },
  };
}
