import React from 'react';
import { Award, Camera, LayoutDashboard, Swords, Trophy, User, Users, Vote } from 'lucide-react';
import { Modal, primaryBtn } from './ui';

export const HELP_SEEN_KEY = 'fb3_help_seen_v1';

const STEPS_ADMIN = [
  { title: 'Crie a pelada', text: 'Toque no botão verde + (no meio da barra de baixo). A data já vem na próxima quarta, 20h.' },
  { title: 'Marque a presença', text: 'Na aba Presença, cole a lista do WhatsApp em "Importar lista" ou confirme cada jogador.' },
  { title: 'Sorteie os times', text: 'Na aba Times, confira o nível de cada um (1 = melhor, 6 = mais fraco), toque em Sortear e depois em Confirmar.' },
  { title: 'Registre os jogos', text: 'Na aba Jogos, a cada partida coloque o placar e quem fez gol e assistência.' },
  { title: 'Encerre a pelada', text: 'No fim, toque em "Encerrar o Baba". O app define a linha campeã e as premiações.' },
];

const STEPS_PLAYER = [
  { title: 'Avise o admin', text: 'Quem monta a lista é o administrador. No Início você vê se já está confirmado na próxima pelada.' },
  { title: 'Veja seu time', text: 'Depois do sorteio, seu time aparece na aba Times da pelada.' },
  { title: 'Acompanhe os jogos', text: 'Placares, gols e assistências aparecem nas abas Jogos e Gols.' },
  { title: 'Vote e confira o ranking', text: 'Quando a votação abrir, vote no craque. Seus números ficam no Ranking e no seu Perfil.' },
];

const SECTIONS = [
  { icon: LayoutDashboard, name: 'Início', text: 'Próxima pelada, lista de peladas e destaques.' },
  { icon: Swords, name: 'Pelada', text: 'A pelada atual, passo a passo: presença, times, jogos e gols.' },
  { icon: Trophy, name: 'Ranking', text: 'Artilheiros, assistências, vitórias e classificação das linhas.' },
  { icon: Users, name: 'Jogadores', text: 'Lista do baba, nível e página de cada jogador.' },
  { icon: Award, name: 'Premiações', text: 'Craque, artilheiro, garçom e outros prêmios por mês e temporada.' },
  { icon: Vote, name: 'Votação', text: 'Vote no destaque da pelada quando estiver aberta.' },
  { icon: Camera, name: 'Fotos', text: 'Fotos das peladas.' },
  { icon: User, name: 'Perfil', text: 'Seus números, sua conta e sair.' },
];

export const HelpModal: React.FC<{ isAdmin: boolean; onClose: () => void }> = ({ isAdmin, onClose }) => {
  const steps = isAdmin ? STEPS_ADMIN : STEPS_PLAYER;
  return (
    <Modal title="Como funciona o FutebolB3" onClose={onClose}>
      <div className="p-4 sm:p-5 space-y-5">
        <section className="space-y-2.5">
          <h3 className="text-base font-bold uppercase text-white">
            {isAdmin ? 'Como tocar a pelada (admin)' : 'Como participar'}
          </h3>
          <ol className="space-y-2">
            {steps.map((s, i) => (
              <li key={s.title} className="flex gap-3">
                <span className="w-6 h-6 rounded-md bg-lime-400/15 text-lime-400 font-display text-sm font-bold flex items-center justify-center shrink-0">
                  {i + 1}
                </span>
                <div className="min-w-0">
                  <div className="text-sm font-bold text-white">{s.title}</div>
                  <p className="text-xs text-slate-400 leading-relaxed">{s.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="space-y-2">
          <h3 className="text-base font-bold uppercase text-white">O que tem em cada tela</h3>
          <div className="space-y-1.5">
            {SECTIONS.map((s) => {
              const Icon = s.icon;
              return (
                <div key={s.name} className="flex items-start gap-2.5 px-3 py-2 rounded-xl bg-white/[0.03]">
                  <Icon className="w-4 h-4 text-lime-400 shrink-0 mt-0.5" />
                  <div className="text-xs text-slate-300">
                    <strong className="text-white">{s.name}:</strong> {s.text}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <p className="text-[11px] text-slate-500 text-center">Você pode abrir este guia de novo pelo botão ? no topo da tela.</p>

        <button onClick={onClose} className={`${primaryBtn} w-full !py-3`}>
          Entendi, bora jogar!
        </button>
      </div>
    </Modal>
  );
};
