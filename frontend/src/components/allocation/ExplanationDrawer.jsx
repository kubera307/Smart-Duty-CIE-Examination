import React from 'react';
import Modal from '../common/Modal';
import Badge from '../common/Badge';
import { CheckCircle2, XCircle, AlertCircle, Award, UserCheck, ShieldAlert } from 'lucide-react';

const ExplanationDrawer = ({ isOpen, onClose, explanation, duty }) => {
  if (!explanation) return null;

  const { explanation_summary, hard_constraints_checked, soft_metrics, rejected_candidates } = explanation;

  // Group rejected candidates into hard vs soft
  const hardRejected = rejected_candidates?.filter(c => c.category === 'HARD_DISQUALIFICATION') || [];
  const softSubordinated = rejected_candidates?.filter(c => c.category === 'WORKLOAD_OPTIMIZATION_SUBORDINATE') || [];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Intelligent Allocation Decision Trace"
      maxWidth="max-w-3xl"
    >
      <div className="space-y-6">
        {/* Session Banner */}
        {duty && (
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div>
              <div className="font-bold text-slate-800 text-sm">{duty.subject_code} - {duty.subject_name}</div>
              <div className="text-slate-500 mt-0.5">
                Room <strong>{duty.room_number}</strong> | {duty.exam_date} ({duty.start_time} - {duty.end_time})
              </div>
            </div>
            <Badge variant="purple">{duty.semester_name || 'Exam Session'}</Badge>
          </div>
        )}

        {/* Executive Summary */}
        <div className="bg-sky-50 border border-sky-200 p-4 rounded-xl">
          <div className="flex items-center gap-2 text-sky-900 font-bold text-xs uppercase tracking-wider mb-1">
            <Award className="w-4 h-4 text-sky-600" />
            Decision Rationale Summary
          </div>
          <p className="text-xs text-sky-950 leading-relaxed">{explanation_summary}</p>
        </div>

        {/* Selected Faculty Justification */}
        <div className="border border-emerald-200 bg-emerald-50/40 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3 border-b border-emerald-200 pb-2">
            <div className="flex items-center gap-2">
              <UserCheck className="w-5 h-5 text-emerald-600" />
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-900">
                  Why {explanation.selected_faculty_name || 'Selected Faculty'} was Chosen
                </h4>
                <div className="text-[11px] text-emerald-700">Satisfies 100% hard constraints and ranks #1 for fairness</div>
              </div>
            </div>
            {soft_metrics && (
              <Badge variant="success">
                Cumulative Duties: {soft_metrics.cumulative_duties ?? 0}
              </Badge>
            )}
          </div>

          {/* Hard Constraints Checked */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-3">
            {hard_constraints_checked?.map((chk, i) => (
              <div key={i} className="flex items-start gap-2 text-xs text-emerald-900 bg-white/80 p-2 rounded-lg border border-emerald-100">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                <span>{chk}</span>
              </div>
            ))}
          </div>

          {/* Soft Scoring Breakdown */}
          {soft_metrics?.breakdown && (
            <div className="mt-3 pt-3 border-t border-emerald-100 flex flex-wrap gap-4 text-[11px] text-emerald-800">
              <span>Workload Penalty: <strong>{soft_metrics.breakdown.workload_penalty}</strong></span>
              <span>CIE Equity: <strong>{soft_metrics.breakdown.cie_penalty}</strong></span>
              <span>Experience Factor: <strong>{soft_metrics.breakdown.experience_penalty}</strong></span>
              <span>Total Score: <strong>{soft_metrics.penalty_score}</strong></span>
            </div>
          )}
        </div>

        {/* Disqualified Candidates Section */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <ShieldAlert className="w-4 h-4 text-rose-600" />
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800">
              Why Others Were Not Selected ({rejected_candidates?.length || 0} Candidates)
            </h4>
          </div>

          {/* Hard Disqualifications */}
          {hardRejected.length > 0 && (
            <div className="space-y-2 mb-4">
              <div className="text-[11px] font-semibold text-rose-700 uppercase">
                Disqualified due to Hard Constraints ({hardRejected.length})
              </div>
              <div className="space-y-2">
                {hardRejected.map((c) => (
                  <div key={c.faculty_id} className="p-3 rounded-lg border border-rose-200 bg-rose-50/50 text-xs">
                    <div className="flex items-center justify-between font-bold text-rose-950">
                      <span>{c.faculty_name} ({c.designation})</span>
                      <span className="text-[10px] text-rose-600 uppercase font-mono">{c.employee_id}</span>
                    </div>
                    <ul className="mt-1 space-y-1">
                      {c.reasons.map((r, i) => (
                        <li key={i} className="flex items-start gap-1.5 text-rose-800 text-[11px]">
                          <XCircle className="w-3.5 h-3.5 text-rose-500 shrink-0 mt-0.5" />
                          <span>{r}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Soft Subordinated Candidates */}
          {softSubordinated.length > 0 && (
            <div className="space-y-2">
              <div className="text-[11px] font-semibold text-slate-500 uppercase">
                Cleared Constraints but Higher Workload ({softSubordinated.length})
              </div>
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {softSubordinated.map((c) => (
                  <div key={c.faculty_id} className="p-2.5 rounded-lg border border-slate-200 bg-slate-50 text-xs flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-slate-800">{c.faculty_name} ({c.designation})</div>
                      <div className="text-[11px] text-slate-500 mt-0.5">{c.reasons[0]}</div>
                    </div>
                    <Badge variant="default">Subordinated</Badge>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
};

export default ExplanationDrawer;

