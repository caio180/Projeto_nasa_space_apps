// =============================================================================
// SERVICE — foto de satélite da MESMA janela do relevo 3D.
//
// Terra: Sentinel-2 L2A (ESA/Copernicus) pela Planetary Computer. Buscamos as
//   cenas com menos nuvens dos últimos 2 anos e juntamos até cobrir a janela
//   (a janela pode cair na divisa de dois tiles). Cor verdadeira, 10 m/pixel.
// Marte: ortoimagem do MRO CTX (6 m/pixel) do MESMO produto do DTM.
// Lua:   ortoimagem do Kaguya Terrain Camera (~10 m/pixel) do MESMO produto do DTM.
//
// Nos dois planetas a foto e o relevo saem do mesmo item STAC e da mesma janela
// projetada, então ficam alinhados pixel a pixel (dá para usar como textura).
// =============================================================================

import { AppError } from '../model/model.ts';
import type { BBox } from '../model/model.ts';
import {
  cinzaComContraste,
  codificarPng,
  COBERTURA_FOTO,
  COLECAO_FOTO_TERRA,
  NUVENS_MAX,
} from '../model/imagemModel.ts';
import { BANDAS_SIMULACAO } from '../model/imagemModel.ts';
import type { ImagemSatelite, SimulacaoSensor } from '../model/imagemModel.ts';
import { ehPolar, janelaGraus, ladoDoLocal, RAIO_M } from '../model/planetaModel.ts';
import type { LocalPlanetario } from '../model/planetaModel.ts';
import { calcularGrade, lerNpy } from '../model/relevoModel.ts';
import { obterRecorteNpy } from './elevacaoService.ts';
import { buscarItens } from './planetaryService.ts';
import { janelaUsadaNoLocal } from './relevoService.ts';
import { lerJanelaCog } from './usgsService.ts';

const MAX_CENAS = 10;
const numero = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const CENAS_POR_TILE = 3;
const cache = new Map<string, ImagemSatelite>();

/**
 * Cenas Sentinel-2 da MENOS para a mais nublada. Nuvem, sombra e neve são
 * tiradas depois, pixel a pixel, pela classificação de cena (SCL); por isso
 * aceitamos tiles com até NUVENS_MAX% de nuvem: mais datas para tapar buracos.
 *
 * A janela pode cair na divisa de tiles (s2:mgrs_tile) e de órbitas: pegamos
 * as melhores cenas de CADA tile e órbita e alternamos entre eles, para o mosaico
 * cobrir a janela inteira.
 */
async function cenasCandidatas(bbox: BBox) {
  const fim = new Date();
  const inicio = new Date(fim);
  inicio.setFullYear(fim.getFullYear() - 2);
  const busca = await buscarItens({
    collections: [COLECAO_FOTO_TERRA],
    bbox,
    datetime: `${inicio.toISOString()}/${fim.toISOString()}`,
    query: { 'eo:cloud_cover': { lt: NUVENS_MAX } },
    sortby: [{ field: 'properties.eo:cloud_cover', direction: 'asc' }],
    limit: 100,
  });

  type Cena = { id: string; data: string; neve: number; zenite: number | null; azimute: number | null };
  // O catálogo só ordena por um campo; reordenamos aqui por nuvem + neve do tile,
  // as duas coisas que escondem a rocha (Chapada: nuvem; Ojos del Salado: neve).
  const ordenadas = busca.features
    .map((f) => ({
      f,
      ruido: Number(f.properties['eo:cloud_cover'] ?? 0) + Number(f.properties['s2:snow_ice_percentage'] ?? 0),
    }))
    .sort((a, b) => a.ruido - b.ruido)
    .map(({ f }) => f);
  const porTile = new Map<string, Cena[]>();
  for (const f of ordenadas) {
    // Tile + órbita relativa (ex.: 19JEL_R096): cada órbita vê um pedaço diferente do tile.
    const orbita = /_R(\d{3})_/.exec(f.id)?.[1] ?? '';
    const tile = `${f.properties['s2:mgrs_tile'] ?? ''}_R${orbita}`;
    const lista = porTile.get(tile) ?? [];
    if (lista.length < CENAS_POR_TILE) {
      lista.push({
        id: f.id,
        data: String(f.properties.datetime ?? '').slice(0, 10),
        neve: Number(f.properties['s2:snow_ice_percentage'] ?? 0),
        zenite: numero(f.properties['s2:mean_solar_zenith']),
        azimute: numero(f.properties['s2:mean_solar_azimuth']),
      });
    }
    porTile.set(tile, lista);
  }
  // Rodízio: a melhor de cada tile, depois a 2ª melhor de cada tile...
  const listas = [...porTile.values()];
  const ordem: Cena[] = [];
  for (let i = 0; i < CENAS_POR_TILE; i++) for (const l of listas) if (l[i]) ordem.push(l[i]);
  return ordem;
}

