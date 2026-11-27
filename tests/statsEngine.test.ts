import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { MatchRecord, Pelada, Player } from '../src/types/domain.ts';
import {
  computeAllPlayersStats,
  computePeladaStandings,
  deriveRoundGoals,
  determineChampionLineId,
  filterPeladasByPeriod,
  pickCurrentPelada,
} from '../src/utils/statsEngine.ts';

const lines = [
  { id: 'A', name: 'Linha Azul', shortName: 'AZU', colorHex: '#00f', textColorHex: '#fff', createdAt: '' },
  { id: 'B', name: 'Linha Branca', shortName: 'BRA', colorHex: '#fff', textColorHex: '#000', createdAt: '' },
];

const pelada: Pelada = {
  id: 'p1',
  title: 'Pelada 1',
  date: '2026-11-21',
  time: '07:30',
  location: '',
  status: 'in_progress',
  expectedPlayers: 4,
  lineCount: 2,
  playersPerLine: 2,
  participatingLineIds: ['A', 'B'],
  lineRosters: { A: ['a1', 'a2'], B: ['b1', 'b2'] },
  confirmedPlayerIds: ['a1', 'a2', 'b1', 'b2'],
  declinedPlayerIds: [],
  presentPlayerIds: ['a1', 'a2', 'b1', 'b2'],
  votingStatus: 'not_started',
  allowPlayerUploads: true,
  createdAt: '2026-11-21T10:00:00Z',
};

const match = (id: string, hg: number, ag: number, extra: Partial<MatchRecord> = {}): MatchRecord => ({
  id,
  peladaId: 'p1',
  orderIndex: 1,
  homeLineId: 'A',
  awayLineId: 'B',
  homeGoals: hg,
  awayGoals: ag,
  homeScorers: [],
  awayScorers: [],
  homeAssists: [],
  awayAssists: [],
  homePlayerIds: ['a1', 'a2'],
  awayPlayerIds: ['b1', 'b2'],
  createdAt: '2026-11-21T10:00:00Z',
  ...extra,
});

const players: Player[] = ['a1', 'a2', 'b1', 'b2'].map((id) => ({
  id,
  name: id,
  photoUrl: '',
  position: 'Meia',
  skillLevel: 3,
  active: true,
  createdAt: '',
}));

test('classificação 3/1/0 com gols pró, contra e saldo', () => {
  const st = computePeladaStandings(pelada, lines, [match('m1', 3, 2), match('m2', 1, 1)]);
  const a = st.find((s) => s.lineId === 'A')!;
  const b = st.find((s) => s.lineId === 'B')!;
  assert.equal(a.points, 4);
  assert.equal(a.goalsFor, 4);
  assert.equal(a.goalsAgainst, 3);
  assert.equal(a.goalDifference, 1);
  assert.equal(b.points, 1);
  assert.equal(st[0].lineId, 'A');
});

test('sem jogos não existe campeão', () => {
  const st = computePeladaStandings(pelada, lines, []);
  assert.equal(determineChampionLineId(st), undefined);
});

test('gols e assistências derivados dos jogos + ajustes históricos', () => {
  const m = match('m1', 3, 2, {
    homeScorers: [{ playerId: 'a1', count: 2 }, { playerId: 'a2', count: 1 }],
    homeAssists: [{ playerId: 'a2', count: 2 }],
    awayScorers: [{ playerId: 'b1', count: 1 }, { playerId: 'b2', count: 1 }],
  });
  const legacy = [{ id: 'p1_a1', peladaId: 'p1', playerId: 'a1', goals: 1, assists: 0, updatedAt: '' }];
  const goals = deriveRoundGoals([m], legacy);
  const a1 = goals.find((g) => g.playerId === 'a1')!;
  const a2 = goals.find((g) => g.playerId === 'a2')!;
  assert.equal(a1.goals, 3);
  assert.equal(a2.goals, 1);
  assert.equal(a2.assists, 2);
});

test('ajuste manual do admin pode tirar gols, sem ficar negativo', () => {
  const m = match('m1', 2, 0, {
    homeScorers: [{ playerId: 'a1', count: 2 }],
    homeAssists: [{ playerId: 'a2', count: 1 }],
  });
  const adj = (playerId: string, goals: number, assists: number) => ({
    id: `p1_${playerId}`, peladaId: 'p1', playerId, goals, assists, updatedAt: '',
  });
  // a1: 2 gols nos jogos, admin corrige para 1 (ajuste -1)
  const a1 = deriveRoundGoals([m], [adj('a1', -1, 0)]).find((g) => g.playerId === 'a1')!;
  assert.equal(a1.goals, 1);
  // ajuste maior que o registrado nunca deixa negativo; zerado some da lista
  const goals = deriveRoundGoals([m], [adj('a2', 0, -5)]);
  assert.equal(goals.find((g) => g.playerId === 'a2'), undefined);
  // jogador sem gol nos jogos recebe +1 manual
  assert.equal(deriveRoundGoals([m], [adj('b1', 1, 0)]).find((g) => g.playerId === 'b1')!.goals, 1);
});

