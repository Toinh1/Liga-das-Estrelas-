import assert from 'node:assert/strict';
import { test } from 'node:test';
import { balanceTeams, teamSizes, type BalancePlayer } from '../src/utils/teamBalancer.ts';

function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const POS = ['Defensor', 'Meia', 'Atacante'] as const;

function makePlayers(n: number, gks: number, rnd: () => number): BalancePlayer[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `p${i}`,
    level: 1 + Math.floor(rnd() * 6),
    position: i < gks ? 'Goleiro' : POS[i % 3],
  }));
}

test('tamanhos dos times diferem em no máximo 1', () => {
  assert.deepEqual(teamSizes(18, 3), [6, 6, 6]);
  assert.deepEqual(teamSizes(13, 2), [7, 6]);
  assert.deepEqual(teamSizes(22, 4), [6, 6, 5, 5]);
});

test('18 jogadores (3 de cada nível) em 3 times: cada time tem um jogador de cada nível 1 a 6', () => {
  for (let seed = 1; seed <= 25; seed++) {
    const players: BalancePlayer[] = Array.from({ length: 18 }, (_, i) => ({
      id: `p${i}`,
      level: (i % 6) + 1,
      position: 'Meia',
    }));
    const res = balanceTeams(players, 3, { random: seeded(seed) });
    for (const t of res.teams) {
      assert.equal(t.playerIds.length, 6);
      assert.deepEqual(t.levelCounts.slice(1), [1, 1, 1, 1, 1, 1], `seed=${seed}`);
    }
    assert.equal(res.spread, 0);
  }
});

test('todos os jogadores são escalados exatamente uma vez', () => {
  for (const k of [2, 3, 4, 5]) {
    const players = makePlayers(23, k, seeded(k));
    const res = balanceTeams(players, k, { random: seeded(99 + k) });
    const all = res.teams.flatMap((t) => t.playerIds).sort();
    assert.deepEqual(all, players.map((p) => p.id).sort());
    const sizes = res.teams.map((t) => t.playerIds.length);
    assert.ok(Math.max(...sizes) - Math.min(...sizes) <= 1);
  }
});

test('goleiros distribuídos um por time', () => {
  for (const k of [2, 3, 4, 5]) {
    const players = makePlayers(24, k, seeded(7 * k));
    const res = balanceTeams(players, k, { random: seeded(k) });
    assert.deepEqual(res.teams.map((t) => t.goalkeepers), new Array(k).fill(1), `k=${k}`);
  }
});

test('forças totais ficam próximas em cenários aleatórios', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const k = 2 + (seed % 4);
    const players = makePlayers(18 + (seed % 7), 0, seeded(seed));
    const res = balanceTeams(players, k, { random: seeded(seed * 31) });
    assert.ok(res.spread <= 6, `seed=${seed} k=${k} spread=${res.spread}`);
  }
});

test('melhores (nível 1) não se concentram num só time', () => {
  const players: BalancePlayer[] = [
    ...Array.from({ length: 4 }, (_, i) => ({ id: `c${i}`, level: 1, position: 'Atacante' as const })),
    ...Array.from({ length: 12 }, (_, i) => ({ id: `n${i}`, level: 5, position: 'Meia' as const })),
  ];
  const res = balanceTeams(players, 2, { random: seeded(3) });
  for (const t of res.teams) assert.equal(t.playerIds.filter((id) => id.startsWith('c')).length, 2);
});

test('refazer o sorteio gera times diferentes', () => {
  const players = makePlayers(18, 0, seeded(5));
  const signatures = new Set<string>();
  for (let s = 0; s < 8; s++) {
    const res = balanceTeams(players, 3, { random: seeded(1000 + s) });
    signatures.add(res.teams.map((t) => [...t.playerIds].sort().join(',')).sort().join('|'));
  }
  assert.ok(signatures.size > 1);
});
