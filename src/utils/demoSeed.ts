import type {
  AppNotification,
  LineTeam,
  MatchRecord,
  Pelada,
  PhotoItem,
  Player,
  PlayerPosition,
  PlayerRoundGoal,
  RoundAward,
  UserAccount,
  VoteRecord,
} from '../types/domain';
import { createPeladaSceneSvg, createPlayerAvatarSvg } from './mediaAssets';
import { getSaturdayISO } from './statsEngine';

export interface DemoDataset {
  users: (UserAccount & { demoPassword: string })[];
  players: Player[];
  lines: LineTeam[];
  peladas: Pelada[];
  matches: MatchRecord[];
  goals: PlayerRoundGoal[];
  votes: VoteRecord[];
  awards: RoundAward[];
  photos: PhotoItem[];
  notifications: AppNotification[];
}

const RAW_PLAYERS: {
  id: string;
  name: string;
  nickname: string;
  position: PlayerPosition;
  accent: string;
  email: string;
  role?: 'admin' | 'player';
}[] = [
  { id: 'p1', name: 'Carlos Eduardo', nickname: 'Capitão', position: 'Meia', accent: '#A3E635', email: 'admin@ligadasestrelas.com', role: 'admin' },
  { id: 'p2', name: 'Rafael Mendes', nickname: 'Canhotinha', position: 'Atacante', accent: '#F97316', email: 'rafael@ligadasestrelas.com' },
  { id: 'p3', name: 'Bruno Alves', nickname: 'Paredão', position: 'Goleiro', accent: '#38BDF8', email: 'bruno@ligadasestrelas.com' },
  { id: 'p4', name: 'Diego Costa', nickname: 'Tanque', position: 'Atacante', accent: '#FACC15', email: 'diego@ligadasestrelas.com' },
  { id: 'p5', name: 'Lucas Ferreira', nickname: 'Raio', position: 'Meia', accent: '#22C55E', email: 'lucas@ligadasestrelas.com' },
  { id: 'p6', name: 'Matheus Rocha', nickname: 'Maestro', position: 'Meia', accent: '#A855F7', email: 'matheus@ligadasestrelas.com' },
  { id: 'p7', name: 'Gustavo Lima', nickname: 'Xerife', position: 'Defensor', accent: '#F43F5E', email: 'gustavo@ligadasestrelas.com' },
  { id: 'p8', name: 'Thiago Ribeiro', nickname: 'Muralha', position: 'Goleiro', accent: '#06B6D4', email: 'thiago@ligadasestrelas.com' },
  { id: 'p9', name: 'André Santos', nickname: 'Motorzinho', position: 'Meia', accent: '#84CC16', email: 'andre@ligadasestrelas.com' },
  { id: 'p10', name: 'Felipe Nunes', nickname: 'Matador', position: 'Atacante', accent: '#FB923C', email: 'felipe@ligadasestrelas.com' },
  { id: 'p11', name: 'Rodrigo Barros', nickname: 'Rocha', position: 'Defensor', accent: '#94A3B8', email: 'rodrigo@ligadasestrelas.com' },
  { id: 'p12', name: 'Vinícius Araújo', nickname: 'Vini Show', position: 'Atacante', accent: '#EAB308', email: 'vinicius@ligadasestrelas.com' },
  { id: 'p13', name: 'Marcelo Vieira', nickname: 'Gato', position: 'Goleiro', accent: '#3B82F6', email: 'marcelo@ligadasestrelas.com' },
  { id: 'p14', name: 'Leandro Pires', nickname: 'Pitbull', position: 'Defensor', accent: '#EF4444', email: 'leandro@ligadasestrelas.com' },
  { id: 'p15', name: 'Gabriel Martins', nickname: 'Biel', position: 'Atacante', accent: '#10B981', email: 'gabriel@ligadasestrelas.com' },
  { id: 'p16', name: 'Henrique Castro', nickname: 'Fino', position: 'Meia', accent: '#6366F1', email: 'henrique@ligadasestrelas.com' },
  { id: 'p17', name: 'Daniel Moreira', nickname: 'Cadeado', position: 'Defensor', accent: '#14B8A6', email: 'daniel@ligadasestrelas.com' },
  { id: 'p18', name: 'Pedro Henrique', nickname: 'PH9', position: 'Atacante', accent: '#F59E0B', email: 'pedro@ligadasestrelas.com' },
  { id: 'p19', name: 'Fábio Júnior', nickname: 'Luva de Ouro', position: 'Goleiro', accent: '#0EA5E9', email: 'fabio@ligadasestrelas.com' },
  { id: 'p20', name: 'Caio Teixeira', nickname: 'Foguete', position: 'Meia', accent: '#A3E635', email: 'caio@ligadasestrelas.com' },
  { id: 'p21', name: 'Igor Cavalcanti', nickname: 'Monstro', position: 'Defensor', accent: '#EC4899', email: 'igor@ligadasestrelas.com' },
  { id: 'p22', name: 'Renato Oliveira', nickname: 'Garçom', position: 'Meia', accent: '#8B5CF6', email: 'renato@ligadasestrelas.com' },
  { id: 'p23', name: 'Samuel Cardoso', nickname: 'Samuca', position: 'Atacante', accent: '#22C55E', email: 'samuel@ligadasestrelas.com' },
  { id: 'p24', name: 'Alexandre Dias', nickname: 'Alex', position: 'Defensor', accent: '#64748B', email: 'alexandre@ligadasestrelas.com' },
];

