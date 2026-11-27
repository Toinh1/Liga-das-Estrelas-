import React, { useState } from 'react';
import { Camera } from 'lucide-react';
import { useBaba } from '../context/BabaContext';
import { babaService } from '../services/babaService';
import { DEFAULT_SKILL, type DominantFoot, type Player, type PlayerPosition } from '../types/domain';
import { fileToCompressedDataUrl } from '../utils/mediaAssets';
import { Modal, SkillMeter, inputClass, primaryBtn } from './ui';

export const POSITIONS: PlayerPosition[] = ['Goleiro', 'Defensor', 'Meia', 'Atacante'];
export const FEET: DominantFoot[] = ['Direito', 'Esquerdo', 'Ambos'];

/**
 * Cadastro/edição de jogador.
 * - Admin: todos os campos (inclusive nível técnico).
 * - Jogador editando o próprio perfil: apenas dados pessoais.
 */
export const PlayerFormModal: React.FC<{
  player?: Player;
  onClose: () => void;
  onSaved?: (playerId: string) => void;
}> = ({ player, onClose, onSaved }) => {
  const { isAdmin, runAction, busyAction, pushToast } = useBaba();
  const [name, setName] = useState(player?.name ?? '');
  const [nickname, setNickname] = useState(player?.nickname ?? '');
  const [position, setPosition] = useState<PlayerPosition>(player?.position ?? 'Meia');
  const [foot, setFoot] = useState<DominantFoot | ''>(player?.dominantFoot ?? '');
  const [skill, setSkill] = useState(player?.skillLevel ?? DEFAULT_SKILL);
  const [email, setEmail] = useState(player?.email ?? '');
  const [photo, setPhoto] = useState(player?.photoUrl ?? '');

  const handlePhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setPhoto(await fileToCompressedDataUrl(file, 480, 0.85));
    } catch (err: any) {
      pushToast('Imagem inválida', err?.message, 'error');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    if (player) {
      const res = await runAction(
        () =>
          babaService.updatePlayer(player.id, {
            name,
            nickname,
            position,
            dominantFoot: foot || undefined,
            photoUrl: photo || undefined,
            ...(isAdmin ? { skillLevel: skill } : {}),
          }),
        'Jogador atualizado!'
      );
      if (res) {
        onSaved?.(player.id);
        onClose();
      }
    } else {
      const res = await runAction(
        () =>
          babaService.createPlayer({
            name,
            nickname,
            position,
            skillLevel: skill,
            dominantFoot: foot || undefined,
            photoUrl: photo || undefined,
            email: email || undefined,
          }),
        'Jogador cadastrado!'
      );
      if (res) {
        onSaved?.(res.value);
        onClose();
      }
    }
  };

  return (
    <Modal title={player ? 'Editar jogador' : 'Novo jogador'} onClose={onClose}>
      <form onSubmit={handleSubmit} className="p-5 space-y-4">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-[#1B1F1B] border border-white/10 overflow-hidden flex items-center justify-center shrink-0">
            {photo ? (
              <img src={photo} alt="" className="w-full h-full object-cover" />
            ) : (
              <Camera className="w-6 h-6 text-slate-500" />
            )}
          </div>
          <label className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-bold text-white cursor-pointer">
            Escolher foto
            <input type="file" accept="image/*" onChange={handlePhoto} className="hidden" />
          </label>
        </div>

        <div>
          <label className="block text-xs text-slate-400 mb-1">Nome completo *</label>
          <input
            required
            maxLength={80}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputClass}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-slate-400 mb-1">Apelido</label>
            <input
              maxLength={30}
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Posição principal</label>
            <select
              value={position}
              onChange={(e) => setPosition(e.target.value as PlayerPosition)}
              className={inputClass}
            >
              {POSITIONS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-slate-400 mb-1">Pé dominante</label>
            <select
              value={foot}
              onChange={(e) => setFoot(e.target.value as DominantFoot | '')}
              className={inputClass}
            >
              <option value="">Não informado</option>
              {FEET.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </div>
          {!player && isAdmin && (
            <div>
              <label className="block text-xs text-slate-400 mb-1">E-mail (vincula a conta)</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputClass}
                placeholder="opcional"
              />
            </div>
          )}
        </div>

        {isAdmin && (
          <div>
            <label className="block text-xs text-slate-400 mb-1.5">
              Nível técnico: <span className="text-lime-400 font-bold">{skill}</span> (1 = melhor, 6 = mais fraco)
            </label>
            <SkillMeter value={skill} onChange={setSkill} size="md" />
          </div>
        )}

        <button type="submit" disabled={busyAction} className={`${primaryBtn} w-full`}>
          {busyAction ? 'Salvando...' : 'Salvar'}
        </button>
      </form>
    </Modal>
  );
};
