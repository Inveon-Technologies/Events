import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { apiRequest } from '../lib/api';

const NotificationContext = createContext();

const POLL_INTERVAL_MS = 60 * 1000;

function relativeTime(iso) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

// Which notifications this organizer has read or dismissed, kept in the
// browser per organizer (the feed itself comes from the server).
function stateKey(organizerId) {
  return `inveon_notification_state:${organizerId}`;
}
function loadState(organizerId) {
  try {
    const saved = JSON.parse(localStorage.getItem(stateKey(organizerId)) || '{}');
    return { read: saved.read || [], dismissed: saved.dismissed || [] };
  } catch {
    return { read: [], dismissed: [] };
  }
}

export function NotificationProvider({ children }) {
  const { user } = useAuth();
  const organizerId = user?.isLoggedIn ? user.organizerId : null;

  // Real activity from GET /organizer/notifications (bookings, pending
  // cash, cancellations, failed refunds, sold-out tiers, events starting
  // soon) — previously a hardcoded list of fictional bookings/payouts.
  const [feed, setFeed] = useState([]);
  const [readState, setReadState] = useState(() => (organizerId ? loadState(organizerId) : { read: [], dismissed: [] }));

  useEffect(() => {
    setReadState(organizerId ? loadState(organizerId) : { read: [], dismissed: [] });
    if (!organizerId || !user?.token) {
      setFeed([]);
      return undefined;
    }
    let cancelled = false;
    const load = () =>
      apiRequest('/organizer/notifications', { token: user.token })
        .then((data) => {
          if (!cancelled) setFeed(Array.isArray(data?.notifications) ? data.notifications : []);
        })
        .catch(() => {
          // Keep whatever was last loaded; the bell is not critical.
        });
    load();
    const timer = setInterval(load, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [organizerId, user?.token]);

  const persist = useCallback(
    (next) => {
      setReadState(next);
      if (organizerId) {
        try {
          localStorage.setItem(stateKey(organizerId), JSON.stringify(next));
        } catch {
          // Storage unavailable — read state just won't survive a reload.
        }
      }
    },
    [organizerId],
  );

  const notifications = feed
    .filter((n) => !readState.dismissed.includes(n.id))
    .map((n) => ({ ...n, timestamp: relativeTime(n.createdAt), read: readState.read.includes(n.id) }));

  const [toasts, setToasts] = useState([]);

  const showToast = (message, type = 'success') => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  };

  const removeToast = (id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const markAsRead = (id) => {
    if (readState.read.includes(id)) return;
    persist({ ...readState, read: [...readState.read, id] });
  };

  const markAllAsRead = () => {
    persist({ ...readState, read: Array.from(new Set([...readState.read, ...feed.map((n) => n.id)])) });
    showToast("All notifications marked as read", "info");
  };

  const deleteNotification = (id) => {
    persist({ ...readState, dismissed: [...readState.dismissed, id] });
    showToast("Notification removed", "info");
  };

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        markAsRead,
        markAllAsRead,
        deleteNotification,
        showToast,
        toasts,
        removeToast
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  return useContext(NotificationContext);
}
