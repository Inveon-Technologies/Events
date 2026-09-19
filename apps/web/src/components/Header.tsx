import { useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { Logo } from './Logo';
import { Icon } from './Icon';

const NAV_LINKS = [
  { to: '/', label: 'Explore' },
  { to: '/#categories', label: 'Categories' },
  { to: '/organizer/login', label: 'Host an Event' },
];

export function Header() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const navigate = useNavigate();

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (query.trim()) {
      navigate(`/?q=${encodeURIComponent(query.trim())}`);
      setSearchOpen(false);
    }
  }

  function handleNavClick(to: string) {
    if (to.includes('#categories')) {
      const el = document.getElementById('categories');
      if (el) {
        el.scrollIntoView({ behavior: 'smooth' });
      }
    }
  }

  return (
    <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-md border-b border-slate-100 transition-all">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 sm:h-20 flex items-center justify-between">
        
        {/* Brand Logo */}
        <Link to="/" aria-label="Inveon Events Home" className="flex items-center gap-3 group focus:outline-none">
          <img
            src="https://lh3.googleusercontent.com/aida-public/AB6AXuDOu7O6QckldNU8Q1b_jyziqMZctME8kx93UHIGU7MEowMcZxp_gd0hAENIKXIAgelubTZMHeS-XB84YCu79O0sSuUOu3AcroKDSkc_wVR2lXX9EaTgpQ51BsWO8Ple49PWdiJKhBmtBtB6HWwnXmpdSk0oeQ9StdhF_ZuPhV4yJyTafymOGm5LdlsgOrrCTuFiFQACtRHytmQPXdbBltzWx0DydPudiHRLzXCu0VvaGlv-FQwGj0cyuDsdv67GQCX4T4o"
            alt="Inveon Events"
            className="h-8 sm:h-9 w-auto object-contain"
          />
        </Link>

        {/* Center Nav Links */}
        <nav className="hidden md:flex items-center gap-6 lg:gap-8 text-sm font-medium text-slate-600">
          <a
            href="#explore"
            onClick={(e) => {
              if (window.location.pathname === '/') {
                e.preventDefault();
                document.getElementById('explore')?.scrollIntoView({ behavior: 'smooth' });
              }
            }}
            className="hover:text-brand-600 transition-colors"
          >
            Explore
          </a>
          <a
            href="#explore"
            onClick={(e) => {
              if (window.location.pathname === '/') {
                e.preventDefault();
                document.getElementById('explore')?.scrollIntoView({ behavior: 'smooth' });
              }
            }}
            className="relative group cursor-pointer flex items-center gap-1 hover:text-brand-600 transition-colors"
          >
            <span>Categories</span>
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-chevron-down w-4 h-4 transition-transform group-hover:rotate-180">
              <path d="m6 9 6 6 6-6"></path>
            </svg>
          </a>
          <Link
            to="/organizer/login"
            className="hover:text-brand-600 transition-colors"
          >
            Host an Event
          </Link>
        </nav>

        {/* Right Action Items */}
        <div className="flex items-center gap-2 sm:gap-4">
          {/* Search Icon button */}
          <button
            onClick={() => setSearchOpen(!searchOpen)}
            aria-label="Search"
            className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-full transition-colors focus:outline-none"
            type="button"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
              <path d="m21 21-4.34-4.34"></path>
              <circle cx="11" cy="11" r="8"></circle>
            </svg>
          </button>

          <div className="w-px h-5 bg-slate-200 hidden sm:block"></div>

          {/* Login button */}
          <Link
            to="/bookings/lookup"
            className="hidden sm:inline-block text-sm font-semibold text-slate-700 hover:text-brand-600 px-2 sm:px-3 py-2 transition-colors"
          >
            Login
          </Link>

          {/* Host an Event Primary button */}
          <Link
            to="/organizer/login"
            className="inline-flex items-center justify-center px-3.5 sm:px-5 py-2 sm:py-2.5 rounded-lg text-xs sm:text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 active:bg-brand-800 shadow-sm shadow-brand-500/30 transition-all hover:shadow-md"
          >
            Host an Event
          </Link>

          {/* Mobile menu toggle */}
          <button
            aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
            onClick={() => setMobileOpen((v) => !v)}
            className="md:hidden p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg focus:outline-none"
            type="button"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
              <path d="M4 5h16"></path>
              <path d="M4 12h16"></path>
              <path d="M4 19h16"></path>
            </svg>
          </button>
        </div>
      </div>

      {/* Floating search expander */}
      {searchOpen && (
        <div className="border-t border-slate-100 bg-white px-4 py-3 shadow-inner">
          <form onSubmit={handleSearch} className="max-w-xl mx-auto flex items-center gap-2">
            <div className="relative flex-1">
              <Icon name="search" className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-[18px]" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search events, treks, workshops, trips..."
                className="w-full pl-10 pr-4 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
            </div>
            <button
              type="submit"
              className="px-4 py-2 text-sm font-medium bg-primary text-white rounded-lg hover:bg-primary-container"
            >
              Search
            </button>
          </form>
        </div>
      )}

      {/* Mobile nav drawer */}
      {mobileOpen && (
        <div className="md:hidden border-t border-slate-100 bg-white px-4 py-4 space-y-3">
          {NAV_LINKS.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              onClick={() => {
                setMobileOpen(false);
                handleNavClick(link.to);
              }}
              className="block py-2 text-[15px] font-medium text-slate-700 hover:text-primary"
            >
              {link.label}
            </NavLink>
          ))}
          <div className="pt-2 flex flex-col gap-2">
            <Link
              to="/bookings/lookup"
              onClick={() => setMobileOpen(false)}
              className="w-full py-2.5 text-center text-sm font-semibold text-slate-800 border border-slate-200 rounded-lg"
            >
              Login
            </Link>
            <Link
              to="/organizer/login"
              onClick={() => setMobileOpen(false)}
              className="w-full py-2.5 text-center text-sm font-semibold text-white bg-primary rounded-lg"
            >
              Host an Event
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}

