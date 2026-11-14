// =============================================================================
// Relevo3D — transforma a grade de elevação do backend numa superfície 3D
// com three.js puro (sem React Three Fiber, para ter uma dependência a menos).
//
// Como funciona:
//   1. Um PlaneGeometry com (largura × altura) vértices — um por pixel do DEM.
//   2. A coordenada Z de cada vértice recebe a elevação (em km × exagero).
//   3. A cor vem da altitude (rampa hipsométrica) OU da foto de satélite real
//      da mesma janela, usada como textura (as duas têm o norte no topo).
//   4. Paredes laterais e um fundo transformam a superfície num "bloco" de
//      terreno, como uma maquete — fica mais fácil ler a forma do relevo.
//   5. Uma régua vertical no canto mostra a altura REAL em metros. Ela estica
//      junto com o exagero, mas os números continuam sendo os metros reais.
//   6. O plano é deitado (rotação de -90° em X): o norte fica "para dentro" da tela.
//
// Unidade da cena: QUILÔMETROS. Assim largura, altura e elevação ficam na
// mesma escala e o relevo não fica distorcido (a não ser pelo exagero vertical).
// =============================================================================

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { Relevo } from '../types.ts';

export type ModoCor = 'altitude' | 'foto';

interface Props {
  relevo: Relevo;
  exagero: number;
  /** Foto de satélite da MESMA janela (data URL). */
  textura?: string | null;
  modo?: ModoCor;
}

// Rampa de cores por altitude relativa (0 = mínimo da área, 1 = máximo).
const RAMPA: [number, string][] = [
  [0.0, '#2f5d50'],
  [0.25, '#5f8f55'],
  [0.5, '#c8b46a'],
  [0.75, '#9a6a3c'],
  [1.0, '#f1ede6'],
];
const CORES_RAMPA = RAMPA.map(([t, hex]) => [t, new THREE.Color(hex)] as const);
const COR_SEM_DADO = new THREE.Color('#555a63');
const COR_BLOCO = '#3a3f4a';
const COR_REGUA = '#ffd166';

function corDaAltitude(t: number, destino: THREE.Color) {
  for (let i = 1; i < CORES_RAMPA.length; i++) {
    const [t1, c1] = CORES_RAMPA[i];
    if (t <= t1) {
      const [t0, c0] = CORES_RAMPA[i - 1];
      return destino.lerpColors(c0, c1, (t - t0) / (t1 - t0));
    }
  }
  return destino.copy(CORES_RAMPA[CORES_RAMPA.length - 1][1]);
}

/** CSS da rampa, para a legenda usar exatamente as mesmas cores do 3D. */
export const GRADIENTE_LEGENDA = `linear-gradient(to right, ${RAMPA.map(([t, c]) => `${c} ${t * 100}%`).join(', ')})`;

/**
 * Os modelos de Marte e da Lua têm buracos onde o sensor não mediu (sombra,
 * falta de par estéreo). Antes a malha ficava vazada ali e parecia que "sumia
 * parte do terreno". Agora preenchemos os buracos SÓ PARA O DESENHO: cada pixel
 * vazio recebe a média dos vizinhos com valor, de fora para dentro, até fechar.
 * Esses pontos são pintados de cinza e nenhuma medida os usa (as estatísticas
 * vêm do backend, só com dado real).
 */
function preencherBuracos(elevacoes: (number | null)[], largura: number, altura: number) {
  const valores = elevacoes.map((e) => e ?? Number.NaN);
  const interpolado = new Uint8Array(valores.length);
  let faltando = elevacoes.reduce<number[]>((acc, e, i) => (e === null ? (acc.push(i), acc) : acc), []);
  if (faltando.length === valores.length) return { valores: valores.map(() => 0), interpolado: interpolado.fill(1) };
  while (faltando.length > 0) {
    const resolvidos: [number, number][] = [];
    const ainda: number[] = [];
    for (const i of faltando) {
      const x = i % largura;
      const y = (i - x) / largura;
      let soma = 0;
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if ((dx || dy) && nx >= 0 && ny >= 0 && nx < largura && ny < altura) {
            const v = valores[ny * largura + nx];
            if (!Number.isNaN(v)) {
              soma += v;
              n++;
            }
          }
        }
      }
      if (n > 0) resolvidos.push([i, soma / n]);
      else ainda.push(i);
    }
    if (resolvidos.length === 0) break; // não deveria acontecer (há pelo menos um valor)
    for (const [i, v] of resolvidos) {
      valores[i] = v;
      interpolado[i] = 1;
    }
    faltando = ainda;
  }
  return { valores, interpolado };
}

