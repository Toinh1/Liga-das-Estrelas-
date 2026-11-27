import React, { useEffect, useState } from 'react';
import { CalendarDays, Clock, Flag, MapPin, PlusCircle, RotateCcw, Trash2, Trophy } from 'lucide-react';
import { GoalsPanel } from '../components/pelada/GoalsPanel';
import { MatchesPanel } from '../components/pelada/MatchesPanel';
import { PresencePanel } from '../components/pelada/PresencePanel';
import { TeamsPanel } from '../components/pelada/TeamsPanel';
import { NextStepHint, PeladaStepper, getPeladaProgress, type PeladaStepId } from '../components/pelada/PeladaSteps';
import { cardClass, ghostBtn, primaryBtn } from '../components/ui';
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
        <div className="w-16 h-16 rounded-3xl bg-lime-400/15 border border-lime-400/30 text-lime-400 flex items-center justify-center text-3xl mx-auto">
          ⚽
        </div>
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
    const res = await runAction(() => babaService.closePelada(pelada.id), 'Pelada encerrada! 🏆');
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
      <div className={`${cardClass} p-4 sm:p-5 flex flex-wrap items-start justify-between gap-3`}>
        <div className="min-w-0 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-base sm:text-xl font-extrabold text-white">{pelada.title}</h1>
            <span className={`px-2 py-0.5 rounded-full text-[10px] sm:text-[11px] font-bold ${status.cls}`}>{status.text}</span>
            {season && <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-white/5 text-slate-400">{season.name}</span>}
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] sm:text-xs text-slate-400">
            <span className="inline-flex items-center gap-1">
              <CalendarDays className="w-3.5 h-3.5" /> {formatShortDateBR(pelada.date)}
            </span>
            <span className="inline-flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" /> {pelada.time}
            </span>
            {pelada.location && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5" /> {pelada.location}
              </span>
            )}
            <span>
              {pelada.confirmedPlayerIds.length} confirmados • {matchCount} {matchCount === 1 ? 'jogo' : 'jogos'}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          {isFinished ? (
            <>
              <button onClick={() => setCeremonyPeladaId(pelada.id)} className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-yellow-400 text-slate-950 text-xs font-extrabold cursor-pointer">
                <Trophy className="w-3.5 h-3.5" /> Resumo
              </button>
              {isAdmin && (
                <button
                  disabled={busyAction}
                  onClick={() => runAction(() => babaService.reopenPelada(pelada.id), 'Pelada reaberta para correções')}
                  title="Reabrir para correções"
                  className={ghostBtn}
                >
                  <RotateCcw className="w-4 h-4" /> Reabrir
                </button>
              )}
            </>
          ) : (
            isAdmin && (
              <button
                disabled={busyAction}
                onClick={handleClose}
                className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-lime-400 hover:bg-lime-300 text-slate-950 text-sm font-extrabold shadow-lg shadow-lime-400/30 ring-2 ring-lime-400/40 ring-offset-2 ring-offset-[#161616] active:scale-95 transition cursor-pointer disabled:opacity-50 ${
                  matchCount > 0 ? 'animate-pulse' : ''
                }`}
              >
                <Flag className="w-4 h-4" strokeWidth={2.6} /> Encerrar o Baba
              </button>
            )
          )}
          {isAdmin && (
            <button disabled={busyAction} onClick={handleDelete} className={ghostBtn} title="Excluir pelada">
              <Trash2 className="w-4 h-4 text-rose-400" />
            </button>
          )}
          {!isFinished && pelada.votingStatus === 'open' && (
            <button onClick={() => setActiveSection('votacoes')} className={primaryBtn}>
              🗳️ Votar
            </button>
          )}
        </div>
      </div>

      <NextStepHint
        pelada={pelada}
        progress={progress}
        isAdmin={isAdmin}
        isConfirmed={pelada.confirmedPlayerIds.includes(user.playerId)}
      />

      <PeladaStepper value={subTab} onChange={setSubTab} progress={progress} />

      <div className="animate-fade-in" key={subTab}>
        {subTab === 'presenca' && (
          <PresencePanel pelada={pelada} onGoToTeams={isAdmin ? () => goTo('times') : undefined} />
        )}
        {subTab === 'times' && <TeamsPanel pelada={pelada} onConfirmed={() => goTo('jogos')} />}
        {subTab === 'jogos' && <MatchesPanel pelada={pelada} />}
        {subTab === 'gols' && <GoalsPanel pelada={pelada} />}
      </div>
    </div>
  );
};
