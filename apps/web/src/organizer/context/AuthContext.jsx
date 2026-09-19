import React, { createContext, useContext, useState, useEffect } from 'react';
import { apiRequest, ApiError } from '../lib/api';

const AuthContext = createContext();

const STORAGE_KEY = 'inveon_user';
const DEFAULT_AVATAR = 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80';

function buildUserFromAuthResponse(data) {
  return {
    id: data.user.id,
    email: data.user.email,
    role: data.user.role,
    organizerId: data.user.organizerId,
    token: data.token,
    // Not returned by either /auth/login or /auth/verify-otp — the
    // dashboard page fetches and fills this in right after redirect (it
    // already calls GET /organizer/dashboard, which returns
    // organizerName as its first field, so this avoids a second
    // round-trip during login just to learn the same thing).
    name: data.user.email.split('@')[0],
    orgName: null,
    avatar: DEFAULT_AVATAR,
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

  const logout = () => {
    setUser({ isLoggedIn: false });
  };

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
      value={{ user, setUser, login, signup, verifyOtp, resendOtp, forgotPassword, verifyResetOtp, resetPassword, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

export { ApiError };
