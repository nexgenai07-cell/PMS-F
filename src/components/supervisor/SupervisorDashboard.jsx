// components/supervisor/SupervisorDashboard.jsx
import { useState, useEffect, useMemo } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import toast from "react-hot-toast";

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
  AreaChart,
  Area,
  CartesianGrid
} from "recharts";

import {
  FolderKanban,
  Users,
  CheckCircle2,
  Activity,
  RefreshCw,
  TrendingUp,
  Award,
  UserCheck,
  Target,
  Clock,
  BarChart3,
  PieChart as PieChartIcon,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  Zap,
  Timer
} from "lucide-react";

import Topbar from "../shared/Topbar";
import {
  PriorityBadge,
  StatusBadge,
  ProgressRing
} from "../shared/UIComponents";
import { getGreeting } from "../../utils/greeting";

import projectService from "../../services/projectService";
import taskService from "../../services/taskService";
import teamService from "../../services/teamService";
import userService from "../../services/userService";

/* ─────────── Shared helpers (kept in sync with Project pages) ─────────── */
function computeTaskProgress(task) {
  const raw = Number(task.progress);
  if (Number.isFinite(raw) && raw > 0) return raw;
  const status = (task.status || '').toLowerCase();
  if (status === 'done' || status === 'completed') return 100;
  if (status === 'review') return 75;
  if (status === 'in_progress' || status === 'in-progress') return 50;
  return 0;
}

// Average of all task progress values for a given project
function computeProjectProgress(projectId, allTasks) {
  const projectTasks = allTasks.filter(t => {
    const taskProjectId = t.p_id || t.p || t.project || t.project_id;
    return Number(taskProjectId) === Number(projectId);
  });
  if (projectTasks.length === 0) return 0;
  const total = projectTasks.reduce((sum, t) => sum + computeTaskProgress(t), 0);
  return Math.round(total / projectTasks.length);
}

const getStatusColor = (status) => {
  const colors = {
    active: "var(--accent-primary)",
    "in-progress": "var(--accent-primary)",
    "in_progress": "var(--accent-primary)",
    todo: "var(--text-muted)",
    pending: "var(--text-muted)",
    review: "var(--accent-amber)",
    done: "var(--accent-emerald)",
    completed: "var(--accent-emerald)",
    close: "var(--accent-emerald)",
    "on-hold": "var(--accent-amber)",
    "on_hold": "var(--accent-amber)",
    cancelled: "var(--accent-rose)",
    planning: "var(--text-muted)"
  };
  return colors[status?.toLowerCase()] || "var(--accent-primary)";
};

const getPriorityColor = (priority) => {
  const colors = {
    low: "var(--accent-emerald)",
    medium: "var(--accent-amber)",
    high: "var(--accent-rose)",
    critical: "var(--accent-secondary)"
  };
  return colors[priority?.toLowerCase()] || "var(--accent-primary)";
};

const isDone = (t) => t.status === "done" || t.status === "completed" || t.status === "close";
const isInProgress = (t) => t.status === "in-progress" || t.status === "in_progress";

const daysAgo = (n, from = new Date()) => {
  const d = new Date(from);
  d.setDate(d.getDate() - n);
  return d;
};

const computeTrend = (current, previous) => {
  if (previous === 0 && current === 0) return { dir: "flat", percent: 0 };
  if (previous === 0) return { dir: "up", percent: 100 };
  const change = Math.round(((current - previous) / previous) * 100);
  if (change === 0) return { dir: "flat", percent: 0 };
  return { dir: change > 0 ? "up" : "down", percent: Math.abs(change) };
};

const dateOf = (item) => new Date(item.created_at || item.start_date || item.updated_at || Date.now());

const buildTrendData = (allTasks, range) => {
  const now = new Date();

  if (range === "week") {
    const out = [];
    for (let i = 6; i >= 0; i--) {
      const day = daysAgo(i, now);
      const dayTasks = allTasks.filter(t => dateOf(t).toDateString() === day.toDateString());
      out.push({
        label: day.toLocaleDateString(undefined, { weekday: "short" }),
        created: dayTasks.length,
        completed: dayTasks.filter(isDone).length
      });
    }
    return out;
  }

  if (range === "year") {
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const currentMonth = now.getMonth();
    const out = [];
    for (let i = 11; i >= 0; i--) {
      const idx = (currentMonth - i + 12) % 12;
      const monthTasks = allTasks.filter(t => dateOf(t).getMonth() === idx);
      out.push({
        label: months[idx],
        created: monthTasks.length,
        completed: monthTasks.filter(isDone).length
      });
    }
    return out;
  }

  const out = [];
  for (let i = 3; i >= 0; i--) {
    const end = daysAgo(i * 7, now);
    const start = daysAgo(i * 7 + 6, now);
    const weekTasks = allTasks.filter(t => {
      const d = dateOf(t);
      return d >= start && d <= end;
    });
    out.push({
      label: `Wk ${4 - i}`,
      created: weekTasks.length,
      completed: weekTasks.filter(isDone).length
    });
  }
  return out;
};