/** Desenha a foto sobre um fundo cinza: onde o sensor não fotografou fica cinza, não preto. */
function fotoComFundo(imagem: HTMLImageElement) {
  const canvas = document.createElement('canvas');
  canvas.width = imagem.naturalWidth;
  canvas.height = imagem.naturalHeight;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#6b7280';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(imagem, 0, 0);
  return canvas;
}

/** Índices dos vértices da borda, dando a volta: norte → leste → sul → oeste. */
function indicesDaBorda(largura: number, altura: number) {
  const borda: number[] = [];
  for (let x = 0; x < largura; x++) borda.push(x); // norte (linha 0)
  for (let y = 1; y < altura; y++) borda.push(y * largura + largura - 1); // leste
  for (let x = largura - 2; x >= 0; x--) borda.push((altura - 1) * largura + x); // sul
  for (let y = altura - 2; y > 0; y--) borda.push(y * largura); // oeste
  borda.push(0); // fecha o anel
  return borda;
}

/**
 * Paredes do bloco: para cada vértice da borda, um par (topo = superfície,
 * base = fundo). Os triângulos ligam pares vizinhos. As posições do topo são
 * atualizadas junto com o exagero.
 */
function criarParedes(borda: number[]) {
  const geometria = new THREE.BufferGeometry();
  geometria.setAttribute('position', new THREE.BufferAttribute(new Float32Array(borda.length * 2 * 3), 3));
  const indices: number[] = [];
  for (let i = 0; i < borda.length - 1; i++) {
    const topo = i * 2;
    const base = i * 2 + 1;
    indices.push(topo, base, topo + 2, base, base + 2, topo + 2);
  }
  geometria.setIndex(indices);
  return geometria;
}

/** Escreve Z = elevação (km) × exagero em cada vértice e acompanha as paredes. */
function aplicarElevacao(
  geometria: THREE.PlaneGeometry,
  paredes: THREE.BufferGeometry,
  borda: number[],
  relevo: Relevo,
  valores: number[],
  exagero: number,
  fundoKm: number,
) {
  const posicoes = geometria.attributes.position;
  const { minimo } = relevo.estatisticas;
  for (let i = 0; i < valores.length; i++) {
    posicoes.setZ(i, ((valores[i] - minimo) / 1000) * exagero);
  }
  posicoes.needsUpdate = true;
  geometria.computeVertexNormals(); // normais novas = sombreamento correto
  geometria.computeBoundingSphere();

  const p = paredes.attributes.position;
  borda.forEach((v, i) => {
    const x = posicoes.getX(v);
    const y = posicoes.getY(v);
    p.setXYZ(i * 2, x, y, posicoes.getZ(v));
    p.setXYZ(i * 2 + 1, x, y, -fundoKm);
  });
  p.needsUpdate = true;
  paredes.computeVertexNormals();
  paredes.computeBoundingSphere();
}

/** Passo "redondo" (1, 2 ou 5 × 10ⁿ) para ~4 marcas na régua. */
function passoRedondo(amplitude: number) {
  const bruto = Math.max(amplitude, 1) / 4;
  const potencia = 10 ** Math.floor(Math.log10(bruto));
  const fator = bruto / potencia;
  return (fator < 1.5 ? 1 : fator < 3.5 ? 2 : 5) * potencia;
}

