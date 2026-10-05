import React from 'react';

const StatCard = ({ title, value, subtitle, icon: Icon, color = 'sky', alert = false }) => {
  const colorMap = {
    sky: 'bg-sky-50 text-sky-600 border-sky-100',
    indigo: 'bg-indigo-50 text-indigo-600 border-indigo-100',
    emerald: 'bg-emerald-50 text-emerald-600 border-emerald-100',
    amber: 'bg-amber-50 text-amber-600 border-amber-100',
    rose: 'bg-rose-50 text-rose-600 border-rose-100',
    slate: 'bg-slate-100 text-slate-700 border-slate-200',
  };

  return (
    <div className={`p-5 rounded-xl bg-white border border-slate-200/90 shadow-sm transition-all hover:shadow-md ${alert ? 'ring-1 ring-rose-300' : ''}`}>
      <div className="flex items-start justify-between">
        <div>
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">{title}</span>
          <div className="text-2xl font-bold text-slate-900 mt-1 tracking-tight">{value}</div>
          {subtitle && <div className="text-xs text-slate-500 mt-1">{subtitle}</div>}
        </div>
        {Icon && (
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center border ${colorMap[color] || colorMap.sky}`}>
            <Icon className="w-5 h-5" />
          </div>
        )}
      </div>
    </div>
  );
};

export default StatCard;

