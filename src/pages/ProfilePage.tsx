import React, { useMemo } from 'react';
import { AlertTriangle, CalendarDays, LogOut, ShieldCheck, Users } from 'lucide-react';
import { PlayerDetailView } from '../components/PlayerDetailView';
import { getPresenceGroups } from '../components/pelada/PresencePanel';
import { EmptyState, PlayerAvatar, cardClass, ghostBtn, playerLabel, primaryBtn } from '../components/ui';
import { useBaba } from '../context/BabaContext';
import { babaService } from '../services/babaService';
import { findPlayerLineId, formatDateBR } from '../utils/statsEngine';

export const ProfilePage: React.FC = () => {
  const { user, isAdmin, snapshot, runAction, busyAction, logout, setSelectedPeladaId, setActiveSection } = useBaba();

  const nextPelada = useMemo(
    () =>
      snapshot?.peladas
        .filter((p) => p.status !== 'finished')
        .sort((a, b) => a.date.localeCompare(b.date))[0],
    [snapshot]
  );

  if (!snapshot || !user) return null;
  const me = snapshot.players.find((p) => p.id === user.playerId);

  const myLineId = nextPelada ? findPlayerLineId(nextPelada, user.playerId) : undefined;
  const myLine = snapshot.lines.find((l) => l.id === myLineId);
  const teammates = myLineId
    ? (nextPelada!.lineRosters[myLineId] || []).map((id) => snapshot.players.find((p) => p.id === id)).filter(Boolean)
    : [];
  const myStatus = nextPelada
    ? nextPelada.confirmedPlayerIds.includes(user.playerId)
      ? 'confirmed'
      : nextPelada.declinedPlayerIds.includes(user.playerId)
      ? 'declined'
      : 'pending'
    : null;
  const confirmedCount = nextPelada ? getPresenceGroups(nextPelada, snapshot.players).confirmed.length : 0;

  return (
    <div className="space-y-5">
      {/* PRÓXIMA PELADA */}
      {nextPelada && (
        <div className={`${cardClass} p-4 sm:p-5 space-y-3`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wide text-lime-400">Próxima pelada</div>
              <div className="text-base font-extrabold text-white">{nextPelada.title}</div>
              <div className="text-xs text-slate-400 inline-flex items-center gap-1">
                <CalendarDays className="w-3.5 h-3.5" /> {formatDateBR(nextPelada.date)} às {nextPelada.time} • {confirmedCount} confirmados
              </div>
            </div>
            <span
              className={`px-3 py-1.5 rounded-xl text-xs font-extrabold ${
                myStatus === 'confirmed'
                  ? 'bg-lime-400/15 text-lime-400'
                  : myStatus === 'declined'
                  ? 'bg-rose-500/10 text-rose-300'
                  : 'bg-white/5 text-slate-400'
              }`}
            >
              {myStatus === 'confirmed' ? 'Na lista' : myStatus === 'declined' ? 'Fora' : 'Aguardando lista'}
            </span>
          </div>
          {myLine ? (
            <div className="p-3 rounded-2xl bg-[#1B1F1B] border border-white/5 space-y-2">
              <div className="flex items-center gap-2 text-xs font-bold text-white">
                <span className="w-3 h-3 rounded-full" style={{ backgroundColor: myLine.colorHex }} />
                Seu time: {myLine.name}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {teammates.map((p) => (
                  <span key={p!.id} className="inline-flex items-center gap-1.5 pl-1 pr-2.5 py-1 rounded-full bg-white/5 text-[11px] text-slate-200">
                    <PlayerAvatar player={p!} size={18} /> {playerLabel(p!)}
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-xs text-slate-500">Os times ainda não foram sorteados.</div>
          )}
          <button
            onClick={() => {
              setSelectedPeladaId(nextPelada.id);
              setActiveSection('hoje');
            }}
            className={ghostBtn}
          >
            Ver times e jogos →
          </button>
        </div>
      )}

      {/* MEU PERFIL E ESTATÍSTICAS */}
      {me ? (
        <PlayerDetailView player={me} selfMode />
      ) : (
        <EmptyState title="Perfil de jogador não encontrado" text="Peça ao administrador para vincular sua conta a um jogador." />
      )}

      {/* PERMISSÕES (ADMIN) */}
      {isAdmin && (
        <div className={`${cardClass} overflow-hidden`}>
          <div className="px-4 sm:px-5 py-3.5 border-b border-white/[0.06] flex items-center gap-2 text-sm font-bold text-white">
            <Users className="w-4 h-4 text-lime-400" /> Contas e permissões ({snapshot.users.length})
          </div>
          <div className="divide-y divide-white/[0.05]">
            {snapshot.users.map((u) => {
              const pl = snapshot.players.find((p) => p.id === u.playerId);
              const isSelf = u.id === user.id;
              return (
                <div key={u.id} className="px-4 sm:px-5 py-2.5 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <PlayerAvatar player={pl} size={28} />
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-white truncate">{u.name}</div>
                      <div className="text-[11px] text-slate-500 truncate">{u.email}</div>
                    </div>
                  </div>
                  <button
                    disabled={busyAction || isSelf}
                    onClick={() => {
                      const next = u.role === 'admin' ? 'player' : 'admin';
                      if (window.confirm(`${next === 'admin' ? 'Tornar' : 'Remover'} ${u.name} ${next === 'admin' ? 'administrador' : 'dos administradores'}?`)) {
                        runAction(() => babaService.updateUserRole(u.id, next), 'Permissão atualizada');
                      }
                    }}
                    className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold shrink-0 cursor-pointer disabled:cursor-default disabled:opacity-60 ${
                      u.role === 'admin' ? 'bg-lime-400/15 text-lime-400' : 'bg-white/5 text-slate-400'
                    }`}
                    title={isSelf ? 'Você não pode alterar a própria permissão' : 'Alterar permissão'}
                  >
                    {u.role === 'admin' && <ShieldCheck className="w-3.5 h-3.5" />}
                    {u.role === 'admin' ? 'Admin' : 'Jogador'}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ZONA DE PERIGO (ADMIN) */}
      {isAdmin && (
        <div className={`${cardClass} !border-rose-500/30 p-4 sm:p-5 space-y-3`}>
          <div className="flex items-center gap-2 text-sm font-bold text-rose-300">
            <AlertTriangle className="w-4 h-4" /> Zerar baba (começar um novo grupo)
          </div>
          <p className="text-xs text-slate-400">
            Apaga <strong className="text-slate-200">todas</strong> as peladas, jogos, gols, votos, prêmios,
            fotos, temporadas, avisos e os jogadores sem conta. As contas de acesso, os perfis ligados a elas
            e as cores das linhas são mantidos. Esta ação não pode ser desfeita.
          </p>
          <button
            disabled={busyAction}
            onClick={async () => {
              const typed = window.prompt(
                `Isto vai apagar ${snapshot.peladas.length} pelada(s), ${snapshot.matches.length} jogo(s) e ${
                  snapshot.players.filter((p) => !p.userId).length
                } jogador(es) sem conta.\n\nDigite ZERAR para confirmar:`
              );
              if (typed?.trim().toUpperCase() !== 'ZERAR') return;
              await runAction(() => babaService.resetLeague(), 'Baba zerado! Pronto para o novo grupo');
            }}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/40 text-rose-200 text-xs font-extrabold cursor-pointer disabled:opacity-50"
          >
            Zerar baba
          </button>
        </div>
      )}

      <button onClick={logout} className={`${primaryBtn} !bg-white/[0.06] !text-rose-300 hover:!bg-rose-500/15 w-full lg:hidden`}>
        <LogOut className="w-4 h-4" /> Sair da conta
      </button>
    </div>
  );
};
