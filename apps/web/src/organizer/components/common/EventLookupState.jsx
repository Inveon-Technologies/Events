import React from 'react';
import { Link } from 'react-router-dom';

// Shown by per-event pages while the organizer's events are still
// loading, or when the event in the URL isn't one of theirs. These pages
// used to fall back to the first event in the list instead — so a stale
// or mistyped link quietly showed (and let you edit) a different event.
export default function EventLookupState({ loaded, error }) {
  if (!loaded) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center justify-center gap-3 min-h-[40vh] text-center px-4">
      <p className="font-semibold text-slate-800">{error ? 'Could not load your events.' : 'Event not found.'}</p>
      <p className="text-sm text-slate-500">
        {error ?? 'This event does not exist or does not belong to your organization.'}
      </p>
      <Link to="/organizer/events" className="text-primary font-semibold text-sm hover:underline">
        Back to My Events
      </Link>
    </div>
  );
}
