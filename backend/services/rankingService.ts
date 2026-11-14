// =============================================================================
// SERVICE — ranking de candidatos da Terra (objetivo × alvo) e passaporte.
//
// Cada candidato é medido numa janela do MESMO tamanho da do alvo (mesmo pixel),
// com as mesmas funções de relevo e de ambiente do resto da plataforma.
// Rodamos no máximo 4 candidatos ao mesmo tempo para não sobrecarregar as APIs
// públicas, e guardamos o resultado em cache (os dados não mudam a cada minuto).
// =============================================================================

import { AppError } from '../model/model.ts';
import { obterObjetivo, VARIAVEIS } from '../model/objetivosModel.ts';
import type { VariavelId } from '../model/objetivosModel.ts';
import { ladoDoLocal, obterLocal } from '../model/planetaModel.ts';
import {
  calcularRanking,
  CANDIDATOS,
  valoresDeReferenciaDoAlvo,
  valoresDoAmbiente,
  valoresDoRelevo,
} from '../model/rankingModel.ts';
import type { CandidatoTerra, ResultadoRanking, Valores } from '../model/rankingModel.ts';
import { janelaTerraNoPonto, validarRelevo } from '../model/relevoModel.ts';
import { medirAmbiente } from './ambienteService.ts';
import { relevoLocal, relevoTerra } from './relevoService.ts';

const RESOLUCAO_RANKING = 128;
const SIMULTANEOS = 4;
const VARIAVEIS_AMBIENTE: VariavelId[] = ['precipitacao', 'ndvi', 'carbono', 'tempMinima'];

const cache = new Map<string, ResultadoRanking>();
const emAndamento = new Map<string, Promise<ResultadoRanking>>();

/** Executa `tarefa` para cada item com no máximo `limite` ao mesmo tempo. */
async function emLotes<T, R>(itens: T[], limite: number, tarefa: (item: T) => Promise<R>): Promise<R[]> {
  const resultados = new Array<R>(itens.length);
  let proximo = 0;
  const trabalhador = async () => {
    while (proximo < itens.length) {
      const i = proximo++;
      resultados[i] = await tarefa(itens[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limite, itens.length) }, trabalhador));
  return resultados;
}

const mensagem = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function rankingDe(objetivoId: unknown, localId: unknown): Promise<ResultadoRanking> {
  const objetivo = obterObjetivo(objetivoId);
  if (typeof localId !== 'string') throw new AppError(400, 'Informe ?local=<id> (veja GET /api/locais).');
  const local = obterLocal(localId);
  const chave = `${objetivo.id}:${local.id}`;
  const pronto = cache.get(chave);
  if (pronto) return Promise.resolve(pronto);
  const andando = emAndamento.get(chave);
  if (andando) return andando;

  const tarefa = (async () => {
    const lado = ladoDoLocal(local);
    const precisaAmbiente = objetivo.criterios.some((c) => VARIAVEIS_AMBIENTE.includes(c.variavel));

    const relAlvo = await relevoLocal(local, RESOLUCAO_RANKING);
    const referencia = valoresDeReferenciaDoAlvo(local);
    const valoresAlvo: Valores = { ...valoresDoRelevo(relAlvo, local.corpo), ...referencia.valores };
    const fontesAlvo = {
      ...Object.fromEntries(
        (['declividadeMedia', 'transitavel', 'pouso', 'rugosidade250', 'rugosidade1km', 'hurst'] as VariavelId[]).map(
          (v) => [v, `${relAlvo.fonte}, produto ${relAlvo.itens.join(', ')}`],
        ),
      ),
      ...referencia.fontes,
    };

    const avaliados = await emLotes(CANDIDATOS, SIMULTANEOS, async (candidato: CandidatoTerra) => {
      const erros: string[] = [];
      let valores: Valores = {};
      try {
        const bbox = janelaTerraNoPonto(candidato.lon, candidato.lat, lado);
        const rel = await relevoTerra(validarRelevo({ bbox, resolucao: RESOLUCAO_RANKING }));
        valores = { ...valoresDoRelevo(rel, local.corpo) };
      } catch (e) {
        erros.push(`relevo indisponível: ${mensagem(e)}`);
      }
      if (precisaAmbiente) {
        try {
          const amb = await medirAmbiente(candidato.lon, candidato.lat);
          valores = { ...valores, ...valoresDoAmbiente(amb) };
          for (const [fonte, motivo] of Object.entries(amb.erros)) erros.push(`${fonte}: ${motivo}`);
        } catch (e) {
          erros.push(`ambiente indisponível: ${mensagem(e)}`);
        }
      }
      return { candidato, valores, erros };
    });

    const resultado = calcularRanking(objetivo, local, valoresAlvo, fontesAlvo, avaliados);
    cache.set(chave, resultado);
    return resultado;
  })().finally(() => emAndamento.delete(chave));

  emAndamento.set(chave, tarefa);
  return tarefa;
}
