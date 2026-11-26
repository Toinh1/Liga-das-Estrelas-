/**
 * Store em tempo real do Firestore.
 *
 * Cada coleção é assinada UMA vez com onSnapshot; depois disso só as mudanças
 * trafegam. O snapshot da aplicação é reconstruído localmente (com debounce),
 * o que elimina as releituras completas que aconteciam a cada ação.
 */
import {
  collection,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
  type DocumentData,
  type Query,
  type Unsubscribe,
} from 'firebase/firestore';
import type {
  AppNotification,
  AppSnapshot,
  LineTeam,
  MatchRecord,
  Pelada,
  PeladaVotingSummary,
  PhotoItem,
  Player,
  PlayerRoundGoal,
  RoundAward,
  Season,
  UserAccount,
  VoteCategory,
  VoteRecord,
} from '../types/domain';
import { computeRoundTopScorers, computeVoteTally, deriveRoundGoals } from '../utils/statsEngine';
import { getFirebaseServices } from './firebaseClient';
import {
  normalizeLegacyGoal,
  normalizeMatch,
  normalizePelada,
  normalizePhoto,
  normalizePlayer,
  normalizeSeason,
} from './normalize';

interface StoreState {
  users: UserAccount[];
  players: Player[];
  lines: LineTeam[];
  seasons: Season[];
  peladas: Pelada[];
  matches: MatchRecord[];
  legacyGoals: PlayerRoundGoal[];
  awards: RoundAward[];
  photos: PhotoItem[];
  notifications: AppNotification[];
  myVotes: VoteRecord[];
}

const emptyState = (): StoreState => ({
  users: [],
  players: [],
  lines: [],
  seasons: [],
  peladas: [],
  matches: [],
  legacyGoals: [],
  awards: [],
  photos: [],
  notifications: [],
  myVotes: [],
});

const isRevealed = (p: Pelada) => p.votingStatus === 'closed' || p.status === 'finished';

class RealtimeStore {
  private state: StoreState = emptyState();
  private user: UserAccount | null = null;
  private unsubs: Unsubscribe[] = [];
  private revealedVotes = new Map<string, VoteRecord[]>();
  private fetchingVotes = new Set<string>();
  private listeners = new Set<(snap: AppSnapshot) => void>();
  private notifListeners = new Set<(n: AppNotification) => void>();
  private snapshot: AppSnapshot | null = null;
  private rebuildTimer: ReturnType<typeof setTimeout> | null = null;
  private knownNotifIds: Set<string> | null = null;

  get current(): AppSnapshot | null {
    return this.snapshot;
  }

  get raw(): Readonly<StoreState> {
    return this.state;
  }

  get currentUser(): UserAccount | null {
    return this.user;
  }

