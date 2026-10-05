import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { facultyApi } from '../services/facultyApi';
import Modal from '../components/common/Modal';
import Badge from '../components/common/Badge';
import {
  Search,
  Plus,
  Edit2,
  Trash2,
  Users,
  User,
  CheckCircle2,
  ShieldCheck,
  ShieldAlert,
  Copy,
  Check,
  Building2,
  AlertCircle,
  UserCheck,
  X
} from 'lucide-react';

const FacultyDirectory = () => {
  const navigate = useNavigate();
  const [faculty, setFaculty] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [eligibilityFilter, setEligibilityFilter] = useState('all'); // 'all' | 'eligible' | 'excluded'
  const [successToast, setSuccessToast] = useState(null);

  // Add Faculty Modal state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [addForm, setAddForm] = useState({
    name: '',
    designation: 'Assistant Professor',
    department: 'CSE (AI & ML)',
    employee_id: '',
    email: '',
    eligible_for_duty: true
  });

  // Edit Faculty Modal state
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editForm, setEditForm] = useState(null);

  // Created Credentials Modal (like previous project)
  const [createdCredentials, setCreatedCredentials] = useState(null);
  const [copied, setCopied] = useState(false);

  // Loading state for form submits
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    loadFaculty();
  }, []);

  const loadFaculty = async () => {
    setLoading(true);
    try {
      const res = await facultyApi.getAll();
      const facData = Array.isArray(res.data) ? res.data : (res.data?.faculty || []);
      setFaculty(facData);
    } catch (err) {
      console.error('Error fetching faculty roster:', err);
      setFaculty([]);
    } finally {
      setLoading(false);
    }
  };

  const showToast = (msg) => {
    setSuccessToast(msg);
    setTimeout(() => setSuccessToast(null), 3500);
  };

  // Filter faculty by search and eligibility
  const filteredFaculty = useMemo(() => {
    return faculty.filter((f) => {
      // Eligibility tab filter
      if (eligibilityFilter === 'eligible' && !f.eligible_for_duty) return false;
      if (eligibilityFilter === 'excluded' && f.eligible_for_duty) return false;

      // Search query
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchName = f.name?.toLowerCase().includes(q);
        const matchDesig = f.designation?.toLowerCase().includes(q);
        const matchId = f.employee_id?.toLowerCase().includes(q) || f.login_id?.toLowerCase().includes(q);
        if (!matchName && !matchDesig && !matchId) return false;
      }

      return true;
    });
  }, [faculty, eligibilityFilter, search]);

  // Metric counts
  const totalCount = faculty.length;
  const eligibleCount = faculty.filter((f) => f.eligible_for_duty).length;
  const excludedCount = totalCount - eligibleCount;

  // Toggle duty eligibility (1-click)
  const handleToggleEligibility = async (facultyMember) => {
    const newStatus = !facultyMember.eligible_for_duty;
    try {
      await facultyApi.update(facultyMember.id, {
        eligible_for_duty: newStatus
      });
      showToast(`${facultyMember.name} is now ${newStatus ? 'ELIGIBLE' : 'EXCLUDED'} for CIE duty.`);
      loadFaculty();
    } catch (err) {
      alert('Failed to update duty eligibility');
    }
  };

  // Handle Add Faculty
  const handleAddSubmit = async (e) => {
    e.preventDefault();
    if (!addForm.name.trim()) {
      alert('Please enter faculty name.');
      return;
    }

    setIsSubmitting(true);
    try {
      const suggestedLogin = addForm.name.toLowerCase().replace(/[^a-z]/g, '').slice(0, 15);
      const res = await facultyApi.create({
        name: addForm.name.trim(),
        designation: addForm.designation.trim() || 'Assistant Professor',
        department: addForm.department.trim() || 'CSE (AI & ML)',
        employee_id: addForm.employee_id.trim() || null,
        email: addForm.email.trim() || `${suggestedLogin}@mcehassan.ac.in`,
        eligible_for_duty: addForm.eligible_for_duty,
        max_duty_capacity: 15
      });

      setIsAddModalOpen(false);
      setCreatedCredentials({
        name: addForm.name,
        login_id: suggestedLogin,
        email: addForm.email.trim() || `${suggestedLogin}@mcehassan.ac.in`,
        password: 'staff123'
      });

      setAddForm({
        name: '',
        designation: 'Assistant Professor',
        department: 'CSE (AI & ML)',
        employee_id: '',
        email: '',
        eligible_for_duty: true
      });

      loadFaculty();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to add faculty member');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Edit Faculty
  const handleOpenEdit = (f) => {
    setEditForm({
      id: f.id,
      name: f.name || '',
      designation: f.designation || 'Assistant Professor',
      department: f.department || 'CSE (AI & ML)',
      employee_id: f.employee_id || '',
      email: f.email || '',
      eligible_for_duty: f.eligible_for_duty !== false
    });
    setIsEditModalOpen(true);
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    if (!editForm) return;

    setIsSubmitting(true);
    try {
      await facultyApi.update(editForm.id, {
        name: editForm.name.trim(),
        designation: editForm.designation.trim(),
        department: editForm.department.trim(),
        employee_id: editForm.employee_id.trim() || null,
        email: editForm.email.trim() || null,
        eligible_for_duty: editForm.eligible_for_duty
      });

      setIsEditModalOpen(false);
      showToast(`Updated details for ${editForm.name}.`);
      loadFaculty();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to update faculty member');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Delete Faculty
  const handleDelete = async (facultyMember) => {
    if (window.confirm(`Are you sure you want to remove ${facultyMember.name} from the department roster? Any assigned duties will be set to Pending.`)) {
      try {
        await facultyApi.delete(facultyMember.id);
        showToast(`Removed ${facultyMember.name} from faculty directory.`);
        loadFaculty();
      } catch (err) {
        alert('Failed to remove faculty member');
      }
    }
  };

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
      {/* 1. PROFESSIONAL PAGE HEADER                                               */}
      {/* ========================================================================= */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
            Faculty Directory & Invigilator Roster
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Department of CSE (AI & ML) • Manage faculty profiles, designations, and CIE duty clearance.
          </p>
        </div>

        <button
          onClick={() => setIsAddModalOpen(true)}
          className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-sm transition-all self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Add Faculty Member</span>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* 2. EXECUTIVE METRIC SUMMARY CARDS                                         */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Total Department Faculty</span>
            <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-700">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl font-bold text-slate-900 mt-2">{totalCount} Members</div>
          <div className="text-[11px] text-slate-400 mt-0.5">CSE (AI & ML)</div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">CIE Duty Eligible</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-600">
              <ShieldCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl font-bold text-emerald-700 mt-2">{eligibleCount} Eligible</div>
          <div className="text-[11px] text-emerald-600 font-medium mt-0.5">Cleared for invigilation</div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Excluded from Duties</span>
            <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center text-amber-600">
              <ShieldAlert className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl font-bold text-amber-700 mt-2">{excludedCount} Excluded</div>
          <div className="text-[11px] text-amber-600 font-medium mt-0.5">0 duties allocated policy</div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Department Status</span>
            <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600">
              <Building2 className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl font-bold text-slate-900 mt-2">100% Active</div>
          <div className="text-[11px] text-blue-600 font-medium mt-0.5">Autonomous MCE Hassan</div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 3. TOOLBAR: LIVE SEARCH & ELIGIBILITY TABS                                */}
      {/* ========================================================================= */}
      <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-3">
        {/* Search */}
        <div className="relative min-w-[260px] flex-1 max-w-md">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search faculty name, designation, login ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-slate-50 border border-slate-300 text-xs rounded-lg pl-8 pr-3 py-2 text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-500"
          />
        </div>

        {/* Filter Tabs */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setEligibilityFilter('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              eligibilityFilter === 'all'
                ? 'bg-[#10213e] text-white shadow-sm'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            All Staff ({totalCount})
          </button>
          <button
            onClick={() => setEligibilityFilter('eligible')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              eligibilityFilter === 'eligible'
                ? 'bg-emerald-700 text-white shadow-sm'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Eligible ({eligibleCount})
          </button>
          <button
            onClick={() => setEligibilityFilter('excluded')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              eligibilityFilter === 'excluded'
                ? 'bg-amber-700 text-white shadow-sm'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Excluded ({excludedCount})
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 4. MASTER FACULTY DIRECTORY TABLE                                         */}
      {/* ========================================================================= */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                <th className="py-3.5 px-4">Faculty Member</th>
                <th className="py-3.5 px-4">Designation</th>
                <th className="py-3.5 px-3">Department</th>
                <th className="py-3.5 px-3">Staff Login ID</th>
                <th className="py-3.5 px-4 text-center">Duty Eligibility</th>
                <th className="py-3.5 px-3 text-center">Assigned Duties</th>
                <th className="py-3.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan="7" className="py-16 text-center text-slate-400">
                    Loading faculty roster...
                  </td>
                </tr>
              ) : filteredFaculty.length === 0 ? (
                <tr>
                  <td colSpan="7" className="py-16 text-center text-slate-500">
                    <Users className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    <div className="font-semibold text-slate-700">No faculty members found</div>
                    <div className="text-[11px] text-slate-400 mt-0.5">Try adjusting your search query or filters.</div>
                  </td>
                </tr>
              ) : (
                filteredFaculty.map((f) => {
                  const initials = f.name
                    ? f.name.replace(/^(Dr\.|Prof\.|Mr\.|Mrs\.|Ms\.)\s+/i, '').slice(0, 2).toUpperCase()
                    : 'FA';

                  const dutiesCount = f.assigned_duties_count !== undefined
                    ? f.assigned_duties_count
                    : (f.duties ? f.duties.length : 0);

                  return (
                    <tr key={f.id} className="hover:bg-slate-50/70 transition-colors">
                      {/* Faculty Name & Initials */}
                      <td className="py-3.5 px-4">
                        <div
                          className="flex items-center gap-3 cursor-pointer group"
                          onClick={() => navigate(`/faculty/${f.id}`)}
                          title="Click to view full staff profile"
                        >
                          <div className="w-9 h-9 rounded-full bg-blue-50 border border-blue-200 text-blue-800 font-bold text-xs flex items-center justify-center shrink-0 group-hover:bg-blue-100 group-hover:border-blue-400 transition-colors">
                            {initials}
                          </div>
                          <div>
                            <div className="font-bold text-slate-900 text-xs group-hover:text-blue-600 transition-colors">
                              {f.name}
                            </div>
                            <div className="text-[11px] text-slate-400 font-mono">
                              {f.employee_id ? `ID: ${f.employee_id}` : `ID: MCE-${f.id.toString().padStart(3, '0')}`}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Designation */}
                      <td className="py-3.5 px-4">
                        <span className="font-medium text-slate-800">
                          {f.designation || 'Faculty Member'}
                        </span>
                      </td>

                      {/* Department */}
                      <td className="py-3.5 px-3">
                        <span className="text-slate-600 font-medium">
                          {f.department || 'CSE (AI & ML)'}
                        </span>
                      </td>

                      {/* Staff Login ID */}
                      <td className="py-3.5 px-3">
                        <span className="inline-flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
                          @{f.login_id || f.name.toLowerCase().replace(/[^a-z]/g, '').slice(0, 15)}
                        </span>
                      </td>

                      {/* Duty Eligibility (1-Click Interactive Toggle) */}
                      <td className="py-3.5 px-4 text-center">
                        <button
                          type="button"
                          onClick={() => handleToggleEligibility(f)}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold transition-all border ${
                            f.eligible_for_duty
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                              : 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
                          }`}
                          title="Click to toggle duty eligibility"
                        >
                          {f.eligible_for_duty ? (
                            <>
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                              <span>Eligible for Duty</span>
                            </>
                          ) : (
                            <>
                              <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
                              <span>Duty Excluded</span>
                            </>
                          )}
                        </button>
                      </td>

                      {/* Assigned Duties */}
                      <td className="py-3.5 px-3 text-center">
                        <span className="px-2 py-0.5 rounded-md bg-slate-100 font-mono text-xs font-semibold text-slate-800 border border-slate-200">
                          {dutiesCount} {dutiesCount === 1 ? 'Duty' : 'Duties'}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => navigate(`/faculty/${f.id}`)}
                            className="px-2.5 py-1 text-xs font-semibold text-blue-700 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors flex items-center gap-1"
                            title="View Full Staff Profile"
                          >
                            <User className="w-3.5 h-3.5" />
                            <span>View Profile</span>
                          </button>
                          <button
                            onClick={() => handleOpenEdit(f)}
                            className="p-1.5 text-slate-400 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
                            title="Edit Faculty Member"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDelete(f)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                            title="Remove Faculty Member"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
          <span>Showing <strong>{filteredFaculty.length}</strong> faculty members</span>
          <div className="flex items-center gap-2 font-medium">
            <span>Default Staff Password: <code className="font-mono text-slate-700 font-bold">staff123</code></span>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 5. ADD FACULTY MEMBER MODAL                                               */}
      {/* ========================================================================= */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="Add Faculty Member"
      >
        <form onSubmit={handleAddSubmit} className="space-y-4 text-xs">
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Full Name *</label>
            <input
              type="text"
              required
              placeholder="e.g. Dr. Ramesh Kumar"
              value={addForm.name}
              onChange={(e) => setAddForm({ ...addForm, name: e.target.value })}
              className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-900 font-semibold focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Designation *</label>
              <select
                value={addForm.designation}
                onChange={(e) => setAddForm({ ...addForm, designation: e.target.value })}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-800 font-medium focus:outline-none focus:border-indigo-500"
              >
                <option value="Head of the Department">Head of the Department</option>
                <option value="Professor">Professor</option>
                <option value="Associate Professor">Associate Professor</option>
                <option value="Assistant Professor">Assistant Professor</option>
                <option value="Adjunct Faculty">Adjunct Faculty</option>
              </select>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Department</label>
              <input
                type="text"
                value={addForm.department}
                onChange={(e) => setAddForm({ ...addForm, department: e.target.value })}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Employee ID (Optional)</label>
              <input
                type="text"
                placeholder="e.g. EMP008"
                value={addForm.employee_id}
                onChange={(e) => setAddForm({ ...addForm, employee_id: e.target.value })}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-800 font-mono focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Email Address (Optional)</label>
              <input
                type="email"
                placeholder="e.g. ramesh@mcehassan.ac.in"
                value={addForm.email}
                onChange={(e) => setAddForm({ ...addForm, email: e.target.value })}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          {/* Duty Eligibility Checkbox */}
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
            <div>
              <div className="font-semibold text-slate-800">CIE Duty Eligibility</div>
              <div className="text-[11px] text-slate-500">
                Allow this faculty member to be scheduled for CIE exam room invigilation.
              </div>
            </div>

            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={addForm.eligible_for_duty}
                onChange={(e) => setAddForm({ ...addForm, eligible_for_duty: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
            </label>
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
              disabled={isSubmitting}
              className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-semibold shadow-sm disabled:opacity-50"
            >
              {isSubmitting ? 'Adding...' : 'Save Faculty Member'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ========================================================================= */}
      {/* 6. EDIT FACULTY MEMBER MODAL                                              */}
      {/* ========================================================================= */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        title={editForm ? `Edit Faculty — ${editForm.name}` : 'Edit Faculty Member'}
      >
        {editForm && (
          <form onSubmit={handleEditSubmit} className="space-y-4 text-xs">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Full Name *</label>
              <input
                type="text"
                required
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-900 font-semibold focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Designation *</label>
                <select
                  value={editForm.designation}
                  onChange={(e) => setEditForm({ ...editForm, designation: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-800 font-medium focus:outline-none focus:border-indigo-500"
                >
                  <option value="Head of the Department">Head of the Department</option>
                  <option value="Professor">Professor</option>
                  <option value="Associate Professor">Associate Professor</option>
                  <option value="Assistant Professor">Assistant Professor</option>
                  <option value="Adjunct Faculty">Adjunct Faculty</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Department</label>
                <input
                  type="text"
                  value={editForm.department}
                  onChange={(e) => setEditForm({ ...editForm, department: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Employee ID</label>
                <input
                  type="text"
                  value={editForm.employee_id}
                  onChange={(e) => setEditForm({ ...editForm, employee_id: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-800 font-mono focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Email Address</label>
                <input
                  type="email"
                  value={editForm.email}
                  onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            {/* Duty Eligibility Checkbox */}
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
              <div>
                <div className="font-semibold text-slate-800">CIE Duty Eligibility</div>
                <div className="text-[11px] text-slate-500">
                  Allow this faculty member to be scheduled for CIE exam room invigilation.
                </div>
              </div>

              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={editForm.eligible_for_duty}
                  onChange={(e) => setEditForm({ ...editForm, eligible_for_duty: e.target.checked })}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
              </label>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsEditModalOpen(false)}
                className="px-4 py-2 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-semibold shadow-sm disabled:opacity-50"
              >
                {isSubmitting ? 'Saving...' : 'Update Details'}
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* ========================================================================= */}
      {/* 7. CREDENTIALS CARD MODAL (Direct Copy for Staff Login)                   */}
      {/* ========================================================================= */}
      {createdCredentials && (
        <Modal
          isOpen={true}
          onClose={() => setCreatedCredentials(null)}
          title="Staff Account Created Successfully"
        >
          <div className="space-y-4 text-xs">
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2.5 text-emerald-800">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              <div className="font-semibold">
                Staff member {createdCredentials.name} has been added to the department roster!
              </div>
            </div>

            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3 font-mono">
              <div>
                <div className="text-[10px] uppercase font-bold text-slate-500">Staff Portal Login ID</div>
                <div className="text-sm font-bold text-slate-900 mt-0.5">{createdCredentials.login_id}</div>
              </div>

              <div>
                <div className="text-[10px] uppercase font-bold text-slate-500">Initial Password</div>
                <div className="inline-block bg-indigo-50 border border-indigo-200 text-indigo-700 font-bold px-2 py-0.5 rounded text-sm mt-0.5">
                  {createdCredentials.password}
                </div>
              </div>

              <div>
                <div className="text-[10px] uppercase font-bold text-slate-500">Staff Portal URL</div>
                <div className="text-slate-700 text-xs mt-0.5">http://localhost:5173/login?mode=staff</div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(
                    `Staff Portal Login Credentials:\nName: ${createdCredentials.name}\nLogin ID: ${createdCredentials.login_id}\nPassword: ${createdCredentials.password}\nURL: http://localhost:5173/login?mode=staff`
                  );
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-semibold shadow-sm flex items-center gap-1.5 transition-all"
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                <span>{copied ? 'Copied to Clipboard!' : 'Copy Login Details'}</span>
              </button>

              <button
                type="button"
                onClick={() => setCreatedCredentials(null)}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg font-semibold shadow-sm"
              >
                Done
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default FacultyDirectory;
