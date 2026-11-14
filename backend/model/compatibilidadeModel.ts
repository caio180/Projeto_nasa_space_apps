// =============================================================================
// MODEL da compatibilidade Terra × Marte/Lua.
//
// Como a NASA escolhe locais (pesquisa feita para este projeto):
//   - Artemis III (Lua): ciência, janela de lançamento, terreno adequado,
//     comunicação com a Terra e iluminação; perto de regiões em sombra
//     permanente, que podem guardar gelo (NASA, out/2024).
//   - Uma análise multicritério das regiões Artemis III (Peña-Asensio et al.
//     2024, TOPSIS) usa PESOS IGUAIS no caso-base e declividade de pouso
//     de 0 a 5° para o módulo de pouso (HLS).
//   - Marte (workshop de locais de pouso humano, NASA 2015): declividade < 15°
//     numa escala de 20 m, latitude ±50°, altitude < +2 km, acesso a gelo.
//
// A NASA NÃO publica uma "porcentagem de compatibilidade" de análogos. Este é
// o NOSSO índice, inspirado nesses critérios: cada dimensão medida recebe de
// 0 a 100 por uma regra explícita, e o índice geral é a média com pesos iguais.
// =============================================================================

import type { MedidasAmbientais } from './ambienteModel.ts';
import type { ComposicaoAlvo } from './composicaoModel.ts';
import type { Dimensao } from './analogosModel.ts';
import type { LocalPlanetario } from './planetaModel.ts';
import { ehPolar } from './planetaModel.ts';
import { declividades } from './relevoModel.ts';
import type { Relevo } from './relevoModel.ts';
import { compararRugosidade } from './validacaoModel.ts';

export interface DimensaoCompat {
  chave: 'relevo' | 'rugosidade' | 'pouso' | 'temperatura' | 'agua' | 'biologia' | 'materiais' | 'geologia' | 'quimica';
  nome: string;
  /** Dimensão do desafio a que esta medida pertence (para o "foco do análogo"). */
  dimensaoDesafio: Dimensao;
  pontuacao: number | null; // 0–100; null = sem dado
  terra: string;
  alvo: string;
  regra: string; // como a nota foi calculada
  motivo: string | null; // explicação quando a nota é baixa (ou falta dado)
  fonte: string;
}

export interface LimiteTerra {
  item: string;
  terra: string;
  alvo: string;
  consequencia: string;
}

export interface ResultadoCompatibilidade {
  terra: { nome: string; lon: number; lat: number };
  alvo: { id: string; nome: string; corpo: string };
  geral: number | null;
  /** Média só das dimensões que o análogo declara como foco. */
  foco: number | null;
  dimensoes: DimensaoCompat[];
  /** Química medida no alvo (GRS da NASA), para mostrar lado a lado. */
  composicaoAlvo: ComposicaoAlvo | null;
  incompatibilidades: { nome: string; pontuacao: number | null; motivo: string }[];
  limitesTerra: LimiteTerra[];
  metodo: { resumo: string; limiarIncompatibilidade: number; referencias: { titulo: string; url: string }[] };
}

export const LIMIAR_INCOMPATIBILIDADE = 50;

const REFERENCIAS = [
  {
    titulo: 'NASA (2024) — NASA Provides Update on Artemis III Moon Landing Regions',
    url: 'https://www.nasa.gov/news-release/nasa-provides-update-on-artemis-iii-moon-landing-regions/',
  },
  {
    titulo: 'Peña-Asensio et al. (2025) — Evaluating potential landing sites for the Artemis III mission using a multi-criteria decision making approach, Acta Astronautica',
    url: 'https://doi.org/10.1016/j.actaastro.2024.10.049',
  },
  {
    titulo: 'NASA (2015) — First Landing Site/Exploration Zone Workshop for Human Missions to Mars',
    url: 'https://www.nasa.gov/wp-content/uploads/2015/06/hls2-2nd-announcement-7-8.pdf',
  },
  {
    titulo: 'Paige et al. (2010) — Diviner Lunar Radiometer Observations of Cold Traps in the Moon’s South Polar Region, Science',
    url: 'https://doi.org/10.1126/science.1187726',
  },
  { titulo: 'NASA Planetary Fact Sheets (NSSDC)', url: 'https://nssdc.gsfc.nasa.gov/planetary/factsheet/' },
  {
    titulo: 'Shepard et al. (2001) — The roughness of natural terrain: a planetary and remote sensing perspective, JGR',
    url: 'https://doi.org/10.1029/2000JE001429',
  },
];

