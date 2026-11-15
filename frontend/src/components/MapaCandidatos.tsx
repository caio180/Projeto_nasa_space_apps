// Mapa dos locais da Terra analisados para o alvo escolhido (MapLibre).
// Fundo: mosaico Blue Marble do NASA GIBS (Earthdata), sem chave de acesso.
// Cor = distância ponderada ao alvo (uma só cor, do mais claro = mais perto
// ao mais escuro = mais longe). Forma = papel: círculo = referência da
// literatura; losango = análogo proposto (hipótese).

import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { LinhaRanking } from '../types.ts';

interface Props {
  linhas: LinhaRanking[];
  selecionado: string | null;
  candidatoNovo: string | null;
  onSelecionar: (id: string) => void;
}

/** Rampa sequencial de um só tom: índice 0 = mais perto do alvo. */
export const RAMPA_DISTANCIA = ['#dbeafe', '#93c5fd', '#4a96ea', '#1f6fd1', '#173f7a'];

/** Classe (0–4) pelos quintis das distâncias; null = sem distância. */
export function classeDistancia(d: number | null, todas: number[]) {
  if (d === null || todas.length === 0) return null;
  const ordenadas = [...todas].sort((a, b) => a - b);
  const posicao = ordenadas.findIndex((x) => x >= d);
  return Math.min(4, Math.floor((posicao / ordenadas.length) * 5));
}

const GIBS =
  'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_ShadedRelief_Bathymetry/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpeg';

export function MapaCandidatos({ linhas, selecionado, candidatoNovo, onSelecionar }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapaRef = useRef<maplibregl.Map | null>(null);
  const marcadoresRef = useRef<maplibregl.Marker[]>([]);
  const aoSelecionar = useRef(onSelecionar);
  aoSelecionar.current = onSelecionar;

  // Cria o mapa uma vez.
  useEffect(() => {
    if (!containerRef.current) return;
    const mapa = new maplibregl.Map({
      container: containerRef.current,
      style: {
        version: 8,
        sources: {
          gibs: {
            type: 'raster',
            tiles: [GIBS],
            tileSize: 256,
            maxzoom: 8,
            attribution: 'Imagem: NASA GIBS / Blue Marble (Earthdata)',
          },
        },
        layers: [{ id: 'gibs', type: 'raster', source: 'gibs' }],
      },
      center: [0, 15],
      zoom: 0.8,
      maxZoom: 8,
      attributionControl: { compact: true },
    });
    mapa.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    mapaRef.current = mapa;
    return () => {
      mapa.remove();
      mapaRef.current = null;
    };
  }, []);

  // Marcadores: refeitos quando o ranking ou a seleção mudam.
  useEffect(() => {
    const mapa = mapaRef.current;
    if (!mapa) return;
    for (const m of marcadoresRef.current) m.remove();
    const distancias = linhas.map((l) => l.distancia).filter((d): d is number => d !== null);

    marcadoresRef.current = linhas.map((l) => {
      const classe = classeDistancia(l.distancia, distancias);
      const el = document.createElement('button');
      el.type = 'button';
      el.className = [
        'marcador',
        l.papel === 'candidato' ? 'marcador-candidato' : 'marcador-referencia',
        l.id === selecionado ? 'marcador-selecionado' : '',
        l.id === candidatoNovo ? 'marcador-novo' : '',
      ].join(' ');
      el.style.background = classe === null ? '#6b7280' : RAMPA_DISTANCIA[classe];
      const rotulo = `${l.posicao ? `${l.posicao}º · ` : ''}${l.nome}${l.distancia !== null ? ` · D ${l.distancia.toLocaleString('pt-BR')}` : ' · sem distância'}`;
      el.title = rotulo;
      el.setAttribute('aria-label', rotulo);
      el.addEventListener('click', () => aoSelecionar.current(l.id));
      return new maplibregl.Marker({ element: el }).setLngLat([l.lon, l.lat]).addTo(mapa);
    });
  }, [linhas, selecionado, candidatoNovo]);

  // Centraliza no local escolhido.
  useEffect(() => {
    const l = linhas.find((x) => x.id === selecionado);
    if (l && mapaRef.current) mapaRef.current.flyTo({ center: [l.lon, l.lat], zoom: 4, speed: 1.4 });
  }, [selecionado, linhas]);

  return (
    <figure className="mapa-candidatos">
      <div ref={containerRef} className="mapa-candidatos-area" role="region" aria-label="Mapa dos locais analisados" />
      <figcaption className="legenda-mapa">
        <span className="legenda-rampa-distancia" aria-hidden="true">
          {RAMPA_DISTANCIA.map((c) => (
            <span key={c} style={{ background: c }} />
          ))}
        </span>
        <span>mais perto do alvo → mais longe (quintis de D)</span>
        <span>
          <span className="forma-legenda forma-referencia" aria-hidden="true" /> referência da literatura
        </span>
        <span>
          <span className="forma-legenda forma-candidato" aria-hidden="true" /> análogo proposto (hipótese)
        </span>
      </figcaption>
    </figure>
  );
}
