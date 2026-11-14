// =============================================================================
// MODEL dos análogos terrestres — o coração do desafio:
// "Identify Earth Locations that Analog the Permanent Moon Base Locations and Mars".
//
// Para cada local registramos o que o desafio pede:
//   - em quais DIMENSÕES ele é análogo (as 8 listadas no desafio);
//   - o que é parecido, onde a analogia FALHA e como ele ajuda a exploração;
//   - com qual local de Marte/Lua compará-lo (relevo 3D lado a lado).
//
// A plataforma MEDE relevo, rugosidade, temperatura, vegetação, solo, geologia
// e composição (rotas de ambiente e compatibilidade). O texto de cada ficha
// cita artigos revisados por pares (DOI conferido na Crossref). Locais sem
// literatura que os trate como análogo ficam como "proposto".
// =============================================================================

import type { Corpo } from './planetaModel.ts';

/** As 8 dimensões de analogia listadas em "Potential considerations" do desafio. */
export const DIMENSOES = {
  geologia: 'Geologia e materiais da superfície',
  relevo: 'Relevo, declividade e crateras',
  temperatura: 'Temperatura e extremos ambientais',
  'agua-gelo': 'Água, gelo e permafrost',
  'poeira-vento': 'Poeira, vento e erosão',
  biologia: 'Biologia e habitabilidade',
  subsolo: 'Cavernas e subsolo',
  operacoes: 'Pouso, mobilidade e operações',
} as const;

export type Dimensao = keyof typeof DIMENSOES;

export interface AnalogoTerrestre {
  id: string;
  nome: string;
  pais: string;
  alvo: Exclude<Corpo, 'Terra'>;
  lon: number;
  lat: number;
  /** true = ponto representativo da região, não um sítio de estudo exato. */
  coordenadaAproximada: boolean;
  /** Recomendado como um dos análogos mais fortes do projeto. */
  destaque: boolean;
  /** Já usado como análogo por agências/pesquisas (o desafio pede para ir além desses). */
  jaUsadoComoAnalogo?: string;
  dimensoes: Dimensao[];
  semelhancas: string;
  ondeFalha: string;
  usoNaExploracao: string;
  /** id de um local em GET /api/locais para comparar o relevo. */
  comparacaoSugerida: string;
  /**
   * 'estudado' = há artigo revisado por pares que trata o local como análogo.
   * 'proposto' = não achamos essa literatura: é uma proposta deste projeto,
   * sustentada pelas medidas da plataforma (o desafio pede novos análogos).
   */
  situacao: 'estudado' | 'proposto';
  /** Artigos revisados por pares (DOI conferido na Crossref). */
  referencias: { titulo: string; url: string }[];
}

