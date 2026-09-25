import { useEffect, useState, type FormEvent } from 'react';
import { Routes, Route, NavLink, Navigate, useParams, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Building2,
  Users,
  CalendarDays,
  Ticket,
  CreditCard,
  Mail,
  ListChecks,
  Activity,
  Server,
  DatabaseBackup,
  Palette,
  FileText,
  Award,
  Plug,
  ShieldCheck,
  ScrollText,
  LogOut,
  Menu,
} from 'lucide-react';
import { saRequest, SaError, getSaSession, saveSaSession, clearSaSession, setUnauthorizedHandler, type SaSession } from './api';
import { Button, Notice } from './ui';
import { SaKeyContext, inputClass } from './lib';
import { DashboardPage } from './pages/Dashboard';
import { OrganizersPage, OrganizerDetailPage, CustomersPage } from './pages/People';
import { EventsPage, BookingsPage, PaymentsPage } from './pages/Commerce';
import { MessagesPage, QueuePage } from './pages/Messages';
import { SystemPage, ServerPage, BackupsPage } from './pages/Technical';
import { BrandingPage, InvoicePage, CertificateFooterPage, IntegrationsPage } from './pages/Settings';
import { AdminsPage, AuditPage } from './pages/Security';

// Inveon's super admin portal. Reached only at /x/<SUPERADMIN_PATH>; any
// other value gets the site's ordinary "page not found", because the
// API answers a wrong path with the same 404 as a missing route.

function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-slate-50 text-center px-4">
      <p className="text-6xl font-black text-slate-300">404</p>
      <p className="text-slate-600">This page doesn’t exist.</p>
      <a href="/" className="text-brand-600 font-semibold text-sm">
        Go to the home page
      </a>
    </div>
  );
}

function Login({ onSignedIn }: { onSignedIn: (s: SaSession) => void }) {
  const { key = '' } = useParams();
  const [step, setStep] = useState<'password' | 'code'>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (step === 'password') {
        await saRequest(key, '/auth/login', { body: { email, password }, auth: false });
        setPassword('');
        setStep('code');
      } else {
        const res = await saRequest<{ token: string; admin: { email: string; name: string }; expiresInHours: number }>(
          key,
          '/auth/verify',
          {
            body: { email, code },
            auth: false,
          },
        );
        const session = {
          token: res.token,
          email: res.admin.email,
          name: res.admin.name,
          expiresAt: Date.now() + res.expiresInHours * 3600_000,
        };
        saveSaSession(session);
        onSignedIn(session);
      }
    } catch (err) {
      setError(err instanceof SaError ? err.message : 'Could not sign in');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-navy-900 via-navy-850 to-brand-900 px-4">
      <form onSubmit={submit} className="w-full max-w-sm bg-white rounded-2xl shadow-xl p-6 space-y-4" autoComplete="on">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-6 h-6 text-brand-600" />
          <div>
            <h1 className="text-lg font-bold text-slate-900">Inveon Control Center</h1>
            <p className="text-xs text-slate-500">Authorised Inveon staff only. Every action is logged.</p>
          </div>
        </div>
        {step === 'password' ? (
          <>
            <label className="block">
              <span className="block text-xs font-semibold text-slate-600 mb-1">Email</span>
              <input
                className={inputClass}
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </label>
            <label className="block">
              <span className="block text-xs font-semibold text-slate-600 mb-1">Password</span>
              <input
                className={inputClass}
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </label>
          </>
        ) : (
          <label className="block">
            <span className="block text-xs font-semibold text-slate-600 mb-1">6-digit code sent to {email}</span>
            <input
              className={`${inputClass} tracking-[0.5em] text-center text-lg font-bold`}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              required
            />
          </label>
        )}
        {error && <Notice message={{ kind: 'error', text: error }} />}
        <Button type="submit" disabled={busy}>
          {busy ? 'Please wait…' : step === 'password' ? 'Continue' : 'Sign in'}
        </Button>
        {step === 'code' && (
          <button type="button" className="block text-xs text-slate-500 hover:text-slate-800" onClick={() => setStep('password')}>
            Start again
          </button>
        )}
      </form>
    </div>
  );
}

const NAV: { section: string; items: [string, string, typeof LayoutDashboard][] }[] = [
  { section: 'Overview', items: [['dashboard', 'Dashboard', LayoutDashboard]] },
  {
    section: 'People & sales',
    items: [
      ['organizers', 'Organizers', Building2],
      ['customers', 'Customers', Users],
      ['events', 'Events', CalendarDays],
      ['bookings', 'Bookings', Ticket],
      ['payments', 'Payments', CreditCard],
    ],
  },
  {
    section: 'Delivery',
    items: [
      ['messages', 'Emails, WhatsApp & OTP', Mail],
      ['queue', 'Job queue', ListChecks],
    ],
  },
  {
    section: 'Technical',
    items: [
      ['system', 'System health', Activity],
      ['server', 'Server, Docker & logs', Server],
      ['backups', 'Backups', DatabaseBackup],
    ],
  },
  {
    section: 'Settings',
    items: [
      ['branding', 'Branding & logo', Palette],
      ['invoice', 'Invoice', FileText],
      ['certificate', 'Certificate footer', Award],
      ['integrations', 'Integrations', Plug],
    ],
  },
  {
    section: 'Security',
    items: [
      ['admins', 'Admins & password', ShieldCheck],
      ['audit', 'Audit log', ScrollText],
    ],
  },
];

