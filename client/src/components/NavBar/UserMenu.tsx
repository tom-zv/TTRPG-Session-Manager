import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from 'src/app/contexts/AuthContext.js';
import { BiChevronDown } from "react-icons/bi";
import './UserMenu.css';

const UserMenu: React.FC = () => {
  const { currentUser, logout } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleLogout = async () => {
    try {
      await logout();
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  if (!currentUser) {
    return null;
  }

  return (
    <div className="user-menu-container" ref={menuRef}>
      <button 
        className="user-menu-button" 
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-haspopup="true"
      >
        {currentUser.username} <BiChevronDown />
      </button>
      
      {isOpen && (
        <div className="user-menu-dropdown">
          <div className="user-info">
            <p className="username">{currentUser.username}</p>
            <p className="role">{currentUser.isDm ? 'Dungeon Master' : 'Player'}</p>
          </div>
          <hr />
          <button className="menu-item" onClick={handleLogout}>
            Logout
          </button>
        </div>
      )}
    </div>
  );
};

export default UserMenu;