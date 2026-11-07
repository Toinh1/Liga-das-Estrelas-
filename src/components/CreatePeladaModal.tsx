import React, { useEffect, useState } from 'react';
import { Check, ClipboardCopy, Trash2, X } from 'lucide-react';
import { useBaba } from '../context/BabaContext';
import { babaService } from '../services/babaService';
import { formatPlayersToEditableText, parseRosterText } from '../utils/rosterParser';
import { getSaturdayISO } from '../utils/statsEngine';
import { LineBadge } from './LineBadge';

export const CreatePeladaModal: React.FC = () => {
  const {
    user,
    snapshot,
    openCreatePeladaModal,
    setOpenCreatePeladaModal,
    runAction,
    setSelectedPeladaId,
    setActiveSection,
    pushToast,
    busyAction,
  } = useBaba();

  const [title, setTitle] = useState('');
  const [date, setDate] = useState(getSaturdayISO(0));
  const [selectedLineIds, setSelectedLineIds] = useState<string[]>([]);
  const [rosterText, setRosterText] = useState('');

  useEffect(() => {
    if (!openCreatePeladaModal || !snapshot) return;
    const nextNum = String(snapshot.peladas.length + 1).padStart(2, '0');
    setTitle(`Pelada #${nextNum}`);
    setDate(getSaturdayISO(0));
    setSelectedLineIds(snapshot.lines.slice(0, 4).map((l) => l.id));
    setRosterText(
      formatPlayersToEditableText(
        snapshot.players.map((p) => ({ name: p.nickname || p.name, position: p.position }))
      )
    );
  }, [openCreatePeladaModal, snapshot]);

  if (!openCreatePeladaModal || !snapshot || !user) return null;

  const parsedItems = parseRosterText(rosterText, snapshot.players);

  const toggleLine = (lineId: string) => {
    setSelectedLineIds((prev) =>
      prev.includes(lineId) ? prev.filter((id) => id !== lineId) : [...prev, lineId]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedLineIds.length < 2) {
      alert('Escolha pelo menos 2 linhas.');
      return;
    }

    const updatedSnap = await runAction(
      async () => {
        const ensured = await babaService.ensurePlayersFromRoster(
          user,
          parsedItems.map((it) => ({
            name: it.name,
            position: it.position,
            matchedPlayerId: it.matchedPlayerId,
          }))
        );

        const confirmedIds = ensured.playerIds;
        const rosters: Record<string, string[]> = {};
        for (const lid of selectedLineIds) rosters[lid] = [];

        // Sorteia os jogadores confirmados equilibradamente entre as linhas escolhidas
        const selectedPlayers = ensured.snapshot.players.filter((p) =>
          confirmedIds.includes(p.id)
        );
        const goalkeepers = selectedPlayers
          .filter((p) => p.position === 'Goleiro')
          .sort(() => Math.random() - 0.5);
        const outfield = selectedPlayers
          .filter((p) => p.position !== 'Goleiro')
          .sort(() => Math.random() - 0.5);

        [...goalkeepers, ...outfield].forEach((p, idx) => {
          const targetLine = selectedLineIds[idx % selectedLineIds.length];
          rosters[targetLine].push(p.id);
        });

        const perLine = Math.max(4, Math.ceil(confirmedIds.length / selectedLineIds.length) || 6);

        return babaService.createPelada(user, {
          title: title.trim() || 'Pelada de Sábado',
          date,
          time: '07:30',
          location: 'Arena Liga das Estrelas',
          status: 'in_progress',
          expectedPlayers: confirmedIds.length || 24,
          lineCount: selectedLineIds.length,
          playersPerLine: perLine,
          participatingLineIds: selectedLineIds,
          lineRosters: rosters,
          confirmedPlayerIds: confirmedIds,
          presentPlayerIds: confirmedIds,
          allowPlayerUploads: true,
        });
      },
      'Pelada iniciada! ⚽'
    );

    if (updatedSnap && 'peladas' in updatedSnap) {
      const newest = updatedSnap.peladas[0];
      if (newest) setSelectedPeladaId(newest.id);
      setOpenCreatePeladaModal(false);
      setActiveSection('hoje');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm sm:p-4 overflow-y-auto">
      <div className="w-full max-w-lg bg-[#121720] border border-white/10 rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col animate-fade-in">
        <div className="flex items-center justify-between px-5 py-3.5 sm:py-4 border-b border-white/10 shrink-0">
          <h2 className="text-base font-bold text-white">⚽ Nova Pelada de Sábado</h2>
          <button
            onClick={() => setOpenCreatePeladaModal(false)}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 sm:p-5 space-y-4 sm:space-y-5 overflow-y-auto flex-1">
          {/* 1. Nome e Data */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">Identificação</label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#0B0F15] border border-white/10 text-sm text-white focus:outline-none focus:border-lime-400"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">Data</label>
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#0B0F15] border border-white/10 text-sm text-white focus:outline-none focus:border-lime-400"
              />
            </div>
          </div>

          {/* 2. Quais linhas vão jogar */}
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-2">
              Linhas do Dia ({selectedLineIds.length} equipes)
            </label>
            <div className="grid grid-cols-2 gap-2">
              {snapshot.lines.map((line) => {
                const active = selectedLineIds.includes(line.id);
                return (
                  <button
                    key={line.id}
                    type="button"
                    onClick={() => toggleLine(line.id)}
                    className={`p-2.5 rounded-xl border flex items-center justify-between transition cursor-pointer ${
                      active
                        ? 'border-lime-400 bg-lime-400/10'
                        : 'border-white/10 bg-[#0B0F15] opacity-55'
                    }`}
                  >
                    <LineBadge line={line} size="sm" />
                    {active && <Check className="w-4 h-4 text-lime-400 shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 3. Lista Editável Simples */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-slate-300">
                Lista da Galera de Hoje ({parsedItems.length} atletas)
              </label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(rosterText);
                    pushToast('Lista copiada!');
                  }}
                  className="text-[11px] text-lime-400 font-semibold flex items-center gap-1 cursor-pointer"
                >
                  <ClipboardCopy className="w-3 h-3" /> Copiar
                </button>
                <button
                  type="button"
                  onClick={() => setRosterText('')}
                  className="text-[11px] text-rose-400 font-semibold flex items-center gap-1 cursor-pointer"
                >
                  <Trash2 className="w-3 h-3" /> Limpar
                </button>
              </div>
            </div>
            <textarea
              rows={7}
              value={rosterText}
              onChange={(e) => setRosterText(e.target.value)}
              placeholder={'Digite ou cole 1 nome por linha:\n1. João\n2. Pedro (GK)\n3. Mateus...'}
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#0B0F15] border border-white/10 focus:border-lime-400 focus:outline-none text-sm text-white leading-relaxed"
            />
            <p className="text-[11px] text-slate-500 mt-1">
              Dica: coloque <code className="text-lime-400">(GK)</code> ao lado do nome dos goleiros.
            </p>
          </div>

          <button
            type="submit"
            disabled={busyAction}
            className="w-full py-3 rounded-2xl bg-lime-400 hover:bg-lime-300 text-slate-950 font-extrabold text-sm transition cursor-pointer disabled:opacity-50"
          >
            {busyAction ? 'Criando...' : '⚽ Começar Pelada e Sortear Linhas'}
          </button>
        </form>
      </div>
    </div>
  );
};
