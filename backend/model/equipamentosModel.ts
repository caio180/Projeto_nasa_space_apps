// =============================================================================
// MODEL — como equipamentos da NASA se comportariam no análogo da Terra e no
// local de Marte/Lua, usando o MESMO relevo medido (mesma janela, mesmo pixel).
//
// Para cada veículo:
//   1. % da área com declividade dentro do limite de operação do veículo;
//   2. % da área no MAIOR trecho contínuo transitável (dá para andar de ponta a
//      ponta sem passar por declive proibido?);
//   3. peso na Terra × no alvo (a gravidade muda a carga nas rodas e o atrito);
//   4. energia (solar ou nuclear) e tempo para cruzar a janela.
//
// Os limites vêm de páginas e relatórios da NASA (citados em cada veículo).
// Limitação honesta: o pixel do DEM tem dezenas de metros, então pedras e
// degraus (obstáculos de 20–40 cm) não aparecem — só a declividade é medida.
// =============================================================================

import { GRAVIDADE } from './planetaModel.ts';
import type { Corpo } from './planetaModel.ts';
import { gradeDeclividades } from './relevoModel.ts';
import type { Relevo } from './relevoModel.ts';

export interface Equipamento {
  id: string;
  nome: string;
  corpo: Exclude<Corpo, 'Terra'>;
  tipo: string;
  massaKg: number;
  /** Declividade máxima de operação (graus) usada no cálculo. */
  declividadeMax: number;
  /** De onde vem o limite, em uma frase. */
  origemLimite: string;
  obstaculoCm: number | null;
  velocidadeMh: number; // metros por hora
  energia: string;
  /** O que a NASA faz para testar este tipo de veículo na Terra. */
  testeNaTerra: string;
  fontes: { titulo: string; url: string }[];
}

export const EQUIPAMENTOS: Equipamento[] = [
  {
    id: 'perseverance',
    nome: 'Rover Perseverance',
    corpo: 'Marte',
    tipo: 'Rover científico (6 rodas, suspensão rocker-bogie)',
    massaKg: 1025,
    declividadeMax: 30,
    origemLimite:
      'Projetado para inclinar 45° sem tombar; por segurança, os operadores evitam terrenos que o inclinem mais de 30°.',
    obstaculoCm: 40,
    velocidadeMh: 152,
    energia: 'Nuclear (MMRTG, ~110 W): funciona de dia e de noite, não depende do Sol.',
    testeNaTerra:
      'Para o Curiosity, a NASA montou o "Scarecrow", uma cópia sem computador com ~340 kg — o peso que o rover de 900 kg tem em Marte — e testou nas dunas de Dumont (Califórnia).',
    fontes: [
      {
        titulo: 'NASA — Perseverance: componentes do rover',
        url: 'https://science.nasa.gov/mission/mars-2020-perseverance/rover-components/',
      },
      {
        titulo: 'NASA/JPL — Rover de teste prepara o Curiosity (Scarecrow)',
        url: 'https://www.jpl.nasa.gov/images/pia15682-test-rover-aids-preparations-in-california-for-curiosity-rover-on-mars/',
      },
    ],
  },
  {
    id: 'viper',
    nome: 'Rover VIPER',
    corpo: 'Lua',
    tipo: 'Rover de prospecção de gelo no polo sul (4 rodas, suspensão ativa)',
    massaKg: 450,
    declividadeMax: 15,
    origemLimite: 'Limite de projeto: rampas de 15° e degraus de 20 cm. Acima disso, o risco de patinar aumenta.',
    obstaculoCm: 20,
    velocidadeMh: 720,
    energia: 'Solar com bateria: no polo o Sol fica a ~10° do horizonte, e sombras móveis limitam o trajeto.',
    testeNaTerra:
      'A NASA testou a mobilidade do VIPER em rampas de solo simulado (laboratório SLOPE, Glenn) e o fez escalar obstáculos em pista de testes.',
    fontes: [
      { titulo: 'NASA — VIPER: operações na Lua', url: 'https://science.nasa.gov/mission/viper/lunar-operations/' },
      {
        titulo: 'NASA NTRS — Planejamento de operações do VIPER (SpaceOps 2022)',
        url: 'https://ntrs.nasa.gov/api/citations/20220008301/downloads/2022-06-02-spaceops-viper-planning.pdf',
      },
    ],
  },
  {
    id: 'lrv',
    nome: 'Jipe lunar do Apollo (LRV)',
    corpo: 'Lua',
    tipo: 'Veículo tripulado (Apollo 15, 16 e 17)',
    massaKg: 210,
    declividadeMax: 25,
    origemLimite: 'Subia e descia rampas de 25°, estacionava em 35° e passava por obstáculos de 30 cm.',
    obstaculoCm: 30,
    velocidadeMh: 13_000,
    energia: 'Baterias não recarregáveis: o alcance era limitado pela carga e pela distância de volta a pé.',
    testeNaTerra:
      'Os astronautas treinaram com versões de teste do jipe em campos vulcânicos e de crateras na Terra antes das missões.',
    fontes: [
      {
        titulo: 'NASA SP-4214 — Where No Man Has Gone Before, cap. 13',
        url: 'https://www.nasa.gov/wp-content/uploads/static/history/SP-4214/ch13-3.html',
      },
    ],
  },
];

