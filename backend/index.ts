// =============================================================================
// index.ts — inicializa o servidor. Não tem regra de negócio aqui:
// só middlewares, rotas, 404 e tratamento central de erros.
// =============================================================================

import 'dotenv/config'; // precisa vir primeiro para o .env estar carregado nos outros módulos
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import cors from 'cors';
import rotas from './routes/rotas.ts';
import { AppError } from './model/model.ts';

const app = express();
const porta = Number(process.env.PORT);

app.use(express.json());
app.use(cors());

app.get('/', (_req, res) => {
  res.json({ status: 'ok', mensagem: 'API funcionando' });
});

app.use('/api', rotas);

// Nenhuma rota respondeu → 404 em JSON.
app.use((req, res) => {
  res.status(404).json({ erro: `Rota não encontrada: ${req.method} ${req.originalUrl}` });
});

// Error handler central: precisa ter 4 parâmetros para o Express reconhecer.
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof AppError) {
    res.status(err.status).json({ erro: err.message, detalhes: err.detalhes });
    return;
  }
  // JSON malformado no body (express.json) chega aqui com status 400.
  if (err instanceof SyntaxError && 'status' in err && err.status === 400) {
    res.status(400).json({ erro: 'JSON inválido no corpo da requisição.' });
    return;
  }
  console.error(err);
  res.status(500).json({ erro: 'Erro interno do servidor.' });
});

app.listen(porta, () => console.log(`Servidor em http://localhost:${porta}`));
