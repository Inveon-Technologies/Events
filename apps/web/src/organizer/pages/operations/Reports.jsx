import React, { useEffect, useState } from 'react';
import { Download, Users, IndianRupee, ScanLine } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { apiRequest, ApiError } from '../../lib/api';
import { downloadCsv } from '../../lib/csv';

const REPORTS = [
  { type: 'attendees', label: 'Attendees', icon: Users, description: 'Every ticket: attendee, contact, ticket type and check-in status.' },
  { type: 'sales', label: 'Sales', icon: IndianRupee, description: 'Every booking: amount, payment method and status, refunds.' },
  { type: 'checkins', label: 'Check-ins', icon: ScanLine, description: 'Who was scanned in, when, and by which team member.' },
];

const PREVIEW_ROWS = 50;

function slug(text) {
  return text
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}

// Reports (#64): pick a report, filter by event and dates, preview it,
// and download it as CSV (opens in Excel / Google Sheets).
export default function Reports() {
  const { user } = useAuth();
  const [type, setType] = useState('attendees');
  const [eventId, setEventId] = useState('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    const params = new URLSearchParams();
    if (eventId !== 'all') params.set('eventId', eventId);
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    const qs = params.toString();
    apiRequest(`/organizer/reports/${type}${qs ? `?${qs}` : ''}`, { token: user?.token })
      .then((data) => {
        if (!cancelled) setReport(data);
      })
      .catch((err) => {
        if (!cancelled) {
          setReport(null);
          setError(err instanceof ApiError ? err.message : 'Could not load the report.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [type, eventId, from, to, user?.token]);

  const current = REPORTS.find((r) => r.type === type);
  const events = report?.events ?? [];

  function handleDownload() {
    if (!report) return;
    const eventName = eventId === 'all' ? 'all-events' : slug(events.find((e) => e.id === eventId)?.name ?? 'event');
    const range = from || to ? `-${from || 'start'}-to-${to || 'today'}` : '';
    downloadCsv(
      `${type}-${eventName}${range}.csv`,
      report.columns.map((c) => ({ label: c.label, value: (row) => row[c.key] })),
      report.rows,
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Reports</h1>
          <p className="text-xs text-slate-500 mt-1">
            Export your attendees, sales and check-ins as CSV — opens in Excel or Google Sheets.
          </p>
        </div>
        <button
          type="button"
          onClick={handleDownload}
          disabled={!report || report.rows.length === 0}
          className="flex items-center gap-1.5 px-3.5 py-2 bg-brand-600 hover:bg-brand-700 text-white text-xs font-semibold rounded-lg shadow-xs disabled:opacity-50"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Download {current.label} CSV</span>
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3" role="tablist" aria-label="Report type">
        {REPORTS.map((r) => {
          const Icon = r.icon;
          const active = r.type === type;
          return (
            <button
              key={r.type}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setType(r.type)}
              className={`text-left p-4 rounded-xl border transition-colors ${active ? 'border-brand-500 bg-brand-50' : 'border-slate-200 bg-white hover:bg-slate-50'}`}
            >
              <div className="flex items-center gap-2">
                <Icon className={`w-4 h-4 ${active ? 'text-brand-600' : 'text-slate-500'}`} />
                <span className="text-sm font-bold text-slate-900">{r.label}</span>
              </div>
              <p className="text-xs text-slate-500 mt-1">{r.description}</p>
            </button>
          );
        })}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-col md:flex-row gap-3 md:items-end">
        <label className="flex-1 text-xs font-semibold text-slate-600">
          Event
          <select
            value={eventId}
            onChange={(e) => setEventId(e.target.value)}
            className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white"
          >
            <option value="all">All events</option>
            {events.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-semibold text-slate-600">
          {type === 'checkins' ? 'Checked in from' : 'Booked from'}
          <input
            type="date"
            value={from}
            max={to || undefined}
            onChange={(e) => setFrom(e.target.value)}
            className="mt-1 block w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
          />
        </label>
        <label className="text-xs font-semibold text-slate-600">
          To
          <input
            type="date"
            value={to}
            min={from || undefined}
            onChange={(e) => setTo(e.target.value)}
            className="mt-1 block w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
          />
        </label>
        {(from || to || eventId !== 'all') && (
          <button
            type="button"
            onClick={() => {
              setEventId('all');
              setFrom('');
              setTo('');
            }}
            className="text-xs font-semibold text-brand-600 hover:underline md:pb-2.5"
          >
            Clear filters
          </button>
        )}
      </div>

      {error && (
        <p className="text-xs text-red-600" role="alert">
          {error}
        </p>
      )}

      {report && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {report.summary.map((s) => (
            <div key={s.label} className="bg-white rounded-xl border border-slate-200 p-4">
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">{s.label}</p>
              <p className="text-lg font-bold text-slate-900 mt-1">{s.value}</p>
            </div>
          ))}
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {loading ? (
          <p className="p-6 text-xs text-slate-500">Loading…</p>
        ) : !report ? null : report.rows.length === 0 ? (
          <p className="p-6 text-xs text-slate-500">Nothing to report for these filters yet.</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50">
                  <tr>
                    {report.columns.map((c) => (
                      <th key={c.key} className="text-left px-3 py-2 font-semibold text-slate-600 whitespace-nowrap">
                        {c.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {report.rows.slice(0, PREVIEW_ROWS).map((row, i) => (
                    <tr key={i} className="border-t border-slate-100">
                      {report.columns.map((c) => (
                        <td key={c.key} className="px-3 py-2 text-slate-700 whitespace-nowrap">
                          {row[c.key] ?? ''}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="px-3 py-2 text-[11px] text-slate-500 border-t border-slate-100">
              {report.rows.length > PREVIEW_ROWS
                ? `Showing the first ${PREVIEW_ROWS} of ${report.rows.length} rows — the download includes all of them.`
                : `${report.rows.length} row${report.rows.length === 1 ? '' : 's'}.`}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