/** Texto como sprite (sempre de frente para a câmera). */
function rotulo(texto: string, alturaKm: number) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  const fonte = 'bold 40px system-ui, sans-serif';
  ctx.font = fonte;
  canvas.width = Math.ceil(ctx.measureText(texto).width) + 24;
  canvas.height = 56;
  ctx.font = fonte;
  ctx.fillStyle = 'rgba(11, 15, 23, 0.75)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = COR_REGUA;
  ctx.textBaseline = 'middle';
  ctx.fillText(texto, 12, canvas.height / 2);
  const textura = new THREE.CanvasTexture(canvas);
  textura.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: textura, depthTest: false }));
  sprite.scale.set((alturaKm * canvas.width) / canvas.height, alturaKm, 1);
  sprite.renderOrder = 10;
  return sprite;
}

/**
 * Régua vertical no canto noroeste do bloco. A linha vai do ponto mais baixo
 * ao mais alto da área; as marcas ficam a cada `passo` metros REAIS. Com
 * exagero 3×, 100 m reais ocupam 0,3 km de altura na cena — mas a marca
 * continua dizendo "100 m".
 */
function criarRegua(relevo: Relevo, exagero: number, larguraKm: number, alturaKm: number, maiorLado: number) {
  const grupo = new THREE.Group();
  const { amplitude } = relevo.estatisticas;
  const x = -larguraKm / 2 - maiorLado * 0.03;
  const y = alturaKm / 2;
  const zMax = (amplitude / 1000) * exagero;
  const material = new THREE.LineBasicMaterial({ color: COR_REGUA, depthTest: false });

  const pontos = [new THREE.Vector3(x, y, 0), new THREE.Vector3(x, y, zMax)];
  const passo = passoRedondo(amplitude);
  const tamanhoMarca = maiorLado * 0.015;
  const alturaTexto = maiorLado * 0.035;
  // A última marca redonda some se ficar colada no rótulo do topo (amplitude real).
  for (let m = 0; m <= amplitude - passo * 0.35; m += passo) {
    const z = (m / 1000) * exagero;
    pontos.push(new THREE.Vector3(x - tamanhoMarca, y, z), new THREE.Vector3(x + tamanhoMarca, y, z));
    const texto = rotulo(`${m.toLocaleString('pt-BR')} m`, alturaTexto);
    texto.position.set(x - tamanhoMarca - (texto.scale.x / 2) * 1.05, y, z);
    grupo.add(texto);
  }
  // Marca do topo com a amplitude real (nem sempre cai numa marca redonda).
  pontos.push(new THREE.Vector3(x - tamanhoMarca * 2, y, zMax), new THREE.Vector3(x + tamanhoMarca * 2, y, zMax));
  const topo = rotulo(`${Math.round(amplitude).toLocaleString('pt-BR')} m reais`, alturaTexto);
  topo.position.set(x + tamanhoMarca * 3 + topo.scale.x / 2, y, zMax);
  grupo.add(topo);

  // Pares de pontos → segmentos (a linha vertical + as marcas).
  const segmentos = [pontos[0], pontos[1], ...pontos.slice(2)];
  const linha = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(segmentos), material);
  linha.renderOrder = 10;
  grupo.add(linha);
  return grupo;
}

/** Libera da GPU tudo o que um objeto e os filhos usam. */
function descartar(objeto: THREE.Object3D) {
  objeto.traverse((o) => {
    const m = o as THREE.Mesh;
    m.geometry?.dispose();
    const materiais = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
    for (const mat of materiais) {
      (mat as THREE.SpriteMaterial).map?.dispose();
      mat.dispose();
    }
  });
}

