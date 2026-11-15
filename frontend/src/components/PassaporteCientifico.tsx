// 06 Concluir — passaporte científico do local analisado (guia de mentoria, pág. 06):
// Referência · Métricas · Evidências (com proveniência de cada camada) ·
// Diferenças · Aplicação (experimento proposto). Pode ser baixado em JSON
// (para reprocessar) ou Markdown (para o relatório e o README). As rotas e os
// parâmetros para reproduzir o cálculo ficam só nos arquivos baixados.

import { useEffect, useState } from "react";
import { api, ErroApi } from "../api.ts";
import type { ObjetivoId, Passaporte } from "../types.ts";

interface Props {
  objetivo: ObjetivoId;
  localId: string;
  candidatoId: string;
}

const f = (n: number | null | undefined, casas = 2) =>
  n === null || n === undefined
    ? "—"
    : n.toLocaleString("pt-BR", { maximumFractionDigits: casas });

function baixar(nome: string, conteudo: string, tipo: string) {
  const url = URL.createObjectURL(new Blob([conteudo], { type: tipo }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  a.click();
  URL.revokeObjectURL(url);
}

/** Passaporte em Markdown, pronto para colar no relatório. */
export function paraMarkdown(p: Passaporte) {
  const linhas: string[] = [
    `# Passaporte científico — ${p.referencia.candidato}`,
    "",
    `Gerado em ${p.geradoEm}.`,
    "",
    "## Referência",
    `- **Alvo:** ${p.referencia.alvo}`,
    `- **Objetivo:** ${p.referencia.objetivo} — ${p.referencia.pergunta}`,
    `- **Local analisado:** ${p.referencia.candidato} (lon ${p.referencia.coordenadas.lon}, lat ${p.referencia.coordenadas.lat})`,
    `- **Papel:** ${p.referencia.papel}`,
    "",
    "## Métricas",
    `- **Distância ponderada:** ${f(p.metricas.distancia)} (${p.metricas.posicao ?? "—"}º de ${p.metricas.total}) — ${p.metricas.formula}`,
    `- **Cobertura:** ${p.metricas.cobertura}; ${p.metricas.resolucao}`,
    "",
    "| Critério | Peso | Terra | Alvo | Parcela de D² |",
    "|---|---|---|---|---|",
    ...p.metricas.criterios.map(
      (c) =>
        `| ${c.nome} | ${c.peso} | ${c.valorTerra === null ? "ausente" : `${f(c.valorTerra)} ${c.unidade}`} | ${c.valorAlvo === null ? "ausente" : `${f(c.valorAlvo)} ${c.unidade}`} | ${c.contribuicao === null ? "fora da conta" : f(c.contribuicao)} |`,
    ),
    "",
    "## Evidências (proveniência por camada)",
    ...p.evidencias.camadas.flatMap((c) => [
      `### ${c.camada}`,
      `- **Produto:** ${c.produto.nome} — ${c.produto.missao}`,
      `- **URL:** ${c.produto.url}`,
      `- **Versão:** ${c.produto.versao} · **Licença:** ${c.produto.licenca}`,
      `- **Recorte:** ${c.recorte.coordenadas} · ${c.recorte.epoca} · ${c.recorte.referencial} · ${c.recorte.area}`,
      `- **Qualidade:** ${c.qualidade.resolucao} · sem dado: ${c.qualidade.semDado} · ${c.qualidade.incerteza}`,
      "",
    ]),
    ...(p.evidencias.literatura.length
      ? [
          "**Literatura:**",
          ...p.evidencias.literatura.map((r) => `- ${r.titulo} — ${r.url}`),
          "",
        ]
      : [
          "**Literatura:** nenhum artigo trata este local como análogo (análogo proposto).",
          "",
        ]),
    "## Diferenças",
    ...p.diferencas.fisicas.map((d) => `- ${d}`),
    ...p.diferencas.doLocal.map((d) => `- ${d}`),
    `- ${p.diferencas.composicao}`,
    `- Critério mais diferente: ${p.diferencas.criterioMaisDiferente ?? "—"}`,
    `- Dados ausentes: ${p.diferencas.dadosAusentes.length ? p.diferencas.dadosAusentes.join("; ") : "nenhum"}`,
    "",
    "## Aplicação",
    `- **Experimento proposto:** ${p.aplicacao.experimento}`,
    ...(p.aplicacao.usoNaExploracao
      ? [`- **Uso já descrito:** ${p.aplicacao.usoNaExploracao}`]
      : []),
    `- **Não concluir:** ${p.aplicacao.naoConcluir}`,
    "",
    "## Reprodutibilidade",
    ...p.reprodutibilidade.rotas.map((r) => `- \`${r}\``),
    `- Código: ${p.reprodutibilidade.codigo.join(", ")}`,
    `- Parâmetros: ${p.reprodutibilidade.parametros}`,
  ];
  return linhas.join("\n");
}

export function PassaporteCientifico({
  objetivo,
  localId,
  candidatoId,
}: Props) {
  const [p, setP] = useState<Passaporte | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;
    setP(null);
    setErro(null);
    api
      .passaporte(objetivo, localId, candidatoId)
      .then((r) => ativo && setP(r))
      .catch(
        (e) => ativo && setErro(e instanceof ErroApi ? e.message : String(e)),
      );
    return () => {
      ativo = false;
    };
  }, [objetivo, localId, candidatoId]);

  return (
    <section className="painel passaporte">
      <div className="passo-cabecalho">
        <span className="passo-numero">06</span>
        <div>
          <h2>Concluir — passaporte científico</h2>
          {p && (
            <p className="ajuda">
              {p.referencia.candidato} × {p.referencia.alvo}
            </p>
          )}
        </div>
      </div>
      {erro && <p className="erro-texto">{erro}</p>}
      {!p && !erro && <p className="ajuda">Montando o passaporte…</p>}
      {p && (
        <>
          <div className="acoes-explorar">
            <span
              className={
                p.referencia.papel.startsWith("Referência")
                  ? "selo selo-estudado"
                  : "selo selo-proposto"
              }
            >
              {p.referencia.papel}
            </span>
            <button
              type="button"
              className="botao-secundario"
              onClick={() =>
                baixar(
                  `passaporte-${candidatoId}-${localId}.md`,
                  paraMarkdown(p),
                  "text/markdown",
                )
              }
            >
              Baixar (Markdown)
            </button>
            <button
              type="button"
              className="botao-secundario"
              onClick={() =>
                baixar(
                  `passaporte-${candidatoId}-${localId}.json`,
                  JSON.stringify(p, null, 2),
                  "application/json",
                )
              }
            >
              Baixar (JSON)
            </button>
          </div>

          <dl className="passaporte-campos">
            <dt>Referência</dt>
            <dd>
              {p.referencia.alvo} · objetivo{" "}
              <strong>{p.referencia.objetivo}</strong> ·{" "}
              {p.referencia.candidato} (lon {f(p.referencia.coordenadas.lon, 3)}
              , lat {f(p.referencia.coordenadas.lat, 3)})
            </dd>
            <dt>Métricas</dt>
            <dd>
              D = <strong>{f(p.metricas.distancia)}</strong> (
              {p.metricas.posicao ?? "—"}º de {p.metricas.total}) ·{" "}
              {p.metricas.cobertura} · {p.metricas.resolucao}
            </dd>
            <dt>Evidências</dt>
            <dd>
              <div className="tabela-rolagem">
                <table className="tabela-comparacao tabela-evidencias">
                  <thead>
                    <tr>
                      <th scope="col">Camada</th>
                      <th scope="col">Produto</th>
                      <th scope="col">Época</th>
                      <th scope="col">Resolução</th>
                      <th scope="col">Sem dado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {p.evidencias.camadas.map((c) => (
                      <tr key={c.camada}>
                        <th scope="row">{c.camada}</th>
                        <td>
                          <a
                            href={c.produto.url}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {c.produto.nome}
                          </a>
                          <span className="fonte-linha">
                            {c.produto.missao}
                          </span>
                        </td>
                        <td>{c.recorte.epoca}</td>
                        <td>{c.qualidade.resolucao}</td>
                        <td>{c.qualidade.semDado}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <details className="fontes">
                <summary>
                  Referencial, licença e incerteza de cada camada
                </summary>
                <ul>
                  {p.evidencias.camadas.map((c) => (
                    <li key={c.camada}>
                      <strong>{c.camada}:</strong> {c.recorte.referencial};{" "}
                      {c.recorte.coordenadas}; {c.recorte.area}. Licença:{" "}
                      {c.produto.licenca}. Versão: {c.produto.versao}.
                      Incerteza: {c.qualidade.incerteza}.
                    </li>
                  ))}
                </ul>
              </details>
              {p.evidencias.literatura.length > 0 ? (
                <ul className="ficha-referencias">
                  {p.evidencias.literatura.map((r) => (
                    <li key={r.url}>
                      <a href={r.url} target="_blank" rel="noreferrer">
                        {r.titulo}
                      </a>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="ajuda">
                  Nenhum artigo trata este local como análogo: é um análogo proposto
                  novo, apoiado só nas medidas.
                </p>
              )}
            </dd>
            <dt>Diferenças</dt>
            <dd>
              <ul>
                {[
                  ...p.diferencas.fisicas,
                  ...p.diferencas.doLocal,
                  p.diferencas.composicao,
                ].map((d) => (
                  <li key={d}>{d}</li>
                ))}
                <li>
                  Critério mais diferente:{" "}
                  {p.diferencas.criterioMaisDiferente ?? "—"}.
                </li>
                {p.diferencas.dadosAusentes.length > 0 && (
                  <li>
                    Dados ausentes: {p.diferencas.dadosAusentes.join("; ")}.
                  </li>
                )}
              </ul>
            </dd>
            <dt>Aplicação</dt>
            <dd>
              <strong>Experimento proposto:</strong> {p.aplicacao.experimento}
              {p.aplicacao.usoNaExploracao && (
                <span className="fonte-linha">
                  Uso já descrito: {p.aplicacao.usoNaExploracao}
                </span>
              )}
              <span className="fonte-linha">
                Não concluir: {p.aplicacao.naoConcluir}
              </span>
            </dd>
          </dl>
        </>
      )}
    </section>
  );
}
