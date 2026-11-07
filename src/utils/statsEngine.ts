import type {
  AwardCategory,
  LineStanding,
  LineTeam,
  MatchRecord,
  Pelada,
  Player,
  PlayerComputedStats,
  PlayerRoundGoal,
  PlayerRoundPerformance,
  RoundAward,
  VoteRecord,
  VoteTallyItem,
} from '../types/domain';

export function getSaturdayISO(offsetWeeks = 0, baseDate = new Date()): string {
  const d = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate(), 12, 0, 0);
  const day = d.getDay(); // 0 = Sun, 6 = Sat
  const diffToSaturday = (6 - day + 7) % 7;
  d.setDate(d.getDate() + diffToSaturday + offsetWeeks * 7);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function formatDateBR(isoDate: string): string {
  if (!isoDate) return '';
  const [y, m, d] = isoDate.split('-').map(Number);
  if (!y || !m || !d) return isoDate;
  const dt = new Date(y, m - 1, d, 12, 0, 0);
  return dt.toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

export function formatShortDateBR(isoDate: string): string {
  if (!isoDate) return '';
  const [y, m, d] = isoDate.split('-');
  if (!y || !m || !d) return isoDate;
  return `${d}/${m}/${y}`;
}

export function sortStandings(standings: LineStanding[]): LineStanding[] {
  return [...standings].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.wins !== a.wins) return b.wins - a.wins;
    if (b.goalDifference !== a.goalDifference) return b.goalDifference - a.goalDifference;
    if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
    return a.lineName.localeCompare(b.lineName, 'pt-BR');
  });
}

export function computePeladaStandings(
  pelada: Pelada | undefined,
  lines: LineTeam[],
  matches: MatchRecord[]
): LineStanding[] {
  if (!pelada) return [];

  const lineMap = new Map(lines.map((l) => [l.id, l]));
  const roundMatches = matches.filter((m) => m.peladaId === pelada.id);

  // Inclui linhas configuradas na pelada + qualquer linha com partida registrada na rodada
  const activeIds = new Set<string>(pelada.participatingLineIds);
  for (const m of roundMatches) {
    activeIds.add(m.homeLineId);
    activeIds.add(m.awayLineId);
  }

  const table = new Map<string, LineStanding>();
  for (const lineId of activeIds) {
    const line = lineMap.get(lineId);
    if (!line) continue;
    table.set(lineId, {
      lineId: line.id,
      lineName: line.name,
      shortName: line.shortName,
      colorHex: line.colorHex,
      textColorHex: line.textColorHex,
      played: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      goalDifference: 0,
      points: 0,
      efficiency: 0,
    });
  }

  for (const m of roundMatches) {
    const home = table.get(m.homeLineId);
    const away = table.get(m.awayLineId);
    if (home) {
      home.played += 1;
      home.goalsFor += m.homeGoals;
      home.goalsAgainst += m.awayGoals;
      if (m.homeGoals > m.awayGoals) {
        home.wins += 1;
        home.points += 3;
      } else if (m.homeGoals === m.awayGoals) {
        home.draws += 1;
        home.points += 1;
      } else {
        home.losses += 1;
      }
    }
    if (away) {
      away.played += 1;
      away.goalsFor += m.awayGoals;
      away.goalsAgainst += m.homeGoals;
      if (m.awayGoals > m.homeGoals) {
        away.wins += 1;
        away.points += 3;
      } else if (m.awayGoals === m.homeGoals) {
        away.draws += 1;
        away.points += 1;
      } else {
        away.losses += 1;
      }
    }
  }

  for (const row of table.values()) {
    row.goalDifference = row.goalsFor - row.goalsAgainst;
    row.efficiency = row.played > 0 ? Math.round((row.points / (row.played * 3)) * 100) : 0;
  }

  return sortStandings(Array.from(table.values()));
}

