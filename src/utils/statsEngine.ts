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
  Season,
  VoteRecord,
  VoteTallyItem,
} from '../types/domain';

// ---------------------------------------------------------------------------
// Datas
// ---------------------------------------------------------------------------

export function todayISO(base = new Date()): string {
  const yyyy = base.getFullYear();
  const mm = String(base.getMonth() + 1).padStart(2, '0');
  const dd = String(base.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/** Próxima data (hoje inclusive) do dia da semana informado. 0 = Dom ... 3 = Qua ... 6 = Sáb */
export function getNextWeekdayISO(weekday: number, offsetWeeks = 0, baseDate = new Date()): string {
  const d = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate(), 12, 0, 0);
  const diff = (weekday - d.getDay() + 7) % 7;
  d.setDate(d.getDate() + diff + offsetWeeks * 7);
  return todayISO(d);
}

export function formatDateBR(isoDate: string): string {
  if (!isoDate) return '';
  const [y, m, d] = isoDate.split('-').map(Number);
  if (!y || !m || !d) return isoDate;
  const dt = new Date(y, m - 1, d, 12, 0, 0);
  const text = dt.toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function formatShortDateBR(isoDate: string): string {
  if (!isoDate) return '';
  const [y, m, d] = isoDate.split('-');
  if (!y || !m || !d) return isoDate;
  return `${d}/${m}/${y}`;
}

const MONTHS_PT = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

/** "2026-11" -> "Novembro/2026" */
export function formatMonthKey(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number);
  if (!y || !m) return monthKey;
  return `${MONTHS_PT[m - 1]}/${y}`;
}

// ---------------------------------------------------------------------------
// Períodos (pelada, mês, temporada)
// ---------------------------------------------------------------------------

export type PeriodFilter =
  | { kind: 'all' }
  | { kind: 'pelada'; peladaId: string }
  | { kind: 'month'; month: string } // YYYY-MM
  | { kind: 'season'; seasonId: string };

/**
 * Uma pelada pertence à temporada se foi criada nela (seasonId) ou, para peladas
 * antigas sem temporada, se a data cai dentro do período da temporada.
 */
export function peladaInSeason(pelada: Pelada, season: Season): boolean {
  if (pelada.seasonId) return pelada.seasonId === season.id;
  if (pelada.date < season.startDate) return false;
  if (season.endDate && pelada.date > season.endDate) return false;
  return true;
}

export function filterPeladasByPeriod(
  peladas: Pelada[],
  seasons: Season[],
  filter: PeriodFilter
): Pelada[] {
  switch (filter.kind) {
    case 'all':
      return peladas;
    case 'pelada':
      return peladas.filter((p) => p.id === filter.peladaId);
    case 'month':
      return peladas.filter((p) => p.date.startsWith(filter.month));
    case 'season': {
      const season = seasons.find((s) => s.id === filter.seasonId);
      return season ? peladas.filter((p) => peladaInSeason(p, season)) : [];
    }
  }
}

/** Peladas que já tiveram pelo menos um jogo registrado (base para mínimos de participação). */
export function playedPeladaIds(peladas: Pelada[], matches: MatchRecord[]): string[] {
  const withMatches = new Set(matches.map((m) => m.peladaId));
  return peladas.filter((p) => withMatches.has(p.id)).map((p) => p.id);
}

export function listMonthsWithPeladas(peladas: Pelada[]): string[] {
  return Array.from(new Set(peladas.map((p) => p.date.slice(0, 7))))
    .filter(Boolean)
    .sort((a, b) => b.localeCompare(a));
}

// ---------------------------------------------------------------------------
// Classificação das linhas
// ---------------------------------------------------------------------------

export function sortStandings(standings: LineStanding[]): LineStanding[] {
  return [...standings].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.wins !== a.wins) return b.wins - a.wins;
    if (b.goalDifference !== a.goalDifference) return b.goalDifference - a.goalDifference;
    if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
    return a.lineName.localeCompare(b.lineName, 'pt-BR');
  });
}

function emptyStanding(line: LineTeam): LineStanding {
  return {
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
  };
}

