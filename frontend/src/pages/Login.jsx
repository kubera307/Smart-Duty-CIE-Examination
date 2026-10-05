import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { authApi } from '../services/authApi';
import {
  ShieldCheck,
  UserCheck,
  ArrowRight,
  CheckCircle2,
  Lock,
  Eye,
  EyeOff,
  User,
  ArrowLeft,
  Sparkles,
  School,
  AlertCircle
} from 'lucide-react';

const Login = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Mode: 'portal' (Role selector) | 'admin' (Admin Login) | 'staff' (Staff Login)
  const initialMode = searchParams.get('mode') === 'admin' ? 'admin' : searchParams.get('mode') === 'staff' ? 'staff' : 'portal';
  const [view, setView] = useState(initialMode);

  // Form states
  const [adminUsername, setAdminUsername] = useState('admin');
  const [adminPassword, setAdminPassword] = useState('');
  const [showAdminPassword, setShowAdminPassword] = useState(false);
  const [staffUsername, setStaffUsername] = useState('');
  const [staffPassword, setStaffPassword] = useState('');
  const [showStaffPassword, setShowStaffPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleAdminSubmit = async (e) => {
    e.preventDefault();
    if (!adminUsername.trim()) {
      setErrorMsg('Please enter Admin Username');
      return;
    }
    if (!adminPassword) {
      setErrorMsg('Please enter Admin Password');
      return;
    }

    setLoading(true);
    setErrorMsg('');

    try {
      const res = await authApi.loginStaff({
        role: 'admin',
        username: adminUsername.trim(),
        password: adminPassword.trim()
      });

      if (res.data.success) {
        localStorage.setItem('auth_role', 'admin');
        localStorage.setItem('auth_user', JSON.stringify(res.data.user));
        navigate('/');
      }
    } catch (err) {
      setErrorMsg(err.response?.data?.error || 'Invalid administrator credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleStaffSubmit = async (e) => {
    e.preventDefault();
    if (!staffUsername.trim()) {
      setErrorMsg('Please enter your Faculty Login ID');
      return;
    }
    if (!staffPassword) {
      setErrorMsg('Please enter your Password');
      return;
    }

    setLoading(true);
    setErrorMsg('');

    try {
      const payload = {
        role: 'staff',
        username: staffUsername.trim(),
        password: staffPassword.trim()
      };

      const res = await authApi.loginStaff(payload);

      if (res.data.success) {
        localStorage.setItem('auth_role', 'staff');
        localStorage.setItem('auth_user', JSON.stringify(res.data.user));
        localStorage.setItem('logged_in_faculty', JSON.stringify(res.data.faculty));
        navigate('/staff/portal');
      }
    } catch (err) {
      setErrorMsg(err.response?.data?.error || 'Authentication failed. Please verify your Staff credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page min-h-screen bg-[#f4f7fb] text-slate-900 flex flex-col justify-between p-4 sm:p-6 lg:p-10 font-sans selection:bg-indigo-100 selection:text-indigo-900">
      {/* Top Subtle College Header */}
      <div className="w-full max-w-5xl mx-auto flex items-center justify-between py-3 border-b border-slate-200">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-700 shadow-sm">
            <School className="w-5 h-5 text-indigo-600" />
          </div>
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-slate-800">
              Malnad College of Engineering
            </div>
            <div className="text-[11px] text-slate-500 font-medium">
              Department of CSE (AI & ML) • Hassan, Karnataka
            </div>
          </div>
        </div>

        <div className="hidden sm:flex items-center gap-2 px-3 py-1 rounded-full bg-white border border-slate-200 text-[11px] text-slate-500 shadow-sm">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
          <span>CIE Duty Management System</span>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex items-center justify-center py-8">
        {/* ========================================================================= */}
        {/* 1. ROLE SELECTION PORTAL (Clean, Institutional, Exactly like Last Project) */}
        {/* ========================================================================= */}
        {view === 'portal' && (
          <div className="w-full max-w-4xl flex flex-col items-center animate-in fade-in duration-300">
            {/* Header */}
            <div className="text-center space-y-2 mb-8 sm:mb-10">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-50 border border-indigo-100 text-indigo-700 text-xs font-semibold">
                <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                <span>Continuous Internal Evaluation (CIE) Portal</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
                Smart Duty Allocation System
              </h1>
              <p className="text-xs sm:text-sm text-slate-500 max-w-xl mx-auto">
                Secure access for CIE duty allocation and faculty duty schedules.
              </p>
            </div>

            {/* Two Role Selection Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-3xl">
              {/* ADMIN CARD */}
              <div
                onClick={() => { setView('admin'); setErrorMsg(''); }}
                className="group bg-white hover:bg-white border border-slate-200 hover:border-indigo-300 rounded-2xl p-7 flex flex-col justify-between cursor-pointer transition-all duration-200 hover:-translate-y-1 shadow-lg shadow-slate-200/60 hover:shadow-indigo-200/60"
              >
                <div>
                  <div className="flex items-center justify-between mb-5">
                    <div className="w-12 h-12 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 group-hover:bg-indigo-600 group-hover:text-white transition-all">
                      <ShieldCheck className="w-6 h-6" />
                    </div>
                      <span className="text-[11px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-100">
                      Coordinator
                    </span>
                  </div>

                  <h2 className="text-lg font-bold text-slate-900 mb-2 group-hover:text-indigo-700 transition-colors">
                    Admin Portal
                  </h2>
                  <p className="text-xs text-slate-500 leading-relaxed mb-5">
                    Manage examinations, faculty allocation, conflicts, and reports.
                  </p>

                  <ul className="space-y-2 text-xs text-slate-600 mb-6">
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-indigo-400 shrink-0" />
                      <span>Exam and room planning</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-indigo-400 shrink-0" />
                      <span>Conflict-free allocation</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-indigo-400 shrink-0" />
                      <span>Reports and administrative controls</span>
                    </li>
                  </ul>
                </div>

                <button
                  type="button"
                  className="w-full py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs flex items-center justify-center gap-2 transition-all shadow-md group-hover:shadow-indigo-600/30"
                >
                  <span>Login as Admin</span>
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                </button>
              </div>

              {/* STAFF CARD */}
              <div
                onClick={() => { setView('staff'); setErrorMsg(''); }}
                className="group bg-white hover:bg-white border border-slate-200 hover:border-emerald-300 rounded-2xl p-7 flex flex-col justify-between cursor-pointer transition-all duration-200 hover:-translate-y-1 shadow-lg shadow-slate-200/60 hover:shadow-emerald-200/60"
              >
                <div>
                  <div className="flex items-center justify-between mb-5">
                    <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 group-hover:bg-emerald-600 group-hover:text-white transition-all">
                      <UserCheck className="w-6 h-6" />
                    </div>
                    <span className="text-[11px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-100">
                      Faculty Member
                    </span>
                  </div>

                  <h2 className="text-lg font-bold text-slate-900 mb-2 group-hover:text-emerald-700 transition-colors">
                    Staff Portal
                  </h2>
                  <p className="text-xs text-slate-500 leading-relaxed mb-5">
                    View your assigned rooms, sessions, roll ranges, and duty slips.
                  </p>

                  <ul className="space-y-2 text-xs text-slate-600 mb-6">
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>Assigned rooms and roll ranges</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>Personal duty schedule</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>Official duty slip</span>
                    </li>
                  </ul>
                </div>

                <button
                  type="button"
                  className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs flex items-center justify-center gap-2 transition-all shadow-md group-hover:shadow-emerald-600/30"
                >
                  <span>Login as Staff</span>
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                </button>
              </div>
            </div>

          </div>
        )}

        {/* ========================================================================= */}
        {/* 2. ADMIN LOGIN FORM                                                       */}
        {/* ========================================================================= */}
        {view === 'admin' && (
          <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl p-8 shadow-xl shadow-slate-200/70 animate-in fade-in duration-200">
            <button
              onClick={() => { setView('portal'); setErrorMsg(''); }}
              className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-900 mb-6 transition-colors font-medium"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back to Role Selection</span>
            </button>

            <div className="flex items-center gap-3 mb-6">
              <div className="w-11 h-11 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-900">Administrator Login</h2>
                <p className="text-xs text-slate-500">Restricted coordinator access</p>
              </div>
            </div>

            {errorMsg && (
              <div className="mb-5 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <form onSubmit={handleAdminSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-700 font-semibold mb-1.5">Admin Username</label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    value={adminUsername}
                    onChange={(e) => setAdminUsername(e.target.value)}
                    placeholder="admin"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-2.5 text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-200 font-medium"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1.5">Password</label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type={showAdminPassword ? 'text' : 'password'}
                    required
                    value={adminPassword}
                    onChange={(e) => setAdminPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-10 py-2.5 text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-200 font-medium"
                  />
                  <button
                    type="button"
                    onClick={() => setShowAdminPassword((visible) => !visible)}
                    aria-label={showAdminPassword ? 'Hide password' : 'Show password'}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                  >
                    {showAdminPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl font-semibold text-xs flex items-center justify-center gap-2 transition-all shadow-md shadow-indigo-600/30"
                >
                  {loading ? 'Authenticating...' : 'Login as Admin'}
                  {!loading && <ArrowRight className="w-4 h-4" />}
                </button>
              </div>
            </form>

            <div className="mt-6 pt-5 border-t border-slate-200 text-center space-y-3 text-xs">
              <div className="text-slate-500">
                Use the coordinator credentials issued by your institution.
              </div>
              <div>
                <button
                  type="button"
                  onClick={() => { setView('staff'); setErrorMsg(''); }}
                  className="text-slate-500 hover:text-emerald-700 transition-colors font-medium"
                >
                  Are you a faculty member? Switch to Staff Login →
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* 3. STAFF LOGIN FORM                                                       */}
        {/* ========================================================================= */}
        {view === 'staff' && (
          <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl p-8 shadow-xl shadow-slate-200/70 animate-in fade-in duration-200">
            <button
              onClick={() => { setView('portal'); setErrorMsg(''); }}
              className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-900 mb-6 transition-colors font-medium"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back to Role Selection</span>
            </button>

            <div className="flex items-center gap-3 mb-6">
              <div className="w-11 h-11 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                <UserCheck className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-900">Staff Member Login</h2>
                <p className="text-xs text-slate-500">Department Faculty Invigilator Access</p>
              </div>
            </div>

            {errorMsg && (
              <div className="mb-5 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <form onSubmit={handleStaffSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-700 font-semibold mb-1.5">Staff Login ID</label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    value={staffUsername}
                    onChange={(e) => setStaffUsername(e.target.value)}
                    placeholder="e.g. arjun, swathi, sushma..."
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-2.5 text-slate-900 placeholder-slate-400 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-200 font-medium font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1.5">Password</label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type={showStaffPassword ? 'text' : 'password'}
                    required
                    value={staffPassword}
                    onChange={(e) => setStaffPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-10 py-2.5 text-slate-900 placeholder-slate-400 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-200 font-medium"
                  />
                  <button
                    type="button"
                    onClick={() => setShowStaffPassword((visible) => !visible)}
                    aria-label={showStaffPassword ? 'Hide password' : 'Show password'}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                  >
                    {showStaffPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl font-semibold text-xs flex items-center justify-center gap-2 transition-all shadow-md shadow-emerald-600/30"
                >
                  {loading ? 'Authenticating...' : 'Login as Staff Member'}
                  {!loading && <ArrowRight className="w-4 h-4" />}
                </button>
              </div>
            </form>

            <div className="mt-6 pt-5 border-t border-slate-200 text-center space-y-3 text-xs">
              <div className="text-slate-500">
                Use the faculty credentials issued by your institution.
              </div>
              <div>
                <button
                  type="button"
                  onClick={() => { setView('admin'); setErrorMsg(''); }}
                  className="text-slate-500 hover:text-indigo-700 transition-colors font-medium"
                >
                  Are you an exam coordinator? Switch to Admin Login →
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="w-full max-w-5xl mx-auto text-center py-3 text-[11px] text-slate-500 border-t border-slate-200">
        © 2026-2027 Malnad College of Engineering, Hassan • Autonomous Institution Affiliated to VTU, Belagavi
      </div>
    </div>
  );
};

export default Login;
