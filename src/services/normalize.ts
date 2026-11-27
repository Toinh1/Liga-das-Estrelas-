/**
 * Normalização dos documentos lidos do Firestore.
 * Os documentos antigos não possuem os campos novos (nível, status, assistências...).
 * Em vez de migrar o banco, aplicamos valores padrão na leitura — nada é sobrescrito.
 */
import {
  DEFAULT_SKILL,
  SKILL_MAX,
  SKILL_MIN,
  type MatchRecord,
  type MatchScorerEntry,
  type Pelada,
  type PhotoItem,
  type Player,
  type PlayerRoundGoal,
  type Season,
} from '../types/domain';

type Raw = Record<string, any>;

const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

export function clampSkill(value: unknown): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return DEFAULT_SKILL;
  return Math.min(SKILL_MAX, Math.max(SKILL_MIN, n));
}

export function normalizePlayer(raw: Raw): Player {
  return {
    ...(raw as Player),
    skillLevel: raw.skillLevel === undefined ? DEFAULT_SKILL : clampSkill(raw.skillLevel),
    active: raw.active !== false,
  };
}

export function normalizePelada(raw: Raw): Pelada {
  return {
    ...(raw as Pelada),
    participatingLineIds: arr<string>(raw.participatingLineIds),
    lineRosters: raw.lineRosters && typeof raw.lineRosters === 'object' ? raw.lineRosters : {},
    confirmedPlayerIds: arr<string>(raw.confirmedPlayerIds),
    declinedPlayerIds: arr<string>(raw.declinedPlayerIds),
    presentPlayerIds: arr<string>(raw.presentPlayerIds),
    votingStatus: raw.votingStatus || 'not_started',
    allowPlayerUploads: raw.allowPlayerUploads !== false,
  };
}

function scorers(v: unknown): MatchScorerEntry[] {
  return arr<MatchScorerEntry>(v).filter(
    (s) => s && typeof s.playerId === 'string' && Number(s.count) > 0
  );
}

export function normalizeMatch(raw: Raw): MatchRecord {
  return {
    ...(raw as MatchRecord),
    homeGoals: Math.max(0, Number(raw.homeGoals) || 0),
    awayGoals: Math.max(0, Number(raw.awayGoals) || 0),
    homeScorers: scorers(raw.homeScorers),
    awayScorers: scorers(raw.awayScorers),
    homeAssists: scorers(raw.homeAssists),
    awayAssists: scorers(raw.awayAssists),
    homePlayerIds: arr<string>(raw.homePlayerIds),
    awayPlayerIds: arr<string>(raw.awayPlayerIds),
  };
}

export function normalizeLegacyGoal(raw: Raw): PlayerRoundGoal {
  return {
    ...(raw as PlayerRoundGoal),
    // Pode ser negativo: é um ajuste sobre o que foi registrado nos jogos.
    goals: Math.trunc(Number(raw.goals) || 0),
    assists: Math.trunc(Number(raw.assists) || 0),
  };
}

export function normalizePhoto(raw: Raw): PhotoItem {
  return { ...(raw as PhotoItem), taggedPlayerIds: arr<string>(raw.taggedPlayerIds) };
}

export function normalizeSeason(raw: Raw): Season {
  return {
    ...(raw as Season),
    status: raw.status === 'closed' ? 'closed' : 'active',
    revelationPlayerId: raw.revelationPlayerId || undefined,
  };
}
