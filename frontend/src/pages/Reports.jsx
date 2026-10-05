import React, { useState, useEffect, useMemo } from 'react';
import { cieApi } from '../services/cieApi';
import { reportApi } from '../services/reportApi';
import { useAcademicYear } from '../context/AcademicYearContext';
import {
  FileSpreadsheet,
  FileText,
  Layers,
  ShieldCheck,
  Users,
  Download,
  Calendar,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';

const Reports = () => {
  const { academicYears, selectedYear, setSelectedYear, createYear } = useAcademicYear();
  const [cies, setCies] = useState([]);
  const [selectedCycle, setSelectedCycle] = useState('odd'); // 'odd' | 'even'
  const [selectedCieNumber, setSelectedCieNumber] = useState('1'); // '1' | '2' | '3'
  const [selectedCieId, setSelectedCieId] = useState('');
  const [selectedSemesterId, setSelectedSemesterId] = useState(''); // '' means Combined / All in cycle
  const [reportData, setReportData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeSheet, setActiveSheet] = useState('sheet1'); // 'sheet1' | 'sheet2' | 'sheet3'

  // Fetch available CIE cycles on initial load and when academic year changes
  useEffect(() => {
    cieApi.getAll().then((res) => {
      const list = res.data || [];
      setCies(list);
    });
  }, [selectedYear]);

  // Compute Active CIE matching selectedYear and selectedCieNumber ('1', '2', '3')
  const activeCie = useMemo(() => {
    if (!cies.length) return null;
    const targetName = selectedCieNumber === '1' ? 'CIE-I' : selectedCieNumber === '2' ? 'CIE-II' : 'CIE-III';
    return (
      cies.find((c) => (c.academic_year || '').trim() === (selectedYear || '').trim() && c.name === targetName) ||
      cies.find((c) => (c.academic_year || '').trim() === (selectedYear || '').trim()) ||
      cies.find((c) => c.id.toString() === selectedCieId) ||
      cies[0]
    );
  }, [cies, selectedYear, selectedCieNumber, selectedCieId]);

  // Sync selectedCieId with activeCie
  useEffect(() => {
    if (activeCie && activeCie.id.toString() !== selectedCieId) {
      setSelectedCieId(activeCie.id.toString());
      setSelectedSemesterId('');
    }
  }, [activeCie]);

  // Handle Switching between CIE-1, CIE-2, CIE-3
  const handleCieNumberChange = (num) => {
    setSelectedCieNumber(num);
    setSelectedSemesterId('');
    const targetName = num === '1' ? 'CIE-I' : num === '2' ? 'CIE-II' : 'CIE-III';
    const matched = cies.find((c) => (c.academic_year || '').trim() === (selectedYear || '').trim() && c.name === targetName);
    if (matched) {
      setSelectedCieId(matched.id.toString());
    }
  };

  // Load report data whenever selected CIE or semester changes
  useEffect(() => {
    if (selectedCieId) {
      loadReport(selectedCieId, selectedSemesterId);
    }
  }, [selectedCieId, selectedSemesterId]);

  const loadReport = async (cieId, semId = '') => {
    setLoading(true);
    try {
      const res = await reportApi.getCieReportData(cieId, semId);
      setReportData(res.data);
    } catch (err) {
      console.error('Error loading report preview:', err);
    } finally {
      setLoading(false);
    }
  };

  const signatories = reportData?.signatories || {
    coordinator: { name: 'Mrs. Ankitha S', role: 'CIE Coordinator' },
    chairman_boe: { name: 'Dr. Swathi H Y', role: 'Chairman, BOE' },
    hod: { name: 'Dr. Arjun B C', role: 'HOD' }
  };

  const availableSemesters = reportData?.available_semesters || [];
  const selectedSemObj = availableSemesters.find((s) => s.id.toString() === selectedSemesterId.toString());
  
  // Clean active label for downloads
  const activeSemLabel = selectedSemObj
    ? selectedSemObj.name
    : availableSemesters.length > 0
      ? `Combined (${availableSemesters.map((s) => `${s.sem_number}th`).join(' & ')} Sem)`
      : 'All Semesters';

  const filteredSemesters = selectedSemesterId
    ? (reportData?.semesters_data || []).filter((s) => s.semester_id?.toString() === selectedSemesterId.toString())
    : reportData?.semesters_data || [];

  // Determine if 3rd semester is available in this CIE cycle (only in CIE-1 and CIE-2 of Odd Semester)
  const isSem3Available = selectedCycle === 'odd' && selectedCieNumber !== '3';

  return (
    <div className="space-y-5 font-sans">
      {/* ========================================================================= */}
      {/* 1. TOP HEADER & INSTANT EXPORT ACTIONS (Print option removed)             */}
      {/* ========================================================================= */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200 no-print">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
            CIE Examination Duty Circulars & Reports
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Official departmental exam circulars, invigilation duty rosters, squad duty allotments, and faculty sign-offs.
          </p>
        </div>

        {/* Export Actions: PDF Circular, Excel Sheet, Duty Slips (Print removed) */}
        <div className="flex items-center gap-2.5 shrink-0">
          <a
            href={reportApi.downloadPdfUrl(selectedCieId, selectedSemesterId)}
            onClick={(e) => { e.currentTarget.href = reportApi.downloadPdfUrl(selectedCieId, selectedSemesterId); }}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold shadow-xs transition-all cursor-pointer"
            target="_blank"
            rel="noreferrer"
            title={`Download official 3-page PDF circular for ${activeSemLabel}`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>PDF Circular</span>
          </a>

          <a
            href={reportApi.downloadExcelUrl(selectedCieId, selectedSemesterId)}
            onClick={(e) => { e.currentTarget.href = reportApi.downloadExcelUrl(selectedCieId, selectedSemesterId); }}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs transition-all cursor-pointer"
            target="_blank"
            rel="noreferrer"
            title={`Download multi-sheet Excel for ${activeSemLabel}`}
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>Excel Sheet</span>
          </a>

          <a
            href={reportApi.downloadDutySlipsPdfUrl(selectedCieId, selectedSemesterId)}
            onClick={(e) => { e.currentTarget.href = reportApi.downloadDutySlipsPdfUrl(selectedCieId, selectedSemesterId); }}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-xs transition-all cursor-pointer"
            target="_blank"
            rel="noreferrer"
            title={`Download faculty duty slips for ${activeSemLabel}`}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Duty Slips</span>
          </a>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. UNIFIED CONTROLS BAR: ACADEMIC YEAR, SEMESTER PARITY & CIE CYCLE       */}
      {/* ========================================================================= */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-3 sm:p-3.5 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-3 no-print">
        {/* Left Side: Academic Year (2026-27, 2027-28) & Semester Parity */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Academic Year Selector */}
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
              onClick={async () => {
                const newY = window.prompt('Enter new Academic Year (e.g. 2028-29):');
                if (newY && newY.trim()) {
                  await createYear(newY.trim());
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
          <div className="flex items-center gap-1 bg-slate-100/90 p-1 rounded-xl border border-slate-200 text-xs">
            <button
              onClick={() => setSelectedCycle('odd')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                selectedCycle === 'odd'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
            >
              <span>Odd Sem (3, 5, 7)</span>
            </button>

            <button
              onClick={() => setSelectedCycle('even')}
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
      {/* 3. SEMESTER FILTER TABS                                                   */}
      {/* ========================================================================= */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-3 sm:p-3.5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 no-print">
        {/* Semester Selection Tabs */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Combined Button */}
          <button
            onClick={() => setSelectedSemesterId('')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              selectedSemesterId === ''
                ? 'bg-slate-900 text-white shadow-xs'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            Combined (All Semesters)
          </button>

          {/* Individual Semester Buttons */}
          {availableSemesters.map((sem) => {
            const isSelected = selectedSemesterId === sem.id.toString();
            const isSem3 = sem.sem_number === 3;

            return (
              <button
                key={sem.id}
                onClick={() => setSelectedSemesterId(sem.id.toString())}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                  isSelected
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                <span>{sem.sem_number}th Sem</span>
                {isSem3 && (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono ${
                    isSelected ? 'bg-blue-800 text-white' : 'bg-amber-100 text-amber-800 border border-amber-200'
                  }`}>
                    2 CIEs Only
                  </span>
                )}
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono ${
                  isSelected ? 'bg-blue-700 text-white' : 'bg-slate-200 text-slate-700'
                }`}>
                  {sem.duty_count} Duties
                </span>
              </button>
            );
          })}

          {selectedCycle === 'odd' && selectedCieNumber === '3' && (
            <span className="text-[11px] text-amber-700 bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200 font-medium">
              Note: 3rd Semester has only 2 CIEs (CIE-1 & CIE-2).
            </span>
          )}
        </div>

        <div className="text-xs text-slate-500 font-medium">
          Viewing: <strong className="text-slate-800">{activeSemLabel}</strong>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 4. 3 CIRCULAR SHEET TABS (Sheet 1, Sheet 2, Sheet 3)                     */}
      {/* ========================================================================= */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2 no-print overflow-x-auto">
        <button
          onClick={() => setActiveSheet('sheet1')}
          className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
            activeSheet === 'sheet1'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>Sheet 1: Invigilation Duty Allotment</span>
        </button>

        <button
          onClick={() => setActiveSheet('sheet2')}
          className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
            activeSheet === 'sheet2'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
          }`}
        >
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>Sheet 2: Squad Duty Allotment</span>
        </button>

        <button
          onClick={() => setActiveSheet('sheet3')}
          className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
            activeSheet === 'sheet3'
              ? 'bg-blue-600 text-white shadow-xs'
              : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
          }`}
        >
          <Users className="w-3.5 h-3.5" />
          <span>Sheet 3: Faculty-wise Duty Allotment & Signatures</span>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* 5. AUTHENTIC PRINTABLE DOCUMENT CONTAINER                                 */}
      {/* Exact replica of the official 3-page MCE circular, without web clutter    */}
      {/* ========================================================================= */}
      <div className="bg-white rounded-2xl border border-slate-200/90 p-6 sm:p-10 shadow-sm print:p-0 print:border-none print:shadow-none print:rounded-none max-w-4xl mx-auto font-sans text-slate-900">
        {loading ? (
          <div className="py-24 text-center text-xs text-slate-400">Loading circular sheet...</div>
        ) : (
          <div>
            {/* ========================================================================= */}
            {/* SHEET 1: INVIGILATION DUTY ALLOTMENT                                      */}
            {/* ========================================================================= */}
            {activeSheet === 'sheet1' && (
              <div className="space-y-4">
                {/* Official College Header with Left Crest & Right AIML Logo */}
                <div className="flex items-start justify-between pb-1 mb-2">
                  <img
                    src="/mce_crest.png"
                    alt="MCE Crest"
                    className="w-16 h-14 object-contain self-start mt-0.5"
                  />
                  <div className="text-center flex-1 px-3">
                    <h1 className="text-base sm:text-lg font-bold text-slate-900 font-serif tracking-wide leading-tight">
                      Malnad College of Engineering, Hassan
                    </h1>
                    <h2 className="text-xs sm:text-sm font-bold text-slate-900 tracking-wide mt-1">
                      Department of Computer Science & Engineering
                    </h2>
                    <h3 className="text-[11px] sm:text-xs font-bold text-slate-800">
                      (Artificial Intelligence & Machine Learning)
                    </h3>
                    <div className="mt-1 font-bold text-xs sm:text-sm text-slate-900">
                      {reportData?.cie?.name || `CIE-${selectedCieNumber}`}
                    </div>
                    <div className="font-bold text-xs sm:text-sm text-slate-900">
                      Invigilation Duty Allotment {reportData?.academic_year_term || `(AY ${reportData?.academic_year || selectedYear}) ${selectedCycle === 'even' ? 'Even' : 'Odd'}`}
                    </div>
                  </div>
                  <img
                    src="/aiml_logo.png"
                    alt="AIML Logo"
                    className="w-16 h-14 object-contain self-start mt-0.5"
                  />
                </div>

                {/* Tables Grouped by Semester */}
                <div className="space-y-5">
                  {filteredSemesters.map((sem, sIdx) => {
                    const invigDates = sem.invigilation_dates || [];
                    if (invigDates.length === 0) return null;

                    return (
                      <div key={sem.semester_id || sIdx} className="space-y-1.5">
                        <div className="text-center font-bold text-sm text-slate-900 font-serif my-2 tracking-wide">
                          {sem.semester_name}
                        </div>

                        <table className="w-full border-collapse border border-slate-900 text-xs">
                          <thead>
                            <tr className="bg-slate-100 border-b border-slate-900 font-bold text-slate-900 text-center">
                              <th className="py-1.5 px-3 border border-slate-900 w-28">Date</th>
                              <th className="py-1.5 px-3 border border-slate-900 w-44">Time</th>
                              <th className="py-1.5 px-3 border border-slate-900 w-28">Course Code</th>
                              <th className="py-1.5 px-3 border border-slate-900 w-24">Room No.</th>
                              <th className="py-1.5 px-3 border border-slate-900 w-28">Faculty</th>
                            </tr>
                          </thead>
                          <tbody>
                            {invigDates.map((dateObj, dIdx) => {
                              let isFirstRowOfDate = true;

                              return (
                                <React.Fragment key={dateObj.date || dIdx}>
                                  {dateObj.sessions.map((sess, sessIdx) => {
                                    return (
                                      <React.Fragment key={sess.id || sessIdx}>
                                        {sess.rooms.map((room, rIdx) => {
                                          const renderDateCell = isFirstRowOfDate;
                                          const renderSessionCells = rIdx === 0;
                                          if (isFirstRowOfDate) isFirstRowOfDate = false;

                                          return (
                                            <tr key={`${sess.id}-${room.room_no}-${rIdx}`} className="hover:bg-slate-50/50">
                                              {renderDateCell && (
                                                <td
                                                  rowSpan={dateObj.total_rows}
                                                  className="py-1.5 px-2 border border-slate-900 text-center font-semibold align-middle bg-white"
                                                >
                                                  <div>{dateObj.date}</div>
                                                  <div className="text-[11px] text-slate-600 font-normal">{dateObj.day}</div>
                                                </td>
                                              )}
                                              {renderSessionCells && (
                                                <>
                                                  <td
                                                    rowSpan={sess.rooms.length}
                                                    className="py-1.5 px-2 border border-slate-900 text-center font-mono text-[11px] align-middle bg-white"
                                                  >
                                                    {sess.time}
                                                  </td>
                                                  <td
                                                    rowSpan={sess.rooms.length}
                                                    className="py-1.5 px-2 border border-slate-900 text-center font-bold font-mono align-middle bg-white"
                                                  >
                                                    {sess.course_code}
                                                  </td>
                                                </>
                                              )}
                                              <td className="py-1.5 px-2 border border-slate-900 text-center font-bold font-mono">
                                                {room.room_no}
                                              </td>
                                              <td
                                                className="py-1.5 px-2 border border-slate-900 text-center font-bold"
                                                title={room.faculty_name}
                                              >
                                                {room.faculty}
                                              </td>
                                            </tr>
                                          );
                                        })}
                                      </React.Fragment>
                                    );
                                  })}
                                </React.Fragment>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    );
                  })}
                </div>

                {/* 3 Official Signatories */}
                <div className="pt-8 pb-2 grid grid-cols-3 text-center text-xs font-bold text-slate-900">
                  <div>
                    <div className="font-serif italic text-sm mb-0.5">({signatories.coordinator.name})</div>
                    <div className="font-bold text-[11px] uppercase tracking-wider text-slate-900">
                      {signatories.coordinator.role}
                    </div>
                  </div>
                  <div>
                    <div className="font-serif italic text-sm mb-0.5">({signatories.chairman_boe.name})</div>
                    <div className="font-bold text-[11px] uppercase tracking-wider text-slate-900">
                      {signatories.chairman_boe.role}
                    </div>
                  </div>
                  <div>
                    <div className="font-serif italic text-sm mb-0.5">({signatories.hod.name})</div>
                    <div className="font-bold text-[11px] uppercase tracking-wider text-slate-900">
                      {signatories.hod.role}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ========================================================================= */}
            {/* SHEET 2: SQUAD DUTY ALLOTMENT                                             */}
            {/* ========================================================================= */}
            {activeSheet === 'sheet2' && (
              <div className="space-y-4">
                <div className="flex items-start justify-between pb-1 mb-2">
                  <img
                    src="/mce_crest.png"
                    alt="MCE Crest"
                    className="w-16 h-14 object-contain self-start mt-0.5"
                  />
                  <div className="text-center flex-1 px-3">
                    <h1 className="text-base sm:text-lg font-bold text-slate-900 font-serif tracking-wide leading-tight">
                      Malnad College of Engineering, Hassan
                    </h1>
                    <h2 className="text-xs sm:text-sm font-bold text-slate-900 tracking-wide mt-1">
                      Department of Computer Science & Engineering
                    </h2>
                    <h3 className="text-[11px] sm:text-xs font-bold text-slate-800">
                      (Artificial Intelligence & Machine Learning)
                    </h3>
                    <div className="mt-1 font-bold text-xs sm:text-sm text-slate-900">
                      {reportData?.cie?.name || `CIE-${selectedCieNumber}`}
                    </div>
                    <div className="font-bold text-xs sm:text-sm text-slate-900">
                      Squad Duty Allotment {reportData?.academic_year_term || `(AY ${reportData?.academic_year || selectedYear}) ${selectedCycle === 'even' ? 'Even' : 'Odd'}`}
                    </div>
                  </div>
                  <img
                    src="/aiml_logo.png"
                    alt="AIML Logo"
                    className="w-16 h-14 object-contain self-start mt-0.5"
                  />
                </div>

                <div className="space-y-5">
                  {filteredSemesters.map((sem, sIdx) => {
                    const squadDates = sem.squad_dates || [];
                    if (squadDates.length === 0) return null;

                    return (
                      <div key={sem.semester_id || sIdx} className="space-y-1.5">
                        <div className="text-center font-bold text-sm text-slate-900 font-serif my-2 tracking-wide">
                          {sem.semester_name}
                        </div>

                        <table className="w-full border-collapse border border-slate-900 text-xs">
                          <thead>
                            <tr className="bg-slate-100 border-b border-slate-900 font-bold text-slate-900 text-center">
                              <th className="py-1.5 px-3 border border-slate-900 w-28">Date</th>
                              <th className="py-1.5 px-3 border border-slate-900 w-44">Time</th>
                              <th className="py-1.5 px-3 border border-slate-900 w-28">Course Code</th>
                              <th className="py-1.5 px-3 border border-slate-900 w-24">Room No.</th>
                              <th className="py-1.5 px-3 border border-slate-900 w-28">Faculty</th>
                            </tr>
                          </thead>
                          <tbody>
                            {squadDates.map((dateObj, dIdx) => {
                              let isFirstRowOfDate = true;
                              return (
                                <React.Fragment key={dateObj.date || dIdx}>
                                  {dateObj.sessions.map((sess, sessIdx) => {
                                    const rooms = sess.rooms && sess.rooms.length > 0 ? sess.rooms : [{ room_no: sess.room_no || 'AI301' }];
                                    return (
                                      <React.Fragment key={sess.id || sessIdx}>
                                        {rooms.map((room, rIdx) => {
                                          const renderDateCell = isFirstRowOfDate;
                                          const renderSessionCells = rIdx === 0;
                                          if (isFirstRowOfDate) isFirstRowOfDate = false;

                                          return (
                                            <tr key={`${sess.id}-${room.room_no}-${rIdx}`} className="hover:bg-slate-50/50">
                                              {renderDateCell && (
                                                <td
                                                  rowSpan={dateObj.total_rows || dateObj.sessions.length}
                                                  className="py-1.5 px-2 border border-slate-900 text-center font-semibold align-middle bg-white"
                                                >
                                                  <div>{dateObj.date}</div>
                                                  <div className="text-[11px] text-slate-600 font-normal">{dateObj.day}</div>
                                                </td>
                                              )}
                                              {renderSessionCells && (
                                                <>
                                                  <td
                                                    rowSpan={rooms.length}
                                                    className="py-1.5 px-2 border border-slate-900 text-center font-mono text-[11px] align-middle bg-white"
                                                  >
                                                    {sess.time}
                                                  </td>
                                                  <td
                                                    rowSpan={rooms.length}
                                                    className="py-1.5 px-2 border border-slate-900 text-center font-bold font-mono align-middle bg-white"
                                                  >
                                                    {sess.course_code}
                                                  </td>
                                                </>
                                              )}
                                              <td className="py-1.5 px-2 border border-slate-900 text-center font-bold font-mono">
                                                {room.room_no}
                                              </td>
                                              {renderSessionCells && (
                                                <td
                                                  rowSpan={rooms.length}
                                                  className="py-1.5 px-2 border border-slate-900 text-center font-bold align-middle bg-white"
                                                >
                                                  {sess.faculty}
                                                </td>
                                              )}
                                            </tr>
                                          );
                                        })}
                                      </React.Fragment>
                                    );
                                  })}
                                </React.Fragment>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    );
                  })}
                </div>

                {/* 3 Official Signatories */}
                <div className="pt-8 pb-2 grid grid-cols-3 text-center text-xs font-bold text-slate-900">
                  <div>
                    <div className="font-serif italic text-sm mb-0.5">({signatories.coordinator.name})</div>
                    <div className="font-bold text-[11px] uppercase tracking-wider text-slate-900">
                      {signatories.coordinator.role}
                    </div>
                  </div>
                  <div>
                    <div className="font-serif italic text-sm mb-0.5">({signatories.chairman_boe.name})</div>
                    <div className="font-bold text-[11px] uppercase tracking-wider text-slate-900">
                      {signatories.chairman_boe.role}
                    </div>
                  </div>
                  <div>
                    <div className="font-serif italic text-sm mb-0.5">({signatories.hod.name})</div>
                    <div className="font-bold text-[11px] uppercase tracking-wider text-slate-900">
                      {signatories.hod.role}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ========================================================================= */}
            {/* SHEET 3: FACULTY-WISE DUTY ALLOTMENT & SIGN-OFF                           */}
            {/* ========================================================================= */}
            {activeSheet === 'sheet3' && (
              <div className="space-y-4">
                <div className="flex items-start justify-between pb-1 mb-2">
                  <img
                    src="/mce_crest.png"
                    alt="MCE Crest"
                    className="w-16 h-14 object-contain self-start mt-0.5"
                  />
                  <div className="text-center flex-1 px-3">
                    <h1 className="text-base sm:text-lg font-bold text-slate-900 font-serif tracking-wide leading-tight">
                      Malnad College of Engineering, Hassan
                    </h1>
                    <h2 className="text-xs sm:text-sm font-bold text-slate-900 tracking-wide mt-1">
                      Department of Computer Science & Engineering
                    </h2>
                    <h3 className="text-[11px] sm:text-xs font-bold text-slate-800">
                      (Artificial Intelligence & Machine Learning)
                    </h3>
                    <div className="mt-1 font-bold text-xs sm:text-sm text-slate-900">
                      {reportData?.cie?.name || `CIE-${selectedCieNumber}`} Duty Allotment
                    </div>
                  </div>
                  <img
                    src="/aiml_logo.png"
                    alt="AIML Logo"
                    className="w-16 h-14 object-contain self-start mt-0.5"
                  />
                </div>

                {/* Faculty-wise Roster Table */}
                <table className="w-full border-collapse border border-slate-900 text-xs text-left">
                  <thead>
                    <tr className="bg-slate-100 border-b border-slate-900 font-bold text-slate-900 text-center">
                      <th className="py-1.5 px-2 border border-slate-900 w-14">Sl No.</th>
                      <th className="py-1.5 px-3 border border-slate-900 w-52 text-left">Name of the Faculty</th>
                      <th className="py-1.5 px-3 border border-slate-900 w-28">Date</th>
                      <th className="py-1.5 px-3 border border-slate-900 w-48">Time</th>
                      <th className="py-1.5 px-3 border border-slate-900 w-24">Duty</th>
                      <th className="py-1.5 px-3 border border-slate-900 w-28">Signature</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(reportData?.faculty_wise_allotment || []).map((fac) => {
                      const facultyDuties = fac.duties || [];
                      if (facultyDuties.length === 0) return null;

                      return (
                        <React.Fragment key={fac.faculty_id}>
                          {facultyDuties.map((d, dIdx) => (
                            <tr key={`${fac.faculty_id}-${dIdx}`} className="hover:bg-slate-50/50">
                              {dIdx === 0 && (
                                <>
                                  <td
                                    rowSpan={facultyDuties.length}
                                    className="py-1.5 px-2 border border-slate-900 text-center font-bold align-middle bg-white"
                                  >
                                    {fac.sl_no}.
                                  </td>
                                  <td
                                    rowSpan={facultyDuties.length}
                                    className="py-1.5 px-3 border border-slate-900 font-bold text-slate-900 align-middle bg-white"
                                  >
                                    {fac.faculty_name}
                                  </td>
                                </>
                              )}
                              <td className="py-1.5 px-3 border border-slate-900 text-center font-medium">{d.date}</td>
                              <td className="py-1.5 px-3 border border-slate-900 text-center font-mono text-[11px] whitespace-pre-line leading-relaxed">
                                {d.time}
                              </td>
                              {(d.is_duty_first || d.is_duty_first === undefined) && (
                                <td
                                  rowSpan={d.duty_rowspan || 1}
                                  className="py-1.5 px-3 border border-slate-900 text-center font-semibold align-middle bg-white"
                                >
                                  {d.duty}
                                </td>
                              )}
                              {dIdx === 0 && (
                                <td
                                  rowSpan={facultyDuties.length}
                                  className="py-1.5 px-3 border border-slate-900 align-middle bg-white"
                                >
                                  <div className="h-8 w-full border-b border-dashed border-slate-300"></div>
                                </td>
                              )}
                            </tr>
                          ))}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>

                {/* 3 Official Signatories */}
                <div className="pt-8 pb-2 grid grid-cols-3 text-center text-xs font-bold text-slate-900">
                  <div>
                    <div className="font-serif italic text-sm mb-0.5">({signatories.coordinator.name})</div>
                    <div className="font-bold text-[11px] uppercase tracking-wider text-slate-900">
                      {signatories.coordinator.role}
                    </div>
                  </div>
                  <div>
                    <div className="font-serif italic text-sm mb-0.5">({signatories.chairman_boe.name})</div>
                    <div className="font-bold text-[11px] uppercase tracking-wider text-slate-900">
                      {signatories.chairman_boe.role}
                    </div>
                  </div>
                  <div>
                    <div className="font-serif italic text-sm mb-0.5">({signatories.hod.name})</div>
                    <div className="font-bold text-[11px] uppercase tracking-wider text-slate-900">
                      {signatories.hod.role}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default Reports;
