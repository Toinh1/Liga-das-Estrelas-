import React from 'react';
import type { LineStanding } from '../types/domain';
import { LineBadge } from './LineBadge';
import { cardClass } from './ui';

/** Tabela de classificação: Pos, Equipe, PTS, J, V, E, D, GP, GC, SG (+ títulos opcional). */
export const StandingsTable: React.FC<{
  rows: LineStanding[];
  title: string;
  finished?: boolean;
  showTitles?: boolean;
}> = ({ rows, title, finished, showTitles }) => (
  <div className={`${cardClass} overflow-hidden`}>
    <div className="px-4 sm:px-5 py-3 sm:py-3.5 border-b border-white/[0.06] flex items-center justify-between">
      <h2 className="text-sm font-bold text-white">{title}</h2>
      <span className="text-[10px] sm:text-[11px] text-slate-500">V=3 • E=1 • D=0</span>
    </div>
    {rows.length === 0 ? (
      <div className="p-8 text-center text-xs text-slate-500">Sem equipes no período.</div>
    ) : (
      <div className="overflow-x-auto">
        <table className="w-full text-xs sm:text-sm min-w-[520px]">
          <thead>
            <tr className="text-[11px] sm:text-xs text-slate-500 border-b border-white/[0.05]">
              <th className="text-left py-2.5 pl-4 sm:pl-5 pr-1 w-8">#</th>
              <th className="text-left py-2.5 px-2">Equipe</th>
              {showTitles && <th className="text-center py-2.5 px-1.5" title="Títulos">🏆</th>}
              <th className="text-center py-2.5 px-1.5 font-bold text-slate-200">PTS</th>
              <th className="text-center py-2.5 px-1.5" title="Jogos">J</th>
              <th className="text-center py-2.5 px-1.5" title="Vitórias">V</th>
              <th className="text-center py-2.5 px-1.5" title="Empates">E</th>
              <th className="text-center py-2.5 px-1.5" title="Derrotas">D</th>
              <th className="text-center py-2.5 px-1.5" title="Gols marcados">GP</th>
              <th className="text-center py-2.5 px-1.5" title="Gols sofridos">GC</th>
              <th className="text-center py-2.5 pl-1.5 pr-4 sm:pr-5" title="Saldo de gols">SG</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.04]">
            {rows.map((row, idx) => {
              const isLeader = idx === 0 && row.played > 0;
              return (
                <tr key={row.lineId} className={isLeader ? 'bg-lime-400/[0.06]' : undefined}>
                  <td className="py-2.5 sm:py-3 pl-4 sm:pl-5 pr-1 font-bold text-xs text-slate-400">
                    {finished && isLeader ? '🏆' : `${idx + 1}º`}
                  </td>
                  <td className="py-2.5 sm:py-3 px-2">
                    <LineBadge line={row} size="sm" />
                  </td>
                  {showTitles && (
                    <td className="py-2.5 px-1.5 text-center font-extrabold text-yellow-400">{row.titles || 0}</td>
                  )}
                  <td className="py-2.5 px-1.5 text-center font-display font-extrabold text-lime-400">{row.points}</td>
                  <td className="py-2.5 px-1.5 text-center text-slate-300">{row.played}</td>
                  <td className="py-2.5 px-1.5 text-center text-emerald-400">{row.wins}</td>
                  <td className="py-2.5 px-1.5 text-center text-slate-400">{row.draws}</td>
                  <td className="py-2.5 px-1.5 text-center text-rose-400">{row.losses}</td>
                  <td className="py-2.5 px-1.5 text-center text-slate-300">{row.goalsFor}</td>
                  <td className="py-2.5 px-1.5 text-center text-slate-300">{row.goalsAgainst}</td>
                  <td className="py-2.5 pl-1.5 pr-4 sm:pr-5 text-center font-semibold text-slate-200">
                    {row.goalDifference > 0 ? `+${row.goalDifference}` : row.goalDifference}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    )}
  </div>
);
