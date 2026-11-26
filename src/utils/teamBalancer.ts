/**
 * Sorteio equilibrado de times do FutebolB3 — sistema de POTES por nível.
 *
 * Escala de nível: 1 = melhor ... 6 = mais fraco.
 *
 * Como funciona:
 *  1. Goleiros (se houver) são distribuídos primeiro, um por time.
 *  2. Os demais jogadores são ordenados por nível (melhores primeiro; empates em
 *     ordem aleatória) e divididos em POTES do tamanho do número de times.
 *     Ex.: 18 jogadores, 3 times → 6 potes de 3 (pote 1 = os três nível 1, ...).
 *  3. Cada pote entrega exatamente UM jogador para cada time. O melhor jogador do
 *     pote vai para o time mais fraco naquele momento.
 *     → Com 18 jogadores (3 de cada nível) e 3 times, cada time fica com um
 *       jogador de cada nível, do 1 ao 6.
 *  4. Ajuste fino: trocas apenas DENTRO do mesmo pote (não quebram a regra acima)
 *     para equilibrar a força total e as posições.
 *  5. Repete com sorteios diferentes e escolhe entre os melhores resultados —
 *     "Refazer" gera outros times, sempre equilibrados.
 */
import type { PlayerPosition } from '../types/domain';

/** Nível mais fraco da escala (1 = melhor ... 6 = mais fraco). */
const SKILL_MAX = 6;

export interface BalancePlayer {
  id: string;
  /** Nível 1 (melhor) a 6 (mais fraco). */
  level: number;
  position: PlayerPosition;
}

export interface TeamSummary {
  playerIds: string[];
  /** Soma dos níveis (quanto MENOR, mais forte). */
  levelSum: number;
  /** Média de nível (1 = melhor). */
  averageLevel: number;
  /** Força total usada no equilíbrio (nível 1 = 6 pontos ... nível 6 = 1 ponto). */
  strength: number;
  goalkeepers: number;
  positions: Record<PlayerPosition, number>;
  /** Quantos jogadores de cada nível (índice 1..6). */
  levelCounts: number[];
}

export interface BalanceResult {
  teams: TeamSummary[];
  /** Diferença entre a maior e a menor força total. */
  spread: number;
  /** 0–100: quão equilibrado está o sorteio (100 = forças idênticas). */
  balanceIndex: number;
  cost: number;
}

export interface BalanceOptions {
  restarts?: number;
  random?: () => number;
}

const POSITIONS: PlayerPosition[] = ['Goleiro', 'Defensor', 'Meia', 'Atacante'];

/** Força de um nível: nível 1 → 6 pontos, nível 6 → 1 ponto. */
export const levelStrength = (level: number) => SKILL_MAX + 1 - level;

function shuffle<T>(items: T[], rnd: () => number): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function teamSizes(playerCount: number, teamCount: number): number[] {
  const base = Math.floor(playerCount / teamCount);
  const extra = playerCount % teamCount;
  return Array.from({ length: teamCount }, (_, i) => base + (i < extra ? 1 : 0));
}

export function summarizeTeams(teams: string[][], byId: Map<string, BalancePlayer>): TeamSummary[] {
  return teams.map((ids) => {
    const positions = { Goleiro: 0, Defensor: 0, Meia: 0, Atacante: 0 } as Record<PlayerPosition, number>;
    const levelCounts = new Array(SKILL_MAX + 1).fill(0);
    let levelSum = 0;
    let strength = 0;
    for (const id of ids) {
      const p = byId.get(id);
      if (!p) continue;
      levelSum += p.level;
      strength += levelStrength(p.level);
      positions[p.position] += 1;
      levelCounts[p.level] = (levelCounts[p.level] ?? 0) + 1;
    }
    return {
      playerIds: [...ids],
      levelSum,
      averageLevel: ids.length ? Number((levelSum / ids.length).toFixed(2)) : 0,
      strength,
      goalkeepers: positions.Goleiro,
      positions,
      levelCounts,
    };
  });
}

/** Índice 0–100 de equilíbrio entre as forças totais. */
export function computeBalanceIndex(teams: TeamSummary[]): number {
  if (teams.length < 2) return 100;
  const totals = teams.map((t) => t.strength);
  const max = Math.max(...totals);
  const min = Math.min(...totals);
  if (max === 0) return 100;
  return Math.max(0, Math.round(100 - ((max - min) / max) * 100));
}

