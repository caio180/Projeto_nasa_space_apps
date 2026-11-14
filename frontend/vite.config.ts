import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// O proxy repassa /api para o backend Express. Assim o frontend usa URLs
// relativas ("/api/...") e não precisamos fixar a porta do backend no código.
//
// A porta vem do PRÓPRIO .env do backend (PORT), para existir um lugar só
// onde ela é definida. loadEnv lê ../backend/.env; o '' carrega todas as
// variáveis, não só as que começam com VITE_.
export default defineConfig(({ mode }) => {
  const envBackend = loadEnv(mode, '../backend', '');
  const portaBackend = envBackend.PORT;
  if (!portaBackend) {
    throw new Error('PORT não encontrada em backend/.env — copie backend/.env.example para backend/.env.');
  }

  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        '/api': `http://localhost:${portaBackend}`,
      },
    },
  };
});
