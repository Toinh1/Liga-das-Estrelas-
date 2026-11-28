import React, { useEffect, useMemo, useState } from 'react';
import { Edit3, Flag, Plus, Swords, Timer, Trash2, X } from 'lucide-react';
import { useBaba } from '../../context/BabaContext';
import { babaService } from '../../services/babaService';
import type { LineTeam, MatchRecord, MatchScorerEntry, Pelada } from '../../types/domain';
import { computePeladaStandings, findTopTie } from '../../utils/statsEngine';
import { StandingsTable } from '../StandingsTable';
import { playerLabel } from '../ui';
import { MatchEditorModal } from './MatchEditorModal';
import { elapsedOf, formatClock, loadLive, type LiveMatchState } from './liveMatch';

/** Relógio da partida em andamento (atualiza a cada segundo). */
const LiveClock: React.FC<{ live: LiveMatchState }> = ({ live }) => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!live.runningSince) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [live.runningSince]);
  return <span className="tabular-nums">{formatClock(elapsedOf(live, now))}</span>;
};

const shortLine = (l?: LineTeam) => (l ? l.name.replace(/^linha\s+/i, '') : 'Linha removida');

export const MatchesPanel: React.FC<{ pelada: Pelada; onClosePelada?: () => void }> = ({ pelada, onClosePelada }) => {
  const { snapshot, isAdmin, runAction, busyAction } = useBaba();
  const [editor, setEditor] = useState<{ match?: MatchRecord; preset?: { homeLineId: string; awayLineId: string } } | null>(null);
  const [tieOpen, setTieOpen] = useState(false);

  const lines = useMemo(() => {
    if (!snapshot) return [] as LineTeam[];
    const byId = new Map(snapshot.lines.map((l) => [l.id, l]));
    return pelada.participatingLineIds.map((id) => byId.get(id)).filter((l): l is LineTeam => Boolean(l));
  }, [snapshot, pelada.participatingLineIds]);

  if (!snapshot) return null;

  const isFinished = pelada.status === 'finished';
  const canEdit = isAdmin && !isFinished;
  const standings = computePeladaStandings(pelada, snapshot.lines, snapshot.matches);
  const roundMatches = snapshot.matches
    .filter((m) => m.peladaId === pelada.id)
    .sort((a, b) => b.orderIndex - a.orderIndex);
  const lineMap = new Map(snapshot.lines.map((l) => [l.id, l]));
  const playerMap = new Map(snapshot.players.map((p) => [p.id, p]));
  const allLines = [...lines, ...snapshot.lines.filter((l) => !lines.includes(l))];

  // Empate em tudo no 1º lugar: não encerra sem jogo de desempate
  const tie = canEdit ? findTopTie(standings) : [];
  const tieLabel = tie.map((t) => shortLine(lineMap.get(t.lineId))).join(' × ');

  // Partida com cronômetro em andamento neste aparelho (sobrevive a fechar a janela)
  const live = canEdit && !editor ? loadLive(pelada.id) : null;

  const names = (entries: MatchScorerEntry[]) =>
    entries.map((e) => `${playerLabel(playerMap.get(e.playerId))}${e.count > 1 ? ` (${e.count})` : ''}`).join(', ');

  return (
    <div className="space-y-6">
      {/* 1. CLASSIFICAÇÃO */}
      <StandingsTable rows={standings} finished={isFinished} title="Classificação da pelada" />

      {/* 2. JOGOS */}
      <section className="space-y-2.5">
        <h2 className="font-display font-bold uppercase text-lg text-white leading-none">
          Jogos <span className="text-slate-500">({roundMatches.length})</span>
        </h2>
        {roundMatches.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/10 px-4 py-8 text-center text-sm text-slate-400">
            Nenhum jogo registrado ainda.
            {canEdit && ' Toque em "Registrar jogo" lá embaixo para começar.'}
          </div>
        ) : (
          <ul className="rounded-xl bg-[#131613] border border-white/[0.08] divide-y divide-white/[0.06]">
            {roundMatches.map((m) => {
              const home = lineMap.get(m.homeLineId);
              const away = lineMap.get(m.awayLineId);
              const goals = [names(m.homeScorers), names(m.awayScorers)].filter(Boolean).join(' · ');
              const assists = [names(m.homeAssists), names(m.awayAssists)].filter(Boolean).join(' · ');
              const homeWon = m.homeGoals > m.awayGoals;
              const awayWon = m.awayGoals > m.homeGoals;
              return (
                <li key={m.id} className="px-3.5 py-3 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="w-7 shrink-0 text-[11px] font-semibold text-slate-500 tabular-nums">#{m.orderIndex}</span>
                    {/* Placar: casa  2 x 1  fora */}
                    <div className="flex-1 min-w-0 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                      <span className={`flex items-center justify-end gap-1.5 min-w-0 text-sm ${homeWon ? 'font-bold text-white' : 'font-medium text-slate-300'}`}>
                        <span className="truncate">{shortLine(home)}</span>
                        <span className="w-2.5 h-2.5 rounded-sm shrink-0 border border-white/20" style={{ backgroundColor: home?.colorHex }} />
                      </span>
                      <span className="font-display font-bold text-xl text-white tabular-nums px-1">
                        {m.homeGoals}
                        <span className="text-slate-500 mx-1">x</span>
                        {m.awayGoals}
                      </span>
                      <span className={`flex items-center gap-1.5 min-w-0 text-sm ${awayWon ? 'font-bold text-white' : 'font-medium text-slate-300'}`}>
                        <span className="w-2.5 h-2.5 rounded-sm shrink-0 border border-white/20" style={{ backgroundColor: away?.colorHex }} />
                        <span className="truncate">{shortLine(away)}</span>
                      </span>
                    </div>
                    {canEdit && (
                      <div className="flex items-center shrink-0">
                        <button
                          onClick={() => setEditor({ match: m })}
                          title="Corrigir resultado"
                          aria-label={`Corrigir o jogo ${m.orderIndex}`}
                          className="p-2 rounded-lg text-slate-500 hover:text-white hover:bg-white/[0.06] transition cursor-pointer"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          disabled={busyAction}
                          onClick={() =>
                            window.confirm(`Excluir o jogo #${m.orderIndex}? As estatísticas serão recalculadas.`) &&
                            runAction(() => babaService.deleteMatch(m.id), 'Jogo removido')
                          }
                          title="Excluir jogo"
                          aria-label={`Excluir o jogo ${m.orderIndex}`}
                          className="p-2 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-white/[0.06] transition cursor-pointer disabled:opacity-40"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>
                  {(goals || assists || m.homeGoals + m.awayGoals > 0 || m.durationSec) && (
                    <div className="pl-9 text-xs text-slate-400 space-y-0.5">
                      {m.durationSec ? (
                        <p className="inline-flex items-center gap-1 text-slate-500">
                          <Timer className="w-3 h-3" /> {formatClock(m.durationSec * 1000)} de jogo
                        </p>
                      ) : null}
                      {m.homeGoals + m.awayGoals === 0 ? null : goals ? (
                        <p>
                          <span className="text-slate-500">Gols:</span> {goals}
                        </p>
                      ) : (
                        <p className="text-slate-500">Autores dos gols não informados</p>
                      )}
                      {assists && (
                        <p>
                          <span className="text-slate-500">Assist.:</span> {assists}
                        </p>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* 3. AÇÕES DO ADMIN: fixas no rodapé, ao alcance do polegar */}
      {canEdit && lines.length >= 2 && (
        <div className="sticky bottom-[calc(4.75rem+env(safe-area-inset-bottom,0px))] lg:bottom-4 z-10">
          {tieOpen && tie.length > 0 && (
            <div className="mb-2 p-3.5 rounded-xl bg-[#1A1708] border border-yellow-400/40 shadow-[0_8px_24px_-8px_rgba(0,0,0,0.8)] animate-fade-in">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-display font-bold uppercase text-lg text-yellow-300 leading-tight">Empate no 1º lugar</div>
                  <p className="mt-1 text-sm text-slate-200 leading-snug">
                    <strong>{tieLabel}</strong> estão iguais em tudo ({tie[0].points} pts, {tie[0].wins} V, saldo{' '}
                    {tie[0].goalDifference > 0 ? '+' : ''}
                    {tie[0].goalDifference}, {tie[0].goalsFor} gols). Faça um jogo de desempate para decidir a campeã.
                  </p>
                </div>
                <button
                  onClick={() => setTieOpen(false)}
                  className="p-1 -mr-1 rounded-lg text-slate-400 hover:text-white cursor-pointer shrink-0"
                  aria-label="Fechar aviso de empate"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              {!live && (
                <button
                  onClick={() => {
                    setTieOpen(false);
                    setEditor({ preset: { homeLineId: tie[0].lineId, awayLineId: tie[1].lineId } });
                  }}
                  className="mt-3 w-full inline-flex items-center justify-center gap-2 py-3 rounded-lg bg-yellow-300 hover:bg-yellow-200 text-slate-950 text-sm font-bold cursor-pointer"
                >
                  <Swords className="w-4 h-4" /> Jogo de desempate: {shortLine(lineMap.get(tie[0].lineId))} × {shortLine(lineMap.get(tie[1].lineId))}
                </button>
              )}
            </div>
          )}
          <div className="flex gap-2 p-2 rounded-xl bg-[#0E110E]/95 border border-white/10 shadow-[0_8px_24px_-8px_rgba(0,0,0,0.8)] backdrop-blur">
            {live ? (
              <button
                onClick={() => setEditor({})}
                className="flex-1 inline-flex items-center justify-center gap-2 py-3 rounded-lg bg-white text-slate-950 text-sm font-bold transition cursor-pointer"
              >
                <Timer className="w-4 h-4" />
                {live.finished ? 'Finalizar resultado' : 'Partida em andamento'} · <LiveClock live={live} />
              </button>
            ) : (
              <button
                onClick={() => setEditor({})}
                disabled={busyAction}
                className="flex-1 inline-flex items-center justify-center gap-2 py-3 rounded-lg bg-lime-400 hover:bg-lime-300 text-slate-950 text-sm font-bold transition cursor-pointer disabled:opacity-50"
              >
                <Plus className="w-4 h-4" strokeWidth={2.6} /> Registrar jogo
              </button>
            )}
            {onClosePelada && (
              <button
                onClick={() => (tie.length ? setTieOpen(true) : onClosePelada())}
                disabled={busyAction || roundMatches.length === 0}
                title={roundMatches.length === 0 ? 'Registre pelo menos um jogo antes de encerrar' : 'Encerrar o Baba'}
                className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-lg border border-lime-400/50 text-lime-300 hover:bg-lime-400/10 text-sm font-bold transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Flag className="w-4 h-4" /> Encerrar o Baba
              </button>
            )}
          </div>
        </div>
      )}

      {editor && (
        <MatchEditorModal
          pelada={pelada}
          lines={editor.match ? allLines : lines}
          match={editor.match}
          preset={editor.preset}
          onClose={() => setEditor(null)}
        />
      )}
    </div>
  );
};
