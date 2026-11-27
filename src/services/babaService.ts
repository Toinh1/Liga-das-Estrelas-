/**
 * Camada de acesso a dados do FutebolB3 (Firebase Auth + Cloud Firestore).
 *
 * As leituras acontecem pela store em tempo real (realtimeStore). As funções
 * daqui apenas validam e gravam; a interface é atualizada automaticamente
 * quando o Firestore propaga a mudança.
 */
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  type User as FirebaseUser,
} from 'firebase/auth';
import {
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type DocumentReference,
} from 'firebase/firestore';
import { getDownloadURL, ref, uploadString } from 'firebase/storage';
import {
  DEFAULT_SKILL,
  MAX_LINES,
  MIN_LINES,
  PELADA_DEFAULT_TIME,
  type AppNotification,
  type DominantFoot,
  type LineTeam,
  type MatchRecord,
  type MatchScorerEntry,
  type NotificationType,
  type Pelada,
  type PhotoItem,
  type Player,
  type PlayerPosition,
  type PresenceStatus,
  type RoundAward,
  type Season,
  type UserAccount,
  type VoteCategory,
  type VoteRecord,
} from '../types/domain';
import { createPlayerAvatarSvg } from '../utils/mediaAssets';
import {
  computePeladaStandings,
  computeRoundTopScorers,
  computeVoteTally,
  deriveRoundGoals,
  determineChampionLineId,
} from '../utils/statsEngine';
import { getFirebaseServices } from './firebaseClient';
import { clampSkill } from './normalize';
import { realtimeStore } from './realtimeStore';

// ---------------------------------------------------------------------------
// Utilitários
// ---------------------------------------------------------------------------

const db = () => getFirebaseServices().db;
const nowIso = () => new Date().toISOString();

