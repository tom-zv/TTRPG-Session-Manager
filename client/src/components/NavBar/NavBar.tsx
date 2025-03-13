import React from 'react';
import { NavLink } from 'react-router-dom';
import './NavBar.css';

const NavBar: React.FC = () => {
  return (
    <nav className="nav-bar">
      <div className="nav-container">
        {/* <div className="nav-brand"> */}
          {/* <NavLink to="/" end>TTRPG Session Manager</NavLink> */}
        {/* </div> */}
        <ul className="nav-tabs">
          <li>
            <NavLink to="/" end className={({isActive}) => isActive ? 'active' : ''}>
              Home
            </NavLink>
          </li>
          <li>
            <NavLink to="/sound-manager" className={({isActive}) => isActive ? 'active' : ''}>
              Sound Manager
            </NavLink>
          </li>
          <li>
            <NavLink to="/combat-tracker" className={({isActive}) => isActive ? 'active' : ''}>
              Combat Tracker
            </NavLink>
          </li>
          <li>
            <NavLink to="/notes" className={({isActive}) => isActive ? 'active' : ''}>
              Notes
            </NavLink>
          </li>
        </ul>
      </div>
    </nav>
  );
};

export default NavBar;