import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

export function usePageTransition() {
  const location = useLocation();
  
  useEffect(() => {
    let pageId;
    if (location.pathname === '/') {
      pageId = 'home-page';
    } else {
      // The section is the first path segment: /encounter-manager/3/12 shows the encounter page.
      pageId = `${location.pathname.split('/')[1]}-page`;
    }

    document.querySelectorAll<HTMLElement>('.app-page').forEach((page) => {
      const active = page.id === pageId;
      page.classList.toggle('active', active);
      page.inert = !active;
      page.setAttribute('aria-hidden', String(!active));
    });
  }, [location]);
}