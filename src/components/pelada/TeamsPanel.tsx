import React, { useMemo, useState } from 'react';
import { Check, ChevronDown, ClipboardCopy, Palette, RefreshCw, Scale, Shuffle, Trash2, X } from 'lucide-react';
import { useBaba } from '../../context/BabaContext';
import { babaService } from '../../services/babaService';
import type { LineTeam, Pelada, Player } from '../../types/domain';
import { formatShortDateBR } from '../../utils/statsEngine';
import {
  balanceTeams,
  computeBalanceIndex,
  summarizeTeams,
  type BalancePlayer,
  type TeamSummary,
} from '../../utils/teamBalancer';
import { LineBadge } from '../LineBadge';
import { EmptyState, LevelBadge, PlayerAvatar, SkillMeter, cardClass, ghostBtn, inputClass, playerLabel, primaryBtn } from '../ui';

const COLOR_PRESETS = [
  { label: 'Verde', hex: '#22C55E', text: '#0A0A0A' },
  { label: 'Amarela', hex: '#FACC15', text: '#0A0A0A' },
  { label: 'Vermelha', hex: '#EF4444', text: '#F8FAFC' },
  { label: 'Azul', hex: '#3B82F6', text: '#F8FAFC' },
  { label: 'Laranja', hex: '#F97316', text: '#0A0A0A' },
  { label: 'Branca', hex: '#F8FAFC', text: '#0A0A0A' },
  { label: 'Preta', hex: '#27272A', text: '#F8FAFC' },
  { label: 'Roxa', hex: '#A855F7', text: '#F8FAFC' },
];

/** Escolha de time só pela cor: uma bolinha por linha; a atual fica marcada. */
const LineColorPicker: React.FC<{
  lines: LineTeam[];
  current?: string;
  playerName: string;
  onPick: (lineId: string) => void;
}> = ({ lines, current, playerName, onPick }) => (
  <div className="flex items-center gap-1" role="radiogroup" aria-label={`Time de ${playerName}`}>
    {lines.map((l) => {
      const active = l.id === current;
      return (
        <button
          key={l.id}
          type="button"
          role="radio"
          aria-checked={active}
          aria-label={l.name}
          title={active ? `Está na ${l.name}` : `Mover para ${l.name}`}
          onClick={() => !active && onPick(l.id)}
          className={`w-5 h-5 rounded-full border transition shrink-0 ${
            active
              ? 'border-white ring-2 ring-lime-400 ring-offset-1 ring-offset-[#1F1F1F] cursor-default'
              : 'border-white/20 opacity-50 hover:opacity-100 hover:scale-110 cursor-pointer'
          }`}
          style={{ backgroundColor: l.colorHex }}
        />
      );
    })}
  </div>
);

