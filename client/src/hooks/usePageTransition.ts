import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

export function usePageTransition() {
  const location = useLocation();
  
  useEffect(() => {
    // Remove active class from all pages
    document.querySelectorAll('.app-page').forEach(page => {
      page.classList.remove('active');
    });
    
    // Set active class based on current path
    let pageId;
    
    if (location.pathname === '/') {
      pageId = 'home-page';
    } else {
      // Extract the route name without the leading slash
      pageId = `${location.pathname.substring(1)}-page`;
    }
    
    const activePage = document.getElementById(pageId);
    if (activePage) {
      activePage.classList.add('active');
    }
  }, [location]);
}