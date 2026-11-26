import React, { useMemo, useRef, useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import { useBaba } from '../../context/BabaContext';
import { babaService, newId, type MatchInput } from '../../services/babaService';
import type { LineTeam, MatchRecord, MatchScorerEntry, Pelada, Player } from '../../types/domain';
import { Modal, PlayerAvatar, playerLabel, primaryBtn } from '../ui';

type Counts = Record<string, number>;

const toCounts = (entries: MatchScorerEntry[]): Counts =>
  Object.fromEntries(entries.map((e) => [e.playerId, e.count]));
const toEntries = (c: Counts): MatchScorerEntry[] =>
  Object.entries(c)
    .filter(([, n]) => n > 0)
    .map(([playerId, count]) => ({ playerId, count }));
const total = (c: Counts) => Object.values(c).reduce((a, b) => a + b, 0);

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

/**
 * Registro / correção de jogo em duas etapas:
 *  1. Linhas e placar   2. Autores dos gols e assistências.
 */
export const MatchEditorModal: React.FC<{
  pelada: Pelada;
  lines: LineTeam[];
  match?: MatchRecord;
  initial?: { homeLineId: string; awayLineId: string; homeGoals: number; awayGoals: number };
  onClose: () => void;
}> = ({ pelada, lines, match, initial, onClose }) => {
  const { snapshot, runAction, busyAction } = useBaba();
  const idRef = useRef(match?.id ?? newId('m')); // ID estável: reenvio não duplica o jogo
  const [step, setStep] = useState<1 | 2>(match || initial ? 2 : 1);
  const [homeLineId, setHomeLineId] = useState(match?.homeLineId ?? initial?.homeLineId ?? lines[0]?.id ?? '');
  const [awayLineId, setAwayLineId] = useState(match?.awayLineId ?? initial?.awayLineId ?? lines[1]?.id ?? '');
  const [homeGoals, setHomeGoals] = useState(match?.homeGoals ?? initial?.homeGoals ?? 0);
  const [awayGoals, setAwayGoals] = useState(match?.awayGoals ?? initial?.awayGoals ?? 0);
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
    };
    const res = await runAction(
      () => (match ? babaService.updateMatch(match.id, input) : babaService.createMatch(idRef.current, input)),
      match ? 'Resultado corrigido!' : 'Jogo registrado! ⚽'
    );
    if (res) onClose();
  };

  const Side: React.FC<{
    side: 'home' | 'away';
    lineId: string;
    goals: number;
    scorers: Counts;
    setScorers: (c: Counts) => void;
    assists: Counts;
    setAssists: (c: Counts) => void;
  }> = ({ side, lineId, goals, scorers, setScorers, assists, setAssists }) => {
    const line = lineById.get(lineId);
    const roster = rosterOf(lineId);
    const scored = total(scorers);
    const assisted = total(assists);
    const missing = goals - scored;
    return (
      <div className="space-y-2">
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
          <div className="text-xs text-slate-500 px-3 py-2 rounded-xl bg-[#1F1F1F]">
            Esta linha não tem jogadores escalados. Defina os times para registrar autores.
          </div>
        ) : (
          <div className="rounded-2xl bg-[#1F1F1F] border border-white/5 divide-y divide-white/5">
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
                  onChange={(v) => setScorers({ ...scorers, [p.id]: v })}
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
    <Modal title={match ? `Corrigir jogo #${match.orderIndex}` : 'Registrar jogo'} onClose={onClose} wide>
      <div className="p-4 sm:p-5 space-y-4">
        {/* ETAPA 1: PLACAR */}
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          {(['home', 'away'] as const).map((side, idx) => {
            const lineId = side === 'home' ? homeLineId : awayLineId;
            const goals = side === 'home' ? homeGoals : awayGoals;
            const setGoals = side === 'home' ? setHomeGoals : setAwayGoals;
            const block = (
              <div key={side} className="p-2.5 rounded-2xl bg-[#1F1F1F] border border-white/10 space-y-2">
                <select
                  value={lineId}
                  onChange={(e) => changeSideLine(side, e.target.value)}
                  className="w-full bg-transparent text-sm font-bold text-white focus:outline-none cursor-pointer"
                  aria-label={side === 'home' ? 'Linha mandante' : 'Linha adversária'}
                >
                  {lines.map((l) => (
                    <option key={l.id} value={l.id} className="bg-[#161616]">
                      {l.name}
                    </option>
                  ))}
                </select>
                <div className="flex items-center justify-center">
                  <Stepper label="placar" value={goals} max={50} onChange={(v) => {
                    setGoals(v);
                    // Ajusta autores se o placar diminuir
                    const sc = side === 'home' ? homeScorers : awayScorers;
                    if (total(sc) > v) {
                      side === 'home' ? setHomeScorers({}) : setAwayScorers({});
                      side === 'home' ? setHomeAssists({}) : setAwayAssists({});
                    }
                  }} />
                </div>
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

        {step === 1 ? (
          <button
            type="button"
            disabled={!homeLineId || !awayLineId || homeLineId === awayLineId}
            onClick={() => setStep(2)}
            className={`${primaryBtn} w-full`}
          >
            Continuar: quem marcou?
          </button>
        ) : (
          <>
            {/* ETAPA 2: AUTORES */}
            <div className="space-y-4">
              <Side side="home" lineId={homeLineId} goals={homeGoals} scorers={homeScorers} setScorers={setHomeScorers} assists={homeAssists} setAssists={setHomeAssists} />
              <Side side="away" lineId={awayLineId} goals={awayGoals} scorers={awayScorers} setScorers={setAwayScorers} assists={awayAssists} setAssists={setAwayAssists} />
            </div>

            <div className="p-3 rounded-2xl bg-[#1F1F1F] border border-white/5 text-center text-sm">
              <span className="font-bold text-white">{home?.name}</span>{' '}
              <span className="font-display font-extrabold text-lime-400">
                {homeGoals} × {awayGoals}
              </span>{' '}
              <span className="font-bold text-white">{away?.name}</span>
              <div className="text-[11px] text-slate-500 mt-0.5">
                {homeGoals > awayGoals ? `Vitória da ${home?.name}` : homeGoals < awayGoals ? `Vitória da ${away?.name}` : 'Empate'}
                {' • '}gols sem autor contam no placar, mas não para nenhum jogador
              </div>
            </div>

            <button type="button" disabled={busyAction} onClick={submit} className={`${primaryBtn} w-full`}>
              {busyAction ? 'Salvando...' : match ? 'Salvar correção' : 'Confirmar resultado'}
            </button>
          </>
        )}
      </div>
    </Modal>
  );
};
