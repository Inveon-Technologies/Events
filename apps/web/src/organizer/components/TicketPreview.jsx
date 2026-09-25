import React, { useEffect, useState } from 'react';
import { Monitor, Smartphone } from 'lucide-react';
import { DesktopTicket, MobileTicket } from '../../components/ticket/EventTicket';
import { useAuth } from '../context/AuthContext';
import { apiRequest } from '../lib/api';

// "What attendees will get": the real ticket component, filled with this
// form's values and a sample attendee, shown before the event goes live.
export default function TicketPreview({ formData, coverUrl }) {
  const { user } = useAuth();
  const [view, setView] = useState('desktop');
  const [organizer, setOrganizer] = useState(null);

  useEffect(() => {
    let cancelled = false;
    apiRequest('/organizer/profile', { token: user?.token })
      .then((profile) => {
        if (!cancelled) setOrganizer(profile);
      })
      .catch(() => {
        // Preview still works with the account name.
      });
    return () => {
      cancelled = true;
    };
  }, [user?.token]);

  const hasDate = /^\d{4}-\d{2}-\d{2}$/.test(formData.startDate || '');
  const time = /^\d{2}:\d{2}$/.test(formData.startTime || '') ? formData.startTime : '09:00';
  const eventDate = hasDate ? `${formData.startDate}T${time}:00+05:30` : new Date().toISOString();
  const venueAddress = [formData.venueName, formData.address, formData.city, formData.state, formData.pincode]
    .map((s) => (s || '').trim())
    .filter(Boolean)
    .join(', ');
  const year = eventDate.slice(0, 4);

  const data = {
    organizerName: organizer?.name || user?.orgName || 'Your Organization',
    organizerLogoUrl: organizer?.logoUrl || null,
    organizerPhone: organizer?.contactPhone || null,
    eventName: formData.title || 'Your Event Title',
    tagline: formData.shortDescription || null,
    eventDate,
    gateOpenTime: null,
    venueAddress: venueAddress || null,
    backgroundUrl: formData.ticketBackgroundUrl || coverUrl || null,
    partners: (formData.partners || [])
      .filter((p) => (p.name || '').trim() || p.logoUrl)
      .map((p) => ({ name: (p.name || '').trim() || 'Partner', role: (p.role || '').trim() || null, logoUrl: p.logoUrl || null })),
    bookingReference: `INV-BKG-${year}-SAMPLE`,
    attendeeName: 'Attendee Name',
    tierName: formData.ticketTiers?.[0]?.name || 'General Entry',
    ticketId: `INV-TKT-${year}-SAMPLE-01`,
    statusText: 'CONFIRMED',
    statusTone: 'ok',
    quantity: 1,
    qrSrc: null,
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h4 className="text-xs font-bold text-slate-900">Ticket preview</h4>
          <p className="text-[11px] text-slate-500">
            This is the ticket attendees receive by email and WhatsApp. Sample attendee and QR shown.
            {data.partners.length === 0 && ' "Your Logo Here" tiles are only shown to you — attendees won’t see them.'}
          </p>
        </div>
        <div className="inline-flex rounded-lg border border-slate-200 p-0.5 bg-slate-50" role="tablist" aria-label="Preview size">
          {[
            ['desktop', 'Desktop', Monitor],
            ['mobile', 'Mobile', Smartphone],
          ].map(([key, label, IconCmp]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={view === key}
              onClick={() => setView(key)}
              className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-[11px] font-semibold ${
                view === key ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <IconCmp className="w-3.5 h-3.5" /> {label}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-xl bg-[#d7e2ed] p-3 sm:p-4 overflow-x-auto">
        {view === 'desktop' ? (
          // The desktop ticket is laid out for ~1300px; zoomed down to fit the form.
          <div style={{ zoom: 0.62 }} className="min-w-[1300px]">
            <DesktopTicket data={data} showPartnerPlaceholders />
          </div>
        ) : (
          <div className="mx-auto w-[390px] max-w-full bg-white rounded-[28px] border-[6px] border-slate-800 p-3 max-h-[720px] overflow-y-auto">
            <MobileTicket data={data} showPartnerPlaceholders />
          </div>
        )}
      </div>
    </div>
  );
}
