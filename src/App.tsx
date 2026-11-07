import React from 'react';
import { CreatePeladaModal } from './components/CreatePeladaModal';
import { LayoutShell } from './components/LayoutShell';
import { PeladaCeremonyModal } from './components/PeladaCeremonyModal';
import { BabaProvider, useBaba } from './context/BabaContext';
import { AuthPage } from './pages/AuthPage';
import { GalleryPage } from './pages/GalleryPage';
import { HomePeladaPage } from './pages/HomePeladaPage';
import { ProfilePage } from './pages/ProfilePage';
import { RankingPage } from './pages/RankingPage';
import { VotingPage } from './pages/VotingPage';

const AppRouter: React.FC = () => {
  const { user, loadingInitial, activeSection } = useBaba();

  if (loadingInitial) {
    return (
      <div className="min-h-screen bg-[#090B0E] flex flex-col items-center justify-center gap-3">
        <div className="w-12 h-12 rounded-2xl bg-lime-400 text-slate-950 flex items-center justify-center font-black text-2xl animate-bounce">
          ⭐
        </div>
        <div className="text-xs font-bold text-slate-400">Carregando Liga das Estrelas...</div>
      </div>
    );
  }

  if (!user) {
    return <AuthPage />;
  }

  return (
    <LayoutShell>
      {activeSection === 'hoje' && <HomePeladaPage />}
      {activeSection === 'votacoes' && <VotingPage />}
      {activeSection === 'galeria' && <GalleryPage />}
      {activeSection === 'ranking' && <RankingPage />}
      {activeSection === 'perfil' && <ProfilePage />}

      <CreatePeladaModal />
      <PeladaCeremonyModal />
    </LayoutShell>
  );
};

export const App: React.FC = () => {
  return (
    <BabaProvider>
      <AppRouter />
    </BabaProvider>
  );
};

export default App;
