import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';

// The Explore / Categories section lives only on the home page. These
// links used to be bare href="#explore", so on /events or /organizers
// they just appended a hash to the current page: nothing scrolled, and
// Back from /events#explore landed on /events instead of where the
// visitor came from. Now they route to /#explore (a real history entry)
// and HomePage scrolls to the section; on the home page itself they
// scroll in place without adding an entry.
export function ExploreLink({ className, children, onNavigate }: { className?: string; children: ReactNode; onNavigate?: () => void }) {
  const location = useLocation();
  return (
    <Link
      to="/#explore"
      onClick={(e) => {
        onNavigate?.();
        if (location.pathname === '/') {
          e.preventDefault();
          document.getElementById('explore')?.scrollIntoView({ behavior: 'smooth' });
        }
      }}
      className={className}
    >
      {children}
    </Link>
  );
}
