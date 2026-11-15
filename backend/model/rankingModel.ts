// =============================================================================
// MODEL — ranking explicável de candidatos da Terra para um alvo e um objetivo.
//
// 1. Cada candidato vira um vetor de variáveis MEDIDAS (relevo + ambiente).
// 2. O alvo vira o mesmo vetor (relevo do DTM + valores de referência citados).
// 3. Padronização z com a média e o desvio dos candidatos da Terra.
// 4. Distância ponderada D (objetivosModel.ts). Ausentes saem da conta e
//    aparecem listados — nunca viram nota.
// 5. Validação: onde ficou a referência conhecida que o guia cita para este
//    tipo de teste? Se ela cair no fim da lista, o método precisa de revisão.
// =============================================================================

import type { MedidasAmbientais } from './ambienteModel.ts';
import { ANALOGOS } from './analogosModel.ts';
import { faixaTermica } from './compatibilidadeModel.ts';
import { FORMULA_DISTANCIA, NOTA_PESOS, VARIAVEIS } from './objetivosModel.ts';
import type { Objetivo, VariavelId } from './objetivosModel.ts';
import type { Corpo, LocalPlanetario } from './planetaModel.ts';
import { gradeDeclividades } from './relevoModel.ts';
import type { Relevo } from './relevoModel.ts';
import { rugosidadeMultiescala } from './validacaoModel.ts';

export type Valores = Partial<Record<VariavelId, number | null>>;

/** Candidato da Terra: os análogos do catálogo + áreas da busca sem literatura. */
export interface CandidatoTerra {
  id: string;
  nome: string;
  pais: string;
  lon: number;
  lat: number;
  /** 'referencia' = estudado na literatura; 'candidato' = sem literatura (hipótese a testar). */
  papel: 'referencia' | 'candidato';
  origem: 'catalogo' | 'busca';
  referencias: { titulo: string; url: string }[];
}

/**
 * Áreas brasileiras incluídas na busca. Não temos literatura que as trate como
 * análogos — entram SÓ pelas medidas. Nenhuma afirmação sobre elas é feita
 * além do que a plataforma mede.
 */
const BUSCA_BRASIL: Omit<CandidatoTerra, 'papel' | 'origem' | 'referencias'>[] = [
  { id: 'raso-da-catarina', nome: 'Raso da Catarina (BA)', pais: 'Brasil', lon: -38.5, lat: -9.65 },
  { id: 'jalapao', nome: 'Jalapão (TO)', pais: 'Brasil', lon: -46.6, lat: -10.5 },
  { id: 'lencois-maranhenses', nome: 'Lençóis Maranhenses (MA)', pais: 'Brasil', lon: -43.0, lat: -2.58 },
  { id: 'vale-da-lua', nome: 'Vale da Lua (GO)', pais: 'Brasil', lon: -47.575, lat: -14.175 },
  { id: 'chapada-diamantina', nome: 'Chapada Diamantina (BA)', pais: 'Brasil', lon: -41.4, lat: -12.55 },
];

export const CANDIDATOS: CandidatoTerra[] = [
  ...ANALOGOS.map((a) => ({
    id: a.id,
    nome: a.nome,
    pais: a.pais,
    lon: a.lon,
    lat: a.lat,
    papel: a.situacao === 'estudado' ? ('referencia' as const) : ('candidato' as const),
    origem: 'catalogo' as const,
    referencias: a.referencias,
  })),
  ...BUSCA_BRASIL.map((c) => ({ ...c, papel: 'candidato' as const, origem: 'busca' as const, referencias: [] })),
];

/** Limites de declive (graus) por corpo: rover de referência e área de pouso. */
const LIMITES: Record<Exclude<Corpo, 'Terra'>, { rover: number; pouso: number }> = {
  Marte: { rover: 30, pouso: 15 },
  Lua: { rover: 15, pouso: 5 },
};

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Precisão vertical da grade (0,1 m): abaixo disso o desvio vale o piso (terreno plano como um salar). */
const PRECISAO_M = 0.1;

