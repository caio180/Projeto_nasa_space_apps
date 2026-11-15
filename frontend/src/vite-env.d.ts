/// <reference types="vite/client" />

// Variáveis lidas no BUILD do frontend (só as que começam com VITE_ chegam ao navegador).
interface ImportMetaEnv {
  /** Endereço do backend quando front e back ficam em hospedagens separadas. Vazio = mesmo endereço do site. */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
