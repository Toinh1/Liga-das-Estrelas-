import React, { useMemo, useState } from 'react';
import { CalendarRange, Check, Crown, ExternalLink, Flame, Lock, Pencil, Plus, Trophy } from 'lucide-react';
import { AdjustStatsModal } from '../components/AdjustStatsModal';
import { StandingsTable } from '../components/StandingsTable';
import { ChipGroup, EmptyState, PageHeader, PeriodSelect, PlayerAvatar, PosMark, SegmentedTabs, cardClass, ghostBtn, inputClass, playerLabel, primaryBtn } from '../components/ui';
import { useBaba } from '../context/BabaContext';
import { babaService } from '../services/babaService';
import type { PlayerComputedStats } from '../types/domain';
import { computePlayerScores, minParticipations, SCORE_WEIGHTS } from '../utils/awardsEngine';
import {
  computeAllTimeLineStandings,
  computePeladaStandings,
  computePlayersStatsForPeladas,
  filterPeladasByPeriod,
  formatShortDateBR,
  listMonthsWithPeladas,
  peladaInSeason,
  playedPeladaIds,
  todayISO,
  type PeriodFilter,
} from '../utils/statsEngine';

type RankTab = 'jogadores' | 'equipes' | 'historico' | 'temporadas';
type Metric = 'geral' | 'gols' | 'assistencias' | 'vitorias' | 'aproveitamento' | 'participacoes';

const METRICS: { id: Metric; label: string; unit: string }[] = [
  { id: 'geral', label: 'Geral', unit: 'pts' },
  { id: 'gols', label: 'Artilharia', unit: 'gols' },
  { id: 'assistencias', label: 'Assistências', unit: 'assist.' },
  { id: 'vitorias', label: 'Vitórias', unit: 'vit.' },
  { id: 'aproveitamento', label: 'Aproveitamento', unit: '%' },
  { id: 'participacoes', label: 'Participações', unit: 'pres.' },
];

