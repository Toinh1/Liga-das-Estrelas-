import React, { useMemo, useState } from 'react';
import { Edit3, Flame, HandHelping, PlusCircle, Swords, Trash2 } from 'lucide-react';
import { useBaba } from '../../context/BabaContext';
import { babaService } from '../../services/babaService';
import type { LineTeam, MatchRecord, MatchScorerEntry, Pelada } from '../../types/domain';
import { computePeladaStandings } from '../../utils/statsEngine';
import { StandingsTable } from '../StandingsTable';
import { InfoChip, ScoreBox, SessionCard, cardClass, playerLabel, primaryBtn } from '../ui';
import { MatchEditorModal } from './MatchEditorModal';

export const MatchesPanel: React.FC<{ pelada: Pelada }> = ({ pelada }) => {
  const { snapshot, isAdmin, runAction, busyAction } = useBaba();
  const [editor, setEditor] = useState<{ match?: MatchRecord } | null>(null);

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

  const scorerText = (entries: MatchScorerEntry[], assists: MatchScorerEntry[]) => {
    const parts = entries.map((e) => `${playerLabel(playerMap.get(e.playerId))}${e.count > 1 ? ` ${e.count}` : ''}`);
    const ast = assists.map((a) => `${playerLabel(playerMap.get(a.playerId))}${a.count > 1 ? ` ${a.count}` : ''}`);
    return { goals: parts.join(', '), assists: ast.join(', ') };
  };

  return (
    <div className="space-y-5">
      {canEdit && lines.length >= 2 && (
        <button onClick={() => setEditor({})} disabled={busyAction} className={`${primaryBtn} w-full !py-3`}>
          <PlusCircle className="w-4 h-4" /> Registrar novo jogo
        </button>
      )}

      <StandingsTable rows={standings} finished={isFinished} title="Classificação da pelada" />

      <section className="space-y-2.5">
        <h2 className="text-xs font-bold text-slate-500 px-1">Jogos ({roundMatches.length})</h2>
        {roundMatches.length === 0 ? (
          <div className={`${cardClass} !rounded-2xl p-8 text-center text-xs text-slate-500`}>Nenhum jogo registrado ainda.</div>
        ) : (
          roundMatches.map((m) => {
            const home = lineMap.get(m.homeLineId);
            const away = lineMap.get(m.awayLineId);
            const hs = scorerText(m.homeScorers, m.homeAssists);
            const as = scorerText(m.awayScorers, m.awayAssists);
            const time = new Date(m.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
            const result =
              m.homeGoals === m.awayGoals ? 'Empate' : `Vitória ${(m.homeGoals > m.awayGoals ? home : away)?.name ?? ''}`;
            return (
              <SessionCard
                key={m.id}
                icon={Swords}
                tone={m.homeGoals === m.awayGoals ? 'yellow' : 'lime'}
                title={
                  <span className="inline-flex items-center gap-1.5 min-w-0">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: home?.colorHex }} />
                    <span className="truncate">{home ? home.name.replace(/^linha\s+/i, '') : 'Linha removida'}</span>
                    <span className="text-slate-500 font-normal">x</span>
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: away?.colorHex }} />
                    <span className="truncate">{away ? away.name.replace(/^linha\s+/i, '') : 'Linha removida'}</span>
                  </span>
                }
                subtitle={`Jogo #${m.orderIndex} • ${time} • ${result}`}
                right={<ScoreBox home={m.homeGoals} away={m.awayGoals} />}
                chips={
                  <>
                    {hs.goals && <InfoChip icon={Flame}>{hs.goals}</InfoChip>}
                    {as.goals && <InfoChip icon={Flame}>{as.goals}</InfoChip>}
                    {(hs.assists || as.assists) && (
                      <InfoChip icon={HandHelping}>{[hs.assists, as.assists].filter(Boolean).join(', ')}</InfoChip>
                    )}
                    {!hs.goals && !as.goals && m.homeGoals + m.awayGoals > 0 && <InfoChip>Autores não informados</InfoChip>}
                  </>
                }
                actions={
                  canEdit && (
                    <>
                      <button
                        onClick={() => setEditor({ match: m })}
                        title="Corrigir resultado"
                        aria-label="Corrigir resultado"
                        className="w-7 h-7 rounded-full bg-white/[0.06] flex items-center justify-center text-slate-400 hover:text-lime-400 transition cursor-pointer"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        disabled={busyAction}
                        onClick={() =>
                          window.confirm(`Excluir o jogo #${m.orderIndex}? As estatísticas serão recalculadas.`) &&
                          runAction(() => babaService.deleteMatch(m.id), 'Jogo removido')
                        }
                        title="Excluir jogo"
                        aria-label="Excluir jogo"
                        className="w-7 h-7 rounded-full bg-white/[0.06] flex items-center justify-center text-slate-400 hover:text-rose-400 transition cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )
                }
              />
            );
          })
        )}
      </section>

      {editor && (
        <MatchEditorModal
          pelada={pelada}
          lines={editor.match ? allLines : lines}
          match={editor.match}
          onClose={() => setEditor(null)}
        />
      )}
    </div>
  );
};
