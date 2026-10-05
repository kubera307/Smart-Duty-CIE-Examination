import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { cieApi } from '../services/cieApi';
import { academicApi } from '../services/academicApi';
import { facultyApi } from '../services/facultyApi';
import { allocationApi } from '../services/allocationApi';
import LoadingStages from '../components/common/LoadingStages';
import Badge from '../components/common/Badge';
import {
  Cpu,
  Calendar,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  ShieldCheck,
  UserX,
  Layers,
  Sparkles,
  Filter
} from 'lucide-react';

const GenerateAllocation = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [cies, setCies] = useState([]);
  const [selectedCieId, setSelectedCieId] = useState('');
  const [semesters, setSemesters] = useState([]);
  const [selectedSemesterIds, setSelectedSemesterIds] = useState([]);
  const [preview, setPreview] = useState(null);
  const [loadingPreview, setLoadingPreview] = useState(true);

  // Faculty Duty Quotas & Seniority Protection
  const [quotaRawText, setQuotaRawText] = useState('swathi-1, ankitha-3, sushma-4, megha-4, maseeha-5, shithal-4');
  const [quotaMap, setQuotaMap] = useState({});
  const [facultyQuotaList, setFacultyQuotaList] = useState([]);
  const [quotaFeedback, setQuotaFeedback] = useState(null);

  // Engine execution state
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentStage, setCurrentStage] = useState(0);
  const [generationResult, setGenerationResult] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    Promise.all([cieApi.getAll(), academicApi.getSemesters()]).then(([cRes, sRes]) => {
      setCies(cRes.data || []);
      setSemesters(sRes.data || []);
      const urlCie = searchParams.get('cie_id');
      if (urlCie) {
        setSelectedCieId(urlCie);
      } else if (cRes.data?.length > 0) {
        const active = cRes.data.find((c) => c.is_current) || cRes.data[0];
        setSelectedCieId(active.id);
      }
    });
    loadDutyQuotas();
  }, []);

  const loadDutyQuotas = async () => {
    try {
      const res = await facultyApi.getDutyQuotas();
      if (res.data) {
        setFacultyQuotaList(res.data.quotas || []);
        if (res.data.raw_text) setQuotaRawText(res.data.raw_text);
        const map = {};
        (res.data.quotas || []).forEach((q) => {
          map[q.faculty_id] = q.quota;
        });
        setQuotaMap(map);
      }
    } catch (e) {
      console.error('Failed to load duty quotas in generator:', e);
    }
  };

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
          map[matched.faculty_id || matched.id] = count;
        }
      }
    });
    return map;
  };

  const handleApplyQuotaRawText = (textToApply) => {
    const text = textToApply !== undefined ? textToApply : quotaRawText;
    const parsed = parseQuotaStringClient(text, facultyQuotaList);
    if (Object.keys(parsed).length === 0) {
      alert('Could not parse any faculty quotas from text. Format example: swathi-1, ankitha-3, sushma-4');
      return;
    }
    setQuotaMap((prev) => ({ ...prev, ...parsed }));
    setQuotaRawText(text);
    setQuotaFeedback(`Applied quotas for ${Object.keys(parsed).length} faculty members.`);
    setTimeout(() => setQuotaFeedback(null), 3500);
  };

  const handleQuotaInputChange = (facId, val) => {
    const num = Math.max(0, parseInt(val, 10) || 0);
    const newMap = { ...quotaMap, [facId]: num };
    setQuotaMap(newMap);
    const parts = [];
    facultyQuotaList.forEach((f) => {
      const fId = f.faculty_id || f.id;
      const isSquad = f.is_squad_only || f.only_squad_duty || fId === 1 || f.name?.includes('Arjun');
      if (!isSquad && f.eligible_for_duty) {
        const q = newMap[fId] !== undefined ? newMap[fId] : (f.quota !== undefined ? f.quota : 5);
        const short = f.name.replace('Dr. ', '').replace('Mrs. ', '').replace('Mr. ', '').replace('Ms. ', '').split(' ')[0].toLowerCase();
        parts.push(`${short}-${q}`);
      }
    });
    setQuotaRawText(parts.join(', '));
  };

  useEffect(() => {
    if (selectedCieId) {
      const singleSem = selectedSemesterIds.length === 1 ? selectedSemesterIds[0] : null;
      const multiSems = selectedSemesterIds.length > 1 ? selectedSemesterIds : null;
      loadPreview(selectedCieId, singleSem, multiSems);
    }
  }, [selectedCieId, selectedSemesterIds]);

  const loadPreview = async (cieId, semId = null, semIds = null) => {
    setLoadingPreview(true);
    setError(null);
    try {
      const res = await allocationApi.getPreview(cieId, semId, semIds);
      setPreview(res.data);
    } catch (err) {
      setError('Unable to load pre-allocation diagnostics.');
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleRunAllocation = async () => {
    setIsGenerating(true);
    setCurrentStage(0);
    setError(null);
    setGenerationResult(null);

    // Persist duty quotas before running allocation so solver strictly honors entered limits
    try {
      await facultyApi.saveDutyQuotas({ raw_text: quotaRawText, quotas: quotaMap });
    } catch (qErr) {
      console.warn('Could not persist duty quotas before allocation:', qErr);
    }

    // Track progress stages
    const stageInterval = setInterval(() => {
      setCurrentStage((prev) => (prev < 5 ? prev + 1 : prev));
    }, 350);

    try {
      const singleSem = selectedSemesterIds.length === 1 ? selectedSemesterIds[0] : null;
      const multiSems = selectedSemesterIds.length > 1 ? selectedSemesterIds : null;
      const res = await allocationApi.generate(selectedCieId, singleSem, multiSems);
      clearInterval(stageInterval);
      setCurrentStage(6); // Complete
      setGenerationResult(res.data);
      // Reload preview to update counts
      loadPreview(selectedCieId, singleSem, multiSems);
      loadDutyQuotas();
    } catch (err) {
      clearInterval(stageInterval);
      setError(err.response?.data?.error || err.message || 'Allocation process encountered an error.');
    } finally {
      setIsGenerating(false);
    }
  };

  const sem5 = semesters.find((s) => s.sem_number === 5);
  const sem7 = semesters.find((s) => s.sem_number === 7);

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="border-b border-slate-200/80 pb-5">
        <div className="flex items-center gap-2 text-xs font-semibold text-sky-600 uppercase tracking-wider mb-1">
          <Sparkles className="w-4 h-4" />
          <span>Constraint Satisfaction & Workload Optimization Engine</span>
        </div>
        <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Generate Examination Duty Allocation</h2>
        <p className="text-xs text-slate-500 mt-0.5">
          Execute fair, conflict-free faculty invigilation assignments with automated 1-hour buffer protection
        </p>
      </div>

      {/* Scope Controls Bar: CIE Cycle & Target Semesters */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-sm space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* CIE Selection */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              Select CIE Examination Cycle:
            </label>
            <select
              value={selectedCieId}
              onChange={(e) => setSelectedCieId(e.target.value)}
              disabled={isGenerating}
              className="w-full bg-slate-50 border border-slate-200 text-xs rounded-xl px-3 py-2.5 text-slate-800 font-semibold focus:outline-none focus:ring-1 focus:ring-sky-500"
            >
              {cies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.academic_year}) {c.is_current ? '• Active Cycle' : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Target Semesters Preset Buttons */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center justify-between">
              <span>Quick Semester Presets:</span>
              <span className="text-emerald-700 font-medium text-[11px]">Selective Allocation Supported</span>
            </label>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => setSelectedSemesterIds([])}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                  selectedSemesterIds.length === 0
                    ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                All Semesters (Full CIE)
              </button>
              <button
                type="button"
                onClick={() => {
                  const odd = semesters.filter(s => [3, 5, 7].includes(s.sem_number)).map(s => s.id);
                  setSelectedSemesterIds(odd);
                }}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                  selectedSemesterIds.length > 0 && selectedSemesterIds.every(id => {
                    const s = semesters.find(x => x.id === id);
                    return [3, 5, 7].includes(s?.sem_number);
                  }) && selectedSemesterIds.length === semesters.filter(s => [3, 5, 7].includes(s.sem_number)).length
                    ? 'bg-sky-600 text-white border-sky-600 shadow-sm'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                Odd Semesters (3, 5, 7)
              </button>
              <button
                type="button"
                onClick={() => {
                  const senior = semesters.filter(s => [5, 7].includes(s.sem_number)).map(s => s.id);
                  setSelectedSemesterIds(senior);
                }}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                  selectedSemesterIds.length === 2 && selectedSemesterIds.every(id => {
                    const s = semesters.find(x => x.id === id);
                    return [5, 7].includes(s?.sem_number);
                  })
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                Senior Only (5th & 7th)
              </button>
              <button
                type="button"
                onClick={() => {
                  const even = semesters.filter(s => [4, 6].includes(s.sem_number)).map(s => s.id);
                  setSelectedSemesterIds(even);
                }}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                  selectedSemesterIds.length > 0 && selectedSemesterIds.every(id => {
                    const s = semesters.find(x => x.id === id);
                    return [4, 6].includes(s?.sem_number);
                  }) && selectedSemesterIds.length === semesters.filter(s => [4, 6].includes(s.sem_number)).length
                    ? 'bg-purple-600 text-white border-purple-600 shadow-sm'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                Even Semesters (4, 6)
              </button>
            </div>
          </div>
        </div>

        {/* Individual Semester Checkbox Badges */}
        <div className="pt-2 border-t border-slate-100">
          <div className="text-[11px] font-bold text-slate-600 mb-1.5">
            Or Customize Specific Semesters to Allocate:
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {semesters.map((s) => {
              const isChecked = selectedSemesterIds.includes(s.id);
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
                    if (isChecked) {
                      setSelectedSemesterIds(prev => prev.filter(id => id !== s.id));
                    } else {
                      setSelectedSemesterIds(prev => [...prev, s.id]);
                    }
                  }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all border ${
                    isChecked
                      ? 'bg-blue-50 text-blue-700 border-blue-300 ring-1 ring-blue-200 shadow-2xs'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <span className={`w-3.5 h-3.5 rounded flex items-center justify-center text-[10px] ${
                    isChecked ? 'bg-blue-600 text-white' : 'border border-slate-300'
                  }`}>
                    {isChecked ? '✓' : ''}
                  </span>
                  <span>{s.name} ({s.sem_number}th Sem)</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Dynamic Semester Logic Note */}
        <div className="p-3 bg-sky-50/70 border border-sky-200/80 rounded-xl text-xs text-sky-900 flex items-start gap-2">
          <ShieldCheck className="w-4 h-4 text-sky-600 shrink-0 mt-0.5" />
          <div className="leading-relaxed text-[11px]">
            <strong>Semester Isolation Guarantee:</strong> When generating duties for selected semesters, 
            the duties for any non-selected semesters remain completely untouched. 
            Automated <strong>60-minute pre- and post-lecture buffer protection</strong> is enforced across regular teaching slots.
          </div>
        </div>
      </div>

      {/* Pre-Allocation Diagnostic Card */}
      <div className="bg-white rounded-2xl border border-slate-200/90 p-6 shadow-sm space-y-5">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <Cpu className="w-4 h-4 text-sky-600" />
            <h3 className="text-sm font-bold text-slate-800">Pre-Flight Constraint Diagnostics</h3>
          </div>
          {preview?.target_semester ? (
            <Badge variant="brand">{preview.target_semester.name} Only</Badge>
          ) : (
            <Badge variant="indigo">All Active Semesters</Badge>
          )}
        </div>

        {loadingPreview ? (
          <div className="py-8 text-center text-xs text-slate-400">Auditing constraints...</div>
        ) : preview ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100 text-center">
                <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
                  Exam Sessions
                </span>
                <span className="text-xl font-bold text-slate-800 font-mono">
                  {preview.total_sessions || 0}
                </span>
              </div>
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100 text-center">
                <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
                  Required Duties
                </span>
                <span className="text-xl font-bold text-sky-700 font-mono">
                  {preview.total_required_duties || 0}
                </span>
              </div>
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100 text-center">
                <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
                  Eligible Faculty
                </span>
                <span className="text-xl font-bold text-emerald-600 font-mono">
                  {preview.eligible_faculty_count || 0}
                </span>
              </div>
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100 text-center">
                <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
                  Buffer Protection
                </span>
                <span className="text-xl font-bold text-indigo-700 font-mono">
                  {preview.buffer_minutes || 60}m
                </span>
              </div>
            </div>

            {/* Excluded Faculty Notification */}
            {preview.excluded_faculty_count > 0 && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs flex items-center justify-between">
                <div className="flex items-center gap-2 text-rose-800">
                  <UserX className="w-4 h-4 text-rose-600" />
                  <span>
                    <strong>{preview.excluded_faculty_count} faculty member(s) excluded:</strong>{' '}
                    {preview.excluded_faculty_names?.join(', ')}
                  </span>
                </div>
                <Badge variant="danger">EXCLUDED FROM DUTY</Badge>
              </div>
            )}
          </div>
        ) : null}

        {/* Execution Error Banner */}
        {error && (
          <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <div className="leading-relaxed">
              <strong>Execution Failed:</strong> {error}
            </div>
          </div>
        )}

        {/* Execution Stages Animation */}
        {isGenerating && (
          <div className="pt-2">
            <LoadingStages currentStage={currentStage} />
          </div>
        )}

        {/* Faculty Duty Quota Entry Card (Seniority Protection) */}
        {!isGenerating && !generationResult && (
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 font-bold text-slate-800 text-xs">
                <ShieldCheck className="w-4 h-4 text-indigo-600" />
                <span>Faculty Duty Quotas (Senior Faculty Protection):</span>
              </div>
              <span className="text-[10px] text-slate-500">
                (e.g. Swathi: 1, Ankitha: 3)
              </span>
            </div>

            {/* Faculty Quota Grid / Inputs */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-48 overflow-y-auto pr-1">
              {facultyQuotaList.filter(f => !f.is_squad_only && !f.only_squad_duty && (f.faculty_id || f.id) !== 1 && !f.name?.includes('Arjun') && f.eligible_for_duty).map((f) => {
                const facId = f.faculty_id || f.id;
                const isSenior = f.is_senior || f.designation?.includes('Associate') || f.designation?.includes('Professor') || f.name?.includes('Swathi');
                const curVal = quotaMap[facId] !== undefined ? quotaMap[facId] : (f.quota !== undefined ? f.quota : 5);

                return (
                  <div key={facId} className={`p-2 rounded-lg border bg-white flex items-center justify-between gap-2 shadow-2xs ${isSenior ? 'border-purple-300 ring-1 ring-purple-100' : 'border-slate-200'}`}>
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-slate-900 text-xs truncate flex items-center gap-1">
                        <span>{f.name}</span>
                        {isSenior && (
                          <span className="px-1 py-0.2 bg-purple-100 text-purple-800 text-[9px] font-bold rounded">
                            Senior
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-slate-500 truncate">{f.designation || 'Faculty'}</div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <span className="text-[10px] text-slate-400 font-medium">Duties:</span>
                      <input
                        type="number"
                        min="0"
                        max="20"
                        value={curVal}
                        onChange={(e) => handleQuotaInputChange(facId, e.target.value)}
                        className="w-12 bg-slate-50 border border-slate-300 rounded px-1.5 py-0.5 text-center font-bold text-xs text-slate-900 focus:outline-none focus:border-purple-500"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="text-[10px] text-purple-900 font-semibold flex items-center justify-between pt-1 border-t border-purple-100">
              <span>🛡️ Dr. Arjun B C (HOD): Squad Duty Only</span>
              <span>Configured Invigilation Quotas: <strong>{Object.entries(quotaMap).filter(([fid]) => parseInt(fid) !== 1).reduce((a, [, b]) => a + (parseInt(b) || 0), 0) || 21} Duties</strong></span>
            </div>
          </div>
        )}

        {/* Run Button */}
        {!isGenerating && !generationResult && (
          <div className="pt-2">
            <button
              onClick={handleRunAllocation}
              disabled={loadingPreview || (preview?.total_required_duties === 0)}
              className="w-full py-3.5 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-sm font-bold shadow-md shadow-indigo-500/20 transition-all flex items-center justify-center gap-2"
            >
              <Cpu className="w-4 h-4" />
              <span>
                Run Optimization Solver{' '}
                {selectedSemesterIds.length === 0
                  ? 'for All Semesters'
                  : selectedSemesterIds.length === 1
                  ? `for ${semesters.find((s) => s.id === selectedSemesterIds[0])?.name || 'Selected Semester'}`
                  : `for ${selectedSemesterIds.length} Selected Semesters`}
              </span>
            </button>
          </div>
        )}

        {/* Post-Execution Success Summary */}
        {generationResult && (
          <div className="p-5 rounded-xl bg-emerald-50 border border-emerald-200 space-y-3 animate-in fade-in">
            <div className="flex items-center gap-2 text-emerald-800 font-bold text-sm">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              <span>Allocation Completed Successfully!</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="bg-white p-2.5 rounded-lg border border-emerald-100">
                <span className="text-slate-500 block">Total Allocated:</span>
                <span className="font-bold text-emerald-700 text-sm font-mono">
                  {generationResult.stats?.total_allocated}
                </span>
              </div>
              <div className="bg-white p-2.5 rounded-lg border border-emerald-100">
                <span className="text-slate-500 block">Execution Time:</span>
                <span className="font-bold text-slate-800 text-sm font-mono">
                  {generationResult.stats?.execution_time_ms} ms
                </span>
              </div>
              <div className="bg-white p-2.5 rounded-lg border border-emerald-100">
                <span className="text-slate-500 block">Timetable Conflicts:</span>
                <span className="font-bold text-emerald-700 text-sm font-mono">0</span>
              </div>
              <div className="bg-white p-2.5 rounded-lg border border-emerald-100">
                <span className="text-slate-500 block">Unassigned Duties:</span>
                <span className="font-bold text-emerald-700 text-sm font-mono">0</span>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => navigate('/schedule')}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-sm"
              >
                <span>View Exam Schedule & Duties</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default GenerateAllocation;