/** Desvio RMS interpolado (log-log) numa distância exata; null fora da faixa medida. */
function rugosidadeEm(r: Relevo, baseM: number) {
  const pontos = rugosidadeMultiescala(r).pontos.map((p) => ({ ...p, desvioM: Math.max(p.desvioM, PRECISAO_M) }));
  for (let i = 1; i < pontos.length; i++) {
    const a = pontos[i - 1];
    const b = pontos[i];
    if (baseM >= a.baseM && baseM <= b.baseM && a.desvioM > 0 && b.desvioM > 0) {
      const t = (Math.log10(baseM) - Math.log10(a.baseM)) / (Math.log10(b.baseM) - Math.log10(a.baseM));
      return r2(10 ** (Math.log10(a.desvioM) + t * (Math.log10(b.desvioM) - Math.log10(a.desvioM))));
    }
  }
  return null;
}

/** Variáveis de relevo (iguais para Terra e alvo). `corpoAlvo` define os limites de declive. */
export function valoresDoRelevo(r: Relevo, corpoAlvo: Exclude<Corpo, 'Terra'>): Valores {
  const decl = gradeDeclividades(r.elevacoes, r.largura, r.altura, r.metrosPorPixel.x, r.metrosPorPixel.y).filter(
    (d): d is number => d !== null,
  );
  const fracao = (lim: number, menorIgual: boolean) =>
    decl.length ? r2((100 * decl.filter((d) => (menorIgual ? d <= lim : d < lim)).length) / decl.length) : null;
  const { hurst } = rugosidadeMultiescala(r);
  return {
    declividadeMedia: r.estatisticas.declividadeMedia,
    transitavel: fracao(LIMITES[corpoAlvo].rover, true),
    pouso: fracao(LIMITES[corpoAlvo].pouso, false),
    rugosidade250: rugosidadeEm(r, 250),
    rugosidade1km: rugosidadeEm(r, 1000),
    hurst,
  };
}

/** Variáveis de ambiente de um ponto da Terra (null = fonte indisponível). */
export function valoresDoAmbiente(a: MedidasAmbientais | null): Valores {
  const minimos = [a?.clima?.temperaturaMinima, a?.temperaturaSuperficie?.minimaNoite].filter(
    (v): v is number => typeof v === 'number',
  );
  return {
    precipitacao: a?.clima?.precipitacao ?? null,
    ndvi: a?.vegetacao?.ndviMedio ?? null,
    // Sem solo mapeado (rocha, gelo) = sem carbono orgânico no solo.
    carbono: a?.solo ? (a.solo.semSoloMapeado ? 0 : a.solo.carbonoOrganico) : null,
    tempMinima: minimos.length ? Math.min(...minimos) : null,
  };
}

/** Valores de referência do alvo que não vêm do DTM, cada um com a sua fonte. */
export function valoresDeReferenciaDoAlvo(local: LocalPlanetario) {
  const faixa = faixaTermica(local);
  return {
    valores: { precipitacao: 0, ndvi: 0, carbono: 0, tempMinima: faixa.min } satisfies Valores,
    fontes: {
      precipitacao: 'Sem chuva: água líquida não é estável na superfície (NASA Planetary Fact Sheets: pressão de Marte ~6 mb; Lua sem atmosfera).',
      ndvi: 'Sem vegetação (0 por definição).',
      carbono: 'Regolito sem solo orgânico como o da Terra (0 g/kg na escala do SoilGrids).',
      tempMinima: faixa.texto,
    } as Partial<Record<VariavelId, string>>,
  };
}

export interface ParcelaCriterio {
  variavel: VariavelId;
  nome: string;
  unidade: string;
  peso: number;
  valorTerra: number | null;
  valorAlvo: number | null;
  zTerra: number | null;
  zAlvo: number | null;
  /** wᵢ·(Δz)² ÷ Σw usados: quanto este critério pesa na distância. */
  contribuicao: number | null;
}

export interface LinhaRanking extends CandidatoTerra {
  posicao: number | null;
  distancia: number | null;
  /** % do peso total que tinha dado (o resto ficou ausente). */
  cobertura: number;
  parcelas: ParcelaCriterio[];
  ausentes: string[];
  /** Os 2 critérios mais parecidos e o mais diferente (para a justificativa). */
  maisParecidos: string[];
  maisDiferente: string | null;
}

