import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { cieApi } from '../services/cieApi';
import { academicApi } from '../services/academicApi';
import { facultyApi } from '../services/facultyApi';
import { allocationApi } from '../services/allocationApi';
import Modal from '../components/common/Modal';
import Badge from '../components/common/Badge';
import { useAcademicYear } from '../context/AcademicYearContext';
import {
  Plus,
  Trash2,
  Calendar,
  Clock,
  CheckCircle2,
  Split,
  UserCheck,
  Search,
  Table,
  LayoutGrid,
  ShieldCheck,
  Building2,
  AlertCircle,
  Pencil,
  Sparkles,
  Layers,
  CheckSquare,
  Square,
  UserX,
  AlertTriangle,
  Check,
  XCircle,
  PhoneCall,
  RefreshCw,
  Zap,
  BookOpen
} from 'lucide-react';

const ExamSchedule = () => {
  const [searchParams] = useSearchParams();
  const { academicYears, selectedYear, setSelectedYear, createYear } = useAcademicYear();
  const [cies, setCies] = useState([]);
  const [selectedCycle, setSelectedCycle] = useState('odd'); // 'odd' | 'even'
  const [selectedCieNumber, setSelectedCieNumber] = useState('1'); // '1' | '2' | '3'
  const [selectedCieId, setSelectedCieId] = useState('');
  const [semesters, setSemesters] = useState([]);
  const [facultyList, setFacultyList] = useState([]);
  const [selectedSemFilter, setSelectedSemFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [viewLayout, setViewLayout] = useState('table'); // 'table' (default) | 'cards'
  const [activeViewMode, setActiveViewMode] = useState('schedule'); // 'schedule' | 'operations'
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [successToast, setSuccessToast] = useState(null);
  const [isAutoAssigningAll, setIsAutoAssigningAll] = useState(false);
  const [reassignAlsoAssignAll, setReassignAlsoAssignAll] = useState(true);

  // Emergency Standby Operations state
  const [isStandbyModalOpen, setIsStandbyModalOpen] = useState(false);
  const [standbyRow, setStandbyRow] = useState(null);
  const [standbyList, setStandbyList] = useState([]);
  const [isLoadingStandby, setIsLoadingStandby] = useState(false);
  const [isReassigningStandby, setIsReassigningStandby] = useState(false);

  // 1. CREATE DUTY MODAL STATE (Full direct duty creation)
  const [isCreateDutyModalOpen, setIsCreateDutyModalOpen] = useState(false);
  const [dutySemesterId, setDutySemesterId] = useState('');
  const [dutySubjectId, setDutySubjectId] = useState('');
  const [dutySubjectsList, setDutySubjectsList] = useState([]);
  const [dutyDate, setDutyDate] = useState('2026-09-10');
  const [dutyStartTime, setDutyStartTime] = useState('09:00');
  const [dutyEndTime, setDutyEndTime] = useState('10:00');
  const [dutyRooms, setDutyRooms] = useState([
    { id: 1, room_number: 'AI301', student_start: 1, student_end: 29, faculty_id: '' },
    { id: 2, room_number: 'AI302', student_start: 30, student_end: 60, faculty_id: '' }
  ]);
  const [dutyType, setDutyType] = useState('Invigilation');
  const [dutyNotes, setDutyNotes] = useState('');
  const [isSubmittingDuty, setIsSubmittingDuty] = useState(false);

  // 2. REASSIGN MODAL STATE (Quickly change faculty on an existing room duty)
  const [isReassignModalOpen, setIsReassignModalOpen] = useState(false);
  const [reassignRow, setReassignRow] = useState(null);
  const [reassignFacultyId, setReassignFacultyId] = useState('');
  const [reassignDutyType, setReassignDutyType] = useState('Invigilation');
  const [reassignNotes, setReassignNotes] = useState('');
  const [isSubmittingReassign, setIsSubmittingReassign] = useState(false);

  // 2.1 EDIT DUTY & SESSION MODAL STATE (Modify Date, Time, Rooms & Assign Conflict-Free Faculty)
  const [isEditDutyModalOpen, setIsEditDutyModalOpen] = useState(false);
  const [editSessionId, setEditSessionId] = useState(null);
  const [editSemesterId, setEditSemesterId] = useState('');
  const [editSubjectId, setEditSubjectId] = useState('');
  const [editSubjectsList, setEditSubjectsList] = useState([]);
  const [editDate, setEditDate] = useState('2026-09-10');
  const [editStartTime, setEditStartTime] = useState('09:00');
  const [editEndTime, setEditEndTime] = useState('10:00');
  const [editTotalStudents, setEditTotalStudents] = useState(60);
  const [editRooms, setEditRooms] = useState([]);
  const [editNotes, setEditNotes] = useState('');
  const [editFacultyConflicts, setEditFacultyConflicts] = useState({});
  const [isLoadingConflicts, setIsLoadingConflicts] = useState(false);
  const [isSubmittingEdit, setIsSubmittingEdit] = useState(false);
  const [applyToAllSlotDutiesToday, setApplyToAllSlotDutiesToday] = useState(true);
  const [applyToAllDaysSlot, setApplyToAllDaysSlot] = useState(false);

  // Real-time conflict tracking maps against 3rd sem timetable
  const [dutyFacultyConflicts, setDutyFacultyConflicts] = useState({});
  const [reassignFacultyConflicts, setReassignFacultyConflicts] = useState({});


  // 3. FULL EXAM SESSION SETUP MODAL (Multi-room auto-splitting)
  const [isSessionModalOpen, setIsSessionModalOpen] = useState(false);
  const [formSemesterId, setFormSemesterId] = useState('');
  const [formSubjectId, setFormSubjectId] = useState('');
  const [subjectsList, setSubjectsList] = useState([]);
  const [formDate, setFormDate] = useState('2026-09-10');
  const [formStartTime, setFormStartTime] = useState('09:00');
  const [formEndTime, setFormEndTime] = useState('10:00');
  const [formTotalStudents, setFormTotalStudents] = useState(60);
  const [formRooms, setFormRooms] = useState([
    { id: 1, room_number: 'AI301', room_capacity: 30, student_start: 1, student_end: 29 },
    { id: 2, room_number: 'AI302', room_capacity: 30, student_start: 30, student_end: 60 },
  ]);

  // 4. WHOLE CIE SCHEDULE MODAL STATE (Multi-semester bulk creation)
  const [isWholeScheduleModalOpen, setIsWholeScheduleModalOpen] = useState(false);
  const [wholeStartDate, setWholeStartDate] = useState('2026-09-10');
  const [wholeSelectedSemesters, setWholeSelectedSemesters] = useState([5, 7]); // Default to 5th & 7th
  const [wholeMorningStart, setWholeMorningStart] = useState('09:30');
  const [wholeMorningEnd, setWholeMorningEnd] = useState('10:30');
  const [wholeAfternoonStart, setWholeAfternoonStart] = useState('14:30');
  const [wholeAfternoonEnd, setWholeAfternoonEnd] = useState('15:30');
  const [semesterTimings, setSemesterTimings] = useState({
    3: { morning_start: '09:00', morning_end: '10:00', afternoon_start: '14:00', afternoon_end: '15:00' },
    4: { morning_start: '09:00', morning_end: '10:00', afternoon_start: '14:00', afternoon_end: '15:00' },
    5: { morning_start: '09:00', morning_end: '10:00', afternoon_start: '14:00', afternoon_end: '15:00' },
    6: { morning_start: '11:30', morning_end: '12:30', afternoon_start: '15:30', afternoon_end: '16:30' },
    7: { morning_start: '11:30', morning_end: '12:30', afternoon_start: '15:30', afternoon_end: '16:30' },
  });

  const handleSemTimingChange = (semNum, field, val) => {
    setSemesterTimings((prev) => ({
      ...prev,
      [semNum]: {
        ...(prev[semNum] || {
          morning_start: semNum === 7 || semNum === 6 ? '11:30' : '09:00',
          morning_end: semNum === 7 || semNum === 6 ? '12:30' : '10:00',
          afternoon_start: semNum === 7 || semNum === 6 ? '15:30' : '14:00',
          afternoon_end: semNum === 7 || semNum === 6 ? '16:30' : '15:00',
        }),
        [field]: val
      }
    }));
  };
  const [autoAllocateAfterSchedule, setAutoAllocateAfterSchedule] = useState(true);
  const [isSubmittingWholeSchedule, setIsSubmittingWholeSchedule] = useState(false);

  // Squad Duty Quotas state
  const [squadQuotaMap, setSquadQuotaMap] = useState({ 1: 6 });
  const [squadFacultyIds, setSquadFacultyIds] = useState([1]);

  const handleSquadQuotaInputChange = (facId, val) => {
    const num = Math.max(0, parseInt(val, 10) || 0);
    setSquadQuotaMap((prev) => ({ ...prev, [facId]: num }));
    setQuotaMap((prev) => ({ ...prev, [facId]: num }));
  };

  const handleAddSquadFaculty = (facId) => {
    if (!facId) return;
    if (!squadFacultyIds.includes(facId)) {
      setSquadFacultyIds((prev) => [...prev, facId]);
      setSquadQuotaMap((prev) => ({
        ...prev,
        [facId]: prev[facId] !== undefined ? prev[facId] : 2
      }));
    }
  };

  const handleRemoveSquadFaculty = (facId) => {
    setSquadFacultyIds((prev) => prev.filter((id) => id !== facId));
    setSquadQuotaMap((prev) => {
      const copy = { ...prev };
      delete copy[facId];
      return copy;
    });
  };

  // Optional 1-Credit Subjects in Whole Schedule Modal (Supports 1, 2, or multiple 1-credit subjects)
  const [includeOneCreditSubject, setIncludeOneCreditSubject] = useState(false);
  const [oneCreditEntries, setOneCreditEntries] = useState([
    {
      id: 1,
      semester_id: '',
      subject_id: '',
      exam_date: '',
      start_time: '15:30',
      end_time: '16:30',
      availableSubjects: []
    }
  ]);

  const loadEntrySubjects = async (entryId, semId) => {
    if (!semId) return;
    try {
      const res = await academicApi.getSubjects(semId);
      const subs = Array.isArray(res.data) ? res.data : [];
      const preferred = subs.find(s => s.code.includes('EVS') || s.code.includes('UHV') || s.code.includes('CIP') || s.code.includes('BCM') || s.code.includes('SCR'));

      setOneCreditEntries(prev => prev.map(entry => {
        if (entry.id === entryId) {
          return {
            ...entry,
            semester_id: semId.toString(),
            availableSubjects: subs,
            subject_id: preferred ? preferred.id.toString() : (subs[0]?.id?.toString() || '')
          };
        }
        return entry;
      }));
    } catch (err) {
      console.error('Failed to load 1-credit subjects:', err);
    }
  };

  const handleAddOneCreditEntry = () => {
    const defaultSem = wholeSelectedSemesters.includes(5) ? 5 : (wholeSelectedSemesters[0] || 5);
    const matchedSem = safeSemesters.find(s => s.sem_number === defaultSem);
    const defaultSemId = matchedSem ? matchedSem.id.toString() : (safeSemesters[0]?.id?.toString() || '');

    let defDate = wholeStartDate;
    if (wholeStartDate) {
      try {
        const d = new Date(wholeStartDate);
        d.setDate(d.getDate() + 2); // Default to Day 3 of CIE
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        defDate = `${yyyy}-${mm}-${dd}`;
      } catch (err) {}
    }

    const newId = Date.now() + Math.floor(Math.random() * 1000);
    setOneCreditEntries(prev => [
      ...prev,
      {
        id: newId,
        semester_id: defaultSemId,
        subject_id: '',
        exam_date: defDate,
        start_time: '15:30',
        end_time: '16:30',
        availableSubjects: []
      }
    ]);

    if (defaultSemId) {
      loadEntrySubjects(newId, defaultSemId);
    }
  };

  const handleRemoveOneCreditEntry = (id) => {
    setOneCreditEntries(prev => {
      const filtered = prev.filter(e => e.id !== id);
      if (filtered.length === 0) {
        setIncludeOneCreditSubject(false);
      }
      return filtered;
    });
  };

  const handleUpdateOneCreditEntry = (id, field, value) => {
    setOneCreditEntries(prev => prev.map(entry => {
      if (entry.id === id) {
        return { ...entry, [field]: value };
      }
      return entry;
    }));
  };

  const handleToggleIncludeOneCredit = (checked) => {
    setIncludeOneCreditSubject(checked);
    if (checked && (!oneCreditEntries || oneCreditEntries.length === 0 || !oneCreditEntries[0].semester_id)) {
      const defaultSem = wholeSelectedSemesters.includes(5) ? 5 : (wholeSelectedSemesters[0] || 5);
      const matchedSem = safeSemesters.find(s => s.sem_number === defaultSem);
      const defaultSemId = matchedSem ? matchedSem.id.toString() : (safeSemesters[0]?.id?.toString() || '');

      let defDate = wholeStartDate;
      if (wholeStartDate) {
        try {
          const d = new Date(wholeStartDate);
          d.setDate(d.getDate() + 2); // Default to Day 3 of CIE
          const yyyy = d.getFullYear();
          const mm = String(d.getMonth() + 1).padStart(2, '0');
          const dd = String(d.getDate()).padStart(2, '0');
          defDate = `${yyyy}-${mm}-${dd}`;
        } catch (e) {}
      }

      const initialId = Date.now();
      setOneCreditEntries([
        {
          id: initialId,
          semester_id: defaultSemId,
          subject_id: '',
          exam_date: defDate,
          start_time: '15:30',
          end_time: '16:30',
          availableSubjects: []
        }
      ]);
      if (defaultSemId) {
        loadEntrySubjects(initialId, defaultSemId);
      }
    }
  };

  useEffect(() => {
    if (wholeStartDate) {
      try {
        const d = new Date(wholeStartDate);
        d.setDate(d.getDate() + 2); // Default to Day 3 of CIE
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        const defDate = `${yyyy}-${mm}-${dd}`;
        setOneCreditEntries(prev => prev.map(entry => ({
          ...entry,
          exam_date: entry.exam_date || defDate
        })));
      } catch (e) {}
    }
  }, [wholeStartDate]);

  // 5. OVERALL EDIT DUTIES (5TH, 7TH & 3RD SEM) MODAL STATE
  const [isOverallEditModalOpen, setIsOverallEditModalOpen] = useState(false);
  const [overallSessions, setOverallSessions] = useState([]);
  const [overallFilterSem, setOverallFilterSem] = useState('all'); // 'all' | '3' | '5' | '7'
  const [overallLoading, setOverallLoading] = useState(false);
  const [overallSessionState, setOverallSessionState] = useState({});
  const [overallConflictState, setOverallConflictState] = useState({});
  const [isSavingOverall, setIsSavingOverall] = useState(false);

  // 6. FACULTY DUTY QUOTAS STATE (Seniority Protection & Custom Duty Caps)
  const [isQuotaModalOpen, setIsQuotaModalOpen] = useState(false);
  const [quotaRawText, setQuotaRawText] = useState('swathi-1, ankitha-3, sushma-4, megha-4, maseeha-5, shithal-4');
  const [quotaMap, setQuotaMap] = useState({});
  const [facultyQuotaList, setFacultyQuotaList] = useState([]);
  const [isSavingQuotas, setIsSavingQuotas] = useState(false);

  const parseQuotaStringClient = (text, faculties) => {
    if (!text) return {};
    const items = text.split(/[,;\n|]+/);
    const map = {};
    items.forEach((item) => {
      const trimmed = item.trim();
      if (!trimmed) return;
      const m = trimmed.match(/^(.+?)[\s\-:=]+(\d+)$/);
      if (m) {
        const namePart = m[1].trim().toLowerCase();
        const count = parseInt(m[2], 10);
        const matched = faculties.find((f) => {
          const fn = (f.name || '').toLowerCase();
          if (fn.includes(namePart)) return true;
          if ((namePart === 'shithal' || namePart === 'sheethal') && (fn.includes('shithal') || fn.includes('sheethal'))) return true;
          return false;
        });
        if (matched) {
          map[matched.id] = count;
        }
      }
    });
    return map;
  };

  const loadDutyQuotas = async () => {
    try {
      const res = await facultyApi.getDutyQuotas();
      if (res.data) {
        setFacultyQuotaList(res.data.quotas || []);
        if (res.data.raw_text) setQuotaRawText(res.data.raw_text);
        const map = {};
        const sqMap = {};
        (res.data.quotas || []).forEach((q) => {
          map[q.faculty_id] = q.quota;
          if (q.is_squad_only || q.faculty_id === 1) {
            sqMap[q.faculty_id] = q.quota <= 12 ? q.quota : 6;
          }
        });
        setQuotaMap(map);
        if (Object.keys(sqMap).length > 0) {
          setSquadQuotaMap((prev) => ({ ...prev, ...sqMap }));
        }
      }
    } catch (e) {
      console.error('Failed to load duty quotas:', e);
    }
  };

  const handleApplyQuotaRawText = (textToApply) => {
    const text = textToApply !== undefined ? textToApply : quotaRawText;
    const faculties = safeFacultyList.length > 0 ? safeFacultyList : facultyQuotaList;
    const parsed = parseQuotaStringClient(text, faculties);
    if (Object.keys(parsed).length === 0) {
      alert('Could not parse any faculty quotas from text. Format example: swathi-1, ankitha-3, sushma-4');
      return;
    }
    setQuotaMap((prev) => ({ ...prev, ...parsed }));
    setQuotaRawText(text);
    showToast(`Parsed quotas for ${Object.keys(parsed).length} faculty members.`);
  };

  const handleQuotaInputChange = (facId, val) => {
    const num = Math.max(0, parseInt(val, 10) || 0);
    const newMap = { ...quotaMap, [facId]: num };
    setQuotaMap(newMap);
    const parts = [];
    safeFacultyList.forEach((f) => {
      const isSquad = f.only_squad_duty || f.id === 1 || f.name?.includes('Arjun');
      if (!isSquad && f.eligible_for_duty) {
        const q = newMap[f.id] !== undefined ? newMap[f.id] : (f.max_duty_capacity !== undefined ? f.max_duty_capacity : 5);
        const short = f.name.replace('Dr. ', '').replace('Mrs. ', '').replace('Mr. ', '').replace('Ms. ', '').split(' ')[0].toLowerCase();
        parts.push(`${short}-${q}`);
      }
    });
    setQuotaRawText(parts.join(', '));
  };

  const handlePresetSeniorQuotas = (targetTotal = 21) => {
    const newMap = {};
    const eligibleFaculty = safeFacultyList.filter(f => !f.only_squad_duty && f.id !== 1 && !f.name?.includes('Arjun') && f.eligible_for_duty);
    const swathi = eligibleFaculty.find(f => f.name?.includes('Swathi'));
    const ankitha = eligibleFaculty.find(f => f.name?.includes('Ankitha'));

    if (swathi) newMap[swathi.id] = 1;
    if (ankitha) newMap[ankitha.id] = 3;

    const fixedAlloc = (swathi ? 1 : 0) + (ankitha ? 3 : 0);
    const others = eligibleFaculty.filter(f => f !== swathi && f !== ankitha);
    const remDuties = Math.max(0, targetTotal - fixedAlloc);

    if (others.length > 0) {
      const base = Math.floor(remDuties / others.length);
      const rem = remDuties % others.length;
      others.forEach((f, idx) => {
        newMap[f.id] = base + (idx < rem ? 1 : 0);
      });
    }

    setQuotaMap(prev => ({ ...prev, ...newMap }));

    const parts = [];
    eligibleFaculty.forEach(f => {
      const q = newMap[f.id] !== undefined ? newMap[f.id] : 5;
      const short = f.name.replace('Dr. ', '').replace('Mrs. ', '').replace('Mr. ', '').replace('Ms. ', '').split(' ')[0].toLowerCase();
      parts.push(`${short}-${q}`);
    });
    setQuotaRawText(parts.join(', '));
    showToast('Applied Senior Faculty Protection preset (Swathi: 1, Ankitha: 3).');
  };

  const handleEqualizeQuotas = (targetTotal = 21) => {
    const eligibleFaculty = safeFacultyList.filter(f => !f.only_squad_duty && f.id !== 1 && !f.name?.includes('Arjun') && f.eligible_for_duty);
    if (eligibleFaculty.length === 0) return;

    const base = Math.floor(targetTotal / eligibleFaculty.length);
    const rem = targetTotal % eligibleFaculty.length;
    const newMap = {};

    eligibleFaculty.forEach((f, idx) => {
      newMap[f.id] = base + (idx < rem ? 1 : 0);
    });

    setQuotaMap(prev => ({ ...prev, ...newMap }));

    const parts = [];
    eligibleFaculty.forEach(f => {
      const q = newMap[f.id] !== undefined ? newMap[f.id] : 5;
      const short = f.name.replace('Dr. ', '').replace('Mrs. ', '').replace('Mr. ', '').replace('Ms. ', '').split(' ')[0].toLowerCase();
      parts.push(`${short}-${q}`);
    });
    setQuotaRawText(parts.join(', '));
    showToast(`Equalized ${targetTotal} duty quotas across ${eligibleFaculty.length} faculty.`);
  };

  const handleSaveQuotasOnly = async () => {
    setIsSavingQuotas(true);
    try {
      await facultyApi.saveDutyQuotas({ raw_text: quotaRawText, quotas: quotaMap });
      showToast('Faculty duty quotas saved successfully.');
      loadDutyQuotas();
      setIsQuotaModalOpen(false);
    } catch (e) {
      alert(e.response?.data?.error || 'Failed to save quotas');
    } finally {
      setIsSavingQuotas(false);
    }
  };

  const handleSaveAndAssignByQuotas = async () => {
    setIsSavingQuotas(true);
    try {
      const cieId = selectedCieId || (cies.length > 0 ? cies[0].id : 1);
      await facultyApi.assignByQuotas(cieId, { raw_text: quotaRawText, quotas: quotaMap });
      showToast('Duty quotas saved and duties allocated to faculties based on quotas!');
      loadSessions(cieId);
      loadDutyQuotas();
      setIsQuotaModalOpen(false);
    } catch (e) {
      alert(e.response?.data?.error || 'Failed to allocate by quotas');
    } finally {
      setIsSavingQuotas(false);
    }
  };

  const handleAutoAssignAllDuties = async () => {
    const targetCieId = selectedCieId || (cies.length > 0 ? cies[0].id : null);
    if (!targetCieId) {
      alert('Please select an active CIE cycle first.');
      return;
    }
    setIsAutoAssigningAll(true);
    try {
      const res = await allocationApi.generate(targetCieId);
      const allocated = res.data?.stats?.total_allocated || 0;
      const totalReq = res.data?.stats?.total_required || allocated;
      const pending = res.data?.stats?.total_pending || 0;

      await loadSessions(targetCieId);

      if (pending === 0) {
        showToast(`✅ 100% Duties successfully allocated for everyone! (${allocated}/${totalReq} duties staffed, 0 pending)`);
      } else {
        showToast(`Allocated ${allocated}/${totalReq} duties (${pending} pending).`);
      }
    } catch (err) {
      console.error('Failed to auto-assign all duties:', err);
      alert(err.response?.data?.error || 'Failed to auto-assign duties. Please try again.');
    } finally {
      setIsAutoAssigningAll(false);
    }
  };

  const handleOpenSem5and7Schedule = () => {
    setWholeSelectedSemesters([5, 7]);
    setIsWholeScheduleModalOpen(true);
  };

  const handleOpenSingleSemSchedule = (semNum) => {
    setWholeSelectedSemesters([semNum]);
    setIsWholeScheduleModalOpen(true);
  };

  const handleToggleSemester = (semNum) => {
    if (wholeSelectedSemesters.includes(semNum)) {
      if (wholeSelectedSemesters.length === 1) {
        alert('At least one semester must be selected.');
        return;
      }
      setWholeSelectedSemesters(wholeSelectedSemesters.filter((n) => n !== semNum));
    } else {
      setWholeSelectedSemesters([...wholeSelectedSemesters, semNum].sort());
    }
  };

  const handleSaveWholeSchedule = async (e) => {
    e.preventDefault();
    setIsSubmittingWholeSchedule(true);
    try {
      const cieId = selectedCieId || (cies.length > 0 ? cies[0].id : 1);
      // Merge squad quotas into quotaMap so they are persisted and respected
      const mergedQuotas = { ...quotaMap };
      Object.entries(squadQuotaMap).forEach(([fid, q]) => {
        mergedQuotas[fid] = q;
      });

      // Persist duty quotas so creation and auto-allocation strictly respect admin-configured quotas
      try {
        await facultyApi.saveDutyQuotas({ raw_text: quotaRawText, quotas: mergedQuotas });
      } catch (qErr) {
        console.warn('Could not save duty quotas before schedule generation:', qErr);
      }

      const oneCreditPayload = includeOneCreditSubject ? (
        oneCreditEntries
          .filter(e => e.semester_id && e.subject_id)
          .map(e => ({
            semester_id: parseInt(e.semester_id),
            subject_id: parseInt(e.subject_id),
            exam_date: e.exam_date || wholeStartDate,
            start_time: e.start_time,
            end_time: e.end_time
          }))
      ) : [];

      const res = await cieApi.setupAllSemesters(cieId, {
        start_date: wholeStartDate,
        included_semesters: wholeSelectedSemesters,
        morning_start: wholeMorningStart,
        morning_end: wholeMorningEnd,
        afternoon_start: wholeAfternoonStart,
        afternoon_end: wholeAfternoonEnd,
        semester_timings: semesterTimings,
        one_credit_subjects: oneCreditPayload,
        clear_all: false, // Preserves other semesters!
        faculty_quotas: mergedQuotas,
        faculty_quotas_text: quotaRawText,
        squad_faculty_ids: squadFacultyIds,
        squad_quotas: squadQuotaMap
      });

      let extraMsg = '';
      if (autoAllocateAfterSchedule) {
        try {
          // Target only the newly created semesters to avoid interrupting other semesters
          const targetSemDbIds = [
            ...wholeSelectedSemesters.map((sNum) => safeSemesters.find((s) => s.sem_number === sNum)?.id),
            ...(includeOneCreditSubject ? oneCreditEntries.map(e => parseInt(e.semester_id)).filter(Boolean) : [])
          ].filter(Boolean);

          const allocRes = await allocationApi.generate(cieId, null, targetSemDbIds);
          const allocatedCount = allocRes.data?.stats?.total_allocated || 0;
          const conflictsCount = allocRes.data?.stats?.total_conflicts || 0;
          extraMsg = ` & Allocated ${allocatedCount} duties (${conflictsCount} conflicts)`;
        } catch (allocErr) {
          console.error('Auto-allocation failed:', allocErr);
        }
      }

      setIsWholeScheduleModalOpen(false);
      showToast((res.data?.message || 'Successfully configured CIE examination schedule!') + extraMsg);
      loadSessions(cieId);
      loadDutyQuotas();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to create whole CIE schedule');
    } finally {
      setIsSubmittingWholeSchedule(false);
    }
  };

  useEffect(() => {
    loadMetadata();
    loadDutyQuotas();
  }, []);

  useEffect(() => {
    if (selectedCieId) {
      loadSessions(selectedCieId);
    }
  }, [selectedCieId]);

  // Load subjects when dutySemesterId changes in Create Duty modal
  useEffect(() => {
    if (dutySemesterId) {
      academicApi.getSubjects(dutySemesterId).then((res) => {
        const subs = Array.isArray(res.data) ? res.data : [];
        setDutySubjectsList(subs);
        if (subs.length > 0) setDutySubjectId(subs[0].id.toString());
      });
    }
  }, [dutySemesterId]);

  // Load subjects when formSemesterId changes in Session modal
  useEffect(() => {
    if (formSemesterId) {
      academicApi.getSubjects(formSemesterId).then((res) => {
        const subs = Array.isArray(res.data) ? res.data : [];
        setSubjectsList(subs);
        if (subs.length > 0) setFormSubjectId(subs[0].id.toString());
      });
    }
  }, [formSemesterId]);

  // Load subjects when editSemesterId changes in Edit Duty modal
  useEffect(() => {
    if (editSemesterId) {
      academicApi.getSubjects(editSemesterId).then((res) => {
        const subs = Array.isArray(res.data) ? res.data : [];
        setEditSubjectsList(subs);
      });
    }
  }, [editSemesterId]);

  // Real-time conflict analysis for Edit Duty modal against 3rd sem timetable
  useEffect(() => {
    if (isEditDutyModalOpen && editDate && editStartTime && editEndTime) {
      fetchEditConflicts(editDate, editStartTime, editEndTime);
    }
  }, [isEditDutyModalOpen, editDate, editStartTime, editEndTime]);

  // Real-time conflict analysis for Create Duty modal against 3rd sem timetable
  useEffect(() => {
    if (isCreateDutyModalOpen && dutyDate && dutyStartTime && dutyEndTime) {
      allocationApi.checkFacultyConflicts({
        date: dutyDate,
        start_time: dutyStartTime,
        end_time: dutyEndTime,
        buffer_minutes: 60
      }).then((res) => {
        const map = {};
        (res.data?.faculty_analysis || []).forEach((f) => {
          map[f.faculty_id] = f;
        });
        setDutyFacultyConflicts(map);
      }).catch((e) => console.error(e));
    }
  }, [isCreateDutyModalOpen, dutyDate, dutyStartTime, dutyEndTime]);


  const loadMetadata = async () => {
    try {
      const [cRes, sRes, fRes] = await Promise.all([
        cieApi.getAll(),
        academicApi.getSemesters(),
        facultyApi.getAll({ status: 'active' })
      ]);
      const ciesData = Array.isArray(cRes.data) ? cRes.data : (cRes.data?.cies || []);
      const semsData = Array.isArray(sRes.data) ? sRes.data : (sRes.data?.semesters || []);
      const facsData = Array.isArray(fRes.data) ? fRes.data : (fRes.data?.faculty || []);

      setCies(ciesData);
      setSemesters(semsData);
      setFacultyList(facsData);

      const urlCie = searchParams.get('cie_id');
      if (urlCie) {
        setSelectedCieId(urlCie);
        const matched = ciesData.find((c) => c.id.toString() === urlCie.toString());
        if (matched) {
          const isEv = (matched.name || '').toLowerCase().includes('even');
          setSelectedCycle(isEv ? 'even' : 'odd');
          const num = (matched.name || '').includes('III') ? '3' : (matched.name || '').includes('II') ? '2' : '1';
          setSelectedCieNumber(num);
        }
      } else if (ciesData.length > 0) {
        const active = ciesData.find((c) => c.is_current) || ciesData[0];
        if (active) {
          const isEv = (active.name || '').toLowerCase().includes('even');
          setSelectedCycle(isEv ? 'even' : 'odd');
          const num = (active.name || '').includes('III') ? '3' : (active.name || '').includes('II') ? '2' : '1';
          setSelectedCieNumber(num);
          setSelectedCieId(active.id.toString());
        }
      }

      if (semsData.length > 0) {
        setDutySemesterId(semsData[0].id.toString());
        setFormSemesterId(semsData[0].id.toString());
      }
    } catch (err) {
      console.error('Error loading schedule metadata:', err);
    }
  };

  // Compute Active CIE matching selectedYear, selectedCycle ('odd' or 'even'), and selectedCieNumber ('1', '2', '3')
  const activeCie = useMemo(() => {
    if (!cies.length) return null;
    const targetName = selectedCieNumber === '1' ? 'CIE-I' : selectedCieNumber === '2' ? 'CIE-II' : 'CIE-III';

    // 1. Match both selectedYear and target CIE name
    const match = cies.find((c) => (c.academic_year || '').trim() === (selectedYear || '').trim() && c.name === targetName);
    if (match) return match;

    // 2. Any CIE in selectedYear
    const anyInYear = cies.find((c) => (c.academic_year || '').trim() === (selectedYear || '').trim());
    if (anyInYear) return anyInYear;

    // 3. Fallback
    return cies.find((c) => c.id.toString() === selectedCieId) || cies[0];
  }, [cies, selectedYear, selectedCycle, selectedCieNumber, selectedCieId]);

  // Sync selectedCieId with activeCie
  useEffect(() => {
    if (activeCie && activeCie.id?.toString() !== selectedCieId) {
      setSelectedCieId(activeCie.id.toString());
      setSelectedSemFilter('');
    }
  }, [activeCie]);

  const handleCycleChange = (cycle) => {
    setSelectedCycle(cycle);
    setSelectedSemFilter('');
  };

  const handleCieNumberChange = (num) => {
    setSelectedCieNumber(num);
    setSelectedSemFilter('');
    const targetName = num === '1' ? 'CIE-I' : num === '2' ? 'CIE-II' : 'CIE-III';
    const matched = cies.find((c) => (c.academic_year || '').trim() === (selectedYear || '').trim() && c.name === targetName);
    if (matched) {
      setSelectedCieId(matched.id.toString());
    }
  };

  const loadSessions = async (cieId) => {
    if (!cieId) return;
    setLoading(true);
    try {
      const res = await cieApi.getSessions(cieId);
      const sessData = Array.isArray(res.data) ? res.data : (res.data?.sessions || []);
      setSessions(sessData);
    } catch (err) {
      console.error('Error fetching sessions:', err);
      setSessions([]);
    } finally {
      setLoading(false);
    }
  };

  const showToast = (msg) => {
    setSuccessToast(msg);
    setTimeout(() => setSuccessToast(null), 3500);
  };



  const handleSetAttendance = async (dutyId, status) => {
    if (!dutyId) {
      alert('No assigned duty record found for this room slot.');
      return;
    }
    try {
      await allocationApi.updateAttendance(dutyId, status);
      showToast(`Invigilator marked as ${status}.`);
      loadSessions(selectedCieId);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to update attendance');
    }
  };

  const handleOpenEmergencyStandby = async (row) => {
    if (!row.dutyId) {
      alert('No assigned duty found for this room slot.');
      return;
    }
    setStandbyRow(row);
    setIsStandbyModalOpen(true);
    setIsLoadingStandby(true);
    try {
      // Automatically record status as ABSENT
      await allocationApi.updateAttendance(row.dutyId, 'ABSENT');
      const res = await allocationApi.getEmergencyStandby(row.dutyId);
      setStandbyList(res.data?.available_standby || []);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to load emergency standby faculty');
      setStandbyList([]);
    } finally {
      setIsLoadingStandby(false);
    }
  };

  const handleEmergencyReassign = async (facultyId) => {
    if (!standbyRow?.dutyId || !facultyId) return;
    setIsReassigningStandby(true);
    try {
      await allocationApi.emergencyReassign(standbyRow.dutyId, {
        faculty_id: facultyId,
        reason: `Emergency replacement for ${standbyRow.allocated_faculty?.name || 'Absent Invigilator'}`
      });
      showToast('Emergency standby invigilator deployed & checked in successfully!');
      setIsStandbyModalOpen(false);
      setStandbyRow(null);
      loadSessions(selectedCieId);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to deploy emergency standby');
    } finally {
      setIsReassigningStandby(false);
    }
  };

  // Open "Create Duty" Modal
  const handleOpenCreateDutyModal = () => {
    if (semesters.length > 0) {
      setDutySemesterId(semesters[0].id.toString());
    }
    setDutyDate('2026-09-10');
    setDutyStartTime('09:00');
    setDutyEndTime('10:00');
    setDutyRooms([
      { id: 1, room_number: 'AI301', student_start: 1, student_end: 29, faculty_id: '' },
      { id: 2, room_number: 'AI302', student_start: 30, student_end: 60, faculty_id: '' }
    ]);
    setDutyType('Invigilation');
    setDutyNotes('');
    setIsCreateDutyModalOpen(true);
  };

  const handleAddDutyRoom = () => {
    const nextId = Date.now();
    const nextRoom = dutyRooms.length === 0 ? 'AI301' : dutyRooms.length === 1 ? 'AI302' : `AI30${dutyRooms.length + 1}`;
    const lastRoom = dutyRooms[dutyRooms.length - 1];
    const nextStart = lastRoom ? parseInt(lastRoom.student_end || 0) + 1 : 1;
    const nextEnd = nextStart + 29;

    setDutyRooms([
      ...dutyRooms,
      { id: nextId, room_number: nextRoom, student_start: nextStart, student_end: nextEnd, faculty_id: '' }
    ]);
  };

  const handleRemoveDutyRoom = (id) => {
    if (dutyRooms.length <= 1) {
      alert('At least one examination room is required.');
      return;
    }
    setDutyRooms(dutyRooms.filter((r) => r.id !== id));
  };

  const handleDutyRoomChange = (id, field, val) => {
    setDutyRooms(dutyRooms.map((r) => (r.id === id ? { ...r, [field]: val } : r)));
  };

  // Submit "Create Duty" (creates duties for AI301 & AI302 in one go)
  const handleSaveNewDuty = async (e) => {
    e.preventDefault();
    if (!dutySemesterId || !dutySubjectId || !dutyDate) {
      alert('Please select Semester, Subject, and Date.');
      return;
    }

    setIsSubmittingDuty(true);
    try {
      await allocationApi.createDuty({
        cie_id: parseInt(selectedCieId) || 1,
        semester_id: parseInt(dutySemesterId),
        subject_id: parseInt(dutySubjectId),
        exam_date: dutyDate,
        start_time: dutyStartTime,
        end_time: dutyEndTime,
        duty_type: dutyType,
        override_reason: dutyNotes.trim() || 'Direct administrative duty creation',
        rooms: dutyRooms.map((r) => ({
          room_number: r.room_number.trim().toUpperCase(),
          student_start: parseInt(r.student_start) || 1,
          student_end: parseInt(r.student_end) || (r.room_number.trim().toUpperCase() === 'AI301' ? 29 : 60),
          room_capacity: 30,
          faculty_id: r.faculty_id ? parseInt(r.faculty_id) : null,
          duty_type: dutyType
        }))
      });

      setIsCreateDutyModalOpen(false);
      showToast(`Created examination duties for rooms ${dutyRooms.map((r) => r.room_number).join(' & ')}.`);
      loadSessions(selectedCieId);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to create duties');
    } finally {
      setIsSubmittingDuty(false);
    }
  };

  // Open "Reassign / Assign" Modal for existing room duty row with live 3rd sem clash check
  const handleOpenReassignModal = (row) => {
    setReassignRow(row);
    setReassignFacultyId(row.allocated_faculty?.id?.toString() || '');
    setReassignDutyType(row.duty_type || 'Invigilation');
    setReassignNotes('');
    setReassignAlsoAssignAll(true);
    setIsReassignModalOpen(true);

    if (row.exam_date && row.start_time && row.end_time) {
      allocationApi.checkFacultyConflicts({
        date: row.exam_date,
        start_time: row.start_time,
        end_time: row.end_time,
        buffer_minutes: 60
      }).then((res) => {
        const map = {};
        (res.data?.faculty_analysis || []).forEach((f) => {
          map[f.faculty_id] = f;
        });
        setReassignFacultyConflicts(map);

        // If currently unallocated, pre-select the best conflict-free candidate!
        if (!row.allocated_faculty?.id) {
          const candidate = safeFacultyList.find((f) => {
            if (f.only_squad_duty || f.id === 1 || f.name?.includes('Arjun') || !f.eligible_for_duty) return false;
            const c = map[f.id];
            return c && c.can_invigilate && !c.has_3rd_sem_clash;
          });
          if (candidate) {
            setReassignFacultyId(candidate.id.toString());
          }
        }
      }).catch((err) => console.error('Failed to fetch reassign conflicts:', err));
    }
  };

  // Submit Reassign
  const handleSaveReassign = async (e) => {
    e.preventDefault();
    if (!reassignRow) return;

    // Check if selected faculty has a 3rd sem clash
    const selectedFid = parseInt(reassignFacultyId);
    const conf = reassignFacultyConflicts[selectedFid];
    if (conf?.has_3rd_sem_clash && reassignDutyType === 'Invigilation') {
      const confirmOverride = window.confirm(
        `⚠️ WARNING: ${conf.name} has regular 3rd semester classes (${conf.clash_details.join(', ')}) within +/- 60 minutes!\n\n` +
        `Institutional policy strictly protects 3rd sem regular classes.\nDo you still wish to manually override?`
      );
      if (!confirmOverride) return;
    }

    setIsSubmittingReassign(true);
    try {
      await allocationApi.createDuty({
        exam_session_id: reassignRow.sessionId,
        exam_room_id: reassignRow.roomId,
        faculty_id: reassignFacultyId ? parseInt(reassignFacultyId) : null,
        duty_type: reassignDutyType,
        override_reason: reassignNotes.trim() || 'Manual Administrative Reassignment'
      });

      setIsReassignModalOpen(false);
      const facName = facultyList.find((f) => f.id === parseInt(reassignFacultyId))?.name || 'Unassigned';

      // If user requested to assign all remaining duties for everyone simultaneously
      if (reassignAlsoAssignAll && selectedCieId && allDutyRows.some(r => r.id !== reassignRow.id && (!r.allocated_faculty || r.status === 'PENDING'))) {
        try {
          await allocationApi.generate(selectedCieId);
          showToast(`Room ${reassignRow.room_number} assigned to ${facName}, and all remaining duties automatically allocated for everyone!`);
        } catch (genErr) {
          console.warn('Auto-allocate remaining after assign warning:', genErr);
          showToast(`Room ${reassignRow.room_number} duty assigned to ${facName}.`);
        }
      } else {
        showToast(`Room ${reassignRow.room_number} duty assigned to ${facName}.`);
      }

      await loadSessions(selectedCieId);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to reassign duty');
    } finally {
      setIsSubmittingReassign(false);
    }
  };

  // ==========================================
  // EDIT DUTY & SESSION HANDLERS
  // ==========================================
  const fetchEditConflicts = async (dateVal, stVal, etVal) => {
    setIsLoadingConflicts(true);
    try {
      const res = await allocationApi.checkFacultyConflicts({
        date: dateVal,
        start_time: stVal,
        end_time: etVal,
        semester_id: editSemesterId || undefined,
        buffer_minutes: 60
      });
      const map = {};
      (res.data?.faculty_analysis || []).forEach((f) => {
        map[f.faculty_id] = f;
      });
      setEditFacultyConflicts(map);
    } catch (err) {
      console.error('Failed to fetch edit conflicts:', err);
    } finally {
      setIsLoadingConflicts(false);
    }
  };

  const handleOpenEditDutyModal = (row) => {
    const sess = row.session || safeSessions.find((s) => s.id === row.sessionId);
    if (!sess) return;

    setEditSessionId(sess.id);
    setEditSemesterId(sess.semester_id?.toString() || '');
    setEditSubjectId(sess.subject_id?.toString() || '');
    setEditDate(sess.exam_date || '2026-09-10');
    setEditStartTime(sess.start_time || '09:00');
    setEditEndTime(sess.end_time || '10:00');
    setEditTotalStudents(sess.total_students || 60);
    setEditNotes('');

    // Prepopulate rooms with assigned duties
    let initRooms = [];
    if (sess.exam_rooms && sess.exam_rooms.length > 0) {
      initRooms = sess.exam_rooms.map((r) => {
        const rDuty = (sess.duties || []).find((d) => d.exam_room_id === r.id);
        const facId = r.allocated_faculty?.id || rDuty?.faculty_id || '';
        return {
          id: r.id,
          room_number: r.room_number || 'AI301',
          student_start: r.student_start || 1,
          student_end: r.student_end || 29,
          room_capacity: r.room_capacity || 30,
          faculty_id: facId ? facId.toString() : '',
          duty_type: rDuty?.duty_type || 'Invigilation',
          override_reason: rDuty?.override_reason || ''
        };
      });
    } else {
      initRooms = [
        { id: 1, room_number: 'AI301', student_start: 1, student_end: 29, room_capacity: 30, faculty_id: '', duty_type: 'Invigilation' },
        { id: 2, room_number: 'AI302', student_start: 30, student_end: 60, room_capacity: 30, faculty_id: '', duty_type: 'Invigilation' }
      ];
    }
    setEditRooms(initRooms);

    if (sess.semester_id) {
      academicApi.getSubjects(sess.semester_id).then((res) => {
        const subs = Array.isArray(res.data) ? res.data : [];
        setEditSubjectsList(subs);
      });
    }

    fetchEditConflicts(sess.exam_date, sess.start_time, sess.end_time);
    setApplyToAllSlotDutiesToday(true);
    setApplyToAllDaysSlot(false);
    setIsEditDutyModalOpen(true);
  };

  const handleAddEditRoom = () => {
    const nextId = Date.now();
    const nextRoom = editRooms.length === 0 ? 'AI301' : editRooms.length === 1 ? 'AI302' : `AI30${editRooms.length + 1}`;
    const last = editRooms[editRooms.length - 1];
    const nextStart = last ? parseInt(last.student_end || 0) + 1 : 1;
    const nextEnd = nextStart + 29;
    setEditRooms([
      ...editRooms,
      { id: nextId, room_number: nextRoom, student_start: nextStart, student_end: nextEnd, room_capacity: 30, faculty_id: '', duty_type: 'Invigilation' }
    ]);
  };

  const handleRemoveEditRoom = (id) => {
    if (editRooms.length <= 1) {
      alert('At least one examination room is required.');
      return;
    }
    setEditRooms(editRooms.filter((r) => r.id !== id));
  };

  const handleEditRoomChange = (id, field, val) => {
    setEditRooms(editRooms.map((r) => (r.id === id ? { ...r, [field]: val } : r)));
  };

  const handleApplyDualRoomPreset = () => {
    setEditRooms([
      {
        id: editRooms[0]?.id || 1,
        room_number: 'AI301',
        student_start: 1,
        student_end: 29,
        room_capacity: 30,
        faculty_id: editRooms[0]?.faculty_id || '',
        duty_type: 'Invigilation'
      },
      {
        id: editRooms[1]?.id || 2,
        room_number: 'AI302',
        student_start: 30,
        student_end: 60,
        room_capacity: 31,
        faculty_id: editRooms[1]?.faculty_id || '',
        duty_type: 'Invigilation'
      }
    ]);
    showToast('Applied dual-room preset: AI301 (Roll 1–29) & AI302 (Roll 30–60).');
  };

  const handleApplySingleRoomPreset = () => {
    setEditRooms([
      {
        id: editRooms[0]?.id || 1,
        room_number: 'AI301',
        student_start: 1,
        student_end: 60,
        room_capacity: 60,
        faculty_id: editRooms[0]?.faculty_id || '',
        duty_type: 'Invigilation'
      }
    ]);
    showToast('Applied single-room preset: AI301 (Roll 1–60) [For 7th Sem Open Elective].');
  };

  const handleAutoAssignConflictFreeFaculty = () => {
    const assignedFids = new Set();
    const updated = editRooms.map((r) => {
      // Find eligible faculty who can invigilate (no 3rd sem clash, not squad only)
      const candidate = safeFacultyList.find((f) => {
        if (assignedFids.has(f.id.toString())) return false;
        const conf = editFacultyConflicts[f.id];
        return conf && conf.can_invigilate;
      });
      if (candidate) {
        assignedFids.add(candidate.id.toString());
        return { ...r, faculty_id: candidate.id.toString() };
      }
      return r;
    });
    setEditRooms(updated);
    showToast('Assigned conflict-free faculty based on 3rd sem timetable.');
  };

  const handleSaveEditDuty = async (e) => {
    e.preventDefault();
    if (!editSessionId) return;

    // Check if any assigned faculty has a 3rd sem clash
    const clashing = [];
    editRooms.forEach((r) => {
      if (r.faculty_id) {
        const conf = editFacultyConflicts[parseInt(r.faculty_id)];
        if (conf?.has_3rd_sem_clash) {
          clashing.push(`${conf.name} in Room ${r.room_number} (${conf.clash_details.join(', ')})`);
        }
      }
    });

    if (clashing.length > 0) {
      const confirmProceed = window.confirm(
        `⚠️ WARNING: The following assigned faculty have regular 3rd semester classes within +/- 60 minutes:\n\n` +
        clashing.join('\n') +
        `\n\nInstitutional policy strictly protects 3rd sem classes. Do you still want to proceed with this manual override?`
      );
      if (!confirmProceed) return;
    }

    setIsSubmittingEdit(true);
    try {
      const totalStudents = editRooms.reduce(
        (acc, r) => acc + Math.max(0, parseInt(r.student_end || 0) - parseInt(r.student_start || 0) + 1),
        0
      );

      const res = await cieApi.updateSession(editSessionId, {
        exam_date: editDate,
        start_time: editStartTime,
        end_time: editEndTime,
        semester_id: parseInt(editSemesterId),
        subject_id: parseInt(editSubjectId),
        total_students: totalStudents || parseInt(editTotalStudents) || 60,
        auto_assign_conflict_free: true,
        auto_reassign_conflicts: true,
        apply_to_all_slot_duties_today: applyToAllSlotDutiesToday,
        apply_to_all_days_slot: applyToAllDaysSlot,
        cascade_scope: applyToAllDaysSlot ? 'all_days_slot' : (applyToAllSlotDutiesToday ? 'slot_today' : 'session_only'),
        rooms: editRooms.map((r) => ({
          id: typeof r.id === 'number' && r.id < 1000000000 ? r.id : undefined,
          room_number: r.room_number.trim().toUpperCase(),
          student_start: parseInt(r.student_start) || 1,
          student_end: parseInt(r.student_end) || 29,
          room_capacity: parseInt(r.room_capacity) || 30,
          faculty_id: r.faculty_id ? parseInt(r.faculty_id) : null,
          duty_type: r.duty_type || 'Invigilation',
          override_reason: editNotes.trim() || `Manual administrative edit to ${editStartTime}-${editEndTime} with timetable check`
        }))
      });

      setIsEditDutyModalOpen(false);
      const cascadedCount = res.data?.cascaded_count || 0;
      const successMsg = cascadedCount > 0
        ? `Timing updated to ${editStartTime} - ${editEndTime} and applied to ALL duties in this slot on ${editDate}. Respected timetable verified. Reloading page...`
        : `Exam duty timing updated to ${editStartTime} - ${editEndTime}. Respected timetable verified. Reloading page...`;
      showToast(successMsg);
      setTimeout(() => {
        window.location.reload();
      }, 700);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to update exam duty');
      setIsSubmittingEdit(false);
    }
  };

  // ==========================================
  // OVERALL EDIT (5TH, 7TH & 3RD SEM) HANDLERS
  // ==========================================
  const handleOpenOverallEditModal = async () => {
    setIsOverallEditModalOpen(true);
    setOverallLoading(true);
    try {
      const cieId = selectedCieId || (cies.length > 0 ? cies[0].id : 1);
      const res = await cieApi.getSessions(cieId);
      const sessList = Array.isArray(res.data) ? res.data : (res.data?.sessions || []);
      setOverallSessions(sessList);

      const stateMap = {};
      sessList.forEach((s) => {
        stateMap[s.id] = {
          exam_date: s.exam_date || '2026-09-10',
          start_time: s.start_time || '09:00',
          end_time: s.end_time || '10:00',
          semester_id: s.semester_id,
          sem_number: s.sem_number,
          rooms: (s.exam_rooms || []).map((r) => {
            const rDuty = (s.duties || []).find((d) => d.exam_room_id === r.id);
            return {
              id: r.id,
              room_number: r.room_number || 'AI301',
              student_start: r.student_start || 1,
              student_end: r.student_end || 29,
              faculty_id: r.allocated_faculty?.id?.toString() || rDuty?.faculty_id?.toString() || '',
              duty_type: rDuty?.duty_type || 'Invigilation'
            };
          })
        };
      });
      setOverallSessionState(stateMap);

      for (const s of sessList) {
        checkSessionConflictsInOverall(s.id, s.exam_date, s.start_time, s.end_time, s.semester_id, s.sem_number);
      }
    } catch (err) {
      console.error('Error loading overall sessions:', err);
      alert('Failed to load overall CIE examination sessions.');
    } finally {
      setOverallLoading(false);
    }
  };

  const checkSessionConflictsInOverall = async (sessId, dateVal, stVal, etVal, semIdVal, semNumVal) => {
    try {
      const res = await allocationApi.checkFacultyConflicts({
        date: dateVal,
        start_time: stVal,
        end_time: etVal,
        semester_id: semIdVal,
        sem_number: semNumVal,
        buffer_minutes: 60
      });
      const map = {};
      (res.data?.faculty_analysis || []).forEach((f) => {
        map[f.faculty_id] = f;
      });
      setOverallConflictState((prev) => ({
        ...prev,
        [sessId]: {
          conflicts: map,
          respected_sems: res.data?.respected_regular_semesters || []
        }
      }));
    } catch (e) {
      console.error(e);
    }
  };

  const handleOverallSessionTimeChange = (sessId, newSt, newEt) => {
    setOverallSessionState((prev) => {
      const cur = prev[sessId];
      if (!cur) return prev;
      const targetDate = cur.exam_date;
      const origSt = cur.start_time;

      const nextState = { ...prev };
      nextState[sessId] = { ...cur, start_time: newSt, end_time: newEt };
      checkSessionConflictsInOverall(sessId, targetDate, newSt, newEt, cur.semester_id, cur.sem_number);

      // Automatically cascade time redirect to all other sessions on that day in this slot
      Object.keys(prev).forEach((otherId) => {
        if (otherId === sessId.toString()) return;
        const other = prev[otherId];
        if (other.exam_date === targetDate && other.start_time === origSt) {
          nextState[otherId] = { ...other, start_time: newSt, end_time: newEt };
          checkSessionConflictsInOverall(otherId, targetDate, newSt, newEt, other.semester_id, other.sem_number);
        }
      });

      return nextState;
    });
  };

  const handleOverallSessionDateChange = (sessId, newDate) => {
    setOverallSessionState((prev) => {
      const cur = prev[sessId];
      if (!cur) return prev;
      const updated = { ...cur, exam_date: newDate };
      checkSessionConflictsInOverall(sessId, newDate, updated.start_time, updated.end_time, updated.semester_id, updated.sem_number);
      return { ...prev, [sessId]: updated };
    });
  };

  const handleOverallSessionRoomFacultyChange = (sessId, roomId, facId) => {
    setOverallSessionState((prev) => {
      const cur = prev[sessId];
      if (!cur) return prev;
      const newRooms = cur.rooms.map((r) => (r.id === roomId ? { ...r, faculty_id: facId } : r));
      return { ...prev, [sessId]: { ...cur, rooms: newRooms } };
    });
  };

  const handleOverallAutoAssignForSession = (sessId) => {
    const cur = overallSessionState[sessId];
    const confObj = overallConflictState[sessId]?.conflicts || {};
    if (!cur) return;
    const assignedIds = new Set();
    const newRooms = cur.rooms.map((r) => {
      const candidate = safeFacultyList.find((f) => {
        if (assignedIds.has(f.id.toString())) return false;
        const c = confObj[f.id];
        return c && c.can_invigilate;
      });
      if (candidate) {
        assignedIds.add(candidate.id.toString());
        return { ...r, faculty_id: candidate.id.toString() };
      }
      return r;
    });
    setOverallSessionState((prev) => ({
      ...prev,
      [sessId]: { ...cur, rooms: newRooms }
    }));
    showToast('Auto-assigned conflict-free faculty based on respected timetable.');
  };

  const handleSaveSingleSessionInOverall = async (sessId) => {
    const cur = overallSessionState[sessId];
    if (!cur) return;
    setIsSavingOverall(true);
    try {
      const res = await cieApi.updateSession(sessId, {
        exam_date: cur.exam_date,
        start_time: cur.start_time,
        end_time: cur.end_time,
        auto_assign_conflict_free: true,
        auto_reassign_conflicts: true,
        apply_to_all_slot_duties_today: true,
        cascade_scope: 'slot_today',
        rooms: cur.rooms.map((r) => ({
          id: r.id,
          room_number: r.room_number,
          student_start: r.student_start,
          student_end: r.student_end,
          faculty_id: r.faculty_id ? parseInt(r.faculty_id) : null,
          duty_type: r.duty_type || 'Invigilation'
        }))
      });
      setIsOverallEditModalOpen(false);
      const cascadedCount = res.data?.cascaded_count || 0;
      const successMsg = cascadedCount > 0
        ? `Duty time updated to ${cur.start_time} - ${cur.end_time} and cascaded to all duties in this slot on ${cur.exam_date}. Respected timetable verified. Reloading page...`
        : `Duty time updated to ${cur.start_time} - ${cur.end_time}. Respected timetable verified. Reloading page...`;
      showToast(successMsg);
      setTimeout(() => {
        window.location.reload();
      }, 700);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to update session');
      setIsSavingOverall(false);
    }
  };

  const handleSaveAllOverallSessions = async () => {
    setIsSavingOverall(true);
    try {
      const updates = Object.keys(overallSessionState).map((sessId) => {
        const item = overallSessionState[sessId];
        return {
          id: parseInt(sessId),
          session_id: parseInt(sessId),
          exam_date: item.exam_date,
          start_time: item.start_time,
          end_time: item.end_time,
          auto_assign: true,
          rooms: item.rooms.map((r) => ({
            id: r.id,
            room_number: r.room_number,
            student_start: r.student_start,
            student_end: r.student_end,
            faculty_id: r.faculty_id ? parseInt(r.faculty_id) : null,
            duty_type: r.duty_type || 'Invigilation'
          }))
        };
      });

      await cieApi.batchUpdateSessions({
        sessions: updates,
        auto_assign_conflict_free: true,
        auto_reassign_conflicts: true
      });

      setIsOverallEditModalOpen(false);
      showToast('All examination duties and timings updated successfully. Respected timetables verified. Reloading page...');
      setTimeout(() => {
        window.location.reload();
      }, 700);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to update sessions');
      setIsSavingOverall(false);
    }
  };



  // Multi-room auto-splitting helpers for full session modal
  const handleAddRoomRow = () => {
    const nextId = Date.now();
    const defaultRoom = formRooms.length === 0 ? 'AI301' : formRooms.length === 1 ? 'AI302' : `AI30${formRooms.length + 1}`;
    setFormRooms([
      ...formRooms,
      { id: nextId, room_number: defaultRoom, room_capacity: 30, student_start: 1, student_end: 30 }
    ]);
  };

  const handleRemoveRoomRow = (id) => {
    if (formRooms.length <= 1) {
      alert('An examination session must have at least one room.');
      return;
    }
    setFormRooms(formRooms.filter((r) => r.id !== id));
  };

  const handleRoomChange = (id, field, val) => {
    setFormRooms(formRooms.map((r) => (r.id === id ? { ...r, [field]: val } : r)));
  };

  const handleAutoSplit = () => {
    const total = parseInt(formTotalStudents) || 60;
    if (formRooms.length === 0) return;

    let currentStart = 1;
    let remaining = total;
    const updated = formRooms.map((r, i) => {
      const cap = parseInt(r.room_capacity) || 30;
      let count = 0;
      if (i === formRooms.length - 1) {
        count = Math.max(0, remaining);
      } else {
        count = Math.min(cap, remaining);
      }
      const end = currentStart + count - 1;
      const res = {
        ...r,
        student_start: currentStart,
        student_end: Math.max(currentStart, end)
      };
      currentStart = end + 1;
      remaining -= count;
      return res;
    });

    setFormRooms(updated);
    showToast('Students partitioned across rooms based on capacity.');
  };

  const handleAddFullSession = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        semester_id: formSemesterId,
        subject_id: formSubjectId,
        exam_date: formDate,
        start_time: formStartTime,
        end_time: formEndTime,
        total_students: parseInt(formTotalStudents) || 60,
        rooms: formRooms.map((r) => ({
          room_number: r.room_number,
          room_capacity: parseInt(r.room_capacity) || 30,
          student_start: parseInt(r.student_start) || 1,
          student_end: parseInt(r.student_end) || 30
        }))
      };

      await cieApi.createSession(selectedCieId, payload);
      setIsSessionModalOpen(false);
      showToast('Exam session with room splitting created successfully.');
      loadSessions(selectedCieId);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to create exam session');
    }
  };

  const handleDeleteSession = async (id) => {
    if (window.confirm('Are you sure you want to remove this examination session and all associated room duties?')) {
      try {
        await cieApi.deleteSession(id);
        showToast('Exam session removed.');
        loadSessions(selectedCieId);
      } catch (err) {
        alert('Failed to delete session');
      }
    }
  };

  const safeFacultyList = Array.isArray(facultyList) ? facultyList : (facultyList?.faculty || []);
  const safeSessions = Array.isArray(sessions) ? sessions : [];
  const safeSemesters = Array.isArray(semesters) ? semesters : [];

  const totalSquadQuota = useMemo(() => {
    return safeFacultyList
      .filter((f) => squadFacultyIds.includes(f.id))
      .reduce((sum, f) => {
        const q = squadQuotaMap[f.id] !== undefined
          ? squadQuotaMap[f.id]
          : (quotaMap[f.id] !== undefined && quotaMap[f.id] <= 12 ? quotaMap[f.id] : 6);
        return sum + (parseInt(q) || 0);
      }, 0);
  }, [safeFacultyList, squadFacultyIds, squadQuotaMap, quotaMap]);

  // Flatten sessions into room-wise duty slots (ONE SUBJECT -> MULTIPLE ROOMS -> ONE DUTY PER ROOM)
  const allDutyRows = useMemo(() => {
    const rows = [];
    safeSessions.forEach((sess) => {
      const squadDuty = (sess.duties || []).find((d) => d.duty_type === 'Squad Duty');
      const squadFac = sess.squad_faculty || (squadDuty && squadDuty.faculty_id ? {
        id: squadDuty.faculty_id,
        name: squadDuty.faculty_name || squadDuty.faculty?.name,
        designation: squadDuty.faculty_designation || squadDuty.faculty?.designation
      } : null);

      const rooms = sess.exam_rooms || [];
      if (rooms.length > 0) {
        rooms.forEach((r) => {
          rows.push({
            id: `${sess.id}-${r.id}`,
            sessionId: sess.id,
            roomId: r.id,
            dutyId: r.duty_id || (sess.duties?.find((d) => d.exam_room_id === r.id)?.id),
            attendance_status: r.attendance_status || (sess.duties?.find((d) => d.exam_room_id === r.id)?.attendance_status) || 'PENDING',
            check_in_time: r.check_in_time,
            session: sess,
            room: r,
            exam_date: sess.exam_date,
            start_time: sess.start_time,
            end_time: sess.end_time,
            time_slot: `${sess.start_time} - ${sess.end_time}`,
            semester_id: sess.semester_id,
            semester_name: sess.semester_name,
            sem_number: sess.sem_number,
            subject_code: sess.subject_code,
            subject_name: sess.subject_name,
            total_students: sess.total_students,
            room_number: r.room_number,
            student_range: r.student_range || `${r.student_start}–${r.student_end}`,
            student_count: r.student_count,
            allocated_faculty: r.allocated_faculty,
            duty_type: 'Invigilation',
            squad_faculty: squadFac,
            status: r.status || (r.allocated_faculty ? 'ASSIGNED' : 'PENDING')
          });
        });
      } else {
        rows.push({
          id: `${sess.id}-default`,
          sessionId: sess.id,
          roomId: null,
          dutyId: sess.duties?.[0]?.id,
          attendance_status: sess.duties?.[0]?.attendance_status || 'PENDING',
          check_in_time: sess.duties?.[0]?.check_in_time,
          session: sess,
          room: null,
          exam_date: sess.exam_date,
          start_time: sess.start_time,
          end_time: sess.end_time,
          time_slot: `${sess.start_time} - ${sess.end_time}`,
          semester_id: sess.semester_id,
          semester_name: sess.semester_name,
          sem_number: sess.sem_number,
          subject_code: sess.subject_code,
          subject_name: sess.subject_name,
          total_students: sess.total_students,
          room_number: sess.room_number || 'AI301',
          student_range: `1–${sess.total_students || 60}`,
          student_count: sess.total_students || 60,
          allocated_faculty: sess.duties?.[0]?.faculty_name ? { name: sess.duties[0].faculty_name } : null,
          duty_type: 'Invigilation',
          squad_faculty: squadFac,
          status: sess.status === 'FULLY_ALLOCATED' ? 'ASSIGNED' : 'PENDING'
        });
      }
    });
    return rows;
  }, [safeSessions]);

  // Filter duty rows by semester and search query
  const sem3 = safeSemesters.find((s) => s.sem_number === 3);
  const sem4 = safeSemesters.find((s) => s.sem_number === 4);
  const sem5 = safeSemesters.find((s) => s.sem_number === 5);
  const sem6 = safeSemesters.find((s) => s.sem_number === 6);
  const sem7 = safeSemesters.find((s) => s.sem_number === 7);

  const oddSemIds = [sem3?.id, sem5?.id, sem7?.id].filter(Boolean);
  const evenSemIds = [sem4?.id, sem6?.id].filter(Boolean);

  const sem3DutiesCount = allDutyRows.filter((r) => r.semester_id === sem3?.id).length;
  const sem4DutiesCount = allDutyRows.filter((r) => r.semester_id === sem4?.id).length;
  const sem5DutiesCount = allDutyRows.filter((r) => r.semester_id === sem5?.id).length;
  const sem6DutiesCount = allDutyRows.filter((r) => r.semester_id === sem6?.id).length;
  const sem7DutiesCount = allDutyRows.filter((r) => r.semester_id === sem7?.id).length;

  const oddDutiesCount = allDutyRows.filter((r) => oddSemIds.includes(r.semester_id)).length;
  const evenDutiesCount = allDutyRows.filter((r) => evenSemIds.includes(r.semester_id)).length;

  const isEvenCycle = selectedCycle === 'even';
  const isCie3 = selectedCieNumber === '3' || activeCie?.name?.includes('3') || activeCie?.name?.includes('III');

  // Filter duty rows by semester and search query
  const filteredDutyRows = useMemo(() => {
    return allDutyRows.filter((row) => {
      if (selectedSemFilter === 'odd') {
        if (!oddSemIds.includes(row.semester_id)) return false;
      } else if (selectedSemFilter === 'even') {
        if (!evenSemIds.includes(row.semester_id)) return false;
      } else if (selectedSemFilter && row.semester_id?.toString() !== selectedSemFilter) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchCode = row.subject_code?.toLowerCase().includes(q);
        const matchName = row.subject_name?.toLowerCase().includes(q);
        const matchRoom = row.room_number?.toLowerCase().includes(q);
        const matchFac = row.allocated_faculty?.name?.toLowerCase().includes(q);
        const matchDate = row.exam_date?.includes(q);
        if (!matchCode && !matchName && !matchRoom && !matchFac && !matchDate) {
          return false;
        }
      }
      return true;
    });
  }, [allDutyRows, selectedSemFilter, searchQuery, oddSemIds, evenSemIds]);

  const totalDutiesCount = allDutyRows.length;
  const assignedDutiesCount = allDutyRows.filter((r) => r.allocated_faculty && r.status === 'ASSIGNED').length;
  const pendingDutiesCount = totalDutiesCount - assignedDutiesCount;

  return (
    <div className="space-y-6 font-sans">
      {/* Toast Notification */}
      {successToast && (
        <div className="fixed bottom-5 right-5 z-50 bg-slate-900 text-white px-4 py-3 rounded-xl shadow-xl flex items-center gap-2 text-xs border border-slate-700 animate-in fade-in slide-in-from-bottom-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{successToast}</span>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 1. PROFESSIONAL PAGE HEADER (Title on left, Primary Actions on right)     */}
      {/* ========================================================================= */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
            Examination Schedule & Duty Allocation
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Subject session timetables, room splitting (AI301 & AI302), and invigilator duties.
          </p>
        </div>

        {/* Primary Action: Create Duty */}
        <div className="flex items-center gap-2.5 shrink-0">
          <button
            onClick={() => {
              if (selectedCycle === 'even') {
                setWholeSelectedSemesters([4, 6]);
              } else if (selectedCieNumber === '3') {
                setWholeSelectedSemesters([5, 7]);
              } else {
                setWholeSelectedSemesters([3, 5, 7]);
              }
              setIsWholeScheduleModalOpen(true);
            }}
            className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl text-xs font-bold shadow-sm transition-all cursor-pointer"
            title="Create Examination Duties with Odd/Even semester selection and faculty duty quotas"
          >
            <Sparkles className="w-4 h-4" />
            <span>Create Duty</span>
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. UNIFIED CONTROLS BAR: ACADEMIC YEAR, SEMESTER PARITY & CIE CYCLE       */}
      {/* ========================================================================= */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-3 sm:p-3.5 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        {/* Left Side: Academic Year (2026-27, 2027-28) & Semester Parity */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Academic Year Selector (Cleanly Arranged: 2026-27, 2027-28) */}
          <div className="flex items-center gap-1 bg-slate-100/90 p-1 rounded-xl border border-slate-200 text-xs">
            <span className="text-[11px] font-bold text-slate-500 px-2 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-blue-600" />
              <span>Academic Year:</span>
            </span>
            {academicYears
              .filter((yr) => yr !== '2025-26')
              .sort()
              .map((yr) => (
                <button
                  key={yr}
                  onClick={() => setSelectedYear(yr)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    selectedYear === yr
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                  }`}
                >
                  {yr}
                </button>
              ))}
            <button
              onClick={() => {
                const newY = window.prompt('Enter new Academic Year (e.g. 2028-29):');
                if (newY && newY.trim()) {
                  createYear(newY.trim());
                }
              }}
              className="px-2 py-1 text-blue-600 hover:bg-blue-50 rounded-lg text-xs font-bold transition-colors cursor-pointer"
              title="Add a new academic year cycle"
            >
              + Add Year
            </button>
          </div>

          <div className="hidden sm:block h-6 w-[1px] bg-slate-200" />

          {/* Odd vs Even Semester Switcher */}
          <div className="flex items-center gap-1 bg-slate-100/90 p-1 rounded-xl border border-slate-200">
            <button
              onClick={() => handleCycleChange('odd')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                selectedCycle === 'odd'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
            >
              <span>Odd Sem (3, 5, 7)</span>
            </button>

            <button
              onClick={() => handleCycleChange('even')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                selectedCycle === 'even'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
            >
              <span>Even Sem (4, 6)</span>
            </button>
          </div>
        </div>

        {/* Right Side: CIE Cycle (1, 2, 3) + Status Badge */}
        <div className="flex items-center justify-between lg:justify-end gap-3 pt-2 lg:pt-0 border-t lg:border-t-0 border-slate-100">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">CIE Cycle:</span>
            <div className="flex items-center gap-1 bg-slate-100/90 p-1 rounded-xl border border-slate-200">
              {['1', '2', '3'].map((num) => {
                const isSelected = selectedCieNumber === num;
                return (
                  <button
                    key={num}
                    onClick={() => handleCieNumberChange(num)}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-slate-900 text-white shadow-xs'
                        : 'text-slate-700 hover:text-slate-900 hover:bg-slate-200'
                    }`}
                  >
                    CIE-{num}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="hidden sm:flex text-xs text-slate-500 items-center gap-2 pl-3 border-l border-slate-200">
            <span className="font-semibold text-slate-800">
              {activeCie?.name || `CIE-${selectedCieNumber}`} (AY {selectedYear})
            </span>
            <span className="text-slate-300">•</span>
            <span>
              {selectedCycle === 'even'
                ? 'IV & VI Semesters'
                : (selectedCieNumber === '3' ? 'V & VII Semesters' : 'III, V & VII Semesters')}
            </span>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2.5 UNALLOCATED DUTY SLOTS NOTIFICATION BANNER                            */}
      {/* ========================================================================= */}
      {!loading && allDutyRows.length > 0 && allDutyRows.some(r => !r.allocated_faculty || r.status === 'PENDING') && (
        <div className="bg-amber-50 border border-amber-200/90 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-amber-900 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-amber-100/90 text-amber-700 shrink-0">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <div className="font-bold text-xs sm:text-sm text-amber-950 flex items-center gap-2">
                <span>{allDutyRows.filter(r => !r.allocated_faculty || r.status === 'PENDING').length} Duty Slots Unallocated (Pending)</span>
                <Badge variant="warning">Action Needed</Badge>
              </div>
              <p className="text-[11px] text-amber-800 mt-0.5">
                Faculty members have not been allocated to these rooms yet. Click Auto-Assign to automatically staff 100% of duties with zero timetable clashes.
              </p>
            </div>
          </div>
          <button
            onClick={handleAutoAssignAllDuties}
            disabled={isAutoAssigningAll}
            className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-xl shadow-xs flex items-center justify-center gap-2 shrink-0 transition-all cursor-pointer disabled:opacity-50"
          >
            {isAutoAssigningAll ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Zap className="w-4 h-4 text-amber-200" />
            )}
            <span>{isAutoAssigningAll ? 'Assigning Everyone...' : '⚡ Assign Duties for Everyone Now'}</span>
          </button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. TOOLBAR: SEARCH & DYNAMIC SEMESTER FILTERS                             */}
      {/* ========================================================================= */}
      <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-3">
        {/* Search */}
        <div className="relative min-w-[260px]">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search course, room, faculty, date..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-50 border border-slate-300 text-xs rounded-lg pl-8 pr-3 py-1.5 text-slate-800 placeholder-slate-400 focus:outline-none focus:border-indigo-500"
          />
        </div>

        {/* Right: Dynamic Semester Filters based on Cycle */}
        <div className="flex flex-wrap items-center gap-1.5">
          {/* All Duties Tab */}
          <button
            onClick={() => setSelectedSemFilter('')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              selectedSemFilter === ''
                ? 'bg-slate-900 text-white shadow-sm'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            All ({allDutyRows.length})
          </button>

          {/* Even Semester: 4th & 6th Semesters Only */}
          {selectedCycle === 'even' && (
            <>
              {sem4 && (
                <button
                  onClick={() => setSelectedSemFilter(sem4.id.toString())}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                    selectedSemFilter === sem4.id.toString()
                      ? 'bg-blue-600 text-white shadow-sm font-semibold'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  4th Sem ({sem4DutiesCount})
                </button>
              )}
              {sem6 && (
                <button
                  onClick={() => setSelectedSemFilter(sem6.id.toString())}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                    selectedSemFilter === sem6.id.toString()
                      ? 'bg-blue-600 text-white shadow-sm font-semibold'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  6th Sem ({sem6DutiesCount})
                </button>
              )}
            </>
          )}

          {/* Odd Semester: 3rd (CIE-1 & CIE-2 only), 5th, 7th Semesters */}
          {selectedCycle === 'odd' && (
            <>
              {selectedCieNumber !== '3' && sem3 && (
                <button
                  onClick={() => setSelectedSemFilter(sem3.id.toString())}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                    selectedSemFilter === sem3.id.toString()
                      ? 'bg-blue-600 text-white shadow-sm font-semibold'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  3rd Sem ({sem3DutiesCount})
                </button>
              )}
              {sem5 && (
                <button
                  onClick={() => setSelectedSemFilter(sem5.id.toString())}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                    selectedSemFilter === sem5.id.toString()
                      ? 'bg-blue-600 text-white shadow-sm font-semibold'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  5th Sem ({sem5DutiesCount})
                </button>
              )}
              {sem7 && (
                <button
                  onClick={() => setSelectedSemFilter(sem7.id.toString())}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                    selectedSemFilter === sem7.id.toString()
                      ? 'bg-blue-600 text-white shadow-sm font-semibold'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  7th Sem ({sem7DutiesCount})
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 3. MASTER DUTY SCHEDULE TABLE                                             */}
      {/* ========================================================================= */}
      {loading ? (
        <div className="py-20 text-center text-xs text-slate-400">Loading duty schedule...</div>
      ) : filteredDutyRows.length === 0 ? (
        <div className="p-12 text-center bg-white rounded-xl border border-slate-200 shadow-sm space-y-3">
          <Calendar className="w-10 h-10 text-slate-300 mx-auto" />
          <h4 className="text-sm font-bold text-slate-700">No Exam Duties Found</h4>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            {searchQuery ? 'No duties match your search query.' : 'No examination duties configured for this selection.'}
          </p>
          <button
            onClick={() => {
              if (isEvenCycle) {
                setWholeSelectedSemesters([4, 6]);
              } else if (isCie3) {
                setWholeSelectedSemesters([5, 7]);
              } else {
                setWholeSelectedSemesters([3, 5, 7]);
              }
              setIsWholeScheduleModalOpen(true);
            }}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg shadow-sm"
          >
            Create Duty
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                  <th className="py-3.5 px-4">Date & Slot</th>
                  <th className="py-3.5 px-4">Semester & Course</th>
                  <th className="py-3.5 px-3">Room</th>
                  <th className="py-3.5 px-3">Student Roll Range</th>
                  <th className="py-3.5 px-4">Assigned Invigilator</th>
                  <th className="py-3.5 px-3">Duty Type</th>
                  <th className="py-3.5 px-4">Assigned Squad</th>
                  <th className="py-3.5 px-3 text-center">Status</th>
                  <th className="py-3.5 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredDutyRows.map((row) => {
                  const isAssigned = row.allocated_faculty && (row.status === 'ASSIGNED' || row.status === 'COMPLETED');

                  return (
                    <tr key={row.id} className="hover:bg-slate-50/70 transition-colors">
                      {/* Date & Slot */}
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-900">{row.exam_date}</div>
                        <div className="text-[11px] font-mono text-slate-500 flex items-center gap-1 mt-0.5">
                          <Clock className="w-3 h-3 text-slate-400" />
                          <span>{row.time_slot}</span>
                        </div>
                      </td>

                      {/* Semester & Subject */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase font-mono border ${
                            row.sem_number === 3 ? 'bg-indigo-50 text-indigo-700 border-indigo-200' :
                            row.sem_number === 4 ? 'bg-amber-50 text-amber-700 border-amber-200' :
                            row.sem_number === 5 ? 'bg-blue-50 text-blue-700 border-blue-200' :
                            row.sem_number === 6 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                            row.sem_number === 7 ? 'bg-purple-50 text-purple-700 border-purple-200' :
                            'bg-slate-100 text-slate-700 border-slate-200'
                          }`}>
                            {row.sem_number}th Sem
                          </span>
                          <span className="font-mono font-bold text-slate-900">{row.subject_code}</span>
                        </div>
                        <div className="text-xs text-slate-700 font-medium line-clamp-1">
                          {row.subject_name}
                        </div>
                      </td>

                      {/* Room */}
                      <td className="py-3 px-3">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 font-mono font-bold border border-indigo-200">
                          {row.room_number}
                        </span>
                      </td>

                      {/* Student Roll Range */}
                      <td className="py-3 px-3 font-mono text-slate-700">
                        <div className="font-semibold">{row.student_range}</div>
                        <div className="text-[10px] text-slate-400">({row.student_count} Students)</div>
                      </td>

                      {/* Assigned Faculty */}
                      <td className="py-3 px-4">
                        {isAssigned ? (
                          <div>
                            <div className="font-semibold text-slate-900 flex items-center gap-1.5">
                              <span>{row.allocated_faculty.name}</span>
                            </div>
                            <div className="text-[10px] text-slate-500">
                              {row.allocated_faculty.designation || 'Faculty Member'}
                            </div>
                          </div>
                        ) : (
                          <div className="text-amber-600 font-medium text-[11px] flex items-center gap-1">
                            <AlertCircle className="w-3.5 h-3.5" />
                            <span>Unallocated Slot</span>
                          </div>
                        )}
                      </td>

                      {/* Duty Type */}
                      <td className="py-3 px-3 text-slate-600 font-medium">
                        {row.duty_type}
                      </td>

                      {/* Assigned Squad */}
                      <td className="py-3 px-4">
                        {row.squad_faculty ? (
                          <div className="flex items-center gap-1.5">
                            <span className="p-1 rounded bg-amber-50 text-amber-700 border border-amber-200 shrink-0">
                              <ShieldCheck className="w-3.5 h-3.5 text-amber-600" />
                            </span>
                            <div>
                              <div className="font-semibold text-slate-900 leading-tight">
                                <span>{row.squad_faculty.name}</span>
                              </div>
                              <div className="text-[10px] text-slate-500">{row.squad_faculty.designation || 'Squad Duty Officer'}</div>
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-400 italic text-[11px]">Unassigned</span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="py-3 px-3 text-center">
                        <Badge variant={isAssigned ? 'success' : 'warning'}>
                          {isAssigned ? 'Assigned' : 'Pending'}
                        </Badge>
                      </td>

                      {/* Action */}
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleOpenReassignModal(row)}
                            className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                              isAssigned
                                ? 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 border border-slate-200'
                                : 'bg-blue-600 hover:bg-blue-700 text-white shadow-sm'
                            }`}
                            title="Assign or change faculty"
                          >
                            {isAssigned ? 'Reassign' : 'Assign'}
                          </button>
                          <button
                            onClick={() => handleDeleteSession(row.sessionId)}
                            className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors"
                            title="Delete Exam Session"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
            <span>Showing <strong>{filteredDutyRows.length}</strong> room-wise duty slots</span>
            <div className="flex items-center gap-3 font-medium">
              <span>Rooms AI301 & AI302</span>
              <span>•</span>
              <span className="text-emerald-700">All conflicts prevented</span>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 5. CREATE NEW DUTY MODAL FOR ADMIN (Clean, Natural Duty Creation)         */}
      {/* ========================================================================= */}
      <Modal
        isOpen={isCreateDutyModalOpen}
        onClose={() => setIsCreateDutyModalOpen(false)}
        title="Create Examination Duty"
        maxWidth="max-w-3xl"
      >
        <form onSubmit={handleSaveNewDuty} className="space-y-4 text-xs">
          {/* Semester & Subject Selection */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Target Semester *</label>
              <select
                required
                value={dutySemesterId}
                onChange={(e) => setDutySemesterId(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-800 font-semibold focus:outline-none focus:border-indigo-500"
              >
                {safeSemesters.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} (Semester {s.sem_number})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Course / Subject *</label>
              <select
                required
                value={dutySubjectId}
                onChange={(e) => setDutySubjectId(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:border-indigo-500"
              >
                {dutySubjectsList.map((sub) => (
                  <option key={sub.id} value={sub.id}>
                    {sub.code} - {sub.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Date and Time Window */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Examination Date *</label>
              <input
                type="date"
                required
                value={dutyDate}
                onChange={(e) => setDutyDate(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Start Time *</label>
              <input
                type="time"
                required
                value={dutyStartTime}
                onChange={(e) => setDutyStartTime(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-800 font-mono focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">End Time *</label>
              <input
                type="time"
                required
                value={dutyEndTime}
                onChange={(e) => setDutyEndTime(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-800 font-mono focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          {/* Examination Rooms & Faculty Invigilator Allocation (Multi-Room AI301 & AI302) */}
          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Examination Rooms & Invigilators
                </div>
                <div className="text-[11px] text-slate-500">
                  Same exam session conducted simultaneously in both rooms (AI301 & AI302).
                </div>
              </div>

              <button
                type="button"
                onClick={handleAddDutyRoom}
                className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 text-white rounded text-[11px] font-semibold flex items-center gap-1 shadow-sm"
              >
                <Plus className="w-3 h-3" />
                <span>Add Room</span>
              </button>
            </div>

            <div className="space-y-2.5">
              {dutyRooms.map((r, idx) => {
                const count = Math.max(0, parseInt(r.student_end || 0) - parseInt(r.student_start || 0) + 1);

                return (
                  <div
                    key={r.id}
                    className="p-3 bg-white rounded-lg border border-slate-200 shadow-sm space-y-2.5"
                  >
                    <div className="flex items-center justify-between pb-1.5 border-b border-slate-100">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-bold text-slate-500 uppercase">
                          Room {idx + 1}
                        </span>
                        <span className="px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 font-mono font-bold text-xs border border-indigo-200">
                          {r.room_number}
                        </span>
                        <span className="text-[11px] text-slate-500 font-mono font-medium">
                          Roll {r.student_start}–{r.student_end} ({count} Students)
                        </span>
                      </div>

                      {dutyRooms.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveDutyRoom(r.id)}
                          className="text-slate-300 hover:text-rose-600 p-1 transition-colors"
                          title="Remove Room"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
                      {/* Room Number */}
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                          Room No. *
                        </label>
                        <select
                          value={r.room_number}
                          onChange={(e) => handleDutyRoomChange(r.id, 'room_number', e.target.value)}
                          className="w-full bg-slate-50 border border-slate-300 rounded px-2 py-1.5 font-mono font-bold text-xs text-slate-900 focus:outline-none focus:border-indigo-500"
                        >
                          <option value="AI301">AI301</option>
                          <option value="AI302">AI302</option>
                          <option value="AI303">AI303</option>
                          <option value="AI304">AI304</option>
                        </select>
                      </div>

                      {/* Start Roll */}
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                          Start Roll *
                        </label>
                        <input
                          type="number"
                          min="1"
                          required
                          value={r.student_start}
                          onChange={(e) => handleDutyRoomChange(r.id, 'student_start', e.target.value)}
                          className="w-full bg-slate-50 border border-slate-300 rounded px-2 py-1.5 font-mono text-xs text-slate-800 focus:outline-none focus:border-indigo-500"
                        />
                      </div>

                      {/* End Roll */}
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                          End Roll *
                        </label>
                        <input
                          type="number"
                          min="1"
                          required
                          value={r.student_end}
                          onChange={(e) => handleDutyRoomChange(r.id, 'student_end', e.target.value)}
                          className="w-full bg-slate-50 border border-slate-300 rounded px-2 py-1.5 font-mono text-xs text-slate-800 focus:outline-none focus:border-indigo-500"
                        />
                      </div>

                      {/* Assigned Faculty */}
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                          Assigned Invigilator
                        </label>
                        <select
                          value={r.faculty_id}
                          onChange={(e) => handleDutyRoomChange(r.id, 'faculty_id', e.target.value)}
                          className="w-full bg-slate-50 border border-slate-300 rounded px-2 py-1.5 text-xs text-slate-900 font-medium focus:outline-none focus:border-indigo-500"
                        >
                          <option value="">-- Auto-Allocate --</option>
                          {safeFacultyList.map((f) => {
                            const isSquadOnly = f.only_squad_duty || f.id === 1 || f.name?.includes('Arjun');
                            const conf = dutyFacultyConflicts[f.id];
                            const hasClash = conf?.has_3rd_sem_clash;
                            const isExcluded = !f.eligible_for_duty;
                            const isDisabled = isExcluded || (isSquadOnly && dutyType !== 'Squad Duty') || (hasClash && dutyType === 'Invigilation');

                            return (
                              <option key={f.id} value={f.id} disabled={isDisabled}>
                                {hasClash
                                  ? `⚠️ ${f.name} — [3rd Sem Clash: ${conf.clash_details?.join(', ')}]`
                                  : isSquadOnly
                                  ? `🛡️ ${f.name} — [Squad Duty Only]`
                                  : isExcluded
                                  ? `❌ ${f.name} — [Excluded]`
                                  : `✅ ${f.name} — Available`}
                              </option>
                            );
                          })}
                        </select>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Total Students Summary */}
            <div className="p-2.5 bg-indigo-50/70 border border-indigo-100 rounded-lg flex items-center justify-between text-xs text-indigo-900 font-medium">
              <span>
                Total Strength: <strong>{dutyRooms.reduce((acc, r) => acc + Math.max(0, parseInt(r.student_end || 0) - parseInt(r.student_start || 0) + 1), 0)} Students</strong> ({dutyRooms.map(r => `${r.room_number}: ${Math.max(0, parseInt(r.student_end || 0) - parseInt(r.student_start || 0) + 1)}`).join(' • ')})
              </span>
              <span className="font-semibold text-indigo-700">
                Creates {dutyRooms.length} Room Duty Slots
              </span>
            </div>
          </div>

          {/* Duty Type */}
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Duty Type *</label>
            <select
              value={dutyType}
              onChange={(e) => setDutyType(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:border-indigo-500"
            >
                <option value="Invigilation">Invigilation</option>
                <option value="Squad Duty">Squad Duty</option>
                <option value="Room Superintendent">Room Superintendent</option>
                <option value="Relief Duty">Relief Duty</option>
              </select>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Duty Notes / Justification</label>
            <input
              type="text"
              placeholder="e.g. Regular CIE room duty"
              value={dutyNotes}
              onChange={(e) => setDutyNotes(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setIsCreateDutyModalOpen(false)}
              className="px-4 py-2 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmittingDuty}
              className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-semibold shadow-sm disabled:opacity-50"
            >
              {isSubmittingDuty ? 'Creating Duty...' : 'Create Duty'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ========================================================================= */}
      {/* 6. REASSIGN FACULTY MODAL (Direct 1-Click Assignment With Clash Check)     */}
      {/* ========================================================================= */}
      <Modal
        isOpen={isReassignModalOpen}
        onClose={() => setIsReassignModalOpen(false)}
        title={reassignRow ? `Assign Faculty — Room ${reassignRow.room_number}` : 'Assign Faculty'}
      >
        {reassignRow && (
          <form onSubmit={handleSaveReassign} className="space-y-4 text-xs">
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
              <div className="font-bold text-slate-900 text-sm">
                {reassignRow.subject_code} — {reassignRow.subject_name}
              </div>
              <div className="text-slate-600 flex items-center gap-4 text-xs">
                <span>Room: <strong className="font-mono text-slate-900">{reassignRow.room_number}</strong> ({reassignRow.student_range})</span>
                <span>•</span>
                <span>Date: <strong className="text-slate-900">{reassignRow.exam_date}</strong> ({reassignRow.time_slot})</span>
              </div>
            </div>

            {/* Quick Auto-Assign All Duties for Everyone */}
            <div className="flex items-center justify-between p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
              <div>
                <div className="font-bold text-emerald-950 text-xs flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Auto-Assign Duties for Everyone</span>
                </div>
                <div className="text-[11px] text-emerald-800 mt-0.5">
                  Staff all rooms across the entire schedule in 1 click (100% complete, zero clashes).
                </div>
              </div>
              <button
                type="button"
                onClick={async () => {
                  setIsReassignModalOpen(false);
                  await handleAutoAssignAllDuties();
                }}
                className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-xs transition-all cursor-pointer flex items-center gap-1.5 shrink-0"
              >
                <Zap className="w-3.5 h-3.5" />
                <span>Assign Everyone</span>
              </button>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Select Faculty Invigilator (3rd Sem Timetable Checked) *
              </label>
              <select
                required
                value={reassignFacultyId}
                onChange={(e) => setReassignFacultyId(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2.5 text-slate-900 font-semibold text-xs focus:outline-none focus:border-indigo-500"
              >
                <option value="">-- Choose Faculty Member --</option>
                {safeFacultyList.map((f) => {
                  const isSquadOnly = f.only_squad_duty || f.id === 1 || f.name?.includes('Arjun');
                  const conf = reassignFacultyConflicts[f.id];
                  const hasClash = conf?.has_3rd_sem_clash;
                  const isExcluded = !f.eligible_for_duty;
                  const isDisabled = isExcluded || (isSquadOnly && reassignDutyType !== 'Squad Duty') || (hasClash && reassignDutyType === 'Invigilation');

                  return (
                    <option key={f.id} value={f.id} disabled={isDisabled}>
                      {hasClash
                        ? `⚠️ ${f.name} — [3rd Sem Clash: ${conf.clash_details?.join(', ')}]`
                        : isSquadOnly
                        ? `🛡️ ${f.name} — [Squad Duty Only]`
                        : isExcluded
                        ? `❌ ${f.name} — [Excluded]`
                        : `✅ ${f.name} — Available`}
                    </option>
                  );
                })}
              </select>
            </div>

            {/* Warning box if clashing faculty is selected */}
            {reassignFacultyConflicts[parseInt(reassignFacultyId)]?.has_3rd_sem_clash && (
              <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-lg text-rose-800 text-xs flex items-center gap-2 font-medium">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>
                  <strong>3rd Sem Lecture Clash:</strong> {reassignFacultyConflicts[parseInt(reassignFacultyId)].name} has a 3rd sem class ({reassignFacultyConflicts[parseInt(reassignFacultyId)].clash_details?.join(', ')}) within 1 hour before/after this exam slot.
                </span>
              </div>
            )}

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Reason / Note</label>
              <input
                type="text"
                placeholder="e.g. Administrative assignment"
                value={reassignNotes}
                onChange={(e) => setReassignNotes(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:border-indigo-500"
              />
            </div>

            {/* Checkbox to auto-assign all remaining duties */}
            <div className="flex items-center gap-2 pt-1 bg-slate-50 p-2.5 rounded-lg border border-slate-200">
              <input
                type="checkbox"
                id="reassignAlsoAssignAllCheck"
                checked={reassignAlsoAssignAll}
                onChange={(e) => setReassignAlsoAssignAll(e.target.checked)}
                className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500 cursor-pointer"
              />
              <label htmlFor="reassignAlsoAssignAllCheck" className="text-slate-800 font-semibold cursor-pointer select-none text-[11px]">
                Also auto-assign all remaining unallocated slots for everyone
              </label>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsReassignModalOpen(false)}
                className="px-4 py-2 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmittingReassign}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-semibold shadow-sm disabled:opacity-50"
              >
                {isSubmittingReassign ? 'Updating...' : 'Confirm Assignment'}
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* ========================================================================= */}
      {/* 6.1 EDIT DUTY & SESSION MODAL (Interactive Session & Room Duty Editor)     */}
      {/* ========================================================================= */}
      <Modal
        isOpen={isEditDutyModalOpen}
        onClose={() => setIsEditDutyModalOpen(false)}
        title="Edit Examination Duty & Session"
      >
        <form onSubmit={handleSaveEditDuty} className="space-y-4 text-xs">
          {/* Top Info Banner with 3rd Sem Timetable Live Status */}
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 font-bold text-slate-800 text-xs">
                <ShieldCheck className="w-4 h-4 text-indigo-600" />
                <span>3rd Semester Timetable Protection Active (±60 min Buffer)</span>
              </div>
              <button
                type="button"
                onClick={handleAutoAssignConflictFreeFaculty}
                className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-[11px] font-semibold flex items-center gap-1 shadow-2xs transition-all"
                title="Automatically assign conflict-free faculty who have no 3rd sem classes within +/- 1 hour"
              >
                <Sparkles className="w-3 h-3" />
                <span>Auto-Assign Conflict-Free Faculty</span>
              </button>
            </div>

            {/* Conflict Summary Chips */}
            <div className="flex flex-wrap items-center gap-1.5 pt-1 text-[11px]">
              <span className="text-slate-500 font-medium">Faculty Status:</span>
              {safeFacultyList.map((f) => {
                const conf = editFacultyConflicts[f.id];
                const hasClash = conf?.has_3rd_sem_clash;
                const isSquadOnly = f.only_squad_duty || f.id === 1 || f.name?.includes('Arjun');
                if (hasClash) {
                  return (
                    <span
                      key={f.id}
                      className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 font-semibold border border-rose-200 flex items-center gap-1"
                      title={`${f.name}: 3rd Sem Class Clash (${conf.clash_details.join(', ')})`}
                    >
                      <AlertCircle className="w-3 h-3 text-rose-600" />
                      {f.name.split(' ').slice(0, 2).join(' ')} (Clash)
                    </span>
                  );
                }
                if (isSquadOnly) {
                  return (
                    <span
                      key={f.id}
                      className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-medium border border-amber-200"
                    >
                      {f.name.split(' ').slice(0, 2).join(' ')} (Squad Only)
                    </span>
                  );
                }
                return (
                  <span
                    key={f.id}
                    className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-medium border border-emerald-200"
                  >
                    {f.name.split(' ').slice(0, 2).join(' ')} (Available)
                  </span>
                );
              })}
            </div>
          </div>

          {/* Semester & Subject Selection */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Target Semester *</label>
              <select
                required
                value={editSemesterId}
                onChange={(e) => setEditSemesterId(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-800 font-semibold focus:outline-none focus:border-indigo-500"
              >
                {safeSemesters.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} (Semester {s.sem_number})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Course / Subject *</label>
              <select
                required
                value={editSubjectId}
                onChange={(e) => setEditSubjectId(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:border-indigo-500"
              >
                {editSubjectsList.map((sub) => (
                  <option key={sub.id} value={sub.id}>
                    {sub.code} - {sub.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Date and Time Window */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Examination Date *</label>
              <input
                type="date"
                required
                value={editDate}
                onChange={(e) => setEditDate(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Start Time *</label>
              <input
                type="time"
                required
                value={editStartTime}
                onChange={(e) => setEditStartTime(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-800 font-mono focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">End Time *</label>
              <input
                type="time"
                required
                value={editEndTime}
                onChange={(e) => setEditEndTime(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-800 font-mono focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          {/* Quick Timing Presets */}
          <div className="flex flex-wrap items-center gap-1.5 p-2.5 bg-slate-50 border border-slate-200 rounded-lg">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mr-1">Quick Presets:</span>
            {[
              { label: '09:00 - 10:00 (Morning 1)', st: '09:00', et: '10:00' },
              { label: '09:30 - 10:30 (Morning Shifted)', st: '09:30', et: '10:30' },
              { label: '11:30 - 12:30 (Morning 2)', st: '11:30', et: '12:30' },
              { label: '12:00 - 13:00 (Noon)', st: '12:00', et: '13:00' },
              { label: '14:00 - 15:00 (2:00 - 3:00 PM)', st: '14:00', et: '15:00' },
              { label: '14:30 - 15:30 (2:30 - 3:30 PM)', st: '14:30', et: '15:30' },
              { label: '15:30 - 16:30 (3:30 - 4:30 PM)', st: '15:30', et: '16:30' },
            ].map((preset, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => {
                  setEditStartTime(preset.st);
                  setEditEndTime(preset.et);
                }}
                className={`px-2 py-1 rounded text-[10px] font-semibold border transition-all ${
                  editStartTime === preset.st && editEndTime === preset.et
                    ? 'bg-sky-600 text-white border-sky-600 shadow-2xs'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>

          {/* One-Click Timing Cascade & Redirect Card */}
          <div className="p-3.5 bg-indigo-50/90 border border-indigo-200 rounded-xl space-y-2.5">
            <div className="flex items-center gap-2 font-bold text-xs text-indigo-900">
              <Clock className="w-4 h-4 text-indigo-600 shrink-0" />
              <span>⚡ One-Click Timing Cascade (Redirect to All Duties in this Slot on this Day)</span>
            </div>
            <label className="flex items-start gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={applyToAllSlotDutiesToday}
                onChange={(e) => setApplyToAllSlotDutiesToday(e.target.checked)}
                className="w-4 h-4 text-indigo-600 rounded mt-0.5"
              />
              <div>
                <span className="font-semibold text-slate-800 text-xs">
                  Apply timing ({editStartTime} - {editEndTime}) to ALL duties in this slot on {editDate}
                </span>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Automatically redirects all rooms (AI301, AI302, Squad) and concurrent exams on this date to the new timing, verifying faculty against the respected regular timetable with ±60 min buffer.
                </p>
              </div>
            </label>
            <label className="flex items-start gap-2.5 cursor-pointer select-none pl-6 pt-1.5 border-t border-indigo-100">
              <input
                type="checkbox"
                checked={applyToAllDaysSlot}
                onChange={(e) => setApplyToAllDaysSlot(e.target.checked)}
                className="w-3.5 h-3.5 text-indigo-600 rounded mt-0.5"
              />
              <span className="text-slate-600 text-[11px]">
                Also cascade to all {editStartTime < '12:00' ? 'morning' : 'afternoon'} exam duties across all CIE days
              </span>
            </label>
          </div>

          {/* Examination Rooms & Assigned Faculty (Multi-Room AI301 & AI302) */}
          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <div className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Examination Rooms & Invigilators
                </div>
                <div className="text-[11px] text-slate-500">
                  Assign faculty based on 3rd sem timetable with ±60 min buffer protection.
                </div>
              </div>

              {/* Quick Presets & Add Room Button */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  type="button"
                  onClick={handleApplyDualRoomPreset}
                  className="px-2 py-1 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded text-[10px] font-semibold transition-all shadow-2xs"
                  title="Preset 2 rooms: AI301 (1-29) & AI302 (30-60)"
                >
                  Dual-Room Preset
                </button>
                <button
                  type="button"
                  onClick={handleApplySingleRoomPreset}
                  className="px-2 py-1 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded text-[10px] font-semibold transition-all shadow-2xs"
                  title="Preset 1 room: AI301 (1-60) for 7th Sem Open Elective"
                >
                  Single Room (Open Elective)
                </button>
                <button
                  type="button"
                  onClick={handleAddEditRoom}
                  className="px-2 py-1 bg-slate-900 hover:bg-slate-800 text-white rounded text-[10px] font-semibold flex items-center gap-1 shadow-2xs"
                >
                  <Plus className="w-3 h-3" />
                  <span>Add Room</span>
                </button>
              </div>
            </div>

            <div className="space-y-2.5">
              {editRooms.map((r, idx) => {
                const count = Math.max(0, parseInt(r.student_end || 0) - parseInt(r.student_start || 0) + 1);
                const selectedConf = r.faculty_id ? editFacultyConflicts[parseInt(r.faculty_id)] : null;
                const hasClash = selectedConf?.has_3rd_sem_clash;

                return (
                  <div
                    key={r.id}
                    className={`p-3 bg-white rounded-lg border transition-all space-y-2 ${
                      hasClash ? 'border-rose-300 ring-1 ring-rose-200' : 'border-slate-200 shadow-2xs'
                    }`}
                  >
                    <div className="flex items-center justify-between pb-1.5 border-b border-slate-100">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-bold text-slate-500 uppercase">
                          Room {idx + 1}
                        </span>
                        <span className="px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 font-mono font-bold text-xs border border-indigo-200">
                          {r.room_number}
                        </span>
                        <span className="text-[11px] text-slate-500 font-mono font-medium">
                          Roll {r.student_start}–{r.student_end} ({count} Students)
                        </span>
                      </div>

                      {editRooms.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveEditRoom(r.id)}
                          className="text-slate-300 hover:text-rose-600 p-1 transition-colors"
                          title="Remove Room"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
                      {/* Room Number */}
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                          Room No. *
                        </label>
                        <select
                          value={r.room_number}
                          onChange={(e) => handleEditRoomChange(r.id, 'room_number', e.target.value)}
                          className="w-full bg-slate-50 border border-slate-300 rounded px-2 py-1.5 font-mono font-bold text-xs text-slate-900 focus:outline-none focus:border-indigo-500"
                        >
                          <option value="AI301">AI301</option>
                          <option value="AI302">AI302</option>
                          <option value="AI303">AI303</option>
                          <option value="AI304">AI304</option>
                        </select>
                      </div>

                      {/* Start Roll */}
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                          Start Roll *
                        </label>
                        <input
                          type="number"
                          min="1"
                          required
                          value={r.student_start}
                          onChange={(e) => handleEditRoomChange(r.id, 'student_start', e.target.value)}
                          className="w-full bg-slate-50 border border-slate-300 rounded px-2 py-1.5 font-mono text-xs text-slate-800 focus:outline-none focus:border-indigo-500"
                        />
                      </div>

                      {/* End Roll */}
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                          End Roll *
                        </label>
                        <input
                          type="number"
                          min="1"
                          required
                          value={r.student_end}
                          onChange={(e) => handleEditRoomChange(r.id, 'student_end', e.target.value)}
                          className="w-full bg-slate-50 border border-slate-300 rounded px-2 py-1.5 font-mono text-xs text-slate-800 focus:outline-none focus:border-indigo-500"
                        />
                      </div>

                      {/* Assigned Faculty */}
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                          Assigned Invigilator
                        </label>
                        <select
                          value={r.faculty_id}
                          onChange={(e) => handleEditRoomChange(r.id, 'faculty_id', e.target.value)}
                          className={`w-full border rounded px-2 py-1.5 text-xs font-semibold focus:outline-none focus:border-indigo-500 ${
                            hasClash
                              ? 'bg-rose-50 border-rose-300 text-rose-900'
                              : r.faculty_id
                              ? 'bg-slate-50 border-slate-300 text-slate-900'
                              : 'bg-amber-50 border-amber-300 text-amber-900'
                          }`}
                        >
                          <option value="">-- Unassigned (Pending) --</option>
                          {safeFacultyList.map((f) => {
                            const conf = editFacultyConflicts[f.id];
                            const facClash = conf?.has_3rd_sem_clash;
                            const isSquadOnly = f.only_squad_duty || f.id === 1 || f.name?.includes('Arjun');
                            const isExcluded = !f.eligible_for_duty;
                            const isOptionDisabled = isExcluded || isSquadOnly || facClash;

                            return (
                              <option
                                key={f.id}
                                value={f.id}
                                disabled={isOptionDisabled}
                              >
                                {facClash
                                  ? `⚠️ ${f.name} — [3rd Sem Clash: ${conf.clash_details?.join(', ')}]`
                                  : isSquadOnly
                                  ? `🛡️ ${f.name} — [Squad Duty Only]`
                                  : isExcluded
                                  ? `❌ ${f.name} — [Excluded]`
                                  : `✅ ${f.name} — Available`}
                              </option>
                            );
                          })}
                        </select>
                      </div>
                    </div>

                    {/* Conflict Alert Banner under room */}
                    {hasClash && (
                      <div className="p-2 bg-rose-50 border border-rose-200 rounded text-[11px] text-rose-800 flex items-center gap-1.5 font-medium">
                        <AlertCircle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                        <span>
                          <strong>3rd Sem Lecture Conflict:</strong> {selectedConf.name} has regular 3rd sem class ({selectedConf.clash_details.join(', ')}) during or within 1 hour of this exam slot!
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Total Students Summary */}
            <div className="p-2.5 bg-indigo-50/70 border border-indigo-100 rounded-lg flex items-center justify-between text-xs text-indigo-900 font-medium">
              <span>
                Total Strength: <strong>{editRooms.reduce((acc, r) => acc + Math.max(0, parseInt(r.student_end || 0) - parseInt(r.student_start || 0) + 1), 0)} Students</strong> ({editRooms.map(r => `${r.room_number}: ${Math.max(0, parseInt(r.student_end || 0) - parseInt(r.student_start || 0) + 1)}`).join(' • ')})
              </span>
              <span className="font-semibold text-indigo-700">
                {editRooms.length} Room Duty Slots
              </span>
            </div>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Administrative Note / Override Reason</label>
            <input
              type="text"
              placeholder="e.g. Schedule adjustments and invigilator reassignments"
              value={editNotes}
              onChange={(e) => setEditNotes(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setIsEditDutyModalOpen(false)}
              className="px-4 py-2 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmittingEdit}
              className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-semibold shadow-sm disabled:opacity-50 flex items-center gap-1.5"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{isSubmittingEdit ? 'Saving & Updating All Duties...' : 'Save & Redirect Timing to All Duties'}</span>
            </button>
          </div>
        </form>
      </Modal>

      {/* ========================================================================= */}
      {/* 7. CREATE WHOLE CIE SCHEDULE MODAL (All Semesters / Bulk Creation)         */}
      {/* ========================================================================= */}
      <Modal
        isOpen={isWholeScheduleModalOpen}
        onClose={() => setIsWholeScheduleModalOpen(false)}
        title="Create Examination Duty"
        maxWidth="max-w-5xl lg:max-w-6xl"
      >
        <form onSubmit={handleSaveWholeSchedule} className="space-y-4 text-xs">
          {/* 1. Academic Year & Semester Cycle Selection */}
          <div>
            <label className="block font-semibold text-slate-700 mb-1.5">
              Academic Year & Semester Cycle *
            </label>
            <div className="grid grid-cols-2 gap-2 mb-1">
              <button
                type="button"
                onClick={() => {
                  handleCycleChange('odd');
                  setWholeSelectedSemesters(selectedCieNumber === '3' ? [5, 7] : [3, 5, 7]);
                }}
                className={`py-2 px-3 rounded-lg font-bold text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer border ${
                  selectedCycle === 'odd'
                    ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                    : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-300'
                }`}
              >
                <Calendar className="w-3.5 h-3.5" />
                <span>Odd Semester (AY 2026-27)</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  handleCycleChange('even');
                  setWholeSelectedSemesters([4, 6]);
                }}
                className={`py-2 px-3 rounded-lg font-bold text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer border ${
                  selectedCycle === 'even'
                    ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                    : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-300'
                }`}
              >
                <Calendar className="w-3.5 h-3.5" />
                <span>Even Semester (IV & VI)</span>
              </button>
            </div>
          </div>

          {/* 2. CIE Cycle Selection: CIE-1, CIE-2, CIE-3 */}
          <div>
            <label className="block font-semibold text-slate-700 mb-1.5">
              CIE Examination Cycle *
            </label>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl border border-slate-200">
                {['1', '2', '3'].map((num) => {
                  const isSelected = selectedCieNumber === num;
                  return (
                    <button
                      key={num}
                      type="button"
                      onClick={() => {
                        handleCieNumberChange(num);
                        if (selectedCycle === 'odd') {
                          setWholeSelectedSemesters(num === '3' ? [5, 7] : [3, 5, 7]);
                        }
                      }}
                      className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-slate-900 text-white shadow-xs'
                          : 'text-slate-700 hover:text-slate-900 hover:bg-slate-200'
                      }`}
                    >
                      CIE-{num}
                    </button>
                  );
                })}
              </div>
              <span className="text-xs text-slate-500 font-medium">
                {activeCie?.name || `CIE-${selectedCieNumber}`} ({activeCie?.academic_year || selectedYear})
              </span>
            </div>
            {selectedCycle === 'odd' && selectedCieNumber === '3' && (
              <p className="text-[11px] text-amber-700 bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200 font-medium mt-1.5">
                Note: 3rd Semester has only 2 CIEs (CIE-1 & CIE-2). Only 5th & 7th semesters will be included.
              </p>
            )}
          </div>

          {/* 3. Included Semesters Selector */}
          <div>
            <label className="block font-semibold text-slate-700 mb-1.5">
              Included Semesters:
            </label>
            {/* Dynamic Semester Pills based on Selected Cycle */}
            <div className="flex flex-wrap items-center gap-2">
              {(selectedCycle === 'even'
                ? [
                    { num: 4, name: '4th Semester' },
                    { num: 6, name: '6th Semester' },
                  ]
                : (selectedCieNumber === '3'
                    ? [
                        { num: 5, name: '5th Semester' },
                        { num: 7, name: '7th Semester' },
                      ]
                    : [
                        { num: 3, name: '3rd Semester' },
                        { num: 5, name: '5th Semester' },
                        { num: 7, name: '7th Semester' },
                      ]
                  )
              ).map((item) => {
                const isChecked = wholeSelectedSemesters.includes(item.num);
                return (
                  <button
                    key={item.num}
                    type="button"
                    onClick={() => handleToggleSemester(item.num)}
                    className={`py-1.5 px-3 rounded-lg border text-center font-bold text-xs transition-all cursor-pointer ${
                      isChecked
                        ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                        : 'bg-slate-50 border-slate-300 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    {item.name} {isChecked ? '✓' : ''}
                  </button>
                );
              })}
            </div>
          </div>

          {/* SUBJECT DETAILS / CURRICULUM TIMETABLE */}
          {wholeSelectedSemesters.length > 0 && (
            <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
              <div className="bg-slate-100/90 px-3.5 py-2 border-b border-slate-200 flex items-center justify-between">
                <span className="font-bold text-slate-800 text-xs">
                  Subject Details
                </span>
                <span className="text-[11px] text-slate-500 font-semibold">
                  {wholeSelectedSemesters.sort((a, b) => a - b).map(s => `${s}th Sem`).join(', ')} Exams
                </span>
              </div>
              <div className="overflow-x-auto max-h-80">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 text-slate-700 font-semibold border-b border-slate-200">
                      <th className="p-2.5 w-32 bg-slate-100/60 font-bold">Exam Slot</th>
                      {wholeSelectedSemesters.includes(3) && (
                        <th className="p-2.5 min-w-[200px]">
                          <div className="font-bold text-slate-900">3rd Sem</div>
                          <div className="text-[10px] font-medium text-slate-500 mt-0.5">
                            Morning: {semesterTimings[3]?.morning_start || '09:00'} | Afternoon: {semesterTimings[3]?.afternoon_start || '14:00'}
                          </div>
                        </th>
                      )}
                      {wholeSelectedSemesters.includes(4) && (
                        <th className="p-2.5 min-w-[200px]">
                          <div className="font-bold text-slate-900">4th Sem</div>
                          <div className="text-[10px] font-medium text-slate-500 mt-0.5">
                            Morning: {semesterTimings[4]?.morning_start || '09:00'} | Afternoon: {semesterTimings[4]?.afternoon_start || '14:00'}
                          </div>
                        </th>
                      )}
                      {wholeSelectedSemesters.includes(5) && (
                        <th className="p-2.5 min-w-[200px]">
                          <div className="font-bold text-slate-900">5th Sem</div>
                          <div className="text-[10px] font-medium text-slate-500 mt-0.5">
                            Morning: {semesterTimings[5]?.morning_start || '09:00'} | Afternoon: {semesterTimings[5]?.afternoon_start || '14:00'}
                          </div>
                        </th>
                      )}
                      {wholeSelectedSemesters.includes(6) && (
                        <th className="p-2.5 min-w-[200px]">
                          <div className="font-bold text-slate-900">6th Sem</div>
                          <div className="text-[10px] font-medium text-slate-500 mt-0.5">
                            Morning: {semesterTimings[6]?.morning_start || '11:30'} | Afternoon: {semesterTimings[6]?.afternoon_start || '15:30'}
                          </div>
                        </th>
                      )}
                      {wholeSelectedSemesters.includes(7) && (
                        <th className="p-2.5 min-w-[200px]">
                          <div className="font-bold text-slate-900">7th Sem</div>
                          <div className="text-[10px] font-medium text-slate-500 mt-0.5">
                            Morning: {semesterTimings[7]?.morning_start || '11:30'} | Afternoon: {semesterTimings[7]?.afternoon_start || '15:30'}
                          </div>
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    <tr className="hover:bg-slate-50/50">
                      <td className="p-2.5 font-bold text-slate-700 bg-slate-50/70">Day 1 (Morn)</td>
                      {wholeSelectedSemesters.includes(3) && <td className="p-2.5 text-slate-900 font-medium">25MAAI301 (Maths for AI)</td>}
                      {wholeSelectedSemesters.includes(4) && <td className="p-2.5 text-slate-900 font-medium">24AI401 (Algorithms)</td>}
                      {wholeSelectedSemesters.includes(5) && <td className="p-2.5 text-slate-900 font-medium">24AI501 (Software Eng)</td>}
                      {wholeSelectedSemesters.includes(6) && <td className="p-2.5 text-slate-900 font-medium">23AI601 (Machine Learning)</td>}
                      {wholeSelectedSemesters.includes(7) && <td className="p-2.5 text-slate-900 font-medium">23AI701 (Cloud Computing)</td>}
                    </tr>
                    <tr className="hover:bg-slate-50/50">
                      <td className="p-2.5 font-bold text-slate-700 bg-slate-50/70">Day 1 (Aft)</td>
                      {wholeSelectedSemesters.includes(3) && <td className="p-2.5 text-slate-900 font-medium">25AI302 (Digital Systems)</td>}
                      {wholeSelectedSemesters.includes(4) && <td className="p-2.5 text-slate-900 font-medium">24AI402 (Microcontrollers)</td>}
                      {wholeSelectedSemesters.includes(5) && <td className="p-2.5 text-slate-900 font-medium">24AI502 (Networks)</td>}
                      {wholeSelectedSemesters.includes(6) && <td className="p-2.5 text-slate-900 font-medium">23AI602 (NLP)</td>}
                      {wholeSelectedSemesters.includes(7) && <td className="p-2.5 text-slate-900 font-medium">23AI702 (Prompt Eng)</td>}
                    </tr>
                    <tr className="hover:bg-slate-50/50">
                      <td className="p-2.5 font-bold text-slate-700 bg-slate-50/70">Day 2 (Morn)</td>
                      {wholeSelectedSemesters.includes(3) && <td className="p-2.5 text-slate-900 font-medium">25AI303 (Operating Systems)</td>}
                      {wholeSelectedSemesters.includes(4) && <td className="p-2.5 text-slate-900 font-medium">24AI403 (DBMS)</td>}
                      {wholeSelectedSemesters.includes(5) && <td className="p-2.5 text-slate-900 font-medium">24AI503 (Theory of Comp)</td>}
                      {wholeSelectedSemesters.includes(6) && <td className="p-2.5 text-slate-900 font-medium">23AI603 (Computer Vision)</td>}
                      {wholeSelectedSemesters.includes(7) && <td className="p-2.5 text-slate-900 font-medium">23AI703 (Full Stack)</td>}
                    </tr>
                    <tr className="hover:bg-slate-50/50">
                      <td className="p-2.5 font-bold text-slate-700 bg-slate-50/70">Day 2 (Aft)</td>
                      {wholeSelectedSemesters.includes(3) && <td className="p-2.5 text-slate-900 font-medium">25AI304 (Data Structures)</td>}
                      {wholeSelectedSemesters.includes(4) && <td className="p-2.5 text-slate-900 font-medium">24AI404 (AI Search)</td>}
                      {wholeSelectedSemesters.includes(5) && <td className="p-2.5 text-slate-900 font-medium">24AI504 (Deep Learning)</td>}
                      {wholeSelectedSemesters.includes(6) && <td className="p-2.5 text-slate-900 font-medium">23AI604 (Reinforcement Learning)</td>}
                      {wholeSelectedSemesters.includes(7) && <td className="p-2.5 text-slate-900 font-medium">23AI704D (AI & IoT)</td>}
                    </tr>
                    <tr className="hover:bg-slate-50/50">
                      <td className="p-2.5 font-bold text-slate-700 bg-slate-50/70">Day 3 (Morn)</td>
                      {wholeSelectedSemesters.includes(3) && <td className="p-2.5 text-slate-900 font-medium">25AI305 (Intro to AI)</td>}
                      {wholeSelectedSemesters.includes(4) && <td className="p-2.5 text-slate-900 font-medium">24AI405A (Optimization)</td>}
                      {wholeSelectedSemesters.includes(5) && <td className="p-2.5 text-slate-900 font-medium">24AI505A (Comp Graphics)</td>}
                      {wholeSelectedSemesters.includes(6) && <td className="p-2.5 text-slate-900 font-medium">23AI605A (Generative AI)</td>}
                      {wholeSelectedSemesters.includes(7) && <td className="p-2.5 text-slate-900 font-medium">23OEAI75x (Open Elec)</td>}
                    </tr>
                    <tr className="hover:bg-slate-50/50">
                      <td className="p-2.5 font-bold text-slate-700 bg-slate-50/70">Day 3 (Aft)</td>
                      {wholeSelectedSemesters.includes(3) && <td className="p-2.5 text-slate-900 font-medium">25AI308A (Go Lang)</td>}
                      {wholeSelectedSemesters.includes(4) && <td className="p-2.5 text-slate-900 font-medium">24AI408 (Python for DS)</td>}
                      {wholeSelectedSemesters.includes(5) && <td className="p-2.5 text-slate-900 font-medium">24AI508 (Research Meth)</td>}
                      {wholeSelectedSemesters.includes(6) && <td className="p-2.5 text-slate-400 italic">— Completed —</td>}
                      {wholeSelectedSemesters.includes(7) && <td className="p-2.5 text-slate-400 italic">— Completed —</td>}
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Exam Dates & Slot Timings */}
          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Exam Start Date *
            </label>
            <input
              type="date"
              required
              value={wholeStartDate}
              onChange={(e) => setWholeStartDate(e.target.value)}
              className="w-full sm:w-64 bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-900 font-semibold focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* SEMESTER-WISE EXAMINATION TIMINGS */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <div>
                <label className="font-bold text-slate-800 text-xs block">
                  Examination Timings (Configured by Semester)
                </label>
                <p className="text-[11px] text-slate-500">
                  Separate morning and afternoon slots for each semester prevent room clashes in AI301 & AI302.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {wholeSelectedSemesters.sort((a, b) => a - b).map((sNum) => {
                const timings = semesterTimings[sNum] || {
                  morning_start: sNum === 7 || sNum === 6 ? '11:30' : '09:00',
                  morning_end: sNum === 7 || sNum === 6 ? '12:30' : '10:00',
                  afternoon_start: sNum === 7 || sNum === 6 ? '15:30' : '14:00',
                  afternoon_end: sNum === 7 || sNum === 6 ? '16:30' : '15:00',
                };

                return (
                  <div key={sNum} className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-3 shadow-2xs">
                    <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-blue-600"></span>
                        <span className="font-bold text-sm text-slate-800">
                          {sNum}th Semester Timings
                        </span>
                      </div>
                      <span className="text-[10px] font-semibold px-2.5 py-0.5 rounded-full bg-blue-100/90 text-blue-800">
                        {sNum === 5 || sNum === 4 ? 'Slot A (09:00 / 14:00)' : sNum === 7 || sNum === 6 ? 'Slot B (11:30 / 15:30)' : 'Slot 1'}
                      </span>
                    </div>

                    <div className="space-y-2.5">
                      {/* Morning Slot */}
                      <div className="bg-white p-3 rounded-lg border border-slate-200/90 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wide flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5 text-blue-600" />
                            Morning Slot
                          </span>
                          <span className="text-[10px] font-medium text-slate-400">
                            {timings.morning_start && timings.morning_end ? `${timings.morning_start} – ${timings.morning_end}` : ''}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-2.5">
                          <div>
                            <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
                              Start Time
                            </label>
                            <input
                              type="time"
                              value={timings.morning_start}
                              onChange={(e) => handleSemTimingChange(sNum, 'morning_start', e.target.value)}
                              className="w-full bg-slate-50 border border-slate-300 rounded-md px-2.5 py-1.5 text-xs font-bold text-slate-900 focus:outline-none focus:border-blue-500 focus:bg-white transition-colors"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
                              End Time
                            </label>
                            <input
                              type="time"
                              value={timings.morning_end}
                              onChange={(e) => handleSemTimingChange(sNum, 'morning_end', e.target.value)}
                              className="w-full bg-slate-50 border border-slate-300 rounded-md px-2.5 py-1.5 text-xs font-bold text-slate-900 focus:outline-none focus:border-blue-500 focus:bg-white transition-colors"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Afternoon Slot */}
                      <div className="bg-white p-3 rounded-lg border border-slate-200/90 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wide flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5 text-amber-600" />
                            Afternoon Slot
                          </span>
                          <span className="text-[10px] font-medium text-slate-400">
                            {timings.afternoon_start && timings.afternoon_end ? `${timings.afternoon_start} – ${timings.afternoon_end}` : ''}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-2.5">
                          <div>
                            <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
                              Start Time
                            </label>
                            <input
                              type="time"
                              value={timings.afternoon_start}
                              onChange={(e) => handleSemTimingChange(sNum, 'afternoon_start', e.target.value)}
                              className="w-full bg-slate-50 border border-slate-300 rounded-md px-2.5 py-1.5 text-xs font-bold text-slate-900 focus:outline-none focus:border-blue-500 focus:bg-white transition-colors"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
                              End Time
                            </label>
                            <input
                              type="time"
                              value={timings.afternoon_end}
                              onChange={(e) => handleSemTimingChange(sNum, 'afternoon_end', e.target.value)}
                              className="w-full bg-slate-50 border border-slate-300 rounded-md px-2.5 py-1.5 text-xs font-bold text-slate-900 focus:outline-none focus:border-blue-500 focus:bg-white transition-colors"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* FACULTY DUTY QUOTAS - Clean, focused, showing full names and quotas */}
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="font-bold text-slate-800 text-xs">
                Faculty Duty Quotas (Room Invigilation)
              </label>
              <span className="text-[11px] text-slate-500 font-medium">
                Total Quota: <strong className="text-slate-900 font-bold">{Object.entries(quotaMap).filter(([fid]) => parseInt(fid) !== 1).reduce((a, [, b]) => a + (parseInt(b) || 0), 0) || 21}</strong>
              </span>
            </div>

            {/* Faculty Quota Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 max-h-64 overflow-y-auto pr-1">
              {safeFacultyList.filter(f => !f.only_squad_duty && f.id !== 1 && !f.name?.includes('Arjun') && f.eligible_for_duty).map((f) => {
                const curVal = quotaMap[f.id] !== undefined ? quotaMap[f.id] : (f.max_duty_capacity !== undefined ? f.max_duty_capacity : 5);

                return (
                  <div key={f.id} className="p-2.5 rounded-xl border border-slate-200 bg-white flex items-center justify-between gap-3 shadow-2xs hover:border-slate-300 transition-all">
                    <div className="min-w-0 flex-1">
                      <div className="font-bold text-slate-900 text-xs leading-snug">
                        {f.name}
                      </div>
                      <div className="text-[10px] text-slate-500 font-medium mt-0.5">{f.designation || 'Faculty'}</div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0 bg-slate-50 px-2 py-1 rounded-lg border border-slate-200">
                      <span className="text-[10px] text-slate-500 font-bold uppercase">Quota</span>
                      <input
                        type="number"
                        min="0"
                        max="20"
                        value={curVal}
                        onChange={(e) => handleQuotaInputChange(f.id, e.target.value)}
                        className="w-12 bg-white border border-slate-300 rounded px-1.5 py-0.5 text-center font-bold text-xs text-slate-900 focus:outline-none focus:border-blue-500"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* SQUAD DUTY QUOTAS - Clean, focused, matching Faculty Duty Quotas */}
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-amber-600" />
                <label className="font-bold text-slate-800 text-xs">
                  Squad Duty Quotas
                </label>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-100/90 text-amber-800 border border-amber-200/60">
                  Roving Squad
                </span>
              </div>
              <div className="flex items-center gap-3">
                {safeFacultyList.some(f => !squadFacultyIds.includes(f.id) && f.eligible_for_duty) && (
                  <select
                    value=""
                    onChange={(e) => {
                      if (e.target.value) handleAddSquadFaculty(Number(e.target.value));
                    }}
                    className="text-[11px] font-semibold bg-white border border-slate-300 rounded-lg px-2 py-1 text-slate-700 hover:border-slate-400 focus:outline-none focus:border-amber-500 cursor-pointer shadow-2xs"
                  >
                    <option value="">+ Add Squad Faculty</option>
                    {safeFacultyList
                      .filter(f => !squadFacultyIds.includes(f.id) && f.eligible_for_duty)
                      .map(f => (
                        <option key={f.id} value={f.id}>
                          {f.name} ({f.designation || 'Faculty'})
                        </option>
                      ))}
                  </select>
                )}
                <span className="text-[11px] text-slate-500 font-medium">
                  Total Squad Quota: <strong className="text-slate-900 font-bold">{totalSquadQuota}</strong>
                </span>
              </div>
            </div>

            {/* Squad Quota Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 max-h-64 overflow-y-auto pr-1">
              {safeFacultyList.filter(f => squadFacultyIds.includes(f.id)).map((f) => {
                const isHod = f.only_squad_duty || f.id === 1 || f.name?.includes('Arjun');
                const curVal = squadQuotaMap[f.id] !== undefined
                  ? squadQuotaMap[f.id]
                  : (quotaMap[f.id] !== undefined && quotaMap[f.id] <= 12 ? quotaMap[f.id] : 6);

                return (
                  <div key={f.id} className="p-2.5 rounded-xl border border-slate-200 bg-white flex items-center justify-between gap-3 shadow-2xs hover:border-slate-300 transition-all">
                    <div className="min-w-0 flex-1">
                      <div className="font-bold text-slate-900 text-xs leading-snug flex items-center gap-1.5">
                        <span className="truncate">{f.name}</span>
                        {isHod && (
                          <span className="px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 text-[9px] font-bold shrink-0">
                            HOD
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-slate-500 font-medium mt-0.5">{f.designation || 'Squad Officer'}</div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <div className="flex items-center gap-1.5 bg-slate-50 px-2 py-1 rounded-lg border border-slate-200">
                        <span className="text-[10px] text-slate-500 font-bold uppercase">Quota</span>
                        <input
                          type="number"
                          min="0"
                          max="20"
                          value={curVal}
                          onChange={(e) => handleSquadQuotaInputChange(f.id, e.target.value)}
                          className="w-12 bg-white border border-slate-300 rounded px-1.5 py-0.5 text-center font-bold text-xs text-slate-900 focus:outline-none focus:border-amber-500"
                        />
                      </div>
                      {!isHod && (
                        <button
                          type="button"
                          onClick={() => handleRemoveSquadFaculty(f.id)}
                          className="text-slate-400 hover:text-red-500 p-1 rounded transition-colors cursor-pointer"
                          title="Remove from squad duty"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 1-Credit Subject(s) */}
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={includeOneCreditSubject}
                  onChange={(e) => handleToggleIncludeOneCredit(e.target.checked)}
                  className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500 cursor-pointer"
                />
                <span className="font-bold text-slate-800 text-xs">
                  Add 1-Credit Subject(s)
                </span>
              </label>

              {includeOneCreditSubject && (
                <button
                  type="button"
                  onClick={handleAddOneCreditEntry}
                  className="flex items-center gap-1 px-2.5 py-1 bg-white hover:bg-slate-100 text-blue-600 border border-slate-300 rounded-md text-xs font-semibold shadow-2xs cursor-pointer transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Subject</span>
                </button>
              )}
            </div>

            {includeOneCreditSubject && (
              <div className="space-y-2 pt-1">
                {oneCreditEntries.map((entry, idx) => (
                  <div key={entry.id} className="p-2.5 bg-white border border-slate-200 rounded-lg space-y-2 shadow-2xs">
                    {oneCreditEntries.length > 1 && (
                      <div className="flex items-center justify-between text-xs text-slate-500 font-semibold border-b border-slate-100 pb-1">
                        <span>Subject #{idx + 1}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveOneCreditEntry(entry.id)}
                          className="text-red-500 hover:text-red-700 text-[11px] font-medium cursor-pointer"
                        >
                          Remove
                        </button>
                      </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-600 uppercase mb-0.5">
                          Semester
                        </label>
                        <select
                          value={entry.semester_id}
                          onChange={(e) => {
                            const semId = e.target.value;
                            handleUpdateOneCreditEntry(entry.id, 'semester_id', semId);
                            loadEntrySubjects(entry.id, semId);
                          }}
                          className="w-full bg-slate-50 border border-slate-300 rounded-md px-2 py-1 text-xs font-semibold text-slate-800 focus:outline-none focus:border-blue-500 cursor-pointer"
                        >
                          {safeSemesters.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name} (Sem {s.sem_number})
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold text-slate-600 uppercase mb-0.5">
                          Subject
                        </label>
                        <select
                          required={includeOneCreditSubject}
                          value={entry.subject_id}
                          onChange={(e) => handleUpdateOneCreditEntry(entry.id, 'subject_id', e.target.value)}
                          className="w-full bg-slate-50 border border-slate-300 rounded-md px-2 py-1 text-xs font-semibold text-slate-800 focus:outline-none focus:border-blue-500 cursor-pointer"
                        >
                          <option value="">-- Select Subject --</option>
                          {(entry.availableSubjects || []).map((sub) => (
                            <option key={sub.id} value={sub.id}>
                              {sub.code} — {sub.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-600 uppercase mb-0.5">
                          Date
                        </label>
                        <input
                          type="date"
                          required={includeOneCreditSubject}
                          value={entry.exam_date}
                          onChange={(e) => handleUpdateOneCreditEntry(entry.id, 'exam_date', e.target.value)}
                          className="w-full bg-slate-50 border border-slate-300 rounded-md px-2 py-1 text-xs font-semibold text-slate-800 focus:outline-none focus:border-blue-500"
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold text-slate-600 uppercase mb-0.5">
                          Start Time
                        </label>
                        <input
                          type="time"
                          required={includeOneCreditSubject}
                          value={entry.start_time}
                          onChange={(e) => handleUpdateOneCreditEntry(entry.id, 'start_time', e.target.value)}
                          className="w-full bg-slate-50 border border-slate-300 rounded-md px-2 py-1 text-xs font-bold text-slate-800 focus:outline-none focus:border-blue-500"
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold text-slate-600 uppercase mb-0.5">
                          End Time
                        </label>
                        <input
                          type="time"
                          required={includeOneCreditSubject}
                          value={entry.end_time}
                          onChange={(e) => handleUpdateOneCreditEntry(entry.id, 'end_time', e.target.value)}
                          className="w-full bg-slate-50 border border-slate-300 rounded-md px-2 py-1 text-xs font-bold text-slate-800 focus:outline-none focus:border-blue-500"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Auto-Allocate Checkbox */}
          <div className="flex items-center gap-2 p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs">
            <input
              type="checkbox"
              id="autoAllocateCheck"
              checked={autoAllocateAfterSchedule}
              onChange={(e) => setAutoAllocateAfterSchedule(e.target.checked)}
              className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500 cursor-pointer"
            />
            <label htmlFor="autoAllocateCheck" className="text-slate-800 font-semibold cursor-pointer select-none">
              Auto-allocate duties to faculty immediately
            </label>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setIsWholeScheduleModalOpen(false)}
              className="px-4 py-2 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 font-medium cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmittingWholeSchedule}
              className="flex items-center gap-1.5 px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold shadow-sm disabled:opacity-50 cursor-pointer"
            >
              <Sparkles className="w-4 h-4" />
              <span>
                {isSubmittingWholeSchedule
                  ? 'Generating Duties...'
                  : autoAllocateAfterSchedule
                  ? 'Generate Schedule & Allocate Duties'
                  : 'Generate Examination Duties'}
              </span>
            </button>
          </div>
        </form>
      </Modal>

      {/* ========================================================================= */}
      {/* OVERALL EDIT DUTIES MODAL (5TH, 7TH & 3RD SEM)                            */}
      {/* ========================================================================= */}
      <Modal
        isOpen={isOverallEditModalOpen}
        onClose={() => setIsOverallEditModalOpen(false)}
        title="⚡ Overall Examination Duty & Timing Manager (5th, 7th & 3rd Sem)"
        maxWidth="max-w-5xl"
      >
        <div className="space-y-4 text-xs">
          {/* Informational Guidance Banner */}
          <div className="p-3.5 bg-sky-50 border border-sky-200 rounded-xl space-y-1 text-sky-900">
            <div className="flex items-center gap-2 font-bold">
              <ShieldCheck className="w-4 h-4 text-sky-600" />
              <span>Respected Timetable Protection Active (±60 min Buffer)</span>
            </div>
            <p className="text-[11px] text-sky-800 leading-relaxed">
              When editing <strong>5th or 7th Semester</strong> duties, the <strong>3rd Semester</strong> regular class timetable is strictly protected. When editing <strong>3rd Semester</strong> duties, <strong>5th & 7th Semester</strong> class timetables are protected. Changing a duty time automatically updates the faculty profile with the new timing and assigned room. Saving triggers an automatic verification and reloads the page.
            </p>
          </div>

          {/* Scope Filter Tabs */}
          <div className="flex items-center justify-between border-b border-slate-200 pb-2">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-bold text-slate-500 uppercase tracking-wider text-[10px] mr-1">Filter Scope:</span>
              {[
                { id: 'all', label: 'All Semesters' },
                { id: '5', label: '5th Sem Duties' },
                { id: '7', label: '7th Sem Duties' },
                { id: '3', label: '3rd Sem Duties' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setOverallFilterSem(tab.id)}
                  className={`px-3 py-1 rounded-lg font-semibold text-xs transition-all ${
                    overallFilterSem === tab.id
                      ? 'bg-sky-600 text-white shadow-sm'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="text-[11px] text-slate-500 font-medium">
              Showing {overallSessions.filter(s => overallFilterSem === 'all' || s.sem_number === parseInt(overallFilterSem)).length} Sessions
            </div>
          </div>

          {/* Session Cards List */}
          {overallLoading ? (
            <div className="py-12 text-center text-slate-400">Loading overall examination duty sessions...</div>
          ) : overallSessions.filter(s => overallFilterSem === 'all' || s.sem_number === parseInt(overallFilterSem)).length === 0 ? (
            <div className="py-12 text-center text-slate-400 italic">No examination sessions found for the selected filter.</div>
          ) : (
            <div className="max-h-[60vh] overflow-y-auto space-y-4 pr-1">
              {overallSessions
                .filter(s => overallFilterSem === 'all' || s.sem_number === parseInt(overallFilterSem))
                .map((sess) => {
                  const state = overallSessionState[sess.id] || {};
                  const confObj = overallConflictState[sess.id]?.conflicts || {};
                  const respectedSems = overallConflictState[sess.id]?.respected_sems || [];
                  const semNum = sess.sem_number || sess.semester?.sem_number;

                  return (
                    <div
                      key={sess.id}
                      className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-3"
                    >
                      {/* Session Header */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                            semNum === 5 ? 'bg-sky-100 text-sky-800' : semNum === 7 ? 'bg-indigo-100 text-indigo-800' : 'bg-amber-100 text-amber-800'
                          }`}>
                            {sess.semester_name || `${semNum}th Sem`}
                          </span>
                          <span className="font-bold text-slate-900 text-sm">
                            {sess.subject_code} - {sess.subject_name}
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-slate-500 font-mono">
                            Session ID #{sess.id}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleOverallAutoAssignForSession(sess.id)}
                            className="px-2.5 py-1 bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200 rounded text-[11px] font-semibold flex items-center gap-1 shadow-2xs"
                            title="Auto-assign conflict-free faculty based on respected timetable"
                          >
                            <Sparkles className="w-3.5 h-3.5 text-sky-600" />
                            <span>Auto-Assign</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSaveSingleSessionInOverall(sess.id)}
                            disabled={isSavingOverall}
                            className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-[11px] font-semibold flex items-center gap-1 shadow-2xs disabled:opacity-50"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Save & Reload</span>
                          </button>
                        </div>
                      </div>

                      {/* Date & Time Row */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Date</label>
                          <input
                            type="date"
                            value={state.exam_date || sess.exam_date || '2026-09-10'}
                            onChange={(e) => handleOverallSessionDateChange(sess.id, e.target.value)}
                            className="w-full bg-slate-50 border border-slate-300 rounded px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-indigo-500 font-mono"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Start Time</label>
                          <input
                            type="time"
                            value={state.start_time || sess.start_time || '09:00'}
                            onChange={(e) => handleOverallSessionTimeChange(sess.id, e.target.value, state.end_time || sess.end_time || '10:00')}
                            className="w-full bg-slate-50 border border-slate-300 rounded px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-indigo-500 font-mono"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">End Time</label>
                          <input
                            type="time"
                            value={state.end_time || sess.end_time || '10:00'}
                            onChange={(e) => handleOverallSessionTimeChange(sess.id, state.start_time || sess.start_time || '09:00', e.target.value)}
                            className="w-full bg-slate-50 border border-slate-300 rounded px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-indigo-500 font-mono"
                          />
                        </div>
                      </div>

                      {/* Quick Timing Presets for this Session */}
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mr-1">Presets:</span>
                        {[
                          { label: '09:00 - 10:00', st: '09:00', et: '10:00' },
                          { label: '09:30 - 10:30', st: '09:30', et: '10:30' },
                          { label: '11:30 - 12:30', st: '11:30', et: '12:30' },
                          { label: '12:00 - 13:00', st: '12:00', et: '13:00' },
                          { label: '14:00 - 15:00 (2-3 PM)', st: '14:00', et: '15:00' },
                          { label: '14:30 - 15:30 (2:30-3:30 PM)', st: '14:30', et: '15:30' },
                          { label: '15:30 - 16:30', st: '15:30', et: '16:30' }
                        ].map((pr, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => handleOverallSessionTimeChange(sess.id, pr.st, pr.et)}
                            className={`px-2 py-0.5 rounded text-[10px] font-semibold border transition-all ${
                              state.start_time === pr.st && state.end_time === pr.et
                                ? 'bg-sky-600 text-white border-sky-600 shadow-2xs'
                                : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                            }`}
                          >
                            {pr.label}
                          </button>
                        ))}
                      </div>

                      {/* Respected Timetable Protection Note */}
                      <div className="text-[11px] text-slate-500 flex items-center gap-1.5 font-medium">
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                        <span>
                          Respected Timetable Protected (±60 min buffer):{' '}
                          <strong className="text-slate-700">
                            {respectedSems.length > 0 ? respectedSems.join(', ') : semNum === 3 ? '5th & 7th Semester' : '3rd Semester'}
                          </strong>
                        </span>
                      </div>

                      {/* Rooms & Faculty Dropdowns */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                        {(state.rooms || []).map((r, rIdx) => {
                          const assignedFid = parseInt(r.faculty_id);
                          const conf = confObj[assignedFid];
                          const hasClash = conf?.has_clash || conf?.has_3rd_sem_clash;

                          return (
                            <div
                              key={r.id || rIdx}
                              className={`p-2.5 rounded-lg border text-xs space-y-1.5 ${
                                hasClash
                                  ? 'bg-rose-50/70 border-rose-200'
                                  : r.faculty_id
                                  ? 'bg-slate-50/70 border-slate-200'
                                  : 'bg-amber-50/70 border-amber-200'
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <span className="font-bold text-slate-800">
                                  Room {r.room_number} (Roll {r.student_start}–{r.student_end})
                                </span>
                                {hasClash ? (
                                  <span className="text-[10px] text-rose-700 font-bold bg-rose-100 px-1.5 py-0.5 rounded">
                                    ⚠️ Class Clash
                                  </span>
                                ) : r.faculty_id ? (
                                  <span className="text-[10px] text-emerald-700 font-bold bg-emerald-100 px-1.5 py-0.5 rounded">
                                    ✅ Conflict-Free
                                  </span>
                                ) : (
                                  <span className="text-[10px] text-amber-700 font-bold bg-amber-100 px-1.5 py-0.5 rounded">
                                    ⏳ Unassigned
                                  </span>
                                )}
                              </div>

                              <select
                                value={r.faculty_id || ''}
                                onChange={(e) => handleOverallSessionRoomFacultyChange(sess.id, r.id, e.target.value)}
                                className={`w-full border rounded px-2 py-1 text-xs font-semibold focus:outline-none focus:border-indigo-500 ${
                                  hasClash
                                    ? 'bg-white border-rose-300 text-rose-900'
                                    : 'bg-white border-slate-300 text-slate-900'
                                }`}
                              >
                                <option value="">-- Unassigned (Pending) --</option>
                                {safeFacultyList.map((f) => {
                                  const fConf = confObj[f.id];
                                  const fClash = fConf?.has_clash || fConf?.has_3rd_sem_clash;
                                  const isSquad = f.only_squad_duty || f.id === 1 || f.name?.includes('Arjun');
                                  const isExcluded = !f.eligible_for_duty;

                                  let label = f.name;
                                  if (isSquad) label += ' [Squad Duty Only]';
                                  else if (isExcluded) label += ' [Excluded]';
                                  else if (fClash) label += ` ⚠️ [Class Clash: ${fConf?.clash_details?.join(', ')}]`;
                                  else label += ' (Available)';

                                  return (
                                    <option
                                      key={f.id}
                                      value={f.id}
                                      disabled={isSquad || isExcluded}
                                      className={fClash ? 'text-rose-700 font-bold' : ''}
                                    >
                                      {label}
                                    </option>
                                  );
                                })}
                              </select>

                              {hasClash && conf?.clash_details && (
                                <p className="text-[10px] text-rose-700 italic">
                                  Clash: {conf.clash_details.join(', ')}
                                </p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
            </div>
          )}

          {/* Modal Footer */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-slate-200">
            <p className="text-[11px] text-slate-500">
              Saving updates examination timings and assigned faculty, verifies against respected timetables, updates faculty profiles, and reloads the page.
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsOverallEditModalOpen(false)}
                className="px-4 py-2 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 font-medium"
              >
                Close
              </button>
              <button
                type="button"
                onClick={handleSaveAllOverallSessions}
                disabled={isSavingOverall}
                className="px-5 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg font-semibold shadow-sm disabled:opacity-50 flex items-center gap-1.5"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>{isSavingOverall ? 'Saving All & Reloading...' : 'Save All Changes & Reload Page'}</span>
              </button>
            </div>
          </div>
        </div>
      </Modal>

      {/* ========================================================================= */}
      {/* 8. FACULTY DUTY QUOTAS & SENIORITY PROTECTION MODAL                        */}
      {/* ========================================================================= */}
      <Modal
        isOpen={isQuotaModalOpen}
        onClose={() => setIsQuotaModalOpen(false)}
        title="Faculty Duty Quotas & Seniority Protection"
        maxWidth="max-w-2xl"
      >
        <div className="space-y-4 text-xs">
          {/* Individual Faculty Quota List */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="font-bold text-slate-700 text-xs">
                Enter Duty Quota Per Faculty Member:
              </label>
              <span className="text-[11px] text-slate-500">
                (e.g. Dr. Swathi H Y: 1, Mrs. Ankitha S: 3)
              </span>
            </div>
            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {safeFacultyList.map((f) => {
                const isSquad = f.only_squad_duty || f.id === 1 || f.name?.includes('Arjun');
                const isSenior = f.designation?.includes('Associate') || f.designation?.includes('Professor') || f.name?.includes('Swathi');
                const curVal = quotaMap[f.id] !== undefined ? quotaMap[f.id] : (f.max_duty_capacity !== undefined ? f.max_duty_capacity : 5);
                const assignedCount = allDutyRows.filter(r => r.allocated_faculty?.id === f.id || r.allocated_faculty?.name === f.name).length;

                return (
                  <div
                    key={f.id}
                    className={`p-2.5 rounded-xl border flex items-center justify-between gap-3 transition-all ${
                      isSquad
                        ? 'bg-amber-50/70 border-amber-200'
                        : isSenior
                        ? 'bg-purple-50/70 border-purple-200 ring-1 ring-purple-100'
                        : 'bg-white border-slate-200'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-slate-900 text-xs flex items-center gap-1.5">
                        <span>{f.name}</span>
                        {isSquad ? (
                          <span className="px-1.5 py-0.5 bg-amber-100 text-amber-800 text-[9px] font-bold rounded">
                            🛡️ Squad Duty Only (HOD)
                          </span>
                        ) : isSenior ? (
                          <span className="px-1.5 py-0.5 bg-purple-100 text-purple-800 text-[9px] font-bold rounded">
                            ⭐ Senior Faculty (Protected)
                          </span>
                        ) : null}
                      </div>
                      <div className="text-[10px] text-slate-500 mt-0.5 flex items-center gap-2">
                        <span>{f.designation || 'Faculty'}</span>
                        <span className="text-slate-300">•</span>
                        <span>Currently Assigned in Schedule: <strong>{assignedCount}</strong></span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {isSquad ? (
                        <span className="text-[11px] text-amber-700 font-semibold px-2">Exempt from rooms</span>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <label className="text-[11px] text-slate-500 font-medium">Duty Cap:</label>
                          <input
                            type="number"
                            min="0"
                            max="20"
                            value={curVal}
                            onChange={(e) => handleQuotaInputChange(f.id, e.target.value)}
                            className="w-14 bg-slate-50 border border-slate-300 rounded-lg px-2 py-1 text-center font-bold text-xs text-slate-900 focus:outline-none focus:border-purple-500"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Modal Footer */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-slate-200">
            <div className="text-[11px] text-slate-500">
              Total Configured Room Duties: <strong className="text-slate-800 font-bold">{Object.entries(quotaMap).filter(([fid]) => parseInt(fid) !== 1).reduce((a, [, b]) => a + (parseInt(b) || 0), 0) || 21} Duties</strong>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsQuotaModalOpen(false)}
                className="px-3.5 py-2 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 font-medium"
              >
                Close
              </button>
              <button
                type="button"
                onClick={handleSaveQuotasOnly}
                disabled={isSavingQuotas}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg font-semibold border border-slate-300 disabled:opacity-50"
              >
                {isSavingQuotas ? 'Saving...' : 'Save Quotas Only'}
              </button>
              <button
                type="button"
                onClick={handleSaveAndAssignByQuotas}
                disabled={isSavingQuotas}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-bold shadow-sm disabled:opacity-50 flex items-center gap-1.5"
              >
                <Sparkles className="w-4 h-4" />
                <span>{isSavingQuotas ? 'Assigning...' : 'Save & Auto-Assign Now'}</span>
              </button>
            </div>
          </div>
        </div>
      </Modal>

      {/* Emergency Standby Deployment Modal */}
      <Modal
        isOpen={isStandbyModalOpen}
        onClose={() => setIsStandbyModalOpen(false)}
        title="Emergency Standby Invigilator Deployment"
        maxWidth="max-w-xl"
      >
        <div className="space-y-4 text-xs">
          {/* Slot Context Summary */}
          {standbyRow && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl space-y-1">
              <div className="text-[10px] uppercase font-bold text-rose-600 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>Invigilator Absence Detected</span>
              </div>
              <div className="font-bold text-slate-900 text-sm">
                Room {standbyRow.room_number} • {standbyRow.subject_code} - {standbyRow.subject_name}
              </div>
              <div className="text-slate-600 flex items-center gap-3 text-[11px]">
                <span><strong>Date:</strong> {standbyRow.exam_date}</span>
                <span><strong>Time:</strong> {standbyRow.time_slot}</span>
                <span><strong>Previous Invigilator:</strong> {standbyRow.allocated_faculty?.name || 'Unassigned'}</span>
              </div>
            </div>
          )}

          <div className="p-3 bg-sky-50 border border-sky-200 rounded-xl text-sky-900 text-[11px] flex items-start gap-2">
            <ShieldCheck className="w-4 h-4 text-sky-600 shrink-0 mt-0.5" />
            <div>
              <strong>Instant Conflict Protection:</strong> All standby candidates below have zero concurrent duties, zero clashes with their teaching timetable, and adhere strictly to <strong>60-minute pre- and post-lecture safety buffers</strong>. Sorted by lowest current workload.
            </div>
          </div>

          {/* Standby Candidates List */}
          <div>
            <h4 className="font-bold text-slate-700 text-xs mb-2 uppercase tracking-wider">
              Available Standby Faculty ({standbyList.length})
            </h4>

            {isLoadingStandby ? (
              <div className="py-8 text-center text-slate-400">Auditing faculty availability...</div>
            ) : standbyList.length === 0 ? (
              <div className="p-6 bg-slate-50 border border-slate-200 rounded-xl text-center text-slate-500">
                No eligible standby faculty with zero lecture buffer clashes found for this slot. Please perform manual administrative reassignment.
              </div>
            ) : (
              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {standbyList.map((fac) => (
                  <div
                    key={fac.id}
                    className="p-3 bg-white border border-slate-200 hover:border-indigo-300 rounded-xl flex items-center justify-between gap-3 shadow-2xs transition-all"
                  >
                    <div>
                      <div className="font-bold text-slate-900 text-xs flex items-center gap-2">
                        <span>{fac.name}</span>
                        <span className="px-1.5 py-0.2 bg-emerald-100 text-emerald-800 text-[9px] font-bold rounded">
                          0 Buffer Clashes
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-500 mt-0.5">
                        {fac.designation || 'Faculty'} • Current Workload: <strong>{fac.current_duties} duties</strong> (Cap: {fac.max_capacity})
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={isReassigningStandby}
                      onClick={() => handleEmergencyReassign(fac.id)}
                      className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg font-bold text-xs shadow-sm flex items-center gap-1 transition-all"
                    >
                      <UserCheck className="w-3.5 h-3.5" />
                      <span>Deploy & Check In</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-end pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setIsStandbyModalOpen(false)}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl text-xs"
            >
              Close
            </button>
          </div>
        </div>
      </Modal>

    </div>
  );
};

export default ExamSchedule;
