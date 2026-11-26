# ⚽ FutebolB3

Plataforma de gerenciamento de baba e ligas de futebol amador: presença, sorteio equilibrado de
times, registro de jogos com gols e assistências, classificação, rankings, premiações, votação,
galeria de fotos e temporadas.

## Como executar

```bash
npm install
npm run dev      # http://localhost:5173 (também acessível pelo celular na mesma rede)
npm test         # testes do sorteio, estatísticas e premiações (Node 22+)
npm run build    # build de produção (PWA) em dist/
```

## Arquitetura

| Camada | Arquivos | Papel |
|---|---|---|
| Tipos | `src/types/domain.ts` | Modelo de dados (jogador, pelada, temporada, partida...) |
| Dados | `src/services/babaService.ts` | Escritas no Firestore com validação, cascata e proteção contra duplicidade |
| Tempo real | `src/services/realtimeStore.ts` | Assina cada coleção uma vez (`onSnapshot`) e monta o snapshot local |
| Compatibilidade | `src/services/normalize.ts` | Valores padrão para documentos antigos (nível 3, ativo, sem assistências) |
| Regras de negócio | `src/utils/statsEngine.ts`, `awardsEngine.ts`, `teamBalancer.ts` | Funções puras e testadas |
| Estado | `src/context/BabaContext.tsx` | Sessão, seção ativa, toasts, `runAction` |
| Telas | `src/pages/*`, `src/components/*` | Início, Pelada, Jogadores, Ranking, Premiações, Votação, Fotos, Perfil |

Backend: **Firebase Auth + Cloud Firestore** (Storage opcional com `VITE_FIREBASE_USE_STORAGE=true`).
A configuração pública fica em `src/services/firebaseClient.ts` e pode ser trocada pelas variáveis
`VITE_FIREBASE_*` do `.env`.

### Coleções do Firestore

`users` · `players` · `lines` (equipes/cores) · `seasons` · `peladas` (presenças e escalações) ·
`matches` (placar, autores dos gols, assistências e escalação de cada lado) · `goals` (ajustes
históricos anteriores ao registro por partida) · `votes` · `awards` · `photos` · `notifications` · `meta`.

## Regras de negócio

- **Estatísticas derivadas dos jogos:** gols, assistências, vitórias, empates e derrotas são
  recalculados a partir das partidas. Editar ou excluir um jogo nunca duplica nem perde números.
- **Registro duplicado:** cada formulário de jogo gera um ID fixo (reenvio/duplo clique grava o mesmo
  documento) e o app avisa se o placar for igual ao último jogo registrado há poucos minutos.
- **Presença:** confirmados, pendentes (ativos sem resposta) e ausentes. Só confirmados entram no sorteio.
- **Nível técnico:** 1 = melhor ... 6 = mais fraco. Pode vir na lista colada do WhatsApp junto do nome
  ("Saladinha 1", "Pepeu - 2", "Molao (3)", "Rato N6") e é gravado no jogador ao importar.
- **Sorteio por potes:** goleiros um por time; os demais são ordenados por nível e divididos em potes do
  tamanho do número de times — cada pote entrega um jogador a cada time (o melhor do pote vai para o time
  mais fraco). Com 18 jogadores (3 de cada nível) e 3 times, cada time tem exatamente um jogador de cada
  nível, do 1 ao 6. Trocas de ajuste só acontecem dentro do mesmo pote. Prévia, “Refazer”, movimentação
  manual e 3 ou 4 times.
- **Classificação:** vitória 3, empate 1, derrota 0; desempate por vitórias, saldo e gols marcados.
  Sem jogos, não há campeão.
- **Pontuação (Craque do mês/temporada e Ranking geral):** gol 3, assistência 2, vitória 1,
  voto de Melhor da Pelada 5.
- **Melhor goleiro do período:** mais votos de Melhor Goleiro. **Revelação:** escolha do admin.
- **Elegibilidade:** prêmios do período e ranking de aproveitamento exigem presença em ≥ 50% das
  peladas com jogos no período. Empates premiam todos.
- **Temporadas:** abertas e encerradas pelo admin; uma ativa por vez. Peladas novas entram na
  temporada ativa; peladas antigas entram pela data. Encerrar não apaga nada.
- **Exclusões seguras:** jogador com histórico só pode ser inativado; linha já usada não pode ser
  excluída; excluir uma pelada remove em cascata jogos, gols, votos, prêmios, fotos e avisos.
- **Zerar baba (Perfil → admin):** apaga peladas, jogos, gols, votos, prêmios, fotos, temporadas,
  avisos e jogadores sem conta, para começar um novo grupo. Mantém contas, perfis vinculados a
  contas e as cores das linhas. Exige digitar ZERAR.

## Permissões

| Ação | Admin | Jogador |
|---|---|---|
| Criar/encerrar peladas, sortear times, registrar e corrigir jogos | ✅ | — |
| Cadastrar jogadores, definir nível técnico e status | ✅ | — |
| Confirmar/recusar a própria presença | ✅ | ✅ |
| Editar dados pessoais e foto do próprio perfil | ✅ | ✅ |
| Votar (apenas escalados, sem autovoto, 1 voto por categoria) | ✅ | ✅ |
| Enviar fotos (se liberado na pelada) e marcar jogadores | ✅ | ✅ |
| Gerenciar permissões de outros usuários | ✅ | — |

As permissões são garantidas no servidor por `firestore.rules`. **Após alterar as regras, publique:**

```bash
npx firebase-tools deploy --only firestore:rules
```

(ou cole o conteúdo de `firestore.rules` em Firebase Console → Firestore → Regras → Publicar).
