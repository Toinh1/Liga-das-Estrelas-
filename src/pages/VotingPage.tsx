import React, { useState } from 'react';
import { Award, Check, Flame, Lock, Play, Shield, Trophy, Vote } from 'lucide-react';
import { useBaba } from '../context/BabaContext';
import { babaService } from '../services/babaService';
import type { VoteCategory } from '../types/domain';
import { computeRoundTopScorers } from '../utils/statsEngine';

export const VotingPage: React.FC = () => {
  const { user, isAdmin, snapshot, selectedPelada, activePelada, runAction, busyAction } =
    useBaba();

  const [category, setCategory] = useState<VoteCategory>('best_player');

  if (!snapshot || !user) return null;

  const pelada = selectedPelada || activePelada;

  if (!pelada) {
    return (
      <div className="py-16 text-center text-sm text-slate-400">
        Crie uma pelada primeiro para liberar a votação.
      </div>
    );
  }

  const summary = snapshot.votingSummaries[pelada.id];
  const isPresent = pelada.presentPlayerIds.includes(user.playerId);
  const isOpen = pelada.votingStatus === 'open';
  const isRevealed =
    summary?.isRevealed || pelada.votingStatus === 'closed' || pelada.status === 'finished';

  const presentPlayers = snapshot.players.filter((p) => pelada.presentPlayerIds.includes(p.id));
  const playerMap = new Map(snapshot.players.map((p) => [p.id, p]));

  const candidates =
    category === 'best_goalkeeper'
      ? [...presentPlayers].sort((a, b) => {
          if (a.position === 'Goleiro' && b.position !== 'Goleiro') return -1;
          if (a.position !== 'Goleiro' && b.position === 'Goleiro') return 1;
          return (a.nickname || a.name).localeCompare(b.nickname || b.name, 'pt-BR');
        })
      : [...presentPlayers].sort((a, b) =>
          (a.nickname || a.name).localeCompare(b.nickname || b.name, 'pt-BR')
        );

  const myVoteBp = summary?.myVotes?.best_player;
  const myVoteGk = summary?.myVotes?.best_goalkeeper;
  const currentMyVote = category === 'best_player' ? myVoteBp : myVoteGk;

  const topScorers = computeRoundTopScorers(pelada.id, snapshot.goals);

  return (
    <div className="space-y-5">
      {/* CABEÇALHO SIMPLES */}
      <div className="p-4 sm:p-5 rounded-3xl bg-[#11161F] border border-white/[0.08] flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg sm:text-xl font-extrabold text-white">Votação</h1>
            <span
              className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                isOpen
                  ? 'bg-lime-400 text-slate-950'
                  : isRevealed
                  ? 'bg-yellow-400/15 text-yellow-300'
                  : 'bg-white/10 text-slate-400'
              }`}
            >
              {isOpen ? 'Aberta • Secreta' : isRevealed ? 'Resultado Final' : 'Aguardando'}
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            {pelada.title}
            {isOpen && summary
              ? ` • ${summary.votersWhoVotedBestPlayer}/${summary.totalPresentPlayers} votaram`
              : ''}
          </p>
        </div>

        {isAdmin && pelada.status !== 'finished' && (
          <div>
            {!isOpen ? (
              <button
                disabled={busyAction}
                onClick={() =>
                  runAction(
                    () => babaService.setVotingStatus(user, pelada.id, 'open'),
                    'Votação aberta! 🗳️'
                  )
                }
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-lime-400 hover:bg-lime-300 text-slate-950 font-extrabold text-xs cursor-pointer"
              >
                <Play className="w-3.5 h-3.5" />
                Abrir Votação
              </button>
            ) : (
              <button
                disabled={busyAction}
                onClick={() => {
                  if (window.confirm('Encerrar a votação e revelar os vencedores?')) {
                    runAction(
                      () => babaService.setVotingStatus(user, pelada.id, 'closed'),
                      'Vencedores revelados! 🏆'
                    );
                  }
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-yellow-400 hover:bg-yellow-300 text-slate-950 font-extrabold text-xs cursor-pointer"
              >
                <Trophy className="w-3.5 h-3.5" />
                Encerrar e Revelar
              </button>
            )}
          </div>
        )}
      </div>

      {/* ESTADO 1: AINDA NÃO INICIADA */}
      {!isOpen && !isRevealed && (
        <div className="p-10 rounded-3xl bg-[#11161F] border border-white/[0.08] text-center space-y-3">
          <Vote className="w-9 h-9 text-slate-500 mx-auto" />
          <div className="text-base font-bold text-white">Votação ainda fechada</div>
          <p className="text-xs text-slate-400 max-w-xs mx-auto">
            Ao final dos jogos, todos os atletas presentes poderão votar em Melhor da Pelada e
            Melhor Goleiro.
          </p>
        </div>
      )}

      {/* ESTADO 2: RESULTADOS REVELADOS (3 CARDS LIMPOS) */}
      {isRevealed && summary && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
          {/* Melhor Jogador */}
          <div className="p-5 rounded-3xl bg-[#11161F] border border-yellow-400/30 flex flex-col items-center text-center space-y-2.5">
            <span className="text-xs font-extrabold text-yellow-400 flex items-center gap-1">
              <Award className="w-4 h-4" /> Melhor da Pelada
            </span>
            {summary.bestPlayerWinnerIds.length > 0 ? (
              <>
                <div className="flex -space-x-2 pt-1">
                  {summary.bestPlayerWinnerIds.map((id) => {
                    const pl = playerMap.get(id);
                    return pl ? (
                      <img
                        key={id}
                        src={pl.photoUrl}
                        alt={pl.name}
                        className="w-16 h-16 rounded-2xl object-cover border-2 border-yellow-400"
                      />
                    ) : null;
                  })}
                </div>
                <div className="font-extrabold text-white text-base">
                  {summary.bestPlayerWinnerIds
                    .map((id) => playerMap.get(id)?.nickname || playerMap.get(id)?.name)
                    .join(' & ')}
                </div>
                <span className="text-xs text-slate-400">
                  {summary.bestPlayerTally[0]?.votes || 0} voto(s)
                </span>
              </>
            ) : (
              <p className="text-xs text-slate-500 py-4">Sem votos</p>
            )}
          </div>

          {/* Melhor Goleiro */}
          <div className="p-5 rounded-3xl bg-[#11161F] border border-sky-400/30 flex flex-col items-center text-center space-y-2.5">
            <span className="text-xs font-extrabold text-sky-400 flex items-center gap-1">
              <Shield className="w-4 h-4" /> Melhor Goleiro
            </span>
            {summary.bestGoalkeeperWinnerIds.length > 0 ? (
              <>
                <div className="flex -space-x-2 pt-1">
                  {summary.bestGoalkeeperWinnerIds.map((id) => {
                    const pl = playerMap.get(id);
                    return pl ? (
                      <img
                        key={id}
                        src={pl.photoUrl}
                        alt={pl.name}
                        className="w-16 h-16 rounded-2xl object-cover border-2 border-sky-400"
                      />
                    ) : null;
                  })}
                </div>
                <div className="font-extrabold text-white text-base">
                  {summary.bestGoalkeeperWinnerIds
                    .map((id) => playerMap.get(id)?.nickname || playerMap.get(id)?.name)
                    .join(' & ')}
                </div>
                <span className="text-xs text-slate-400">
                  {summary.bestGoalkeeperTally[0]?.votes || 0} voto(s)
                </span>
              </>
            ) : (
              <p className="text-xs text-slate-500 py-4">Sem votos</p>
            )}
          </div>

          {/* Artilheiro */}
          <div className="p-5 rounded-3xl bg-[#11161F] border border-lime-400/30 flex flex-col items-center text-center space-y-2.5">
            <span className="text-xs font-extrabold text-lime-400 flex items-center gap-1">
              <Flame className="w-4 h-4" /> Artilheiro
            </span>
            {topScorers.winnerPlayerIds.length > 0 ? (
              <>
                <div className="flex -space-x-2 pt-1">
                  {topScorers.winnerPlayerIds.map((id) => {
                    const pl = playerMap.get(id);
                    return pl ? (
                      <img
                        key={id}
                        src={pl.photoUrl}
                        alt={pl.name}
                        className="w-16 h-16 rounded-2xl object-cover border-2 border-lime-400"
                      />
                    ) : null;
                  })}
                </div>
                <div className="font-extrabold text-white text-base">
                  {topScorers.winnerPlayerIds
                    .map((id) => playerMap.get(id)?.nickname || playerMap.get(id)?.name)
                    .join(' & ')}
                </div>
                <span className="text-xs text-lime-300 font-bold">
                  {topScorers.topGoals} {topScorers.topGoals === 1 ? 'gol' : 'gols'}
                </span>
              </>
            ) : (
              <p className="text-xs text-slate-500 py-4">Sem gols</p>
            )}
          </div>
        </div>
      )}

      {/* ESTADO 3: VOTAÇÃO ABERTA */}
      {isOpen && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2 p-1.5 rounded-2xl bg-[#11161F] border border-white/[0.07]">
            <button
              onClick={() => setCategory('best_player')}
              className={`py-2.5 px-3 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                category === 'best_player'
                  ? 'bg-lime-400 text-slate-950'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <span>🏆 Melhor Jogador</span>
              {myVoteBp && <Check className="w-4 h-4" />}
            </button>
            <button
              onClick={() => setCategory('best_goalkeeper')}
              className={`py-2.5 px-3 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                category === 'best_goalkeeper'
                  ? 'bg-lime-400 text-slate-950'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <span>🧤 Melhor Goleiro</span>
              {myVoteGk && <Check className="w-4 h-4" />}
            </button>
          </div>

          {!isPresent && (
            <div className="px-4 py-3 rounded-2xl bg-rose-500/10 border border-rose-500/25 text-xs text-rose-200 text-center">
              Apenas atletas presentes na lista de hoje podem votar.
            </div>
          )}

          <div className="rounded-3xl bg-[#11161F] border border-white/[0.08] divide-y divide-white/[0.05] overflow-hidden">
            {candidates.map((cand) => {
              const isSelf = cand.id === user.playerId;
              const isMyChoice = currentMyVote === cand.id;
              const canVote = isPresent && !currentMyVote && !isSelf && !busyAction;

              return (
                <div
                  key={cand.id}
                  className={`px-4 sm:px-5 py-3 flex items-center justify-between gap-3 ${
                    isMyChoice ? 'bg-lime-400/10' : ''
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <img
                      src={cand.photoUrl}
                      alt={cand.name}
                      className="w-10 h-10 rounded-full object-cover shrink-0"
                    />
                    <div className="min-w-0">
                      <div className="text-sm font-bold text-white truncate">
                        {cand.nickname || cand.name}
                      </div>
                      <div className="text-[11px] text-slate-400">
                        {cand.position === 'Goleiro' ? '🧤 Goleiro' : cand.position}
                      </div>
                    </div>
                  </div>

                  {isMyChoice ? (
                    <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-lime-400 text-slate-950 text-xs font-extrabold shrink-0">
                      <Lock className="w-3 h-3" /> Seu voto
                    </span>
                  ) : isSelf ? (
                    <span className="text-xs text-slate-500 px-2">Você</span>
                  ) : (
                    <button
                      disabled={!canVote}
                      onClick={() =>
                        runAction(
                          () => babaService.castVote(user, pelada.id, category, cand.id),
                          'Voto registrado! 🔒'
                        )
                      }
                      className="px-4 py-1.5 rounded-xl bg-white/10 hover:bg-lime-400 hover:text-slate-950 text-xs font-extrabold text-white transition cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
                    >
                      Votar
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
