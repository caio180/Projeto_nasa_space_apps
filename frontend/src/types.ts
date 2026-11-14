// Espelho dos tipos que o backend devolve (backend/model/model.ts).
// Se mudar lá, mude aqui. Mais à frente dá para compartilhar num pacote comum,
// mas no protótipo copiar é mais simples.

export type BBox = [number, number, number, number];

// ---- Relevo (POST /api/relevo) ----

export interface EstatisticasRelevo {
  minimo: number;
  maximo: number;
  media: number;
  amplitude: number;
  declividadeMedia: number;
  percentualPlano: number;
  limiarPlanoGraus: number;
  pixelsSemDado: number;
}

export type Corpo = 'Terra' | 'Marte' | 'Lua';

export interface Relevo {
  corpo: Corpo;
  nome?: string;
  descricao?: string;
  gravidade: number; // m/s²
  fonte: string;
  bbox: BBox;
  largura: number;
  altura: number;
  metrosPorPixel: { x: number; y: number };
  /** Resolução nativa do modelo de relevo (m). */
  resolucaoNativa: number;
  /** Elevação em metros, linha a linha a partir do canto noroeste. null = sem dado. */
  elevacoes: (number | null)[];
  estatisticas: EstatisticasRelevo;
  itens: string[];
}

// ---- Locais de Marte e da Lua (GET /api/locais) ----

export interface LocalPlanetario {
  id: string;
  nome: string;
  corpo: Exclude<Corpo, 'Terra'>;
  lon: number;
  lat: number;
  descricao: string;
  ladoKm: number;
  polar: boolean;
  artemis: boolean;
  fonteCoordenada: string | null;
  geologiaAlvo: string;
}

export interface ListaLocais {
  ladoJanelaKm: number;
  gravidade: Record<Corpo, number>;
  locais: LocalPlanetario[];
}

// ---- Análogos terrestres (GET /api/analogos) ----

export type Dimensao =
  | 'geologia'
  | 'relevo'
  | 'temperatura'
  | 'agua-gelo'
  | 'poeira-vento'
  | 'biologia'
  | 'subsolo'
  | 'operacoes';

export interface AnalogoTerrestre {
  id: string;
  nome: string;
  pais: string;
  alvo: Exclude<Corpo, 'Terra'>;
  lon: number;
  lat: number;
  coordenadaAproximada: boolean;
  destaque: boolean;
  jaUsadoComoAnalogo?: string;
  dimensoes: Dimensao[];
  semelhancas: string;
  ondeFalha: string;
  usoNaExploracao: string;
  comparacaoSugerida: string;
  /** 'estudado' = há artigo revisado por pares; 'proposto' = proposta deste projeto. */
  situacao: 'estudado' | 'proposto';
  referencias: { titulo: string; url: string }[];
}

export interface ListaAnalogos {
  dimensoes: Record<Dimensao, string>;
  analogos: AnalogoTerrestre[];
}

// ---- Medidas ambientais (GET /api/ambiente) ----

export interface MedidasAmbientais {
  lon: number;
  lat: number;
  clima: {
    temperaturaMedia: number;
    temperaturaMinima: number;
    temperaturaMaxima: number;
    radiacaoSolar: number;
    vento: number;
    umidade: number;
    precipitacao: number;
    periodo: string;
  } | null;
  temperaturaSuperficie: {
    mediaDia: number;
    mediaNoite: number;
    maximaDia: number;
    minimaNoite: number;
    amostras: number;
    ano: number;
  } | null;
  vegetacao: { ndviMedio: number; ndviMaximo: number; amostras: number; ano: number } | null;
  solo: {
    areia: number | null;
    silte: number | null;
    argila: number | null;
    carbonoOrganico: number | null;
    ph: number | null;
    ctc: number | null;
    densidade: number | null;
    cascalho: number | null;
    semSoloMapeado: boolean;
  } | null;
  geologia: { unidade: string; litologia: string; idade: string; idadeMaximaMa: number | null; referencia: string | null } | null;
  erros: Record<string, string>;
  fontes: { nome: string; url: string; citacao: string }[];
  referencias: {
    fonte: string;
    url: string;
    corpos: Record<Corpo, { pressao: string; temperatura: string; irradiancia: number; gravidade: number }>;
  };
}

