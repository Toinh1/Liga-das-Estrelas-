import React, { useMemo, useState } from 'react';
import { ArrowLeft, Award, Edit3, Flame, Footprints, Gauge, GitCompareArrows, HandHelping, Handshake, Percent, Power, Shield, Star, Swords, ThumbsDown, Trash2, Trophy, UserCheck } from 'lucide-react';
import { useBaba } from '../context/BabaContext';
import { babaService } from '../services/babaService';
import type { Player } from '../types/domain';
import { formatShortDateBR } from '../utils/statsEngine';
import { StackedBarChart } from './charts';
import { PlayerCompareModal } from './PlayerCompareModal';
import { PlayerFormModal } from './PlayerFormModal';
import { IconTile, InfoChip, PlayerAvatar, SkillMeter, cardClass, type TileTone } from './ui';

const AWARD_LABEL: Record<string, string> = {
  best_player: 'Melhor da Pelada',
  best_goalkeeper: 'Melhor Goleiro',
  top_scorer: 'Artilheiro',
};

const shortDay = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }).replace('.', '');

/** Página individual do jogador (estrutura "My Club"): identidade, números, evolução e histórico. */
export const PlayerDetailView: React.FC<{
  player: Player;
  onBack?: () => void;
  /** Exibe os botões de edição pessoal (perfil próprio). */
  selfMode?: boolean;
}> = ({ player, onBack, selfMode }) => {
  const { user, isAdmin, snapshot, playerStatsMap, runAction, busyAction, setSelectedPeladaId, setActiveSection } = useBaba();
  const [editing, setEditing] = useState(false);
  const [comparing, setComparing] = useState(false);
  const st = playerStatsMap[player.id];
  const isMe = user?.playerId === player.id;
  const lineMap = new Map((snapshot?.lines ?? []).map((l) => [l.id, l]));

  const evolution = useMemo(
    () =>
      [...(st?.history ?? [])]
        .reverse()
        .slice(-12)
        .map((h) => ({
          label: h.date.slice(8, 10) + '/' + h.date.slice(5, 7),
          title: `${h.peladaTitle} — ${formatShortDateBR(h.date)}`,
          values: { goals: h.goals, assists: h.assists, wins: h.matchWins },
        })),
    [st]
  );

  const tiles: { icon: React.ElementType; tone: TileTone; value: React.ReactNode; label: string }[] = [
    { icon: Swords, tone: 'lime', value: st?.matchesPlayed ?? 0, label: 'Partidas' },
    { icon: Trophy, tone: 'emerald', value: st?.matchWins ?? 0, label: 'Vitórias' },
    { icon: Handshake, tone: 'yellow', value: st?.matchDraws ?? 0, label: 'Empates' },
    { icon: ThumbsDown, tone: 'rose', value: st?.matchLosses ?? 0, label: 'Derrotas' },
    { icon: Flame, tone: 'lime', value: st?.goals ?? 0, label: 'Gols' },
    { icon: HandHelping, tone: 'sky', value: st?.assists ?? 0, label: 'Assistências' },
    { icon: Gauge, tone: 'slate', value: (st?.goalsPerMatch ?? 0).toFixed(2).replace('.', ','), label: 'Gols / partida' },
    { icon: Percent, tone: 'emerald', value: `${st?.efficiency ?? 0}%`, label: 'Aproveitamento' },
    { icon: UserCheck, tone: 'orange', value: st?.participations ?? 0, label: 'Presenças' },
    { icon: Award, tone: 'yellow', value: st?.lineTitles ?? 0, label: 'Títulos da linha' },
  ];

  const canEdit = isAdmin || (selfMode && isMe);

  return (
    <div className="space-y-5 animate-fade-in">
      {/* BARRA SUPERIOR */}
      <div className="flex items-center justify-between">
        {onBack ? (
          <button onClick={onBack} className="w-9 h-9 rounded-full bg-white/[0.06] flex items-center justify-center text-slate-300 hover:text-white cursor-pointer" aria-label="Voltar">
            <ArrowLeft className="w-4 h-4" />
          </button>
        ) : (
          <span />
        )}
        <span className="text-sm font-bold text-white">{selfMode && isMe ? 'Meu perfil' : 'Atleta'}</span>
        <div className="flex items-center gap-1.5">
          {canEdit && (
            <button onClick={() => setEditing(true)} className="w-9 h-9 rounded-full bg-white/[0.06] flex items-center justify-center text-slate-300 hover:text-white cursor-pointer" title="Editar" aria-label="Editar">
              <Edit3 className="w-4 h-4" />
            </button>
          )}
          {isAdmin && !isMe && (
            <>
              <button
                disabled={busyAction}
                onClick={() =>
                  runAction(() => babaService.setPlayerActive(player.id, !player.active), player.active ? 'Jogador inativado' : 'Jogador reativado')
                }
                className="w-9 h-9 rounded-full bg-white/[0.06] flex items-center justify-center cursor-pointer"
                title={player.active ? 'Inativar' : 'Reativar'}
                aria-label={player.active ? 'Inativar' : 'Reativar'}
              >
                <Power className={`w-4 h-4 ${player.active ? 'text-rose-400' : 'text-lime-400'}`} />
              </button>
              <button
                disabled={busyAction}
                onClick={async () => {
                  const warnings = [
                    babaService.playerHasHistory(player.id)
                      ? '• Ele tem jogos registrados: o histórico continua, mas aparece como "Jogador removido".'
                      : '',
                    player.userId
                      ? '• Ele tem conta no app: o perfil da conta também sai. Se entrar de novo, vira um jogador novo.'
                      : '',
                  ].filter(Boolean);
                  const msg = [
                    `Excluir ${player.nickname || player.name} do baba?`,
                    ...(warnings.length ? ['', ...warnings] : []),
                    '',
                    'Esta ação não pode ser desfeita.',
                  ].join('\n');
                  if (!window.confirm(msg)) return;
                  const res = await runAction(() => babaService.deletePlayer(player.id), 'Jogador excluído');
                  if (res) onBack?.();
                }}
                className="w-9 h-9 rounded-full bg-white/[0.06] flex items-center justify-center cursor-pointer"
                title="Excluir jogador"
                aria-label="Excluir"
              >
                <Trash2 className="w-4 h-4 text-rose-400" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* IDENTIDADE */}
      <div className="flex flex-col items-center text-center gap-2.5">
        <div className="relative">
          <PlayerAvatar player={player} size={104} className="!rounded-[28px] border border-white/10 shadow-xl shadow-black/40" />
          {!player.active && (
            <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full bg-rose-500 text-white text-[10px] font-bold">Inativo</span>
          )}
        </div>
        <div>
          <h1 className="text-xl font-extrabold text-white">{player.nickname || player.name}</h1>
          {player.nickname && <div className="text-xs text-slate-400">{player.name}</div>}
        </div>
        <div className="flex flex-wrap justify-center gap-1.5">
          <InfoChip tone="lime">{player.position}</InfoChip>
          {player.dominantFoot && <InfoChip icon={Footprints}>Pé {player.dominantFoot.toLowerCase()}</InfoChip>}
          <InfoChip>Desde {formatShortDateBR(player.createdAt.slice(0, 10))}</InfoChip>
        </div>
        {isAdmin && (
          <div className="flex items-center gap-2 text-[11px] text-slate-400">
            Nível (1 = melhor)
            <SkillMeter
              value={player.skillLevel}
              onChange={(v) => v !== player.skillLevel && runAction(() => babaService.setPlayerSkill(player.id, v), `Nível atualizado para ${v}`)}
            />
          </div>
        )}
        <button
          onClick={() => setComparing(true)}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-white/[0.06] border border-white/10 text-xs font-bold text-slate-200 hover:border-lime-400/40 hover:text-lime-300 transition cursor-pointer"
        >
          <GitCompareArrows className="w-3.5 h-3.5" /> Comparar com outro jogador
        </button>
      </div>

      {/* NÚMEROS */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
        {tiles.map((t) => (
          <div key={t.label} className="p-3.5 rounded-2xl bg-[#131613] border border-white/[0.07] flex sm:flex-col items-center sm:items-start gap-3">
            <IconTile icon={t.icon} tone={t.tone} />
            <div>
              <div className="font-display font-extrabold text-lg text-white leading-none">{t.value}</div>
              <div className="text-[11px] text-slate-500 mt-1">{t.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* PRÊMIOS */}
      {st && st.totalAwards > 0 && (
        <div className="flex flex-wrap gap-2">
          {st.bestPlayerAwards > 0 && (
            <InfoChip icon={Award}>
              <span className="text-yellow-300">{st.bestPlayerAwards}× Melhor da Pelada</span>
            </InfoChip>
          )}
          {st.bestGoalkeeperAwards > 0 && (
            <InfoChip icon={Shield}>
              <span className="text-sky-300">{st.bestGoalkeeperAwards}× Melhor Goleiro</span>
            </InfoChip>
          )}
          {st.topScorerAwards > 0 && (
            <InfoChip icon={Flame}>
              <span className="text-lime-300">{st.topScorerAwards}× Artilheiro</span>
            </InfoChip>
          )}
        </div>
      )}

      {/* HISTÓRICO (CARROSSEL) */}
      <section className="space-y-2.5">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-base font-bold uppercase tracking-wide text-white">Histórico de peladas</h2>
          <span className="text-[11px] text-slate-500">{st?.history.length ?? 0} no total</span>
        </div>
        {!st || st.history.length === 0 ? (
          <div className={`${cardClass} !rounded-2xl p-6 text-center text-xs text-slate-500`}>Nenhuma participação registrada.</div>
        ) : (
          <div className="flex gap-2.5 overflow-x-auto pb-1 -mx-1 px-1 snap-x no-scrollbar">
            {st.history.map((h) => {
              const line = h.lineId ? lineMap.get(h.lineId) : undefined;
              return (
                <button
                  key={h.peladaId}
                  onClick={() => {
                    setSelectedPeladaId(h.peladaId);
                    setActiveSection('hoje');
                  }}
                  className="snap-start shrink-0 w-[150px] p-3 rounded-2xl bg-[#131613] border border-white/[0.07] text-left space-y-2.5 hover:border-lime-400/30 transition cursor-pointer"
                >
                  <div className="flex items-center justify-between text-[10px] text-slate-500">
                    <span>{shortDay(h.date)}</span>
                    {h.wonChampionship && <Trophy className="w-3.5 h-3.5 text-yellow-400" />}
                  </div>
                  <div className="flex items-center gap-2">
                    {line ? (
                      <span
                        className="w-6 h-6 rounded-md flex items-center justify-center text-[9px] font-black border border-white/10 shrink-0"
                        style={{ backgroundColor: line.colorHex, color: line.textColorHex }}
                      >
                        {line.shortName.slice(0, 2)}
                      </span>
                    ) : (
                      <span className="w-6 h-6 rounded-md bg-white/10 shrink-0" />
                    )}
                    <span className="text-xs font-bold text-white truncate">{h.peladaTitle}</span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] font-bold">
                    <span className="text-emerald-400">{h.matchWins}V</span>
                    <span className="text-slate-400">{h.matchDraws}E</span>
                    <span className="text-rose-400">{h.matchLosses}D</span>
                  </div>
                  <div className="flex items-center gap-2 text-[11px]">
                    <span className="text-lime-400 font-bold">{h.goals} G</span>
                    <span className="text-sky-400 font-bold">{h.assists} A</span>
                    <span className="ml-auto">
                      {h.awards.map((a) => (
                        <span key={a} title={AWARD_LABEL[a]} className="inline-flex">
                          {a === 'best_player' ? (
                            <Star className="w-3.5 h-3.5 text-yellow-300" />
                          ) : a === 'best_goalkeeper' ? (
                            <Shield className="w-3.5 h-3.5 text-sky-300" />
                          ) : (
                            <Flame className="w-3.5 h-3.5 text-lime-400" />
                          )}
                        </span>
                      ))}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* EVOLUÇÃO */}
      <div className={`${cardClass} !rounded-2xl p-4 space-y-3`}>
        <h2 className="text-base font-bold uppercase tracking-wide text-white">Evolução</h2>
        <StackedBarChart
          data={evolution}
          series={[
            { key: 'goals', label: 'Gols', color: '#52CC33' },
            { key: 'assists', label: 'Assistências', color: '#38BDF8' },
            { key: 'wins', label: 'Vitórias', color: '#52525B' },
          ]}
          emptyText="Ainda sem partidas registradas."
        />
      </div>

      {editing && <PlayerFormModal player={player} onClose={() => setEditing(false)} />}
      {comparing && <PlayerCompareModal base={player} onClose={() => setComparing(false)} />}
    </div>
  );
};
