import React, { useState, useEffect, useMemo } from 'react';
import { academicApi } from '../services/academicApi';
import { facultyApi } from '../services/facultyApi';
import Modal from '../components/common/Modal';
import Badge from '../components/common/Badge';
import {
  Plus,
  Trash2,
  Calendar,
  Filter,
  Clock,
  MapPin,
  User,
  GraduationCap,
  ShieldCheck,
  Building2,
  BookOpen,
  Pencil,
  CheckCircle2,
  CalendarPlus,
  UploadCloud,
  FileSpreadsheet,
  Download,
  Sparkles,
  Layers,
  Copy,
  AlertCircle,
  X,
  Image as ImageIcon,
  Maximize2,
  Minimize2,
  Loader2,
  RefreshCw,
  Scan
} from 'lucide-react';


const SEM3_OFFICIAL_LEGEND = {
  '25MAAI301': { ltp: '3-0-0', credits: '3', faculty: 'Dr. Adithya G N', room: 'AI303' },
  '25AI302':   { ltp: '3-0-2', credits: '3 / 1', faculty: 'Dr. Swathi H Y (Theory) | HYS, SDN (Lab)', room: 'AI303 / SA-205' },
  '25AI303':   { ltp: '3-0-2', credits: '3 / 2', faculty: 'Mrs. Sheetal D N (Theory) | SDN, ABC, SMV (Lab)', room: 'AI303 / SA-205' },
  '25AI304':   { ltp: '3-0-0', credits: '3', faculty: 'Mrs. Maseeha Banu', room: 'AI303' },
  '25AI305':   { ltp: '3-0-0', credits: '3', faculty: 'Mrs. Ankitha S', room: 'AI303' },
  '25AIL306':  { ltp: '0-0-2', credits: '1', faculty: 'Mrs. Maseeha Banu, SMV, ANS', room: 'SA-205' },
  '25AIL307':  { ltp: '0-0-2', credits: '1', faculty: 'Mrs. Megha H C, SMV, ANS', room: 'SA-205' },
  '25AI308A':  { ltp: '0-0-2', credits: '1', faculty: 'Mrs. Sushma M V, MHC, MB', room: 'SA-205' },
  '25SCR':     { ltp: '0-0-2', credits: '1', faculty: 'Mrs. Megha H C, Mrs. Maseeha Banu', room: 'AI303' },
  '25PT1':     { ltp: '2-0-0', credits: 'Audit', faculty: 'Mrs. Sushma M V', room: 'AI303' },
  '25NYP1':    { ltp: '0-0-2', credits: 'Audit', faculty: 'Mrs. Maseeha Banu', room: 'AI303' },
  '25BCM301':  { ltp: '2-0-0', credits: 'Audit', faculty: 'Mathematics Faculty', room: 'AI303' }
};
const SEM3_OFFICIAL_ORDER = Object.keys(SEM3_OFFICIAL_LEGEND);
const OCR_FACULTY_NAMES = {
  ABC: 'Dr. Arjun B C',
  HYS: 'Dr. Swathi H Y',
  SMV: 'Mrs. Sushma M V',
  ANS: 'Mrs. Ankitha S',
  MHC: 'Mrs. Megha H C',
  MB: 'Mrs. Maseeha Banu',
  SDN: 'Sheethal D N',
  AGN: 'Dr. Adithya G N',
  SSG: 'Prof. S. S. Girish',
  AKP: 'Prof. A. K. Parvathi'
};

