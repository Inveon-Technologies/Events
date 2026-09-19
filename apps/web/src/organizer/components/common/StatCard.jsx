import React from 'react';

export default function StatCard({ title, value, subtitle, icon: Icon, change, isPositive, iconBg = 'bg-blue-50 text-brand-600', onClick }) {
  return (
    <div 
      onClick={onClick}
      className={`bg-white rounded-xl p-5 border border-slate-200/80 shadow-xs hover:shadow-md transition-all duration-200 ${onClick ? 'cursor-pointer hover:border-brand-500' : ''}`}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{title}</p>
          <h3 className="text-2xl font-bold text-slate-900 mt-1 tracking-tight">{value}</h3>
        </div>
        {Icon && (
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${iconBg}`}>
            <Icon className="w-5 h-5" />
          </div>
        )}
      </div>

      {(change || subtitle) && (
        <div className="mt-3 flex items-center gap-2 text-xs">
          {change && (
            <span className={`font-semibold flex items-center ${isPositive ? 'text-emerald-600' : 'text-rose-600'}`}>
              {isPositive ? '↑' : '↓'} {change}
            </span>
          )}
          {subtitle && <span className="text-slate-500">{subtitle}</span>}
        </div>
      )}
    </div>
  );
}