// Classes de cada pixel para montar o mosaico.
const SEM_FOTO = 0;
const LIMPO = 1;
const NEVE = 2;
const NUVEM = 3;
/** SCL do Sentinel-2 L2A: 3 = sombra de nuvem, 8/9 = nuvem média/alta prob., 10 = cirro fino, 11 = neve. */
const SCL_NUVEM = new Set([3, 8, 9, 10]);
const SCL_NEVE = 11;
/** Margem em volta das nuvens (px): cobre halos e as bordas onde a SCL reduzida mistura classes. */
const MARGEM_NUVEM = 2;

/**
 * Classifica cada pixel de uma cena (bandas: R, G, B, SCL, máscara).
 * Borda da faixa do satélite (vizinho sem foto) conta como sem foto: ali a
 * reamostragem mistura a foto com o vazio e cria uma emenda escura.
 */
function classificarPixels(dados: ArrayLike<number>, largura: number, altura: number) {
  const total = largura * altura;
  const temFoto = (i: number) =>
    dados[4 * total + i] > 0 && dados[3 * total + i] > 0 && dados[i] + dados[total + i] + dados[2 * total + i] > 0;
  const classe = new Uint8Array(total);
  const nuvem = new Uint8Array(total);
  for (let i = 0; i < total; i++) {
    if (!temFoto(i)) continue;
    const x = i % largura;
    const y = (i - x) / largura;
    const borda =
      (x > 0 && !temFoto(i - 1)) ||
      (x < largura - 1 && !temFoto(i + 1)) ||
      (y > 0 && !temFoto(i - largura)) ||
      (y < altura - 1 && !temFoto(i + largura));
    if (borda) continue;
    const scl = dados[3 * total + i];
    classe[i] = scl === SCL_NEVE ? NEVE : LIMPO;
    if (SCL_NUVEM.has(scl)) nuvem[i] = 1;
  }
  // Expande a nuvem MARGEM_NUVEM pixels para os lados.
  for (let i = 0; i < total; i++) {
    if (!nuvem[i]) continue;
    const x = i % largura;
    const y = (i - x) / largura;
    for (let dy = -MARGEM_NUVEM; dy <= MARGEM_NUVEM; dy++) {
      for (let dx = -MARGEM_NUVEM; dx <= MARGEM_NUVEM; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= largura || ny >= altura) continue;
        const j = ny * largura + nx;
        if (classe[j] !== SEM_FOTO) classe[j] = NUVEM;
      }
    }
  }
  return classe;
}

/**
 * Foto em cor verdadeira da Terra no bbox (o mesmo do relevo). Com `simular`,
 * também devolve a Terra como a câmera de Marte ou da Lua a veria.
 */
