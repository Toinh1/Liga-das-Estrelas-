import React from 'react';
import { Flame } from 'lucide-react';
import { useBaba } from '../../context/BabaContext';
import type { Pelada, Player } from '../../types/domain';
import { findPlayerLineId } from '../../utils/statsEngine';
import { PlayerAvatar, cardClass, playerLabel } from '../ui';

/** Artilharia e assistências da pelada — derivadas automaticamente dos jogos. */
export const GoalsPanel: React.FC<{ pelada: Pelada }> = ({ pelada }) => {
  const { snapshot, openPlayerProfile } = useBaba();
  if (!snapshot) return null;

  const lineMap = new Map(snapshot.lines.map((l) => [l.id, l]));
  const playerMap = new Map(snapshot.players.map((p) => [p.id, p]));
  const entries = snapshot.goals.filter((g) => g.peladaId === pelada.id);
  const ids = new Set([...pelada.presentPlayerIds, ...entries.map((e) => e.playerId)]);
  const rows = Array.from(ids)
    .map((id) => {
      const e = entries.find((x) => x.playerId === id);
      return { player: playerMap.get(id), goals: e?.goals ?? 0, assists: e?.assists ?? 0 };
    })
    .filter((r): r is { player: Player; goals: number; assists: number } => Boolean(r.player))
    .sort(
      (a, b) =>
        b.goals - a.goals ||
        b.assists - a.assists ||
        playerLabel(a.player).localeCompare(playerLabel(b.player), 'pt-BR')
    );

  return (
    <div className={`${cardClass} overflow-hidden`}>
      <div className="px-5 py-3.5 border-b border-white/[0.06] flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Flame className="w-4 h-4 text-lime-400" />
          <h2 className="text-base font-bold uppercase tracking-wide text-white">Gols e assistências da pelada</h2>
        </div>
        <span className="text-[11px] text-slate-500 text-right">Atualizado a cada jogo registrado</span>
      </div>

      {rows.length === 0 ? (
        <div className="p-8 text-center text-xs text-slate-500">
          Escale os jogadores e registre os jogos com os autores dos gols.
        </div>
      ) : (
        <div className="divide-y divide-white/[0.05]">
          <div className="grid grid-cols-[1fr_56px_56px] px-4 sm:px-5 py-2 text-[11px] font-bold text-slate-500">
            <span>Atleta</span>
            <span className="text-center">Gols</span>
            <span className="text-center">Assist.</span>
          </div>
          {rows.map(({ player, goals, assists }) => {
            const line = lineMap.get(findPlayerLineId(pelada, player.id) || '');
            return (
              <button
                key={player.id}
                onClick={() => openPlayerProfile(player.id)}
                className="w-full grid grid-cols-[1fr_56px_56px] items-center px-4 sm:px-5 py-2.5 text-left hover:bg-white/[0.03] cursor-pointer"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <PlayerAvatar player={player} size={30} />
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-white truncate">{playerLabel(player)}</div>
                    {line && (
                      <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: line.colorHex }} />
                        {line.name}
                      </div>
                    )}
                  </div>
                </div>
                <span className={`text-center font-display font-extrabold ${goals ? 'text-lime-400' : 'text-slate-600'}`}>
                  {goals}
                </span>
                <span className={`text-center font-display font-extrabold ${assists ? 'text-sky-400' : 'text-slate-600'}`}>
                  {assists}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
