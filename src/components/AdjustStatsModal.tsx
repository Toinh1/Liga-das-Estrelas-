import React, { useMemo, useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import { useBaba } from '../context/BabaContext';
import { babaService } from '../services/babaService';
import type { Pelada } from '../types/domain';
import { formatShortDateBR } from '../utils/statsEngine';
import { Modal, PlayerAvatar, inputClass, playerLabel, primaryBtn } from './ui';

/**
 * Admin corrige gols e assistências de um jogador numa pelada.
 * Os placares dos jogos não mudam; a diferença vira um ajuste manual.
 */
export const AdjustStatsModal: React.FC<{ playerId: string; peladas: Pelada[]; onClose: () => void }> = ({
  playerId,
  peladas,
  onClose,
}) => {
  const { snapshot, runAction, busyAction } = useBaba();

  // Peladas em que o jogador jogou (ou já tem gols/ajustes), mais recentes primeiro
  const options = useMemo(() => {
    if (!snapshot) return [];
    const withEntries = new Set(snapshot.goals.filter((g) => g.playerId === playerId).map((g) => g.peladaId));
    return [...peladas]
      .filter(
        (p) =>
          p.presentPlayerIds.includes(playerId) || p.confirmedPlayerIds.includes(playerId) || withEntries.has(p.id)
      )
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [snapshot, peladas, playerId]);

  const [peladaId, setPeladaId] = useState(options[0]?.id ?? '');

  const current = useMemo(() => {
    if (!snapshot || !peladaId) return null;
    let fromGoals = 0;
    let fromAssists = 0;
    for (const m of snapshot.matches) {
      if (m.peladaId !== peladaId) continue;
      for (const s of [...m.homeScorers, ...m.awayScorers]) if (s.playerId === playerId) fromGoals += s.count;
      for (const a of [...m.homeAssists, ...m.awayAssists]) if (a.playerId === playerId) fromAssists += a.count;
    }
    const total = snapshot.goals.find((g) => g.peladaId === peladaId && g.playerId === playerId);
    return { fromGoals, fromAssists, goals: total?.goals ?? 0, assists: total?.assists ?? 0 };
  }, [snapshot, peladaId, playerId]);

  const [edits, setEdits] = useState<Record<string, { goals: number; assists: number }>>({});
  const value = edits[peladaId] ?? (current ? { goals: current.goals, assists: current.assists } : { goals: 0, assists: 0 });
  const setField = (field: 'goals' | 'assists', n: number) =>
    setEdits((prev) => ({ ...prev, [peladaId]: { ...value, [field]: Math.max(0, Math.min(99, n)) } }));

  if (!snapshot) return null;
  const player = snapshot.players.find((p) => p.id === playerId);

  const save = async () => {
    const res = await runAction(
      () => babaService.setPlayerPeladaTotals(peladaId, playerId, value.goals, value.assists),
      'Ranking atualizado!'
    );
    if (res) onClose();
  };

  const Stepper: React.FC<{ label: string; field: 'goals' | 'assists'; fromMatches: number }> = ({
    label,
    field,
    fromMatches,
  }) => {
    const v = value[field];
    const diff = v - fromMatches;
    return (
      <div className="p-3.5 rounded-2xl bg-[#1F1F1F] border border-white/[0.06] space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-bold text-white">{label}</span>
          <span className="text-[10px] text-slate-500">
            pelos jogos: {fromMatches}
            {diff !== 0 && (
              <span className={diff > 0 ? 'text-lime-400' : 'text-rose-400'}>
                {' '}• ajuste {diff > 0 ? `+${diff}` : diff}
              </span>
            )}
          </span>
        </div>
        <div className="flex items-center justify-center gap-4">
          <button
            type="button"
            onClick={() => setField(field, v - 1)}
            disabled={v <= 0}
            aria-label={`Diminuir ${label}`}
            className="w-11 h-11 rounded-full bg-white/[0.06] text-white flex items-center justify-center cursor-pointer disabled:opacity-30"
          >
            <Minus className="w-5 h-5" />
          </button>
          <span className="w-12 text-center font-display font-extrabold text-3xl text-white">{v}</span>
          <button
            type="button"
            onClick={() => setField(field, v + 1)}
            aria-label={`Aumentar ${label}`}
            className="w-11 h-11 rounded-full bg-lime-400 text-slate-950 flex items-center justify-center cursor-pointer"
          >
            <Plus className="w-5 h-5" />
          </button>
        </div>
      </div>
    );
  };

  const changed = current && (value.goals !== current.goals || value.assists !== current.assists);

  return (
    <Modal title="Editar números do ranking" onClose={onClose}>
      <div className="p-4 sm:p-5 space-y-4">
        <div className="flex items-center gap-3">
          <PlayerAvatar player={player} size={40} />
          <div className="min-w-0">
            <div className="text-sm font-bold text-white truncate">{playerLabel(player)}</div>
            <div className="text-[11px] text-slate-500">Corrija gols e assistências de uma pelada</div>
          </div>
        </div>

        {options.length === 0 ? (
          <p className="text-xs text-slate-400">Este jogador não participou de nenhuma pelada no período escolhido.</p>
        ) : (
          <>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Pelada</label>
              <select value={peladaId} onChange={(e) => setPeladaId(e.target.value)} className={inputClass}>
                {options.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title} — {formatShortDateBR(p.date)}
                  </option>
                ))}
              </select>
            </div>

            {current && (
              <div className="grid grid-cols-1 gap-2.5">
                <Stepper label="Gols" field="goals" fromMatches={current.fromGoals} />
                <Stepper label="Assistências" field="assists" fromMatches={current.fromAssists} />
              </div>
            )}

            <p className="text-[11px] text-slate-500 leading-relaxed">
              Os placares dos jogos não mudam. A diferença fica salva como ajuste e os pontos do ranking são recalculados
              na hora. Para corrigir vitórias, edite o placar do jogo na tela da pelada.
            </p>

            <button type="button" disabled={busyAction || !changed} onClick={save} className={`${primaryBtn} w-full !py-3`}>
              Salvar alteração
            </button>
          </>
        )}
      </div>
    </Modal>
  );
};