function applyResult(row: LineStanding | undefined, scored: number, conceded: number) {
  if (!row) return;
  row.played += 1;
  row.goalsFor += scored;
  row.goalsAgainst += conceded;
  if (scored > conceded) {
    row.wins += 1;
    row.points += 3;
  } else if (scored === conceded) {
    row.draws += 1;
    row.points += 1;
  } else {
    row.losses += 1;
  }
}

function finalizeRows(table: Map<string, LineStanding>) {
  for (const row of table.values()) {
    row.goalDifference = row.goalsFor - row.goalsAgainst;
    row.efficiency = row.played > 0 ? Math.round((row.points / (row.played * 3)) * 100) : 0;
  }
}

export function computePeladaStandings(
  pelada: Pelada | undefined,
  lines: LineTeam[],
  matches: MatchRecord[]
): LineStanding[] {
  if (!pelada) return [];

  const lineMap = new Map(lines.map((l) => [l.id, l]));
  const roundMatches = matches.filter((m) => m.peladaId === pelada.id);

  // Linhas configuradas na pelada + qualquer linha com partida registrada na rodada
  const activeIds = new Set<string>(pelada.participatingLineIds);
  for (const m of roundMatches) {
    activeIds.add(m.homeLineId);
    activeIds.add(m.awayLineId);
  }

  const table = new Map<string, LineStanding>();
  for (const lineId of activeIds) {
    const line = lineMap.get(lineId);
    if (line) table.set(lineId, emptyStanding(line));
  }

  for (const m of roundMatches) {
    applyResult(table.get(m.homeLineId), m.homeGoals, m.awayGoals);
    applyResult(table.get(m.awayLineId), m.awayGoals, m.homeGoals);
  }

  finalizeRows(table);
  return sortStandings(Array.from(table.values()));
}

/** Campeã da rodada: líder da tabela, desde que pelo menos um jogo tenha sido disputado. */
export function determineChampionLineId(standings: LineStanding[]): string | undefined {
  const leader = standings[0];
  return leader && leader.played > 0 ? leader.lineId : undefined;
}

export function computeAllTimeLineStandings(
  peladas: Pelada[],
  lines: LineTeam[],
  matches: MatchRecord[]
): LineStanding[] {
  const table = new Map<string, LineStanding>();
  for (const line of lines) table.set(line.id, emptyStanding(line));

  for (const p of peladas) {
    if (p.status === 'finished' && p.championLineId) {
      const champ = table.get(p.championLineId);
      if (champ) champ.titles = (champ.titles ?? 0) + 1;
    }
  }

  // Considera apenas jogos de peladas existentes (no período filtrado)
  const peladaIds = new Set(peladas.map((p) => p.id));
  for (const m of matches) {
    if (!peladaIds.has(m.peladaId)) continue;
    applyResult(table.get(m.homeLineId), m.homeGoals, m.awayGoals);
    applyResult(table.get(m.awayLineId), m.awayGoals, m.homeGoals);
  }

  finalizeRows(table);
  return Array.from(table.values()).sort((a, b) => {
    const tDiff = (b.titles ?? 0) - (a.titles ?? 0);
    if (tDiff !== 0) return tDiff;
    if (b.points !== a.points) return b.points - a.points;
    if (b.wins !== a.wins) return b.wins - a.wins;
    if (b.goalDifference !== a.goalDifference) return b.goalDifference - a.goalDifference;
    return b.goalsFor - a.goalsFor;
  });
}

// ---------------------------------------------------------------------------
// Gols e assistências (derivados dos jogos)
// ---------------------------------------------------------------------------

/**
 * Totais por pelada/jogador = autores registrados nos jogos + ajustes históricos
 * (coleção `goals`, usada antes do registro de gols por partida).
 * Como é recalculado do zero, editar ou excluir um jogo nunca duplica estatísticas.
 */
