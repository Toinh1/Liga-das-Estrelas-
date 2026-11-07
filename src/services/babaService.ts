import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  type User as FirebaseUser,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { getDownloadURL, ref, uploadString } from 'firebase/storage';
import type {
  AppNotification,
  AppSnapshot,
  LineTeam,
  MatchRecord,
  MatchScorerEntry,
  Pelada,
  PeladaVotingSummary,
  PhotoItem,
  Player,
  PlayerPosition,
  PlayerRoundGoal,
  RoundAward,
  UserAccount,
  VoteCategory,
  VoteRecord,
} from '../types/domain';
import { createPlayerAvatarSvg } from '../utils/mediaAssets';
import {
  computePeladaStandings,
  computeRoundTopScorers,
  computeVoteTally,
} from '../utils/statsEngine';
import { getFirebaseServices } from './firebaseClient';

const TOKEN_KEY = 'baba_stats_auth_token';

function getLocalToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

function setLocalToken(token: string | null) {
  if (!token) localStorage.removeItem(TOKEN_KEY);
  else localStorage.setItem(TOKEN_KEY, token);
}

async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getLocalToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(path, {
    ...options,
    headers,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Erro na requisição (${res.status})`);
  }
  return data as T;
}

function cleanFirestoreData<T extends Record<string, any>>(obj: T): T {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) {
      out[k] = v;
    }
  }
  return out as T;
}

function translateFirebaseError(err: any): Error {
  const code = String(err?.code || '');
  const msg = String(err?.message || '');
  if (
    code.includes('configuration-not-found') ||
    code.includes('operation-not-allowed')
  ) {
    return new Error(
      'Ative o login por E-mail/Senha no Firebase Console (Segurança → Authentication → E-mail/senha).'
    );
  }
  if (
    code.includes('invalid-credential') ||
    code.includes('user-not-found') ||
    code.includes('wrong-password')
  ) {
    return new Error(
      'E-mail ou senha incorretos. Se este é seu 1º acesso no Firebase, use a aba "Criar Conta".'
    );
  }
  if (code.includes('email-already-in-use')) {
    return new Error('Este e-mail já está cadastrado no Firebase. Use a aba "Entrar".');
  }
  if (code.includes('weak-password')) {
    return new Error('A senha deve ter pelo menos 6 caracteres.');
  }
  if (code.includes('permission-denied') || msg.includes('Missing or insufficient permissions')) {
    return new Error(
      'Crie o Firestore Database e publique o arquivo firestore.rules na aba Regras do Firebase Console.'
    );
  }
  return err instanceof Error ? err : new Error(msg || 'Erro ao comunicar com o Firebase.');
}

async function seedFirestoreIfFirstAdmin(
  uid: string,
  input: { name: string; nickname?: string; email: string; position: PlayerPosition }
): Promise<UserAccount> {
  const fb = getFirebaseServices()!;
  const bootRef = doc(fb.db, 'meta', 'bootstrap');
  const bootSnap = await getDoc(bootRef);
  const isFirstAdmin = !bootSnap.exists();
  const now = new Date().toISOString();

  const norm = (s: string) =>
    s
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();

  if (isFirstAdmin) {
    // Tenta importar automaticamente os jogadores e a pelada já criados localmente
    let localSeed: { players: Player[]; lines: LineTeam[]; peladas: Pelada[] } | null = null;
    try {
      const res = await fetch('/api/local-seed-for-firebase');
      if (res.ok) localSeed = await res.json();
    } catch {
      localSeed = null;
    }

    const matchedLocal =
      localSeed?.players.find(
        (p) =>
          norm(p.name) === norm(input.name) ||
          (p.nickname && norm(p.nickname) === norm(input.name)) ||
          (p.email && p.email.toLowerCase() === input.email.trim().toLowerCase())
      ) || localSeed?.players.find((p) => norm(p.name).includes('antonio'));

    const adminPlayerId = matchedLocal ? matchedLocal.id : `p-${uid.slice(0, 8)}`;

    const user: UserAccount = {
      id: uid,
      name: input.name.trim(),
      email: input.email.trim().toLowerCase(),
      role: 'admin',
      playerId: adminPlayerId,
      createdAt: now,
    };

    // 1. Grava o documento users/{uid} primeiro (antes do bootstrap existir, permitido pelas rules)
    await setDoc(doc(fb.db, 'users', uid), cleanFirestoreData(user));
    await setDoc(bootRef, { initializedAt: now, adminUid: uid });

    // 2. Grava linhas (locais ou 4 padrão)
    const linesToSeed: LineTeam[] =
      localSeed && localSeed.lines.length > 0
        ? localSeed.lines
        : [
            { id: 'line-laranja', name: 'Linha Laranja', shortName: 'LAR', colorHex: '#F97316', textColorHex: '#090B0E', createdAt: now },
            { id: 'line-branca', name: 'Linha Branca', shortName: 'BRA', colorHex: '#F8FAFC', textColorHex: '#090B0E', createdAt: now },
            { id: 'line-preta', name: 'Linha Preta', shortName: 'PRE', colorHex: '#27272A', textColorHex: '#F8FAFC', createdAt: now },
            { id: 'line-azul', name: 'Linha Azul', shortName: 'AZU', colorHex: '#3B82F6', textColorHex: '#F8FAFC', createdAt: now },
          ];
    for (const l of linesToSeed) {
      await setDoc(doc(fb.db, 'lines', l.id), cleanFirestoreData(l));
    }

    // 3. Importa os jogadores existentes ou cria o perfil do admin
    if (localSeed && localSeed.players.length > 0) {
      for (const p of localSeed.players) {
        const isMe = p.id === adminPlayerId;
        await setDoc(
          doc(fb.db, 'players', p.id),
          cleanFirestoreData({
            ...p,
            userId: isMe ? uid : undefined,
            email: isMe ? input.email.trim().toLowerCase() : p.email,
          })
        );
      }
      if (!matchedLocal) {
        await setDoc(
          doc(fb.db, 'players', adminPlayerId),
          cleanFirestoreData({
            id: adminPlayerId,
            name: input.name.trim(),
            nickname: input.nickname?.trim() || undefined,
            photoUrl: createPlayerAvatarSvg(input.name, '#A3E635'),
            position: input.position,
            userId: uid,
            email: input.email.trim().toLowerCase(),
            createdAt: now,
          })
        );
      }
    } else {
      await setDoc(
        doc(fb.db, 'players', adminPlayerId),
        cleanFirestoreData({
          id: adminPlayerId,
          name: input.name.trim(),
          nickname: input.nickname?.trim() || undefined,
          photoUrl: createPlayerAvatarSvg(input.name, '#A3E635'),
          position: input.position,
          userId: uid,
          email: input.email.trim().toLowerCase(),
          createdAt: now,
        })
      );
    }

    // 4. Importa as peladas abertas existentes
    if (localSeed && localSeed.peladas.length > 0) {
      for (const pel of localSeed.peladas) {
        await setDoc(doc(fb.db, 'peladas', pel.id), cleanFirestoreData(pel));
      }
    }

    return user;
  }

  // Jogador comum se cadastrando: vincula se já estiver na lista ou cria novo
  const existingPlayersSnap = await getDocs(collection(fb.db, 'players'));
  const existingMatch = existingPlayersSnap.docs
    .map((d) => d.data() as Player)
    .find(
      (p) =>
        !p.userId &&
        (norm(p.name) === norm(input.name) ||
          (p.nickname && norm(p.nickname) === norm(input.name)) ||
          (input.nickname && norm(p.name) === norm(input.nickname)))
    );

  const playerId = existingMatch ? existingMatch.id : `p-${uid.slice(0, 8)}`;
  const user: UserAccount = {
    id: uid,
    name: input.name.trim(),
    email: input.email.trim().toLowerCase(),
    role: 'player',
    playerId,
    createdAt: now,
  };

  await setDoc(doc(fb.db, 'users', uid), cleanFirestoreData(user));

  if (existingMatch) {
    await updateDoc(
      doc(fb.db, 'players', existingMatch.id),
      cleanFirestoreData({
        userId: uid,
        email: input.email.trim().toLowerCase(),
        nickname: input.nickname?.trim() || existingMatch.nickname,
        position: input.position || existingMatch.position,
        updatedAt: now,
      })
    );
  } else {
    const player: Player = {
      id: playerId,
      name: input.name.trim(),
      nickname: input.nickname?.trim() || undefined,
      photoUrl: createPlayerAvatarSvg(input.name, '#A3E635'),
      position: input.position,
      userId: uid,
      email: input.email.trim().toLowerCase(),
      createdAt: now,
    };
    await setDoc(doc(fb.db, 'players', playerId), cleanFirestoreData(player));
  }

  return user;
}

async function uploadFirebaseImageIfDataUrl(
  storagePath: string,
  maybeDataUrl: string
): Promise<string> {
  const fb = getFirebaseServices();
  if (
    !fb ||
    !maybeDataUrl.startsWith('data:image/') ||
    maybeDataUrl.startsWith('data:image/svg')
  ) {
    return maybeDataUrl;
  }
  // No Plano Spark gratuito (sem Firebase Storage ativado), salva a imagem comprimida diretamente no Firestore
  if (import.meta.env.VITE_FIREBASE_USE_STORAGE !== 'true') {
    return maybeDataUrl;
  }
  try {
    const storageRef = ref(fb.storage, storagePath);
    await uploadString(storageRef, maybeDataUrl, 'data_url');
    return await getDownloadURL(storageRef);
  } catch {
    return maybeDataUrl;
  }
}

async function fetchFirebaseSnapshot(currentUser: UserAccount): Promise<AppSnapshot> {
  const fb = getFirebaseServices()!;
  const [
    usersSnap,
    playersSnap,
    linesSnap,
    peladasSnap,
    matchesSnap,
    goalsSnap,
    awardsSnap,
    photosSnap,
    notifsSnap,
  ] = await Promise.all([
    getDocs(collection(fb.db, 'users')),
    getDocs(collection(fb.db, 'players')),
    getDocs(collection(fb.db, 'lines')),
    getDocs(collection(fb.db, 'peladas')),
    getDocs(collection(fb.db, 'matches')),
    getDocs(collection(fb.db, 'goals')),
    getDocs(collection(fb.db, 'awards')),
    getDocs(collection(fb.db, 'photos')),
    getDocs(collection(fb.db, 'notifications')),
  ]);

  const users = usersSnap.docs.map((d) => d.data() as UserAccount);
  const players = playersSnap.docs.map((d) => d.data() as Player);
  const lines = linesSnap.docs.map((d) => d.data() as LineTeam);
  const peladas = peladasSnap.docs
    .map((d) => d.data() as Pelada)
    .sort((a, b) => (b.createdAt || b.date).localeCompare(a.createdAt || a.date));
  const matches = matchesSnap.docs
    .map((d) => d.data() as MatchRecord)
    .sort((a, b) => a.orderIndex - b.orderIndex);
  const goals = goalsSnap.docs.map((d) => d.data() as PlayerRoundGoal);
  const awards = awardsSnap.docs.map((d) => d.data() as RoundAward);
  const photos = photosSnap.docs
    .map((d) => d.data() as PhotoItem)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const notifications = notifsSnap.docs
    .map((d) => d.data() as AppNotification)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  // Busca próprios votos (sempre permitidos pelas regras) + votos de peladas já encerradas
  const myVotesSnap = await getDocs(
    query(collection(fb.db, 'votes'), where('voterUserId', '==', currentUser.id))
  );
  const myVoteDocs = myVotesSnap.docs.map((d) => d.data() as VoteRecord);

  const votingSummaries: Record<string, PeladaVotingSummary> = {};
  for (const pelada of peladas) {
    const isRevealed = pelada.votingStatus === 'closed' || pelada.status === 'finished';
    let pVotes: VoteRecord[] = [];
    if (isRevealed) {
      const revSnap = await getDocs(
        query(collection(fb.db, 'votes'), where('peladaId', '==', pelada.id))
      );
      pVotes = revSnap.docs.map((d) => d.data() as VoteRecord);
    }

    const myVotes: Partial<Record<VoteCategory, string>> = {};
    for (const mv of myVoteDocs.filter((v) => v.peladaId === pelada.id)) {
      myVotes[mv.category] = mv.candidatePlayerId;
    }

    const bpVotes = pVotes.filter((v) => v.category === 'best_player');
    const gkVotes = pVotes.filter((v) => v.category === 'best_goalkeeper');
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
      votersWhoVotedBestPlayer: isRevealed ? bpVotes.length : myVotes.best_player ? 1 : 0,
      votersWhoVotedBestGoalkeeper: isRevealed ? gkVotes.length : myVotes.best_goalkeeper ? 1 : 0,
      isRevealed,
      bestPlayerTally: bpComputed.tally,
      bestGoalkeeperTally: gkComputed.tally,
      bestPlayerWinnerIds: bpComputed.winnerIds,
      bestGoalkeeperWinnerIds: gkComputed.winnerIds,
      topScorerWinnerIds: tsComputed.winnerPlayerIds,
      topScorerGoals: tsComputed.topGoals,
    };
  }

  return {
    backendMode: 'firebase',
    hasDemoData: peladas.some((p) => p.isDemo) || players.some((p) => p.isDemo),
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

export const babaService = {
  isFirebaseMode(): boolean {
    return Boolean(getFirebaseServices());
  },

  async getDemoAccounts(): Promise<
    { id: string; name: string; email: string; role: 'admin' | 'player'; playerId: string }[]
  > {
    if (getFirebaseServices()) return [];
    const data = await apiRequest<{
      accounts: {
        id: string;
        name: string;
        email: string;
        role: 'admin' | 'player';
        playerId: string;
      }[];
    }>('/api/auth/demo-accounts');
    return data.accounts;
  },

  async restoreSession(): Promise<{ user: UserAccount; snapshot: AppSnapshot } | null> {
    const fb = getFirebaseServices();
    if (fb) {
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
      const uDoc = await getDoc(doc(fb.db, 'users', fbUser.uid));
      if (!uDoc.exists()) return null;
      const user = uDoc.data() as UserAccount;
      const snapshot = await fetchFirebaseSnapshot(user);
      return { user, snapshot };
    }

    const token = getLocalToken();
    if (!token) return null;
    try {
      return await apiRequest<{ user: UserAccount; snapshot: AppSnapshot }>('/api/auth/me');
    } catch {
      setLocalToken(null);
      return null;
    }
  },

  async login(
    email: string,
    password: string
  ): Promise<{ user: UserAccount; snapshot: AppSnapshot }> {
    const fb = getFirebaseServices();
    if (fb) {
      try {
        const cred = await signInWithEmailAndPassword(fb.auth, email.trim(), password);
        const uDoc = await getDoc(doc(fb.db, 'users', cred.user.uid));
        let user: UserAccount;
        if (!uDoc.exists()) {
          user = await seedFirestoreIfFirstAdmin(cred.user.uid, {
            name: cred.user.displayName || email.split('@')[0],
            email,
            position: 'Meia',
          });
        } else {
          user = uDoc.data() as UserAccount;
        }
        const snapshot = await fetchFirebaseSnapshot(user);
        return { user, snapshot };
      } catch (err) {
        throw translateFirebaseError(err);
      }
    }

    const res = await apiRequest<{
      token: string;
      user: UserAccount;
      snapshot: AppSnapshot;
    }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    setLocalToken(res.token);
    return { user: res.user, snapshot: res.snapshot };
  },

  async register(input: {
    name: string;
    nickname?: string;
    email: string;
    password: string;
    position: PlayerPosition;
  }): Promise<{ user: UserAccount; snapshot: AppSnapshot }> {
    const fb = getFirebaseServices();
    if (fb) {
      try {
        const cred = await createUserWithEmailAndPassword(
          fb.auth,
          input.email.trim(),
          input.password
        );
        const user = await seedFirestoreIfFirstAdmin(cred.user.uid, input);
        const snapshot = await fetchFirebaseSnapshot(user);
        return { user, snapshot };
      } catch (err) {
        throw translateFirebaseError(err);
      }
    }

    const res = await apiRequest<{
      token: string;
      user: UserAccount;
      snapshot: AppSnapshot;
    }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    setLocalToken(res.token);
    return { user: res.user, snapshot: res.snapshot };
  },

  async logout(): Promise<void> {
    const fb = getFirebaseServices();
    if (fb) {
      await signOut(fb.auth);
      return;
    }
    setLocalToken(null);
  },

  async fetchSnapshot(currentUser: UserAccount): Promise<AppSnapshot> {
    if (getFirebaseServices()) {
      return fetchFirebaseSnapshot(currentUser);
    }
    return apiRequest<AppSnapshot>('/api/snapshot');
  },

  subscribeRealtime(
    currentUser: UserAccount,
    onUpdate: () => void,
    onNotification?: (notif: AppNotification) => void
  ): () => void {
    const fb = getFirebaseServices();
    if (fb) {
      const unsubPeladas = onSnapshot(collection(fb.db, 'peladas'), () => onUpdate());
      const unsubMatches = onSnapshot(collection(fb.db, 'matches'), () => onUpdate());
      const unsubNotifs = onSnapshot(collection(fb.db, 'notifications'), () => onUpdate());
      return () => {
        unsubPeladas();
        unsubMatches();
        unsubNotifs();
      };
    }

    const es = new EventSource('/api/events');
    es.onmessage = (ev) => {
      try {
        const parsed = JSON.parse(ev.data);
        if (parsed.type === 'notification' && parsed.notification && onNotification) {
          onNotification(parsed.notification as AppNotification);
          onUpdate();
        } else if (parsed.type === 'data_updated') {
          onUpdate();
        }
      } catch {
        // ignore parse errors
      }
    };
    return () => {
      es.close();
    };
  },

  // --- OPERAÇÕES DE JOGADORES ---
  async ensurePlayersFromRoster(
    currentUser: UserAccount,
    items: { name: string; position: PlayerPosition; matchedPlayerId?: string }[]
  ): Promise<{ playerIds: string[]; snapshot: AppSnapshot }> {
    const fb = getFirebaseServices();
    if (fb) {
      const snap = await fetchFirebaseSnapshot(currentUser);
      const resolvedIds: string[] = [];
      const now = new Date().toISOString();
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        const cleanName = it.name.trim();
        if (!cleanName) continue;
        let existing = it.matchedPlayerId
          ? snap.players.find((p) => p.id === it.matchedPlayerId)
          : snap.players.find(
              (p) =>
                p.name.toLowerCase() === cleanName.toLowerCase() ||
                (p.nickname && p.nickname.toLowerCase() === cleanName.toLowerCase())
            );
        if (existing) {
          if (it.position && existing.position !== it.position) {
            await updateDoc(doc(fb.db, 'players', existing.id), {
              position: it.position,
              updatedAt: now,
            });
          }
          if (!resolvedIds.includes(existing.id)) resolvedIds.push(existing.id);
        } else {
          const newId = `p-${Date.now()}-${i}`;
          const newPlayer: Player = {
            id: newId,
            name: cleanName,
            photoUrl: createPlayerAvatarSvg(cleanName, '#A3E635'),
            position: it.position || 'Meia',
            createdAt: now,
          };
          await setDoc(doc(fb.db, 'players', newId), newPlayer);
          resolvedIds.push(newId);
        }
      }
      const updatedSnap = await fetchFirebaseSnapshot(currentUser);
      return { playerIds: resolvedIds, snapshot: updatedSnap };
    }

    return apiRequest<{ playerIds: string[]; snapshot: AppSnapshot }>(
      '/api/players/ensure-batch',
      {
        method: 'POST',
        body: JSON.stringify({ items }),
      }
    );
  },

  async createPlayer(
    currentUser: UserAccount,
    input: {
      name: string;
      nickname?: string;
      position: PlayerPosition;
      photoUrl?: string;
      email?: string;
    }
  ): Promise<AppSnapshot> {
    const fb = getFirebaseServices();
    if (fb) {
      const id = `p-${Date.now()}`;
      const uploadedUrl = input.photoUrl
        ? await uploadFirebaseImageIfDataUrl(`avatars/${id}/profile.jpg`, input.photoUrl)
        : createPlayerAvatarSvg(input.name, '#A3E635');
      const player: Player = {
        id,
        name: input.name.trim(),
        nickname: input.nickname?.trim() || undefined,
        photoUrl: uploadedUrl,
        position: input.position,
        email: input.email?.trim().toLowerCase() || undefined,
        createdAt: new Date().toISOString(),
      };
      await setDoc(doc(fb.db, 'players', id), cleanFirestoreData(player));
      return fetchFirebaseSnapshot(currentUser);
    }
    return apiRequest<AppSnapshot>('/api/players', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  async updatePlayer(
    currentUser: UserAccount,
    playerId: string,
    input: Partial<Pick<Player, 'name' | 'nickname' | 'position' | 'photoUrl'>>
  ): Promise<AppSnapshot> {
    const fb = getFirebaseServices();
    if (fb) {
      const payload: Record<string, any> = cleanFirestoreData({
        ...input,
        nickname: input.nickname === undefined ? '' : input.nickname,
        updatedAt: new Date().toISOString(),
      });
      if (input.photoUrl) {
        payload.photoUrl = await uploadFirebaseImageIfDataUrl(
          `avatars/${playerId}/profile-${Date.now()}.jpg`,
          input.photoUrl
        );
      }
      await updateDoc(doc(fb.db, 'players', playerId), payload);
      return fetchFirebaseSnapshot(currentUser);
    }
    return apiRequest<AppSnapshot>(`/api/players/${playerId}`, {
      method: 'PUT',
      body: JSON.stringify(input),
    });
  },

  async deletePlayer(currentUser: UserAccount, playerId: string): Promise<AppSnapshot> {
    const fb = getFirebaseServices();
    if (fb) {
      await deleteDoc(doc(fb.db, 'players', playerId));
      return fetchFirebaseSnapshot(currentUser);
    }
    return apiRequest<AppSnapshot>(`/api/players/${playerId}`, { method: 'DELETE' });
  },

  // --- OPERAÇÕES DE LINHAS ---
  async createLine(
    currentUser: UserAccount,
    input: { name: string; shortName: string; colorHex: string; textColorHex: string }
  ): Promise<AppSnapshot> {
    const fb = getFirebaseServices();
    if (fb) {
      const id = `line-${Date.now()}`;
      const line: LineTeam = { id, ...input, createdAt: new Date().toISOString() };
      await setDoc(doc(fb.db, 'lines', id), line);
      return fetchFirebaseSnapshot(currentUser);
    }
    return apiRequest<AppSnapshot>('/api/lines', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  async updateLine(
    currentUser: UserAccount,
    lineId: string,
    input: Partial<Pick<LineTeam, 'name' | 'shortName' | 'colorHex' | 'textColorHex'>>
  ): Promise<AppSnapshot> {
    const fb = getFirebaseServices();
    if (fb) {
      await updateDoc(doc(fb.db, 'lines', lineId), input);
      return fetchFirebaseSnapshot(currentUser);
    }
    return apiRequest<AppSnapshot>(`/api/lines/${lineId}`, {
      method: 'PUT',
      body: JSON.stringify(input),
    });
  },

  async deleteLine(currentUser: UserAccount, lineId: string): Promise<AppSnapshot> {
    const fb = getFirebaseServices();
    if (fb) {
      await deleteDoc(doc(fb.db, 'lines', lineId));
      return fetchFirebaseSnapshot(currentUser);
    }
    return apiRequest<AppSnapshot>(`/api/lines/${lineId}`, { method: 'DELETE' });
  },

  // --- OPERAÇÕES DE PELADAS ---
  async createPelada(
    currentUser: UserAccount,
    input: Partial<Pelada>
  ): Promise<AppSnapshot> {
    const fb = getFirebaseServices();
    if (fb) {
      const id = `pelada-${Date.now()}`;
      const pelada: Pelada = {
        id,
        title: input.title || 'Pelada de Sábado',
        date: input.date || new Date().toISOString().slice(0, 10),
        time: input.time || '07:30',
        location: input.location || 'Arena Society',
        status: input.status || 'open',
        expectedPlayers: input.expectedPlayers || 24,
        lineCount: input.lineCount || 4,
        playersPerLine: input.playersPerLine || 6,
        participatingLineIds: input.participatingLineIds || [],
        lineRosters: input.lineRosters || {},
        confirmedPlayerIds: input.confirmedPlayerIds || [],
        presentPlayerIds: input.presentPlayerIds || [],
        votingStatus: 'not_started',
        allowPlayerUploads: input.allowPlayerUploads ?? true,
        createdAt: new Date().toISOString(),
      };
      await setDoc(doc(fb.db, 'peladas', id), cleanFirestoreData(pelada));
      return fetchFirebaseSnapshot(currentUser);
    }
    return apiRequest<AppSnapshot>('/api/peladas', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  async updatePelada(
    currentUser: UserAccount,
    peladaId: string,
    updates: Partial<Pelada>
  ): Promise<AppSnapshot> {
    const fb = getFirebaseServices();
    if (fb) {
      await updateDoc(
        doc(fb.db, 'peladas', peladaId),
        cleanFirestoreData({
          ...updates,
          updatedAt: new Date().toISOString(),
        })
      );
      return fetchFirebaseSnapshot(currentUser);
    }
    return apiRequest<AppSnapshot>(`/api/peladas/${peladaId}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  },

  async toggleOwnPresence(
    currentUser: UserAccount,
    pelada: Pelada,
    confirmed: boolean
  ): Promise<AppSnapshot> {
    const fb = getFirebaseServices();
    if (fb) {
      const next = new Set(pelada.confirmedPlayerIds);
      if (confirmed) next.add(currentUser.playerId);
      else next.delete(currentUser.playerId);
      await updateDoc(doc(fb.db, 'peladas', pelada.id), {
        confirmedPlayerIds: Array.from(next),
        updatedAt: new Date().toISOString(),
      });
      return fetchFirebaseSnapshot(currentUser);
    }
    return apiRequest<AppSnapshot>(`/api/peladas/${pelada.id}/confirm-self`, {
      method: 'POST',
      body: JSON.stringify({ confirmed }),
    });
  },

  async setVotingStatus(
    currentUser: UserAccount,
    peladaId: string,
    votingStatus: Pelada['votingStatus']
  ): Promise<AppSnapshot> {
    const fb = getFirebaseServices();
    if (fb) {
      await updateDoc(doc(fb.db, 'peladas', peladaId), {
        votingStatus,
        updatedAt: new Date().toISOString(),
      });
      return fetchFirebaseSnapshot(currentUser);
    }
    return apiRequest<AppSnapshot>(`/api/peladas/${peladaId}/voting-status`, {
      method: 'POST',
      body: JSON.stringify({ votingStatus }),
    });
  },

  async closePelada(currentUser: UserAccount, peladaId: string): Promise<AppSnapshot> {
    const fb = getFirebaseServices();
    if (fb) {
      const snap = await fetchFirebaseSnapshot(currentUser);
      const pelada = snap.peladas.find((p) => p.id === peladaId);
      if (!pelada) throw new Error('Pelada não encontrada.');
      const standings = computePeladaStandings(pelada, snap.lines, snap.matches);
      const championLineId = standings[0]?.lineId;
      const now = new Date().toISOString();
      await updateDoc(doc(fb.db, 'peladas', peladaId), {
        status: 'finished',
        votingStatus: 'closed',
        championLineId: championLineId || null,
        finishedAt: now,
      });

      // Salva premiações oficiais (Melhor da Pelada, Melhor Goleiro e Artilheiro) no Firestore
      const votesSnap = await getDocs(
        query(collection(fb.db, 'votes'), where('peladaId', '==', peladaId))
      );
      const pVotes = votesSnap.docs.map((d) => d.data() as VoteRecord);
      const bp = computeVoteTally(pVotes.filter((v) => v.category === 'best_player'));
      const gk = computeVoteTally(pVotes.filter((v) => v.category === 'best_goalkeeper'));
      const ts = computeRoundTopScorers(peladaId, snap.goals);

      if (bp.winnerIds.length > 0) {
        const id = `${peladaId}_best_player`;
        await setDoc(doc(fb.db, 'awards', id), {
          id,
          peladaId,
          category: 'best_player',
          winnerPlayerIds: bp.winnerIds,
          metricValue: bp.topVotes,
          createdAt: now,
        } satisfies RoundAward);
      }
      if (gk.winnerIds.length > 0) {
        const id = `${peladaId}_best_goalkeeper`;
        await setDoc(doc(fb.db, 'awards', id), {
          id,
          peladaId,
          category: 'best_goalkeeper',
          winnerPlayerIds: gk.winnerIds,
          metricValue: gk.topVotes,
          createdAt: now,
        } satisfies RoundAward);
      }
      if (ts.winnerPlayerIds.length > 0) {
        const id = `${peladaId}_top_scorer`;
        await setDoc(doc(fb.db, 'awards', id), {
          id,
          peladaId,
          category: 'top_scorer',
          winnerPlayerIds: ts.winnerPlayerIds,
          metricValue: ts.topGoals,
          createdAt: now,
        } satisfies RoundAward);
      }

      return fetchFirebaseSnapshot(currentUser);
    }
    return apiRequest<AppSnapshot>(`/api/peladas/${peladaId}/close`, { method: 'POST' });
  },

  async reopenPelada(currentUser: UserAccount, peladaId: string): Promise<AppSnapshot> {
    const fb = getFirebaseServices();
    if (fb) {
      await updateDoc(doc(fb.db, 'peladas', peladaId), { status: 'in_progress' });
      return fetchFirebaseSnapshot(currentUser);
    }
    return apiRequest<AppSnapshot>(`/api/peladas/${peladaId}/reopen`, { method: 'POST' });
  },

  async deletePelada(currentUser: UserAccount, peladaId: string): Promise<AppSnapshot> {
    const fb = getFirebaseServices();
    if (fb) {
      await deleteDoc(doc(fb.db, 'peladas', peladaId));
      return fetchFirebaseSnapshot(currentUser);
    }
    return apiRequest<AppSnapshot>(`/api/peladas/${peladaId}`, { method: 'DELETE' });
  },

  // --- PARTIDAS & GOLS ---
  async createMatch(
    currentUser: UserAccount,
    input: {
      peladaId: string;
      homeLineId: string;
      awayLineId: string;
      homeGoals: number;
      awayGoals: number;
      homeScorers: MatchScorerEntry[];
      awayScorers: MatchScorerEntry[];
    }
  ): Promise<AppSnapshot> {
    const fb = getFirebaseServices();
    if (fb) {
      const id = `m-${Date.now()}`;
      const match: MatchRecord = {
        id,
        ...input,
        orderIndex: Date.now(),
        createdAt: new Date().toISOString(),
      };
      await setDoc(doc(fb.db, 'matches', id), match);
      for (const s of [...input.homeScorers, ...input.awayScorers]) {
        const gId = `${input.peladaId}_${s.playerId}`;
        const gDoc = await getDoc(doc(fb.db, 'goals', gId));
        const prev = gDoc.exists() ? (gDoc.data() as PlayerRoundGoal).goals : 0;
        await setDoc(doc(fb.db, 'goals', gId), {
          id: gId,
          peladaId: input.peladaId,
          playerId: s.playerId,
          goals: prev + s.count,
          updatedAt: new Date().toISOString(),
        });
      }
      return fetchFirebaseSnapshot(currentUser);
    }
    return apiRequest<AppSnapshot>('/api/matches', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  async updateMatch(
    currentUser: UserAccount,
    matchId: string,
    input: Partial<MatchRecord>
  ): Promise<AppSnapshot> {
    const fb = getFirebaseServices();
    if (fb) {
      await updateDoc(doc(fb.db, 'matches', matchId), input);
      return fetchFirebaseSnapshot(currentUser);
    }
    return apiRequest<AppSnapshot>(`/api/matches/${matchId}`, {
      method: 'PUT',
      body: JSON.stringify(input),
    });
  },

  async deleteMatch(currentUser: UserAccount, matchId: string): Promise<AppSnapshot> {
    const fb = getFirebaseServices();
    if (fb) {
      await deleteDoc(doc(fb.db, 'matches', matchId));
      return fetchFirebaseSnapshot(currentUser);
    }
    return apiRequest<AppSnapshot>(`/api/matches/${matchId}`, { method: 'DELETE' });
  },

  async setPlayerRoundGoals(
    currentUser: UserAccount,
    peladaId: string,
    playerId: string,
    goals: number
  ): Promise<AppSnapshot> {
    const fb = getFirebaseServices();
    if (fb) {
      const id = `${peladaId}_${playerId}`;
      await setDoc(doc(fb.db, 'goals', id), {
        id,
        peladaId,
        playerId,
        goals: Math.max(0, goals),
        updatedAt: new Date().toISOString(),
      });
      return fetchFirebaseSnapshot(currentUser);
    }
    return apiRequest<AppSnapshot>('/api/goals', {
      method: 'POST',
      body: JSON.stringify({ peladaId, playerId, goals }),
    });
  },

  // --- VOTOS ---
  async castVote(
    currentUser: UserAccount,
    peladaId: string,
    category: VoteCategory,
    candidatePlayerId: string
  ): Promise<AppSnapshot> {
    const fb = getFirebaseServices();
    if (fb) {
      const id = `${peladaId}_${currentUser.playerId}_${category}`;
      const vote: VoteRecord = {
        id,
        peladaId,
        voterUserId: currentUser.id,
        voterPlayerId: currentUser.playerId,
        candidatePlayerId,
        category,
        createdAt: new Date().toISOString(),
      };
      await setDoc(doc(fb.db, 'votes', id), vote);
      return fetchFirebaseSnapshot(currentUser);
    }
    return apiRequest<AppSnapshot>('/api/votes', {
      method: 'POST',
      body: JSON.stringify({ peladaId, category, candidatePlayerId }),
    });
  },

  // --- FOTOS ---
  async uploadPhoto(
    currentUser: UserAccount,
    input: { peladaId: string; url: string; caption: string; isOfficial?: boolean }
  ): Promise<AppSnapshot> {
    const fb = getFirebaseServices();
    if (fb) {
      const id = `photo-${Date.now()}`;
      const finalUrl = await uploadFirebaseImageIfDataUrl(
        `peladas/${input.peladaId}/${id}.jpg`,
        input.url
      );
      const photo: PhotoItem = {
        id,
        peladaId: input.peladaId,
        url: finalUrl,
        caption: input.caption,
        date: new Date().toISOString().slice(0, 10),
        uploadedByUserId: currentUser.id,
        uploadedByName: currentUser.name,
        isOfficial: Boolean(input.isOfficial),
        createdAt: new Date().toISOString(),
      };
      await setDoc(doc(fb.db, 'photos', id), photo);
      return fetchFirebaseSnapshot(currentUser);
    }
    return apiRequest<AppSnapshot>('/api/photos', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  async setOfficialPhoto(currentUser: UserAccount, photoId: string): Promise<AppSnapshot> {
    const fb = getFirebaseServices();
    if (fb) {
      await updateDoc(doc(fb.db, 'photos', photoId), { isOfficial: true });
      return fetchFirebaseSnapshot(currentUser);
    }
    return apiRequest<AppSnapshot>(`/api/photos/${photoId}/official`, { method: 'POST' });
  },

  async deletePhoto(currentUser: UserAccount, photoId: string): Promise<AppSnapshot> {
    const fb = getFirebaseServices();
    if (fb) {
      await deleteDoc(doc(fb.db, 'photos', photoId));
      return fetchFirebaseSnapshot(currentUser);
    }
    return apiRequest<AppSnapshot>(`/api/photos/${photoId}`, { method: 'DELETE' });
  },

  // --- NOTIFICAÇÕES & ADMIN ---
  async clearNotifications(currentUser: UserAccount): Promise<AppSnapshot> {
    const fb = getFirebaseServices();
    if (fb) {
      const batch = writeBatch(fb.db);
      const snap = await getDocs(collection(fb.db, 'notifications'));
      snap.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
      return fetchFirebaseSnapshot(currentUser);
    }
    return apiRequest<AppSnapshot>('/api/notifications', { method: 'DELETE' });
  },

  async markNotificationsRead(currentUser: UserAccount): Promise<AppSnapshot> {
    const fb = getFirebaseServices();
    if (fb) {
      const batch = writeBatch(fb.db);
      const snap = await getDocs(collection(fb.db, 'notifications'));
      snap.docs.forEach((d) => {
        const data = d.data() as AppNotification;
        if (!data.readByUserIds.includes(currentUser.id)) {
          batch.update(d.ref, { readByUserIds: [...data.readByUserIds, currentUser.id] });
        }
      });
      await batch.commit();
      return fetchFirebaseSnapshot(currentUser);
    }
    return apiRequest<AppSnapshot>('/api/notifications/mark-read', { method: 'POST' });
  },

  async updateUserRole(
    currentUser: UserAccount,
    userId: string,
    role: 'admin' | 'player'
  ): Promise<AppSnapshot> {
    const fb = getFirebaseServices();
    if (fb) {
      await updateDoc(doc(fb.db, 'users', userId), { role });
      return fetchFirebaseSnapshot(currentUser);
    }
    return apiRequest<AppSnapshot>('/api/users/role', {
      method: 'POST',
      body: JSON.stringify({ userId, role }),
    });
  },

  async clearDemoData(): Promise<AppSnapshot> {
    return apiRequest<AppSnapshot>('/api/admin/clear-demo', { method: 'POST' });
  },

  async resetDemoData(): Promise<{ user: UserAccount; snapshot: AppSnapshot }> {
    const res = await apiRequest<{
      token: string;
      user: UserAccount;
      snapshot: AppSnapshot;
    }>('/api/admin/reset-demo', { method: 'POST' });
    setLocalToken(res.token);
    return { user: res.user, snapshot: res.snapshot };
  },
};
