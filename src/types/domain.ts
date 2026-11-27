export type UserRole = 'admin' | 'player';

export type PlayerPosition = 'Goleiro' | 'Defensor' | 'Meia' | 'Atacante';

export type DominantFoot = 'Direito' | 'Esquerdo' | 'Ambos';

export type PeladaStatus = 'open' | 'in_progress' | 'finished';

export type VotingStatus = 'not_started' | 'open' | 'closed';

export type VoteCategory = 'best_player' | 'best_goalkeeper';

export type AwardCategory = 'best_player' | 'best_goalkeeper' | 'top_scorer';

export type PresenceStatus = 'confirmed' | 'declined' | 'pending';

export type SeasonStatus = 'active' | 'closed';

export type NotificationType =
  | 'pelada_created'
  | 'presence_confirmed'
  | 'voting_open'
  | 'results_published'
  | 'pelada_closed';

export const SKILL_MIN = 1;
export const SKILL_MAX = 6;
export const DEFAULT_SKILL = 3;

/** Dia e horário padrão do baba: quartas-feiras (3 = quarta) a partir das 20h. */
export const PELADA_WEEKDAY = 3;
export const PELADA_DEFAULT_TIME = '20:00';
export const PELADA_WEEKDAY_LABEL = 'Quarta';

/** Quantidade de linhas (times) por pelada. */
export const MIN_LINES = 3;
export const MAX_LINES = 4;

export interface UserAccount {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  playerId: string;
  createdAt: string;
  isDemo?: boolean;
}

export interface Player {
  id: string;
  name: string;
  nickname?: string;
  photoUrl: string;
  position: PlayerPosition;
  /** Nível técnico: 1 = melhor ... 6 = mais fraco (definido pelo administrador). */
  skillLevel: number;
  dominantFoot?: DominantFoot;
  /** Jogadores inativos não aparecem nas listas de presença nem no sorteio. */
  active: boolean;
  userId?: string;
  email?: string;
  createdAt: string;
  updatedAt?: string;
  isDemo?: boolean;
}

export interface LineTeam {
  id: string;
  name: string;
  shortName: string;
  colorHex: string;
  textColorHex: string;
  createdAt: string;
  isDemo?: boolean;
}

export interface Season {
  id: string;
  name: string;
  startDate: string; // YYYY-MM-DD
  endDate?: string; // YYYY-MM-DD (preenchida ao encerrar)
  status: SeasonStatus;
  /** Revelação da temporada (escolha manual do administrador). */
  revelationPlayerId?: string;
  createdAt: string;
  closedAt?: string;
}

export interface Pelada {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  location: string;
  status: PeladaStatus;
  expectedPlayers: number;
  lineCount: number;
  playersPerLine: number;
  participatingLineIds: string[];
  lineRosters: Record<string, string[]>; // lineId -> playerId[]
  /** Jogadores que confirmaram presença. */
  confirmedPlayerIds: string[];
  /** Jogadores que informaram que não vão. */
  declinedPlayerIds: string[];
  /** Jogadores escalados nas linhas (efetivamente participaram). */
  presentPlayerIds: string[];
  votingStatus: VotingStatus;
  allowPlayerUploads: boolean;
  seasonId?: string;
  officialPhotoId?: string;
  championLineId?: string;
  createdAt: string;
  updatedAt?: string;
  finishedAt?: string;
  isDemo?: boolean;
}

export interface MatchScorerEntry {
  playerId: string;
  count: number;
}

export interface MatchRecord {
  id: string;
  peladaId: string;
  orderIndex: number;
  homeLineId: string;
  awayLineId: string;
  homeGoals: number;
  awayGoals: number;
  homeScorers: MatchScorerEntry[];
  awayScorers: MatchScorerEntry[];
  homeAssists: MatchScorerEntry[];
  awayAssists: MatchScorerEntry[];
  /** Escalação de cada lado no momento do jogo (vazio em jogos antigos → usa a escalação da pelada). */
  homePlayerIds: string[];
  awayPlayerIds: string[];
  /** Tempo de bola rolando, em segundos (quando o jogo foi cronometrado no app). */
  durationSec?: number;
  createdAt: string;
  updatedAt?: string;
}

