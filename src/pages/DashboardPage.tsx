import React, { useMemo, useState } from 'react';
import { AlertTriangle, ArrowRight, Check, ChevronDown, ChevronRight, Clock, Crown, Flame, Trophy, X } from 'lucide-react';
import { HorizontalBars, StackedBarChart } from '../components/charts';
import { PlayerAvatar, playerLabel } from '../components/ui';
import { useBaba } from '../context/BabaContext';
import { getPeladaProgress, type PeladaProgress } from '../components/pelada/PeladaSteps';
import type { Pelada } from '../types/domain';
import { computePeriodAwards } from '../utils/awardsEngine';
import {
  computePlayersStatsForPeladas,
  filterPeladasByPeriod,
  formatMonthKey,
  listMonthsWithPeladas,
  playedPeladaIds,
  todayISO,
  type PeriodFilter,
} from '../utils/statsEngine';

/** Status em linguagem simples, de acordo com a etapa da pelada. */
function statusText(p: Pelada, progress: PeladaProgress): { text: string; cls: string } {
  if (p.status === 'finished') return { text: 'Encerrada', cls: 'text-slate-400' };
  if (progress.matchesDone) return { text: 'Em jogo', cls: 'text-emerald-300' };
  if (progress.teamsDone) return { text: 'Times prontos', cls: 'text-sky-300' };
  if (progress.presenceDone) return { text: 'Sorteando', cls: 'text-yellow-300' };
  return { text: 'Confirmando', cls: 'text-orange-300' };
}

const STEP_CTA: Record<string, string> = {
  presenca: 'Marcar presença',
  times: 'Sortear os times',
  jogos: 'Registrar os jogos',
};

/** "2026-12-02" → { weekday: 'QUA', day: '02', month: 'DEZ' } */
const dateParts = (iso: string) => {
  const d = new Date(`${iso}T12:00:00`);
  const clean = (x: string) => x.replace('.', '').slice(0, 3).toUpperCase();
  return {
    weekday: clean(d.toLocaleDateString('pt-BR', { weekday: 'short' })),
    day: iso.slice(8, 10),
    month: clean(d.toLocaleDateString('pt-BR', { month: 'short' })),
  };
};

