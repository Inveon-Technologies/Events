import { FormEvent, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useOrganizerAuth } from '../context/AuthContext';
import { ApiError } from '../lib/api';

export function OrganizerLoginPage() {
  const navigate = useNavigate();
  const { login } = useOrganizerAuth();

  const [email, setEmail] = useState('organizer@example.com');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await login(email, password);
      navigate('/organizer/dashboard');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to sign in. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen flex flex-col lg:flex-row w-full font-sans antialiased bg-white text-slate-800">
      {/* BEGIN: Left Brand Panel */}
      <section className="faceted-bg text-white lg:w-[45%] xl:w-[43%] p-8 sm:p-12 lg:p-16 flex flex-col justify-between relative overflow-hidden shrink-0 z-0">
        <div aria-hidden="true" className="facet-bottom-left"></div>
        <div aria-hidden="true" className="facet-bottom-right"></div>
        <div aria-hidden="true" className="facet-accent-slice"></div>
        <div className="relative z-10">
          <header className="flex items-center gap-3.5 mb-14 lg:mb-16">
            <div className="w-11 h-11 flex-shrink-0" data-purpose="brand-logo-icon">
              <svg className="w-full h-full drop-shadow-md" fill="none" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
                <polygon fill="#F59E0B" points="12,18 32,8 32,23 12,32"></polygon>
                <polygon fill="#FBBF24" opacity="0.9" points="32,8 52,18 32,26 12,18"></polygon>
                <polygon fill="#0284C7" points="12,35 32,26 32,38 12,47"></polygon>
                <polygon fill="#38BDF8" opacity="0.95" points="32,26 52,35 32,45 12,35"></polygon>
                <polygon fill="#0369A1" points="12,50 32,41 32,53 12,62"></polygon>
                <polygon fill="#0284C7" opacity="0.9" points="32,41 52,50 32,60 12,50"></polygon>
              </svg>
            </div>
            <div className="flex flex-col">
              <div className="flex items-center tracking-wider text-2xl font-extrabold leading-none text-white">INVEON</div>
              <div className="flex items-center justify-between text-[9px] tracking-[0.28em] font-semibold text-sky-200 mt-1 uppercase">
                <span>—</span><span>E V E N T S</span><span>—</span>
              </div>
              <span className="text-[9.5px] text-sky-300/80 font-medium tracking-normal mt-0.5">by Inveon Technologies</span>
            </div>
          </header>
          <div className="space-y-4">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-sky-400">INVEON EVENTS</p>
            <h1 className="text-3xl sm:text-4xl lg:text-[44px] font-extrabold tracking-tight leading-[1.18] text-white">
              Manage Every<br />
              Event. From<br />
              <span className="text-[#1D70F5]">One Place.</span>
            </h1>
            <p className="text-slate-300 text-sm sm:text-base leading-relaxed max-w-md pt-2">
              Create events, manage bookings, track participants, monitor payments and check attendees in — all from one simple organizer platform.
            </p>
          </div>
          <div className="mt-8 sm:mt-10 space-y-4">
            {['Create & publish events', 'Manage bookings & participants', 'Track payments & tickets', 'Fast QR check-in'].map((feature) => (
              <div className="flex items-center gap-3.5" key={feature}>
                <div className="w-6 h-6 rounded-full bg-[#1D70F5] flex items-center justify-center text-white shrink-0 shadow-sm">
                  <svg className="w-3.5 h-3.5 stroke-[3]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round"></path>
                  </svg>
                </div>
                <span className="text-sm font-semibold text-white tracking-wide">{feature}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="relative z-10 mt-14 pt-6 border-t border-sky-900/60 text-[11px] uppercase tracking-[0.14em] text-slate-300 leading-relaxed font-semibold">
          <p>YOU ORGANIZE THE EVENT.</p>
          <p className="text-slate-400">INVEON HANDLES THE DIGITAL EXPERIENCE.</p>
        </div>
      </section>
      {/* END: Left Brand Panel */}

      {/* BEGIN: Right Form Panel */}
      <section className="lg:w-[55%] xl:w-[57%] flex flex-col justify-between bg-white min-h-screen">
        <div className="w-full max-w-[490px] mx-auto px-6 py-12 sm:py-16 lg:py-20 flex-1 flex flex-col justify-center">
          <div className="mb-8">
            <h2 className="text-3xl sm:text-4xl font-extrabold text-[#0A192F] tracking-tight">Welcome back</h2>
            <p className="text-slate-500 font-medium text-base mt-2">Sign in to manage your events.</p>
            <div className="mt-4 flex flex-wrap items-center gap-1.5 text-sm">
              <span className="text-slate-600 font-medium">New to Inveon Events?</span>
              <Link className="text-[#0D6EFD] hover:text-blue-700 font-semibold inline-flex items-center gap-1 transition-colors" to="/organizer/signup">
                Create an organizer account
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path d="M14 5l7 7m0 0l-7 7m7-7H3" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path>
                </svg>
              </Link>
            </div>
          </div>

          <form className="space-y-5" onSubmit={handleSubmit}>
            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700" role="alert">
                {error}
              </div>
            )}
            <div data-purpose="input-group-email">
              <label className="block text-sm font-semibold text-slate-700 mb-2" htmlFor="email">Email Address</label>
              <div className="relative rounded-lg shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8"></path>
                  </svg>
                </div>
                <input
                  className="block w-full rounded-lg border-slate-300 pl-11 pr-4 py-3 text-slate-900 placeholder-slate-400 focus:border-[#0D6EFD] focus:ring-[#0D6EFD] text-sm sm:text-base font-normal transition-colors"
                  id="email"
                  name="email"
                  placeholder="organizer@example.com"
                  required
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>
            <div data-purpose="input-group-password">
              <label className="block text-sm font-semibold text-slate-700 mb-2" htmlFor="password">Password</label>
              <div className="relative rounded-lg shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8"></path>
                  </svg>
                </div>
                <input
                  className="block w-full rounded-lg border-slate-300 pl-11 pr-11 py-3 text-slate-900 placeholder-slate-400 focus:border-[#0D6EFD] focus:ring-[#0D6EFD] text-sm sm:text-base font-normal tracking-widest transition-colors"
                  id="password"
                  name="password"
                  placeholder="••••••••••••"
                  required
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  aria-label="Toggle password visibility"
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 focus:outline-none"
                  data-purpose="password-visibility-toggle"
                  onClick={() => setShowPassword((v) => !v)}
                  type="button"
                >
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8"></path>
                  </svg>
                </button>
              </div>
            </div>
            <div className="flex justify-end pt-0.5">
              <Link className="text-sm font-semibold text-[#0D6EFD] hover:text-blue-700 transition-colors" to="/organizer/forgot-password">
                Forgot password?
              </Link>
            </div>
            <div className="flex items-center pt-0.5">
              <input
                checked={rememberMe}
                className="h-4 w-4 rounded border-slate-300 text-[#0D6EFD] focus:ring-[#0D6EFD] cursor-pointer"
                id="remember-me"
                name="remember-me"
                onChange={(e) => setRememberMe(e.target.checked)}
                type="checkbox"
              />
              <label className="ml-2.5 block text-sm font-medium text-slate-700 cursor-pointer select-none" htmlFor="remember-me">
                Keep me signed in
              </label>
            </div>
            <div className="pt-2">
              <button
                className="w-full flex justify-center py-3.5 px-4 border border-transparent rounded-lg shadow-sm text-sm font-bold tracking-wider text-white bg-[#0D6EFD] hover:bg-blue-600 active:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#0D6EFD] transition-colors uppercase disabled:opacity-60 disabled:cursor-not-allowed"
                disabled={isSubmitting}
                type="submit"
              >
                {isSubmitting ? 'SIGNING IN…' : 'SIGN IN'}
              </button>
            </div>
          </form>

          <div className="mt-8 p-4 sm:p-5 rounded-xl bg-[#F4F8FF] border border-[#DCE8FC] flex items-center gap-4" data-purpose="security-badge">
            <div className="w-12 h-12 rounded-full bg-[#DCEBFF] flex items-center justify-center shrink-0 text-[#0D6EFD]">
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                <path clipRule="evenodd" d="M12 1.5a5.25 5.25 0 00-5.25 5.25v3a3 3 0 00-3 3v6.75a3 3 0 003 3h10.5a3 3 0 003-3v-6.75a3 3 0 00-3-3v-3c0-2.9-2.35-5.25-5.25-5.25zm3.75 8.25v-3a3.75 3.75 0 00-7.5 0v3h7.5z" fillRule="evenodd"></path>
              </svg>
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 leading-tight">Secure organizer access</h3>
              <p className="text-xs text-slate-600 font-normal mt-1 leading-snug">
                Your event and organization data is protected by secure authentication.
              </p>
            </div>
          </div>
          <div className="mt-6 flex items-center justify-center gap-2 text-xs text-slate-500 font-medium">
            <svg className="w-4 h-4 text-slate-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path>
            </svg>
            <span>New accounts must verify their email before signing in.</span>
          </div>
        </div>

        <footer className="w-full border-t border-slate-200 px-6 sm:px-12 py-5 text-xs text-slate-500 flex flex-col sm:flex-row items-center justify-between gap-4">
          <nav className="flex items-center space-x-6">
            <a className="hover:text-slate-800 transition-colors" href="#terms">Terms</a>
            <a className="hover:text-slate-800 transition-colors" href="#privacy">Privacy</a>
            <a className="hover:text-slate-800 transition-colors" href="#contact">Contact</a>
          </nav>
          <div className="flex items-center gap-1.5 text-center sm:text-right">
            <span>© 2026 Inveon Events</span>
            <span className="text-slate-300">|</span>
            <span>by Inveon Technologies</span>
          </div>
        </footer>
      </section>
      {/* END: Right Form Panel */}
    </main>
  );
}
