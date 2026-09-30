import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import SoundManager from '../pages/SoundManager/components/SoundManager.js';
import NavBar from '../components/NavBar/NavBar.js';
import { usePageTransition } from '../hooks/usePageTransition.js';
import './AppLayout.css';
import { GmSessionTeardown } from './GmSessionTeardown.js';
import { AuthProvider, useAuth } from './contexts/AuthContext.js';
import AuthPage from 'src/pages/auth/AuthPage.js';
import ProtectedRoute from './ProtectedRoute.js';
import { EncounterManager } from 'src/pages/EncounterManager/components/EncounterManager.js';
import { Compendium } from 'src/pages/Compendium/components/Compendium.js';
import { Campaigns } from 'src/pages/Campaigns/components/Campaigns.js';
import { PlayerEncounter } from 'src/pages/EncounterManager/components/PlayerEncounter.js';
import { CampaignSelectionProvider } from './contexts/CampaignSelectionContext.js';

const Notes: React.FC = () => <div className="page-container">Notes Coming Soon</div>;
const Home: React.FC = () => <div className="page-container">Welcome to TTRPG Session Manager</div>;


export function AppRoutes() {
  return (
    <>
      <GmSessionTeardown />
      <Routes>
        <Route path="/login" element={<AuthPage />} />
        <Route element={<ProtectedRoute />}>
          <Route path="/" element={<AppLayout />}>
            <Route index element={null} />
            <Route path="sound-manager" element={null} />
            {/* AppLayout renders every section itself; these routes only make the paths match. */}
            <Route path="encounter-manager/:campaignId?/:encounterId?" element={null} />
            <Route path="campaigns" element={null} />
            <Route path="compendium" element={null} />
            <Route path="notes" element={null} />
          </Route>
        </Route>
      </Routes>
    </>
  );
}

const AppRouter: React.FC = () => (
  <AuthProvider>
    <Router><AppRoutes /></Router>
  </AuthProvider>
);

const AppLayout: React.FC = () => {
  usePageTransition();
  const { currentUser } = useAuth();
  const { pathname } = useLocation();
  const isGm = currentUser?.isGm === true;
  if (!currentUser) return null;
  // A player has Compendium and the Encounter destination of the selected campaign.
  const section = pathname.split('/')[1];
  if (!isGm && section !== 'compendium' && section !== 'encounter-manager') return <Navigate to="/compendium" replace />;

  return (
    // Keyed by account: another account in this tab starts from its own stored campaign.
    <CampaignSelectionProvider key={currentUser.id} userId={currentUser.id}>
      <NavBar isGm={isGm} />
      <main className="app-content">
        {/* use CSS to show/hide pages instead of unmounting them */}
        <div className="page-wrapper">
          {isGm && (
            <>
              <div id="home-page" className="app-page"><Home /></div>
              <div id="sound-manager-page" className="app-page"><SoundManager key={currentUser.id} /></div>
              <div id="encounter-manager-page" className="app-page"><EncounterManager key={currentUser.id} /></div>
              <div id="campaigns-page" className="app-page"><Campaigns /></div>
              <div id="notes-page" className="app-page"><Notes /></div>
            </>
          )}
          {!isGm && <div id="encounter-manager-page" className="app-page"><PlayerEncounter /></div>}
          <div id="compendium-page" className="app-page">
            <Compendium />
          </div>
        </div>
      </main>
    </CampaignSelectionProvider>
  );
};

export default AppRouter;