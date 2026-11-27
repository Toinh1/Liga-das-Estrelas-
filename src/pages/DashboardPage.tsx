import React, { useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  Check,
  ChevronDown,
  Clock,
  Crown,
  Flame,
  Swords,
  Trophy,
  Users,
} from 'lucide-react';
import { HorizontalBars, StackedBarChart } from '../components/charts';
import {
  IconTile,
  InfoChip,
  PlayerAvatar,
  RingProgress,
  SessionCard,
  cardClass,
  dayPeriod,
  playerLabel,
  type TileTone,
} from '../components/ui';
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

const STATUS_VIEW: Record<Pelada['status'], { icon: React.ElementType; tone: TileTone }> = {
  open: { icon: CalendarClock, tone: 'orange' },
  in_progress: { icon: Activity, tone: 'emerald' },
  finished: { icon: Swords, tone: 'lime' },
};

/** Texto do status em linguagem simples, de acordo com a etapa da pelada. */
function statusText(p: Pelada, progress: PeladaProgress): { text: string; cls: string } {
  if (p.status === 'finished') return { text: 'Encerrada', cls: 'bg-white/[0.06] text-slate-300' };
  if (progress.matchesDone) return { text: 'Em jogo', cls: 'bg-emerald-500/15 text-emerald-300' };
  if (progress.teamsDone) return { text: 'Times prontos', cls: 'bg-sky-500/15 text-sky-300' };
  if (progress.presenceDone) return { text: 'Sorteando times', cls: 'bg-yellow-400/15 text-yellow-300' };
  return { text: 'Confirmando presença', cls: 'bg-orange-500/15 text-orange-300' };
}

const STEP_CTA: Record<string, string> = {
  presenca: 'Marcar presença',
  times: 'Sortear os times',
  jogos: 'Registrar os jogos',
};

