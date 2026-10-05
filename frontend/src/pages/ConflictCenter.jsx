import React, { useState, useEffect } from 'react';
import { conflictApi } from '../services/conflictApi';
import Badge from '../components/common/Badge';
import {
  AlertTriangle,
  ShieldAlert,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Clock,
  ArrowRight,
  RefreshCw
} from 'lucide-react';

const ConflictCenter = () => {
  const [data, setData] = useState(null);
  const [activeTab, setActiveTab] = useState('critical');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadConflicts();
  }, []);

  const loadConflicts = async () => {
    setLoading(true);
    try {
      const res = await conflictApi.getAll();
      setData(res.data);
    } catch (err) {
      console.error('Error loading conflicts:', err);
    } finally {
      setLoading(false);
    }
  };

  const counts = data?.counts || { critical: 0, warning: 0, resolved: 0 };
  const currentList = data ? data[activeTab] || [] : [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200/80 pb-5">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-rose-600 uppercase tracking-wider mb-1">
            <ShieldAlert className="w-4 h-4" />
            <span>Institutional Constraint Compliance Center</span>
          </div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Conflict Center & Duty Exceptions</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Identify timetable collisions, protected buffer breaches, unallocated sessions, and workload limits
          </p>
        </div>
        <button
          onClick={loadConflicts}
          className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-semibold transition-all shadow-sm"
        >
          <RefreshCw className="w-3.5 h-3.5 text-slate-500" />
          <span>Refresh Analysis</span>
        </button>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-3 border-b border-slate-200 pb-2 text-xs">
        <button
          onClick={() => setActiveTab('critical')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold transition-all ${
            activeTab === 'critical'
              ? 'bg-rose-50 text-rose-700 border border-rose-200 shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <ShieldAlert className="w-4 h-4 text-rose-600" />
          <span>Critical Exceptions</span>
          <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-rose-200 text-rose-800">
            {counts.critical}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('warning')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold transition-all ${
            activeTab === 'warning'
              ? 'bg-amber-50 text-amber-800 border border-amber-200 shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <AlertTriangle className="w-4 h-4 text-amber-600" />
          <span>Warnings & Monitoring</span>
          <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-amber-200 text-amber-900">
            {counts.warning}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('resolved')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold transition-all ${
            activeTab === 'resolved'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200 shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          <span>Reconciled / Completed</span>
          <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-emerald-200 text-emerald-900">
            {counts.resolved}
          </span>
        </button>
      </div>

      {/* Cards List */}
      {loading ? (
        <div className="py-16 text-center text-xs text-slate-400">Auditing allocation constraints...</div>
      ) : currentList.length === 0 ? (
        <div className="py-16 text-center bg-white rounded-2xl border border-slate-200 p-6">
          <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
          <h3 className="font-bold text-sm text-slate-800">Zero active exceptions in this category</h3>
          <p className="text-xs text-slate-500 mt-1">All institutional rules and constraints are currently satisfied.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {currentList.map((item) => (
            <div
              key={item.id}
              className={`p-5 rounded-2xl border bg-white shadow-sm flex flex-col justify-between ${
                item.severity === 'CRITICAL'
                  ? 'border-rose-200 hover:border-rose-300'
                  : item.severity === 'WARNING'
                  ? 'border-amber-200 hover:border-amber-300'
                  : 'border-emerald-200 hover:border-emerald-300'
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="font-mono text-[10px] font-bold tracking-wider uppercase text-slate-400">
                    {item.type}
                  </span>
                  <Badge
                    variant={
                      item.status === 'BLOCKED'
                        ? 'danger'
                        : item.status === 'MONITORING'
                        ? 'warning'
                        : 'success'
                    }
                  >
                    {item.status}
                  </Badge>
                </div>

                <h4 className="text-sm font-bold text-slate-900 mb-1">{item.title}</h4>
                <p className="text-xs text-slate-600 leading-relaxed mb-4">{item.details}</p>
              </div>

              {item.remediation && (
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-[11px] text-slate-600">
                  <span className="font-bold text-slate-800">Recommended Resolution: </span>
                  {item.remediation}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ConflictCenter;

