// Como equipamentos da NASA se comportariam no análogo e no local de Marte/Lua.
// Tudo vem do backend (/api/compatibilidade → equipamentos), calculado sobre o
// MESMO relevo medido dos dois lados: declive dentro do limite do veículo,
// maior trecho contínuo transitável, peso e tempo para cruzar a janela.

import type { AvaliacaoEquipamento } from '../types.ts';

interface Props {
  equipamentos: AvaliacaoEquipamento[];
  nomeTerra: string;
  nomeAlvo: string;
}

const f = (n: number, casas = 1) => n.toLocaleString('pt-BR', { maximumFractionDigits: casas });

const VEREDITO: Record<AvaliacaoEquipamento['veredito'], { texto: string; classe: string }> = {
  parecido: { texto: 'Comportamento parecido', classe: 'veredito-ok' },
  'terra-mais-dificil': { texto: 'Análogo mais difícil', classe: 'veredito-aviso' },
  'terra-mais-facil': { texto: 'Análogo mais fácil', classe: 'veredito-aviso' },
};

function horas(h: number) {
  if (h < 1) return `${f(h * 60, 0)} min`;
  if (h < 48) return `${f(h)} h`;
  return `${f(h / 24)} dias`;
}

/** Barra dupla: % transitável na Terra e no alvo. */
function Barras({ terra, alvo }: { terra: number; alvo: number }) {
  return (
    <div className="barras-duplas" aria-hidden="true">
      <span className="barra-terra" style={{ width: `${terra}%` }} />
      <span className="barra-alvo" style={{ width: `${alvo}%` }} />
    </div>
  );
}

export function PainelEquipamentos({ equipamentos, nomeTerra, nomeAlvo }: Props) {
  if (equipamentos.length === 0) return null;

  return (
    <section className="painel">
      <div>
        <h2>Equipamentos da NASA nestes terrenos</h2>
        <p className="ajuda">
          Cada veículo tem um limite de declive. Medimos, no relevo real dos dois lados, quanto da área fica dentro desse
          limite e se dá para atravessar a janela sem passar por um trecho proibido.
        </p>
      </div>

      <div className="lista-equipamentos">
        {equipamentos.map((e) => {
          const v = VEREDITO[e.veredito];
          return (
            <article key={e.id} className="equipamento">
              <header className="equipamento-topo">
                <div>
                  <h3>{e.nome}</h3>
                  <p className="ajuda">{e.tipo}</p>
                </div>
                <span className={`veredito ${v.classe}`}>{v.texto}</span>
              </header>

              <div className="tabela-rolagem">
                <table className="tabela-comparacao">
                  <thead>
                    <tr>
                      <th scope="col">Limite de {e.declividadeMax}°</th>
                      <th scope="col">
                        <span className="ponto-terra" aria-hidden="true" /> {nomeTerra}
                      </th>
                      <th scope="col">
                        <span className="ponto-alvo" aria-hidden="true" /> {nomeAlvo}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <th scope="row">Área transitável</th>
                      <td>{f(e.terra.transitavel)}%</td>
                      <td>{f(e.alvo.transitavel)}%</td>
                    </tr>
                    <tr>
                      <th scope="row">Maior trecho contínuo</th>
                      <td>{f(e.terra.maiorTrechoContinuo)}%</td>
                      <td>{f(e.alvo.maiorTrechoContinuo)}%</td>
                    </tr>
                    <tr>
                      <th scope="row">Declive mais forte</th>
                      <td>{f(e.terra.declividadeMaxima)}°</td>
                      <td>{f(e.alvo.declividadeMaxima)}°</td>
                    </tr>
                    {e.terra.pesoKN > 0 && (
                      <tr>
                        <th scope="row">Peso do veículo</th>
                        <td>{f(e.terra.pesoKN, 2)} kN</td>
                        <td>{f(e.alvo.pesoKN, 2)} kN</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <Barras terra={e.terra.transitavel} alvo={e.alvo.transitavel} />

              <p>{e.explicacao}</p>
              <ul className="equipamento-notas">
                <li>
                  <strong>Limite:</strong> {e.origemLimite}
                  {e.obstaculoCm !== null && ` Passa por obstáculos de até ${e.obstaculoCm} cm.`}
                </li>
                {e.terra.pesoKN > 0 && (
                  <li>
                    <strong>Gravidade:</strong> na Terra ele pesa {f(e.razaoPeso)}× mais que em {nomeAlvo}: as rodas
                    afundam mais e os motores fazem mais força. {e.testeNaTerra}
                  </li>
                )}
                {e.terra.pesoKN === 0 && <li>{e.testeNaTerra}</li>}
                {e.energia !== '—' && (
                  <li>
                    <strong>Energia:</strong> {e.energia}
                  </li>
                )}
                {e.horasParaCruzar !== null && (
                  <li>
                    <strong>Tempo para cruzar a janela</strong> em linha reta, na velocidade máxima:{' '}
                    {horas(e.horasParaCruzar)} (sem contar paradas e desvios).
                  </li>
                )}
                {e.fontes.map((fo) => (
                  <li key={fo.url}>
                    <a href={fo.url} target="_blank" rel="noreferrer">
                      {fo.titulo}
                    </a>
                  </li>
                ))}
              </ul>
            </article>
          );
        })}
      </div>

      <p className="ajuda">
        Limitação: o pixel do relevo tem dezenas de metros, então pedras e degraus menores que isso não aparecem. O
        cálculo mede só a declividade; atrito, poeira e pedras soltas precisam de teste em campo.
      </p>
    </section>
  );
}
