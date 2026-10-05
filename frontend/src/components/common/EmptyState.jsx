import React from 'react';
import { FolderOpen } from 'lucide-react';

const EmptyState = ({ title = 'No records found', message = 'There are no items to display at this moment.', icon: Icon = FolderOpen, action }) => {
  return (
    <div className="py-12 px-4 text-center border-2 border-dashed border-slate-200 rounded-2xl bg-white/50 my-4">
      <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3">
        <Icon className="w-6 h-6" />
      </div>
      <h4 className="text-sm font-bold text-slate-800">{title}</h4>
      <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">{message}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
};

export default EmptyState;

