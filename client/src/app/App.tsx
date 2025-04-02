import React from 'react';
import { AppRouter } from './router.js';
import { QueryProvider } from '../QueryProvider.js';
import './Theme.css';

const App: React.FC = () => {
  return (
    <QueryProvider>
      <div className="app">
        <AppRouter />
      </div>
    </QueryProvider>
  );
};

export default App;
