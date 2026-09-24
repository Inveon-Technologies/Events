import React, { useEffect, useState } from 'react';
import { KeyRound, Copy, Trash2, Plus, AlertTriangle, BookOpen } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useNotifications } from '../../context/NotificationContext';
import { apiRequest, ApiError } from '../../lib/api';
import SettingsTabs from '../../components/common/SettingsTabs';

function formatDateTime(iso) {
  if (!iso) return 'Never';
  return new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function CopyButton({ value, label }) {
  const { showToast } = useNotifications();
  return (
    <button
      type="button"
      aria-label={`Copy ${label}`}
      onClick={() => {
        navigator.clipboard?.writeText(value).then(
          () => showToast(`${label} copied`, 'success'),
          () => showToast('Could not copy — select and copy it manually', 'error'),
        );
      }}
      className="p-1.5 rounded-md text-slate-500 hover:text-brand-600 hover:bg-slate-100"
    >
      <Copy className="w-3.5 h-3.5" />
    </button>
  );
}

// Settings → Integrations: app key + secret pairs that let the
// organizer's own website/app read their events, tickets and images
// through the /api/v1 read API.
export default function IntegrationsSettings() {
  const { user } = useAuth();
  const { showToast } = useNotifications();
  const [keys, setKeys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [newKeyName, setNewKeyName] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [justCreated, setJustCreated] = useState(null);

  const isOwner = user?.role === 'organizer_owner';
  const apiBase = `${window.location.origin}/api/v1`;

  useEffect(() => {
    if (!isOwner) {
      setLoading(false);
      return undefined;
    }
    let cancelled = false;
    apiRequest('/organizer/integrations/keys', { token: user?.token })
      .then((data) => {
        if (!cancelled) setKeys(data.keys);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err instanceof ApiError ? err.message : 'Could not load your keys.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOwner, user?.token]);

  async function handleCreate(e) {
    e.preventDefault();
    setCreating(true);
    setCreateError('');
    try {
      const created = await apiRequest('/organizer/integrations/keys', {
        method: 'POST',
        token: user?.token,
        body: { name: newKeyName },
      });
      setJustCreated(created);
      setKeys((prev) => [created, ...prev]);
      setNewKeyName('');
    } catch (err) {
      setCreateError(err instanceof ApiError ? err.message : 'Could not create the key.');
    } finally {
      setCreating(false);
    }
  }

  async function handleRevoke(key) {
    if (!window.confirm(`Revoke "${key.name}"? Anything using this key will stop working immediately.`)) return;
    try {
      await apiRequest(`/organizer/integrations/keys/${key.id}`, { method: 'DELETE', token: user?.token });
      setKeys((prev) => prev.filter((k) => k.id !== key.id));
      if (justCreated?.id === key.id) setJustCreated(null);
      showToast('Key revoked', 'success');
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Could not revoke the key.', 'error');
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Integrations</h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Connect your own website or app: use an app key and secret to fetch all your events, tickets and images through the API.
        </p>
      </div>

      <SettingsTabs />

      {!isOwner ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 text-sm text-slate-600">
          Only the account owner can create and manage API keys.
        </div>
      ) : (
        <>
          <section className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
            <div className="flex items-center gap-2">
              <KeyRound className="w-5 h-5 text-brand-600" />
              <h2 className="font-bold text-slate-900">API keys</h2>
            </div>

            <form onSubmit={handleCreate} className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
                placeholder='Key name, e.g. "My website"'
                aria-label="Key name"
                maxLength={100}
                className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 outline-none"
              />
              <button
                type="submit"
                disabled={creating || !newKeyName.trim()}
                className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold rounded-lg flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                <Plus className="w-4 h-4" /> {creating ? 'Creating…' : 'Generate key'}
              </button>
            </form>
            {createError && <p className="text-xs text-rose-600" role="alert">{createError}</p>}

            {justCreated && (
              <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 space-y-3" role="status">
                <div className="flex items-start gap-2 text-amber-900">
                  <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                  <p className="text-xs font-semibold">
                    Copy the app secret now — for your security it won&apos;t be shown again. If you lose it, revoke this key and generate a new one.
                  </p>
                </div>
                {[
                  ['App key', justCreated.appKey],
                  ['App secret', justCreated.appSecret],
                ].map(([label, value]) => (
                  <div key={label}>
                    <p className="text-[11px] font-bold text-slate-600 mb-1">{label}</p>
                    <div className="flex items-center gap-2 bg-white border border-amber-200 rounded-lg px-3 py-2">
                      <code className="flex-1 text-xs font-mono break-all text-slate-900">{value}</code>
                      <CopyButton value={value} label={label} />
                    </div>
                  </div>
                ))}
                <button type="button" onClick={() => setJustCreated(null)} className="text-xs font-semibold text-amber-900 hover:underline">
                  I&apos;ve saved it
                </button>
              </div>
            )}

            {loading ? (
              <p className="text-xs text-slate-400">Loading…</p>
            ) : loadError ? (
              <p className="text-xs text-rose-600">{loadError}</p>
            ) : keys.length === 0 ? (
              <p className="text-xs text-slate-500">No API keys yet. Generate one to connect your website or app.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-slate-500 border-b border-slate-100">
                      <th className="py-2 pr-3 font-semibold">Name</th>
                      <th className="py-2 pr-3 font-semibold">App key</th>
                      <th className="py-2 pr-3 font-semibold">Secret</th>
                      <th className="py-2 pr-3 font-semibold">Created</th>
                      <th className="py-2 pr-3 font-semibold">Last used</th>
                      <th className="py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {keys.map((key) => (
                      <tr key={key.id} className="border-b border-slate-50">
                        <td className="py-2 pr-3 font-semibold text-slate-900">{key.name}</td>
                        <td className="py-2 pr-3">
                          <span className="inline-flex items-center gap-1">
                            <code className="font-mono text-slate-700">{key.appKey}</code>
                            <CopyButton value={key.appKey} label="App key" />
                          </span>
                        </td>
                        <td className="py-2 pr-3 font-mono text-slate-500">••••{key.secretLast4}</td>
                        <td className="py-2 pr-3 text-slate-500">{formatDateTime(key.createdAt)}</td>
                        <td className="py-2 pr-3 text-slate-500">{formatDateTime(key.lastUsedAt)}</td>
                        <td className="py-2 text-right">
                          <button
                            type="button"
                            onClick={() => handleRevoke(key)}
                            className="inline-flex items-center gap-1 text-rose-600 font-semibold hover:underline"
                          >
                            <Trash2 className="w-3.5 h-3.5" /> Revoke
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
            <div className="flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-brand-600" />
              <h2 className="font-bold text-slate-900">Using the API</h2>
            </div>
            <p className="text-xs text-slate-600">
              Send your app key and secret with every request as <code className="font-mono">X-App-Key</code> and{' '}
              <code className="font-mono">X-App-Secret</code> headers (or HTTP Basic auth: key as username, secret as password).
              Keep the secret on your server where possible. All endpoints are read-only and return JSON; prices are in paise.
            </p>
            <div className="text-xs">
              <p className="font-semibold text-slate-700 mb-1">Base URL</p>
              <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                <code className="flex-1 font-mono text-slate-900 break-all">{apiBase}</code>
                <CopyButton value={apiBase} label="Base URL" />
              </div>
            </div>
            <table className="w-full text-xs">
              <tbody>
                {[
                  ['GET /organizer', 'Your organization profile and logo'],
                  ['GET /events', 'Your published events with cover image, price and seats left. Query: status (published | completed | cancelled | all), includeDrafts=true, page, pageSize (max 100)'],
                  ['GET /events/{id or slug}', 'Full event: description, schedule, packing list, FAQs, ticket tiers, all images and video, location and pickup points, policies, ratings'],
                ].map(([endpoint, desc]) => (
                  <tr key={endpoint} className="border-b border-slate-50 align-top">
                    <td className="py-2 pr-4 font-mono font-semibold text-slate-900 whitespace-nowrap">{endpoint}</td>
                    <td className="py-2 text-slate-600">{desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="text-xs">
              <p className="font-semibold text-slate-700 mb-1">Example</p>
              <pre className="bg-slate-900 text-slate-100 rounded-lg p-3 overflow-x-auto font-mono text-[11px] leading-relaxed">
{`curl ${apiBase}/events \\
  -H "X-App-Key: YOUR_APP_KEY" \\
  -H "X-App-Secret: YOUR_APP_SECRET"`}
              </pre>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
