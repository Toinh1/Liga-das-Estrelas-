import React, { useMemo, useState } from 'react';
import { ArrowRight, Check, ChevronDown, ClipboardCopy, Palette, RefreshCw, Scale, Shuffle, Trash2, X } from 'lucide-react';
import { useBaba } from '../../context/BabaContext';
import { babaService } from '../../services/babaService';
import { MAX_LINES, MIN_LINES, type LineTeam, type Pelada, type Player } from '../../types/domain';
import { formatShortDateBR } from '../../utils/statsEngine';
import {
  balanceTeams,
  computeBalanceIndex,
  summarizeTeams,
  type BalancePlayer,
  type TeamSummary,
} from '../../utils/teamBalancer';
import { LineBadge } from '../LineBadge';
import { EmptyState, GkTag, LevelBadge, PlayerAvatar, SkillMeter, ghostBtn, inputClass, playerLabel } from '../ui';

const COLOR_PRESETS = [
  { label: 'Verde', hex: '#22C55E', text: '#0B0D0B' },
  { label: 'Amarela', hex: '#FACC15', text: '#0B0D0B' },
  { label: 'Vermelha', hex: '#EF4444', text: '#F8FAFC' },
  { label: 'Azul', hex: '#3B82F6', text: '#F8FAFC' },
  { label: 'Laranja', hex: '#F97316', text: '#0B0D0B' },
  { label: 'Branca', hex: '#F8FAFC', text: '#0B0D0B' },
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
              ? 'border-white ring-2 ring-lime-400 ring-offset-1 ring-offset-[#1B1F1B] cursor-default'
              : 'border-white/20 opacity-50 hover:opacity-100 hover:scale-110 cursor-pointer'
          }`}
          style={{ backgroundColor: l.colorHex }}
        />
      );
    })}
  </div>
);

export const TeamsPanel: React.FC<{ pelada: Pelada; onConfirmed?: () => void }> = ({ pelada, onConfirmed }) => {
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

  // ----- validação do nivelamento (libera o botão de confirmar) -----
  const teamIssues: string[] = [];
  if (lines.length < MIN_LINES) teamIssues.push(`Selecione ${MIN_LINES} ou ${MAX_LINES} linhas.`);
  if (confirmed.length < lines.length) teamIssues.push('Poucos confirmados para montar os times.');
  if (unassigned.length > 0) teamIssues.push(`${unassigned.length} confirmado(s) ainda sem time.`);
  const sizes = summaries.map((s) => s.playerIds.length);
  if (sizes.length && Math.max(...sizes) - Math.min(...sizes) > 1) {
    teamIssues.push('Os times estão com tamanhos diferentes (mais de 1 jogador de diferença).');
  }
  for (let lv = 1; lv <= 6; lv++) {
    const perTeam = summaries.map((s) => s.levelCounts[lv] ?? 0);
    if (perTeam.length && Math.max(...perTeam) - Math.min(...perTeam) > 1) {
      teamIssues.push(`Nível ${lv} desequilibrado: ${lines.map((l, i) => `${l.shortName} ${perTeam[i]}`).join(' • ')}.`);
    }
  }
  const teamsReady = teamIssues.length === 0;

  const confirmAndPlay = async () => {
    if (!teamsReady) return;
    if (draft) {
      if (hasMatches && !window.confirm('Já existem jogos registrados. Alterar as linhas agora muda a escalação dos próximos jogos. Continuar?')) return;
      const res = await runAction(() => babaService.saveLineRosters(pelada.id, draft), 'Times confirmados! Bora jogar');
      if (!res) return;
      setDraft(null);
    }
    onConfirmed?.();
  };

  // ----- ações -----
  const runDraw = () => {
    if (lines.length < MIN_LINES) return pushToast(`Selecione ${MIN_LINES} ou ${MAX_LINES} linhas`, undefined, 'error');
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
    const res = await runAction(() => babaService.saveLineRosters(pelada.id, draft), 'Times confirmados!');
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
      .then(() => pushToast('Times copiados para o WhatsApp!'))
      .catch(() => pushToast('Não foi possível copiar', undefined, 'error'));
  };

  const hasTeams = assigned.size > 0 || Boolean(draft);
  const smallBtn =
    'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-white/10 text-xs font-semibold text-slate-300 hover:text-white hover:border-white/25 transition cursor-pointer';

  // ----- níveis dos confirmados (admin) -----
  const levelsSection = canEdit && confirmed.length > 0 && (() => {
    const open = levelsOpen ?? !hasTeams;
    const counts = [1, 2, 3, 4, 5, 6].map((lv) => confirmed.filter((p) => p.skillLevel === lv).length);
    const k = lines.length || 1;
    const fitsPots = confirmed.length % k === 0 && counts.every((c) => c % k === 0);
    const sorted = [...confirmed].sort(
      (a, b) => a.skillLevel - b.skillLevel || playerLabel(a).localeCompare(playerLabel(b), 'pt-BR')
    );
    return (
      <section className="rounded-xl bg-[#131613] border border-white/[0.08] overflow-hidden">
        <button
          type="button"
          onClick={() => setLevelsOpen(!open)}
          className="w-full px-3.5 py-3 flex items-center justify-between gap-2 cursor-pointer"
          aria-expanded={open}
        >
          <div className="text-left min-w-0">
            <div className="text-sm font-semibold text-white">Nível dos confirmados ({confirmed.length})</div>
            <div className="flex flex-wrap items-center gap-1.5 mt-1">
              {counts.map((c, i) => (
                <span key={i} className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-slate-400 tabular-nums">
                  <LevelBadge level={i + 1} compact />×{c}
                </span>
              ))}
            </div>
          </div>
          <ChevronDown className={`w-4 h-4 text-slate-400 shrink-0 transition ${open ? 'rotate-180' : ''}`} />
        </button>

        {open && (
          <div className="px-3.5 pb-3.5 space-y-2.5 animate-fade-in">
            <p className={`text-xs leading-relaxed ${fitsPots ? 'text-lime-300' : 'text-amber-200'}`}>
              {fitsPots
                ? `Fechou: cada um dos ${k} times vai receber ${confirmed.length / k} jogadores, com a mesma quantidade de cada nível.`
                : `Para cada time ter um jogador de cada nível, cada nível precisa de ${k} jogadores. Ajuste os níveis ou o sorteio vai misturar níveis vizinhos.`}
            </p>
            <ul className="grid grid-cols-1 md:grid-cols-2 gap-x-4 divide-y divide-white/[0.05] md:divide-y-0">
              {sorted.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2 py-1.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <PlayerAvatar player={p} size={24} />
                    <span className="text-sm text-white truncate">{playerLabel(p)}</span>
                    {p.position === 'Goleiro' && <GkTag />}
                  </div>
                  <SkillMeter
                    value={p.skillLevel}
                    onChange={(v) => {
                      if (v === p.skillLevel) return;
                      setDraft(null);
                      runAction(() => babaService.setPlayerSkill(p.id, v));
                    }}
                  />
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    );
  })();

  return (
    <div className="space-y-5">
      {/* RESUMO + AJUSTES (uma linha só) */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm text-slate-300">
          <strong className="text-white">{lines.length} times</strong> · {confirmed.length} confirmados
          {summaries.some((s) => s.playerIds.length) && (
            <span className="inline-flex items-center gap-1 ml-2 text-xs text-slate-400" title="100% = times idênticos">
              <Scale className="w-3.5 h-3.5 text-lime-400" /> equilíbrio {balanceIndex}%
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {canEdit && (
            <div className="flex items-center p-0.5 rounded-lg border border-white/10" role="radiogroup" aria-label="Quantidade de times">
              {Array.from({ length: MAX_LINES - MIN_LINES + 1 }, (_, i) => MIN_LINES + i).map((n) => (
                <button
                  key={n}
                  role="radio"
                  aria-checked={lines.length === n}
                  disabled={busyAction}
                  onClick={() => n !== lines.length && setTeamCount(n)}
                  className={`px-2.5 py-1 rounded-md text-xs font-bold cursor-pointer transition ${
                    lines.length === n ? 'bg-lime-400 text-slate-950' : 'text-slate-400 hover:text-white'
                  }`}
                  title={`${n} times`}
                >
                  {n} times
                </button>
              ))}
            </div>
          )}
          {canEdit && (
            <button
              onClick={() => setColorsOpen((v) => !v)}
              className={`${smallBtn} ${colorsOpen ? '!border-lime-400 !text-lime-400' : ''}`}
              aria-expanded={colorsOpen}
            >
              <Palette className="w-3.5 h-3.5" /> Cores
            </button>
          )}
          {assigned.size > 0 && (
            <button onClick={copyTeams} className={smallBtn} title="Copiar times para o WhatsApp">
              <ClipboardCopy className="w-3.5 h-3.5" /> Copiar
            </button>
          )}
        </div>
      </div>

      {draft && (
        <p className="px-3.5 py-2.5 rounded-xl bg-amber-500/[0.08] border border-amber-400/25 text-xs text-amber-200 leading-relaxed">
          Prévia do sorteio, ainda não salva. Troque jogadores de time tocando nas cores, depois confirme no rodapé.
        </p>
      )}

      {/* CORES / LINHAS */}
      {colorsOpen && canEdit && (
        <div className="rounded-xl bg-[#131613] border border-white/[0.08] p-3.5 space-y-3 animate-fade-in">
          <div className="text-xs font-semibold text-slate-300">Linhas (cores) desta pelada:</div>
          <div className="flex flex-wrap gap-2">
            {snapshot.lines.map((line) => {
              const active = pelada.participatingLineIds.includes(line.id);
              return (
                <div
                  key={line.id}
                  className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border ${
                    active ? 'border-lime-400 bg-lime-400/10' : 'border-white/10 bg-[#1B1F1B] opacity-60'
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

      {/* Nivelamento dos jogadores sempre em cima; os times vêm embaixo */}
      {levelsSection}

      {/* TIMES */}
      {lines.length === 0 ? (
        <EmptyState title="Nenhuma linha selecionada" text="Escolha as cores das equipes em “Cores”." />
      ) : hasTeams || !canEdit ? (
        <div className={`grid grid-cols-1 sm:grid-cols-2 ${lines.length > 2 ? 'xl:grid-cols-3' : ''} gap-3`}>
          {lines.map((line, i) => {
            const s = summaries[i];
            const teamPlayers = s.playerIds.map((id) => playerById.get(id)).filter((p): p is Player => Boolean(p));
            return (
              <section
                key={line.id}
                className={`rounded-xl bg-[#131613] border overflow-hidden ${draft ? 'border-dashed' : ''}`}
                style={{ borderColor: `${line.colorHex}66` }}
                aria-label={line.name}
              >
                <header className="px-3.5 py-2.5 border-b border-white/[0.06] flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="w-3.5 h-3.5 rounded-sm border border-white/25 shrink-0" style={{ backgroundColor: line.colorHex }} />
                    <h3 className="font-display font-bold uppercase text-base text-white truncate">{line.name}</h3>
                    <span className="text-xs text-slate-500 shrink-0">{teamPlayers.length}</span>
                  </div>
                  {isAdmin && teamPlayers.length > 0 && (
                    <span className="text-xs text-slate-400 shrink-0" title="Nível médio (1 = melhor)">
                      média <strong className="font-display text-sm text-white">{s.averageLevel.toFixed(1).replace('.', ',')}</strong>
                    </span>
                  )}
                </header>

                {teamPlayers.length === 0 ? (
                  <div className="py-5 text-center text-xs text-slate-500">
                    {canEdit ? 'Sem jogadores ainda' : 'Times ainda não definidos'}
                  </div>
                ) : (
                  <ul className="divide-y divide-white/[0.05]">
                    {teamPlayers.map((p) => (
                      <li key={p.id} className="flex items-center justify-between gap-2 px-3.5 py-2">
                        <div className="flex items-center gap-2 min-w-0">
                          {isAdmin && <LevelBadge level={p.skillLevel} compact />}
                          <PlayerAvatar player={p} size={22} />
                          <span className="text-sm text-white truncate">{playerLabel(p)}</span>
                          {p.position === 'Goleiro' && <GkTag />}
                        </div>
                        {canEdit && (
                          <LineColorPicker
                            lines={lines}
                            current={line.id}
                            playerName={playerLabel(p)}
                            onPick={(lid) => movePlayer(p.id, lid)}
                          />
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      ) : null}

      {/* CONFIRMADOS SEM TIME */}
      {hasTeams && unassigned.length > 0 && (
        <section className="rounded-xl border border-amber-400/30 p-3.5 space-y-2">
          <div className="text-xs font-semibold text-amber-300">Confirmados sem time ({unassigned.length})</div>
          <ul className="divide-y divide-white/[0.05]">
            {unassigned.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-2 py-1.5">
                <span className="text-sm text-white truncate">{playerLabel(p)}</span>
                {canEdit && <LineColorPicker lines={lines} playerName={playerLabel(p)} onPick={(lid) => movePlayer(p.id, lid)} />}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* O QUE FALTA AJUSTAR */}
      {canEdit && hasTeams && !teamsReady && (
        <div className="px-3.5 py-3 rounded-xl bg-amber-500/[0.08] border border-amber-400/25 text-xs text-amber-200 space-y-0.5">
          <div className="font-semibold">Ajuste antes de confirmar:</div>
          {teamIssues.map((t) => (
            <div key={t}>• {t}</div>
          ))}
        </div>
      )}

      {/* AÇÕES DO ADMIN: fixas no rodapé */}
      {canEdit && lines.length > 0 && (
        <div className="sticky bottom-[calc(4.75rem+env(safe-area-inset-bottom,0px))] lg:bottom-4 z-10">
          <div className="flex gap-2 p-2 rounded-xl bg-[#0E110E]/95 border border-white/10 shadow-[0_8px_24px_-8px_rgba(0,0,0,0.8)] backdrop-blur">
            {draft ? (
              <>
                <button
                  onClick={runDraw}
                  disabled={busyAction}
                  title="Sortear de novo"
                  aria-label="Sortear de novo"
                  className="inline-flex items-center justify-center px-3.5 py-3 rounded-lg border border-white/15 text-slate-200 hover:bg-white/[0.06] transition cursor-pointer disabled:opacity-40"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setDraft(null)}
                  title="Descartar sorteio"
                  aria-label="Descartar sorteio"
                  className="inline-flex items-center justify-center px-3.5 py-3 rounded-lg border border-white/15 text-slate-200 hover:bg-white/[0.06] transition cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
                <button
                  onClick={teamsReady ? confirmAndPlay : confirmDraft}
                  disabled={busyAction}
                  className="flex-1 inline-flex items-center justify-center gap-2 py-3 rounded-lg bg-lime-400 hover:bg-lime-300 text-slate-950 text-sm font-bold transition cursor-pointer disabled:opacity-50"
                >
                  <Check className="w-4 h-4" strokeWidth={2.6} />
                  {teamsReady ? 'Confirmar e ir aos jogos' : 'Salvar sorteio'}
                </button>
              </>
            ) : hasTeams ? (
              <>
                <button
                  onClick={runDraw}
                  disabled={busyAction}
                  className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-lg border border-white/15 text-slate-200 hover:bg-white/[0.06] text-sm font-semibold transition cursor-pointer disabled:opacity-40"
                >
                  <Shuffle className="w-4 h-4" /> Sortear de novo
                </button>
                <button
                  onClick={confirmAndPlay}
                  disabled={!teamsReady || busyAction}
                  className="flex-1 inline-flex items-center justify-center gap-2 py-3 rounded-lg bg-lime-400 hover:bg-lime-300 text-slate-950 text-sm font-bold transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Ir para os jogos <ArrowRight className="w-4 h-4" />
                </button>
              </>
            ) : (
              <button
                onClick={runDraw}
                disabled={busyAction}
                className="flex-1 inline-flex items-center justify-center gap-2 py-3 rounded-lg bg-lime-400 hover:bg-lime-300 text-slate-950 text-sm font-bold transition cursor-pointer disabled:opacity-50"
              >
                <Shuffle className="w-4 h-4" /> Sortear times equilibrados
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