export const TeamsPanel: React.FC<{ pelada: Pelada }> = ({ pelada }) => {
  const { snapshot, isAdmin, runAction, busyAction, pushToast } = useBaba();
  /** Prévia do sorteio (ainda não gravada): lineId -> playerIds */
  const [draft, setDraft] = useState<Record<string, string[]> | null>(null);
  const [colorsOpen, setColorsOpen] = useState(false);
  const [levelsOpen, setLevelsOpen] = useState<boolean | null>(null);
  const [newLineName, setNewLineName] = useState('');
  const [newLineColorIdx, setNewLineColorIdx] = useState(0);

  const lines = useMemo(() => {
    if (!snapshot) return [] as LineTeam[];
    const byId = new Map(snapshot.lines.map((l) => [l.id, l]));
    return pelada.participatingLineIds.map((id) => byId.get(id)).filter((l): l is LineTeam => Boolean(l));
  }, [snapshot, pelada.participatingLineIds]);

  const playerById = useMemo(
    () => new Map((snapshot?.players ?? []).map((p) => [p.id, p])),
    [snapshot]
  );
  const balanceById = useMemo(
    () =>
      new Map<string, BalancePlayer>(
        (snapshot?.players ?? []).map((p) => [p.id, { id: p.id, level: p.skillLevel, position: p.position }])
      ),
    [snapshot]
  );

  if (!snapshot) return null;

  const isFinished = pelada.status === 'finished';
  const canEdit = isAdmin && !isFinished;
  const hasMatches = snapshot.matches.some((m) => m.peladaId === pelada.id);
  const confirmed = pelada.confirmedPlayerIds
    .map((id) => playerById.get(id))
    .filter((p): p is Player => Boolean(p));

  const rosters = draft ?? pelada.lineRosters;
  const teamIds = lines.map((l) => rosters[l.id] || []);
  const summaries: TeamSummary[] = summarizeTeams(teamIds, balanceById);
  const balanceIndex = computeBalanceIndex(summaries.filter((s) => s.playerIds.length > 0));
  const assigned = new Set(teamIds.flat());
  const unassigned = confirmed.filter((p) => !assigned.has(p.id));

  // ----- ações -----
  const runDraw = () => {
    if (lines.length < 2) return pushToast('Selecione pelo menos 2 linhas', undefined, 'error');
    if (confirmed.length < lines.length) {
      return pushToast('Poucos confirmados', `São necessários pelo menos ${lines.length} jogadores confirmados.`, 'error');
    }
    const res = balanceTeams(
      confirmed.map((p) => ({ id: p.id, level: p.skillLevel, position: p.position })),
      lines.length
    );
    const next: Record<string, string[]> = {};
    lines.forEach((l, i) => (next[l.id] = res.teams[i].playerIds));
    setDraft(next);
  };

  const confirmDraft = async () => {
    if (!draft) return;
    if (hasMatches && !window.confirm('Já existem jogos registrados. Alterar as linhas agora muda a escalação dos próximos jogos. Continuar?')) return;
    const res = await runAction(() => babaService.saveLineRosters(pelada.id, draft), 'Times confirmados! 🎲');
    if (res) setDraft(null);
  };

  const movePlayer = async (playerId: string, targetLineId: string) => {
    const next: Record<string, string[]> = {};
    for (const l of lines) next[l.id] = (rosters[l.id] || []).filter((id) => id !== playerId);
    if (targetLineId && next[targetLineId]) next[targetLineId].push(playerId);
    if (draft) setDraft(next);
    else await runAction(() => babaService.saveLineRosters(pelada.id, next));
  };

  const setTeamCount = async (count: number) => {
    const current = pelada.participatingLineIds;
    let next = current.slice(0, count);
    if (next.length < count) {
      const extra = snapshot.lines.map((l) => l.id).filter((id) => !next.includes(id));
      next = [...next, ...extra.slice(0, count - next.length)];
    }
    if (next.length < count) return pushToast('Crie mais linhas (cores) primeiro', undefined, 'error');
    setDraft(null);
    await runAction(() => babaService.setParticipatingLines(pelada.id, next), `${count} times nesta pelada`);
  };

  const toggleLine = (lineId: string) => {
    const current = pelada.participatingLineIds;
    const next = current.includes(lineId) ? current.filter((id) => id !== lineId) : [...current, lineId];
    setDraft(null);
    runAction(() => babaService.setParticipatingLines(pelada.id, next));
  };

  const createLine = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = newLineName.trim();
    if (!clean) return;
    const preset = COLOR_PRESETS[newLineColorIdx] || COLOR_PRESETS[0];
    const fullName = /^linha\s+/i.test(clean) ? clean : `Linha ${clean}`;
    const res = await runAction(
      () =>
        babaService.createLine({
          name: fullName,
          shortName: clean.replace(/^linha\s+/i, '').slice(0, 3),
          colorHex: preset.hex,
          textColorHex: preset.text,
        }),
      `${fullName} criada!`
    );
    if (res) setNewLineName('');
  };

  const copyTeams = () => {
    const blocks = lines.map((line, i) => {
      const names = (rosters[line.id] || [])
        .map((id, idx) => {
          const p = playerById.get(id);
          return p ? `${idx + 1}. ${playerLabel(p)}${p.position === 'Goleiro' ? ' 🧤' : ''}` : null;
        })
        .filter(Boolean)
        .join('\n');
      return `*${line.name.toUpperCase()}* (${summaries[i]?.playerIds.length ?? 0})\n${names || '(vazio)'}`;
    });
    navigator.clipboard
      .writeText(`⚽ *${pelada.title} — ${formatShortDateBR(pelada.date)}*\n\n${blocks.join('\n\n')}`)
      .then(() => pushToast('Times copiados para o WhatsApp! 📋'))
      .catch(() => pushToast('Não foi possível copiar', undefined, 'error'));
  };

  return (
    <div className="space-y-4">
      {/* BARRA DE CONTROLE */}
      <div className={`${cardClass} p-4 space-y-3`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-bold text-white">
              {lines.length} times • {confirmed.length} confirmados
            </div>
            <div className="text-xs text-slate-400">
              Só confirmados entram no sorteio. Potes por nível (1 = melhor): cada time recebe um jogador de cada pote.
            </div>
          </div>
          {canEdit && (
            <div className="flex items-center gap-1 p-1 rounded-xl bg-[#1F1F1F] border border-white/10">
              {[2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  disabled={busyAction}
                  onClick={() => n !== lines.length && setTeamCount(n)}
                  className={`w-9 h-8 rounded-lg text-xs font-extrabold cursor-pointer transition ${
                    lines.length === n ? 'bg-lime-400 text-slate-950' : 'text-slate-400 hover:text-white'
                  }`}
                  title={`${n} times`}
                >
                  {n}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canEdit && !draft && (
            <button onClick={runDraw} disabled={busyAction} className={primaryBtn}>
              <Shuffle className="w-4 h-4" /> Sortear times equilibrados
            </button>
          )}
          {canEdit && draft && (
            <>
              <button onClick={confirmDraft} disabled={busyAction} className={primaryBtn}>
                <Check className="w-4 h-4" /> Confirmar sorteio
              </button>
              <button onClick={runDraw} disabled={busyAction} className={ghostBtn}>
                <RefreshCw className="w-3.5 h-3.5" /> Refazer
              </button>
              <button onClick={() => setDraft(null)} className={ghostBtn}>
                <X className="w-3.5 h-3.5" /> Descartar
              </button>
            </>
          )}
          <button onClick={copyTeams} className={ghostBtn}>
            <ClipboardCopy className="w-3.5 h-3.5 text-lime-400" /> Copiar times
          </button>
          {canEdit && (
            <button
              onClick={() => setColorsOpen((v) => !v)}
              className={`${ghostBtn} ${colorsOpen ? '!border-lime-400 !text-lime-400' : ''}`}
            >
              <Palette className="w-3.5 h-3.5" /> Cores
            </button>
          )}
          {summaries.some((s) => s.playerIds.length) && (
            <span className="inline-flex items-center gap-1.5 ml-auto text-xs font-bold text-slate-300" title="100 = pontuações idênticas">
              <Scale className="w-4 h-4 text-lime-400" /> Equilíbrio {balanceIndex}%
            </span>
          )}
        </div>

        {draft && (
          <div className="px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-400/25 text-xs text-amber-200">
            Prévia do sorteio — ainda não foi salva. Ajuste os jogadores se quiser e toque em
            “Confirmar sorteio”.
          </div>
        )}
      </div>

      {/* CORES / LINHAS */}
      {colorsOpen && canEdit && (
        <div className={`${cardClass} p-4 space-y-3 animate-fade-in`}>
          <div className="text-xs font-bold text-slate-300">Linhas (cores) desta pelada:</div>
          <div className="flex flex-wrap gap-2">
            {snapshot.lines.map((line) => {
              const active = pelada.participatingLineIds.includes(line.id);
              return (
                <div
                  key={line.id}
                  className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border ${
                    active ? 'border-lime-400 bg-lime-400/10' : 'border-white/10 bg-[#1F1F1F] opacity-60'
                  }`}
                >
                  <button type="button" onClick={() => toggleLine(line.id)} className="inline-flex items-center gap-2 cursor-pointer">
                    <LineBadge line={line} size="sm" />
                    {active && <Check className="w-3.5 h-3.5 text-lime-400" />}
                  </button>
                  {!active && (
                    <button
                      type="button"
                      onClick={() =>
                        window.confirm(`Excluir ${line.name}?`) &&
                        runAction(() => babaService.deleteLine(line.id), 'Linha excluída')
                      }
                      className="text-slate-500 hover:text-rose-400 cursor-pointer"
                      title="Excluir linha (só se nunca foi usada)"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          <form onSubmit={createLine} className="flex flex-wrap gap-2 pt-1">
            <input
              value={newLineName}
              onChange={(e) => setNewLineName(e.target.value)}
              placeholder="Nova linha (ex: Verde)"
              maxLength={30}
              className={`${inputClass} flex-1 min-w-[140px] !py-2`}
            />
            <select
              value={newLineColorIdx}
              onChange={(e) => setNewLineColorIdx(Number(e.target.value))}
              className={`${inputClass} !w-auto !py-2`}
            >
              {COLOR_PRESETS.map((c, idx) => (
                <option key={c.label} value={idx}>
                  Cor: {c.label}
                </option>
              ))}
            </select>
            <button type="submit" disabled={busyAction} className={ghostBtn}>
              + Criar linha
            </button>
          </form>
        </div>
      )}

      {/* NÍVEL DOS CONFIRMADOS (ADMIN) */}
      {canEdit && confirmed.length > 0 && (() => {
        const open = levelsOpen ?? assigned.size === 0;
        const counts = [1, 2, 3, 4, 5, 6].map((lv) => confirmed.filter((p) => p.skillLevel === lv).length);
        const k = lines.length;
        const fitsPots = confirmed.length % k === 0 && counts.every((c) => c % k === 0);
        const sorted = [...confirmed].sort(
          (a, b) => a.skillLevel - b.skillLevel || playerLabel(a).localeCompare(playerLabel(b), 'pt-BR')
        );
        return (
          <div className={`${cardClass} !rounded-2xl overflow-hidden`}>
            <button
              type="button"
              onClick={() => setLevelsOpen(!open)}
              className="w-full px-4 py-3 flex items-center justify-between gap-2 cursor-pointer"
              aria-expanded={open}
            >
              <div className="text-left">
                <div className="text-sm font-bold text-white">Nível dos confirmados ({confirmed.length})</div>
                <div className="text-[11px] text-slate-400">1 = melhor • 6 = mais fraco • o sorteio usa estes níveis</div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <div className="hidden sm:flex items-center gap-1">
                  {counts.map((c, i) => (
                    <span key={i} className="inline-flex items-center gap-0.5 text-[10px] font-bold text-slate-400">
                      <LevelBadge level={i + 1} compact />×{c}
                    </span>
                  ))}
                </div>
                <ChevronDown className={`w-4 h-4 text-slate-400 transition ${open ? 'rotate-180' : ''}`} />
              </div>
            </button>

            {open && (
              <div className="px-4 pb-4 space-y-3 animate-fade-in">
                <div className="flex sm:hidden flex-wrap items-center gap-1.5">
                  {counts.map((c, i) => (
                    <span key={i} className="inline-flex items-center gap-0.5 text-[10px] font-bold text-slate-400">
                      <LevelBadge level={i + 1} compact />×{c}
                    </span>
                  ))}
                </div>
                <div
                  className={`px-3 py-2 rounded-xl text-[11px] ${
                    fitsPots ? 'bg-lime-400/[0.07] text-lime-200' : 'bg-amber-500/10 text-amber-200'
                  }`}
                >
                  {fitsPots
                    ? `Fechou: cada um dos ${k} times vai receber ${confirmed.length / k} jogadores, com a mesma quantidade de cada nível.`
                    : `Para cada time ter um jogador de cada nível, cada nível precisa de ${k} jogadores (${k} times). Ajuste os níveis ou o sorteio vai misturar níveis vizinhos.`}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
                  {sorted.map((p) => (
                    <div key={p.id} className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl bg-[#1F1F1F]">
                      <div className="flex items-center gap-2 min-w-0">
                        <PlayerAvatar player={p} size={24} />
                        <span className="text-xs font-semibold text-white truncate">{playerLabel(p)}</span>
                        {p.position === 'Goleiro' && <span className="text-[11px]">🧤</span>}
                      </div>
                      <SkillMeter
                        value={p.skillLevel}
                        onChange={(v) => {
                          if (v === p.skillLevel) return;
                          setDraft(null);
                          runAction(() => babaService.setPlayerSkill(p.id, v));
                        }}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* CARTÕES DOS TIMES */}
      {lines.length === 0 ? (
        <EmptyState title="Nenhuma linha selecionada" text="Escolha as cores das equipes em “Cores”." />
      ) : (
        <div className={`grid grid-cols-1 sm:grid-cols-2 ${lines.length > 2 ? 'xl:grid-cols-3' : ''} gap-3.5`}>
          {lines.map((line, i) => {
            const s = summaries[i];
            const teamPlayers = s.playerIds.map((id) => playerById.get(id)).filter((p): p is Player => Boolean(p));
            return (
              <div key={line.id} className={`${cardClass} overflow-hidden ${draft ? 'ring-1 ring-amber-400/30' : ''}`}>
                <div className="h-2 w-full" style={{ backgroundColor: line.colorHex }} />
                <div className="px-4 py-3 border-b border-white/[0.06] flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className="w-9 h-9 rounded-xl flex items-center justify-center font-black text-xs border border-white/10 shrink-0"
                      style={{ backgroundColor: line.colorHex, color: line.textColorHex }}
                      aria-hidden
                    >
                      {line.shortName}
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-extrabold text-white truncate">{line.name}</div>
                      <div className="text-[11px] text-slate-400">
                        {teamPlayers.length} atletas • {s.goalkeepers} 🧤
                      </div>
                      {isAdmin && teamPlayers.length > 0 && (
                        <div className="flex flex-wrap gap-0.5 mt-1" title="Níveis do time (1 = melhor)">
                          {s.levelCounts.flatMap((count, level) => Array.from({ length: count }, () => level)).map((lv, i) => (
                            <LevelBadge key={i} level={lv} compact />
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-display font-extrabold text-lime-400 text-lg leading-none">
                      {teamPlayers.length ? s.averageLevel.toFixed(1).replace('.', ',') : '–'}
                    </div>
                    <div className="text-[10px] text-slate-500 mt-0.5">nível médio</div>
                  </div>
                </div>

                <div className="p-3 space-y-1.5">
                  {teamPlayers.length === 0 ? (
                    <div className="py-4 text-center text-xs text-slate-500">
                      {canEdit ? 'Sem jogadores — toque em Sortear' : 'Times ainda não definidos'}
                    </div>
                  ) : (
                    teamPlayers.map((p, idx) => (
                      <div key={p.id} className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl bg-[#1F1F1F]">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-[11px] font-bold text-slate-500 w-4">{idx + 1}.</span>
                          <PlayerAvatar player={p} size={24} />
                          <span className="text-xs font-semibold text-white truncate">{playerLabel(p)}</span>
                          {p.position === 'Goleiro' ? (
                            <span className="text-[11px]" title="Goleiro">🧤</span>
                          ) : (
                            <span className="text-[10px] text-slate-500">{p.position.slice(0, 3).toUpperCase()}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {isAdmin && <LevelBadge level={p.skillLevel} />}
                          {canEdit && (
                            <LineColorPicker
                              lines={lines}
                              current={line.id}
                              playerName={playerLabel(p)}
                              onPick={(lid) => movePlayer(p.id, lid)}
                            />
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* CONFIRMADOS SEM TIME */}
      {unassigned.length > 0 && (
        <div className={`${cardClass} !rounded-2xl p-4 space-y-2`}>
          <div className="text-xs font-bold text-amber-300">Confirmados sem time ({unassigned.length})</div>
          <div className="flex flex-wrap gap-2">
            {unassigned.map((p) => (
              <div key={p.id} className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-[#1F1F1F] text-xs text-white">
                <span>{playerLabel(p)}</span>
                {canEdit && (
                  <LineColorPicker lines={lines} playerName={playerLabel(p)} onPick={(lid) => movePlayer(p.id, lid)} />
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