// ---- Compatibilidade (GET /api/compatibilidade) ----

export interface DimensaoCompat {
  chave: string;
  nome: string;
  dimensaoDesafio: Dimensao;
  pontuacao: number | null;
  terra: string;
  alvo: string;
  regra: string;
  motivo: string | null;
  fonte: string;
}

export interface ResultadoCompatibilidade {
  terra: { nome: string; lon: number; lat: number };
  alvo: { id: string; nome: string; corpo: string };
  geral: number | null;
  foco: number | null;
  dimensoes: DimensaoCompat[];
  composicaoAlvo: ComposicaoAlvo | null;
  incompatibilidades: { nome: string; pontuacao: number | null; motivo: string }[];
  limitesTerra: { item: string; terra: string; alvo: string; consequencia: string }[];
  metodo: { resumo: string; limiarIncompatibilidade: number; referencias: { titulo: string; url: string }[] };
  equipamentos: AvaliacaoEquipamento[];
  validacao: ValidacaoCientifica;
}

// ---- Validação científica (escala e atmosfera dos sensores) ----

export interface PontoRugosidade {
  baseM: number;
  desvioM: number;
  declivRmsGraus: number;
  pares: number;
}

export interface Rugosidade {
  pontos: PontoRugosidade[];
  hurst: number | null;
}

export interface ValidacaoCientifica {
  passos: { titulo: string; texto: string }[];
  escala: {
    pixelComumM: number;
    nativaTerraM: number;
    nativaAlvoM: number;
    nativaMaisGrossaM: number;
    superamostrado: boolean;
    janelaKm: number;
    texto: string;
  };
  rugosidade: {
    terra: Rugosidade;
    alvo: Rugosidade;
    razoes: { baseM: number; razao: number }[];
    nota: number | null;
    regra: string;
    leitura: string;
  };
  sensores: {
    corpo: Corpo;
    relevo: { produto: string; tecnica: string; nativaM: number };
    foto: { produto: string; faixa: string; pixelNativoM: number };
    atmosfera: string;
    compensacao: string;
  }[];
  limites: string[];
  referencias: { titulo: string; url: string }[];
}

// ---- Equipamentos da NASA nos dois relevos ----

export interface MedidaTerreno {
  transitavel: number; // % da área dentro do limite de declive
  maiorTrechoContinuo: number; // % da área no maior trecho conectado transitável
  declividadeMaxima: number; // graus
  pesoKN: number;
}

export interface AvaliacaoEquipamento {
  id: string;
  nome: string;
  tipo: string;
  declividadeMax: number;
  origemLimite: string;
  obstaculoCm: number | null;
  energia: string;
  testeNaTerra: string;
  fontes: { titulo: string; url: string }[];
  terra: MedidaTerreno;
  alvo: MedidaTerreno;
  razaoPeso: number;
  horasParaCruzar: number | null;
  veredito: 'parecido' | 'terra-mais-dificil' | 'terra-mais-facil';
  explicacao: string;
}

// ---- Foto de satélite da mesma janela do relevo ----

export interface ImagemSatelite {
  corpo: Corpo;
  nome?: string;
  fonte: string;
  instrumento: string;
  datas: string[];
  itens: string[];
  bbox: BBox;
  largura: number;
  altura: number;
  metrosPorPixel: number;
  tipo: 'cor' | 'pancromatica';
  png: string; // data URL
  cobertura: number;
  sol: { elevacao: number; azimute: number } | null;
  /** Terra vista pela câmera de Marte/Lua (média das bandas do Sentinel-2 na faixa da câmera). */
  simulacao: { corpo: 'Marte' | 'Lua'; sensor: string; faixa: string; bandas: string[]; png: string } | null;
  notas: string[];
}