export const DashboardPage: React.FC = () => {
  const {
    user,
    isAdmin,
    snapshot,
    playerStatsMap,
    setSelectedPeladaId,
    setActiveSection,
    openPlayerProfile,
  } = useBaba();

  const months = useMemo(() => (snapshot ? listMonthsWithPeladas(snapshot.peladas) : []), [snapshot]);
  const currentMonth = todayISO().slice(0, 7);
  const [month, setMonth] = useState<string>(() => (months.includes(currentMonth) ? currentMonth : 'all'));

  const view = useMemo(() => {
    if (!snapshot) return null;
    const activeSeason = snapshot.seasons.find((s) => s.status === 'active');
    const scope: PeriodFilter = activeSeason ? { kind: 'season', seasonId: activeSeason.id } : { kind: 'all' };
    const scopePeladas = filterPeladasByPeriod(snapshot.peladas, snapshot.seasons, scope);
    const scopeStats = activeSeason
      ? computePlayersStatsForPeladas(snapshot.players, scopePeladas, snapshot.lines, snapshot.matches, snapshot.goals, snapshot.awards)
      : playerStatsMap;

    const lastMonth = months[0];
    const monthPeladas = lastMonth ? filterPeladasByPeriod(snapshot.peladas, snapshot.seasons, { kind: 'month', month: lastMonth }) : [];
    const monthStats = computePlayersStatsForPeladas(snapshot.players, monthPeladas, snapshot.lines, snapshot.matches, snapshot.goals, snapshot.awards);
    const craque = lastMonth
      ? computePeriodAwards({
          kind: 'month',
          statsMap: monthStats,
          votingSummaries: snapshot.votingSummaries,
          peladaIds: playedPeladaIds(monthPeladas, snapshot.matches),
        }).find((a) => a.id === 'craque')
      : undefined;

    const stats = Object.values(scopeStats);
    const topBy = (fn: (s: (typeof stats)[number]) => number, n = 5) =>
      [...stats].filter((s) => fn(s) > 0).sort((a, b) => fn(b) - fn(a)).slice(0, n);

    const chart = [...snapshot.peladas]
      .filter((p) => p.status !== 'open')
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-12)
      .map((p) => {
        const ms = snapshot.matches.filter((m) => m.peladaId === p.id);
        return {
          label: `${p.date.slice(8, 10)}/${p.date.slice(5, 7)}`,
          title: p.title,
          values: { goals: ms.reduce((acc, m) => acc + m.homeGoals + m.awayGoals, 0), matches: ms.length },
        };
      });

    return {
      scopeLabel: activeSeason ? activeSeason.name : 'todo o histórico',
      topScorers: topBy((s) => s.goals),
      topWinners: topBy((s) => s.matchWins),
      craque,
      lastMonth,
      chart,
    };
  }, [snapshot, playerStatsMap, months]);

  if (!snapshot || !user || !view) return null;

  const playerMap = new Map(snapshot.players.map((p) => [p.id, p]));
  const lineMap = new Map(snapshot.lines.map((l) => [l.id, l]));
  const activePlayers = snapshot.players.filter((p) => p.active).length;
  const nextPelada = snapshot.peladas
    .filter((p) => p.status !== 'finished')
    .sort((a, b) => a.date.localeCompare(b.date))[0];
  const myStatus = nextPelada
    ? nextPelada.confirmedPlayerIds.includes(user.playerId)
      ? 'confirmed'
      : nextPelada.declinedPlayerIds.includes(user.playerId)
      ? 'declined'
      : 'pending'
    : null;
  const nextProgress = nextPelada ? getPeladaProgress(nextPelada, snapshot.matches) : null;
  const openPeladas = snapshot.peladas.filter((p) => p.status !== 'finished');

  // Feed agrupado por mês
  const feed = (month === 'all' ? snapshot.peladas : snapshot.peladas.filter((p) => p.date.startsWith(month)));
  const groups: { key: string; items: Pelada[] }[] = [];
  for (const p of feed) {
    const key = p.date.slice(0, 7);
    const g = groups.find((x) => x.key === key);
    if (g) g.items.push(p);
    else groups.push({ key, items: [p] });
  }

  const openPelada = (id: string) => {
    setSelectedPeladaId(id);
    setActiveSection('hoje');
  };

  const highlights = [
    {
      icon: Flame,
      iconCls: 'text-lime-400',
      title: 'Artilheiro',
      ids: view.topScorers[0] ? view.topScorers.filter((s) => s.goals === view.topScorers[0].goals).map((s) => s.playerId) : [],
      value: `${view.topScorers[0]?.goals ?? 0}`,
      sub: view.scopeLabel,
    },
    {
      icon: Trophy,
      iconCls: 'text-emerald-400',
      title: 'Mais vitórias',
      ids: view.topWinners[0] ? view.topWinners.filter((s) => s.matchWins === view.topWinners[0].matchWins).map((s) => s.playerId) : [],
      value: `${view.topWinners[0]?.matchWins ?? 0}`,
      sub: view.scopeLabel,
    },
    {
      icon: Crown,
      iconCls: 'text-yellow-300',
      title: 'Craque do mês',
      ids: view.craque?.winnerPlayerIds ?? [],
      value: `${view.craque?.value ?? 0} pts`,
      sub: view.lastMonth ? formatMonthKey(view.lastMonth) : '',
    },
  ];

  return (
    <div className="space-y-7">
      {/* AVISO: VÁRIAS PELADAS ABERTAS */}
      {isAdmin && openPeladas.length > 1 && (
        <div className="flex gap-3 px-4 py-3 rounded-xl bg-amber-500/[0.07] border border-amber-400/25">
          <AlertTriangle className="w-4 h-4 text-amber-300 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-100/90 leading-relaxed">
            Existem <strong>{openPeladas.length} peladas em aberto</strong>. Abra as que não vão acontecer e toque na
            lixeira para excluir, ou encerre as que já terminaram.
          </p>
        </div>
      )}

      {/* PRÓXIMA PELADA */}
      {nextPelada && nextProgress && (() => {
        const d = dateParts(nextPelada.date);
        const steps = [
          { id: 'presenca', label: 'Presença', done: nextProgress.presenceDone },
          { id: 'times', label: 'Times', done: nextProgress.teamsDone },
          { id: 'jogos', label: 'Jogos', done: nextProgress.matchesDone },
          { id: 'encerrar', label: 'Encerrar', done: false },
        ];
        const currentId = nextProgress.matchesDone ? 'encerrar' : nextProgress.current;
        return (
          <section aria-label="Próxima pelada" className="rounded-xl bg-[#131613] border border-white/[0.09] overflow-hidden">
            <div className="flex">
              {/* Data no estilo de ingresso */}
              <div className="w-[4.5rem] shrink-0 flex flex-col items-center justify-center py-4 bg-lime-400 text-slate-950">
                <span className="text-[11px] font-bold uppercase tracking-wider">{d.weekday}</span>
                <span className="font-display font-bold text-4xl leading-none mt-0.5">{d.day}</span>
                <span className="text-[11px] font-bold uppercase tracking-wider mt-0.5">{d.month}</span>
              </div>
              <div className="flex-1 min-w-0 px-4 py-3.5 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold text-lime-400">Próxima pelada</p>
                  <h2 className="font-display font-bold uppercase text-2xl text-white leading-tight truncate">{nextPelada.title}</h2>
                  <p className="text-xs text-slate-400 mt-0.5 truncate">
                    {nextPelada.time}
                    {nextPelada.location ? ` · ${nextPelada.location}` : ''}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-display font-bold text-2xl leading-none text-white">
                    {nextPelada.confirmedPlayerIds.length}
                    <span className="text-slate-500 text-lg">/{activePlayers}</span>
                  </p>
                  <p className="text-[11px] text-slate-400 mt-1">confirmados</p>
                </div>
              </div>
            </div>

            {/* Etapas */}
            <ol className="grid grid-cols-4 border-t border-white/[0.07]">
              {steps.map((s, i) => {
                const isCurrent = s.id === currentId;
                return (
                  <li
                    key={s.id}
                    className={`flex items-center justify-center gap-1.5 py-2.5 text-[11px] font-semibold ${
                      i > 0 ? 'border-l border-white/[0.07]' : ''
                    } ${s.done ? 'text-lime-400' : isCurrent ? 'text-white bg-white/[0.04]' : 'text-slate-500'}`}
                    aria-current={isCurrent ? 'step' : undefined}
                  >
                    {s.done ? <Check className="w-3.5 h-3.5" strokeWidth={3} /> : <span className="tabular-nums">{i + 1}</span>}
                    {s.label}
                  </li>
                );
              })}
            </ol>

            <div className="px-4 py-3.5 border-t border-white/[0.07]">
              {isAdmin ? (
                <button
                  onClick={() => openPelada(nextPelada.id)}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-lg bg-lime-400 hover:bg-lime-300 text-slate-950 text-sm font-bold cursor-pointer transition"
                >
                  {nextProgress.matchesDone ? 'Continuar a pelada' : STEP_CTA[nextProgress.current]}
                  <ArrowRight className="w-4 h-4" />
                </button>
              ) : (
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`inline-flex items-center gap-1.5 text-xs font-semibold ${
                      myStatus === 'confirmed' ? 'text-lime-400' : myStatus === 'declined' ? 'text-rose-400' : 'text-slate-400'
                    }`}
                  >
                    {myStatus === 'confirmed' ? (
                      <Check className="w-3.5 h-3.5" strokeWidth={3} />
                    ) : myStatus === 'declined' ? (
                      <X className="w-3.5 h-3.5" strokeWidth={3} />
                    ) : (
                      <Clock className="w-3.5 h-3.5" />
                    )}
                    {myStatus === 'confirmed'
                      ? 'Você está na lista'
                      : myStatus === 'declined'
                      ? 'Você está fora desta pelada'
                      : 'O admin ainda não te colocou na lista'}
                  </span>
                  <button onClick={() => openPelada(nextPelada.id)} className="text-xs font-semibold text-white underline underline-offset-4 cursor-pointer">
                    Ver pelada
                  </button>
                </div>
              )}
            </div>
          </section>
        );
      })()}

      {/* LISTA DE PELADAS (estilo tabela de jogos) */}
      <section className="space-y-2.5">
        <div className="flex items-end justify-between gap-3">
          <h2 className="font-display font-bold uppercase text-lg text-white leading-none">Peladas</h2>
          <label className="relative inline-flex items-center gap-1 text-xs font-semibold text-slate-300 cursor-pointer">
            {month === 'all' ? 'Todas' : formatMonthKey(month).replace('/', ' ')}
            <ChevronDown className="w-3.5 h-3.5" />
            <select
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="absolute inset-0 opacity-0 cursor-pointer"
              aria-label="Filtrar peladas por mês"
            >
              <option value="all">Todas</option>
              {months.map((m) => (
                <option key={m} value={m}>
                  {formatMonthKey(m).replace('/', ' ')}
                </option>
              ))}
            </select>
          </label>
        </div>

        {groups.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/10 px-4 py-8 text-center text-sm text-slate-400">
            Nenhuma pelada {month === 'all' ? 'criada ainda' : 'neste mês'}.
            {isAdmin && ' Toque em Nova pelada para criar.'}
          </div>
        ) : (
          groups.map((g) => (
            <div key={g.key} className="space-y-1.5">
              {groups.length > 1 && (
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 pt-1">
                  {formatMonthKey(g.key).replace('/', ' ')}
                </h3>
              )}
              <ul className="rounded-xl bg-[#131613] border border-white/[0.08] divide-y divide-white/[0.06] overflow-hidden">
                {g.items.map((p) => {
                  const d = dateParts(p.date);
                  const st = statusText(p, getPeladaProgress(p, snapshot.matches));
                  const matchCount = snapshot.matches.filter((m) => m.peladaId === p.id).length;
                  const champ = p.championLineId ? lineMap.get(p.championLineId) : undefined;
                  const people = p.status === 'open' ? p.confirmedPlayerIds.length : p.presentPlayerIds.length || p.confirmedPlayerIds.length;
                  return (
                    <li key={p.id}>
                      <button
                        onClick={() => openPelada(p.id)}
                        className="w-full flex items-center gap-3.5 px-3.5 py-3 text-left hover:bg-white/[0.03] active:bg-white/[0.05] transition cursor-pointer"
                      >
                        <div className="w-10 shrink-0 text-center leading-none">
                          <div className="font-display font-bold text-xl text-white">{d.day}</div>
                          <div className="text-[10px] font-semibold uppercase text-slate-500 mt-1">{d.month}</div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-white truncate">{p.title}</span>
                          </div>
                          <div className="text-xs text-slate-400 mt-0.5 truncate">
                            {p.time} · {people} {p.status === 'open' ? 'confirmados' : 'atletas'}
                            {matchCount > 0 ? ` · ${matchCount} ${matchCount === 1 ? 'jogo' : 'jogos'}` : ''}
                          </div>
                        </div>
                        {champ ? (
                          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-200 shrink-0">
                            <Trophy className="w-3.5 h-3.5 text-yellow-300" />
                            <span className="w-2.5 h-2.5 rounded-sm border border-white/20" style={{ backgroundColor: champ.colorHex }} />
                            {champ.name.replace(/^Linha\s+/i, '')}
                          </span>
                        ) : (
                          <span className={`inline-flex items-center gap-1.5 text-xs font-semibold shrink-0 ${st.cls}`}>
                            <span className="w-1.5 h-1.5 rounded-full bg-current" />
                            {st.text}
                          </span>
                        )}
                        <ChevronRight className="w-4 h-4 text-slate-600 shrink-0" aria-hidden />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))
        )}
      </section>

      {/* NÚMEROS DO BABA: uma faixa só, sem cartões repetidos */}
      <section aria-label="Números do baba" className="grid grid-cols-4 rounded-xl border border-white/[0.08] divide-x divide-white/[0.06]">
        {[
          { value: activePlayers, label: 'jogadores' },
          { value: snapshot.peladas.filter((p) => p.status === 'finished').length, label: 'realizadas' },
          { value: openPeladas.length, label: 'em aberto' },
          { value: snapshot.matches.length, label: 'partidas' },
        ].map((s) => (
          <div key={s.label} className="px-2 py-3 text-center">
            <div className="font-display font-bold text-2xl text-white leading-none">{s.value}</div>
            <div className="text-[11px] text-slate-400 mt-1">{s.label}</div>
          </div>
        ))}
      </section>

      {/* LÍDERES */}
      <section className="space-y-2.5">
        <div className="flex items-end justify-between gap-3">
          <h2 className="font-display font-bold uppercase text-lg text-white leading-none">Líderes</h2>
          <button onClick={() => setActiveSection('ranking')} className="text-xs font-semibold text-lime-400 cursor-pointer">
            Ver ranking
          </button>
        </div>
        <ul className="rounded-xl bg-[#131613] border border-white/[0.08] divide-y divide-white/[0.06]">
          {highlights.map((h) => {
            const players = h.ids.map((id) => playerMap.get(id)).filter(Boolean);
            const Icon = h.icon;
            return (
              <li key={h.title}>
                <button
                  onClick={() => players[0] && openPlayerProfile(players[0]!.id)}
                  disabled={!players.length}
                  className="w-full flex items-center gap-3 px-3.5 py-3 text-left enabled:hover:bg-white/[0.03] transition enabled:cursor-pointer"
                >
                  <Icon className={`w-4 h-4 shrink-0 ${h.iconCls}`} />
                  <div className="w-24 shrink-0">
                    <div className="text-xs font-semibold text-slate-300">{h.title}</div>
                    <div className="text-[10px] text-slate-500 truncate">{h.sub}</div>
                  </div>
                  <div className="flex-1 min-w-0 flex items-center gap-2">
                    {players[0] && <PlayerAvatar player={players[0]} size={24} />}
                    <span className="text-sm font-semibold text-white truncate">
                      {players.length === 0
                        ? 'Sem dados ainda'
                        : players.length <= 2
                        ? players.map((p) => playerLabel(p)).join(' e ')
                        : `${playerLabel(players[0])} e mais ${players.length - 1}`}
                    </span>
                  </div>
                  {players.length > 0 && (
                    <span className="font-display font-bold text-lg text-white shrink-0">{h.value}</span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      {/* GRÁFICOS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <section className="rounded-xl border border-white/[0.08] p-4 space-y-3">
          <h2 className="font-display font-bold uppercase text-base text-white leading-none">Gols e jogos por pelada</h2>
          <StackedBarChart
            data={view.chart}
            series={[
              { key: 'goals', label: 'Gols', color: '#52CC33' },
              { key: 'matches', label: 'Jogos', color: '#3F453D' },
            ]}
            emptyText="Registre jogos para ver a evolução."
          />
        </section>
        <section className="rounded-xl border border-white/[0.08] p-4 space-y-3">
          <h2 className="font-display font-bold uppercase text-base text-white leading-none">Artilharia</h2>
          <HorizontalBars
            rows={view.topScorers.map((s) => ({
              id: s.playerId,
              label: (
                <span className="inline-flex items-center gap-2">
                  <PlayerAvatar player={playerMap.get(s.playerId)} size={20} /> {playerLabel(playerMap.get(s.playerId))}
                </span>
              ),
              value: s.goals,
              suffix: 'gols',
            }))}
          />
        </section>
      </div>
    </div>
  );
};
