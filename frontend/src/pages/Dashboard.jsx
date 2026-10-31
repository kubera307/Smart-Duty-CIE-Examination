import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Clock,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { cieApi } from '../services/cieApi';
import { academicApi } from '../services/academicApi';
import { useAcademicYear } from '../context/AcademicYearContext';

const getCieNumber = (name = '') => {
  const match = name.match(/CIE[-\s]*(1|2|3|I{1,3})$/i);
  if (!match) return null;
  const value = match[1].toUpperCase();
  return ({ I: '1', II: '2', III: '3' })[value] || value;
};

const getDutyCounts = (sessions) => sessions.reduce((totals, session) => {
  const rooms = session.exam_rooms || [];
  const required = Number(
    session.total_required ??
    ((rooms.length || Number(session.required_invigilators) || 1) + Number(session.required_squad || 0))
  );
  const assignedFromRooms = rooms.filter(
    (room) => room.allocated_faculty && ['ASSIGNED', 'COMPLETED'].includes(room.status)
  ).length;
  const assignedFromDuties = (session.duties || []).filter(
    (duty) => ['ASSIGNED', 'COMPLETED'].includes(duty.status) && duty.faculty_id
  ).length;
  const assigned = Number(session.allocated_count ?? Math.max(assignedFromRooms, assignedFromDuties));

  totals.required += required;
  totals.assigned += Math.min(assigned, required);
  return totals;
}, { required: 0, assigned: 0 });

const formatExamDate = (date) => {
  if (!date) return 'Date not set';
  const [year, month, day] = date.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
};

