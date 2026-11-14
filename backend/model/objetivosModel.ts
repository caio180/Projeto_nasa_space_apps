// =============================================================================
// MODEL — objetivos de teste e o índice explicável de similaridade.
//
// "Não existe um percentual universal de 'parecido com Marte'": a similaridade
// depende do OBJETIVO do teste. Para cada objetivo escolhemos as variáveis que
// importam (com peso e motivo), padronizamos todas na mesma escala e medimos a
// DISTÂNCIA PONDERADA entre o candidato da Terra e o alvo:
//
//     D = √( Σ wᵢ · (z_Terra,i − z_Alvo,i)² / Σ wᵢ )
//
//   z  = valor padronizado: (valor − média) ÷ desvio-padrão, com média e desvio
//        calculados sobre TODOS os candidatos da Terra avaliados (o alvo usa a
//        mesma média e o mesmo desvio, para ficar no mesmo referencial);
//   wᵢ = peso da variável no objetivo (definido pela equipe, motivo escrito);
//   ausentes não viram nota: saem da soma, e os pesos que sobram se ajustam.
//
// Distância MENOR = mais parecido NOS CRITÉRIOS ESCOLHIDOS. Não é uma
// probabilidade de equivalência.
// =============================================================================

import { AppError } from './model.ts';
import type { Corpo } from './planetaModel.ts';

export type ObjetivoId = 'rover' | 'astrobiologia' | 'base';

export type VariavelId =
  | 'declividadeMedia'
  | 'transitavel'
  | 'pouso'
  | 'rugosidade250'
  | 'rugosidade1km'
  | 'hurst'
  | 'precipitacao'
  | 'ndvi'
  | 'carbono'
  | 'tempMinima';

export interface Variavel {
  id: VariavelId;
  nome: string;
  unidade: string;
  /** 'log' = padroniza o log₁₀ (grandezas que variam por fatores, como a rugosidade). */
  escala: 'linear' | 'log';
  comoMedir: string;
  fonte: string;
}

export const VARIAVEIS: Record<VariavelId, Variavel> = {
  declividadeMedia: {
    id: 'declividadeMedia',
    nome: 'Declividade média',
    unidade: '°',
    escala: 'linear',
    comoMedir: 'Média da declividade por diferenças centrais, na janela e pixel comuns.',
    fonte: 'Copernicus DEM GLO-30 × USGS (CTX/Kaguya)',
  },
  transitavel: {
    id: 'transitavel',
    nome: 'Área transitável pelo rover de referência',
    unidade: '%',
    escala: 'linear',
    comoMedir: '% da área com declividade ≤ 30° (Perseverance, Marte) ou ≤ 15° (VIPER, Lua).',
    fonte: 'Relevo medido + limites publicados pela NASA',
  },
  pouso: {
    id: 'pouso',
    nome: 'Área apta para pouso',
    unidade: '%',
    escala: 'linear',
    comoMedir: '% da área com declividade < 5° (Lua, Artemis) ou < 15° (Marte, workshop NASA 2015).',
    fonte: 'Relevo medido + Peña-Asensio et al. 2025; NASA 2015',
  },
  rugosidade250: {
    id: 'rugosidade250',
    nome: 'Rugosidade a 250 m',
    unidade: 'm',
    escala: 'log',
    comoMedir: 'Desvio RMS de altura entre pontos a 250 m (interpolado na curva multiescala; Shepard et al. 2001).',
    fonte: 'Relevo medido',
  },
  rugosidade1km: {
    id: 'rugosidade1km',
    nome: 'Rugosidade a 1 km',
    unidade: 'm',
    escala: 'log',
    comoMedir: 'Desvio RMS de altura entre pontos a 1 km (mesmo método).',
    fonte: 'Relevo medido',
  },
  hurst: {
    id: 'hurst',
    nome: 'Expoente de Hurst',
    unidade: '',
    escala: 'linear',
    comoMedir: 'Inclinação da curva log(desvio) × log(distância): como a rugosidade cresce com a escala.',
    fonte: 'Relevo medido',
  },
  precipitacao: {
    id: 'precipitacao',
    nome: 'Chuva (aridez)',
    unidade: 'mm/dia',
    escala: 'linear',
    comoMedir: 'Precipitação média anual da climatologia. Alvo: 0 (sem chuva em Marte e na Lua).',
    fonte: 'NASA POWER',
  },
  ndvi: {
    id: 'ndvi',
    nome: 'Vegetação (NDVI)',
    unidade: '',
    escala: 'linear',
    comoMedir: 'NDVI médio do ano. Alvo: 0 (sem vegetação).',
    fonte: 'NASA MODIS MOD13Q1',
  },
  carbono: {
    id: 'carbono',
    nome: 'Carbono orgânico do solo',
    unidade: 'g/kg',
    escala: 'linear',
    comoMedir: 'Carbono orgânico de 0–5 cm. Alvo: 0 (o regolito não tem solo orgânico como o da Terra).',
    fonte: 'ISRIC SoilGrids 2.0',
  },
  tempMinima: {
    id: 'tempMinima',
    nome: 'Temperatura mínima',
    unidade: '°C',
    escala: 'linear',
    comoMedir: 'Menor valor entre o ar (POWER) e a superfície à noite (MODIS). Alvo: mínimo de referência do corpo.',
    fonte: 'NASA POWER, NASA MODIS; NASA Fact Sheets e Diviner para o alvo',
  },
};

export interface CriterioObjetivo {
  variavel: VariavelId;
  peso: number;
  motivo: string;
}

