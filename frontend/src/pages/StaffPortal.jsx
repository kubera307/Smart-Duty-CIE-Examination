import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { facultyApi } from '../services/facultyApi';
import { allocationApi } from '../services/allocationApi';
import StatCard from '../components/common/StatCard';
import Badge from '../components/common/Badge';
import {
  GraduationCap,
  ClipboardList,
  CheckCircle2,
  Clock,
  ShieldCheck,
  Calendar,
  Check,
  Printer,
  LogOut,
  Users,
  Briefcase,
  Layers,
  BookOpen,
  ArrowRight,
  Plus,
  FileText
} from 'lucide-react';

const StaffPortal = () => {
  const navigate = useNavigate();
  const [currentStaff, setCurrentStaff] = useState(null);
  const [profileData, setProfileData] = useState(null);
  const [loading, setLoading] = useState(true);

  // Leave modal state
  const [isLeaveModalOpen, setIsLeaveModalOpen] = useState(false);
  const [leaveDate, setLeaveDate] = useState('');
  const [leaveStartTime, setLeaveStartTime] = useState('09:00');
  const [leaveEndTime, setLeaveEndTime] = useState('17:00');
  const [leaveReason, setLeaveReason] = useState('');

  // Active view tab
  const [activeTab, setActiveTab] = useState('upcoming'); // 'upcoming' | 'history' | 'timetable' | 'leave'

  useEffect(() => {
    const savedStaffStr = localStorage.getItem('logged_in_faculty');
    if (savedStaffStr) {
      try {
        const staff = JSON.parse(savedStaffStr);
        setCurrentStaff(staff);
        loadProfile(staff.id);
      } catch (err) {
        navigate('/login');
      }
    } else {
      navigate('/login');
    }
  }, []);

  const loadProfile = async (facultyId) => {
    setLoading(true);
    try {
      const res = await facultyApi.getProfile(facultyId);
      setProfileData(res.data);
    } catch (err) {
      console.error('Error loading staff profile:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('auth_role');
    localStorage.removeItem('auth_user');
    localStorage.removeItem('logged_in_faculty');
    navigate('/login');
  };

  const handleMarkCompleted = async (dutyId) => {
    try {
      await allocationApi.updateStatus(dutyId, 'COMPLETED');
      loadProfile(currentStaff.id);
    } catch (err) {
      alert('Failed to mark duty as completed');
    }
  };

  const handleAddLeave = async (e) => {
    e.preventDefault();
    try {
      await facultyApi.addUnavailability(currentStaff.id, {
        date: leaveDate,
        start_time: leaveStartTime,
        end_time: leaveEndTime,
        reason: leaveReason
      });
      setIsLeaveModalOpen(false);
      setLeaveDate('');
      setLeaveReason('');
      alert('Official leave recorded successfully');
      loadProfile(currentStaff.id);
    } catch (err) {
      alert('Failed to record leave');
    }
  };



  if (loading && !profileData) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-9 h-9 border-4 border-sky-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-xs text-slate-600 font-medium">Loading your faculty duty portal...</p>
        </div>
      </div>
    );
  }

  const f = profileData?.faculty || currentStaff || {};
  const dutySummary = profileData?.duty_summary || {
    total_assigned: 0,
    completed: 0,
    remaining: 0,
    completion_percentage: 0,
    maximum_allowed: 15,
    remaining_capacity: 15
  };
  const cieBreakdown = profileData?.cie_breakdown || { cie_1: 0, cie_2: 0, cie_3: 0 };
  const dutyTypeBreakdown = profileData?.duty_type_breakdown || { invigilation: 0, squad: 0 };
  const upcomingDuties = profileData?.upcoming_duties || [];
  const dutyHistory = profileData?.duty_history || [];
  const timetableEntries = profileData?.timetable || [];
  const historyByCie = dutyHistory.reduce((cieGroups, duty) => {
    const cieKey = duty.cie_name || 'CIE not specified';
    const semesterKey = duty.semester_name || (duty.sem_number ? `Semester ${duty.sem_number}` : 'Semester not specified');
    if (!cieGroups[cieKey]) cieGroups[cieKey] = {};
    if (!cieGroups[cieKey][semesterKey]) cieGroups[cieKey][semesterKey] = [];
    cieGroups[cieKey][semesterKey].push(duty);
    return cieGroups;
  }, {});

  const capacityPct = Math.min(
    100,
    Math.round((dutySummary.total_assigned / (dutySummary.maximum_allowed || 15)) * 100)
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans">
      {/* ========================================================================= */}
      {/* DEDICATED FACULTY PORTAL HEADER (Completely clean, NO admin sidebar) */}
      {/* ========================================================================= */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-sky-600 text-white flex items-center justify-center font-bold shadow-md shadow-sky-600/20">
              <GraduationCap className="w-6 h-6" />
            </div>
            <div>
              <div className="text-xs font-bold text-slate-900 leading-tight">
                Malnad College of Engineering, Hassan
              </div>
              <div className="text-[11px] text-slate-500 leading-tight mt-0.5">
                CSE (AI & ML) • Faculty Examination Duty Portal
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleLogout}
              className="text-xs text-slate-700 hover:text-rose-600 font-semibold px-3 py-1.5 rounded-lg border border-slate-200 hover:border-rose-200 hover:bg-rose-50 transition-all flex items-center gap-1.5"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Logout</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-8 space-y-6">
        {/* Faculty Welcome Card */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-6 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-sky-600 text-white flex items-center justify-center text-lg font-bold shadow-md shadow-sky-600/20">
              {f.name
                ? f.name
                    .split(' ')
                    .map((n) => n[0])
                    .filter((_, i) => i < 2)
                    .join('')
                : 'ST'}
            </div>

            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[11px] font-bold text-sky-600 uppercase tracking-wider">
                  FACULTY PROFILE
                </span>
                <span className="text-slate-300">•</span>
                <Badge variant={f.eligible_for_duty ? 'brand' : 'danger'}>
                  {f.eligible_for_duty ? 'Eligible for Duty' : 'Excluded from Duty'}
                </Badge>
              </div>
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900">{f.name}</h1>
              <p className="text-xs text-slate-500 mt-0.5">
                {f.designation || 'Faculty'} • Department of Computer Science & Engineering (AI & ML)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => window.print()}
              className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print Duty Slip</span>
            </button>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* 4 PROMINENT STAT CARDS: TOTAL DUTY, COMPLETED, REMAINING, PROGRESS */}
        {/* ========================================================================= */}
        <div>
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
            Examination Duty Summary
          </h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              title="Total Assigned Duties"
              value={dutySummary.total_assigned}
              subtitle="Duties allocated by system"
              icon={ClipboardList}
              color="sky"
            />
            <StatCard
              title="Completed Duties"
              value={dutySummary.completed}
              subtitle="Duties successfully finished"
              icon={CheckCircle2}
              color="emerald"
            />
            <StatCard
              title="Remaining Duties"
              value={dutySummary.remaining}
              subtitle="Upcoming duties to perform"
              icon={Clock}
              color="amber"
            />
            <StatCard
              title="Completion Rate"
              value={`${dutySummary.completion_percentage}%`}
              subtitle="Duty execution rate"
              icon={ShieldCheck}
              color="indigo"
            />
          </div>
        </div>

        {/* Workload Capacity Bar & Duty Breakdown */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Briefcase className="w-4 h-4 text-sky-600" />
                <h3 className="font-bold text-xs text-slate-800">Department Workload Capacity</h3>
              </div>
              <span className="text-xs font-mono font-bold text-slate-700">
                {dutySummary.total_assigned} / {dutySummary.maximum_allowed} Duties
              </span>
            </div>

            <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-500 rounded-full ${
                  capacityPct >= 90
                    ? 'bg-rose-500'
                    : capacityPct >= 70
                    ? 'bg-amber-500'
                    : 'bg-sky-500'
                }`}
                style={{ width: `${Math.max(5, capacityPct)}%` }}
              />
            </div>

            <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
              <span>Remaining Capacity: <strong>{dutySummary.remaining_capacity} duties</strong></span>
              <span>Capacity Utilized: <strong>{capacityPct}%</strong></span>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-sm space-y-3">
            <h3 className="font-bold text-xs text-slate-800 flex items-center gap-2">
              <Layers className="w-4 h-4 text-indigo-600" />
              <span>Duties by CIE & Duty Type</span>
            </h3>

            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div className="p-2 rounded-xl bg-slate-50 border border-slate-200/70">
                <span className="text-[10px] uppercase font-bold text-slate-400">CIE-1</span>
                <div className="text-base font-bold text-slate-900 font-mono mt-0.5">
                  {cieBreakdown.cie_1 || 0}
                </div>
              </div>
              <div className="p-2 rounded-xl bg-slate-50 border border-slate-200/70">
                <span className="text-[10px] uppercase font-bold text-slate-400">CIE-2</span>
                <div className="text-base font-bold text-slate-900 font-mono mt-0.5">
                  {cieBreakdown.cie_2 || 0}
                </div>
              </div>
              <div className="p-2 rounded-xl bg-slate-50 border border-slate-200/70">
                <span className="text-[10px] uppercase font-bold text-slate-400">CIE-3</span>
                <div className="text-base font-bold text-slate-900 font-mono mt-0.5">
                  {cieBreakdown.cie_3 || 0}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs pt-1">
              <div className="px-3 py-1.5 rounded-lg bg-sky-50 text-sky-900 border border-sky-100 flex items-center justify-between">
                <span>Invigilation:</span>
                <strong className="font-mono">{dutyTypeBreakdown.invigilation || 0}</strong>
              </div>
              <div className="px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-900 border border-indigo-100 flex items-center justify-between">
                <span>Squad Duty:</span>
                <strong className="font-mono">{dutyTypeBreakdown.squad || 0}</strong>
              </div>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-2 border-b border-slate-200/90 pb-2 flex-wrap">
          <button
            onClick={() => setActiveTab('upcoming')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
              activeTab === 'upcoming'
                ? 'bg-sky-600 text-white shadow-sm'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200/80'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>My Upcoming Duties ({upcomingDuties.length})</span>
          </button>



          <button
            onClick={() => setActiveTab('history')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
              activeTab === 'history'
                ? 'bg-sky-600 text-white shadow-sm'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200/80'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>My Duty History ({dutyHistory.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('timetable')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
              activeTab === 'timetable'
                ? 'bg-sky-600 text-white shadow-sm'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200/80'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>My Teaching Timetable ({timetableEntries.length} Slots)</span>
          </button>

          <button
            onClick={() => setActiveTab('leave')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
              activeTab === 'leave'
                ? 'bg-sky-600 text-white shadow-sm'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200/80'
            }`}
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Record Leave / Unavailability</span>
          </button>
        </div>

        {/* TAB 1: UPCOMING DUTIES */}
        {activeTab === 'upcoming' && (
          <div className="bg-white rounded-2xl border border-slate-200/90 p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-bold text-sm text-slate-900">Scheduled Examination Duties</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Your upcoming exam invigilation and squad assignments
                </p>
              </div>
              <span className="text-xs font-bold px-2.5 py-1 bg-amber-50 border border-amber-200 text-amber-800 rounded-lg">
                {dutySummary.remaining} Duties Remaining
              </span>
            </div>


            {upcomingDuties.length === 0 ? (
              <div className="py-16 text-center text-slate-400 space-y-2">
                <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto opacity-70" />
                <div className="text-sm font-bold text-slate-700">No Upcoming Duties Pending</div>
                <p className="text-xs text-slate-400 max-w-sm mx-auto">
                  You currently have no pending exam duties.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-[10px] uppercase font-bold text-slate-600">
                      <th className="py-3 px-3">Date</th>
                      <th className="py-3 px-3">Time Window</th>
                      <th className="py-3 px-3">CIE & Semester</th>
                      <th className="py-3 px-3">Course Code & Subject</th>
                      <th className="py-3 px-3 text-center">Room</th>
                      <th className="py-3 px-3 text-center">Students</th>
                      <th className="py-3 px-3">Duty Type</th>
                      <th className="py-3 px-3 text-center">Attendance</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {upcomingDuties.map((d) => (
                      <tr key={d.id} className="hover:bg-slate-50/60 transition-colors">
                        <td className="py-3 px-3 font-semibold text-slate-900">
                          {d.exam_date}
                        </td>
                        <td className="py-3 px-3 font-mono text-slate-700">
                          {d.start_time} - {d.end_time}
                        </td>
                        <td className="py-3 px-3 text-slate-700 font-medium">
                          <div className="flex flex-col gap-1 items-start">
                            {d.cie_name && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200 uppercase tracking-wide">
                                {d.cie_name}
                              </span>
                            )}
                            <span className="text-xs font-semibold text-slate-800">
                              {d.semester_name || (d.sem_number ? `${d.sem_number}th Sem` : 'Academic Class')}
                            </span>
                          </div>
                        </td>
                        <td className="py-3 px-3">
                          <strong className="text-slate-900 mr-1.5">{d.subject_code}</strong>
                          <span className="text-slate-600">{d.subject_name}</span>
                        </td>
                        <td className="py-3 px-3 text-center font-bold text-slate-900 font-mono">
                          {d.room_number || 'AI301'}
                        </td>
                        <td className="py-3 px-3 text-center font-mono text-slate-700">
                          {d.student_range ? (
                            <span className="px-2 py-0.5 rounded bg-slate-100 font-semibold text-slate-800 text-[11px]">
                              {d.student_range} {d.student_count ? `(${d.student_count})` : ''}
                            </span>
                          ) : (
                            <span className="text-slate-400 text-[11px]">-</span>
                          )}
                        </td>
                        <td className="py-3 px-3">
                          <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-sky-50 text-sky-800 border border-sky-200">
                            {d.duty_type || 'Invigilation'}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-center">
                          {d.attendance_status === 'PRESENT' || d.attendance_status === 'REPORTED' ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 inline-flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                              <span>Reported</span>
                            </span>
                          ) : d.attendance_status === 'LATE' ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300 inline-flex items-center gap-1">
                              <span>Late</span>
                            </span>
                          ) : d.attendance_status === 'ABSENT' ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-300 inline-flex items-center gap-1">
                              <span>Absent</span>
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-600 border border-slate-200">
                              Pending
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <button
                            onClick={() => handleMarkCompleted(d.id)}
                            className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[11px] font-semibold inline-flex items-center gap-1 shadow-sm transition-colors"
                            title="Mark duty completed"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>Done</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}


        {/* TAB 2: DUTY HISTORY */}
        {activeTab === 'history' && (
          <div className="bg-white rounded-2xl border border-slate-200/90 p-6 shadow-sm space-y-4">
            <div className="border-b border-slate-100 pb-3">
              <h3 className="font-bold text-sm text-slate-900">Completed & Executed Duties</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Historical record of your completed exam duties
              </p>
            </div>

            {dutyHistory.length === 0 ? (
              <div className="py-16 text-center text-xs text-slate-400 italic">
                No completed duties recorded in your history yet.
              </div>
            ) : (
              <div className="space-y-5">
                {Object.entries(historyByCie).map(([cieName, semesters]) => (
                  <section key={cieName} className="rounded-xl border border-slate-200 overflow-hidden">
                    <div className="flex items-center justify-between gap-3 px-4 py-3 bg-sky-50 border-b border-sky-100">
                      <div>
                        <p className="text-[10px] uppercase tracking-wider font-bold text-sky-600">Examination Cycle</p>
                        <h4 className="text-sm font-bold text-slate-900">{cieName}</h4>
                      </div>
                      <span className="text-[11px] font-semibold text-sky-800 bg-white border border-sky-200 rounded-lg px-2.5 py-1">
                        {Object.values(semesters).reduce((total, duties) => total + duties.length, 0)} duties
                      </span>
                    </div>
                    <div className="divide-y divide-slate-100">
                      {Object.entries(semesters).map(([semesterName, duties]) => (
                        <div key={semesterName}>
                          <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50">
                            <span className="text-xs font-bold text-slate-700">{semesterName}</span>
                            <span className="text-[11px] text-slate-500">{duties.length} completed {duties.length === 1 ? 'duty' : 'duties'}</span>
                          </div>
                          <div className="overflow-x-auto">
                            <table className="w-full text-left text-xs border-collapse">
                              <thead>
                                <tr className="border-b border-slate-100 text-[10px] uppercase font-bold text-slate-500">
                                  <th className="py-2.5 px-3">Date</th>
                                  <th className="py-2.5 px-3">Time</th>
                                  <th className="py-2.5 px-3">Course</th>
                                  <th className="py-2.5 px-3 text-center">Room</th>
                                  <th className="py-2.5 px-3 text-center">Students</th>
                                  <th className="py-2.5 px-3">Duty Type</th>
                                  <th className="py-2.5 px-3 text-center">Status</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {duties.map((d) => (
                                  <tr key={d.id} className="hover:bg-slate-50/60">
                        <td className="py-3 px-3 font-semibold text-slate-900">{d.exam_date}</td>
                        <td className="py-3 px-3 font-mono text-slate-700">{d.start_time} - {d.end_time}</td>
                        <td className="py-3 px-3">
                          <strong className="text-slate-900 mr-1.5">{d.subject_code}</strong>
                          <span className="text-slate-600">{d.subject_name}</span>
                        </td>
                        <td className="py-3 px-3 text-center font-mono font-bold text-slate-800">{d.room_number || 'AI301'}</td>
                        <td className="py-3 px-3 text-center font-mono text-slate-700">
                          {d.student_range ? (
                            <span className="px-2 py-0.5 rounded bg-slate-100 font-semibold text-slate-800 text-[11px]">
                              {d.student_range} {d.student_count ? `(${d.student_count})` : ''}
                            </span>
                          ) : (
                            <span className="text-slate-400 text-[11px]">-</span>
                          )}
                        </td>
                        <td className="py-3 px-3">
                          <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-700">
                            {d.duty_type || 'Invigilation'}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-center">
                          <Badge variant="success">{d.status}</Badge>
                        </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: TIMETABLE */}
        {activeTab === 'timetable' && (
          <div className="bg-white rounded-2xl border border-slate-200/90 p-6 shadow-sm space-y-4">
            <div className="border-b border-slate-100 pb-3">
              <h3 className="font-bold text-sm text-slate-900">My Teaching Timetable</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Your regular teaching timetable. The system protects these lectures with 1-hour buffers.
              </p>
            </div>

            {timetableEntries.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-400 italic">
                No regular timetable entries mapped to your profile.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-[10px] uppercase font-bold text-slate-600">
                      <th className="py-2.5 px-3">Day</th>
                      <th className="py-2.5 px-3">Time Window</th>
                      <th className="py-2.5 px-3">Semester</th>
                      <th className="py-2.5 px-3">Course Code & Subject</th>
                      <th className="py-2.5 px-3 font-mono text-center">Classroom</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {timetableEntries.map((item, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/50">
                        <td className="py-2.5 px-3 font-bold text-slate-800">{item.day}</td>
                        <td className="py-2.5 px-3 font-mono text-slate-700">{item.start_time} - {item.end_time}</td>
                        <td className="py-2.5 px-3 text-slate-700 font-medium">{item.semester_name}</td>
                        <td className="py-2.5 px-3 text-slate-900 font-medium">
                          <strong className="text-slate-800 mr-2">{item.subject_code}</strong>
                          <span>{item.subject_name}</span>
                        </td>
                        <td className="py-2.5 px-3 font-mono text-center font-semibold text-slate-700">
                          {item.room_number}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* TAB 4: LEAVE */}
        {activeTab === 'leave' && (
          <div className="bg-white rounded-2xl border border-slate-200/90 p-6 shadow-sm space-y-4">
            <div className="border-b border-slate-100 pb-3">
              <h3 className="font-bold text-sm text-slate-900">Record Leave / Unavailability</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Notify the system about planned leave so you are not scheduled for duties
              </p>
            </div>

            <form onSubmit={handleAddLeave} className="max-w-xl space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Leave Date *</label>
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
                <label className="block font-semibold text-slate-700 mb-1">Reason</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Conference, Medical Leave, Academic Duty"
                  value={leaveReason}
                  onChange={(e) => setLeaveReason(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-sky-500"
                />
              </div>

              <button
                type="submit"
                className="px-5 py-2.5 bg-sky-600 hover:bg-sky-700 text-white rounded-xl font-bold shadow-sm"
              >
                Submit Leave Record
              </button>
            </form>
          </div>
        )}
      </main>

    </div>
  );
};

export default StaffPortal;