// --------------------------- utilidades ---------------------------

const limitar = (x: number) => Math.max(0, Math.min(1, x));
const pct = (x: number) => Math.round(limitar(x) * 100);
const f = (n: number, casas = 1) => n.toLocaleString('pt-BR', { maximumFractionDigits: casas });

/** Faixas de declividade (graus) do histograma. */
const FAIXAS = [0, 2, 5, 10, 15, 30, 90];

function histograma(decl: number[]) {
  const h = new Array(FAIXAS.length - 1).fill(0);
  for (const d of decl) {
    const i = FAIXAS.findIndex((lim, k) => k > 0 && d < lim);
    h[(i === -1 ? FAIXAS.length - 1 : i) - 1]++;
  }
  return h.map((n) => (decl.length ? n / decl.length : 0));
}

function declDoRelevo(r: Relevo) {
  return declividades(r.elevacoes, r.largura, r.altura, r.metrosPorPixel.x, r.metrosPorPixel.y);
}

/** Faixa de temperatura de referência do alvo (°C). */
export function faixaTermica(local: LocalPlanetario) {
  if (local.corpo === 'Marte') {
    return { min: -89, max: -31, texto: 'de −89 a −31 °C (local da Viking 1, NASA Fact Sheet)' };
  }
  if (ehPolar(local.lat)) {
    return {
      min: -244,
      max: 117,
      texto: 'de −244 °C nas crateras em sombra permanente (Diviner, Paige et al. 2010) a +117 °C no equador lunar',
    };
  }
  return { min: -178, max: 117, texto: 'de −178 a +117 °C no equador (NASA Fact Sheet)' };
}

/** Classifica a rocha descrita pelo Macrostrat. */
function classificarRocha(texto: string) {
  const t = texto.toLowerCase();
  if (/anorthosite/.test(t)) return 'anortosito';
  if (/basalt|basaltic|mafic|gabbro|diabase|dolerite/.test(t)) return 'basalto';
  if (/sediment|sand|silt|mud|clay|shale|evaporit|carbonate|limestone|dolomite|conglomerate|eolian|alluvi|playa/.test(t)) {
    return 'sedimentar';
  }
  if (/volcanic|igneous|extrusive|rhyolit|andesit|tuff|dacite|granit|plutonic|felsic/.test(t)) return 'ignea-outra';
  if (/metamorph|gneiss|schist|quartzite/.test(t)) return 'metamorfica';
  return 'desconhecida';
}

/**
 * Classifica cada litologia e escolhe a família mais citada. Empate: vence a
 * que aparece primeiro. Ignora textos que não dizem o tipo de rocha.
 */
function classificarPorMaioria(textos: string[]) {
  const contagem = new Map<string, number>();
  for (const t of textos) {
    const tipo = classificarRocha(t ?? '');
    if (tipo !== 'desconhecida') contagem.set(tipo, (contagem.get(tipo) ?? 0) + 1);
  }
  let melhor = 'desconhecida';
  let max = 0;
  for (const [tipo, n] of contagem) if (n > max) [melhor, max] = [tipo, n];
  return melhor;
}

// --------------------------- cálculo principal ---------------------------

