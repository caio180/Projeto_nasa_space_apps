// =============================================================================
// ROUTES — só define os endpoints e qual controller atende cada um.
// O prefixo /api é aplicado no index.ts.
// =============================================================================

import { Router } from 'express';
import {
  getColecao,
  getColecoes,
  getCompatibilidade,
  getComposicaoLocal,
  getImagemLocal,
  getObjetivos,
  getPassaporte,
  getRanking,
  getAmbiente,
  getAnalogos,
  getLocais,
  getRelevoLocal,
  postBuscaSatelite,
  postImagem,
  postRelevo,
} from '../controller/controller.ts';

const rotas = Router();

rotas.get('/colecoes', getColecoes);
rotas.get('/colecoes/:id', getColecao);
rotas.post('/satelite/busca', postBuscaSatelite);
rotas.post('/relevo', postRelevo);
rotas.get('/analogos', getAnalogos);
rotas.get('/ambiente', getAmbiente);
rotas.get('/compatibilidade', getCompatibilidade);
rotas.get('/locais', getLocais);
rotas.get('/locais/:id/relevo', getRelevoLocal);
rotas.get('/locais/:id/composicao', getComposicaoLocal);
rotas.post('/imagem', postImagem);
rotas.get('/objetivos', getObjetivos);
rotas.get('/ranking', getRanking);
rotas.get('/passaporte', getPassaporte);
rotas.get('/locais/:id/imagem', getImagemLocal);

export default rotas;
