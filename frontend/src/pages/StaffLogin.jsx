import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { facultyApi } from '../services/facultyApi';
import Badge from '../components/common/Badge';
import {
  GraduationCap,
  LogIn,
  Users,
  Shield,
  ArrowRight,
  Sparkles,
  CheckCircle2,
  Calendar,
  Lock
} from 'lucide-react';

const StaffLogin = () => {
  const navigate = useNavigate();
  const [facultyList, setFacultyList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedFacultyId, setSelectedFacultyId] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadFaculty();
  }, []);

  const loadFaculty = async () => {
    setLoading(true);
    try {
      const res = await facultyApi.getAll();
      const list = res.data.faculty || [];
      setFacultyList(list);
      if (list.length > 0) {
        setSelectedFacultyId(list[0].id.toString());
      }
    } catch (err) {
      console.error('Error fetching faculty for login:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectAndLogin = (facId) => {
    const fac = facultyList.find((f) => f.id.toString() === facId.toString());
    if (fac) {
      localStorage.setItem('logged_in_faculty', JSON.stringify(fac));
      navigate('/staff/portal');
    }
  };

  const filteredFaculty = facultyList.filter((f) =>
    f.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (f.designation && f.designation.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col justify-center items-center p-4 sm:p-6">
      {/* Background Decorative Blur */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-sky-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-xl w-full space-y-6 relative z-10">
        {/* Header Branding */}
        <div className="text-center space-y-2">
          <div className="w-14 h-14 rounded-2xl bg-sky-500/20 text-sky-400 border border-sky-500/30 flex items-center justify-center mx-auto shadow-lg shadow-sky-500/10">
            <GraduationCap className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">
            Staff Duty Portal Login
          </h1>
          <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
            Malnad College of Engineering, Hassan
            <br />
            Department of Computer Science & Engineering (AI & ML)
          </p>
        </div>

        {/* Login Card */}
        <div className="bg-slate-800/90 backdrop-blur border border-slate-700/80 rounded-2xl p-6 sm:p-8 shadow-2xl space-y-5">
          <div className="flex items-center justify-between border-b border-slate-700 pb-3 text-xs">
            <span className="font-semibold text-slate-300 flex items-center gap-1.5">
              <Users className="w-4 h-4 text-sky-400" />
              <span>Select Your Faculty Profile:</span>
            </span>
            <span className="text-[11px] text-slate-400">Institutional Access</span>
          </div>

          {/* Quick Filter */}
          <div>
            <input
              type="text"
              placeholder="Search by faculty name or role..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-900/90 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
          </div>

          {/* Faculty Selectable Cards */}
          <div className="max-h-72 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
            {loading ? (
              <div className="py-12 text-center text-xs text-slate-500">Loading faculty roster...</div>
            ) : filteredFaculty.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-500">No matching faculty found.</div>
            ) : (
              filteredFaculty.map((f) => {
                const isSelected = selectedFacultyId === f.id.toString();
                return (
                  <div
                    key={f.id}
                    onClick={() => setSelectedFacultyId(f.id.toString())}
                    className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-3 text-xs ${
                      isSelected
                        ? 'bg-sky-950/60 border-sky-500/80 text-white shadow-sm'
                        : 'bg-slate-900/50 border-slate-700/60 hover:bg-slate-700/50 text-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs ${
                          isSelected
                            ? 'bg-sky-500 text-white shadow-md'
                            : 'bg-slate-800 text-slate-400 border border-slate-700'
                        }`}
                      >
                        {f.name
                          .split(' ')
                          .map((n) => n[0])
                          .filter((_, i) => i < 2)
                          .join('')}
                      </div>

                      <div>
                        <div className="font-bold text-white leading-tight">{f.name}</div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          {f.designation || 'Faculty Member'} • {f.department || 'CSE (AI & ML)'}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Badge variant={f.eligible_for_duty ? 'brand' : 'danger'}>
                        {f.eligible_for_duty ? 'Eligible' : 'Excluded'}
                      </Badge>
                      <input
                        type="radio"
                        name="faculty_login"
                        checked={isSelected}
                        onChange={() => setSelectedFacultyId(f.id.toString())}
                        className="text-sky-500 focus:ring-0"
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Action Button */}
          <button
            onClick={() => handleSelectAndLogin(selectedFacultyId)}
            disabled={!selectedFacultyId || loading}
            className="w-full py-3 bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-lg shadow-sky-600/30 transition-all flex items-center justify-center gap-2"
          >
            <LogIn className="w-4 h-4" />
            <span>Sign In to My Staff Dashboard</span>
            <ArrowRight className="w-4 h-4" />
          </button>

          {/* Quick Switch to Admin */}
          <div className="pt-2 text-center border-t border-slate-700/60">
            <button
              onClick={() => navigate('/')}
              className="text-xs text-slate-400 hover:text-sky-400 transition-colors font-medium inline-flex items-center gap-1"
            >
              <span>Switch to Exam Coordinator / Admin Mode</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StaffLogin;

