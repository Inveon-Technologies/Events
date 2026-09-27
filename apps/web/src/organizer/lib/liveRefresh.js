import { useEffect, useState } from 'react';

// Keeps organizer portal pages current without a manual browser refresh.
// Every page used to fetch its data once on mount, so a new booking,
// payment, check-in or cancellation only appeared after reloading the tab.
//
// useRefreshTick() returns a counter that goes up:
//   - every LIVE_REFRESH_MS while the tab is visible,
//   - when the organizer comes back to the tab (focus / visibilitychange),
//   - whenever notifyDataChanged() is called after a mutation.
// Pages add the tick to their load effect's dependencies and re-fetch
// quietly (without flashing a "Loading…" state) when it is above zero.

export const LIVE_REFRESH_MS = 15 * 1000;
const DATA_CHANGED_EVENT = 'inveon:organizer-data-changed';
// Focus and visibilitychange both fire when switching back to the tab;
// collapse bursts like that into one refresh.
const MIN_GAP_MS = 2000;

export function notifyDataChanged() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(DATA_CHANGED_EVENT));
}

export function useRefreshTick(intervalMs = LIVE_REFRESH_MS) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let last = Date.now();
    const bump = (force) => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      const now = Date.now();
      if (force !== true && now - last < MIN_GAP_MS) return;
      last = now;
      setTick((t) => t + 1);
    };
    const onChange = () => bump(true);
    const timer = setInterval(bump, intervalMs);
    window.addEventListener('focus', bump);
    document.addEventListener('visibilitychange', bump);
    window.addEventListener(DATA_CHANGED_EVENT, onChange);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', bump);
      document.removeEventListener('visibilitychange', bump);
      window.removeEventListener(DATA_CHANGED_EVENT, onChange);
    };
  }, [intervalMs]);

  return tick;
}