export function newId(prefix: string): string {
  const rand =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}-${Date.now()}-${rand}`;
}

function clean<T extends Record<string, any>>(obj: T): T {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) out[k] = v;
  return out as T;
}

const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

class ValidationError extends Error {}

function fail(message: string): never {
  throw new ValidationError(message);
}

export function translateFirebaseError(err: any): Error {
  if (err instanceof ValidationError) return err;
  const code = String(err?.code || '');
  const msg = String(err?.message || '');
  if (code.includes('configuration-not-found') || code.includes('operation-not-allowed')) {
    return new Error(
      'Ative o login por E-mail/Senha no Firebase Console (Authentication → E-mail/senha).'
    );
  }
  if (
    code.includes('invalid-credential') ||
    code.includes('user-not-found') ||
    code.includes('wrong-password')
  ) {
    return new Error('E-mail ou senha incorretos.');
  }
  if (code.includes('email-already-in-use')) {
    return new Error('Este e-mail já está cadastrado. Use a aba "Entrar".');
  }
  if (code.includes('weak-password')) return new Error('A senha deve ter pelo menos 6 caracteres.');
  if (code.includes('invalid-email') || code.includes('missing-email')) {
    return new Error('Digite um e-mail válido.');
  }
  if (code.includes('too-many-requests')) {
    return new Error('Muitas tentativas seguidas. Aguarde alguns minutos e tente novamente.');
  }
  if (code.includes('network-request-failed') || code.includes('unavailable')) {
    return new Error('Sem conexão com o servidor. Verifique sua internet.');
  }
  if (code.includes('permission-denied') || msg.includes('insufficient permissions')) {
    return new Error('Você não tem permissão para esta ação.');
  }
  return err instanceof Error ? err : new Error(msg || 'Erro ao comunicar com o servidor.');
}

async function guard<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    throw translateFirebaseError(err);
  }
}

/** Grava operações em lotes de até 450 (limite do Firestore: 500 por batch). */
async function commitInChunks(ops: ((b: ReturnType<typeof writeBatch>) => void)[]) {
  for (let i = 0; i < ops.length; i += 450) {
    const batch = writeBatch(db());
    ops.slice(i, i + 450).forEach((op) => op(batch));
    await batch.commit();
  }
}

function state() {
  return realtimeStore.raw;
}

function requireUser(): UserAccount {
  const u = realtimeStore.currentUser;
  if (!u) fail('Sessão expirada. Entre novamente.');
  return u;
}

function requireAdmin(): UserAccount {
  const u = requireUser();
  if (u.role !== 'admin') fail('Apenas administradores podem executar esta ação.');
  return u;
}

function getPelada(peladaId: string): Pelada {
  const p = state().peladas.find((x) => x.id === peladaId);
  if (!p) fail('Pelada não encontrada.');
  return p;
}

async function notify(type: NotificationType, title: string, message: string, peladaId?: string) {
  try {
    const id = newId('notif');
    const n: AppNotification = clean({
      id,
      type,
      title,
      message,
      peladaId,
      createdAt: nowIso(),
      readByUserIds: [],
    });
    await setDoc(doc(db(), 'notifications', id), n);
  } catch (err) {
    console.warn('[FutebolB3] Aviso não enviado:', err);
  }
}

async function uploadImageIfDataUrl(storagePath: string, maybeDataUrl: string): Promise<string> {
  if (!maybeDataUrl.startsWith('data:image/') || maybeDataUrl.startsWith('data:image/svg')) {
    return maybeDataUrl;
  }
  // Sem Firebase Storage habilitado (plano gratuito), a imagem comprimida fica no próprio documento
  if (import.meta.env.VITE_FIREBASE_USE_STORAGE !== 'true') return maybeDataUrl;
  try {
    const storageRef = ref(getFirebaseServices().storage, storagePath);
    await uploadString(storageRef, maybeDataUrl, 'data_url');
    return await getDownloadURL(storageRef);
  } catch {
    return maybeDataUrl;
  }
}

const DEFAULT_LINES = (now: string): LineTeam[] => [
  { id: 'line-laranja', name: 'Linha Laranja', shortName: 'LAR', colorHex: '#F97316', textColorHex: '#0A0A0A', createdAt: now },
  { id: 'line-branca', name: 'Linha Branca', shortName: 'BRA', colorHex: '#F8FAFC', textColorHex: '#0A0A0A', createdAt: now },
  { id: 'line-preta', name: 'Linha Preta', shortName: 'PRE', colorHex: '#27272A', textColorHex: '#F8FAFC', createdAt: now },
  { id: 'line-azul', name: 'Linha Azul', shortName: 'AZU', colorHex: '#3B82F6', textColorHex: '#F8FAFC', createdAt: now },
  { id: 'line-amarela', name: 'Linha Amarela', shortName: 'AMA', colorHex: '#FACC15', textColorHex: '#090B0E', createdAt: now },
];

// ---------------------------------------------------------------------------
// Cadastro / vínculo de conta
// ---------------------------------------------------------------------------

async function createAccountDocs(
  uid: string,
  input: { name: string; nickname?: string; email: string; position: PlayerPosition }
): Promise<UserAccount> {
  const fdb = db();
  const now = nowIso();
  const email = input.email.trim().toLowerCase();
  const name = input.name.trim();
  const bootRef = doc(fdb, 'meta', 'bootstrap');
  const isFirstAdmin = !(await getDoc(bootRef)).exists();

  // Vincula a um jogador já cadastrado pelo admin (mesmo e-mail ou mesmo nome, sem conta)
  let existing: Player | undefined;
  if (!isFirstAdmin) {
    const playersSnap = await getDocs(collection(fdb, 'players'));
    const all = playersSnap.docs.map((d) => d.data() as Player);
    existing =
      all.find((p) => !p.userId && p.email && p.email.toLowerCase() === email) ||
      all.find(
        (p) =>
          !p.userId &&
          (norm(p.name) === norm(name) ||
            (p.nickname && input.nickname && norm(p.nickname) === norm(input.nickname)))
      );
  }

  const playerId = existing ? existing.id : `p-${uid.slice(0, 10)}`;
  const user: UserAccount = {
    id: uid,
    name,
    email,
    role: isFirstAdmin ? 'admin' : 'player',
    playerId,
    createdAt: now,
  };

  // Conta + jogador gravados juntos (as regras conferem o vínculo no mesmo batch)
  const batch = writeBatch(fdb);
  batch.set(doc(fdb, 'users', uid), clean(user));
  if (existing) {
    batch.update(
      doc(fdb, 'players', existing.id),
      clean({
        userId: uid,
        email,
        nickname: input.nickname?.trim() || existing.nickname,
        position: input.position || existing.position,
        updatedAt: now,
      })
    );
  } else {
    batch.set(
      doc(fdb, 'players', playerId),
      clean({
        id: playerId,
        name,
        nickname: input.nickname?.trim() || undefined,
        photoUrl: createPlayerAvatarSvg(name, '#3FE21A'),
        position: input.position,
        userId: uid,
        email,
        createdAt: now,
      })
    );
  }
  if (isFirstAdmin) batch.set(bootRef, { initializedAt: now, adminUid: uid });
  await batch.commit();

  if (isFirstAdmin) {
    const linesBatch = writeBatch(fdb);
    for (const l of DEFAULT_LINES(now)) linesBatch.set(doc(fdb, 'lines', l.id), l);
    await linesBatch.commit();
  }

  return user;
}

// ---------------------------------------------------------------------------
// Validação de partidas
// ---------------------------------------------------------------------------

export interface MatchInput {
  peladaId: string;
  homeLineId: string;
  awayLineId: string;
  homeGoals: number;
  awayGoals: number;
  homeScorers: MatchScorerEntry[];
  awayScorers: MatchScorerEntry[];
  homeAssists: MatchScorerEntry[];
  awayAssists: MatchScorerEntry[];
}

function sanitizeEntries(entries: MatchScorerEntry[]): MatchScorerEntry[] {
  const merged = new Map<string, number>();
  for (const e of entries) {
    const c = Math.floor(Number(e.count));
    if (!e.playerId || !Number.isFinite(c) || c <= 0) continue;
    merged.set(e.playerId, (merged.get(e.playerId) ?? 0) + c);
  }
  return Array.from(merged, ([playerId, count]) => ({ playerId, count }));
}

const sum = (entries: MatchScorerEntry[]) => entries.reduce((a, e) => a + e.count, 0);

function validateMatch(input: MatchInput) {
  const pelada = getPelada(input.peladaId);
  if (pelada.status === 'finished') fail('Pelada encerrada. Reabra para alterar resultados.');
  if (!input.homeLineId || !input.awayLineId || input.homeLineId === input.awayLineId) {
    fail('Selecione duas linhas diferentes.');
  }
  const homeGoals = Math.floor(Number(input.homeGoals));
  const awayGoals = Math.floor(Number(input.awayGoals));
  if (!Number.isFinite(homeGoals) || !Number.isFinite(awayGoals) || homeGoals < 0 || awayGoals < 0) {
    fail('Placar inválido.');
  }
  if (homeGoals > 50 || awayGoals > 50) fail('Placar fora do limite permitido.');

  const homeScorers = sanitizeEntries(input.homeScorers);
  const awayScorers = sanitizeEntries(input.awayScorers);
  const homeAssists = sanitizeEntries(input.homeAssists);
  const awayAssists = sanitizeEntries(input.awayAssists);

  if (sum(homeScorers) > homeGoals || sum(awayScorers) > awayGoals) {
    fail('A soma dos gols individuais não pode passar do placar.');
  }
  if (sum(homeAssists) > sum(homeScorers) || sum(awayAssists) > sum(awayScorers)) {
    fail('Há mais assistências do que gols com autor identificado.');
  }

  const homePlayerIds = pelada.lineRosters[input.homeLineId] || [];
  const awayPlayerIds = pelada.lineRosters[input.awayLineId] || [];
  const outside = (entries: MatchScorerEntry[], roster: string[]) =>
    roster.length > 0 && entries.some((e) => !roster.includes(e.playerId));
  if (outside([...homeScorers, ...homeAssists], homePlayerIds)) {
    fail('Há jogador marcado que não pertence à linha mandante.');
  }
  if (outside([...awayScorers, ...awayAssists], awayPlayerIds)) {
    fail('Há jogador marcado que não pertence à linha visitante.');
  }

  return {
    pelada,
    clean: {
      homeLineId: input.homeLineId,
      awayLineId: input.awayLineId,
      homeGoals,
      awayGoals,
      homeScorers,
      awayScorers,
      homeAssists,
      awayAssists,
      homePlayerIds,
      awayPlayerIds,
    },
  };
}

// ---------------------------------------------------------------------------
// API pública
// ---------------------------------------------------------------------------

export const babaService = {
  // ----- AUTENTICAÇÃO -----
  async restoreSession(): Promise<UserAccount | null> {
    const fb = getFirebaseServices();
    const fbUser = await new Promise<FirebaseUser | null>((resolve) => {
      const unsub = onAuthStateChanged(
        fb.auth,
        (u) => {
          unsub();
          resolve(u);
        },
        () => resolve(null)
      );
    });
    if (!fbUser) return null;
    try {
      const uDoc = await getDoc(doc(fb.db, 'users', fbUser.uid));
      return uDoc.exists() ? (uDoc.data() as UserAccount) : null;
    } catch {
      return null;
    }
  },

  async login(email: string, password: string): Promise<UserAccount> {
    return guard(async () => {
      const fb = getFirebaseServices();
      const cred = await signInWithEmailAndPassword(fb.auth, email.trim(), password);
      const uDoc = await getDoc(doc(fb.db, 'users', cred.user.uid));
      if (uDoc.exists()) return uDoc.data() as UserAccount;
      // Conta de autenticação sem perfil (cadastro interrompido): completa o perfil
      return createAccountDocs(cred.user.uid, {
        name: cred.user.displayName || email.split('@')[0],
        email,
        position: 'Meia',
      });
    });
  },

  async register(input: {
    name: string;
    nickname?: string;
    email: string;
    password: string;
    position: PlayerPosition;
  }): Promise<UserAccount> {
    return guard(async () => {
      if (!input.name.trim()) fail('Informe seu nome.');
      const cred = await createUserWithEmailAndPassword(
        getFirebaseServices().auth,
        input.email.trim(),
        input.password
      );
      return createAccountDocs(cred.user.uid, input);
    });
  },

  /** Envia o e-mail de redefinição de senha do Firebase. */
  async sendPasswordReset(email: string): Promise<void> {
    return guard(async () => {
      const clean = email.trim();
      if (!clean) fail('Digite seu e-mail para receber o link de redefinição.');
      const auth = getFirebaseServices().auth;
      auth.languageCode = 'pt-BR';
      await sendPasswordResetEmail(auth, clean);
    });
  },

  async logout(): Promise<void> {
    realtimeStore.stop();
    await signOut(getFirebaseServices().auth);
  },

  // ----- JOGADORES -----
  async ensurePlayersFromRoster(
    items: { name: string; position: PlayerPosition; matchedPlayerId?: string; skillLevel?: number }[]
  ): Promise<string[]> {
    requireAdmin();
    return guard(async () => {
      const players = state().players;
      const resolved: string[] = [];
      const ops: ((b: ReturnType<typeof writeBatch>) => void)[] = [];
      const now = nowIso();
      const created: Player[] = [];

      for (const it of items) {
        const cleanName = it.name.trim();
        if (!cleanName) continue;
        const pool = [...players, ...created];
        const existing = it.matchedPlayerId
          ? pool.find((p) => p.id === it.matchedPlayerId)
          : pool.find(
              (p) =>
                norm(p.name) === norm(cleanName) ||
                (p.nickname && norm(p.nickname) === norm(cleanName))
            );
        if (existing) {
          if (it.skillLevel !== undefined && clampSkill(it.skillLevel) !== existing.skillLevel) {
            const lv = clampSkill(it.skillLevel);
            ops.push((b) => b.update(doc(db(), 'players', existing.id), { skillLevel: lv, updatedAt: now }));
          }
          if (it.position === 'Goleiro' && existing.position !== 'Goleiro') {
            ops.push((b) =>
              b.update(doc(db(), 'players', existing.id), { position: 'Goleiro', updatedAt: now })
            );
          }
          if (!existing.active) {
            ops.push((b) => b.update(doc(db(), 'players', existing.id), { active: true }));
          }
          if (!resolved.includes(existing.id)) resolved.push(existing.id);
        } else {
          const id = newId('p');
          const player: Player = {
            id,
            name: cleanName,
            photoUrl: createPlayerAvatarSvg(cleanName, '#3FE21A'),
            position: it.position || 'Meia',
            skillLevel: it.skillLevel !== undefined ? clampSkill(it.skillLevel) : DEFAULT_SKILL,
            active: true,
            createdAt: now,
          };
          created.push(player);
          ops.push((b) => b.set(doc(db(), 'players', id), player));
          resolved.push(id);
        }
      }
      await commitInChunks(ops);
      return resolved;
    });
  },

  async createPlayer(input: {
    name: string;
    nickname?: string;
    position: PlayerPosition;
    skillLevel: number;
    dominantFoot?: DominantFoot;
    photoUrl?: string;
    email?: string;
  }): Promise<string> {
    requireAdmin();
    return guard(async () => {
      const name = input.name.trim();
      if (!name) fail('Informe o nome completo do jogador.');
      const duplicate = state().players.find((p) => norm(p.name) === norm(name));
      if (duplicate) fail(`Já existe um jogador chamado "${duplicate.name}".`);
      const id = newId('p');
      const photoUrl = input.photoUrl
        ? await uploadImageIfDataUrl(`avatars/${id}/profile.jpg`, input.photoUrl)
        : createPlayerAvatarSvg(name, '#3FE21A');
      const player: Player = clean({
        id,
        name,
        nickname: input.nickname?.trim() || undefined,
        photoUrl,
        position: input.position,
        skillLevel: clampSkill(input.skillLevel),
        dominantFoot: input.dominantFoot,
        active: true,
        email: input.email?.trim().toLowerCase() || undefined,
        createdAt: nowIso(),
      });
      await setDoc(doc(db(), 'players', id), player);
      return id;
    });
  },

  /**
   * Atualiza dados do jogador. O próprio jogador só altera dados pessoais;
   * nível técnico e status são exclusivos do administrador (também garantido nas regras).
   */
  async updatePlayer(
    playerId: string,
    input: Partial<
      Pick<Player, 'name' | 'nickname' | 'position' | 'photoUrl' | 'dominantFoot' | 'skillLevel' | 'active'>
    >
  ): Promise<void> {
    const me = requireUser();
    const isAdmin = me.role === 'admin';
    if (!isAdmin && me.playerId !== playerId) fail('Você só pode editar o seu próprio perfil.');
    return guard(async () => {
      const player = state().players.find((p) => p.id === playerId);
      if (!player) fail('Jogador não encontrado.');
      if (input.name !== undefined && !input.name.trim()) fail('O nome não pode ficar vazio.');

      const payload: Record<string, any> = { updatedAt: nowIso() };
      if (input.name !== undefined) payload.name = input.name.trim();
      if (input.nickname !== undefined) payload.nickname = input.nickname.trim();
      if (input.position !== undefined) payload.position = input.position;
      if (input.dominantFoot !== undefined) payload.dominantFoot = input.dominantFoot;
      if (input.photoUrl && input.photoUrl !== player.photoUrl) {
        payload.photoUrl = await uploadImageIfDataUrl(
          `avatars/${playerId}/profile-${Date.now()}.jpg`,
          input.photoUrl
        );
      }
      if (isAdmin) {
        if (input.skillLevel !== undefined) payload.skillLevel = clampSkill(input.skillLevel);
        if (input.active !== undefined) payload.active = input.active;
      }

      const batch = writeBatch(db());
      batch.update(doc(db(), 'players', playerId), payload);
      if (payload.name && player.userId && (isAdmin || player.userId === me.id)) {
        batch.update(doc(db(), 'users', player.userId), { name: payload.name });
      }
      await batch.commit();
    });
  },

  async setPlayerSkill(playerId: string, skillLevel: number): Promise<void> {
    requireAdmin();
    return guard(() =>
      updateDoc(doc(db(), 'players', playerId), {
        skillLevel: clampSkill(skillLevel),
        updatedAt: nowIso(),
      })
    );
  },

  async setPlayerActive(playerId: string, active: boolean): Promise<void> {
    requireAdmin();
    return guard(() =>
      updateDoc(doc(db(), 'players', playerId), { active, updatedAt: nowIso() })
    );
  },

  /** Indica se o jogador já aparece em peladas, jogos ou prêmios (usado para avisar antes de excluir). */
  playerHasHistory(playerId: string): boolean {
    const s = state();
    return (
      s.peladas.some(
        (p) =>
          p.status !== 'open' &&
          (p.presentPlayerIds.includes(playerId) ||
            Object.values(p.lineRosters).some((r) => r.includes(playerId)))
      ) ||
      s.matches.some(
        (m) =>
          m.homePlayerIds.includes(playerId) ||
          m.awayPlayerIds.includes(playerId) ||
          [...m.homeScorers, ...m.awayScorers, ...m.homeAssists, ...m.awayAssists].some(
            (e) => e.playerId === playerId
          )
      ) ||
      s.legacyGoals.some((g) => g.playerId === playerId) ||
      s.awards.some((a) => a.winnerPlayerIds.includes(playerId))
    );
  },

  /**
   * Exclui o jogador. Ele sai das confirmações e times das peladas em aberto.
   * Jogos já registrados continuam no histórico (com "Jogador removido" no lugar do nome).
   * Se o jogador tiver conta, o perfil da conta também é removido do app; ao entrar de novo,
   * a pessoa é cadastrada como jogador novo (o login em si só sai pelo Firebase Console).
   */
  async deletePlayer(playerId: string): Promise<void> {
    const me = requireAdmin();
    return guard(async () => {
      if (playerId === me.playerId) fail('Você não pode excluir o seu próprio perfil.');
      const s = state();
      const player = s.players.find((p) => p.id === playerId);
      if (!player) fail('Jogador não encontrado.');
      if (player.userId) {
        const account = s.users.find((u) => u.id === player.userId);
        if (account?.role === 'admin') fail('Este jogador é administrador. Remova o acesso de admin antes de excluir.');
      }

      const ops: ((b: ReturnType<typeof writeBatch>) => void)[] = [];
      const now = nowIso();
      for (const p of s.peladas) {
        if (p.status === 'finished') continue;
        const inPelada =
          p.confirmedPlayerIds.includes(playerId) ||
          p.declinedPlayerIds.includes(playerId) ||
          p.presentPlayerIds.includes(playerId) ||
          Object.values(p.lineRosters).some((r) => r.includes(playerId));
        if (!inPelada) continue;
        const rosters: Record<string, string[]> = {};
        for (const [lid, ids] of Object.entries(p.lineRosters)) rosters[lid] = ids.filter((id) => id !== playerId);
        ops.push((b) =>
          b.update(doc(db(), 'peladas', p.id), {
            confirmedPlayerIds: arrayRemove(playerId),
            declinedPlayerIds: arrayRemove(playerId),
            presentPlayerIds: arrayRemove(playerId),
            lineRosters: rosters,
            updatedAt: now,
          })
        );
      }
      if (player.userId) ops.push((b) => b.delete(doc(db(), 'users', player.userId!)));
      ops.push((b) => b.delete(doc(db(), 'players', playerId)));
      await commitInChunks(ops);
    });
  },

  /**
   * Mantém no baba apenas os jogadores informados.
   * Fora da lista: sem conta → excluído; com conta → inativado (o login só sai pelo Firebase Console).
   * O próprio admin nunca é afetado. Remove os afetados de confirmações e times das peladas em aberto.
   */
  async keepOnlyPlayers(keepIds: string[]): Promise<{ deleted: number; deactivated: number }> {
    const me = requireAdmin();
    return guard(async () => {
      const keep = new Set([...keepIds, me.playerId]);
      if (keepIds.length === 0) fail('A lista está vazia.');
      const s = state();
      const affected = s.players.filter((p) => !keep.has(p.id));
      const toDelete = affected.filter((p) => !p.userId);
      const toDeactivate = affected.filter((p) => p.userId && p.active);
      const affectedIds = new Set(affected.map((p) => p.id));
      const now = nowIso();
      const ops: ((b: ReturnType<typeof writeBatch>) => void)[] = [];

      for (const p of s.peladas) {
        if (p.status === 'finished') continue;
        const strip = (ids: string[]) => ids.filter((id) => !affectedIds.has(id));
        const rosters: Record<string, string[]> = {};
        for (const [lid, ids] of Object.entries(p.lineRosters)) rosters[lid] = strip(ids);
        const changed =
          p.confirmedPlayerIds.some((id) => affectedIds.has(id)) ||
          p.declinedPlayerIds.some((id) => affectedIds.has(id)) ||
          p.presentPlayerIds.some((id) => affectedIds.has(id));
        if (!changed) continue;
        ops.push((b) =>
          b.update(doc(db(), 'peladas', p.id), {
            confirmedPlayerIds: strip(p.confirmedPlayerIds),
            declinedPlayerIds: strip(p.declinedPlayerIds),
            presentPlayerIds: strip(p.presentPlayerIds),
            lineRosters: rosters,
            updatedAt: now,
          })
        );
      }
      for (const p of toDeactivate) {
        ops.push((b) => b.update(doc(db(), 'players', p.id), { active: false, updatedAt: now }));
      }
      for (const p of toDelete) ops.push((b) => b.delete(doc(db(), 'players', p.id)));
      // Os que ficam e estavam inativos voltam a ficar ativos
      for (const p of s.players.filter((x) => keepIds.includes(x.id) && !x.active)) {
        ops.push((b) => b.update(doc(db(), 'players', p.id), { active: true, updatedAt: now }));
      }
      await commitInChunks(ops);
      return { deleted: toDelete.length, deactivated: toDeactivate.length };
    });
  },

  // ----- LINHAS (EQUIPES) -----
  /**
   * Garante que a Linha Amarela exista (adicionada às cores padrão do baba).
   * Idempotente: só cria se não houver nenhuma linha amarela cadastrada.
   */
  async ensureYellowLine(): Promise<void> {
    const me = realtimeStore.currentUser;
    if (me?.role !== 'admin') return;
    const exists = state().lines.some((l) => l.id === 'line-amarela' || norm(l.name) === 'linha amarela');
    if (exists) return;
    const line = DEFAULT_LINES(nowIso()).find((l) => l.id === 'line-amarela')!;
    try {
      await setDoc(doc(db(), 'lines', line.id), line);
    } catch (err) {
      console.warn('[FutebolB3] Não foi possível criar a Linha Amarela:', err);
    }
  },

  async createLine(input: {
    name: string;
    shortName: string;
    colorHex: string;
    textColorHex: string;
  }): Promise<void> {
    requireAdmin();
    return guard(async () => {
      const name = input.name.trim();
      if (!name) fail('Informe o nome da linha.');
      if (state().lines.some((l) => norm(l.name) === norm(name))) {
        fail('Já existe uma linha com esse nome.');
      }
      const id = newId('line');
      await setDoc(doc(db(), 'lines', id), {
        id,
        name,
        shortName: input.shortName.trim().toUpperCase().slice(0, 4) || 'LIN',
        colorHex: input.colorHex,
        textColorHex: input.textColorHex,
        createdAt: nowIso(),
      } satisfies LineTeam);
    });
  },

  async deleteLine(lineId: string): Promise<void> {
    requireAdmin();
    return guard(async () => {
      const s = state();
      const used =
        s.peladas.some((p) => p.participatingLineIds.includes(lineId) || p.championLineId === lineId) ||
        s.matches.some((m) => m.homeLineId === lineId || m.awayLineId === lineId);
      if (used) fail('Esta linha já foi usada em peladas e não pode ser excluída.');
      await deleteDoc(doc(db(), 'lines', lineId));
    });
  },

  // ----- TEMPORADAS -----
  async createSeason(input: { name: string; startDate: string }): Promise<void> {
    requireAdmin();
    return guard(async () => {
      const name = input.name.trim();
      if (!name) fail('Informe o nome da temporada.');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(input.startDate)) fail('Data de início inválida.');
      const s = state();
      if (s.seasons.some((x) => x.status === 'active')) {
        fail('Já existe uma temporada ativa. Encerre-a antes de abrir outra.');
      }
      if (s.seasons.some((x) => norm(x.name) === norm(name))) {
        fail('Já existe uma temporada com esse nome.');
      }
      const lastClosed = s.seasons
        .filter((x) => x.endDate)
        .sort((a, b) => (b.endDate || '').localeCompare(a.endDate || ''))[0];
      if (lastClosed?.endDate && input.startDate <= lastClosed.endDate) {
        fail(`A nova temporada precisa começar depois de ${lastClosed.endDate.split('-').reverse().join('/')}.`);
      }
      const id = newId('season');
      const season: Season = {
        id,
        name,
        startDate: input.startDate,
        status: 'active',
        createdAt: nowIso(),
      };
      await setDoc(doc(db(), 'seasons', id), season);
    });
  },

  async closeSeason(seasonId: string, endDate: string): Promise<void> {
    requireAdmin();
    return guard(async () => {
      const s = state();
      const season = s.seasons.find((x) => x.id === seasonId);
      if (!season) fail('Temporada não encontrada.');
      if (season.status === 'closed') fail('Esta temporada já está encerrada.');
      if (endDate < season.startDate) fail('A data de encerramento é anterior ao início.');
      const openInSeason = s.peladas.filter(
        (p) => p.seasonId === seasonId && p.status !== 'finished'
      );
      if (openInSeason.length > 0) {
        fail(`Encerre antes as peladas em aberto: ${openInSeason.map((p) => p.title).join(', ')}.`);
      }
      await updateDoc(doc(db(), 'seasons', seasonId), {
        status: 'closed',
        endDate,
        closedAt: nowIso(),
      });
    });
  },

  async setSeasonRevelation(seasonId: string, playerId: string | null): Promise<void> {
    requireAdmin();
    return guard(() =>
      updateDoc(doc(db(), 'seasons', seasonId), { revelationPlayerId: playerId ?? null })
    );
  },

  // ----- PELADAS -----
  async createPelada(input: {
    title: string;
    date: string;
    time: string;
    location: string;
    participatingLineIds: string[];
    confirmedPlayerIds: string[];
  }): Promise<string> {
    requireAdmin();
    return guard(async () => {
      const title = input.title.trim() || 'Pelada de Quarta';
      if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) fail('Data inválida.');
      if (input.participatingLineIds.length < MIN_LINES) fail(`Escolha pelo menos ${MIN_LINES} linhas.`);
      if (input.participatingLineIds.length > MAX_LINES) fail(`O máximo é de ${MAX_LINES} linhas por pelada.`);
      const s = state();
      if (s.peladas.some((p) => p.date === input.date && norm(p.title) === norm(title))) {
        fail('Já existe uma pelada com esse nome nesta data.');
      }
      const activeSeason = s.seasons.find((x) => x.status === 'active');
      const id = newId('pelada');
      const lineRosters: Record<string, string[]> = {};
      for (const lid of input.participatingLineIds) lineRosters[lid] = [];
      const pelada: Pelada = clean({
        id,
        title,
        date: input.date,
        time: input.time || PELADA_DEFAULT_TIME,
        location: input.location.trim() || 'A definir',
        status: 'open',
        expectedPlayers: input.confirmedPlayerIds.length,
        lineCount: input.participatingLineIds.length,
        playersPerLine: 6,
        participatingLineIds: input.participatingLineIds,
        lineRosters,
        confirmedPlayerIds: Array.from(new Set(input.confirmedPlayerIds)),
        declinedPlayerIds: [],
        presentPlayerIds: [],
        votingStatus: 'not_started',
        allowPlayerUploads: true,
        seasonId: activeSeason?.id,
        createdAt: nowIso(),
      });
      await setDoc(doc(db(), 'peladas', id), pelada);
      await notify(
        'pelada_created',
        `Nova pelada: ${title} ⚽`,
        `${input.date.split('-').reverse().join('/')} às ${pelada.time}. Confirme sua presença!`,
        id
      );
      return id;
    });
  },

  /** Configurações gerais da pelada (admin). */
  async updatePelada(
    peladaId: string,
    updates: Partial<
      Pick<Pelada, 'title' | 'date' | 'time' | 'location' | 'allowPlayerUploads' | 'participatingLineIds' | 'lineRosters' | 'lineCount'>
    >
  ): Promise<void> {
    requireAdmin();
    return guard(() =>
      updateDoc(doc(db(), 'peladas', peladaId), clean({ ...updates, updatedAt: nowIso() }))
    );
  },

  /** Admin marca a presença de qualquer jogador. */
  async setPlayerPresence(peladaId: string, playerId: string, status: PresenceStatus): Promise<void> {
    requireAdmin();
    return guard(async () => {
      const pelada = getPelada(peladaId);
      if (pelada.status === 'finished') fail('Esta pelada já foi encerrada.');
      const updates: Record<string, any> = {
        confirmedPlayerIds: status === 'confirmed' ? arrayUnion(playerId) : arrayRemove(playerId),
        declinedPlayerIds: status === 'declined' ? arrayUnion(playerId) : arrayRemove(playerId),
        updatedAt: nowIso(),
      };
      // Quem deixa de estar confirmado sai das linhas
      if (status !== 'confirmed' && Object.values(pelada.lineRosters).some((r) => r.includes(playerId))) {
        const nextRosters: Record<string, string[]> = {};
        for (const [lid, ids] of Object.entries(pelada.lineRosters)) {
          nextRosters[lid] = ids.filter((id) => id !== playerId);
        }
        updates.lineRosters = nextRosters;
        updates.presentPlayerIds = arrayRemove(playerId);
      }
      await updateDoc(doc(db(), 'peladas', peladaId), updates);
    });
  },

  /** Substitui a lista de confirmados (lista colada do WhatsApp). */
  async setConfirmedList(peladaId: string, playerIds: string[]): Promise<void> {
    requireAdmin();
    return guard(async () => {
      const pelada = getPelada(peladaId);
      const ids = Array.from(new Set(playerIds));
      const nextRosters: Record<string, string[]> = {};
      for (const lid of pelada.participatingLineIds) {
        nextRosters[lid] = (pelada.lineRosters[lid] || []).filter((pid) => ids.includes(pid));
      }
      await updateDoc(doc(db(), 'peladas', peladaId), {
        confirmedPlayerIds: ids,
        declinedPlayerIds: pelada.declinedPlayerIds.filter((pid) => !ids.includes(pid)),
        lineRosters: nextRosters,
        presentPlayerIds: Object.values(nextRosters).flat(),
        expectedPlayers: ids.length,
        updatedAt: nowIso(),
      });
    });
  },

  /** Grava a escalação (sorteio confirmado ou ajuste manual). Só confirmados podem ser escalados. */
  async saveLineRosters(peladaId: string, rosters: Record<string, string[]>): Promise<void> {
    requireAdmin();
    return guard(async () => {
      const pelada = getPelada(peladaId);
      if (pelada.status === 'finished') fail('Pelada encerrada. Reabra para alterar as linhas.');
      const confirmed = new Set(pelada.confirmedPlayerIds);
      const seen = new Set<string>();
      const next: Record<string, string[]> = {};
      for (const lid of pelada.participatingLineIds) {
        next[lid] = (rosters[lid] || []).filter((pid) => {
          if (!confirmed.has(pid) || seen.has(pid)) return false;
          seen.add(pid);
          return true;
        });
      }
      await updateDoc(doc(db(), 'peladas', peladaId), {
        lineRosters: next,
        presentPlayerIds: Array.from(seen),
        updatedAt: nowIso(),
      });
    });
  },

  async setParticipatingLines(peladaId: string, lineIds: string[]): Promise<void> {
    requireAdmin();
    return guard(async () => {
      const pelada = getPelada(peladaId);
      if (lineIds.length < MIN_LINES) fail(`Mantenha pelo menos ${MIN_LINES} linhas.`);
      if (lineIds.length > MAX_LINES) fail(`O máximo é de ${MAX_LINES} linhas.`);
      const removed = pelada.participatingLineIds.filter((id) => !lineIds.includes(id));
      const hasMatches = state().matches.some(
        (m) =>
          m.peladaId === peladaId &&
          (removed.includes(m.homeLineId) || removed.includes(m.awayLineId))
      );
      if (hasMatches) fail('Não é possível remover uma linha que já tem jogos registrados.');
      const nextRosters: Record<string, string[]> = {};
      for (const lid of lineIds) nextRosters[lid] = pelada.lineRosters[lid] || [];
      await updateDoc(doc(db(), 'peladas', peladaId), {
        participatingLineIds: lineIds,
        lineCount: lineIds.length,
        lineRosters: nextRosters,
        presentPlayerIds: Object.values(nextRosters).flat(),
        updatedAt: nowIso(),
      });
    });
  },

  async setVotingStatus(peladaId: string, votingStatus: Pelada['votingStatus']): Promise<void> {
    requireAdmin();
    return guard(async () => {
      const pelada = getPelada(peladaId);
      if (votingStatus === 'open' && pelada.presentPlayerIds.length < 2) {
        fail('Escale os jogadores nas linhas antes de abrir a votação.');
      }
      await updateDoc(doc(db(), 'peladas', peladaId), { votingStatus, updatedAt: nowIso() });
      if (votingStatus === 'open') {
        await notify(
          'voting_open',
          `Votação aberta: ${pelada.title} 🗳️`,
          'Vote no Melhor da Pelada e no Melhor Goleiro. Os votos são secretos.',
          peladaId
        );
      } else if (votingStatus === 'closed') {
        realtimeStore.invalidateVotes(peladaId);
        await notify(
          'results_published',
          `Resultado da votação: ${pelada.title} 🏆`,
          'A votação foi encerrada. Confira os vencedores!',
          peladaId
        );
      }
    });
  },

  async closePelada(peladaId: string): Promise<void> {
    requireAdmin();
    return guard(async () => {
      const s = state();
      const pelada = getPelada(peladaId);
      const peladaMatches = s.matches.filter((m) => m.peladaId === peladaId);
      if (peladaMatches.length === 0) {
        fail('Registre pelo menos um jogo antes de encerrar a pelada.');
      }
      const standings = computePeladaStandings(pelada, s.lines, s.matches);
      const championLineId = determineChampionLineId(standings);
      const now = nowIso();

      // 1. Encerra a pelada (fecha a votação para que os votos possam ser apurados)
      await updateDoc(doc(db(), 'peladas', peladaId), {
        status: 'finished',
        votingStatus: 'closed',
        championLineId: championLineId ?? null,
        finishedAt: now,
        updatedAt: now,
      });

      // 2. Apura premiações da rodada a partir de dados reais
      const votesSnap = await getDocs(
        query(collection(db(), 'votes'), where('peladaId', '==', peladaId))
      );
      const votes = votesSnap.docs.map((d) => d.data() as VoteRecord);
      const bp = computeVoteTally(votes.filter((v) => v.category === 'best_player'));
      const gk = computeVoteTally(votes.filter((v) => v.category === 'best_goalkeeper'));
      const goals = deriveRoundGoals(peladaMatches, s.legacyGoals.filter((g) => g.peladaId === peladaId));
      const ts = computeRoundTopScorers(peladaId, goals);

      const batch = writeBatch(db());
      const awardsRef = (cat: string) => doc(db(), 'awards', `${peladaId}_${cat}`);
      const put = (category: RoundAward['category'], winners: string[], metric: number) => {
        if (winners.length === 0) batch.delete(awardsRef(category));
        else
          batch.set(awardsRef(category), {
            id: `${peladaId}_${category}`,
            peladaId,
            category,
            winnerPlayerIds: winners,
            metricValue: metric,
            createdAt: now,
          } satisfies RoundAward);
      };
      put('best_player', bp.winnerIds, bp.topVotes);
      put('best_goalkeeper', gk.winnerIds, gk.topVotes);
      put('top_scorer', ts.winnerPlayerIds, ts.topGoals);
      await batch.commit();

      realtimeStore.invalidateVotes(peladaId);
      const champ = s.lines.find((l) => l.id === championLineId);
      await notify(
        'pelada_closed',
        `Pelada encerrada! ${champ ? `${champ.name} campeã 🏆` : 'Confira o resumo'}`,
        `${pelada.title} foi finalizada. Veja premiações e estatísticas.`,
        peladaId
      );
    });
  },

  async reopenPelada(peladaId: string): Promise<void> {
    requireAdmin();
    return guard(async () => {
      const pelada = getPelada(peladaId);
      const season = state().seasons.find((x) => x.id === pelada.seasonId);
      if (season?.status === 'closed') fail('A temporada desta pelada já foi encerrada.');
      await updateDoc(doc(db(), 'peladas', peladaId), {
        status: 'in_progress',
        updatedAt: nowIso(),
      });
    });
  },

  /** Exclui a pelada e TODOS os dados ligados a ela (jogos, gols, votos, prêmios, fotos). */
  async deletePelada(peladaId: string): Promise<void> {
    requireAdmin();
    return guard(async () => {
      const fdb = db();
      const pelada = getPelada(peladaId);
      // Votos secretos só podem ser lidos após o fechamento da votação
      if (pelada.votingStatus !== 'closed' && pelada.status !== 'finished') {
        await updateDoc(doc(fdb, 'peladas', peladaId), { votingStatus: 'closed' });
      }
      const refs: DocumentReference[] = [];
      for (const col of ['matches', 'goals', 'votes', 'awards', 'photos', 'notifications']) {
        const qs = await getDocs(query(collection(fdb, col), where('peladaId', '==', peladaId)));
        qs.docs.forEach((d) => refs.push(d.ref));
      }
      refs.push(doc(fdb, 'peladas', peladaId));
      await commitInChunks(refs.map((r) => (b) => b.delete(r)));
    });
  },

  // ----- PARTIDAS -----
  /**
   * Registra um jogo. O `matchId` é gerado pela tela ao abrir o formulário, então
   * um duplo clique ou reenvio grava o MESMO documento (sem duplicar o jogo).
   */
  async createMatch(matchId: string, input: MatchInput): Promise<void> {
    requireAdmin();
    return guard(async () => {
      const { pelada, clean: data } = validateMatch(input);
      const s = state();
      if (s.matches.some((m) => m.id === matchId)) return; // já registrado (reenvio)
      const maxOrder = s.matches
        .filter((m) => m.peladaId === pelada.id)
        .reduce((max, m) => Math.max(max, m.orderIndex || 0), 0);
      const now = nowIso();
      const match: MatchRecord = {
        id: matchId,
        peladaId: pelada.id,
        orderIndex: maxOrder + 1,
        ...data,
        createdAt: now,
      };
      const batch = writeBatch(db());
      batch.set(doc(db(), 'matches', matchId), match);
      if (pelada.status === 'open') {
        batch.update(doc(db(), 'peladas', pelada.id), { status: 'in_progress', updatedAt: now });
      }
      await batch.commit();
    });
  },

  /** Corrige um jogo. As estatísticas são recalculadas a partir dos jogos, sem duplicar. */
  async updateMatch(matchId: string, input: MatchInput): Promise<void> {
    requireAdmin();
    return guard(async () => {
      const existing = state().matches.find((m) => m.id === matchId);
      if (!existing) fail('Jogo não encontrado.');
      const { clean: data } = validateMatch({ ...input, peladaId: existing.peladaId });
      await updateDoc(doc(db(), 'matches', matchId), { ...data, updatedAt: nowIso() });
    });
  },

  async deleteMatch(matchId: string): Promise<void> {
    requireAdmin();
    return guard(async () => {
      const match = state().matches.find((m) => m.id === matchId);
      if (!match) return;
      const pelada = getPelada(match.peladaId);
      if (pelada.status === 'finished') fail('Pelada encerrada. Reabra para alterar resultados.');
      await deleteDoc(doc(db(), 'matches', matchId));
    });
  },

  // ----- AJUSTE MANUAL DE GOLS/ASSISTÊNCIAS (RANKING) -----
  /**
   * Define o total de gols e assistências de um jogador numa pelada.
   * Os jogos registrados continuam intactos: a diferença é gravada como
   * ajuste em `goals/{peladaId}_{playerId}` (pode ser negativa).
   */
  async setPlayerPeladaTotals(peladaId: string, playerId: string, goals: number, assists: number): Promise<void> {
    requireAdmin();
    return guard(async () => {
      getPelada(peladaId);
      if (!state().players.some((p) => p.id === playerId)) fail('Jogador não encontrado.');
      const target = (n: number) => Math.max(0, Math.min(99, Math.trunc(Number(n) || 0)));
      let fromGoals = 0;
      let fromAssists = 0;
      for (const m of state().matches) {
        if (m.peladaId !== peladaId) continue;
        for (const s of [...m.homeScorers, ...m.awayScorers]) if (s.playerId === playerId) fromGoals += s.count;
        for (const a of [...m.homeAssists, ...m.awayAssists]) if (a.playerId === playerId) fromAssists += a.count;
      }
      const dg = target(goals) - fromGoals;
      const da = target(assists) - fromAssists;
      const goalRef = doc(db(), 'goals', `${peladaId}_${playerId}`);
      if (dg === 0 && da === 0) {
        await deleteDoc(goalRef);
      } else {
        await setDoc(goalRef, { peladaId, playerId, goals: dg, assists: da, updatedAt: nowIso() });
      }
    });
  },

  // ----- VOTOS -----
  async castVote(peladaId: string, category: VoteCategory, candidatePlayerId: string): Promise<void> {
    const me = requireUser();
    return guard(async () => {
      const pelada = getPelada(peladaId);
      if (pelada.votingStatus !== 'open') fail('A votação não está aberta.');
      if (!pelada.presentPlayerIds.includes(me.playerId)) {
        fail('Somente jogadores escalados nesta pelada podem votar.');
      }
      if (candidatePlayerId === me.playerId) fail('Não é permitido votar em si mesmo.');
      if (!pelada.presentPlayerIds.includes(candidatePlayerId)) {
        fail('O candidato não participou desta pelada.');
      }
      const id = `${peladaId}_${me.playerId}_${category}`;
      if (state().myVotes.some((v) => v.id === id)) fail('Você já votou nesta categoria.');
      const vote: VoteRecord = {
        id,
        peladaId,
        voterUserId: me.id,
        voterPlayerId: me.playerId,
        candidatePlayerId,
        category,
        createdAt: nowIso(),
      };
      await setDoc(doc(db(), 'votes', id), vote);
    });
  },

  // ----- FOTOS -----
  async uploadPhoto(input: {
    peladaId: string;
    url: string;
    caption: string;
    isOfficial?: boolean;
    taggedPlayerIds?: string[];
  }): Promise<void> {
    const me = requireUser();
    return guard(async () => {
      const pelada = getPelada(input.peladaId);
      if (me.role !== 'admin' && !pelada.allowPlayerUploads) {
        fail('O administrador restringiu o envio de fotos nesta pelada.');
      }
      if (!input.url) fail('Selecione uma imagem.');
      if (input.url.length > 950_000) fail('Imagem muito grande. Escolha uma foto menor.');
      const id = newId('photo');
      const url = await uploadImageIfDataUrl(`peladas/${input.peladaId}/${id}.jpg`, input.url);
      const official = Boolean(input.isOfficial) && me.role === 'admin';
      const photo: PhotoItem = {
        id,
        peladaId: input.peladaId,
        url,
        caption: input.caption.trim().slice(0, 140) || `Momento de ${pelada.title}`,
        date: pelada.date,
        uploadedByUserId: me.id,
        uploadedByName: me.name,
        isOfficial: official,
        taggedPlayerIds: Array.from(new Set(input.taggedPlayerIds || [])),
        createdAt: nowIso(),
      };
      await setDoc(doc(db(), 'photos', id), photo);
      if (official) await babaService.setOfficialPhoto(id);
    });
  },

  async setOfficialPhoto(photoId: string): Promise<void> {
    requireAdmin();
    return guard(async () => {
      const s = state();
      const photo = s.photos.find((p) => p.id === photoId);
      if (!photo) fail('Foto não encontrada.');
      const batch = writeBatch(db());
      for (const sib of s.photos.filter((p) => p.peladaId === photo.peladaId && p.isOfficial)) {
        if (sib.id !== photoId) batch.update(doc(db(), 'photos', sib.id), { isOfficial: false });
      }
      batch.update(doc(db(), 'photos', photoId), { isOfficial: true });
      batch.update(doc(db(), 'peladas', photo.peladaId), { officialPhotoId: photoId });
      await batch.commit();
    });
  },

  async updatePhoto(photoId: string, input: { caption?: string; taggedPlayerIds?: string[] }) {
    requireUser();
    return guard(() =>
      updateDoc(
        doc(db(), 'photos', photoId),
        clean({
          caption: input.caption?.trim().slice(0, 140),
          taggedPlayerIds: input.taggedPlayerIds
            ? Array.from(new Set(input.taggedPlayerIds))
            : undefined,
        })
      )
    );
  },

  async deletePhoto(photoId: string): Promise<void> {
    requireUser();
    return guard(async () => {
      const photo = state().photos.find((p) => p.id === photoId);
      const batch = writeBatch(db());
      batch.delete(doc(db(), 'photos', photoId));
      if (photo) {
        const pelada = state().peladas.find((p) => p.id === photo.peladaId);
        if (pelada?.officialPhotoId === photoId && realtimeStore.currentUser?.role === 'admin') {
          batch.update(doc(db(), 'peladas', pelada.id), { officialPhotoId: null });
        }
      }
      await batch.commit();
    });
  },

  // ----- AVISOS -----
  async clearNotifications(): Promise<void> {
    requireAdmin();
    return guard(async () => {
      const qs = await getDocs(collection(db(), 'notifications'));
      await commitInChunks(qs.docs.map((d) => (b) => b.delete(d.ref)));
    });
  },

  async markNotificationsRead(): Promise<void> {
    const me = requireUser();
    const unread = state().notifications.filter((n) => !n.readByUserIds.includes(me.id));
    if (unread.length === 0) return;
    return guard(() =>
      commitInChunks(
        unread.map((n) => (b) =>
          b.update(doc(db(), 'notifications', n.id), { readByUserIds: arrayUnion(me.id) })
        )
      )
    );
  },

  /**
   * Zera o baba para começar um novo grupo. Apaga peladas, jogos, gols, votos,
   * prêmios, fotos, temporadas, avisos e jogadores SEM conta de acesso.
   * Mantém: contas (users), perfis de jogador vinculados a contas e as linhas (cores).
   */
  async resetLeague(): Promise<{ deleted: number }> {
    requireAdmin();
    return guard(async () => {
      const fdb = db();
      const peladasSnap = await getDocs(collection(fdb, 'peladas'));

      // Votos secretos só podem ser lidos com a votação encerrada
      const toClose = peladasSnap.docs.filter((d) => d.data().votingStatus !== 'closed');
      await commitInChunks(toClose.map((d) => (b) => b.update(d.ref, { votingStatus: 'closed' })));

      const refs: DocumentReference[] = [];
      for (const p of peladasSnap.docs) {
        const votes = await getDocs(query(collection(fdb, 'votes'), where('peladaId', '==', p.id)));
        votes.docs.forEach((d) => refs.push(d.ref));
      }
      for (const col of ['matches', 'goals', 'awards', 'photos', 'notifications', 'seasons', 'results']) {
        const qs = await getDocs(collection(fdb, col));
        qs.docs.forEach((d) => refs.push(d.ref));
      }
      const players = await getDocs(collection(fdb, 'players'));
      players.docs.filter((d) => !d.data().userId).forEach((d) => refs.push(d.ref));
      peladasSnap.docs.forEach((d) => refs.push(d.ref));

      await commitInChunks(refs.map((r) => (b) => b.delete(r)));
      return { deleted: refs.length };
    });
  },

  // ----- USUÁRIOS -----
  async updateUserRole(userId: string, role: 'admin' | 'player'): Promise<void> {
    const me = requireAdmin();
    if (userId === me.id && role !== 'admin') {
      fail('Você não pode remover o seu próprio acesso de administrador.');
    }
    return guard(() => updateDoc(doc(db(), 'users', userId), { role }));
  },
};

export type BabaService = typeof babaService;
