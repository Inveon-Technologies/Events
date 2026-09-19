import React, { useState } from 'react';
import {
  QrCode,
  Search,
  CheckCircle2,
  AlertCircle,
  XCircle,
  Volume2,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
  Sparkles,
  X,
  FileSpreadsheet,
  AlertTriangle,
  RotateCcw,
  Ban
} from 'lucide-react';
import { useEvents } from '../../context/EventsContext';
import StatusBadge from '../../components/common/StatusBadge';

// Helper audio feedback synthesizer using Web Audio API
const playBeep = (isSuccess) => {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    if (isSuccess) {
      // Pleasant double chime (high frequency)
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.1); // A5
      gain.gain.setValueAtTime(0.25, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.35);
    } else {
      // Reject buzz (low harsh frequency)
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(160, ctx.currentTime);
      osc.frequency.setValueAtTime(110, ctx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.35, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.45);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.45);
    }
  } catch (e) {
    // AudioContext blocked or not supported
  }
};

export default function CheckIn() {
  const { participants, events, bookings, checkInParticipant, undoCheckIn } = useEvents();
  const [ticketInput, setTicketInput] = useState('');
  const [selectedEventId, setSelectedEventId] = useState('all');
  const [scanResult, setScanResult] = useState(null);
  const [scanHistory, setScanHistory] = useState([]);

  const processScan = (code) => {
    const res = checkInParticipant(code);
    playBeep(res.success);
    setScanResult(res);
    setScanHistory((prev) => [
      {
        id: Date.now(),
        time: new Date().toLocaleTimeString(),
        code: code,
        res: res
      },
      ...prev.slice(0, 9)
    ]);
  };

  const handleManualCheckIn = (e) => {
    e.preventDefault();
    if (!ticketInput.trim()) return;
    processScan(ticketInput.trim());
    setTicketInput('');
  };

  const pendingCheckIns = participants.filter(
    (p) =>
      (selectedEventId === 'all' || p.eventId === selectedEventId) &&
      p.checkInStatus === 'confirmed'
  );

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Live Event Check-in Station</h1>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800 animate-pulse">
              LIVE GATE ACTIVE
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Scan attendee QR passes, enforce payment validity, and block cancelled or unpaid admissions in real time.
          </p>
        </div>

        <select
          value={selectedEventId}
          onChange={(e) => setSelectedEventId(e.target.value)}
          className="py-2 px-3 text-xs font-semibold bg-white border border-slate-200 rounded-lg shadow-xs"
        >
          <option value="all">All Hosted Events</option>
          {events.map((e) => (
            <option key={e.id} value={e.id}>{e.title}</option>
          ))}
        </select>
      </div>

      {/* Validation Rules Info Banner */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
        <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 flex items-center gap-2.5 text-emerald-900">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span><strong>Paid & Confirmed:</strong> Admitted & verified</span>
        </div>
        <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 flex items-center gap-2.5 text-amber-900">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
          <span><strong>Unpaid / Pending:</strong> Scan strictly REJECTED</span>
        </div>
        <div className="p-3 bg-rose-50 rounded-xl border border-rose-200 flex items-center gap-2.5 text-rose-900">
          <Ban className="w-4 h-4 text-rose-600 shrink-0" />
          <span><strong>Cancelled / Refunded:</strong> Scan strictly REJECTED</span>
        </div>
      </div>

      {/* Main Scanner Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Left Col: Scanner Viewport & Input */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-md space-y-5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <QrCode className="w-4 h-4 text-brand-600" />
              <span>Camera / QR Scanner View</span>
            </h3>
            <span className="text-[11px] text-slate-400 font-mono">Audio Feedback ON</span>
          </div>

          {/* Interactive QR Simulation Viewport */}
          <div className="relative aspect-video bg-navy-950 rounded-xl overflow-hidden flex flex-col items-center justify-center p-6 border-2 border-dashed border-brand-500/50">
            <div className="absolute top-4 left-4 w-6 h-6 border-t-2 border-l-2 border-cyan-400"></div>
            <div className="absolute top-4 right-4 w-6 h-6 border-t-2 border-r-2 border-cyan-400"></div>
            <div className="absolute bottom-4 left-4 w-6 h-6 border-b-2 border-l-2 border-cyan-400"></div>
            <div className="absolute bottom-4 right-4 w-6 h-6 border-b-2 border-r-2 border-cyan-400"></div>

            <div className="absolute inset-x-8 h-0.5 bg-gradient-to-r from-transparent via-cyan-400 to-transparent animate-pulse"></div>

            <QrCode className="w-16 h-16 text-cyan-400/80 mb-2" />
            <p className="text-xs font-semibold text-cyan-200 text-center">
              Point scanner at attendee QR code
            </p>
            <p className="text-[10px] text-slate-400 text-center mt-1">
              Validates ticket status and payment records
            </p>
          </div>

          {/* Manual Input Form */}
          <form onSubmit={handleManualCheckIn} className="space-y-3 pt-2">
            <label className="block text-xs font-bold text-slate-700">Enter Ticket Code, Order ID, or Attendee Name</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={ticketInput}
                onChange={(e) => setTicketInput(e.target.value)}
                placeholder="e.g. INV-RG-892141 or Sneha"
                className="flex-1 px-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 font-mono uppercase"
              />
              <button
                type="submit"
                className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white font-bold text-xs rounded-lg shadow-sm"
              >
                Scan Ticket
              </button>
            </div>
          </form>

          {/* Live Scan Result Card / Rejection Alert Box */}
          {scanResult && (
            <div
              className={`p-5 rounded-2xl border shadow-md animate-in zoom-in-95 space-y-3 ${
                scanResult.success
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
                  : scanResult.reason === 'UNPAID'
                  ? 'bg-amber-50 border-amber-300 text-amber-950'
                  : 'bg-rose-50 border-rose-300 text-rose-950'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  {scanResult.success ? (
                    <div className="w-8 h-8 rounded-full bg-emerald-600 text-white flex items-center justify-center shrink-0">
                      <CheckCircle2 className="w-5 h-5" />
                    </div>
                  ) : scanResult.reason === 'UNPAID' ? (
                    <div className="w-8 h-8 rounded-full bg-amber-600 text-white flex items-center justify-center shrink-0">
                      <AlertTriangle className="w-5 h-5" />
                    </div>
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-rose-600 text-white flex items-center justify-center shrink-0">
                      <XCircle className="w-5 h-5" />
                    </div>
                  )}

                  <div>
                    <h4 className="text-sm font-black tracking-tight">{scanResult.title}</h4>
                    <p className="text-xs mt-1 leading-relaxed">{scanResult.message}</p>
                  </div>
                </div>

                <button
                  onClick={() => setScanResult(null)}
                  className="p-1 hover:bg-black/10 rounded shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {scanResult.participant && (
                <div className="pt-3 border-t border-black/10 text-xs grid grid-cols-2 gap-2 bg-white/70 p-3 rounded-xl">
                  <div>
                    <span className="text-slate-500 font-medium">Attendee:</span>
                    <p className="font-bold text-slate-900">{scanResult.participant.fullName}</p>
                    <p className="text-[11px] text-slate-600">{scanResult.participant.phone}</p>
                  </div>
                  <div>
                    <span className="text-slate-500 font-medium">Order Reference:</span>
                    <p className="font-mono font-bold text-slate-900">{scanResult.participant.bookingId}</p>
                    <div className="mt-0.5 flex gap-1">
                      <StatusBadge status={scanResult.participant.checkInStatus} />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Preset Test Scenarios */}
          <div className="pt-2 border-t border-slate-100 space-y-2">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
              Quick Test Scan Scenarios:
            </span>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => processScan('INV-RG-892122')}
                className="px-2.5 py-1 text-[11px] font-semibold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-lg border border-emerald-200"
              >
                ✓ Valid Paid Pass (Siddharth)
              </button>
              <button
                type="button"
                onClick={() => processScan('INV-RG-892141')}
                className="px-2.5 py-1 text-[11px] font-semibold bg-amber-50 text-amber-700 hover:bg-amber-100 rounded-lg border border-amber-200"
              >
                ⚠️ Unpaid Ticket (Sneha Patel)
              </button>
              <button
                type="button"
                onClick={() => processScan('INV-RG-892151')}
                className="px-2.5 py-1 text-[11px] font-semibold bg-rose-50 text-rose-700 hover:bg-rose-100 rounded-lg border border-rose-200"
              >
                ⛔ Cancelled Ticket (Vikram)
              </button>
              <button
                type="button"
                onClick={() => processScan('INV-RG-892111')}
                className="px-2.5 py-1 text-[11px] font-semibold bg-blue-50 text-brand-700 hover:bg-blue-100 rounded-lg border border-blue-200"
              >
                ℹ️ Already Checked-in (Aarav)
              </button>
            </div>
          </div>
        </div>

        {/* Right Col: Attendee Queue & Gate Scan Activity */}
        <div className="space-y-6">
          {/* Waiting for Check-in List */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-3">
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              Confirmed Waiting Queue ({pendingCheckIns.length})
            </h3>

            <div className="max-h-60 overflow-y-auto divide-y divide-slate-100 pr-1">
              {pendingCheckIns.length === 0 ? (
                <p className="text-xs text-slate-400 py-4 text-center">No attendees waiting in this queue.</p>
              ) : (
                pendingCheckIns.map((p) => (
                  <div key={p.id} className="py-2.5 flex items-center justify-between gap-2 text-xs">
                    <div>
                      <p className="font-bold text-slate-900">{p.fullName}</p>
                      <p className="text-[10px] text-slate-500 font-mono">
                        {p.ticketCode} • Order: {p.bookingId}
                      </p>
                    </div>
                    <button
                      onClick={() => processScan(p.ticketCode)}
                      className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded text-[11px] shadow-xs"
                    >
                      Scan & Admit
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Live Gate Scan Log */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-3">
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              Live Gate Scan Log ({scanHistory.length})
            </h3>

            <div className="divide-y divide-slate-100 max-h-60 overflow-y-auto">
              {scanHistory.length === 0 ? (
                <p className="text-xs text-slate-400 py-4 text-center">Scan passes to see live admission stream.</p>
              ) : (
                scanHistory.map((h) => (
                  <div key={h.id} className="py-2 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span
                        className={`w-2 h-2 rounded-full ${
                          h.res.success ? 'bg-emerald-500' : 'bg-rose-500'
                        }`}
                      ></span>
                      <div>
                        <p className="font-bold text-slate-900">
                          {h.res.participant?.fullName || h.code}
                        </p>
                        <p className="text-[10px] text-slate-500">
                          {h.res.reason} • {h.time}
                        </p>
                      </div>
                    </div>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                        h.res.success
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-rose-50 text-rose-700'
                      }`}
                    >
                      {h.res.success ? 'ADMITTED' : 'REJECTED'}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
