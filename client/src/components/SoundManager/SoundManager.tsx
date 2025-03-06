import React from 'react';
import AudioList from './AudioList.js';

const SoundManager: React.FC = () => {
  return (
    <div className="sound-manager">
      <h1>Sound Manager</h1>
      <AudioList />
    </div>
  );
};

export default SoundManager;
