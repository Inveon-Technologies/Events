import React, { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { Award } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { apiRequest } from '../lib/api';

// Whether this event sends participation certificates, with a shortcut
// to the designer — so it's visible from the bookings page too.
export default function CertificateStatusCard({ eventId }) {
  const { user } = useAuth();
  const [enabled, setEnabled] = useState(null);

  useEffect(() => {
    let cancelled = false;
    apiRequest(`/organizer/events/${eventId}/certificate`, { token: user?.token })
      .then((data) => {
        if (!cancelled) setEnabled(Boolean(data.enabled));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [eventId, user?.token]);

  return (
    <div className="bg-white p-5 rounded-xl border border-slate-200/80 shadow-xs space-y-2" data-testid="certificate-status-card">
      <div className="flex items-center gap-2">
        <Award className="w-5 h-5 text-amber-600" />
        <h3 className="font-bold text-slate-900 text-sm">Participation certificates</h3>
        {enabled !== null && (
          <span
            className={`ml-auto text-[10px] font-bold uppercase tracking-wide rounded-full px-2 py-0.5 border ${
              enabled ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-50 text-slate-500 border-slate-200'
            }`}
          >
            {enabled ? 'On' : 'Off'}
          </span>
        )}
      </div>
      <p className="text-xs text-slate-500">
        {enabled
          ? 'Every checked-in attendee gets a certificate by email after the event, and can download it from their booking and ticket page.'
          : 'Turn certificates on to give every checked-in attendee a certificate of participation.'}
      </p>
      <NavLink
        to={`/organizer/events/${eventId}/certificate`}
        className="inline-block text-xs text-brand-600 font-semibold hover:underline"
      >
        {enabled ? 'Edit certificate design →' : 'Set up certificates →'}
      </NavLink>
    </div>
  );
}
