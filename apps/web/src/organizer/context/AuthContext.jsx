import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { apiRequest, ApiError, SESSION_EXPIRED_EVENT } from '../lib/api';

const AuthContext = createContext();

const STORAGE_KEY = 'inveon_user';
// Everything the organizer portal keeps in this browser for the logged-in
// organizer — cleared on logout so the next person using the same
// browser never sees it.
const ORGANIZER_STORAGE_KEYS = [
  STORAGE_KEY,
  'inveon_events',
  'inveon_bookings',
  'inveon_participants',
  'inveon_payments',
  'inveon_settings',
  'inveon_notifications',
];

function buildUserFromAuthResponse(data) {
  return {
    id: data.user.id,
    email: data.user.email,
    role: data.user.role,
    organizerId: data.user.organizerId,
    token: data.token,
    name: data.user.name || data.user.email.split('@')[0],
    // Filled in from GET /organizer/profile right after login (see the
    // sync effect in AuthProvider): the organization's name and its
    // uploaded logo, shown as the avatar. No stock photo stand-in.
    orgName: null,
    avatar: null,
    isLoggedIn: true,
  };
}

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

  // Keeps the header/sidebar identity in step with the real organizer
  // profile — its name and uploaded logo — on login and on every reload.
  // Previously the avatar was a stock photo that never changed, so an
  // uploaded logo looked like it hadn't saved.
  useEffect(() => {
    if (!user?.isLoggedIn || !user?.token) return;
    let cancelled = false;
    apiRequest('/organizer/profile', { token: user.token })
      .then((profile) => {
        if (cancelled) return;
        setUser((prev) =>
          prev?.isLoggedIn && (prev.orgName !== profile.name || prev.avatar !== profile.logoUrl)
            ? { ...prev, orgName: profile.name, avatar: profile.logoUrl }
            : prev,
        );
      })
      .catch(() => {
        // Identity display only — pages surface their own load errors.
      });
    return () => {
      cancelled = true;
    };
  }, [user?.isLoggedIn, user?.token]);

  // For settings pages to reflect a saved name/logo immediately.
  const updateUserProfile = useCallback((changes) => {
    setUser((prev) => (prev?.isLoggedIn ? { ...prev, ...changes } : prev));
  }, []);

  useEffect(() => {
    if (user?.isLoggedIn) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, [user]);

  // Real POST /api/auth/login. Throws ApiError on failure (wrong
  // credentials, wrong role, unverified account, network error) —
  // callers (Login.jsx) are responsible for catching it and showing the
  // real error, not assuming success like the previous mock did.
  const login = async (email, password) => {
    const data = await apiRequest('/auth/login', {
      method: 'POST',
      body: { email, password },
    });
    const updated = buildUserFromAuthResponse(data);
    setUser(updated);
    return updated;
  };

  const logout = useCallback(() => {
    ORGANIZER_STORAGE_KEYS.forEach((key) => localStorage.removeItem(key));
    setUser({ isLoggedIn: false });
  }, []);

  useEffect(() => {
    const handleExpired = () => {
      if (user?.isLoggedIn) logout();
    };
    window.addEventListener(SESSION_EXPIRED_EVENT, handleExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, handleExpired);
  }, [user?.isLoggedIn, logout]);

  // Real POST /api/auth/signup. Does NOT log the user in — the account
  // exists but is unverified until the OTP step succeeds, matching the
  // real backend's contract. Throws ApiError on failure (email already
  // registered, validation error).
  const signup = async (userData) => {
    await apiRequest('/auth/signup', {
      method: 'POST',
      body: {
        fullName: userData.fullName,
        email: userData.email,
        phone: userData.phone,
        orgName: userData.orgName,
        password: userData.password,
      },
    });
    return true;
  };

  // Real POST /api/auth/verify-otp. On success the account is now
  // verified and this logs the user in for real, same as login().
  const verifyOtp = async (email, code) => {
    const data = await apiRequest('/auth/verify-otp', {
      method: 'POST',
      body: { email, code },
    });
    const updated = buildUserFromAuthResponse(data);
    setUser(updated);
    return updated;
  };

  const resendOtp = async (email) => {
    await apiRequest('/auth/resend-otp', {
      method: 'POST',
      body: { email },
    });
  };

  // Real forgot-password flow. None of these three log the user in —
  // forgotPassword just triggers an email, verifyResetOtp exchanges a
  // correct code for a short-lived reset token (not the code itself,
  // so it can't be replayed against the final step), and resetPassword
  // is the actual password change. Same enumeration-avoidance response
  // shape as login/signup throughout — callers can't tell from the
  // response whether an email was actually registered.
  const forgotPassword = async (email) => {
    await apiRequest('/auth/forgot-password', {
      method: 'POST',
      body: { email },
    });
  };

  const verifyResetOtp = async (email, code) => {
    const data = await apiRequest('/auth/verify-reset-otp', {
      method: 'POST',
      body: { email, code },
    });
    return data.resetToken;
  };

  const resetPassword = async (resetToken, newPassword) => {
    await apiRequest('/auth/reset-password', {
      method: 'POST',
      body: { resetToken, newPassword },
    });
  };

  return (
    <AuthContext.Provider
      value={{ user, setUser, updateUserProfile, login, signup, verifyOtp, resendOtp, forgotPassword, verifyResetOtp, resetPassword, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

export { ApiError };
