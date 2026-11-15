// "Planetary Twin Explorer" — o fluxo que o guia de mentoria pede:
//   01 Definir objetivo → 02 Escolher o alvo → 03 Buscar análogos →
//   04 Comparar (ranking explicável) → 05 Explorar (mapa + 3D) → 06 Concluir
//   (passaporte científico e proposta de experimento).
// Regra de ouro: primeiro a evidência (ranking, mapa, passaporte); o 3D vem
// depois, na comparação detalhada.

import { Fragment, useEffect, useState } from "react";
import { api, ErroApi } from "../api.ts";
import type {
  ListaLocais,
  ListaObjetivos,
  ObjetivoId,
  ResultadoRanking,
} from "../types.ts";
import { MapaCandidatos } from "./MapaCandidatos.tsx";
import { PassaporteCientifico } from "./PassaporteCientifico.tsx";

interface Props {
  /** Abre a comparação detalhada (relevo 3D, fotos, ambiente) do local analisado com o alvo. */
  onComparar: (
    candidato: {
      id: string;
      lon: number;
      lat: number;
      nome: string;
      noCatalogo: boolean;
    },
    localId: string,
  ) => void;
}

const f = (n: number | null | undefined, casas = 2) =>
  n === null || n === undefined
    ? "—"
    : n.toLocaleString("pt-BR", { maximumFractionDigits: casas });

const GRUPOS = [
  { rotulo: "Marte", corpo: "Marte", polar: false },
  { rotulo: "Lua — polo sul (Artemis III)", corpo: "Lua", polar: true },
  { rotulo: "Lua — outras regiões", corpo: "Lua", polar: false },
] as const;

