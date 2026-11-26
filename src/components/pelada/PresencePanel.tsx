import React, { useMemo, useState } from 'react';
import { ArrowRight, Check, ClipboardCopy, ClipboardPaste, RotateCcw, X } from 'lucide-react';
import { useBaba } from '../../context/BabaContext';
import { babaService } from '../../services/babaService';
import type { Pelada, Player, PresenceStatus } from '../../types/domain';
import { parseRosterText } from '../../utils/rosterParser';
import { formatShortDateBR } from '../../utils/statsEngine';
import { PlayerAvatar, StatTile, cardClass, ghostBtn, inputClass, playerLabel, primaryBtn } from '../ui';

export function getPresenceGroups(pelada: Pelada, players: Player[]) {
  const byId = new Map(players.map((p) => [p.id, p]));
  const confirmedSet = new Set(pelada.confirmedPlayerIds);
  const declinedSet = new Set(pelada.declinedPlayerIds);
  const pick = (ids: string[]) =>
    ids.map((id) => byId.get(id)).filter((p): p is Player => Boolean(p));
  return {
    confirmed: pick(pelada.confirmedPlayerIds),
    declined: pick(pelada.declinedPlayerIds.filter((id) => !confirmedSet.has(id))),
    pending: players.filter((p) => p.active && !confirmedSet.has(p.id) && !declinedSet.has(p.id)),
  };
}