const Timetables = () => {
  const [semesters, setSemesters] = useState([]);
  const [activeSemId, setActiveSemId] = useState(null);
  const [selectedCycle, setSelectedCycle] = useState('odd'); // 'odd' (3, 5, 7) | 'even' (4, 6)
  const [entries, setEntries] = useState([]);
  const [facultyList, setFacultyList] = useState([]);
  const [subjectsList, setSubjectsList] = useState([]);
  const [selectedFacultyFilter, setSelectedFacultyFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [successToast, setSuccessToast] = useState(null);

  // Add slot modal state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [formSemesterId, setFormSemesterId] = useState('');
  const [formSubjectId, setFormSubjectId] = useState('');
  const [formFacultyId, setFormFacultyId] = useState('');
  const [formDay, setFormDay] = useState('MON');
  const [formStartTime, setFormStartTime] = useState('09:30');
  const [formEndTime, setFormEndTime] = useState('10:30');
  const [formRoom, setFormRoom] = useState('AI302');
  const [isSubmittingAdd, setIsSubmittingAdd] = useState(false);

  // Edit slot modal state
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editEntryId, setEditEntryId] = useState(null);
  const [editSemesterId, setEditSemesterId] = useState('');
  const [editSubjectId, setEditSubjectId] = useState('');
  const [editFacultyId, setEditFacultyId] = useState('');
  const [editDay, setEditDay] = useState('MON');
  const [editStartTime, setEditStartTime] = useState('09:30');
  const [editEndTime, setEditEndTime] = useState('10:30');
  const [editRoom, setEditRoom] = useState('AI302');
  const [isSubmittingEdit, setIsSubmittingEdit] = useState(false);

  // Manage / Delete slots list modal state
  const [isManageModalOpen, setIsManageModalOpen] = useState(false);

  // Complete Timetable Entry (5th Sem Timetable Grid Style) state
  const [isCompleteModalOpen, setIsCompleteModalOpen] = useState(false);
  const [completeSemId, setCompleteSemId] = useState('');
  const [completeReplaceExisting, setCompleteReplaceExisting] = useState(true);
  const [completeTab, setCompleteTab] = useState('grid'); // 'grid' | 'csv'
  const [gridData, setGridData] = useState({
    MON: {},
    TUE: {},
    WED: {},
    THU: {},
    FRI: {},
    SAT: {}
  });
  const [csvText, setCsvText] = useState('');
  const [csvParsedPreview, setCsvParsedPreview] = useState([]);
  const [isSubmittingBulk, setIsSubmittingBulk] = useState(false);

  // Timetable Circular Image Upload & Auto-Alignment State
  const [uploadedImageFile, setUploadedImageFile] = useState(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState(null);
  const [isParsingImage, setIsParsingImage] = useState(false);
  const [imageParseResult, setImageParseResult] = useState(null);
  const [isImageZoomed, setIsImageZoomed] = useState(false);


  // Inline New Subject creation state
  const [isNewSubjectModalOpen, setIsNewSubjectModalOpen] = useState(false);
  const [newSubCode, setNewSubCode] = useState('');
  const [newSubName, setNewSubName] = useState('');
  const [newSubSemId, setNewSubSemId] = useState('');
  const [isSubmittingSubject, setIsSubmittingSubject] = useState(false);
  const [activeSubjectCellTarget, setActiveSubjectCellTarget] = useState(null); // { dayKey, periodId }

  const days = [
    { key: 'MON', name: 'Monday' },
    { key: 'TUE', name: 'Tuesday' },
    { key: 'WED', name: 'Wednesday' },
    { key: 'THU', name: 'Thursday' },
    { key: 'FRI', name: 'Friday' },
    { key: 'SAT', name: 'Saturday' }
  ];

  // Odd semesters strictly 3, 5, 7; Even semesters strictly 4, 6
  const oddSemesters = useMemo(
    () => semesters.filter((s) => [3, 5, 7].includes(s.sem_number)).sort((a, b) => a.sem_number - b.sem_number),
    [semesters]
  );
  const evenSemesters = useMemo(
    () => semesters.filter((s) => [4, 6].includes(s.sem_number)).sort((a, b) => a.sem_number - b.sem_number),
    [semesters]
  );
  const visibleSemesters = selectedCycle === 'odd' ? oddSemesters : evenSemesters;

  const activeSemester = semesters.find((s) => s.id === activeSemId) || null;
  const completeSemester = semesters.find((s) => s.id === completeSemId) || activeSemester;
  const displayedSubjects = activeSemester?.sem_number === 3
    ? subjectsList
        .filter((subject) => SEM3_OFFICIAL_ORDER.includes(subject.code))
        .sort((a, b) => SEM3_OFFICIAL_ORDER.indexOf(a.code) - SEM3_OFFICIAL_ORDER.indexOf(b.code))
    : subjectsList;

  // Location / Classroom strings based on semester
  const getLocationInfo = () => {
    if (activeSemester?.sem_number === 3) {
      return { classroom: 'AI303', lab: 'SA-205', cycle: 'Odd Semester (2026-27)' };
    } else if (activeSemester?.sem_number === 4) {
      return { classroom: 'AI302', lab: 'SA-205', cycle: 'Even Semester (2026-27)' };
    } else if (activeSemester?.sem_number === 5) {
      return { classroom: 'AI301*, AI302, AI303**', lab: 'SA-205', cycle: 'Odd Semester (2026-27)' };
    } else if (activeSemester?.sem_number === 6) {
      return { classroom: 'AI301', lab: 'SA-205', cycle: 'Even Semester (2026-27)' };
    } else if (activeSemester?.sem_number === 7) {
      return { classroom: 'AI301*, AI302', lab: 'SA-205', cycle: 'Odd Semester (2026-27)' };
    }
    return { classroom: 'AI301', lab: 'SA-205', cycle: 'Academic Year 2026-27' };
  };

  const locInfo = getLocationInfo();

  // Authentic period timings from official MCE Timetable circulars:
  // 09:30 - 10:30, TEA BREAK (10:30-11:00), 11:00 - 12:00, 12:00 - 1:00, LUNCH (1:00-2:00), 2:00 - 3:00, 3:00 - 4:00, 4:00 - 5:00
  const periods = [
    { id: 'p1', type: 'class', label: '09:30 - 10:30', start: '09:30', end: '10:30' },
    { id: 'tea', type: 'break', label: '10:30 - 11:00', start: '10:30', end: '11:00', title: 'BREAK' },
    { id: 'p2', type: 'class', label: '11:00 - 12:00', start: '11:00', end: '12:00' },
    { id: 'p3', type: 'class', label: '12:00 - 1:00', start: '12:00', end: '13:00' },
    { id: 'lunch', type: 'lunch', label: '1:00 - 2:00', start: '13:00', end: '14:00', title: 'LUNCH BREAK' },
    { id: 'p4', type: 'class', label: '2:00 - 3:00', start: '14:00', end: '15:00' },
    { id: 'p5', type: 'class', label: '3:00 - 4:00', start: '15:00', end: '16:00' },
    { id: 'p6', type: 'class', label: '4:00 - 5:00', start: '16:00', end: '17:00' }
  ];

  const showToast = (msg) => {
    setSuccessToast(msg);
    setTimeout(() => setSuccessToast(null), 3500);
  };

  useEffect(() => {
    loadInitialData();
  }, []);

  useEffect(() => {
    if (activeSemId) {
      loadTimetables(activeSemId);
      loadSubjects(activeSemId);
    }
  }, [activeSemId, selectedFacultyFilter]);

  const loadInitialData = async () => {
    try {
      const [semRes, facRes] = await Promise.all([
        academicApi.getSemesters(),
        facultyApi.getAll({ status: 'active' })
      ]);
      const semList = semRes.data || [];
      setSemesters(semList);
      setFacultyList(facRes.data.faculty || []);
      if (semList.length > 0) {
        // Default to III Semester (sem_number 3)
        const defaultSem = semList.find((s) => s.sem_number === 3) || semList[0];
        setActiveSemId(defaultSem.id);
        setFormSemesterId(defaultSem.id);
      }
    } catch (err) {
      console.error('Error loading initial academic data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectCycle = (cycle) => {
    setSelectedCycle(cycle);
    if (cycle === 'odd') {
      const targetSem = oddSemesters.find((s) => s.sem_number === 3) || oddSemesters[0];
      if (targetSem) {
        setActiveSemId(targetSem.id);
        setFormSemesterId(targetSem.id);
      }
    } else {
      const targetSem = evenSemesters.find((s) => s.sem_number === 4) || evenSemesters[0];
      if (targetSem) {
        setActiveSemId(targetSem.id);
        setFormSemesterId(targetSem.id);
      }
    }
  };

  const loadSubjects = async (semId) => {
    try {
      const res = await academicApi.getSubjects(semId);
      const subs = res.data || [];
      setSubjectsList(subs);
      if (subs.length > 0) {
        setFormSubjectId(subs[0].id);
      }
    } catch (err) {
      console.error('Error loading subjects:', err);
    }
  };

  const loadTimetables = async (semId) => {
    setLoading(true);
    try {
      const params = { semester_id: semId };
      if (selectedFacultyFilter) params.faculty_id = selectedFacultyFilter;
      const res = await academicApi.getTimetables(params);
      setEntries(res.data || []);
    } catch (err) {
      console.error('Error fetching timetables:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddEntry = async (e) => {
    e.preventDefault();
    setIsSubmittingAdd(true);
    try {
      const payload = {
        semester_id: parseInt(formSemesterId || activeSemId),
        faculty_id: parseInt(formFacultyId),
        day_of_week: formDay,
        start_time: formStartTime,
        end_time: formEndTime,
        room_number: formRoom
      };
      if (formSubjectId) {
        payload.subject_id = parseInt(formSubjectId);
      }
      await academicApi.createTimetableEntry(payload);
      setIsAddModalOpen(false);
      showToast('Timetable lecture slot added successfully.');
      loadTimetables(activeSemId);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to add timetable entry');
    } finally {
      setIsSubmittingAdd(false);
    }
  };

  const handleOpenAddForSlot = (dayKey, period) => {
    setFormSemesterId(activeSemId);
    setFormDay(dayKey);
    setFormStartTime(period.start);
    setFormEndTime(period.end);
    setFormRoom(locInfo.classroom.split(',')[0].replace('*', '').trim() || 'AI302');
    setIsAddModalOpen(true);
  };

  const handleOpenEditModal = (entry) => {
    setEditEntryId(entry.id);
    setEditSemesterId(entry.semester_id || activeSemId);
    setEditSubjectId(entry.subject_id || '');
    setEditFacultyId(entry.faculty_id);
    setEditDay(entry.day_of_week);
    setEditStartTime(entry.start_time);
    setEditEndTime(entry.end_time);
    setEditRoom(entry.room_number || 'AI302');
    loadSubjects(entry.semester_id || activeSemId);
    setIsEditModalOpen(true);
  };

  const handleSaveEditEntry = async (e) => {
    e.preventDefault();
    setIsSubmittingEdit(true);
    try {
      const payload = {
        semester_id: parseInt(editSemesterId),
        faculty_id: parseInt(editFacultyId),
        day_of_week: editDay,
        start_time: editStartTime,
        end_time: editEndTime,
        room_number: editRoom
      };
      if (editSubjectId) {
        payload.subject_id = parseInt(editSubjectId);
      }
      await academicApi.updateTimetableEntry(editEntryId, payload);
      setIsEditModalOpen(false);
      showToast('Timetable lecture slot updated successfully.');
      loadTimetables(activeSemId);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to update timetable entry');
    } finally {
      setIsSubmittingEdit(false);
    }
  };

  const handleDeleteEntry = async (id) => {
    if (!window.confirm('Are you sure you want to remove this timetable slot?')) return;
    try {
      await academicApi.deleteTimetableEntry(id);
      showToast('Timetable lecture slot deleted.');
      loadTimetables(activeSemId);
    } catch (err) {
      alert('Failed to delete timetable entry');
    }
  };

  const handleClearAllSemesterSlots = async () => {
    if (!window.confirm(`Are you sure you want to delete ALL timetable slots for ${activeSemester?.name}? This action cannot be undone.`)) return;
    try {
      await academicApi.clearSemesterTimetable(activeSemId);
      showToast(`All timetable slots cleared for ${activeSemester?.name}.`);
      loadTimetables(activeSemId);
      setIsManageModalOpen(false);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to clear semester timetable');
    }
  };

  // 6 Class lecture periods matching official 5th Sem Timetable circular:
  // Period 1: 09:30 - 10:30
  // TEA BREAK: 10:30 - 11:00
  // Period 2: 11:00 - 12:00
  // Period 3: 12:00 - 1:00
  // LUNCH BREAK: 1:00 - 2:00
  // Period 4: 2:00 - 3:00
  // Period 5: 3:00 - 4:00
  // Period 6: 4:00 - 5:00
  const timetableClassPeriods = [
    { id: 'p1', label: '09:30 - 10:30', start: '09:30', end: '10:30', labEnd: '11:30' },
    { id: 'p2', label: '11:00 - 12:00', start: '11:00', end: '12:00', labEnd: '13:00' },
    { id: 'p3', label: '12:00 - 1:00', start: '12:00', end: '13:00', labEnd: '14:00' },
    { id: 'p4', label: '2:00 - 3:00', start: '14:00', end: '15:00', labEnd: '16:00' },
    { id: 'p5', label: '3:00 - 4:00', start: '15:00', end: '16:00', labEnd: '17:00' },
    { id: 'p6', label: '4:00 - 5:00', start: '16:00', end: '17:00', labEnd: '18:00' }
  ];

  const isTwoHourSlot = (start, end) => {
    if (!start || !end) return false;
    const [sh, sm] = start.split(':').map(Number);
    const [eh, em] = end.split(':').map(Number);
    const diffMinutes = (eh * 60 + em) - (sh * 60 + sm);
    return diffMinutes >= 90;
  };

  const getSlotDurationHours = (st, et) => {
    if (!st || !et) return 1;
    const [sh, sm] = st.split(':').map(Number);
    const [eh, em] = et.split(':').map(Number);
    const diff = (eh * 60 + em) - (sh * 60 + sm);
    return Math.max(1, Math.round(diff / 60));
  };

  const getCoveringPeriod = (dayKey, periodId) => {
    const prevMap = { p3: 'p2', p5: 'p4', p6: 'p5' };
    const prevId = prevMap[periodId];
    if (prevId) {
      const prevCell = gridData[dayKey]?.[prevId];
      if (prevCell) {
        const facId = typeof prevCell === 'object' ? prevCell.faculty_id : prevCell;
        const dur = typeof prevCell === 'object' ? prevCell.duration_hours : 1;
        const et = typeof prevCell === 'object' ? prevCell.end_time : null;
        const periodObj = timetableClassPeriods.find((p) => p.id === periodId);
        if (facId && (dur >= 2 || (et && periodObj && et > periodObj.start))) {
          return prevId;
        }
      }
    }
    return null;
  };

  const populateGridFromEntries = (targetEntries) => {
    const newGrid = { MON: {}, TUE: {}, WED: {}, THU: {}, FRI: {}, SAT: {} };
    targetEntries.forEach((entry) => {
      let matchedPeriod = null;
      for (const p of timetableClassPeriods) {
        if (entry.start_time === p.start) {
          matchedPeriod = p;
          break;
        }
      }
      if (!matchedPeriod) {
        for (const p of timetableClassPeriods) {
          if (entry.start_time < p.end && entry.end_time > p.start) {
            matchedPeriod = p;
            break;
          }
        }
      }

      if (matchedPeriod) {
        const [sh, sm] = (entry.start_time || '09:30').split(':').map(Number);
        const [eh, em] = (entry.end_time || '10:30').split(':').map(Number);
        const diffMinutes = (eh * 60 + em) - (sh * 60 + sm);
        const durHours = Math.max(1, Math.round(diffMinutes / 60));

        newGrid[entry.day_of_week][matchedPeriod.id] = {
          faculty_id: entry.faculty_id,
          subject_id: entry.subject_id || '',
          start_time: entry.start_time,
          end_time: entry.end_time,
          duration_hours: durHours,
          is_lab: durHours >= 2 || (entry.subject_name && entry.subject_name.toLowerCase().includes('lab'))
        };
      }
    });
    return newGrid;
  };

  const handleOpenCompleteModal = async () => {
    const targetSem = activeSemId || semesters[0]?.id;
    setCompleteSemId(targetSem);
    setCompleteReplaceExisting(true);
    setCompleteTab('grid');
    if (targetSem) {
      loadSubjects(targetSem);
    }

    // Load active semester's entries into the 5th Sem Grid layout!
    let targetEntries = entries;
    if (targetSem !== activeSemId) {
      try {
        const res = await academicApi.getTimetables({ semester_id: targetSem });
        targetEntries = res.data || [];
      } catch (err) {
        targetEntries = [];
      }
    }

    setGridData(populateGridFromEntries(targetEntries));
    setIsCompleteModalOpen(true);
  };

  const handleCompleteSemChange = async (newSemId) => {
    setCompleteSemId(newSemId);
    if (newSemId) {
      loadSubjects(newSemId);
    }
    try {
      const res = await academicApi.getTimetables({ semester_id: newSemId });
      setGridData(populateGridFromEntries(res.data || []));
    } catch (err) {
      console.error('Error changing target semester in grid:', err);
    }
  };

  const handleGridCellFacultyChange = (dayKey, periodId, facultyId) => {
    const periodObj = timetableClassPeriods.find((p) => p.id === periodId);
    if (!facultyId) {
      handleGridCellClear(dayKey, periodId);
      return;
    }
    setGridData((prev) => {
      const prevCell = prev[dayKey]?.[periodId];
      const currentCell = typeof prevCell === 'object' && prevCell !== null ? prevCell : {};
      const st = currentCell.start_time || periodObj?.start || '09:30';
      const et = currentCell.end_time || periodObj?.end || '10:30';
      const isLab = isTwoHourSlot(st, et);
      return {
        ...prev,
        [dayKey]: {
          ...prev[dayKey],
          [periodId]: {
            ...currentCell,
            faculty_id: parseInt(facultyId),
            subject_id: currentCell.subject_id || '',
            start_time: st,
            end_time: et,
            duration_hours: isLab ? 2 : (currentCell.duration_hours || 1),
            is_lab: isLab
          }
        }
      };
    });
  };

  const handleGridCellSubjectChange = (dayKey, periodId, subjectId) => {
    const periodObj = timetableClassPeriods.find((p) => p.id === periodId);
    setGridData((prev) => {
      const prevCell = prev[dayKey]?.[periodId];
      const currentCell = typeof prevCell === 'object' && prevCell !== null ? prevCell : (prevCell ? { faculty_id: prevCell } : {});
      return {
        ...prev,
        [dayKey]: {
          ...prev[dayKey],
          [periodId]: {
            ...currentCell,
            subject_id: subjectId ? parseInt(subjectId) : '',
            start_time: currentCell.start_time || periodObj?.start || '09:30',
            end_time: currentCell.end_time || periodObj?.end || '10:30',
            duration_hours: currentCell.duration_hours || 1,
            is_lab: !!currentCell.is_lab
          }
        }
      };
    });
  };

  const handleGridTimeChange = (dayKey, periodId, field, value) => {
    const periodObj = timetableClassPeriods.find((p) => p.id === periodId);
    setGridData((prev) => {
      const prevCell = prev[dayKey]?.[periodId];
      const cell = typeof prevCell === 'object' && prevCell !== null ? prevCell : (prevCell ? { faculty_id: prevCell } : {});
      const updatedCell = {
        ...cell,
        start_time: cell.start_time || periodObj?.start || '09:30',
        end_time: cell.end_time || periodObj?.end || '10:30',
        [field]: value
      };
      const st = updatedCell.start_time;
      const et = updatedCell.end_time;
      if (st && et) {
        const [sh, sm] = st.split(':').map(Number);
        const [eh, em] = et.split(':').map(Number);
        const diffMinutes = (eh * 60 + em) - (sh * 60 + sm);
        const diffH = Math.max(1, Math.round(diffMinutes / 60));
        updatedCell.duration_hours = diffH;
        updatedCell.is_lab = diffMinutes >= 90;
      }
      return {
        ...prev,
        [dayKey]: {
          ...prev[dayKey],
          [periodId]: updatedCell
        }
      };
    });
  };

  const handleQuickToggleLab = (dayKey, periodId) => {
    const periodObj = timetableClassPeriods.find((p) => p.id === periodId);
    const prevCell = gridData[dayKey]?.[periodId];
    const currentCell = typeof prevCell === 'object' && prevCell !== null ? prevCell : (prevCell ? { faculty_id: prevCell } : {});
    const startTime = currentCell.start_time || periodObj?.start || '09:30';
    const isCurrentlyLab = currentCell.duration_hours >= 2 || currentCell.is_lab;

    let newEndTime = periodObj?.end || '10:30';
    let newDuration = 1;
    let newIsLab = false;

    if (!isCurrentlyLab) {
      if (periodObj?.labEnd) {
        newEndTime = periodObj.labEnd;
      } else {
        const [sh, sm] = startTime.split(':').map(Number);
        const endH = String(sh + 2).padStart(2, '0');
        newEndTime = `${endH}:${String(sm).padStart(2, '0')}`;
      }
      newDuration = 2;
      newIsLab = true;
    } else {
      newEndTime = periodObj?.end || '10:30';
      newDuration = 1;
      newIsLab = false;
    }

    setGridData((prev) => ({
      ...prev,
      [dayKey]: {
        ...prev[dayKey],
        [periodId]: {
          ...currentCell,
          start_time: startTime,
          end_time: newEndTime,
          duration_hours: newDuration,
          is_lab: newIsLab
        }
      }
    }));
  };

  const handleGridCellClear = (dayKey, periodId) => {
    setGridData((prev) => {
      const copy = { ...prev[dayKey] };
      delete copy[periodId];
      return {
        ...prev,
        [dayKey]: copy
      };
    });
  };

  const handleApplyDurationPreset = (mode, hours) => {
    const isAdd = mode === 'add';
    const startTime = isAdd ? formStartTime : editStartTime;
    if (!startTime) return;

    const [h, m] = startTime.split(':').map(Number);
    const newEndH = String(h + hours).padStart(2, '0');
    const newEndTime = `${newEndH}:${String(m).padStart(2, '0')}`;

    if (isAdd) {
      setFormEndTime(newEndTime);
      if (hours >= 2 && (!formRoom || formRoom.startsWith('AI'))) {
        setFormRoom(locInfo.lab || 'SA-205');
      }
    } else {
      setEditEndTime(newEndTime);
      if (hours >= 2 && (!editRoom || editRoom.startsWith('AI'))) {
        setEditRoom(locInfo.lab || 'SA-205');
      }
    }
  };

  const handleClearGrid = () => {
    setGridData({ MON: {}, TUE: {}, WED: {}, THU: {}, FRI: {}, SAT: {} });
  };

  const handleDownloadCsvTemplate = () => {
    const sem = semesters.find((s) => s.id === (completeSemId || activeSemId));
    let csv = "Day,StartTime,EndTime,FacultyName,Room\n";
    const daysArr = ['MON', 'TUE', 'WED', 'THU', 'FRI'];
    const defaultRoom = sem?.sem_number === 4 ? 'AI302' : sem?.sem_number === 3 ? 'AI303' : 'AI301';

    daysArr.forEach((day, dIdx) => {
      timetableClassPeriods.slice(0, 3).forEach((p, pIdx) => {
        const fac = facultyList[(dIdx + pIdx) % facultyList.length]?.name || 'Dr. Swathi H Y';
        csv += `${day},${p.start},${p.end},"${fac}",${defaultRoom}\n`;
      });
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Faculty_Timetable_${sem?.name?.replace(/\s+/g, '_') || 'Semester'}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleParseCsvText = (rawText) => {
    setCsvText(rawText);
    const lines = rawText.trim().split('\n');
    const parsed = [];
    const targetSemObj = semesters.find((s) => s.id === (completeSemId || activeSemId));
    const defaultRoom = targetSemObj?.sem_number === 4 ? 'AI302' : targetSemObj?.sem_number === 3 ? 'AI303' : 'AI301';

    lines.forEach((line, idx) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      if (idx === 0 && (trimmed.toLowerCase().startsWith('day') || trimmed.toLowerCase().includes('faculty') || trimmed.toLowerCase().includes('subject'))) {
        return;
      }
      const parts = trimmed.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map((p) => p.replace(/^"|"$/g, '').trim());
      if (parts.length >= 4) {
        let day = (parts[0] || 'MON').toUpperCase();
        let start = parts[1];
        let end = parts[2];
        let facName = parts[3];
        let room = parts[4] || defaultRoom;

        parsed.push({
          id: Math.random().toString(36).substring(2, 9),
          day_of_week: day,
          start_time: start,
          end_time: end,
          faculty_name: facName,
          room_number: room
        });
      }
    });
    setCsvParsedPreview(parsed);
  };

  const handleCsvFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result;
      if (typeof content === 'string') {
        handleParseCsvText(content);
      }
    };
    reader.readAsText(file);
  };

  const handleImageFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadedImageFile(file);
    const preview = URL.createObjectURL(file);
    setImagePreviewUrl(preview);
    await triggerImageOcr(file);
  };

  const triggerImageOcr = async (fileToScan) => {
    const file = fileToScan || uploadedImageFile;
    if (!file) return;
    setIsParsingImage(true);
    try {
      const formData = new FormData();
      formData.append('image', file);
      if (completeSemId) {
        formData.append('semester_id', completeSemId);
      }

      const res = await academicApi.parseTimetableImage(formData);
      const data = res.data;
      setImageParseResult(data);

      if (data.detected_semester_id) {
        setCompleteSemId(data.detected_semester_id);
        loadSubjects(data.detected_semester_id);
      }

      if (data.grid) {
        setGridData(data.grid);
      }

      showToast(`Timetable circular scanned! Aligned ${data.total_extracted || 0} slots for ${data.detected_semester_name || 'Semester'}.`);
    } catch (err) {
      console.error('Error parsing timetable image:', err);
      alert(err.response?.data?.error || 'Failed to parse timetable image. Please ensure the image is a valid timetable circular.');
    } finally {
      setIsParsingImage(false);
    }
  };

  const handleSaveCompleteTimetable = async () => {
    setIsSubmittingBulk(true);
    try {
      const targetSem = completeSemId || activeSemId;
      const targetSemObj = semesters.find((s) => s.id === targetSem);
      const defaultRoom = targetSemObj?.sem_number === 4 ? 'AI302' : targetSemObj?.sem_number === 3 ? 'AI303' : 'AI301';

      let entriesToSend = [];

      if (completeTab === 'grid' || completeTab === 'image') {
        days.forEach((d) => {
          timetableClassPeriods.forEach((p) => {
            // Check if this period is covered by a preceding 2-hour lab
            if (getCoveringPeriod(d.key, p.id)) {
              return; // Skip continuation cell to prevent duplicate DB rows
            }
            const cell = gridData[d.key]?.[p.id];
            const facId = typeof cell === 'object' ? cell?.faculty_id : cell;
            if (facId) {
              const st = (typeof cell === 'object' && cell?.start_time) || p.start;
              const et = (typeof cell === 'object' && cell?.end_time) || p.end;
              const subjId = typeof cell === 'object' && cell?.subject_id ? parseInt(cell.subject_id) : null;
              const subjCode = typeof cell === 'object' ? cell?.subject_code : null;
              const subjName = typeof cell === 'object' ? cell?.subject_name : null;
              const isLab = typeof cell === 'object' && (cell?.duration_hours >= 2 || cell?.is_lab);
              entriesToSend.push({
                day_of_week: d.key,
                start_time: st,
                end_time: et,
                faculty_id: parseInt(facId),
                subject_id: subjId,
                subject_code: subjCode,
                subject_name: subjName,
                room_number: isLab ? (locInfo.lab || 'SA-205') : defaultRoom
              });
            }
          });
        });
      } else {

        if (csvParsedPreview.length === 0 && csvText.trim()) {
          handleParseCsvText(csvText);
        }
        entriesToSend = csvParsedPreview.map((r) => ({
          day_of_week: r.day_of_week,
          start_time: r.start_time,
          end_time: r.end_time,
          faculty_name: r.faculty_name,
          room_number: r.room_number || defaultRoom
        }));
      }

      if (entriesToSend.length === 0) {
        alert('Please assign at least one faculty class period to the weekly timetable.');
        setIsSubmittingBulk(false);
        return;
      }

      const res = await academicApi.bulkCreateTimetableEntries({
        semester_id: parseInt(targetSem),
        replace_existing: completeReplaceExisting,
        entries: entriesToSend
      });

      setIsCompleteModalOpen(false);
      showToast(res.data?.message || 'Complete timetable configured successfully.');
      loadTimetables(activeSemId);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to save complete timetable');
    } finally {
      setIsSubmittingBulk(false);
    }
  };

  const handleCreateNewSubject = async (e) => {
    e.preventDefault();
    if (!newSubCode.trim() || !newSubName.trim()) {
      alert('Subject code and name are required.');
      return;
    }
    setIsSubmittingSubject(true);
    try {
      const targetSem = newSubSemId || completeSemId || activeSemId;
      const res = await academicApi.createSubject({
        code: newSubCode.trim().toUpperCase(),
        name: newSubName.trim(),
        semester_id: parseInt(targetSem),
        department: 'Computer Science & Engineering (AI & ML)'
      });
      showToast(`Subject ${res.data.code} added successfully.`);
      await loadSubjects(targetSem);
      setFormSubjectId(res.data.id);
      setEditSubjectId(res.data.id);

      // If created from an active grid cell, automatically assign this new subject to that cell!
      if (activeSubjectCellTarget) {
        const { dayKey, periodId } = activeSubjectCellTarget;
        const periodObj = timetableClassPeriods.find((p) => p.id === periodId);
        setGridData((prev) => {
          const prevCell = prev[dayKey]?.[periodId];
          const cell = typeof prevCell === 'object' && prevCell !== null ? prevCell : (prevCell ? { faculty_id: prevCell } : {});
          return {
            ...prev,
            [dayKey]: {
              ...prev[dayKey],
              [periodId]: {
                ...cell,
                subject_id: res.data.id,
                start_time: cell.start_time || periodObj?.start || '09:30',
                end_time: cell.end_time || periodObj?.end || '10:30',
                duration_hours: cell.duration_hours || 1,
                is_lab: !!cell.is_lab
              }
            }
          };
        });
        setActiveSubjectCellTarget(null);
      }

      setIsNewSubjectModalOpen(false);
      setNewSubCode('');
      setNewSubName('');
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to create subject');
    } finally {
      setIsSubmittingSubject(false);
    }
  };


  // Render a cell in the 5th Sem Timetable-style interactive weekly grid (Faculty & Time/Lab editing & Subject selection/add)
  const renderGridFacultyCell = (dayKey, periodId) => {
    // 1. Check if this period is covered by a preceding 2-hour lab
    const coveringPeriodId = getCoveringPeriod(dayKey, periodId);
    if (coveringPeriodId) {
      const coveringCell = gridData[dayKey]?.[coveringPeriodId];
      const coveringFacultyId = typeof coveringCell === 'object' ? coveringCell?.faculty_id : coveringCell;
      const coveringFaculty = coveringFacultyId ? facultyList.find((f) => f.id === coveringFacultyId) : null;
      const coveringPeriodObj = timetableClassPeriods.find((p) => p.id === coveringPeriodId);

      return (
        <td key={periodId} className="p-1.5 border-r border-slate-300 align-top bg-purple-50/40">
          <div className="bg-purple-100/70 border border-purple-200 rounded-lg p-2 text-center flex flex-col items-center justify-center gap-1 min-h-[96px]">
            <div className="flex items-center gap-1 text-[10px] font-bold text-purple-900 uppercase">
              <Sparkles className="w-3 h-3 text-purple-600 shrink-0" />
              <span>2-Hr Lab Cont.</span>
            </div>
            <span className="text-[10px] text-purple-900 font-bold truncate max-w-[130px]" title={coveringFaculty?.name}>
              {coveringFaculty?.name || 'Lab Session'}
            </span>
            <span className="text-[9px] font-mono font-semibold text-purple-700 bg-purple-200/60 px-1.5 py-0.5 rounded">
              Part of {coveringPeriodObj?.label || 'Period'} Lab
            </span>
            <button
              type="button"
              onClick={() => handleQuickToggleLab(dayKey, coveringPeriodId)}
              className="text-[9px] text-purple-700 hover:text-purple-950 font-bold underline transition-colors mt-0.5"
              title="Separate into independent 1-hour slots"
            >
              Separate into 1h
            </button>
          </div>
        </td>
      );
    }

    const rawCell = gridData[dayKey]?.[periodId];
    const periodObj = timetableClassPeriods.find((p) => p.id === periodId);
    const facultyId = typeof rawCell === 'object' && rawCell !== null ? rawCell.faculty_id : rawCell;
    const subjectId = typeof rawCell === 'object' && rawCell !== null ? rawCell.subject_id : '';
    const startTime = (typeof rawCell === 'object' && rawCell?.start_time) || periodObj?.start || '09:30';
    const endTime = (typeof rawCell === 'object' && rawCell?.end_time) || periodObj?.end || '10:30';
    const durationHours = (typeof rawCell === 'object' && rawCell?.duration_hours) || (isTwoHourSlot(startTime, endTime) ? 2 : 1);
    const isLab = durationHours >= 2 || (typeof rawCell === 'object' && rawCell?.is_lab);

    return (
      <td key={periodId} className={`p-1.5 border-r border-slate-300 align-top ${
        facultyId
          ? isLab ? 'bg-purple-50/40' : 'bg-indigo-50/30'
          : 'bg-white'
      }`}>
        <div className={`border rounded-lg p-2 transition-all flex flex-col gap-1.5 ${
          facultyId
            ? isLab
              ? 'bg-white border-purple-300 ring-1 ring-purple-200 shadow-2xs'
              : 'bg-white border-indigo-200 hover:border-indigo-400 shadow-2xs'
            : 'bg-slate-50/70 hover:bg-slate-100/70 border-dashed border-slate-200 hover:border-slate-300'
        }`}>
          {/* 1. Time Edit Bar (Start & End Time directly editable with quick 2-hour Lab toggle) */}
          <div className="flex items-center justify-between gap-1 pb-1 border-b border-slate-200/80">
            <div className="flex items-center gap-1">
              <Clock className="w-3 h-3 text-slate-400 shrink-0" />
              <input
                type="time"
                value={startTime}
                onChange={(e) => handleGridTimeChange(dayKey, periodId, 'start_time', e.target.value)}
                className="w-[66px] bg-slate-50 hover:bg-white border border-slate-300 rounded px-1 py-0.5 text-[10px] font-mono font-bold text-slate-800 focus:bg-white focus:outline-none focus:border-blue-500"
                title="Start Time"
              />
              <span className="text-slate-400 font-bold text-[10px]">-</span>
              <input
                type="time"
                value={endTime}
                onChange={(e) => handleGridTimeChange(dayKey, periodId, 'end_time', e.target.value)}
                className="w-[66px] bg-slate-50 hover:bg-white border border-slate-300 rounded px-1 py-0.5 text-[10px] font-mono font-bold text-slate-800 focus:bg-white focus:outline-none focus:border-blue-500"
                title="End Time (e.g. 16:00 for 2-hour lab)"
              />
            </div>
            <button
              type="button"
              onClick={() => handleQuickToggleLab(dayKey, periodId)}
              className={`text-[9px] font-bold px-1.5 py-0.5 rounded border transition-colors shrink-0 ${
                isLab
                  ? 'bg-purple-600 text-white border-purple-600 hover:bg-purple-700'
                  : 'bg-white text-purple-700 border-purple-200 hover:bg-purple-100'
              }`}
              title={isLab ? 'Revert to 1 hour lecture' : 'Quick set 2-hour lab'}
            >
              {isLab ? '2h Lab' : '+2h'}
            </button>
          </div>

          {/* 2. Faculty Dropdown Selector & Clear Button */}
          <div className="flex items-center gap-1">
            <select
              value={facultyId || ''}
              onChange={(e) => handleGridCellFacultyChange(dayKey, periodId, e.target.value)}
              className={`w-full border rounded px-1.5 py-1 text-[11px] font-medium focus:outline-none focus:border-indigo-500 cursor-pointer ${
                facultyId
                  ? 'bg-indigo-50/50 border-indigo-200 text-indigo-950 font-semibold'
                  : 'bg-white border-slate-200 text-slate-500 hover:text-slate-800'
              }`}
            >
              <option value="">-- Select Faculty * --</option>
              {facultyList.map((f) => (
                <option key={f.id} value={f.id} className="text-slate-800 font-medium">
                  {f.name}
                </option>
              ))}
            </select>
            {facultyId && (
              <button
                type="button"
                onClick={() => handleGridCellClear(dayKey, periodId)}
                className="text-slate-400 hover:text-rose-600 p-0.5 rounded transition-colors shrink-0"
                title="Clear slot"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* 3. Subject Selector & "+ Add" Subject Button */}
          <div className="flex items-center gap-1">
            <select
              value={subjectId || ''}
              onChange={(e) => handleGridCellSubjectChange(dayKey, periodId, e.target.value)}
              className="flex-1 min-w-0 bg-white border border-slate-200 rounded px-1.5 py-1 text-[10px] text-slate-700 font-medium focus:outline-none focus:border-blue-500 cursor-pointer truncate"
              title="Select Subject Course (Optional)"
            >
              <option value="">-- Subject (Optional) --</option>
              {subjectsList.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.code} - {s.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => {
                setActiveSubjectCellTarget({ dayKey, periodId });
                setNewSubSemId(completeSemId || activeSemId);
                setIsNewSubjectModalOpen(true);
              }}
              className="flex items-center gap-0.5 px-1.5 py-1 text-blue-600 hover:text-white hover:bg-blue-600 border border-blue-200 hover:border-blue-600 rounded text-[10px] font-bold transition-all shrink-0 shadow-2xs"
              title="Add New Subject Course"
            >
              <Plus className="w-3 h-3" />
              <span>Add</span>
            </button>
          </div>

          {/* 4. Lab Indicator Badge (if 2+ hours) */}
          {isLab && (
            <div className="flex items-center justify-between text-[9px] font-bold text-purple-800 bg-purple-100/80 border border-purple-200 px-1.5 py-0.5 rounded">
              <span className="flex items-center gap-1">
                <Sparkles className="w-2.5 h-2.5 text-purple-600 shrink-0" />
                <span>2-Hour Lab Session</span>
              </span>
              <span className="font-mono text-purple-900 font-extrabold">{startTime}-{endTime}</span>
            </div>
          )}
        </div>
      </td>
    );
  };

  // Check if an entry overlaps with a specific period
  const getPeriodEntry = (dayKey, period) => {
    if (period.type === 'break' || period.type === 'lunch') return null;
    return entries.find((e) => {
      if (e.day_of_week !== dayKey) return false;
      // Mathematical interval overlap: e.start < period.end && e.end > period.start
      return e.start_time < period.end && e.end_time > period.start;
    });
  };



  // Auto-merge back-to-back lecture periods (e.g. 24EVS 3:00 - 5:00 or 2-hour labs)
  const renderDayCells = (dayKey) => {
    const cells = [];
    let i = 0;

    while (i < periods.length) {
      const period = periods[i];

      // Vertical Break / Lunch Divider Column
      if (period.type === 'break' || period.type === 'lunch') {
        cells.push(
          <td
            key={period.id}
            className="p-1 border-r border-slate-200 bg-amber-50/20 text-center align-middle"
          >
            <div className="writing-vertical-lr text-[10px] font-bold text-amber-700/60 uppercase tracking-widest mx-auto select-none">
              {period.type === 'break' ? 'BREAK' : 'LUNCH'}
            </div>
          </td>
        );
        i++;
        continue;
      }

      const match = getPeriodEntry(dayKey, period);

      // If Free Period
      if (!match) {
        cells.push(
          <td
            key={period.id}
            className="p-2 border-r border-slate-200 align-top h-28 min-w-[140px]"
          >
            <button
              type="button"
              onClick={() => handleOpenAddForSlot(dayKey, period)}
              className="w-full h-full border border-dashed border-slate-200 hover:border-blue-400 hover:bg-blue-50/40 rounded-lg flex flex-col items-center justify-center text-slate-300 hover:text-blue-600 transition-all select-none group/slot cursor-pointer p-2 text-center"
              title={`Click to add lecture slot on ${dayKey} (${period.label})`}
            >
              <span className="text-[10px] font-medium group-hover/slot:hidden">Free Period</span>
              <span className="hidden group-hover/slot:flex items-center gap-1 text-[11px] font-bold text-blue-600">
                <Plus className="w-3.5 h-3.5" />
                Add Slot
              </span>
            </button>
          </td>
        );
        i++;
        continue;
      }

      // Found a matching lecture/lab! Check if it continues back-to-back in subsequent periods
      let span = 1;
      let nextIdx = i + 1;
      while (nextIdx < periods.length) {
        const nextPeriod = periods[nextIdx];
        if (nextPeriod.type === 'break' || nextPeriod.type === 'lunch') {
          break; // Do not cross break or lunch
        }
        const nextMatch = getPeriodEntry(dayKey, nextPeriod);
        // If next period is the same entry ID or same subject and faculty back-to-back
        if (
          nextMatch &&
          (nextMatch.id === match.id ||
            (nextMatch.subject_id === match.subject_id &&
              nextMatch.faculty_id === match.faculty_id))
        ) {
          span++;
          nextIdx++;
        } else {
          break;
        }
      }

      // Formatted single merged cell
      cells.push(
        <td
          key={`${dayKey}-${period.id}`}
          colSpan={span}
          className="p-2 border-r border-slate-200 align-top h-28"
          style={{ minWidth: `${span * 145}px` }}
        >
          <div
            className={`h-full p-2.5 rounded-lg border transition-all flex flex-col justify-between group hover:shadow-xs ${
              span > 1
                ? 'bg-blue-50/50 border-blue-200 hover:border-blue-400 shadow-2xs'
                : 'bg-slate-50 border-slate-200 hover:border-blue-300'
            }`}
          >
            <div>
              <div className="flex items-start justify-between gap-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="font-bold text-slate-900 text-xs font-mono">
                    {match.subject_code}
                  </span>
                  {span > 1 && (
                    <span className="text-[9px] font-bold bg-blue-600 text-white px-1.5 py-0.5 rounded shadow-2xs tracking-wide">
                      {match.start_time} - {match.end_time} ({span} hrs)
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity bg-white/80 rounded border border-slate-200/60 p-0.5 shadow-2xs">
                  <button
                    type="button"
                    onClick={() => handleOpenEditModal(match)}
                    className="text-slate-400 hover:text-blue-600 hover:bg-blue-50 p-1 rounded transition-colors"
                    title="Edit lecture slot"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteEntry(match.id)}
                    className="text-slate-400 hover:text-rose-600 hover:bg-rose-50 p-1 rounded transition-colors"
                    title="Delete lecture slot"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <div
                className="text-[11px] text-slate-700 font-medium line-clamp-1 mt-0.5"
                title={match.subject_name}
              >
                {match.subject_name}
              </div>
            </div>

            <div className="pt-2 border-t border-slate-200/80 space-y-1">
              <div className="flex items-center gap-1.5 text-[11px] text-blue-700 font-semibold truncate">
                <User className="w-3 h-3 text-blue-600 shrink-0" />
                <span className="truncate">{match.faculty_name}</span>
              </div>
              <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono">
                <span>{match.room_number || locInfo.classroom}</span>
                <span className="text-[9px] bg-blue-50 text-blue-700 border border-blue-200/60 px-1 py-0.2 rounded font-semibold">
                  1h Buffer
                </span>
              </div>
            </div>
          </div>
        </td>
      );

      // Advance loop index by the number of spanned periods
      i += span;
    }

    return cells;
  };

  return (
    <div className="space-y-6 font-sans">
      {/* ========================================================================= */}
      {/* 1. INSTITUTIONAL TIMETABLE HEADER                                         */}
      {/* ========================================================================= */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
            <span>Malnad College of Engineering, Hassan</span>
            <span>•</span>
            <span>Dept of CSE (AI & ML)</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
            Department Semester Timetable
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Official class schedule used for CIE duty clash prevention and 1-hour buffer protection.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap self-start md:self-auto">
          <button
            type="button"
            onClick={() => setIsManageModalOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-semibold shadow-xs transition-all"
          >
            <Trash2 className="w-3.5 h-3.5 text-rose-500" />
            <span>Manage / Delete Slots</span>
          </button>
          <button
            type="button"
            onClick={handleOpenCompleteModal}
            className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold shadow-sm transition-all"
            title="Configure or bulk import complete weekly timetable for this semester"
          >
            <CalendarPlus className="w-4 h-4" />
            <span>📅 Add Complete Timetable</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setFormSemesterId(activeSemId);
              setFormDay('MON');
              setFormStartTime('09:30');
              setFormEndTime('10:30');
              setFormRoom(locInfo.classroom.split(',')[0].replace('*', '').trim() || 'AI302');
              loadSubjects(activeSemId);
              setIsAddModalOpen(true);
            }}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-sm transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>+ Add Slot</span>
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. ACADEMIC CYCLE TOGGLE & SEMESTER TABS                                    */}
      {/* ========================================================================= */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-3">
        {/* Top Bar: Odd (3, 5, 7) vs Even (4, 6) Cycle Selector + Faculty Filter */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400 mr-1">Cycle:</span>
            <div className="inline-flex p-1 bg-slate-100 rounded-lg border border-slate-200/80">
              <button
                type="button"
                onClick={() => handleSelectCycle('odd')}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-xs font-bold transition-all ${
                  selectedCycle === 'odd'
                    ? 'bg-white text-blue-700 shadow-xs border border-slate-200/60'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span>🍂 Odd Semesters</span>
                <span
                  className={`px-1.5 py-0.2 text-[10px] rounded-full font-mono font-bold ${
                    selectedCycle === 'odd' ? 'bg-blue-100 text-blue-800' : 'bg-slate-200 text-slate-600'
                  }`}
                >
                  3, 5, 7
                </span>
              </button>

              <button
                type="button"
                onClick={() => handleSelectCycle('even')}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-xs font-bold transition-all ${
                  selectedCycle === 'even'
                    ? 'bg-white text-emerald-700 shadow-xs border border-slate-200/60'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span>🌸 Even Semesters</span>
                <span
                  className={`px-1.5 py-0.2 text-[10px] rounded-full font-mono font-bold ${
                    selectedCycle === 'even' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'
                  }`}
                >
                  4, 6
                </span>
              </button>
            </div>
          </div>

          {/* Filter by Faculty */}
          <div className="flex items-center gap-2">
            <Filter className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <select
              value={selectedFacultyFilter}
              onChange={(e) => setSelectedFacultyFilter(e.target.value)}
              className="bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 text-slate-800 text-xs focus:outline-none focus:border-blue-500 font-medium"
            >
              <option value="">All Faculty Members</option>
              {facultyList.map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Bottom Bar: Semester Tabs for Active Cycle + Room & Cycle Badges */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pt-1">
          {/* Semester Tabs */}
          <div className="flex items-center gap-2 flex-wrap">
            {visibleSemesters.map((sem) => {
              const isActive = activeSemId === sem.id;
              return (
                <button
                  key={sem.id}
                  type="button"
                  onClick={() => setActiveSemId(sem.id)}
                  className={`px-4 py-2 rounded-lg font-bold text-xs transition-all flex items-center gap-2 ${
                    isActive
                      ? selectedCycle === 'odd'
                        ? 'bg-[#10213e] text-white shadow-sm ring-2 ring-blue-500/20'
                        : 'bg-[#0f3d32] text-white shadow-sm ring-2 ring-emerald-500/20'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold'
                  }`}
                >
                  <span>{sem.name}</span>
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold ${
                      isActive ? 'bg-white/20 text-white' : 'bg-slate-200/80 text-slate-600'
                    }`}
                  >
                    Sem {sem.sem_number}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Room & Cycle Info Badge */}
          <div className="flex items-center gap-2.5 flex-wrap text-xs">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-700 font-medium">
              <Building2 className="w-3.5 h-3.5 text-blue-600 shrink-0" />
              <span>Room: <strong>{locInfo.classroom}</strong></span>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-700 font-medium">
              <MapPin className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
              <span>Lab: <strong>{locInfo.lab}</strong></span>
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 3. MASTER TIMETABLE GRID                                                   */}
      {/* ========================================================================= */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 text-[11px] font-bold uppercase tracking-wider">
                <th className="py-3 px-4 w-28 border-r border-slate-200 bg-slate-100/70 text-slate-800">
                  Day / Period
                </th>
                {periods.map((p) => {
                  if (p.type === 'break' || p.type === 'lunch') {
                    return (
                      <th
                        key={p.id}
                        className="py-3 px-2 w-14 text-center border-r border-slate-200 bg-amber-50/50 text-amber-800 text-[10px]"
                      >
                        <div className="font-mono font-bold leading-tight">{p.title}</div>
                        <div className="text-[9px] text-amber-600 font-normal mt-0.5">{p.label}</div>
                      </th>
                    );
                  }
                  return (
                    <th
                      key={p.id}
                      className="py-3 px-3 text-center border-r border-slate-200 bg-slate-50 min-w-[145px]"
                    >
                      <div className="font-bold text-slate-900">{p.label}</div>
                      <div className="text-[10px] text-slate-400 font-normal mt-0.5">
                        {p.id.toUpperCase()}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {days.map((day) => (
                <tr key={day.key} className="hover:bg-slate-50/40 transition-colors">
                  {/* Day Column */}
                  <td className="py-3.5 px-4 font-bold text-slate-900 bg-slate-50/80 uppercase tracking-wider text-xs border-r border-slate-200">
                    <div>{day.name}</div>
                    <div className="text-[10px] font-mono text-slate-400 font-normal">{day.key}</div>
                  </td>

                  {/* Render Period Cells with Auto-Merging for Back-to-Back Slots */}
                  {renderDayCells(day.key)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Footer Summary */}
        <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-700">{activeSemester?.name || 'Semester Timetable'}</span>
            <span>•</span>
            <span><strong>{entries.length}</strong> active scheduled slots</span>
          </div>
          <div className="flex items-center gap-2 text-emerald-700 font-medium">
            <ShieldCheck className="w-4 h-4" />
            <span>Automatic 1-hour CIE clash avoidance enabled</span>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 4. CURRICULUM SUBJECT & FACULTY LEGEND (MATCHING OFFICIAL CIRCULAR)        */}
      {/* ========================================================================= */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        <div className="flex items-center gap-2 pb-3 mb-3 border-b border-slate-100">
          <BookOpen className="w-4 h-4 text-blue-600" />
          <h2 className="font-bold text-sm text-slate-900">
            Subject Name, Code & Faculty Allocation Legend ({activeSemester?.name})
          </h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-[10px] font-bold uppercase">
                <th className="py-2.5 px-3 w-28">Subject Code</th>
                <th className="py-2.5 px-4">Subject Name / Administrative Work</th>
                <th className="py-2.5 px-3 text-center">L-T-P</th>
                <th className="py-2.5 px-3 text-center">Credits</th>
                <th className="py-2.5 px-4">Name of the Faculty Member</th>
                <th className="py-2.5 px-3 text-right">Classroom / Lab</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {displayedSubjects.map((sub) => {
                const isSem3 = activeSemester?.sem_number === 3;
                const sem3Meta = isSem3 ? SEM3_OFFICIAL_LEGEND[sub.code] : null;
                const sampleEntry = entries.find((e) => e.subject_code === sub.code);
                const facName = sem3Meta?.faculty || sampleEntry?.faculty_name || 'Department Faculty';
                const ltp = sem3Meta?.ltp || (sub.code.includes('L') ? '0-0-2' : '3-0-0');
                const credits = sem3Meta?.credits || (sub.code.includes('L') ? '1' : '3');
                const room = sem3Meta?.room || sampleEntry?.room_number || (sub.code.includes('L') || sub.name?.toLowerCase().includes('lab') ? locInfo.lab : locInfo.classroom);

                return (
                  <tr key={sub.id} className="hover:bg-slate-50/60">
                    <td className="py-2.5 px-3 font-mono font-bold text-slate-900">
                      {sub.code}
                    </td>
                    <td className="py-2.5 px-4 font-medium text-slate-800">
                      {sub.name}
                    </td>
                    <td className="py-2.5 px-3 text-center font-mono text-slate-600">
                      {ltp}
                    </td>
                    <td className="py-2.5 px-3 text-center font-semibold text-slate-700">
                      {credits}
                    </td>
                    <td className="py-2.5 px-4 font-semibold text-blue-700">
                      {facName}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-slate-500">
                      {room}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 5. ADD LECTURE SLOT MODAL                                                 */}
      {/* ========================================================================= */}
      <Modal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} title="Add Timetable Lecture Slot">
        <form onSubmit={handleAddEntry} className="space-y-4 text-xs">
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Target Semester</label>
            <select
              value={formSemesterId}
              onChange={(e) => {
                setFormSemesterId(e.target.value);
                loadSubjects(e.target.value);
              }}
              className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:border-blue-500 font-medium"
            >
              {semesters.map((s) => (
                <option key={s.id} value={s.id}>{s.name} (Sem {s.sem_number})</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Assigned Faculty Member *</label>
            <select
              required
              value={formFacultyId}
              onChange={(e) => setFormFacultyId(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:border-blue-500 font-medium"
            >
              <option value="">-- Select Faculty --</option>
              {facultyList.map((f) => (
                <option key={f.id} value={f.id}>{f.name} ({f.designation})</option>
              ))}
            </select>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="font-semibold text-slate-700">Course Subject (Optional - changes yearly)</label>
              <button
                type="button"
                onClick={() => {
                  setNewSubSemId(formSemesterId || activeSemId);
                  setIsNewSubjectModalOpen(true);
                }}
                className="text-[11px] text-blue-600 hover:text-blue-800 font-semibold flex items-center gap-1"
              >
                <Plus className="w-3 h-3" />
                <span>+ New Subject</span>
              </button>
            </div>
            <select
              value={formSubjectId}
              onChange={(e) => setFormSubjectId(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:border-blue-500 font-medium"
            >
              <option value="">-- Optional / Default Class Lecture --</option>
              {subjectsList.map((s) => (
                <option key={s.id} value={s.id}>{s.code} - {s.name}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Day of Week *</label>
              <select
                value={formDay}
                onChange={(e) => setFormDay(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:border-blue-500 font-medium"
              >
                {days.map((d) => (
                  <option key={d.key} value={d.key}>{d.name} ({d.key})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Room / Hall *</label>
              <input
                type="text"
                required
                value={formRoom}
                onChange={(e) => setFormRoom(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:border-blue-500 font-mono text-xs"
              />
            </div>
          </div>

          {/* Quick Duration Preset Selector */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="font-semibold text-slate-700">Slot Duration</label>
              <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                {getSlotDurationHours(formStartTime, formEndTime)} Hour{getSlotDurationHours(formStartTime, formEndTime) > 1 ? 's' : ''} {getSlotDurationHours(formStartTime, formEndTime) >= 2 ? '(Lab)' : '(Lecture)'}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => handleApplyDurationPreset('add', 1)}
                className={`py-1.5 px-2 rounded-lg font-bold text-xs border transition-all ${
                  getSlotDurationHours(formStartTime, formEndTime) === 1
                    ? 'bg-blue-600 text-white border-blue-600 shadow-2xs'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                1 Hour (Lecture)
              </button>
              <button
                type="button"
                onClick={() => handleApplyDurationPreset('add', 2)}
                className={`py-1.5 px-2 rounded-lg font-bold text-xs border transition-all ${
                  getSlotDurationHours(formStartTime, formEndTime) === 2
                    ? 'bg-purple-600 text-white border-purple-600 shadow-2xs'
                    : 'bg-purple-50 text-purple-800 border-purple-200 hover:bg-purple-100'
                }`}
              >
                🔬 2 Hours (Lab)
              </button>
              <button
                type="button"
                onClick={() => handleApplyDurationPreset('add', 3)}
                className={`py-1.5 px-2 rounded-lg font-bold text-xs border transition-all ${
                  getSlotDurationHours(formStartTime, formEndTime) === 3
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                3 Hours (Project)
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Start Time (HH:MM)</label>
              <input
                type="time"
                required
                value={formStartTime}
                onChange={(e) => setFormStartTime(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:border-blue-500 font-mono text-xs"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">End Time (HH:MM)</label>
              <input
                type="time"
                required
                value={formEndTime}
                onChange={(e) => setFormEndTime(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:border-blue-500 font-mono text-xs"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setIsAddModalOpen(false)}
              className="px-4 py-2 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmittingAdd}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold shadow-sm disabled:opacity-50"
            >
              {isSubmittingAdd ? 'Saving...' : 'Save Slot'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ========================================================================= */}
      {/* 6. EDIT LECTURE SLOT MODAL                                                */}
      {/* ========================================================================= */}
      <Modal isOpen={isEditModalOpen} onClose={() => setIsEditModalOpen(false)} title="Edit Timetable Lecture Slot">
        <form onSubmit={handleSaveEditEntry} className="space-y-4 text-xs">
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Target Semester</label>
            <select
              value={editSemesterId}
              onChange={(e) => {
                setEditSemesterId(e.target.value);
                loadSubjects(e.target.value);
              }}
              className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:border-blue-500 font-medium"
            >
              {semesters.map((s) => (
                <option key={s.id} value={s.id}>{s.name} (Sem {s.sem_number})</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Assigned Faculty Member *</label>
            <select
              required
              value={editFacultyId}
              onChange={(e) => setEditFacultyId(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:border-blue-500 font-medium"
            >
              <option value="">-- Select Faculty --</option>
              {facultyList.map((f) => (
                <option key={f.id} value={f.id}>{f.name} ({f.designation})</option>
              ))}
            </select>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="font-semibold text-slate-700">Course Subject (Optional - changes yearly)</label>
              <button
                type="button"
                onClick={() => {
                  setNewSubSemId(editSemesterId || activeSemId);
                  setIsNewSubjectModalOpen(true);
                }}
                className="text-[11px] text-blue-600 hover:text-blue-800 font-semibold flex items-center gap-1"
              >
                <Plus className="w-3 h-3" />
                <span>+ New Subject</span>
              </button>
            </div>
            <select
              value={editSubjectId}
              onChange={(e) => setEditSubjectId(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:border-blue-500 font-medium"
            >
              <option value="">-- Optional / Default Class Lecture --</option>
              {subjectsList.map((s) => (
                <option key={s.id} value={s.id}>{s.code} - {s.name}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Day of Week *</label>
              <select
                value={editDay}
                onChange={(e) => setEditDay(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:border-blue-500 font-medium"
              >
                {days.map((d) => (
                  <option key={d.key} value={d.key}>{d.name} ({d.key})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Room / Hall *</label>
              <input
                type="text"
                required
                value={editRoom}
                onChange={(e) => setEditRoom(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:border-blue-500 font-mono text-xs"
              />
            </div>
          </div>

          {/* Quick Duration Preset Selector */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="font-semibold text-slate-700">Slot Duration</label>
              <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                {getSlotDurationHours(editStartTime, editEndTime)} Hour{getSlotDurationHours(editStartTime, editEndTime) > 1 ? 's' : ''} {getSlotDurationHours(editStartTime, editEndTime) >= 2 ? '(Lab)' : '(Lecture)'}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => handleApplyDurationPreset('edit', 1)}
                className={`py-1.5 px-2 rounded-lg font-bold text-xs border transition-all ${
                  getSlotDurationHours(editStartTime, editEndTime) === 1
                    ? 'bg-blue-600 text-white border-blue-600 shadow-2xs'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                1 Hour (Lecture)
              </button>
              <button
                type="button"
                onClick={() => handleApplyDurationPreset('edit', 2)}
                className={`py-1.5 px-2 rounded-lg font-bold text-xs border transition-all ${
                  getSlotDurationHours(editStartTime, editEndTime) === 2
                    ? 'bg-purple-600 text-white border-purple-600 shadow-2xs'
                    : 'bg-purple-50 text-purple-800 border-purple-200 hover:bg-purple-100'
                }`}
              >
                🔬 2 Hours (Lab)
              </button>
              <button
                type="button"
                onClick={() => handleApplyDurationPreset('edit', 3)}
                className={`py-1.5 px-2 rounded-lg font-bold text-xs border transition-all ${
                  getSlotDurationHours(editStartTime, editEndTime) === 3
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                3 Hours (Project)
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Start Time (HH:MM)</label>
              <input
                type="time"
                required
                value={editStartTime}
                onChange={(e) => setEditStartTime(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:border-blue-500 font-mono text-xs"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">End Time (HH:MM)</label>
              <input
                type="time"
                required
                value={editEndTime}
                onChange={(e) => setEditEndTime(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:border-blue-500 font-mono text-xs"
              />
            </div>
          </div>

          <div className="flex justify-between items-center pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => {
                setIsEditModalOpen(false);
                handleDeleteEntry(editEntryId);
              }}
              className="px-3 py-2 text-rose-600 hover:bg-rose-50 rounded-lg font-medium transition-colors flex items-center gap-1.5"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete Slot</span>
            </button>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setIsEditModalOpen(false)}
                className="px-4 py-2 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmittingEdit}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold shadow-sm disabled:opacity-50"
              >
                {isSubmittingEdit ? 'Saving...' : 'Update Slot'}
              </button>
            </div>
          </div>
        </form>
      </Modal>

      {/* ========================================================================= */}
      {/* 7. MANAGE / DELETE SLOTS MODAL                                            */}
      {/* ========================================================================= */}
      <Modal isOpen={isManageModalOpen} onClose={() => setIsManageModalOpen(false)} title={`Manage Timetable Slots - ${activeSemester?.name || 'Semester'}`}>
        <div className="space-y-4 text-xs">
          <div className="flex items-center justify-between p-3.5 bg-rose-50 border border-rose-200 rounded-lg text-rose-800">
            <div>
              <p className="font-bold">Clear Entire Semester Timetable</p>
              <p className="text-[11px] text-rose-600 mt-0.5">Delete all lecture and lab slots currently configured for {activeSemester?.name}.</p>
            </div>
            <button
              type="button"
              onClick={handleClearAllSemesterSlots}
              className="px-3.5 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-lg shadow-xs transition-all shrink-0 ml-2"
            >
              Clear All Slots
            </button>
          </div>

          <div className="border border-slate-200 rounded-lg overflow-hidden max-h-[360px] overflow-y-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-50 border-b border-slate-200 sticky top-0 font-bold text-slate-600 uppercase text-[10px]">
                <tr>
                  <th className="py-2.5 px-3">Day</th>
                  <th className="py-2.5 px-3">Time</th>
                  <th className="py-2.5 px-3">Subject</th>
                  <th className="py-2.5 px-3">Faculty</th>
                  <th className="py-2.5 px-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {entries.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-400">
                      No timetable slots configured for this semester. Click &ldquo;Add Lecture Slot&rdquo; to create one.
                    </td>
                  </tr>
                ) : (
                  entries.map((entry) => (
                    <tr key={entry.id} className="hover:bg-slate-50">
                      <td className="py-2 px-3 font-bold font-mono text-slate-800">{entry.day_of_week}</td>
                      <td className="py-2 px-3 font-mono text-slate-600">{entry.start_time} - {entry.end_time}</td>
                      <td className="py-2 px-3 text-slate-900 font-semibold">
                        <span className="font-mono text-blue-700 mr-1.5">{entry.subject_code}</span>
                        <span className="text-slate-600 font-normal">{entry.subject_name}</span>
                      </td>
                      <td className="py-2 px-3 text-slate-700">{entry.faculty_name}</td>
                      <td className="py-2 px-2 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              setIsManageModalOpen(false);
                              handleOpenEditModal(entry);
                            }}
                            className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                            title="Edit slot"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteEntry(entry.id)}
                            className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors"
                            title="Delete slot"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="flex justify-between items-center pt-2">
            <span className="text-slate-500 font-medium">
              Total {entries.length} active slots
            </span>
            <button
              type="button"
              onClick={() => setIsManageModalOpen(false)}
              className="px-4 py-2 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 font-medium"
            >
              Close
            </button>
          </div>
        </div>
      </Modal>

      {/* ========================================================================= */}
      {/* 8. COMPLETE TIMETABLE SETUP & BULK ENTRY MODAL                             */}
      {/* ========================================================================= */}
      <Modal
        isOpen={isCompleteModalOpen}
        onClose={() => setIsCompleteModalOpen(false)}
        title="Complete Timetable Setup & Weekly Grid Entry"
        maxWidth="max-w-7xl"
      >
        <div className="space-y-4 text-xs">
          {/* Target Semester & Replacement Strategy Toolbar */}
          <div className="bg-slate-50 border border-slate-200 p-3.5 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex items-center gap-3 flex-wrap">
              <div>
                <label className="block text-[10px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Target Semester
                </label>
                <select
                  value={completeSemId}
                  onChange={(e) => handleCompleteSemChange(parseInt(e.target.value))}
                  className="bg-white border border-slate-300 rounded-lg px-3 py-1.5 font-bold text-slate-800 text-xs focus:outline-none focus:border-blue-500"
                >
                  {semesters.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} (Semester {s.sem_number})
                    </option>
                  ))}
                </select>
              </div>

              <div className="pt-4 md:pt-0">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={completeReplaceExisting}
                    onChange={(e) => setCompleteReplaceExisting(e.target.checked)}
                    className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
                  />
                  <span className="font-semibold text-slate-800">
                    Replace entire existing timetable
                  </span>
                  <span className="text-[10px] text-slate-400 hidden sm:inline">
                    (Recommended when timetable changes)
                  </span>
                </label>
              </div>
            </div>

            {/* Switch between Grid, Image Upload, and CSV Mode */}
            <div className="inline-flex p-1 bg-slate-200/80 rounded-lg border border-slate-300/60 self-start md:self-auto">
              <button
                type="button"
                onClick={() => setCompleteTab('grid')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-bold transition-all text-xs ${
                  completeTab === 'grid'
                    ? 'bg-white text-blue-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>Weekly Grid</span>
              </button>
              <button
                type="button"
                onClick={() => setCompleteTab('image')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-bold transition-all text-xs ${
                  completeTab === 'image'
                    ? 'bg-white text-indigo-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <ImageIcon className="w-3.5 h-3.5 text-indigo-600" />
                <span className="flex items-center gap-1">
                  Upload Image
                  <span className="px-1 py-0.2 text-[9px] bg-indigo-100 text-indigo-800 rounded font-black">
                    AI
                  </span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => setCompleteTab('csv')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-bold transition-all text-xs ${
                  completeTab === 'csv'
                    ? 'bg-white text-blue-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <UploadCloud className="w-3.5 h-3.5" />
                <span>CSV Upload</span>
              </button>
            </div>
          </div>

          {/* TAB 1: STRUCTURED WEEKLY TIMETABLE GRID */}
          {completeTab === 'grid' && (
            <div className="space-y-3">
              {/* Header Bar: Actions & Helpful Info */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 bg-indigo-50/70 border border-indigo-100 rounded-xl text-xs">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-indigo-950 text-sm">
                      Structured Weekly Timetable Builder
                    </span>
                    <span className="px-2 py-0.5 bg-indigo-100 text-indigo-800 font-bold rounded text-[10px] uppercase tracking-wider">
                      {completeSemester?.name || 'Semester Structure'}
                    </span>
                  </div>
                  <p className="text-[11px] text-indigo-700">
                    Add each timetable slot in order: day, period, faculty, subject, and room. Two-hour entries are automatically treated as lab sessions.
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={handleClearGrid}
                    className="flex items-center gap-1 px-3 py-1.5 text-slate-600 hover:text-rose-600 hover:bg-rose-50 border border-slate-300 rounded-lg font-semibold text-xs transition-colors"
                    title="Reset all cells in the grid to free"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Clear Grid</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-5 gap-2 p-3 bg-white border border-slate-200 rounded-xl shadow-xs">
                {[
                  ['01', 'Day', 'Monday-Saturday'],
                  ['02', 'Period', 'Class time'],
                  ['03', 'Faculty', 'Assigned member'],
                  ['04', 'Subject', 'Course or lab'],
                  ['05', 'Room', 'Classroom / lab']
                ].map(([step, label, detail]) => (
                  <div key={step} className="flex items-center gap-2 px-2 py-1.5">
                    <span className="w-6 h-6 rounded-full bg-indigo-50 border border-indigo-100 text-indigo-700 flex items-center justify-center text-[10px] font-bold shrink-0">
                      {step}
                    </span>
                    <div className="min-w-0">
                      <div className="text-[11px] font-bold text-slate-800">{label}</div>
                      <div className="text-[10px] text-slate-500 truncate">{detail}</div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Semester timetable grid table */}
              <div className="border border-slate-300 rounded-xl overflow-x-auto shadow-xs bg-white">
                <table className="w-full text-left text-xs border-collapse min-w-[1200px]">
                  <thead>
                    <tr className="bg-slate-100 border-b border-slate-300 text-[11px] font-bold uppercase text-slate-700 select-none">
                      <th className="py-3 px-3 w-28 border-r border-slate-300 bg-slate-200/70 text-slate-800">
                        Day / Period
                      </th>
                      <th className="py-2.5 px-2 text-center border-r border-slate-300 min-w-[170px]">
                        <div className="text-slate-900 font-black">I</div>
                        <div className="text-[10px] text-slate-500 font-mono font-normal">09:30 - 10:30</div>
                      </th>
                      <th className="py-2.5 px-1 text-center border-r border-slate-300 bg-amber-50/70 text-amber-900 font-bold text-[10px] w-14">
                        TEA BREAK
                        <div className="text-[9px] font-normal text-amber-700">10:30-11:00</div>
                      </th>
                      <th className="py-2.5 px-2 text-center border-r border-slate-300 min-w-[170px]">
                        <div className="text-slate-900 font-black">II</div>
                        <div className="text-[10px] text-slate-500 font-mono font-normal">11:00 - 12:00</div>
                      </th>
                      <th className="py-2.5 px-2 text-center border-r border-slate-300 min-w-[170px]">
                        <div className="text-slate-900 font-black">III</div>
                        <div className="text-[10px] text-slate-500 font-mono font-normal">12:00 - 01:00</div>
                      </th>
                      <th className="py-2.5 px-1 text-center border-r border-slate-300 bg-amber-50/70 text-amber-900 font-bold text-[10px] w-14">
                        LUNCH BREAK
                        <div className="text-[9px] font-normal text-amber-700">01:00-02:00</div>
                      </th>
                      <th className="py-2.5 px-2 text-center border-r border-slate-300 min-w-[170px]">
                        <div className="text-slate-900 font-black">IV</div>
                        <div className="text-[10px] text-slate-500 font-mono font-normal">02:00 - 03:00</div>
                      </th>
                      <th className="py-2.5 px-2 text-center border-r border-slate-300 min-w-[170px]">
                        <div className="text-slate-900 font-black">V</div>
                        <div className="text-[10px] text-slate-500 font-mono font-normal">03:00 - 04:00</div>
                      </th>
                      <th className="py-2.5 px-2 text-center min-w-[170px]">
                        <div className="text-slate-900 font-black">VI</div>
                        <div className="text-[10px] text-slate-500 font-mono font-normal">04:00 - 05:00</div>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {days.map((day) => (
                      <tr key={day.key} className="hover:bg-slate-50/40">
                        {/* Day Label */}
                        <td className="py-2.5 px-3 font-black text-slate-800 bg-slate-50 border-r border-slate-300 uppercase text-xs">
                          <div>{day.name}</div>
                          <div className="text-[10px] text-slate-400 font-mono font-semibold">{day.key}</div>
                        </td>

                        {/* Period 1 */}
                        {renderGridFacultyCell(day.key, 'p1')}

                        {/* Tea Break */}
                        <td className="p-1 border-r border-slate-300 bg-amber-50/30 text-center align-middle select-none">
                          <div className="text-[9px] font-black text-amber-700/60 uppercase [writing-mode:vertical-lr] rotate-180 mx-auto py-1">
                            TEA
                          </div>
                        </td>

                        {/* Period 2 */}
                        {renderGridFacultyCell(day.key, 'p2')}

                        {/* Period 3 */}
                        {renderGridFacultyCell(day.key, 'p3')}

                        {/* Lunch Break */}
                        <td className="p-1 border-r border-slate-300 bg-amber-50/30 text-center align-middle select-none">
                          <div className="text-[9px] font-black text-amber-700/60 uppercase [writing-mode:vertical-lr] rotate-180 mx-auto py-1">
                            LUNCH
                          </div>
                        </td>

                        {/* Period 4 */}
                        {renderGridFacultyCell(day.key, 'p4')}

                        {/* Period 5 */}
                        {renderGridFacultyCell(day.key, 'p5')}

                        {/* Period 6 */}
                        {renderGridFacultyCell(day.key, 'p6')}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

            </div>
          )}

          {/* TAB 2: UPLOAD IMAGE & AUTO-ALIGN TIMETABLE (AI SCAN) */}
          {completeTab === 'image' && (
            <div className="space-y-4">
              {/* Header Bar */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 bg-indigo-50/70 border border-indigo-200 rounded-xl text-xs">
                  <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-indigo-950 text-sm">
                        Upload Timetable Circular
                    </span>
                    <span className="px-2 py-0.5 bg-indigo-100 text-indigo-800 font-bold rounded text-[10px] uppercase tracking-wider flex items-center gap-1">
                      <Sparkles className="w-3 h-3 text-indigo-600" />
                      OCR Layout Engine
                    </span>
                  </div>
                </div>

                {imagePreviewUrl && (
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => triggerImageOcr()}
                      disabled={isParsingImage}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold text-xs shadow-2xs transition-all disabled:opacity-50"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isParsingImage ? 'animate-spin' : ''}`} />
                      <span>{isParsingImage ? 'Scanning...' : 'Re-scan Image'}</span>
                    </button>
                    <label className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-lg font-semibold text-xs cursor-pointer shadow-2xs transition-all">
                      <UploadCloud className="w-3.5 h-3.5 text-slate-500" />
                      <span>Change Image</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleImageFileSelect}
                        className="hidden"
                      />
                    </label>
                  </div>
                )}
              </div>

              {/* Status Banner when scanning */}
              {isParsingImage && (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-3 text-amber-900 animate-pulse">
                  <Loader2 className="w-5 h-5 animate-spin text-amber-600 shrink-0" />
                  <div>
                    <p className="font-bold text-xs">Scanning timetable circular & extracting weekly periods...</p>
                    <p className="text-[11px] text-amber-700 mt-0.5">
                      Parsing grid coordinates, period timings, 2-hour laboratory sessions, and matching faculty initials.
                    </p>
                  </div>
                </div>
              )}

              {/* IF NO IMAGE UPLOADED YET: DROPZONE */}
              {!imagePreviewUrl ? (
                <div className="border-2 border-dashed border-indigo-200 bg-indigo-50/20 hover:bg-indigo-50/40 rounded-2xl p-8 text-center transition-all">
                  <div className="max-w-md mx-auto space-y-3">
                    <div className="w-14 h-14 mx-auto rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 shadow-inner">
                      <ImageIcon className="w-7 h-7" />
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-800 text-sm">
                        Select or Drag & Drop Timetable Image
                      </h4>
                    </div>

                    <div className="flex flex-col sm:flex-row items-center justify-center gap-2 pt-2">
                      <label className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg cursor-pointer shadow-xs transition-all text-xs">
                        <UploadCloud className="w-4 h-4" />
                        <span>Browse Image File</span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleImageFileSelect}
                          className="hidden"
                        />
                      </label>

                    </div>
                  </div>
                </div>
              ) : (
                <>
                /* IF IMAGE IS UPLOADED: SIDE-BY-SIDE REVIEW WORKSPACE */
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-start">
                  {/* Left Column (5 cols): Timetable Image Preview & Legend */}
                  <div className="lg:col-span-5 space-y-2">
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5">
                      <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-200">
                        <div className="flex items-center gap-1.5">
                          <ImageIcon className="w-4 h-4 text-indigo-600" />
                          <span className="font-bold text-slate-800 text-xs">
                            Uploaded Timetable Circular
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setIsImageZoomed(!isImageZoomed)}
                          className="flex items-center gap-1 text-[10px] text-slate-600 hover:text-indigo-600 font-bold bg-white border border-slate-200 px-2 py-0.5 rounded shadow-2xs"
                        >
                          {isImageZoomed ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
                          <span>{isImageZoomed ? 'Compact' : 'Expand'}</span>
                        </button>
                      </div>

                      {/* Image Viewer */}
                      <div className={`overflow-auto border border-slate-200 rounded-lg bg-slate-900/5 transition-all ${
                        isImageZoomed ? 'max-h-[750px]' : 'max-h-[460px]'
                      }`}>
                        <img
                          src={imagePreviewUrl}
                          alt="Timetable Circular"
                          className="w-full h-auto object-contain rounded"
                        />
                      </div>

                      {/* Detected Metadata Chips */}
                      {imageParseResult && (
                        <div className="mt-2.5 pt-2 border-t border-slate-200 space-y-1.5">
                          <div className="flex flex-wrap gap-1.5">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-indigo-50 border border-indigo-200 text-indigo-800 font-bold rounded text-[10px]">
                              <GraduationCap className="w-3 h-3" />
                              {imageParseResult.detected_semester_name || `Semester ${imageParseResult.detected_semester_number}`}
                            </span>
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-50 border border-emerald-200 text-emerald-800 font-bold rounded text-[10px]">
                              <MapPin className="w-3 h-3" />
                              Room: {imageParseResult.detected_classroom || 'AI302'}
                            </span>
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-purple-50 border border-purple-200 text-purple-800 font-bold rounded text-[10px]">
                              <Building2 className="w-3 h-3" />
                              Lab: {imageParseResult.detected_lab || 'SA-205'}
                            </span>
                          </div>

                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right Column (7 cols): Aligned Weekly Grid */}
                  <div className="lg:col-span-7 space-y-2">
                    <div className="flex items-center justify-between p-2 bg-indigo-50/60 border border-indigo-200/80 rounded-xl">
                      <div>
                        <span className="font-bold text-slate-800 text-xs">
                          Extracted Weekly Timetable Grid
                        </span>
                        <p className="text-[10px] text-slate-500">
                          Cross-check aligned faculty and lecture/lab slots against the circular. You can directly edit any slot below.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={handleClearGrid}
                        className="flex items-center gap-1 px-2.5 py-1 text-slate-600 hover:text-rose-600 hover:bg-rose-50 border border-slate-300 rounded-md font-semibold text-[11px] transition-colors shrink-0"
                        title="Reset all cells"
                      >
                        <Trash2 className="w-3 h-3" />
                        <span>Clear</span>
                      </button>
                    </div>

                    {/* Weekly Grid Table in side-by-side mode */}
                    <div className="border border-slate-300 rounded-xl overflow-x-auto shadow-xs bg-white max-h-[500px] overflow-y-auto">
                      <table className="w-full text-left text-xs border-collapse min-w-[900px]">
                        <thead className="sticky top-0 z-10">
                          <tr className="bg-slate-100 border-b border-slate-300 text-[10px] font-bold uppercase text-slate-700 select-none">
                            <th className="py-2 px-2 w-20 border-r border-slate-300 bg-slate-200/70 text-slate-800">
                              Day
                            </th>
                            <th className="py-2 px-1 text-center border-r border-slate-300 min-w-[130px]">
                              <div className="text-slate-900 font-black">I</div>
                              <div className="text-[9px] text-slate-500 font-mono">09:30 - 10:30</div>
                            </th>
                            <th className="py-2 px-1 text-center border-r border-slate-300 bg-amber-50/70 text-amber-900 font-bold text-[9px] w-10">
                              TEA
                            </th>
                            <th className="py-2 px-1 text-center border-r border-slate-300 min-w-[130px]">
                              <div className="text-slate-900 font-black">II</div>
                              <div className="text-[9px] text-slate-500 font-mono">11:00 - 12:00</div>
                            </th>
                            <th className="py-2 px-1 text-center border-r border-slate-300 min-w-[130px]">
                              <div className="text-slate-900 font-black">III</div>
                              <div className="text-[9px] text-slate-500 font-mono">12:00 - 01:00</div>
                            </th>
                            <th className="py-2 px-1 text-center border-r border-slate-300 bg-amber-50/70 text-amber-900 font-bold text-[9px] w-12">
                              LUNCH
                            </th>
                            <th className="py-2 px-1 text-center border-r border-slate-300 min-w-[130px]">
                              <div className="text-slate-900 font-black">IV</div>
                              <div className="text-[9px] text-slate-500 font-mono">02:00 - 03:00</div>
                            </th>
                            <th className="py-2 px-1 text-center border-r border-slate-300 min-w-[130px]">
                              <div className="text-slate-900 font-black">V</div>
                              <div className="text-[9px] text-slate-500 font-mono">03:00 - 04:00</div>
                            </th>
                            <th className="py-2 px-1 text-center min-w-[130px]">
                              <div className="text-slate-900 font-black">VI</div>
                              <div className="text-[9px] text-slate-500 font-mono">04:00 - 05:00</div>
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200">
                          {days.map((day) => (
                            <tr key={day.key} className="hover:bg-slate-50/40">
                              <td className="py-2 px-2 font-black text-slate-800 bg-slate-50 border-r border-slate-300 uppercase text-xs">
                                <div>{day.key}</div>
                                <div className="text-[9px] text-slate-400 font-normal">{day.name}</div>
                              </td>

                              {renderGridFacultyCell(day.key, 'p1')}

                              <td className="p-1 border-r border-slate-300 bg-amber-50/30 text-center align-middle select-none">
                                <div className="text-[8px] font-black text-amber-700/60 uppercase [writing-mode:vertical-lr] rotate-180 mx-auto py-1">
                                  TEA
                                </div>
                              </td>

                              {renderGridFacultyCell(day.key, 'p2')}
                              {renderGridFacultyCell(day.key, 'p3')}

                              <td className="p-1 border-r border-slate-300 bg-amber-50/30 text-center align-middle select-none">
                                <div className="text-[8px] font-black text-amber-700/60 uppercase [writing-mode:vertical-lr] rotate-180 mx-auto py-1">
                                  LUNCH
                                </div>
                              </td>

                              {renderGridFacultyCell(day.key, 'p4')}
                              {renderGridFacultyCell(day.key, 'p5')}
                              {renderGridFacultyCell(day.key, 'p6')}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Faculty Teaching Load Summary */}
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-2 text-xs">
                      <div className="flex items-center justify-between text-[10px] font-bold text-slate-600 mb-1">
                        <span>Configured Teaching Faculty Load:</span>
                        <span className="text-indigo-700">
                          {days.reduce((tot, day) => {
                            return tot + timetableClassPeriods.reduce((pTot, p) => {
                              if (getCoveringPeriod(day.key, p.id)) return pTot;
                              const cell = gridData[day.key]?.[p.id];
                              const facId = typeof cell === 'object' ? cell?.faculty_id : cell;
                              if (!facId) return pTot;
                              const dur = typeof cell === 'object' && cell?.duration_hours ? cell.duration_hours : 1;
                              return pTot + dur;
                            }, 0);
                          }, 0)} hours
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {facultyList.map((f) => {
                          let totalHours = 0;
                          days.forEach((day) => {
                            timetableClassPeriods.forEach((p) => {
                              if (getCoveringPeriod(day.key, p.id)) return;
                              const cell = gridData[day.key]?.[p.id];
                              const facId = typeof cell === 'object' ? cell?.faculty_id : cell;
                              if (facId === f.id) {
                                const dur = typeof cell === 'object' && cell?.duration_hours ? cell.duration_hours : 1;
                                totalHours += dur;
                              }
                            });
                          });
                          if (totalHours === 0) return null;
                          return (
                            <span key={f.id} className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-white border border-slate-200 rounded text-[10px] text-slate-700 shadow-2xs">
                              <span className="font-medium">{f.name}:</span>
                              <span className="font-bold text-indigo-700">{totalHours}h</span>
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>

                {imageParseResult?.legend?.length > 0 && (
                  <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                    <div className="px-3 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                      <div>
                        <h4 className="text-xs font-bold text-slate-900">Scanned Subject Details</h4>
                        <p className="text-[10px] text-slate-500">Subjects, faculty allocation, L-T-P structure, and credits detected from the uploaded timetable.</p>
                      </div>
                      <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-100 rounded px-2 py-1">
                        {imageParseResult.legend.length} subjects
                      </span>
                    </div>
                    <div className="overflow-x-auto max-h-[280px] overflow-y-auto">
                      <table className="w-full text-left text-xs border-collapse min-w-[720px]">
                        <thead className="sticky top-0 bg-white border-b border-slate-200 text-[10px] uppercase font-bold text-slate-500">
                          <tr>
                            <th className="py-2 px-3">Subject Code</th>
                            <th className="py-2 px-3">Subject Name / Administrative Work</th>
                            <th className="py-2 px-3 text-center">L-T-P</th>
                            <th className="py-2 px-3 text-center">Credits</th>
                            <th className="py-2 px-3">Faculty Member</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {imageParseResult.legend.map((item, idx) => (
                            <tr key={`${item.code}-${idx}`} className="hover:bg-slate-50">
                              <td className="py-2 px-3 font-mono font-bold text-slate-900">{item.code}</td>
                              <td className="py-2 px-3 text-slate-700">{item.name || item.code}</td>
                              <td className="py-2 px-3 text-center font-mono text-slate-600">{item.ltp || '3-0-0'}</td>
                              <td className="py-2 px-3 text-center font-semibold text-slate-700">{item.credits || '3'}</td>
                              <td className="py-2 px-3 font-semibold text-indigo-700">
                                {(item.faculty_initials || []).map((initial) => OCR_FACULTY_NAMES[initial] || initial).join(', ') || 'Department Faculty'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
                </>
              )}
            </div>
          )}

          {/* TAB 3: CSV UPLOAD OR COPY-PASTE */}
          {completeTab === 'csv' && (
            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 bg-blue-50/60 border border-blue-100 rounded-xl text-xs text-blue-900">
                <div className="space-y-0.5">
                  <p className="font-bold">Fast CSV Timetable Upload / Direct Paste</p>
                  <p className="text-[11px] text-blue-700">
                    Format: <code className="font-mono font-semibold bg-white/80 px-1 py-0.5 rounded border border-blue-200">Day, StartTime, EndTime, FacultyName, Room</code>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleDownloadCsvTemplate}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-blue-300 hover:bg-blue-50 text-blue-700 font-bold rounded-lg shadow-2xs transition-all shrink-0"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download CSV Template</span>
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-semibold text-slate-700">Upload CSV File</label>
                  </div>
                  <input
                    type="file"
                    accept=".csv,.txt"
                    onChange={handleCsvFileUpload}
                    className="w-full text-xs text-slate-500 file:mr-3 file:py-1.5 file:px-2.5 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 border border-slate-200 rounded-lg p-1.5 bg-slate-50"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-semibold text-slate-700">Or Paste CSV Content Directly</label>
                    <button
                      type="button"
                      onClick={() => handleParseCsvText(csvText)}
                      className="text-[11px] text-blue-600 hover:text-blue-800 font-bold"
                    >
                      Parse & Preview
                    </button>
                  </div>
                  <textarea
                    rows={3}
                    value={csvText}
                    onChange={(e) => {
                      setCsvText(e.target.value);
                      handleParseCsvText(e.target.value);
                    }}
                    placeholder={`MON, 09:30, 10:30, Dr. Swathi H Y, AI301\nMON, 11:00, 12:00, Mrs. Ankitha S, AI301`}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 font-mono text-[11px] text-slate-800 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              {/* Parsed CSV Preview Table */}
              {csvParsedPreview.length > 0 && (
                <div className="border border-slate-200 rounded-xl overflow-hidden max-h-[200px] overflow-y-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-100 border-b border-slate-200 font-bold text-slate-700 uppercase text-[10px]">
                      <tr>
                        <th className="py-2 px-3">Day</th>
                        <th className="py-2 px-3">Time</th>
                        <th className="py-2 px-3">Faculty Name</th>
                        <th className="py-2 px-3">Room</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium">
                      {csvParsedPreview.map((item, idx) => (
                        <tr key={idx} className="hover:bg-slate-50">
                          <td className="py-1.5 px-3 font-bold font-mono text-slate-800">{item.day_of_week}</td>
                          <td className="py-1.5 px-3 font-mono text-slate-600">{item.start_time} - {item.end_time}</td>
                          <td className="py-1.5 px-3 text-slate-900 font-bold">{item.faculty_name}</td>
                          <td className="py-1.5 px-3 font-mono text-slate-500">{item.room_number}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Footer Actions */}
          <div className="flex items-center justify-between pt-3 border-t border-slate-200">
            <div className="text-slate-500 font-medium">
              {completeTab === 'grid' || completeTab === 'image'
                ? `${days.reduce((tot, day) => {
                    return tot + timetableClassPeriods.reduce((pTot, p) => {
                      if (getCoveringPeriod(day.key, p.id)) return pTot;
                      const cell = gridData[day.key]?.[p.id];
                      const facId = typeof cell === 'object' ? cell?.faculty_id : cell;
                      return facId ? pTot + 1 : pTot;
                    }, 0);
                  }, 0)} class sessions configured`
                : `${csvParsedPreview.length} slots parsed from CSV`}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setIsCompleteModalOpen(false)}
                className="px-4 py-2 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 font-medium"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveCompleteTimetable}
                disabled={isSubmittingBulk}
                className="flex items-center gap-1.5 px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold shadow-sm transition-all disabled:opacity-50"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>
                  {isSubmittingBulk ? 'Saving Timetable...' : 'Save Complete Timetable'}
                </span>
              </button>
            </div>
          </div>
        </div>
      </Modal>

      {/* ========================================================================= */}
      {/* 9. INLINE NEW SUBJECT CREATION MODAL                                      */}
      {/* ========================================================================= */}
      <Modal
        isOpen={isNewSubjectModalOpen}
        onClose={() => setIsNewSubjectModalOpen(false)}
        title="Add New Course Subject"
      >
        <form onSubmit={handleCreateNewSubject} className="space-y-4 text-xs">
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Target Semester</label>
            <select
              value={newSubSemId}
              onChange={(e) => setNewSubSemId(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:border-blue-500 font-medium"
            >
              {semesters.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} (Semester {s.sem_number})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Course Code *</label>
            <input
              type="text"
              required
              placeholder="e.g. 24AI409 or 23AI609"
              value={newSubCode}
              onChange={(e) => setNewSubCode(e.target.value.toUpperCase())}
              className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 font-mono text-slate-800 text-xs focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1">Subject Name *</label>
            <input
              type="text"
              required
              placeholder="e.g. Mobile Application Development"
              value={newSubName}
              onChange={(e) => setNewSubName(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-800 text-xs focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setIsNewSubjectModalOpen(false)}
              className="px-4 py-2 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmittingSubject}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold shadow-sm disabled:opacity-50"
            >
              {isSubmittingSubject ? 'Saving...' : 'Add Subject'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Toast Notification */}
      {successToast && (
        <div className="fixed bottom-5 right-5 z-50 flex items-center gap-2 bg-slate-900 text-white px-4 py-2.5 rounded-lg shadow-xl text-xs font-semibold animate-in fade-in slide-in-from-bottom-2 duration-200">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{successToast}</span>
        </div>
      )}
    </div>
  );
};

export default Timetables;
