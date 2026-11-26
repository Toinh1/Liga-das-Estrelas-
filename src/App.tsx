import React from 'react';
import { CreatePeladaModal } from './components/CreatePeladaModal';
import { LayoutShell } from './components/LayoutShell';
import { BrandLogo } from './components/ui';
import { PeladaCeremonyModal } from './components/PeladaCeremonyModal';
import { BabaProvider, useBaba } from './context/BabaContext';
import { AuthPage } from './pages/AuthPage';
import { AwardsPage } from './pages/AwardsPage';
import { DashboardPage } from './pages/DashboardPage';
import { GalleryPage } from './pages/GalleryPage';
import { HomePeladaPage } from './pages/HomePeladaPage';
import { PlayersPage } from './pages/PlayersPage';
import { ProfilePage } from './pages/ProfilePage';
import { RankingPage } from './pages/RankingPage';
import { VotingPage } from './pages/VotingPage';

const AppRouter: React.FC = () => {
  const { user, loadingInitial, activeSection } = useBaba();

  if (loadingInitial) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center gap-3">
        <BrandLogo size={120} className="animate-pulse" />
        <div className="text-xs font-bold text-slate-400">Carregando FutebolB3...</div>
      </div>
    );
  }

  if (!user) {
    return <AuthPage />;
  }

  return (
    <LayoutShell>
      {activeSection === 'dashboard' && <DashboardPage />}
      {activeSection === 'hoje' && <HomePeladaPage />}
      {activeSection === 'jogadores' && <PlayersPage />}
      {activeSection === 'premiacoes' && <AwardsPage />}
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
