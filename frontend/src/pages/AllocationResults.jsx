import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { cieApi } from '../services/cieApi';
import { allocationApi } from '../services/allocationApi';
import { academicApi } from '../services/academicApi';
import { facultyApi } from '../services/facultyApi';
import { reportApi } from '../services/reportApi';
import Badge from '../components/common/Badge';
import Modal from '../components/common/Modal';
import ExplanationDrawer from '../components/allocation/ExplanationDrawer';
import ManualOverrideModal from '../components/allocation/ManualOverrideModal';
import {
  FileSpreadsheet,
  FileText,
  Printer,
  Filter,
  HelpCircle,
  UserCheck,
  Edit,
  CheckCircle2,
  XCircle,
  Clock,
  Sparkles,
  Layers,
  Calendar,
  Plus,
  Trash2,
  ShieldCheck,
  AlertCircle,
  Pencil
} from 'lucide-react';

const AllocationResults = () => {
  const [searchParams] = useSearchParams();
  const [cies, setCies] = useState([]);
  const [selectedCieId, setSelectedCieId] = useState('');
  const [semesters, setSemesters] = useState([]);
  const [facultyList, setFacultyList] = useState([]);

  // Filters
  const [semFilter, setSemFilter] = useState('');
  const [facFilter, setFacFilter] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Results
  const [resultsData, setResultsData] = useState(null);
  const [loading, setLoading] = useState(true);

  // Explainability drawer
  const [selectedDutyForExplanation, setSelectedDutyForExplanation] = useState(null);
  const [explanationData, setExplanationData] = useState(null);
  const [isExplanationOpen, setIsExplanationOpen] = useState(false);

  // Manual override modal
  const [selectedDutyForOverride, setSelectedDutyForOverride] = useState(null);
  const [isOverrideOpen, setIsOverrideOpen] = useState(false);

  // 1. EDIT OVERALL DUTY & SESSION TIME MODAL
  const [isEditDutyModalOpen, setIsEditDutyModalOpen] = useState(false);
  const [editSessionId, setEditSessionId] = useState(null);
  const [editSubjectCode, setEditSubjectCode] = useState('');
  const [editSubjectName, setEditSubjectName] = useState('');
  const [editSemesterName, setEditSemesterName] = useState('');
  const [editSemesterId, setEditSemesterId] = useState('');
  const [editSubjectId, setEditSubjectId] = useState('');
  const [editDate, setEditDate] = useState('2026-09-10');
  const [editStartTime, setEditStartTime] = useState('09:00');
  const [editEndTime, setEditEndTime] = useState('10:00');
  const [editTotalStudents, setEditTotalStudents] = useState(60);
  const [editRooms, setEditRooms] = useState([]);
  const [editNotes, setEditNotes] = useState('');
  const [editFacultyConflicts, setEditFacultyConflicts] = useState({});
  const [respectedRegularSems, setRespectedRegularSems] = useState([]);
  const [isLoadingConflicts, setIsLoadingConflicts] = useState(false);
  const [isSubmittingEdit, setIsSubmittingEdit] = useState(false);
  const [applyToAllSlotDutiesToday, setApplyToAllSlotDutiesToday] = useState(true);
  const [applyToAllDaysSlot, setApplyToAllDaysSlot] = useState(false);

  // 2. BATCH SHIFT SLOT TIMING MODAL
  const [isShiftSlotModalOpen, setIsShiftSlotModalOpen] = useState(false);
  const [shiftSlotDate, setShiftSlotDate] = useState('2026-09-10');
  const [shiftCurrentStartTime, setShiftCurrentStartTime] = useState('09:00');
  const [shiftNewDate, setShiftNewDate] = useState('2026-09-10');
  const [shiftNewStartTime, setShiftNewStartTime] = useState('09:30');
  const [shiftNewEndTime, setShiftNewEndTime] = useState('10:30');
  const [isSubmittingShift, setIsSubmittingShift] = useState(false);

  // 3. OVERALL EDIT DUTIES (5TH, 7TH & 3RD SEM) MODAL
  const [isOverallEditModalOpen, setIsOverallEditModalOpen] = useState(false);
  const [overallSessions, setOverallSessions] = useState([]);
  const [overallFilterSem, setOverallFilterSem] = useState('all'); // 'all' | '3' | '5' | '7'
  const [overallLoading, setOverallLoading] = useState(false);
  const [overallSessionState, setOverallSessionState] = useState({});
  const [overallConflictState, setOverallConflictState] = useState({});
  const [isSavingOverall, setIsSavingOverall] = useState(false);

  // Toast notification
  const [successToast, setSuccessToast] = useState(null);


  useEffect(() => {
    loadMetadata();
  }, []);

  useEffect(() => {
    if (selectedCieId) {
      loadResults(selectedCieId);
    }
  }, [selectedCieId, semFilter, facFilter, dateFilter, statusFilter]);

  const loadMetadata = async () => {
    try {
      const [cRes, sRes, fRes] = await Promise.all([
        cieApi.getAll(),
        academicApi.getSemesters(),
        facultyApi.getAll({ status: 'active' }),
      ]);
      setCies(cRes.data || []);
      setSemesters(sRes.data || []);
      setFacultyList(fRes.data.faculty || []);

      const urlCie = searchParams.get('cie_id');
      const urlSem = searchParams.get('semester_id');
      if (urlSem) setSemFilter(urlSem);

      if (urlCie) {
        setSelectedCieId(urlCie);
      } else if (cRes.data?.length > 0) {
        const active = cRes.data.find((c) => c.is_current) || cRes.data[0];
        setSelectedCieId(active.id);
      }
    } catch (err) {
      console.error('Error loading metadata:', err);
    }
  };

  const loadResults = async (cieId) => {
    setLoading(true);
    try {
      const params = {};
      if (semFilter) params.semester_id = semFilter;
      if (facFilter) params.faculty_id = facFilter;
      if (dateFilter) params.date = dateFilter;
      if (statusFilter) params.status = statusFilter;

      const res = await allocationApi.getResults(cieId, params);
      setResultsData(res.data);
    } catch (err) {
      console.error('Error loading allocation results:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenExplanation = async (duty) => {
    setSelectedDutyForExplanation(duty);
    try {
      const res = await allocationApi.getExplanation(duty.id);
      setExplanationData(res.data);
      setIsExplanationOpen(true);
    } catch (err) {
      alert('No explanation recorded for this duty');
    }
  };

  const handleOpenOverride = (duty) => {
    setSelectedDutyForOverride(duty);
    setIsOverrideOpen(true);
  };

  const handleOverrideSuccess = () => {
    setIsOverrideOpen(false);
    loadResults(selectedCieId);
  };

  const handleStatusChange = async (dutyId, newStatus) => {
    try {
      await allocationApi.updateStatus(dutyId, newStatus);
      loadResults(selectedCieId);
    } catch (err) {
      alert('Failed to update duty status');
    }
  };

  const showToast = (msg) => {
    setSuccessToast(msg);
    setTimeout(() => setSuccessToast(null), 3500);
  };

  // Real-time conflict analysis against respected regular class timetable
  const fetchEditConflicts = async (dateVal, stVal, etVal, semIdVal = null) => {
    setIsLoadingConflicts(true);
    try {
      const res = await allocationApi.checkFacultyConflicts({
        date: dateVal,
        start_time: stVal,
        end_time: etVal,
        semester_id: semIdVal || editSemesterId || undefined,
        buffer_minutes: 60
      });
      const map = {};
      (res.data?.faculty_analysis || []).forEach((f) => {
        map[f.faculty_id] = f;
      });
      setEditFacultyConflicts(map);
      setRespectedRegularSems(res.data?.respected_regular_semesters || []);
    } catch (err) {
      console.error('Failed to fetch faculty conflicts:', err);
    } finally {
      setIsLoadingConflicts(false);
    }
  };

  // Trigger conflict check whenever editDate, editStartTime, or editEndTime change
  useEffect(() => {
    if (isEditDutyModalOpen && editDate && editStartTime && editEndTime) {
      fetchEditConflicts(editDate, editStartTime, editEndTime, editSemesterId);
    }
  }, [isEditDutyModalOpen, editDate, editStartTime, editEndTime, editSemesterId]);

  // Open Edit Overall Duty Modal for a duty row
  const handleOpenEditOverallDuty = async (duty) => {
    if (!duty.exam_session_id) {
      alert('Exam session information not available for this duty.');
      return;
    }

    try {
      const res = await cieApi.getSession(duty.exam_session_id);
      const sess = res.data?.session;
      if (!sess) {
        alert('Could not load session details.');
        return;
      }

      setEditSessionId(sess.id);
      setEditSubjectCode(sess.subject_code || duty.subject_code || '');
      setEditSubjectName(sess.subject_name || duty.subject_name || '');
      setEditSemesterName(sess.semester_name || duty.semester_name || '');
      setEditSemesterId(sess.semester_id?.toString() || '');
      setEditSubjectId(sess.subject_id?.toString() || '');
      setEditDate(sess.exam_date || duty.exam_date || '2026-09-10');
      setEditStartTime(sess.start_time || duty.start_time || '09:00');
      setEditEndTime(sess.end_time || duty.end_time || '10:00');
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
          { id: 1, room_number: 'AI301', student_start: 1, student_end: 29, room_capacity: 30, faculty_id: duty.faculty_id?.toString() || '', duty_type: 'Invigilation' },
          { id: 2, room_number: 'AI302', student_start: 30, student_end: 60, room_capacity: 30, faculty_id: '', duty_type: 'Invigilation' }
        ];
      }
      setEditRooms(initRooms);

      fetchEditConflicts(sess.exam_date || duty.exam_date, sess.start_time || duty.start_time, sess.end_time || duty.end_time);
      setApplyToAllSlotDutiesToday(true);
      setApplyToAllDaysSlot(false);
      setIsEditDutyModalOpen(true);
    } catch (err) {
      console.error('Failed to load session details:', err);
      alert('Failed to load overall duty session details');
    }
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
      const candidate = facultyList.find((f) => {
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
    showToast('Assigned conflict-free faculty based on 3rd sem timetable for new time.');
  };

  const handleSaveEditDuty = async (e) => {
    e.preventDefault();
    if (!editSessionId) return;

    // Check if any assigned faculty has a clash
    const clashing = [];
    editRooms.forEach((r) => {
      if (r.faculty_id) {
        const conf = editFacultyConflicts[parseInt(r.faculty_id)];
        if (conf?.has_clash || conf?.has_3rd_sem_clash) {
          clashing.push(`${conf.name} in Room ${r.room_number} (${(conf.clash_details || []).join(', ')})`);
        }
      }
    });

    if (clashing.length > 0) {
      const confirmProceed = window.confirm(
        `⚠️ WARNING: The following assigned faculty have regular class clashes within +/- 60 minutes of the new time slot:\n\n` +
        clashing.join('\n') +
        `\n\nInstitutional policy strictly protects regular classes. Do you want to proceed and allow conflict-free auto-assignment?`
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
        ? `Duty timing updated to ${editStartTime} - ${editEndTime} and cascaded to all duties in this slot on ${editDate}. Respected timetable verified. Reloading page...`
        : `Duty timing updated to ${editStartTime} - ${editEndTime}. Respected timetable verified. Reloading page...`;
      showToast(successMsg);
      setTimeout(() => {
        window.location.reload();
      }, 700);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to update overall duty');
      setIsSubmittingEdit(false);
    }
  };

  // ==========================================
  // 3. OVERALL EDIT (5TH, 7TH & 3RD SEM) HANDLERS
  // ==========================================
  const handleOpenOverallEditModal = async () => {
    setIsOverallEditModalOpen(true);
    setOverallLoading(true);
    try {
      const res = await cieApi.getSessions(selectedCieId);
      const sessList = res.data || [];
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
      const candidate = facultyList.find((f) => {
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
      const payload = {
        sessions: Object.keys(overallSessionState).map((sessId) => {
          const s = overallSessionState[sessId];
          return {
            id: parseInt(sessId),
            session_id: parseInt(sessId),
            exam_date: s.exam_date,
            start_time: s.start_time,
            end_time: s.end_time,
            auto_assign: true,
            rooms: s.rooms.map((r) => ({
              id: r.id,
              room_number: r.room_number,
              faculty_id: r.faculty_id ? parseInt(r.faculty_id) : null
            }))
          };
        })
      };
      await cieApi.batchUpdateSessions(payload);
      setIsOverallEditModalOpen(false);
      showToast('All semester duties updated & verified with respected timetables. Reloading page...');
      setTimeout(() => {
        window.location.reload();
      }, 700);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to save overall changes');
      setIsSavingOverall(false);
    }
  };

  // Batch shift slot time
  const handleSaveShiftSlotTime = async (e) => {
    e.preventDefault();
    setIsSubmittingShift(true);
    try {
      const res = await cieApi.shiftSlotTime({
        cie_id: parseInt(selectedCieId) || 1,
        current_date: shiftSlotDate,
        current_start_time: shiftCurrentStartTime,
        new_date: shiftNewDate,
        new_start_time: shiftNewStartTime,
        new_end_time: shiftNewEndTime
      });
      setIsShiftSlotModalOpen(false);
      showToast(res.data?.message || `Shifted slot time to ${shiftNewStartTime} - ${shiftNewEndTime}.`);
      loadResults(selectedCieId);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to shift slot timing');
    } finally {
      setIsSubmittingShift(false);
    }
  };


  const duties = resultsData?.duties || [];
  const summary = resultsData?.summary || {
    total_required: 0,
    allocated: 0,
    pending: 0,
    completed: 0,
    conflicts: 0,
  };

  const sem3 = semesters.find((s) => s.sem_number === 3);
  const sem5 = semesters.find((s) => s.sem_number === 5);
  const sem7 = semesters.find((s) => s.sem_number === 7);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200/80 pb-5">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-sky-600 uppercase tracking-wider mb-1">
            <span>Verified Timetable Allocations</span>
            <span>•</span>
            <span>Explainable AI Engine</span>
          </div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Examination Duty Allocation Results</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Review allocated invigilation roster, inspect decision provenance, or apply controlled manual overrides
          </p>
        </div>

        {/* Action buttons: Overall Edit Duties, Shift Slot Time, Export & Print */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={handleOpenOverallEditModal}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-semibold shadow-sm transition-all"
            title="Unified edit option for 5th, 7th, and 3rd semester duties with automatic timetable check and faculty assignment"
          >
            <Clock className="w-4 h-4 text-white" />
            <span>⚡ Overall Edit Duties (5th, 7th & 3rd Sem)</span>
          </button>
          <button
            onClick={() => {
              if (duties.length > 0) {
                setShiftSlotDate(duties[0].exam_date || '2026-09-10');
                setShiftCurrentStartTime(duties[0].start_time || '09:00');
                setShiftNewDate(duties[0].exam_date || '2026-09-10');
                setShiftNewStartTime(duties[0].start_time || '09:00');
                setShiftNewEndTime(duties[0].end_time || '10:00');
              }
              setIsShiftSlotModalOpen(true);
            }}
            className="flex items-center gap-1.5 px-3 py-2 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 text-indigo-700 rounded-xl text-xs font-semibold shadow-2xs transition-all"
            title="Batch shift or change timing for an entire examination slot"
          >
            <Clock className="w-4 h-4 text-indigo-600" />
            <span>Shift Slot Time</span>
          </button>
          <a
            href={reportApi.downloadExcelUrl(selectedCieId)}
            className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-semibold shadow-sm transition-all"
            target="_blank"
            rel="noreferrer"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
            <span>Export Excel</span>
          </a>
          <a
            href={reportApi.downloadPdfUrl(selectedCieId)}
            className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-semibold shadow-sm transition-all"
            target="_blank"
            rel="noreferrer"
          >
            <FileText className="w-4 h-4 text-rose-600" />
            <span>Export PDF</span>
          </a>
          <button
            onClick={() => window.print()}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold shadow-sm transition-all"
          >
            <Printer className="w-4 h-4" />
            <span>Print Sheet</span>
          </button>
        </div>
      </div>

      {/* Summary KPI Strip */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="p-4 bg-white rounded-xl border border-slate-200/90 shadow-sm">
          <span className="text-[10px] text-slate-400 uppercase font-semibold">Total Required</span>
          <div className="text-xl font-bold text-slate-900 mt-1">{summary.total_required}</div>
        </div>
        <div className="p-4 bg-white rounded-xl border border-slate-200/90 shadow-sm">
          <span className="text-[10px] text-slate-400 uppercase font-semibold">Allocated Duties</span>
          <div className="text-xl font-bold text-emerald-600 mt-1">{summary.allocated}</div>
        </div>
        <div className="p-4 bg-white rounded-xl border border-slate-200/90 shadow-sm">
          <span className="text-[10px] text-slate-400 uppercase font-semibold">Pending Duties</span>
          <div className={`text-xl font-bold mt-1 ${summary.pending > 0 ? 'text-amber-600' : 'text-slate-400'}`}>
            {summary.pending}
          </div>
        </div>
        <div className="p-4 bg-white rounded-xl border border-slate-200/90 shadow-sm">
          <span className="text-[10px] text-slate-400 uppercase font-semibold">Completed Duties</span>
          <div className="text-xl font-bold text-sky-600 mt-1">{summary.completed}</div>
        </div>
        <div className="p-4 bg-white rounded-xl border border-slate-200/90 shadow-sm">
          <span className="text-[10px] text-slate-400 uppercase font-semibold">Conflicts / Unresolved</span>
          <div className={`text-xl font-bold mt-1 ${summary.conflicts > 0 ? 'text-rose-600' : 'text-slate-400'}`}>
            {summary.conflicts}
          </div>
        </div>
      </div>

      {/* Quick Semester Selector Tabs */}
      <div className="flex flex-wrap items-center gap-2 bg-slate-100 p-1.5 rounded-xl border border-slate-200 text-xs">
        <span className="text-slate-500 font-bold px-2 flex items-center gap-1.5">
          <Layers className="w-3.5 h-3.5" /> View Scope:
        </span>
        <button
          onClick={() => setSemFilter('')}
          className={`px-3 py-1.5 rounded-lg font-semibold transition-all ${
            semFilter === ''
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          All Semesters
        </button>

        {sem3 && (
          <button
            onClick={() => setSemFilter(sem3.id.toString())}
            className={`px-3 py-1.5 rounded-lg font-semibold transition-all ${
              semFilter === sem3.id.toString()
                ? 'bg-amber-600 text-white shadow-sm'
                : 'text-amber-700 hover:bg-amber-50'
            }`}
          >
            3rd Semester B.E. Duties Only
          </button>
        )}

        {sem5 && (
          <button
            onClick={() => setSemFilter(sem5.id.toString())}
            className={`px-3 py-1.5 rounded-lg font-semibold transition-all ${
              semFilter === sem5.id.toString()
                ? 'bg-sky-600 text-white shadow-sm'
                : 'text-sky-700 hover:bg-sky-50'
            }`}
          >
            5th Semester B.E. Duties Only
          </button>
        )}

        {sem7 && (
          <button
            onClick={() => setSemFilter(sem7.id.toString())}
            className={`px-3 py-1.5 rounded-lg font-semibold transition-all ${
              semFilter === sem7.id.toString()
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-indigo-700 hover:bg-indigo-50'
            }`}
          >
            7th Semester B.E. Duties Only
          </button>
        )}
      </div>

      {/* Filter Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200/90 shadow-sm flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-3">
          <label className="font-semibold text-slate-700">CIE Cycle:</label>
          <select
            value={selectedCieId}
            onChange={(e) => setSelectedCieId(e.target.value)}
            className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-800 text-xs font-bold focus:ring-1 focus:ring-sky-500 focus:outline-none"
          >
            {cies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.academic_year})
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Filter className="w-3.5 h-3.5 text-slate-400" />
          <select
            value={semFilter}
            onChange={(e) => setSemFilter(e.target.value)}
            className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-700 text-xs focus:ring-1 focus:ring-sky-500 focus:outline-none"
          >
            <option value="">All Semesters</option>
            {semesters.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>

          <select
            value={facFilter}
            onChange={(e) => setFacFilter(e.target.value)}
            className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-700 text-xs focus:ring-1 focus:ring-sky-500 focus:outline-none"
          >
            <option value="">All Faculty</option>
            {facultyList.map((f) => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-700 text-xs focus:ring-1 focus:ring-sky-500 focus:outline-none"
          >
            <option value="">All Statuses</option>
            <option value="ASSIGNED">Assigned</option>
            <option value="COMPLETED">Completed</option>
            <option value="PENDING">Pending</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
        </div>
      </div>

      {/* Allocation Table */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200/80 text-slate-600 font-semibold uppercase text-[10px] tracking-wider">
                <th className="py-3 px-3">Date</th>
                <th className="py-3 px-3">Time Window</th>
                <th className="py-3 px-3">Semester</th>
                <th className="py-3 px-3">Subject</th>
                <th className="py-3 px-3 text-center">Room</th>
                <th className="py-3 px-3">Student Range</th>
                <th className="py-3 px-3">Duty Type</th>
                <th className="py-3 px-3">Assigned Squad</th>
                <th className="py-3 px-3">Allocated Faculty</th>
                <th className="py-3 px-3 text-center">Status</th>
                <th className="py-3 px-3 text-center">Override</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan="12" className="py-16 text-center text-slate-400">
                    Loading allocation results...
                  </td>
                </tr>
              ) : duties.length === 0 ? (
                <tr>
                  <td colSpan="12" className="py-16 text-center text-slate-500">
                    <p className="font-semibold text-slate-700">No duty allocations found for this selection.</p>
                    <p className="text-xs text-slate-400 mt-1">
                      Generate a new allocation from the Allocation Solver page to populate duty assignments.
                    </p>
                  </td>
                </tr>
              ) : (
                duties.map((duty) => (
                  <tr
                    key={duty.id}
                    className={`hover:bg-slate-50/70 transition-colors ${
                      duty.is_manual_override ? 'bg-amber-50/30' : ''
                    }`}
                  >
                    <td className="py-3 px-3 font-semibold text-slate-800 whitespace-nowrap">
                      {duty.exam_date}
                    </td>
                    <td className="py-3 px-3 font-mono text-slate-600 whitespace-nowrap">
                      {duty.start_time} - {duty.end_time}
                    </td>
                    <td className="py-3 px-3">
                      <span className="font-semibold text-slate-700">
                        {duty.semester_name}
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      <span className="font-bold text-slate-800 mr-1.5">{duty.subject_code}</span>
                      <span className="text-slate-500">{duty.subject_name}</span>
                    </td>
                    <td className="py-3 px-3 text-center font-bold text-slate-900 font-mono">
                      {duty.room_number || 'AI301'}
                    </td>
                    <td className="py-3 px-3 font-mono text-slate-700 whitespace-nowrap">
                      {duty.student_range ? (
                        <span className="px-2 py-0.5 rounded bg-slate-100 font-semibold text-slate-800 text-[11px]">
                          {duty.student_range} {duty.student_count ? `(${duty.student_count})` : ''}
                        </span>
                      ) : (
                        <span className="text-slate-400 text-[11px]">-</span>
                      )}
                    </td>
                    <td className="py-3 px-3">
                      <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-700">
                        {duty.duty_type || 'Invigilation'}
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      {(duty.squad_faculty || duty.squad_faculty_name) ? (
                        <div className="flex items-center gap-1.5">
                          <span className="p-1 rounded bg-amber-50 text-amber-700 border border-amber-200 shrink-0">
                            <ShieldCheck className="w-3.5 h-3.5 text-amber-600" />
                          </span>
                          <div>
                            <div className="font-semibold text-slate-900 leading-tight flex items-center gap-1 text-[11px]">
                              <span>{duty.squad_faculty?.name || duty.squad_faculty_name}</span>
                              {(duty.squad_faculty?.name || duty.squad_faculty_name)?.includes('Swathi') && (
                                <span className="px-1.5 py-0.5 bg-purple-100 text-purple-800 text-[9px] font-bold rounded">Squad</span>
                              )}
                              {(duty.squad_faculty?.name || duty.squad_faculty_name)?.includes('Ankitha') && (
                                <span className="px-1.5 py-0.5 bg-blue-100 text-blue-800 text-[9px] font-bold rounded">Squad</span>
                              )}
                              {(duty.squad_faculty?.name || duty.squad_faculty_name)?.includes('Arjun') && (
                                <span className="px-1.5 py-0.5 bg-amber-100 text-amber-800 text-[9px] font-bold rounded">Squad</span>
                              )}
                            </div>
                            <div className="text-[10px] text-slate-400">
                              {duty.squad_faculty?.designation || duty.squad_faculty_designation || 'Squad Duty Officer'}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <span className="text-slate-400 italic text-[11px]">Unassigned</span>
                      )}
                    </td>
                    <td className="py-3 px-3 font-semibold text-slate-900">
                      {duty.faculty_name ? (
                        <div className="flex items-center gap-1.5">
                          <UserCheck className="w-3.5 h-3.5 text-emerald-600" />
                          <span>{duty.faculty_name}</span>
                        </div>
                      ) : (
                        <span className="text-amber-600 italic">Unassigned / Pending</span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-center">
                      <Badge
                        variant={
                          duty.status === 'COMPLETED'
                            ? 'success'
                            : duty.status === 'ASSIGNED'
                            ? 'brand'
                            : duty.status === 'CANCELLED'
                            ? 'danger'
                            : 'warning'
                        }
                      >
                        {duty.status}
                      </Badge>
                    </td>
                    <td className="py-3 px-3 text-center">
                      {duty.is_manual_override ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                          OVERRIDE
                        </span>
                      ) : (
                        <span className="text-slate-400 font-mono text-[11px]">-</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => handleOpenEditOverallDuty(duty)}
                          className="px-2.5 py-1 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 rounded-lg text-[11px] font-bold flex items-center gap-1 transition-all shadow-2xs"
                          title="Edit overall duty time, date, rooms, and assigned faculty"
                        >
                          <Clock className="w-3.5 h-3.5 text-indigo-600" />
                          <span>Edit Duty</span>
                        </button>
                        <button
                          onClick={() => handleOpenExplanation(duty)}
                          className="px-2.5 py-1 bg-sky-50 text-sky-700 hover:bg-sky-100 rounded-lg text-[11px] font-bold flex items-center gap-1 transition-colors"
                          title="View Engine Decision Provenance"
                        >
                          <HelpCircle className="w-3.5 h-3.5" />
                          <span>Explain</span>
                        </button>
                        <button
                          onClick={() => handleOpenOverride(duty)}
                          className="px-2.5 py-1 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-lg text-[11px] font-semibold flex items-center gap-1 transition-colors"
                          title="Quick Reassign Invigilator"
                        >
                          <UserCheck className="w-3.5 h-3.5" />
                          <span>Reassign</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Toast Notification */}
      {successToast && (
        <div className="fixed bottom-5 right-5 z-50 bg-slate-900 text-white px-4 py-3 rounded-xl shadow-xl flex items-center gap-2 text-xs border border-slate-700 animate-in fade-in slide-in-from-bottom-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{successToast}</span>
        </div>
      )}

      {/* Decision Explainability Drawer */}
      <ExplanationDrawer
        isOpen={isExplanationOpen}
        onClose={() => setIsExplanationOpen(false)}
        duty={selectedDutyForExplanation}
        explanation={explanationData}
      />

      {/* Manual Override Modal */}
      <ManualOverrideModal
        isOpen={isOverrideOpen}
        onClose={() => setIsOverrideOpen(false)}
        duty={selectedDutyForOverride}
        facultyList={facultyList}
        onSuccess={handleOverrideSuccess}
      />

      {/* ========================================================================= */}
      {/* EDIT OVERALL DUTY & SESSION TIMING MODAL                                  */}
      {/* ========================================================================= */}
      <Modal
        isOpen={isEditDutyModalOpen}
        onClose={() => setIsEditDutyModalOpen(false)}
        title="Edit Overall Examination Duty & Slot Timing"
      >
        <form onSubmit={handleSaveEditDuty} className="space-y-4 text-xs">
          {/* Top highlight card */}
          <div className="p-3.5 bg-indigo-50/70 border border-indigo-200 rounded-xl space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-bold text-indigo-950">
                  {editSubjectCode} — {editSubjectName}
                </div>
                <div className="text-xs text-indigo-700 font-medium">
                  {editSemesterName}
                </div>
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

            <div className="p-2 bg-white/90 border border-indigo-100 rounded-lg text-[11px] text-slate-600 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
              <span>
                <strong>Time Adjustment Mode:</strong> If exam timings change, update Date, Start Time & End Time below. Faculty availability will be checked live against the 3rd semester timetable (±60 min buffer).
              </span>
            </div>

            {/* Conflict Summary Chips */}
            <div className="flex flex-wrap items-center gap-1.5 pt-1 text-[11px]">
              <span className="text-slate-500 font-medium">Faculty Status:</span>
              {facultyList.map((f) => {
                const conf = editFacultyConflicts[f.id];
                const hasClash = conf?.has_3rd_sem_clash;
                const isSquadOnly = f.only_squad_duty || f.id === 1 || f.name?.includes('Arjun');
                if (hasClash) {
                  return (
                    <span
                      key={f.id}
                      className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 font-semibold border border-rose-200 flex items-center gap-1"
                      title={`${f.name}: 3rd Sem Class Clash (${conf.clash_details?.join(', ')})`}
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

          {/* Date & Time Controls */}
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

          {/* Rooms and Invigilators */}
          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <div className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Examination Rooms & Invigilators
                </div>
                <div className="text-[11px] text-slate-500">
                  Assign faculty based on respected timetable ({respectedRegularSems.join(', ') || '3rd Sem'}) with ±60 min buffer protection.
                </div>
              </div>

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
                          {facultyList.map((f) => {
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

                    {hasClash && (
                      <div className="p-2 bg-rose-50 border border-rose-200 rounded text-[11px] text-rose-800 flex items-center gap-1.5 font-medium">
                        <AlertCircle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                        <span>
                          <strong>3rd Sem Lecture Conflict:</strong> {selectedConf.name} has regular 3rd sem class ({selectedConf.clash_details?.join(', ')}) during or within 1 hour of this new exam slot!
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

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
              placeholder="e.g. Exam timing rescheduled by department"
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
      {/* SHIFT OVERALL SLOT TIMING MODAL                                           */}
      {/* ========================================================================= */}
      <Modal
        isOpen={isShiftSlotModalOpen}
        onClose={() => setIsShiftSlotModalOpen(false)}
        title="Shift Overall Examination Slot Timing"
      >
        <form onSubmit={handleSaveShiftSlotTime} className="space-y-4 text-xs">
          <div className="p-3.5 bg-blue-50 border border-blue-200 rounded-xl space-y-1 text-blue-950">
            <div className="flex items-center gap-1.5 font-bold text-xs text-blue-900">
              <Clock className="w-4 h-4 text-blue-600" />
              <span>Batch Update Slot Timings</span>
            </div>
            <p className="text-[11px] text-blue-800 leading-relaxed">
              Reschedules ALL exam sessions and assigned room duties occurring at a particular slot to a new time window.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Target Date *</label>
              <input
                type="date"
                required
                value={shiftSlotDate}
                onChange={(e) => setShiftSlotDate(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Current Slot Start Time *</label>
              <input
                type="time"
                required
                value={shiftCurrentStartTime}
                onChange={(e) => setShiftCurrentStartTime(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-800 font-mono focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
            <div className="font-bold text-slate-800 text-xs uppercase tracking-wider">
              New Exam Timing (HH:MM)
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">New Date</label>
                <input
                  type="date"
                  value={shiftNewDate}
                  onChange={(e) => setShiftNewDate(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">New Start Time *</label>
                <input
                  type="time"
                  required
                  value={shiftNewStartTime}
                  onChange={(e) => setShiftNewStartTime(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800 font-mono focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">New End Time *</label>
                <input
                  type="time"
                  required
                  value={shiftNewEndTime}
                  onChange={(e) => setShiftNewEndTime(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-800 font-mono focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setIsShiftSlotModalOpen(false)}
              className="px-4 py-2 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmittingShift}
              className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-semibold shadow-sm disabled:opacity-50 flex items-center gap-1.5"
            >
              <Clock className="w-4 h-4" />
              <span>{isSubmittingShift ? 'Updating Slot...' : 'Apply Slot Time Shift'}</span>
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
                                {facultyList.map((f) => {
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
    </div>
  );
};

export default AllocationResults;