  subscribe(fn: (snap: AppSnapshot) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  onNotification(fn: (n: AppNotification) => void): () => void {
    this.notifListeners.add(fn);
    return () => this.notifListeners.delete(fn);
  }

  /** Inicia as assinaturas e resolve quando todas as coleções chegaram pela 1ª vez. */
  start(user: UserAccount): Promise<AppSnapshot> {
    this.stop();
    this.user = user;
    const fb = getFirebaseServices();
    const db = fb.db;

    type Key = Exclude<keyof StoreState, never>;
    const sources: { key: Key; q: Query<DocumentData>; map: (d: DocumentData) => any }[] = [
      { key: 'users', q: query(collection(db, 'users')), map: (d) => d as UserAccount },
      { key: 'players', q: query(collection(db, 'players')), map: normalizePlayer },
      { key: 'lines', q: query(collection(db, 'lines')), map: (d) => d as LineTeam },
      { key: 'seasons', q: query(collection(db, 'seasons')), map: normalizeSeason },
      { key: 'peladas', q: query(collection(db, 'peladas')), map: normalizePelada },
      { key: 'matches', q: query(collection(db, 'matches')), map: normalizeMatch },
      { key: 'legacyGoals', q: query(collection(db, 'goals')), map: normalizeLegacyGoal },
      { key: 'awards', q: query(collection(db, 'awards')), map: (d) => d as RoundAward },
      { key: 'photos', q: query(collection(db, 'photos')), map: normalizePhoto },
      {
        key: 'notifications',
        q: query(collection(db, 'notifications'), orderBy('createdAt', 'desc'), limit(40)),
        map: (d) => d as AppNotification,
      },
      {
        key: 'myVotes',
        q: query(collection(db, 'votes'), where('voterUserId', '==', user.id)),
        map: (d) => d as VoteRecord,
      },
    ];

    return new Promise<AppSnapshot>((resolve) => {
      const pending = new Set<Key>(sources.map((s) => s.key));
      const markLoaded = (key: Key) => {
        if (!pending.has(key)) return;
        pending.delete(key);
        if (pending.size === 0) {
          this.rebuildNow();
          resolve(this.snapshot!);
        }
      };

      for (const src of sources) {
        const unsub = onSnapshot(
          src.q,
          (qs) => {
            (this.state as any)[src.key] = qs.docs.map((d) => src.map(d.data()));
            if (src.key === 'notifications') this.detectNewNotifications();
            if (src.key === 'peladas') this.syncRevealedVotes();
            markLoaded(src.key);
            this.scheduleRebuild();
          },
          (err) => {
            // Coleção sem permissão (ex.: regras ainda não publicadas) não pode travar o app
            console.warn(`[FutebolB3] Falha ao assinar "${src.key}":`, err.code || err.message);
            (this.state as any)[src.key] = [];
            markLoaded(src.key);
            this.scheduleRebuild();
          }
        );
        this.unsubs.push(unsub);
      }
    });
  }

  stop() {
    this.unsubs.forEach((u) => u());
    this.unsubs = [];
    this.state = emptyState();
    this.revealedVotes.clear();
    this.fetchingVotes.clear();
    this.knownNotifIds = null;
    this.snapshot = null;
    this.user = null;
    if (this.rebuildTimer) clearTimeout(this.rebuildTimer);
    this.rebuildTimer = null;
  }

  /** Atualiza o próprio usuário (ex.: mudança de papel) mantendo as assinaturas. */
  setUser(user: UserAccount) {
    this.user = user;
    this.scheduleRebuild();
  }

  /** Força atualização dos votos de uma pelada (ex.: após encerrar votação). */
  invalidateVotes(peladaId: string) {
    this.revealedVotes.delete(peladaId);
    this.syncRevealedVotes();
  }

  getRevealedVotes(peladaId: string): VoteRecord[] | undefined {
    return this.revealedVotes.get(peladaId);
  }

  private detectNewNotifications() {
    const ids = new Set(this.state.notifications.map((n) => n.id));
    if (this.knownNotifIds) {
      for (const n of this.state.notifications) {
        if (!this.knownNotifIds.has(n.id)) this.notifListeners.forEach((fn) => fn(n));
      }
    }
    this.knownNotifIds = ids;
  }

  /** Votos só podem ser lidos após a revelação (regra do Firestore). */
  private syncRevealedVotes() {
    const fb = getFirebaseServices();
    for (const p of this.state.peladas) {
      if (!isRevealed(p)) {
        this.revealedVotes.delete(p.id);
        continue;
      }
      if (this.revealedVotes.has(p.id) || this.fetchingVotes.has(p.id)) continue;
      this.fetchingVotes.add(p.id);
      getDocs(query(collection(fb.db, 'votes'), where('peladaId', '==', p.id)))
        .then((qs) => {
          this.revealedVotes.set(
            p.id,
            qs.docs.map((d) => d.data() as VoteRecord)
          );
          this.scheduleRebuild();
        })
        .catch((err) => console.warn('[FutebolB3] Votos indisponíveis:', err?.code || err))
        .finally(() => this.fetchingVotes.delete(p.id));
    }
  }

  private scheduleRebuild() {
    if (this.rebuildTimer) return;
    this.rebuildTimer = setTimeout(() => {
      this.rebuildTimer = null;
      this.rebuildNow();
    }, 30);
  }

  private rebuildNow() {
    if (!this.user) return;
    const s = this.state;
    const peladas = [...s.peladas].sort((a, b) =>
      (b.date + (b.createdAt || '')).localeCompare(a.date + (a.createdAt || ''))
    );
    const matches = [...s.matches].sort((a, b) => a.orderIndex - b.orderIndex);
    const goals = deriveRoundGoals(matches, s.legacyGoals);

    const votingSummaries: Record<string, PeladaVotingSummary> = {};
    for (const pelada of peladas) {
      const revealed = isRevealed(pelada);
      const pVotes = revealed ? this.revealedVotes.get(pelada.id) ?? [] : [];
      const myVotes: Partial<Record<VoteCategory, string>> = {};
      for (const mv of s.myVotes) {
        if (mv.peladaId === pelada.id) myVotes[mv.category] = mv.candidatePlayerId;
      }
      const bpVotes = pVotes.filter((v) => v.category === 'best_player');
      const gkVotes = pVotes.filter((v) => v.category === 'best_goalkeeper');
      const bp = revealed ? computeVoteTally(bpVotes) : { tally: [], winnerIds: [], topVotes: 0 };
      const gk = revealed ? computeVoteTally(gkVotes) : { tally: [], winnerIds: [], topVotes: 0 };
      const ts = computeRoundTopScorers(pelada.id, goals);

      votingSummaries[pelada.id] = {
        peladaId: pelada.id,
        votingStatus: pelada.votingStatus,
        myVotes,
        totalPresentPlayers: pelada.presentPlayerIds.length,
        votersWhoVotedBestPlayer: revealed ? bpVotes.length : myVotes.best_player ? 1 : 0,
        votersWhoVotedBestGoalkeeper: revealed ? gkVotes.length : myVotes.best_goalkeeper ? 1 : 0,
        isRevealed: revealed,
        bestPlayerTally: bp.tally,
        bestGoalkeeperTally: gk.tally,
        bestPlayerWinnerIds: bp.winnerIds,
        bestGoalkeeperWinnerIds: gk.winnerIds,
        topScorerWinnerIds: ts.winnerPlayerIds,
        topScorerGoals: ts.topGoals,
      };
    }

    this.snapshot = {
      users: s.users,
      players: [...s.players].sort((a, b) =>
        (a.nickname || a.name).localeCompare(b.nickname || b.name, 'pt-BR')
      ),
      lines: [...s.lines].sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || '')),
      seasons: [...s.seasons].sort((a, b) => b.startDate.localeCompare(a.startDate)),
      peladas,
      matches,
      goals,
      awards: s.awards,
      photos: [...s.photos].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      notifications: s.notifications,
      votingSummaries,
    };
    const snap = this.snapshot;
    this.listeners.forEach((fn) => fn(snap));
  }
}

export const realtimeStore = new RealtimeStore();
