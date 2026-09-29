import { useLayoutEffect } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

// BrowserRouter keeps the window's scroll position across route changes,
// so opening a page from a link near the footer landed you at the bottom
// of the next page. Start every new page at the top. Back/Forward (POP)
// is left to the browser's own scroll restoration, and links with a hash
// (/#explore) are left to the page that owns that section.
export function ScrollToTop() {
  const { pathname, hash } = useLocation();
  const navigationType = useNavigationType();

  useLayoutEffect(() => {
    if (navigationType === 'POP' || hash) return;
    window.scrollTo(0, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  return null;
}
