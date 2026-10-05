import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  CalendarDays,
  Clock,
  Users,
  FileSpreadsheet,
  GraduationCap,
  LogOut,
  ShieldCheck
} from 'lucide-react';
import { authApi } from '../../services/authApi';

const Sidebar = () => {
  const navigate = useNavigate();

  const handleLogout = () => {
    authApi.logout();
    navigate('/login');
  };

  const navItems = [
    { name: 'Dashboard', path: '/', icon: LayoutDashboard },
    { name: 'Exam Schedule & Duties', path: '/schedule', icon: CalendarDays },
    { name: 'Semester Timetables', path: '/timetables', icon: Clock },
    { name: 'Faculty Directory', path: '/faculty', icon: Users },
    { name: 'Duty Reports & Circulars', path: '/reports', icon: FileSpreadsheet },
  ];

  return (
    <aside className="w-64 bg-[#10213e] text-[#a9bad3] flex flex-col shrink-0 border-r border-[#1c2e4d] h-screen select-none font-sans justify-between">
      <div>
        {/* Institutional Brand Header */}
        <div className="px-5 py-5 border-b border-[#1c2e4d] flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center font-extrabold shadow-md shadow-blue-950/40 shrink-0">
            <GraduationCap className="w-5 h-5 text-white" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h1 className="font-bold text-white text-[15px] tracking-tight leading-none truncate">
                MCE Hassan
              </h1>
            </div>
            <p className="text-[11px] text-blue-200/70 font-medium tracking-wide mt-1 truncate">
              CIE Duty System
            </p>
          </div>
        </div>

        {/* Navigation Menu */}
        <div className="py-4">
          <div className="px-5 text-[11px] font-bold tracking-wider text-[#64748b] uppercase mb-2">
            MAIN MENU
          </div>

          <nav className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  end={item.path === '/'}
                  className={({ isActive }) =>
                    `group flex items-center gap-3 px-3.5 py-2.5 mx-2.5 rounded-lg text-[13.5px] transition-all duration-150 ${
                      isActive
                        ? 'bg-[#1f3b65] text-white font-semibold shadow-sm border-l-[3px] border-blue-500 pl-3'
                        : 'text-[#a9bad3] hover:text-white hover:bg-[#182c4f] font-medium'
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      <span className={`w-5 h-5 flex items-center justify-center shrink-0 ${isActive ? 'text-blue-400' : 'text-[#7f93b1] group-hover:text-white'}`}>
                        <Icon className="w-[18px] h-[18px]" />
                      </span>
                      <span className="truncate">{item.name}</span>
                    </>
                  )}
                </NavLink>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Bottom Coordinator Profile & Logout */}
      <div className="p-3 border-t border-[#1c2e4d] bg-[#0c1a32]/60">
        <div className="flex items-center justify-between px-2 py-1.5 mb-1">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-full bg-blue-600/20 border border-blue-500/30 text-blue-400 font-bold text-xs flex items-center justify-center shrink-0">
              EC
            </div>
            <div className="min-w-0">
              <div className="text-xs font-bold text-white leading-none truncate">Coordinator</div>
              <div className="text-[10px] text-[#7f93b1] leading-none mt-1 truncate">Admin Access</div>
            </div>
          </div>
        </div>

        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 rounded-lg transition-all"
        >
          <LogOut className="w-4 h-4" />
          <span>Sign Out</span>
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