export async function imagemTerra(
  bbox: BBox,
  lado: number,
  nome?: string,
  simular?: 'Marte' | 'Lua',
): Promise<ImagemSatelite> {
  const chave = `${bbox.map((n) => n.toFixed(5)).join(',')}:${lado}:${simular ?? ''}`;
  const emCache = cache.get(chave);
  if (emCache) return { ...emCache, nome };

  const { largura, altura, metrosPorPixel } = calcularGrade({ bbox, resolucao: lado });
  const cenas = await cenasCandidatas(bbox);
  if (cenas.length === 0) {
    throw new AppError(404, `Não há cena Sentinel-2 com menos de ${NUVENS_MAX}% de nuvens nos últimos 2 anos.`);
  }

  const total = largura * altura;
  const rgba = new Uint8Array(total * 4);
  // De qual cena (índice em `usadas`) veio cada pixel: a simulação usa as MESMAS cenas.
  const origem = new Int16Array(total).fill(-1);
  let preenchidos = 0;
  const usadas: typeof cenas = [];

  // Cada cena vem com a foto (R, G, B) + a classificação de cena SCL do próprio
  // Sentinel-2 L2A + a máscara. Com a SCL tiramos nuvem e sombra PIXEL A PIXEL
  // (o filtro de nuvens do catálogo vale para o tile inteiro, de ~110 km).
  const lidas: { indice: number; dados: Uint8Array | Uint16Array | Float32Array; classe: Uint8Array }[] = [];
  const usar = (k: number, i: number) => {
    const { dados, indice } = lidas[k];
    rgba.set([dados[i], dados[total + i], dados[2 * total + i], 255], i * 4);
    let posicao = usadas.indexOf(cenas[indice]);
    if (posicao === -1) posicao = usadas.push(cenas[indice]) - 1;
    origem[i] = posicao;
    preenchidos++;
  };
  // Passada: preenche os pixels ainda vazios com os da cena k cuja classe é aceita.
  const passada = (k: number, aceita: (c: number) => boolean) => {
    for (let i = 0; i < total; i++) if (rgba[i * 4 + 3] === 0 && aceita(lidas[k].classe[i])) usar(k, i);
  };

  for (const [indice, cena] of cenas.slice(0, MAX_CENAS).entries()) {
    // Uma cena lenta ou com erro não derruba a foto: seguimos para a próxima data.
    let bruto: ArrayBuffer;
    try {
      bruto = await obterRecorteNpy(COLECAO_FOTO_TERRA, cena.id, bbox, largura, altura, ['visual', 'SCL']);
    } catch (e) {
      if (e instanceof AppError && (e.status === 502 || e.status === 504)) continue;
      throw e;
    }
    const { forma, dados } = lerNpy(bruto);
    if (forma[0] !== 5 || forma[1] !== altura || forma[2] !== largura) {
      throw new AppError(502, `Foto com formato inesperado: (${forma.join(', ')}).`);
    }
    lidas.push({ indice, dados, classe: classificarPixels(dados, largura, altura) });
    passada(lidas.length - 1, (c) => c === LIMPO);
    if (preenchidos / total >= COBERTURA_FOTO) break;
  }
  // Sobrou buraco? Primeiro aceitamos neve (real nos análogos polares e de altitude);
  // por último, nuvem — melhor uma nuvem marcada do que um buraco no 3D.
  for (let k = 0; k < lidas.length; k++) passada(k, (c) => c === NEVE);
  let comNuvem = 0;
  for (let k = 0; k < lidas.length; k++) {
    const antes = preenchidos;
    passada(k, (c) => c === NUVEM);
    comNuvem += preenchidos - antes;
  }

  const imagem: ImagemSatelite = {
    corpo: 'Terra',
    nome,
    fonte: 'Sentinel-2 L2A (ESA/Copernicus) — Microsoft Planetary Computer',
    instrumento: 'MSI do Sentinel-2, cor verdadeira (bandas 4, 3, 2)',
    datas: [...new Set(usadas.map((c) => c.data))],
    itens: usadas.map((c) => c.id),
    bbox,
    largura,
    altura,
    metrosPorPixel: Math.round(((metrosPorPixel.x + metrosPorPixel.y) / 2) * 10) / 10,
    tipo: 'cor',
    png: codificarPng(largura, altura, 4, rgba),
    cobertura: Math.round((preenchidos / total) * 1000) / 1000,
    sol:
      usadas[0] && usadas[0].zenite !== null
        ? {
            elevacao: Math.round((90 - usadas[0].zenite) * 10) / 10,
            azimute: Math.round((usadas[0].azimute ?? 0) * 10) / 10,
          }
        : null,
    simulacao: simular ? await simularSensor(simular, usadas, origem, bbox, largura, altura) : null,
    notas: [
      `Cenas dos últimos 2 anos com menos de ${NUVENS_MAX}% de nuvens no tile, ordenadas pela menor nuvem + neve.`,
      'Pixel original de 10 m, reamostrado para o mesmo tamanho de pixel da foto do outro corpo.',
      'Nuvens, sombras e neve (esta só quando há outra data sem neve) removidas pixel a pixel com a classificação de cena (SCL) do Sentinel-2 L2A, com margem de 2 pixels; o buraco é preenchido com outra data.',
      ...(comNuvem / total >= 0.001
        ? [`${Math.round((1000 * comNuvem) / total) / 10}% da janela ainda tem nuvem (nenhuma cena limpa cobria esses pixels).`]
        : []),
    ],
  };
  cache.set(chave, imagem);
  return imagem;
}

