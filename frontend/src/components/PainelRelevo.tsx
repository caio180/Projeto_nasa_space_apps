// Aba "Relevo 3D": mostra o relevo de uma área da Terra e, se escolhido,
// compara lado a lado com um local de Marte ou da Lua.
//
// Comparação justa: as duas áreas usam a MESMA janela (ex.: 15 × 15 km) e a
// MESMA grade, então o pixel tem o mesmo tamanho e a declividade é comparável.

import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { api, ErroApi } from '../api.ts';
import type {
  AnalogoTerrestre,
  BBox,
  ImagemSatelite,
  ListaAnalogos,
  ListaLocais,
  LocalPlanetario,
  MedidasAmbientais,
  Relevo,
  ResultadoCompatibilidade,
} from '../types.ts';
import { ComparacaoImagens } from './ComparacaoImagens.tsx';
import { FichaAnalogo } from './FichaAnalogo.tsx';
import { PainelEquipamentos } from './PainelEquipamentos.tsx';
import { PainelValidacao } from './PainelValidacao.tsx';
import { PainelAmbiente } from './PainelAmbiente.tsx';
import { PainelCompatibilidade } from './PainelCompatibilidade.tsx';
import { PainelComposicao } from './PainelComposicao.tsx';

/** Grupos do seletor "Comparar com": o polo sul da Lua fica em destaque (bases do Artemis). */
const GRUPOS_LOCAIS = [
  { rotulo: 'Marte', corpo: 'Marte', polar: false },
  { rotulo: 'Lua — polo sul (Artemis III)', corpo: 'Lua', polar: true },
  { rotulo: 'Lua — outras regiões', corpo: 'Lua', polar: false },
] as const;
import { GRADIENTE_LEGENDA, Relevo3D } from './Relevo3D.tsx';
import type { ModoCor } from './Relevo3D.tsx';

/**
 * Lado das fotos de satélite em pixels (as duas usam o mesmo). Janelas grandes
 * ganham 1024 px para a foto não ficar borrada no 3D (~40 m por pixel em 43 km).
 */
function ladoDaFoto(bbox: BBox) {
  const larguraKm = (bbox[2] - bbox[0]) * 111.32 * Math.cos((((bbox[1] + bbox[3]) / 2) * Math.PI) / 180);
  const alturaKm = (bbox[3] - bbox[1]) * 110.574;
  return Math.max(larguraKm, alturaKm) > 20 ? 1024 : 512;
}

const ROTULOS_BBOX = ['lonMin', 'latMin', 'lonMax', 'latMax'];

// Áreas de relevo marcante no Brasil para testar (bbox aproximado).
const PRESETS_RELEVO: { nome: string; bbox: BBox }[] = [
  { nome: 'Chapada Diamantina (BA)', bbox: [-41.6, -12.7, -41.2, -12.4] },
  { nome: 'Lençóis Maranhenses (MA)', bbox: [-43.4, -2.75, -42.6, -2.4] },
  { nome: 'Jalapão (TO)', bbox: [-47.0, -10.8, -46.2, -10.2] },
  { nome: 'Raso da Catarina (BA)', bbox: [-38.8, -9.9, -38.2, -9.4] },
  { nome: 'Vale da Lua (GO)', bbox: [-47.65, -14.25, -47.5, -14.1] },
];

const formatar = (n: number, casas = 0) => n.toLocaleString('pt-BR', { maximumFractionDigits: casas });

