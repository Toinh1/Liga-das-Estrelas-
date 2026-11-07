export type UserRole = 'admin' | 'player';

export type PlayerPosition = 'Goleiro' | 'Defensor' | 'Meia' | 'Atacante';

export type PeladaStatus = 'open' | 'in_progress' | 'finished';

export type VotingStatus = 'not_started' | 'open' | 'closed';

export type VoteCategory = 'best_player' | 'best_goalkeeper';

export type AwardCategory = 'best_player' | 'best_goalkeeper' | 'top_scorer';

export type NotificationType =
  | 'pelada_created'
  | 'presence_confirmed'
  | 'voting_open'
  | 'results_published'
  | 'pelada_closed';

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

export interface Pelada {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  location: string;
  status: PeladaStatus;
  expectedPlayers: number; // e.g. 18 or 24
  lineCount: number; // e.g. 3 or 4
  playersPerLine: number; // e.g. 6
  participatingLineIds: string[];
  lineRosters: Record<string, string[]>; // lineId -> playerId[]
  confirmedPlayerIds: string[];
  presentPlayerIds: string[];
  votingStatus: VotingStatus;
  allowPlayerUploads: boolean;
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
  createdAt: string;
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

export interface PlayerRoundGoal {
  id: string; // `${peladaId}_${playerId}`
  peladaId: string;
  playerId: string;
  goals: number;
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
  matchWins: number;
  matchDraws: number;
  matchLosses: number;
  wonChampionship: boolean;
  awards: AwardCategory[];
}

export interface PlayerComputedStats {
  playerId: string;
  participations: number;
  goals: number;
  matchWins: number;
  lineTitles: number;
  totalAwards: number;
  bestPlayerAwards: number;
  bestGoalkeeperAwards: number;
  topScorerAwards: number;
  goalsPerPelada: number;
  history: PlayerRoundPerformance[];
}

export interface AppSnapshot {
  backendMode: 'local-sqlite' | 'firebase';
  hasDemoData: boolean;
  users: UserAccount[];
  players: Player[];
  lines: LineTeam[];
  peladas: Pelada[];
  matches: MatchRecord[];
  goals: PlayerRoundGoal[];
  awards: RoundAward[];
  photos: PhotoItem[];
  notifications: AppNotification[];
  votingSummaries: Record<string, PeladaVotingSummary>;
}

export type AppSection =
  | 'hoje'
  | 'votacoes'
  | 'galeria'
  | 'ranking'
  | 'perfil';