/**
 * "Terra vista pela câmera de Marte/Lua": média das bandas de refletância de
 * superfície do Sentinel-2 que caem na faixa da câmera alvo, nas MESMAS cenas e
 * pixels do mosaico colorido, com a MESMA normalização de contraste aplicada à
 * foto do alvo. Aproximação: média simples, sem a curva exata da câmera.
 */
async function simularSensor(
  corpo: 'Marte' | 'Lua',
  usadas: { id: string }[],
  origem: Int16Array,
  bbox: BBox,
  largura: number,
  altura: number,
): Promise<SimulacaoSensor> {
  const { sensor, faixa, bandas } = BANDAS_SIMULACAO[corpo];
  const total = largura * altura;
  const pan = new Float32Array(total).fill(Number.NaN);
  const recortes = await Promise.all(
    usadas.map((c) => obterRecorteNpy(COLECAO_FOTO_TERRA, c.id, bbox, largura, altura, bandas).then(lerNpy)),
  );
  const nb = bandas.length;
  recortes.forEach(({ forma, dados }, k) => {
    if (forma[0] !== nb + 1 || forma[1] !== altura || forma[2] !== largura) {
      throw new AppError(502, `Bandas com formato inesperado: (${forma.join(', ')}).`);
    }
    for (let i = 0; i < total; i++) {
      if (origem[i] !== k || dados[nb * total + i] === 0) continue; // última banda = máscara
      let soma = 0;
      for (let b = 0; b < nb; b++) soma += dados[b * total + i];
      pan[i] = soma / nb;
    }
  });
  const { rgba } = cinzaComContraste(pan, null);
  return { corpo, sensor, faixa, bandas: [...bandas], png: codificarPng(largura, altura, 4, rgba) };
}

/** Ortoimagem de Marte (CTX) ou da Lua (Kaguya TC) na janela do relevo do local. */
export async function imagemLocal(local: LocalPlanetario, lado: number): Promise<ImagemSatelite> {
  const chave = `${local.id}:${lado}`;
  const emCache = cache.get(chave);
  if (emCache) return emCache;

  const { item, bboxProjetado } = await janelaUsadaNoLocal(local);
  const asset = item.assets.orthoimage ?? item.assets.orthoimage_left;
  if (!asset) throw new AppError(404, `O produto ${item.id} não tem ortoimagem.`);

  const janela = await lerJanelaCog(asset.href, bboxProjetado, lado, lado, 'A leitura da foto na USGS demorou demais.');
  const { rgba, cobertura } = cinzaComContraste(janela.valores, janela.nodata);
  if (cobertura === 0) throw new AppError(404, `A ortoimagem de ${local.nome} não cobre a janela.`);

  const ladoKm = ladoDoLocal(local);
  const ehMarte = local.corpo === 'Marte';
  const imagem: ImagemSatelite = {
    corpo: local.corpo,
    nome: local.nome,
    fonte: `USGS Astrogeology — ${ehMarte ? 'MRO CTX (ortoimagem)' : 'Kaguya Terrain Camera (ortoimagem)'}`,
    instrumento: ehMarte
      ? 'Context Camera do Mars Reconnaissance Orbiter (NASA/JPL/MSSS), pancromática'
      : 'Terrain Camera da sonda Kaguya (JAXA), pancromática',
    datas: [],
    itens: [item.id],
    bbox: janelaGraus(local.lon, local.lat, ladoKm, RAIO_M[local.corpo]) as BBox,
    largura: lado,
    altura: lado,
    metrosPorPixel: Math.round(((ladoKm * 1000) / lado) * 10) / 10,
    tipo: 'pancromatica',
    png: codificarPng(lado, lado, 4, rgba),
    cobertura: Math.round(cobertura * 1000) / 1000,
    sol: null, // o catálogo da USGS não informa o ângulo do Sol
    simulacao: null,
    notas: [
      'Mesmo produto e mesma janela do modelo de relevo: a foto encaixa no 3D pixel a pixel.',
      'Imagem em tons de cinza (a câmera não tem filtro de cor). O contraste foi esticado entre os percentis 1% e 99%.',
      ...(ehPolar(local.lat)
        ? ['No polo sul o Sol fica a poucos graus do horizonte: sombras longas e regiões sempre escuras são reais.']
        : []),
    ],
  };
  cache.set(chave, imagem);
  return imagem;
}
