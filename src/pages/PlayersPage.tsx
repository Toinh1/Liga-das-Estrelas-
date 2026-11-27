import React, { useMemo, useState } from 'react';
import { Check, CheckSquare, ListChecks, Plus, Search, SlidersHorizontal, Trash2, Users, X } from 'lucide-react';
import { PlayerDetailView } from '../components/PlayerDetailView';
import { KeepOnlyPlayersModal } from '../components/KeepOnlyPlayersModal';
import { PlayerFormModal } from '../components/PlayerFormModal';
import { ChipGroup, EmptyState, GkTag, PageHeader, PlayerAvatar, SkillMeter, cardClass, ghostBtn, primaryBtn } from '../components/ui';
import { useBaba } from '../context/BabaContext';
import { babaService } from '../services/babaService';

type StatusFilter = 'active' | 'inactive' | 'all';

const normalize = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

export const PlayersPage: React.FC = () => {
  const { snapshot, user, isAdmin, playerStatsMap, viewPlayerId, openPlayerProfile, runAction, busyAction } = useBaba();
  const [status, setStatus] = useState<StatusFilter>('active');
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [keepOnlyOpen, setKeepOnlyOpen] = useState(false);
  const [ratingMode, setRatingMode] = useState(false);
  /** Modo de seleção para excluir vários jogadores de uma vez. */
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const players = useMemo(() => {
    if (!snapshot) return [];
    const q = normalize(search.trim());
    return snapshot.players.filter((p) => {
      if (status === 'active' && !p.active) return false;
      if (status === 'inactive' && p.active) return false;
      if (!q) return true;
      return normalize(`${p.name} ${p.nickname || ''}`).includes(q);
    });
  }, [snapshot, status, search]);

  if (!snapshot) return null;

  const viewed = viewPlayerId ? snapshot.players.find((p) => p.id === viewPlayerId) : undefined;
  if (viewed) return <PlayerDetailView player={viewed} onBack={() => openPlayerProfile(null)} />;

  const activeCount = snapshot.players.filter((p) => p.active).length;

  // Quem não pode ser excluído: o próprio admin e outros administradores
  const adminUserIds = new Set(snapshot.users.filter((u) => u.role === 'admin').map((u) => u.id));
  const lockReason = (p: (typeof snapshot.players)[number]) =>
    p.id === user?.playerId ? 'você' : p.userId && adminUserIds.has(p.userId) ? 'admin' : undefined;
  const selectable = players.filter((p) => !lockReason(p));
  const allSelected = selectable.length > 0 && selectable.every((p) => selected.has(p.id));

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleAll = () =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelected) selectable.forEach((p) => next.delete(p.id));
      else selectable.forEach((p) => next.add(p.id));
      return next;
    });

  const exitSelecting = () => {
    setSelecting(false);
    setSelected(new Set());
  };

  const deleteSelected = async () => {
    const chosen = snapshot.players.filter((p) => selected.has(p.id));
    if (chosen.length === 0) return;
    const withAccount = chosen.filter((p) => p.userId).length;
    const withHistory = chosen.filter((p) => babaService.playerHasHistory(p.id)).length;
    const msg = [
      `Excluir ${chosen.length} ${chosen.length === 1 ? 'jogador' : 'jogadores'}?`,
      '',
      chosen.slice(0, 12).map((p) => `• ${p.nickname || p.name}`).join('\n') + (chosen.length > 12 ? `\n• e mais ${chosen.length - 12}` : ''),
      '',
      withHistory ? `${withHistory} já ${withHistory === 1 ? 'jogou' : 'jogaram'}: os jogos ficam no histórico como "Jogador removido".` : '',
      withAccount ? `${withAccount} ${withAccount === 1 ? 'tem' : 'têm'} conta no app: o perfil sai do app (o login só sai pelo Firebase).` : '',
      'Esta ação não pode ser desfeita.',
    ]
      .filter((l, i, arr) => l !== '' || (arr[i - 1] ?? '') !== '')
      .join('\n');
    if (!window.confirm(msg)) return;
    const res = await runAction(
      () => babaService.deletePlayers(chosen.map((p) => p.id)),
      `${chosen.length} ${chosen.length === 1 ? 'jogador excluído' : 'jogadores excluídos'}`
    );
    if (res) exitSelecting();
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Jogadores"
        subtitle={`${activeCount} ativos • ${snapshot.players.length - activeCount} inativos`}
        actions={
          isAdmin && (
            <>
              <button
                onClick={() => {
                  setRatingMode((v) => !v);
                  exitSelecting();
                }}
                className={`${ghostBtn} ${ratingMode ? '!border-lime-400 !text-lime-400' : ''}`}
              >
                <SlidersHorizontal className="w-4 h-4" /> Avaliação técnica
              </button>
              <button
                onClick={() => (selecting ? exitSelecting() : (setSelecting(true), setRatingMode(false)))}
                className={`${ghostBtn} ${selecting ? '!border-rose-400 !text-rose-300' : ''}`}
              >
                <CheckSquare className="w-4 h-4" /> {selecting ? 'Cancelar seleção' : 'Selecionar'}
              </button>
              <button onClick={() => setKeepOnlyOpen(true)} className={ghostBtn}>
                <ListChecks className="w-4 h-4" /> Manter só uma lista
              </button>
              <button onClick={() => setCreating(true)} className={primaryBtn}>
                <Plus className="w-4 h-4" /> Jogador
              </button>
            </>
          )
        }
      />

      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome ou apelido"
            className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-[#131613] border border-white/10 text-sm text-white focus:outline-none focus:border-lime-400"
          />
        </div>
        <ChipGroup
          value={status}
          onChange={setStatus}
          options={[
            { id: 'active', label: 'Ativos' },
            { id: 'inactive', label: 'Inativos' },
            { id: 'all', label: 'Todos' },
          ]}
        />
      </div>

      {selecting && isAdmin && (
        <div className="flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl bg-rose-500/[0.06] border border-rose-400/25">
          <span className="text-xs text-slate-200">
            Toque nos jogadores para marcar. <strong className="text-white">{selected.size}</strong> selecionado(s).
          </span>
          <button
            onClick={toggleAll}
            disabled={selectable.length === 0}
            className="shrink-0 text-xs font-semibold text-white underline underline-offset-4 cursor-pointer disabled:opacity-40"
          >
            {allSelected ? 'Desmarcar todos' : `Selecionar todos (${selectable.length})`}
          </button>
        </div>
      )}

      {ratingMode && isAdmin && (
        <div className="px-4 py-3 rounded-2xl bg-lime-400/[0.06] border border-lime-400/25 text-xs text-lime-200">
          Toque no número para definir o nível: 1 = melhor, 6 = mais fraco. O sorteio monta os
          times por potes de nível, e o nível só é visível para administradores.
        </div>
      )}

      {players.length === 0 ? (
        <EmptyState
          icon={<Users className="w-9 h-9" />}
          title="Nenhum jogador encontrado"
          text={search ? 'Tente outro nome.' : 'Cadastre os participantes do baba.'}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {players.map((p) => {
            const st = playerStatsMap[p.id];
            const lock = lockReason(p);
            const isSelected = selected.has(p.id);
            return (
              <div
                key={p.id}
                className={`${cardClass} !rounded-2xl p-3 flex items-center gap-3 transition ${
                  selecting && isSelected ? '!border-rose-400/70 bg-rose-500/[0.07]' : 'hover:border-lime-400/30'
                } ${p.active ? '' : 'opacity-60'}`}
              >
                {selecting && (
                  <span
                    aria-hidden
                    className={`w-5 h-5 shrink-0 rounded-md border flex items-center justify-center ${
                      lock ? 'border-white/10 opacity-40' : isSelected ? 'bg-rose-500 border-rose-500 text-white' : 'border-white/30'
                    }`}
                  >
                    {isSelected && <Check className="w-3.5 h-3.5" strokeWidth={3} />}
                  </span>
                )}
                <button
                  onClick={() => (selecting ? !lock && toggle(p.id) : openPlayerProfile(p.id))}
                  disabled={selecting && Boolean(lock)}
                  role={selecting ? 'checkbox' : undefined}
                  aria-checked={selecting ? isSelected : undefined}
                  className="flex items-center gap-3 min-w-0 flex-1 text-left cursor-pointer disabled:cursor-not-allowed"
                >
                  <PlayerAvatar player={p} size={44} />
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-white truncate">
                      {p.nickname || p.name}
                      {p.position === 'Goleiro' && <span className="ml-1 inline-flex align-middle"><GkTag /></span>}
                    </div>
                    <div className="text-[11px] text-slate-500 truncate">
                      {selecting && lock
                        ? lock === 'você'
                          ? 'Você (não pode ser excluído)'
                          : 'Administrador (remova o acesso antes)'
                        : `${p.position} • ${st?.matchesPlayed ?? 0} jogos • ${st?.goals ?? 0} gols`}
                    </div>
                  </div>
                </button>
                {isAdmin && !selecting &&
                  (ratingMode ? (
                    <SkillMeter
                      value={p.skillLevel}
                      size="md"
                      onChange={(v) =>
                        v !== p.skillLevel && runAction(() => babaService.setPlayerSkill(p.id, v))
                      }
                    />
                  ) : (
                    <div className="text-right shrink-0">
                      <SkillMeter value={p.skillLevel} />
                    </div>
                  ))}
              </div>
            );
          })}
        </div>
      )}

      {selecting && isAdmin && (
        <div className="sticky bottom-[calc(4.75rem+env(safe-area-inset-bottom,0px))] lg:bottom-4 z-10">
          <div className="flex gap-2 p-2 rounded-xl bg-[#0E110E]/95 border border-white/10 shadow-[0_8px_24px_-8px_rgba(0,0,0,0.8)] backdrop-blur">
            <button
              onClick={exitSelecting}
              className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-lg border border-white/15 text-slate-200 hover:bg-white/[0.06] text-sm font-semibold cursor-pointer"
            >
              <X className="w-4 h-4" /> Cancelar
            </button>
            <button
              onClick={deleteSelected}
              disabled={busyAction || selected.size === 0}
              className="flex-1 inline-flex items-center justify-center gap-2 py-3 rounded-lg bg-rose-500 hover:bg-rose-400 text-white text-sm font-bold transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Trash2 className="w-4 h-4" />
              {selected.size === 0 ? 'Selecione jogadores' : `Excluir ${selected.size} ${selected.size === 1 ? 'jogador' : 'jogadores'}`}
            </button>
          </div>
        </div>
      )}

      {keepOnlyOpen && <KeepOnlyPlayersModal onClose={() => setKeepOnlyOpen(false)} />}

      {creating && (
        <PlayerFormModal onClose={() => setCreating(false)} onSaved={(id) => openPlayerProfile(id)} />
      )}
    </div>
  );
};
