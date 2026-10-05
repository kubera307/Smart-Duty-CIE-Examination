import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/layout/Layout';
import Dashboard from './pages/Dashboard';
import FacultyDirectory from './pages/FacultyDirectory';
import StaffProfile from './pages/StaffProfile';
import Timetables from './pages/Timetables';
import CIEManagement from './pages/CIEManagement';
import ExamSchedule from './pages/ExamSchedule';
import GenerateAllocation from './pages/GenerateAllocation';
import AllocationResults from './pages/AllocationResults';
import ConflictCenter from './pages/ConflictCenter';
import Analytics from './pages/Analytics';
import Reports from './pages/Reports';
import Settings from './pages/Settings';
import Login from './pages/Login';
import StaffPortal from './pages/StaffPortal';
import { AcademicYearProvider } from './context/AcademicYearContext';

// Admin Route Guard
const AdminRoute = ({ children }) => {
  const role = localStorage.getItem('auth_role');
  if (!role) {
    return <Navigate to="/login" replace />;
  }
  if (role === 'staff') {
    return <Navigate to="/staff/portal" replace />;
  }
  return children;
};

// Staff Route Guard
const StaffRoute = ({ children }) => {
  const role = localStorage.getItem('auth_role');
  if (!role || role !== 'staff') {
    return <Navigate to="/login" replace />;
  }
  return children;
};

// Root index redirector
const RootRedirect = () => {
  const role = localStorage.getItem('auth_role');
  if (role === 'admin') {
    return <Dashboard />;
  }
  if (role === 'staff') {
    return <Navigate to="/staff/portal" replace />;
  }
  return <Navigate to="/login" replace />;
};

function App() {
  return (
    <AcademicYearProvider>
      <BrowserRouter>
      <Routes>
        {/* ========================================================================= */}
        {/* UNIFIED INSTITUTIONAL LOGIN (Admin & Staff Login Options)                 */}
        {/* ========================================================================= */}
        <Route path="/login" element={<Login />} />
        <Route path="/staff" element={<Navigate to="/login?mode=staff" replace />} />
        <Route path="/staff/login" element={<Navigate to="/login?mode=staff" replace />} />
        <Route path="/admin/login" element={<Navigate to="/login?mode=admin" replace />} />
        <Route path="/portal" element={<Navigate to="/login" replace />} />

        {/* ========================================================================= */}
        {/* DEDICATED FACULTY STAFF PORTAL (Standalone - NO Admin Sidebar/Controls)    */}
        {/* ========================================================================= */}
        <Route
          path="/staff/portal"
          element={
            <StaffRoute>
              <StaffPortal />
            </StaffRoute>
          }
        />

        {/* ========================================================================= */}
        {/* INSTITUTIONAL ADMIN / EXAM COORDINATOR PORTAL                             */}
        {/* ========================================================================= */}
        <Route
          path="/"
          element={
            <AdminRoute>
              <Layout />
            </AdminRoute>
          }
        >
          <Route index element={<RootRedirect />} />
          <Route path="faculty" element={<FacultyDirectory />} />
          <Route path="faculty/:id" element={<StaffProfile />} />
          <Route path="timetables" element={<Timetables />} />
          <Route path="cie" element={<CIEManagement />} />
          <Route path="schedule" element={<ExamSchedule />} />
          <Route path="allocation/generate" element={<GenerateAllocation />} />
          <Route path="allocation/results" element={<AllocationResults />} />
          <Route path="conflicts" element={<ConflictCenter />} />
          <Route path="analytics" element={<Analytics />} />
          <Route path="reports" element={<Reports />} />
          <Route path="settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </AcademicYearProvider>
  );
}

export default App;
