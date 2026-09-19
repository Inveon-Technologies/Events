import React, { createContext, useContext, useState, useEffect } from 'react';
import { apiRequest, ApiError } from '../lib/api';

const AuthContext = createContext();

const STORAGE_KEY = 'inveon_user';

export function AuthProvider({ children }) {
  // No default logged-in persona — a fresh visitor is NOT authenticated
  // until a real login succeeds. Only restore a previous real session
  // from localStorage.
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        // fall through to unauthenticated
      }
    }
    return { isLoggedIn: false };
  });

  useEffect(() => {
    if (user?.isLoggedIn) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, [user]);

  // Real POST /api/auth/login. Throws ApiError on failure (wrong
  // credentials, wrong role, network error) — callers (Login.jsx) are
  // responsible for catching it and showing the real error, not
  // assuming success like the previous mock did.
  const login = async (email, password) => {
    const data = await apiRequest('/auth/login', {
      method: 'POST',
      body: { email, password },
    });
    const updated = {
      id: data.user.id,
      email: data.user.email,
      role: data.user.role,
      organizerId: data.user.organizerId,
      token: data.token,
      // Not returned by /auth/login itself — the dashboard page fetches
      // and fills this in right after redirect (it already calls
      // GET /organizer/dashboard, which returns organizerName as its
      // first field, so this avoids a second round-trip during login
      // just to learn the same thing).
      name: data.user.email.split('@')[0],
      orgName: null,
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80',
      isLoggedIn: true,
    };
    setUser(updated);
    return updated;
  };

  const logout = () => {
    setUser({ isLoggedIn: false });
  };

  // No real organizer-registration endpoint exists yet — kept as the
  // original mock behavior (creates a fake local session) so SignUp.jsx
  // still works as a demo, rather than breaking it outright. Genuinely
  // wiring this needs a real POST /api/auth/signup this project doesn't
  // have yet.
  const signup = (userData) => {
    const updated = {
      name: userData.fullName || 'Organizer',
      email: userData.email,
      role: 'organizer_owner',
      organizerId: null,
      token: null,
      orgName: userData.orgName || 'Inveon Experiences',
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80',
      isLoggedIn: true,
    };
    setUser(updated);
    return true;
  };

  return (
    <AuthContext.Provider value={{ user, setUser, login, signup, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

export { ApiError };
