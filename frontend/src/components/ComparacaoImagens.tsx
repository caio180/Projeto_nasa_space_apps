// Fotos de satélite reais da MESMA janela do relevo 3D, lado a lado:
// Terra (Sentinel-2, cor verdadeira) × Marte (MRO CTX) ou Lua (Kaguya TC).
// As duas têm o mesmo tamanho de chão e o mesmo número de pixels, então a
// barra de escala vale para as duas. "Tons de cinza" deixa a Terra como as
// câmeras de Marte/Lua enxergam (pancromáticas), para comparar só textura e forma.

import { useState } from 'react';
import type { ImagemSatelite } from '../types.ts';

interface Props {
  terra: ImagemSatelite | null;
  outro: ImagemSatelite | null;
  carregando: boolean;
  erros: { terra?: string; outro?: string };
  /** Há um local de Marte/Lua na comparação (mostra a segunda foto). */
  comparando: boolean;
  tituloOutro: string;
}

const f = (n: number, casas = 0) => n.toLocaleString('pt-BR', { maximumFractionDigits: casas });

/** Barra de escala "redonda" (1, 2 ou 5 km) que ocupa ~1/4 da largura da foto. */
function escala(img: ImagemSatelite) {
  const larguraKm = (img.largura * img.metrosPorPixel) / 1000;
  const alvo = larguraKm / 4;
  const potencia = 10 ** Math.floor(Math.log10(alvo));
  const km = [1, 2, 5, 10].map((m) => m * potencia).filter((v) => v <= alvo).pop() ?? potencia;
  return { km, fracao: km / larguraKm };
}

function Foto({ img, cinza, erro, titulo }: { img: ImagemSatelite | null; cinza: boolean; erro?: string; titulo: string }) {
  if (erro) {
    return (
      <figure className="foto-satelite">
        <figcaption className="cartao-relevo-titulo">{titulo}</figcaption>
        <div className="foto-vazia erro-texto">{erro}</div>
      </figure>
    );
  }
  if (!img) {
    return (
      <figure className="foto-satelite">
        <figcaption className="cartao-relevo-titulo">{titulo}</figcaption>
        <div className="foto-vazia">Carregando foto…</div>
      </figure>
    );
  }
  const { km, fracao } = escala(img);
  const simulada = cinza && img.simulacao !== null;
  return (
    <figure className="foto-satelite">
      <figcaption className="cartao-relevo-titulo">{img.nome ? `${img.corpo} · ${img.nome}` : img.corpo}</figcaption>
      <div className="foto-moldura">
        <img
          src={simulada ? img.simulacao!.png : img.png}
          alt={
            simulada
              ? `${img.nome ?? img.corpo} como a câmera ${img.simulacao!.sensor} veria`
              : `Foto de satélite de ${img.nome ?? img.corpo}`
          }
          style={{
            aspectRatio: `${img.largura} / ${img.altura}`,
            // Sem simulação disponível, o cinza do navegador é só uma aproximação visual.
            filter: cinza && !simulada && img.tipo === 'cor' ? 'grayscale(1)' : undefined,
          }}
        />
        <span className="foto-norte" aria-hidden="true">
          N ↑
        </span>
        <span className="foto-escala" style={{ width: `${fracao * 100}%` }}>
          {f(km, 1)} km
        </span>
      </div>
      <p className="ajuda">
        {simulada
          ? `Simulação da câmera ${img.simulacao!.sensor} (${img.simulacao!.faixa}): média das bandas ${img.simulacao!.bandas.join(', ')} do Sentinel-2`
          : img.instrumento}{' '}
        · ≈ {f(img.metrosPorPixel)} m por pixel
        {img.datas.length > 0 && ` · ${img.datas.join(', ')}`}
        {img.cobertura < 0.99 && ` · ${f(img.cobertura * 100)}% da janela com foto`}
        {img.sol && ` · Sol a ${f(img.sol.elevacao)}° do horizonte`}
      </p>
    </figure>
  );
}

export function ComparacaoImagens({ terra, outro, carregando, erros, comparando, tituloOutro }: Props) {
  const [cinza, setCinza] = useState(true);
  const simulacao = terra?.simulacao ?? null;
  if (!carregando && !terra && !outro && !erros.terra && !erros.outro) return null;

  return (
    <section className="painel">
      <div className="painel-topo">
        <h2>Fotos de satélite — mesma janela</h2>
        <label className="caixa-marcar">
          <input type="checkbox" checked={cinza} onChange={(e) => setCinza(e.target.checked)} />
          {simulacao ? `Terra vista pela câmera ${simulacao.sensor}` : 'Terra em tons de cinza'}
        </label>
      </div>
      <div className={comparando ? 'comparacao' : undefined}>
        <Foto img={terra} cinza={cinza} erro={erros.terra} titulo="Terra" />
        {comparando && <Foto img={outro} cinza={cinza} erro={erros.outro} titulo={tituloOutro} />}
      </div>
      <p className="ajuda">
        As fotos cobrem exatamente o chão do relevo 3D (mesmo tamanho e mesmo norte). Para compensar a diferença entre
        os sensores, a Terra é mostrada como a câmera de Marte ou da Lua a veria: média das bandas de refletância de
        superfície do Sentinel-2 (atmosfera já removida) dentro da faixa de comprimento de onda da câmera, com a mesma
        normalização de contraste aplicada às duas fotos. Assim sobra para comparar forma e textura: crateras, canais,
        dunas, derrames e rochas. As fotos são só visuais: nenhuma nota usa o brilho delas.
      </p>
      <details className="fontes">
        <summary>Fontes e notas</summary>
        <ul>
          {[terra, outro]
            .filter((i): i is ImagemSatelite => i !== null)
            .flatMap((i) => [
              <li key={i.fonte}>
                <strong>{i.fonte}</strong> — produto(s) {i.itens.join(', ')}
              </li>,
              ...i.notas.map((n) => <li key={i.fonte + n}>{n}</li>),
            ])}
        </ul>
      </details>
    </section>
  );
}