export function computeAllTimeLineStandings(
  peladas: Pelada[],
  lines: LineTeam[],
  matches: MatchRecord[]
): LineStanding[] {
  const table = new Map<string, LineStanding>();
  for (const line of lines) {
    table.set(line.id, {
      lineId: line.id,
      lineName: line.name,
      shortName: line.shortName,
      colorHex: line.colorHex,
      textColorHex: line.textColorHex,
      played: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      goalDifference: 0,
      points: 0,
      efficiency: 0,
      titles: 0,
    });
  }

  for (const p of peladas) {
    if (p.status === 'finished' && p.championLineId) {
      const champ = table.get(p.championLineId);
      if (champ) champ.titles = (champ.titles ?? 0) + 1;
    }
  }

  for (const m of matches) {
    const home = table.get(m.homeLineId);
    const away = table.get(m.awayLineId);
    if (home) {
      home.played += 1;
      home.goalsFor += m.homeGoals;
      home.goalsAgainst += m.awayGoals;
      if (m.homeGoals > m.awayGoals) {
        home.wins += 1;
        home.points += 3;
      } else if (m.homeGoals === m.awayGoals) {
        home.draws += 1;
        home.points += 1;
      } else {
        home.losses += 1;
      }
    }
    if (away) {
      away.played += 1;
      away.goalsFor += m.awayGoals;
      away.goalsAgainst += m.homeGoals;
      if (m.awayGoals > m.homeGoals) {
        away.wins += 1;
        away.points += 3;
      } else if (m.awayGoals === m.homeGoals) {
        away.draws += 1;
        away.points += 1;
      } else {
        away.losses += 1;
      }
    }
  }

  for (const row of table.values()) {
    row.goalDifference = row.goalsFor - row.goalsAgainst;
    row.efficiency = row.played > 0 ? Math.round((row.points / (row.played * 3)) * 100) : 0;
  }

  return Array.from(table.values()).sort((a, b) => {
    const tDiff = (b.titles ?? 0) - (a.titles ?? 0);
    if (tDiff !== 0) return tDiff;
    if (b.points !== a.points) return b.points - a.points;
    if (b.wins !== a.wins) return b.wins - a.wins;
    if (b.goalDifference !== a.goalDifference) return b.goalDifference - a.goalDifference;
    return b.goalsFor - a.goalsFor;
  });
}

export function computeRoundTopScorers(
  peladaId: string,
  goals: PlayerRoundGoal[]
): { winnerPlayerIds: string[]; topGoals: number; ranking: { playerId: string; goals: number }[] } {
  const roundGoals = goals
    .filter((g) => g.peladaId === peladaId && g.goals > 0)
    .map((g) => ({ playerId: g.playerId, goals: g.goals }))
    .sort((a, b) => b.goals - a.goals);

  if (roundGoals.length === 0) {
    return { winnerPlayerIds: [], topGoals: 0, ranking: [] };
  }

  const maxGoals = roundGoals[0].goals;
  const winners = roundGoals.filter((g) => g.goals === maxGoals).map((g) => g.playerId);
  return {
    winnerPlayerIds: winners,
    topGoals: maxGoals,
    ranking: roundGoals,
  };
}

export function computeVoteTally(votes: VoteRecord[]): {
  tally: VoteTallyItem[];
  winnerIds: string[];
  topVotes: number;
} {
  const total = votes.length;
  if (total === 0) {
    return { tally: [], winnerIds: [], topVotes: 0 };
  }

  const counts = new Map<string, number>();
  for (const v of votes) {
    counts.set(v.candidatePlayerId, (counts.get(v.candidatePlayerId) ?? 0) + 1);
  }

  const tally: VoteTallyItem[] = Array.from(counts.entries())
    .map(([playerId, count]) => ({
      playerId,
      votes: count,
      percentage: Math.round((count / total) * 100),
    }))
    .sort((a, b) => b.votes - a.votes);

  const topVotes = tally[0]?.votes ?? 0;
  const winnerIds = topVotes > 0 ? tally.filter((t) => t.votes === topVotes).map((t) => t.playerId) : [];

  return { tally, winnerIds, topVotes };
}

