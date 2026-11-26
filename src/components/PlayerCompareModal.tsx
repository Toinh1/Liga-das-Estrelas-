import React, { useMemo, useState } from 'react';
import { useBaba } from '../context/BabaContext';
import type { Player, PlayerComputedStats } from '../types/domain';
import { Modal, PillTabs, PlayerAvatar, playerLabel } from './ui';

type Group = 'geral' | 'ataque' | 'resultados';

interface Metric {
  label: string;
  get: (s: PlayerComputedStats | undefined, p: Player) => number;
  format?: (v: number) => string;
  /** Menor é melhor (ex.: derrotas). */
  lowerIsBetter?: boolean;
  adminOnly?: boolean;
}

const pct = (v: number) => `${v}%`;
const dec = (v: number) => v.toFixed(2).replace('.', ',');

const METRICS: Record<Group, Metric[]> = {
  geral: [
    { label: 'Partidas', get: (s) => s?.matchesPlayed ?? 0 },
    { label: 'Presenças', get: (s) => s?.participations ?? 0 },
    { label: 'Gols', get: (s) => s?.goals ?? 0 },
    { label: 'Assistências', get: (s) => s?.assists ?? 0 },
    { label: 'Vitórias', get: (s) => s?.matchWins ?? 0 },
    { label: 'Aproveitamento', get: (s) => s?.efficiency ?? 0, format: pct },
    { label: 'Nível técnico (1 = melhor)', get: (_s, p) => p.skillLevel, lowerIsBetter: true, adminOnly: true },
  ],
  ataque: [
    { label: 'Gols', get: (s) => s?.goals ?? 0 },
    { label: 'Assistências', get: (s) => s?.assists ?? 0 },
    { label: 'Participações em gol', get: (s) => (s?.goals ?? 0) + (s?.assists ?? 0) },
    { label: 'Gols por partida', get: (s) => s?.goalsPerMatch ?? 0, format: dec },
    { label: 'Prêmios de artilheiro', get: (s) => s?.topScorerAwards ?? 0 },
  ],
  resultados: [
    { label: 'Vitórias', get: (s) => s?.matchWins ?? 0 },
    { label: 'Empates', get: (s) => s?.matchDraws ?? 0 },
    { label: 'Derrotas', get: (s) => s?.matchLosses ?? 0, lowerIsBetter: true },
    { label: 'Aproveitamento', get: (s) => s?.efficiency ?? 0, format: pct },
    { label: 'Títulos da linha', get: (s) => s?.lineTitles ?? 0 },
    { label: 'Prêmios totais', get: (s) => s?.totalAwards ?? 0 },
  ],
};

/** Barra divergente: cresce a partir do centro para cada lado. */
const Bar: React.FC<{ value: number; max: number; side: 'left' | 'right'; state: 'win' | 'lose' | 'tie' }> = ({ value, max, side, state }) => {
  const color = state === 'win' ? 'bg-lime-400' : state === 'tie' ? 'bg-yellow-300' : 'bg-orange-500/70';
  return (
    <div className={`h-1.5 flex-1 rounded-full bg-white/[0.06] overflow-hidden flex ${side === 'left' ? 'justify-end' : 'justify-start'}`}>
      <div className={`h-full rounded-full ${color} transition-all duration-500`} style={{ width: `${max ? (value / max) * 100 : 0}%` }} />
    </div>
  );
};

export const PlayerCompareModal: React.FC<{ base: Player; onClose: () => void }> = ({ base, onClose }) => {
  const { snapshot, playerStatsMap, isAdmin } = useBaba();
  const [group, setGroup] = useState<Group>('geral');
  const others = useMemo(
    () =>
      (snapshot?.players ?? [])
        .filter((p) => p.id !== base.id)
        .sort((a, b) => (playerStatsMap[b.id]?.matchesPlayed ?? 0) - (playerStatsMap[a.id]?.matchesPlayed ?? 0)),
    [snapshot, base.id, playerStatsMap]
  );
  const [otherId, setOtherId] = useState(others[0]?.id ?? '');
  const other = others.find((p) => p.id === otherId);

  const card = (p: Player | undefined, s: PlayerComputedStats | undefined, align: 'left' | 'right') => (
    <div className={`flex-1 p-3 rounded-2xl bg-[#1F1F1F] border border-white/[0.07] space-y-2 ${align === 'right' ? 'text-right' : ''}`}>
      <div className={`flex items-center gap-2 ${align === 'right' ? 'flex-row-reverse' : ''}`}>
        <PlayerAvatar player={p} size={34} />
        <div className="min-w-0">
          <div className="text-sm font-bold text-white truncate">{playerLabel(p)}</div>
          <div className="text-[10px] text-slate-500">{p?.position}</div>
        </div>
      </div>
      <div className="text-[11px] text-slate-400">
        <span className="text-emerald-400 font-bold">{s?.matchWins ?? 0}V</span> • {s?.goals ?? 0} gols • {s?.efficiency ?? 0}%
      </div>
    </div>
  );

  const metrics = METRICS[group].filter((m) => !m.adminOnly || isAdmin);

  return (
    <Modal title="Comparação de jogadores" onClose={onClose}>
      <div className="p-4 sm:p-5 space-y-4">
        <div className="flex items-stretch gap-2.5">
          {card(base, playerStatsMap[base.id], 'left')}
          {card(other, other ? playerStatsMap[other.id] : undefined, 'right')}
        </div>

        <select
          value={otherId}
          onChange={(e) => setOtherId(e.target.value)}
          className="w-full px-3 py-2.5 rounded-xl bg-[#1F1F1F] border border-white/10 text-sm text-white cursor-pointer"
          aria-label="Comparar com"
        >
          {others.map((p) => (
            <option key={p.id} value={p.id}>
              Comparar com {playerLabel(p)}
            </option>
          ))}
        </select>

        <PillTabs
          value={group}
          onChange={setGroup}
          options={[
            { id: 'geral', label: 'Geral' },
            { id: 'ataque', label: 'Ataque' },
            { id: 'resultados', label: 'Resultados' },
          ]}
        />

        {other ? (
          <div className="rounded-2xl bg-[#1F1F1F] border border-white/[0.07] divide-y divide-white/[0.05]">
            {metrics.map((m) => {
              const a = m.get(playerStatsMap[base.id], base);
              const b = m.get(playerStatsMap[other.id], other);
              const max = Math.max(a, b);
              const aBetter = m.lowerIsBetter ? a < b : a > b;
              const bBetter = m.lowerIsBetter ? b < a : b > a;
              const fmt = m.format ?? ((v: number) => String(v));
              return (
                <div key={m.label} className="px-3.5 py-3 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className={`font-display font-extrabold ${aBetter ? 'text-white' : 'text-slate-400'}`}>{fmt(a)}</span>
                    <span className="text-slate-400">{m.label}</span>
                    <span className={`font-display font-extrabold ${bBetter ? 'text-white' : 'text-slate-400'}`}>{fmt(b)}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Bar value={a} max={max} side="left" state={a === b ? 'tie' : aBetter ? 'win' : 'lose'} />
                    <Bar value={b} max={max} side="right" state={a === b ? 'tie' : bBetter ? 'win' : 'lose'} />
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="py-6 text-center text-xs text-slate-500">Cadastre outro jogador para comparar.</div>
        )}
      </div>
    </Modal>
  );
};
