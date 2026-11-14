// Tela principal, no formato "Planetary Twin Explorer" do guia de mentoria:
// primeiro o objetivo, o alvo, o ranking explicável, o mapa e o passaporte
// (as evidências); abaixo, a comparação detalhada com relevo 3D e fotos.
// Toda chamada ao backend passa por src/api.ts.

import { useState } from 'react';
import { Explorador } from './components/Explorador.tsx';
import { PainelRelevo } from './components/PainelRelevo.tsx';
import type { PedidoComparacao } from './components/PainelRelevo.tsx';

export default function App() {
  const [pedido, setPedido] = useState<PedidoComparacao | null>(null);

  return (
    <div className="app">
      <header className="cabecalho">
        <h1>PlanetMatch</h1>
      </header>
      <main className="principal">
        <Explorador onComparar={(candidato, localId) => setPedido({ candidato, localId, chave: Date.now() })} />
        <h2 className="titulo-secao">Comparação detalhada — evidências por camada, depois o 3D</h2>
        <PainelRelevo pedido={pedido} />
      </main>
    </div>
  );
}