const Dashboard = () => {
  const navigate = useNavigate();
  const { selectedYear } = useAcademicYear();
  const [cies, setCies] = useState([]);
  const [semesters, setSemesters] = useState([]);
  const [selectedCieNumber, setSelectedCieNumber] = useState('1');
  const [selectedCieId, setSelectedCieId] = useState('');
  const [selectedSemester, setSelectedSemester] = useState('all');
  const [cieSessions, setCieSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const loadDashboard = async () => {
      setLoading(true);
      setError(null);

      try {
        const [response, semesterResponse] = await Promise.all([
          cieApi.getAll({ academic_year: selectedYear }),
          academicApi.getSemesters(),
        ]);
        const cieList = Array.isArray(response.data) ? response.data : [];
        const semesterList = Array.isArray(semesterResponse.data) ? semesterResponse.data : [];
        if (cancelled) return;

        setCies(cieList);
        setSemesters(semesterList);
        setSelectedSemester('all');
        const yearCies = cieList.filter(
          (cie) => (cie.academic_year || '').trim() === (selectedYear || '').trim()
        );
        const selectedCie = yearCies.find(
          (cie) => getCieNumber(cie.name) === selectedCieNumber
        ) || yearCies.find((cie) => cie.is_current) || yearCies[0] || cieList[0];

        if (!selectedCie) {
          setSelectedCieId('');
          setCieSessions([]);
          return;
        }

        setSelectedCieId(String(selectedCie.id));
        setSelectedCieNumber(getCieNumber(selectedCie.name) || selectedCieNumber);
        const sessionsResponse = await cieApi.getSessions(selectedCie.id);
        if (cancelled) return;
        setCieSessions(Array.isArray(sessionsResponse.data) ? sessionsResponse.data : []);
      } catch (loadError) {
        if (cancelled) return;
        console.error('Failed to load dashboard:', loadError);
        setError('Unable to load examination information. Check the backend connection and try again.');
        setCieSessions([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadDashboard();
    return () => {
      cancelled = true;
    };
  }, [selectedYear, retryCount]);

  const activeCie = cies.find((cie) => String(cie.id) === selectedCieId);
  const availableSemesters = useMemo(
    () => [...new Set([
      ...semesters.map((semester) => semester.sem_number),
      ...cieSessions.map((session) => session.sem_number),
    ].filter((number) => number != null))].sort((a, b) => a - b),
    [semesters, cieSessions]
  );
  const filteredSessions = useMemo(
    () => selectedSemester === 'all'
      ? cieSessions
      : cieSessions.filter((session) => String(session.sem_number) === selectedSemester),
    [cieSessions, selectedSemester]
  );
  const dutyCounts = useMemo(() => getDutyCounts(filteredSessions), [filteredSessions]);
  const pendingDuties = Math.max(0, dutyCounts.required - dutyCounts.assigned);

  const schedule = useMemo(() => {
    const sorted = [...filteredSessions].sort((a, b) => (
      `${a.exam_date || ''} ${a.start_time || ''}`.localeCompare(`${b.exam_date || ''} ${b.start_time || ''}`)
    ));
    const today = new Date();
    const todayKey = [
      today.getFullYear(),
      String(today.getMonth() + 1).padStart(2, '0'),
      String(today.getDate()).padStart(2, '0'),
    ].join('-');
    const upcoming = sorted.filter((session) => session.exam_date >= todayKey);

    return {
      sessions: (upcoming.length ? upcoming : sorted.slice().reverse()).slice(0, 5),
      isUpcoming: upcoming.length > 0,
    };
  }, [filteredSessions]);

  const semesterReadiness = useMemo(() => {
    const progressBySemester = new Map();
    semesters.forEach((semester) => {
      progressBySemester.set(semester.sem_number, {
        number: semester.sem_number,
        name: semester.name,
        sessions: 0,
        required: 0,
        assigned: 0,
      });
    });
    cieSessions.forEach((session) => {
      const key = session.sem_number ?? 'other';
      const semester = progressBySemester.get(key) || {
        number: session.sem_number,
        name: session.semester_name,
        sessions: 0,
        required: 0,
        assigned: 0,
      };
      const duties = getDutyCounts([session]);
      semester.sessions += 1;
      semester.required += duties.required;
      semester.assigned += duties.assigned;
      progressBySemester.set(key, semester);
    });

    return [...progressBySemester.values()].sort((a, b) => (a.number || 0) - (b.number || 0));
  }, [cieSessions, semesters]);

  const todayExamCount = useMemo(() => {
    const today = new Date();
    const todayKey = [
      today.getFullYear(),
      String(today.getMonth() + 1).padStart(2, '0'),
      String(today.getDate()).padStart(2, '0'),
    ].join('-');
    return filteredSessions.filter((session) => session.exam_date === todayKey).length;
  }, [filteredSessions]);

  const handleCieChange = async (number) => {
    setSelectedCieNumber(number);
    setError(null);

    const selectedCie = cies.find(
      (cie) =>
        (cie.academic_year || '').trim() === (selectedYear || '').trim() &&
        getCieNumber(cie.name) === number
    );

    if (!selectedCie) {
      setSelectedCieId('');
      setSelectedSemester('all');
      setCieSessions([]);
      return;
    }

    setLoading(true);
    setSelectedSemester('all');
    setSelectedCieId(String(selectedCie.id));
    try {
      const response = await cieApi.getSessions(selectedCie.id);
      setCieSessions(Array.isArray(response.data) ? response.data : []);
    } catch (loadError) {
      console.error('Failed to load CIE sessions:', loadError);
      setCieSessions([]);
      setError('Unable to load this CIE schedule. Check the backend connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="py-24 text-center" role="status">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-sm text-slate-500">Loading dashboard...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-lg mx-auto mt-12 p-6 bg-rose-50 border border-rose-200 rounded-xl text-center">
        <AlertCircle className="w-7 h-7 text-rose-500 mx-auto mb-3" />
        <p className="text-sm text-rose-700 mb-4">{error}</p>
        <button
          onClick={() => setRetryCount((count) => count + 1)}
          className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-sm font-semibold"
        >
          Retry
        </button>
      </div>
    );
  }

  const metrics = [
    {
      label: 'Exam sessions',
      value: filteredSessions.length,
      icon: CalendarDays,
      color: 'text-blue-600 bg-blue-50',
    },
    {
      label: 'Duties assigned',
      value: `${dutyCounts.assigned} / ${dutyCounts.required}`,
      icon: ClipboardList,
      color: 'text-emerald-600 bg-emerald-50',
    },
    {
      label: 'Duties pending',
      value: pendingDuties,
      icon: Users,
      color: pendingDuties ? 'text-amber-600 bg-amber-50' : 'text-emerald-600 bg-emerald-50',
    },
  ];
  const nextExamDutyCounts = schedule.isUpcoming && schedule.sessions[0]
    ? getDutyCounts([schedule.sessions[0]])
    : null;

  return (
    <div className="space-y-5">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-sm text-slate-500 mt-1">
            {activeCie ? `${activeCie.name} · ${selectedYear}` : `Academic year ${selectedYear}`}
            {' · '}
            {selectedSemester === 'all' ? 'All semesters' : `Semester ${selectedSemester}`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="dashboard-semester" className="sr-only">Filter dashboard by semester</label>
          <select
            id="dashboard-semester"
            value={selectedSemester}
            onChange={(event) => setSelectedSemester(event.target.value)}
            className="px-3 py-2 rounded-lg bg-white border border-slate-200 text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All semesters</option>
            {availableSemesters.map((semester) => (
              <option key={semester} value={String(semester)}>
                {semesters.find((item) => item.sem_number === semester)?.name || `Semester ${semester}`}
              </option>
            ))}
          </select>
          <div className="flex items-center gap-1.5" aria-label="Select CIE cycle">
            {['1', '2', '3'].map((number) => {
              const available = cies.some(
                (cie) =>
                  (cie.academic_year || '').trim() === (selectedYear || '').trim() &&
                  getCieNumber(cie.name) === number
              );
              return (
                <button
                  key={number}
                  onClick={() => handleCieChange(number)}
                  disabled={!available}
                  aria-pressed={selectedCieNumber === number}
                  className={`px-3 py-2 rounded-lg text-sm font-semibold transition-colors ${
                    selectedCieNumber === number
                      ? 'bg-blue-600 text-white'
                      : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                  } disabled:opacity-40 disabled:cursor-not-allowed`}
                >
                  CIE-{number}
                </button>
              );
            })}
          </div>
        </div>
      </header>

      <section className="grid grid-cols-1 sm:grid-cols-3 gap-4" aria-label="CIE summary">
        {metrics.map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-white border border-slate-200 rounded-xl p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-slate-500">{label}</span>
              <span className={`w-9 h-9 rounded-lg flex items-center justify-center ${color}`}>
                <Icon className="w-4 h-4" />
              </span>
            </div>
            <p className="mt-3 text-2xl font-bold text-slate-900">{value}</p>
          </div>
        ))}
      </section>

      <section aria-labelledby="admin-actions-heading">
        <div className="flex items-center justify-between mb-3">
          <h2 id="admin-actions-heading" className="text-sm font-semibold text-slate-800">
            Admin actions
          </h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            {
              label: 'Manage schedule',
              description: 'Sessions and assignments',
              icon: CalendarDays,
              path: '/schedule',
            },
            {
              label: 'Review conflicts',
              description: 'Check duty exceptions',
              icon: ShieldCheck,
              path: '/conflicts',
            },
            {
              label: 'Faculty directory',
              description: 'Staff and availability',
              icon: Users,
              path: '/faculty',
            },
          ].map(({ label, description, icon: Icon, path }) => (
            <button
              key={label}
              onClick={() => navigate(path)}
              className="bg-white border border-slate-200 rounded-xl p-3.5 text-left hover:border-blue-300 hover:bg-blue-50/40 transition-colors group"
            >
              <span className="flex items-center justify-between">
                <Icon className="w-4 h-4 text-blue-600" />
                <ArrowRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-blue-600" />
              </span>
              <span className="block text-sm font-semibold text-slate-800 mt-3">{label}</span>
              <span className="block text-xs text-slate-500 mt-0.5">{description}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4" aria-label="Exam readiness overview">
        <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold text-slate-900">Next exam</h2>
              <p className="text-sm text-slate-500 mt-0.5">
                {schedule.isUpcoming ? 'Upcoming session in this CIE' : 'No upcoming sessions'}
              </p>
            </div>
            {todayExamCount > 0 && (
              <span className="px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-semibold">
                {todayExamCount} today
              </span>
            )}
          </div>
          {schedule.isUpcoming && schedule.sessions[0] ? (
            <div className="mt-4">
              <p className="text-lg font-semibold text-slate-900">
                {schedule.sessions[0].subject_code || schedule.sessions[0].subject_name || 'Exam session'}
              </p>
              <p className="text-sm text-slate-500 mt-1">
                {formatExamDate(schedule.sessions[0].exam_date)} · {schedule.sessions[0].start_time}–{schedule.sessions[0].end_time}
                {schedule.sessions[0].sem_number ? ` · Semester ${schedule.sessions[0].sem_number}` : ''}
              </p>
              <p className="text-sm text-slate-600 mt-2">
                {nextExamDutyCounts.assigned} of {nextExamDutyCounts.required} duties assigned
              </p>
            </div>
          ) : (
            <p className="mt-4 text-sm text-slate-500">
              {filteredSessions.length
                ? 'All scheduled exams for this selection have passed.'
                : selectedSemester === 'all'
                  ? 'No exam sessions are scheduled for this CIE.'
                  : `No exam sessions are scheduled for Semester ${selectedSemester} in this CIE.`}
            </p>
          )}
          <button
            onClick={() => navigate('/schedule')}
            className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-blue-700 hover:text-blue-800"
          >
            Open exam schedule
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold text-slate-900">Semester duty readiness</h2>
              <p className="text-sm text-slate-500 mt-0.5">All configured semesters · assigned duties by semester</p>
            </div>
            <button
              onClick={() => navigate('/schedule')}
              className="text-sm font-semibold text-blue-700 hover:text-blue-800"
            >
              View all
            </button>
          </div>
          {semesterReadiness.length ? (
            <ul className="mt-4 space-y-3">
              {semesterReadiness.map((semester) => {
                const percent = semester.required
                  ? Math.round((semester.assigned / semester.required) * 100)
                  : 0;
                return (
                  <li key={semester.number ?? 'other'}>
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="font-medium text-slate-700">
                        {semester.name || (semester.number ? `Semester ${semester.number}` : 'Other')}
                        <span className="ml-1.5 text-xs font-normal text-slate-500">
                          {semester.sessions} sessions
                        </span>
                      </span>
                      <span className="text-slate-600">
                        {semester.assigned}/{semester.required}
                        {semester.required > semester.assigned && (
                          <span className="ml-1.5 text-amber-700">
                            ({semester.required - semester.assigned} pending)
                          </span>
                        )}
                      </span>
                    </div>
                    <div
                      className="mt-1.5 h-1.5 rounded-full bg-slate-100 overflow-hidden"
                      role="progressbar"
                      aria-label={`${semester.number ? `Semester ${semester.number}` : 'Other'} duty assignment progress`}
                      aria-valuenow={percent}
                      aria-valuemin={0}
                      aria-valuemax={100}
                    >
                      <div
                        className={`h-full rounded-full ${percent === 100 ? 'bg-emerald-500' : 'bg-blue-600'}`}
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="mt-4 text-sm text-slate-500">No semester sessions are scheduled for this CIE.</p>
          )}
        </div>
      </section>

      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold text-slate-900">
              {schedule.isUpcoming ? 'Upcoming exam sessions' : 'Recent exam sessions'}
            </h2>
            <p className="text-sm text-slate-500 mt-0.5">
              {schedule.isUpcoming ? 'Next scheduled exams' : 'Latest scheduled exams'}
            </p>
          </div>
          <button
            onClick={() => navigate('/schedule')}
            className="shrink-0 px-3 py-2 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 text-sm font-semibold"
          >
            View schedule
          </button>
        </div>

        {schedule.sessions.length ? (
          <ul className="divide-y divide-slate-100">
            {schedule.sessions.map((session) => {
              const sessionDuties = getDutyCounts([session]);
              const isComplete = sessionDuties.required > 0 && sessionDuties.assigned >= sessionDuties.required;
              return (
                <li key={session.id} className="px-4 sm:px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-slate-900">
                        {session.subject_code || session.subject_name || 'Exam session'}
                      </span>
                      {session.sem_number && (
                        <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-xs">
                          Semester {session.sem_number}
                        </span>
                      )}
                    </div>
                    {session.subject_name && session.subject_code && (
                      <p className="text-sm text-slate-500 mt-0.5 truncate">{session.subject_name}</p>
                    )}
                    <div className="flex items-center gap-1.5 text-sm text-slate-500 mt-1">
                      <Clock className="w-3.5 h-3.5" />
                      <span>{formatExamDate(session.exam_date)} · {session.start_time}–{session.end_time}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-sm shrink-0">
                    <span className="text-slate-600">
                      {sessionDuties.assigned}/{sessionDuties.required} duties
                    </span>
                    {isComplete && <CheckCircle2 className="w-4 h-4 text-emerald-600" aria-label="All duties assigned" />}
                    {!isComplete && sessionDuties.required > 0 && (
                      <span className="text-amber-700 font-medium">Pending</span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="px-5 py-10 text-center text-sm text-slate-500">
            {activeCie ? 'No exam sessions are scheduled for this CIE.' : 'No CIE cycle is available for this academic year.'}
          </p>
        )}
      </section>
    </div>
  );
};

export default Dashboard;