/** Janela quadrada de `ladoKm` km de chão centrada no meio do bbox (para comparar na mesma escala). */
function janelaTerra(bbox: number[], ladoKm: number): BBox {
  return janelaNoPonto((bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2, ladoKm);
}

/** Janela quadrada de `ladoKm` km de chão centrada em (lon, lat). */
function janelaNoPonto(lon: number, lat: number, ladoKm: number): BBox {
  const meioLat = ladoKm / 2 / 110.574;
  const meioLon = ladoKm / 2 / (111.32 * Math.cos((lat * Math.PI) / 180));
  const r = (n: number) => Math.round(n * 1e5) / 1e5;
  return [r(lon - meioLon), r(lat - meioLat), r(lon + meioLon), r(lat + meioLat)];
}

function titulo(r: Relevo) {
  return r.nome ? `${r.corpo} · ${r.nome}` : r.corpo;
}

function CartaoRelevo({
  relevo,
  exagero,
  modo,
  foto,
}: {
  relevo: Relevo;
  exagero: number;
  modo: ModoCor;
  foto: ImagemSatelite | null;
}) {
  const usandoFoto = modo === 'foto' && foto !== null;
  return (
    <div className="cartao-relevo">
      <h3 className="cartao-relevo-titulo">{titulo(relevo)}</h3>
      <Relevo3D relevo={relevo} exagero={exagero} modo={modo} textura={foto?.png ?? null} />
      {usandoFoto ? (
        <p className="legenda-relevo legenda-foto">Cor real: {foto.fonte}</p>
      ) : (
        <div className="legenda-relevo">
          <span>{formatar(relevo.estatisticas.minimo)} m</span>
          <span className="legenda-rampa" style={{ background: GRADIENTE_LEGENDA }} />
          <span>{formatar(relevo.estatisticas.maximo)} m</span>
        </div>
      )}
    </div>
  );
}

/** Linhas da tabela: [rótulo, função que formata o valor de um relevo]. */
const LINHAS: [string, (r: Relevo) => string][] = [
  ['Declividade média', (r) => `${formatar(r.estatisticas.declividadeMedia, 1)}°`],
  [`Área plana (< 5°)`, (r) => `${formatar(r.estatisticas.percentualPlano, 1)}%`],
  ['Amplitude (máx − mín)', (r) => `${formatar(r.estatisticas.amplitude)} m`],
  ['Altitude mín. / máx.*', (r) => `${formatar(r.estatisticas.minimo)} / ${formatar(r.estatisticas.maximo)} m`],
  ['Gravidade', (r) => `${formatar(r.gravidade, 2)} m/s²`],
  ['Pixel', (r) => `≈ ${formatar(r.metrosPorPixel.x)} m`],
  ['Sem dado', (r) => `${formatar((100 * r.estatisticas.pixelsSemDado) / r.elevacoes.length)}%`],
  ['Fonte', (r) => r.fonte],
];

/** Pedido vindo do explorador: comparar um candidato do ranking com um alvo. */
export interface PedidoComparacao {
  candidato: { id: string; lon: number; lat: number; nome: string; noCatalogo: boolean };
  localId: string;
  /** Muda a cada clique, para repetir o mesmo pedido. */
  chave: number;
}

export function PainelRelevo({ pedido = null }: { pedido?: PedidoComparacao | null }) {
  const topoRef = useRef<HTMLDivElement>(null);
  const ultimoPedido = useRef<number | null>(null);
  const [bbox, setBbox] = useState<string[]>(PRESETS_RELEVO[0].bbox.map(String));
  const [resolucao, setResolucao] = useState(128);
  const [exagero, setExagero] = useState(3);
  const [catalogo, setCatalogo] = useState<ListaLocais | null>(null);
  const [analogos, setAnalogos] = useState<ListaAnalogos | null>(null);
  // Área escolhida: "a:<id>" = análogo do desafio, "b:<índice>" = área de teste no Brasil.
  const [area, setArea] = useState('b:0');
  const [localId, setLocalId] = useState('');
  const [terra, setTerra] = useState<Relevo | null>(null);
  const [outro, setOutro] = useState<Relevo | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<{ mensagem: string; detalhes?: unknown } | null>(null);
  const [ambiente, setAmbiente] = useState<MedidasAmbientais | null>(null);
  const [carregandoAmbiente, setCarregandoAmbiente] = useState(false);
  const [erroAmbiente, setErroAmbiente] = useState<string | null>(null);
  const [compat, setCompat] = useState<ResultadoCompatibilidade | null>(null);
  const [carregandoCompat, setCarregandoCompat] = useState(false);
  const [erroCompat, setErroCompat] = useState<string | null>(null);
  const [modoCor, setModoCor] = useState<ModoCor>('altitude');
  const [fotoTerra, setFotoTerra] = useState<ImagemSatelite | null>(null);
  const [fotoOutro, setFotoOutro] = useState<ImagemSatelite | null>(null);
  const [carregandoFotos, setCarregandoFotos] = useState(false);
  const [errosFotos, setErrosFotos] = useState<{ terra?: string; outro?: string }>({});
  const [comparandoFotos, setComparandoFotos] = useState(false);

  /**
   * Fotos de satélite da MESMA janela do relevo: Sentinel-2 na Terra e a
   * ortoimagem do mesmo produto do DTM em Marte/Lua. Cada uma aparece quando
   * fica pronta (não espera a outra).
   */
  async function carregarFotos(
    bboxTerra: BBox,
    nomeTerra: string | undefined,
    idLocal: string | null,
    simular: 'Marte' | 'Lua' | undefined,
  ) {
    setCarregandoFotos(true);
    setErrosFotos({});
    setFotoTerra(null);
    setFotoOutro(null);
    setComparandoFotos(idLocal !== null);
    const mensagem = (err: unknown) => (err instanceof ErroApi ? err.message : String(err));
    await Promise.all([
      api
        .imagemTerra(bboxTerra, ladoDaFoto(bboxTerra), nomeTerra, simular)
        .then(setFotoTerra)
        .catch((err) => setErrosFotos((e) => ({ ...e, terra: mensagem(err) }))),
      idLocal
        ? api
            .imagemLocal(idLocal, ladoDaFoto(bboxTerra))
            .then(setFotoOutro)
            .catch((err) => setErrosFotos((e) => ({ ...e, outro: mensagem(err) })))
        : Promise.resolve(),
    ]);
    setCarregandoFotos(false);
  }

  /** % de compatibilidade calculada no backend (relevo + ambiente + critérios NASA). */
  async function carregarCompatibilidade(
    idLocal: string,
    pontoTerra: { analogo: string } | { lon: number; lat: number; nome: string },
  ) {
    setCarregandoCompat(true);
    setErroCompat(null);
    try {
      setCompat(await api.compatibilidade(idLocal, pontoTerra, resolucao));
    } catch (err) {
      setCompat(null);
      setErroCompat(err instanceof ErroApi ? err.message : String(err));
    } finally {
      setCarregandoCompat(false);
    }
  }

  // Locais de Marte/Lua e análogos da Terra (uma vez, ao abrir).
  useEffect(() => {
    Promise.all([api.locais(), api.analogos()])
      .then(([locais, lista]) => {
        setCatalogo(locais);
        setAnalogos(lista);
        // Abre já num análogo em destaque, comparado com o local sugerido.
        const inicial = lista.analogos.find((a) => a.destaque);
        if (inicial) escolherAnalogo(inicial, locais);
      })
      .catch(() => {
        // sem as listas, a aba funciona só com as áreas de teste do Brasil
      });
  }, []);

  function escolherAnalogo(a: AnalogoTerrestre, locais: ListaLocais | null = catalogo) {
    const sugerido = locais?.locais.find((l) => l.id === a.comparacaoSugerida);
    setArea(`a:${a.id}`);
    setBbox(janelaNoPonto(a.lon, a.lat, sugerido?.ladoKm ?? 15).map(String));
    setLocalId(sugerido?.id ?? '');
    carregarAmbiente(a.lon, a.lat);
  }

  /** Medidas ambientais do ponto (NASA POWER, MODIS, SoilGrids, Macrostrat). */
  async function carregarAmbiente(lon: number, lat: number) {
    setCarregandoAmbiente(true);
    setErroAmbiente(null);
    try {
      setAmbiente(await api.ambiente(lon, lat));
    } catch (err) {
      setAmbiente(null);
      setErroAmbiente(err instanceof ErroApi ? err.message : String(err));
    } finally {
      setCarregandoAmbiente(false);
    }
  }

  function escolherArea(valor: string) {
    if (valor.startsWith('a:')) {
      const a = analogos?.analogos.find((x) => x.id === valor.slice(2));
      if (a) escolherAnalogo(a);
      return;
    }
    const p = PRESETS_RELEVO[Number(valor.slice(2))];
    if (p) {
      setArea(valor);
      setBbox(p.bbox.map(String));
      carregarAmbiente((p.bbox[0] + p.bbox[2]) / 2, (p.bbox[1] + p.bbox[3]) / 2);
    }
  }

  const local = catalogo?.locais.find((l) => l.id === localId) ?? null;
  const analogo = area.startsWith('a:') ? (analogos?.analogos.find((a) => a.id === area.slice(2)) ?? null) : null;
  // A Terra usa a mesma janela do local de Marte/Lua escolhido (mesmo tamanho de pixel).
  const ladoKm = local?.ladoKm ?? catalogo?.ladoJanelaKm ?? 15;

  async function gerar(e: FormEvent) {
    e.preventDefault();
    const nomeArea = analogo?.nome ?? PRESETS_RELEVO[Number(area.slice(2))]?.nome ?? 'Área escolhida';
    await executar(bbox.map(Number), local, analogo, nomeArea);
  }

  // Pedido do explorador: monta a área, escolhe o alvo e compara.
  useEffect(() => {
    if (!pedido || !catalogo || !analogos || ultimoPedido.current === pedido.chave) return;
    ultimoPedido.current = pedido.chave;
    const alvo = catalogo.locais.find((l) => l.id === pedido.localId) ?? null;
    const doCatalogo = pedido.candidato.noCatalogo
      ? (analogos.analogos.find((a) => a.id === pedido.candidato.id) ?? null)
      : null;
    const lado = alvo?.ladoKm ?? catalogo.ladoJanelaKm;
    const janela = janelaNoPonto(pedido.candidato.lon, pedido.candidato.lat, lado);
    const preset = PRESETS_RELEVO.findIndex((x) => x.nome === pedido.candidato.nome);
    setArea(doCatalogo ? `a:${doCatalogo.id}` : preset >= 0 ? `b:${preset}` : area);
    setBbox(janela.map(String));
    setLocalId(alvo?.id ?? '');
    topoRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    void executar([...janela], alvo, doCatalogo, pedido.candidato.nome);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pedido, catalogo, analogos]);

  async function executar(
    bboxNumeros: number[],
    local: LocalPlanetario | null,
    analogo: AnalogoTerrestre | null,
    nomeArea: string,
  ) {
    setCarregando(true);
    setErro(null);
    try {
      // Se o centro mudou (bbox editado à mão), atualiza as medidas ambientais em paralelo.
      const centroLon = (bboxNumeros[0] + bboxNumeros[2]) / 2;
      const centroLat = (bboxNumeros[1] + bboxNumeros[3]) / 2;
      if (!ambiente || Math.abs(ambiente.lon - centroLon) > 0.01 || Math.abs(ambiente.lat - centroLat) > 0.01) {
        void carregarAmbiente(centroLon, centroLat);
      }
      // Fotos em paralelo, na mesma janela que o relevo da Terra vai usar.
      // Com um alvo escolhido, a Terra também vem simulada na câmera de Marte/Lua.
      void carregarFotos(
        local ? janelaTerra(bboxNumeros, ladoKm) : (bboxNumeros as BBox),
        nomeArea,
        local?.id ?? null,
        local?.corpo ?? analogo?.alvo,
      );
      if (local) {
        // Compatibilidade em paralelo (não segura o 3D enquanto calcula).
        void carregarCompatibilidade(
          local.id,
          analogo ? { analogo: analogo.id } : { lon: centroLon, lat: centroLat, nome: nomeArea },
        );
        // As duas leituras são independentes: rodam em paralelo.
        const [t, o] = await Promise.all([
          api.relevo(janelaTerra(bboxNumeros, ladoKm), resolucao),
          api.relevoLocal(local.id, resolucao),
        ]);
        setTerra({ ...t, nome: nomeArea });
        setOutro(o);
      } else {
        const t = await api.relevo(bboxNumeros as BBox, resolucao);
        setTerra({ ...t, nome: nomeArea });
        setOutro(null);
        setCompat(null);
      }
    } catch (err) {
      setErro(err instanceof ErroApi ? { mensagem: err.message, detalhes: err.detalhes } : { mensagem: String(err) });
    } finally {
      setCarregando(false);
    }
  }

  const comparando = terra && outro;
  const est = terra?.estatisticas;
  const larguraKm = terra ? (terra.largura * terra.metrosPorPixel.x) / 1000 : 0;
  const alturaKm = terra ? (terra.altura * terra.metrosPorPixel.y) / 1000 : 0;

  return (
    <div className="colunas" ref={topoRef}>
      <div className="coluna-lateral">
        <form className="painel" onSubmit={gerar}>
          <h2>Comparação detalhada</h2>
          <label className="campo">
            <span>Área na Terra</span>
            <select value={area} onChange={(e) => escolherArea(e.target.value)}>
              {(['Marte', 'Lua'] as const).map((alvo) => (
                <optgroup key={alvo} label={`Análogos ${alvo === 'Lua' ? 'da Lua' : 'de Marte'} (desafio)`}>
                  {analogos?.analogos
                    .filter((a) => a.alvo === alvo)
                    .map((a) => (
                      <option key={a.id} value={`a:${a.id}`}>
                        {a.destaque ? '★ ' : ''}
                        {a.nome} — {a.pais}
                      </option>
                    ))}
                </optgroup>
              ))}
              <optgroup label="Brasil (áreas de teste)">
                {PRESETS_RELEVO.map((p, i) => (
                  <option key={p.nome} value={`b:${i}`}>
                    {p.nome}
                  </option>
                ))}
              </optgroup>
            </select>
          </label>

          <fieldset className="grade-4">
            <legend>bbox (graus, máx. 2° × 2°)</legend>
            {bbox.map((v, i) => (
              <label key={ROTULOS_BBOX[i]} className="campo">
                <span>{ROTULOS_BBOX[i]}</span>
                <input
                  inputMode="decimal"
                  value={v}
                  onChange={(e) => setBbox(bbox.map((x, j) => (j === i ? e.target.value : x)))}
                />
              </label>
            ))}
          </fieldset>

          <label className="campo">
            <span>Comparar com</span>
            <select value={localId} onChange={(e) => setLocalId(e.target.value)} disabled={!catalogo}>
              <option value="">— só a Terra —</option>
              {GRUPOS_LOCAIS.map((g) => (
                <optgroup key={g.rotulo} label={g.rotulo}>
                  {catalogo?.locais
                    .filter((l) => l.corpo === g.corpo && l.polar === g.polar)
                    .map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.nome}
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
          </label>

          {local && (
            <p className="ajuda">
              {local.descricao} Na comparação, as duas áreas usam uma janela de {ladoKm} × {ladoKm} km (a da Terra fica
              centrada no bbox acima).
            </p>
          )}

          <label className="campo">
            <span>Resolução da grade</span>
            <select value={resolucao} onChange={(e) => setResolucao(Number(e.target.value))}>
              <option value={64}>64 px — rápido</option>
              <option value={128}>128 px — equilibrado</option>
              <option value={256}>256 px — detalhado</option>
              <option value={512}>512 px — máximo (mais lento)</option>
            </select>
          </label>

          <button type="submit" className="botao-primario" disabled={carregando}>
            {carregando ? 'Carregando relevo…' : local ? 'Comparar relevos' : 'Gerar relevo 3D'}
          </button>
          {carregando && local && (
            <p className="ajuda">A primeira leitura de um local de {local.corpo} leva alguns segundos.</p>
          )}
        </form>

        {analogo && analogos && <FichaAnalogo analogo={analogo} rotulosDimensoes={analogos.dimensoes} />}

        {est && terra && !comparando && (
          <section className="painel">
            <h2>Medidas da área</h2>
            <dl className="estatisticas">
              <dt>Altitude mín. / máx.</dt>
              <dd>
                {formatar(est.minimo)} m / {formatar(est.maximo)} m
              </dd>
              <dt>Amplitude</dt>
              <dd>{formatar(est.amplitude)} m</dd>
              <dt>Altitude média</dt>
              <dd>{formatar(est.media)} m</dd>
              <dt>Declividade média</dt>
              <dd>{formatar(est.declividadeMedia, 1)}°</dd>
              <dt>Área plana (&lt; {est.limiarPlanoGraus}°)</dt>
              <dd>{formatar(est.percentualPlano, 1)}%</dd>
              <dt>Tamanho</dt>
              <dd>
                {formatar(larguraKm, 1)} × {formatar(alturaKm, 1)} km
              </dd>
              <dt>Pixel</dt>
              <dd>≈ {formatar(terra.metrosPorPixel.x)} m</dd>
              <dt>Tiles do DEM</dt>
              <dd>{terra.itens.length}</dd>
            </dl>
          </section>
        )}
      </div>

      <div className="coluna-principal">
        {erro && (
          <div className="alerta" role="alert">
            <strong>{erro.mensagem}</strong>
            {Array.isArray(erro.detalhes) && (
              <ul>
                {erro.detalhes.map((d, i) => (
                  <li key={i}>{String(d)}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        {comparando && (
          <section className="painel">
            <h2>Comparação</h2>
            <div className="tabela-rolagem">
              <table className="tabela-comparacao">
                <thead>
                  <tr>
                    <th scope="col">Medida</th>
                    <th scope="col">{titulo(terra)}</th>
                    <th scope="col">{titulo(outro)}</th>
                  </tr>
                </thead>
                <tbody>
                  {LINHAS.map(([rotulo, valor]) => (
                    <tr key={rotulo}>
                      <th scope="row">{rotulo}</th>
                      <td>{valor(terra)}</td>
                      <td>{valor(outro)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="ajuda">
              * Altitudes absolutas não se comparam: a Terra mede a partir do nível do mar, Marte do areoide e a Lua de
              uma esfera de referência. Declividade e amplitude, sim.
            </p>
          </section>
        )}

        {(comparando || carregandoCompat || erroCompat) && (
          <PainelCompatibilidade resultado={compat} carregando={carregandoCompat} erro={erroCompat} />
        )}

        {compat?.validacao && !carregandoCompat && (
          <PainelValidacao validacao={compat.validacao} nomeTerra={compat.terra.nome} nomeAlvo={compat.alvo.nome} />
        )}

        {compat && !carregandoCompat && compat.equipamentos?.length > 0 && (
          <PainelEquipamentos
            equipamentos={compat.equipamentos}
            nomeTerra={compat.terra.nome}
            nomeAlvo={compat.alvo.nome}
          />
        )}

        {compat?.composicaoAlvo && !carregandoCompat && (
          <PainelComposicao alvo={compat.composicaoAlvo} nomeAlvo={compat.alvo.nome} ambiente={ambiente} />
        )}

        <PainelAmbiente
          medidas={ambiente}
          carregando={carregandoAmbiente}
          erro={erroAmbiente}
          alvo={local?.corpo ?? analogo?.alvo ?? 'Marte'}
        />

        {/* Regra de ouro do guia: primeiro a evidência, depois a imersão. */}
        <h2 className="titulo-secao">Imersão — relevo 3D e fotos (depois das evidências)</h2>
        <section className="painel">
          <div className="painel-topo">
            <h2>Relevo 3D</h2>
            <div className="controles-visualizacao">
              <label className="campo campo-linha">
                <span>Cor da superfície</span>
                <select value={modoCor} onChange={(e) => setModoCor(e.target.value as ModoCor)}>
                  <option value="altitude">Altitude</option>
                  <option value="foto" disabled={!fotoTerra && !fotoOutro}>
                    Foto de satélite real
                  </option>
                </select>
              </label>
              <div className="controle-exagero">
                <label htmlFor="exagero">
                  Exagero vertical <strong>{exagero === 1 ? '1× (relevo real)' : `${exagero}×`}</strong>
                </label>
                <div className="trilho-exagero">
                  <input
                    id="exagero"
                    type="range"
                    min={1}
                    max={20}
                    value={exagero}
                    onChange={(e) => setExagero(Number(e.target.value))}
                  />
                  {/* Linha fixa no 1×: a posição do relevo como ele é de verdade. */}
                  <span className="marca-real" aria-hidden="true">
                    <span>real</span>
                  </span>
                </div>
                <button type="button" className="link" onClick={() => setExagero(1)} disabled={exagero === 1}>
                  Ver relevo real (1×)
                </button>
              </div>
            </div>
          </div>

          {comparando ? (
            <div className="comparacao">
              <CartaoRelevo relevo={terra} exagero={exagero} modo={modoCor} foto={fotoTerra} />
              <CartaoRelevo relevo={outro} exagero={exagero} modo={modoCor} foto={fotoOutro} />
            </div>
          ) : terra ? (
            <CartaoRelevo relevo={terra} exagero={exagero} modo={modoCor} foto={fotoTerra} />
          ) : (
            <div className="relevo-vazio">Escolha uma área e clique em “Gerar relevo 3D”.</div>
          )}
          {terra && (
            <p className="ajuda">
              Arraste para girar · roda do mouse para aproximar · botão direito para mover. Cada modelo usa a própria
              escala de cores. A régua amarela no canto mostra a altura real: com exagero ela estica junto, mas os
              números continuam em metros reais.
            </p>
          )}
        </section>

        <ComparacaoImagens
          terra={fotoTerra}
          outro={fotoOutro}
          carregando={carregandoFotos}
          erros={errosFotos}
          comparando={comparandoFotos}
          tituloOutro={local ? `${local.corpo} · ${local.nome}` : 'Marte / Lua'}
        />

        <section className="painel">
          <h2>Limitações desta medida</h2>
          <ul className="limitacoes">
            <li>
              O Copernicus DEM (Terra) é um <strong>modelo de superfície</strong>: inclui vegetação e construções, não só
              o solo.
            </li>
            <li>
              A grade é reamostrada
              {terra ? ` para ≈ ${formatar(terra.metrosPorPixel.x)} m por pixel` : ''}. Isso suaviza declives curtos e
              subestima a declividade. Na comparação, os dois lados usam o mesmo tamanho de pixel.
            </li>
            <li>
              Os modelos de Marte e da Lua (USGS) cobrem faixas de ~30–40 km. Por isso usamos locais escolhidos; áreas
              cinza no 3D são pixels sem dado.
            </li>
            <li>
              O exagero vertical é só visual: as medidas usam sempre a altitude real, e a régua do 3D mostra os metros
              reais.
            </li>
            <li>
              Relevo parecido não quer dizer ambiente parecido: gravidade, atmosfera, temperatura e radiação de Marte e da
              Lua são muito diferentes das da Terra.
            </li>
          </ul>
        </section>
      </div>
    </div>
  );
}
