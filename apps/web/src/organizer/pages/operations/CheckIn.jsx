import React, { useState, useEffect, useRef } from 'react';
import {
  QrCode,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  X,
  Ban,
  Camera,
  CameraOff,
} from 'lucide-react';
import { useEvents } from '../../context/EventsContext';
import { useAuth } from '../../context/AuthContext';
import { apiRequest, ApiError } from '../../lib/api';

// Real audio feedback via Web Audio API — unchanged from before, this
// part was already real.
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
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime);
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.25, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.35);
    } else {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(160, ctx.currentTime);
      osc.frequency.setValueAtTime(110, ctx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.35, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.45);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.45);
    }
  } catch {
    // AudioContext blocked or unsupported — silently skip, never block a scan over this.
  }
};

const QR_READER_ELEMENT_ID = 'live-checkin-qr-reader';

export default function CheckIn() {
  const { events } = useEvents();
  const { user } = useAuth();

  const [selectedEventId, setSelectedEventId] = useState('');
  const [ticketInput, setTicketInput] = useState('');
  const [scanResult, setScanResult] = useState(null);
  const [scanHistory, setScanHistory] = useState([]);
  const [scanning, setScanning] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [processing, setProcessing] = useState(false);
  const [queue, setQueue] = useState([]);
  const [queueLoading, setQueueLoading] = useState(false);

  const html5QrCodeRef = useRef(null);
  const lastScannedRef = useRef({ code: null, at: 0 });

  useEffect(() => {
    if (!selectedEventId && events.length > 0) setSelectedEventId(events[0].id);
  }, [events, selectedEventId]);

  async function loadQueue() {
    if (!selectedEventId) return;
    setQueueLoading(true);
    try {
      const res = await apiRequest(`/organizer/tickets?eventId=${selectedEventId}&status=valid`, { token: user?.token });
      setQueue(res.tickets);
    } catch {
      // Non-critical for the scan flow itself — the queue is a convenience list, not required to check anyone in.
    } finally {
      setQueueLoading(false);
    }
  }

  useEffect(() => {
    loadQueue();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEventId]);

  async function processScan(qrToken) {
    if (!selectedEventId) {
      setScanResult({ success: false, title: 'Select an Event First', message: 'Choose which event you\u2019re checking attendees into above.' });
      return;
    }
    if (processing) return;
    setProcessing(true);
    try {
      const result = await apiRequest(`/organizer/events/${selectedEventId}/checkin`, {
        method: 'POST',
        token: user?.token,
        body: { qrToken },
      });
      playBeep(true);
      const success = {
        success: true,
        title: 'Admitted',
        message: `${result.attendeeName} — ${result.tierName}`,
        attendee: { name: result.attendeeName, tierName: result.tierName, bookingReference: result.bookingReference },
      };
      setScanResult(success);
      setScanHistory((prev) => [{ id: Date.now(), time: new Date().toLocaleTimeString(), res: success }, ...prev.slice(0, 9)]);
      loadQueue();
    } catch (err) {
      playBeep(false);
      const message = err instanceof ApiError ? err.message : 'Could not verify this ticket.';
      const reasonCode = err instanceof ApiError ? err.body?.reasonCode : undefined;
      const failure = { success: false, title: reasonCode === 'cancelled' ? 'Cancelled Ticket' : reasonCode === 'already_checked_in' ? 'Already Checked In' : 'Rejected', message, reasonCode };
      setScanResult(failure);
      setScanHistory((prev) => [{ id: Date.now(), time: new Date().toLocaleTimeString(), res: failure }, ...prev.slice(0, 9)]);
    } finally {
      setProcessing(false);
    }
  }

  async function startCamera() {
    setCameraError('');
    try {
      const { Html5Qrcode } = await import('html5-qrcode');
      const instance = new Html5Qrcode(QR_READER_ELEMENT_ID);
      html5QrCodeRef.current = instance;
      await instance.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText) => {
          // Debounce: the camera keeps decoding the same code every
          // frame while it's in view — without this, one physical scan
          // would fire dozens of check-in requests.
          const now = Date.now();
          if (lastScannedRef.current.code === decodedText && now - lastScannedRef.current.at < 3000) return;
          lastScannedRef.current = { code: decodedText, at: now };
          processScan(decodedText);
        },
        () => {
          // Per-frame "nothing decoded yet" callback — expected constantly while aiming the camera, not an error.
        },
      );
      setScanning(true);
    } catch (err) {
      setCameraError(err?.message || 'Could not access the camera. Check permissions, or use manual entry below.');
      setScanning(false);
    }
  }

  async function stopCamera() {
    if (html5QrCodeRef.current) {
      try {
        await html5QrCodeRef.current.stop();
      } catch {
        // Already stopped or never started — fine either way.
      }
      html5QrCodeRef.current = null;
    }
    setScanning(false);
  }

  useEffect(() => {
    return () => {
      if (html5QrCodeRef.current) {
        html5QrCodeRef.current.stop().catch(() => {});
      }
    };
  }, []);

  function handleManualCheckIn(e) {
    e.preventDefault();
    if (!ticketInput.trim()) return;
    processScan(ticketInput.trim());
    setTicketInput('');
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Live Event Check-in Station</h1>
            {scanning && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800 animate-pulse">
                CAMERA LIVE
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Scan real attendee QR passes — cancelled, refunded, or already-used tickets are rejected automatically.
          </p>
        </div>

        <select
          value={selectedEventId}
          onChange={(e) => setSelectedEventId(e.target.value)}
          className="py-2 px-3 text-xs font-semibold bg-white border border-slate-200 rounded-lg shadow-xs"
        >
          <option value="">Select an event…</option>
          {events.map((e) => (
            <option key={e.id} value={e.id}>{e.title}</option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
        <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 flex items-center gap-2.5 text-emerald-900">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span><strong>Confirmed:</strong> Admitted & marked checked in</span>
        </div>
        <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 flex items-center gap-2.5 text-amber-900">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
          <span><strong>Already Scanned:</strong> Rejected — duplicate entry</span>
        </div>
        <div className="p-3 bg-rose-50 rounded-xl border border-rose-200 flex items-center gap-2.5 text-rose-900">
          <Ban className="w-4 h-4 text-rose-600 shrink-0" />
          <span><strong>Cancelled / Refunded:</strong> Rejected — no entry</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-md space-y-5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <QrCode className="w-4 h-4 text-brand-600" />
              <span>Camera Scanner</span>
            </h3>
            <button
              onClick={scanning ? stopCamera : startCamera}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold ${
                scanning ? 'bg-rose-50 text-rose-700 border border-rose-200' : 'bg-brand-600 text-white'
              }`}
            >
              {scanning ? <CameraOff className="w-3.5 h-3.5" /> : <Camera className="w-3.5 h-3.5" />}
              {scanning ? 'Stop Camera' : 'Start Camera'}
            </button>
          </div>

          <div className="relative aspect-video bg-navy-950 rounded-xl overflow-hidden">
            <div id={QR_READER_ELEMENT_ID} className="w-full h-full [&_video]:w-full [&_video]:h-full [&_video]:object-cover" />
            {!scanning && (
              <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center">
                <QrCode className="w-16 h-16 text-cyan-400/60 mb-2" />
                <p className="text-xs font-semibold text-cyan-100">Press "Start Camera" to begin scanning</p>
                {cameraError && <p className="text-[11px] text-rose-300 mt-2">{cameraError}</p>}
              </div>
            )}
          </div>

          <form onSubmit={handleManualCheckIn} className="space-y-3 pt-2">
            <label className="block text-xs font-bold text-slate-700">Or enter the ticket QR value manually</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={ticketInput}
                onChange={(e) => setTicketInput(e.target.value)}
                placeholder="Paste or type the ticket's QR code value"
                className="flex-1 px-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500 font-mono"
              />
              <button
                type="submit"
                disabled={processing}
                className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white font-bold text-xs rounded-lg shadow-sm disabled:opacity-60"
              >
                {processing ? '…' : 'Check In'}
              </button>
            </div>
          </form>

          {scanResult && (
            <div
              className={`p-5 rounded-2xl border shadow-md space-y-3 ${
                scanResult.success
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
                  : scanResult.reasonCode === 'already_checked_in'
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
                <button onClick={() => setScanResult(null)} className="p-1 hover:bg-black/10 rounded shrink-0">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-3">
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              Confirmed Waiting Queue ({queue.length})
            </h3>
            <div className="max-h-60 overflow-y-auto divide-y divide-slate-100 pr-1">
              {queueLoading ? (
                <p className="text-xs text-slate-400 py-4 text-center">Loading…</p>
              ) : queue.length === 0 ? (
                <p className="text-xs text-slate-400 py-4 text-center">No attendees waiting in this queue.</p>
              ) : (
                queue.map((t) => (
                  <div key={t.id} className="py-2.5 flex items-center justify-between gap-2 text-xs">
                    <div>
                      <p className="font-bold text-slate-900">{t.attendeeName}</p>
                      <p className="text-[10px] text-slate-500 font-mono">{t.bookingReference} • {t.tierName}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

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
                      <span className={`w-2 h-2 rounded-full ${h.res.success ? 'bg-emerald-500' : 'bg-rose-500'}`}></span>
                      <div>
                        <p className="font-bold text-slate-900">{h.res.attendee?.name || h.res.title}</p>
                        <p className="text-[10px] text-slate-500">{h.time}</p>
                      </div>
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${h.res.success ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
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
