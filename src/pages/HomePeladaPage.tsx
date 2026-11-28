import React, { useEffect, useState } from 'react';
import { CalendarDays, Clock, MapPin, PlusCircle, RotateCcw, Trash2, Trophy, Vote } from 'lucide-react';
import { GoalsPanel } from '../components/pelada/GoalsPanel';
import { MatchesPanel } from '../components/pelada/MatchesPanel';
import { PresencePanel } from '../components/pelada/PresencePanel';
import { TeamsPanel } from '../components/pelada/TeamsPanel';
import { NextStepHint, PeladaStepper, getPeladaProgress, type PeladaStepId } from '../components/pelada/PeladaSteps';
import { cardClass, primaryBtn } from '../components/ui';
import { useBaba } from '../context/BabaContext';
import { babaService } from '../services/babaService';
import { formatShortDateBR } from '../utils/statsEngine';

type SubTab = PeladaStepId;

const STATUS_LABEL = {
  open: { text: 'Confirmações abertas', cls: 'bg-sky-400/15 text-sky-300' },
  in_progress: { text: 'Em andamento', cls: 'bg-lime-400/15 text-lime-400' },
  finished: { text: 'Encerrada', cls: 'bg-yellow-400/15 text-yellow-300' },
} as const;

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
    setActiveSection,
    runAction,
    busyAction,
  } = useBaba();

  const pelada = selectedPelada || activePelada;
  const initialTab = (): SubTab => {
    if (!pelada || !snapshot) return 'presenca';
    const cur = getPeladaProgress(pelada, snapshot.matches).current;
    return cur === 'gols' ? 'jogos' : cur;
  };
  const [subTab, setSubTab] = useState<SubTab>(initialTab);

  // Abre na etapa em que a pelada está agora
  useEffect(() => {
    if (!pelada) return;
    setSubTab(initialTab());
  }, [pelada?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!snapshot || !user) return null;

  if (!pelada) {
    return (
      <div className="py-16 text-center max-w-md mx-auto space-y-4">
        <CalendarDays className="w-10 h-10 text-slate-500 mx-auto" strokeWidth={1.5} />
        <h1 className="text-xl font-extrabold text-white">Nenhuma pelada criada</h1>
        <p className="text-sm text-slate-400">
          {isAdmin
            ? 'Crie a pelada para os jogadores confirmarem presença, sortear os times e registrar os jogos.'
            : 'Aguarde o administrador abrir a próxima pelada.'}
        </p>
        {isAdmin && (
          <button onClick={() => setOpenCreatePeladaModal(true)} className={primaryBtn}>
            <PlusCircle className="w-4 h-4" /> Criar pelada
          </button>
        )}
      </div>
    );
  }

  const isFinished = pelada.status === 'finished';
  const matchCount = snapshot.matches.filter((m) => m.peladaId === pelada.id).length;
  const status = STATUS_LABEL[pelada.status];
  const season = snapshot.seasons.find((s) => s.id === pelada.seasonId);
  const progress = getPeladaProgress(pelada, snapshot.matches);
  const goTo = (tab: SubTab) => {
    setSubTab(tab);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleClose = async () => {
    if (!window.confirm('Encerrar a pelada, definir a linha campeã e apurar as premiações?')) return;
    const res = await runAction(() => babaService.closePelada(pelada.id), 'Pelada encerrada!');
    if (res) setCeremonyPeladaId(pelada.id);
  };

  const handleDelete = async () => {
    if (
      !window.confirm(
        `Excluir "${pelada.title}" e TODOS os dados ligados a ela (jogos, gols, votos, prêmios e fotos)? Esta ação não pode ser desfeita.`
      )
    )
      return;
    await runAction(() => babaService.deletePelada(pelada.id), 'Pelada excluída');
  };

  return (
    <div className="space-y-5">
      {activePelada && pelada.id !== activePelada.id && (
        <div className="flex items-center justify-between px-4 py-2.5 rounded-2xl bg-amber-500/10 border border-amber-400/25 text-xs text-amber-200">
          <span>Visualizando histórico: {pelada.title}</span>
          <button onClick={() => setSelectedPeladaId(activePelada.id)} className="font-bold text-lime-400 hover:underline cursor-pointer">
            Voltar para a atual →
          </button>
        </div>
      )}

      {/* CABEÇALHO DA PELADA */}
      <div className={`${cardClass} p-5 sm:p-6 flex items-start justify-between gap-3`}>
        <div className="min-w-0 space-y-2.5">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-3xl sm:text-4xl text-white">{pelada.title}</h1>
            <span className={`px-2.5 py-1 rounded-full text-xs sm:text-sm font-bold ${status.cls}`}>{status.text}</span>
            {season && <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-white/5 text-slate-400">{season.name}</span>}
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm sm:text-base text-slate-300">
            <span className="inline-flex items-center gap-1.5">
              <CalendarDays className="w-4 h-4 text-slate-500" /> {formatShortDateBR(pelada.date)}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-slate-500" /> {pelada.time}
            </span>
            {pelada.location && (
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="w-4 h-4 text-slate-500" /> {pelada.location}
              </span>
            )}
          </div>
          <div className="text-sm sm:text-base text-slate-400">
            <strong className="text-white">{pelada.confirmedPlayerIds.length}</strong> confirmados ·{' '}
            <strong className="text-white">{matchCount}</strong> {matchCount === 1 ? 'jogo' : 'jogos'}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          {isAdmin && (
            <button
              disabled={busyAction}
              onClick={handleDelete}
              title="Excluir pelada"
              aria-label="Excluir pelada"
              className="p-2.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-white/[0.06] transition cursor-pointer disabled:opacity-40"
            >
              <Trash2 className="w-5 h-5" />
            </button>
          )}
          {!isFinished && pelada.votingStatus === 'open' && (
            <button onClick={() => setActiveSection('votacoes')} className={primaryBtn}>
              <Vote className="w-4 h-4" /> Votar
            </button>
          )}
        </div>
      </div>

      <PeladaStepper value={subTab} onChange={setSubTab} progress={progress} />

      <NextStepHint
        pelada={pelada}
        progress={progress}
        isAdmin={isAdmin}
        isConfirmed={pelada.confirmedPlayerIds.includes(user.playerId)}
      />

      <div className="animate-fade-in" key={subTab}>
        {subTab === 'presenca' && (
          <PresencePanel pelada={pelada} onGoToTeams={isAdmin ? () => goTo('times') : undefined} />
        )}
        {subTab === 'times' && <TeamsPanel pelada={pelada} onConfirmed={() => goTo('jogos')} />}
        {subTab === 'jogos' && <MatchesPanel pelada={pelada} onClosePelada={isAdmin ? handleClose : undefined} />}
        {subTab === 'gols' && <GoalsPanel pelada={pelada} />}
      </div>

      {/* PELADA ENCERRADA: ações fixas no rodapé, como nas outras etapas */}
      {isFinished && (
        <div className="sticky bottom-[calc(4.75rem+env(safe-area-inset-bottom,0px))] lg:bottom-4 z-10">
          <div className="flex gap-2 p-2 rounded-xl bg-[#0E110E]/95 border border-white/10 shadow-[0_8px_24px_-8px_rgba(0,0,0,0.8)] backdrop-blur">
            <button
              onClick={() => setCeremonyPeladaId(pelada.id)}
              className="flex-1 inline-flex items-center justify-center gap-2 py-3 rounded-lg bg-yellow-400 hover:bg-yellow-300 text-slate-950 text-sm font-bold transition cursor-pointer"
            >
              <Trophy className="w-4 h-4" /> Ver resumo
            </button>
            {isAdmin && (
              <button
                disabled={busyAction}
                onClick={() => runAction(() => babaService.reopenPelada(pelada.id), 'Pelada reaberta para correções')}
                title="Reabrir para correções"
                className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-lg border border-white/15 text-slate-200 hover:bg-white/[0.06] text-sm font-semibold transition cursor-pointer disabled:opacity-40"
              >
                <RotateCcw className="w-4 h-4" /> Reabrir
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
