// =============================================================================
// index.ts — inicializa o servidor. Não tem regra de negócio aqui:
// só middlewares, rotas, 404 e tratamento central de erros.
//
// Em produção (Azure App Service) o MESMO servidor entrega o site: o build do
// frontend fica em backend/public (npm run build:azure no frontend). Assim o
// site e a API ficam no mesmo endereço e o frontend continua chamando "/api".
// =============================================================================

import 'dotenv/config'; // precisa vir primeiro para o .env estar carregado nos outros módulos
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import cors from 'cors';
import { existsSync } from 'node:fs';
import path from 'node:path';
import rotas from './routes/rotas.ts';
import { AppError } from './model/model.ts';

const app = express();
const porta = Number(process.env.PORT);

app.use(express.json());
// CORS: quais sites podem chamar esta API pelo navegador.
// - Sem CORS_ORIGIN: qualquer site (a API é pública e só lê dados abertos).
// - Com CORS_ORIGIN (lista separada por vírgula, ex.:
//   https://planetmatch.onrender.com,https://planetmatch.earth): só esses sites.
const origensPermitidas = (process.env.CORS_ORIGIN ?? '')
  .split(',')
  .map((o) => o.trim().replace(/\/+$/, ''))
  .filter(Boolean);
app.use(cors(origensPermitidas.length ? { origin: origensPermitidas } : undefined));

// Verificação de saúde (usada também pelo Azure para saber se o app subiu).
app.get('/api/status', (_req, res) => {
  res.json({ status: 'ok', mensagem: 'API funcionando' });
});

app.use('/api', rotas);

// Site compilado (só existe depois do build do frontend).
const pastaSite = path.join(import.meta.dirname, 'public');
const paginaSite = path.join(pastaSite, 'index.html');
if (existsSync(paginaSite)) {
  app.use(express.static(pastaSite, { maxAge: '1h', index: false }));
  // Qualquer GET fora de /api devolve a página do site (ela cuida da navegação).
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api')) return next();
    res.sendFile(paginaSite);
  });
} else {
  app.get('/', (_req, res) => {
    res.json({ status: 'ok', mensagem: 'API funcionando (site não compilado: rode npm run build:azure no frontend)' });
  });
}

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