function Shell({ session, onSignOut }: { session: SaSession; onSignOut: () => void }) {
  const { key = '' } = useParams();
  const [open, setOpen] = useState(false);
  const base = `/x/${key}`;
  return (
    <div className="min-h-screen bg-slate-100 lg:flex">
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 bg-navy-900 text-slate-300 overflow-y-auto transition-transform lg:static lg:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className="p-4 border-b border-navy-800">
          <p className="text-white font-black tracking-wider">INVEON</p>
          <p className="text-[11px] text-cyan-400 font-semibold uppercase tracking-widest">Control Center</p>
        </div>
        <nav className="p-3 space-y-4">
          {NAV.map((group) => (
            <div key={group.section}>
              <p className="px-2 mb-1 text-[10px] uppercase tracking-widest text-slate-500 font-bold">{group.section}</p>
              {group.items.map(([path, label, Icon]) => (
                <NavLink
                  key={path}
                  to={`${base}/${path}`}
                  onClick={() => setOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm ${isActive ? 'bg-brand-600 text-white' : 'hover:bg-navy-800 text-slate-300'}`
                  }
                >
                  <Icon className="w-4 h-4" /> {label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
      </aside>
      {open && <button aria-label="Close menu" className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={() => setOpen(false)} />}
      <div className="flex-1 min-w-0">
        <header className="sticky top-0 z-20 bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between gap-3">
          <button aria-label="Open menu" className="lg:hidden p-1.5 rounded hover:bg-slate-100" onClick={() => setOpen(true)}>
            <Menu className="w-5 h-5" />
          </button>
          <p className="text-xs text-slate-500 truncate">
            Signed in as <span className="font-semibold text-slate-800">{session.name}</span> ({session.email}) · session ends{' '}
            {new Date(session.expiresAt).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}
          </p>
          <Button tone="secondary" small onClick={onSignOut}>
            <span className="inline-flex items-center gap-1">
              <LogOut className="w-3.5 h-3.5" /> Sign out
            </span>
          </Button>
        </header>
        <main className="p-4 sm:p-6 max-w-7xl mx-auto">
          <Routes>
            <Route index element={<Navigate to="dashboard" replace />} />
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="organizers" element={<OrganizersPage />} />
            <Route path="organizers/:organizerId" element={<OrganizerDetailPage />} />
            <Route path="customers" element={<CustomersPage />} />
            <Route path="events" element={<EventsPage />} />
            <Route path="bookings" element={<BookingsPage />} />
            <Route path="payments" element={<PaymentsPage />} />
            <Route path="messages" element={<MessagesPage />} />
            <Route path="queue" element={<QueuePage />} />
            <Route path="system" element={<SystemPage />} />
            <Route path="server" element={<ServerPage />} />
            <Route path="backups" element={<BackupsPage />} />
            <Route path="branding" element={<BrandingPage />} />
            <Route path="invoice" element={<InvoicePage />} />
            <Route path="certificate" element={<CertificateFooterPage />} />
            <Route path="integrations" element={<IntegrationsPage />} />
            <Route path="admins" element={<AdminsPage />} />
            <Route path="audit" element={<AuditPage />} />
            <Route path="*" element={<Navigate to="dashboard" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}

export default function SuperAdminApp() {
  const { key = '' } = useParams();
  const navigate = useNavigate();
  const [gate, setGate] = useState<'checking' | 'open' | 'closed'>('checking');
  const [session, setSession] = useState<SaSession | null>(() => getSaSession());

  useEffect(() => {
    // Keep the portal out of search engines and link previews.
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex, nofollow';
    document.head.appendChild(meta);
    const previousTitle = document.title;
    document.title = 'Control Center';
    return () => {
      meta.remove();
      document.title = previousTitle;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    saRequest(key, '/ping', { auth: false })
      .then(() => !cancelled && setGate('open'))
      .catch(() => !cancelled && setGate('closed'));
    return () => {
      cancelled = true;
    };
  }, [key]);

  useEffect(() => {
    setUnauthorizedHandler(() => setSession(null));
    return () => setUnauthorizedHandler(null);
  }, []);

  // Sign out when the session's time is up, even if the tab sits idle.
  useEffect(() => {
    if (!session) return undefined;
    const timer = setTimeout(
      () => {
        clearSaSession();
        setSession(null);
      },
      Math.max(0, session.expiresAt - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [session]);

  if (gate === 'checking') return <div className="min-h-screen bg-slate-50" />;
  if (gate === 'closed') return <NotFound />;
  if (!session) return <Login onSignedIn={setSession} />;
  return (
    <SaKeyContext.Provider value={key}>
      <Shell
        session={session}
        onSignOut={() => {
          saRequest(key, '/auth/logout', { method: 'POST' }).catch(() => undefined);
          clearSaSession();
          setSession(null);
          navigate(`/x/${key}`, { replace: true });
        }}
      />
    </SaKeyContext.Provider>
  );
}
