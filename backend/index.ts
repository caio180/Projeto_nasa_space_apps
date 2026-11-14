import express from 'express';
import 'dotenv/config';
import cors from 'cors';

const app = express();
const porta = process.env.PORT;
const api = process.env.URL_API;


app.use(express.json());
app.use(cors());

// Só para ver se estava funcionando.
app.get('/', (req, res) => {
  res.send('Api funcionando');
});

app.post('/satellite', async (req, res) => {
  try {
    const resposta = await fetch(`${api}/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        collections: ['sentinel-2-l2a'],
        bbox: [-53, -25, -52, -24],
        datetime: '2025-01-01T00:00:00Z/2025-12-31T23:59:59Z',
        limit: 5,
      }),
    });

    if (!resposta.ok) {
      const erro = await resposta.text();
      res.status(resposta.status).json({ erro });
      return;
    }

    const dados = await resposta.json();
    res.json(dados);
  } catch (e) {
    console.error(e);
    res.status(500).json({ erro: 'Falha ao consultar a API de satélite' });
  }
});

app.listen(porta, () => console.log(`http://localhost:${porta}`));