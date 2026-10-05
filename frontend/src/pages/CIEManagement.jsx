import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { cieApi } from '../services/cieApi';
import { useAcademicYear } from '../context/AcademicYearContext';
import Badge from '../components/common/Badge';
import { Calendar, CalendarCheck2, Cpu, Plus, Sparkles } from 'lucide-react';

const CIEManagement = () => {
  const navigate = useNavigate();
  const { academicYears, selectedYear, setSelectedYear, createYear } = useAcademicYear();
  const [cies, setCies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeYearFilter, setActiveYearFilter] = useState('all'); // 'all' or specific year like '2026-27'
  const [isCreatingYear, setIsCreatingYear] = useState(false);

  useEffect(() => {
    loadCies();
  }, [selectedYear]);

  const loadCies = async () => {
    setLoading(true);
    try {
      const res = await cieApi.getAll();
      setCies(res.data || []);
    } catch (err) {
      console.error('Error fetching CIEs:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddNewYear = async () => {
    const newY = window.prompt('Enter new Academic Year cycle (e.g. 2027-28 or 2027-2028):');
    if (!newY || !newY.trim()) return;
    try {
      setIsCreatingYear(true);
      await createYear(newY.trim());
      await loadCies();
      setActiveYearFilter(newY.trim());
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to create academic year');
    } finally {
      setIsCreatingYear(false);
    }
  };

  // Group CIEs by academic_year
  const groupedCies = useMemo(() => {
    const groups = {};
    cies.forEach((cie) => {
      const yr = cie.academic_year || 'Unassigned';
      if (!groups[yr]) groups[yr] = [];
      groups[yr].push(cie);
    });

    // Sort CIEs within each group by start_date or name
    Object.keys(groups).forEach((yr) => {
      groups[yr].sort((a, b) => a.name.localeCompare(b.name));
    });

    return groups;
  }, [cies]);

  const displayYears = useMemo(() => {
    if (activeYearFilter === 'all') {
      return Object.keys(groupedCies).sort().reverse();
    }
    return groupedCies[activeYearFilter] ? [activeYearFilter] : [];
  }, [groupedCies, activeYearFilter]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200/80 pb-5">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">CIE Academic Year Cycles</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Manage Continuous Internal Evaluation phases, examination dates, and duty requirements per academic year
          </p>
        </div>

        {/* Action: Add Academic Year */}
        <button
          onClick={handleAddNewYear}
          disabled={isCreatingYear}
          className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl text-xs font-bold shadow-xs transition-all cursor-pointer disabled:opacity-50"
        >
          <Plus className="w-4 h-4" />
          <span>{isCreatingYear ? 'Creating Cycle...' : 'Add Academic Year'}</span>
        </button>
      </div>

      {/* Academic Year Toolbar Filter */}
      <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs flex flex-wrap items-center gap-1.5 text-xs">
        <span className="font-bold text-slate-500 px-2 flex items-center gap-1">
          <Calendar className="w-3.5 h-3.5 text-blue-600" />
          <span>Filter by Year:</span>
        </span>

        <button
          onClick={() => setActiveYearFilter('all')}
          className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
            activeYearFilter === 'all'
              ? 'bg-slate-900 text-white shadow-xs'
              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
          }`}
        >
          All Years ({cies.length} CIEs)
        </button>

        {academicYears.map((yr) => {
          const count = (groupedCies[yr] || []).length;
          const isSelected = activeYearFilter === yr;
          return (
            <button
              key={yr}
              onClick={() => setActiveYearFilter(yr)}
              className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                isSelected
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <span>{yr}</span>
              {count > 0 && (
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                  isSelected ? 'bg-blue-800 text-white' : 'bg-slate-200 text-slate-600'
                }`}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Grouped CIE Cards */}
      {loading ? (
        <div className="py-16 text-center text-xs text-slate-400">Loading academic year cycles...</div>
      ) : displayYears.length === 0 ? (
        <div className="py-16 text-center text-xs text-slate-400">No CIE cycles found for this selection.</div>
      ) : (
        <div className="space-y-8">
          {displayYears.map((yr) => {
            const yearCies = groupedCies[yr] || [];
            const isCurrentYear = yr === selectedYear;

            return (
              <div key={yr} className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-slate-800">
                      Academic Year {yr}
                    </h3>
                    {isCurrentYear && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                        Selected in TopBar
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-slate-400 font-mono">
                    {yearCies.length} CIE Phases
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                  {yearCies.map((cie) => (
                    <div
                      key={cie.id}
                      className={`rounded-2xl border p-5 bg-white shadow-2xs flex flex-col justify-between transition-all hover:shadow-md ${
                        cie.is_current ? 'border-blue-500 ring-1 ring-blue-500/30' : 'border-slate-200/90'
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <h4 className="text-base font-bold text-slate-900">{cie.name}</h4>
                            {cie.is_current && <Badge variant="info">CURRENT</Badge>}
                          </div>
                          <Badge variant={cie.status === 'COMPLETED' ? 'success' : 'default'}>
                            {cie.status}
                          </Badge>
                        </div>

                        <div className="text-xs text-slate-500 space-y-1 mb-4">
                          <div>Cycle: <strong>{cie.academic_year}</strong></div>
                          <div className="flex items-center gap-1.5 text-slate-700 font-medium">
                            <Calendar className="w-3.5 h-3.5 text-blue-600" />
                            <span>{cie.start_date} to {cie.end_date}</span>
                          </div>
                        </div>

                        {/* Metrics */}
                        <div className="grid grid-cols-2 gap-2 p-3 bg-slate-50 rounded-xl border border-slate-100 text-xs">
                          <div>
                            <span className="text-[10px] text-slate-400 uppercase font-semibold">Sessions</span>
                            <div className="text-sm font-bold text-slate-800 mt-0.5">{cie.session_count || 0}</div>
                          </div>
                          <div>
                            <span className="text-[10px] text-slate-400 uppercase font-semibold">Required Duties</span>
                            <div className="text-sm font-bold text-slate-800 mt-0.5">{cie.total_required || 0}</div>
                          </div>
                          <div>
                            <span className="text-[10px] text-slate-400 uppercase font-semibold">Allocated</span>
                            <div className="text-sm font-bold text-emerald-600 mt-0.5">{cie.allocated || 0}</div>
                          </div>
                          <div>
                            <span className="text-[10px] text-slate-400 uppercase font-semibold">Pending</span>
                            <div className="text-sm font-bold text-amber-600 mt-0.5">{cie.pending || 0}</div>
                          </div>
                        </div>
                      </div>

                      <div className="mt-5 pt-3.5 border-t border-slate-100 flex items-center gap-2">
                        <button
                          onClick={() => {
                            setSelectedYear(cie.academic_year);
                            navigate(`/schedule?cie_id=${cie.id}`);
                          }}
                          className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <CalendarCheck2 className="w-3.5 h-3.5 text-blue-600" />
                          <span>Schedule</span>
                        </button>
                        <button
                          onClick={() => {
                            setSelectedYear(cie.academic_year);
                            navigate(`/allocation/generate?cie_id=${cie.id}`);
                          }}
                          className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs"
                        >
                          <Cpu className="w-3.5 h-3.5" />
                          <span>Allocate</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default CIEManagement;


