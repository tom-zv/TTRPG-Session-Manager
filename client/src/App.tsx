import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import SoundManager from './components/SoundManager/SoundManager.js';
import './App.css';

const App: React.FC = () => {
  return (
    <Router>
      <div className="app">
        <nav className="app-nav">
          <ul>
            <li><Link to="/">Home</Link></li>
            <li><Link to="/sound-manager">Sound Manager</Link></li>
          </ul>
        </nav>
        <main className="app-content">
          <Routes>
            <Route path="/sound-manager" element={<SoundManager />} />
            <Route path="/" element={<div>Welcome to TTRPG Session Manager</div>} />
          </Routes>
        </main>
      </div>
    </Router>
  );
};

export default App;
