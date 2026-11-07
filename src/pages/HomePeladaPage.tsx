import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeftRight,
  Check,
  ClipboardCopy,
  Edit3,
  Flag,
  Flame,
  Minus,
  Palette,
  Plus,
  PlusCircle,
  RotateCcw,
  Shuffle,
  Trash2,
  Trophy,
} from 'lucide-react';
import { LineBadge } from '../components/LineBadge';
import { useBaba } from '../context/BabaContext';
import { babaService } from '../services/babaService';
import { formatPlayersToEditableText, parseRosterText } from '../utils/rosterParser';
import { computePeladaStandings, formatShortDateBR } from '../utils/statsEngine';

type SubTab = 'jogos' | 'lista' | 'gols';

const COLOR_PRESETS = [
  { label: 'Verde', hex: '#22C55E', text: '#090B0E' },
  { label: 'Amarela', hex: '#FACC15', text: '#090B0E' },
  { label: 'Vermelha', hex: '#EF4444', text: '#F8FAFC' },
  { label: 'Azul', hex: '#3B82F6', text: '#F8FAFC' },
  { label: 'Laranja', hex: '#F97316', text: '#090B0E' },
  { label: 'Branca', hex: '#F8FAFC', text: '#090B0E' },
  { label: 'Preta', hex: '#27272A', text: '#F8FAFC' },
];