// ---- Composição química do alvo (NASA GRS via PDS) ----

export type Oxido = 'SiO2' | 'Al2O3' | 'FeO' | 'MgO' | 'CaO' | 'TiO2' | 'K2O';

export interface ComposicaoAlvo {
  corpo: 'Marte' | 'Lua';
  fonte: string;
  instrumento: string;
  celula: { latMin: number; latMax: number; lonMin: number; lonMax: number };
  oxidos: Partial<Record<Oxido, number>>;
  incerteza: Partial<Record<Oxido, number>>;
  agua: number | null;
  cloro: number | null;
  torio: number | null;
  notas: string[];
  referencias: { titulo: string; url: string }[];
}

// ---- Objetivos, ranking explicável e passaporte (guia de mentoria) ----

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
  escala: 'linear' | 'log';
  comoMedir: string;
  fonte: string;
}

export interface ObjetivoInfo {
  id: ObjetivoId;
  nome: string;
  pergunta: string;
  criterios: { variavel: VariavelId; peso: number; motivo: string }[];
  naoConcluir: string;
  camadasAdicionais: string[];
  referenciaGuia: string;
}

export interface ListaObjetivos {
  formula: string;
  notaPesos: string;
  variaveis: Record<VariavelId, Variavel>;
  objetivos: ObjetivoInfo[];
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
  contribuicao: number | null;
}

export interface LinhaRanking {
  id: string;
  nome: string;
  pais: string;
  lon: number;
  lat: number;
  papel: 'referencia' | 'candidato';
  origem: 'catalogo' | 'busca';
  referencias: { titulo: string; url: string }[];
  posicao: number | null;
  distancia: number | null;
  cobertura: number;
  parcelas: ParcelaCriterio[];
  ausentes: string[];
  maisParecidos: string[];
  maisDiferente: string | null;
}

export interface ResultadoRanking {
  objetivo: {
    id: ObjetivoId;
    nome: string;
    pergunta: string;
    naoConcluir: string;
    camadasAdicionais: string[];
    criterios: { variavel: VariavelId; peso: number; motivo: string; nome: string; unidade: string; escala: string; comoMedir: string; fonte: string }[];
  };
  alvo: {
    id: string;
    nome: string;
    corpo: string;
    lon: number;
    lat: number;
    valores: Partial<Record<VariavelId, number | null>>;
    fontes: Partial<Record<VariavelId, string>>;
  };
  formula: string;
  notaPesos: string;
  normalizacao: { variavel: VariavelId; media: number; desvio: number; escala: string; n: number }[];
  linhas: LinhaRanking[];
  candidatoNovo: { id: string; justificativa: string } | null;
  validacao: { referencia: string; posicao: number | null; total: number; texto: string };
  limites: string[];
}

export interface CamadaProveniencia {
  camada: string;
  produto: { nome: string; missao: string; url: string; versao: string; licenca: string };
  recorte: { coordenadas: string; epoca: string; referencial: string; area: string };
  qualidade: { resolucao: string; semDado: string; incerteza: string };
}

export interface Passaporte {
  geradoEm: string;
  referencia: {
    alvo: string;
    objetivo: string;
    pergunta: string;
    candidato: string;
    papel: string;
    coordenadas: { lon: number; lat: number };
  };
  metricas: {
    distancia: number | null;
    posicao: number | null;
    total: number;
    formula: string;
    cobertura: string;
    criterios: ParcelaCriterio[];
    resolucao: string;
  };
  evidencias: { camadas: CamadaProveniencia[]; literatura: { titulo: string; url: string }[] };
  diferencas: {
    fisicas: string[];
    doLocal: string[];
    composicao: string;
    criterioMaisDiferente: string | null;
    dadosAusentes: string[];
    gravidadeRazao: number;
  };
  aplicacao: { experimento: string; usoNaExploracao: string | null; naoConcluir: string };
  reprodutibilidade: { rotas: string[]; codigo: string[]; parametros: string };
}