test('editar um jogo não duplica estatísticas (recalculo do zero)', () => {
  const before = match('m1', 2, 0, { homeScorers: [{ playerId: 'a1', count: 2 }] });
  const after = { ...before, homeGoals: 1, homeScorers: [{ playerId: 'a1', count: 1 }] };
  assert.equal(deriveRoundGoals([before], [])[0].goals, 2);
  assert.equal(deriveRoundGoals([after], [])[0].goals, 1);
  assert.equal(deriveRoundGoals([], []).length, 0); // jogo excluído
});

test('estatísticas individuais: V/E/D, aproveitamento e média', () => {
  const ms = [
    match('m1', 3, 2, { homeScorers: [{ playerId: 'a1', count: 3 }] }),
    match('m2', 0, 1),
    match('m3', 1, 1),
  ];
  const stats = computeAllPlayersStats(players, [pelada], lines, ms, deriveRoundGoals(ms, []), []);
  const a1 = stats.a1;
  assert.equal(a1.matchesPlayed, 3);
  assert.equal(a1.matchWins, 1);
  assert.equal(a1.matchDraws, 1);
  assert.equal(a1.matchLosses, 1);
  assert.equal(a1.efficiency, Math.round((4 / 9) * 100));
  assert.equal(a1.goals, 3);
  assert.equal(a1.goalsPerMatch, 1);
  assert.equal(a1.participations, 1);
});

test('filtro por mês e temporada', () => {
  const p2 = { ...pelada, id: 'p2', date: '2026-12-05' };
  const season = { id: 's1', name: '2026', startDate: '2026-01-01', endDate: '2026-11-30', status: 'closed' as const, createdAt: '' };
  assert.deepEqual(
    filterPeladasByPeriod([pelada, p2], [], { kind: 'month', month: '2026-12' }).map((p) => p.id),
    ['p2']
  );
  assert.deepEqual(
    filterPeladasByPeriod([pelada, p2], [season], { kind: 'season', seasonId: 's1' }).map((p) => p.id),
    ['p1']
  );
});

import { computePeriodAwards, minParticipations } from '../src/utils/awardsEngine.ts';

test('premiações do período respeitam pontuação, empates e mínimo de 50%', () => {
  assert.equal(minParticipations(4), 2);
  assert.equal(minParticipations(1), 1);
  const base = { matchesPlayed: 0, matchDraws: 0, matchLosses: 0, efficiency: 0, goalsPerMatch: 0, goalsPerPelada: 0, lineTitles: 0, totalAwards: 0, bestPlayerAwards: 0, bestGoalkeeperAwards: 0, topScorerAwards: 0, history: [] };
  const statsMap = {
    x: { ...base, playerId: 'x', participations: 2, goals: 4, assists: 0, matchWins: 1 }, // 13 pts
    y: { ...base, playerId: 'y', participations: 2, goals: 2, assists: 3, matchWins: 1 }, // 13 pts
    z: { ...base, playerId: 'z', participations: 1, goals: 9, assists: 0, matchWins: 3 }, // inelegível
  };
  const votingSummaries: any = {
    p1: { isRevealed: true, bestPlayerTally: [], bestGoalkeeperTally: [{ playerId: 'y', votes: 3, percentage: 100 }] },
  };
  const awards = computePeriodAwards({ kind: 'month', statsMap, votingSummaries, peladaIds: ['p1', 'p2', 'p3', 'p4'] });
  const get = (id: string) => awards.find((a) => a.id === id)!;
  assert.deepEqual(get('craque').winnerPlayerIds.sort(), ['x', 'y']);
  assert.equal(get('craque').value, 13);
  assert.deepEqual(get('artilheiro').winnerPlayerIds, ['x']);
  assert.deepEqual(get('garcom').winnerPlayerIds, ['y']);
  assert.deepEqual(get('goleiro').winnerPlayerIds, ['y']);
  assert.ok(!awards.some((a) => a.id === 'revelacao'));
});

