import crypto from 'node:crypto';
import fs from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { Plugin } from 'vite';
import type {
  AppNotification,
  AppSnapshot,
  LineTeam,
  MatchRecord,
  NotificationType,
  Pelada,
  PeladaVotingSummary,
  PhotoItem,
  Player,
  PlayerRoundGoal,
  RoundAward,
  UserAccount,
  VoteCategory,
  VoteRecord,
} from '../src/types/domain';
import { buildDemoDataset } from '../src/utils/demoSeed';
import { createPlayerAvatarSvg } from '../src/utils/mediaAssets';
import {
  computePeladaStandings,
  computeRoundTopScorers,
  computeVoteTally,
} from '../src/utils/statsEngine';

interface StoredUserRow {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  role: 'admin' | 'player';
  playerId: string;
  createdAt: string;
  isDemo: number;
}

function hashPassword(password: string, salt = crypto.randomBytes(16).toString('hex')): string {
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const [salt, key] = stored.split(':');
  if (!salt || !key) return false;
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(key, 'hex'), Buffer.from(derived, 'hex'));
}

export function babaSqliteApiPlugin(): Plugin {
  const rootDir = process.cwd();
  const dataDir = path.join(rootDir, 'data');
  const uploadsDir = path.join(dataDir, 'uploads');
  fs.mkdirSync(uploadsDir, { recursive: true });
  const gitkeepPath = path.join(uploadsDir, '.gitkeep');
  if (!fs.existsSync(gitkeepPath)) {
    fs.writeFileSync(gitkeepPath, '');
  }

  const dbPath = path.join(dataDir, 'baba-stats.sqlite');
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode = TRUNCATE;');
  db.exec('PRAGMA foreign_keys = OFF;');

  // Inicializar tabelas (10 coleções exigidas + meta + notificações)
  db.exec(`
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      passwordHash TEXT NOT NULL,
      role TEXT NOT NULL,
      playerId TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      isDemo INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS players (
      id TEXT PRIMARY KEY,
      json TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS lines (
      id TEXT PRIMARY KEY,
      json TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS peladas (
      id TEXT PRIMARY KEY,
      json TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS matches (
      id TEXT PRIMARY KEY,
      peladaId TEXT NOT NULL,
      orderIndex INTEGER NOT NULL,
      json TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS results (
      id TEXT PRIMARY KEY,
      peladaId TEXT NOT NULL,
      json TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS goals (
      id TEXT PRIMARY KEY,
      peladaId TEXT NOT NULL,
      playerId TEXT NOT NULL,
      json TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS votes (
      id TEXT PRIMARY KEY,
      peladaId TEXT NOT NULL,
      voterPlayerId TEXT NOT NULL,
      category TEXT NOT NULL,
      json TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS awards (
      id TEXT PRIMARY KEY,
      peladaId TEXT NOT NULL,
      category TEXT NOT NULL,
      json TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS photos (
      id TEXT PRIMARY KEY,
      peladaId TEXT NOT NULL,
      json TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      createdAt TEXT NOT NULL,
      json TEXT NOT NULL
    );
  `);

  // Segredo persistente para assinatura de tokens JWT/HMAC
  let secretRow = db.prepare('SELECT value FROM meta WHERE key = ?').get('jwt_secret') as
    | { value: string }
    | undefined;
  if (!secretRow) {
    const newSecret = crypto.randomBytes(32).toString('hex');
    db.prepare('INSERT INTO meta (key, value) VALUES (?, ?)').run('jwt_secret', newSecret);
    secretRow = { value: newSecret };
  }
  const jwtSecret = secretRow.value;

  function signToken(userId: string): string {
    const payload = Buffer.from(
      JSON.stringify({ uid: userId, exp: Date.now() + 1000 * 60 * 60 * 24 * 14 })
    ).toString('base64url');
    const sig = crypto.createHmac('sha256', jwtSecret).update(payload).digest('base64url');
    return `${payload}.${sig}`;
  }

  function verifyToken(token?: string): string | null {
    if (!token) return null;
    const [payload, sig] = token.split('.');
    if (!payload || !sig) return null;
    const expected = crypto.createHmac('sha256', jwtSecret).update(payload).digest('base64url');
    if (sig !== expected) return null;
    try {
      const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
        uid: string;
        exp: number;
      };
      if (decoded.exp < Date.now()) return null;
      return decoded.uid;
    } catch {
      return null;
    }
  }

  function seedDemoData() {
    const demo = buildDemoDataset();
    db.exec('BEGIN TRANSACTION');
    try {
      db.exec(`
        DELETE FROM users;
        DELETE FROM players;
        DELETE FROM lines;
        DELETE FROM peladas;
        DELETE FROM matches;
        DELETE FROM results;
        DELETE FROM goals;
        DELETE FROM votes;
        DELETE FROM awards;
        DELETE FROM photos;
        DELETE FROM notifications;
      `);

      const insUser = db.prepare(
        'INSERT INTO users (id, name, email, passwordHash, role, playerId, createdAt, isDemo) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      );
      for (const u of demo.users) {
        insUser.run(
          u.id,
          u.name,
          u.email.toLowerCase(),
          hashPassword(u.demoPassword),
          u.role,
          u.playerId,
          u.createdAt,
          1
        );
      }

      const insPlayer = db.prepare('INSERT INTO players (id, json) VALUES (?, ?)');
      for (const p of demo.players) insPlayer.run(p.id, JSON.stringify(p));

      const insLine = db.prepare('INSERT INTO lines (id, json) VALUES (?, ?)');
      for (const l of demo.lines) insLine.run(l.id, JSON.stringify(l));

      const insPelada = db.prepare('INSERT INTO peladas (id, json) VALUES (?, ?)');
      for (const p of demo.peladas) insPelada.run(p.id, JSON.stringify(p));

      const insMatch = db.prepare(
        'INSERT INTO matches (id, peladaId, orderIndex, json) VALUES (?, ?, ?, ?)'
      );
      for (const m of demo.matches) insMatch.run(m.id, m.peladaId, m.orderIndex, JSON.stringify(m));

      const insGoal = db.prepare(
        'INSERT INTO goals (id, peladaId, playerId, json) VALUES (?, ?, ?, ?)'
      );
      for (const g of demo.goals) insGoal.run(g.id, g.peladaId, g.playerId, JSON.stringify(g));

      const insVote = db.prepare(
        'INSERT INTO votes (id, peladaId, voterPlayerId, category, json) VALUES (?, ?, ?, ?, ?)'
      );
      for (const v of demo.votes) {
        insVote.run(v.id, v.peladaId, v.voterPlayerId, v.category, JSON.stringify(v));
      }

      const insAward = db.prepare(
        'INSERT INTO awards (id, peladaId, category, json) VALUES (?, ?, ?, ?)'
      );
      for (const a of demo.awards) insAward.run(a.id, a.peladaId, a.category, JSON.stringify(a));

      const insPhoto = db.prepare('INSERT INTO photos (id, peladaId, json) VALUES (?, ?, ?)');
      for (const ph of demo.photos) insPhoto.run(ph.id, ph.peladaId, JSON.stringify(ph));

      const insNotif = db.prepare(
        'INSERT INTO notifications (id, createdAt, json) VALUES (?, ?, ?)'
      );
      for (const n of demo.notifications) insNotif.run(n.id, n.createdAt, JSON.stringify(n));

      db.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)').run('seeded', 'true');
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }

  const seededRow = db.prepare('SELECT value FROM meta WHERE key = ?').get('seeded') as
    | { value: string }
    | undefined;
  if (!seededRow) {
    const nowIso = new Date().toISOString();
    const baseLines: LineTeam[] = [
      { id: 'line-laranja', name: 'Linha Laranja', shortName: 'LAR', colorHex: '#F97316', textColorHex: '#090B0E', createdAt: nowIso },
      { id: 'line-branca', name: 'Linha Branca', shortName: 'BRA', colorHex: '#F8FAFC', textColorHex: '#090B0E', createdAt: nowIso },
      { id: 'line-preta', name: 'Linha Preta', shortName: 'PRE', colorHex: '#27272A', textColorHex: '#F8FAFC', createdAt: nowIso },
      { id: 'line-azul', name: 'Linha Azul', shortName: 'AZU', colorHex: '#3B82F6', textColorHex: '#F8FAFC', createdAt: nowIso },
    ];
    const insLine = db.prepare('INSERT OR IGNORE INTO lines (id, json) VALUES (?, ?)');
    for (const l of baseLines) insLine.run(l.id, JSON.stringify(l));
    db.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)').run('seeded', 'clean');
  }

  // Clientes SSE conectados para atualização simultânea em tempo real
  const sseClients = new Set<ServerResponse>();

  function broadcastEvent(eventType: string, payload: Record<string, unknown> = {}) {
    const data = JSON.stringify({ type: eventType, ...payload, ts: Date.now() });
    for (const client of sseClients) {
      try {
        client.write(`data: ${data}\n\n`);
      } catch {
        sseClients.delete(client);
      }
    }
  }

  function saveDataUrlIfImage(maybeDataUrl: string, prefix: string): string {
    if (!maybeDataUrl || !maybeDataUrl.startsWith('data:image/')) {
      return maybeDataUrl;
    }
    // Mantém SVGs leves embutidos; salva fotos raster reais (JPEG/PNG/WebP) no disco!
    if (maybeDataUrl.startsWith('data:image/svg+xml')) {
      return maybeDataUrl;
    }
    const match = maybeDataUrl.match(/^data:image\/([a-zA-Z0-9+]+);base64,(.+)$/);
    if (!match) return maybeDataUrl;
    const ext = match[1] === 'jpeg' ? 'jpg' : match[1];
    const buffer = Buffer.from(match[2], 'base64');
    const fileName = `${prefix}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${ext}`;
    fs.writeFileSync(path.join(uploadsDir, fileName), buffer);
    return `/uploads/${fileName}`;
  }

  function addNotification(
    type: NotificationType,
    title: string,
    message: string,
    peladaId?: string
  ): AppNotification {
    const notif: AppNotification = {
      id: `notif-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
      type,
      title,
      message,
      peladaId,
      createdAt: new Date().toISOString(),
      readByUserIds: [],
    };
    db.prepare('INSERT INTO notifications (id, createdAt, json) VALUES (?, ?, ?)').run(
      notif.id,
      notif.createdAt,
      JSON.stringify(notif)
    );
    return notif;
  }

  function consolidatePeladaAwards(peladaId: string) {
    const allVotesRows = db
      .prepare('SELECT json FROM votes WHERE peladaId = ?')
      .all(peladaId) as { json: string }[];
    const allVotes = allVotesRows.map((r) => JSON.parse(r.json) as VoteRecord);

    const bpVotes = allVotes.filter((v) => v.category === 'best_player');
    const gkVotes = allVotes.filter((v) => v.category === 'best_goalkeeper');

    const bpResult = computeVoteTally(bpVotes);
    const gkResult = computeVoteTally(gkVotes);

    const goalRows = db
      .prepare('SELECT json FROM goals WHERE peladaId = ?')
      .all(peladaId) as { json: string }[];
    const roundGoals = goalRows.map((r) => JSON.parse(r.json) as PlayerRoundGoal);
    const tsResult = computeRoundTopScorers(peladaId, roundGoals);

    db.prepare('DELETE FROM awards WHERE peladaId = ?').run(peladaId);
    const insAward = db.prepare(
      'INSERT INTO awards (id, peladaId, category, json) VALUES (?, ?, ?, ?)'
    );
    const now = new Date().toISOString();

    if (bpResult.winnerIds.length > 0) {
      const aw: RoundAward = {
        id: `aw-${peladaId}-bp`,
        peladaId,
        category: 'best_player',
        winnerPlayerIds: bpResult.winnerIds,
        metricValue: bpResult.topVotes,
        createdAt: now,
      };
      insAward.run(aw.id, peladaId, aw.category, JSON.stringify(aw));
    }

    if (gkResult.winnerIds.length > 0) {
      const aw: RoundAward = {
        id: `aw-${peladaId}-gk`,
        peladaId,
        category: 'best_goalkeeper',
        winnerPlayerIds: gkResult.winnerIds,
        metricValue: gkResult.topVotes,
        createdAt: now,
      };
      insAward.run(aw.id, peladaId, aw.category, JSON.stringify(aw));
    }

    if (tsResult.winnerPlayerIds.length > 0) {
      const aw: RoundAward = {
        id: `aw-${peladaId}-ts`,
        peladaId,
        category: 'top_scorer',
        winnerPlayerIds: tsResult.winnerPlayerIds,
        metricValue: tsResult.topGoals,
        createdAt: now,
      };
      insAward.run(aw.id, peladaId, aw.category, JSON.stringify(aw));
    }
  }

  function syncPeladaStandingsResult(peladaId: string) {
    const peladaRow = db.prepare('SELECT json FROM peladas WHERE id = ?').get(peladaId) as
      | { json: string }
      | undefined;
    if (!peladaRow) return;
    const pelada = JSON.parse(peladaRow.json) as Pelada;
    const lines = (db.prepare('SELECT json FROM lines').all() as { json: string }[]).map(
      (r) => JSON.parse(r.json) as LineTeam
    );
    const matches = (
      db
        .prepare('SELECT json FROM matches WHERE peladaId = ? ORDER BY orderIndex ASC')
        .all(peladaId) as { json: string }[]
    ).map((r) => JSON.parse(r.json) as MatchRecord);

    const standings = computePeladaStandings(pelada, lines, matches);
    db.prepare('INSERT OR REPLACE INTO results (id, peladaId, json) VALUES (?, ?, ?)').run(
      `res-${peladaId}`,
      peladaId,
      JSON.stringify({ peladaId, updatedAt: new Date().toISOString(), standings })
    );
  }

  function recalcScorersFromMatchesIfApplicable(
    peladaId: string,
    previousMatch: MatchRecord | null,
    nextMatch: MatchRecord | null
  ) {
    const deltas = new Map<string, number>();
    if (previousMatch) {
      for (const s of [...previousMatch.homeScorers, ...previousMatch.awayScorers]) {
        deltas.set(s.playerId, (deltas.get(s.playerId) ?? 0) - s.count);
      }
    }
    if (nextMatch) {
      for (const s of [...nextMatch.homeScorers, ...nextMatch.awayScorers]) {
        deltas.set(s.playerId, (deltas.get(s.playerId) ?? 0) + s.count);
      }
    }

    const now = new Date().toISOString();
    for (const [playerId, delta] of deltas.entries()) {
      if (delta === 0) continue;
      const goalId = `${peladaId}_${playerId}`;
      const existingRow = db.prepare('SELECT json FROM goals WHERE id = ?').get(goalId) as
        | { json: string }
        | undefined;
      const currentGoals = existingRow
        ? (JSON.parse(existingRow.json) as PlayerRoundGoal).goals
        : 0;
      const updatedCount = Math.max(0, currentGoals + delta);
      const entry: PlayerRoundGoal = {
        id: goalId,
        peladaId,
        playerId,
        goals: updatedCount,
        updatedAt: now,
      };
      db.prepare(
        'INSERT OR REPLACE INTO goals (id, peladaId, playerId, json) VALUES (?, ?, ?, ?)'
      ).run(goalId, peladaId, playerId, JSON.stringify(entry));
    }
  }

  function buildSnapshotForUser(currentUser: UserAccount | null): AppSnapshot {
    const userRows = db
      .prepare('SELECT id, name, email, role, playerId, createdAt, isDemo FROM users')
      .all() as Omit<StoredUserRow, 'passwordHash'>[];
    const users: UserAccount[] = userRows.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      playerId: u.playerId,
      createdAt: u.createdAt,
      isDemo: Boolean(u.isDemo),
    }));

    const players = (db.prepare('SELECT json FROM players').all() as { json: string }[]).map(
      (r) => JSON.parse(r.json) as Player
    );
    const lines = (db.prepare('SELECT json FROM lines').all() as { json: string }[]).map(
      (r) => JSON.parse(r.json) as LineTeam
    );
    const peladas = (db.prepare('SELECT json FROM peladas').all() as { json: string }[])
      .map((r) => JSON.parse(r.json) as Pelada)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const matches = (
      db.prepare('SELECT json FROM matches ORDER BY orderIndex ASC').all() as { json: string }[]
    ).map((r) => JSON.parse(r.json) as MatchRecord);
    const goals = (db.prepare('SELECT json FROM goals').all() as { json: string }[]).map(
      (r) => JSON.parse(r.json) as PlayerRoundGoal
    );
    const awards = (db.prepare('SELECT json FROM awards').all() as { json: string }[]).map(
      (r) => JSON.parse(r.json) as RoundAward
    );
    const photos = (db.prepare('SELECT json FROM photos').all() as { json: string }[])
      .map((r) => JSON.parse(r.json) as PhotoItem)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const notifications = (
      db.prepare('SELECT json FROM notifications ORDER BY createdAt DESC LIMIT 40').all() as {
        json: string;
      }[]
    ).map((r) => JSON.parse(r.json) as AppNotification);

    const allVotes = (db.prepare('SELECT json FROM votes').all() as { json: string }[]).map(
      (r) => JSON.parse(r.json) as VoteRecord
    );

    const votingSummaries: Record<string, PeladaVotingSummary> = {};
    for (const pelada of peladas) {
      const pVotes = allVotes.filter((v) => v.peladaId === pelada.id);
      const bpVotes = pVotes.filter((v) => v.category === 'best_player');
      const gkVotes = pVotes.filter((v) => v.category === 'best_goalkeeper');

      const myVotes: Partial<Record<VoteCategory, string>> = {};
      if (currentUser) {
        for (const v of pVotes) {
          if (v.voterPlayerId === currentUser.playerId || v.voterUserId === currentUser.id) {
            myVotes[v.category] = v.candidatePlayerId;
          }
        }
      }

      // REGRA SEÇÃO 6: Os votos são SECRETOS até o encerramento da votação!
      const isRevealed = pelada.votingStatus === 'closed' || pelada.status === 'finished';
      const bpComputed = isRevealed
        ? computeVoteTally(bpVotes)
        : { tally: [], winnerIds: [], topVotes: 0 };
      const gkComputed = isRevealed
        ? computeVoteTally(gkVotes)
        : { tally: [], winnerIds: [], topVotes: 0 };
      const tsComputed = computeRoundTopScorers(pelada.id, goals);

      votingSummaries[pelada.id] = {
        peladaId: pelada.id,
        votingStatus: pelada.votingStatus,
        myVotes,
        totalPresentPlayers: pelada.presentPlayerIds.length,
        votersWhoVotedBestPlayer: bpVotes.length,
        votersWhoVotedBestGoalkeeper: gkVotes.length,
        isRevealed,
        bestPlayerTally: bpComputed.tally,
        bestGoalkeeperTally: gkComputed.tally,
        bestPlayerWinnerIds: bpComputed.winnerIds,
        bestGoalkeeperWinnerIds: gkComputed.winnerIds,
        topScorerWinnerIds: tsComputed.winnerPlayerIds,
        topScorerGoals: tsComputed.topGoals,
      };
    }

    const hasDemoData =
      peladas.some((p) => p.isDemo) || players.some((p) => p.isDemo) || lines.some((l) => l.isDemo);

    return {
      backendMode: 'local-sqlite',
      hasDemoData,
      users,
      players,
      lines,
      peladas,
      matches,
      goals,
      awards,
      photos,
      notifications,
      votingSummaries,
    };
  }

  async function readBody(req: IncomingMessage): Promise<Record<string, any>> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      req.on('end', () => {
        if (chunks.length === 0) return resolve({});
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
        } catch (err) {
          reject(err);
        }
      });
      req.on('error', reject);
    });
  }

  function sendJson(res: ServerResponse, status: number, body: unknown) {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(body));
  }

  function getAuthUser(req: IncomingMessage): UserAccount | null {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined;
    const uid = verifyToken(token);
    if (!uid) return null;
    const row = db
      .prepare('SELECT id, name, email, role, playerId, createdAt, isDemo FROM users WHERE id = ?')
      .get(uid) as Omit<StoredUserRow, 'passwordHash'> | undefined;
    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      email: row.email,
      role: row.role,
      playerId: row.playerId,
      createdAt: row.createdAt,
      isDemo: Boolean(row.isDemo),
    };
  }

  return {
    name: 'baba-sqlite-api-plugin',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const rawUrl = req.url || '';
        const urlObj = new URL(rawUrl, 'http://localhost');
        const pathname = urlObj.pathname;

        // Servir fotos enviadas salvas no disco
        if (pathname.startsWith('/uploads/')) {
          const safeName = path.basename(pathname);
          const filePath = path.join(uploadsDir, safeName);
          if (fs.existsSync(filePath)) {
            const ext = path.extname(safeName).toLowerCase();
            const mime =
              ext === '.png'
                ? 'image/png'
                : ext === '.webp'
                ? 'image/webp'
                : ext === '.gif'
                ? 'image/gif'
                : 'image/jpeg';
            res.statusCode = 200;
            res.setHeader('Content-Type', mime);
            res.setHeader('Cache-Control', 'public, max-age=31536000');
            fs.createReadStream(filePath).pipe(res);
            return;
          }
          res.statusCode = 404;
          res.end('Not found');
          return;
        }

        if (!pathname.startsWith('/api/')) {
          return next();
        }

        try {
          const method = req.method || 'GET';

          // SSE Real-time Stream
          if (pathname === '/api/events' && method === 'GET') {
            res.writeHead(200, {
              'Content-Type': 'text/event-stream',
              'Cache-Control': 'no-cache',
              Connection: 'keep-alive',
            });
            res.write(`data: ${JSON.stringify({ type: 'connected', ts: Date.now() })}\n\n`);
            sseClients.add(res);
            req.on('close', () => {
              sseClients.delete(res);
            });
            return;
          }

          // Contas de demonstração disponíveis para login rápido no ambiente inicial
          if (pathname === '/api/auth/demo-accounts' && method === 'GET') {
            const rows = db
              .prepare(
                'SELECT id, name, email, role, playerId, isDemo FROM users WHERE isDemo = 1 LIMIT 6'
              )
              .all() as Omit<StoredUserRow, 'passwordHash' | 'createdAt'>[];
            return sendJson(res, 200, { accounts: rows });
          }

          // Exportação inicial dos jogadores/linhas/peladas locais para popular o Firebase no 1º acesso
          if (pathname === '/api/local-seed-for-firebase' && method === 'GET') {
            const players = (
              db.prepare('SELECT json FROM players').all() as { json: string }[]
            ).map((r) => JSON.parse(r.json) as Player);
            const lines = (db.prepare('SELECT json FROM lines').all() as { json: string }[]).map(
              (r) => JSON.parse(r.json) as LineTeam
            );
            const peladas = (
              db.prepare('SELECT json FROM peladas').all() as { json: string }[]
            ).map((r) => JSON.parse(r.json) as Pelada);
            return sendJson(res, 200, { players, lines, peladas });
          }

          // Login
          if (pathname === '/api/auth/login' && method === 'POST') {
            const body = await readBody(req);
            const rawEmail = String(body.email || '')
              .trim()
              .toLowerCase();
            const email = rawEmail.replace('@babastats.com', '@ligadasestrelas.com');
            const password = String(body.password || '');

            const row = (db
              .prepare('SELECT * FROM users WHERE email = ? OR email = ?')
              .get(email, rawEmail)) as StoredUserRow | undefined;
            if (!row || !verifyPassword(password, row.passwordHash)) {
              return sendJson(res, 401, { error: 'E-mail ou senha inválidos.' });
            }

            const user: UserAccount = {
              id: row.id,
              name: row.name,
              email: row.email,
              role: row.role,
              playerId: row.playerId,
              createdAt: row.createdAt,
              isDemo: Boolean(row.isDemo),
            };
            return sendJson(res, 200, {
              token: signToken(user.id),
              user,
              snapshot: buildSnapshotForUser(user),
            });
          }

          // Cadastro de nova conta
          if (pathname === '/api/auth/register' && method === 'POST') {
            const body = await readBody(req);
            const name = String(body.name || '').trim();
            const nickname = String(body.nickname || '').trim();
            const email = String(body.email || '')
              .trim()
              .toLowerCase();
            const password = String(body.password || '');
            const position = (body.position || 'Meia') as Player['position'];

            if (!name || !email || password.length < 6) {
              return sendJson(res, 400, {
                error: 'Preencha nome, e-mail válido e senha com no mínimo 6 caracteres.',
              });
            }

            const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
            if (existing) {
              return sendJson(res, 409, { error: 'Já existe um usuário com este e-mail.' });
            }

            // Se não existir nenhum admin no banco (ex: após limpar dados demo), o primeiro cadastro vira Admin!
            const anyAdmin = db
              .prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 1")
              .get();
            const role: 'admin' | 'player' = anyAdmin ? 'player' : 'admin';

            const now = new Date().toISOString();
            const userId = `u-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;

            // Verifica se já existe jogador cadastrado pelo admin com este mesmo e-mail ou nome exato sem vínculo
            const allPlayers = (
              db.prepare('SELECT json FROM players').all() as { json: string }[]
            ).map((r) => JSON.parse(r.json) as Player);

            let linkedPlayer = allPlayers.find(
              (p) =>
                !p.userId &&
                ((p.email && p.email.toLowerCase() === email) ||
                  p.name.toLowerCase() === name.toLowerCase())
            );

            if (linkedPlayer) {
              linkedPlayer = { ...linkedPlayer, userId, email, nickname: nickname || linkedPlayer.nickname };
              db.prepare('UPDATE players SET json = ? WHERE id = ?').run(
                JSON.stringify(linkedPlayer),
                linkedPlayer.id
              );
            } else {
              const newPlayerId = `p-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
              linkedPlayer = {
                id: newPlayerId,
                name,
                nickname: nickname || undefined,
                photoUrl: createPlayerAvatarSvg(name, '#A3E635'),
                position,
                userId,
                email,
                createdAt: now,
              };
              db.prepare('INSERT INTO players (id, json) VALUES (?, ?)').run(
                linkedPlayer.id,
                JSON.stringify(linkedPlayer)
              );
            }

            db.prepare(
              'INSERT INTO users (id, name, email, passwordHash, role, playerId, createdAt, isDemo) VALUES (?, ?, ?, ?, ?, ?, ?, 0)'
            ).run(userId, name, email, hashPassword(password), role, linkedPlayer.id, now);

            const user: UserAccount = {
              id: userId,
              name,
              email,
              role,
              playerId: linkedPlayer.id,
              createdAt: now,
            };

            broadcastEvent('data_updated');
            return sendJson(res, 201, {
              token: signToken(user.id),
              user,
              snapshot: buildSnapshotForUser(user),
            });
          }

          // Todas as rotas abaixo exigem autenticação
          const currentUser = getAuthUser(req);
          if (!currentUser) {
            return sendJson(res, 401, { error: 'Sessão expirada ou não autenticada.' });
          }

          if (pathname === '/api/auth/me' && method === 'GET') {
            return sendJson(res, 200, {
              user: currentUser,
              snapshot: buildSnapshotForUser(currentUser),
            });
          }

          if (pathname === '/api/snapshot' && method === 'GET') {
            return sendJson(res, 200, buildSnapshotForUser(currentUser));
          }

          const requireAdmin = (): boolean => {
            if (currentUser.role !== 'admin') {
              sendJson(res, 403, {
                error: 'Acesso negado: apenas Administradores podem executar esta ação.',
              });
              return false;
            }
            return true;
          };

          // --- GERENCIAMENTO DE DADOS DEMO ---
          if (pathname === '/api/admin/clear-demo' && method === 'POST') {
            if (!requireAdmin()) return;
            db.exec(`
              DELETE FROM matches;
              DELETE FROM results;
              DELETE FROM goals;
              DELETE FROM votes;
              DELETE FROM awards;
              DELETE FROM photos;
              DELETE FROM notifications;
              DELETE FROM peladas;
              DELETE FROM players WHERE id != '${currentUser.playerId}';
              DELETE FROM users WHERE id != '${currentUser.id}';
            `);
            // Mantém as 4 cores de linha padrão sem flag demo para facilitar organização, ou limpa isDemo
            const currentPlayerRow = db
              .prepare('SELECT json FROM players WHERE id = ?')
              .get(currentUser.playerId) as { json: string } | undefined;
            if (currentPlayerRow) {
              const pObj = JSON.parse(currentPlayerRow.json) as Player;
              delete pObj.isDemo;
              db.prepare('UPDATE players SET json = ? WHERE id = ?').run(
                JSON.stringify(pObj),
                pObj.id
              );
            }
            db.prepare('UPDATE users SET isDemo = 0 WHERE id = ?').run(currentUser.id);
            const linesRows = db.prepare('SELECT id, json FROM lines').all() as {
              id: string;
              json: string;
            }[];
            for (const lr of linesRows) {
              const lObj = JSON.parse(lr.json) as LineTeam;
              delete lObj.isDemo;
              db.prepare('UPDATE lines SET json = ? WHERE id = ?').run(JSON.stringify(lObj), lr.id);
            }
            broadcastEvent('data_updated');
            return sendJson(res, 200, buildSnapshotForUser(currentUser));
          }

          if (pathname === '/api/admin/reset-demo' && method === 'POST') {
            if (!requireAdmin()) return;
            seedDemoData();
            const adminRow = db
              .prepare("SELECT id, name, email, role, playerId, createdAt, isDemo FROM users WHERE role = 'admin' LIMIT 1")
              .get() as Omit<StoredUserRow, 'passwordHash'>;
            const refreshedUser: UserAccount = {
              id: adminRow.id,
              name: adminRow.name,
              email: adminRow.email,
              role: adminRow.role,
              playerId: adminRow.playerId,
              createdAt: adminRow.createdAt,
              isDemo: Boolean(adminRow.isDemo),
            };
            broadcastEvent('data_updated');
            return sendJson(res, 200, {
              token: signToken(refreshedUser.id),
              user: refreshedUser,
              snapshot: buildSnapshotForUser(refreshedUser),
            });
          }

          // Alterar permissão de usuário (Admin)
          if (pathname === '/api/users/role' && method === 'POST') {
            if (!requireAdmin()) return;
            const body = await readBody(req);
            const targetUserId = String(body.userId || '');
            const role = body.role === 'admin' ? 'admin' : 'player';
            if (targetUserId === currentUser.id && role !== 'admin') {
              return sendJson(res, 400, { error: 'Você não pode remover seu próprio acesso de administrador.' });
            }
            db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, targetUserId);
            broadcastEvent('data_updated');
            return sendJson(res, 200, buildSnapshotForUser(currentUser));
          }

          // --- JOGADORES (CRUD & LOTE DE LISTA EDITÁVEL) ---
          if (pathname === '/api/players/ensure-batch' && method === 'POST') {
            if (!requireAdmin()) return;
            const body = await readBody(req);
            const rawItems: {
              name: string;
              position?: Player['position'];
              matchedPlayerId?: string;
            }[] = Array.isArray(body.items) ? body.items : [];

            const existingRows = db.prepare('SELECT json FROM players').all() as { json: string }[];
            const existingPlayers = existingRows.map((r) => JSON.parse(r.json) as Player);
            const accents = ['#A3E635', '#F97316', '#38BDF8', '#FACC15', '#22C55E', '#A855F7'];

            const resolvedIds: string[] = [];
            const now = new Date().toISOString();

            db.exec('BEGIN TRANSACTION');
            try {
              for (let idx = 0; idx < rawItems.length; idx++) {
                const it = rawItems[idx];
                const cleanName = String(it.name || '').trim();
                if (!cleanName) continue;

                let target = it.matchedPlayerId
                  ? existingPlayers.find((p) => p.id === it.matchedPlayerId)
                  : undefined;

                if (!target) {
                  const lower = cleanName.toLowerCase();
                  target = existingPlayers.find(
                    (p) =>
                      p.name.toLowerCase() === lower ||
                      (p.nickname && p.nickname.toLowerCase() === lower)
                  );
                }

                if (target) {
                  if (it.position && target.position !== it.position) {
                    target.position = it.position;
                    target.updatedAt = now;
                    db.prepare('UPDATE players SET json = ? WHERE id = ?').run(
                      JSON.stringify(target),
                      target.id
                    );
                  }
                  if (!resolvedIds.includes(target.id)) {
                    resolvedIds.push(target.id);
                  }
                } else {
                  const newId = `p-${Date.now()}-${idx}-${crypto.randomBytes(2).toString('hex')}`;
                  const newPlayer: Player = {
                    id: newId,
                    name: cleanName,
                    photoUrl: createPlayerAvatarSvg(
                      cleanName,
                      accents[idx % accents.length]
                    ),
                    position: it.position || 'Meia',
                    createdAt: now,
                  };
                  db.prepare('INSERT INTO players (id, json) VALUES (?, ?)').run(
                    newId,
                    JSON.stringify(newPlayer)
                  );
                  existingPlayers.push(newPlayer);
                  resolvedIds.push(newId);
                }
              }
              db.exec('COMMIT');
            } catch (err) {
              db.exec('ROLLBACK');
              throw err;
            }

            broadcastEvent('data_updated');
            return sendJson(res, 200, {
              playerIds: resolvedIds,
              snapshot: buildSnapshotForUser(currentUser),
            });
          }

          if (pathname === '/api/players' && method === 'POST') {
            if (!requireAdmin()) return;
            const body = await readBody(req);
            const name = String(body.name || '').trim();
            if (!name) return sendJson(res, 400, { error: 'Nome do jogador é obrigatório.' });

            const id = `p-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
            const rawPhoto = body.photoUrl
              ? saveDataUrlIfImage(String(body.photoUrl), `avatar-${id}`)
              : createPlayerAvatarSvg(name, '#A3E635');

            const player: Player = {
              id,
              name,
              nickname: body.nickname ? String(body.nickname).trim() : undefined,
              photoUrl: rawPhoto,
              position: body.position || 'Meia',
              email: body.email ? String(body.email).trim().toLowerCase() : undefined,
              createdAt: new Date().toISOString(),
            };
            db.prepare('INSERT INTO players (id, json) VALUES (?, ?)').run(
              id,
              JSON.stringify(player)
            );
            broadcastEvent('data_updated');
            return sendJson(res, 201, buildSnapshotForUser(currentUser));
          }

          if (pathname.startsWith('/api/players/') && method === 'PUT') {
            const playerId = pathname.split('/')[3];
            const isSelf = currentUser.playerId === playerId;
            if (!isSelf && !requireAdmin()) return;

            const existingRow = db
              .prepare('SELECT json FROM players WHERE id = ?')
              .get(playerId) as { json: string } | undefined;
            if (!existingRow) return sendJson(res, 404, { error: 'Jogador não encontrado.' });

            const existing = JSON.parse(existingRow.json) as Player;
            const body = await readBody(req);
            const updatedName = body.name ? String(body.name).trim() : existing.name;
            const updatedPhoto = body.photoUrl
              ? saveDataUrlIfImage(String(body.photoUrl), `avatar-${playerId}`)
              : existing.photoUrl;

            const updated: Player = {
              ...existing,
              name: updatedName,
              nickname:
                body.nickname !== undefined
                  ? String(body.nickname).trim() || undefined
                  : existing.nickname,
              position: body.position || existing.position,
              photoUrl: updatedPhoto,
              updatedAt: new Date().toISOString(),
            };
            db.prepare('UPDATE players SET json = ? WHERE id = ?').run(
              JSON.stringify(updated),
              playerId
            );
            if (existing.userId) {
              db.prepare('UPDATE users SET name = ? WHERE id = ?').run(
                updated.name,
                existing.userId
              );
            }
            broadcastEvent('data_updated');
            return sendJson(res, 200, buildSnapshotForUser(currentUser));
          }

          if (pathname.startsWith('/api/players/') && method === 'DELETE') {
            if (!requireAdmin()) return;
            const playerId = pathname.split('/')[3];
            if (playerId === currentUser.playerId) {
              return sendJson(res, 400, {
                error: 'Não é permitido excluir o seu próprio perfil de administrador ativo.',
              });
            }
            db.prepare('DELETE FROM players WHERE id = ?').run(playerId);
            broadcastEvent('data_updated');
            return sendJson(res, 200, buildSnapshotForUser(currentUser));
          }

          // --- LINHAS / EQUIPES (CRUD) ---
          if (pathname === '/api/lines' && method === 'POST') {
            if (!requireAdmin()) return;
            const body = await readBody(req);
            const name = String(body.name || '').trim();
            if (!name) return sendJson(res, 400, { error: 'Informe o nome da linha.' });

            const id = `line-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
            const colorHex = String(body.colorHex || '#22C55E');
            const shortName = String(
              body.shortName ||
                name
                  .replace(/^linha\s+/i, '')
                  .slice(0, 3)
                  .toUpperCase()
            );
            const textColorHex = body.textColorHex || '#090B0E';

            const line: LineTeam = {
              id,
              name,
              shortName,
              colorHex,
              textColorHex,
              createdAt: new Date().toISOString(),
            };
            db.prepare('INSERT INTO lines (id, json) VALUES (?, ?)').run(id, JSON.stringify(line));
            broadcastEvent('data_updated');
            return sendJson(res, 201, buildSnapshotForUser(currentUser));
          }

          if (pathname.startsWith('/api/lines/') && method === 'PUT') {
            if (!requireAdmin()) return;
            const lineId = pathname.split('/')[3];
            const row = db.prepare('SELECT json FROM lines WHERE id = ?').get(lineId) as
              | { json: string }
              | undefined;
            if (!row) return sendJson(res, 404, { error: 'Linha não encontrada.' });
            const existing = JSON.parse(row.json) as LineTeam;
            const body = await readBody(req);
            const updated: LineTeam = {
              ...existing,
              name: body.name ? String(body.name).trim() : existing.name,
              shortName: body.shortName
                ? String(body.shortName).trim().toUpperCase().slice(0, 4)
                : existing.shortName,
              colorHex: body.colorHex || existing.colorHex,
              textColorHex: body.textColorHex || existing.textColorHex,
            };
            db.prepare('UPDATE lines SET json = ? WHERE id = ?').run(
              JSON.stringify(updated),
              lineId
            );
            broadcastEvent('data_updated');
            return sendJson(res, 200, buildSnapshotForUser(currentUser));
          }

          if (pathname.startsWith('/api/lines/') && method === 'DELETE') {
            if (!requireAdmin()) return;
            const lineId = pathname.split('/')[3];
            db.prepare('DELETE FROM lines WHERE id = ?').run(lineId);
            broadcastEvent('data_updated');
            return sendJson(res, 200, buildSnapshotForUser(currentUser));
          }

          // --- PELADAS ---
          if (pathname === '/api/peladas' && method === 'POST') {
            if (!requireAdmin()) return;
            const body = await readBody(req);
            const id = `pelada-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
            const participatingLineIds: string[] = Array.isArray(body.participatingLineIds)
              ? body.participatingLineIds
              : [];
            const lineRosters: Record<string, string[]> = body.lineRosters || {};
            for (const lid of participatingLineIds) {
              if (!lineRosters[lid]) lineRosters[lid] = [];
            }

            const pelada: Pelada = {
              id,
              title: String(body.title || 'Pelada de Sábado').trim(),
              date: String(body.date || new Date().toISOString().slice(0, 10)),
              time: String(body.time || '07:30'),
              location: String(body.location || 'Arena Society').trim(),
              status: body.status || 'open',
              expectedPlayers: Number(body.expectedPlayers) || 24,
              lineCount: Number(body.lineCount) || participatingLineIds.length || 4,
              playersPerLine: Number(body.playersPerLine) || 6,
              participatingLineIds,
              lineRosters,
              confirmedPlayerIds: Array.isArray(body.confirmedPlayerIds)
                ? body.confirmedPlayerIds
                : [],
              presentPlayerIds: Array.isArray(body.presentPlayerIds) ? body.presentPlayerIds : [],
              votingStatus: 'not_started',
              allowPlayerUploads:
                body.allowPlayerUploads !== undefined ? Boolean(body.allowPlayerUploads) : true,
              createdAt: new Date().toISOString(),
            };

            db.prepare('INSERT INTO peladas (id, json) VALUES (?, ?)').run(
              id,
              JSON.stringify(pelada)
            );
            syncPeladaStandingsResult(id);
            const notif = addNotification(
              'pelada_created',
              `Nova Pelada Criada: ${pelada.title} ⚽`,
              `Agendada para ${pelada.date.split('-').reverse().join('/')} às ${pelada.time}. Confirme já sua presença!`,
              id
            );
            broadcastEvent('notification', { notification: notif });
            return sendJson(res, 201, buildSnapshotForUser(currentUser));
          }

          // Confirmar/Cancelar própria presença (qualquer jogador autenticado)
          if (pathname.match(/^\/api\/peladas\/[^/]+\/confirm-self$/) && method === 'POST') {
            const peladaId = pathname.split('/')[3];
            const row = db.prepare('SELECT json FROM peladas WHERE id = ?').get(peladaId) as
              | { json: string }
              | undefined;
            if (!row) return sendJson(res, 404, { error: 'Pelada não encontrada.' });
            const pelada = JSON.parse(row.json) as Pelada;
            if (pelada.status === 'finished') {
              return sendJson(res, 400, { error: 'Esta pelada já foi encerrada.' });
            }

            const body = await readBody(req);
            const confirmed = Boolean(body.confirmed);
            const set = new Set(pelada.confirmedPlayerIds);
            if (confirmed) set.add(currentUser.playerId);
            else set.delete(currentUser.playerId);

            pelada.confirmedPlayerIds = Array.from(set);
            pelada.updatedAt = new Date().toISOString();
            db.prepare('UPDATE peladas SET json = ? WHERE id = ?').run(
              JSON.stringify(pelada),
              peladaId
            );

            if (confirmed) {
              const notif = addNotification(
                'presence_confirmed',
                'Presença Confirmada! ✅',
                `${currentUser.name} confirmou presença em ${pelada.title}.`,
                peladaId
              );
              broadcastEvent('notification', { notification: notif });
            } else {
              broadcastEvent('data_updated');
            }
            return sendJson(res, 200, buildSnapshotForUser(currentUser));
          }

          // Atualizar pelada (Admin: presenças, linhas, escalações, configurações, permissões)
          if (pathname.match(/^\/api\/peladas\/[^/]+$/) && method === 'PUT') {
            if (!requireAdmin()) return;
            const peladaId = pathname.split('/')[3];
            const row = db.prepare('SELECT json FROM peladas WHERE id = ?').get(peladaId) as
              | { json: string }
              | undefined;
            if (!row) return sendJson(res, 404, { error: 'Pelada não encontrada.' });
            const existing = JSON.parse(row.json) as Pelada;
            const body = await readBody(req);

            const updated: Pelada = {
              ...existing,
              ...body,
              id: existing.id,
              updatedAt: new Date().toISOString(),
            };
            db.prepare('UPDATE peladas SET json = ? WHERE id = ?').run(
              JSON.stringify(updated),
              peladaId
            );
            syncPeladaStandingsResult(peladaId);
            broadcastEvent('data_updated');
            return sendJson(res, 200, buildSnapshotForUser(currentUser));
          }

          // Abrir / Encerrar votação (Admin)
          if (pathname.match(/^\/api\/peladas\/[^/]+\/voting-status$/) && method === 'POST') {
            if (!requireAdmin()) return;
            const peladaId = pathname.split('/')[3];
            const row = db.prepare('SELECT json FROM peladas WHERE id = ?').get(peladaId) as
              | { json: string }
              | undefined;
            if (!row) return sendJson(res, 404, { error: 'Pelada não encontrada.' });
            const pelada = JSON.parse(row.json) as Pelada;
            const body = await readBody(req);
            const nextStatus = body.votingStatus as Pelada['votingStatus'];

            pelada.votingStatus = nextStatus;
            pelada.updatedAt = new Date().toISOString();
            db.prepare('UPDATE peladas SET json = ? WHERE id = ?').run(
              JSON.stringify(pelada),
              peladaId
            );

            if (nextStatus === 'open') {
              const notif = addNotification(
                'voting_open',
                `Votação Aberta: ${pelada.title} 🗳️`,
                'Vote agora no Melhor Jogador e no Melhor Goleiro da rodada! Os votos são secretos.',
                peladaId
              );
              broadcastEvent('notification', { notification: notif });
            } else if (nextStatus === 'closed') {
              consolidatePeladaAwards(peladaId);
              const notif = addNotification(
                'results_published',
                `Resultado Divulgado: Destaques de ${pelada.title} 🏆`,
                'A votação foi encerrada! Confira agora os vencedores das premiações individuais.',
                peladaId
              );
              broadcastEvent('notification', { notification: notif });
            } else {
              broadcastEvent('data_updated');
            }

            return sendJson(res, 200, buildSnapshotForUser(currentUser));
          }

          // ENCERRAR PELADA (Seção 9)
          if (pathname.match(/^\/api\/peladas\/[^/]+\/close$/) && method === 'POST') {
            if (!requireAdmin()) return;
            const peladaId = pathname.split('/')[3];
            const row = db.prepare('SELECT json FROM peladas WHERE id = ?').get(peladaId) as
              | { json: string }
              | undefined;
            if (!row) return sendJson(res, 404, { error: 'Pelada não encontrada.' });
            const pelada = JSON.parse(row.json) as Pelada;

            const lines = (db.prepare('SELECT json FROM lines').all() as { json: string }[]).map(
              (r) => JSON.parse(r.json) as LineTeam
            );
            const matches = (
              db.prepare('SELECT json FROM matches WHERE peladaId = ?').all(peladaId) as {
                json: string;
              }[]
            ).map((r) => JSON.parse(r.json) as MatchRecord);

            const standings = computePeladaStandings(pelada, lines, matches);
            const championLine = standings.length > 0 ? standings[0] : undefined;

            pelada.status = 'finished';
            pelada.votingStatus = 'closed';
            pelada.championLineId = championLine?.lineId;
            pelada.finishedAt = new Date().toISOString();
            pelada.updatedAt = pelada.finishedAt;

            db.prepare('UPDATE peladas SET json = ? WHERE id = ?').run(
              JSON.stringify(pelada),
              peladaId
            );
            consolidatePeladaAwards(peladaId);
            syncPeladaStandingsResult(peladaId);

            const notif = addNotification(
              'pelada_closed',
              `Pelada Encerrada! ${championLine ? `${championLine.lineName} Campeã 🏆` : 'Confira o Resumo!'}`,
              `${pelada.title} finalizada oficialmente. Veja a cerimônia de premiação e estatísticas finais!`,
              peladaId
            );
            broadcastEvent('notification', { notification: notif });
            return sendJson(res, 200, buildSnapshotForUser(currentUser));
          }

          // Reabrir pelada caso admin precise corrigir algo
          if (pathname.match(/^\/api\/peladas\/[^/]+\/reopen$/) && method === 'POST') {
            if (!requireAdmin()) return;
            const peladaId = pathname.split('/')[3];
            const row = db.prepare('SELECT json FROM peladas WHERE id = ?').get(peladaId) as
              | { json: string }
              | undefined;
            if (!row) return sendJson(res, 404, { error: 'Pelada não encontrada.' });
            const pelada = JSON.parse(row.json) as Pelada;
            pelada.status = 'in_progress';
            pelada.updatedAt = new Date().toISOString();
            db.prepare('UPDATE peladas SET json = ? WHERE id = ?').run(
              JSON.stringify(pelada),
              peladaId
            );
            broadcastEvent('data_updated');
            return sendJson(res, 200, buildSnapshotForUser(currentUser));
          }

          if (pathname.match(/^\/api\/peladas\/[^/]+$/) && method === 'DELETE') {
            if (!requireAdmin()) return;
            const peladaId = pathname.split('/')[3];
            db.prepare('DELETE FROM peladas WHERE id = ?').run(peladaId);
            db.prepare('DELETE FROM matches WHERE peladaId = ?').run(peladaId);
            db.prepare('DELETE FROM results WHERE peladaId = ?').run(peladaId);
            db.prepare('DELETE FROM goals WHERE peladaId = ?').run(peladaId);
            db.prepare('DELETE FROM votes WHERE peladaId = ?').run(peladaId);
            db.prepare('DELETE FROM awards WHERE peladaId = ?').run(peladaId);
            db.prepare('DELETE FROM photos WHERE peladaId = ?').run(peladaId);
            broadcastEvent('data_updated');
            return sendJson(res, 200, buildSnapshotForUser(currentUser));
          }

          // --- PARTIDAS (REGISTRO, EDIÇÃO, EXCLUSÃO + ATUALIZAÇÃO AUTOMÁTICA) ---
          if (pathname === '/api/matches' && method === 'POST') {
            if (!requireAdmin()) return;
            const body = await readBody(req);
            const peladaId = String(body.peladaId || '');
            const homeLineId = String(body.homeLineId || '');
            const awayLineId = String(body.awayLineId || '');
            if (!peladaId || !homeLineId || !awayLineId || homeLineId === awayLineId) {
              return sendJson(res, 400, {
                error: 'Selecione duas linhas diferentes para registrar a partida.',
              });
            }

            const countRow = db
              .prepare('SELECT MAX(orderIndex) as maxIdx FROM matches WHERE peladaId = ?')
              .get(peladaId) as { maxIdx: number | null };
            const nextIdx = (countRow?.maxIdx ?? 0) + 1;

            const match: MatchRecord = {
              id: `m-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
              peladaId,
              orderIndex: nextIdx,
              homeLineId,
              awayLineId,
              homeGoals: Math.max(0, Number(body.homeGoals) || 0),
              awayGoals: Math.max(0, Number(body.awayGoals) || 0),
              homeScorers: Array.isArray(body.homeScorers) ? body.homeScorers : [],
              awayScorers: Array.isArray(body.awayScorers) ? body.awayScorers : [],
              createdAt: new Date().toISOString(),
            };

            db.prepare(
              'INSERT INTO matches (id, peladaId, orderIndex, json) VALUES (?, ?, ?, ?)'
            ).run(match.id, peladaId, match.orderIndex, JSON.stringify(match));

            // Se a pelada estava apenas 'open', passa automaticamente para 'in_progress'
            const pRow = db.prepare('SELECT json FROM peladas WHERE id = ?').get(peladaId) as
              | { json: string }
              | undefined;
            if (pRow) {
              const pObj = JSON.parse(pRow.json) as Pelada;
              if (pObj.status === 'open') {
                pObj.status = 'in_progress';
                db.prepare('UPDATE peladas SET json = ? WHERE id = ?').run(
                  JSON.stringify(pObj),
                  peladaId
                );
              }
            }

            recalcScorersFromMatchesIfApplicable(peladaId, null, match);
            syncPeladaStandingsResult(peladaId);
            if (pRow) {
              const pObj = JSON.parse(pRow.json) as Pelada;
              if (pObj.votingStatus === 'closed' || pObj.status === 'finished') {
                consolidatePeladaAwards(peladaId);
              }
            }

            broadcastEvent('data_updated');
            return sendJson(res, 201, buildSnapshotForUser(currentUser));
          }

          if (pathname.startsWith('/api/matches/') && method === 'PUT') {
            if (!requireAdmin()) return;
            const matchId = pathname.split('/')[3];
            const row = db.prepare('SELECT json FROM matches WHERE id = ?').get(matchId) as
              | { json: string }
              | undefined;
            if (!row) return sendJson(res, 404, { error: 'Partida não encontrada.' });
            const prevMatch = JSON.parse(row.json) as MatchRecord;
            const body = await readBody(req);

            const updated: MatchRecord = {
              ...prevMatch,
              homeLineId: body.homeLineId || prevMatch.homeLineId,
              awayLineId: body.awayLineId || prevMatch.awayLineId,
              homeGoals:
                body.homeGoals !== undefined
                  ? Math.max(0, Number(body.homeGoals))
                  : prevMatch.homeGoals,
              awayGoals:
                body.awayGoals !== undefined
                  ? Math.max(0, Number(body.awayGoals))
                  : prevMatch.awayGoals,
              homeScorers: Array.isArray(body.homeScorers)
                ? body.homeScorers
                : prevMatch.homeScorers,
              awayScorers: Array.isArray(body.awayScorers)
                ? body.awayScorers
                : prevMatch.awayScorers,
            };

            db.prepare('UPDATE matches SET json = ? WHERE id = ?').run(
              JSON.stringify(updated),
              matchId
            );
            recalcScorersFromMatchesIfApplicable(updated.peladaId, prevMatch, updated);
            syncPeladaStandingsResult(updated.peladaId);
            broadcastEvent('data_updated');
            return sendJson(res, 200, buildSnapshotForUser(currentUser));
          }

          if (pathname.startsWith('/api/matches/') && method === 'DELETE') {
            if (!requireAdmin()) return;
            const matchId = pathname.split('/')[3];
            const row = db.prepare('SELECT json FROM matches WHERE id = ?').get(matchId) as
              | { json: string }
              | undefined;
            if (!row) return sendJson(res, 404, { error: 'Partida não encontrada.' });
            const prevMatch = JSON.parse(row.json) as MatchRecord;

            db.prepare('DELETE FROM matches WHERE id = ?').run(matchId);
            recalcScorersFromMatchesIfApplicable(prevMatch.peladaId, prevMatch, null);
            syncPeladaStandingsResult(prevMatch.peladaId);
            broadcastEvent('data_updated');
            return sendJson(res, 200, buildSnapshotForUser(currentUser));
          }

          // --- GOLS INDIVIDUAIS (AJUSTE DIRETO PELO ADMIN — Seção 6) ---
          if (pathname === '/api/goals' && method === 'POST') {
            if (!requireAdmin()) return;
            const body = await readBody(req);
            const peladaId = String(body.peladaId || '');
            const playerId = String(body.playerId || '');
            const goalsCount = Math.max(0, Number(body.goals) || 0);
            if (!peladaId || !playerId) {
              return sendJson(res, 400, { error: 'Pelada e jogador são obrigatórios.' });
            }

            const id = `${peladaId}_${playerId}`;
            const entry: PlayerRoundGoal = {
              id,
              peladaId,
              playerId,
              goals: goalsCount,
              updatedAt: new Date().toISOString(),
            };
            db.prepare(
              'INSERT OR REPLACE INTO goals (id, peladaId, playerId, json) VALUES (?, ?, ?, ?)'
            ).run(id, peladaId, playerId, JSON.stringify(entry));

            const pRow = db.prepare('SELECT json FROM peladas WHERE id = ?').get(peladaId) as
              | { json: string }
              | undefined;
            if (pRow) {
              const pObj = JSON.parse(pRow.json) as Pelada;
              if (pObj.votingStatus === 'closed' || pObj.status === 'finished') {
                consolidatePeladaAwards(peladaId);
              }
            }

            broadcastEvent('data_updated');
            return sendJson(res, 200, buildSnapshotForUser(currentUser));
          }

          // --- VOTAÇÕES SECRETAS (Validação estrita das regras da Seção 6!) ---
          if (pathname === '/api/votes' && method === 'POST') {
            const body = await readBody(req);
            const peladaId = String(body.peladaId || '');
            const candidatePlayerId = String(body.candidatePlayerId || '');
            const category = body.category as VoteCategory;

            if (
              !peladaId ||
              !candidatePlayerId ||
              (category !== 'best_player' && category !== 'best_goalkeeper')
            ) {
              return sendJson(res, 400, { error: 'Dados de voto inválidos.' });
            }

            const pRow = db.prepare('SELECT json FROM peladas WHERE id = ?').get(peladaId) as
              | { json: string }
              | undefined;
            if (!pRow) return sendJson(res, 404, { error: 'Pelada não encontrada.' });
            const pelada = JSON.parse(pRow.json) as Pelada;

            // Regra 1: Votação precisa estar aberta
            if (pelada.votingStatus !== 'open') {
              return sendJson(res, 400, {
                error: 'A votação desta pelada não está aberta no momento.',
              });
            }

            // Regra 2: Somente jogadores PRESENTES podem votar
            if (!pelada.presentPlayerIds.includes(currentUser.playerId)) {
              return sendJson(res, 403, {
                error: 'Somente jogadores presentes na pelada podem votar.',
              });
            }

            // Regra 3: Não é permitido votar em si mesmo
            if (candidatePlayerId === currentUser.playerId) {
              return sendJson(res, 400, {
                error: 'Não é permitido votar em si mesmo!',
              });
            }

            // Candidato também precisa estar presente na pelada
            if (!pelada.presentPlayerIds.includes(candidatePlayerId)) {
              return sendJson(res, 400, {
                error: 'O candidato escolhido não consta como presente nesta pelada.',
              });
            }

            // Regra 4: Cada jogador vota apenas UMA vez por categoria (evita votos duplicados)
            const voteId = `${peladaId}_${currentUser.playerId}_${category}`;
            const existingVote = db.prepare('SELECT id FROM votes WHERE id = ?').get(voteId);
            if (existingVote) {
              return sendJson(res, 409, {
                error: 'Você já registrou seu voto nesta categoria para esta pelada.',
              });
            }

            const vote: VoteRecord = {
              id: voteId,
              peladaId,
              voterUserId: currentUser.id,
              voterPlayerId: currentUser.playerId,
              candidatePlayerId,
              category,
              createdAt: new Date().toISOString(),
            };

            db.prepare(
              'INSERT INTO votes (id, peladaId, voterPlayerId, category, json) VALUES (?, ?, ?, ?, ?)'
            ).run(vote.id, peladaId, currentUser.playerId, category, JSON.stringify(vote));

            broadcastEvent('data_updated');
            return sendJson(res, 201, buildSnapshotForUser(currentUser));
          }

          // --- GALERIA "MOMENTOS DA PELADA" ---
          if (pathname === '/api/photos' && method === 'POST') {
            const body = await readBody(req);
            const peladaId = String(body.peladaId || '');
            const rawImage = String(body.url || '');
            const caption = String(body.caption || '').trim();

            if (!peladaId || !rawImage) {
              return sendJson(res, 400, { error: 'Selecione a pelada e uma imagem válida.' });
            }

            const pRow = db.prepare('SELECT json FROM peladas WHERE id = ?').get(peladaId) as
              | { json: string }
              | undefined;
            if (!pRow) return sendJson(res, 404, { error: 'Pelada não encontrada.' });
            const pelada = JSON.parse(pRow.json) as Pelada;

            // Respeita permissão definida pelo Administrador (Seção 7)
            if (currentUser.role !== 'admin' && !pelada.allowPlayerUploads) {
              return sendJson(res, 403, {
                error: 'O administrador restringiu o envio de fotos nesta rodada.',
              });
            }

            const id = `photo-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
            const savedUrl = saveDataUrlIfImage(rawImage, `pelada-${peladaId}`);
            const makeOfficial = Boolean(body.isOfficial) && currentUser.role === 'admin';

            if (makeOfficial) {
              const existingPhotos = db
                .prepare('SELECT id, json FROM photos WHERE peladaId = ?')
                .all(peladaId) as { id: string; json: string }[];
              for (const ep of existingPhotos) {
                const phObj = JSON.parse(ep.json) as PhotoItem;
                if (phObj.isOfficial) {
                  phObj.isOfficial = false;
                  db.prepare('UPDATE photos SET json = ? WHERE id = ?').run(
                    JSON.stringify(phObj),
                    ep.id
                  );
                }
              }
              pelada.officialPhotoId = id;
              db.prepare('UPDATE peladas SET json = ? WHERE id = ?').run(
                JSON.stringify(pelada),
                peladaId
              );
            }

            const photo: PhotoItem = {
              id,
              peladaId,
              url: savedUrl,
              caption: caption || `Momento de ${pelada.title}`,
              date: pelada.date,
              uploadedByUserId: currentUser.id,
              uploadedByName: currentUser.name,
              isOfficial: makeOfficial,
              createdAt: new Date().toISOString(),
            };

            db.prepare('INSERT INTO photos (id, peladaId, json) VALUES (?, ?, ?)').run(
              id,
              peladaId,
              JSON.stringify(photo)
            );
            broadcastEvent('data_updated');
            return sendJson(res, 201, buildSnapshotForUser(currentUser));
          }

          if (pathname.match(/^\/api\/photos\/[^/]+\/official$/) && method === 'POST') {
            if (!requireAdmin()) return;
            const photoId = pathname.split('/')[3];
            const row = db.prepare('SELECT json FROM photos WHERE id = ?').get(photoId) as
              | { json: string }
              | undefined;
            if (!row) return sendJson(res, 404, { error: 'Foto não encontrada.' });
            const target = JSON.parse(row.json) as PhotoItem;

            const siblings = db
              .prepare('SELECT id, json FROM photos WHERE peladaId = ?')
              .all(target.peladaId) as { id: string; json: string }[];
            for (const s of siblings) {
              const ph = JSON.parse(s.json) as PhotoItem;
              ph.isOfficial = s.id === photoId;
              db.prepare('UPDATE photos SET json = ? WHERE id = ?').run(JSON.stringify(ph), s.id);
            }

            const pRow = db
              .prepare('SELECT json FROM peladas WHERE id = ?')
              .get(target.peladaId) as { json: string } | undefined;
            if (pRow) {
              const pelada = JSON.parse(pRow.json) as Pelada;
              pelada.officialPhotoId = photoId;
              db.prepare('UPDATE peladas SET json = ? WHERE id = ?').run(
                JSON.stringify(pelada),
                pelada.id
              );
            }

            broadcastEvent('data_updated');
            return sendJson(res, 200, buildSnapshotForUser(currentUser));
          }

          if (pathname.startsWith('/api/photos/') && method === 'DELETE') {
            const photoId = pathname.split('/')[3];
            const row = db.prepare('SELECT json FROM photos WHERE id = ?').get(photoId) as
              | { json: string }
              | undefined;
            if (!row) return sendJson(res, 404, { error: 'Foto não encontrada.' });
            const photo = JSON.parse(row.json) as PhotoItem;
            if (currentUser.role !== 'admin' && photo.uploadedByUserId !== currentUser.id) {
              return sendJson(res, 403, { error: 'Sem permissão para excluir esta foto.' });
            }
            db.prepare('DELETE FROM photos WHERE id = ?').run(photoId);
            broadcastEvent('data_updated');
            return sendJson(res, 200, buildSnapshotForUser(currentUser));
          }

          // --- NOTIFICAÇÕES ---
          if (pathname === '/api/notifications' && method === 'DELETE') {
            if (!requireAdmin()) return;
            db.exec('DELETE FROM notifications;');
            broadcastEvent('data_updated');
            return sendJson(res, 200, buildSnapshotForUser(currentUser));
          }

          if (pathname === '/api/notifications/mark-read' && method === 'POST') {
            const rows = db.prepare('SELECT id, json FROM notifications').all() as {
              id: string;
              json: string;
            }[];
            for (const r of rows) {
              const n = JSON.parse(r.json) as AppNotification;
              if (!n.readByUserIds.includes(currentUser.id)) {
                n.readByUserIds.push(currentUser.id);
                db.prepare('UPDATE notifications SET json = ? WHERE id = ?').run(
                  JSON.stringify(n),
                  r.id
                );
              }
            }
            return sendJson(res, 200, buildSnapshotForUser(currentUser));
          }

          return sendJson(res, 404, { error: `Rota não encontrada: ${method} ${pathname}` });
        } catch (err: any) {
          console.error('[BABA STATS API Error]', err);
          return sendJson(res, 500, {
            error: err?.message || 'Erro interno no servidor.',
          });
        }
      });
    },
  };
}
