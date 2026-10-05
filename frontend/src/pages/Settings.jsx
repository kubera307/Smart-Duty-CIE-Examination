import React, { useState, useEffect } from 'react';
import { auditApi } from '../services/auditApi';
import Badge from '../components/common/Badge';
import { Settings as SettingsIcon, Save, History, Shield, Check } from 'lucide-react';

const Settings = () => {
  const [settings, setSettings] = useState({});
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Editable settings fields
  const [bufferMinutes, setBufferMinutes] = useState('60');
  const [maxCapacity, setMaxCapacity] = useState('15');
  const [academicYear, setAcademicYear] = useState('2026-2027');

  useEffect(() => {
    loadSettingsAndAudit();
  }, []);

  const loadSettingsAndAudit = async () => {
    setLoading(true);
    try {
      const [sRes, lRes] = await Promise.all([
        auditApi.getSettings(),
        auditApi.getLogs({ limit: 40 })
      ]);
      setSettings(sRes.data || {});
      setLogs(lRes.data || []);

      if (sRes.data?.buffer_minutes) setBufferMinutes(sRes.data.buffer_minutes.value);
      if (sRes.data?.max_duty_capacity) setMaxCapacity(sRes.data.max_duty_capacity.value);
      if (sRes.data?.academic_year) setAcademicYear(sRes.data.academic_year.value);
    } catch (err) {
      console.error('Error loading settings:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSettings = async (e) => {
    e.preventDefault();
    setSaveSuccess(false);
    try {
      await auditApi.updateSettings({
        buffer_minutes: bufferMinutes,
        max_duty_capacity: maxCapacity,
        academic_year: academicYear
      });
      setSaveSuccess(true);
      loadSettingsAndAudit();
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      alert('Failed to update system settings');
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="border-b border-slate-200/80 pb-5">
        <h2 className="text-2xl font-bold text-slate-900 tracking-tight">System Settings & Audit Log</h2>
        <p className="text-xs text-slate-500 mt-0.5">
          Configure institutional constraint thresholds, timetable buffer policies, and inspect immutable audit trail
        </p>
      </div>

      {/* Settings Form */}
      <div className="bg-white rounded-2xl border border-slate-200/90 p-6 shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-5">
          <div className="flex items-center gap-2">
            <SettingsIcon className="w-5 h-5 text-sky-600" />
            <h3 className="font-bold text-sm text-slate-800">Allocation Engine Configuration</h3>
          </div>
          {saveSuccess && (
            <span className="flex items-center gap-1.5 text-xs text-emerald-600 font-semibold">
              <Check className="w-4 h-4" />
              Settings Saved & Audited
            </span>
          )}
        </div>

        <form onSubmit={handleSaveSettings} className="space-y-4 text-xs">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Protected Timetable Buffer (Minutes)
              </label>
              <input
                type="number"
                min="0"
                max="180"
                value={bufferMinutes}
                onChange={(e) => setBufferMinutes(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 focus:ring-1 focus:ring-sky-500 focus:outline-none"
              />
              <p className="text-[10px] text-slate-400 mt-1">
                Mandatory gap before and after regular lectures to prevent examination collisions (Default: 60)
              </p>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Maximum Duty Capacity Per Faculty
              </label>
              <input
                type="number"
                min="1"
                max="50"
                value={maxCapacity}
                onChange={(e) => setMaxCapacity(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 focus:ring-1 focus:ring-sky-500 focus:outline-none"
              />
              <p className="text-[10px] text-slate-400 mt-1">
                Upper ceiling of duties across all CIEs for a single faculty member (Default: 15)
              </p>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Active Academic Year
              </label>
              <input
                type="text"
                value={academicYear}
                onChange={(e) => setAcademicYear(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 focus:ring-1 focus:ring-sky-500 focus:outline-none"
              />
              <p className="text-[10px] text-slate-400 mt-1">
                Current active institutional cycle
              </p>
            </div>
          </div>

          <div className="flex justify-end pt-3 border-t border-slate-100">
            <button
              type="submit"
              className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg font-semibold flex items-center gap-1.5 shadow-sm"
            >
              <Save className="w-4 h-4" />
              <span>Update System Policies</span>
            </button>
          </div>
        </form>
      </div>

      {/* Full Audit Log Table */}
      <div className="bg-white rounded-2xl border border-slate-200/90 p-6 shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-indigo-600" />
            <h3 className="font-bold text-sm text-slate-800">Immutable System Audit Trail</h3>
          </div>
          <span className="text-xs text-slate-400">Latest 40 Recorded Events</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-100 text-slate-500 text-[10px] uppercase font-semibold">
                <th className="py-2.5 px-3">Timestamp</th>
                <th className="py-2.5 px-3">Action</th>
                <th className="py-2.5 px-3">User</th>
                <th className="py-2.5 px-3">Target Entity</th>
                <th className="py-2.5 px-4">Event Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
              {loading ? (
                <tr>
                  <td colSpan="5" className="py-8 text-center text-slate-400">Loading audit history...</td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan="5" className="py-8 text-center text-slate-400">No audit events recorded.</td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50/50">
                    <td className="py-2.5 px-3 text-slate-500 whitespace-nowrap">
                      {log.timestamp ? new Date(log.timestamp).toLocaleString() : ''}
                    </td>
                    <td className="py-2.5 px-3">
                      <span className="font-bold text-slate-800 font-sans">{log.action}</span>
                    </td>
                    <td className="py-2.5 px-3 text-slate-600 font-sans">{log.user_identifier}</td>
                    <td className="py-2.5 px-3 text-slate-500 font-sans">{log.entity_type} #{log.entity_id}</td>
                    <td className="py-2.5 px-4 text-slate-700 font-sans text-xs">{log.details}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Settings;