export function deriveRoundGoals(
  matches: MatchRecord[],
  legacyGoals: PlayerRoundGoal[]
): PlayerRoundGoal[] {
  const map = new Map<string, PlayerRoundGoal>();
  const bump = (
    peladaId: string,
    playerId: string,
    field: 'goals' | 'assists',
    amount: number,
    updatedAt: string
  ) => {
    if (!amount) return;
    const id = `${peladaId}_${playerId}`;
    const entry =
      map.get(id) ?? { id, peladaId, playerId, goals: 0, assists: 0, updatedAt };
    entry[field] += amount;
    if (updatedAt > entry.updatedAt) entry.updatedAt = updatedAt;
    map.set(id, entry);
  };

  for (const g of legacyGoals) {
    bump(g.peladaId, g.playerId, 'goals', g.goals, g.updatedAt || '');
    bump(g.peladaId, g.playerId, 'assists', g.assists || 0, g.updatedAt || '');
  }
  for (const m of matches) {
    const ts = m.updatedAt || m.createdAt;
    for (const s of [...m.homeScorers, ...m.awayScorers]) {
      bump(m.peladaId, s.playerId, 'goals', s.count, ts);
    }
    for (const a of [...m.homeAssists, ...m.awayAssists]) {
      bump(m.peladaId, a.playerId, 'assists', a.count, ts);
    }
  }
  // Ajustes negativos nunca deixam o total abaixo de zero.
  return Array.from(map.values())
    .map((e) => ({ ...e, goals: Math.max(0, e.goals), assists: Math.max(0, e.assists) }))
    .filter((e) => e.goals > 0 || e.assists > 0);
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
  return { winnerPlayerIds: winners, topGoals: maxGoals, ranking: roundGoals };
}

export function computeVoteTally(votes: VoteRecord[]): {
  tally: VoteTallyItem[];
  winnerIds: string[];
  topVotes: number;
} {
  const total = votes.length;
  if (total === 0) return { tally: [], winnerIds: [], topVotes: 0 };

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
  const winnerIds =
    topVotes > 0 ? tally.filter((t) => t.votes === topVotes).map((t) => t.playerId) : [];

  return { tally, winnerIds, topVotes };
}

// ---------------------------------------------------------------------------
// Estatísticas individuais
// ---------------------------------------------------------------------------

export function findPlayerLineId(pelada: Pelada, playerId: string): string | undefined {
  for (const [lineId, roster] of Object.entries(pelada.lineRosters || {})) {
    if (roster.includes(playerId)) return lineId;
  }
  return undefined;
}

/**
 * Lado em que o jogador atuou numa partida: usa a escalação gravada no jogo
 * e, para jogos antigos (sem escalação), a linha do jogador na pelada.
 */
