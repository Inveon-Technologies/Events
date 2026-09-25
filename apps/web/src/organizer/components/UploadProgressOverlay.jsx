import { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, CloudUpload, Film, Loader2, RotateCcw } from 'lucide-react';

// Full-screen progress while an event is saved and its photos / video
// upload: overall percentage, MB sent, speed, time taken and time left,
// plus every file with its own thumbnail and status. If some files fail,
// the organizer can retry just those or carry on without them.
//
// progress = {
//   phase: 'saving' | 'uploading' | 'done' | 'failed',
//   files: [{ name, size, previewUrl, kind: 'photo'|'video',
//             status: 'waiting'|'uploading'|'done'|'failed', loaded, error }],
//   startedAt: number,      // Date.now() when the uploads began
// }
// onRetry / onContinue are used only in the 'failed' phase.

function mb(bytes) {
  return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

function clock(seconds) {
  const s = Math.max(0, Math.round(seconds));
  const m = Math.floor(s / 60);
  return m ? `${m}m ${String(s % 60).padStart(2, '0')}s` : `${s}s`;
}

function FileRow({ file }) {
  const pct = file.status === 'done' ? 100 : file.size ? Math.min(99, Math.floor(((file.loaded || 0) / file.size) * 100)) : 0;
  return (
    <li className="flex items-center gap-3 py-2">
      <div className="h-10 w-10 shrink-0 overflow-hidden rounded-md bg-slate-100">
        {file.kind === 'video' ? (
          <div className="flex h-full w-full items-center justify-center text-slate-500">
            <Film className="h-5 w-5" />
          </div>
        ) : (
          file.previewUrl && <img src={file.previewUrl} alt="" className="h-full w-full object-cover" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-xs font-semibold text-slate-800" title={file.name}>
            {file.name}
          </p>
          <span className="shrink-0 text-[11px] tabular-nums text-slate-500">{mb(file.size)}</span>
        </div>
        {file.status === 'failed' ? (
          <p className="text-[11px] text-red-600">{file.error || 'Upload failed'}</p>
        ) : (
          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className={`h-full rounded-full transition-all duration-300 ${file.status === 'done' ? 'bg-emerald-500' : 'bg-brand-500'}`}
              style={{ width: `${file.status === 'waiting' ? 0 : pct}%` }}
            />
          </div>
        )}
      </div>
      <div className="w-12 shrink-0 text-right text-[11px] font-semibold tabular-nums">
        {file.status === 'done' && <CheckCircle2 className="ml-auto h-4 w-4 text-emerald-600" aria-label="Uploaded" />}
        {file.status === 'failed' && <AlertCircle className="ml-auto h-4 w-4 text-red-600" aria-label="Failed" />}
        {file.status === 'uploading' && <span className="text-brand-700">{pct}%</span>}
        {file.status === 'waiting' && <span className="text-slate-400">Waiting</span>}
      </div>
    </li>
  );
}

export default function UploadProgressOverlay({ progress, onRetry, onContinue }) {
  const [now, setNow] = useState(() => Date.now());
  const active = progress && (progress.phase === 'saving' || progress.phase === 'uploading');
  useEffect(() => {
    if (!active) return undefined;
    const t = setInterval(() => setNow(Date.now()), 500);
    // Closing the tab mid-upload would lose the files — ask first.
    const warn = (e) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => {
      clearInterval(t);
      window.removeEventListener('beforeunload', warn);
    };
  }, [active]);
  if (!progress) return null;

  const { phase, files = [], startedAt = now } = progress;
  const total = files.reduce((sum, f) => sum + f.size, 0) || 1;
  const done = files.reduce((sum, f) => sum + (f.status === 'done' ? f.size : f.status === 'uploading' ? f.loaded || 0 : 0), 0);
  const finished = files.filter((f) => f.status === 'done').length;
  const failed = files.filter((f) => f.status === 'failed').length;
  const percent = phase === 'done' ? 100 : phase === 'saving' ? 0 : Math.min(99, Math.floor((done / total) * 100));
  const elapsed = (now - startedAt) / 1000;
  const speed = elapsed > 0.5 ? done / elapsed : 0;
  const left = speed > 0 ? (total - done) / speed : null;

  const title = {
    saving: 'Saving your event…',
    uploading: 'Uploading photos & video',
    done: 'All done!',
    failed: `${failed} file${failed === 1 ? '' : 's'} didn't upload`,
  }[phase];
  const subtitle = {
    saving: 'Your details are being saved. Photos upload next.',
    uploading: `${finished} of ${files.length} uploaded. Please keep this page open.`,
    done: 'Your event and all its media are saved.',
    failed: 'Your event is saved. You can try these files again, or carry on and add them later from Edit.',
  }[phase];

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 px-4 backdrop-blur-sm"
      role="dialog"
      aria-live="polite"
    >
      <div className="flex max-h-[90vh] w-full max-w-md flex-col rounded-2xl bg-white p-6 shadow-2xl">
        <div className="flex items-center gap-3">
          <div
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${phase === 'failed' ? 'bg-red-50 text-red-600' : 'bg-brand-50 text-brand-600'}`}
          >
            {phase === 'done' && <CheckCircle2 className="h-6 w-6 text-emerald-600" />}
            {phase === 'saving' && <Loader2 className="h-6 w-6 animate-spin" />}
            {phase === 'uploading' && <CloudUpload className="h-6 w-6 animate-pulse" />}
            {phase === 'failed' && <AlertCircle className="h-6 w-6" />}
          </div>
          <div>
            <p className="text-base font-bold text-slate-900">{title}</p>
            <p className="text-xs text-slate-500">{subtitle}</p>
          </div>
        </div>

        {phase !== 'failed' && (
          <div className="mt-5">
            <span className="text-3xl font-black tabular-nums text-slate-900">{percent}%</span>
            <div className="mt-2 h-3 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className={`h-full rounded-full transition-all duration-300 ${phase === 'done' ? 'bg-emerald-500' : 'bg-gradient-to-r from-brand-500 to-brand-700'} ${phase === 'saving' ? 'w-1/4 animate-pulse' : ''}`}
                style={phase === 'saving' ? undefined : { width: `${percent}%` }}
              />
            </div>
          </div>
        )}

        {phase !== 'saving' && files.length > 0 && (
          <>
            {phase !== 'failed' && (
              <dl className="mt-4 grid grid-cols-4 gap-2 text-center text-[11px]">
                <div className="rounded-lg bg-slate-50 p-2">
                  <dt className="text-slate-500">Sent</dt>
                  <dd className="font-bold tabular-nums text-slate-800">{mb(done)}</dd>
                </div>
                <div className="rounded-lg bg-slate-50 p-2">
                  <dt className="text-slate-500">Speed</dt>
                  <dd className="font-bold tabular-nums text-slate-800">{speed ? `${mb(speed)}/s` : '—'}</dd>
                </div>
                <div className="rounded-lg bg-slate-50 p-2">
                  <dt className="text-slate-500">Taken</dt>
                  <dd className="font-bold tabular-nums text-slate-800">{clock(elapsed)}</dd>
                </div>
                <div className="rounded-lg bg-slate-50 p-2">
                  <dt className="text-slate-500">Left</dt>
                  <dd className="font-bold tabular-nums text-slate-800">
                    {phase === 'done' ? '0s' : left === null ? '…' : `~${clock(left)}`}
                  </dd>
                </div>
              </dl>
            )}
            <ul className="mt-4 -mx-1 flex-1 divide-y divide-slate-100 overflow-y-auto px-1">
              {files.map((f, i) => (
                <FileRow key={`${f.name}-${i}`} file={f} />
              ))}
            </ul>
          </>
        )}

        {phase === 'failed' && (
          <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onContinue}
              className="rounded-lg px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100"
            >
              Continue without them
            </button>
            <button
              type="button"
              onClick={onRetry}
              className="flex items-center justify-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-xs font-bold text-white hover:bg-brand-700"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Try again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
