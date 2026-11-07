import React, { useState } from 'react';
import { Camera, LogOut, Shield } from 'lucide-react';
import { useBaba } from '../context/BabaContext';
import { babaService } from '../services/babaService';
import type { PlayerPosition } from '../types/domain';
import { fileToCompressedDataUrl } from '../utils/mediaAssets';

export const ProfilePage: React.FC = () => {
  const { user, isAdmin, snapshot, playerStatsMap, runAction, logout, busyAction } = useBaba();

  if (!snapshot || !user) return null;

  const myPlayer = snapshot.players.find((p) => p.id === user.playerId);
  const myStats = playerStatsMap[user.playerId];

  const [name, setName] = useState(myPlayer?.name || user.name);
  const [nickname, setNickname] = useState(myPlayer?.nickname || '');
  const [position, setPosition] = useState<PlayerPosition>(myPlayer?.position || 'Meia');
  const [photoUrl, setPhotoUrl] = useState(myPlayer?.photoUrl || '');

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const compressed = await fileToCompressedDataUrl(file, 480, 0.85);
    setPhotoUrl(compressed);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!myPlayer) return;
    await runAction(
      () =>
        babaService.updatePlayer(user, myPlayer.id, {
          name: name.trim(),
          nickname: nickname.trim() || undefined,
          position,
          photoUrl,
        }),
      'Perfil salvo!'
    );
  };

  return (
    <div className="max-w-lg mx-auto space-y-5">
      {/* CARD DO ATLETA */}
      <form
        onSubmit={handleSave}
        className="p-5 sm:p-6 rounded-3xl bg-[#11161F] border border-white/[0.08] space-y-5"
      >
        <div className="flex items-center gap-4">
          <div className="relative w-20 h-20 shrink-0">
            <img
              src={photoUrl || myPlayer?.photoUrl}
              alt={name}
              className="w-20 h-20 rounded-2xl object-cover border border-white/15"
            />
            <label
              className="absolute -bottom-1.5 -right-1.5 p-1.5 rounded-xl bg-lime-400 text-slate-950 cursor-pointer shadow"
              title="Trocar foto"
            >
              <Camera className="w-3.5 h-3.5" />
              <input type="file" accept="image/*" onChange={handlePhotoChange} className="hidden" />
            </label>
          </div>

          <div className="min-w-0">
            <span className="inline-block px-2.5 py-0.5 rounded-full bg-lime-400/15 text-lime-400 text-[11px] font-bold">
              {isAdmin ? 'Administrador' : 'Jogador'}
            </span>
            <h1 className="text-lg font-extrabold text-white truncate mt-1">
              {nickname || name}
            </h1>
            <p className="text-xs text-slate-500 truncate">{user.email}</p>
          </div>
        </div>

        {/* 4 Números Pessoais */}
        <div className="grid grid-cols-4 gap-2 text-center">
          <div className="p-2.5 rounded-2xl bg-[#0B0F15] border border-white/5">
            <div className="font-display font-extrabold text-lg text-white">
              {myStats?.participations || 0}
            </div>
            <div className="text-[10px] text-slate-500">Peladas</div>
          </div>
          <div className="p-2.5 rounded-2xl bg-[#0B0F15] border border-white/5">
            <div className="font-display font-extrabold text-lg text-lime-400">
              {myStats?.goals || 0}
            </div>
            <div className="text-[10px] text-slate-500">Gols</div>
          </div>
          <div className="p-2.5 rounded-2xl bg-[#0B0F15] border border-white/5">
            <div className="font-display font-extrabold text-lg text-emerald-400">
              {myStats?.matchWins || 0}
            </div>
            <div className="text-[10px] text-slate-500">Vitórias</div>
          </div>
          <div className="p-2.5 rounded-2xl bg-[#0B0F15] border border-white/5">
            <div className="font-display font-extrabold text-lg text-yellow-400">
              {myStats?.totalAwards || 0}
            </div>
            <div className="text-[10px] text-slate-500">Prêmios</div>
          </div>
        </div>

        {/* Campos Simples */}
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-slate-400 mb-1">Nome</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#0B0F15] border border-white/10 text-sm text-white focus:outline-none focus:border-lime-400"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Apelido</label>
              <input
                type="text"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#0B0F15] border border-white/10 text-sm text-white focus:outline-none focus:border-lime-400"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Posição</label>
              <select
                value={position}
                onChange={(e) => setPosition(e.target.value as PlayerPosition)}
                className="w-full px-3 py-2.5 rounded-xl bg-[#0B0F15] border border-white/10 text-sm text-white"
              >
                <option value="Goleiro">Goleiro</option>
                <option value="Defensor">Defensor</option>
                <option value="Meia">Meia</option>
                <option value="Atacante">Atacante</option>
              </select>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 pt-1">
          <button
            type="button"
            onClick={logout}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 text-xs font-bold cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            Sair
          </button>

          <button
            type="submit"
            disabled={busyAction}
            className="px-6 py-2.5 rounded-xl bg-lime-400 hover:bg-lime-300 text-slate-950 font-extrabold text-xs cursor-pointer disabled:opacity-50"
          >
            Salvar Perfil
          </button>
        </div>
      </form>

      {/* PERMISSÕES DE ACESSO (SÓ APARECE PARA ADMIN QUANDO HÁ OUTRAS CONTAS CADASTRADAS) */}
      {isAdmin && snapshot.users.length > 1 && (
        <div className="p-5 rounded-3xl bg-[#11161F] border border-white/[0.08] space-y-3">
          <div className="flex items-center gap-2 text-sm font-bold text-white">
            <Shield className="w-4 h-4 text-lime-400" />
            Permissões ({snapshot.users.length} contas)
          </div>

          <div className="space-y-2">
            {snapshot.users.map((u) => (
              <div
                key={u.id}
                className="px-3.5 py-2.5 rounded-2xl bg-[#0B0F15] flex items-center justify-between gap-2"
              >
                <div className="min-w-0">
                  <div className="text-xs font-bold text-white truncate">{u.name}</div>
                  <div className="text-[11px] text-slate-500 truncate">{u.email}</div>
                </div>
                <select
                  disabled={u.id === user.id}
                  value={u.role}
                  onChange={(e) =>
                    runAction(
                      () =>
                        babaService.updateUserRole(
                          user,
                          u.id,
                          e.target.value as 'admin' | 'player'
                        ),
                      'Permissão atualizada'
                    )
                  }
                  className="px-2.5 py-1.5 rounded-xl bg-[#161E2B] border border-white/10 text-xs font-bold text-white disabled:opacity-50"
                >
                  <option value="player">Jogador</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