export function computeAllPlayersStats(
  players: Player[],
  peladas: Pelada[],
  lines: LineTeam[],
  matches: MatchRecord[],
  goals: PlayerRoundGoal[],
  awards: RoundAward[]
): Record<string, PlayerComputedStats> {
  const lineMap = new Map(lines.map((l) => [l.id, l]));
  const sortedPeladas = [...peladas].sort((a, b) => b.date.localeCompare(a.date));

  const result: Record<string, PlayerComputedStats> = {};

  for (const player of players) {
    let participations = 0;
    let totalGoals = 0;
    let totalMatchWins = 0;
    let lineTitles = 0;
    let bestPlayerAwards = 0;
    let bestGoalkeeperAwards = 0;
    let topScorerAwards = 0;
    const history: PlayerRoundPerformance[] = [];

    for (const pelada of sortedPeladas) {
      const wasPresent = pelada.presentPlayerIds.includes(player.id);
      const roundGoalEntry = goals.find((g) => g.peladaId === pelada.id && g.playerId === player.id);
      const playerGoals = roundGoalEntry?.goals ?? 0;

      // Descobrir em qual linha o jogador atuou nesta pelada
      let assignedLineId: string | undefined;
      for (const [lineId, roster] of Object.entries(pelada.lineRosters || {})) {
        if (roster.includes(player.id)) {
          assignedLineId = lineId;
          break;
        }
      }

      const roundAwardsForPlayer: AwardCategory[] = awards
        .filter((a) => a.peladaId === pelada.id && a.winnerPlayerIds.includes(player.id))
        .map((a) => a.category);

      if (!wasPresent && playerGoals === 0 && !assignedLineId && roundAwardsForPlayer.length === 0) {
        continue;
      }

      if (wasPresent) {
        participations += 1;
      }
      totalGoals += playerGoals;

      let matchWins = 0;
      let matchDraws = 0;
      let matchLosses = 0;

      if (assignedLineId) {
        const roundMatches = matches.filter(
          (m) =>
            m.peladaId === pelada.id &&
            (m.homeLineId === assignedLineId || m.awayLineId === assignedLineId)
        );
        for (const m of roundMatches) {
          const isHome = m.homeLineId === assignedLineId;
          const myScore = isHome ? m.homeGoals : m.awayGoals;
          const oppScore = isHome ? m.awayGoals : m.homeGoals;
          if (myScore > oppScore) matchWins += 1;
          else if (myScore === oppScore) matchDraws += 1;
          else matchLosses += 1;
        }
      }

      totalMatchWins += matchWins;

      const wonChampionship =
        pelada.status === 'finished' &&
        Boolean(assignedLineId) &&
        pelada.championLineId === assignedLineId;

      if (wonChampionship) {
        lineTitles += 1;
      }

      for (const cat of roundAwardsForPlayer) {
        if (cat === 'best_player') bestPlayerAwards += 1;
        if (cat === 'best_goalkeeper') bestGoalkeeperAwards += 1;
        if (cat === 'top_scorer') topScorerAwards += 1;
      }

      const lineObj = assignedLineId ? lineMap.get(assignedLineId) : undefined;
      history.push({
        peladaId: pelada.id,
        peladaTitle: pelada.title,
        date: pelada.date,
        lineId: assignedLineId,
        lineName: lineObj?.name,
        lineColorHex: lineObj?.colorHex,
        goals: playerGoals,
        matchWins,
        matchDraws,
        matchLosses,
        wonChampionship,
        awards: roundAwardsForPlayer,
      });
    }

    const totalAwards = bestPlayerAwards + bestGoalkeeperAwards + topScorerAwards;
    result[player.id] = {
      playerId: player.id,
      participations,
      goals: totalGoals,
      matchWins: totalMatchWins,
      lineTitles,
      totalAwards,
      bestPlayerAwards,
      bestGoalkeeperAwards,
      topScorerAwards,
      goalsPerPelada: participations > 0 ? Number((totalGoals / participations).toFixed(2)) : 0,
      history,
    };
  }

  return result;
}
