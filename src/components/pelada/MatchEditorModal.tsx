import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Flag, Minus, Pause, Play, Plus, RotateCcw, Timer } from 'lucide-react';
import { useBaba } from '../../context/BabaContext';
import { babaService, newId, type MatchInput } from '../../services/babaService';
import type { LineTeam, MatchRecord, MatchScorerEntry, Pelada, Player } from '../../types/domain';
import { Modal, PlayerAvatar, playerLabel, primaryBtn } from '../ui';
import {
  DURATION_OPTIONS,
  GOALS_TO_WIN,
  clearLive,
  elapsedOf,
  formatClock,
  loadDuration,
  loadLive,
  primeAudio,
  saveDuration,
  saveLive,
  signalEnd,
  type EndReason,
  type LiveMatchState,
} from './liveMatch';

type Counts = Record<string, number>;

const toCounts = (entries: MatchScorerEntry[]): Counts =>
  Object.fromEntries(entries.map((e) => [e.playerId, e.count]));
const toEntries = (c: Counts): MatchScorerEntry[] =>
  Object.entries(c)
    .filter(([, n]) => n > 0)
    .map(([playerId, count]) => ({ playerId, count }));
const total = (c: Counts) => Object.values(c).reduce((a, b) => a + b, 0);

/** Tira assistências (das últimas para as primeiras) até caber no número de gols com autor. */
const trimTo = (c: Counts, max: number): Counts => {
  let excess = total(c) - max;
  if (excess <= 0) return c;
  const next = { ...c };
  for (const id of Object.keys(next).reverse()) {
    if (excess <= 0) break;
    const cut = Math.min(next[id], excess);
    next[id] -= cut;
    excess -= cut;
  }
  return next;
};

const Stepper: React.FC<{
  value: number;
  onChange: (v: number) => void;
  max?: number;
  tone?: 'lime' | 'sky';
  label: string;
}> = ({ value, onChange, max = 99, tone = 'lime', label }) => (
  <div className="flex items-center gap-1" aria-label={label}>
    <button
      type="button"
      disabled={value <= 0}
      onClick={() => onChange(Math.max(0, value - 1))}
      className="w-7 h-7 rounded-lg bg-white/5 active:bg-white/15 flex items-center justify-center text-slate-300 disabled:opacity-30 cursor-pointer"
      aria-label={`Diminuir ${label}`}
    >
      <Minus className="w-3.5 h-3.5" />
    </button>
    <span className={`w-5 text-center font-display font-extrabold ${value > 0 ? (tone === 'lime' ? 'text-lime-400' : 'text-sky-400') : 'text-slate-600'}`}>
      {value}
    </span>
    <button
      type="button"
      disabled={value >= max}
      onClick={() => onChange(value + 1)}
      className={`w-7 h-7 rounded-lg flex items-center justify-center disabled:opacity-30 cursor-pointer ${
        tone === 'lime' ? 'bg-lime-400/15 text-lime-400 active:bg-lime-400/30' : 'bg-sky-400/15 text-sky-400 active:bg-sky-400/30'
      }`}
      aria-label={`Aumentar ${label}`}
    >
      <Plus className="w-3.5 h-3.5" />
    </button>
  </div>
);

type Step = 'setup' | 'live' | 'authors';

const END_TEXT: Record<EndReason, string> = {
  time: 'Fim do tempo',
  goals: `Fim por ${GOALS_TO_WIN} gols`,
  manual: 'Encerrada pelo admin',
};

/**
 * Registro / correção de jogo:
 *  1. Linhas (e tempo)  →  2. Partida ao vivo com cronômetro (opcional)
 *  →  3. Resultado: placar, quem marcou e quem deu assistência.
 * A partida acaba no tempo escolhido OU quando uma linha faz 2 gols.
 */
