import React from 'react';
import { School, Calendar, Plus } from 'lucide-react';
import { useAcademicYear } from '../../context/AcademicYearContext';

const TopBar = () => {
  const { academicYears, selectedYear, setSelectedYear, createYear } = useAcademicYear();

  const handleYearChange = (e) => {
    const val = e.target.value;
    if (val === '__new__') {
      const newY = window.prompt('Enter new Academic Year (e.g. 2027-28 or 2027-2028):');
      if (newY && newY.trim()) {
        createYear(newY.trim());
      }
    } else {
      setSelectedYear(val);
    }
  };

  return (
    <header className="h-16 bg-white border-b border-slate-200/90 px-4 sm:px-6 flex items-center justify-between sticky top-0 z-20 font-sans shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
      {/* Left: Department & Academic Year Selector */}
      <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-xs text-slate-800 font-bold">
          <School className="w-4 h-4 text-blue-600 shrink-0" />
          <span className="hidden sm:inline">Department of CSE (AI & ML)</span>
          <span className="sm:hidden">CSE (AI & ML)</span>
        </div>

        <span className="text-slate-300 hidden sm:inline">•</span>

        {/* Dynamic Academic Year Selector */}
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-50/80 border border-blue-200 text-blue-900 text-xs font-bold shadow-2xs">
          <Calendar className="w-3.5 h-3.5 text-blue-600 shrink-0" />
          <span className="text-[11px] text-blue-600 font-medium">Academic Year:</span>
          <select
            value={selectedYear}
            onChange={handleYearChange}
            className="bg-transparent font-bold text-blue-900 text-xs focus:outline-none cursor-pointer pr-1"
          >
            {academicYears.map((yr) => (
              <option key={yr} value={yr}>
                {yr}
              </option>
            ))}
            <option value="__new__">+ Add Year...</option>
          </select>
        </div>
      </div>

      {/* Right: Institutional Badge */}
      <div className="flex items-center gap-3 text-xs">
        <div className="hidden lg:flex items-center gap-1.5 text-slate-500 bg-slate-50 border border-slate-200 px-3 py-1 rounded-lg font-medium">
          <School className="w-3.5 h-3.5 text-slate-400" />
          <span>Malnad College of Engineering, Hassan</span>
        </div>
      </div>
    </header>
  );
};

export default TopBar;