export interface Objetivo {
  id: ObjetivoId;
  nome: string;
  pergunta: string;
  criterios: CriterioObjetivo[];
  /** O que NÃO concluir a partir deste índice (página "Como medir a analogia" do guia). */
  naoConcluir: string;
  /** Camadas que ajudam a interpretar, mas não entram na conta (sem escala comum). */
  camadasAdicionais: string[];
  /** Referência conhecida citada pelo guia para este tipo de teste (validação do ranking). */
  referenciaGuia: string;
  experimento: (corpo: Exclude<Corpo, 'Terra'>, alvo: string, candidato: string) => string;
}

const QUEM_DEFINIU = 'Pesos definidos pela equipe NASACODE a partir do guia de mentoria do desafio e dos limites NASA citados.';

export const OBJETIVOS: Record<ObjetivoId, Objetivo> = {
  rover: {
    id: 'rover',
    nome: 'Navegação de rovers',
    pergunta: 'O terreno exige do rover o mesmo esforço que o terreno do alvo?',
    criterios: [
      { variavel: 'transitavel', peso: 3, motivo: 'Define por onde o rover consegue andar.' },
      { variavel: 'declividadeMedia', peso: 3, motivo: 'Inclinação típica que motores e tração enfrentam.' },
      { variavel: 'rugosidade250', peso: 3, motivo: 'Irregularidade na escala de uma travessia diária.' },
      { variavel: 'rugosidade1km', peso: 2, motivo: 'Irregularidade na escala de planejamento de rota.' },
      { variavel: 'hurst', peso: 1, motivo: 'Mesmo tipo de terreno (como a rugosidade muda com a escala).' },
    ],
    naoConcluir: 'Semelhança visual não comprova navegabilidade; pedras e degraus menores que o pixel não são medidos.',
    camadasAdicionais: ['Fotos de satélite (só visual)', 'Equipamentos da NASA (Perseverance, VIPER, jipe lunar)'],
    referenciaGuia: 'death-valley',
    experimento: (corpo, alvo, candidato) =>
      `Percorrer em ${candidato} uma rota com a mesma distribuição de declives de ${alvo}, com um rover de teste que tenha o mesmo PESO que teria ${corpo === 'Lua' ? 'na Lua' : 'em Marte'} (como o "Scarecrow", a cópia mais leve do Curiosity que a NASA testou nas dunas da Califórnia), medindo patinagem, consumo de energia e tempo por quilômetro.`,
  },
  astrobiologia: {
    id: 'astrobiologia',
    nome: 'Astrobiologia',
    pergunta: 'O ambiente é seco, frio e pobre em matéria orgânica como o do alvo?',
    criterios: [
      { variavel: 'precipitacao', peso: 3, motivo: 'Aridez: a água líquida é o principal fator para a vida e a preservação.' },
      { variavel: 'carbono', peso: 2, motivo: 'Pouca matéria orgânica = bioassinaturas difíceis de achar, como em Marte.' },
      { variavel: 'ndvi', peso: 2, motivo: 'Vegetação esconde o solo e não existe no alvo.' },
      { variavel: 'tempMinima', peso: 1, motivo: 'Frio extremo limita a vida e altera a preservação.' },
    ],
    naoConcluir: 'Solo seco não implica composição marciana igual: a química do alvo (GRS) aparece à parte.',
    camadasAdicionais: ['Geologia (Macrostrat)', 'Composição química do alvo (NASA GRS)', 'Água no subsolo raso de Marte (GRS)'],
    referenciaGuia: 'atacama',
    experimento: (_corpo, alvo, candidato) =>
      `Coletar solo e sais em ${candidato} e testar se instrumentos de busca de bioassinaturas detectam matéria orgânica nas concentrações baixas esperadas em ${alvo}.`,
  },
  base: {
    id: 'base',
    nome: 'Operações de base',
    pergunta: 'O terreno e o frio permitem ensaiar pouso, montagem e operação de uma base como no alvo?',
    criterios: [
      { variavel: 'pouso', peso: 3, motivo: 'Área plana o bastante para pousar e montar módulos.' },
      { variavel: 'declividadeMedia', peso: 2, motivo: 'Acesso entre os módulos e para os veículos.' },
      { variavel: 'tempMinima', peso: 2, motivo: 'Frio extremo testa energia, isolamento e equipamentos.' },
      { variavel: 'rugosidade250', peso: 1, motivo: 'Irregularidade do terreno em volta da base.' },
    ],
    naoConcluir: 'Nenhum lugar da Terra reproduz a gravidade, a pressão ou a radiação do alvo.',
    camadasAdicionais: ['Iluminação (radiação solar, NASA POWER)', 'Limites da Terra (pressão, gravidade, radiação)'],
    referenciaGuia: 'haughton',
    experimento: (corpo, alvo, candidato) =>
      `Montar em ${candidato} um acampamento-teste numa área plana equivalente à de ${alvo}, ensaiando pouso de drones de carga, energia no frio e rotinas da tripulação — sabendo que a gravidade e a pressão ${corpo === 'Lua' ? 'da Lua' : 'de Marte'} não se reproduzem.`,
  },
};

export const FORMULA_DISTANCIA = 'D = √( Σ wᵢ · (z_Terra,i − z_Alvo,i)² / Σ wᵢ )';
export const NOTA_PESOS = QUEM_DEFINIU;

export function obterObjetivo(id: unknown): Objetivo {
  const o = typeof id === 'string' ? OBJETIVOS[id as ObjetivoId] : undefined;
  if (!o) {
    const lista = Object.keys(OBJETIVOS).join(', ');
    throw new AppError(400, `Objetivo inválido. Use: ${lista}.`);
  }
  return o;
}
