import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { babaService } from '../services/babaService';
import { realtimeStore } from '../services/realtimeStore';
import type {
  AppSection,
  AppSnapshot,
  Pelada,
  PlayerComputedStats,
  PlayerPosition,
  UserAccount,
} from '../types/domain';
import { computeAllPlayersStats } from '../utils/statsEngine';

export interface ToastItem {
  id: string;
  title: string;
  message?: string;
  variant: 'success' | 'info' | 'warning' | 'error';
}

interface BabaContextValue {
  user: UserAccount | null;
  isAdmin: boolean;
  snapshot: AppSnapshot | null;
  loadingInitial: boolean;
  busyAction: boolean;
  activeSection: AppSection;
  setActiveSection: (sec: AppSection) => void;
  selectedPeladaId: string | null;
  setSelectedPeladaId: (id: string) => void;
  activePelada: Pelada | undefined;
  selectedPelada: Pelada | undefined;
  playerStatsMap: Record<string, PlayerComputedStats>;
  /** Jogador aberto na página individual (seção "jogadores"). */
  viewPlayerId: string | null;
  openPlayerProfile: (playerId: string | null) => void;
  ceremonyPeladaId: string | null;
  setCeremonyPeladaId: (id: string | null) => void;
  openCreatePeladaModal: boolean;
  setOpenCreatePeladaModal: (open: boolean) => void;
  toasts: ToastItem[];
  dismissToast: (id: string) => void;
  pushToast: (title: string, message?: string, variant?: ToastItem['variant']) => void;
  login: (email: string, password: string) => Promise<void>;
  register: (input: {
    name: string;
    nickname?: string;
    email: string;
    password: string;
    position: PlayerPosition;
  }) => Promise<void>;
  logout: () => Promise<void>;
  /**
   * Executa uma ação de escrita com indicador de carregamento e feedback.
   * Retorna o resultado da ação, ou `undefined` se falhou (o erro vira toast).
   */
  runAction: <T>(fn: () => Promise<T>, successTitle?: string, successMessage?: string) => Promise<
    { ok: true; value: T } | undefined
  >;
}

const BabaContext = createContext<BabaContextValue | null>(null);

const pickDefaultPelada = (peladas: Pelada[]) =>
  peladas.find((p) => p.status === 'in_progress') ||
  peladas.find((p) => p.status === 'open') ||
  peladas[0];

