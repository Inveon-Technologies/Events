import { ReactNode, useState } from 'react';
import { Link } from 'react-router-dom';

const NAV_ITEMS = [
  { label: 'Overview', to: '/organizer/dashboard', icon: 'overview' as const },
  { label: 'My Events', to: '/organizer/events', icon: 'events' as const },
  { label: 'Bookings', to: '/organizer/bookings', icon: 'bookings' as const },
  { label: 'Participants', to: '/organizer/participants', icon: 'participants' as const },
  { label: 'Payments', to: '/organizer/payments', icon: 'payments' as const },
  { label: 'Tickets', to: '/organizer/tickets', icon: 'tickets' as const },
  { label: 'Check-in', to: '/organizer/check-in', icon: 'checkin' as const },
  { label: 'Cancellations', to: '/organizer/cancellations', icon: 'cancellations' as const },
  { label: 'Settings', to: '/organizer/settings', icon: 'settings' as const },
];

export type OrganizerNavIcon = (typeof NAV_ITEMS)[number]['icon'];

export function initials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

export function OrganizerLayout({
  activeNav,
  pageTitle,
  organizerName,
  onLogout,
  children,
}: {
  activeNav: OrganizerNavIcon;
  pageTitle: string;
  organizerName: string | null;
  onLogout: () => void;
  children: ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const orgInitials = organizerName ? initials(organizerName) : '';

  return (
    <div className="bg-[#f8fafc] text-slate-800 font-sans antialiased min-h-screen flex flex-col lg:flex-row">
      {/* Mobile Top Bar */}
      <header className="lg:hidden bg-navy-850 text-white px-4 py-3 flex items-center justify-between sticky top-0 z-50 shadow-md">
        <div className="flex items-center space-x-3">
          <button
            aria-label="Open Sidebar Navigation"
            className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-navy-800 focus:outline-none"
            onClick={() => setSidebarOpen(true)}
            type="button"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path>
            </svg>
          </button>
          <div className="flex items-center space-x-2">
            <div className="w-7 h-7 rounded bg-gradient-to-tr from-blue-600 via-cyan-400 to-amber-400 flex items-center justify-center font-black text-xs text-white shadow-sm">IE</div>
            <span className="font-bold text-sm tracking-wider uppercase">Inveon Events</span>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <button aria-label="Notifications" className="p-2 text-slate-300 hover:text-white relative" type="button">
            <span className="w-2 h-2 rounded-full bg-red-500 absolute top-1.5 right-1.5 ring-2 ring-navy-850"></span>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path>
            </svg>
          </button>
          <div className="w-8 h-8 rounded-full bg-blue-600 text-white font-semibold text-xs flex items-center justify-center ring-2 ring-white/20">{orgInitials}</div>
        </div>
      </header>

      {/* Sidebar Backdrop (Mobile) */}
      <div
        className={`fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-40 lg:hidden transition-opacity duration-200 ${sidebarOpen ? '' : 'hidden'}`}
        onClick={() => setSidebarOpen(false)}
      ></div>

      {/* Main Sidebar Navigation */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-navy-850 text-slate-300 transform transition-transform duration-300 ease-in-out flex flex-col justify-between shrink-0 shadow-xl lg:shadow-none min-h-screen lg:static lg:inset-auto lg:translate-x-0 ${sidebarOpen ? '' : '-translate-x-full'}`}
      >
        <div className="flex flex-col flex-1 overflow-y-auto">
          <div className="px-6 py-6 border-b border-navy-800/60 flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="relative w-9 h-9 flex items-center justify-center">
                <svg className="w-9 h-9" fill="none" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
                  <path d="M6 8L20 2L34 8V18L20 12L6 18V8Z" fill="#0284C7"></path>
                  <path d="M6 18L20 12V38L6 32V18Z" fill="#0066FF"></path>
                  <path d="M34 18L20 12V38L34 32V18Z" fill="#38BDF8"></path>
                  <path d="M15 17L20 14L25 17V26L20 29L15 26V17Z" fill="#FBBF24"></path>
                </svg>
              </div>
              <div className="flex flex-col">
                <span className="text-white font-extrabold tracking-wider text-base leading-none uppercase">Inveon</span>
                <span className="text-cyan-400 font-semibold tracking-widest text-[9px] uppercase mt-1">E V E N T S</span>
                <span className="text-[8px] text-slate-400 font-normal tracking-tight scale-90 -ml-1">by Inveon Technologies</span>
              </div>
            </div>
            <button
              aria-label="Close Sidebar"
              className="lg:hidden p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-navy-800 focus:outline-none"
              onClick={() => setSidebarOpen(false)}
              type="button"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path d="M6 18L18 6M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path>
              </svg>
            </button>
          </div>
          <nav aria-label="Main Navigation" className="px-3 py-5 space-y-1.5">
            {NAV_ITEMS.map((item) => (
              <Link
                className={
                  item.icon === activeNav
                    ? 'flex items-center space-x-3 px-3.5 py-2.5 rounded-lg font-medium text-sm text-white bg-blue-600 transition-colors shadow-sm'
                    : 'flex items-center space-x-3 px-3.5 py-2.5 rounded-lg font-medium text-sm text-slate-300 hover:text-white hover:bg-navy-800/60 transition-colors'
                }
                key={item.label}
                to={item.to}
              >
                <NavIcon icon={item.icon} />
                <span>{item.label}</span>
              </Link>
            ))}
          </nav>
        </div>
        <div className="p-4 border-t border-navy-800/60">
          <button
            className="w-full flex items-center justify-between p-2 rounded-xl hover:bg-navy-800/50 cursor-pointer transition-colors group"
            onClick={onLogout}
            type="button"
          >
            <div className="flex items-center space-x-3 min-w-0">
              <div className="w-9 h-9 rounded-full bg-blue-600 text-white font-bold text-xs flex items-center justify-center shrink-0 shadow-inner">{orgInitials}</div>
              <div className="truncate text-left">
                <p className="text-xs font-semibold text-white truncate group-hover:text-blue-200">{organizerName ?? '—'}</p>
                <p className="text-[11px] text-slate-400">Sign out</p>
              </div>
            </div>
            <svg className="w-4 h-4 text-slate-400 group-hover:text-white shrink-0 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path d="M19 9l-7 7-7-7" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path>
            </svg>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-x-hidden">
        <header className="bg-white border-b border-slate-200/80 px-6 lg:px-8 py-3.5 hidden lg:flex items-center justify-between sticky top-0 z-30 shadow-xs">
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">{pageTitle}</h1>
          <div className="flex items-center space-x-4">
            <button aria-label="Notifications" className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-full transition-colors relative" type="button">
              <span className="w-2 h-2 rounded-full bg-red-500 absolute top-2 right-2 ring-2 ring-white"></span>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path>
              </svg>
            </button>
            <div className="flex items-center space-x-2 pl-2 border-l border-slate-200 cursor-pointer" onClick={onLogout}>
              <div className="w-8 h-8 rounded-full bg-blue-600 text-white font-semibold text-xs flex items-center justify-center shadow-xs">{orgInitials}</div>
              <span className="text-sm font-medium text-slate-700">{organizerName ?? '—'}</span>
              <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path d="M19 9l-7 7-7-7" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path>
              </svg>
            </div>
          </div>
        </header>

        <main className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-[1600px] w-full mx-auto">{children}</main>
      </div>
    </div>
  );
}

function NavIcon({ icon }: { icon: OrganizerNavIcon }) {
  if (icon === 'overview') {
    return (
      <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
        <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z"></path>
      </svg>
    );
  }
  const paths: Record<string, string> = {
    events: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',
    bookings: 'M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z',
    participants: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z',
    payments: 'M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z',
    tickets: 'M7 7h10M7 11h10M7 15h5M5 3h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2z',
    checkin: 'M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z',
    cancellations: 'M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z',
    settings: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z',
  };
  return (
    <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path d={paths[icon] ?? paths.events} strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8"></path>
    </svg>
  );
}