function cost(teams: string[][], byId: Map<string, BalancePlayer>): number {
  const totals = teams.map((ids) => ids.reduce((acc, id) => acc + levelStrength(byId.get(id)?.level ?? SKILL_MAX), 0));
  const mean = totals.reduce((a, b) => a + b, 0) / teams.length;
  let c = 0;
  for (const t of totals) c += (t - mean) ** 2 * 10;
  for (const pos of POSITIONS) {
    const counts = teams.map((ids) => ids.filter((id) => byId.get(id)?.position === pos).length);
    c += (Math.max(...counts) - Math.min(...counts)) ** 2 * (pos === 'Goleiro' ? 40 : 2);
  }
  return c;
}

/** Monta os times por potes. Retorna os times e o pote de cada jogador. */
function buildByPots(
  players: BalancePlayer[],
  k: number,
  rnd: () => number
): { teams: string[][]; potOf: Map<string, number> } {
  const teams: string[][] = Array.from({ length: k }, () => []);
  const strength = new Array(k).fill(0);
  const potOf = new Map<string, number>();
  const teamOrder = shuffle(Array.from({ length: k }, (_, i) => i), rnd);

  // Times que podem receber: menos jogadores primeiro; depois o mais fraco; depois sorte
  const rankTeams = () =>
    [...teamOrder].sort((a, b) => teams[a].length - teams[b].length || strength[a] - strength[b]);

  const place = (p: BalancePlayer, team: number, pot: number) => {
    teams[team].push(p.id);
    strength[team] += levelStrength(p.level);
    potOf.set(p.id, pot);
  };

  const byLevel = (list: BalancePlayer[]) => shuffle(list, rnd).sort((a, b) => a.level - b.level); // sort estável

  // 1) Goleiros: um por time, o melhor goleiro para o time mais fraco
  const keepers = byLevel(players.filter((p) => p.position === 'Goleiro'));
  const keepersFirst = keepers.slice(0, k);
  rankTeams()
    .slice(0, keepersFirst.length)
    .forEach((team, i) => place(keepersFirst[i], team, -1));

  // 2) Demais jogadores em potes por nível (goleiros extras entram pelo nível)
  const rest = byLevel([...players.filter((p) => p.position !== 'Goleiro'), ...keepers.slice(k)]);
  for (let start = 0, pot = 0; start < rest.length; start += k, pot++) {
    const potPlayers = rest.slice(start, start + k); // já do melhor para o pior
    const targets = rankTeams();
    potPlayers.forEach((p, i) => place(p, targets[i], pot));
  }
  return { teams, potOf };
}

/** Trocas apenas entre jogadores do MESMO pote (preserva a regra de 1 por nível). */
function improveWithinPots(teams: string[][], byId: Map<string, BalancePlayer>, potOf: Map<string, number>): number {
  let current = cost(teams, byId);
  let improved = true;
  let guard = 0;
  while (improved && guard < 200) {
    improved = false;
    guard += 1;
    for (let a = 0; a < teams.length; a++) {
      for (let b = a + 1; b < teams.length; b++) {
        for (let i = 0; i < teams[a].length; i++) {
          for (let j = 0; j < teams[b].length; j++) {
            const pa = teams[a][i];
            const pb = teams[b][j];
            if (potOf.get(pa) !== potOf.get(pb)) continue;
            teams[a][i] = pb;
            teams[b][j] = pa;
            const next = cost(teams, byId);
            if (next + 1e-9 < current) {
              current = next;
              improved = true;
            } else {
              teams[a][i] = pa;
              teams[b][j] = pb;
            }
          }
        }
      }
    }
  }
  return current;
}

export function balanceTeams(players: BalancePlayer[], teamCount: number, options: BalanceOptions = {}): BalanceResult {
  const rnd = options.random ?? Math.random;
  const k = Math.max(1, Math.floor(teamCount));
  const byId = new Map(players.map((p) => [p.id, p]));

  if (players.length === 0) {
    const teams = summarizeTeams(Array.from({ length: k }, () => []), byId);
    return { teams, spread: 0, balanceIndex: 100, cost: 0 };
  }

  const restarts = Math.max(1, options.restarts ?? 30);
  const candidates: { teams: string[][]; cost: number }[] = [];
  for (let r = 0; r < restarts; r++) {
    const { teams, potOf } = buildByPots(players, k, rnd);
    candidates.push({ teams, cost: improveWithinPots(teams, byId, potOf) });
  }

  const bestCost = Math.min(...candidates.map((c) => c.cost));
  const best = candidates.filter((c) => c.cost <= bestCost + 1e-9);
  const pick = best[Math.floor(rnd() * best.length)];
  const summaries = summarizeTeams(pick.teams, byId);
  const totals = summaries.map((t) => t.strength);

  return {
    teams: summaries,
    spread: Math.max(...totals) - Math.min(...totals),
    balanceIndex: computeBalanceIndex(summaries),
    cost: pick.cost,
  };
}
