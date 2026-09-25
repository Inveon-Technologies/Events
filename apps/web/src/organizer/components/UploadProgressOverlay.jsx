import { useEffect, useState } from 'react';
import { CheckCircle2, CloudUpload, Loader2 } from 'lucide-react';

// Full-screen progress while an event is saved and its photos / video
// upload: overall percentage, which file, MB sent, speed, time left and
// time taken so far.
//
// progress = {
//   phase: 'saving' | 'uploading' | 'done',
//   files: [{ name, size }],
//   index: number,          // file being uploaded now
//   loaded: number,         // bytes sent of the current file
//   startedAt: number,      // Date.now() when the uploads began
// }

function mb(bytes) {
  return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

function clock(seconds) {
  const s = Math.max(0, Math.round(seconds));
  const m = Math.floor(s / 60);
  return m ? `${m}m ${String(s % 60).padStart(2, '0')}s` : `${s}s`;
}

export default function UploadProgressOverlay({ progress }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!progress) return undefined;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [progress]);
  if (!progress) return null;

  const { phase, files = [], index = 0, loaded = 0, startedAt = now } = progress;
  const total = files.reduce((sum, f) => sum + f.size, 0) || 1;
  const done = files.slice(0, index).reduce((sum, f) => sum + f.size, 0) + loaded;
  const percent = phase === 'done' ? 100 : phase === 'saving' ? 0 : Math.min(99, Math.floor((done / total) * 100));
  const elapsed = (now - startedAt) / 1000;
  const speed = elapsed > 0.5 ? done / elapsed : 0;
  const left = speed > 0 ? (total - done) / speed : null;
  const current = files[Math.min(index, files.length - 1)];

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm px-4"
      role="dialog"
      aria-live="polite"
    >
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-50 text-brand-600">
            {phase === 'done' ? (
              <CheckCircle2 className="h-6 w-6 text-emerald-600" />
            ) : phase === 'saving' ? (
              <Loader2 className="h-6 w-6 animate-spin" />
            ) : (
              <CloudUpload className="h-6 w-6 animate-pulse" />
            )}
          </div>
          <div>
            <p className="text-base font-bold text-slate-900">
              {phase === 'saving' ? 'Saving your event…' : phase === 'done' ? 'All done!' : 'Uploading photos & video'}
            </p>
            <p className="text-xs text-slate-500">Please keep this page open until it finishes.</p>
          </div>
        </div>

        <div className="mt-5">
          <div className="flex items-end justify-between">
            <span className="text-3xl font-black tabular-nums text-slate-900">{percent}%</span>
            {phase === 'uploading' && files.length > 0 && (
              <span className="text-xs font-semibold text-slate-500">
                File {Math.min(index + 1, files.length)} of {files.length}
              </span>
            )}
          </div>
          <div className="mt-2 h-3 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className={`h-full rounded-full transition-all duration-300 ${phase === 'done' ? 'bg-emerald-500' : 'bg-gradient-to-r from-brand-500 to-brand-700'} ${phase === 'saving' ? 'w-1/4 animate-pulse' : ''}`}
              style={phase === 'saving' ? undefined : { width: `${percent}%` }}
            />
          </div>
          {phase === 'uploading' && current && (
            <p className="mt-2 truncate text-xs text-slate-600" title={current.name}>
              {current.name}
            </p>
          )}
        </div>

        {phase !== 'saving' && files.length > 0 && (
          <dl className="mt-4 grid grid-cols-2 gap-3 text-xs">
            <div className="rounded-lg bg-slate-50 p-2.5">
              <dt className="text-slate-500">Uploaded</dt>
              <dd className="font-bold text-slate-800 tabular-nums">
                {mb(done)} / {mb(total)}
              </dd>
            </div>
            <div className="rounded-lg bg-slate-50 p-2.5">
              <dt className="text-slate-500">Speed</dt>
              <dd className="font-bold text-slate-800 tabular-nums">{speed ? `${mb(speed)}/s` : '—'}</dd>
            </div>
            <div className="rounded-lg bg-slate-50 p-2.5">
              <dt className="text-slate-500">Time taken</dt>
              <dd className="font-bold text-slate-800 tabular-nums">{clock(elapsed)}</dd>
            </div>
            <div className="rounded-lg bg-slate-50 p-2.5">
              <dt className="text-slate-500">Time left</dt>
              <dd className="font-bold text-slate-800 tabular-nums">
                {phase === 'done' ? '0s' : left === null ? 'calculating…' : `about ${clock(left)}`}
              </dd>
            </div>
          </dl>
        )}
      </div>
    </div>
  );
}
