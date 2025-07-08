import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import SoundManager from '../pages/SoundManager/components/SoundManager.js';
import NavBar from '../components/NavBar/NavBar.js';
import { usePageTransition } from '../hooks/usePageTransition.js';
import './AppLayout.css';
import { AuthProvider } from './contexts/AuthContext.js';
import AuthPage from 'src/pages/auth/AuthPage.js';
import ProtectedRoute from './ProtectedRoute.js';

// Placeholder components for future pages
const CombatTracker: React.FC = () => <div className="page-container">Combat Tracker Coming Soon</div>;
const Notes: React.FC = () => <div className="page-container">Notes Coming Soon</div>;
const Home: React.FC = () => <div className="page-container">Welcome to TTRPG Session Manager</div>;

// Main App component that sets up routing
const AppRouter: React.FC = () => {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          {/* Public routes */}
          <Route path="/login" element={<AuthPage />} />
          
          {/* Protected routes */}
          <Route element={<ProtectedRoute />}>
            <Route path="/" element={<AppLayout />}>
              <Route index element={<Home />} />
              <Route path="sound-manager" element={<SoundManager />} />
              <Route path="combat-tracker" element={<CombatTracker />} />
              <Route path="notes" element={<Notes />} />
            </Route>
          </Route>
        </Routes>
      </Router>
    </AuthProvider>
  );
};

// Layout component to keep all child components mounted
const AppLayout: React.FC = () => {
  usePageTransition();
  
  return (
    <>
      <NavBar />
      <main className="app-content">
        {/* We'll use CSS to show/hide pages instead of unmounting them */}
        <div className="page-wrapper">
          <div id="home-page" className="app-page">
            <Home />
          </div>
          <div id="sound-manager-page" className="app-page">
            <SoundManager />
          </div>
          <div id="combat-tracker-page" className="app-page">
            <CombatTracker />
          </div>
          <div id="notes-page" className="app-page">
            <Notes />
          </div>
        </div>
      </main>
    </>
  );
};

export default AppRouter;