export const HomePeladaPage: React.FC = () => {
  const {
    user,
    isAdmin,
    snapshot,
    activePelada,
    selectedPelada,
    setSelectedPeladaId,
    setOpenCreatePeladaModal,
    setCeremonyPeladaId,
    runAction,
    pushToast,
    busyAction,
  } = useBaba();

  const [subTab, setSubTab] = useState<SubTab>('jogos');

  // Placar rápido
  const [homeLineId, setHomeLineId] = useState('');
  const [awayLineId, setAwayLineId] = useState('');
  const [homeGoals, setHomeGoals] = useState(0);
  const [awayGoals, setAwayGoals] = useState(0);

  // Lista e Times
  const [editingRoster, setEditingRoster] = useState(false);
  const [rosterDraft, setRosterDraft] = useState('');
  const [swapMode, setSwapMode] = useState(false);
  const [colorsOpen, setColorsOpen] = useState(false);
  const [newLineName, setNewLineName] = useState('');
  const [newLineColorIdx, setNewLineColorIdx] = useState(0);

  const pelada = selectedPelada || activePelada;

  const participatingLines = useMemo(() => {
    if (!snapshot || !pelada) return [];
    const ids = pelada.participatingLineIds.length
      ? pelada.participatingLineIds
      : snapshot.lines.slice(0, 4).map((l) => l.id);
    return snapshot.lines.filter((l) => ids.includes(l.id));
  }, [snapshot, pelada]);

  // Sincroniza seleção padrão das 2 linhas no placar
  useEffect(() => {
    if (participatingLines.length >= 2) {
      if (!participatingLines.some((l) => l.id === homeLineId)) {
        setHomeLineId(participatingLines[0].id);
      }
      if (
        !participatingLines.some((l) => l.id === awayLineId) ||
        awayLineId === participatingLines[0].id
      ) {
        setAwayLineId(participatingLines[1].id);
      }
    }
  }, [participatingLines, homeLineId, awayLineId]);

  const presentPlayers = useMemo(() => {
    if (!snapshot || !pelada) return [];
    const idSet = new Set(
      pelada.presentPlayerIds.length ? pelada.presentPlayerIds : pelada.confirmedPlayerIds
    );
    return snapshot.players.filter((p) => idSet.has(p.id));
  }, [snapshot, pelada]);

  useEffect(() => {
    if (!pelada) return;
    setRosterDraft(
      formatPlayersToEditableText(
        presentPlayers.map((p) => ({ name: p.nickname || p.name, position: p.position }))
      )
    );
  }, [pelada?.id, presentPlayers.length]);

  if (!snapshot || !user) return null;

  // Estado vazio limpo quando ainda não existe nenhuma pelada
  if (!pelada) {
    return (
      <div className="py-16 text-center max-w-md mx-auto space-y-4">
        <div className="w-16 h-16 rounded-3xl bg-lime-400/15 border border-lime-400/30 text-lime-400 flex items-center justify-center text-3xl mx-auto">
          ⚽
        </div>
        <h1 className="text-xl font-extrabold text-white">Nenhuma pelada aberta</h1>
        <p className="text-sm text-slate-400">
          {isAdmin
            ? 'Crie a pelada de sábado para colar a lista da galera, sortear os times e marcar os placares.'
            : 'Aguarde o administrador abrir a pelada de sábado.'}
        </p>
        {isAdmin && (
          <button
            onClick={() => setOpenCreatePeladaModal(true)}
            className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl bg-lime-400 hover:bg-lime-300 text-slate-950 font-extrabold text-sm transition cursor-pointer"
          >
            <PlusCircle className="w-4 h-4" />
            Criar Pelada de Sábado
          </button>
        )}
      </div>
    );
  }

  const isFinished = pelada.status === 'finished';
  const standings = computePeladaStandings(pelada, snapshot.lines, snapshot.matches);
  const roundMatches = snapshot.matches
    .filter((m) => m.peladaId === pelada.id)
    .sort((a, b) => b.orderIndex - a.orderIndex);

  const lineMap = new Map(snapshot.lines.map((l) => [l.id, l]));
  const playerMap = new Map(snapshot.players.map((p) => [p.id, p]));
  const iAmConfirmed = pelada.confirmedPlayerIds.includes(user.playerId);

  const getPlayerGoalCount = (playerId: string) =>
    snapshot.goals.find((g) => g.peladaId === pelada.id && g.playerId === playerId)?.goals ?? 0;

  const getPlayerLine = (playerId: string) => {
    for (const [lid, pids] of Object.entries(pelada.lineRosters || {})) {
      if (pids.includes(playerId)) return lineMap.get(lid);
    }
    return undefined;
  };

  // --- AÇÕES ---
  const handleSaveMatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!homeLineId || !awayLineId || homeLineId === awayLineId) {
      pushToast('Escolha duas linhas diferentes', undefined, 'error');
      return;
    }
    const res = await runAction(
      () =>
        babaService.createMatch(user, {
          peladaId: pelada.id,
          homeLineId,
          awayLineId,
          homeGoals,
          awayGoals,
          homeScorers: [],
          awayScorers: [],
        }),
      'Placar salvo! ⚽'
    );
    if (res) {
      setHomeGoals(0);
      setAwayGoals(0);
    }
  };

  const handleClosePelada = async () => {
    if (!window.confirm('Encerrar a pelada de hoje e definir os campeões?')) return;
    const res = await runAction(
      () => babaService.closePelada(user, pelada.id),
      'Pelada encerrada! 🏆'
    );
    if (res) {
      setCeremonyPeladaId(pelada.id);
    }
  };

  const handleSaveRosterText = async () => {
    const parsed = parseRosterText(rosterDraft, snapshot.players);
    await runAction(async () => {
      const ensured = await babaService.ensurePlayersFromRoster(
        user,
        parsed.map((it) => ({
          name: it.name,
          position: it.position,
          matchedPlayerId: it.matchedPlayerId,
        }))
      );
      const ids = ensured.playerIds;
      const activeLineIds = participatingLines.map((l) => l.id);
      const nextRosters: Record<string, string[]> = {};
      for (const lid of activeLineIds) {
        nextRosters[lid] = (pelada.lineRosters[lid] || []).filter((pid) => ids.includes(pid));
      }

      // Coloca jogadores novos na linha que tiver menos atletas
      const assigned = new Set(Object.values(nextRosters).flat());
      for (const pid of ids) {
        if (!assigned.has(pid) && activeLineIds.length > 0) {
          const targetLid = [...activeLineIds].sort(
            (a, b) => (nextRosters[a]?.length || 0) - (nextRosters[b]?.length || 0)
          )[0];
          nextRosters[targetLid].push(pid);
          assigned.add(pid);
        }
      }

      return babaService.updatePelada(user, pelada.id, {
        confirmedPlayerIds: ids,
        presentPlayerIds: ids,
        expectedPlayers: ids.length || 24,
        lineRosters: nextRosters,
      });
    }, 'Lista atualizada!');
    setEditingRoster(false);
  };

  const handleDrawTeams = async () => {
    const activeLineIds = participatingLines.map((l) => l.id);
    if (activeLineIds.length < 2 || presentPlayers.length === 0) return;

    const gks = presentPlayers
      .filter((p) => p.position === 'Goleiro')
      .sort(() => Math.random() - 0.5);
    const outfield = presentPlayers
      .filter((p) => p.position !== 'Goleiro')
      .sort(() => Math.random() - 0.5);

    const nextRosters: Record<string, string[]> = {};
    for (const lid of activeLineIds) nextRosters[lid] = [];

    [...gks, ...outfield].forEach((p, idx) => {
      const lid = activeLineIds[idx % activeLineIds.length];
      nextRosters[lid].push(p.id);
    });

    await runAction(
      () => babaService.updatePelada(user, pelada.id, { lineRosters: nextRosters }),
      'Times sorteados! 🎲'
    );
  };

  const handleMovePlayerLine = async (playerId: string, targetLineId: string) => {
    const nextRosters: Record<string, string[]> = {};
    for (const lid of participatingLines.map((l) => l.id)) {
      nextRosters[lid] = (pelada.lineRosters[lid] || []).filter((id) => id !== playerId);
    }
    if (targetLineId && nextRosters[targetLineId]) {
      nextRosters[targetLineId].push(playerId);
    }
    await runAction(() => babaService.updatePelada(user, pelada.id, { lineRosters: nextRosters }));
  };

  const handleToggleParticipatingLine = async (lineId: string) => {
    const current = pelada.participatingLineIds;
    const exists = current.includes(lineId);
    if (exists && current.length <= 2) {
      pushToast('Mantenha pelo menos 2 linhas', undefined, 'error');
      return;
    }
    const nextIds = exists ? current.filter((id) => id !== lineId) : [...current, lineId];
    const nextRosters = { ...pelada.lineRosters };
    if (!exists && !nextRosters[lineId]) nextRosters[lineId] = [];
    if (exists) delete nextRosters[lineId];

    await runAction(() =>
      babaService.updatePelada(user, pelada.id, {
        participatingLineIds: nextIds,
        lineCount: nextIds.length,
        lineRosters: nextRosters,
      })
    );
  };

  const handleCreateCustomLine = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = newLineName.trim();
    if (!clean) return;
    const preset = COLOR_PRESETS[newLineColorIdx] || COLOR_PRESETS[0];
    const shortName = clean
      .replace(/^linha\s+/i, '')
      .slice(0, 3)
      .toUpperCase();
    const fullName = /^linha\s+/i.test(clean) ? clean : `Linha ${clean}`;
    await runAction(
      () =>
        babaService.createLine(user, {
          name: fullName,
          shortName: shortName || 'LIN',
          colorHex: preset.hex,
          textColorHex: preset.text,
        }),
      `${fullName} criada!`
    );
    setNewLineName('');
  };

  const handleCopyTeamsToWhatsApp = () => {
    const blocks = participatingLines.map((line) => {
      const pids = pelada.lineRosters[line.id] || [];
      const names = pids
        .map((id, i) => {
          const p = playerMap.get(id);
          if (!p) return null;
          const gk = p.position === 'Goleiro' ? ' 🧤' : '';
          return `${i + 1}. ${p.nickname || p.name}${gk}`;
        })
        .filter(Boolean)
        .join('\n');
      return `*${line.name.toUpperCase()}*\n${names || '(vazio)'}`;
    });

    const text = `⭐ *${pelada.title} — ${formatShortDateBR(pelada.date)}* ⭐\n\n${blocks.join(
      '\n\n'
    )}`;
    navigator.clipboard.writeText(text);
    pushToast('Times copiados para o WhatsApp! 📋');
  };

  const unassignedPlayers = presentPlayers.filter((p) => !getPlayerLine(p.id));

  return (
    <div className="space-y-5">
      {/* Aviso discreto se estiver vendo uma pelada antiga */}
      {activePelada && pelada.id !== activePelada.id && (
        <div className="flex items-center justify-between px-4 py-2.5 rounded-2xl bg-amber-500/10 border border-amber-400/25 text-xs text-amber-200">
          <span>Visualizando histórico: {pelada.title}</span>
          <button
            onClick={() => setSelectedPeladaId(activePelada.id)}
            className="font-bold text-lime-400 hover:underline cursor-pointer"
          >
            Voltar para atual →
          </button>
        </div>
      )}

      {/* CABEÇALHO DIRETO DA PELADA */}
      <div className="p-3.5 sm:p-5 rounded-2xl sm:rounded-3xl bg-[#11161F] border border-white/[0.08] flex flex-wrap items-center justify-between gap-2.5 sm:gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-base sm:text-xl font-extrabold text-white">{pelada.title}</h1>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] sm:text-[11px] font-bold ${
                isFinished
                  ? 'bg-yellow-400/15 text-yellow-300'
                  : 'bg-lime-400/15 text-lime-400'
              }`}
            >
              {isFinished ? 'Encerrada' : 'Em andamento'}
            </span>
          </div>
          <p className="text-[11px] sm:text-xs text-slate-400 mt-0.5">
            {formatShortDateBR(pelada.date)} • {presentPlayers.length} atletas •{' '}
            {roundMatches.length} {roundMatches.length === 1 ? 'jogo' : 'jogos'}
          </p>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2">
          {!isAdmin && !isFinished && (
            <button
              onClick={() =>
                runAction(
                  () => babaService.toggleOwnPresence(user, pelada, !iAmConfirmed),
                  !iAmConfirmed ? 'Presença confirmada! ⚽' : 'Presença removida'
                )
              }
              className={`px-3.5 py-2 rounded-xl text-xs font-extrabold transition cursor-pointer ${
                iAmConfirmed
                  ? 'bg-lime-400/15 text-lime-300 border border-lime-400/40'
                  : 'bg-lime-400 text-slate-950'
              }`}
            >
              {iAmConfirmed ? '✓ Confirmado' : 'Confirmar Presença'}
            </button>
          )}

          {isFinished ? (
            <>
              <button
                onClick={() => setCeremonyPeladaId(pelada.id)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-yellow-400 text-slate-950 text-xs font-extrabold cursor-pointer"
              >
                <Trophy className="w-3.5 h-3.5" />
                Resumo
              </button>
              {isAdmin && (
                <button
                  onClick={() =>
                    runAction(() => babaService.reopenPelada(user, pelada.id), 'Pelada reaberta!')
                  }
                  title="Reabrir pelada"
                  className="p-2 rounded-xl bg-white/5 text-slate-300 hover:text-white cursor-pointer"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
              )}
            </>
          ) : (
            isAdmin && (
              <button
                onClick={handleClosePelada}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/[0.07] hover:bg-rose-500/20 hover:text-rose-200 border border-white/10 text-xs font-bold text-slate-200 transition cursor-pointer"
              >
                <Flag className="w-3.5 h-3.5 text-lime-400" />
                Encerrar
              </button>
            )
          )}

          {isAdmin && (
            <button
              onClick={() => setOpenCreatePeladaModal(true)}
              className="lg:hidden inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-lime-400 text-slate-950 text-xs font-extrabold cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Nova
            </button>
          )}
        </div>
      </div>

      {/* SELETOR DE MODO (3 ABAS INTERNAS LIMPAS) */}
      <div className="grid grid-cols-3 gap-1.5 p-1.5 rounded-2xl bg-[#11161F] border border-white/[0.07]">
        <button
          onClick={() => setSubTab('jogos')}
          className={`py-2.5 px-2 rounded-xl text-xs sm:text-sm font-bold transition cursor-pointer ${
            subTab === 'jogos'
              ? 'bg-lime-400 text-slate-950'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          ⚽ Jogos & Tabela
        </button>
        <button
          onClick={() => setSubTab('lista')}
          className={`py-2.5 px-2 rounded-xl text-xs sm:text-sm font-bold transition cursor-pointer ${
            subTab === 'lista'
              ? 'bg-lime-400 text-slate-950'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          📋 Lista & Times
        </button>
        <button
          onClick={() => setSubTab('gols')}
          className={`py-2.5 px-2 rounded-xl text-xs sm:text-sm font-bold transition cursor-pointer ${
            subTab === 'gols'
              ? 'bg-lime-400 text-slate-950'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          🔥 Gols
        </button>
      </div>

      {/* ==================== ABA 1: JOGOS & TABELA ==================== */}
      {subTab === 'jogos' && (
        <div className="space-y-5">
          {/* REGISTRAR PLACAR (ADMIN) */}
          {isAdmin && !isFinished && participatingLines.length >= 2 && (
            <form
              onSubmit={handleSaveMatch}
              className="p-4 sm:p-5 rounded-3xl bg-[#11161F] border border-white/[0.08] space-y-3"
            >
              <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Novo Placar
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] items-center gap-3">
                {/* Time 1 + Gols */}
                <div className="flex items-center justify-between gap-2 p-2.5 rounded-2xl bg-[#0B0F15] border border-white/10">
                  <select
                    value={homeLineId}
                    onChange={(e) => {
                      const next = e.target.value;
                      setHomeLineId(next);
                      if (next === awayLineId) {
                        const alt = participatingLines.find((l) => l.id !== next);
                        if (alt) setAwayLineId(alt.id);
                      }
                    }}
                    className="bg-transparent text-sm font-bold text-white focus:outline-none flex-1 min-w-0 cursor-pointer"
                  >
                    {participatingLines.map((l) => (
                      <option key={l.id} value={l.id} className="bg-[#11161F]">
                        {l.name}
                      </option>
                    ))}
                  </select>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => setHomeGoals((g) => Math.max(0, g - 1))}
                      className="w-8 h-8 sm:w-7 sm:h-7 rounded-xl bg-white/5 active:bg-white/15 flex items-center justify-center text-slate-300 cursor-pointer"
                    >
                      <Minus className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
                    </button>
                    <span className="w-6 text-center font-display font-extrabold text-lg text-lime-400">
                      {homeGoals}
                    </span>
                    <button
                      type="button"
                      onClick={() => setHomeGoals((g) => g + 1)}
                      className="w-8 h-8 sm:w-7 sm:h-7 rounded-xl bg-lime-400/15 active:bg-lime-400/30 flex items-center justify-center text-lime-400 cursor-pointer"
                    >
                      <Plus className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="text-center text-xs font-black text-slate-500">×</div>

                {/* Time 2 + Gols */}
                <div className="flex items-center justify-between gap-2 p-2.5 rounded-2xl bg-[#0B0F15] border border-white/10">
                  <select
                    value={awayLineId}
                    onChange={(e) => {
                      const next = e.target.value;
                      setAwayLineId(next);
                      if (next === homeLineId) {
                        const alt = participatingLines.find((l) => l.id !== next);
                        if (alt) setHomeLineId(alt.id);
                      }
                    }}
                    className="bg-transparent text-sm font-bold text-white focus:outline-none flex-1 min-w-0 cursor-pointer"
                  >
                    {participatingLines.map((l) => (
                      <option key={l.id} value={l.id} className="bg-[#11161F]">
                        {l.name}
                      </option>
                    ))}
                  </select>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => setAwayGoals((g) => Math.max(0, g - 1))}
                      className="w-8 h-8 sm:w-7 sm:h-7 rounded-xl bg-white/5 active:bg-white/15 flex items-center justify-center text-slate-300 cursor-pointer"
                    >
                      <Minus className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
                    </button>
                    <span className="w-6 text-center font-display font-extrabold text-lg text-lime-400">
                      {awayGoals}
                    </span>
                    <button
                      type="button"
                      onClick={() => setAwayGoals((g) => g + 1)}
                      className="w-8 h-8 sm:w-7 sm:h-7 rounded-xl bg-lime-400/15 active:bg-lime-400/30 flex items-center justify-center text-lime-400 cursor-pointer"
                    >
                      <Plus className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
                    </button>
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={busyAction}
                className="w-full py-2.5 rounded-2xl bg-lime-400 hover:bg-lime-300 text-slate-950 font-extrabold text-sm transition cursor-pointer disabled:opacity-50"
              >
                Salvar Resultado
              </button>
            </form>
          )}

          {/* CLASSIFICAÇÃO DAS LINHAS */}
          <div className="rounded-2xl sm:rounded-3xl bg-[#11161F] border border-white/[0.08] overflow-hidden">
            <div className="px-4 sm:px-5 py-3 sm:py-3.5 border-b border-white/[0.06] flex items-center justify-between">
              <h2 className="text-sm font-bold text-white">Classificação</h2>
              <span className="text-[10px] sm:text-[11px] text-slate-500">V=3 • E=1 • D=0</span>
            </div>

            <div className="overflow-x-auto -mx-1 sm:mx-0">
              <table className="w-full text-xs sm:text-sm">
                <thead>
                  <tr className="text-[11px] sm:text-xs text-slate-500 border-b border-white/[0.05]">
                    <th className="text-left py-2.5 pl-3.5 sm:pl-5 pr-1 w-6 sm:w-8">#</th>
                    <th className="text-left py-2.5 px-1 sm:px-2">Linha</th>
                    <th className="text-center py-2.5 px-1 sm:px-2 font-bold text-slate-200">PTS</th>
                    <th className="text-center py-2.5 px-1 sm:px-2">J</th>
                    <th className="text-center py-2.5 px-1 sm:px-2">V</th>
                    <th className="text-center py-2.5 px-1 sm:px-2">E</th>
                    <th className="text-center py-2.5 px-1 sm:px-2">D</th>
                    <th className="text-center py-2.5 pl-1 sm:pl-2 pr-3.5 sm:pr-5">SG</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04]">
                  {standings.map((row, idx) => {
                    const isLeader = idx === 0 && row.played > 0;
                    return (
                      <tr
                        key={row.lineId}
                        className={isLeader ? 'bg-lime-400/[0.06]' : undefined}
                      >
                        <td className="py-2.5 sm:py-3 pl-3.5 sm:pl-5 pr-1 font-bold text-xs text-slate-400">
                          {isFinished && idx === 0 ? '🏆' : `${idx + 1}º`}
                        </td>
                        <td className="py-2.5 sm:py-3 px-1 sm:px-2">
                          <LineBadge line={row} size="sm" />
                        </td>
                        <td className="py-2.5 sm:py-3 px-1 sm:px-2 text-center font-display font-extrabold text-lime-400">
                          {row.points}
                        </td>
                        <td className="py-2.5 sm:py-3 px-1 sm:px-2 text-center text-slate-300">{row.played}</td>
                        <td className="py-2.5 sm:py-3 px-1 sm:px-2 text-center text-emerald-400">{row.wins}</td>
                        <td className="py-2.5 sm:py-3 px-1 sm:px-2 text-center text-slate-400">{row.draws}</td>
                        <td className="py-2.5 sm:py-3 px-1 sm:px-2 text-center text-rose-400">{row.losses}</td>
                        <td className="py-2.5 sm:py-3 pl-1 sm:pl-2 pr-3.5 sm:pr-5 text-center font-semibold text-slate-300">
                          {row.goalDifference > 0
                            ? `+${row.goalDifference}`
                            : row.goalDifference}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* HISTÓRICO DE JOGOS DO DIA */}
          <div className="rounded-3xl bg-[#11161F] border border-white/[0.08] overflow-hidden">
            <div className="px-5 py-3.5 border-b border-white/[0.06] flex items-center justify-between">
              <h2 className="text-sm font-bold text-white">
                Jogos de Hoje ({roundMatches.length})
              </h2>
            </div>

            {roundMatches.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                Nenhum placar registrado ainda.
              </div>
            ) : (
              <div className="divide-y divide-white/[0.05]">
                {roundMatches.map((m, idx) => {
                  const home = lineMap.get(m.homeLineId);
                  const away = lineMap.get(m.awayLineId);
                  const gameNum = roundMatches.length - idx;
                  return (
                    <div
                      key={m.id}
                      className="px-4 sm:px-5 py-3 flex items-center justify-between gap-2"
                    >
                      <span className="text-[11px] font-bold text-slate-500 w-7 shrink-0">
                        #{gameNum}
                      </span>

                      <div className="flex-1 grid grid-cols-[1fr_auto_1fr] items-center gap-2 min-w-0">
                        <div className="flex justify-end min-w-0">
                          <LineBadge line={home} size="sm" />
                        </div>

                        <div className="px-3 py-1 rounded-xl bg-[#0B0F15] border border-white/10 font-display font-extrabold text-sm text-white">
                          {m.homeGoals} <span className="text-slate-500 mx-0.5">×</span>{' '}
                          {m.awayGoals}
                        </div>

                        <div className="flex justify-start min-w-0">
                          <LineBadge line={away} size="sm" />
                        </div>
                      </div>

                      {isAdmin && !isFinished && (
                        <button
                          onClick={() =>
                            runAction(
                              () => babaService.deleteMatch(user, m.id),
                              'Jogo removido'
                            )
                          }
                          title="Excluir jogo"
                          className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 transition cursor-pointer shrink-0"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ==================== ABA 2: LISTA & TIMES ==================== */}
      {subTab === 'lista' && (
        <div className="space-y-5">
          {/* LISTA EDITÁVEL DA GALERA */}
          <div className="p-4 sm:p-5 rounded-3xl bg-[#11161F] border border-white/[0.08] space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-bold text-white">
                  Lista de Hoje ({presentPlayers.length} atletas)
                </h2>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(rosterDraft);
                    pushToast('Lista copiada! 📋');
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-bold text-slate-200 cursor-pointer"
                >
                  <ClipboardCopy className="w-3.5 h-3.5 text-lime-400" />
                  Copiar Lista
                </button>

                {isAdmin && !isFinished && (
                  <button
                    type="button"
                    onClick={() => setEditingRoster((v) => !v)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-lime-400/15 text-lime-400 text-xs font-bold cursor-pointer"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    {editingRoster ? 'Fechar' : 'Editar Lista'}
                  </button>
                )}
              </div>
            </div>

            {editingRoster && isAdmin && !isFinished ? (
              <div className="space-y-3 pt-1">
                <textarea
                  rows={8}
                  value={rosterDraft}
                  onChange={(e) => setRosterDraft(e.target.value)}
                  placeholder="Cole ou digite 1 nome por linha..."
                  className="w-full px-3.5 py-2.5 rounded-2xl bg-[#0B0F15] border border-white/10 focus:border-lime-400 focus:outline-none text-sm text-white leading-relaxed"
                />
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-slate-400">
                    {parseRosterText(rosterDraft, snapshot.players).length} nomes reconhecidos
                    {' • '}use <code className="text-lime-400">(GK)</code> para goleiros
                  </span>
                  <button
                    type="button"
                    disabled={busyAction}
                    onClick={handleSaveRosterText}
                    className="px-4 py-2 rounded-xl bg-lime-400 hover:bg-lime-300 text-slate-950 font-extrabold text-xs cursor-pointer"
                  >
                    Salvar Lista
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {presentPlayers.length === 0 ? (
                  <span className="text-xs text-slate-500">Nenhum atleta na lista ainda.</span>
                ) : (
                  presentPlayers.map((p, idx) => (
                    <span
                      key={p.id}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-[#0B0F15] border border-white/[0.06] text-xs text-slate-200"
                    >
                      <span className="text-slate-500 font-bold">{idx + 1}.</span>
                      {p.nickname || p.name}
                      {p.position === 'Goleiro' && <span>🧤</span>}
                    </span>
                  ))
                )}
              </div>
            )}
          </div>

          {/* BARRA DE AÇÕES DAS LINHAS */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-bold text-white">Linhas ({participatingLines.length})</h2>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleCopyTeamsToWhatsApp}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#11161F] border border-white/10 text-xs font-bold text-slate-200 hover:text-white cursor-pointer"
              >
                <ClipboardCopy className="w-3.5 h-3.5 text-lime-400" />
                Copiar Times
              </button>

              {isAdmin && !isFinished && (
                <>
                  <button
                    type="button"
                    onClick={handleDrawTeams}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-lime-400 text-slate-950 text-xs font-extrabold cursor-pointer"
                  >
                    <Shuffle className="w-3.5 h-3.5" />
                    Sortear
                  </button>
                  <button
                    type="button"
                    onClick={() => setSwapMode((v) => !v)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold cursor-pointer ${
                      swapMode
                        ? 'bg-lime-400/15 border-lime-400 text-lime-400'
                        : 'bg-[#11161F] border-white/10 text-slate-300'
                    }`}
                  >
                    <ArrowLeftRight className="w-3.5 h-3.5" />
                    Trocar
                  </button>
                  <button
                    type="button"
                    onClick={() => setColorsOpen((v) => !v)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold cursor-pointer ${
                      colorsOpen
                        ? 'bg-lime-400/15 border-lime-400 text-lime-400'
                        : 'bg-[#11161F] border-white/10 text-slate-300'
                    }`}
                  >
                    <Palette className="w-3.5 h-3.5" />
                    Cores
                  </button>
                </>
              )}
            </div>
          </div>

          {/* CONFIGURAR CORES DAS LINHAS (COLAPSÁVEL) */}
          {colorsOpen && isAdmin && !isFinished && (
            <div className="p-4 rounded-3xl bg-[#11161F] border border-white/10 space-y-3">
              <div className="text-xs font-bold text-slate-300">
                Toque para ativar/desativar as linhas de hoje:
              </div>
              <div className="flex flex-wrap gap-2">
                {snapshot.lines.map((line) => {
                  const active = pelada.participatingLineIds.includes(line.id);
                  return (
                    <div
                      key={line.id}
                      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border ${
                        active
                          ? 'border-lime-400 bg-lime-400/10'
                          : 'border-white/10 bg-[#0B0F15] opacity-60'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => handleToggleParticipatingLine(line.id)}
                        className="inline-flex items-center gap-2 cursor-pointer"
                      >
                        <LineBadge line={line} size="sm" />
                        {active && <Check className="w-3.5 h-3.5 text-lime-400" />}
                      </button>
                      {snapshot.lines.length > 2 && !active && (
                        <button
                          type="button"
                          onClick={() =>
                            runAction(
                              () => babaService.deleteLine(user, line.id),
                              'Linha excluída'
                            )
                          }
                          className="text-slate-500 hover:text-rose-400 cursor-pointer ml-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>

              <form onSubmit={handleCreateCustomLine} className="flex flex-wrap gap-2 pt-2">
                <input
                  type="text"
                  value={newLineName}
                  onChange={(e) => setNewLineName(e.target.value)}
                  placeholder="Nova linha (ex: Verde)"
                  className="flex-1 min-w-[140px] px-3 py-2 rounded-xl bg-[#0B0F15] border border-white/10 text-xs text-white focus:outline-none focus:border-lime-400"
                />
                <select
                  value={newLineColorIdx}
                  onChange={(e) => setNewLineColorIdx(Number(e.target.value))}
                  className="px-3 py-2 rounded-xl bg-[#0B0F15] border border-white/10 text-xs text-white"
                >
                  {COLOR_PRESETS.map((c, idx) => (
                    <option key={c.label} value={idx}>
                      Cor: {c.label}
                    </option>
                  ))}
                </select>
                <button
                  type="submit"
                  className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-bold text-white cursor-pointer"
                >
                  + Criar Linha
                </button>
              </form>
            </div>
          )}

          {/* CARDS DOS TIMES */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {participatingLines.map((line) => {
              const pids = pelada.lineRosters[line.id] || [];
              const teamPlayers = pids
                .map((id) => playerMap.get(id))
                .filter((p): p is NonNullable<typeof p> => Boolean(p));

              return (
                <div
                  key={line.id}
                  className="rounded-3xl bg-[#11161F] border border-white/[0.08] overflow-hidden"
                >
                  <div
                    className="h-1.5 w-full"
                    style={{ backgroundColor: line.colorHex }}
                  />
                  <div className="px-4 py-3 border-b border-white/[0.06] flex items-center justify-between">
                    <LineBadge line={line} size="sm" />
                    <span className="text-xs font-bold text-slate-400">
                      {teamPlayers.length} atletas
                    </span>
                  </div>

                  <div className="p-3 space-y-1.5">
                    {teamPlayers.length === 0 ? (
                      <div className="py-4 text-center text-xs text-slate-500">
                        Sem jogadores — clique em Sortear
                      </div>
                    ) : (
                      teamPlayers.map((p, i) => (
                        <div
                          key={p.id}
                          className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl bg-[#0B0F15]"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-[11px] font-bold text-slate-500 w-4">
                              {i + 1}.
                            </span>
                            <img
                              src={p.photoUrl}
                              alt={p.name}
                              className="w-6 h-6 rounded-full object-cover shrink-0"
                            />
                            <span className="text-xs font-semibold text-white truncate">
                              {p.nickname || p.name}
                            </span>
                            {p.position === 'Goleiro' && (
                              <span className="text-[11px]" title="Goleiro">
                                🧤
                              </span>
                            )}
                          </div>

                          {swapMode && isAdmin && !isFinished && (
                            <select
                              value={line.id}
                              onChange={(e) => handleMovePlayerLine(p.id, e.target.value)}
                              className="px-2 py-1 rounded-lg bg-[#161D29] border border-white/10 text-[11px] text-slate-200 cursor-pointer"
                            >
                              {participatingLines.map((opt) => (
                                <option key={opt.id} value={opt.id}>
                                  {opt.shortName}
                                </option>
                              ))}
                            </select>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {unassignedPlayers.length > 0 && (
            <div className="p-4 rounded-2xl bg-[#11161F] border border-white/10 space-y-2">
              <div className="text-xs font-bold text-amber-300">
                Sem linha definida ({unassignedPlayers.length})
              </div>
              <div className="flex flex-wrap gap-2">
                {unassignedPlayers.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-[#0B0F15] text-xs text-white"
                  >
                    <span>{p.nickname || p.name}</span>
                    {isAdmin && !isFinished && (
                      <select
                        value=""
                        onChange={(e) => {
                          if (e.target.value) handleMovePlayerLine(p.id, e.target.value);
                        }}
                        className="px-1.5 py-0.5 rounded bg-[#161D29] text-[11px] text-lime-400"
                      >
                        <option value="">Mover...</option>
                        {participatingLines.map((opt) => (
                          <option key={opt.id} value={opt.id}>
                            {opt.name}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ==================== ABA 3: GOLS DA RODADA ==================== */}
      {subTab === 'gols' && (
        <div className="rounded-3xl bg-[#11161F] border border-white/[0.08] overflow-hidden">
          <div className="px-5 py-3.5 border-b border-white/[0.06] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Flame className="w-4 h-4 text-lime-400" />
              <h2 className="text-sm font-bold text-white">Artilharia de Hoje</h2>
            </div>
            <span className="text-xs text-slate-400">
              {isAdmin && !isFinished ? 'Toque em + para somar gols' : 'Gols marcados hoje'}
            </span>
          </div>

          {presentPlayers.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">
              Adicione jogadores na aba Lista & Times.
            </div>
          ) : (
            <div className="divide-y divide-white/[0.05]">
              {[...presentPlayers]
                .sort((a, b) => {
                  const diff = getPlayerGoalCount(b.id) - getPlayerGoalCount(a.id);
                  if (diff !== 0) return diff;
                  return (a.nickname || a.name).localeCompare(b.nickname || b.name, 'pt-BR');
                })
                .map((p) => {
                  const goals = getPlayerGoalCount(p.id);
                  const pLine = getPlayerLine(p.id);
                  return (
                    <div
                      key={p.id}
                      className="px-4 sm:px-5 py-2.5 flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <img
                          src={p.photoUrl}
                          alt={p.name}
                          className="w-8 h-8 rounded-full object-cover shrink-0"
                        />
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-white truncate">
                            {p.nickname || p.name}
                          </div>
                          {pLine && (
                            <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                              <span
                                className="w-2 h-2 rounded-full inline-block"
                                style={{ backgroundColor: pLine.colorHex }}
                              />
                              {pLine.name}
                            </div>
                          )}
                        </div>
                      </div>

                      {isAdmin && !isFinished ? (
                        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                          <button
                            type="button"
                            disabled={goals === 0 || busyAction}
                            onClick={() =>
                              runAction(() =>
                                babaService.setPlayerRoundGoals(
                                  user,
                                  pelada.id,
                                  p.id,
                                  Math.max(0, goals - 1)
                                )
                              )
                            }
                            className="w-9 h-9 sm:w-8 sm:h-8 rounded-xl bg-white/5 active:bg-white/15 flex items-center justify-center text-slate-300 disabled:opacity-30 cursor-pointer"
                          >
                            <Minus className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
                          </button>
                          <span
                            className={`w-7 text-center font-display font-extrabold text-base ${
                              goals > 0 ? 'text-lime-400' : 'text-slate-500'
                            }`}
                          >
                            {goals}
                          </span>
                          <button
                            type="button"
                            disabled={busyAction}
                            onClick={() =>
                              runAction(() =>
                                babaService.setPlayerRoundGoals(user, pelada.id, p.id, goals + 1)
                              )
                            }
                            className="w-9 h-9 sm:w-8 sm:h-8 rounded-xl bg-lime-400/15 active:bg-lime-400/30 flex items-center justify-center text-lime-400 cursor-pointer"
                          >
                            <Plus className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <span
                          className={`px-3 py-1 rounded-xl font-display font-extrabold text-sm ${
                            goals > 0
                              ? 'bg-lime-400/15 text-lime-400'
                              : 'bg-white/5 text-slate-500'
                          }`}
                        >
                          {goals} {goals === 1 ? 'gol' : 'gols'}
                        </span>
                      )}
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
