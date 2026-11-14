# PlanetMatch — Find the Moon and Mars on Earth

**PlanetMatch** encontra, mede e explica lugares da Terra que servem de **análogo** para bases e pousos na **Lua** e
em **Marte**, usando dados abertos da NASA e de outras agências. Como um app de *match*: para cada lugar da Lua ou de
Marte, ele acha os pares mais parecidos na Terra — e mostra por que combinam e onde não combinam.

> Projeto da equipe **NASACODE** para o NASA Space Apps Challenge 2026, desafio
> [*Identify Earth Locations that Analog the Permanent Moon Base Locations and Mars*](https://www.spaceappschallenge.org/2026/challenges/permanent-moon-base-locations-and-mars/).

---

## Em uma frase

Você escolhe **para que** quer testar (rover, astrobiologia ou base), escolhe **onde** (uma região da Lua ou de Marte),
e o PlanetMatch **mede** vários lugares da Terra com os mesmos critérios, **ordena** os mais parecidos, mostra **por que**
e **onde a analogia falha**, e entrega um **passaporte científico** com todas as fontes.

## O problema

Antes de ir à Lua ou a Marte, a NASA testa equipamentos e métodos em lugares da Terra parecidos — desertos, regiões
polares, vulcões, crateras. Mas:

- nenhum lugar da Terra é igual à Lua ou a Marte em tudo;
- "parecido" depende do teste: um bom lugar para testar um rover pode ser péssimo para buscar sinais de vida;
- muitos análogos foram escolhidos pela aparência, não por medidas comparáveis.

O desafio pede para **identificar e caracterizar análogos — inclusive novos —, explicar o que os torna análogos e o
que não**, usando dados abertos.

## O que o PlanetMatch faz

A tela segue seis passos, nesta ordem: **primeiro a evidência, depois a imersão em 3D**.

| Passo | O que acontece |
|---|---|
| **01 · Objetivo** | Escolha o teste: **navegação de rovers**, **astrobiologia** ou **operações de base**. Cada objetivo mostra os critérios usados, o peso de cada um e o motivo. |
| **02 · Alvo** | Escolha a região: Jezero, Gale ou Utopia (Marte); Apollo 11, Apollo 15, Marius ou Bessel (Lua); Nobile Rim 2 ou Mons Mouton (polo sul da Lua, candidatas do Artemis III). |
| **03 · Busca** | A plataforma mede **20 lugares da Terra** — 15 do catálogo e 5 áreas do Brasil sem estudos de análogo — numa janela do mesmo tamanho da do alvo e com o mesmo tamanho de pixel. |
| **04 · Comparação** | Um **ranking explicável**: a distância de cada lugar ao alvo, o cálculo de cada critério, os dados que faltaram e uma **validação** com uma referência conhecida. |
| **05 · Mapa** | Os candidatos num mapa da NASA, coloridos pela distância ao alvo. Daqui se abre a comparação detalhada, com relevo 3D e fotos de satélite. |
| **06 · Passaporte** | Um resumo científico do lugar escolhido — referência, métricas, evidências, diferenças e o **experimento proposto** —, para baixar em Markdown ou JSON. |

### Por que não existe "% de parecido com Marte"

Não existe um percentual universal de semelhança. O PlanetMatch mede a **distância ponderada** entre o lugar da Terra e o
alvo, **só nos critérios do objetivo escolhido**:

```
D = √( Σ wᵢ · (z_Terra,i − z_Alvo,i)² / Σ wᵢ )
```

- **z** é o valor de cada critério padronizado (valor − média ÷ desvio), calculado sobre os lugares da Terra avaliados;
  o alvo usa a mesma média e o mesmo desvio, para ficar no mesmo referencial.
- **wᵢ** é o peso do critério, definido pela equipe e explicado na tela.
- **Dado ausente não vira nota**: sai da conta e aparece listado.
- **D menor = mais parecido nesses critérios.** Não é probabilidade de que os lugares sejam equivalentes.

### Os três objetivos

| Objetivo | Critérios (peso) | O que **não** concluir |
|---|---|---|
| **Navegação de rovers** | área transitável pelo rover de referência (3), declividade média (3), rugosidade a 250 m (3), rugosidade a 1 km (2), expoente de Hurst (1) | Semelhança visual não comprova navegabilidade; pedras menores que o pixel não são medidas. |
| **Astrobiologia** | chuva / aridez (3), carbono orgânico do solo (2), vegetação — NDVI (2), temperatura mínima (1) | Solo seco não significa composição igual à de Marte. |
| **Operações de base** | área apta para pouso (3), declividade média (2), temperatura mínima (2), rugosidade a 250 m (1) | Nenhum lugar da Terra reproduz a gravidade, a pressão ou a radiação do alvo. |

Os limites de declive vêm de fontes da NASA: rover Perseverance (30°, Marte), rover VIPER (15°, Lua), área de pouso do
Artemis (5°, Lua) e do workshop de pouso humano em Marte (15°).

## Resultados

Cada objetivo tem uma **referência conhecida** citada no guia de mentoria do desafio. Se o método funciona, ela deve
aparecer entre os mais parecidos com o alvo.

| Objetivo × alvo | Referência | Posição dela | Validação | Candidato novo (melhor sem estudos) |
|---|---|---|---|---|
| Astrobiologia × Cratera Jezero (Marte) | Deserto do Atacama | 7º de 20 | ✅ passa | Cratera El’gygytgyn (Rússia) |
| Operações de base × Mons Mouton (Lua, Artemis III) | Cratera de Haughton | 1º de 20 | ✅ passa | Planalto de Putorana (Rússia) |
| Navegação de rovers × Cratera Jezero (Marte) | Vale da Morte | 19º de 20 | ❌ não passa | **Jalapão (TO), Brasil** — 2º de 20 |

- **Por que o Vale da Morte não passou:** o ponto usado fica no salar de Badwater, muito mais plano que Jezero. O
  resultado fica visível na tela; os pesos não foram ajustados para "passar".
- **Contribuição original:** o **Jalapão (TO)** aparece como o candidato sem estudos mais parecido com Jezero para
  testar rovers, logo atrás do Atacama. É uma **hipótese**: precisa de validação em campo antes de ser chamado de
  análogo.

## Como garantimos que a comparação é justa

Os mentores da NASA pediram que o modelo **explique como mede a semelhança** e **compense as diferenças de escala e de
atmosfera** entre os sensores da Terra e os dos planetas.

| Problema | Como o PlanetMatch resolve |
|---|---|
| Os sensores têm resoluções diferentes (Terra 30 m, Marte ~20 m, Lua ~10–35 m) | Mesma área e mesmo pixel nos dois lados, **nunca mais fino que o sensor mais grosso**. Se a grade ficar fina demais, a tela avisa. |
| A inclinação muda conforme a escala em que é medida | **Rugosidade em várias escalas** ([Shepard et al. 2001](https://doi.org/10.1029/2000JE001429)): a variação de altura é comparada na **mesma distância em metros** (117 m, 234 m, 469 m…), não numa escala só. |
| A altitude é medida a partir de referências diferentes (nível do mar, areoide, esfera lunar) | Só usamos medidas relativas: declividade, amplitude e rugosidade. |
| A Terra tem atmosfera densa, Marte tem poeira e a Lua não tem atmosfera | As notas de terreno vêm só do **relevo** (geometria), que névoa e poeira não alteram. |
| As fotos vêm de câmeras diferentes | A foto da Terra (Sentinel-2) já vem sem o efeito da atmosfera, é **simulada na faixa de cor da câmera de Marte ou da Lua** e recebe o mesmo ajuste de contraste. As fotos são só visuais: não entram em nenhuma nota. |
| Nuvens na foto da Terra | Nuvens e sombras são retiradas **pixel a pixel** pela classificação do próprio Sentinel-2 e substituídas por outra data. |
| Buracos nos modelos de Marte e da Lua | No 3D, aparecem em cinza ("sem dado do sensor"); nenhuma medida usa esses pontos. |

## Dados e fontes

Todas as fontes são primárias: agências espaciais, institutos científicos e artigos revisados por pares.

| Para quê | Dado | Fonte |
|---|---|---|
| Relevo da Terra | Copernicus DEM GLO-30 (radar TanDEM-X, 30 m) | ESA/Copernicus, via [Microsoft Planetary Computer](https://planetarycomputer.microsoft.com/dataset/cop-dem-glo-30) |
| Relevo e fotos de Marte | MRO Context Camera — modelos de relevo e ortoimagens | NASA/JPL/MSSS, via [USGS Astrogeology](https://stac.astrogeology.usgs.gov/) |
| Relevo e fotos da Lua | Kaguya Terrain Camera v2 (inclusive o polo sul) | JAXA, via USGS Astrogeology |
| Fotos da Terra | Sentinel-2 L2A (cor verdadeira e bandas para a simulação) | ESA/Copernicus, via Microsoft Planetary Computer |
| Clima | Temperatura, chuva, vento, umidade e radiação solar | [NASA POWER](https://power.larc.nasa.gov/) |
| Vegetação e temperatura da superfície | MODIS MOD13Q1 e MOD11A2 (coleção 6.1) | NASA (LP DAAC / Earthdata) |
| Solo | Textura, pH, carbono orgânico | [ISRIC SoilGrids 2.0](https://soilgrids.org/) (CC-BY 4.0) |
| Tipo de rocha | Mapas geológicos de várias escalas | [Macrostrat](https://macrostrat.org/) (CC-BY 4.0) |
| Química de Marte e da Lua | Espectrômetros de raios gama do Mars Odyssey e do Lunar Prospector | [NASA PDS Geosciences](https://pds-geosciences.wustl.edu/) |
| Mapa | Blue Marble com relevo sombreado | [NASA GIBS](https://www.earthdata.nasa.gov/engage/open-data-services-software/earthdata-developer-portal/gibs-api) (Earthdata) |
| Referências físicas | Gravidade, pressão e temperatura de Terra, Marte e Lua | [NASA Planetary Fact Sheets](https://nssdc.gsfc.nasa.gov/planetary/factsheet/) |
| Limites dos veículos | Perseverance, VIPER e jipe lunar do Apollo | Páginas e relatórios da NASA (citados na tela) |

O passaporte científico de cada lugar registra, para cada camada: produto, missão, endereço, versão, licença, época,
sistema de referência, resolução, pixels sem dado e incerteza.

## Os lugares analisados

Cada lugar tem uma ficha com **o que é parecido**, **onde a analogia falha** e **como ajuda a exploração**, e cita
artigos revisados por pares (DOI conferido na Crossref).

| Situação | Lugares |
|---|---|
| **Referências estudadas na literatura** (12) | Deserto do Atacama, Cratera de Haughton e Vale da Morte (as três citadas no desafio), Ojos del Salado, Bacia de Tindouf, Rub’ al Khali, Salar de Uyuni, Bacia de Qaidam, Altiplano-Puna, Depressão de Danakil, Ilha de Axel Heiberg e Cratera de Ries |
| **Propostos pelo projeto** (3) | Deserto de Nefud, Cratera El’gygytgyn e Planalto de Putorana — nenhum artigo os trata como análogo |
| **Áreas do Brasil na busca** (5) | Raso da Catarina (BA), Jalapão (TO), Lençóis Maranhenses (MA), Vale da Lua (GO) e Chapada Diamantina (BA) — entram só pelas medidas |

Referência geral sobre análogos: [NASA Planetary Analogs](https://science.nasa.gov/solar-system/planetary-analogs/).

## Comparação detalhada (abaixo do ranking)

Ao abrir um candidato, a plataforma mostra lado a lado com o alvo:

- **Notas por critério (0 a 100)**, cada uma com a regra escrita e, quando baixa, o provável motivo;
- **Validação científica**: o gráfico de rugosidade em várias escalas e a compensação de cada sensor;
- **Equipamentos da NASA**: quanto do terreno o Perseverance, o VIPER, o jipe lunar e o módulo de pouso conseguiriam
  percorrer nos dois lugares, e quanto o veículo pesaria a mais na Terra (2,6× em relação a Marte; 6,1× em relação à
  Lua);
- **Composição**: química medida no alvo, com incerteza;
- **Medidas ambientais** do lugar da Terra;
- **Imersão**: relevo 3D com régua de altura real e fotos de satélite da mesma área (com a opção de simular a câmera
  do alvo).

## Limitações

- A busca cobre 20 lugares (catálogo + 5 áreas do Brasil), não o planeta inteiro.
- O pixel do relevo tem dezenas de metros: pedras e degraus menores não são medidos.
- O Copernicus DEM inclui vegetação e construções; os modelos de Marte e da Lua medem o chão.
- A química das rochas da Terra em óxidos ainda não está disponível para comparar com a do alvo: a fonte adequada
  (EarthChem) exige cadastro. A tela mostra "pendente" em vez de estimar.
- Candidatos novos são **hipóteses**: precisam de validação em campo.

---

## Como rodar

**Requisitos:** Node.js 22.12 ou mais recente (o Vite 7 exige 20.19+ ou 22.12+). No Windows, use `npm.cmd` no lugar de `npm` se o PowerShell bloquear scripts.

1. Copie `backend/.env.example` para `backend/.env` e preencha:

| Variável | Valor |
|---|---|
| `PORT` | `4000` (porta do backend; o frontend lê daqui) |
| `URL_API` | `https://planetarycomputer.microsoft.com/api/stac/v1` |
| `URL_DATA_API` | `https://planetarycomputer.microsoft.com/api/data/v1` |
| `URL_USGS_STAC` | `https://stac.astrogeology.usgs.gov/api` |
| `URL_POWER_API` | `https://power.larc.nasa.gov/api` |
| `URL_SOILGRIDS_API` | `https://rest.isric.org/soilgrids/v2.0` |
| `URL_MACROSTRAT_API` | `https://macrostrat.org/api/v2` |
| `URL_PDS_GEOSCIENCES` | `https://pds-geosciences.wustl.edu` |

Nenhuma dessas APIs exige chave ou cadastro.

2. Terminal 1 — backend:

```bash
cd backend && npm install && npm run dev
```

3. Terminal 2 — frontend:

```bash
cd frontend && npm install && npm run dev
```

4. Abra http://localhost:5173.

A primeira busca de cada objetivo consulta todos os lugares nas APIs e pode levar de 15 segundos (rover) a 1 minuto
(astrobiologia); depois fica em cache enquanto o servidor estiver ligado.

## Arquitetura

```
backend/    Node + Express + TypeScript, no padrão MVC
  model/        regras e cálculos (objetivos, ranking, validação, relevo, compatibilidade…)
  services/     acesso às APIs externas e montagem dos resultados
  controller/   recebe a requisição e chama os services
  routes/       define os endereços da API
frontend/   React + TypeScript (Vite), three.js (relevo 3D) e MapLibre (mapa)
```

### Rotas principais da API

| Rota | O que devolve |
|---|---|
| `GET /api/objetivos` | Objetivos, critérios, pesos e a fórmula do índice |
| `GET /api/ranking?objetivo=rover&local=jezero` | Lugares da Terra ordenados pela distância ao alvo, com o cálculo de cada critério e a validação |
| `GET /api/passaporte?objetivo=&local=&candidato=` | Passaporte científico de um lugar, com a origem de cada dado |
| `GET /api/compatibilidade?local=&analogo=` | Comparação detalhada: notas por critério, validação científica, equipamentos e composição |
| `GET /api/locais` · `GET /api/analogos` | Regiões da Lua e de Marte · fichas dos lugares da Terra |
| `POST /api/relevo` · `GET /api/locais/:id/relevo` | Relevo da Terra · relevo do alvo |
| `POST /api/imagem` · `GET /api/locais/:id/imagem` | Foto de satélite da Terra (com simulação da câmera do alvo) · foto do alvo |
| `GET /api/ambiente?lon=&lat=` | Clima, vegetação, solo e rocha de um ponto da Terra |
| `GET /api/locais/:id/composicao` | Química da superfície do alvo, com incerteza |

## Referências do método

- Shepard et al. (2001) — rugosidade de terrenos naturais em várias escalas. [doi:10.1029/2000JE001429](https://doi.org/10.1029/2000JE001429)
- Kreslavsky & Head (2000) — rugosidade de Marte em escala de quilômetros. [doi:10.1029/2000JE001259](https://doi.org/10.1029/2000JE001259)
- Chavez (1988) — correção do espalhamento atmosférico em imagens. [doi:10.1016/0034-4257(88)90019-3](https://doi.org/10.1016/0034-4257(88)90019-3)
- Peña-Asensio et al. (2025) — análise multicritério dos locais de pouso do Artemis III, Acta Astronautica. [doi:10.1016/j.actaastro.2024.10.049](https://doi.org/10.1016/j.actaastro.2024.10.049)
- NASA (2024) — [regiões de pouso do Artemis III](https://www.nasa.gov/news-release/nasa-provides-update-on-artemis-iii-moon-landing-regions/)
- NASA (2015) — [workshop de locais de pouso humano em Marte](https://www.nasa.gov/wp-content/uploads/2015/06/hls2-2nd-announcement-7-8.pdf)
- Boynton et al. (2007) e Prettyman et al. (2006) — química de Marte e da Lua por espectrômetros de raios gama ([NASA PDS](https://pds-geosciences.wustl.edu/))

As referências de cada lugar da Terra estão nas fichas e no passaporte científico.
