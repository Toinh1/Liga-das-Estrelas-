import React, { useState } from 'react';
import {
  Award,
  Bell,
  Camera,
  CheckCircle2,
  HelpCircle,
  LayoutDashboard,
  LogOut,
  Menu,
  Plus,
  PlusCircle,
  Sparkles,
  Swords,
  Trophy,
  User,
  Users,
  Vote,
  X,
} from 'lucide-react';
import { useBaba } from '../context/BabaContext';
import { BrandLogo, BrandWordmark } from './ui';
import { HELP_SEEN_KEY, HelpModal } from './HelpModal';
import { babaService } from '../services/babaService';
import type { AppSection } from '../types/domain';

interface NavItem {
  id: AppSection;
  label: string;
  icon: React.ElementType;
  /** Explicação curta mostrada no menu "Mais". */
  desc: string;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: 'Início', icon: LayoutDashboard, desc: 'Próxima pelada e resumo' },
  { id: 'hoje', label: 'Pelada', icon: Swords, desc: 'Presença, times e jogos' },
  { id: 'jogadores', label: 'Jogadores', icon: Users, desc: 'Lista do baba e níveis' },
  { id: 'ranking', label: 'Ranking', icon: Trophy, desc: 'Artilharia e classificação' },
  { id: 'premiacoes', label: 'Premiações', icon: Award, desc: 'Craque, artilheiro, garçom…' },
  { id: 'votacoes', label: 'Votação', icon: Vote, desc: 'Vote no destaque da pelada' },
  { id: 'galeria', label: 'Fotos', icon: Camera, desc: 'Fotos das peladas' },
  { id: 'perfil', label: 'Perfil', icon: User, desc: 'Seus números e sua conta' },
];

/** Atalhos fixos na barra inferior do celular; o restante fica em "Mais". */
const MOBILE_PRIMARY: AppSection[] = ['dashboard', 'hoje', 'ranking'];

export const Logo: React.FC<{ compact?: boolean }> = ({ compact }) => (
  <div className="flex items-center gap-2">
    <BrandLogo size={compact ? 34 : 48} />
    <BrandWordmark className={compact ? 'text-lg' : 'text-xl'} />
  </div>
);