export const RankingPage: React.FC = () => {
  const {
    snapshot,
    isAdmin,
    openPlayerProfile,
    setSelectedPeladaId,
    setActiveSection,
    setCeremonyPeladaId,
    runAction,
    busyAction,
  } = useBaba();

  const [tab, setTab] = useState<RankTab>('jogadores');
  const [metric, setMetric] = useState<Metric>('geral');
  const [editMode, setEditMode] = useState(false);
  const [editPlayerId, setEditPlayerId] = useState<string | null>(null);
  const activeSeason = snapshot?.seasons.find((s) => s.status === 'active');
  const [period, setPeriod] = useState<PeriodFilter>(
    activeSeason ? { kind: 'season', seasonId: activeSeason.id } : { kind: 'all' }
  );
  const [seasonName, setSeasonName] = useState(String(new Date().getFullYear()));
  const [seasonStart, setSeasonStart] = useState(todayISO());

  const data = useMemo(() => {
    if (!snapshot) return null;
    const peladas = filterPeladasByPeriod(snapshot.peladas, snapshot.seasons, period);
    const statsMap = computePlayersStatsForPeladas(
      snapshot.players,
      peladas,
      snapshot.lines,
      snapshot.matches,
      snapshot.goals,
      snapshot.awards
    );
    const played = playedPeladaIds(peladas, snapshot.matches);
    const scores = computePlayerScores(statsMap, snapshot.votingSummaries, played);
    return { peladas, statsMap, scores, min: minParticipations(played.length) };
  }, [snapshot, period]);

  if (!snapshot || !data) return null;

  const months = listMonthsWithPeladas(snapshot.peladas);
  const lineMap = new Map(snapshot.lines.map((l) => [l.id, l]));
  const playerMap = new Map(snapshot.players.map((p) => [p.id, p]));

  // ----- ranking de jogadores -----
  const valueOf = (s: PlayerComputedStats): number => {
    switch (metric) {
      case 'geral':
        return data.scores[s.playerId]?.score ?? 0;
      case 'gols':
        return s.goals;
      case 'assistencias':
        return s.assists;
      case 'vitorias':
        return s.matchWins;
      case 'aproveitamento':
        return s.efficiency;
      case 'participacoes':
        return s.participations;
    }
  };
  const needsMinimum = metric === 'aproveitamento';
  const ranked = Object.values(data.statsMap)
    .filter((s) => s.participations > 0 || s.matchesPlayed > 0)
    .filter((s) => !needsMinimum || s.participations >= data.min)
    .map((s) => ({ s, v: valueOf(s) }))
    .sort((a, b) => b.v - a.v || b.s.goals - a.s.goals || b.s.matchWins - a.s.matchWins);
  const unit = METRICS.find((m) => m.id === metric)!.unit;

  // posição com empates ("1º, 1º, 3º")
  const positions: number[] = [];
  ranked.forEach((r, i) => {
    positions.push(i > 0 && ranked[i - 1].v === r.v ? positions[i - 1] : i + 1);
  });

  // ----- equipes -----
  const singlePelada = period.kind === 'pelada' ? data.peladas[0] : undefined;
  const lineRows = singlePelada
    ? computePeladaStandings(singlePelada, snapshot.lines, snapshot.matches)
    : computeAllTimeLineStandings(data.peladas, snapshot.lines, snapshot.matches).filter(
        (r) => r.played > 0 || (r.titles ?? 0) > 0
      );

  return (
    <div className="space-y-4">
      <PageHeader
        title="Rankings e classificação"
        subtitle={`${data.peladas.length} pelada(s) no período • estatísticas atualizadas a cada jogo`}
        actions={
          tab !== 'temporadas' && (
            <PeriodSelect
              value={period}
              onChange={setPeriod}
              seasons={snapshot.seasons}
              months={months}
              peladas={tab === 'equipes' ? snapshot.peladas : undefined}
            />
          )
        }
      />

      <SegmentedTabs
        value={tab}
        onChange={(t) => {
          setTab(t);
          if (t !== 'equipes' && period.kind === 'pelada') setPeriod({ kind: 'all' });
        }}
        options={[
          { id: 'jogadores', label: 'Jogadores' },
          { id: 'equipes', label: 'Equipes' },
          { id: 'historico', label: 'Peladas' },
          { id: 'temporadas', label: 'Temporadas' },
        ]}
      />

      {/* ==================== JOGADORES ==================== */}
      {tab === 'jogadores' && (
        <div className="space-y-3">
          <ChipGroup value={metric} onChange={setMetric} options={METRICS.map((m) => ({ id: m.id, label: m.label }))} />
          {isAdmin && (
            <div
              className={`flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-2xl border ${
                editMode ? 'bg-yellow-400/[0.08] border-yellow-400/30' : 'bg-[#131613] border-white/[0.07]'
              }`}
            >
              <span className="text-[11px] text-slate-300 leading-snug">
                {editMode
                  ? 'Toque em um jogador para corrigir gols e assistências.'
                  : 'Admin: corrija gols e assistências que ficaram errados.'}
              </span>
              <button
                type="button"
                onClick={() => setEditMode((v) => !v)}
                className={`shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-extrabold cursor-pointer ${
                  editMode ? 'bg-yellow-400 text-slate-950' : 'bg-white/[0.08] text-white'
                }`}
              >
                {editMode ? <Check className="w-3.5 h-3.5" /> : <Pencil className="w-3.5 h-3.5" />}
                {editMode ? 'Concluir' : 'Editar'}
              </button>
            </div>
          )}
          <p className="text-[11px] text-slate-500 px-1">
            {metric === 'geral' &&
              `Pontuação: gol ${SCORE_WEIGHTS.goal} • assistência ${SCORE_WEIGHTS.assist} • vitória ${SCORE_WEIGHTS.win} • voto de Melhor da Pelada ${SCORE_WEIGHTS.bestPlayerVote}.`}
            {metric === 'aproveitamento' &&
              `Pontos conquistados ÷ disputados nos jogos. Mínimo de ${data.min} presença(s) (50% das peladas do período).`}
          </p>

          {ranked.length === 0 ? (
            <EmptyState icon={<Trophy className="w-9 h-9" />} title="Sem estatísticas no período" text="Registre jogos para alimentar os rankings." />
          ) : (
            <div className={`${cardClass} overflow-hidden`}>
              <div className="overflow-x-auto">
                <table className="w-full text-base">
                  <thead>
                    <tr className="text-sm text-slate-500 border-b border-white/[0.05]">
                      <th className="text-left py-3.5 pl-3 sm:pl-4 pr-1 w-9">#</th>
                      <th className="text-left py-3.5 px-1.5 sm:px-2">Atleta</th>
                      <th className="text-center py-3.5 px-1.5 sm:px-2 text-slate-200">{METRICS.find((m) => m.id === metric)!.label}</th>
                      <th className="text-center py-3.5 px-1.5 sm:px-2" title="Jogos">J</th>
                      <th className="text-center py-3.5 pl-1.5 pr-3 sm:px-2" title="Gols">G</th>
                      <th className="hidden sm:table-cell text-center py-3.5 px-2" title="Assistências">A</th>
                      <th className="hidden sm:table-cell text-center py-3.5 pl-2 pr-4" title="Aproveitamento">%</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.04]">
                    {ranked.map(({ s, v }, idx) => {
                      const p = playerMap.get(s.playerId);
                      const pos = positions[idx];
                      return (
                        <tr
                          key={s.playerId}
                          onClick={() => (editMode && isAdmin ? setEditPlayerId(s.playerId) : openPlayerProfile(s.playerId))}
                          className={`hover:bg-white/[0.03] transition cursor-pointer ${pos === 1 ? 'bg-lime-400/[0.05]' : ''}`}
                        >
                          <td className="py-4 pl-3 sm:pl-4 pr-1">
                            <PosMark pos={pos} />
                          </td>
                          <td className="py-4 px-1.5 sm:px-2 max-w-0 w-full">
                            <div className="flex items-center gap-3 min-w-0">
                              <PlayerAvatar player={p} size={40} />
                              <div className="min-w-0">
                                <div className="font-bold text-white text-base truncate flex items-center gap-1.5">
                                  <span className="truncate">{playerLabel(p)}</span>
                                  {editMode && isAdmin && <Pencil className="w-3.5 h-3.5 text-yellow-300 shrink-0" />}
                                </div>
                                <div className="text-xs text-slate-500">{p?.position}</div>
                              </div>
                            </div>
                          </td>
                          <td className="py-4 px-1.5 sm:px-2 text-center font-display text-2xl font-bold text-lime-400 whitespace-nowrap">
                            {v}
                            <span className="text-xs text-slate-500 font-sans font-normal ml-0.5">{unit}</span>
                          </td>
                          <td className="py-4 px-1.5 sm:px-2 text-center text-slate-300">{s.matchesPlayed}</td>
                          <td className="py-4 pl-1.5 pr-3 sm:px-2 text-center text-slate-300">{s.goals}</td>
                          <td className="hidden sm:table-cell py-4 px-2 text-center text-slate-300">{s.assists}</td>
                          <td className="hidden sm:table-cell py-4 pl-2 pr-4 text-center text-slate-400 text-sm">{s.efficiency}%</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {editPlayerId && (
        <AdjustStatsModal playerId={editPlayerId} peladas={data.peladas} onClose={() => setEditPlayerId(null)} />
      )}

      {/* ==================== EQUIPES ==================== */}
      {tab === 'equipes' && (
        <StandingsTable
          rows={lineRows}
          title={singlePelada ? `Classificação — ${singlePelada.title}` : 'Classificação geral das equipes'}
          finished={singlePelada?.status === 'finished'}
          showTitles={!singlePelada}
        />
      )}

      {/* ==================== HISTÓRICO DE PELADAS ==================== */}
      {tab === 'historico' && (
        <div className={`${cardClass} divide-y divide-white/[0.05] overflow-hidden`}>
          {data.peladas.length === 0 ? (
            <div className="p-10 text-center text-xs text-slate-500">Nenhuma pelada no período.</div>
          ) : (
            data.peladas.map((p) => {
              const champ = p.championLineId ? lineMap.get(p.championLineId) : undefined;
              const matchCount = snapshot.matches.filter((m) => m.peladaId === p.id).length;
              return (
                <div key={p.id} className="p-4 sm:px-5 flex flex-wrap items-center justify-between gap-3">
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-white text-sm">{p.title}</span>
                      <span className="text-xs text-slate-500">{formatShortDateBR(p.date)}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                      <span>{matchCount} jogo(s)</span>
                      <span>• {p.presentPlayerIds.length} atletas</span>
                      {champ && <span className="inline-flex items-center gap-1 text-yellow-300 font-semibold">• <Trophy className="w-3.5 h-3.5" /> {champ.name}</span>}
                      {p.status !== 'finished' && <span className="text-lime-400 font-semibold">• em aberto</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        setSelectedPeladaId(p.id);
                        setActiveSection('hoje');
                      }}
                      className={ghostBtn}
                    >
                      <ExternalLink className="w-3.5 h-3.5" /> Abrir
                    </button>
                    {p.status === 'finished' && (
                      <button
                        onClick={() => setCeremonyPeladaId(p.id)}
                        className="inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-yellow-400/15 text-yellow-300 text-xs font-bold cursor-pointer"
                      >
                        <Trophy className="w-3.5 h-3.5" /> Resumo
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ==================== TEMPORADAS ==================== */}
      {tab === 'temporadas' && (
        <div className="space-y-4">
          {isAdmin && !activeSeason && (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                await runAction(
                  () => babaService.createSeason({ name: seasonName, startDate: seasonStart }),
                  'Temporada aberta!'
                );
              }}
              className={`${cardClass} p-4 flex flex-wrap items-end gap-3`}
            >
              <div className="flex-1 min-w-[140px]">
                <label className="block text-xs text-slate-400 mb-1">Nome da temporada</label>
                <input required maxLength={40} value={seasonName} onChange={(e) => setSeasonName(e.target.value)} className={inputClass} placeholder="Temporada 2026" />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Início</label>
                <input type="date" required value={seasonStart} onChange={(e) => setSeasonStart(e.target.value)} className={inputClass} />
              </div>
              <button type="submit" disabled={busyAction} className={primaryBtn}>
                <Plus className="w-4 h-4" /> Abrir temporada
              </button>
            </form>
          )}

          {snapshot.seasons.length === 0 ? (
            <EmptyState
              icon={<CalendarRange className="w-9 h-9" />}
              title="Nenhuma temporada criada"
              text={
                isAdmin
                  ? 'Abra a primeira temporada. Peladas antigas dentro do período entram automaticamente nela.'
                  : 'O administrador ainda não abriu temporadas.'
              }
            />
          ) : (
            snapshot.seasons.map((s) => {
              const seasonPeladas = snapshot.peladas.filter((p) => peladaInSeason(p, s));
              const stats = computePlayersStatsForPeladas(
                snapshot.players,
                seasonPeladas,
                snapshot.lines,
                snapshot.matches,
                snapshot.goals,
                snapshot.awards
              );
              const all = Object.values(stats);
              const top = (fn: (x: PlayerComputedStats) => number) =>
                [...all].sort((a, b) => fn(b) - fn(a)).find((x) => fn(x) > 0);
              const scorer = top((x) => x.goals);
              const winner = top((x) => x.matchWins);
              const ids = new Set(seasonPeladas.map((p) => p.id));
              const totalMatches = snapshot.matches.filter((m) => ids.has(m.peladaId)).length;
              const participants = all.filter((x) => x.participations > 0).length;
              return (
                <div key={s.id} className={`${cardClass} p-4 sm:p-5 space-y-3`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-base font-extrabold text-white">{s.name}</h3>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            s.status === 'active' ? 'bg-lime-400/15 text-lime-400' : 'bg-white/10 text-slate-400'
                          }`}
                        >
                          {s.status === 'active' ? 'Em andamento' : 'Encerrada'}
                        </span>
                      </div>
                      <div className="text-xs text-slate-400">
                        {formatShortDateBR(s.startDate)} → {s.endDate ? formatShortDateBR(s.endDate) : 'hoje'}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          setPeriod({ kind: 'season', seasonId: s.id });
                          setTab('jogadores');
                        }}
                        className={ghostBtn}
                      >
                        Ver rankings
                      </button>
                      {isAdmin && s.status === 'active' && (
                        <button
                          disabled={busyAction}
                          onClick={() => {
                            const end = window.prompt('Data de encerramento (AAAA-MM-DD):', todayISO());
                            if (end && /^\d{4}-\d{2}-\d{2}$/.test(end)) {
                              runAction(() => babaService.closeSeason(s.id, end), 'Temporada encerrada. Histórico preservado.');
                            }
                          }}
                          className={ghostBtn}
                        >
                          <Lock className="w-3.5 h-3.5" /> Encerrar
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                    {[
                      ['Peladas', seasonPeladas.length],
                      ['Jogos', totalMatches],
                      ['Atletas', participants],
                      ['Títulos decididos', seasonPeladas.filter((p) => p.championLineId).length],
                    ].map(([label, value]) => (
                      <div key={label} className="p-2.5 rounded-2xl bg-[#1B1F1B] border border-white/5">
                        <div className="font-display font-extrabold text-white text-lg">{value}</div>
                        <div className="text-[10px] text-slate-500">{label}</div>
                      </div>
                    ))}
                  </div>
                  {(scorer || winner) && (
                    <div className="flex flex-wrap gap-2 text-xs">
                      {scorer && (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-lime-400/10 text-lime-300 font-semibold">
                          <Flame className="w-3.5 h-3.5" /> Artilheiro: {playerLabel(playerMap.get(scorer.playerId))} ({scorer.goals})
                        </span>
                      )}
                      {winner && (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-400/10 text-emerald-300 font-semibold">
                          <Crown className="w-3.5 h-3.5" /> Mais vitórias: {playerLabel(playerMap.get(winner.playerId))} ({winner.matchWins})
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};