export function Explorador({ onComparar }: Props) {
  const [objetivos, setObjetivos] = useState<ListaObjetivos | null>(null);
  const [locais, setLocais] = useState<ListaLocais | null>(null);
  const [objetivo, setObjetivo] = useState<ObjetivoId>("rover");
  const [localId, setLocalId] = useState("jezero");
  const [ranking, setRanking] = useState<ResultadoRanking | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [aberto, setAberto] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.objetivos(), api.locais()])
      .then(([o, l]) => {
        setObjetivos(o);
        setLocais(l);
      })
      .catch((e) => setErro(e instanceof ErroApi ? e.message : String(e)));
  }, []);

  async function buscar() {
    setCarregando(true);
    setErro(null);
    setRanking(null);
    setSelecionado(null);
    try {
      const r = await api.ranking(objetivo, localId);
      setRanking(r);
      setSelecionado(r.candidatoNovo?.id ?? r.linhas[0]?.id ?? null);
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : String(e));
    } finally {
      setCarregando(false);
    }
  }

  const obj = objetivos?.objetivos.find((o) => o.id === objetivo);
  const local = locais?.locais.find((l) => l.id === localId);
  const linha = ranking?.linhas.find((l) => l.id === selecionado) ?? null;

  return (
    <div className="explorador">
      {/* 01 Objetivo */}
      <section className="painel">
        <div className="passo-cabecalho">
          <span className="passo-numero">01</span>
          <div>
            <h2>Definir o objetivo do teste</h2>
            <p className="ajuda">
              A similaridade depende do objetivo: não existe um “% de parecido
              com Marte” universal.
            </p>
          </div>
        </div>
        <div
          className="objetivos"
          role="radiogroup"
          aria-label="Objetivo do teste"
        >
          {objetivos?.objetivos.map((o) => (
            <label
              key={o.id}
              className={o.id === objetivo ? "objetivo ativo" : "objetivo"}
            >
              <input
                type="radio"
                name="objetivo"
                value={o.id}
                checked={o.id === objetivo}
                onChange={() => setObjetivo(o.id)}
              />
              <strong>{o.nome}</strong>
              <span>{o.pergunta}</span>
            </label>
          ))}
        </div>
        {obj && objetivos && (
          <details className="fontes" open>
            <summary>Critérios e pesos deste objetivo</summary>
            <div className="tabela-rolagem">
              <table className="tabela-comparacao">
                <thead>
                  <tr>
                    <th scope="col">Critério</th>
                    <th scope="col">Peso</th>
                    <th scope="col">Por quê</th>
                    <th scope="col">Como é medido · fonte</th>
                  </tr>
                </thead>
                <tbody>
                  {obj.criterios.map((c) => {
                    const v = objetivos.variaveis[c.variavel];
                    return (
                      <tr key={c.variavel}>
                        <th scope="row">
                          {v.nome}
                          {v.unidade && ` (${v.unidade})`}
                        </th>
                        <td>{c.peso}</td>
                        <td>{c.motivo}</td>
                        <td>
                          {v.comoMedir}{" "}
                          <span className="fonte-linha">{v.fonte}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="ajuda">
              {objetivos.notaPesos} <strong>Não concluir:</strong>{" "}
              {obj.naoConcluir} Camadas que ajudam a interpretar, mas não entram
              na conta: {obj.camadasAdicionais.join("; ")}.
            </p>
          </details>
        )}
      </section>

      {/* 02 Alvo e 03 Buscar, lado a lado */}
      <div className="passos-lado">
        <section className="painel">
          <div className="passo-cabecalho">
            <span className="passo-numero">02</span>
            <div>
              <h2>Escolher o alvo</h2>
            </div>
          </div>
          <label className="campo">
            <span>Região da Lua ou de Marte</span>
            <select
              value={localId}
              onChange={(e) => setLocalId(e.target.value)}
              disabled={!locais}
            >
              {GRUPOS.map((g) => (
                <optgroup key={g.rotulo} label={g.rotulo}>
                  {locais?.locais
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
          {local && <p className="ajuda">{local.descricao}</p>}
        </section>

        <section className="painel">
          <div className="passo-cabecalho">
            <span className="passo-numero">03</span>
            <div>
              <h2>Buscar análogos</h2>
              <p className="ajuda">
                Mede todos os locais — referências da literatura e regiões sem
                literatura — numa janela do mesmo tamanho da do alvo e no mesmo
                pixel.
              </p>
            </div>
          </div>
          <button
            type="button"
            className="botao-primario botao-busca"
            onClick={buscar}
            disabled={carregando || !objetivos}
          >
            {carregando ? "Medindo os locais…" : "Buscar análogos"}
          </button>
          {carregando && (
            <p className="ajuda">
              A primeira busca consulta cada local nas APIs (relevo
              {objetivo !== "rover" ? ", clima, vegetação e solo" : ""}) e pode
              levar até 1–2 minutos. Depois fica em cache.
            </p>
          )}
          {erro && <p className="erro-texto">{erro}</p>}
        </section>
      </div>

      {ranking && (
        <>
          {/* 04 Comparar */}
          <section className="painel">
            <div className="passo-cabecalho">
              <span className="passo-numero">04</span>
              <div>
                <h2>Comparar — ranking explicável</h2>
                <p className="ajuda">
                  {ranking.objetivo.nome} × {ranking.alvo.nome} (
                  {ranking.alvo.corpo}). Distância menor = mais parecido{" "}
                  <em>nos critérios escolhidos</em>; não é probabilidade de
                  equivalência.
                </p>
              </div>
            </div>

            <p className="formula">{ranking.formula}</p>

            <div
              className={
                ranking.validacao.posicao !== null &&
                ranking.validacao.posicao <=
                  Math.ceil(ranking.validacao.total / 3)
                  ? "caixa-ok"
                  : "alerta"
              }
            >
              <strong>Validação com referência conhecida:</strong>{" "}
              {ranking.validacao.texto}
            </div>
            {ranking.candidatoNovo && (
              <div className="caixa-novo">
                <strong>Novo análogo proposto pelas medidas:</strong>{" "}
                {ranking.candidatoNovo.justificativa}
              </div>
            )}

            <div className="tabela-rolagem">
              <table className="tabela-comparacao tabela-ranking">
                <thead>
                  <tr>
                    <th scope="col">#</th>
                    <th scope="col">Local analisado</th>
                    <th scope="col">Papel</th>
                    <th scope="col">D</th>
                    <th scope="col">Dado</th>
                    <th scope="col">Mais parecido · mais diferente</th>
                    <th scope="col" />
                  </tr>
                </thead>
                <tbody>
                  {ranking.linhas.map((l) => (
                    <Fragment key={l.id}>
                      <tr
                        className={
                          l.id === selecionado ? "linha-ativa" : undefined
                        }
                      >
                        <td>{l.posicao ?? "—"}</td>
                        <th scope="row">
                          <button
                            type="button"
                            className="link"
                            onClick={() => setSelecionado(l.id)}
                          >
                            {l.nome}
                          </button>
                          <span className="fonte-linha">{l.pais}</span>
                        </th>
                        <td>
                          <span
                            className={
                              l.papel === "referencia"
                                ? "selo selo-estudado"
                                : "selo selo-proposto"
                            }
                          >
                            {l.papel === "referencia"
                              ? "Referência"
                              : "Proposto"}
                          </span>
                        </td>
                        <td>
                          <strong>{f(l.distancia)}</strong>
                        </td>
                        <td>{l.cobertura}%</td>
                        <td>
                          {l.maisParecidos.join(", ") || "—"} ·{" "}
                          <em>{l.maisDiferente ?? "—"}</em>
                        </td>
                        <td>
                          <button
                            type="button"
                            className="link"
                            onClick={() =>
                              setAberto(aberto === l.id ? null : l.id)
                            }
                          >
                            {aberto === l.id ? "Fechar" : "Ver cálculo"}
                          </button>
                        </td>
                      </tr>
                      {aberto === l.id && (
                        <tr className="linha-detalhe">
                          <td colSpan={7}>
                            <table className="tabela-comparacao">
                              <thead>
                                <tr>
                                  <th scope="col">Critério</th>
                                  <th scope="col">Peso</th>
                                  <th scope="col">Terra</th>
                                  <th scope="col">{ranking.alvo.nome}</th>
                                  <th scope="col">z Terra · z alvo</th>
                                  <th scope="col">Parcela de D²</th>
                                </tr>
                              </thead>
                              <tbody>
                                {l.parcelas.map((p) => (
                                  <tr key={p.variavel}>
                                    <th scope="row">{p.nome}</th>
                                    <td>{p.peso}</td>
                                    <td>
                                      {p.valorTerra === null ? (
                                        <span className="indisponivel">
                                          ausente
                                        </span>
                                      ) : (
                                        `${f(p.valorTerra)} ${p.unidade}`
                                      )}
                                    </td>
                                    <td>
                                      {p.valorAlvo === null ? (
                                        <span className="indisponivel">
                                          ausente
                                        </span>
                                      ) : (
                                        `${f(p.valorAlvo)} ${p.unidade}`
                                      )}
                                    </td>
                                    <td>
                                      {f(p.zTerra)} · {f(p.zAlvo)}
                                    </td>
                                    <td>
                                      {p.contribuicao === null
                                        ? "fora da conta"
                                        : f(p.contribuicao)}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                            {l.ausentes.length > 0 && (
                              <p className="ajuda">
                                <strong>Ausentes (não viram nota):</strong>{" "}
                                {l.ausentes.join("; ")}
                              </p>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>

            <details className="fontes">
              <summary>
                Padronização, valores do alvo e limites do método
              </summary>
              <div className="tabela-rolagem">
                <table className="tabela-comparacao">
                  <thead>
                    <tr>
                      <th scope="col">Critério</th>
                      <th scope="col">Valor do alvo · fonte</th>
                      <th scope="col">Média · desvio (Terra)</th>
                      <th scope="col">Escala</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ranking.normalizacao.map((n) => {
                      const c = ranking.objetivo.criterios.find(
                        (x) => x.variavel === n.variavel,
                      )!;
                      return (
                        <tr key={n.variavel}>
                          <th scope="row">{c.nome}</th>
                          <td>
                            {f(ranking.alvo.valores[n.variavel])} {c.unidade}
                            <span className="fonte-linha">
                              {ranking.alvo.fontes[n.variavel]}
                            </span>
                          </td>
                          <td>
                            {f(n.media)} · {f(n.desvio)} (n = {n.n})
                          </td>
                          <td>{n.escala === "log" ? "log₁₀" : "linear"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <ul>
                {ranking.limites.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </details>
          </section>

          {/* 05 Explorar */}
          <section className="painel">
            <div className="passo-cabecalho">
              <span className="passo-numero">05</span>
              <div>
                <h2>Explorar — mapa dos locais analisados</h2>
                <p className="ajuda">
                  Clique num ponto para ver o passaporte. O 3D fica na
                  comparação detalhada, abaixo.
                </p>
              </div>
            </div>
            <MapaCandidatos
              linhas={ranking.linhas}
              selecionado={selecionado}
              candidatoNovo={ranking.candidatoNovo?.id ?? null}
              onSelecionar={setSelecionado}
            />
            {linha && (
              <div className="acoes-explorar">
                <span>
                  <strong>{linha.nome}</strong> ·{" "}
                  {linha.posicao ? `${linha.posicao}º` : "sem posição"} · D{" "}
                  {f(linha.distancia)}
                </span>
                <button
                  type="button"
                  className="botao-secundario"
                  onClick={() =>
                    onComparar(
                      {
                        id: linha.id,
                        lon: linha.lon,
                        lat: linha.lat,
                        nome: linha.nome,
                        noCatalogo: linha.origem === "catalogo",
                      },
                      ranking.alvo.id,
                    )
                  }
                >
                  Comparação detalhada e 3D
                </button>
              </div>
            )}
          </section>

          {/* 06 Concluir */}
          {linha && (
            <PassaporteCientifico
              objetivo={ranking.objetivo.id}
              localId={ranking.alvo.id}
              candidatoId={linha.id}
            />
          )}
        </>
      )}
    </div>
  );
}
