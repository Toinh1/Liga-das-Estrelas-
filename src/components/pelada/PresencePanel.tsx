import React, { useMemo, useState } from 'react';
import { ArrowRight, Check, ChevronDown, ClipboardCopy, ClipboardPaste, UserPlus, X } from 'lucide-react';
import { useBaba } from '../../context/BabaContext';
import { babaService } from '../../services/babaService';
import type { Pelada, Player, PresenceStatus } from '../../types/domain';
import { resolveRoster, type RosterChoices } from '../../utils/rosterParser';
import { RosterLinesEditor } from '../RosterLinesEditor';
import { formatShortDateBR } from '../../utils/statsEngine';
import { GkTag, PlayerAvatar, inputClass, playerLabel, primaryBtn } from '../ui';

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
  const [importChoices, setImportChoices] = useState<RosterChoices>({});
  const [addOpen, setAddOpen] = useState(false);

  const groups = useMemo(
    () => (snapshot ? getPresenceGroups(pelada, snapshot.players) : null),
    [pelada, snapshot]
  );
  if (!snapshot || !user || !groups) return null;

  const isFinished = pelada.status === 'finished';
  const parsed = importText ? resolveRoster(importText, snapshot.players, importChoices).items : [];

  const setFor = (playerId: string, status: PresenceStatus) =>
    runAction(() => babaService.setPlayerPresence(pelada.id, playerId, status));

  const handleImport = async () => {
    if (parsed.length === 0) return;
    const res = await runAction(async () => {
      const ids = await babaService.ensurePlayersFromRoster(
        parsed.map((it) => ({ name: it.name, position: it.position, matchedPlayerId: it.matchedPlayerId, skillLevel: it.skillLevel, forceNew: it.forceNew }))
      );
      await babaService.setConfirmedList(pelada.id, [...pelada.confirmedPlayerIds, ...ids]);
      return ids.length;
    }, 'Lista importada!');
    if (res) {
      setImportText('');
      setImportChoices({});
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
      .then(() => pushToast('Lista copiada!'))
      .catch(() => pushToast('Não foi possível copiar', undefined, 'error'));
  };

  const canEdit = isAdmin && !isFinished;
  const others = [
    ...groups.pending.map((p) => ({ p, st: 'pending' as const })),
    ...groups.declined.map((p) => ({ p, st: 'declined' as const })),
  ];

  /** Linha de jogador (chamada como função para não remontar a lista a cada toque). */
  const PlayerRow = ({ p, status }: { p: Player; status: PresenceStatus }) => (
    <li key={p.id} className="flex items-center justify-between gap-2 px-3.5 py-2">
      <div className="flex items-center gap-2.5 min-w-0">
        <PlayerAvatar player={p} size={26} />
        <span className="text-sm text-white truncate">{playerLabel(p)}</span>
        {p.position === 'Goleiro' && <GkTag />}
        {p.id === user.playerId && <span className="text-[11px] text-lime-400 font-semibold">você</span>}
        {status === 'declined' && <span className="text-[11px] text-rose-300">não vai</span>}
      </div>
      {canEdit &&
        (status === 'confirmed' ? (
          <button
            disabled={busyAction}
            onClick={() => setFor(p.id, 'declined')}
            className="p-2 -mr-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-white/[0.06] transition cursor-pointer disabled:opacity-40"
            title="Tirar da lista"
            aria-label={`Tirar ${playerLabel(p)} da lista`}
          >
            <X className="w-4 h-4" />
          </button>
        ) : (
          <button
            disabled={busyAction}
            onClick={() => setFor(p.id, 'confirmed')}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 -mr-1 rounded-lg border border-lime-400/40 text-lime-300 hover:bg-lime-400/10 text-xs font-semibold transition cursor-pointer disabled:opacity-40"
            aria-label={`Colocar ${playerLabel(p)} na lista`}
          >
            <Check className="w-3.5 h-3.5" strokeWidth={3} /> Confirmar
          </button>
        ))}
    </li>
  );

  return (
    <div className="space-y-5">
      {/* RESUMO EM UMA LINHA */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-300">
          <strong className="text-lime-400">{groups.confirmed.length} confirmados</strong>
          <span className="text-slate-500"> · {groups.pending.length} sem resposta · {groups.declined.length} não vão</span>
        </p>
        <button
          onClick={copyList}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-white/10 text-xs font-semibold text-slate-300 hover:text-white hover:border-white/25 transition cursor-pointer"
          title="Copiar lista para o WhatsApp"
        >
          <ClipboardCopy className="w-3.5 h-3.5" /> Copiar
        </button>
      </div>

      {/* IMPORTAR DO WHATSAPP (aberto pelo rodapé) */}
      {importOpen && canEdit && (
        <section className="rounded-xl bg-[#131613] border border-lime-400/30 p-3.5 space-y-3 animate-fade-in">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-white">Importar lista do WhatsApp</h3>
            <button
              onClick={() => setImportOpen(false)}
              className="p-1.5 -mr-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.06] cursor-pointer"
              aria-label="Fechar importação"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <textarea
            rows={7}
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            placeholder={'Cole a lista com o nível na frente (1 = melhor, 6 = mais fraco):\nSaladinha 1\nPepeu 2\nPedro (GK) 3'}
            className={`${inputClass} leading-relaxed`}
          />
          <RosterLinesEditor
            text={importText}
            onChange={setImportText}
            players={snapshot.players}
            choices={importChoices}
            onChoicesChange={setImportChoices}
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-slate-400">
              {parsed.length} nome(s) · {parsed.filter((p) => p.skillLevel !== undefined).length} com nível ·{' '}
              {parsed.filter((p) => p.isNew).length} novo(s) cadastro(s)
            </span>
            <button disabled={busyAction || parsed.length === 0} onClick={handleImport} className={primaryBtn}>
              Marcar como confirmados
            </button>
          </div>
        </section>
      )}

      {/* LISTA DOS CONFIRMADOS */}
      <section className="space-y-2.5">
        <h2 className="font-display font-bold uppercase text-lg text-white leading-none">
          Confirmados <span className="text-slate-500">({groups.confirmed.length})</span>
        </h2>
        {groups.confirmed.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/10 px-4 py-8 text-center text-sm text-slate-400">
            Ninguém na lista ainda.
            {canEdit && ' Use "Importar lista" no rodapé ou confirme os jogadores abaixo.'}
          </div>
        ) : (
          <ul className="rounded-xl bg-[#131613] border border-white/[0.08] divide-y divide-white/[0.06] md:grid md:grid-cols-2 md:divide-y-0">
            {groups.confirmed.map((p) => (
              PlayerRow({ p, status: 'confirmed' })
            ))}
          </ul>
        )}
      </section>

      {/* ADICIONAR JOGADORES (admin): pendentes e ausentes ficam recolhidos */}
      {canEdit && others.length > 0 && (
        <section className="rounded-xl border border-white/[0.08] overflow-hidden">
          <button
            type="button"
            onClick={() => setAddOpen((v) => !v)}
            className="w-full flex items-center justify-between gap-2 px-3.5 py-3 text-sm font-semibold text-slate-200 hover:bg-white/[0.03] cursor-pointer"
            aria-expanded={addOpen}
          >
            <span className="inline-flex items-center gap-2">
              <UserPlus className="w-4 h-4 text-lime-400" /> Adicionar jogador à lista ({others.length})
            </span>
            <ChevronDown className={`w-4 h-4 text-slate-400 transition ${addOpen ? 'rotate-180' : ''}`} />
          </button>
          {addOpen && (
            <ul className="border-t border-white/[0.06] divide-y divide-white/[0.06] animate-fade-in">
              {others.map(({ p, st }) => (
                PlayerRow({ p, status: st })
              ))}
            </ul>
          )}
        </section>
      )}

      {/* AÇÕES DO ADMIN: fixas no rodapé */}
      {canEdit && (
        <div className="sticky bottom-[calc(4.75rem+env(safe-area-inset-bottom,0px))] lg:bottom-4 z-10">
          <div className="flex gap-2 p-2 rounded-xl bg-[#0E110E]/95 border border-white/10 shadow-[0_8px_24px_-8px_rgba(0,0,0,0.8)] backdrop-blur">
            <button
              onClick={() => {
                setImportOpen((v) => !v);
                if (!importOpen) window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className={`inline-flex items-center justify-center gap-2 px-4 py-3 rounded-lg border text-sm font-semibold transition cursor-pointer ${
                importOpen ? 'border-lime-400 text-lime-300' : 'border-white/15 text-slate-200 hover:bg-white/[0.06]'
              }`}
            >
              <ClipboardPaste className="w-4 h-4" /> Importar lista
            </button>
            {onGoToTeams && (
              <button
                onClick={onGoToTeams}
                disabled={groups.confirmed.length < 2}
                title={groups.confirmed.length < 2 ? 'São necessários pelo menos 2 confirmados' : undefined}
                className="flex-1 inline-flex items-center justify-center gap-2 py-3 rounded-lg bg-lime-400 hover:bg-lime-300 text-slate-950 text-sm font-bold transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Ir para os times <ArrowRight className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
