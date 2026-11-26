import React, { useMemo, useState } from 'react';
import { ListChecks, Plus, Search, SlidersHorizontal, Users } from 'lucide-react';
import { PlayerDetailView } from '../components/PlayerDetailView';
import { KeepOnlyPlayersModal } from '../components/KeepOnlyPlayersModal';
import { PlayerFormModal } from '../components/PlayerFormModal';
import {
  ChipGroup,
  EmptyState,
  PageHeader,
  PlayerAvatar,
  SkillMeter,
  cardClass,
  ghostBtn,
  primaryBtn,
} from '../components/ui';
import { useBaba } from '../context/BabaContext';
import { babaService } from '../services/babaService';

type StatusFilter = 'active' | 'inactive' | 'all';

const normalize = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

export const PlayersPage: React.FC = () => {
  const { snapshot, isAdmin, playerStatsMap, viewPlayerId, openPlayerProfile, runAction } = useBaba();
  const [status, setStatus] = useState<StatusFilter>('active');
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [keepOnlyOpen, setKeepOnlyOpen] = useState(false);
  const [ratingMode, setRatingMode] = useState(false);

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

  return (
    <div className="space-y-4">
      <PageHeader
        title="Jogadores"
        subtitle={`${activeCount} ativos • ${snapshot.players.length - activeCount} inativos`}
        actions={
          isAdmin && (
            <>
              <button
                onClick={() => setRatingMode((v) => !v)}
                className={`${ghostBtn} ${ratingMode ? '!border-lime-400 !text-lime-400' : ''}`}
              >
                <SlidersHorizontal className="w-4 h-4" /> Avaliação técnica
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
            className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-[#161616] border border-white/10 text-sm text-white focus:outline-none focus:border-lime-400"
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
            return (
              <div
                key={p.id}
                className={`${cardClass} !rounded-2xl p-3 flex items-center gap-3 transition hover:border-lime-400/30 ${
                  p.active ? '' : 'opacity-60'
                }`}
              >
                <button
                  onClick={() => openPlayerProfile(p.id)}
                  className="flex items-center gap-3 min-w-0 flex-1 text-left cursor-pointer"
                >
                  <PlayerAvatar player={p} size={44} />
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-white truncate">
                      {p.nickname || p.name}
                      {p.position === 'Goleiro' && <span className="ml-1">🧤</span>}
                    </div>
                    <div className="text-[11px] text-slate-500 truncate">
                      {p.position} • {st?.matchesPlayed ?? 0} jogos • {st?.goals ?? 0} gols
                    </div>
                  </div>
                </button>
                {isAdmin &&
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

      {keepOnlyOpen && <KeepOnlyPlayersModal onClose={() => setKeepOnlyOpen(false)} />}

      {creating && (
        <PlayerFormModal onClose={() => setCreating(false)} onSaved={(id) => openPlayerProfile(id)} />
      )}
    </div>
  );
};
