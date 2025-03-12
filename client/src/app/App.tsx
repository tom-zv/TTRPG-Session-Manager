import React from 'react';
import { AppRouter } from './router.js';
import './Theme.css';

const App: React.FC = () => {
  return (
    <div className="app">
      <AppRouter />
    </div>
  );
};

export default App;