export const LayoutShell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const {
    user,
    isAdmin,
    snapshot,
    activeSection,
    setActiveSection,
    setOpenCreatePeladaModal,
    logout,
    toasts,
    dismissToast,
    runAction,
    activePelada,
  } = useBaba();

  const [notifOpen, setNotifOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(() => {
    try {
      return !localStorage.getItem(HELP_SEEN_KEY);
    } catch {
      return false;
    }
  });
  const closeHelp = () => {
    setHelpOpen(false);
    try {
      localStorage.setItem(HELP_SEEN_KEY, '1');
    } catch {
      /* ignore */
    }
  };

  if (!user || !snapshot) return null;

  const unreadCount = snapshot.notifications.filter((n) => !n.readByUserIds.includes(user.id)).length;
  const votingIsOpen = snapshot.peladas.some((p) => p.votingStatus === 'open' && p.status !== 'finished');
  const pendingPresence = activePelada && activePelada.status !== 'finished' &&
    !activePelada.confirmedPlayerIds.includes(user.playerId) &&
    !activePelada.declinedPlayerIds.includes(user.playerId);

  const handleOpenNotifs = () => {
    const opening = !notifOpen;
    setNotifOpen(opening);
    if (opening && unreadCount > 0) {
      babaService.markNotificationsRead().catch(() => undefined);
    }
  };

  const go = (id: AppSection) => {
    setActiveSection(id);
    setMoreOpen(false);
  };

  const badgeFor = (id: AppSection) =>
    (id === 'votacoes' && votingIsOpen) || (id === 'hoje' && isAdmin && pendingPresence);

  const moreItems = NAV_ITEMS.filter((i) => !MOBILE_PRIMARY.includes(i.id));
  const moreActive = moreItems.some((i) => i.id === activeSection);

  return (
    <div className="min-h-screen bg-[#0B0D0B] text-slate-100 flex flex-col lg:flex-row">
      {/* MENU LATERAL (DESKTOP) */}
      <aside className="hidden lg:flex lg:flex-col lg:w-60 lg:fixed lg:inset-y-0 bg-[#0E110E] border-r border-white/[0.07] z-30">
        <div className="px-5 py-5 border-b border-white/[0.07]">
          <button onClick={() => go('dashboard')} className="text-left cursor-pointer">
            <Logo />
          </button>
        </div>

        {isAdmin && (
          <div className="px-4 pt-4">
            <button
              onClick={() => setOpenCreatePeladaModal(true)}
              className="w-full py-2.5 px-3 rounded-xl bg-lime-400 hover:bg-lime-300 text-slate-950 font-extrabold text-xs flex items-center justify-center gap-2 transition cursor-pointer"
            >
              <PlusCircle className="w-4 h-4" /> Nova pelada
            </button>
          </div>
        )}

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto" aria-label="Navegação principal">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = activeSection === item.id;
            return (
              <button
                key={item.id}
                onClick={() => go(item.id)}
                aria-current={active ? 'page' : undefined}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-semibold transition cursor-pointer ${
                  active ? 'bg-lime-400/15 text-lime-400' : 'text-slate-400 hover:text-white hover:bg-white/[0.04]'
                }`}
              >
                <span className="flex items-center gap-3">
                  <Icon className="w-[18px] h-[18px]" />
                  {item.label}
                </span>
                {badgeFor(item.id) && <span className="w-2 h-2 rounded-full bg-lime-400" />}
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-white/[0.07] flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="text-xs font-bold text-white truncate">{user.name}</div>
            <div className="text-[10px] text-slate-500">{isAdmin ? 'Administrador' : 'Jogador'}</div>
          </div>
          <button onClick={logout} title="Sair" className="p-2 rounded-xl text-slate-400 hover:text-rose-400 transition cursor-pointer">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </aside>

      {/* CONTEÚDO */}
      <div className="flex-1 lg:pl-60 flex flex-col min-h-screen pb-[calc(4.5rem+env(safe-area-inset-bottom,0px))] lg:pb-8">
        <header className="sticky top-0 z-20 bg-[#0B0D0B]/90 backdrop-blur-md border-b border-white/[0.06] px-3.5 sm:px-6 py-2.5 sm:py-3 pt-[calc(0.625rem+env(safe-area-inset-top,0px))]">
          <div className="max-w-5xl mx-auto flex items-center justify-between">
            <button onClick={() => go('dashboard')} className="lg:hidden cursor-pointer">
              <Logo compact />
            </button>
            <div className="hidden lg:block text-sm font-bold text-slate-300">
              {NAV_ITEMS.find((i) => i.id === activeSection)?.label}
            </div>

            <div className="relative flex items-center gap-2">
              <button
                onClick={() => setHelpOpen(true)}
                aria-label="Como funciona"
                title="Como funciona"
                className="p-2 rounded-xl bg-[#191D19] border border-white/10 text-slate-300 hover:text-white transition cursor-pointer"
              >
                <HelpCircle className="w-4 h-4" />
              </button>
              <button
                onClick={handleOpenNotifs}
                aria-label={`Avisos${unreadCount ? ` (${unreadCount} novos)` : ''}`}
                className="relative p-2 rounded-xl bg-[#191D19] border border-white/10 text-slate-300 hover:text-white transition cursor-pointer"
              >
                <Bell className="w-4 h-4" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-lime-400 text-slate-950 text-[10px] font-extrabold flex items-center justify-center">
                    {unreadCount}
                  </span>
                )}
              </button>

              {notifOpen && (
                <div className="absolute right-0 top-full mt-2 w-72 sm:w-80 rounded-2xl bg-[#191D19] border border-white/15 shadow-2xl overflow-hidden z-50 animate-fade-in">
                  <div className="px-4 py-2.5 border-b border-white/10 flex items-center justify-between">
                    <span className="text-xs font-bold text-white">Avisos</span>
                    <div className="flex items-center gap-2">
                      {isAdmin && snapshot.notifications.length > 0 && (
                        <button
                          onClick={() => runAction(() => babaService.clearNotifications(), 'Avisos limpos!')}
                          className="text-[11px] font-bold text-rose-400 cursor-pointer"
                        >
                          Limpar
                        </button>
                      )}
                      <button onClick={() => setNotifOpen(false)} className="text-slate-400 hover:text-white cursor-pointer" aria-label="Fechar avisos">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  <div className="max-h-72 overflow-y-auto divide-y divide-white/5">
                    {snapshot.notifications.length === 0 ? (
                      <div className="p-5 text-center text-xs text-slate-500">Nenhum aviso no momento.</div>
                    ) : (
                      snapshot.notifications.map((n) => (
                        <div key={n.id} className={`p-3 ${n.readByUserIds.includes(user.id) ? '' : 'bg-lime-400/[0.04]'}`}>
                          <div className="text-xs font-bold text-lime-400">{n.title}</div>
                          <div className="text-xs text-slate-300 mt-0.5">{n.message}</div>
                          <div className="text-[10px] text-slate-500 mt-1">
                            {new Date(n.createdAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="flex-1 max-w-5xl w-full mx-auto px-3.5 sm:px-6 py-4 sm:py-5">{children}</main>
      </div>

      {/* BARRA INFERIOR (CELULAR) */}
      <nav
        className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-[#0E110E] border-t border-white/10 px-2 pt-1 pb-[calc(0.4rem+env(safe-area-inset-bottom,0px))]"
        aria-label="Navegação"
      >
        <div className="grid grid-cols-5 items-end max-w-md mx-auto">
          {(['dashboard', 'hoje', 'CENTER', 'ranking', 'MORE'] as const).map((slot) => {
            if (slot === 'CENTER') {
              const CenterIcon = isAdmin ? Plus : Swords;
              return (
                <div key={slot} className="flex flex-col items-center">
                  <button
                    onClick={() => {
                      setMoreOpen(false);
                      if (isAdmin) setOpenCreatePeladaModal(true);
                      else go('hoje');
                    }}
                    aria-label={isAdmin ? 'Nova pelada' : 'Pelada atual'}
                    className="-mt-4 w-12 h-12 rounded-xl bg-lime-400 text-slate-950 flex items-center justify-center ring-4 ring-[#0E110E] shadow-[0_6px_14px_-4px_rgba(0,0,0,0.6)] active:scale-95 transition cursor-pointer"
                  >
                    <CenterIcon className="w-6 h-6" strokeWidth={2.4} />
                  </button>
                  <span className="text-[10px] font-semibold mt-1 text-lime-400">
                    {isAdmin ? 'Nova pelada' : 'Jogar'}
                  </span>
                </div>
              );
            }
            if (slot === 'MORE') {
              return (
                <button
                  key={slot}
                  onClick={() => setMoreOpen((v) => !v)}
                  className={`relative flex flex-col items-center justify-center py-2 active:scale-95 transition cursor-pointer select-none ${
                    moreActive || moreOpen ? 'text-lime-400' : 'text-slate-500'
                  }`}
                  aria-expanded={moreOpen}
                >
                  <Menu className="w-5 h-5" />
                  <span className="text-[10px] font-bold mt-1">Mais</span>
                  {votingIsOpen && <span className="absolute top-1.5 right-4 w-2 h-2 rounded-full bg-lime-400" />}
                </button>
              );
            }
            const item = NAV_ITEMS.find((i) => i.id === slot)!;
            const Icon = item.icon;
            const active = activeSection === slot;
            return (
              <button
                key={slot}
                onClick={() => go(slot)}
                aria-current={active ? 'page' : undefined}
                className={`relative flex flex-col items-center justify-center py-2 active:scale-95 transition cursor-pointer select-none ${
                  active ? 'text-lime-400' : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                <Icon className="w-5 h-5 shrink-0" />
                <span className="text-[10px] font-bold mt-1 tracking-tight">{item.label}</span>
                {badgeFor(slot) && <span className="absolute top-1.5 right-4 w-2 h-2 rounded-full bg-lime-400 animate-ping" />}
              </button>
            );
          })}
        </div>
      </nav>

      {moreOpen && (
        <div className="lg:hidden fixed inset-0 z-[25] bg-black/60" onClick={() => setMoreOpen(false)}>
          <div
            className="absolute bottom-[calc(4.2rem+env(safe-area-inset-bottom,0px))] inset-x-3 rounded-3xl bg-[#141714] border border-white/10 p-3 grid grid-cols-2 gap-2 animate-fade-in"
            onClick={(e) => e.stopPropagation()}
          >
            {moreItems.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  onClick={() => go(item.id)}
                  className={`flex items-start gap-2.5 px-3.5 py-3 rounded-2xl text-left cursor-pointer ${
                    activeSection === item.id ? 'bg-lime-400/15 text-lime-400' : 'bg-white/[0.04] text-slate-200'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0 mt-0.5" />
                  <span className="min-w-0">
                    <span className="block text-sm font-bold leading-tight">{item.label}</span>
                    <span className="block text-[10px] text-slate-500 leading-tight mt-0.5">{item.desc}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {helpOpen && <HelpModal isAdmin={isAdmin} onClose={closeHelp} />}

      {/* TOASTS */}
      <div className="fixed top-14 right-4 z-[60] flex flex-col gap-2 max-w-xs w-[calc(100%-2rem)] pointer-events-none" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto p-3 rounded-xl border shadow-xl backdrop-blur-md flex items-start gap-2.5 animate-fade-in ${
              t.variant === 'error' ? 'bg-rose-950/95 border-rose-500/40 text-rose-100' : 'bg-[#151A10]/95 border-lime-400/40 text-slate-100'
            }`}
          >
            {t.variant === 'info' ? (
              <Sparkles className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
            ) : (
              <CheckCircle2 className={`w-4 h-4 shrink-0 mt-0.5 ${t.variant === 'error' ? 'text-rose-400' : 'text-lime-400'}`} />
            )}
            <div className="flex-1 min-w-0">
              <div className="text-xs font-bold">{t.title}</div>
              {t.message && <div className="text-[11px] opacity-80 mt-0.5">{t.message}</div>}
            </div>
            <button onClick={() => dismissToast(t.id)} className="text-slate-400 cursor-pointer" aria-label="Fechar">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};
