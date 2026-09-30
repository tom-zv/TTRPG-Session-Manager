import { NavLink } from 'react-router-dom';
import './NavBar.css';
import UserMenu from './UserMenu.js';
import CampaignSwitcher from './CampaignSwitcher.js';

const NavBar = ({ isGm }: { isGm: boolean }) => {
  // The Encounter tab opens the selected campaign; the section resolves that campaign itself.
  const tabs = isGm
    ? [
      { path: '/sound-manager', label: 'Sound Manager' },
      { path: '/encounter-manager', label: 'Encounter Manager' },
      { path: '/campaigns', label: 'Campaigns' },
      { path: '/compendium', label: 'Compendium' },
      { path: '/notes', label: 'Notes' },
    ]
    : [
      { path: '/encounter-manager', label: 'Encounter' },
      { path: '/compendium', label: 'Compendium' },
    ];

  return (
    <nav className="nav-bar">
      <div className="nav-container">
        <ul className="nav-tabs">
          {tabs.map(tab => (
            <li key={tab.path}>
              <NavLink to={tab.path}>{tab.label}</NavLink>
            </li>
          ))}
        </ul>
        <div className="nav-actions">
          <CampaignSwitcher />
          <UserMenu/>
        </div>
      </div>
    </nav>
  );
};

export default NavBar;
