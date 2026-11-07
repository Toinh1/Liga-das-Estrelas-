# ⭐ Liga das Estrelas ⭐ — Campeonato de Sábado

Aplicativo completo, moderno e responsivo para gestão oficial do baba **⭐ Liga das Estrelas ⭐**, com disputa entre linhas (18 ou 24 atletas), classificação automática, registro de partidas, votação secreta para premiações individuais, galeria **"Momentos da Pelada"** e histórico estatístico completo.

## Como Executar

```bash
npm install
npm run dev
```

Acesse `http://localhost:5173` no computador ou pelo navegador do celular na mesma rede Wi-Fi.

## Arquitetura de Banco de Dados & Firebase

- **Pronto para uso imediato (SQLite Persistente + Tempo Real via SSE):** Por padrão, o servidor integrado persiste todos os dados em `data/baba-stats.sqlite` e as fotos enviadas em `data/uploads/`, sincronizando múltiplos usuários simultaneamente em tempo real.
- **Integração Nativa com Firebase (`Auth + Cloud Firestore + Storage`):**
  - Preencha as variáveis `VITE_FIREBASE_*` no arquivo `.env` (baseado em `.env.example`) ou diretamente na interface do aplicativo (`Configurar Firebase`).
  - As regras de segurança para perfis (`admin` vs `player`), bloqueio de voto duplicado, bloqueio de autovoto e sigilo dos votos até o encerramento estão em `firestore.rules` e `storage.rules`.
