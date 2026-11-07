import React, { useState } from 'react';
import {
  Bell,
  Camera,
  CheckCircle2,
  LogOut,
  PlusCircle,
  Sparkles,
  Swords,
  Trophy,
  User,
  Vote,
  X,
} from 'lucide-react';
import { useBaba } from '../context/BabaContext';
import { babaService } from '../services/babaService';
import type { AppSection } from '../types/domain';

const NAV_ITEMS: { id: AppSection; label: string; icon: React.ElementType }[] = [
  { id: 'hoje', label: 'Pelada', icon: Swords },
  { id: 'votacoes', label: 'Votação', icon: Vote },
  { id: 'galeria', label: 'Fotos', icon: Camera },
  { id: 'ranking', label: 'Ranking', icon: Trophy },
  { id: 'perfil', label: 'Perfil', icon: User },
];

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

  if (!user || !snapshot) return null;

  const unreadCount = snapshot.notifications.filter(
    (n) => !n.readByUserIds.includes(user.id)
  ).length;

  const handleOpenNotifs = async () => {
    setNotifOpen((prev) => !prev);
    if (!notifOpen && unreadCount > 0) {
      babaService.markNotificationsRead(user).then((snap) => {
        if (snap) runAction(async () => snap);
      });
    }
  };

  const votingIsOpen = activePelada?.votingStatus === 'open';

  return (
    <div className="min-h-screen bg-[#090B0E] text-slate-100 flex flex-col lg:flex-row">
      {/* MENU LATERAL NO COMPUTADOR — LIMPO COM 5 ITENS */}
      <aside className="hidden lg:flex lg:flex-col lg:w-60 lg:fixed lg:inset-y-0 bg-[#0D1118] border-r border-white/[0.07] z-30">
        <div className="px-5 py-5 border-b border-white/[0.07]">
          <button
            onClick={() => setActiveSection('hoje')}
            className="flex items-center gap-3 text-left cursor-pointer"
          >
            <div className="w-9 h-9 rounded-xl bg-lime-400 text-slate-950 flex items-center justify-center font-black text-lg shrink-0">
              ⭐
            </div>
            <div className="font-display font-extrabold text-sm text-white leading-tight">
              Liga das <span className="text-lime-400">Estrelas</span>
            </div>
          </button>
        </div>

        {isAdmin && (
          <div className="px-4 pt-4">
            <button
              onClick={() => setOpenCreatePeladaModal(true)}
              className="w-full py-2.5 px-3 rounded-xl bg-lime-400 hover:bg-lime-300 text-slate-950 font-extrabold text-xs flex items-center justify-center gap-2 transition cursor-pointer"
            >
              <PlusCircle className="w-4 h-4" />
              Nova Pelada
            </button>
          </div>
        )}

        <nav className="flex-1 px-3 py-4 space-y-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = activeSection === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveSection(item.id)}
                className={`w-full flex items-center justify-between px-3.5 py-3 rounded-xl text-sm font-semibold transition cursor-pointer ${
                  active
                    ? 'bg-lime-400/15 text-lime-400'
                    : 'text-slate-400 hover:text-white hover:bg-white/[0.04]'
                }`}
              >
                <span className="flex items-center gap-3">
                  <Icon className="w-4.5 h-4.5" />
                  {item.label}
                </span>
                {item.id === 'votacoes' && votingIsOpen && (
                  <span className="w-2 h-2 rounded-full bg-lime-400 animate-pulse" />
                )}
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-white/[0.07] flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="text-xs font-bold text-white truncate">{user.name}</div>
            <div className="text-[10px] text-slate-500">
              {isAdmin ? 'Administrador' : 'Jogador'}
            </div>
          </div>
          <button
            onClick={logout}
            title="Sair"
            className="p-2 rounded-xl text-slate-400 hover:text-rose-400 transition cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </aside>

      {/* CONTEÚDO PRINCIPAL */}
      <div className="flex-1 lg:pl-60 flex flex-col min-h-screen pb-[calc(4.5rem+env(safe-area-inset-bottom,0px))] lg:pb-8">
        {/* TOPO SIMPLES E LIMPO */}
        <header className="sticky top-0 z-20 bg-[#090B0E]/90 backdrop-blur-md border-b border-white/[0.06] px-3.5 sm:px-6 py-2.5 sm:py-3 pt-[calc(0.625rem+env(safe-area-inset-top,0px))]">
          <div className="max-w-4xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-2 lg:hidden">
              <div className="w-7 h-7 rounded-lg bg-lime-400 text-slate-950 flex items-center justify-center font-black text-xs">
                ⭐
              </div>
              <span className="font-display font-extrabold text-sm text-white">
                Liga das <span className="text-lime-400">Estrelas</span>
              </span>
            </div>

            <div className="hidden lg:block text-sm font-bold text-slate-300">
              ⭐ Liga das Estrelas ⭐
            </div>

            <div className="flex items-center gap-2">
              <div className="relative">
                <button
                  onClick={handleOpenNotifs}
                  className="relative p-2 rounded-xl bg-[#131923] border border-white/10 text-slate-300 hover:text-white transition cursor-pointer"
                >
                  <Bell className="w-4 h-4" />
                  {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-lime-400 text-slate-950 text-[10px] font-extrabold flex items-center justify-center">
                      {unreadCount}
                    </span>
                  )}
                </button>

                {notifOpen && (
                  <div className="absolute right-0 mt-2 w-72 sm:w-80 rounded-2xl bg-[#131923] border border-white/15 shadow-2xl overflow-hidden z-50 animate-fade-in">
                    <div className="px-4 py-2.5 border-b border-white/10 flex items-center justify-between">
                      <span className="text-xs font-bold text-white">Avisos</span>
                      <div className="flex items-center gap-2">
                        {isAdmin && snapshot.notifications.length > 0 && (
                          <button
                            onClick={() =>
                              runAction(
                                () => babaService.clearNotifications(user),
                                'Avisos limpos!'
                              )
                            }
                            className="text-[11px] font-bold text-rose-400 cursor-pointer"
                          >
                            Limpar
                          </button>
                        )}
                        <button
                          onClick={() => setNotifOpen(false)}
                          className="text-slate-400 hover:text-white cursor-pointer"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    <div className="max-h-64 overflow-y-auto divide-y divide-white/5">
                      {snapshot.notifications.length === 0 ? (
                        <div className="p-5 text-center text-xs text-slate-500">
                          Nenhum aviso no momento.
                        </div>
                      ) : (
                        snapshot.notifications.map((n) => (
                          <div key={n.id} className="p-3">
                            <div className="text-xs font-bold text-lime-400">{n.title}</div>
                            <div className="text-xs text-slate-300 mt-0.5">{n.message}</div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 max-w-4xl w-full mx-auto px-3.5 sm:px-6 py-4 sm:py-5">
          {children}
        </main>
      </div>

      {/* BARRA INFERIOR NO CELULAR — 5 ABAS AMPLAS E FÁCEIS DE TOCAR COM SAFE-AREA */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-[#0D1118]/95 backdrop-blur-lg border-t border-white/10 px-2 pt-1 pb-[calc(0.4rem+env(safe-area-inset-bottom,0px))]">
        <div className="grid grid-cols-5 gap-1 max-w-md mx-auto">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = activeSection === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveSection(item.id)}
                className={`relative flex flex-col items-center justify-center py-2 active:scale-95 rounded-xl transition cursor-pointer select-none ${
                  active ? 'text-lime-400 bg-lime-400/10' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Icon className="w-5 h-5 shrink-0" />
                <span className="text-[10px] font-bold mt-0.5 tracking-tight">{item.label}</span>
                {item.id === 'votacoes' && votingIsOpen && (
                  <span className="absolute top-1.5 right-3 w-2 h-2 rounded-full bg-lime-400 animate-ping" />
                )}
              </button>
            );
          })}
        </div>
      </nav>

      {/* TOASTS DISCRETOS */}
      <div className="fixed top-14 right-4 z-50 flex flex-col gap-2 max-w-xs w-[calc(100%-2rem)] pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto p-3 rounded-xl border shadow-xl backdrop-blur-md flex items-center gap-2.5 animate-fade-in ${
              t.variant === 'error'
                ? 'bg-rose-950/95 border-rose-500/40 text-rose-100'
                : 'bg-[#121C16]/95 border-lime-400/40 text-slate-100'
            }`}
          >
            {t.variant === 'info' ? (
              <Sparkles className="w-4 h-4 text-sky-400 shrink-0" />
            ) : (
              <CheckCircle2
                className={`w-4 h-4 shrink-0 ${
                  t.variant === 'error' ? 'text-rose-400' : 'text-lime-400'
                }`}
              />
            )}
            <div className="flex-1 min-w-0 text-xs font-bold">{t.title}</div>
            <button onClick={() => dismissToast(t.id)} className="text-slate-400">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};