export const ANALOGOS: AnalogoTerrestre[] = [
  // ------------------------------ MARTE ------------------------------
  {
    id: 'ojos-del-salado',
    nome: 'Ojos del Salado',
    pais: 'Chile / Argentina',
    alvo: 'Marte',
    lon: -68.541,
    lat: -27.109,
    coordenadaAproximada: false,
    destaque: true,
    dimensoes: ['temperatura', 'agua-gelo', 'poeira-vento', 'geologia', 'operacoes'],
    semelhancas:
      'Vulcão de altitude extrema nos Andes: ar rarefeito, frio, muito seco, vento forte e UV intenso, com solo congelado em deserto seco (Kereszturi et al. 2020; Nagy et al. 2020). A altitude e o relevo medidos estão nas tabelas.',
    ondeFalha:
      'Mesmo no topo, a pressão do ar é dezenas de vezes maior que a de Marte, há oxigênio e o campo magnético da Terra protege contra a radiação.',
    usoNaExploracao: 'Testar equipamentos e operações em frio, ar rarefeito e UV alto; estudar permafrost em ambiente seco.',
    comparacaoSugerida: 'utopia',
    situacao: 'estudado',
    referencias: [
      { titulo: "Kereszturi et al. (2020) — Cold, Dry, Windy, and UV Irradiated: Surveying Mars-Relevant Conditions in Ojos del Salado Volcano, Astrobiology", url: 'https://doi.org/10.1089/ast.2019.2165' },
      { titulo: "Nagy et al. (2020) — The Thermal Behavior of Ice-Bearing Ground: The Highest Cold, Dry Desert on Earth as an Analog for Conditions on Mars, Astrobiology", url: 'https://doi.org/10.1089/ast.2018.2021' },
    ],
  },
  {
    id: 'tindouf',
    nome: 'Bacia de Tindouf',
    pais: 'Sul de Marrocos',
    alvo: 'Marte',
    lon: -9.3,
    lat: 28.5,
    coordenadaAproximada: true,
    destaque: true,
    dimensoes: ['geologia', 'poeira-vento', 'agua-gelo'],
    semelhancas:
      'Planícies pedregosas (hamadas) e sedimentos de uma região que secou ao longo do tempo: boa para estudar a química dos solos e a aridificação, como no Marte antigo.',
    ondeFalha:
      'A água sumiu por mudança de clima, não por perda de atmosfera; os solos têm minerais e oxidantes diferentes dos marcianos.',
    usoNaExploracao: 'Treinar análise de solos e a busca por sinais de água antiga com instrumentos de rover.',
    comparacaoSugerida: 'jezero',
    situacao: 'estudado',
    referencias: [
      { titulo: "Oberlin, Claire & Kounaves (2018) — Evaluation of the Tindouf Basin Region in Southern Morocco as an Analogue Site for Soil Geochemistry on Noachian Mars, Astrobiology", url: 'https://doi.org/10.1089/ast.2016.1557' },
    ],
  },
  {
    id: 'rub-al-khali',
    nome: 'Rub’ al Khali',
    pais: 'Arábia Saudita',
    alvo: 'Marte',
    lon: 51.0,
    lat: 20.5,
    coordenadaAproximada: true,
    destaque: true,
    dimensoes: ['poeira-vento', 'relevo', 'temperatura', 'operacoes'],
    semelhancas:
      'Um dos maiores mares de areia do mundo: dunas gigantes, poeira, abrasão pelo vento e hiperaridez. Nas planícies salinas entre as dunas (sabkhas) há tapetes microbianos estudados como análogo de Marte.',
    ondeFalha:
      'Muito quente e com ar denso, o vento move a areia com mais força que em Marte; muitas dunas marcianas são de basalto escuro, não de quartzo.',
    usoNaExploracao:
      'Estudar vida em sais entre dunas; propomos também testar mobilidade de rovers em areia (não achamos estudo publicado de mobilidade aqui).',
    comparacaoSugerida: 'gale',
    situacao: 'estudado',
    referencias: [
      { titulo: "McKay et al. (2016) — An Unusual Inverted Saline Microbial Mat Community in an Interdune Sabkha in the Rub’ al Khali, PLOS ONE", url: 'https://doi.org/10.1371/journal.pone.0150342' },
    ],
  },
  {
    id: 'nefud',
    nome: 'Deserto de Nefud',
    pais: 'Arábia Saudita',
    alvo: 'Marte',
    lon: 41.0,
    lat: 28.3,
    coordenadaAproximada: true,
    destaque: false,
    dimensoes: ['poeira-vento', 'geologia', 'operacoes'],
    semelhancas: 'Dunas avermelhadas por óxido de ferro e solos secos, com processos de vento ativos.',
    ondeFalha: 'Atmosfera densa e quente; a cor vermelha vem de processos com água e ar, diferentes da oxidação marciana.',
    usoNaExploracao: 'Estudar transporte de areia e testar navegação de veículos em campos de dunas.',
    comparacaoSugerida: 'gale',
    situacao: 'proposto',
    referencias: [],
  },
  {
    id: 'uyuni',
    nome: 'Salar de Uyuni',
    pais: 'Bolívia',
    alvo: 'Marte',
    lon: -67.49,
    lat: -20.13,
    coordenadaAproximada: false,
    destaque: false,
    dimensoes: ['geologia', 'agua-gelo', 'operacoes'],
    semelhancas:
      'Salar de altitude muito plano, usado para calibrar satélites (Lamparelli et al. 2003): crostas de sal e salmouras estudadas como análogo das salmouras de Marte (Bhardwaj et al. 2019).',
    ondeFalha: 'Recebe chuva todo ano e fica alagado; os sais marcianos têm outra composição (mais sulfatos e percloratos).',
    usoNaExploracao: 'Calibrar sensores de satélite e treinar a identificação de minerais de evaporação.',
    comparacaoSugerida: 'jezero',
    situacao: 'estudado',
    referencias: [
      { titulo: "Bhardwaj et al. (2019) — UAV Imaging of a Martian Brine Analogue Environment in a Fluvio-Aeolian Setting, Remote Sensing", url: 'https://doi.org/10.3390/rs11182104' },
      { titulo: "Lamparelli et al. (2003) — Characterization of the Salar de Uyuni for in-orbit satellite calibration, IEEE TGRS", url: 'https://doi.org/10.1109/TGRS.2003.810713' },
    ],
  },
  {
    id: 'qaidam',
    nome: 'Bacia de Qaidam',
    pais: 'China',
    alvo: 'Marte',
    lon: 94.0,
    lat: 37.3,
    coordenadaAproximada: true,
    destaque: false,
    dimensoes: ['geologia', 'poeira-vento', 'temperatura'],
    semelhancas: 'Bacia desértica de alta altitude com salares, depressões e vento forte que esculpe o terreno.',
    ondeFalha: 'Atmosfera densa e chuva ocasional; vida presente no solo.',
    usoNaExploracao: 'Estudar erosão pelo vento e sais em clima frio e seco.',
    comparacaoSugerida: 'gale',
    situacao: 'estudado',
    referencias: [
      { titulo: "Xiao et al. (2017) — A new terrestrial analogue site for Mars research: The Qaidam Basin, Tibetan Plateau, Earth-Science Reviews", url: 'https://doi.org/10.1016/j.earscirev.2016.11.003' },
      { titulo: "Anglés & Li (2017) — The western Qaidam Basin as a potential Martian environmental analogue: An overview, JGR Planets", url: 'https://doi.org/10.1002/2017JE005293' },
    ],
  },
  {
    id: 'puna',
    nome: 'Altiplano-Puna (perto do Salar de Arizaro)',
    pais: 'Argentina',
    alvo: 'Marte',
    lon: -67.75,
    lat: -24.7,
    coordenadaAproximada: true,
    destaque: false,
    dimensoes: ['geologia', 'temperatura', 'agua-gelo', 'biologia', 'poeira-vento'],
    semelhancas: 'Combina altitude, aridez, salares, radiação UV alta e atividade geotérmica numa mesma região.',
    ondeFalha:
      'Vizinha do Atacama, que já é muito estudado; tem atmosfera densa e vida microbiana abundante em comparação com Marte.',
    usoNaExploracao: 'Estudar vida em sais sob UV alto e testar instrumentos de busca de bioassinaturas.',
    comparacaoSugerida: 'jezero',
    situacao: 'estudado',
    referencias: [
      { titulo: "Lorenz & Radebaugh (2016) — Dust devils in thin air: Vortex observations at a high-elevation Mars analog site in the Argentinian Puna, GRL", url: 'https://doi.org/10.1002/2015GL067412' },
      { titulo: "Albarracín et al. (2012) — Extremophilic Acinetobacter Strains from High-Altitude Lakes in Argentinean Puna: Remarkable UV-B Resistance, Orig. Life Evol. Biosph.", url: 'https://doi.org/10.1007/s11084-012-9276-3' },
    ],
  },
  {
    id: 'danakil',
    nome: 'Depressão de Danakil (Dallol)',
    pais: 'Etiópia',
    alvo: 'Marte',
    lon: 40.3,
    lat: 14.24,
    coordenadaAproximada: false,
    destaque: false,
    jaUsadoComoAnalogo: 'Estudado como ambiente-limite para a vida.',
    dimensoes: ['biologia', 'geologia', 'temperatura'],
    semelhancas:
      'Abaixo do nível do mar, com fontes hidrotermais muito ácidas e salgadas: um dos ambientes mais extremos para a vida na Terra.',
    ondeFalha: 'Um dos lugares mais quentes da Terra — o oposto do frio marciano. Serve para química e vida, não para clima.',
    usoNaExploracao: 'Estudar os limites da vida e bioassinaturas preservadas em sais, para a busca de vida em Marte.',
    comparacaoSugerida: 'jezero',
    situacao: 'estudado',
    referencias: [
      { titulo: "Cavalazzi et al. (2019) — The Dallol Geothermal Area, Northern Afar (Ethiopia): An Exceptional Planetary Field Analog on Earth, Astrobiology", url: 'https://doi.org/10.1089/ast.2018.1926' },
      { titulo: "Belilla et al. (2019) — Hyperdiverse archaea near life limits at the polyextreme geothermal Dallol area, Nature Ecology & Evolution", url: 'https://doi.org/10.1038/s41559-019-1005-0' },
    ],
  },
  {
    id: 'axel-heiberg',
    nome: 'Ilha de Axel Heiberg',
    pais: 'Canadá',
    alvo: 'Marte',
    lon: -90.77,
    lat: 79.43,
    coordenadaAproximada: false,
    destaque: true,
    jaUsadoComoAnalogo: 'Base de pesquisa no Ártico já usada para estudos de análogos de Marte.',
    dimensoes: ['agua-gelo', 'temperatura', 'biologia', 'operacoes'],
    semelhancas:
      'Ártico com permafrost contínuo e fontes de água salgada que correm mesmo no inverno através do gelo, além de isolamento extremo.',
    ondeFalha: 'Tem atmosfera densa, vegetação e luz do Sol diferente; o frio é menos intenso que o de Marte.',
    usoNaExploracao:
      'Testar perfuração de permafrost e operações isoladas em frio extremo — útil para Marte e também para treinar operações nos polos da Lua.',
    comparacaoSugerida: 'utopia',
    situacao: 'estudado',
    referencias: [
      { titulo: "Andersen et al. (2002) — Cold springs in permafrost on Earth and Mars, JGR Planets", url: 'https://doi.org/10.1029/2000JE001436' },
      { titulo: "Niederberger et al. (2010) — Microbial characterization of a subzero, hypersaline methane seep in the Canadian High Arctic, ISME Journal", url: 'https://doi.org/10.1038/ismej.2010.57' },
    ],
  },

  // ---- Referências conhecidas citadas no guia de mentoria do desafio ----
  {
    id: 'atacama',
    nome: 'Deserto do Atacama (região de Yungay)',
    pais: 'Chile',
    alvo: 'Marte',
    lon: -69.92,
    lat: -24.08,
    coordenadaAproximada: true,
    destaque: false,
    jaUsadoComoAnalogo: 'Referência clássica de aridez para Marte, citada pelo próprio desafio.',
    dimensoes: ['agua-gelo', 'biologia', 'geologia', 'temperatura'],
    semelhancas:
      'Hiperárido: solos com oxidantes e pouquíssima matéria orgânica, perto do limite seco da vida microbiana, como os solos de Marte (Navarro-González et al. 2003).',
    ondeFalha: 'Atmosfera densa, temperatura amena e chuvas raras que ainda acontecem; a radiação e a pressão de Marte não se reproduzem.',
    usoNaExploracao: 'Referência para avaliar aridez e testar instrumentos de busca de bioassinaturas (não equivale a Marte).',
    comparacaoSugerida: 'jezero',
    situacao: 'estudado',
    referencias: [
      {
        titulo: 'Navarro-González et al. (2003) — Mars-Like Soils in the Atacama Desert, Chile, and the Dry Limit of Microbial Life, Science',
        url: 'https://doi.org/10.1126/science.1089143',
      },
    ],
  },
  {
    id: 'haughton',
    nome: 'Cratera de Haughton (Ilha Devon)',
    pais: 'Canadá',
    alvo: 'Marte',
    lon: -89.68,
    lat: 75.38,
    coordenadaAproximada: false,
    destaque: false,
    jaUsadoComoAnalogo: 'Sede do Haughton-Mars Project da NASA, citada pelo próprio desafio.',
    dimensoes: ['geologia', 'relevo', 'temperatura', 'agua-gelo', 'operacoes'],
    semelhancas:
      'Cratera de impacto em deserto polar frio e seco, com permafrost e rochas de impacto expostas; usada há décadas para ciência e operações de análogo de Marte (Lee & Osinski 2005).',
    ondeFalha: 'Tem atmosfera densa, água líquida no verão e campo magnético; o frio é bem menor que o de Marte.',
    usoNaExploracao:
      'Referência geológica (impacto) e operacional: logística e operações de uma base remota (Gralla et al. 2006).',
    comparacaoSugerida: 'jezero',
    situacao: 'estudado',
    referencias: [
      {
        titulo: 'Lee & Osinski (2005) — The Haughton-Mars Project: Overview of science investigations at the Haughton impact structure, Meteoritics & Planetary Science',
        url: 'https://doi.org/10.1111/j.1945-5100.2005.tb00144.x',
      },
      {
        titulo: 'Gralla et al. (2006) — Remote Terrestrial Sites as Operational/Logistics Analogs for Moon/Mars Bases: The Haughton Mars Project, SpaceOps 2006',
        url: 'https://doi.org/10.2514/6.2006-5659',
      },
    ],
  },
  {
    id: 'death-valley',
    nome: 'Vale da Morte (Bacia de Badwater)',
    pais: 'EUA',
    alvo: 'Marte',
    lon: -116.77,
    lat: 36.23,
    coordenadaAproximada: true,
    destaque: false,
    jaUsadoComoAnalogo: 'Referência de terreno desértico para Marte, citada pelo próprio desafio.',
    dimensoes: ['geologia', 'relevo', 'poeira-vento', 'operacoes'],
    semelhancas:
      'Bacia desértica com depósitos de sal e leques aluviais usada em estudos de sensoriamento remoto análogos de Marte (Baldridge et al. 2004); a cratera Ubehebe, ao norte, é análoga de formas marcianas (Eyles & Daurio 2015).',
    ondeFalha: 'Muito quente, com atmosfera densa e chuvas ocasionais; os sais e a poeira têm composição diferente da marciana.',
    usoNaExploracao:
      'Referência para testar mobilidade em terreno desértico e treinar o mapeamento de minerais por satélite. (Não achamos artigo revisado sobre testes de rover aqui; o guia do desafio cita esse histórico.)',
    comparacaoSugerida: 'gale',
    situacao: 'estudado',
    referencias: [
      {
        titulo: 'Baldridge et al. (2004) — Mars remote-sensing analog studies in the Badwater Basin, Death Valley, California, JGR Planets',
        url: 'https://doi.org/10.1029/2004JE002315',
      },
      {
        titulo: 'Eyles & Daurio (2015) — Little Ice Age debris lobes and nivation hollows inside Ubehebe Crater, Death Valley, California: Analog for Mars craters?, Geomorphology',
        url: 'https://doi.org/10.1016/j.geomorph.2015.05.029',
      },
    ],
  },

  // ------------------------------- LUA -------------------------------
  {
    id: 'elgygytgyn',
    nome: 'Cratera El’gygytgyn',
    pais: 'Rússia',
    alvo: 'Lua',
    lon: 172.08,
    lat: 67.5,
    coordenadaAproximada: false,
    destaque: true,
    dimensoes: ['relevo', 'geologia', 'temperatura'],
    semelhancas:
      'Cratera de impacto remota e bem preservada em rocha vulcânica, com rochas de choque e vidros de impacto descritos (Gurov & Koeberl 2004). O tamanho e a forma medidos estão no relevo 3D.',
    ondeFalha: 'Tem um lago no centro e foi moldada por gelo e água; na Lua não há atmosfera nem erosão por água.',
    usoNaExploracao: 'Comparar a forma de crateras de tamanho parecido e treinar a leitura de relevo de impacto.',
    comparacaoSugerida: 'bessel',
    situacao: 'proposto',
    referencias: [
      { titulo: "Gurov & Koeberl (2004) — Shocked rocks and impact glasses from the El’gygytgyn impact structure, Russia, Meteoritics & Planetary Science (geologia da cratera; não a trata como análogo lunar)", url: 'https://doi.org/10.1111/j.1945-5100.2004.tb00124.x' },
    ],
  },
  {
    id: 'ries',
    nome: 'Cratera de Ries',
    pais: 'Alemanha',
    alvo: 'Lua',
    lon: 10.57,
    lat: 48.88,
    coordenadaAproximada: false,
    destaque: false,
    jaUsadoComoAnalogo: 'Astronautas das missões Apollo 14 e 17 treinaram geologia de impacto aqui (Lambert & Reimold 2023).',
    dimensoes: ['geologia', 'relevo'],
    semelhancas:
      'Cratera de impacto com rochas de impacto (suevito) e material ejetado muito estudados (Stöffler et al. 2013), usada como campo de treino de geologia planetária (Lambert & Reimold 2023).',
    ondeFalha: 'Muito erodida e coberta por cidades e campos agrícolas; o relevo original quase sumiu.',
    usoNaExploracao: 'Treinar a identificação de rochas e depósitos de impacto antes de missões lunares.',
    comparacaoSugerida: 'bessel',
    situacao: 'estudado',
    referencias: [
      { titulo: "Lambert & Reimold (2023) — Terrestrial impact sites as field analogs for planetary exploration, Frontiers in Astronomy and Space Sciences", url: 'https://doi.org/10.3389/fspas.2023.1186173' },
      { titulo: "Stöffler et al. (2013) — Ries crater and suevite revisited: Observations and modeling, Part I, Meteoritics & Planetary Science", url: 'https://doi.org/10.1111/maps.12086' },
    ],
  },
  {
    id: 'putorana',
    nome: 'Planalto de Putorana',
    pais: 'Rússia',
    alvo: 'Lua',
    lon: 94.5,
    lat: 69.0,
    coordenadaAproximada: true,
    destaque: false,
    dimensoes: ['geologia', 'relevo', 'temperatura', 'operacoes'],
    semelhancas:
      'Parte das Armadilhas Siberianas: camadas espessas de basalto de enormes derrames de lava, parecidos com os que formaram os mares lunares.',
    ondeFalha: 'Muito recortado por rios e geleiras, enquanto os mares lunares são planos; tem atmosfera e vegetação.',
    usoNaExploracao: 'Estudar basalto em grande escala e testar operações remotas em frio extremo.',
    comparacaoSugerida: 'apollo11',
    situacao: 'proposto',
    referencias: [],
  },
];