export function buildDemoDataset(): DemoDataset {
  const nowIso = new Date().toISOString();
  const satMinus2 = getSaturdayISO(-2);
  const satMinus1 = getSaturdayISO(-1);
  const satCurrent = getSaturdayISO(0);

  const users: (UserAccount & { demoPassword: string })[] = RAW_PLAYERS.map((rp, idx) => ({
    id: `u${idx + 1}`,
    name: rp.name,
    email: rp.email,
    role: rp.role ?? 'player',
    playerId: rp.id,
    createdAt: nowIso,
    isDemo: true,
    demoPassword: rp.role === 'admin' ? 'admin123' : '123456',
  }));

  const players: Player[] = RAW_PLAYERS.map((rp, idx) => ({
    id: rp.id,
    name: rp.name,
    nickname: rp.nickname,
    photoUrl: createPlayerAvatarSvg(rp.name, rp.accent),
    position: rp.position,
    userId: `u${idx + 1}`,
    email: rp.email,
    createdAt: nowIso,
    isDemo: true,
  }));

  const lines: LineTeam[] = [
    {
      id: 'line-laranja',
      name: 'Linha Laranja',
      shortName: 'LAR',
      colorHex: '#F97316',
      textColorHex: '#090B0E',
      createdAt: nowIso,
      isDemo: true,
    },
    {
      id: 'line-branca',
      name: 'Linha Branca',
      shortName: 'BRA',
      colorHex: '#F8FAFC',
      textColorHex: '#090B0E',
      createdAt: nowIso,
      isDemo: true,
    },
    {
      id: 'line-preta',
      name: 'Linha Preta',
      shortName: 'PRE',
      colorHex: '#27272A',
      textColorHex: '#F8FAFC',
      createdAt: nowIso,
      isDemo: true,
    },
    {
      id: 'line-azul',
      name: 'Linha Azul',
      shortName: 'AZU',
      colorHex: '#3B82F6',
      textColorHex: '#F8FAFC',
      createdAt: nowIso,
      isDemo: true,
    },
  ];

  // Pelada 1: 2 sábados atrás (18 jogadores -> 3 linhas de 6) — ENCERRADA
  const p18Ids = players.slice(0, 18).map((p) => p.id);
  const pelada1: Pelada = {
    id: 'pelada-10',
    title: 'Pelada #10 — ⭐ Liga das Estrelas (3 Linhas)',
    date: satMinus2,
    time: '07:30',
    location: 'Arena Liga das Estrelas',
    status: 'finished',
    expectedPlayers: 18,
    lineCount: 3,
    playersPerLine: 6,
    participatingLineIds: ['line-laranja', 'line-branca', 'line-preta'],
    lineRosters: {
      'line-laranja': ['p3', 'p1', 'p2', 'p7', 'p9', 'p15'],
      'line-branca': ['p8', 'p4', 'p5', 'p11', 'p12', 'p16'],
      'line-preta': ['p13', 'p6', 'p10', 'p14', 'p17', 'p18'],
    },
    confirmedPlayerIds: p18Ids,
    presentPlayerIds: p18Ids,
    votingStatus: 'closed',
    allowPlayerUploads: true,
    officialPhotoId: 'photo-p10-1',
    championLineId: 'line-preta',
    createdAt: `${satMinus2}T07:00:00.000Z`,
    finishedAt: `${satMinus2}T10:30:00.000Z`,
    isDemo: true,
  };

  // Pelada 2: Sábado passado (24 jogadores -> 4 linhas de 6) — ENCERRADA (Última Pelada)
  const p24Ids = players.map((p) => p.id);
  const pelada2: Pelada = {
    id: 'pelada-11',
    title: 'Pelada #11 — ⭐ Liga das Estrelas (4 Linhas)',
    date: satMinus1,
    time: '07:30',
    location: 'Arena Liga das Estrelas',
    status: 'finished',
    expectedPlayers: 24,
    lineCount: 4,
    playersPerLine: 6,
    participatingLineIds: ['line-laranja', 'line-branca', 'line-preta', 'line-azul'],
    lineRosters: {
      'line-laranja': ['p3', 'p1', 'p2', 'p7', 'p15', 'p20'],
      'line-branca': ['p8', 'p4', 'p5', 'p11', 'p16', 'p21'],
      'line-preta': ['p13', 'p6', 'p10', 'p14', 'p18', 'p22'],
      'line-azul': ['p19', 'p9', 'p12', 'p17', 'p23', 'p24'],
    },
    confirmedPlayerIds: p24Ids,
    presentPlayerIds: p24Ids,
    votingStatus: 'closed',
    allowPlayerUploads: true,
    officialPhotoId: 'photo-p11-1',
    championLineId: 'line-laranja',
    createdAt: `${satMinus1}T07:00:00.000Z`,
    finishedAt: `${satMinus1}T10:45:00.000Z`,
    isDemo: true,
  };

  // Pelada 3: Sábado Atual (24 jogadores -> 4 linhas de 6) — EM ANDAMENTO + VOTAÇÃO ABERTA
  const pelada3: Pelada = {
    id: 'pelada-12',
    title: 'Pelada #12 — ⭐ Liga das Estrelas ⭐',
    date: satCurrent,
    time: '07:30',
    location: 'Arena Liga das Estrelas',
    status: 'in_progress',
    expectedPlayers: 24,
    lineCount: 4,
    playersPerLine: 6,
    participatingLineIds: ['line-laranja', 'line-branca', 'line-preta', 'line-azul'],
    lineRosters: {
      'line-laranja': ['p3', 'p1', 'p2', 'p7', 'p15', 'p20'],
      'line-branca': ['p8', 'p4', 'p5', 'p11', 'p16', 'p21'],
      'line-preta': ['p13', 'p6', 'p10', 'p14', 'p18', 'p22'],
      'line-azul': ['p19', 'p9', 'p12', 'p17', 'p23', 'p24'],
    },
    confirmedPlayerIds: p24Ids,
    presentPlayerIds: p24Ids,
    votingStatus: 'open',
    allowPlayerUploads: true,
    officialPhotoId: 'photo-p12-1',
    createdAt: `${satCurrent}T07:00:00.000Z`,
    isDemo: true,
  };

  const matches: MatchRecord[] = [
    // Pelada #10 (Linha Preta campeã)
    {
      id: 'm-10-1',
      peladaId: 'pelada-10',
      orderIndex: 1,
      homeLineId: 'line-preta',
      awayLineId: 'line-laranja',
      homeGoals: 3,
      awayGoals: 1,
      homeScorers: [{ playerId: 'p10', count: 2 }, { playerId: 'p6', count: 1 }],
      awayScorers: [{ playerId: 'p2', count: 1 }],
      createdAt: `${satMinus2}T08:00:00.000Z`,
    },
    {
      id: 'm-10-2',
      peladaId: 'pelada-10',
      orderIndex: 2,
      homeLineId: 'line-preta',
      awayLineId: 'line-branca',
      homeGoals: 2,
      awayGoals: 1,
      homeScorers: [{ playerId: 'p10', count: 1 }, { playerId: 'p18', count: 1 }],
      awayScorers: [{ playerId: 'p4', count: 1 }],
      createdAt: `${satMinus2}T08:25:00.000Z`,
    },
    {
      id: 'm-10-3',
      peladaId: 'pelada-10',
      orderIndex: 3,
      homeLineId: 'line-laranja',
      awayLineId: 'line-branca',
      homeGoals: 2,
      awayGoals: 2,
      homeScorers: [{ playerId: 'p2', count: 1 }, { playerId: 'p1', count: 1 }],
      awayScorers: [{ playerId: 'p12', count: 2 }],
      createdAt: `${satMinus2}T08:50:00.000Z`,
    },
    {
      id: 'm-10-4',
      peladaId: 'pelada-10',
      orderIndex: 4,
      homeLineId: 'line-preta',
      awayLineId: 'line-laranja',
      homeGoals: 1,
      awayGoals: 1,
      homeScorers: [{ playerId: 'p6', count: 1 }],
      awayScorers: [{ playerId: 'p2', count: 1 }],
      createdAt: `${satMinus2}T09:15:00.000Z`,
    },

    // Pelada #11 (Linha Laranja campeã — Última Pelada Encerrada)
    {
      id: 'm-11-1',
      peladaId: 'pelada-11',
      orderIndex: 1,
      homeLineId: 'line-laranja',
      awayLineId: 'line-branca',
      homeGoals: 3,
      awayGoals: 1,
      homeScorers: [{ playerId: 'p2', count: 2 }, { playerId: 'p1', count: 1 }],
      awayScorers: [{ playerId: 'p4', count: 1 }],
      createdAt: `${satMinus1}T08:00:00.000Z`,
    },
    {
      id: 'm-11-2',
      peladaId: 'pelada-11',
      orderIndex: 2,
      homeLineId: 'line-preta',
      awayLineId: 'line-azul',
      homeGoals: 2,
      awayGoals: 0,
      homeScorers: [{ playerId: 'p10', count: 1 }, { playerId: 'p18', count: 1 }],
      awayScorers: [],
      createdAt: `${satMinus1}T08:20:00.000Z`,
    },
    {
      id: 'm-11-3',
      peladaId: 'pelada-11',
      orderIndex: 3,
      homeLineId: 'line-laranja',
      awayLineId: 'line-preta',
      homeGoals: 2,
      awayGoals: 1,
      homeScorers: [{ playerId: 'p2', count: 1 }, { playerId: 'p15', count: 1 }],
      awayScorers: [{ playerId: 'p6', count: 1 }],
      createdAt: `${satMinus1}T08:40:00.000Z`,
    },
    {
      id: 'm-11-4',
      peladaId: 'pelada-11',
      orderIndex: 4,
      homeLineId: 'line-branca',
      awayLineId: 'line-azul',
      homeGoals: 2,
      awayGoals: 2,
      homeScorers: [{ playerId: 'p5', count: 1 }, { playerId: 'p4', count: 1 }],
      awayScorers: [{ playerId: 'p12', count: 2 }],
      createdAt: `${satMinus1}T09:00:00.000Z`,
    },
    {
      id: 'm-11-5',
      peladaId: 'pelada-11',
      orderIndex: 5,
      homeLineId: 'line-laranja',
      awayLineId: 'line-azul',
      homeGoals: 2,
      awayGoals: 0,
      homeScorers: [{ playerId: 'p2', count: 1 }, { playerId: 'p20', count: 1 }],
      awayScorers: [],
      createdAt: `${satMinus1}T09:25:00.000Z`,
    },

    // Pelada #12 (Sábado Atual — Em Andamento!)
    {
      id: 'm-12-1',
      peladaId: 'pelada-12',
      orderIndex: 1,
      homeLineId: 'line-laranja',
      awayLineId: 'line-branca',
      homeGoals: 2,
      awayGoals: 1,
      homeScorers: [{ playerId: 'p2', count: 1 }, { playerId: 'p1', count: 1 }],
      awayScorers: [{ playerId: 'p4', count: 1 }],
      createdAt: `${satCurrent}T08:00:00.000Z`,
    },
    {
      id: 'm-12-2',
      peladaId: 'pelada-12',
      orderIndex: 2,
      homeLineId: 'line-preta',
      awayLineId: 'line-laranja',
      homeGoals: 3,
      awayGoals: 0,
      homeScorers: [{ playerId: 'p10', count: 2 }, { playerId: 'p6', count: 1 }],
      awayScorers: [],
      createdAt: `${satCurrent}T08:22:00.000Z`,
    },
    {
      id: 'm-12-3',
      peladaId: 'pelada-12',
      orderIndex: 3,
      homeLineId: 'line-branca',
      awayLineId: 'line-preta',
      homeGoals: 2,
      awayGoals: 2,
      homeScorers: [{ playerId: 'p4', count: 1 }, { playerId: 'p5', count: 1 }],
      awayScorers: [{ playerId: 'p10', count: 1 }, { playerId: 'p18', count: 1 }],
      createdAt: `${satCurrent}T08:45:00.000Z`,
    },
    {
      id: 'm-12-4',
      peladaId: 'pelada-12',
      orderIndex: 4,
      homeLineId: 'line-laranja',
      awayLineId: 'line-azul',
      homeGoals: 3,
      awayGoals: 1,
      homeScorers: [{ playerId: 'p2', count: 2 }, { playerId: 'p15', count: 1 }],
      awayScorers: [{ playerId: 'p12', count: 1 }],
      createdAt: `${satCurrent}T09:10:00.000Z`,
    },
    {
      id: 'm-12-5',
      peladaId: 'pelada-12',
      orderIndex: 5,
      homeLineId: 'line-azul',
      awayLineId: 'line-branca',
      homeGoals: 1,
      awayGoals: 2,
      homeScorers: [{ playerId: 'p23', count: 1 }],
      awayScorers: [{ playerId: 'p4', count: 1 }, { playerId: 'p16', count: 1 }],
      createdAt: `${satCurrent}T09:35:00.000Z`,
    },
  ];

  // Agregar gols individuais automaticamente das partidas demo
  const goalsMap = new Map<string, PlayerRoundGoal>();
  for (const m of matches) {
    for (const s of [...m.homeScorers, ...m.awayScorers]) {
      const key = `${m.peladaId}_${s.playerId}`;
      const existing = goalsMap.get(key);
      if (existing) {
        existing.goals += s.count;
      } else {
        goalsMap.set(key, {
          id: key,
          peladaId: m.peladaId,
          playerId: s.playerId,
          goals: s.count,
          updatedAt: m.createdAt,
        });
      }
    }
  }
  const goals = Array.from(goalsMap.values());

  // Votos das peladas encerradas + votos secretos parciais na pelada #12 (deixando p1, p2, p3 livres para o usuário votar!)
  const votes: VoteRecord[] = [
    // Pelada #10 (Vencedores: p10 Felipe Matador & p13 Marcelo Gato)
    { id: 'pelada-10_p1_best_player', peladaId: 'pelada-10', voterUserId: 'u1', voterPlayerId: 'p1', candidatePlayerId: 'p10', category: 'best_player', createdAt: satMinus2 },
    { id: 'pelada-10_p2_best_player', peladaId: 'pelada-10', voterUserId: 'u2', voterPlayerId: 'p2', candidatePlayerId: 'p10', category: 'best_player', createdAt: satMinus2 },
    { id: 'pelada-10_p4_best_player', peladaId: 'pelada-10', voterUserId: 'u4', voterPlayerId: 'p4', candidatePlayerId: 'p10', category: 'best_player', createdAt: satMinus2 },
    { id: 'pelada-10_p5_best_player', peladaId: 'pelada-10', voterUserId: 'u5', voterPlayerId: 'p5', candidatePlayerId: 'p6', category: 'best_player', createdAt: satMinus2 },
    { id: 'pelada-10_p1_best_goalkeeper', peladaId: 'pelada-10', voterUserId: 'u1', voterPlayerId: 'p1', candidatePlayerId: 'p13', category: 'best_goalkeeper', createdAt: satMinus2 },
    { id: 'pelada-10_p2_best_goalkeeper', peladaId: 'pelada-10', voterUserId: 'u2', voterPlayerId: 'p2', candidatePlayerId: 'p13', category: 'best_goalkeeper', createdAt: satMinus2 },
    { id: 'pelada-10_p4_best_goalkeeper', peladaId: 'pelada-10', voterUserId: 'u4', voterPlayerId: 'p4', candidatePlayerId: 'p3', category: 'best_goalkeeper', createdAt: satMinus2 },

    // Pelada #11 (Vencedores: p2 Rafael Canhotinha & p3 Bruno Paredão)
    { id: 'pelada-11_p1_best_player', peladaId: 'pelada-11', voterUserId: 'u1', voterPlayerId: 'p1', candidatePlayerId: 'p2', category: 'best_player', createdAt: satMinus1 },
    { id: 'pelada-11_p4_best_player', peladaId: 'pelada-11', voterUserId: 'u4', voterPlayerId: 'p4', candidatePlayerId: 'p2', category: 'best_player', createdAt: satMinus1 },
    { id: 'pelada-11_p5_best_player', peladaId: 'pelada-11', voterUserId: 'u5', voterPlayerId: 'p5', candidatePlayerId: 'p2', category: 'best_player', createdAt: satMinus1 },
    { id: 'pelada-11_p6_best_player', peladaId: 'pelada-11', voterUserId: 'u6', voterPlayerId: 'p6', candidatePlayerId: 'p1', category: 'best_player', createdAt: satMinus1 },
    { id: 'pelada-11_p1_best_goalkeeper', peladaId: 'pelada-11', voterUserId: 'u1', voterPlayerId: 'p1', candidatePlayerId: 'p3', category: 'best_goalkeeper', createdAt: satMinus1 },
    { id: 'pelada-11_p2_best_goalkeeper', peladaId: 'pelada-11', voterUserId: 'u2', voterPlayerId: 'p2', candidatePlayerId: 'p3', category: 'best_goalkeeper', createdAt: satMinus1 },
    { id: 'pelada-11_p5_best_goalkeeper', peladaId: 'pelada-11', voterUserId: 'u5', voterPlayerId: 'p5', candidatePlayerId: 'p3', category: 'best_goalkeeper', createdAt: satMinus1 },
    { id: 'pelada-11_p6_best_goalkeeper', peladaId: 'pelada-11', voterUserId: 'u6', voterPlayerId: 'p6', candidatePlayerId: 'p8', category: 'best_goalkeeper', createdAt: satMinus1 },

    // Pelada #12 (Votação ABERTA e SECRETA! p4..p9 já votaram; p1, p2, p3 ainda podem votar!)
    { id: 'pelada-12_p4_best_player', peladaId: 'pelada-12', voterUserId: 'u4', voterPlayerId: 'p4', candidatePlayerId: 'p10', category: 'best_player', createdAt: satCurrent },
    { id: 'pelada-12_p5_best_player', peladaId: 'pelada-12', voterUserId: 'u5', voterPlayerId: 'p5', candidatePlayerId: 'p2', category: 'best_player', createdAt: satCurrent },
    { id: 'pelada-12_p6_best_player', peladaId: 'pelada-12', voterUserId: 'u6', voterPlayerId: 'p6', candidatePlayerId: 'p10', category: 'best_player', createdAt: satCurrent },
    { id: 'pelada-12_p7_best_player', peladaId: 'pelada-12', voterUserId: 'u7', voterPlayerId: 'p7', candidatePlayerId: 'p2', category: 'best_player', createdAt: satCurrent },
    { id: 'pelada-12_p9_best_player', peladaId: 'pelada-12', voterUserId: 'u9', voterPlayerId: 'p9', candidatePlayerId: 'p10', category: 'best_player', createdAt: satCurrent },
    { id: 'pelada-12_p4_best_goalkeeper', peladaId: 'pelada-12', voterUserId: 'u4', voterPlayerId: 'p4', candidatePlayerId: 'p3', category: 'best_goalkeeper', createdAt: satCurrent },
    { id: 'pelada-12_p5_best_goalkeeper', peladaId: 'pelada-12', voterUserId: 'u5', voterPlayerId: 'p5', candidatePlayerId: 'p13', category: 'best_goalkeeper', createdAt: satCurrent },
    { id: 'pelada-12_p6_best_goalkeeper', peladaId: 'pelada-12', voterUserId: 'u6', voterPlayerId: 'p6', candidatePlayerId: 'p13', category: 'best_goalkeeper', createdAt: satCurrent },
    { id: 'pelada-12_p7_best_goalkeeper', peladaId: 'pelada-12', voterUserId: 'u7', voterPlayerId: 'p7', candidatePlayerId: 'p3', category: 'best_goalkeeper', createdAt: satCurrent },
  ];

  const awards: RoundAward[] = [
    // Pelada #10
    { id: 'aw-10-bp', peladaId: 'pelada-10', category: 'best_player', winnerPlayerIds: ['p10'], metricValue: 3, createdAt: satMinus2 },
    { id: 'aw-10-gk', peladaId: 'pelada-10', category: 'best_goalkeeper', winnerPlayerIds: ['p13'], metricValue: 2, createdAt: satMinus2 },
    { id: 'aw-10-ts', peladaId: 'pelada-10', category: 'top_scorer', winnerPlayerIds: ['p10', 'p2'], metricValue: 3, createdAt: satMinus2 },

    // Pelada #11
    { id: 'aw-11-bp', peladaId: 'pelada-11', category: 'best_player', winnerPlayerIds: ['p2'], metricValue: 3, createdAt: satMinus1 },
    { id: 'aw-11-gk', peladaId: 'pelada-11', category: 'best_goalkeeper', winnerPlayerIds: ['p3'], metricValue: 3, createdAt: satMinus1 },
    { id: 'aw-11-ts', peladaId: 'pelada-11', category: 'top_scorer', winnerPlayerIds: ['p2'], metricValue: 4, createdAt: satMinus1 },
  ];

  const photos: PhotoItem[] = [
    {
      id: 'photo-p12-1',
      peladaId: 'pelada-12',
      url: createPeladaSceneSvg('⭐ Liga das Estrelas ⭐ — Pelada #12', '24 atletas confirmados na Arena Liga das Estrelas', '#A3E635', 'squad'),
      caption: 'Elenco da ⭐ Liga das Estrelas ⭐ reunido antes da abertura da Pelada #12!',
      date: satCurrent,
      uploadedByUserId: 'u1',
      uploadedByName: 'Carlos Eduardo (Capitão)',
      isOfficial: true,
      createdAt: `${satCurrent}T07:45:00.000Z`,
      isDemo: true,
    },
    {
      id: 'photo-p12-2',
      peladaId: 'pelada-12',
      url: createPeladaSceneSvg('Clássico: Linha Preta 3 x 0 Linha Laranja', 'Pressão total no segundo jogo da manhã', '#38BDF8', 'match'),
      caption: 'Jogo pegado entre Linha Preta e Linha Laranja valendo a liderança provisória.',
      date: satCurrent,
      uploadedByUserId: 'u2',
      uploadedByName: 'Rafael Mendes (Canhotinha)',
      isOfficial: false,
      createdAt: `${satCurrent}T08:30:00.000Z`,
      isDemo: true,
    },
    {
      id: 'photo-p11-1',
      peladaId: 'pelada-11',
      url: createPeladaSceneSvg('Linha Laranja Campeã Invicta!', 'Pelada #11 — 9 pontos conquistados em 3 vitórias', '#F97316', 'trophy'),
      caption: 'Foto oficial da Linha Laranja levantando o troféu de sábado passado!',
      date: satMinus1,
      uploadedByUserId: 'u1',
      uploadedByName: 'Carlos Eduardo (Capitão)',
      isOfficial: true,
      createdAt: `${satMinus1}T10:40:00.000Z`,
      isDemo: true,
    },
    {
      id: 'photo-p11-2',
      peladaId: 'pelada-11',
      url: createPeladaSceneSvg('Bruno "Paredão" Eleito Melhor Goleiro', 'Defesas decisivas garantiram o título de sábado', '#06B6D4', 'keeper'),
      caption: 'Paredão fechou o gol no último jogo contra a Linha Azul.',
      date: satMinus1,
      uploadedByUserId: 'u3',
      uploadedByName: 'Bruno Alves (Paredão)',
      isOfficial: false,
      createdAt: `${satMinus1}T10:50:00.000Z`,
      isDemo: true,
    },
    {
      id: 'photo-p10-1',
      peladaId: 'pelada-10',
      url: createPeladaSceneSvg('Linha Preta Campeã da Pelada #10', 'Domínio tático com 7 pontos na tabela', '#A3E635', 'trophy'),
      caption: 'Registro oficial da Linha Preta campeã da Pelada #10.',
      date: satMinus2,
      uploadedByUserId: 'u1',
      uploadedByName: 'Carlos Eduardo (Capitão)',
      isOfficial: true,
      createdAt: `${satMinus2}T10:30:00.000Z`,
      isDemo: true,
    },
  ];

  const notifications: AppNotification[] = [
    {
      id: 'notif-1',
      type: 'voting_open',
      title: 'Votação Aberta na Pelada #12! 🗳️',
      message: 'Os votos são secretos! Escolha o Melhor Jogador e o Melhor Goleiro da rodada.',
      peladaId: 'pelada-12',
      createdAt: `${satCurrent}T09:40:00.000Z`,
      readByUserIds: [],
    },
    {
      id: 'notif-2',
      type: 'presence_confirmed',
      title: '24 Atletas Confirmados ✅',
      message: 'Lista fechada com 24 jogadores distribuídos em 4 linhas de 6 atletas.',
      peladaId: 'pelada-12',
      createdAt: `${satCurrent}T07:25:00.000Z`,
      readByUserIds: [],
    },
    {
      id: 'notif-3',
      type: 'pelada_closed',
      title: 'Pelada #11 Encerrada — Linha Laranja Campeã! 🏆',
      message: 'Confira o resumo oficial, artilharia e os premiados da rodada anterior.',
      peladaId: 'pelada-11',
      createdAt: `${satMinus1}T10:45:00.000Z`,
      readByUserIds: ['u1'],
    },
  ];

  return {
    users,
    players,
    lines,
    peladas: [pelada3, pelada2, pelada1],
    matches,
    goals,
    votes,
    awards,
    photos,
    notifications,
  };
}
