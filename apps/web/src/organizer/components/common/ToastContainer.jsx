import React from 'react';
import { useNotifications } from '../../context/NotificationContext';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

export default function ToastContainer() {
  const { toasts, removeToast } = useNotifications();

  if (!toasts || toasts.length === 0) return null;

  return (
    <div className="fixed bottom-16 right-5 z-[9999] flex flex-col gap-2 pointer-events-none max-w-sm w-full">
      {toasts.map((toast) => {
        let Icon = CheckCircle2;
        let colorClasses = 'bg-slate-900 text-white border-slate-700';

        if (toast.type === 'error') {
          Icon = AlertCircle;
          colorClasses = 'bg-rose-900 text-white border-rose-700';
        } else if (toast.type === 'info') {
          Icon = Info;
          colorClasses = 'bg-blue-900 text-white border-blue-700';
        }

        return (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-center justify-between p-3.5 rounded-xl shadow-xl border text-sm font-medium animate-in slide-in-from-bottom-5 duration-200 ${colorClasses}`}
          >
            <div className="flex items-center gap-2.5">
              <Icon className="w-5 h-5 flex-shrink-0 text-cyan-400" />
              <span>{toast.message}</span>
            </div>
            <button
              onClick={() => removeToast(toast.id)}
              className="ml-3 p-1 rounded hover:bg-white/20 text-slate-300 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
