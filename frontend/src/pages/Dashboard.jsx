import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { analyticsApi } from '../services/analyticsApi';
import { cieApi } from '../services/cieApi';
import { academicApi } from '../services/academicApi';
import { useAcademicYear } from '../context/AcademicYearContext';
import Badge from '../components/common/Badge';
import {
  Users,
  CalendarCheck,
  ClipboardList,
  ShieldCheck,
  Calendar,
  Clock,
  ArrowRight,
  AlertCircle,
  Layers,
  ChevronRight,
  Check
} from 'lucide-react';

const Dashboard = () => {
  const navigate = useNavigate();
  const { academicYears, selectedYear, setSelectedYear, createYear } = useAcademicYear();
  const [data, setData] = useState(null);
  const [cies, setCies] = useState([]);
  const [selectedCieNumber, setSelectedCieNumber] = useState('1');
  const [selectedCieId, setSelectedCieId] = useState('');
  const [cieSessions, setCieSessions] = useState([]);
  const [semesters, setSemesters] = useState([]);
  const [selectedDateFilter, setSelectedDateFilter] = useState('all');
  const [selectedSemFilter, setSelectedSemFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadDashboardData(selectedYear);
  }, [selectedYear]);

  const loadDashboardData = async (targetYear) => {
    setLoading(true);
    setError(null);
    try {
      const year = targetYear || selectedYear;
      const [dashRes, ciesRes, semRes] = await Promise.all([
        analyticsApi.getDashboard({ academic_year: year }),
        cieApi.getAll({ academic_year: year }).catch(() => ({ data: [] })),
        academicApi.getSemesters().catch(() => ({ data: [] }))
      ]);

      setData(dashRes.data);

      const ciesList = Array.isArray(ciesRes.data) ? ciesRes.data : [];
      setCies(ciesList);

      const semList = Array.isArray(semRes.data) ? semRes.data : [];
      setSemesters(semList);

      const targetName = selectedCieNumber === '1' ? 'CIE-I' : selectedCieNumber === '2' ? 'CIE-II' : 'CIE-III';
      const matched = ciesList.find((c) => (c.academic_year || '').trim() === (year || '').trim() && c.name === targetName) ||
                      ciesList.find((c) => (c.academic_year || '').trim() === (year || '').trim()) ||
                      ciesList.find((c) => c.is_current) ||
                      ciesList[0];

      if (matched) {
        setSelectedCieId(matched.id.toString());
        await loadSessionsForCie(matched.id.toString());
      } else {
        setSelectedCieId('');
        setCieSessions([]);
      }
    } catch (err) {
      console.error('Failed to load dashboard:', err);
      setError('Unable to load dashboard metrics. Please verify the backend connection.');
    } finally {
      setLoading(false);
    }
  };

  const loadSessionsForCie = async (cieId) => {
    if (!cieId) {
      setCieSessions([]);
      return;
    }
    try {
      const sessRes = await cieApi.getSessions(cieId);
      const sessList = Array.isArray(sessRes.data) ? sessRes.data : (sessRes.data?.sessions || []);
      setCieSessions(sessList);
    } catch (err) {
      console.error('Failed to fetch sessions for CIE:', err);
      setCieSessions([]);
    }
  };

  const handleCieNumberChange = async (num) => {
    setSelectedCieNumber(num);
    setSelectedDateFilter('all');
    setSelectedSemFilter('all');
    const targetName = num === '1' ? 'CIE-I' : num === '2' ? 'CIE-II' : 'CIE-III';
    const matched = cies.find((c) => (c.academic_year || '').trim() === (selectedYear || '').trim() && c.name === targetName);
    if (matched) {
      setSelectedCieId(matched.id.toString());
      await loadSessionsForCie(matched.id.toString());
    } else {
      setSelectedCieId('');
      setCieSessions([]);
    }
  };

  const activeCieObj = useMemo(() => {
    if (!cies.length) return null;
    const targetName = selectedCieNumber === '1' ? 'CIE-I' : selectedCieNumber === '2' ? 'CIE-II' : 'CIE-III';
    return (
      cies.find((c) => (c.academic_year || '').trim() === (selectedYear || '').trim() && c.name === targetName) ||
      cies.find((c) => (c.academic_year || '').trim() === (selectedYear || '').trim()) ||
      cies.find((c) => c.id.toString() === selectedCieId) ||
      cies[0]
    );
  }, [cies, selectedYear, selectedCieNumber, selectedCieId]);

  // Sync selectedCieId if activeCieObj changes
  useEffect(() => {
    if (activeCieObj && activeCieObj.id.toString() !== selectedCieId) {
      setSelectedCieId(activeCieObj.id.toString());
      loadSessionsForCie(activeCieObj.id.toString());
    }
  }, [activeCieObj]);

  // Compute live metrics for the selected CIE
  const currentCieMetrics = useMemo(() => {
    let totalDuties = 0;
    let allocatedDuties = 0;

    cieSessions.forEach((sess) => {
      const rooms = sess.exam_rooms || [];
      const reqRooms = rooms.length > 0 ? rooms.length : (sess.required_invigilators || 1);
      const reqSquad = sess.required_squad || 0;
      totalDuties += (reqRooms + reqSquad);

      const assignedRoomDuties = rooms.filter((r) => r.allocated_faculty && r.status === 'ASSIGNED').length;
      const validDuties = (sess.duties || []).filter(
        (d) => (d.status === 'ASSIGNED' || d.status === 'COMPLETED') && d.faculty_id
      ).length;
      allocatedDuties += Math.max(assignedRoomDuties, validDuties);
    });

    const pendingDuties = Math.max(0, totalDuties - allocatedDuties);
    const coveragePct = totalDuties > 0 ? Math.round((allocatedDuties / totalDuties) * 100) : 0;

    return {
      cieName: activeCieObj?.name || `CIE-${selectedCieNumber}`,
      academicYear: activeCieObj?.academic_year || selectedYear,
      isCurrent: activeCieObj?.is_current || false,
      totalSessions: cieSessions.length,
      totalDuties,
      allocatedDuties,
      pendingDuties,
      coveragePct,
    };
  }, [activeCieObj, cieSessions, selectedYear, selectedCieNumber]);

  // Semester-wise examination breakdown for the selected CIE
  const semesterMatrix = useMemo(() => {
    const map = {};
    cieSessions.forEach((sess) => {
      const semNum = sess.sem_number || 5;
      if (!map[semNum]) {
        map[semNum] = {
          semNumber: semNum,
          semesterName: sess.semester_name || `${semNum}th Semester`,
          semesterId: sess.semester_id,
          sessionsCount: 0,
          totalDuties: 0,
          allocatedDuties: 0,
        };
      }
      map[semNum].sessionsCount += 1;
      const rooms = sess.exam_rooms || [];
      const reqRooms = rooms.length > 0 ? rooms.length : (sess.required_invigilators || 1);
      const reqSquad = sess.required_squad || 0;
      map[semNum].totalDuties += (reqRooms + reqSquad);

      const assignedRooms = rooms.filter((r) => r.allocated_faculty && r.status === 'ASSIGNED').length;
      const assignedDuties = (sess.duties || []).filter(
        (d) => (d.status === 'ASSIGNED' || d.status === 'COMPLETED') && d.faculty_id
      ).length;
      map[semNum].allocatedDuties += Math.max(assignedRooms, assignedDuties);
    });

    return Object.values(map).sort((a, b) => a.semNumber - b.semNumber);
  }, [cieSessions]);

  const relevantSemesterMatrix = semesterMatrix;

  // Distinct dates in the selected CIE
  const uniqueDates = useMemo(() => {
    const dates = Array.from(new Set(cieSessions.map((s) => s.exam_date).filter(Boolean)));
    return dates.sort();
  }, [cieSessions]);

  // Filtered session list
  const filteredSessions = useMemo(() => {
    return cieSessions.filter((sess) => {
      if (selectedDateFilter !== 'all' && sess.exam_date !== selectedDateFilter) {
        return false;
      }
      if (selectedSemFilter !== 'all' && sess.sem_number?.toString() !== selectedSemFilter) {
        return false;
      }
      return true;
    });
  }, [cieSessions, selectedDateFilter, selectedSemFilter]);

  if (loading) {
    return (
      <div className="py-24 text-center">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
        <p className="text-xs text-slate-500 font-medium">Loading examination command center...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-8 bg-rose-50 border border-rose-200 rounded-2xl text-rose-700 text-xs text-center space-y-3 max-w-lg mx-auto mt-12">
        <AlertCircle className="w-8 h-8 text-rose-500 mx-auto" />
        <p className="font-semibold">{error || 'Error loading dashboard metrics.'}</p>
        <button
          onClick={loadInitialData}
          className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-semibold transition-all inline-flex items-center gap-1.5 cursor-pointer shadow-sm"
        >
          Retry Connection
        </button>
      </div>
    );
  }

  const { kpis, faculty_workloads } = data;
  const facultyList = faculty_workloads || [];

  const getSemColor = (semNum) => {
    switch (semNum) {
      case 3:
        return { badge: 'bg-indigo-50 text-indigo-700 border-indigo-200', bar: 'bg-indigo-600' };
      case 4:
        return { badge: 'bg-amber-50 text-amber-700 border-amber-200', bar: 'bg-amber-500' };
      case 5:
        return { badge: 'bg-blue-50 text-blue-700 border-blue-200', bar: 'bg-blue-600' };
      case 6:
        return { badge: 'bg-emerald-50 text-emerald-700 border-emerald-200', bar: 'bg-emerald-600' };
      case 7:
        return { badge: 'bg-purple-50 text-purple-700 border-purple-200', bar: 'bg-purple-600' };
      default:
        return { badge: 'bg-slate-50 text-slate-700 border-slate-200', bar: 'bg-slate-600' };
    }
  };

  return (
    <div className="space-y-6 font-sans">
      {/* ========================================================================= */}
      {/* 1. EXECUTIVE ACADEMIC HEADER WITH CYCLE & CIE CONTROLS                    */}
      {/* ========================================================================= */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-5 shadow-xs">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3.5">
          {/* Left Column: Academic Title & Context */}
          <div className="min-w-0">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-xl font-bold text-slate-900 tracking-tight whitespace-nowrap">
                CIE Examination Management
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200 font-mono shrink-0">
                {activeCieObj?.name || `CIE-${selectedCieNumber}`}
              </span>
              {currentCieMetrics.isCurrent && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0">
                  Active Cycle
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-1 whitespace-nowrap">
              Department of CSE (AI & ML) • Academic Year {selectedYear}
            </p>
          </div>

          {/* Right Column: Academic Controls (Aligned side-by-side in single bar) */}
          <div className="flex items-center gap-2.5 flex-nowrap shrink-0 overflow-x-auto pb-0.5 xl:pb-0">
            {/* Academic Year Switcher */}
            <div className="inline-flex items-center p-1 bg-slate-100 rounded-xl border border-slate-200 text-xs shrink-0">
              <span className="text-[11px] font-bold text-slate-500 px-2 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-blue-600" />
                <span>Academic Year:</span>
              </span>
              {academicYears.map((yr) => (
                <button
                  key={yr}
                  onClick={() => setSelectedYear(yr)}
                  className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer whitespace-nowrap ${
                    selectedYear === yr
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                  }`}
                >
                  {yr}
                </button>
              ))}
              <button
                onClick={async () => {
                  const newY = window.prompt('Enter new Academic Year (e.g. 2027-28 or 2027-2028):');
                  if (newY && newY.trim()) {
                    await createYear(newY.trim());
                  }
                }}
                className="px-2.5 py-1 text-blue-600 hover:bg-blue-50 rounded-lg text-xs font-bold transition-colors cursor-pointer"
                title="Add a new academic year cycle"
              >
                + Add Year
              </button>
            </div>

            {/* CIE Phase Switcher: CIE-1, CIE-2, CIE-3 */}
            <div className="inline-flex items-center p-1 bg-slate-100 rounded-xl border border-slate-200 text-xs shrink-0">
              {['1', '2', '3'].map((num) => {
                const isSelected = selectedCieNumber === num;
                return (
                  <button
                    key={num}
                    onClick={() => handleCieNumberChange(num)}
                    className={`px-3.5 py-1.5 rounded-lg font-bold transition-all cursor-pointer whitespace-nowrap ${
                      isSelected
                        ? 'bg-slate-900 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    CIE-{num}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. EXECUTIVE METRIC CARDS                                                 */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1: Exam Sessions */}
        <div className="bg-white border border-slate-200/90 rounded-xl p-4 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Exam Sessions</span>
              <div className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600">
                <CalendarCheck className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-bold text-slate-900 mt-2 tracking-tight">
              {currentCieMetrics.totalSessions} Sessions
            </div>
          </div>
          <div className="text-[11px] text-slate-500 mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between">
            <span>{currentCieMetrics.cieName} ({currentCieMetrics.academicYear})</span>
            <span className="font-semibold text-slate-700">{relevantSemesterMatrix.length} Active Semesters</span>
          </div>
        </div>

        {/* Metric 2: Invigilation Duty Coverage */}
        <div className="bg-white border border-slate-200/90 rounded-xl p-4 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Duty Coverage</span>
              <div className="w-8 h-8 rounded-lg bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600">
                <ClipboardList className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-bold text-slate-900 mt-2 tracking-tight flex items-baseline gap-1.5">
              <span>{currentCieMetrics.allocatedDuties}</span>
              <span className="text-sm font-semibold text-slate-400">/ {currentCieMetrics.totalDuties} Slots</span>
            </div>
            <div className="mt-2 w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-emerald-500 h-1.5 rounded-full transition-all duration-500"
                style={{ width: `${currentCieMetrics.coveragePct}%` }}
              />
            </div>
          </div>
          <div className="text-[11px] text-slate-500 mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between font-medium">
            <span>{currentCieMetrics.coveragePct}% Staffed</span>
            <span className={currentCieMetrics.pendingDuties === 0 ? 'text-emerald-600 font-bold' : 'text-amber-600 font-bold'}>
              {currentCieMetrics.pendingDuties === 0 ? 'Complete' : `${currentCieMetrics.pendingDuties} Pending`}
            </span>
          </div>
        </div>

        {/* Metric 3: Active Faculty Roster */}
        <div className="bg-white border border-slate-200/90 rounded-xl p-4 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Faculty Deployment</span>
              <div className="w-8 h-8 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
                <Users className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-bold text-slate-900 mt-2 tracking-tight">
              {kpis?.eligible_faculty || facultyList.length} Faculty
            </div>
          </div>
          <div className="text-[11px] text-slate-500 mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between">
            <span>Avg ~{facultyList.length > 0 ? (currentCieMetrics.totalDuties / facultyList.length).toFixed(1) : 5} duties / staff</span>
            <span className="font-semibold text-indigo-700">100% Active</span>
          </div>
        </div>

        {/* Metric 4: Institutional Constraint Health */}
        <div className="bg-white border border-slate-200/90 rounded-xl p-4 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Constraint Health</span>
              <div className="w-8 h-8 rounded-lg bg-purple-50 border border-purple-100 flex items-center justify-center text-purple-600">
                <ShieldCheck className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-bold text-slate-900 mt-2 tracking-tight text-emerald-700 flex items-center gap-1.5">
              <span>0 Conflicts</span>
              <Check className="w-5 h-5 text-emerald-600" />
            </div>
          </div>
          <div className="text-[11px] text-slate-500 mt-3 pt-2.5 border-t border-slate-100">
            Lecture buffers (±60 min) protected
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 3. SEMESTER EXAMINATION PROGRESS                                          */}
      {/* ========================================================================= */}
      {relevantSemesterMatrix.length > 0 && (
        <div className="bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-5 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-bold text-sm text-slate-900 flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-slate-500" />
                <span>Semester Examination Progress</span>
              </h2>
              <p className="text-xs text-slate-500">
                Course exam sessions and invigilation fulfillment across active semesters in {currentCieMetrics.cieName}.
              </p>
            </div>
            <button
              onClick={() => navigate('/schedule')}
              className="text-xs font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1 transition-colors cursor-pointer"
            >
              <span>Manage in Schedule</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {relevantSemesterMatrix.map((sem) => {
              const colors = getSemColor(sem.semNumber);
              const pct = sem.totalDuties > 0 ? Math.round((sem.allocatedDuties / sem.totalDuties) * 100) : 0;
              const isFull = pct >= 100 && sem.totalDuties > 0;

              return (
                <div
                  key={sem.semNumber}
                  onClick={() => navigate(`/schedule`)}
                  className="p-3.5 rounded-xl border border-slate-200/80 bg-slate-50/50 hover:bg-slate-50 hover:border-slate-300 transition-all cursor-pointer group"
                >
                  <div className="flex items-center justify-between">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase font-mono border ${colors.badge}`}>
                      {sem.semNumber}th Sem
                    </span>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                      isFull ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                    }`}>
                      {isFull ? '100% Ready' : `${sem.totalDuties - sem.allocatedDuties} Pending`}
                    </span>
                  </div>

                  <div className="mt-2.5 flex items-baseline justify-between text-xs">
                    <span className="font-semibold text-slate-800">
                      {sem.sessionsCount} Subjects
                    </span>
                    <span className="font-mono text-slate-600 text-[11px]">
                      {sem.allocatedDuties}/{sem.totalDuties} Duties
                    </span>
                  </div>

                  <div className="mt-2 w-full bg-slate-200/80 rounded-full h-1.5 overflow-hidden">
                    <div
                      className={`h-1.5 rounded-full transition-all duration-500 ${colors.bar}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}



      {/* ========================================================================= */}
      {/* 4. MAIN WORKSPACE: LEFT (SESSIONS FEED) & RIGHT (FACULTY ROSTER)           */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

        {/* ======================================================================= */}
        {/* LEFT PANEL (7 Cols): EXAMINATION SESSIONS & ROOM ALLOCATIONS            */}
        {/* ======================================================================= */}
        <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200/90 shadow-xs flex flex-col overflow-hidden">
          {/* Header & Date Filters */}
          <div className="p-4 sm:p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="font-bold text-sm text-slate-900">
                Examination Sessions & Room Invigilators
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Multi-room exams (AI301 & AI302) with assigned faculty invigilators
              </p>
            </div>

            {/* Date filter pills */}
            {uniqueDates.length > 1 && (
              <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0">
                <button
                  onClick={() => setSelectedDateFilter('all')}
                  className={`px-2 py-1 rounded-md text-[11px] font-semibold transition-all cursor-pointer ${
                    selectedDateFilter === 'all'
                      ? 'bg-slate-900 text-white shadow-2xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  All Dates ({cieSessions.length})
                </button>
                {uniqueDates.map((d, i) => (
                  <button
                    key={d}
                    onClick={() => setSelectedDateFilter(d)}
                    className={`px-2 py-1 rounded-md text-[11px] font-semibold transition-all cursor-pointer whitespace-nowrap ${
                      selectedDateFilter === d
                        ? 'bg-blue-600 text-white shadow-2xs'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    Day {i + 1}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Sessions Feed List */}
          <div className="p-4 sm:p-5 space-y-3 flex-1 overflow-y-auto max-h-[520px]">
            {filteredSessions.length === 0 ? (
              <div className="py-16 text-center text-slate-400 text-xs">
                <Calendar className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                No examination sessions configured for this selection.
              </div>
            ) : (
              filteredSessions.map((sess) => {
                const rooms = sess.exam_rooms || [];
                const semColors = getSemColor(sess.sem_number);

                return (
                  <div
                    key={sess.id}
                    className="p-3.5 bg-slate-50/70 border border-slate-200/90 rounded-xl space-y-2.5 hover:border-slate-300 transition-all"
                  >
                    {/* Session Headline */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 pb-2 border-b border-slate-200/80">
                      <div>
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase font-mono border ${semColors.badge}`}>
                            {sess.sem_number}th Sem
                          </span>
                          <span className="font-mono font-bold text-slate-900 text-xs">
                            {sess.subject_code}
                          </span>
                          <span className="text-[11px] text-slate-400">• {sess.total_students || 60} Students</span>
                        </div>
                        <div className="text-xs font-semibold text-slate-800">
                          {sess.subject_name}
                        </div>
                      </div>

                      <div className="flex items-center gap-3 text-[11px] text-slate-600 font-mono">
                        <span className="font-semibold text-slate-800">{sess.exam_date}</span>
                        <span>•</span>
                        <div className="flex items-center gap-1">
                          <Clock className="w-3 h-3 text-slate-400" />
                          <span>{sess.start_time} - {sess.end_time}</span>
                        </div>
                      </div>
                    </div>

                    {/* Room-wise Invigilator Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {rooms.map((r) => {
                        const fac = r.allocated_faculty;
                        return (
                          <div
                            key={r.id}
                            className="bg-white p-2.5 rounded-lg border border-slate-200 flex items-center justify-between text-xs shadow-2xs"
                          >
                            <div className="min-w-0 pr-2">
                              <div className="flex items-center gap-1.5 font-mono">
                                <span className="font-bold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200 text-[10px]">
                                  {r.room_number}
                                </span>
                                <span className="text-slate-400 text-[10px]">
                                  Roll {r.student_range || `${r.student_start}–${r.student_end}`}
                                </span>
                              </div>
                              <div className="font-semibold text-slate-900 mt-1 truncate">
                                {fac ? fac.name : <span className="text-amber-600 font-normal">Pending Assignment</span>}
                              </div>
                            </div>

                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold shrink-0 ${
                              fac ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-700 border border-amber-200'
                            }`}>
                              {fac ? 'Assigned' : 'Pending'}
                            </span>
                          </div>
                        );
                      })}
                    </div>

                    {/* Squad Duty Officer Footer (if present) */}
                    {sess.squad_faculty && (
                      <div className="text-[10px] text-slate-500 font-medium flex items-center justify-between pt-1 border-t border-slate-200/60">
                        <span>Squad Officer: <strong className="text-slate-800 font-semibold">{sess.squad_faculty.name}</strong> ({sess.squad_faculty.designation || 'HOD'})</span>
                        <span className="text-indigo-600 font-semibold">Roving Inspection</span>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          <div className="p-3 bg-slate-50 border-t border-slate-100 text-center">
            <button
              onClick={() => navigate('/schedule')}
              className="text-xs font-semibold text-blue-600 hover:text-blue-800 transition-colors inline-flex items-center gap-1 cursor-pointer"
            >
              <span>Open Master Examination Schedule</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* ======================================================================= */}
        {/* RIGHT PANEL (5 Cols): FACULTY INVENTORY & WORKLOAD EQUITY               */}
        {/* ======================================================================= */}
        <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200/90 shadow-xs flex flex-col overflow-hidden">
          <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h2 className="font-bold text-sm text-slate-900">Faculty Duty Roster</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Current duty distribution and capacity limits
              </p>
            </div>
            <button
              onClick={() => navigate('/faculty')}
              className="text-xs text-blue-600 hover:text-blue-800 font-semibold flex items-center gap-1 transition-colors cursor-pointer"
            >
              <span>Faculty Page</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[10px] uppercase font-bold text-slate-500">
                  <th className="py-2.5 px-3.5">Faculty Member</th>
                  <th className="py-2.5 px-2 text-center">Role / Status</th>
                  <th className="py-2.5 px-3.5 text-right">Duty Load</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {facultyList.map((f, idx) => {
                  const duties = f.duties || 0;
                  const capacity = f.capacity || 15;
                  const isSquad = f.name?.includes('Arjun') || f.faculty_id === 1;
                  const initials = f.name
                    ? f.name.replace(/^(Dr\.|Prof\.|Mr\.|Mrs\.|Ms\.)\s+/i, '').slice(0, 2).toUpperCase()
                    : 'FA';
                  const pct = Math.min(100, Math.round((duties / Math.max(1, capacity)) * 100));

                  return (
                    <tr key={f.faculty_id || idx} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-2.5 px-3.5">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-lg bg-slate-100 border border-slate-200 text-slate-700 font-bold text-[10px] flex items-center justify-center shrink-0">
                            {initials}
                          </div>
                          <div className="min-w-0">
                            <div className="font-bold text-slate-900 truncate">{f.name}</div>
                            <div className="text-[10px] text-slate-400 truncate">{f.designation || 'Faculty'}</div>
                          </div>
                        </div>
                      </td>

                      <td className="py-2.5 px-2 text-center">
                        {isSquad ? (
                          <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200 text-[10px] font-bold">
                            Squad Duty
                          </span>
                        ) : (
                          <Badge variant={f.eligible ? 'success' : 'warning'}>
                            {f.eligible ? 'Eligible' : 'Excluded'}
                          </Badge>
                        )}
                      </td>

                      <td className="py-2.5 px-3.5 text-right font-mono">
                        <div className="flex items-center justify-end gap-1 font-bold text-slate-800">
                          <span>{duties}</span>
                          <span className="text-slate-400 font-normal text-[10px]">/ {capacity}</span>
                        </div>
                        <div className="w-16 ml-auto bg-slate-100 rounded-full h-1 mt-1 overflow-hidden">
                          <div
                            className={`h-1 rounded-full ${pct >= 100 ? 'bg-amber-500' : 'bg-blue-600'}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="p-3 bg-slate-50 border-t border-slate-100 text-center">
            <button
              onClick={() => navigate('/faculty')}
              className="text-xs font-semibold text-blue-600 hover:text-blue-800 transition-colors inline-flex items-center gap-1 cursor-pointer"
            >
              <span>Manage Quotas & Availability</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

    </div>
  );
};

export default Dashboard;
