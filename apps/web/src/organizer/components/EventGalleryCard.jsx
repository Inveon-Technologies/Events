import React, { useEffect, useState } from 'react';
import { Images, ExternalLink } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';
import { apiRequest, ApiError } from '../lib/api';

// After an event, the organizer shares their own Google Drive / Google
// Photos folder link here; every confirmed attendee sees it on their
// booking page. Nothing is uploaded or integrated — it's just the link.
export default function EventGalleryCard({ eventId, eventDate }) {
  const { user } = useAuth();
  const { showToast } = useNotifications();
  const [url, setUrl] = useState('');
  const [note, setNote] = useState('');
  const [savedUrl, setSavedUrl] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  // The server's own event start time (UTC ISO) wins over the page's
  // date + time strings, which are Indian local time.
  const [startsAt, setStartsAt] = useState(eventDate);

  const eventHasHappened = new Date(startsAt).getTime() <= Date.now();

  useEffect(() => {
    let cancelled = false;
    apiRequest(`/organizer/events/${eventId}`, { token: user?.token })
      .then((data) => {
        if (cancelled) return;
        setUrl(data.galleryUrl || '');
        setNote(data.galleryNote || '');
        setSavedUrl(data.galleryUrl || null);
        if (data.eventDate) setStartsAt(data.eventDate);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [eventId, user?.token]);

  async function save(nextUrl) {
    setSaving(true);
    setError('');
    try {
      const result = await apiRequest(`/organizer/events/${eventId}/gallery`, {
        method: 'PUT',
        token: user?.token,
        body: { url: nextUrl, note },
      });
      setSavedUrl(result.galleryUrl);
      setUrl(result.galleryUrl || '');
      setNote(result.galleryNote || '');
      showToast(result.galleryUrl ? 'Attendees can now see the photos & videos link' : 'Photos & videos link removed', 'success');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save the link.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className={`p-5 rounded-xl border shadow-xs space-y-3 ${
        eventHasHappened && loaded && !savedUrl ? 'bg-brand-50/60 border-brand-200' : 'bg-white border-slate-200/80'
      }`}
      data-testid="event-gallery-card"
    >
      <div className="flex items-center gap-2">
        <Images className="w-5 h-5 text-brand-600" />
        <h3 className="font-bold text-slate-900 text-sm">Event photos &amp; videos (Google Drive link)</h3>
        {eventHasHappened && loaded && !savedUrl && (
          <span className="ml-auto text-[10px] font-bold uppercase tracking-wide text-brand-700 bg-white border border-brand-200 rounded-full px-2 py-0.5">
            Share now
          </span>
        )}
      </div>

      {!eventHasHappened ? (
        <p className="text-xs text-slate-500">
          After the event, paste a Google Drive or Google Photos share link here. Every attendee will see it on their booking page.
        </p>
      ) : !loaded ? (
        <p className="text-xs text-slate-400">Loading…</p>
      ) : (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void save(url);
          }}
        >
          <p className="text-xs text-slate-500">
            Share your Google Drive / Google Photos folder (set sharing to “Anyone with the link”). Attendees with a confirmed booking see it on their booking page.
          </p>
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://drive.google.com/drive/folders/…"
            aria-label="Photos and videos link"
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 outline-none"
          />
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optional note for attendees (e.g. “Download before 30 Nov”)"
            aria-label="Note for attendees"
            maxLength={500}
            rows={2}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 outline-none"
          />
          {error && <p className="text-xs text-rose-600" role="alert">{error}</p>}
          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={saving || !url.trim()}
              className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-xs font-semibold rounded-lg disabled:opacity-50"
            >
              {saving ? 'Saving…' : savedUrl ? 'Update link' : 'Share with attendees'}
            </button>
            {savedUrl && (
              <>
                <a href={savedUrl} target="_blank" rel="noreferrer" className="text-xs text-brand-600 font-semibold flex items-center gap-1 hover:underline">
                  Open <ExternalLink className="w-3 h-3" />
                </a>
                <button type="button" disabled={saving} onClick={() => void save('')} className="text-xs text-rose-600 font-semibold hover:underline ml-auto">
                  Remove
                </button>
              </>
            )}
          </div>
        </form>
      )}
    </div>
  );
}