/** Critério de pouso usado também na compatibilidade (estudos citados lá). */
const POUSO: Record<Exclude<Corpo, 'Terra'>, { graus: number; origem: string }> = {
  Lua: {
    graus: 5,
    origem: 'Faixa de 0–5° usada para o módulo de pouso tripulado do Artemis (Peña-Asensio et al., 2025).',
  },
  Marte: {
    graus: 15,
    origem: 'Declive menor que 15° exigido no workshop da NASA de 2015 para pouso humano em Marte.',
  },
};

export interface MedidaTerreno {
  transitavel: number; // % da área com declive dentro do limite
  maiorTrechoContinuo: number; // % da área no maior pedaço conectado transitável
  declividadeMaxima: number; // graus (maior declive medido na janela)
  pesoKN: number; // peso do veículo neste corpo
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
  /** Quantas vezes o veículo pesa mais na Terra do que no alvo. */
  razaoPeso: number;
  /** Horas para cruzar a janela em linha reta, na velocidade máxima. */
  horasParaCruzar: number | null;
  /** 'parecido' | 'terra-mais-dificil' | 'terra-mais-facil' (pela área transitável). */
  veredito: 'parecido' | 'terra-mais-dificil' | 'terra-mais-facil';
  explicacao: string;
}

const r1 = (n: number) => Math.round(n * 10) / 10;

/** Maior região conectada (vizinhança de 4) dos pixels marcados, em nº de pixels. */
function maiorRegiao(ok: Uint8Array, largura: number, altura: number) {
  const visitado = new Uint8Array(ok.length);
  const pilha: number[] = [];
  let maior = 0;
  for (let inicio = 0; inicio < ok.length; inicio++) {
    if (!ok[inicio] || visitado[inicio]) continue;
    let tamanho = 0;
    visitado[inicio] = 1;
    pilha.push(inicio);
    while (pilha.length) {
      const i = pilha.pop()!;
      tamanho++;
      const x = i % largura;
      const y = (i - x) / largura;
      const vizinhos = [x > 0 ? i - 1 : -1, x < largura - 1 ? i + 1 : -1, y > 0 ? i - largura : -1, y < altura - 1 ? i + largura : -1];
      for (const v of vizinhos) {
        if (v >= 0 && ok[v] && !visitado[v]) {
          visitado[v] = 1;
          pilha.push(v);
        }
      }
    }
    if (tamanho > maior) maior = tamanho;
  }
  return maior;
}

/** Declividade por pixel de um relevo (calculada uma vez e reaproveitada por todos os veículos). */
function declivesDe(r: Relevo) {
  return gradeDeclividades(r.elevacoes, r.largura, r.altura, r.metrosPorPixel.x, r.metrosPorPixel.y);
}