const CustomTooltip = ({ active, payload, label }) =>
  active && payload?.length ? (
    <div className="chart-tooltip">
      <p className="chart-tooltip-label">{label}</p>
      {payload.map((p, i) => (
        <p key={i} className="chart-tooltip-item" style={{ color: p.color || p.fill }}>
          {p.name || p.dataKey}: {p.value}
        </p>
      ))}
    </div>
  ) : null;

const TrendPill = ({ trend }) => {
  if (trend.dir === "flat") {
    return (
      <div className="stat-card-trend flat">
        <Minus size={14} />
        <span>Flat</span>
      </div>
    );
  }
  const Icon = trend.dir === "up" ? ArrowUpRight : ArrowDownRight;
  return (
    <div className={`stat-card-trend ${trend.dir}`}>
      <Icon size={14} />
      <span>{trend.percent}%</span>
    </div>
  );
};

export default function SupervisorDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { onMenuClick } = useOutletContext();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [projects, setProjects] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [teamMembers, setTeamMembers] = useState([]);
  const [users, setUsers] = useState([]);
  const [activeIndex, setActiveIndex] = useState(null);
  const [timeRange, setTimeRange] = useState("month");
  const [projectStatsMap, setProjectStatsMap] = useState({});

  const [stats, setStats] = useState({
    totalProjects: 0,
    activeProjects: 0,
    totalTasks: 0,
    doneTasks: 0,
    completionPercent: 0,
    totalMembers: 0,
    totalLeads: 0,
    inProgressTasks: 0,
    onTimeRate: 0,
    avgCompletionDays: 0
  });

  const [trends, setTrends] = useState({
    projects: { dir: "flat", percent: 0 },
    doneTasks: { dir: "flat", percent: 0 },
    inProgressTasks: { dir: "flat", percent: 0 },
    completionPercent: { dir: "flat", percent: 0 }
  });

  const [statusData, setStatusData] = useState([]);
  const [priorityData, setPriorityData] = useState([]);
  const [teamProductivity, setTeamProductivity] = useState([]);
  const [projectHealth, setProjectHealth] = useState([]);
  const [recentActivity, setRecentActivity] = useState([]);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const taskTrendData = useMemo(() => buildTrendData(tasks, timeRange), [tasks, timeRange]);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);

      const [projectsData, tasksData, membersData, usersData] = await Promise.all([
        projectService.getProjects(),
        taskService.getTasks(),
        teamService.getTeamMembers(),
        userService.getUsers(),
      ]);

      const allProjects = projectsData?.data || projectsData || [];
      const allTasks = tasksData?.data || tasksData || [];
      const allMembers = membersData?.data || membersData || [];
      const allUsers = usersData?.data || usersData || [];

      const currentUserId = Number(user?.id || user?.u_id);
      const userName = (user?.u_name || '').toLowerCase().trim();

      const userTeamMember = allMembers.find(m =>
        (m.name || '').toLowerCase().trim() === userName
      );
      const teamMemberId = userTeamMember ? Number(userTeamMember.id) : null;

      console.log('👤 Current user:', userName, 'TeamMember ID:', teamMemberId);

      // Projects created by this user
      const createdProjects = allProjects.filter(p =>
        Number(p.created_by) === currentUserId
      );
      const createdProjectIds = createdProjects.map(p => Number(p.p_id || p.id));

      // Projects where this user is assigned to tasks
      const assignedProjectIds = new Set();
      allTasks.forEach(t => {
        const assignTo = Number(t.assign_to || t.assignedTo);
        if (assignTo === teamMemberId) {
          assignedProjectIds.add(Number(t.p_id || t.p));
        }
      });
      allTasks.forEach(t => {
        const assigneeName = (t.assign_to_name || '').toLowerCase().trim();
        if (assigneeName === userName) {
          assignedProjectIds.add(Number(t.p_id || t.p));
        }
      });

      const allProjectIds = [...new Set([...createdProjectIds, ...assignedProjectIds])];

      const userProjects = allProjects.filter(p =>
        allProjectIds.includes(Number(p.p_id || p.id))
      );
      const userTasks = allTasks.filter(t =>
        allProjectIds.includes(Number(t.p_id || t.p))
      );

      console.log('📊 Projects found:', userProjects.length);
      console.log('📊 Tasks found:', userTasks.length);

      setProjects(userProjects);
      setTasks(userTasks);
      setTeamMembers(allMembers);
      setUsers(allUsers);

      // ─── Stats ───
      // Backend stats (used for completed / in-progress / onTime counts)
      let totalTasks = 0;
      let doneTasks = 0;
      let inProgressTasks = 0;
      let totalOnTime = 0;
      let totalCompletedTasks = 0;
      const statsMap = {};

      for (const project of userProjects) {
        const projectId = project.p_id || project.id;
        try {
          const statsResponse = await projectService.getProjectStats(projectId);
          const s = statsResponse?.data || {};
          statsMap[projectId] = s;
          totalTasks += s.totalTasks || 0;
          doneTasks += s.completedTasks || 0;
          inProgressTasks += s.inProgressTasks || 0;
          totalOnTime += s.onTimeRate || 0;
          totalCompletedTasks += s.completedTasks || 0;
        } catch (error) {
          console.error(`Error fetching stats for project ${projectId}:`, error);
        }
      }
      setProjectStatsMap(statsMap);

      const totalProjects = userProjects.length;
      const activeProjects = userProjects.filter(p =>
        p.status === "active" || p.status === "in-progress" || p.status === "in_progress"
      ).length;

      // ⭐ Completion rate = average of all task progress values
      // This must match the project pages which also average task progress.
      const completionPercent = (() => {
        if (userTasks.length === 0) return 0;
        const total = userTasks.reduce((sum, t) => sum + computeTaskProgress(t), 0);
        return Math.round(total / userTasks.length);
      })();

      // On-time rate from backend stats (across completed tasks)
      const onTimeRate = totalCompletedTasks > 0
        ? Math.round((totalOnTime / totalCompletedTasks) * 100)
        : 0;

      const leads = allUsers.filter(u =>
        u.role?.toLowerCase() === 'member' || u.role?.toLowerCase() === 'lead'
      ).length;

      const completedTasksList = userTasks.filter(isDone);
      const timedCompletions = completedTasksList.filter(t => t.created_at && t.updated_at);
      const avgCompletionDays = timedCompletions.length === 0 ? 0 : (
        timedCompletions.reduce((sum, t) => {
          const diff = (new Date(t.updated_at) - new Date(t.created_at)) / (1000 * 60 * 60 * 24);
          return sum + Math.max(diff, 0);
        }, 0) / timedCompletions.length
      ).toFixed(1);

      setStats({
        totalProjects,
        activeProjects,
        totalTasks,
        doneTasks,
        completionPercent,
        totalMembers: allMembers.length,
        totalLeads: leads,
        inProgressTasks,
        onTimeRate,
        avgCompletionDays
      });

      // ─── Trends ───
      const now = new Date();
      const weekStart = daysAgo(6, now);
      const prevWeekEnd = daysAgo(7, now);
      const prevWeekStart = daysAgo(13, now);

      const inRange = (item, start, end) => {
        const d = dateOf(item);
        return d >= start && d <= end;
      };

      const projectsThisWeek = userProjects.filter(p => inRange(p, weekStart, now)).length;
      const projectsPrevWeek = userProjects.filter(p => inRange(p, prevWeekStart, prevWeekEnd)).length;

      const doneThisWeek = completedTasksList.filter(t => {
        const d = new Date(t.updated_at || t.created_at);
        return d >= weekStart && d <= now;
      }).length;
      const donePrevWeek = completedTasksList.filter(t => {
        const d = new Date(t.updated_at || t.created_at);
        return d >= prevWeekStart && d <= prevWeekEnd;
      }).length;

      const inProgThisWeek = userTasks.filter(t => isInProgress(t) && inRange(t, weekStart, now)).length;
      const inProgPrevWeek = userTasks.filter(t => isInProgress(t) && inRange(t, prevWeekStart, prevWeekEnd)).length;

      const tasksThisWeek = userTasks.filter(t => inRange(t, weekStart, now));
      const tasksPrevWeek = userTasks.filter(t => inRange(t, prevWeekStart, prevWeekEnd));
      const completionThisWeek = tasksThisWeek.length === 0 ? 0 : Math.round((tasksThisWeek.filter(isDone).length / tasksThisWeek.length) * 100);
      const completionPrevWeek = tasksPrevWeek.length === 0 ? 0 : Math.round((tasksPrevWeek.filter(isDone).length / tasksPrevWeek.length) * 100);

      setTrends({
        projects: computeTrend(projectsThisWeek, projectsPrevWeek),
        doneTasks: computeTrend(doneThisWeek, donePrevWeek),
        inProgressTasks: computeTrend(inProgThisWeek, inProgPrevWeek),
        completionPercent: computeTrend(completionThisWeek, completionPrevWeek)
      });

      // ─── Status Data ───
      const statusCounts = userProjects.reduce((acc, p) => {
        const status = p.status || "planning";
        acc[status] = (acc[status] || 0) + 1;
        return acc;
      }, {});
      setStatusData(Object.entries(statusCounts).map(([name, value]) => ({
        name: name.charAt(0).toUpperCase() + name.slice(1).replace(/_/g, " ").replace(/-/g, " "),
        value,
        fill: getStatusColor(name)
      })));

      // ─── Priority Data ───
      const priorityCounts = userProjects.reduce((acc, p) => {
        const priority = p.priority || "medium";
        acc[priority] = (acc[priority] || 0) + 1;
        return acc;
      }, {});
      setPriorityData(Object.entries(priorityCounts).map(([name, value]) => ({
        name: name.charAt(0).toUpperCase() + name.slice(1),
        value,
        fill: getPriorityColor(name)
      })));

      // ─── Team Productivity ───
      const productivityData = allMembers.slice(0, 8).map(member => {
        const memberId = member.id;
        const memberTasks = userTasks.filter(t =>
          t.assign_to === memberId ||
          t.assignedTo === memberId
        );
        const completed = memberTasks.filter(isDone).length;
        return {
          name: (member.name || "?").split(" ")[0],
          tasks: memberTasks.length,
          completed: completed,
          progress: memberTasks.length === 0 ? 0 : Math.round((completed / memberTasks.length) * 100)
        };
      });
      setTeamProductivity(productivityData);

      // ⭐ Project Health — use computed average of task progress, same as project pages.
      const healthData = userProjects.slice(0, 8).map(project => {
        const projectId = project.p_id || project.id;
        const projectStats = statsMap[projectId] || {};
        const computedProgress = computeProjectProgress(projectId, allTasks);
        const lead = allUsers.find(u =>
          Number(u.id || u.u_id) === Number(project.created_by || project.lead_id)
        );

        return {
          ...project,
          progress: computedProgress,
          done: projectStats.completedTasks || 0,
          total: projectStats.totalTasks || 0,
          lead: lead?.u_name || lead?.name || "Unassigned"
        };
      });
      setProjectHealth(healthData);

      // ─── Recent Activity ───
      const recent = [...userTasks]
        .sort((a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at))
        .slice(0, 5)
        .map(t => ({
          id: t.t_id || t.id,
          title: t.title,
          status: t.status,
          updated: t.updated_at || t.created_at,
          user: t.assignee_name || "System"
        }));
      setRecentActivity(recent);

    } catch (error) {
      console.error("Failed to fetch dashboard data:", error);
      toast.error("Failed to load dashboard data");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchDashboardData();
    toast.success("Dashboard refreshed");
  };

  if (loading) {
    return (
      <div>
        <Topbar title="Supervisor Dashboard" onMenuClick={onMenuClick} />
        <div className="page-container">
          <div className="loading-spinner-wrapper">
            <div className="loading-spinner" />
            <p>Loading dashboard...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <Topbar
        title={
          <span className="greeting-text">
            {getGreeting()}, {user?.u_name?.split(' ')[0] || 'User'}
            <span className="greeting-wave">👋</span>
          </span>
        }
        onMenuClick={onMenuClick}
        actions={
          <button
            className="btn btn-secondary btn-sm refresh-btn"
            onClick={handleRefresh}
            disabled={refreshing}
          >
            <RefreshCw size={14} className={refreshing ? 'spin' : ''} />
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>
        }
      />

      <div className="page-container supervisor-dashboard">

        {/* ─── QUICK STATS ─── */}
        <div className="stats-grid">
          <div className="stat-card-modern">
            <div className="stat-card-icon purple">
              <FolderKanban size={20} />
            </div>
            <div className="stat-card-content">
              <span className="stat-card-value">{stats.totalProjects}</span>
              <span className="stat-card-label">My Projects</span>
            </div>
            <TrendPill trend={trends.projects} />
          </div>

          <div className="stat-card-modern">
            <div className="stat-card-icon emerald">
              <CheckCircle2 size={20} />
            </div>
            <div className="stat-card-content">
              <span className="stat-card-value">{stats.doneTasks}</span>
              <span className="stat-card-label">Tasks Completed</span>
            </div>
            <TrendPill trend={trends.doneTasks} />
          </div>

          <div className="stat-card-modern">
            <div className="stat-card-icon amber">
              <Clock size={20} />
            </div>
            <div className="stat-card-content">
              <span className="stat-card-value">{stats.inProgressTasks}</span>
              <span className="stat-card-label">In Progress</span>
            </div>
            <TrendPill trend={trends.inProgressTasks} />
          </div>

          <div className="stat-card-modern">
            <div className="stat-card-icon teal">
              <Award size={20} />
            </div>
            <div className="stat-card-content">
              <span className="stat-card-value">{stats.completionPercent}%</span>
              <span className="stat-card-label">Completion Rate</span>
            </div>
            <TrendPill trend={trends.completionPercent} />
          </div>
        </div>

        {/* ─── SECONDARY STATS ─── */}
        <div className="stats-grid-secondary">
          <div className="stat-card-mini">
            <Users size={16} className="stat-mini-icon" />
            <div>
              <span className="stat-mini-value">{stats.totalMembers}</span>
              <span className="stat-mini-label">Team Members</span>
            </div>
          </div>
          <div className="stat-card-mini">
            <UserCheck size={16} className="stat-mini-icon" />
            <div>
              <span className="stat-mini-value">{stats.totalLeads}</span>
              <span className="stat-mini-label">Leads</span>
            </div>
          </div>
          <div className="stat-card-mini">
            <Target size={16} className="stat-mini-icon" />
            <div>
              <span className="stat-mini-value">{stats.onTimeRate}%</span>
              <span className="stat-mini-label">On-Time Rate</span>
            </div>
          </div>
          <div className="stat-card-mini">
            <Activity size={16} className="stat-mini-icon" />
            <div>
              <span className="stat-mini-value">{stats.activeProjects}</span>
              <span className="stat-mini-label">Active Projects</span>
            </div>
          </div>
          <div className="stat-card-mini">
            <Timer size={16} className="stat-mini-icon" />
            <div>
              <span className="stat-mini-value">{stats.avgCompletionDays}d</span>
              <span className="stat-mini-label">Avg. Completion</span>
            </div>
          </div>
        </div>

        {/* ─── CHARTS ROW 1 ─── */}
        <div className="charts-row">
          <div className="chart-card">
            <div className="chart-card-header">
              <h3 className="chart-card-title">
                <TrendingUp size={16} />
                Task Activity
              </h3>
              <div className="chart-card-actions">
                <button type="button" className={`time-btn ${timeRange === 'week' ? 'active' : ''}`} onClick={() => setTimeRange('week')}>Week</button>
                <button type="button" className={`time-btn ${timeRange === 'month' ? 'active' : ''}`} onClick={() => setTimeRange('month')}>Month</button>
                <button type="button" className={`time-btn ${timeRange === 'year' ? 'active' : ''}`} onClick={() => setTimeRange('year')}>Year</button>
              </div>
            </div>
            <div className="chart-container">
              {taskTrendData.every(d => d.created === 0) ? (
                <div className="chart-empty">No task activity in this period</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={taskTrendData}>
                    <defs>
                      <linearGradient id="createdGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--accent-primary)" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="var(--accent-primary)" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="completedGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--accent-emerald)" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="var(--accent-emerald)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} opacity={0.5} />
                    <XAxis dataKey="label" fontSize={11} stroke="var(--text-muted)" tickLine={false} axisLine={false} />
                    <YAxis fontSize={11} stroke="var(--text-muted)" tickLine={false} axisLine={false} allowDecimals={false} />
                    <Tooltip content={<CustomTooltip />} />
                    <Area type="monotone" dataKey="created" name="Created" stroke="var(--accent-primary)" strokeWidth={2} fillOpacity={1} fill="url(#createdGradient)" />
                    <Area type="monotone" dataKey="completed" name="Completed" stroke="var(--accent-emerald)" strokeWidth={2} fillOpacity={1} fill="url(#completedGradient)" />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          <div className="chart-card">
            <div className="chart-card-header">
              <h3 className="chart-card-title">
                <PieChartIcon size={16} />
                Project Status
              </h3>
              <span className="chart-badge">{statusData.reduce((a, b) => a + b.value, 0)} total</span>
            </div>
            <div className="pie-chart-wrapper">
              <div className="pie-chart-container">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={statusData.length > 0 ? statusData : [{ name: "No Data", value: 1, fill: "var(--text-muted)" }]}
                      innerRadius="50%"
                      outerRadius="80%"
                      paddingAngle={2}
                      dataKey="value"
                      cx="50%"
                      cy="50%"
                      onMouseEnter={(_, index) => setActiveIndex(index)}
                      onMouseLeave={() => setActiveIndex(null)}
                    >
                      {(statusData.length > 0 ? statusData : [{ name: "No Data", value: 1, fill: "var(--text-muted)" }]).map((entry, index) => (
                        <Cell
                          key={index}
                          fill={entry.fill}
                          style={{
                            opacity: activeIndex === null || activeIndex === index ? 1 : 0.5,
                            transform: activeIndex === index ? "scale(1.04)" : "scale(1)",
                            transformOrigin: "center",
                            transition: "all 0.3s ease"
                          }}
                        />
                      ))}
                    </Pie>
                    <Tooltip content={<CustomTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="pie-center-label">
                  <span className="pie-center-value">{statusData.reduce((a, b) => a + b.value, 0)}</span>
                  <span className="pie-center-text">Projects</span>
                </div>
              </div>
              <div className="pie-legend">
                {statusData.length > 0 ? statusData.map((s, i) => {
                  const total = statusData.reduce((a, b) => a + b.value, 0);
                  const percent = total ? Math.round((s.value / total) * 100) : 0;
                  return (
                    <button
                      type="button"
                      key={i}
                      onMouseEnter={() => setActiveIndex(i)}
                      onMouseLeave={() => setActiveIndex(null)}
                      onFocus={() => setActiveIndex(i)}
                      onBlur={() => setActiveIndex(null)}
                      className="pie-legend-item"
                    >
                      <span className="pie-legend-dot" style={{ background: s.fill }} />
                      <span className="pie-legend-name">{s.name}</span>
                      <span className="pie-legend-value">{percent}%</span>
                    </button>
                  );
                }) : (
                  <div className="pie-legend-empty">No data available</div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ─── CHARTS ROW 2 ─── */}
        <div className="charts-row">
          <div className="chart-card">
            <div className="chart-card-header">
              <h3 className="chart-card-title">
                <Users size={16} />
                Team Productivity
              </h3>
              <span className="chart-badge">Top performers</span>
            </div>
            <div className="chart-container">
              {teamProductivity.length === 0 ? (
                <div className="chart-empty">No team members yet</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={teamProductivity}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} opacity={0.5} />
                    <XAxis dataKey="name" fontSize={11} stroke="var(--text-muted)" tickLine={false} axisLine={false} />
                    <YAxis fontSize={11} stroke="var(--text-muted)" tickLine={false} axisLine={false} allowDecimals={false} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="tasks" name="Assigned" fill="var(--accent-primary)" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="completed" name="Completed" fill="var(--accent-emerald)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          <div className="chart-card">
            <div className="chart-card-header">
              <h3 className="chart-card-title">
                <BarChart3 size={16} />
                Priority Distribution
              </h3>
              <span className="chart-badge">By project</span>
            </div>
            <div className="chart-container">
              {priorityData.length === 0 ? (
                <div className="chart-empty">No projects yet</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={priorityData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" horizontal={false} opacity={0.5} />
                    <XAxis type="number" fontSize={11} stroke="var(--text-muted)" tickLine={false} axisLine={false} allowDecimals={false} />
                    <YAxis dataKey="name" type="category" fontSize={11} stroke="var(--text-muted)" tickLine={false} axisLine={false} width={60} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="value" name="Projects" radius={[0, 6, 6, 0]}>
                      {priorityData.map((e, i) => (
                        <Cell key={i} fill={e.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>

        {/* ─── PROJECT HEALTH & RECENT ACTIVITY ─── */}
        <div className="dashboard-bottom">
          <div className="health-card">
            <div className="health-card-header">
              <h3 className="health-card-title">
                <FolderKanban size={16} />
                Project Health
              </h3>
              <button type="button" className="view-all-btn" onClick={() => navigate('/supervisor/projects')}>
                View all →
              </button>
            </div>

            <div className="health-list">
              {projectHealth.length === 0 ? (
                <div className="health-empty">No projects yet.</div>
              ) : (
                projectHealth.map((project) => {
                  const progress = project.progress || 0;
                  const hc = progress >= 70 ? "var(--accent-emerald)" : progress >= 40 ? "var(--accent-amber)" : "var(--accent-rose)";

                  return (
                    <button
                      type="button"
                      key={project.p_id || project.id}
                      className="health-item"
                      onClick={() => navigate(`/supervisor/projects/${project.p_id || project.id}`)}
                    >
                      <div className="health-progress">
                        <ProgressRing progress={progress} size={44} strokeWidth={4} color={hc} />
                        <span className="health-progress-text" style={{ color: hc }}>{progress}%</span>
                      </div>

                      <div className="health-info">
                        <p className="health-name">{project.p_name || project.name}</p>
                        <p className="health-sub">
                          Lead: {project.lead || "Unassigned"} · {project.done}/{project.total} tasks
                        </p>
                      </div>

                      <div className="health-badges">
                        <PriorityBadge priority={project.priority} />
                        <StatusBadge status={project.status} />
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          <div className="activity-card">
            <div className="activity-card-header">
              <h3 className="activity-card-title">
                <Zap size={16} />
                Recent Activity
              </h3>
              <span className="activity-badge">Live</span>
            </div>

            <div className="activity-list">
              {recentActivity.length === 0 ? (
                <div className="activity-empty">No recent activity</div>
              ) : (
                recentActivity.map((item) => (
                  <div key={item.id} className="activity-item">
                    <div className="activity-dot" style={{ background: getStatusColor(item.status) }} />
                    <div className="activity-content">
                      <p className="activity-text">{item.title}</p>
                      <div className="activity-meta">
                        <span className="activity-status">
                          <StatusBadge status={item.status} />
                        </span>
                        <span className="activity-time">
                          {item.updated ? new Date(item.updated).toLocaleDateString() : 'Recently'}
                        </span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

      </div>

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        .spin { animation: spin 1s linear infinite; }

        .loading-spinner-wrapper {
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          gap: 12px;
          height: 400px;
          color: var(--text-muted);
        }

        .loading-spinner {
          width: 40px;
          height: 40px;
          border: 3px solid var(--border-subtle);
          border-top-color: var(--accent-primary);
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }

        .greeting-text {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .greeting-wave {
          font-size: 20px;
        }

        .refresh-btn {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        /* ─── STATS GRID ─── */
        .stats-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 16px;
          margin-bottom: 16px;
        }

        .stat-card-modern {
          display: flex;
          align-items: center;
          gap: 14px;
          padding: 18px 20px;
          background: var(--bg-card);
          border: 1px solid var(--border-subtle);
          border-radius: 14px;
          transition: all 0.2s ease;
          position: relative;
        }

        .stat-card-modern:hover {
          border-color: var(--accent-primary);
          transform: translateY(-2px);
          box-shadow: var(--shadow-md);
        }

        .stat-card-icon {
          width: 44px;
          height: 44px;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .stat-card-icon.purple { background: rgba(129, 140, 248, 0.12); color: #818cf8; }
        .stat-card-icon.emerald { background: rgba(52, 211, 153, 0.12); color: #34d399; }
        .stat-card-icon.amber { background: rgba(245, 158, 11, 0.12); color: #f59e0b; }
        .stat-card-icon.teal { background: rgba(45, 212, 191, 0.12); color: #2dd4bf; }

        .stat-card-content {
          flex: 1;
        }

        .stat-card-value {
          display: block;
          font-size: 24px;
          font-weight: 800;
          color: var(--text-primary);
          line-height: 1.2;
        }

        .stat-card-label {
          font-size: 12px;
          color: var(--text-muted);
          font-weight: 500;
        }

        .stat-card-trend {
          display: flex;
          align-items: center;
          gap: 2px;
          font-size: 11px;
          font-weight: 700;
          padding: 2px 8px;
          border-radius: 20px;
          flex-shrink: 0;
        }

        .stat-card-trend.up { background: rgba(52, 211, 153, 0.12); color: #34d399; }
        .stat-card-trend.down { background: rgba(248, 113, 113, 0.12); color: #f87171; }
        .stat-card-trend.flat { background: rgba(148, 163, 184, 0.12); color: #94a3b8; }

        /* ─── SECONDARY STATS ─── */
        .stats-grid-secondary {
          display: grid;
          grid-template-columns: repeat(5, 1fr);
          gap: 12px;
          margin-bottom: 24px;
        }

        .stat-card-mini {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 12px 16px;
          background: var(--bg-secondary);
          border: 1px solid var(--border-subtle);
          border-radius: 10px;
        }

        .stat-mini-icon {
          color: var(--text-muted);
          flex-shrink: 0;
        }

        .stat-mini-value {
          display: block;
          font-size: 16px;
          font-weight: 700;
          color: var(--text-primary);
          line-height: 1.2;
        }

        .stat-mini-label {
          font-size: 11px;
          color: var(--text-muted);
        }

        /* ─── CHARTS ─── */
        .charts-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
          margin-bottom: 20px;
        }

        .chart-card {
          background: var(--bg-card);
          border: 1px solid var(--border-subtle);
          border-radius: 14px;
          padding: 20px;
          transition: all 0.2s ease;
        }

        .chart-card:hover {
          border-color: var(--border-default);
        }

        .chart-card-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 16px;
          gap: 10px;
          flex-wrap: wrap;
        }

        .chart-card-title {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 14px;
          font-weight: 700;
          color: var(--text-primary);
        }

        .chart-card-actions {
          display: flex;
          gap: 4px;
          background: var(--bg-secondary);
          padding: 3px;
          border-radius: 8px;
        }

        .time-btn {
          padding: 4px 12px;
          border: none;
          border-radius: 6px;
          font-size: 11px;
          font-weight: 600;
          color: var(--text-muted);
          background: transparent;
          cursor: pointer;
          transition: all 0.15s;
        }

        .time-btn:hover { color: var(--text-primary); }
        .time-btn.active { background: var(--accent-primary); color: #fff; }

        .chart-badge {
          font-size: 11px;
          font-weight: 600;
          color: var(--text-muted);
          background: var(--bg-secondary);
          padding: 3px 10px;
          border-radius: 20px;
          flex-shrink: 0;
        }

        .chart-container {
          width: 100%;
          height: 200px;
        }

        .chart-empty {
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 13px;
          color: var(--text-muted);
        }

        /* ─── PIE CHART ─── */
        .pie-chart-wrapper {
          display: flex;
          align-items: center;
          gap: 20px;
        }

        .pie-chart-container {
          position: relative;
          width: 180px;
          height: 180px;
          flex-shrink: 0;
        }

        .pie-center-label {
          position: absolute;
          inset: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          pointer-events: none;
        }

        .pie-center-value {
          font-size: 24px;
          font-weight: 900;
          color: var(--text-primary);
          line-height: 1;
        }

        .pie-center-text {
          font-size: 10px;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .pie-legend {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 6px;
          min-width: 100px;
        }

        .pie-legend-item {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 4px 8px;
          border-radius: 6px;
          cursor: pointer;
          transition: background 0.15s;
          border: none;
          background: transparent;
          width: 100%;
          text-align: left;
          font-family: inherit;
        }

        .pie-legend-item:hover,
        .pie-legend-item:focus-visible {
          background: var(--bg-secondary);
          outline: none;
        }

        .pie-legend-dot {
          width: 10px;
          height: 10px;
          border-radius: 3px;
          flex-shrink: 0;
        }

        .pie-legend-name {
          flex: 1;
          font-size: 12px;
          color: var(--text-secondary);
        }

        .pie-legend-value {
          font-size: 12px;
          font-weight: 700;
          color: var(--text-primary);
        }

        .pie-legend-empty {
          font-size: 12px;
          color: var(--text-muted);
          padding: 8px 0;
        }

        /* ─── CHART TOOLTIP ─── */
        .chart-tooltip {
          background: var(--bg-card);
          border: 1px solid var(--border-default);
          border-radius: 10px;
          padding: 10px 14px;
          box-shadow: var(--shadow-md);
        }

        .chart-tooltip-label {
          font-weight: 700;
          font-size: 13px;
          color: var(--text-primary);
          margin-bottom: 4px;
        }

        .chart-tooltip-item {
          font-size: 12px;
          color: var(--text-secondary);
          margin: 2px 0;
        }

        /* ─── BOTTOM SECTION ─── */
        .dashboard-bottom {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
        }

        .health-card {
          background: var(--bg-card);
          border: 1px solid var(--border-subtle);
          border-radius: 14px;
          padding: 20px;
        }

        .health-card-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 16px;
        }

        .health-card-title {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 14px;
          font-weight: 700;
          color: var(--text-primary);
        }

        .view-all-btn {
          font-size: 12px;
          font-weight: 600;
          color: var(--text-muted);
          background: none;
          border: none;
          cursor: pointer;
          transition: color 0.15s;
        }

        .view-all-btn:hover {
          color: var(--accent-primary);
        }

        .health-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
          max-height: 320px;
          overflow-y: auto;
        }

        .health-item {
          display: flex;
          align-items: center;
          gap: 14px;
          padding: 10px 14px;
          background: var(--bg-secondary);
          border: 1px solid var(--border-subtle);
          border-radius: 10px;
          cursor: pointer;
          transition: all 0.15s;
          width: 100%;
          text-align: left;
          font-family: inherit;
          color: inherit;
        }

        .health-item:hover,
        .health-item:focus-visible {
          border-color: var(--accent-primary);
          background: var(--bg-card);
          outline: none;
        }

        .health-progress {
          position: relative;
          width: 44px;
          height: 44px;
          flex-shrink: 0;
        }

        .health-progress-text {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 10px;
          font-weight: 700;
        }

        .health-info {
          flex: 1;
          min-width: 0;
        }

        .health-name {
          font-size: 13px;
          font-weight: 600;
          color: var(--text-primary);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .health-sub {
          font-size: 11px;
          color: var(--text-muted);
        }

        .health-badges {
          display: flex;
          gap: 6px;
          flex-shrink: 0;
        }

        .health-empty {
          text-align: center;
          padding: 30px 0;
          color: var(--text-muted);
          font-size: 13px;
        }

        .activity-card {
          background: var(--bg-card);
          border: 1px solid var(--border-subtle);
          border-radius: 14px;
          padding: 20px;
        }

        .activity-card-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 16px;
        }

        .activity-card-title {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 14px;
          font-weight: 700;
          color: var(--text-primary);
        }

        .activity-badge {
          font-size: 10px;
          font-weight: 700;
          text-transform: uppercase;
          color: var(--accent-emerald);
          background: rgba(52, 211, 153, 0.12);
          padding: 2px 10px;
          border-radius: 20px;
          animation: pulse-dot 2s ease-in-out infinite;
        }

        @keyframes pulse-dot {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }

        .activity-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
          max-height: 320px;
          overflow-y: auto;
        }

        .activity-item {
          display: flex;
          align-items: flex-start;
          gap: 12px;
          padding: 10px 14px;
          background: var(--bg-secondary);
          border-radius: 10px;
          border: 1px solid var(--border-subtle);
        }

        .activity-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          flex-shrink: 0;
          margin-top: 6px;
        }

        .activity-content {
          flex: 1;
          min-width: 0;
        }

        .activity-text {
          font-size: 13px;
          font-weight: 500;
          color: var(--text-primary);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .activity-meta {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-top: 4px;
        }

        .activity-status {
          display: inline-flex;
        }

        .activity-time {
          font-size: 11px;
          color: var(--text-muted);
        }

        .activity-empty {
          text-align: center;
          padding: 30px 0;
          color: var(--text-muted);
          font-size: 13px;
        }

        /* ─── RESPONSIVE ─── */
        @media (max-width: 1200px) {
          .stats-grid { grid-template-columns: repeat(2, 1fr); }
          .stats-grid-secondary { grid-template-columns: repeat(3, 1fr); }
        }

        @media (max-width: 992px) {
          .charts-row { grid-template-columns: 1fr; }
          .dashboard-bottom { grid-template-columns: 1fr; }
        }

        @media (max-width: 768px) {
          .stats-grid { grid-template-columns: 1fr 1fr; }
          .stats-grid-secondary { grid-template-columns: 1fr 1fr; }
          .pie-chart-wrapper { flex-direction: column; }
          .pie-chart-container { width: 140px; height: 140px; }
          .chart-card { padding: 16px; }
          .chart-container { height: 160px; }
          .health-item { flex-wrap: wrap; }
          .health-badges { width: 100%; margin-top: 4px; }
        }

        @media (max-width: 480px) {
          .stats-grid { grid-template-columns: 1fr; }
          .stats-grid-secondary { grid-template-columns: 1fr; }
          .stat-card-modern { padding: 14px 16px; }
          .stat-card-value { font-size: 20px; }
          .chart-card-header { flex-direction: column; align-items: flex-start; gap: 8px; }
          .page-container.supervisor-dashboard { padding: 10px; }
          .health-item { padding: 8px 12px; }
          .activity-item { padding: 8px 12px; }
        }
      `}</style>
    </div>
  );
}