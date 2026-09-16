import { createContext, useContext, useState, useCallback, ReactNode, useEffect } from 'react';
import { apiRequest } from '../lib/api';

interface OrganizerUser {
  id: string;
  email: string;
  role: 'platform_admin' | 'organizer_owner' | 'organizer_staff' | 'gate_volunteer';
  organizerId: string | null;
}

interface LoginResponse {
  token: string;
  user: OrganizerUser;
}

interface AuthContextValue {
  token: string | null;
  user: OrganizerUser | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const STORAGE_KEY = 'inveon.organizer.auth';

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function loadStored(): { token: string; user: OrganizerUser } | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function OrganizerAuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<OrganizerUser | null>(null);

  useEffect(() => {
    const stored = loadStored();
    if (stored) {
      setToken(stored.token);
      setUser(stored.user);
    }
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const data = await apiRequest<LoginResponse>('/auth/login', {
      method: 'POST',
      body: { email, password },
    });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    setToken(data.token);
    setUser(data.user);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ token, user, isAuthenticated: !!token, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useOrganizerAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useOrganizerAuth must be used within OrganizerAuthProvider');
  return ctx;
}
