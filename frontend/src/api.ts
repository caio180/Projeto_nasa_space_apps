// Camada de comunicação com o NOSSO backend. Os componentes nunca chamam
// fetch direto: chamam estas funções. Assim, se uma rota mudar, muda só aqui.

import type {
  BBox,
  ListaAnalogos,
  ImagemSatelite,
  ListaObjetivos,
  ObjetivoId,
  Passaporte,
  ResultadoRanking,
  ListaLocais,
  MedidasAmbientais,
  ResultadoCompatibilidade,
  Relevo,
} from './types.ts';

/** Erro com o corpo JSON do backend ({ erro, detalhes }) para mostrar na tela. */
export class ErroApi extends Error {
  constructor(
    public status: number | null,
    message: string,
    public detalhes?: unknown,
  ) {
    super(message);
  }
}

/**
 * Endereço do backend.
 * - Vazio (padrão): a API está no MESMO endereço do site — um serviço só no Render,
 *   ou o proxy do Vite em desenvolvimento.
 * - Front e back hospedados separados: defina VITE_API_URL no build do frontend,
 *   por exemplo https://planetmatch-api.onrender.com (sem barra no fim).
 */
const BASE_API = (import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '');

async function chamar<T>(metodo: 'GET' | 'POST', url: string, corpo?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE_API}${url}`, {
      method: metodo,
      headers: corpo ? { 'Content-Type': 'application/json' } : undefined,
      body: corpo ? JSON.stringify(corpo) : undefined,
    });
  } catch {
    throw new ErroApi(null, 'Não foi possível conectar-se ao servidor.');
  }

  const texto = await res.text();
  let dados: unknown = texto;
  try {
    dados = JSON.parse(texto);
  } catch {
    // resposta não-JSON (ex.: proxy do Vite sem backend rodando)
  }
  // Proxy do Vite sem o backend no ar: devolve 5xx sem o JSON { erro } do nosso servidor.
  if (res.status >= 500 && (typeof dados !== 'object' || dados === null)) {
    throw new ErroApi(null, 'Não foi possível conectar-se ao servidor.');
  }
  if (!res.ok) {
    const d = dados as { erro?: string; detalhes?: unknown };
    throw new ErroApi(res.status, d?.erro ?? `Erro HTTP ${res.status}`, d?.detalhes);
  }
  return dados as T;
}

export const api = {
  relevo: (bbox: BBox, resolucao: number) => chamar<Relevo>('POST', '/api/relevo', { bbox, resolucao }),
  analogos: () => chamar<ListaAnalogos>('GET', '/api/analogos'),
  ambiente: (lon: number, lat: number) =>
    chamar<MedidasAmbientais>('GET', `/api/ambiente?lon=${lon.toFixed(4)}&lat=${lat.toFixed(4)}`),
  locais: () => chamar<ListaLocais>('GET', '/api/locais'),
  objetivos: () => chamar<ListaObjetivos>('GET', '/api/objetivos'),
  /** Candidatos da Terra ordenados pela distância ponderada ao alvo, para um objetivo. */
  ranking: (objetivo: ObjetivoId, local: string) =>
    chamar<ResultadoRanking>('GET', `/api/ranking?objetivo=${objetivo}&local=${encodeURIComponent(local)}`),
  passaporte: (objetivo: ObjetivoId, local: string, candidato: string) =>
    chamar<Passaporte>(
      'GET',
      `/api/passaporte?objetivo=${objetivo}&local=${encodeURIComponent(local)}&candidato=${encodeURIComponent(candidato)}`,
    ),
  /** Foto Sentinel-2 da Terra no bbox (o mesmo do relevo). */
  imagemTerra: (bbox: BBox, tamanho: number, nome?: string, simular?: 'Marte' | 'Lua') =>
    chamar<ImagemSatelite>('POST', '/api/imagem', { bbox, tamanho, nome, simular }),
  /** Ortoimagem de Marte (CTX) ou da Lua (Kaguya) na janela do relevo do local. */
  imagemLocal: (id: string, tamanho: number) =>
    chamar<ImagemSatelite>('GET', `/api/locais/${encodeURIComponent(id)}/imagem?tamanho=${tamanho}`),
  relevoLocal: (id: string, resolucao: number) =>
    chamar<Relevo>('GET', `/api/locais/${encodeURIComponent(id)}/relevo?resolucao=${resolucao}`),
  /** Análogo do catálogo (analogo) ou ponto livre (lon/lat/nome) contra um local de Marte/Lua. */
  compatibilidade: (
    local: string,
    terra: { analogo: string } | { lon: number; lat: number; nome: string },
    resolucao: number,
  ) => {
    const q = new URLSearchParams({ local, resolucao: String(resolucao) });
    if ('analogo' in terra) q.set('analogo', terra.analogo);
    else {
      q.set('lon', terra.lon.toFixed(4));
      q.set('lat', terra.lat.toFixed(4));
      q.set('nome', terra.nome);
    }
    return chamar<ResultadoCompatibilidade>('GET', `/api/compatibilidade?${q}`);
  },
};
