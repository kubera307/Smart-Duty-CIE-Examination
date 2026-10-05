import React, { useState, useEffect } from 'react';
import { analyticsApi } from '../services/analyticsApi';
import StatCard from '../components/common/StatCard';
import Badge from '../components/common/Badge';
import {
  BarChart3,
  TrendingUp,
  Award,
  Users,
  PieChart as PieChartIcon,
  Layers
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend
} from 'recharts';

const Analytics = () => {
  const [workloadData, setWorkloadData] = useState(null);
  const [cieData, setCieData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAnalytics();
  }, []);

  const loadAnalytics = async () => {
    setLoading(true);
    try {
      const [wRes, cRes] = await Promise.all([
        analyticsApi.getWorkload(),
        analyticsApi.getCie()
      ]);
      setWorkloadData(wRes.data);
      setCieData(cRes.data || []);
    } catch (err) {
      console.error('Error loading analytics:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="py-20 text-center text-xs text-slate-400">
        Computing workload equity metrics and distribution algorithms...
      </div>
    );
  }

  const summary = workloadData?.summary || { average_duties: 0, min_duties: 0, max_duties: 0, total_active_faculty: 0 };
  const designationBreakdown = workloadData?.designation_breakdown || [];
  const expVsWorkload = workloadData?.exp_vs_workload || [];

  const COLORS = ['#0284c7', '#38bdf8', '#818cf8', '#34d399', '#f59e0b'];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="border-b border-slate-200/80 pb-5">
        <div className="flex items-center gap-2 text-xs font-semibold text-sky-600 uppercase tracking-wider mb-1">
          <TrendingUp className="w-4 h-4" />
          <span>Departmental Data & Fairness Metrics</span>
        </div>
        <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Workload & CIE Analytics</h2>
        <p className="text-xs text-slate-500 mt-0.5">
          Mathematical equity auditing, designation-wise duties, and cross-cycle comparative analytics
        </p>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          title="Average Duties"
          value={summary.average_duties}
          subtitle="Duties per faculty"
          icon={TrendingUp}
          color="sky"
        />
        <StatCard
          title="Minimum Duties"
          value={summary.min_duties}
          subtitle="Lowest load assigned"
          icon={Award}
          color="emerald"
        />
        <StatCard
          title="Maximum Duties"
          value={summary.max_duties}
          subtitle="Highest load assigned"
          icon={Award}
          color="amber"
        />
        <StatCard
          title="Active Faculty"
          value={summary.total_active_faculty}
          subtitle="Sample size evaluated"
          icon={Users}
          color="indigo"
        />
      </div>

      {/* Visual Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Chart 1: Designation-Wise Duty Averages */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-sm">
          <div className="border-b border-slate-100 pb-3 mb-4">
            <h3 className="font-bold text-sm text-slate-800">Average Duties by Designation</h3>
            <p className="text-xs text-slate-500 mt-0.5">Assigned workload based on faculty seniority</p>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={designationBreakdown}>
                <XAxis dataKey="designation" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip
                  formatter={(val) => [`${val} duties`, 'Average']}
                  contentStyle={{ fontSize: '11px', borderRadius: '8px' }}
                />
                <Bar dataKey="avg_duties" fill="#0284c7" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 2: CIE Comparative Fulfillment */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-sm">
          <div className="border-b border-slate-100 pb-3 mb-4">
            <h3 className="font-bold text-sm text-slate-800">CIE Cycle Allocation Comparison</h3>
            <p className="text-xs text-slate-500 mt-0.5">Required vs allocated duties across CIE-1, CIE-2, and CIE-3</p>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={cieData}>
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={{ fontSize: '11px', borderRadius: '8px' }} />
                <Legend wrapperStyle={{ fontSize: '11px' }} />
                <Bar dataKey="required" name="Required" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                <Bar dataKey="allocated" name="Allocated" fill="#0284c7" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Experience vs Workload Table */}
      <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-sm">
        <div className="border-b border-slate-100 pb-3 mb-4">
          <h3 className="font-bold text-sm text-slate-800">Individual Faculty Workload Distribution</h3>
          <p className="text-xs text-slate-500 mt-0.5">Cumulative duties correlated with teaching experience</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-100 text-slate-500 text-[10px] uppercase font-semibold">
                <th className="py-2.5 px-3">Faculty Member</th>
                <th className="py-2.5 px-3">Designation</th>
                <th className="py-2.5 px-3 text-center">Experience (Yrs)</th>
                <th className="py-2.5 px-3 text-center">Assigned Duties</th>
                <th className="py-2.5 px-3 text-center">Equity Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {expVsWorkload.map((f, i) => (
                <tr key={i} className="hover:bg-slate-50/50">
                  <td className="py-2.5 px-3 font-semibold text-slate-800">{f.name}</td>
                  <td className="py-2.5 px-3 text-slate-600">{f.designation}</td>
                  <td className="py-2.5 px-3 text-center font-medium text-slate-700">{f.experience}</td>
                  <td className="py-2.5 px-3 text-center font-bold text-slate-900">{f.duties}</td>
                  <td className="py-2.5 px-3 text-center">
                    <Badge variant={f.duties > summary.average_duties ? 'warning' : 'success'}>
                      {f.duties > summary.average_duties ? 'Above Avg' : 'Balanced'}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Analytics;

