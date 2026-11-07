import React from 'react';
import { Award, Camera, Copy, Flame, Medal, Shield, Sparkles, Trophy, X } from 'lucide-react';
import { useBaba } from '../context/BabaContext';
import { computePeladaStandings, computeRoundTopScorers, formatDateBR } from '../utils/statsEngine';
import { LineBadge } from './LineBadge';

export const PeladaCeremonyModal: React.FC = () => {
  const { snapshot, ceremonyPeladaId, setCeremonyPeladaId, pushToast } = useBaba();

  if (!ceremonyPeladaId || !snapshot) return null;

  const pelada = snapshot.peladas.find((p) => p.id === ceremonyPeladaId);
  if (!pelada) return null;

  const standings = computePeladaStandings(pelada, snapshot.lines, snapshot.matches);
  const championStanding =
    standings.find((s) => s.lineId === pelada.championLineId) || standings[0];
  const championLine = snapshot.lines.find((l) => l.id === championStanding?.lineId);
  const championRosterIds = championLine ? pelada.lineRosters[championLine.id] || [] : [];
  const championPlayers = snapshot.players.filter((p) => championRosterIds.includes(p.id));

  const roundMatches = snapshot.matches.filter((m) => m.peladaId === pelada.id);
  const totalGoals = roundMatches.reduce((acc, m) => acc + m.homeGoals + m.awayGoals, 0);
  const avgGoals =
    roundMatches.length > 0 ? (totalGoals / roundMatches.length).toFixed(1) : '0.0';

  const roundAwards = snapshot.awards.filter((a) => a.peladaId === pelada.id);
  const bpAward = roundAwards.find((a) => a.category === 'best_player');
  const gkAward = roundAwards.find((a) => a.category === 'best_goalkeeper');
  const tsAward = roundAwards.find((a) => a.category === 'top_scorer');
  const fallbackTopScorer = computeRoundTopScorers(pelada.id, snapshot.goals);

  const bestPlayers = snapshot.players.filter((p) =>
    (bpAward?.winnerPlayerIds || []).includes(p.id)
  );
  const bestKeepers = snapshot.players.filter((p) =>
    (gkAward?.winnerPlayerIds || []).includes(p.id)
  );
  const topScorerIds = tsAward?.winnerPlayerIds?.length
    ? tsAward.winnerPlayerIds
    : fallbackTopScorer.winnerPlayerIds;
  const topScorerGoals = tsAward?.metricValue ?? fallbackTopScorer.topGoals;
  const topScorers = snapshot.players.filter((p) => topScorerIds.includes(p.id));

  const roundPhotos = snapshot.photos.filter((ph) => ph.peladaId === pelada.id);
  const officialPhoto =
    roundPhotos.find((ph) => ph.id === pelada.officialPhotoId || ph.isOfficial) || roundPhotos[0];

  const handleCopySummary = () => {
    const bpNames = bestPlayers.map((p) => p.nickname || p.name).join(', ') || 'Não definido';
    const gkNames = bestKeepers.map((p) => p.nickname || p.name).join(', ') || 'Não definido';
    const tsNames =
      topScorers.length > 0
        ? `${topScorers.map((p) => p.nickname || p.name).join(' & ')} (${topScorerGoals} gols)`
        : 'Sem gols registrados';

    const tableLines = standings
      .map(
        (s, idx) =>
          `${idx + 1}º ${s.lineName} — ${s.points} pts (${s.wins}V ${s.draws}E ${s.losses}D | SG ${
            s.goalDifference >= 0 ? `+${s.goalDifference}` : s.goalDifference
          })`
      )
      .join('\n');

    const summaryText = [
      `⭐ *LIGA DAS ESTRELAS — RESUMO OFICIAL* ⭐`,
      `📅 *${pelada.title}* (${formatDateBR(pelada.date)})`,
      ``,
      `🥇 *LINHA CAMPEÃ:* ${championLine?.name || 'A definir'}`,
      `📊 *Partidas:* ${roundMatches.length} jogos | *Gols:* ${totalGoals} (média ${avgGoals}/jogo)`,
      ``,
      `🌟 *Melhor da Pelada:* ${bpNames}`,
      `🧤 *Melhor Goleiro:* ${gkNames}`,
      `🔥 *Artilheiro(s):* ${tsNames}`,
      ``,
      `📋 *CLASSIFICAÇÃO FINAL:*`,
      tableLines,
    ].join('\n');

    navigator.clipboard.writeText(summaryText);
    pushToast('Resumo copiado! 📋', 'Pronto para colar no grupo da pelada.');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/85 backdrop-blur-md sm:p-4 overflow-y-auto">
      <div className="relative w-full max-w-4xl gold-ceremony-bg border border-yellow-400/30 rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col animate-fade-in">
        {/* Confetes sutis decorativos */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          {[...Array(14)].map((_, i) => (
            <span
              key={i}
              className="absolute w-2 h-3 rounded-sm"
              style={{
                left: `${(i * 7 + 5) % 96}%`,
                top: '-12px',
                backgroundColor: i % 3 === 0 ? '#FACC15' : i % 3 === 1 ? '#A3E635' : '#38BDF8',
                animation: `confettiDrop ${2.6 + (i % 4) * 0.6}s linear infinite`,
                animationDelay: `${(i % 5) * 0.35}s`,
              }}
            />
          ))}
        </div>

        {/* Top bar */}
        <div className="relative z-10 flex items-center justify-between px-6 py-4 border-b border-white/10 bg-black/30">
          <div className="flex items-center gap-2.5">
            <Sparkles className="w-5 h-5 text-yellow-400" />
            <span className="text-xs font-extrabold uppercase tracking-widest text-yellow-400">
              Cerimônia Oficial de Encerramento
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopySummary}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-lime-400/15 hover:bg-lime-400/25 border border-lime-400/30 text-lime-300 text-xs font-bold transition"
            >
              <Copy className="w-3.5 h-3.5" />
              Copiar Resumo
            </button>
            <button
              onClick={() => setCeremonyPeladaId(null)}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="relative z-10 p-5 sm:p-8 space-y-7 max-h-[85vh] overflow-y-auto">
          {/* Hero Campeão */}
          <div className="text-center space-y-3">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-yellow-400/15 border border-yellow-400/40 text-yellow-400 animate-trophy shadow-xl shadow-yellow-500/10">
              <Trophy className="w-11 h-11" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-widest text-slate-400 font-semibold">
                {pelada.title} • {formatDateBR(pelada.date)}
              </p>
              <h2 className="text-2xl sm:text-4xl font-extrabold text-white mt-1">
                {championLine ? `${championLine.name} Campeã!` : 'Resumo da Rodada'}
              </h2>
            </div>

            {championStanding && (
              <div className="inline-flex flex-wrap items-center justify-center gap-3 px-5 py-2.5 rounded-2xl bg-black/40 border border-white/10">
                <LineBadge line={championLine} size="md" />
                <span className="text-sm font-bold text-yellow-400">
                  {championStanding.points} PTS
                </span>
                <span className="text-xs text-slate-400">
                  {championStanding.wins}V • {championStanding.draws}E • {championStanding.losses}D • SG{' '}
                  {championStanding.goalDifference >= 0
                    ? `+${championStanding.goalDifference}`
                    : championStanding.goalDifference}
                </span>
              </div>
            )}

            {championPlayers.length > 0 && (
              <div className="pt-2">
                <p className="text-[11px] uppercase tracking-wider text-slate-400 mb-2">
                  Elenco Campeão de Sábado
                </p>
                <div className="flex flex-wrap justify-center gap-2">
                  {championPlayers.map((cp) => (
                    <div
                      key={cp.id}
                      className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-xs"
                    >
                      <img
                        src={cp.photoUrl}
                        alt={cp.name}
                        className="w-5 h-5 rounded-full object-cover"
                      />
                      <span className="font-semibold text-slate-100">
                        {cp.nickname || cp.name}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Premiações Individuais (3 Cards de Gala) */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Melhor Jogador */}
            <div className="p-5 rounded-2xl bg-[#121822]/90 border border-yellow-400/30 flex flex-col items-center text-center">
              <div className="w-10 h-10 rounded-xl bg-yellow-400/15 text-yellow-400 flex items-center justify-center mb-3">
                <Award className="w-5 h-5" />
              </div>
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-yellow-400">
                🏆 Melhor da Pelada
              </span>
              {bestPlayers.length > 0 ? (
                <div className="mt-3 space-y-2">
                  <div className="flex justify-center -space-x-2">
                    {bestPlayers.map((p) => (
                      <img
                        key={p.id}
                        src={p.photoUrl}
                        alt={p.name}
                        className="w-16 h-16 rounded-2xl object-cover border-2 border-yellow-400 shadow-lg"
                      />
                    ))}
                  </div>
                  <div className="font-bold text-white text-base">
                    {bestPlayers.map((p) => p.nickname || p.name).join(' & ')}
                  </div>
                  <div className="text-xs text-slate-400">
                    Eleito com {bpAward?.metricValue || 0} voto(s)
                  </div>
                </div>
              ) : (
                <p className="text-xs text-slate-500 mt-4">Sem votos computados</p>
              )}
            </div>

            {/* Melhor Goleiro */}
            <div className="p-5 rounded-2xl bg-[#121822]/90 border border-sky-400/30 flex flex-col items-center text-center">
              <div className="w-10 h-10 rounded-xl bg-sky-400/15 text-sky-400 flex items-center justify-center mb-3">
                <Shield className="w-5 h-5" />
              </div>
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-sky-400">
                🧤 Melhor Goleiro
              </span>
              {bestKeepers.length > 0 ? (
                <div className="mt-3 space-y-2">
                  <div className="flex justify-center -space-x-2">
                    {bestKeepers.map((p) => (
                      <img
                        key={p.id}
                        src={p.photoUrl}
                        alt={p.name}
                        className="w-16 h-16 rounded-2xl object-cover border-2 border-sky-400 shadow-lg"
                      />
                    ))}
                  </div>
                  <div className="font-bold text-white text-base">
                    {bestKeepers.map((p) => p.nickname || p.name).join(' & ')}
                  </div>
                  <div className="text-xs text-slate-400">
                    Eleito com {gkAward?.metricValue || 0} voto(s)
                  </div>
                </div>
              ) : (
                <p className="text-xs text-slate-500 mt-4">Sem votos computados</p>
              )}
            </div>

            {/* Artilheiro */}
            <div className="p-5 rounded-2xl bg-[#121822]/90 border border-lime-400/30 flex flex-col items-center text-center">
              <div className="w-10 h-10 rounded-xl bg-lime-400/15 text-lime-400 flex items-center justify-center mb-3">
                <Flame className="w-5 h-5" />
              </div>
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-lime-400">
                ⚽ Artilheiro da Rodada
              </span>
              {topScorers.length > 0 ? (
                <div className="mt-3 space-y-2">
                  <div className="flex justify-center -space-x-2">
                    {topScorers.map((p) => (
                      <img
                        key={p.id}
                        src={p.photoUrl}
                        alt={p.name}
                        className="w-16 h-16 rounded-2xl object-cover border-2 border-lime-400 shadow-lg"
                      />
                    ))}
                  </div>
                  <div className="font-bold text-white text-base">
                    {topScorers.map((p) => p.nickname || p.name).join(' & ')}
                  </div>
                  <div className="text-xs text-lime-300 font-semibold">
                    {topScorerGoals} gol(s) marcado(s)
                    {topScorers.length > 1 ? ' (Empate)' : ''}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-slate-500 mt-4">Sem gols registrados</p>
              )}
            </div>
          </div>

          {/* Estatísticas Gerais da Rodada */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3.5 rounded-2xl bg-black/40 border border-white/10 text-center">
              <div className="text-2xl font-extrabold text-white font-display">
                {roundMatches.length}
              </div>
              <div className="text-xs text-slate-400">Partidas Realizadas</div>
            </div>
            <div className="p-3.5 rounded-2xl bg-black/40 border border-white/10 text-center">
              <div className="text-2xl font-extrabold text-lime-400 font-display">{totalGoals}</div>
              <div className="text-xs text-slate-400">Gols na Manhã</div>
            </div>
            <div className="p-3.5 rounded-2xl bg-black/40 border border-white/10 text-center">
              <div className="text-2xl font-extrabold text-white font-display">{avgGoals}</div>
              <div className="text-xs text-slate-400">Média Gols / Jogo</div>
            </div>
            <div className="p-3.5 rounded-2xl bg-black/40 border border-white/10 text-center">
              <div className="text-2xl font-extrabold text-white font-display">
                {pelada.presentPlayerIds.length}
              </div>
              <div className="text-xs text-slate-400">Atletas em Campo</div>
            </div>
          </div>

          {/* Classificação Final das Linhas + Foto Oficial */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="rounded-2xl bg-[#11161F] border border-white/10 overflow-hidden">
              <div className="px-4 py-3 border-b border-white/10 flex items-center gap-2">
                <Medal className="w-4 h-4 text-yellow-400" />
                <h3 className="text-sm font-bold text-white">Classificação Final das Linhas</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-slate-400 border-b border-white/5">
                      <th className="text-left py-2.5 px-3">#</th>
                      <th className="text-left py-2.5 px-2">Linha</th>
                      <th className="text-center py-2.5 px-2 font-bold text-white">P</th>
                      <th className="text-center py-2.5 px-1.5">J</th>
                      <th className="text-center py-2.5 px-1.5">V</th>
                      <th className="text-center py-2.5 px-1.5">E</th>
                      <th className="text-center py-2.5 px-1.5">D</th>
                      <th className="text-center py-2.5 px-2">SG</th>
                    </tr>
                  </thead>
                  <tbody>
                    {standings.map((row, idx) => (
                      <tr
                        key={row.lineId}
                        className={`border-b border-white/5 ${
                          idx === 0 ? 'bg-yellow-400/10' : ''
                        }`}
                      >
                        <td className="py-2.5 px-3 font-bold">
                          {idx === 0 ? '🏆' : `${idx + 1}º`}
                        </td>
                        <td className="py-2.5 px-2">
                          <LineBadge line={row} size="sm" />
                        </td>
                        <td className="py-2.5 px-2 text-center font-extrabold text-lime-400 text-sm">
                          {row.points}
                        </td>
                        <td className="py-2.5 px-1.5 text-center text-slate-300">{row.played}</td>
                        <td className="py-2.5 px-1.5 text-center text-emerald-400">{row.wins}</td>
                        <td className="py-2.5 px-1.5 text-center text-slate-300">{row.draws}</td>
                        <td className="py-2.5 px-1.5 text-center text-rose-400">{row.losses}</td>
                        <td className="py-2.5 px-2 text-center font-semibold text-slate-200">
                          {row.goalDifference >= 0 ? `+${row.goalDifference}` : row.goalDifference}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Foto oficial da rodada */}
            <div className="rounded-2xl bg-[#11161F] border border-white/10 overflow-hidden flex flex-col">
              <div className="px-4 py-3 border-b border-white/10 flex items-center gap-2">
                <Camera className="w-4 h-4 text-lime-400" />
                <h3 className="text-sm font-bold text-white">Foto Oficial da Rodada</h3>
              </div>
              {officialPhoto ? (
                <div className="flex-1 flex flex-col">
                  <img
                    src={officialPhoto.url}
                    alt={officialPhoto.caption}
                    className="w-full h-48 object-cover"
                  />
                  <div className="p-3 text-xs text-slate-300">{officialPhoto.caption}</div>
                </div>
              ) : (
                <div className="flex-1 flex items-center justify-center p-8 text-xs text-slate-500">
                  Nenhuma foto enviada para esta rodada.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