import { parseRosterText } from '../src/utils/rosterParser.ts';

test('lista com nível na frente do nome (1 = melhor)', () => {
  const lvl = (t: string) => parseRosterText(t, []).map((i) => [i.name, i.skillLevel]);
  assert.deepEqual(lvl('1. Saladinha 1\n2. Pepeu - 2\n3. Molao (3)\n4. Rato N6\n5. Dudu irmão de Saladinha 5'), [
    ['Saladinha', 1], ['Pepeu', 2], ['Molao', 3], ['Rato', 6], ['Dudu irmão de Saladinha', 5],
  ]);
  assert.deepEqual(lvl('Saladinha 1\nSávio 2\nChico'), [['Saladinha', 1], ['Sávio', 2], ['Chico', undefined]]);
  assert.deepEqual(lvl('2 Saladinha\n1 Pepeu\n2 Molao'), [['Saladinha', 2], ['Pepeu', 1], ['Molao', 2]]);
  assert.deepEqual(lvl('1 Saladinha\n2 Pepeu\n3 Molao'), [['Saladinha', undefined], ['Pepeu', undefined], ['Molao', undefined]]);
  assert.deepEqual(lvl('Pedro 16\nJoão (GK) 4'), [['Pedro 16', undefined], ['João', 4]]);
});

test('pelada atual: prioriza a em jogo, depois a próxima aberta mais antiga', () => {
  const mk = (id: string, date: string, status: Pelada['status']): Pelada => ({ ...pelada, id, date, status });
  // Várias abertas: vale a de data mais antiga (a mesma no Início e na aba Pelada)
  assert.equal(
    pickCurrentPelada([mk('c', '2026-12-16', 'open'), mk('b', '2026-12-09', 'open'), mk('a', '2026-12-02', 'finished')])?.id,
    'b'
  );
  // Uma em jogo ganha das abertas
  assert.equal(pickCurrentPelada([mk('x', '2026-12-09', 'open'), mk('y', '2026-12-16', 'in_progress')])?.id, 'y');
  // Todas encerradas: nenhuma pelada atual
  assert.equal(pickCurrentPelada([mk('z', '2026-12-02', 'finished')]), undefined);
});

import { resolveRoster, rosterChoiceKey, parseRosterLines } from '../src/utils/rosterParser.ts';

const homonyms = [
  { id: 'c1', name: 'Cauã', nickname: 'Kaua', photoUrl: '', position: 'Meia', skillLevel: 2, active: true, createdAt: '' },
  { id: 'g1', name: 'Gabriel', photoUrl: '', position: 'Meia', skillLevel: 1, active: true, createdAt: '' },
  { id: 'g2', name: 'Gabriel', nickname: 'Biel', photoUrl: '', position: 'Zagueiro', skillLevel: 4, active: true, createdAt: '' },
] as Player[];

test('lista: duas linhas no mesmo cadastro contam 1 até o admin escolher "Pessoa nova"', () => {
  const text = '1- cauã\n2- kaua\n3- yago';
  const before = resolveRoster(text, homonyms, {});
  assert.equal(before.items.length, 2);
  assert.equal(before.rows[1].duplicateOfLine, 0);

  const line2 = parseRosterLines(text, homonyms)[1];
  const after = resolveRoster(text, homonyms, { [rosterChoiceKey(line2)]: 'new' });
  assert.equal(after.items.length, 3);
  const novo = after.items.find((i) => i.line === 1)!;
  assert.equal(novo.forceNew, true);
  assert.equal(novo.matchedPlayerId, undefined);
  assert.equal(novo.name, 'kaua');
  assert.equal(after.rows[1].homonymNew, true);
});

test('lista: nome com 2 cadastros pede "Quem é?" e respeita a escolha', () => {
  const text = '1- Gabriel';
  const before = resolveRoster(text, homonyms, {});
  assert.equal(before.rows[0].ambiguous, true);
  assert.deepEqual(before.rows[0].item.candidateIds, ['g1', 'g2']);

  const row = parseRosterLines(text, homonyms)[0];
  const after = resolveRoster(text, homonyms, { [rosterChoiceKey(row)]: 'g2' });
  assert.equal(after.rows[0].ambiguous, false);
  assert.equal(after.items[0].matchedPlayerId, 'g2');
  // Editar o nome da linha descarta a escolha antiga
  const edited = resolveRoster('1- Gabriel Souza', homonyms, { [rosterChoiceKey(row)]: 'g2' });
  assert.equal(edited.items[0].matchedPlayerId, undefined);
});