export const PresencePanel: React.FC<{ pelada: Pelada; onGoToTeams?: () => void }> = ({ pelada, onGoToTeams }) => {
  const { snapshot, user, isAdmin, runAction, busyAction, pushToast } = useBaba();
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState('');

  const groups = useMemo(
    () => (snapshot ? getPresenceGroups(pelada, snapshot.players) : null),
    [pelada, snapshot]
  );
  if (!snapshot || !user || !groups) return null;

  const isFinished = pelada.status === 'finished';
  const parsed = importText ? parseRosterText(importText, snapshot.players) : [];

  const setFor = (playerId: string, status: PresenceStatus) =>
    runAction(() => babaService.setPlayerPresence(pelada.id, playerId, status));

  const handleImport = async () => {
    if (parsed.length === 0) return;
    const res = await runAction(async () => {
      const ids = await babaService.ensurePlayersFromRoster(
        parsed.map((it) => ({ name: it.name, position: it.position, matchedPlayerId: it.matchedPlayerId, skillLevel: it.skillLevel }))
      );
      await babaService.setConfirmedList(pelada.id, [...pelada.confirmedPlayerIds, ...ids]);
      return ids.length;
    }, 'Lista importada!');
    if (res) {
      setImportText('');
      setImportOpen(false);
    }
  };

  const copyList = () => {
    const text = [
      `⚽ *${pelada.title} — ${formatShortDateBR(pelada.date)}${pelada.time ? ` às ${pelada.time}` : ''}*`,
      pelada.location ? `📍 ${pelada.location}` : '',
      '',
      `✅ *Confirmados (${groups.confirmed.length})*`,
      ...groups.confirmed.map((p, i) => `${i + 1}. ${playerLabel(p)}${p.position === 'Goleiro' ? ' (GK)' : ''}`),
      groups.declined.length ? `\n❌ *Não vão:* ${groups.declined.map(playerLabel).join(', ')}` : '',
    ]
      .filter((l) => l !== '')
      .join('\n');
    navigator.clipboard
      .writeText(text)
      .then(() => pushToast('Lista copiada! 📋'))
      .catch(() => pushToast('Não foi possível copiar', undefined, 'error'));
  };

  const PlayerRow: React.FC<{ p: Player; status: PresenceStatus }> = ({ p, status }) => (
    <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-[#1F1F1F]">
      <div className="flex items-center gap-2 min-w-0">
        <PlayerAvatar player={p} size={26} />
        <span className="text-xs font-semibold text-white truncate">{playerLabel(p)}</span>
        {p.position === 'Goleiro' && <span className="text-[11px]">🧤</span>}
        {p.id === user.playerId && <span className="text-[10px] text-lime-400 font-bold">você</span>}
      </div>
      {isAdmin && !isFinished && (
        <div className="flex items-center gap-1 shrink-0">
          {status !== 'confirmed' && (
            <button
              disabled={busyAction}
              onClick={() => setFor(p.id, 'confirmed')}
              className="p-1.5 rounded-lg bg-lime-400/10 text-lime-400 hover:bg-lime-400/20 cursor-pointer disabled:opacity-40"
              title="Marcar como confirmado"
            >
              <Check className="w-3.5 h-3.5" />
            </button>
          )}
          {status !== 'declined' && (
            <button
              disabled={busyAction}
              onClick={() => setFor(p.id, 'declined')}
              className="p-1.5 rounded-lg bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 cursor-pointer disabled:opacity-40"
              title="Marcar como ausente"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          {status !== 'pending' && (
            <button
              disabled={busyAction}
              onClick={() => setFor(p.id, 'pending')}
              className="p-1.5 rounded-lg bg-white/5 text-slate-400 hover:text-white cursor-pointer disabled:opacity-40"
              title="Voltar para pendente"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}
    </div>
  );

  const Column: React.FC<{ title: string; tone: string; list: Player[]; status: PresenceStatus; empty: string }> = ({
    title,
    tone,
    list,
    status,
    empty,
  }) => (
    <div className={`${cardClass} !rounded-2xl p-3.5 space-y-2`}>
      <div className={`text-xs font-extrabold ${tone}`}>
        {title} ({list.length})
      </div>
      {list.length === 0 ? (
        <div className="text-[11px] text-slate-500 py-2">{empty}</div>
      ) : (
        <div className="space-y-1.5 max-h-80 overflow-y-auto">
          {list.map((p) => (
            <PlayerRow key={p.id} p={p} status={status} />
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      {/* INDICADORES */}
      <div className="grid grid-cols-3 gap-2">
        <StatTile label="Confirmados" value={groups.confirmed.length} tone="lime" />
        <StatTile label="Pendentes" value={groups.pending.length} tone="yellow" />
        <StatTile label="Ausentes" value={groups.declined.length} tone="rose" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button onClick={copyList} className={ghostBtn}>
          <ClipboardCopy className="w-3.5 h-3.5 text-lime-400" /> Copiar lista
        </button>
        {isAdmin && !isFinished && (
          <button onClick={() => setImportOpen((v) => !v)} className={ghostBtn}>
            <ClipboardPaste className="w-3.5 h-3.5 text-lime-400" /> Importar lista do WhatsApp
          </button>
        )}
      </div>

      {importOpen && isAdmin && (
        <div className={`${cardClass} p-4 space-y-3 animate-fade-in`}>
          <textarea
            rows={7}
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            placeholder={'Cole a lista com o nível na frente (1 = melhor, 6 = mais fraco):\nSaladinha 1\nPepeu 2\nPedro (GK) 3'}
            className={`${inputClass} leading-relaxed`}
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-slate-400">
              {parsed.length} nome(s) • {parsed.filter((p) => p.skillLevel !== undefined).length} com nível • {parsed.filter((p) => p.isNew).length} novo(s) cadastro(s)
            </span>
            <button disabled={busyAction || parsed.length === 0} onClick={handleImport} className={primaryBtn}>
              Marcar como confirmados
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Column title="✅ Confirmados" tone="text-lime-400" list={groups.confirmed} status="confirmed" empty="Ninguém confirmou ainda." />
        <Column title="⏳ Pendentes" tone="text-yellow-300" list={groups.pending} status="pending" empty="Todos já responderam." />
        <Column title="❌ Ausentes" tone="text-rose-400" list={groups.declined} status="declined" empty="Nenhuma ausência." />
      </div>

      {/* IR PARA OS TIMES */}
      {onGoToTeams && (
        <div className="space-y-1.5">
          <button
            type="button"
            onClick={onGoToTeams}
            disabled={groups.confirmed.length < 2}
            className={`${primaryBtn} w-full !py-3.5 !text-sm`}
          >
            Presença confirmada — ir para os times
            <ArrowRight className="w-4 h-4" />
          </button>
          <p className="text-center text-[11px] text-slate-500">
            {groups.confirmed.length < 2
              ? 'São necessários pelo menos 2 confirmados para montar os times.'
              : `${groups.confirmed.length} confirmados${groups.pending.length ? ` • ${groups.pending.length} ainda sem resposta` : ''}`}
          </p>
        </div>
      )}
    </div>
  );
};