export function playerSideInMatch(
  match: MatchRecord,
  pelada: Pelada,
  playerId: string
): 'home' | 'away' | undefined {
  if (match.homePlayerIds.length || match.awayPlayerIds.length) {
    if (match.homePlayerIds.includes(playerId)) return 'home';
    if (match.awayPlayerIds.includes(playerId)) return 'away';
    return undefined;
  }
  const lineId = findPlayerLineId(pelada, playerId);
  if (!lineId) return undefined;
  if (match.homeLineId === lineId) return 'home';
  if (match.awayLineId === lineId) return 'away';
  return undefined;
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

  const matchesByPelada = new Map<string, MatchRecord[]>();
  for (const m of matches) {
    const list = matchesByPelada.get(m.peladaId) ?? [];
    list.push(m);
    matchesByPelada.set(m.peladaId, list);
  }
  const goalsByKey = new Map(goals.map((g) => [`${g.peladaId}_${g.playerId}`, g]));

  const result: Record<string, PlayerComputedStats> = {};

  for (const player of players) {
    const acc = {
      participations: 0,
      matchesPlayed: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      goals: 0,
      assists: 0,
      lineTitles: 0,
      bestPlayerAwards: 0,
      bestGoalkeeperAwards: 0,
      topScorerAwards: 0,
    };
    const history: PlayerRoundPerformance[] = [];

    for (const pelada of sortedPeladas) {
      const wasPresent = pelada.presentPlayerIds.includes(player.id);
      const roundEntry = goalsByKey.get(`${pelada.id}_${player.id}`);
      const playerGoals = roundEntry?.goals ?? 0;
      const playerAssists = roundEntry?.assists ?? 0;
      const assignedLineId = findPlayerLineId(pelada, player.id);

      const roundAwardsForPlayer: AwardCategory[] = awards
        .filter((a) => a.peladaId === pelada.id && a.winnerPlayerIds.includes(player.id))
        .map((a) => a.category);

      let matchWins = 0;
      let matchDraws = 0;
      let matchLosses = 0;
      for (const m of matchesByPelada.get(pelada.id) ?? []) {
        const side = playerSideInMatch(m, pelada, player.id);
        if (!side) continue;
        const mine = side === 'home' ? m.homeGoals : m.awayGoals;
        const theirs = side === 'home' ? m.awayGoals : m.homeGoals;
        if (mine > theirs) matchWins += 1;
        else if (mine === theirs) matchDraws += 1;
        else matchLosses += 1;
      }
      const roundMatchesPlayed = matchWins + matchDraws + matchLosses;

      if (
        !wasPresent &&
        !assignedLineId &&
        playerGoals === 0 &&
        playerAssists === 0 &&
        roundMatchesPlayed === 0 &&
        roundAwardsForPlayer.length === 0
      ) {
        continue;
      }

      if (wasPresent || roundMatchesPlayed > 0) acc.participations += 1;
      acc.goals += playerGoals;
      acc.assists += playerAssists;
      acc.matchesPlayed += roundMatchesPlayed;
      acc.wins += matchWins;
      acc.draws += matchDraws;
      acc.losses += matchLosses;

      const wonChampionship =
        pelada.status === 'finished' &&
        Boolean(assignedLineId) &&
        pelada.championLineId === assignedLineId;
      if (wonChampionship) acc.lineTitles += 1;

      for (const cat of roundAwardsForPlayer) {
        if (cat === 'best_player') acc.bestPlayerAwards += 1;
        if (cat === 'best_goalkeeper') acc.bestGoalkeeperAwards += 1;
        if (cat === 'top_scorer') acc.topScorerAwards += 1;
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
        assists: playerAssists,
        matchWins,
        matchDraws,
        matchLosses,
        wonChampionship,
        awards: roundAwardsForPlayer,
      });
    }

    const pointsWon = acc.wins * 3 + acc.draws;
    result[player.id] = {
      playerId: player.id,
      participations: acc.participations,
      matchesPlayed: acc.matchesPlayed,
      matchWins: acc.wins,
      matchDraws: acc.draws,
      matchLosses: acc.losses,
      goals: acc.goals,
      assists: acc.assists,
      efficiency: acc.matchesPlayed > 0 ? Math.round((pointsWon / (acc.matchesPlayed * 3)) * 100) : 0,
      goalsPerMatch: acc.matchesPlayed > 0 ? Number((acc.goals / acc.matchesPlayed).toFixed(2)) : 0,
      goalsPerPelada:
        acc.participations > 0 ? Number((acc.goals / acc.participations).toFixed(2)) : 0,
      lineTitles: acc.lineTitles,
      totalAwards: acc.bestPlayerAwards + acc.bestGoalkeeperAwards + acc.topScorerAwards,
      bestPlayerAwards: acc.bestPlayerAwards,
      bestGoalkeeperAwards: acc.bestGoalkeeperAwards,
      topScorerAwards: acc.topScorerAwards,
      history,
    };
  }

  return result;
}

/** Estatísticas restritas a um conjunto de peladas (filtro de período). */
export function computePlayersStatsForPeladas(
  players: Player[],
  peladas: Pelada[],
  lines: LineTeam[],
  matches: MatchRecord[],
  goals: PlayerRoundGoal[],
  awards: RoundAward[]
): Record<string, PlayerComputedStats> {
  const ids = new Set(peladas.map((p) => p.id));
  return computeAllPlayersStats(
    players,
    peladas,
    lines,
    matches.filter((m) => ids.has(m.peladaId)),
    goals.filter((g) => ids.has(g.peladaId)),
    awards.filter((a) => ids.has(a.peladaId))
  );
}
