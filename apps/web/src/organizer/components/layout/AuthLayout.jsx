import React from 'react';
import { Outlet } from 'react-router-dom';
import ToastContainer from '../common/ToastContainer';
import { ShieldCheck, Calendar, Sparkles, Award } from 'lucide-react';
import { useBranding } from '../../../lib/branding';

export default function AuthLayout() {
  const branding = useBranding();
  return (
    <div className="min-h-screen bg-slate-900 flex flex-col justify-between text-slate-100">
      <div className="flex-1 flex flex-col lg:flex-row">
        {/* Left Visual Branding Hero Panel */}
        <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-navy-900 via-navy-850 to-brand-900 p-12 flex-col justify-between relative overflow-hidden border-r border-navy-800">
          {/* Subtle Background Glow */}
          <div className="absolute -top-24 -left-24 w-96 h-96 bg-brand-600/20 rounded-full blur-3xl pointer-events-none"></div>
          <div className="absolute -bottom-24 -right-24 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none"></div>

          {/* Logo Header */}
          <div className="relative z-10 flex items-center gap-3">
            {branding?.logoUrl ? (
              <img src={branding.logoUrl} alt={branding.platformName} className="h-10 w-auto max-w-[180px] object-contain rounded bg-white/90 p-1" />
            ) : (
              <>
            <div className="relative flex items-center justify-center">
              <svg className="w-10 h-10" fill="none" viewBox="0 0 40 40">
                <rect fill="#0066FF" fillOpacity="0.85" height="16" rx="3" width="16" x="2" y="8"></rect>
                <rect fill="#2E90FA" height="16" rx="3" width="16" x="14" y="2"></rect>
                <rect fill="#004EEB" height="16" rx="3" width="16" x="18" y="16"></rect>
                <path d="M16 14L24 22M24 14L16 22" stroke="white" strokeLinecap="round" strokeWidth="2"></path>
              </svg>
            </div>
            <div>
              <span className="text-white font-black text-xl tracking-wider leading-none">INVEON</span>
              <span className="text-xs uppercase font-bold text-cyan-400 tracking-widest block">EVENTS</span>
            </div>
              </>
            )}
          </div>

          {/* Hero Feature Content */}
          <div className="relative z-10 my-auto py-12 max-w-lg">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-500/20 border border-brand-500/30 text-cyan-300 text-xs font-semibold mb-6">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Organizer Operating System</span>
            </div>
            <h1 className="text-4xl font-black text-white leading-tight tracking-tight">
              Powering incredible experiences & seamless event operations.
            </h1>
            <p className="mt-4 text-slate-300 text-sm leading-relaxed">
              Manage registrations, ticket tiers, live mobile QR check-ins, automated attendee communications, and multi-day financial settlements in one unified workspace.
            </p>

            <div className="grid grid-cols-2 gap-4 mt-8 pt-8 border-t border-navy-800">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-navy-800 text-cyan-400">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-white">Bank-grade Security</h4>
                  <p className="text-[11px] text-slate-400 mt-0.5">2FA & encrypted attendee data</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-navy-800 text-cyan-400">
                  <Award className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-white">Instant Payouts</h4>
                  <p className="text-[11px] text-slate-400 mt-0.5">Automated T+1 bank settlement</p>
                </div>
              </div>
            </div>
          </div>

          {/* Footer Note */}
          <div className="relative z-10 text-xs text-slate-400">
            © 2025 Inveon Technologies LLP. Built for modern event creators.
          </div>
        </div>

        {/* Right Form Container */}
        <div className="flex-1 flex items-center justify-center p-6 sm:p-12 bg-white text-slate-900">
          <div className="w-full max-w-md">
            {/* Mobile Logo */}
            <div className="lg:hidden flex items-center gap-2 mb-8 justify-center">
              {branding?.logoUrl ? (
                <img src={branding.logoUrl} alt={branding.platformName} className="h-9 w-auto object-contain" />
              ) : (
                <>
              <svg className="w-8 h-8" fill="none" viewBox="0 0 40 40">
                <rect fill="#0066FF" fillOpacity="0.85" height="16" rx="3" width="16" x="2" y="8"></rect>
                <rect fill="#2E90FA" height="16" rx="3" width="16" x="14" y="2"></rect>
                <rect fill="#004EEB" height="16" rx="3" width="16" x="18" y="16"></rect>
                <path d="M16 14L24 22M24 14L16 22" stroke="white" strokeLinecap="round" strokeWidth="2"></path>
              </svg>
              <span className="text-navy-900 font-black text-lg tracking-wider">INVEON EVENTS</span>
                </>
              )}
            </div>

            <Outlet />
          </div>
        </div>
      </div>

      <ToastContainer />
    </div>
  );
}
