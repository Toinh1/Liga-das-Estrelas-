import React, { useEffect, useMemo, useState } from 'react';
import { Award, Crown, Flame, HandHelping, Shield, Sparkles, Trophy } from 'lucide-react';
import { EmptyState, PageHeader, PlayerAvatar, cardClass, playerLabel } from '../components/ui';
import { useBaba } from '../context/BabaContext';
import { babaService } from '../services/babaService';
import { computePeriodAwards, minParticipations, type PeriodAwardId } from '../utils/awardsEngine';
import {
  computePlayersStatsForPeladas,
  filterPeladasByPeriod,
  formatMonthKey,
  formatShortDateBR,
  listMonthsWithPeladas,
  playedPeladaIds,
} from '../utils/statsEngine';

const AWARD_STYLE: Record<PeriodAwardId, { icon: React.ElementType; color: string; ring: string }> = {
  craque: { icon: Crown, color: 'text-yellow-300', ring: 'border-yellow-400/40' },
  artilheiro: { icon: Flame, color: 'text-lime-400', ring: 'border-lime-400/40' },
  garcom: { icon: HandHelping, color: 'text-sky-400', ring: 'border-sky-400/40' },
  goleiro: { icon: Shield, color: 'text-cyan-300', ring: 'border-cyan-400/40' },
  rei_vitorias: { icon: Trophy, color: 'text-emerald-400', ring: 'border-emerald-400/40' },
  revelacao: { icon: Sparkles, color: 'text-fuchsia-300', ring: 'border-fuchsia-400/40' },
};

const ROUND_LABEL = { best_player: 'Melhor da Pelada', best_goalkeeper: 'Melhor Goleiro', top_scorer: 'Artilheiro' } as const;

