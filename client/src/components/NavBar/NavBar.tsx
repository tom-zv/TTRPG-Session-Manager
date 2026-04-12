import React from 'react';
import { NavLink } from 'react-router-dom';
import './NavBar.css';
import UserMenu from './UserMenu.js';

const NavBar: React.FC = () => {
  return (
    <nav className="nav-bar">
      <div className="nav-container">
        {/* <div className="nav-brand"> */}
          {/* <NavLink to="/" end>TTRPG Session Manager</NavLink> */}
        {/* </div> */}
        <ul className="nav-tabs">
          <li>
            <NavLink to="/sound-manager" className={({isActive}) => isActive ? 'active' : ''}>
              Sound Manager
            </NavLink>
          </li>
          <li>
            <NavLink to="/encounter-manager" className={({isActive}) => isActive ? 'active' : ''}>
              Encounter Manager
            </NavLink>
          </li>
          <li>
            <NavLink to="/notes" className={({isActive}) => isActive ? 'active' : ''}>
              Notes
            </NavLink>
          </li>
        </ul>

        <UserMenu/>
      </div>
    </nav>
  );
};

export default NavBar;