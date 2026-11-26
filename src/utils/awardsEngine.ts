/**
 * Premiações de período (mês / temporada) do FutebolB3 — calculadas com dados reais.
 *
 * Regras definidas com a organização:
 *  - Pontuação (Craque do mês, Craque da temporada e Ranking geral):
 *      gol = 3, assistência = 2, vitória = 1, voto de Melhor da Pelada = 5.
 *  - Melhor goleiro: mais votos de Melhor Goleiro no período.
 *  - Revelação: escolhida manualmente pelo administrador na temporada.
 *  - Elegibilidade: presença em pelo menos 50% das peladas do período.
 *  - Empates: todos os empatados recebem o prêmio.
 */
import type { PeladaVotingSummary, PlayerComputedStats } from '../types/domain';

export const SCORE_WEIGHTS = {
  goal: 3,
  assist: 2,
  win: 1,
  bestPlayerVote: 5,
} as const;

export interface PlayerPeriodScore {
  playerId: string;
  score: number;
  bestPlayerVotes: number;
  bestGoalkeeperVotes: number;
}

export type PeriodAwardId =
  | 'craque'
  | 'artilheiro'
  | 'garcom'
  | 'goleiro'
  | 'rei_vitorias'
  | 'revelacao';

export interface PeriodAward {
  id: PeriodAwardId;
  title: string;
  description: string;
  winnerPlayerIds: string[];
  value: number;
  unit: string;
}

/** Mínimo de presenças para concorrer: 50% das peladas do período (mínimo 1). */
export function minParticipations(peladaCount: number): number {
  return Math.max(1, Math.ceil(peladaCount * 0.5));
}

export function computePlayerScores(
  statsMap: Record<string, PlayerComputedStats>,
  votingSummaries: Record<string, PeladaVotingSummary>,
  peladaIds: string[]
): Record<string, PlayerPeriodScore> {
  const bpVotes = new Map<string, number>();
  const gkVotes = new Map<string, number>();
  for (const id of peladaIds) {
    const vs = votingSummaries[id];
    if (!vs?.isRevealed) continue;
    for (const t of vs.bestPlayerTally) bpVotes.set(t.playerId, (bpVotes.get(t.playerId) ?? 0) + t.votes);
    for (const t of vs.bestGoalkeeperTally) gkVotes.set(t.playerId, (gkVotes.get(t.playerId) ?? 0) + t.votes);
  }

  const out: Record<string, PlayerPeriodScore> = {};
  for (const [playerId, st] of Object.entries(statsMap)) {
    const bp = bpVotes.get(playerId) ?? 0;
    out[playerId] = {
      playerId,
      bestPlayerVotes: bp,
      bestGoalkeeperVotes: gkVotes.get(playerId) ?? 0,
      score:
        st.goals * SCORE_WEIGHTS.goal +
        st.assists * SCORE_WEIGHTS.assist +
        st.matchWins * SCORE_WEIGHTS.win +
        bp * SCORE_WEIGHTS.bestPlayerVote,
    };
  }
  return out;
}

function leaders(values: [string, number][]): { ids: string[]; value: number } {
  const positive = values.filter(([, v]) => v > 0);
  if (positive.length === 0) return { ids: [], value: 0 };
  const max = Math.max(...positive.map(([, v]) => v));
  return { ids: positive.filter(([, v]) => v === max).map(([id]) => id), value: max };
}

export function computePeriodAwards(input: {
  kind: 'month' | 'season';
  statsMap: Record<string, PlayerComputedStats>;
  votingSummaries: Record<string, PeladaVotingSummary>;
  peladaIds: string[];
  revelationPlayerId?: string;
}): PeriodAward[] {
  const { statsMap, votingSummaries, peladaIds } = input;
  const min = minParticipations(peladaIds.length);
  const scores = computePlayerScores(statsMap, votingSummaries, peladaIds);
  const eligible = Object.values(statsMap).filter((s) => s.participations >= min);

  const pick = (fn: (s: PlayerComputedStats) => number) =>
    leaders(eligible.map((s) => [s.playerId, fn(s)]));

  const craque = pick((s) => scores[s.playerId]?.score ?? 0);
  const artilheiro = pick((s) => s.goals);
  const garcom = pick((s) => s.assists);
  const goleiro = pick((s) => scores[s.playerId]?.bestGoalkeeperVotes ?? 0);
  const rei = pick((s) => s.matchWins);

  const periodLabel = input.kind === 'month' ? 'do mês' : 'da temporada';
  const awards: PeriodAward[] = [
    {
      id: 'craque',
      title: input.kind === 'month' ? 'Craque do Mês' : 'Craque da Temporada',
      description: 'Maior pontuação: gol 3 • assistência 2 • vitória 1 • voto de melhor 5',
      winnerPlayerIds: craque.ids,
      value: craque.value,
      unit: 'pts',
    },
    {
      id: 'artilheiro',
      title: 'Artilheiro',
      description: `Mais gols ${periodLabel}`,
      winnerPlayerIds: artilheiro.ids,
      value: artilheiro.value,
      unit: artilheiro.value === 1 ? 'gol' : 'gols',
    },
    {
      id: 'garcom',
      title: 'Garçom',
      description: `Mais assistências ${periodLabel}`,
      winnerPlayerIds: garcom.ids,
      value: garcom.value,
      unit: garcom.value === 1 ? 'assistência' : 'assistências',
    },
    {
      id: 'goleiro',
      title: 'Melhor Goleiro',
      description: `Mais votos de Melhor Goleiro ${periodLabel}`,
      winnerPlayerIds: goleiro.ids,
      value: goleiro.value,
      unit: goleiro.value === 1 ? 'voto' : 'votos',
    },
    {
      id: 'rei_vitorias',
      title: 'Rei das Vitórias',
      description: `Mais vitórias em jogos ${periodLabel}`,
      winnerPlayerIds: rei.ids,
      value: rei.value,
      unit: rei.value === 1 ? 'vitória' : 'vitórias',
    },
  ];

  if (input.kind === 'season') {
    awards.push({
      id: 'revelacao',
      title: 'Revelação',
      description: 'Escolha da organização para a temporada',
      winnerPlayerIds: input.revelationPlayerId ? [input.revelationPlayerId] : [],
      value: 0,
      unit: '',
    });
  }
  return awards;
}
