import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { Icon } from '../components/Icon';
import { Button } from '../components/Button';

export function EventUnavailablePage({ reference = 'RAJ-2026' }: { reference?: string }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    navigate(query.trim() ? `/?q=${encodeURIComponent(query.trim())}` : '/');
  }

  return (
    <Layout>
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-16 text-center">
        <div className="relative w-20 h-20 mb-6">
          <div className="w-20 h-20 rounded-2xl bg-brand-50 flex items-center justify-center">
            <Icon name="confirmation_number" className="text-brand-500 text-[36px]" />
          </div>
          <div className="absolute -bottom-2 -right-2 w-9 h-9 rounded-full bg-danger-50 border-2 border-white flex items-center justify-center">
            <Icon name="link_off" className="text-danger-500 text-[18px]" />
          </div>
        </div>

        <span className="text-xs font-extrabold uppercase tracking-[0.2em] text-brand-500 mb-2">
          Event Unavailable
        </span>
        <h1 className="text-3xl md:text-4xl font-extrabold text-ink tracking-tight mb-3">
          This event is no longer available
        </h1>
        <p className="text-ink-muted max-w-xl mx-auto mb-2">
          The event you're looking for may have been unpublished, cancelled, deleted, or the link
          may be incorrect.
        </p>
        <p className="text-xs text-ink-muted mb-8">
          Event reference: <span className="font-semibold text-ink-body">{reference}</span>
        </p>

        <div className="flex flex-wrap items-center justify-center gap-3 mb-12">
          <Button onClick={() => navigate('/')}>
            Explore Events <Icon name="arrow_forward" className="text-[18px]" />
          </Button>
          <Button variant="outline" onClick={() => navigate('/')}>
            Go to Home
          </Button>
        </div>

        <div className="w-full max-w-xl">
          <div className="flex items-center gap-4 mb-6">
            <div className="flex-1 border-t border-slate-200" />
            <span className="text-xs font-semibold text-ink-muted uppercase tracking-wider whitespace-nowrap">
              Looking for something else?
            </span>
            <div className="flex-1 border-t border-slate-200" />
          </div>
          <form onSubmit={handleSearch} className="flex items-center rounded-xl bg-white border border-slate-200 p-1 shadow-card">
            <Icon name="search" className="text-ink-outline text-[18px] pl-3" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search events, treks, workshops..."
              className="w-full px-3 py-2.5 text-sm focus:outline-none"
            />
            <Button type="submit" size="sm">Search</Button>
          </form>
          <p className="text-xs text-ink-muted mt-4">
            If you believe this link should still be active, contact the event organizer.{' '}
            <Link to="/" className="text-brand-500 font-semibold hover:underline">Need help?</Link>
          </p>
        </div>
      </div>
    </Layout>
  );
}
