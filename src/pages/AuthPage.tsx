import React, { useState } from 'react';
import { useBaba } from '../context/BabaContext';
import type { PlayerPosition } from '../types/domain';

export const AuthPage: React.FC = () => {
  const { login, register, busyAction } = useBaba();

  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [nickname, setNickname] = useState('');
  const [position, setPosition] = useState<PlayerPosition>('Meia');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    try {
      if (mode === 'login') {
        await login(email, password);
      } else {
        await register({ name, nickname, email, password, position });
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Erro ao autenticar. Tente novamente.');
    }
  };

  return (
    <div className="min-h-screen bg-[#090B0E] text-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6 animate-fade-in">
        {/* Logo */}
        <div className="text-center space-y-2">
          <div className="w-14 h-14 rounded-2xl bg-lime-400 text-slate-950 flex items-center justify-center font-black text-3xl mx-auto shadow-lg shadow-lime-400/20">
            ⭐
          </div>
          <h1 className="font-display font-extrabold text-2xl text-white">
            Liga das <span className="text-lime-400">Estrelas</span>
          </h1>
          <p className="text-xs text-slate-400">Pelada Oficial de Sábado</p>
        </div>

        {/* Alternador Entrar / Criar Conta */}
        <div className="grid grid-cols-2 gap-1 p-1.5 rounded-2xl bg-[#11161F] border border-white/[0.08]">
          <button
            type="button"
            onClick={() => setMode('login')}
            className={`py-2.5 rounded-xl text-xs font-extrabold transition cursor-pointer ${
              mode === 'login' ? 'bg-lime-400 text-slate-950' : 'text-slate-400 hover:text-white'
            }`}
          >
            Entrar
          </button>
          <button
            type="button"
            onClick={() => setMode('register')}
            className={`py-2.5 rounded-xl text-xs font-extrabold transition cursor-pointer ${
              mode === 'register'
                ? 'bg-lime-400 text-slate-950'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Criar Conta
          </button>
        </div>

        {/* Formulário Limpo */}
        <form
          onSubmit={handleSubmit}
          className="p-6 rounded-3xl bg-[#11161F] border border-white/[0.08] space-y-4 shadow-2xl"
        >
          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs text-center animate-fade-in">
              {errorMsg}
            </div>
          )}

          {mode === 'register' && (
            <>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Nome</label>
                <input
                  type="text"
                  required
                  placeholder="Seu nome"
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
                    placeholder="Opcional"
                    value={nickname}
                    onChange={(e) => setNickname(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl bg-[#0B0F15] border border-white/10 text-sm text-white focus:outline-none focus:border-lime-400"
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
            </>
          )}

          <div>
            <label className="block text-xs text-slate-400 mb-1">E-mail</label>
            <input
              type="email"
              required
              placeholder="seu@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#0B0F15] border border-white/10 text-sm text-white focus:outline-none focus:border-lime-400"
            />
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1">Senha</label>
            <input
              type="password"
              required
              minLength={6}
              placeholder="••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#0B0F15] border border-white/10 text-sm text-white focus:outline-none focus:border-lime-400"
            />
          </div>

          <button
            type="submit"
            disabled={busyAction}
            className="w-full py-3 rounded-2xl bg-lime-400 hover:bg-lime-300 text-slate-950 font-extrabold text-sm transition cursor-pointer disabled:opacity-50"
          >
            {busyAction ? 'Aguarde...' : mode === 'login' ? 'Entrar' : 'Cadastrar'}
          </button>
        </form>
      </div>
    </div>
  );
};