export const AwardsPage: React.FC = () => {
  const { snapshot, isAdmin, runAction, openPlayerProfile } = useBaba();
  const months = useMemo(() => (snapshot ? listMonthsWithPeladas(snapshot.peladas) : []), [snapshot]);
  const activeSeason = snapshot?.seasons.find((s) => s.status === 'active');
  const [periodKey, setPeriodKey] = useState<string>(
    months[0] ? `month:${months[0]}` : activeSeason ? `season:${activeSeason.id}` : ''
  );

  useEffect(() => {
    if (periodKey) return;
    if (months[0]) setPeriodKey(`month:${months[0]}`);
    else if (activeSeason) setPeriodKey(`season:${activeSeason.id}`);
  }, [periodKey, months, activeSeason]);

  const result = useMemo(() => {
    if (!snapshot || !periodKey) return null;
    const [kind, id] = periodKey.split(':') as ['month' | 'season', string];
    const filter = kind === 'month' ? { kind, month: id } : { kind, seasonId: id };
    const peladas = filterPeladasByPeriod(snapshot.peladas, snapshot.seasons, filter as any);
    const statsMap = computePlayersStatsForPeladas(
      snapshot.players,
      peladas,
      snapshot.lines,
      snapshot.matches,
      snapshot.goals,
      snapshot.awards
    );
    const season = kind === 'season' ? snapshot.seasons.find((s) => s.id === id) : undefined;
    const awards = computePeriodAwards({
      kind,
      statsMap,
      votingSummaries: snapshot.votingSummaries,
      peladaIds: playedPeladaIds(peladas, snapshot.matches),
      revelationPlayerId: season?.revelationPlayerId,
    });
    const label = kind === 'month' ? formatMonthKey(id) : season?.name ?? '';
    const playedCount = playedPeladaIds(peladas, snapshot.matches).length;
    return { kind, peladas, awards, label, season, statsMap, playedCount };
  }, [snapshot, periodKey]);

  if (!snapshot) return null;
  const playerMap = new Map(snapshot.players.map((p) => [p.id, p]));
  const finishedPeladas = snapshot.peladas.filter((p) => p.status === 'finished');

  return (
    <div className="space-y-4">
      <PageHeader
        title="Premiações"
        subtitle="Destaques calculados com as estatísticas reais"
        actions={
          (months.length > 0 || snapshot.seasons.length > 0) && (
            <select
              value={periodKey}
              onChange={(e) => setPeriodKey(e.target.value)}
              className="px-3 py-2 rounded-xl bg-[#161616] border border-white/10 text-xs font-bold text-white focus:outline-none focus:border-lime-400 cursor-pointer"
              aria-label="Período da premiação"
            >
              {snapshot.seasons.length > 0 && (
                <optgroup label="Temporadas">
                  {snapshot.seasons.map((s) => (
                    <option key={s.id} value={`season:${s.id}`}>
                      {s.name}
                    </option>
                  ))}
                </optgroup>
              )}
              <optgroup label="Meses">
                {months.map((m) => (
                  <option key={m} value={`month:${m}`}>
                    {formatMonthKey(m)}
                  </option>
                ))}
              </optgroup>
            </select>
          )
        }
      />

      {!result || result.playedCount === 0 ? (
        <EmptyState icon={<Award className="w-9 h-9" />} title="Sem peladas no período" text="As premiações aparecem após as primeiras peladas com jogos registrados." />
      ) : (
        <>
          <p className="text-[11px] text-slate-500 px-1">
            {result.playedCount} pelada(s) com jogos em {result.label}. Concorre quem esteve em pelo menos{' '}
            {minParticipations(result.playedCount)} delas (50%). Empates premiam todos os empatados.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {result.awards.map((a) => {
              const style = AWARD_STYLE[a.id];
              const Icon = style.icon;
              const winners = a.winnerPlayerIds.map((id) => playerMap.get(id)).filter(Boolean);
              return (
                <div key={a.id} className={`${cardClass} ${style.ring} p-5 gold-ceremony-bg flex flex-col items-center text-center gap-2.5 animate-fade-in`}>
                  <span className={`inline-flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wide ${style.color}`}>
                    <Icon className="w-4 h-4" /> {a.title}
                  </span>
                  {winners.length > 0 ? (
                    <>
                      <div className="flex -space-x-3 pt-1">
                        {winners.slice(0, 4).map((p) => (
                          <button key={p!.id} onClick={() => openPlayerProfile(p!.id)} className="cursor-pointer" title={playerLabel(p)}>
                            <PlayerAvatar player={p} size={64} className="border-2 border-[#161616] ring-2 ring-white/10" />
                          </button>
                        ))}
                      </div>
                      <div className="font-extrabold text-white text-base leading-tight">
                        {winners.length <= 3
                          ? winners.map((p) => playerLabel(p)).join(' & ')
                          : `${winners.slice(0, 2).map((p) => playerLabel(p)).join(', ')} e mais ${winners.length - 2}`}
                      </div>
                      {a.value > 0 && (
                        <div className={`font-display font-extrabold text-sm ${style.color}`}>
                          {a.value} {a.unit}
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="py-6 text-xs text-slate-500">
                      {a.id === 'revelacao' ? 'Ainda não definida' : 'Sem vencedor no período'}
                    </div>
                  )}
                  <div className="text-[10px] text-slate-500">
                    {a.description} • {result.label}
                  </div>
                  {a.id === 'revelacao' && isAdmin && result.season && (
                    <select
                      value={result.season.revelationPlayerId ?? ''}
                      onChange={(e) =>
                        runAction(
                          () => babaService.setSeasonRevelation(result.season!.id, e.target.value || null),
                          'Revelação definida! ✨'
                        )
                      }
                      className="mt-1 w-full px-2.5 py-1.5 rounded-lg bg-[#1F1F1F] border border-white/10 text-xs text-white cursor-pointer"
                      aria-label="Escolher revelação"
                    >
                      <option value="">Escolher revelação…</option>
                      {Object.values(result.statsMap)
                        .filter((s) => s.participations > 0)
                        .map((s) => playerMap.get(s.playerId))
                        .filter(Boolean)
                        .sort((x, y) => playerLabel(x).localeCompare(playerLabel(y), 'pt-BR'))
                        .map((p) => (
                          <option key={p!.id} value={p!.id}>
                            {playerLabel(p)}
                          </option>
                        ))}
                    </select>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* DESTAQUES POR PELADA (votação + artilharia) */}
      <div className={`${cardClass} overflow-hidden`}>
        <div className="px-4 sm:px-5 py-3.5 border-b border-white/[0.06] text-sm font-bold text-white">
          Destaques de cada pelada
        </div>
        {finishedPeladas.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">Nenhuma pelada encerrada ainda.</div>
        ) : (
          <div className="divide-y divide-white/[0.05]">
            {finishedPeladas.map((p) => {
              const awards = snapshot.awards.filter((a) => a.peladaId === p.id);
              return (
                <div key={p.id} className="px-4 sm:px-5 py-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs">
                    <div className="font-bold text-white">{p.title}</div>
                    <div className="text-slate-500">{formatShortDateBR(p.date)}</div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {awards.length === 0 && <span className="text-[11px] text-slate-500">Sem premiações</span>}
                    {awards.map((a) => (
                      <span key={a.id} className="px-2.5 py-1 rounded-lg bg-white/5 text-[11px] text-slate-200">
                        {a.category === 'best_player' ? '⭐' : a.category === 'best_goalkeeper' ? '🧤' : '🔥'}{' '}
                        <span className="text-slate-400">{ROUND_LABEL[a.category]}:</span>{' '}
                        <span className="font-semibold">{a.winnerPlayerIds.map((id) => playerLabel(playerMap.get(id))).join(' & ')}</span>
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