export function calcularCompatibilidade(entrada: {
  nomeTerra: string;
  lon: number;
  lat: number;
  dimensoesFoco: Dimensao[];
  relevoTerra: Relevo;
  relevoAlvo: Relevo;
  ambiente: MedidasAmbientais;
  local: LocalPlanetario;
  composicaoAlvo: ComposicaoAlvo | null;
}): ResultadoCompatibilidade {
  const { relevoTerra: rt, relevoAlvo: ra, ambiente: amb, local } = entrada;
  const corpo = local.corpo;
  const deCorpo = corpo === 'Lua' ? 'da Lua' : 'de Marte'; // concordância em português
  const emCorpo = corpo === 'Lua' ? 'na Lua' : 'em Marte';
  const dims: DimensaoCompat[] = [];

  // 1. RELEVO — formato do terreno (histograma de declividade + amplitude)
  const dT = declDoRelevo(rt);
  const dA = declDoRelevo(ra);
  const hT = histograma(dT);
  const hA = histograma(dA);
  const sobreposicao = hT.reduce((s, v, i) => s + Math.min(v, hA[i]), 0);
  const ampT = rt.estatisticas.amplitude;
  const ampA = ra.estatisticas.amplitude;
  const razaoAmp = Math.max(ampT, ampA) > 0 ? Math.min(ampT, ampA) / Math.max(ampT, ampA) : 1;
  const notaRelevo = Math.round(70 * sobreposicao + 30 * razaoAmp);
  const maisIngreme = rt.estatisticas.declividadeMedia > ra.estatisticas.declividadeMedia;
  dims.push({
    chave: 'relevo',
    nome: 'Relevo (forma do terreno)',
    dimensaoDesafio: 'relevo',
    pontuacao: notaRelevo,
    terra: `declividade média ${f(rt.estatisticas.declividadeMedia)}°, amplitude ${f(ampT, 0)} m`,
    alvo: `declividade média ${f(ra.estatisticas.declividadeMedia)}°, amplitude ${f(ampA, 0)} m`,
    regra:
      '70% = sobreposição das distribuições de declividade (faixas 0–2, 2–5, 5–10, 10–15, 15–30, >30°) + 30% = razão entre as amplitudes. Mesma janela e mesmo pixel nos dois lados.',
    motivo:
      notaRelevo < LIMIAR_INCOMPATIBILIDADE
        ? `O terreno na Terra é ${maisIngreme ? 'mais íngreme' : 'mais plano'} que em ${local.nome}: ${f(rt.estatisticas.declividadeMedia)}° contra ${f(ra.estatisticas.declividadeMedia)}° de declividade média, e ${f(ampT, 0)} m contra ${f(ampA, 0)} m de amplitude. Provável motivo: ${maisIngreme ? 'relevo montanhoso, vulcânico ou recortado por rios e gelo na Terra' : 'a Terra é uma planície/bacia, enquanto o alvo tem cratera, montanha ou encosta'}.`
        : null,
    fonte: 'Copernicus DEM × USGS (CTX/Kaguya)',
  });

  // 1b. RUGOSIDADE MULTIESCALA — compensa a diferença de escala: compara o
  //     desvio de altura nas MESMAS distâncias (1, 2, 4, 8… pixels), não numa só.
  const rug = compararRugosidade(rt, ra, local.nome);
  const textoRug = (pontos: { baseM: number; desvioM: number }[], hurst: number | null) =>
    pontos.length
      ? `${f(pontos[0].desvioM)} m a ${f(pontos[0].baseM, 0)} m · ${f(pontos[pontos.length - 1].desvioM, 0)} m a ${f(pontos[pontos.length - 1].baseM / 1000)} km${hurst !== null ? ` · Hurst ${f(hurst, 2)}` : ''}`
      : 'sem dado';
  dims.push({
    chave: 'rugosidade',
    nome: 'Rugosidade em várias escalas',
    dimensaoDesafio: 'relevo',
    pontuacao: rug.nota,
    terra: textoRug(rug.terra.pontos, rug.terra.hurst),
    alvo: textoRug(rug.alvo.pontos, rug.alvo.hurst),
    regra: rug.regra,
    motivo:
      rug.nota === null
        ? 'Sem pontos suficientes com dado para medir a rugosidade nas mesmas distâncias.'
        : rug.nota < LIMIAR_INCOMPATIBILIDADE
          ? `${rug.leitura} Provável motivo: processos diferentes moldaram o terreno (rios, gelo e vulcões na Terra; crateras e vento ${emCorpo}).`
          : null,
    fonte: 'Copernicus DEM × USGS (CTX/Kaguya); método de Shepard et al. 2001',
  });

  // 2. POUSO E OPERAÇÕES — fração da área abaixo do limite de declividade de pouso
  const limitePouso = corpo === 'Lua' ? 5 : 15;
  const aptoT = dT.length ? dT.filter((d) => d < limitePouso).length / dT.length : 0;
  const aptoA = dA.length ? dA.filter((d) => d < limitePouso).length / dA.length : 0;
  const notaPouso = Math.round(100 - Math.abs(aptoT - aptoA) * 100);
  dims.push({
    chave: 'pouso',
    nome: `Pouso e mobilidade (declividade < ${limitePouso}°)`,
    dimensaoDesafio: 'operacoes',
    pontuacao: notaPouso,
    terra: `${f(aptoT * 100, 0)}% da área apta`,
    alvo: `${f(aptoA * 100, 0)}% da área apta`,
    regra: `100 − diferença entre as % de área com declividade abaixo de ${limitePouso}° (${corpo === 'Lua' ? 'limite de 0–5° do módulo de pouso do Artemis III, Peña-Asensio et al. 2025' : 'limite de 15° do workshop de pouso humano em Marte, NASA 2015'}). Testar pouso/mobilidade na Terra só vale se a proporção de terreno apto for parecida.`,
    motivo:
      notaPouso < LIMIAR_INCOMPATIBILIDADE
        ? `Na Terra ${f(aptoT * 100, 0)}% da área ficaria abaixo de ${limitePouso}°, contra ${f(aptoA * 100, 0)}% em ${local.nome}: ${aptoT > aptoA ? 'a Terra é fácil demais para treinar pouso e travessia' : 'a Terra é mais difícil (mais encostas) do que o local alvo'}. Atenção: com pixel de ~${f(rt.metrosPorPixel.x, 0)} m a declividade fica subestimada; a NASA avalia em 5–20 m.`
        : null,
    fonte: 'Copernicus DEM × USGS; critérios NASA/Artemis',
  });

  // 3. TEMPERATURA — quanto da faixa térmica do alvo a Terra cobre
  const faixa = faixaTermica(local);
  const c = amb.clima;
  const lst = amb.temperaturaSuperficie;
  const mins = [c?.temperaturaMinima, lst?.minimaNoite].filter((v): v is number => v !== undefined);
  const maxs = [c?.temperaturaMaxima, lst?.maximaDia].filter((v): v is number => v !== undefined);
  if (mins.length && maxs.length) {
    const tMin = Math.min(...mins);
    const tMax = Math.max(...maxs);
    const inter = Math.max(0, Math.min(tMax, faixa.max) - Math.max(tMin, faixa.min));
    const nota = pct(inter / (faixa.max - faixa.min));
    let motivo: string | null = null;
    if (nota < LIMIAR_INCOMPATIBILIDADE) {
      if (inter === 0 && tMin > faixa.max) {
        motivo = `Mesmo o valor mais frio medido na Terra (${f(tMin)} °C) é ${f(tMin - faixa.max)} °C mais quente que o máximo ${deCorpo} (${f(faixa.max)} °C). Provável motivo: a atmosfera densa e o efeito estufa da Terra seguram o calor.`;
      } else {
        const faltaFrio = tMin > faixa.min ? `faltam os extremos frios (de ${f(faixa.min, 0)} a ${f(tMin, 0)} °C)` : '';
        const faltaCalor = tMax < faixa.max ? `faltam os extremos quentes (de ${f(tMax, 0)} a ${f(faixa.max, 0)} °C)` : '';
        motivo = `A Terra cobre só ${nota}% da faixa térmica ${deCorpo}: ${[faltaFrio, faltaCalor].filter(Boolean).join('; ')}. Provável motivo: ${corpo === 'Lua' ? 'sem atmosfera, a Lua esquenta e esfria muito mais' : 'a atmosfera fina de Marte quase não guarda calor'}.`;
      }
    }
    dims.push({
      chave: 'temperatura',
      nome: 'Temperatura',
      dimensaoDesafio: 'temperatura',
      pontuacao: nota,
      terra: `de ${f(tMin)} a ${f(tMax)} °C (ar e superfície)`,
      alvo: faixa.texto,
      regra: '% da faixa térmica do alvo coberta pela faixa medida na Terra (mínimos e máximos do ar — NASA POWER — e da superfície — NASA MODIS).',
      motivo,
      fonte: 'NASA POWER, NASA MODIS, NASA Fact Sheets, Diviner',
    });
  } else {
    dims.push({
      chave: 'temperatura',
      nome: 'Temperatura',
      dimensaoDesafio: 'temperatura',
      pontuacao: null,
      terra: 'indisponível',
      alvo: faixa.texto,
      regra: '% da faixa térmica do alvo coberta pela Terra.',
      motivo: `Sem dado de temperatura: ${amb.erros.clima ?? amb.erros.temperaturaSuperficie ?? 'fonte indisponível'}.`,
      fonte: 'NASA POWER, NASA MODIS',
    });
  }

  // 4. ÁGUA — aridez (em Marte e na Lua não há chuva nem água líquida estável)
  if (c) {
    const nota = pct(1 - c.precipitacao / 2);
    dims.push({
      chave: 'agua',
      nome: 'Aridez (água líquida)',
      dimensaoDesafio: 'agua-gelo',
      pontuacao: nota,
      terra: `${f(c.precipitacao, 2)} mm de chuva por dia (~${f(c.precipitacao * 365, 0)} mm/ano), umidade ${f(c.umidade, 0)}%`,
      alvo:
        entrada.composicaoAlvo?.agua != null
          ? `sem chuva; ${f(entrada.composicaoAlvo.agua)}% de H₂O (gelo/minerais hidratados) no subsolo raso — Odyssey GRS`
          : 'sem chuva; água só como gelo (ou vapor rarefeito)',
      regra: '100 com 0 mm/dia de chuva, caindo linearmente até 0 com 2 mm/dia ou mais (NASA POWER).',
      motivo:
        nota < LIMIAR_INCOMPATIBILIDADE
          ? `Chove em média ~${f(c.precipitacao * 365, 0)} mm por ano. Provável motivo: clima úmido; água líquida altera rochas e solos de um jeito que não acontece hoje ${emCorpo}.`
          : null,
      fonte: 'NASA POWER',
    });
  }

  // 5. BIOLOGIA — vegetação (NDVI)
  const v = amb.vegetacao;
  if (v) {
    const nota = pct((0.5 - v.ndviMedio) / 0.4);
    dims.push({
      chave: 'biologia',
      nome: 'Ausência de vida visível (vegetação)',
      dimensaoDesafio: 'biologia',
      pontuacao: nota,
      terra: `NDVI médio ${f(v.ndviMedio, 2)}`,
      alvo: 'nenhuma vegetação',
      regra: '100 com NDVI ≤ 0,1 (sem vegetação), caindo linearmente até 0 com NDVI ≥ 0,5 (NASA MODIS).',
      motivo:
        nota < LIMIAR_INCOMPATIBILIDADE
          ? `Há vegetação (NDVI ${f(v.ndviMedio, 2)}). Provável motivo: chuva e solo fértil permitem plantas ou agricultura — a superfície não representa um ambiente estéril.`
          : null,
      fonte: 'NASA MODIS',
    });
  }

  // 6. MATERIAIS — matéria orgânica no solo (regolito não tem)
  const s = amb.solo;
  if (s) {
    const nota = s.semSoloMapeado || s.carbonoOrganico === null ? 100 : pct((50 - s.carbonoOrganico) / 45);
    dims.push({
      chave: 'materiais',
      nome: 'Solo sem matéria orgânica',
      dimensaoDesafio: 'geologia',
      pontuacao: nota,
      terra: s.semSoloMapeado ? 'sem solo mapeado (rocha exposta, gelo ou água)' : `${f(s.carbonoOrganico ?? 0)} g/kg de carbono orgânico`,
      alvo: 'regolito sem matéria orgânica',
      regra: '100 com ≤ 5 g/kg de carbono orgânico (ou rocha exposta), caindo até 0 com ≥ 50 g/kg (ISRIC SoilGrids).',
      motivo:
        nota < LIMIAR_INCOMPATIBILIDADE
          ? `O solo tem ${f(s.carbonoOrganico ?? 0)} g/kg de carbono orgânico. Provável motivo: plantas e microrganismos (ou turfa em clima frio e úmido) acumulam matéria orgânica, que não existe no regolito ${deCorpo}.`
          : null,
      fonte: 'ISRIC SoilGrids',
    });
  }

  // 7. GEOLOGIA — tipo de rocha
  const g = amb.geologia;
  const tipoRocha = g ? classificarPorMaioria([...(g.litologias ?? []), g.unidade]) : 'desconhecida';
  if (g && tipoRocha === 'desconhecida') {
    // A fonte só informa a idade (ex.: "Pleistocene"): não dá para julgar — fica "sem dado".
    dims.push({
      chave: 'geologia',
      nome: 'Tipo de rocha',
      dimensaoDesafio: 'geologia',
      pontuacao: null,
      terra: [g.unidade, g.idade].filter(Boolean).join(' · ') || 'não informado',
      alvo: local.geologiaAlvo.descricao,
      regra: '—',
      motivo: 'Sem dado: o Macrostrat informa só a idade da unidade neste ponto, não o tipo de rocha.',
      fonte: 'Macrostrat',
    });
  } else if (g) {
    const texto = `${g.litologia} ${g.unidade}`;
    const tipo = tipoRocha;
    const alvoCat = local.geologiaAlvo.categoria;
    const nota =
      tipo === alvoCat
        ? 100
        : (alvoCat !== 'sedimentar' && ['basalto', 'anortosito', 'ignea-outra'].includes(tipo)) ||
            (alvoCat === 'sedimentar' && tipo === 'ignea-outra' && /tuff|volcaniclastic/i.test(texto))
          ? 50
          : 0;
    dims.push({
      chave: 'geologia',
      nome: 'Tipo de rocha',
      dimensaoDesafio: 'geologia',
      pontuacao: nota,
      terra: [g.litologia, g.idade].filter(Boolean).join(' · ') || g.unidade,
      alvo: local.geologiaAlvo.descricao,
      regra: '100 = mesma família (basalto, anortosito ou sedimentar); 50 = rocha ígnea de outro tipo; 0 = família diferente (Macrostrat, mapa em escala regional).',
      motivo:
        nota < LIMIAR_INCOMPATIBILIDADE
          ? `A rocha mapeada na Terra (${g.litologia || g.unidade}) não é da família esperada em ${local.nome} (${local.geologiaAlvo.descricao}). Provável motivo: ${alvoCat === 'sedimentar' ? 'o alvo foi moldado por água antiga e sedimentos' : 'o alvo é crosta vulcânica/primitiva'}, enquanto o ponto terrestre tem outra história geológica. O mapa é regional: pode haver afloramentos parecidos por perto.`
          : null,
      fonte: 'Macrostrat',
    });
  }

  // 8. QUÍMICA (óxidos) — o alvo tem dado medido (GRS); falta a química de rochas da Terra
  //    no mesmo formato. Mostramos como pendente em vez de estimar.
  const ca = entrada.composicaoAlvo;
  dims.push({
    chave: 'quimica',
    nome: 'Composição química (óxidos)',
    dimensaoDesafio: 'geologia',
    pontuacao: null,
    terra: 'pendente — química de rochas da Terra ainda não integrada',
    alvo: ca
      ? Object.entries(ca.oxidos)
          .map(([k, v]) => `${k} ${f(v as number)}%`)
          .join(', ')
      : 'indisponível',
    regra: 'Comparação óxido a óxido (SiO₂, FeO, TiO₂, Al₂O₃, MgO, CaO, K₂O) entre amostras de rocha da Terra e o espectrômetro de raios gama do alvo.',
    motivo:
      'Pendente: o alvo já tem química medida pela NASA (GRS), mas a química de rochas da Terra (EarthChem) só sai por exportação com e-mail e token, ainda não integrada. A plataforma não estima esse valor para não passar falsa precisão.',
    fonte: ca ? ca.fonte : 'NASA PDS (GRS)',
  });

  // Falhas de fonte viram linhas "sem dado" para o usuário entender o que faltou.
  const esperadas: [DimensaoCompat['chave'], string, Dimensao, string, string][] = [
    ['agua', 'Aridez (água líquida)', 'agua-gelo', 'clima', 'NASA POWER'],
    ['biologia', 'Ausência de vida visível (vegetação)', 'biologia', 'vegetacao', 'NASA MODIS'],
    ['materiais', 'Solo sem matéria orgânica', 'geologia', 'solo', 'ISRIC SoilGrids'],
    ['geologia', 'Tipo de rocha', 'geologia', 'geologia', 'Macrostrat'],
  ];
  for (const [chave, nome, dimensaoDesafio, fonteErro, fonte] of esperadas) {
    if (dims.some((d) => d.chave === chave)) continue;
    dims.push({
      chave,
      nome,
      dimensaoDesafio,
      pontuacao: null,
      terra: 'indisponível',
      alvo: '—',
      regra: '—',
      motivo: `Sem dado: ${amb.erros[fonteErro] ?? `${fonte} indisponível`}.`,
      fonte,
    });
  }

  // --------------------------- índices ---------------------------
  const notas = dims.filter((d) => d.pontuacao !== null).map((d) => d.pontuacao!);
  const geral = notas.length ? Math.round(notas.reduce((a, b) => a + b, 0) / notas.length) : null;
  const notasFoco = dims
    .filter((d) => d.pontuacao !== null && entrada.dimensoesFoco.includes(d.dimensaoDesafio))
    .map((d) => d.pontuacao!);
  const foco = notasFoco.length ? Math.round(notasFoco.reduce((a, b) => a + b, 0) / notasFoco.length) : null;

  const incompatibilidades = dims
    .filter((d) => d.motivo && (d.pontuacao === null || d.pontuacao < LIMIAR_INCOMPATIBILIDADE))
    .sort((a, b) => (a.pontuacao ?? 101) - (b.pontuacao ?? 101))
    .map((d) => ({ nome: d.nome, pontuacao: d.pontuacao, motivo: d.motivo! }));

  // Limites que NENHUM lugar da Terra reproduz (não entram na média).
  const limitesTerra: LimiteTerra[] = [
    {
      item: 'Pressão do ar',
      terra: '1.014 mb',
      alvo: corpo === 'Marte' ? '6,36 mb' : '~3 × 10⁻¹⁵ bar (vácuo)',
      consequencia:
        corpo === 'Marte'
          ? 'Poeira, calor e pouso se comportam diferente; testes de equipamento exigem câmaras de baixa pressão.'
          : 'No vácuo não há convecção nem paraquedas; testes exigem câmaras de vácuo.',
    },
    {
      item: 'Gravidade',
      terra: '9,82 m/s²',
      alvo: corpo === 'Marte' ? '3,73 m/s²' : '1,62 m/s²',
      consequencia: 'O mesmo terreno exige menos força para subir, mas a tração e o assentamento de poeira mudam.',
    },
    {
      item: 'Radiação',
      terra: 'atmosfera e campo magnético protegem',
      alvo: corpo === 'Marte' ? 'atmosfera fina, sem campo magnético global' : 'sem atmosfera nem campo magnético',
      consequencia: 'Bases precisam de blindagem (regolito, tubos de lava) que não se testa ao ar livre na Terra.',
    },
  ];

  return {
    terra: { nome: entrada.nomeTerra, lon: entrada.lon, lat: entrada.lat },
    alvo: { id: local.id, nome: local.nome, corpo },
    geral,
    foco,
    dimensoes: dims,
    composicaoAlvo: entrada.composicaoAlvo,
    incompatibilidades,
    limitesTerra,
    metodo: {
      resumo:
        'Média simples (pesos iguais) das dimensões medidas, cada uma de 0 a 100 pela regra indicada. Pesos iguais seguem o caso-base da análise multicritério das regiões do Artemis III (Peña-Asensio et al. 2025). "Foco do análogo" usa só as dimensões que o análogo declara. Não é um índice oficial da NASA: é a metodologia deste projeto, aberta para revisão. Limites físicos (pressão, gravidade, radiação) não entram na média porque nenhum lugar da Terra os reproduz. Escala e atmosfera dos sensores: as notas de terreno usam o mesmo pixel nos dois lados (nunca mais fino que o sensor mais grosso), comparam a rugosidade em várias escalas e vêm só da altimetria, que não depende da atmosfera — veja "Validação científica".',
      limiarIncompatibilidade: LIMIAR_INCOMPATIBILIDADE,
      referencias: REFERENCIAS,
    },
  };
}
