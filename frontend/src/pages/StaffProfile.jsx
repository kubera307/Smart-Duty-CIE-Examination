import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { facultyApi } from '../services/facultyApi';
import StatCard from '../components/common/StatCard';
import Badge from '../components/common/Badge';
import Modal from '../components/common/Modal';
import {
  ArrowLeft,
  Calendar,
  Clock,
  ClipboardList,
  CheckCircle2,
  AlertCircle,
  Briefcase,
  ShieldCheck,
  ShieldAlert,
  GraduationCap,
  BookOpen,
  Plus,
  Trash2,
  Check,
  Layers,
  Edit3,
  MapPin
} from 'lucide-react';

const StaffProfile = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isLeaveModalOpen, setIsLeaveModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  // Leave modal state
  const [leaveDate, setLeaveDate] = useState('');
  const [leaveStartTime, setLeaveStartTime] = useState('09:00');
  const [leaveEndTime, setLeaveEndTime] = useState('17:00');
  const [leaveReason, setLeaveReason] = useState('');

  // Edit staff details modal state
  const [editFormData, setEditFormData] = useState({
    name: '',
    employee_id: '',
    designation: '',
    department: 'CSE (AI & ML)',
    experience_years: '',
    email: '',
    phone: '',
    skills: '',
    max_duty_capacity: 15,
    eligible_for_duty: true,
    is_active: true
  });
  const [editFormError, setEditFormError] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [successToast, setSuccessToast] = useState(null);

  useEffect(() => {
    loadProfile();
  }, [id]);

  const loadProfile = async () => {
    setLoading(true);
    try {
      const res = await facultyApi.getProfile(id);
      setData(res.data);
    } catch (err) {
      setError('Unable to load staff profile.');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenEditModal = () => {
    if (!data?.faculty) return;
    const f = data.faculty;
    setEditFormError(null);
    setEditFormData({
      name: f.name || '',
      employee_id: f.employee_id || '',
      designation: f.designation && f.designation !== 'Not provided' ? f.designation : '',
      department: f.department || 'CSE (AI & ML)',
      experience_years: f.experience_years !== null && f.experience_years !== undefined ? f.experience_years : '',
      email: f.email || '',
      phone: f.phone || '',
      skills: Array.isArray(f.skills) ? f.skills.join(', ') : '',
      max_duty_capacity: data.duty_summary?.maximum_allowed || 15,
      eligible_for_duty: f.eligible_for_duty !== undefined ? f.eligible_for_duty : true,
      is_active: f.active !== undefined ? f.active : true
    });
    setIsEditModalOpen(true);
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    setEditFormError(null);
    setIsSaving(true);

    try {
      const payload = {
        name: editFormData.name.trim(),
        employee_id: editFormData.employee_id.trim() || null,
        designation: editFormData.designation.trim() || 'Not provided',
        department: editFormData.department.trim() || 'CSE (AI & ML)',
        experience_years: editFormData.experience_years !== '' ? parseFloat(editFormData.experience_years) : null,
        email: editFormData.email.trim() || null,
        phone: editFormData.phone.trim() || null,
        skills: editFormData.skills ? editFormData.skills.split(',').map((s) => s.trim()).filter(Boolean) : [],
        max_duty_capacity: parseInt(editFormData.max_duty_capacity) || 15,
        eligible_for_duty: editFormData.eligible_for_duty,
        is_active: editFormData.is_active
      };

      await facultyApi.update(id, payload);
      setIsEditModalOpen(false);
      showToast('Staff details updated successfully');
      loadProfile();
    } catch (err) {
      setEditFormError(err.response?.data?.error || 'Failed to update staff details');
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleEligibility = async () => {
    if (!data?.faculty) return;
    try {
      await facultyApi.update(data.faculty.id, {
        eligible_for_duty: !data.faculty.eligible_for_duty
      });
      showToast(`Updated duty eligibility to ${!data.faculty.eligible_for_duty ? 'Eligible' : 'Excluded'}`);
      loadProfile();
    } catch (err) {
      alert('Failed to update eligibility status');
    }
  };

  const handleAddLeave = async (e) => {
    e.preventDefault();
    try {
      await facultyApi.addUnavailability(data.faculty.id, {
        date: leaveDate,
        start_time: leaveStartTime,
        end_time: leaveEndTime,
        reason: leaveReason
      });
      setIsLeaveModalOpen(false);
      setLeaveDate('');
      setLeaveReason('');
      showToast('Official leave recorded');
      loadProfile();
    } catch (err) {
      alert('Failed to record unavailability');
    }
  };

  const showToast = (msg) => {
    setSuccessToast(msg);
    setTimeout(() => setSuccessToast(null), 3500);
  };

  if (loading) {
    return (
      <div className="py-20 text-center">
        <div className="w-8 h-8 border-4 border-sky-500 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
        <p className="text-xs text-slate-500">Loading database-driven staff profile...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs text-center">
        {error || 'Staff profile not found.'}
        <div className="mt-4">
          <button
            onClick={() => navigate('/faculty')}
            className="px-3 py-1.5 bg-white border border-rose-300 rounded-lg text-xs font-semibold hover:bg-rose-100"
          >
            ← Back to Directory
          </button>
        </div>
      </div>
    );
  }

  const f = data.faculty || {};
  const dutySummary = data.duty_summary || {
    total_assigned: 0,
    completed: 0,
    remaining: 0,
    completion_percentage: 0,
    maximum_allowed: 15,
    remaining_capacity: 15
  };
  const cieBreakdown = data.cie_breakdown || { cie_1: 0, cie_2: 0, cie_3: 0 };
  const dutyTypeBreakdown = data.duty_type_breakdown || { invigilation: 0, squad: 0 };
  const teachingSemesters = data.teaching_semesters || [];
  const subjects = data.subjects || [];
  const timetableSummary = data.timetable_summary || { total_slots: 0, semester_wise: {} };
  const timetableEntries = data.timetable || [];
  const upcomingDuties = data.upcoming_duties || [];
  const dutyHistory = data.duty_history || [];

  const capacityPct = Math.min(
    100,
    Math.round((dutySummary.total_assigned / (dutySummary.maximum_allowed || 15)) * 100)
  );

  // Group timetable entries by semester name
  const timetableBySemester = {};
  timetableEntries.forEach((entry) => {
    const semName = entry.semester_name || 'Academic Class';
    if (!timetableBySemester[semName]) timetableBySemester[semName] = [];
    timetableBySemester[semName].push(entry);
  });

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Toast Notification */}
      {successToast && (
        <div className="fixed bottom-5 right-5 z-50 bg-slate-900 text-white px-4 py-3 rounded-xl shadow-xl flex items-center gap-2 text-xs border border-slate-700 animate-in fade-in slide-in-from-bottom-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{successToast}</span>
        </div>
      )}

      {/* Back Button */}
      <button
        onClick={() => navigate('/faculty')}
        className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-900 transition-colors font-semibold"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>Back to Faculty Directory</span>
      </button>

      {/* Profile Header */}
      <div className="bg-white rounded-2xl border border-slate-200/90 p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center gap-5">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-slate-800 to-slate-950 text-white flex items-center justify-center text-xl font-bold border border-slate-700 shadow-sm">
            {f.name
              ? f.name
                  .split(' ')
                  .map((n) => n[0])
                  .filter((_, i) => i < 2)
                  .join('')
              : 'ST'}
          </div>

          <div>
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <h1 className="text-xl font-bold text-slate-900">{f.name}</h1>
              <Badge variant={f.active ? 'success' : 'slate'}>
                {f.active ? 'ACTIVE' : 'INACTIVE'}
              </Badge>
              <Badge variant={f.eligible_for_duty ? 'brand' : 'danger'}>
                {f.eligible_for_duty ? 'ELIGIBLE FOR DUTY' : 'EXCLUDED (INELIGIBLE)'}
              </Badge>
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
              <span>
                Employee ID: <strong className="text-slate-700">{f.employee_id || 'Not provided'}</strong>
              </span>
              <span>•</span>
              <span>
                Designation: <strong className="text-slate-700">{f.designation || 'Not provided'}</strong>
              </span>
              <span>•</span>
              <span>
                Department: <strong className="text-slate-700">{f.department || 'CSE (AI & ML)'}</strong>
              </span>
              <span>•</span>
              <span>
                Experience:{' '}
                <strong className="text-slate-700">
                  {f.experience_years !== null && f.experience_years !== undefined
                    ? `${f.experience_years} years`
                    : 'Not provided'}
                </strong>
              </span>
            </div>
          </div>
        </div>

        {/* Quick Action Buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleOpenEditModal}
            className="px-3 py-2 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm"
            title="Edit Staff Member Details"
          >
            <Edit3 className="w-3.5 h-3.5 text-amber-600" />
            <span>Edit Details</span>
          </button>

          <button
            onClick={handleToggleEligibility}
            className={`px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 border transition-all ${
              f.eligible_for_duty
                ? 'bg-rose-50 border-rose-200 text-rose-700 hover:bg-rose-100'
                : 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100'
            }`}
          >
            {f.eligible_for_duty ? (
              <>
                <ShieldAlert className="w-3.5 h-3.5" />
                <span>Exclude from Duty</span>
              </>
            ) : (
              <>
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Make Eligible</span>
              </>
            )}
          </button>

          <button
            onClick={() => setIsLeaveModalOpen(true)}
            className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Record Leave</span>
          </button>
        </div>
      </div>

      {/* Duty Summary (4 Stat Cards) */}
      <div>
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
          Duty Overview & Execution Metrics
        </h3>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            title="Total Assigned Duties"
            value={dutySummary.total_assigned}
            subtitle="Duties assigned by system"
            icon={ClipboardList}
            color="sky"
          />
          <StatCard
            title="Completed Duties"
            value={dutySummary.completed}
            subtitle="Duties executed & audited"
            icon={CheckCircle2}
            color="emerald"
          />
          <StatCard
            title="Remaining Duties"
            value={dutySummary.remaining}
            subtitle="Upcoming obligations"
            icon={Clock}
            color="amber"
          />
          <StatCard
            title="Completion Percentage"
            value={`${dutySummary.completion_percentage}%`}
            subtitle="Execution progress"
            icon={ShieldCheck}
            color="indigo"
          />
        </div>
      </div>

      {/* Two Column Grid: Teaching Load & Workload Capacity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Teaching Information & Load (Derived from Timetable) */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-sm space-y-4">
          <div className="border-b border-slate-100 pb-3">
            <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-sky-600" />
              <span>Teaching Information & Academic Load</span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Calculated dynamically from weekly semester timetables
            </p>
          </div>

          <div>
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">
              Teaching Semesters
            </span>
            {teachingSemesters.length === 0 ? (
              <span className="text-xs text-slate-400 italic">No teaching semesters assigned yet.</span>
            ) : (
              <div className="flex flex-wrap gap-2">
                {teachingSemesters.map((sem, idx) => (
                  <span
                    key={idx}
                    className="px-2.5 py-1 bg-sky-50 text-sky-700 border border-sky-200/80 rounded-lg text-xs font-bold"
                  >
                    {sem}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div>
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">
              Curriculum Subjects
            </span>
            {subjects.length === 0 ? (
              <span className="text-xs text-slate-400 italic">No course subjects mapped in timetable.</span>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {subjects.map((sub, idx) => (
                  <span
                    key={idx}
                    className="px-2.5 py-1 bg-slate-50 text-slate-700 border border-slate-200 rounded-lg text-xs font-medium"
                  >
                    {sub}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Teaching Load breakdown */}
          <div className="bg-slate-50/70 p-4 rounded-xl border border-slate-200/80">
            <div className="flex items-center justify-between text-xs font-bold text-slate-800 mb-2">
              <span>Teaching Load (Timetable Slots)</span>
              <span className="text-sky-700 font-mono text-sm">
                Total: {timetableSummary.total_slots} slots
              </span>
            </div>
            {Object.keys(timetableSummary.semester_wise || {}).length === 0 ? (
              <p className="text-[11px] text-slate-400 italic">0 slots in weekly timetable</p>
            ) : (
              <div className="space-y-1.5 text-xs text-slate-600">
                {Object.entries(timetableSummary.semester_wise).map(([semName, count]) => (
                  <div key={semName} className="flex items-center justify-between">
                    <span>{semName}</span>
                    <span className="font-mono font-semibold text-slate-800">{count} slots</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Workload Capacity & CIE Breakdown */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-sm space-y-4">
          <div className="border-b border-slate-100 pb-3">
            <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
              <Briefcase className="w-4 h-4 text-indigo-600" />
              <span>Workload Capacity & CIE Equity</span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Duty distribution and institutional capacity bounds
            </p>
          </div>

          <div>
            <div className="flex items-center justify-between text-xs font-semibold mb-1.5">
              <span className="text-slate-700">
                Assigned Load: {dutySummary.total_assigned} / {dutySummary.maximum_allowed}
              </span>
              <span className="text-slate-500 font-mono">Remaining: {dutySummary.remaining_capacity}</span>
            </div>
            <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-500 rounded-full ${
                  capacityPct >= 90
                    ? 'bg-rose-500'
                    : capacityPct >= 70
                    ? 'bg-amber-500'
                    : 'bg-sky-500'
                }`}
                style={{ width: `${capacityPct}%` }}
              ></div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 pt-2">
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 text-center">
              <span className="text-[10px] font-bold text-slate-400 uppercase">CIE-1</span>
              <div className="text-lg font-bold text-slate-900 mt-0.5 font-mono">
                {cieBreakdown.cie_1 || 0}
              </div>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 text-center">
              <span className="text-[10px] font-bold text-slate-400 uppercase">CIE-2</span>
              <div className="text-lg font-bold text-slate-900 mt-0.5 font-mono">
                {cieBreakdown.cie_2 || 0}
              </div>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 text-center">
              <span className="text-[10px] font-bold text-slate-400 uppercase">CIE-3</span>
              <div className="text-lg font-bold text-slate-900 mt-0.5 font-mono">
                {cieBreakdown.cie_3 || 0}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-1">
            <div className="p-2.5 rounded-xl bg-sky-50/60 border border-sky-100 flex items-center justify-between text-xs">
              <span className="font-medium text-sky-900">Invigilation Duties</span>
              <span className="font-bold text-sky-700 font-mono">
                {dutyTypeBreakdown.invigilation || 0}
              </span>
            </div>
            <div className="p-2.5 rounded-xl bg-indigo-50/60 border border-indigo-100 flex items-center justify-between text-xs">
              <span className="font-medium text-indigo-900">Squad Duties</span>
              <span className="font-bold text-indigo-700 font-mono">
                {dutyTypeBreakdown.squad || 0}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Semester-Aware Timetable Conflict Logic Banner */}
      <div className="p-4 rounded-2xl bg-gradient-to-r from-sky-50 via-slate-50 to-indigo-50 border border-sky-200/80 shadow-sm text-xs text-slate-700">
        <div className="flex items-center gap-2 font-bold text-slate-900 mb-1">
          <ShieldCheck className="w-4 h-4 text-sky-600" />
          <span>Semester-Aware Timetable Conflict Audit Rule</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2 text-[11px] leading-relaxed">
          <div className="p-2.5 bg-white rounded-xl border border-slate-200/80">
            <strong>When 5th & 7th Semesters write exams:</strong>
            <p className="text-slate-500 mt-0.5">
              3rd Semester remains in regular class session. The allocation engine strictly inspects this
              faculty's 3rd semester timetable with mandatory 1-hour pre/post lecture buffers.
            </p>
          </div>
          <div className="p-2.5 bg-white rounded-xl border border-slate-200/80">
            <strong>When 3rd Semester writes exams:</strong>
            <p className="text-slate-500 mt-0.5">
              5th & 7th Semesters remain in regular class session. The engine automatically inspects the 5th and
              7th semester timetables for lecture and buffer collisions.
            </p>
          </div>
        </div>
      </div>

      {/* Faculty Timetable Grid */}
      <div className="bg-white rounded-2xl border border-slate-200/90 p-6 shadow-sm">
        <div className="border-b border-slate-100 pb-3 mb-4 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-sm text-slate-900">Faculty Timetable</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Actual weekly timetable entries extracted from the departmental master schedule
            </p>
          </div>
          <span className="text-xs font-semibold px-2.5 py-1 bg-slate-100 rounded-lg text-slate-700">
            {timetableEntries.length} Scheduled Slots
          </span>
        </div>

        {timetableEntries.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-400 italic">
            No regular teaching timetable entries assigned to this staff member.
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(timetableBySemester).map(([semName, entries]) => (
              <div key={semName} className="space-y-2">
                <div className="text-xs font-bold text-sky-800 bg-sky-50/80 px-3 py-1.5 rounded-lg border border-sky-100 inline-block">
                  Semester: {semName}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-500 text-[10px] uppercase font-semibold">
                        <th className="py-2 px-3">Day</th>
                        <th className="py-2 px-3">Time Window</th>
                        <th className="py-2 px-3">Subject Code & Name</th>
                        <th className="py-2 px-3 font-mono text-center">Room / Lab</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {entries.map((item, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/50">
                          <td className="py-2.5 px-3 font-bold text-slate-800">{item.day}</td>
                          <td className="py-2.5 px-3 font-mono text-slate-700">
                            {item.start_time} - {item.end_time}
                          </td>
                          <td className="py-2.5 px-3 text-slate-900 font-medium">
                            <span className="font-bold text-slate-700 mr-2">{item.subject_code}</span>
                            <span>{item.subject_name}</span>
                          </td>
                          <td className="py-2.5 px-3 font-mono text-center font-semibold text-slate-600">
                            {item.room_number}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Upcoming Duties & Duty History */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Upcoming Duties */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-sm">
          <div className="border-b border-slate-100 pb-3 mb-4 flex items-center justify-between">
            <div>
              <h3 className="font-bold text-sm text-slate-900">Upcoming Duties</h3>
              <p className="text-xs text-slate-500 mt-0.5">Scheduled examination duties pending execution</p>
            </div>
            {upcomingDuties.length > 0 && (
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
                {upcomingDuties.length} {upcomingDuties.length === 1 ? 'Duty' : 'Duties'}
              </span>
            )}
          </div>

          {upcomingDuties.length === 0 ? (
            <div className="py-10 text-center text-xs text-slate-400 italic">
              No upcoming duties assigned.
            </div>
          ) : (
            <div className="space-y-2.5">
              {upcomingDuties.map((d) => (
                <div
                  key={d.id}
                  className="p-3.5 rounded-xl border border-slate-200/80 bg-slate-50/50 hover:bg-slate-50 transition-colors flex flex-col gap-1.5 text-xs"
                >
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {d.cie_name && (
                        <span className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-200 font-bold text-[10px] tracking-wide uppercase">
                          {d.cie_name}
                        </span>
                      )}
                      {(d.semester_name || d.sem_number) && (
                        <span className="px-2 py-0.5 rounded-md bg-purple-50 text-purple-700 border border-purple-200 font-bold text-[10px] tracking-wide">
                          {d.semester_name || `${d.sem_number}th Sem`}
                        </span>
                      )}
                      {d.duty_type && (
                        <span className={`px-2 py-0.5 rounded-md text-[10px] border ${
                          d.duty_type === 'Squad Duty'
                            ? 'bg-amber-50 text-amber-800 border-amber-200 font-semibold'
                            : 'bg-slate-100 text-slate-600 border-slate-200 font-medium'
                        }`}>
                          {d.duty_type}
                        </span>
                      )}
                    </div>
                    <Badge variant={d.status === 'COMPLETED' ? 'success' : (d.status === 'ASSIGNED' ? 'warning' : 'slate')}>
                      {d.status}
                    </Badge>
                  </div>

                  <div>
                    <div className="font-bold text-slate-800 text-xs">
                      {d.subject_code ? <span className="font-mono text-slate-600 mr-1.5 font-bold">{d.subject_code} -</span> : null}
                      <span>{d.subject_name || 'Subject'}</span>
                    </div>
                    <div className="text-[11px] text-slate-500 font-mono mt-1 flex items-center gap-2.5 flex-wrap">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-slate-400" />
                        {d.exam_date}
                      </span>
                      {(d.start_time || d.end_time) && (
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3 text-slate-400" />
                          {d.start_time}{d.end_time ? ` - ${d.end_time}` : ''}
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3 h-3 text-slate-400" />
                        Room {d.room_number || 'N/A'}
                      </span>
                      {d.student_count ? (
                        <span className="text-slate-400 font-sans">
                          ({d.student_count} std)
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Duty History */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-sm">
          <div className="border-b border-slate-100 pb-3 mb-4 flex items-center justify-between">
            <div>
              <h3 className="font-bold text-sm text-slate-900">Duty History</h3>
              <p className="text-xs text-slate-500 mt-0.5">Archived record of completed or cancelled duties</p>
            </div>
            {dutyHistory.length > 0 && (
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200">
                {dutyHistory.length} {dutyHistory.length === 1 ? 'Duty' : 'Duties'}
              </span>
            )}
          </div>

          {dutyHistory.length === 0 ? (
            <div className="py-10 text-center text-xs text-slate-400 italic">
              No duty history available.
            </div>
          ) : (
            <div className="space-y-2.5">
              {dutyHistory.map((d) => (
                <div
                  key={d.id}
                  className="p-3.5 rounded-xl border border-slate-200/80 bg-slate-50/50 hover:bg-slate-50 transition-colors flex flex-col gap-1.5 text-xs"
                >
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {d.cie_name && (
                        <span className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-200 font-bold text-[10px] tracking-wide uppercase">
                          {d.cie_name}
                        </span>
                      )}
                      {(d.semester_name || d.sem_number) && (
                        <span className="px-2 py-0.5 rounded-md bg-purple-50 text-purple-700 border border-purple-200 font-bold text-[10px] tracking-wide">
                          {d.semester_name || `${d.sem_number}th Sem`}
                        </span>
                      )}
                      {d.duty_type && (
                        <span className={`px-2 py-0.5 rounded-md text-[10px] border ${
                          d.duty_type === 'Squad Duty'
                            ? 'bg-amber-50 text-amber-800 border-amber-200 font-semibold'
                            : 'bg-slate-100 text-slate-600 border-slate-200 font-medium'
                        }`}>
                          {d.duty_type}
                        </span>
                      )}
                    </div>
                    <Badge variant={d.status === 'COMPLETED' ? 'success' : (d.status === 'ASSIGNED' ? 'warning' : 'slate')}>
                      {d.status}
                    </Badge>
                  </div>

                  <div>
                    <div className="font-bold text-slate-800 text-xs">
                      {d.subject_code ? <span className="font-mono text-slate-600 mr-1.5 font-bold">{d.subject_code} -</span> : null}
                      <span>{d.subject_name || 'Subject'}</span>
                    </div>
                    <div className="text-[11px] text-slate-500 font-mono mt-1 flex items-center gap-2.5 flex-wrap">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-slate-400" />
                        {d.exam_date}
                      </span>
                      {(d.start_time || d.end_time) && (
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3 text-slate-400" />
                          {d.start_time}{d.end_time ? ` - ${d.end_time}` : ''}
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3 h-3 text-slate-400" />
                        Room {d.room_number || 'N/A'}
                      </span>
                      {d.student_count ? (
                        <span className="text-slate-400 font-sans">
                          ({d.student_count} std)
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Edit Staff Member Modal */}
      <Modal isOpen={isEditModalOpen} onClose={() => setIsEditModalOpen(false)} title={`Edit Staff Member: ${editFormData.name}`}>
        <form onSubmit={handleSaveEdit} className="space-y-4 text-xs">
          {editFormError && (
            <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700">
              {editFormError}
            </div>
          )}

          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Faculty / Staff Full Name <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              value={editFormData.name}
              onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
              className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:ring-1 focus:ring-sky-500 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Employee ID <span className="text-slate-400 font-normal">(Optional)</span>
              </label>
              <input
                type="text"
                placeholder="Leave blank if not provided"
                value={editFormData.employee_id}
                onChange={(e) => setEditFormData({ ...editFormData, employee_id: e.target.value })}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 focus:ring-1 focus:ring-sky-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Designation <span className="text-slate-400 font-normal">(Optional)</span>
              </label>
              <input
                type="text"
                placeholder="e.g. Professor, Faculty, Assistant Professor"
                value={editFormData.designation}
                onChange={(e) => setEditFormData({ ...editFormData, designation: e.target.value })}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 focus:ring-1 focus:ring-sky-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Department</label>
              <input
                type="text"
                value={editFormData.department}
                onChange={(e) => setEditFormData({ ...editFormData, department: e.target.value })}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 focus:ring-1 focus:ring-sky-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Teaching Experience (Years) <span className="text-slate-400 font-normal">(Optional)</span>
              </label>
              <input
                type="number"
                step="0.5"
                min="0"
                placeholder="Leave blank if not provided"
                value={editFormData.experience_years}
                onChange={(e) => setEditFormData({ ...editFormData, experience_years: e.target.value })}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 focus:ring-1 focus:ring-sky-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Email (Optional)</label>
              <input
                type="email"
                placeholder="faculty@mcehassan.ac.in"
                value={editFormData.email}
                onChange={(e) => setEditFormData({ ...editFormData, email: e.target.value })}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 focus:ring-1 focus:ring-sky-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Phone (Optional)</label>
              <input
                type="text"
                placeholder="Phone number"
                value={editFormData.phone}
                onChange={(e) => setEditFormData({ ...editFormData, phone: e.target.value })}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 focus:ring-1 focus:ring-sky-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Max Duty Capacity Ceiling</label>
              <input
                type="number"
                min="1"
                max="50"
                value={editFormData.max_duty_capacity}
                onChange={(e) => setEditFormData({ ...editFormData, max_duty_capacity: e.target.value })}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 focus:ring-1 focus:ring-sky-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Skills / Notes (Optional)</label>
              <input
                type="text"
                placeholder="Comma separated skills"
                value={editFormData.skills}
                onChange={(e) => setEditFormData({ ...editFormData, skills: e.target.value })}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 focus:ring-1 focus:ring-sky-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Policy Toggles */}
          <div className="pt-2 border-t border-slate-100 space-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={editFormData.eligible_for_duty}
                onChange={(e) => setEditFormData({ ...editFormData, eligible_for_duty: e.target.checked })}
                className="rounded border-slate-300 text-sky-600 focus:ring-sky-500"
              />
              <span className="font-semibold text-slate-800">Eligible for CIE Examination Duty Allocation</span>
            </label>
            <p className="text-[10px] text-slate-400 pl-5">
              Uncheck this to exclude this faculty member from all automated examination duties.
            </p>

            <label className="flex items-center gap-2 cursor-pointer pt-1">
              <input
                type="checkbox"
                checked={editFormData.is_active}
                onChange={(e) => setEditFormData({ ...editFormData, is_active: e.target.checked })}
                className="rounded border-slate-300 text-sky-600 focus:ring-sky-500"
              />
              <span className="font-semibold text-slate-800">Active Faculty Member</span>
            </label>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setIsEditModalOpen(false)}
              className="px-4 py-2 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-semibold shadow-sm disabled:opacity-50"
            >
              {isSaving ? 'Saving Changes...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Record Leave Modal */}
      <Modal isOpen={isLeaveModalOpen} onClose={() => setIsLeaveModalOpen(false)} title="Record Official Leave / Unavailability">
        <form onSubmit={handleAddLeave} className="space-y-4 text-xs">
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Date *</label>
            <input
              type="date"
              required
              value={leaveDate}
              onChange={(e) => setLeaveDate(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Start Time</label>
              <input
                type="time"
                value={leaveStartTime}
                onChange={(e) => setLeaveStartTime(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-sky-500"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">End Time</label>
              <input
                type="time"
                value={leaveEndTime}
                onChange={(e) => setLeaveEndTime(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-sky-500"
              />
            </div>
          </div>
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Reason / Official Purpose</label>
            <input
              type="text"
              placeholder="e.g. Conference, Medical Leave, Academic Duty"
              value={leaveReason}
              onChange={(e) => setLeaveReason(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setIsLeaveModalOpen(false)}
              className="px-4 py-2 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg font-semibold"
            >
              Record Leave
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default StaffProfile;
