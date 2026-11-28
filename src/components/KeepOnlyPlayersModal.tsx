import React, { useMemo, useState } from 'react';
import { useBaba } from '../context/BabaContext';
import { babaService } from '../services/babaService';
import { findListedPlayerIds } from '../utils/rosterParser';
import { Modal, PlayerAvatar, inputClass, playerLabel, primaryBtn } from './ui';

/**
 * "Manter só esta lista": o admin cola os nomes do baba atual e todos os
 * outros jogadores saem (sem conta → excluídos; com conta → inativados).
 */
export const KeepOnlyPlayersModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { snapshot, user, runAction, busyAction } = useBaba();
  const [text, setText] = useState('');

  const preview = useMemo(() => {
    if (!snapshot || !text.trim()) return null;
    // Tolerante: homônimos ficam todos e nomes sem acento também contam
    const { ids, notFound } = findListedPlayerIds(text, snapshot.players);
    const keepIds = Array.from(ids);
    const keep = new Set([...keepIds, user?.playerId]);
    const leaving = snapshot.players.filter((p) => !keep.has(p.id));
    return {
      keepIds,
      notFound,
      toDelete: leaving.filter((p) => !p.userId),
      toDeactivate: leaving.filter((p) => p.userId),
    };
  }, [snapshot, text, user?.playerId]);

  const confirm = async () => {
    if (!preview || preview.keepIds.length === 0) return;
    const msg =
      `Ficam ${preview.keepIds.length} jogador(es).\n` +
      `Serão EXCLUÍDOS ${preview.toDelete.length} jogador(es) sem conta` +
      (preview.toDeactivate.length ? ` e INATIVADOS ${preview.toDeactivate.length} com conta` : '') +
      '.\n\nEsta ação não pode ser desfeita. Continuar?';
    if (!window.confirm(msg)) return;
    const res = await runAction(
      () => babaService.keepOnlyPlayers(preview.keepIds),
      'Lista do baba atualizada!'
    );
    if (res) onClose();
  };

  return (
    <Modal title="Manter só esta lista de jogadores" onClose={onClose} wide>
      <div className="p-4 sm:p-5 space-y-4">
        <p className="text-xs text-slate-400">
          Cole os nomes de quem faz parte do baba (1 por linha). Quem não estiver na lista sai:
          jogadores <strong className="text-slate-200">sem conta</strong> são excluídos e os que{' '}
          <strong className="text-slate-200">têm conta</strong> são inativados. Sua conta nunca é afetada.
        </p>
        <textarea
          rows={8}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={'1. Dudu Santana\n2. Pepeu\n3. Chico\n...'}
          className={`${inputClass} leading-relaxed`}
        />

        {preview && (
          <div className="space-y-3 animate-fade-in">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="p-2.5 rounded-xl bg-lime-400/10 border border-lime-400/25">
                <div className="font-display font-extrabold text-lg text-lime-400">{preview.keepIds.length}</div>
                <div className="text-[10px] text-slate-400">ficam</div>
              </div>
              <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/25">
                <div className="font-display font-extrabold text-lg text-rose-400">{preview.toDelete.length}</div>
                <div className="text-[10px] text-slate-400">excluídos</div>
              </div>
              <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-400/25">
                <div className="font-display font-extrabold text-lg text-amber-300">{preview.toDeactivate.length}</div>
                <div className="text-[10px] text-slate-400">inativados (têm conta)</div>
              </div>
            </div>

            {preview.notFound.length > 0 && (
              <div className="px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-400/25 text-xs text-amber-200">
                Não encontrei estes nomes no cadastro (confira a grafia ou cadastre antes):{' '}
                <strong>{preview.notFound.join(', ')}</strong>
              </div>
            )}

            {[...preview.toDelete, ...preview.toDeactivate].length > 0 && (
              <div className="space-y-1.5">
                <div className="text-xs font-bold text-slate-300">Vão sair do baba:</div>
                <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
                  {preview.toDelete.map((p) => (
                    <span key={p.id} className="inline-flex items-center gap-1.5 pl-1 pr-2.5 py-1 rounded-full bg-rose-500/10 text-[11px] text-rose-200">
                      <PlayerAvatar player={p} size={18} /> {playerLabel(p)}
                    </span>
                  ))}
                  {preview.toDeactivate.map((p) => (
                    <span key={p.id} className="inline-flex items-center gap-1.5 pl-1 pr-2.5 py-1 rounded-full bg-amber-500/10 text-[11px] text-amber-200">
                      <PlayerAvatar player={p} size={18} /> {playerLabel(p)} (inativar)
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <button
          type="button"
          disabled={busyAction || !preview || preview.keepIds.length === 0}
          onClick={confirm}
          className={`${primaryBtn} w-full !py-3 !bg-rose-500 hover:!bg-rose-400 !text-white`}
        >
          Manter só esses jogadores
        </button>
      </div>
    </Modal>
  );
};