const shortDate = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' });

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
  const confirmedPct = nextPelada && activePlayers ? (nextPelada.confirmedPlayerIds.length / activePlayers) * 100 : 0;

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
      tone: 'lime' as TileTone,
      title: 'Artilheiro',
      ids: view.topScorers[0] ? view.topScorers.filter((s) => s.goals === view.topScorers[0].goals).map((s) => s.playerId) : [],
      value: `${view.topScorers[0]?.goals ?? 0} gols`,
      sub: view.scopeLabel,
    },
    {
      icon: Trophy,
      tone: 'emerald' as TileTone,
      title: 'Mais vitórias',
      ids: view.topWinners[0] ? view.topWinners.filter((s) => s.matchWins === view.topWinners[0].matchWins).map((s) => s.playerId) : [],
      value: `${view.topWinners[0]?.matchWins ?? 0} vitórias`,
      sub: view.scopeLabel,
    },
    {
      icon: Crown,
      tone: 'yellow' as TileTone,
      title: 'Craque do mês',
      ids: view.craque?.winnerPlayerIds ?? [],
      value: `${view.craque?.value ?? 0} pts`,
      sub: view.lastMonth ? formatMonthKey(view.lastMonth) : '',
    },
  ];

  return (
    <div className="space-y-5">
      {/* CABEÇALHO: mês + presença */}
      <div className="flex items-center justify-between gap-3">
        <label className="relative inline-flex items-center gap-1.5 cursor-pointer">
          <span className="font-display font-extrabold text-xl sm:text-2xl text-white">
            {month === 'all' ? 'Todas as peladas' : formatMonthKey(month).replace('/', ' ')}
          </span>
          <ChevronDown className="w-5 h-5 text-slate-300" />
          <select
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="absolute inset-0 opacity-0 cursor-pointer"
            aria-label="Escolher mês"
          >
            <option value="all">Todas as peladas</option>
            {months.map((m) => (
              <option key={m} value={m}>
                {formatMonthKey(m)}
              </option>
            ))}
          </select>
        </label>

      </div>

      {/* AVISO: VÁRIAS PELADAS ABERTAS */}
      {isAdmin && openPeladas.length > 1 && (
        <div className="flex gap-3 px-4 py-3 rounded-2xl bg-amber-500/10 border border-amber-400/30">
          <AlertTriangle className="w-4 h-4 text-amber-300 shrink-0 mt-0.5" />
          <p className="text-[11px] sm:text-xs text-amber-100/90 leading-relaxed">
            Existem <strong>{openPeladas.length} peladas em aberto</strong>. Para não confundir a galera, abra as que não vão
            acontecer e toque na lixeira para excluir, ou encerre as que já terminaram.
          </p>
        </div>
      )}

      {/* PRÓXIMA PELADA: o que fazer agora */}
      {nextPelada && nextProgress && (
        <div className="p-4 rounded-3xl bg-gradient-to-br from-lime-400/[0.12] to-transparent border border-lime-400/30 space-y-3.5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[10px] font-black uppercase tracking-wider text-lime-400">Próxima pelada</div>
              <div className="font-display font-extrabold text-lg text-white leading-tight mt-0.5">{nextPelada.title}</div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                {shortDate(nextPelada.date)} às {nextPelada.time}
                {nextPelada.location ? ` • ${nextPelada.location}` : ''}
              </div>
            </div>
            <RingProgress value={confirmedPct} />
          </div>

          {/* Etapas resumidas */}
          <div className="grid grid-cols-4 gap-1">
            {(
              [
                ['Presença', nextProgress.presenceDone],
                ['Times', nextProgress.teamsDone],
                ['Jogos', nextProgress.matchesDone],
                ['Encerrar', false],
              ] as const
            ).map(([label, done], i) => (
              <div key={label} className="flex flex-col items-center gap-1">
                <div className={`h-1.5 w-full rounded-full ${done ? 'bg-lime-400' : 'bg-white/10'}`} />
                <span className={`text-[10px] font-bold inline-flex items-center gap-0.5 ${done ? 'text-lime-400' : 'text-slate-500'}`}>
                  {done ? <Check className="w-3 h-3" strokeWidth={3} /> : `${i + 1}.`} {label}
                </span>
              </div>
            ))}
          </div>

          <div className="text-xs text-slate-300">
            <strong className="text-white">{nextPelada.confirmedPlayerIds.length}</strong> confirmados de {activePlayers} jogadores
          </div>

          {isAdmin ? (
            <button
              onClick={() => openPelada(nextPelada.id)}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-lime-400 hover:bg-lime-300 text-slate-950 text-sm font-extrabold cursor-pointer transition"
            >
              {nextProgress.matchesDone ? 'Continuar a pelada' : STEP_CTA[nextProgress.current]}
              <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <div className="flex items-center justify-between gap-2">
              <span
                className={`text-xs font-bold ${
                  myStatus === 'confirmed' ? 'text-lime-400' : myStatus === 'declined' ? 'text-rose-400' : 'text-slate-400'
                }`}
              >
                {myStatus === 'confirmed'
                  ? '✓ Você está na lista'
                  : myStatus === 'declined'
                  ? '✕ Você está fora desta pelada'
                  : 'O admin ainda não te colocou na lista'}
              </span>
              <button onClick={() => openPelada(nextPelada.id)} className="text-xs font-bold text-white underline cursor-pointer">
                Ver pelada
              </button>
            </div>
          )}
        </div>
      )}

      {/* FEED DE PELADAS */}
      <div className="px-1 -mb-1">
        <h2 className="text-sm font-extrabold text-white">Peladas</h2>
        <p className="text-[11px] text-slate-500">Toque em uma pelada para ver presença, times, jogos e gols.</p>
      </div>
      {groups.length === 0 ? (
        <div className={`${cardClass} p-10 text-center text-sm text-slate-400`}>
          Nenhuma pelada {month === 'all' ? 'criada ainda' : 'neste mês'}.
          {isAdmin && ' Toque no botão verde + para criar.'}
        </div>
      ) : (
        groups.map((g, gi) => (
          <section key={g.key} className="space-y-2.5">
            {(month === 'all' || gi > 0) && (
              <h2 className="text-xs font-bold text-slate-500 px-1 pt-1">{formatMonthKey(g.key).replace('/', ' ')}</h2>
            )}
            {g.items.map((p) => {
              const sv = STATUS_VIEW[p.status];
              const st = statusText(p, getPeladaProgress(p, snapshot.matches));
              const matchCount = snapshot.matches.filter((m) => m.peladaId === p.id).length;
              const champ = p.championLineId ? lineMap.get(p.championLineId) : undefined;
              return (
                <SessionCard
                  key={p.id}
                  icon={sv.icon}
                  tone={sv.tone}
                  title={p.title}
                  subtitle={`${shortDate(p.date)} • ${dayPeriod(p.time)}${p.location ? ` • ${p.location}` : ''}`}
                  right={
                    champ ? (
                      <span
                        className="px-2 py-1 rounded-lg text-[10px] font-black border border-white/10 shrink-0"
                        style={{ backgroundColor: champ.colorHex, color: champ.textColorHex }}
                        title={`${champ.name} campeã`}
                      >
                        🏆 {champ.name.replace(/^Linha\s+/i, '')}
                      </span>
                    ) : (
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 ${st.cls}`}>{st.text}</span>
                    )
                  }
                  chips={
                    <>
                      <InfoChip icon={Clock}>{p.time}</InfoChip>
                      <InfoChip icon={Users}>
                        {p.status === 'open' ? `${p.confirmedPlayerIds.length} confirmados` : `${p.presentPlayerIds.length || p.confirmedPlayerIds.length} atletas`}
                      </InfoChip>
                      {matchCount > 0 && <InfoChip icon={Swords}>{matchCount} jogos</InfoChip>}
                    </>
                  }
                  onClick={() => openPelada(p.id)}
                />
              );
            })}
          </section>
        ))
      )}

      {/* RESUMO DO BABA (estilo "My Club") */}
      <section className="space-y-2.5">
        <h2 className="text-xs font-bold text-slate-500 px-1">Resumo do baba</h2>
        <div className="grid grid-cols-2 gap-2.5">
          {[
            { icon: Users, tone: 'lime' as TileTone, value: activePlayers, label: 'Jogadores ativos' },
            { icon: Trophy, tone: 'yellow' as TileTone, value: snapshot.peladas.filter((p) => p.status === 'finished').length, label: 'Peladas realizadas' },
            { icon: Activity, tone: 'emerald' as TileTone, value: snapshot.peladas.filter((p) => p.status !== 'finished').length, label: 'Em aberto' },
            { icon: Swords, tone: 'sky' as TileTone, value: snapshot.matches.length, label: 'Partidas' },
          ].map((s) => (
            <div key={s.label} className="flex items-center gap-3 p-3.5 rounded-2xl bg-[#161616] border border-white/[0.07]">
              <IconTile icon={s.icon} tone={s.tone} />
              <div>
                <div className="font-display font-extrabold text-lg text-white leading-none">{s.value}</div>
                <div className="text-[11px] text-slate-500 mt-1">{s.label}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* DESTAQUES */}
      <section className="space-y-2.5">
        <h2 className="text-xs font-bold text-slate-500 px-1">Destaques</h2>
        <div className="flex gap-2.5 overflow-x-auto pb-1 -mx-1 px-1 snap-x no-scrollbar">
          {highlights.map((h) => {
            const players = h.ids.map((id) => playerMap.get(id)).filter(Boolean);
            return (
              <button
                key={h.title}
                onClick={() => players[0] && openPlayerProfile(players[0]!.id)}
                className="snap-start shrink-0 w-[200px] sm:flex-1 text-left p-3.5 rounded-2xl bg-[#161616] border border-white/[0.07] cursor-pointer hover:border-lime-400/30 transition"
              >
                <div className="flex items-center justify-between">
                  <IconTile icon={h.icon} tone={h.tone} size="sm" />
                  {players[0] && <PlayerAvatar player={players[0]} size={32} />}
                </div>
                <div className="text-[11px] text-slate-500 mt-3">{h.title}</div>
                <div className="text-sm font-bold text-white truncate">
                  {players.length ? players.map((p) => playerLabel(p)).join(' & ') : '—'}
                </div>
                <div className="text-[11px] text-slate-400 truncate">{players.length ? `${h.value} • ${h.sub}` : 'Sem dados ainda'}</div>
              </button>
            );
          })}
        </div>
      </section>

      {/* GRÁFICOS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className={`${cardClass} !rounded-2xl p-4 space-y-3`}>
          <h2 className="text-sm font-bold text-white">Gols e jogos por pelada</h2>
          <StackedBarChart
            data={view.chart}
            series={[
              { key: 'goals', label: 'Gols', color: '#3FE21A' },
              { key: 'matches', label: 'Jogos', color: '#3F3F46' },
            ]}
            emptyText="Registre jogos para ver a evolução."
          />
        </div>
        <div className={`${cardClass} !rounded-2xl p-4 space-y-3`}>
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-white">Top artilheiros</h2>
            <button onClick={() => setActiveSection('ranking')} className="text-[11px] font-bold text-lime-400 cursor-pointer">
              Ver todos
            </button>
          </div>
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
        </div>
      </div>
    </div>
  );
};
