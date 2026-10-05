import React, { useState, useEffect } from 'react';
import Modal from '../common/Modal';
import { allocationApi } from '../../services/allocationApi';
import { facultyApi } from '../../services/facultyApi';
import { AlertTriangle, ShieldCheck, Check } from 'lucide-react';

const ManualOverrideModal = ({ isOpen, onClose, duty, onSuccess }) => {
  const [facultyList, setFacultyList] = useState([]);
  const [selectedFacultyId, setSelectedFacultyId] = useState('');
  const [overrideReason, setOverrideReason] = useState('');
  const [confirmedForce, setConfirmedForce] = useState(false);
  const [conflictWarning, setConflictWarning] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (isOpen) {
      facultyApi.getAll({ status: 'active' }).then((res) => {
        setFacultyList(res.data.faculty || []);
      });
      setSelectedFacultyId(duty?.faculty_id || '');
      setOverrideReason('');
      setConfirmedForce(false);
      setConflictWarning(null);
      setError(null);
    }
  }, [isOpen, duty]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedFacultyId) {
      setError('Please select a faculty member');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const payload = {
        duty_id: duty.id,
        faculty_id: parseInt(selectedFacultyId),
        force_override: confirmedForce,
        override_reason: overrideReason
      };

      const res = await allocationApi.override(payload);
      if (res.data.success) {
        onSuccess?.();
        onClose();
      }
    } catch (err) {
      if (err.response?.status === 409 && err.response?.data?.requires_force) {
        // Backend detected constraint collision!
        setConflictWarning(err.response.data);
      } else {
        setError(err.response?.data?.error || err.message || 'Override failed');
      }
    } finally {
      setLoading(false);
    }
  };

  if (!duty) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Manual Examination Duty Reassignment">
      <form onSubmit={handleSubmit} className="space-y-4 text-xs">
        {/* Duty Overview */}
        <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
          <div className="font-bold text-slate-800">{duty.subject_code} - {duty.subject_name}</div>
          <div className="text-slate-500 mt-0.5">
            Room <strong>{duty.room_number}</strong> | Date: <strong>{duty.exam_date}</strong> ({duty.start_time} - {duty.end_time})
          </div>
          <div className="text-slate-600 mt-1">
            Current Assigned: <strong>{duty.faculty_name}</strong>
          </div>
        </div>

        {/* Warning Banner if Conflict detected */}
        {conflictWarning && (
          <div className="p-4 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 space-y-2">
            <div className="flex items-center gap-2 font-bold text-amber-800">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>WARNING: CONSTRAINT VIOLATION DETECTED</span>
            </div>
            <p className="text-[11px] leading-relaxed">
              The selected faculty violates standard institutional allocation rules:
            </p>
            <ul className="list-disc pl-4 space-y-1 text-[11px] text-amber-950 font-medium">
              {conflictWarning.errors?.map((err, i) => (
                <li key={i}>{err}</li>
              ))}
              {conflictWarning.warnings?.map((warn, i) => (
                <li key={i}>{warn}</li>
              ))}
            </ul>

            <div className="pt-2 border-t border-amber-200">
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={confirmedForce}
                  onChange={(e) => setConfirmedForce(e.target.checked)}
                  className="mt-0.5 rounded text-amber-600 focus:ring-amber-500"
                />
                <span className="text-[11px] font-bold text-amber-950">
                  I understand the conflict and confirm this manual override as Exam Coordinator.
                </span>
              </label>
            </div>
          </div>
        )}

        {/* Faculty Select */}
        <div>
          <label className="block font-semibold text-slate-700 mb-1">Select Reassigned Faculty</label>
          <select
            value={selectedFacultyId}
            onChange={(e) => {
              setSelectedFacultyId(e.target.value);
              setConflictWarning(null);
              setConfirmedForce(false);
            }}
            className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs focus:ring-1 focus:ring-sky-500 focus:outline-none"
            required
          >
            <option value="">-- Choose Faculty Member --</option>
            {facultyList.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name} ({f.designation}) {!f.eligible_for_duty ? '[EXCLUDED]' : ''} - Duties: {f.total_assigned || 0}
              </option>
            ))}
          </select>
        </div>

        {/* Override Justification */}
        <div>
          <label className="block font-semibold text-slate-700 mb-1">
            Override Justification / Reason <span className="text-slate-400 font-normal">(Logged in audit trail)</span>
          </label>
          <textarea
            rows="2"
            value={overrideReason}
            onChange={(e) => setOverrideReason(e.target.value)}
            placeholder="e.g., Faculty requested duty swap; department approved emergency coverage..."
            className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs focus:ring-1 focus:ring-sky-500 focus:outline-none"
            required={Boolean(conflictWarning)}
          />
        </div>

        {error && (
          <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs">
            {error}
          </div>
        )}

        {/* Buttons */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg text-slate-600 hover:bg-slate-100 text-xs font-medium"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading || (conflictWarning && !confirmedForce)}
            className={`px-4 py-2 rounded-lg font-semibold text-white transition-all text-xs flex items-center gap-1.5 ${
              conflictWarning
                ? 'bg-amber-600 hover:bg-amber-700 disabled:opacity-50'
                : 'bg-sky-600 hover:bg-sky-700 disabled:opacity-50'
            }`}
          >
            {loading ? 'Saving...' : conflictWarning ? 'Force Override Reassignment' : 'Confirm Assignment'}
          </button>
        </div>
      </form>
    </Modal>
  );
};

export default ManualOverrideModal;