export const MatchEditorModal: React.FC<{
  pelada: Pelada;
  lines: LineTeam[];
  match?: MatchRecord;
  initial?: { homeLineId: string; awayLineId: string; homeGoals: number; awayGoals: number };
  /** Já começa com estas duas linhas escolhidas (ex.: jogo de desempate). */
  preset?: { homeLineId: string; awayLineId: string };
  onClose: () => void;
}> = ({ pelada, lines, match, initial, preset, onClose }) => {
  const { snapshot, runAction, busyAction } = useBaba();
  // Partida ao vivo salva neste aparelho (retoma de onde parou)
  const [saved] = useState(() => (match || initial ? null : loadLive(pelada.id)));
  const idRef = useRef(match?.id ?? saved?.matchId ?? newId('m')); // ID estável: reenvio não duplica o jogo
  const [step, setStep] = useState<Step>(
    match || initial ? 'authors' : saved ? (saved.finished ? 'authors' : 'live') : 'setup'
  );
  const [live, setLive] = useState<LiveMatchState | null>(saved);
  const [durationMin, setDurationMin] = useState(() => saved?.durationMin ?? loadDuration());
  const [now, setNow] = useState(() => Date.now());
  const [homeLineId, setHomeLineId] = useState(
    match?.homeLineId ?? initial?.homeLineId ?? saved?.homeLineId ?? preset?.homeLineId ?? lines[0]?.id ?? ''
  );
  const [awayLineId, setAwayLineId] = useState(
    match?.awayLineId ?? initial?.awayLineId ?? saved?.awayLineId ?? preset?.awayLineId ?? lines[1]?.id ?? ''
  );
  const [homeGoals, setHomeGoals] = useState(match?.homeGoals ?? initial?.homeGoals ?? saved?.homeGoals ?? 0);
  const [awayGoals, setAwayGoals] = useState(match?.awayGoals ?? initial?.awayGoals ?? saved?.awayGoals ?? 0);
  const [homeScorers, setHomeScorers] = useState<Counts>(toCounts(match?.homeScorers ?? []));
  const [awayScorers, setAwayScorers] = useState<Counts>(toCounts(match?.awayScorers ?? []));
  const [homeAssists, setHomeAssists] = useState<Counts>(toCounts(match?.homeAssists ?? []));
  const [awayAssists, setAwayAssists] = useState<Counts>(toCounts(match?.awayAssists ?? []));

  const playerById = useMemo(() => new Map((snapshot?.players ?? []).map((p) => [p.id, p])), [snapshot]);
  const lineById = new Map(lines.map((l) => [l.id, l]));

  const rosterOf = (lineId: string): Player[] => {
    // Edição: mantém a escalação do jogo; novo jogo: escalação atual da linha
    const ids =
      match && match.homeLineId === lineId && match.homePlayerIds.length
        ? match.homePlayerIds
        : match && match.awayLineId === lineId && match.awayPlayerIds.length
        ? match.awayPlayerIds
        : pelada.lineRosters[lineId] || [];
    return ids.map((id) => playerById.get(id)).filter((p): p is Player => Boolean(p));
  };

  const changeSideLine = (side: 'home' | 'away', lineId: string) => {
    if (side === 'home') {
      setHomeLineId(lineId);
      setHomeScorers({});
      setHomeAssists({});
      if (lineId === awayLineId) setAwayLineId(lines.find((l) => l.id !== lineId)?.id ?? '');
    } else {
      setAwayLineId(lineId);
      setAwayScorers({});
      setAwayAssists({});
      if (lineId === homeLineId) setHomeLineId(lines.find((l) => l.id !== lineId)?.id ?? '');
    }
  };

  const recentDuplicate = useMemo(() => {
    if (match || !snapshot) return false;
    const last = snapshot.matches
      .filter((m) => m.peladaId === pelada.id)
      .sort((a, b) => b.orderIndex - a.orderIndex)[0];
    if (!last) return false;
    const sameTeams =
      (last.homeLineId === homeLineId && last.awayLineId === awayLineId && last.homeGoals === homeGoals && last.awayGoals === awayGoals) ||
      (last.homeLineId === awayLineId && last.awayLineId === homeLineId && last.homeGoals === awayGoals && last.awayGoals === homeGoals);
    return sameTeams && Date.now() - new Date(last.createdAt).getTime() < 10 * 60 * 1000;
  }, [match, snapshot, pelada.id, homeLineId, awayLineId, homeGoals, awayGoals]);

  const submit = async () => {
    if (recentDuplicate && !window.confirm('Este placar é igual ao último jogo registrado há poucos minutos. Registrar mesmo assim?')) {
      return;
    }
    const input: MatchInput = {
      peladaId: pelada.id,
      homeLineId,
      awayLineId,
      homeGoals,
      awayGoals,
      homeScorers: toEntries(homeScorers),
      awayScorers: toEntries(awayScorers),
      homeAssists: toEntries(homeAssists),
      awayAssists: toEntries(awayAssists),
      durationSec: live ? Math.round(elapsedOf(live) / 1000) : undefined,
    };
    const res = await runAction(
      () => (match ? babaService.updateMatch(match.id, input) : babaService.createMatch(idRef.current, input)),
      match ? 'Resultado corrigido!' : 'Jogo registrado!'
    );
    if (res) {
      if (!match) clearLive(pelada.id);
      onClose();
    }
  };

  // ------------------------------------------------------------------ AO VIVO
  const persist = (next: LiveMatchState | null) => {
    setLive(next);
    if (next) saveLive(pelada.id, next);
    else clearLive(pelada.id);
  };

  const startLive = () => {
    primeAudio();
    endedRef.current = false;
    saveDuration(durationMin);
    setHomeGoals(0);
    setAwayGoals(0);
    persist({
      matchId: idRef.current,
      homeLineId,
      awayLineId,
      homeGoals: 0,
      awayGoals: 0,
      durationMin,
      runningSince: Date.now(),
      elapsedMs: 0,
      finished: false,
    });
    setNow(Date.now());
    setStep('live');
  };

  // Evita encerrar duas vezes (o relógio roda a cada 250 ms)
  const endedRef = useRef(false);

  const finishLive = (state: LiveMatchState, reason: EndReason) => {
    if (endedRef.current) return;
    endedRef.current = true;
    const done: LiveMatchState = {
      ...state,
      elapsedMs: elapsedOf(state),
      runningSince: null,
      finished: true,
      endReason: reason,
    };
    persist(done);
    setHomeGoals(done.homeGoals);
    setAwayGoals(done.awayGoals);
    if (reason !== 'manual') signalEnd();
    setStep('authors');
  };

  const togglePause = () => {
    if (!live) return;
    primeAudio();
    persist(
      live.runningSince
        ? { ...live, elapsedMs: elapsedOf(live), runningSince: null }
        : { ...live, runningSince: Date.now() }
    );
  };

  const liveGoal = (side: 'home' | 'away', delta: 1 | -1) => {
    if (!live) return;
    const field = side === 'home' ? 'homeGoals' : 'awayGoals';
    const value = Math.max(0, live[field] + delta);
    const next = { ...live, [field]: value };
    if (side === 'home') setHomeGoals(value);
    else setAwayGoals(value);
    if (delta > 0 && value >= GOALS_TO_WIN) finishLive(next, 'goals');
    else persist(next);
  };

  const resumeLive = () => {
    if (!live) return;
    primeAudio();
    endedRef.current = false;
    persist({ ...live, homeGoals, awayGoals, finished: false, endReason: undefined, runningSince: Date.now() });
    setStep('live');
  };

  const cancelLive = () => {
    if (!window.confirm('Cancelar esta partida? O cronômetro e o placar serão descartados.')) return;
    persist(null);
    setHomeGoals(0);
    setAwayGoals(0);
    setStep('setup');
  };

  // Relógio da tela + fim automático pelo tempo
  useEffect(() => {
    if (step !== 'live' || !live?.runningSince) return;
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (elapsedOf(live, t) >= live.durationMin * 60_000) finishLive(live, 'time');
    }, 250);
    return () => clearInterval(id);
  }, [step, live]); // eslint-disable-line react-hooks/exhaustive-deps

  // Mantém a tela do celular acesa durante a partida
  useEffect(() => {
    if (step !== 'live') return;
    let lock: any = null;
    let cancelled = false;
    (navigator as any).wakeLock
      ?.request?.('screen')
      .then((l: any) => {
        if (cancelled) l.release?.();
        else lock = l;
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      lock?.release?.().catch?.(() => undefined);
    };
  }, [step]);

  /** Bloco de autores de um lado (chamado como função para não remontar a cada toque). */
  const Side = ({ side, lineId, goals, scorers, setScorers, assists, setAssists }: {
    side: 'home' | 'away';
    lineId: string;
    goals: number;
    scorers: Counts;
    setScorers: (c: Counts) => void;
    assists: Counts;
    setAssists: (c: Counts) => void;
  }) => {
    const line = lineById.get(lineId);
    const roster = rosterOf(lineId);
    const scored = total(scorers);
    const assisted = total(assists);
    const missing = goals - scored;
    return (
      <div key={side} className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: line?.colorHex }} />
            <span className="text-sm font-extrabold text-white truncate">{line?.name}</span>
            <span className="font-display font-extrabold text-lime-400">{goals}</span>
          </div>
          <span className={`text-[11px] font-bold ${missing > 0 ? 'text-amber-300' : 'text-slate-500'}`}>
            {missing > 0 ? `${missing} gol(s) sem autor` : goals > 0 ? 'Todos os gols com autor' : 'Sem gols'}
          </span>
        </div>
        {goals === 0 ? null : roster.length === 0 ? (
          <div className="text-xs text-slate-500 px-3 py-2 rounded-xl bg-[#1B1F1B]">
            Esta linha não tem jogadores escalados. Defina os times para registrar autores.
          </div>
        ) : (
          <div className="rounded-2xl bg-[#1B1F1B] border border-white/5 divide-y divide-white/5">
            <div className="grid grid-cols-[1fr_auto_auto] gap-3 px-3 py-1.5 text-[10px] font-bold text-slate-500">
              <span>Jogador</span>
              <span className="w-[86px] text-center">Gols</span>
              <span className="w-[86px] text-center">Assist.</span>
            </div>
            {roster.map((p) => (
              <div key={p.id} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 px-3 py-1.5">
                <div className="flex items-center gap-2 min-w-0">
                  <PlayerAvatar player={p} size={22} />
                  <span className="text-xs text-white truncate">{playerLabel(p)}</span>
                </div>
                <Stepper
                  label={`gols de ${playerLabel(p)}`}
                  value={scorers[p.id] || 0}
                  max={(scorers[p.id] || 0) + Math.max(0, missing)}
                  onChange={(v) => {
                    const next = { ...scorers, [p.id]: v };
                    setScorers(next);
                    if (total(assists) > total(next)) setAssists(trimTo(assists, total(next)));
                  }}
                />
                <Stepper
                  label={`assistências de ${playerLabel(p)}`}
                  tone="sky"
                  value={assists[p.id] || 0}
                  max={(assists[p.id] || 0) + Math.max(0, scored - assisted)}
                  onChange={(v) => setAssists({ ...assists, [p.id]: v })}
                />
              </div>
            ))}
          </div>
        )}
        {side === 'home' && <div className="h-1" />}
      </div>
    );
  };

  const home = lineById.get(homeLineId);
  const away = lineById.get(awayLineId);

  return (
    <Modal
      title={match ? `Corrigir jogo #${match.orderIndex}` : step === 'live' ? 'Partida ao vivo' : step === 'authors' ? 'Resultado do jogo' : 'Registrar jogo'}
      onClose={onClose}
      wide
    >
      <div className="p-4 sm:p-5 space-y-4">
        {step === 'live' && live ? (
          (() => {
            const elapsed = elapsedOf(live, now);
            const limit = live.durationMin * 60_000;
            const remaining = Math.max(0, limit - elapsed);
            const running = Boolean(live.runningSince);
            return (
              <div className="space-y-4">
                {/* Cronômetro */}
                <div className="text-center space-y-1.5">
                  <div
                    className={`font-display font-bold tabular-nums leading-none text-7xl ${running ? 'text-white' : 'text-slate-500'}`}
                    aria-live="off"
                  >
                    {formatClock(elapsed)}
                  </div>
                  <div className="text-xs text-slate-400">
                    {running ? 'Rolando' : 'Pausado'} · faltam <strong className="text-slate-200 tabular-nums">{formatClock(remaining)}</strong> ·
                    acaba em {live.durationMin} min ou {GOALS_TO_WIN} gols
                  </div>
                  <div className="h-1.5 rounded-full bg-white/10 overflow-hidden" aria-hidden>
                    <div className="h-full bg-lime-400 transition-[width] duration-300" style={{ width: `${Math.min(100, (elapsed / limit) * 100)}%` }} />
                  </div>
                </div>

                {/* Placar ao vivo: toque em "+ Gol" */}
                <div className="grid grid-cols-2 gap-2.5">
                  {(['home', 'away'] as const).map((side) => {
                    const line = lineById.get(side === 'home' ? live.homeLineId : live.awayLineId);
                    const goals = side === 'home' ? live.homeGoals : live.awayGoals;
                    return (
                      <div key={side} className="rounded-xl border bg-[#131613] p-3 space-y-3 text-center" style={{ borderColor: `${line?.colorHex ?? '#ffffff'}66` }}>
                        <div className="flex items-center justify-center gap-1.5 min-w-0">
                          <span className="w-3 h-3 rounded-sm border border-white/25 shrink-0" style={{ backgroundColor: line?.colorHex }} />
                          <span className="text-sm font-bold text-white truncate">{line?.name.replace(/^linha\s+/i, '')}</span>
                        </div>
                        <div className="font-display font-bold text-6xl text-white leading-none tabular-nums">{goals}</div>
                        <div className="flex gap-1.5">
                          <button
                            type="button"
                            onClick={() => liveGoal(side, -1)}
                            disabled={goals === 0}
                            aria-label={`Tirar gol da ${line?.name}`}
                            className="w-11 py-3 rounded-lg border border-white/15 text-slate-300 flex items-center justify-center cursor-pointer disabled:opacity-30"
                          >
                            <Minus className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => liveGoal(side, 1)}
                            className="flex-1 py-3 rounded-lg bg-lime-400 hover:bg-lime-300 active:scale-95 text-slate-950 text-sm font-bold flex items-center justify-center gap-1 cursor-pointer transition"
                          >
                            <Plus className="w-4 h-4" strokeWidth={2.6} /> Gol
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={togglePause}
                    className="flex-1 inline-flex items-center justify-center gap-2 py-3 rounded-lg border border-white/15 text-slate-100 text-sm font-semibold hover:bg-white/[0.06] cursor-pointer"
                  >
                    {running ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />} {running ? 'Pausar' : 'Continuar'}
                  </button>
                  <button
                    type="button"
                    onClick={() => finishLive(live, 'manual')}
                    className="flex-1 inline-flex items-center justify-center gap-2 py-3 rounded-lg bg-white text-slate-950 text-sm font-bold hover:bg-slate-200 cursor-pointer"
                  >
                    <Flag className="w-4 h-4" /> Encerrar partida
                  </button>
                </div>
                <button type="button" onClick={cancelLive} className="w-full text-xs text-slate-500 hover:text-rose-300 underline underline-offset-4 cursor-pointer">
                  Cancelar partida
                </button>
              </div>
            );
          })()
        ) : (
        <>
        {step === 'authors' && live?.finished && !match && (
          <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-white/[0.04] border border-white/10 text-xs text-slate-300">
            <span className="inline-flex items-center gap-1.5">
              <Timer className="w-3.5 h-3.5 text-lime-400" />
              {live.endReason ? END_TEXT[live.endReason] : 'Partida encerrada'} · {formatClock(elapsedOf(live))}
            </span>
            <button type="button" onClick={resumeLive} className="inline-flex items-center gap-1 font-semibold text-lime-300 cursor-pointer">
              <RotateCcw className="w-3.5 h-3.5" /> Voltar ao jogo
            </button>
          </div>
        )}
        {step === 'authors' && (
          <div className="rounded-xl border border-white/10 bg-[#131613] px-4 py-3.5 text-center">
            <div className="flex items-center justify-center gap-3">
              <span className={`text-sm truncate ${homeGoals > awayGoals ? 'font-bold text-white' : 'text-slate-300'}`}>
                {home?.name.replace(/^linha\s+/i, '')}
              </span>
              <span className="font-display font-bold text-4xl text-white tabular-nums leading-none">
                {homeGoals}
                <span className="text-slate-500 mx-1.5">x</span>
                {awayGoals}
              </span>
              <span className={`text-sm truncate ${awayGoals > homeGoals ? 'font-bold text-white' : 'text-slate-300'}`}>
                {away?.name.replace(/^linha\s+/i, '')}
              </span>
            </div>
            <div className={`mt-1.5 text-sm font-bold ${homeGoals === awayGoals ? 'text-yellow-300' : 'text-lime-400'}`}>
              {homeGoals > awayGoals
                ? `${home?.name} venceu por ${homeGoals - awayGoals} ${homeGoals - awayGoals === 1 ? 'gol' : 'gols'} de diferença`
                : homeGoals < awayGoals
                ? `${away?.name} venceu por ${awayGoals - homeGoals} ${awayGoals - homeGoals === 1 ? 'gol' : 'gols'} de diferença`
                : 'Empate'}
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">Agora marque quem fez os gols e as assistências</div>
          </div>
        )}
        {/* LINHAS E PLACAR */}
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          {(['home', 'away'] as const).map((side, idx) => {
            const lineId = side === 'home' ? homeLineId : awayLineId;
            const goals = side === 'home' ? homeGoals : awayGoals;
            const setGoals = side === 'home' ? setHomeGoals : setAwayGoals;
            const block = (
              <div key={side} className="p-2.5 rounded-2xl bg-[#1B1F1B] border border-white/10 space-y-2">
                <select
                  value={lineId}
                  onChange={(e) => changeSideLine(side, e.target.value)}
                  className="w-full bg-transparent text-sm font-bold text-white focus:outline-none cursor-pointer"
                  aria-label={side === 'home' ? 'Linha mandante' : 'Linha adversária'}
                >
                  {lines.map((l) => (
                    <option key={l.id} value={l.id} className="bg-[#131613]">
                      {l.name}
                    </option>
                  ))}
                </select>
                {step !== 'setup' && <div className="flex items-center justify-center">
                  <Stepper label="placar" value={goals} max={50} onChange={(v) => {
                    setGoals(v);
                    // Ajusta autores se o placar diminuir
                    const sc = side === 'home' ? homeScorers : awayScorers;
                    if (total(sc) > v) {
                      side === 'home' ? setHomeScorers({}) : setAwayScorers({});
                      side === 'home' ? setHomeAssists({}) : setAwayAssists({});
                    }
                  }} />
                </div>}
              </div>
            );
            return idx === 0 ? (
              <React.Fragment key={side}>
                {block}
                <div className="text-center text-xs font-black text-slate-500">×</div>
              </React.Fragment>
            ) : (
              block
            );
          })}
        </div>

        {step === 'setup' ? (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <div className="text-xs font-semibold text-slate-300">
                Tempo da partida <span className="font-normal text-slate-500">(ou até {GOALS_TO_WIN} gols)</span>
              </div>
              <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Tempo da partida">
                {DURATION_OPTIONS.map((m) => (
                  <button
                    key={m}
                    type="button"
                    role="radio"
                    aria-checked={durationMin === m}
                    onClick={() => setDurationMin(m)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition ${
                      durationMin === m ? 'bg-lime-400 text-slate-950' : 'border border-white/10 text-slate-300 hover:text-white'
                    }`}
                  >
                    {m} min
                  </button>
                ))}
              </div>
            </div>
            <button
              type="button"
              disabled={!homeLineId || !awayLineId || homeLineId === awayLineId}
              onClick={startLive}
              className={`${primaryBtn} w-full !py-3.5 !text-base`}
            >
              <Play className="w-5 h-5" /> Iniciar partida
            </button>
            <button
              type="button"
              disabled={!homeLineId || !awayLineId || homeLineId === awayLineId}
              onClick={() => setStep('authors')}
              className="w-full text-xs text-slate-400 hover:text-white underline underline-offset-4 cursor-pointer disabled:opacity-40"
            >
              Jogo já acabou? Registrar sem cronômetro
            </button>
          </div>
        ) : (
          <>
            {/* ETAPA 2: AUTORES */}
            <div className="space-y-4">
              {Side({ side: 'home', lineId: homeLineId, goals: homeGoals, scorers: homeScorers, setScorers: setHomeScorers, assists: homeAssists, setAssists: setHomeAssists })}
              {Side({ side: 'away', lineId: awayLineId, goals: awayGoals, scorers: awayScorers, setScorers: setAwayScorers, assists: awayAssists, setAssists: setAwayAssists })}
            </div>

            <p className="text-[11px] text-slate-500 text-center">
              Gols sem autor contam no placar, mas não para nenhum jogador.
            </p>

            <button type="button" disabled={busyAction} onClick={submit} className={`${primaryBtn} w-full`}>
              {busyAction ? 'Salvando...' : match ? 'Salvar correção' : 'Confirmar resultado'}
            </button>
          </>
        )}
        </>
        )}
      </div>
    </Modal>
  );
};