export const BabaProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserAccount | null>(null);
  const [snapshot, setSnapshot] = useState<AppSnapshot | null>(null);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [busyAction, setBusyAction] = useState(false);
  const [activeSection, setActiveSectionState] = useState<AppSection>('dashboard');
  const [selectedPeladaId, setSelectedPeladaIdState] = useState<string | null>(null);
  const [viewPlayerId, setViewPlayerId] = useState<string | null>(null);
  const [ceremonyPeladaId, setCeremonyPeladaId] = useState<string | null>(null);
  const [openCreatePeladaModal, setOpenCreatePeladaModal] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const pushToast = useCallback(
    (title: string, message?: string, variant: ToastItem['variant'] = 'success') => {
      const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      setToasts((prev) => [...prev.slice(-3), { id, title, message, variant }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, variant === 'error' ? 6500 : 4500);
    },
    []
  );

  /** Liga a store em tempo real para o usuário autenticado. */
  const startSession = useCallback(async (u: UserAccount) => {
    setUser(u);
    const first = await realtimeStore.start(u);
    setSnapshot(first);
    if (u.role === 'admin') void babaService.ensureYellowLine();
    setSelectedPeladaIdState(pickDefaultPelada(first.peladas)?.id ?? null);
  }, []);

  // Restaurar sessão ao abrir o aplicativo
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const restored = await babaService.restoreSession();
        if (mounted && restored) await startSession(restored);
      } catch (err) {
        console.error('[FutebolB3] Falha ao restaurar sessão:', err);
      } finally {
        if (mounted) setLoadingInitial(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [startSession]);

  // Snapshot em tempo real + avisos
  useEffect(() => {
    if (!user) return;
    const unsubSnap = realtimeStore.subscribe((snap) => {
      setSnapshot(snap);
      // Mantém o papel (admin/jogador) sincronizado se for alterado por outro admin
      const me = snap.users.find((x) => x.id === user.id);
      if (me && (me.role !== user.role || me.name !== user.name)) {
        setUser(me);
        realtimeStore.setUser(me);
      }
    });
    const unsubNotif = realtimeStore.onNotification((n) => pushToast(n.title, n.message, 'info'));
    return () => {
      unsubSnap();
      unsubNotif();
    };
  }, [user, pushToast]);

  const setActiveSection = useCallback((sec: AppSection) => {
    setActiveSectionState(sec);
    if (sec !== 'jogadores') setViewPlayerId(null);
    if (typeof window !== 'undefined') window.scrollTo({ top: 0 });
  }, []);

  const openPlayerProfile = useCallback((playerId: string | null) => {
    setViewPlayerId(playerId);
    setActiveSectionState('jogadores');
    if (typeof window !== 'undefined') window.scrollTo({ top: 0 });
  }, []);

  const setSelectedPeladaId = useCallback((id: string) => setSelectedPeladaIdState(id), []);

  // Garante que selectedPeladaId sempre aponte para uma pelada válida
  useEffect(() => {
    if (!snapshot) return;
    if (!selectedPeladaId || !snapshot.peladas.some((p) => p.id === selectedPeladaId)) {
      setSelectedPeladaIdState(pickDefaultPelada(snapshot.peladas)?.id ?? null);
    }
  }, [snapshot, selectedPeladaId]);

  const activePelada = useMemo(
    () => (snapshot ? pickDefaultPelada(snapshot.peladas) : undefined),
    [snapshot]
  );

  const selectedPelada = useMemo(() => {
    if (!snapshot) return undefined;
    return snapshot.peladas.find((p) => p.id === selectedPeladaId) || activePelada;
  }, [snapshot, selectedPeladaId, activePelada]);

  const playerStatsMap = useMemo(() => {
    if (!snapshot) return {};
    return computeAllPlayersStats(
      snapshot.players,
      snapshot.peladas,
      snapshot.lines,
      snapshot.matches,
      snapshot.goals,
      snapshot.awards
    );
  }, [snapshot]);

  const login = useCallback(
    async (email: string, password: string) => {
      setBusyAction(true);
      try {
        const u = await babaService.login(email, password);
        await startSession(u);
        pushToast(`Bem-vindo, ${u.name.split(' ')[0]}! ⚽`);
      } catch (err: any) {
        pushToast('Falha no login', err?.message || 'Verifique suas credenciais.', 'error');
        throw err;
      } finally {
        setBusyAction(false);
      }
    },
    [pushToast, startSession]
  );

  const register = useCallback(
    async (input: {
      name: string;
      nickname?: string;
      email: string;
      password: string;
      position: PlayerPosition;
    }) => {
      setBusyAction(true);
      try {
        const u = await babaService.register(input);
        await startSession(u);
        pushToast('Conta criada com sucesso! 🎉', 'Seu perfil de atleta já está ativo.');
      } catch (err: any) {
        pushToast('Erro no cadastro', err?.message || 'Tente novamente.', 'error');
        throw err;
      } finally {
        setBusyAction(false);
      }
    },
    [pushToast, startSession]
  );

  const logout = useCallback(async () => {
    await babaService.logout();
    setUser(null);
    setSnapshot(null);
    setViewPlayerId(null);
    setActiveSectionState('dashboard');
  }, []);

  const runAction = useCallback(
    async <T,>(fn: () => Promise<T>, successTitle?: string, successMessage?: string) => {
      setBusyAction(true);
      try {
        const value = await fn();
        if (successTitle) pushToast(successTitle, successMessage, 'success');
        return { ok: true as const, value };
      } catch (err: any) {
        pushToast('Não foi possível concluir', err?.message || 'Erro inesperado.', 'error');
        return undefined;
      } finally {
        setBusyAction(false);
      }
    },
    [pushToast]
  );

  const value: BabaContextValue = {
    user,
    isAdmin: user?.role === 'admin',
    snapshot,
    loadingInitial,
    busyAction,
    activeSection,
    setActiveSection,
    selectedPeladaId,
    setSelectedPeladaId,
    activePelada,
    selectedPelada,
    playerStatsMap,
    viewPlayerId,
    openPlayerProfile,
    ceremonyPeladaId,
    setCeremonyPeladaId,
    openCreatePeladaModal,
    setOpenCreatePeladaModal,
    toasts,
    dismissToast,
    pushToast,
    login,
    register,
    logout,
    runAction,
  };

  return <BabaContext.Provider value={value}>{children}</BabaContext.Provider>;
};

export function useBaba(): BabaContextValue {
  const ctx = useContext(BabaContext);
  if (!ctx) throw new Error('useBaba deve ser usado dentro de BabaProvider');
  return ctx;
}
