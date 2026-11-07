import React, { useMemo, useState } from 'react';
import {
  Camera,
  Edit3,
  ExternalLink,
  Plus,
  Trash2,
  Trophy,
  X,
} from 'lucide-react';
import { LineBadge } from '../components/LineBadge';
import { useBaba } from '../context/BabaContext';
import { babaService } from '../services/babaService';
import type { Player, PlayerPosition } from '../types/domain';
import { fileToCompressedDataUrl } from '../utils/mediaAssets';
import { computeAllTimeLineStandings, formatShortDateBR } from '../utils/statsEngine';

type RankTab = 'jogadores' | 'linhas' | 'historico';
type SortMetric = 'goals' | 'matchWins' | 'totalAwards' | 'participations';

const POSITIONS: PlayerPosition[] = ['Goleiro', 'Defensor', 'Meia', 'Atacante'];

export const RankingPage: React.FC = () => {
  const {
    user,
    isAdmin,
    snapshot,
    playerStatsMap,
    setCeremonyPeladaId,
    setSelectedPeladaId,
    setActiveSection,
    runAction,
    busyAction,
  } = useBaba();

  const [tab, setTab] = useState<RankTab>('jogadores');
  const [sortBy, setSortBy] = useState<SortMetric>('goals');

  // Modal de Ficha / Edição / Novo Jogador
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [editingPlayerMode, setEditingPlayerMode] = useState<'create' | 'edit' | null>(null);
  const [formName, setFormName] = useState('');
  const [formNick, setFormNick] = useState('');
  const [formPos, setFormPos] = useState<PlayerPosition>('Meia');
  const [formPhoto, setFormPhoto] = useState('');

  const sortedPlayers = useMemo(() => {
    if (!snapshot) return [];
    return [...snapshot.players].sort((a, b) => {
      const sa = playerStatsMap[a.id];
      const sb = playerStatsMap[b.id];
      const va = sa ? sa[sortBy] : 0;
      const vb = sb ? sb[sortBy] : 0;
      if (vb !== va) return vb - va;
      if ((sb?.goals || 0) !== (sa?.goals || 0)) return (sb?.goals || 0) - (sa?.goals || 0);
      return (a.nickname || a.name).localeCompare(b.nickname || b.name, 'pt-BR');
    });
  }, [snapshot, playerStatsMap, sortBy]);

  if (!snapshot || !user) return null;

  const allTimeLines = computeAllTimeLineStandings(
    snapshot.peladas,
    snapshot.lines,
    snapshot.matches
  );
  const lineMap = new Map(snapshot.lines.map((l) => [l.id, l]));

  const openCreateModal = () => {
    setSelectedPlayer(null);
    setFormName('');
    setFormNick('');
    setFormPos('Meia');
    setFormPhoto('');
    setEditingPlayerMode('create');
  };

  const openEditFromSelected = (p: Player) => {
    setFormName(p.name);
    setFormNick(p.nickname || '');
    setFormPos(p.position);
    setFormPhoto(p.photoUrl);
    setEditingPlayerMode('edit');
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const dataUrl = await fileToCompressedDataUrl(file, 480, 0.85);
    setFormPhoto(dataUrl);
  };

  const handleSavePlayer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) return;

    if (editingPlayerMode === 'create') {
      await runAction(
        () =>
          babaService.createPlayer(user, {
            name: formName.trim(),
            nickname: formNick.trim() || undefined,
            position: formPos,
            photoUrl: formPhoto || undefined,
          }),
        'Jogador cadastrado! ⚽'
      );
    } else if (editingPlayerMode === 'edit' && selectedPlayer) {
      await runAction(
        () =>
          babaService.updatePlayer(user, selectedPlayer.id, {
            name: formName.trim(),
            nickname: formNick.trim() || undefined,
            position: formPos,
            photoUrl: formPhoto || undefined,
          }),
        'Jogador atualizado!'
      );
    }

    setEditingPlayerMode(null);
    setSelectedPlayer(null);
  };

  return (
    <div className="space-y-5">
      {/* CABEÇALHO */}
      <div className="p-4 sm:p-5 rounded-3xl bg-[#11161F] border border-white/[0.08] flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg sm:text-xl font-extrabold text-white">Ranking Geral</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            {snapshot.players.length} atletas • {snapshot.peladas.length} pelada(s)
          </p>
        </div>

        {isAdmin && tab === 'jogadores' && (
          <button
            onClick={openCreateModal}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-lime-400 hover:bg-lime-300 text-slate-950 font-extrabold text-xs cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Jogador
          </button>
        )}
      </div>

      {/* 3 ABAS SIMPLES */}
      <div className="grid grid-cols-3 gap-1.5 p-1.5 rounded-2xl bg-[#11161F] border border-white/[0.07]">
        <button
          onClick={() => setTab('jogadores')}
          className={`py-2.5 px-2 rounded-xl text-xs sm:text-sm font-bold transition cursor-pointer ${
            tab === 'jogadores'
              ? 'bg-lime-400 text-slate-950'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          ⚽ Jogadores
        </button>
        <button
          onClick={() => setTab('linhas')}
          className={`py-2.5 px-2 rounded-xl text-xs sm:text-sm font-bold transition cursor-pointer ${
            tab === 'linhas'
              ? 'bg-lime-400 text-slate-950'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          👕 Linhas
        </button>
        <button
          onClick={() => setTab('historico')}
          className={`py-2.5 px-2 rounded-xl text-xs sm:text-sm font-bold transition cursor-pointer ${
            tab === 'historico'
              ? 'bg-lime-400 text-slate-950'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          📅 Sábados
        </button>
      </div>

      {/* ==================== ABA 1: JOGADORES ==================== */}
      {tab === 'jogadores' && (
        <div className="space-y-3">
          {/* Filtro rápido de ordenação */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            {[
              { id: 'goals' as SortMetric, label: 'Gols' },
              { id: 'matchWins' as SortMetric, label: 'Vitórias' },
              { id: 'totalAwards' as SortMetric, label: 'Troféus' },
              { id: 'participations' as SortMetric, label: 'Presenças' },
            ].map((opt) => (
              <button
                key={opt.id}
                onClick={() => setSortBy(opt.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold shrink-0 cursor-pointer ${
                  sortBy === opt.id
                    ? 'bg-lime-400/15 text-lime-400 border border-lime-400/40'
                    : 'bg-[#11161F] text-slate-400 border border-white/[0.06]'
                }`}
              >
                Ordenar por {opt.label}
              </button>
            ))}
          </div>

          <div className="rounded-3xl bg-[#11161F] border border-white/[0.08] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-slate-500 border-b border-white/[0.05]">
                    <th className="text-left py-2.5 pl-4 pr-2 w-8">#</th>
                    <th className="text-left py-2.5 px-2">Atleta</th>
                    <th className="text-center py-2.5 px-2">Gols</th>
                    <th className="text-center py-2.5 px-2">Vit</th>
                    <th className="text-center py-2.5 px-2">🏆</th>
                    <th className="text-center py-2.5 pl-2 pr-4">Pel</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04]">
                  {sortedPlayers.map((p, idx) => {
                    const st = playerStatsMap[p.id];
                    return (
                      <tr
                        key={p.id}
                        onClick={() => {
                          setSelectedPlayer(p);
                          setEditingPlayerMode(null);
                        }}
                        className="hover:bg-white/[0.03] transition cursor-pointer"
                      >
                        <td className="py-3 pl-4 pr-2 text-xs font-bold text-slate-500">
                          {idx + 1}º
                        </td>
                        <td className="py-3 px-2">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <img
                              src={p.photoUrl}
                              alt={p.name}
                              className="w-8 h-8 rounded-full object-cover shrink-0"
                            />
                            <div className="min-w-0">
                              <div className="font-bold text-white text-sm truncate">
                                {p.nickname || p.name}
                              </div>
                              <div className="text-[11px] text-slate-500">{p.position}</div>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-2 text-center font-display font-extrabold text-lime-400">
                          {st?.goals ?? 0}
                        </td>
                        <td className="py-3 px-2 text-center font-semibold text-emerald-400">
                          {st?.matchWins ?? 0}
                        </td>
                        <td className="py-3 px-2 text-center font-semibold text-yellow-400">
                          {st?.totalAwards ?? 0}
                        </td>
                        <td className="py-3 pl-2 pr-4 text-center text-slate-400 text-xs">
                          {st?.participations ?? 0}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ==================== ABA 2: LINHAS ==================== */}
      {tab === 'linhas' && (
        <div className="rounded-3xl bg-[#11161F] border border-white/[0.08] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-slate-500 border-b border-white/[0.05]">
                  <th className="text-left py-2.5 pl-4 pr-2 w-8">#</th>
                  <th className="text-left py-2.5 px-2">Linha</th>
                  <th className="text-center py-2.5 px-2">Títulos</th>
                  <th className="text-center py-2.5 px-2">PTS</th>
                  <th className="text-center py-2.5 px-2">V</th>
                  <th className="text-center py-2.5 pl-2 pr-4">SG</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {allTimeLines.map((row, idx) => (
                  <tr key={row.lineId}>
                    <td className="py-3 pl-4 pr-2 text-xs font-bold text-slate-500">
                      {idx + 1}º
                    </td>
                    <td className="py-3 px-2">
                      <LineBadge line={row} size="sm" />
                    </td>
                    <td className="py-3 px-2 text-center font-extrabold text-yellow-400">
                      {row.titles || 0} 🏆
                    </td>
                    <td className="py-3 px-2 text-center font-display font-extrabold text-lime-400">
                      {row.points}
                    </td>
                    <td className="py-3 px-2 text-center text-emerald-400">{row.wins}</td>
                    <td className="py-3 pl-2 pr-4 text-center text-slate-300">
                      {row.goalDifference > 0 ? `+${row.goalDifference}` : row.goalDifference}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ==================== ABA 3: HISTÓRICO DE SÁBADOS ==================== */}
      {tab === 'historico' && (
        <div className="rounded-3xl bg-[#11161F] border border-white/[0.08] divide-y divide-white/[0.05] overflow-hidden">
          {snapshot.peladas.length === 0 ? (
            <div className="p-10 text-center text-xs text-slate-500">
              Nenhuma pelada registrada ainda.
            </div>
          ) : (
            snapshot.peladas.map((p) => {
              const champ = p.championLineId ? lineMap.get(p.championLineId) : undefined;
              const matchCount = snapshot.matches.filter((m) => m.peladaId === p.id).length;
              return (
                <div
                  key={p.id}
                  className="p-4 sm:px-5 flex flex-wrap items-center justify-between gap-3"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-white text-sm">{p.title}</span>
                      <span className="text-xs text-slate-500">{formatShortDateBR(p.date)}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-400">
                      <span>{matchCount} jogo(s)</span>
                      {champ && (
                        <>
                          <span>•</span>
                          <span className="text-yellow-400 font-semibold">
                            🏆 {champ.name}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        setSelectedPeladaId(p.id);
                        setActiveSection('hoje');
                      }}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-bold text-slate-200 cursor-pointer"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      Abrir
                    </button>
                    {p.status === 'finished' && (
                      <button
                        onClick={() => setCeremonyPeladaId(p.id)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-yellow-400/15 text-yellow-300 text-xs font-bold cursor-pointer"
                      >
                        <Trophy className="w-3.5 h-3.5" />
                        Resumo
                      </button>
                    )}
                    {isAdmin && (
                      <button
                        onClick={() => {
                          if (window.confirm(`Excluir ${p.title} permanentemente?`)) {
                            runAction(
                              () => babaService.deletePelada(user, p.id),
                              'Pelada excluída'
                            );
                          }
                        }}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ==================== MODAL FICHA / EDIÇÃO DE JOGADOR ==================== */}
      {(selectedPlayer || editingPlayerMode === 'create') && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="w-full max-w-md rounded-3xl bg-[#121720] border border-white/10 overflow-hidden shadow-2xl my-auto animate-fade-in">
            <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
              <h2 className="text-sm font-bold text-white">
                {editingPlayerMode === 'create'
                  ? 'Novo Jogador'
                  : editingPlayerMode === 'edit'
                  ? 'Editar Jogador'
                  : 'Ficha do Atleta'}
              </h2>
              <button
                onClick={() => {
                  setSelectedPlayer(null);
                  setEditingPlayerMode(null);
                }}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {editingPlayerMode ? (
              <form onSubmit={handleSavePlayer} className="p-5 space-y-4">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-2xl bg-[#0B0F15] border border-white/10 overflow-hidden flex items-center justify-center shrink-0">
                    {formPhoto ? (
                      <img src={formPhoto} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <Camera className="w-6 h-6 text-slate-500" />
                    )}
                  </div>
                  <label className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-bold text-white cursor-pointer">
                    Escolher Foto
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handlePhotoUpload}
                      className="hidden"
                    />
                  </label>
                </div>

                <div>
                  <label className="block text-xs text-slate-400 mb-1">Nome</label>
                  <input
                    type="text"
                    required
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#0B0F15] border border-white/10 text-sm text-white focus:outline-none focus:border-lime-400"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Apelido (opcional)</label>
                    <input
                      type="text"
                      value={formNick}
                      onChange={(e) => setFormNick(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-[#0B0F15] border border-white/10 text-sm text-white focus:outline-none focus:border-lime-400"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Posição</label>
                    <select
                      value={formPos}
                      onChange={(e) => setFormPos(e.target.value as PlayerPosition)}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-[#0B0F15] border border-white/10 text-sm text-white"
                    >
                      {POSITIONS.map((pos) => (
                        <option key={pos} value={pos}>
                          {pos}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={busyAction}
                  className="w-full py-2.5 rounded-2xl bg-lime-400 hover:bg-lime-300 text-slate-950 font-extrabold text-sm cursor-pointer"
                >
                  Salvar
                </button>
              </form>
            ) : (
              selectedPlayer &&
              (() => {
                const st = playerStatsMap[selectedPlayer.id];
                return (
                  <div className="p-5 space-y-5">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3.5">
                        <img
                          src={selectedPlayer.photoUrl}
                          alt={selectedPlayer.name}
                          className="w-16 h-16 rounded-2xl object-cover border border-white/15"
                        />
                        <div>
                          <h3 className="text-base font-extrabold text-white">
                            {selectedPlayer.nickname || selectedPlayer.name}
                          </h3>
                          {selectedPlayer.nickname && (
                            <div className="text-xs text-slate-400">{selectedPlayer.name}</div>
                          )}
                          <span className="inline-block mt-1 px-2 py-0.5 rounded bg-white/10 text-[11px] font-semibold text-lime-400">
                            {selectedPlayer.position}
                          </span>
                        </div>
                      </div>

                      {isAdmin && (
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => openEditFromSelected(selectedPlayer)}
                            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 cursor-pointer"
                            title="Editar"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          {selectedPlayer.id !== user.playerId && (
                            <button
                              onClick={async () => {
                                if (window.confirm(`Excluir ${selectedPlayer.name}?`)) {
                                  await runAction(
                                    () => babaService.deletePlayer(user, selectedPlayer.id),
                                    'Jogador removido'
                                  );
                                  setSelectedPlayer(null);
                                }
                              }}
                              className="p-2 rounded-xl bg-white/5 hover:bg-rose-500/20 text-rose-400 cursor-pointer"
                              title="Excluir"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-4 gap-2 text-center">
                      <div className="p-2.5 rounded-2xl bg-[#0B0F15] border border-white/5">
                        <div className="font-display font-extrabold text-lg text-white">
                          {st?.participations ?? 0}
                        </div>
                        <div className="text-[10px] text-slate-500">Peladas</div>
                      </div>
                      <div className="p-2.5 rounded-2xl bg-[#0B0F15] border border-white/5">
                        <div className="font-display font-extrabold text-lg text-lime-400">
                          {st?.goals ?? 0}
                        </div>
                        <div className="text-[10px] text-slate-500">Gols</div>
                      </div>
                      <div className="p-2.5 rounded-2xl bg-[#0B0F15] border border-white/5">
                        <div className="font-display font-extrabold text-lg text-emerald-400">
                          {st?.matchWins ?? 0}
                        </div>
                        <div className="text-[10px] text-slate-500">Vitórias</div>
                      </div>
                      <div className="p-2.5 rounded-2xl bg-[#0B0F15] border border-white/5">
                        <div className="font-display font-extrabold text-lg text-yellow-400">
                          {st?.totalAwards ?? 0}
                        </div>
                        <div className="text-[10px] text-slate-500">Prêmios</div>
                      </div>
                    </div>

                    {st && st.history.length > 0 && (
                      <div className="space-y-2">
                        <div className="text-xs font-bold text-slate-400">Últimas Peladas</div>
                        <div className="max-h-44 overflow-y-auto space-y-1.5">
                          {st.history.slice(0, 8).map((h) => (
                            <div
                              key={h.peladaId}
                              className="px-3 py-2 rounded-xl bg-[#0B0F15] flex items-center justify-between text-xs"
                            >
                              <div>
                                <span className="font-semibold text-white">{h.peladaTitle}</span>
                                <span className="text-slate-500 ml-1.5">
                                  {formatShortDateBR(h.date)}
                                </span>
                              </div>
                              <div className="flex items-center gap-2 text-slate-300">
                                {h.goals > 0 && (
                                  <span className="text-lime-400 font-bold">{h.goals}G</span>
                                )}
                                <span>{h.matchWins}V</span>
                                {h.wonChampionship && <span>🏆</span>}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()
            )}
          </div>
        </div>
      )}
    </div>
  );
};
