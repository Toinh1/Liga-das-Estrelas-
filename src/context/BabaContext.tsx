import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { babaService } from '../services/babaService';
import type {
  AppNotification,
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
  refreshSnapshot: () => Promise<void>;
  runAction: <T>(
    fn: () => Promise<AppSnapshot | T>,
    successTitle?: string,
    successMessage?: string
  ) => Promise<T | AppSnapshot | undefined>;
  setSnapshotDirectly: (snap: AppSnapshot, maybeUser?: UserAccount) => void;
}

const BabaContext = createContext<BabaContextValue | null>(null);

export const BabaProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserAccount | null>(null);
  const [snapshot, setSnapshot] = useState<AppSnapshot | null>(null);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [busyAction, setBusyAction] = useState(false);
  const [activeSection, setActiveSection] = useState<AppSection>('hoje');
  const [selectedPeladaId, setSelectedPeladaIdState] = useState<string | null>(null);
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
      }, 4500);
    },
    []
  );

  // Restaurar sessão ao abrir o aplicativo
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const restored = await babaService.restoreSession();
        if (mounted && restored) {
          setUser(restored.user);
          setSnapshot(restored.snapshot);
          const currentOrFirst =
            restored.snapshot.peladas.find((p) => p.status !== 'finished') ||
            restored.snapshot.peladas[0];
          if (currentOrFirst) {
            setSelectedPeladaIdState(currentOrFirst.id);
          }
        }
      } finally {
        if (mounted) setLoadingInitial(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const refreshSnapshot = useCallback(async () => {
    if (!user) return;
    try {
      const snap = await babaService.fetchSnapshot(user);
      setSnapshot(snap);
      const me = snap.users.find((u) => u.id === user.id);
      if (me) setUser(me);
    } catch (err) {
      console.error('Erro ao atualizar dados:', err);
    }
  }, [user]);

  // Assinatura em tempo real (SSE local ou Firestore onSnapshot) para múltiplos jogadores simultâneos
  useEffect(() => {
    if (!user) return;
    const unsub = babaService.subscribeRealtime(
      user,
      () => {
        refreshSnapshot();
      },
      (notif: AppNotification) => {
        pushToast(notif.title, notif.message, 'info');
      }
    );
    return unsub;
  }, [user, refreshSnapshot, pushToast]);

  const setSelectedPeladaId = useCallback((id: string) => {
    setSelectedPeladaIdState(id);
  }, []);

  // Garante que selectedPeladaId sempre aponte para uma pelada válida
  useEffect(() => {
    if (!snapshot) return;
    if (
      !selectedPeladaId ||
      !snapshot.peladas.some((p) => p.id === selectedPeladaId)
    ) {
      const preferred =
        snapshot.peladas.find((p) => p.status !== 'finished') || snapshot.peladas[0];
      setSelectedPeladaIdState(preferred?.id ?? null);
    }
  }, [snapshot, selectedPeladaId]);

  const activePelada = useMemo(() => {
    if (!snapshot) return undefined;
    return (
      snapshot.peladas.find((p) => p.status === 'in_progress') ||
      snapshot.peladas.find((p) => p.status === 'open') ||
      snapshot.peladas[0]
    );
  }, [snapshot]);

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
        const res = await babaService.login(email, password);
        setUser(res.user);
        setSnapshot(res.snapshot);
        const preferred =
          res.snapshot.peladas.find((p) => p.status !== 'finished') || res.snapshot.peladas[0];
        setSelectedPeladaIdState(preferred?.id ?? null);
        pushToast(`Bem-vindo, ${res.user.name.split(' ')[0]}! ⚽`, 'Bom jogo neste sábado!');
      } catch (err: any) {
        pushToast('Falha no login', err?.message || 'Verifique suas credenciais.', 'error');
        throw err;
      } finally {
        setBusyAction(false);
      }
    },
    [pushToast]
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
        const res = await babaService.register(input);
        setUser(res.user);
        setSnapshot(res.snapshot);
        pushToast('Conta criada com sucesso! 🎉', 'Seu perfil de atleta já está ativo.');
      } catch (err: any) {
        pushToast('Erro no cadastro', err?.message || 'Tente novamente.', 'error');
        throw err;
      } finally {
        setBusyAction(false);
      }
    },
    [pushToast]
  );

  const logout = useCallback(async () => {
    await babaService.logout();
    setUser(null);
    setSnapshot(null);
    setActiveSection('hoje');
  }, []);

  const runAction = useCallback(
    async <T,>(
      fn: () => Promise<AppSnapshot | T>,
      successTitle?: string,
      successMessage?: string
    ): Promise<T | AppSnapshot | undefined> => {
      setBusyAction(true);
      try {
        const res = await fn();
        if (res && typeof res === 'object' && 'peladas' in (res as any)) {
          const snap = res as AppSnapshot;
          setSnapshot(snap);
          if (user) {
            const me = snap.users.find((u) => u.id === user.id);
            if (me) setUser(me);
          }
        }
        if (successTitle) {
          pushToast(successTitle, successMessage, 'success');
        }
        return res;
      } catch (err: any) {
        pushToast('Não foi possível concluir', err?.message || 'Erro inesperado.', 'error');
        return undefined;
      } finally {
        setBusyAction(false);
      }
    },
    [pushToast, user]
  );

  const setSnapshotDirectly = useCallback((snap: AppSnapshot, maybeUser?: UserAccount) => {
    setSnapshot(snap);
    if (maybeUser) setUser(maybeUser);
  }, []);

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
    refreshSnapshot,
    runAction,
    setSnapshotDirectly,
  };

  return <BabaContext.Provider value={value}>{children}</BabaContext.Provider>;
};

export function useBaba(): BabaContextValue {
  const ctx = useContext(BabaContext);
  if (!ctx) throw new Error('useBaba deve ser usado dentro de BabaProvider');
  return ctx;
}