export function Relevo3D({ relevo, exagero, textura = null, modo = 'altitude' }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  // Guardamos o que muda depois (exagero, modo de cor) para não recriar a cena inteira.
  const cenaRef = useRef<{
    valores: number[];
    coresAltitude: Float32Array;
    coresFoto: Float32Array;
    geometria: THREE.PlaneGeometry;
    paredes: THREE.BufferGeometry;
    borda: number[];
    material: THREE.MeshStandardMaterial;
    terreno: THREE.Mesh;
    regua: THREE.Group | null;
    dimensoes: { larguraKm: number; alturaKm: number; maiorLado: number; fundoKm: number };
  } | null>(null);
  const exageroRef = useRef(exagero);
  exageroRef.current = exagero;

  // ---- Cria a cena quando chega um relevo novo ----
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const larguraKm = (relevo.largura * relevo.metrosPorPixel.x) / 1000;
    const alturaKm = (relevo.altura * relevo.metrosPorPixel.y) / 1000;
    const maiorLado = Math.max(larguraKm, alturaKm);
    const fundoKm = maiorLado * 0.04; // espessura do "bloco" abaixo do ponto mais baixo

    // Renderer: desenha no <canvas> que colocamos dentro do container.
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.toneMapping = THREE.ACESFilmicToneMapping; // realces e sombras mais naturais
    renderer.toneMappingExposure = 1.05;
    container.appendChild(renderer.domElement);

    const cena = new THREE.Scene();
    cena.background = new THREE.Color('#0b0f17');

    const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.01, maiorLado * 20);
    camera.position.set(0, maiorLado * 0.7, maiorLado * 1.25); // ao sul, olhando para o norte

    // Luz: céu/chão suave + "sol" baixo vindo do noroeste (como num mapa de sombreamento).
    cena.add(new THREE.HemisphereLight('#dfe8ff', '#3a3326', 1.1));
    const sol = new THREE.DirectionalLight('#fff4e0', 2.6);
    sol.position.set(-maiorLado, maiorLado * 0.8, -maiorLado * 0.6);
    cena.add(sol);

    // Superfície: um vértice por pixel do DEM.
    const geometria = new THREE.PlaneGeometry(larguraKm, alturaKm, relevo.largura - 1, relevo.altura - 1);
    const { minimo, amplitude } = relevo.estatisticas;
    const { valores, interpolado } = preencherBuracos(relevo.elevacoes, relevo.largura, relevo.altura);
    // Duas paletas: altitude (rampa) e foto (branco = foto pura; cinza = sem dado).
    const coresAltitude = new Float32Array(valores.length * 3);
    const coresFoto = new Float32Array(valores.length * 3).fill(1);
    const cor = new THREE.Color();
    valores.forEach((e, i) => {
      if (interpolado[i]) {
        COR_SEM_DADO.toArray(coresAltitude, i * 3);
        coresFoto.set([0.55, 0.55, 0.6], i * 3);
      } else {
        corDaAltitude(amplitude > 0 ? (e - minimo) / amplitude : 0, cor).toArray(coresAltitude, i * 3);
      }
    });
    geometria.setAttribute('color', new THREE.BufferAttribute(coresAltitude, 3));

    const borda = indicesDaBorda(relevo.largura, relevo.altura);
    const paredes = criarParedes(borda);
    aplicarElevacao(geometria, paredes, borda, relevo, valores, exageroRef.current, fundoKm);

    const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0 });
    const terreno = new THREE.Mesh(geometria, material);
    terreno.rotation.x = -Math.PI / 2; // deita o plano: +Y da imagem (norte) vira -Z

    // Bloco: paredes + fundo, na mesma cor neutra.
    const materialBloco = new THREE.MeshStandardMaterial({ color: COR_BLOCO, roughness: 1, side: THREE.DoubleSide });
    terreno.add(new THREE.Mesh(paredes, materialBloco));
    const fundo = new THREE.Mesh(new THREE.PlaneGeometry(larguraKm, alturaKm), materialBloco);
    fundo.position.z = -fundoKm;
    fundo.rotation.x = Math.PI; // virado para baixo
    terreno.add(fundo);
    cena.add(terreno);

    const regua = criarRegua(relevo, exageroRef.current, larguraKm, alturaKm, maiorLado);
    terreno.add(regua);

    cenaRef.current = {
      valores,
      coresAltitude,
      coresFoto,
      geometria,
      paredes,
      borda,
      material,
      terreno,
      regua,
      dimensoes: { larguraKm, alturaKm, maiorLado, fundoKm },
    };

    // Controles: arrastar gira, roda do mouse aproxima, botão direito move.
    const controles = new OrbitControls(camera, renderer.domElement);
    controles.enableDamping = true;
    controles.maxPolarAngle = Math.PI / 2 - 0.05; // não deixa a câmera ir para baixo do chão
    controles.minDistance = maiorLado * 0.05;
    controles.maxDistance = maiorLado * 5;

    renderer.setAnimationLoop(() => {
      controles.update();
      renderer.render(cena, camera);
    });

    // Acompanha o tamanho do container (layout responsivo).
    const observador = new ResizeObserver(() => {
      const { clientWidth: w, clientHeight: h } = container;
      if (w === 0 || h === 0) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    });
    observador.observe(container);

    // Limpeza: sem isto, cada relevo novo deixaria memória de GPU presa.
    return () => {
      observador.disconnect();
      renderer.setAnimationLoop(null);
      controles.dispose();
      material.map?.dispose();
      descartar(terreno);
      renderer.dispose();
      renderer.domElement.remove();
      cenaRef.current = null;
    };
  }, [relevo]);

  // ---- Só muda o exagero: reaproveita a cena e refaz a régua ----
  useEffect(() => {
    const c = cenaRef.current;
    if (!c) return;
    aplicarElevacao(c.geometria, c.paredes, c.borda, relevo, c.valores, exagero, c.dimensoes.fundoKm);
    if (c.regua) {
      c.terreno.remove(c.regua);
      descartar(c.regua);
    }
    const { larguraKm, alturaKm, maiorLado } = c.dimensoes;
    c.regua = criarRegua(relevo, exagero, larguraKm, alturaKm, maiorLado);
    c.terreno.add(c.regua);
  }, [exagero, relevo]);

  // ---- Cor da superfície: altitude ou foto de satélite ----
  useEffect(() => {
    const c = cenaRef.current;
    if (!c) return;
    let cancelado = false;
    const usarCores = (cores: Float32Array) => {
      c.geometria.setAttribute('color', new THREE.BufferAttribute(cores, 3));
    };
    const usarAltitude = () => {
      c.material.map?.dispose();
      c.material.map = null;
      usarCores(c.coresAltitude);
      c.material.needsUpdate = true;
    };
    if (modo === 'foto' && textura) {
      const imagem = new Image();
      imagem.onload = () => {
        if (cancelado || cenaRef.current !== c) return;
        const t = new THREE.CanvasTexture(fotoComFundo(imagem));
        t.colorSpace = THREE.SRGBColorSpace;
        t.anisotropy = 8;
        c.material.map?.dispose();
        c.material.map = t;
        usarCores(c.coresFoto); // foto × branco = foto; foto × cinza = trecho sem dado
        c.material.needsUpdate = true;
      };
      imagem.src = textura;
    } else {
      usarAltitude();
    }
    return () => {
      cancelado = true;
    };
  }, [modo, textura, relevo]);

  return (
    <div className="relevo-3d" ref={containerRef} role="img" aria-label="Modelo 3D do relevo da área">
      <span className="relevo-norte" aria-hidden="true">
        N ↑
      </span>
      {relevo.estatisticas.pixelsSemDado > 0 && (
        <span className="relevo-buracos-legenda">
          <span className="buraco-amostra" aria-hidden="true" /> cinza = sem dado do sensor (
          {Math.round((100 * relevo.estatisticas.pixelsSemDado) / relevo.elevacoes.length)}%), preenchido só no
          desenho
        </span>
      )}
      <span className="relevo-regua-legenda">
        <span className="regua-amostra" aria-hidden="true" /> régua = altura real em metros
        {exagero !== 1 && ` (desenhada ${exagero}× mais alta)`}
      </span>
    </div>
  );
}
