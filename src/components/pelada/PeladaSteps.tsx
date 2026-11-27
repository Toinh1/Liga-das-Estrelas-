import React from 'react';
import { Check, Lightbulb } from 'lucide-react';
import type { MatchRecord, Pelada } from '../../types/domain';

export type PeladaStepId = 'presenca' | 'times' | 'jogos' | 'gols';

export interface PeladaProgress {
  presenceDone: boolean;
  teamsDone: boolean;
  matchesDone: boolean;
  finished: boolean;
  /** Etapa em que a pelada está agora. */
  current: PeladaStepId;
}

export function getPeladaProgress(pelada: Pelada, matches: MatchRecord[]): PeladaProgress {
  const confirmed = pelada.confirmedPlayerIds;
  const present = new Set(pelada.presentPlayerIds);
  const presenceDone = confirmed.length >= 2;
  const teamsDone = presenceDone && present.size >= 2 && confirmed.every((id) => present.has(id));
  const matchesDone = matches.some((m) => m.peladaId === pelada.id);
  const finished = pelada.status === 'finished';
  const current: PeladaStepId = finished
    ? 'gols'
    : !presenceDone
    ? 'presenca'
    : !teamsDone && !matchesDone
    ? 'times'
    : 'jogos';
  return { presenceDone, teamsDone, matchesDone, finished, current };
}

const STEPS: { id: PeladaStepId; label: string; hint: string }[] = [
  { id: 'presenca', label: 'Presença', hint: 'Quem vai' },
  { id: 'times', label: 'Times', hint: 'Sorteio' },
  { id: 'jogos', label: 'Jogos', hint: 'Placares' },
  { id: 'gols', label: 'Gols', hint: 'Artilharia' },
];

/** Barra de etapas numerada: mostra em que ponto a pelada está e permite navegar. */
export const PeladaStepper: React.FC<{
  value: PeladaStepId;
  onChange: (id: PeladaStepId) => void;
  progress: PeladaProgress;
}> = ({ value, onChange, progress }) => {
  const done: Record<PeladaStepId, boolean> = {
    presenca: progress.presenceDone,
    times: progress.teamsDone,
    jogos: progress.matchesDone,
    gols: progress.finished,
  };
  return (
    <div className="grid grid-cols-4 gap-1.5" role="tablist" aria-label="Etapas da pelada">
      {STEPS.map((s, i) => {
        const selected = value === s.id;
        const isDone = done[s.id];
        return (
          <button
            key={s.id}
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(s.id)}
            className={`relative flex flex-col items-center gap-1 py-2.5 px-1 rounded-2xl border transition cursor-pointer ${
              selected
                ? 'bg-lime-400/15 border-lime-400/50'
                : 'bg-[#131613] border-white/[0.07] hover:border-white/20'
            }`}
          >
            <span
              className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black ${
                isDone
                  ? 'bg-lime-400 text-slate-950'
                  : selected
                  ? 'border-2 border-lime-400 text-lime-400'
                  : 'border border-white/20 text-slate-400'
              }`}
            >
              {isDone ? <Check className="w-4 h-4" strokeWidth={3} /> : i + 1}
            </span>
            <span className={`text-[11px] sm:text-xs font-bold leading-none ${selected ? 'text-lime-400' : 'text-white'}`}>
              {s.label}
            </span>
            <span className="text-[9px] sm:text-[10px] text-slate-500 leading-none">{s.hint}</span>
            {progress.current === s.id && !progress.finished && (
              <span className="absolute -top-1.5 left-1/2 -translate-x-1/2 px-1.5 py-px rounded-full bg-yellow-400 text-[8px] font-black text-slate-950 uppercase tracking-wide">
                agora
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};

/** Caixa "O que fazer agora", com instruções simples para cada etapa. */
export const NextStepHint: React.FC<{
  pelada: Pelada;
  progress: PeladaProgress;
  isAdmin: boolean;
  isConfirmed: boolean;
}> = ({ pelada, progress, isAdmin, isConfirmed }) => {
  let title = '';
  let text = '';
  if (progress.finished) {
    title = 'Pelada encerrada';
    text = 'Toque em "Resumo" para ver a campeã e os destaques. Os números já contam no Ranking.';
  } else if (progress.current === 'presenca') {
    title = isAdmin ? 'Passo 1: marque quem vai jogar' : 'Lista sendo montada';
    text = isAdmin
      ? 'Use "Importar lista" no rodapé para colar a lista do WhatsApp, ou confirme os jogadores em "Adicionar jogador à lista". Depois toque em "Ir para os times".'
      : isConfirmed
      ? 'Você está confirmado. Agora é só esperar o sorteio dos times.'
      : 'O administrador está montando a lista. Se você vai jogar, avise o admin para ele te colocar.';
  } else if (progress.current === 'times') {
    title = isAdmin ? 'Passo 2: sorteie os times' : 'Aguardando o sorteio';
    text = isAdmin
      ? 'Confira o nível de cada confirmado (1 = melhor, 6 = mais fraco) e toque em "Sortear times equilibrados" no rodapé. Se gostar, toque em "Confirmar e ir aos jogos".'
      : 'O administrador está montando os times. Assim que sair, eles aparecem na aba Times.';
  } else if (!progress.matchesDone) {
    title = isAdmin ? 'Passo 3: registre os jogos' : 'Times prontos!';
    text = isAdmin
      ? 'A cada partida, toque em "Registrar jogo" (botão verde no rodapé): primeiro o placar, depois quem fez gol e quem deu assistência.'
      : 'Veja seu time na aba Times. Os placares aparecem em Jogos assim que forem registrados.';
  } else {
    title = isAdmin ? 'Passo 4: encerre quando acabar' : 'Pelada rolando';
    text = isAdmin
      ? 'Continue registrando os jogos. Quando acabar a última partida, toque em "Encerrar o Baba" no rodapé para definir a linha campeã e as premiações.'
      : 'Acompanhe os placares em Jogos e a artilharia em Gols.';
  }
  if (!progress.finished && pelada.votingStatus === 'open') {
    text += ' A votação está aberta: toque em "Votar".';
  }
  return (
    <div className="flex gap-3 px-4 py-3 rounded-2xl bg-yellow-400/[0.07] border border-yellow-400/25">
      <Lightbulb className="w-4 h-4 text-yellow-300 shrink-0 mt-0.5" />
      <div className="min-w-0">
        <div className="text-xs font-extrabold text-yellow-200">{title}</div>
        <p className="text-[11px] sm:text-xs text-yellow-100/75 mt-0.5 leading-relaxed">{text}</p>
      </div>
    </div>
  );
};