export interface LineStanding {
  lineId: string;
  lineName: string;
  shortName: string;
  colorHex: string;
  textColorHex: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
  efficiency: number;
  titles?: number;
}

/**
 * Totais de gols/assistências de um jogador numa pelada.
 * No snapshot, `goals` é DERIVADO: soma dos autores registrados nos jogos
 * + ajustes históricos (coleção `goals`, anterior ao registro por partida).
 */
export interface PlayerRoundGoal {
  id: string; // `${peladaId}_${playerId}`
  peladaId: string;
  playerId: string;
  goals: number;
  assists: number;
  updatedAt: string;
}

export interface VoteRecord {
  id: string; // `${peladaId}_${voterPlayerId}_${category}`
  peladaId: string;
  voterUserId: string;
  voterPlayerId: string;
  candidatePlayerId: string;
  category: VoteCategory;
  createdAt: string;
}

export interface VoteTallyItem {
  playerId: string;
  votes: number;
  percentage: number;
}

export interface PeladaVotingSummary {
  peladaId: string;
  votingStatus: VotingStatus;
  myVotes: Partial<Record<VoteCategory, string>>; // category -> candidatePlayerId
  totalPresentPlayers: number;
  votersWhoVotedBestPlayer: number;
  votersWhoVotedBestGoalkeeper: number;
  // Somente preenchidos quando votingStatus === 'closed' ou pelada.status === 'finished'
  isRevealed: boolean;
  bestPlayerTally: VoteTallyItem[];
  bestGoalkeeperTally: VoteTallyItem[];
  bestPlayerWinnerIds: string[];
  bestGoalkeeperWinnerIds: string[];
  topScorerWinnerIds: string[];
  topScorerGoals: number;
}

export interface RoundAward {
  id: string;
  peladaId: string;
  category: AwardCategory;
  winnerPlayerIds: string[];
  metricValue: number; // votos ou gols
  createdAt: string;
}

export interface PhotoItem {
  id: string;
  peladaId: string;
  url: string;
  caption: string;
  date: string;
  uploadedByUserId: string;
  uploadedByName: string;
  isOfficial: boolean;
  taggedPlayerIds?: string[];
  createdAt: string;
  isDemo?: boolean;
}

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  peladaId?: string;
  createdAt: string;
  readByUserIds: string[];
}

export interface PlayerRoundPerformance {
  peladaId: string;
  peladaTitle: string;
  date: string;
  lineId?: string;
  lineName?: string;
  lineColorHex?: string;
  goals: number;
  assists: number;
  matchWins: number;
  matchDraws: number;
  matchLosses: number;
  wonChampionship: boolean;
  awards: AwardCategory[];
}

export interface PlayerComputedStats {
  playerId: string;
  /** Peladas em que o jogador esteve presente. */
  participations: number;
  matchesPlayed: number;
  matchWins: number;
  matchDraws: number;
  matchLosses: number;
  goals: number;
  assists: number;
  /** Aproveitamento (%) = pontos conquistados / pontos disputados. */
  efficiency: number;
  goalsPerMatch: number;
  goalsPerPelada: number;
  lineTitles: number;
  totalAwards: number;
  bestPlayerAwards: number;
  bestGoalkeeperAwards: number;
  topScorerAwards: number;
  history: PlayerRoundPerformance[];
}

export interface AppSnapshot {
  users: UserAccount[];
  players: Player[];
  lines: LineTeam[];
  seasons: Season[];
  peladas: Pelada[];
  matches: MatchRecord[];
  /** Totais derivados por pelada/jogador (jogos + ajustes históricos). */
  goals: PlayerRoundGoal[];
  awards: RoundAward[];
  photos: PhotoItem[];
  notifications: AppNotification[];
  votingSummaries: Record<string, PeladaVotingSummary>;
}

export type AppSection =
  | 'dashboard'
  | 'hoje'
  | 'jogadores'
  | 'votacoes'
  | 'galeria'
  | 'ranking'
  | 'premiacoes'
  | 'perfil';
