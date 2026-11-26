import React, { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { useBaba } from '../context/BabaContext';
import { babaService } from '../services/babaService';
import { parseRosterText } from '../utils/rosterParser';
import { MAX_LINES, MIN_LINES, PELADA_DEFAULT_TIME, PELADA_WEEKDAY } from '../types/domain';
import { getNextWeekdayISO } from '../utils/statsEngine';
import { LineBadge } from './LineBadge';
import { Modal, inputClass, primaryBtn } from './ui';

/**
 * Criação de pelada. Fluxo: criar → jogadores confirmam presença → admin sorteia
 * os times entre os confirmados → registra os jogos.
 */
export const CreatePeladaModal: React.FC = () => {
  const {
    user,
    snapshot,
    openCreatePeladaModal,
    setOpenCreatePeladaModal,
    runAction,
    setSelectedPeladaId,
    setActiveSection,
    busyAction,
  } = useBaba();

  const [title, setTitle] = useState('');
  const [date, setDate] = useState(getNextWeekdayISO(PELADA_WEEKDAY));
  const [time, setTime] = useState(PELADA_DEFAULT_TIME);
  const [location, setLocation] = useState('');
  const [selectedLineIds, setSelectedLineIds] = useState<string[]>([]);
  const [rosterText, setRosterText] = useState('');
  const [showImport, setShowImport] = useState(false);

  useEffect(() => {
    if (!openCreatePeladaModal || !snapshot) return;
    const last = snapshot.peladas[0];
    setTitle(`Pelada #${String(snapshot.peladas.length + 1).padStart(2, '0')}`);
    setDate(getNextWeekdayISO(PELADA_WEEKDAY));
    setTime(PELADA_DEFAULT_TIME);
    setLocation(last?.location || '');
    setSelectedLineIds(
      last?.participatingLineIds.length
        ? last.participatingLineIds.filter((id) => snapshot.lines.some((l) => l.id === id))
        : snapshot.lines.slice(0, 3).map((l) => l.id)
    );
    setRosterText('');
    setShowImport(false);
    // Recarrega o formulário apenas ao abrir
  }, [openCreatePeladaModal]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!openCreatePeladaModal || !snapshot || !user) return null;

  const parsedItems = rosterText ? parseRosterText(rosterText, snapshot.players) : [];
  const activeSeason = snapshot.seasons.find((s) => s.status === 'active');

  const toggleLine = (lineId: string) =>
    setSelectedLineIds((prev) =>
      prev.includes(lineId) ? prev.filter((id) => id !== lineId) : prev.length >= MAX_LINES ? prev : [...prev, lineId]
    );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await runAction(async () => {
      const confirmedIds = parsedItems.length
        ? await babaService.ensurePlayersFromRoster(
            parsedItems.map((it) => ({ name: it.name, position: it.position, matchedPlayerId: it.matchedPlayerId, skillLevel: it.skillLevel }))
          )
        : [];
      return babaService.createPelada({
        title,
        date,
        time,
        location,
        participatingLineIds: selectedLineIds,
        confirmedPlayerIds: confirmedIds,
      });
    }, 'Pelada criada! Os jogadores já podem confirmar presença ⚽');

    if (res) {
      setSelectedPeladaId(res.value);
      setOpenCreatePeladaModal(false);
      setActiveSection('hoje');
    }
  };

  return (
    <Modal title="⚽ Nova pelada" onClose={() => setOpenCreatePeladaModal(false)}>
      <form onSubmit={handleSubmit} className="p-4 sm:p-5 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 sm:col-span-1">
            <label className="block text-xs font-semibold text-slate-400 mb-1">Nome</label>
            <input required maxLength={60} value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">Data</label>
            <input type="date" required value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">Horário</label>
            <input type="time" required value={time} onChange={(e) => setTime(e.target.value)} className={inputClass} />
          </div>
          <div className="col-span-2 sm:col-span-1">
            <label className="block text-xs font-semibold text-slate-400 mb-1">Local</label>
            <input maxLength={80} value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Ex: Arena Society" className={inputClass} />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-400 mb-2">
            Equipes ({selectedLineIds.length} de {MIN_LINES} a {MAX_LINES})
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
                    active ? 'border-lime-400 bg-lime-400/10' : 'border-white/10 bg-[#1F1F1F] opacity-55'
                  }`}
                >
                  <LineBadge line={line} size="sm" />
                  {active && <Check className="w-4 h-4 text-lime-400 shrink-0" />}
                </button>
              );
            })}
          </div>
        </div>

        <div className="rounded-2xl bg-[#1F1F1F] border border-white/5 p-3 space-y-2">
          <button type="button" onClick={() => setShowImport((v) => !v)} className="text-xs font-bold text-lime-400 cursor-pointer">
            {showImport ? '− Ocultar lista' : '+ Já tenho a lista de confirmados (opcional)'}
          </button>
          {showImport && (
            <>
              <textarea
                rows={6}
                value={rosterText}
                onChange={(e) => setRosterText(e.target.value)}
                placeholder={'Cole 1 nome por linha:\n1. João\n2. Pedro (GK)'}
                className={`${inputClass} leading-relaxed`}
              />
              <p className="text-[11px] text-slate-500">
                {parsedItems.length} nome(s) serão marcados como confirmados
                {parsedItems.some((p) => p.isNew) && ` (${parsedItems.filter((p) => p.isNew).length} novo(s) cadastro(s))`}.
              </p>
            </>
          )}
        </div>

        <p className="text-[11px] text-slate-500">
          {activeSeason ? (
            <>Será registrada na temporada <span className="text-slate-300 font-semibold">{activeSeason.name}</span>.</>
          ) : (
            'Nenhuma temporada ativa — a pelada fica no histórico geral.'
          )}
        </p>

        <button type="submit" disabled={busyAction || selectedLineIds.length < 2} className={`${primaryBtn} w-full !py-3`}>
          {busyAction ? 'Criando...' : 'Criar pelada e abrir confirmações'}
        </button>
      </form>
    </Modal>
  );
};