export interface ResultadoRanking {
  objetivo: Pick<Objetivo, 'id' | 'nome' | 'pergunta' | 'naoConcluir' | 'camadasAdicionais'> & {
    criterios: (Objetivo['criterios'][number] & { nome: string; unidade: string; escala: string; comoMedir: string; fonte: string })[];
  };
  alvo: { id: string; nome: string; corpo: string; lon: number; lat: number; valores: Valores; fontes: Partial<Record<VariavelId, string>> };
  formula: string;
  notaPesos: string;
  normalizacao: { variavel: VariavelId; media: number; desvio: number; escala: string; n: number }[];
  linhas: LinhaRanking[];
  candidatoNovo: { id: string; justificativa: string } | null;
  validacao: { referencia: string; posicao: number | null; total: number; texto: string };
  limites: string[];
}

/** COBERTURA_MINIMA: sem pelo menos metade do peso com dado, não há distância. */
const COBERTURA_MINIMA = 0.5;

export function calcularRanking(
  objetivo: Objetivo,
  local: LocalPlanetario,
  valoresAlvo: Valores,
  fontesAlvo: Partial<Record<VariavelId, string>>,
  avaliados: { candidato: CandidatoTerra; valores: Valores; erros: string[] }[],
): ResultadoRanking {
  const transformar = (v: VariavelId, x: number) => (VARIAVEIS[v].escala === 'log' ? Math.log10(Math.max(x, PRECISAO_M)) : x);

  // Média e desvio de cada variável sobre os candidatos da Terra com dado.
  const normalizacao = objetivo.criterios.map(({ variavel }) => {
    const xs = avaliados
      .map((a) => a.valores[variavel])
      .filter((x): x is number => typeof x === 'number')
      .map((x) => transformar(variavel, x));
    const media = xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0;
    const desvio = xs.length > 1 ? Math.sqrt(xs.reduce((s, x) => s + (x - media) ** 2, 0) / xs.length) : 0;
    return { variavel, media, desvio: desvio || 1, escala: VARIAVEIS[variavel].escala, n: xs.length };
  });
  const z = (v: VariavelId, x: number | null | undefined) => {
    if (typeof x !== 'number') return null;
    const n = normalizacao.find((q) => q.variavel === v)!;
    return (transformar(v, x) - n.media) / n.desvio;
  };
  const pesoTotal = objetivo.criterios.reduce((s, c) => s + c.peso, 0);

  const linhas: LinhaRanking[] = avaliados.map(({ candidato, valores, erros }) => {
    const parcelasBrutas = objetivo.criterios.map((c) => {
      const zT = z(c.variavel, valores[c.variavel]);
      const zA = z(c.variavel, valoresAlvo[c.variavel]);
      return { c, zT, zA, termo: zT !== null && zA !== null ? c.peso * (zT - zA) ** 2 : null };
    });
    const usados = parcelasBrutas.filter((p) => p.termo !== null);
    const pesoUsado = usados.reduce((s, p) => s + p.c.peso, 0);
    const cobertura = pesoUsado / pesoTotal;
    const soma = usados.reduce((s, p) => s + p.termo!, 0);
    const distancia = cobertura >= COBERTURA_MINIMA && pesoUsado > 0 ? r2(Math.sqrt(soma / pesoUsado)) : null;

    const parcelas: ParcelaCriterio[] = parcelasBrutas.map(({ c, zT, zA, termo }) => ({
      variavel: c.variavel,
      nome: VARIAVEIS[c.variavel].nome,
      unidade: VARIAVEIS[c.variavel].unidade,
      peso: c.peso,
      valorTerra: valores[c.variavel] ?? null,
      valorAlvo: valoresAlvo[c.variavel] ?? null,
      zTerra: zT === null ? null : r2(zT),
      zAlvo: zA === null ? null : r2(zA),
      contribuicao: termo === null || pesoUsado === 0 ? null : r2(termo / pesoUsado),
    }));
    const ordenadas = parcelas
      .filter((p) => p.zTerra !== null && p.zAlvo !== null)
      .sort((a, b) => Math.abs(a.zTerra! - a.zAlvo!) - Math.abs(b.zTerra! - b.zAlvo!));
    return {
      ...candidato,
      posicao: null,
      distancia,
      cobertura: Math.round(cobertura * 100),
      parcelas,
      ausentes: [
        ...parcelas.filter((p) => p.zTerra === null || p.zAlvo === null).map((p) => p.nome),
        ...(distancia === null ? ['dados insuficientes para a distância (menos da metade do peso)'] : []),
        ...erros,
      ],
      maisParecidos: ordenadas.slice(0, 2).map((p) => p.nome),
      maisDiferente: ordenadas.length > 1 ? ordenadas[ordenadas.length - 1].nome : null,
    };
  });

  // Ordena: menor distância primeiro; sem distância vai para o fim.
  linhas.sort((a, b) => (a.distancia ?? Infinity) - (b.distancia ?? Infinity));
  let posicao = 0;
  for (const l of linhas) if (l.distancia !== null) l.posicao = ++posicao;

  // Candidato novo = o mais bem colocado SEM literatura (hipótese a validar).
  const novo = linhas.find((l) => l.papel === 'candidato' && l.distancia !== null) ?? null;
  const comDistancia = linhas.filter((l) => l.distancia !== null).length;

  const ref = linhas.find((l) => l.id === objetivo.referenciaGuia);
  const terco = Math.ceil(comDistancia / 3);
  const validacao = {
    referencia: ref?.nome ?? objetivo.referenciaGuia,
    posicao: ref?.posicao ?? null,
    total: comDistancia,
    texto:
      ref?.posicao == null
        ? `A referência do guia para este objetivo (${ref?.nome ?? objetivo.referenciaGuia}) ficou sem distância: faltam dados para validar.`
        : ref.posicao <= terco
          ? `A referência que o guia cita para "${objetivo.nome}" (${ref.nome}) ficou em ${ref.posicao}º de ${comDistancia}: no terço mais próximo do alvo, como esperado. O método passa nesta verificação.`
          : `A referência que o guia cita para "${objetivo.nome}" (${ref.nome}) ficou em ${ref.posicao}º de ${comDistancia}, fora do terço mais próximo. Para ESTE alvo ela não é a mais parecida nesses critérios — vale revisar os pesos ou escolher outro alvo.`,
  };

  return {
    objetivo: {
      id: objetivo.id,
      nome: objetivo.nome,
      pergunta: objetivo.pergunta,
      naoConcluir: objetivo.naoConcluir,
      camadasAdicionais: objetivo.camadasAdicionais,
      criterios: objetivo.criterios.map((c) => ({
        ...c,
        nome: VARIAVEIS[c.variavel].nome,
        unidade: VARIAVEIS[c.variavel].unidade,
        escala: VARIAVEIS[c.variavel].escala,
        comoMedir: VARIAVEIS[c.variavel].comoMedir,
        fonte: VARIAVEIS[c.variavel].fonte,
      })),
    },
    alvo: { id: local.id, nome: local.nome, corpo: local.corpo, lon: local.lon, lat: local.lat, valores: valoresAlvo, fontes: fontesAlvo },
    formula: FORMULA_DISTANCIA,
    notaPesos: NOTA_PESOS,
    normalizacao: normalizacao.map((n) => ({ ...n, media: r2(n.media), desvio: r2(n.desvio) })),
    linhas,
    candidatoNovo: novo
      ? {
          id: novo.id,
          justificativa: `${novo.nome} é o local sem literatura de análogo mais próximo de ${local.nome} para "${objetivo.nome}" (D = ${novo.distancia!.toLocaleString('pt-BR')}, ${novo.posicao}º de ${comDistancia}). Mais parecido em: ${novo.maisParecidos.join(' e ') || '—'}. Mais diferente em: ${novo.maisDiferente ?? '—'}. É uma HIPÓTESE: precisa de validação em campo antes de ser chamado de análogo.`,
        }
      : null,
    validacao,
    limites: [
      'Distância menor = mais parecido NOS CRITÉRIOS ESCOLHIDOS; não é probabilidade de equivalência.',
      'A padronização usa a média e o desvio dos locais avaliados: incluir ou tirar locais muda os z, mas não a ordem de forma brusca.',
      'Todos os locais são medidos numa janela do tamanho da do alvo, centrada no ponto da ficha; um ponto aproximado pode não ser o melhor trecho da região.',
      'A busca cobre o catálogo (referências da literatura) e 5 áreas do Brasil sem literatura de análogo; não é uma varredura do planeta inteiro.',
    ],
  };
}