function medir(declives: (number | null)[], r: Relevo, limite: number, massaKg: number, g: number): MedidaTerreno {
  const ok = new Uint8Array(declives.length);
  let validos = 0;
  let dentro = 0;
  let maximo = 0;
  declives.forEach((d, i) => {
    if (d === null) return;
    validos++;
    if (d > maximo) maximo = d;
    if (d <= limite) {
      dentro++;
      ok[i] = 1;
    }
  });
  const pct = (n: number) => (validos ? r1((100 * n) / validos) : 0);
  return {
    transitavel: pct(dentro),
    maiorTrechoContinuo: pct(maiorRegiao(ok, r.largura, r.altura)),
    declividadeMaxima: r1(maximo),
    pesoKN: Math.round((massaKg * g) / 10) / 100,
  };
}

function veredito(terra: MedidaTerreno, alvo: MedidaTerreno) {
  const diferenca = terra.transitavel - alvo.transitavel;
  if (Math.abs(diferenca) < 10) return 'parecido' as const;
  return diferenca < 0 ? ('terra-mais-dificil' as const) : ('terra-mais-facil' as const);
}

function explicar(e: Pick<Equipamento, 'nome' | 'declividadeMax'>, v: AvaliacaoEquipamento['veredito'], terra: MedidaTerreno, alvo: MedidaTerreno, nomeAlvo: string) {
  const pct = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
  const base = `Com limite de ${e.declividadeMax}°, ${pct(terra.transitavel)}% do análogo e ${pct(alvo.transitavel)}% de ${nomeAlvo} são transitáveis.`;
  if (v === 'parecido') return `${base} O veículo encontraria dificuldade parecida nos dois: bom lugar para ensaiar a rota.`;
  if (v === 'terra-mais-dificil') {
    return `${base} O análogo é mais íngreme que o alvo: serve como teste de pior caso, mas bloqueia parte do trajeto.`;
  }
  return `${base} O análogo é mais suave que o alvo: o teste na Terra seria otimista demais para as rampas de ${nomeAlvo}.`;
}

/** Avalia os veículos do corpo do alvo (mais o módulo de pouso) nos dois relevos. */
export function avaliarEquipamentos(relevoTerra: Relevo, relevoAlvo: Relevo): AvaliacaoEquipamento[] {
  const corpo = relevoAlvo.corpo as Exclude<Corpo, 'Terra'>;
  const nomeAlvo = relevoAlvo.nome ?? corpo;
  const declTerra = declivesDe(relevoTerra);
  const declAlvo = declivesDe(relevoAlvo);
  const ladoKm = (relevoAlvo.largura * relevoAlvo.metrosPorPixel.x) / 1000;

  const pouso: Equipamento = {
    id: 'pouso',
    nome: corpo === 'Lua' ? 'Módulo de pouso tripulado (Artemis)' : 'Módulo de pouso tripulado (Marte)',
    corpo,
    tipo: 'Critério de área de pouso segura',
    massaKg: 0,
    declividadeMax: POUSO[corpo].graus,
    origemLimite: POUSO[corpo].origem,
    obstaculoCm: null,
    velocidadeMh: 0,
    energia: '—',
    testeNaTerra: 'Áreas planas do análogo servem para treinar pouso e montagem da base.',
    fontes: [],
  };

  return [...EQUIPAMENTOS.filter((e) => e.corpo === corpo), pouso].map((e) => {
    const terra = medir(declTerra, relevoTerra, e.declividadeMax, e.massaKg, GRAVIDADE.Terra);
    const alvo = medir(declAlvo, relevoAlvo, e.declividadeMax, e.massaKg, GRAVIDADE[corpo]);
    const v = veredito(terra, alvo);
    return {
      id: e.id,
      nome: e.nome,
      tipo: e.tipo,
      declividadeMax: e.declividadeMax,
      origemLimite: e.origemLimite,
      obstaculoCm: e.obstaculoCm,
      energia: e.energia,
      testeNaTerra: e.testeNaTerra,
      fontes: e.fontes,
      terra,
      alvo,
      razaoPeso: r1(GRAVIDADE.Terra / GRAVIDADE[corpo]),
      horasParaCruzar: e.velocidadeMh > 0 ? r1((ladoKm * 1000) / e.velocidadeMh) : null,
      veredito: v,
      explicacao: explicar(e, v, terra, alvo, nomeAlvo),
    };
  });
}
