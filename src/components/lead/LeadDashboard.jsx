// components/lead/LeadDashboard.jsx
import { useState, useEffect } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  FolderKanban,
  CheckCircle2,
  Users,
  Clock,
  ArrowRight,
  RefreshCw,
  TrendingUp,
  Award,
  Target,
  Zap,
  Calendar,
  BarChart3,
  PieChart as PieChartIcon,
  ArrowUpRight,
  ArrowDownRight,
  Sparkles,
  MoreHorizontal,
  AlertCircle
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Cell,
  PieChart,
  Pie,
  Legend,
  AreaChart,
  Area
} from 'recharts';
import Topbar from '../shared/Topbar';
import StatCard from '../shared/StatCard';
import { getGreeting } from '../../utils/greeting';
import {
  PriorityBadge,
  StatusBadge,
  ProgressRing,
  AvatarGroup
} from '../shared/UIComponents';
import projectService from '../../services/projectService';
import taskService from '../../services/taskService';
import teamService from '../../services/teamService';
import toast from 'react-hot-toast';

export default function LeadDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const context = useOutletContext();
  const onMenuClick = context?.onMenuClick || (() => console.log('Menu click'));

  // State
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [projects, setProjects] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [teamMembers, setTeamMembers] = useState([]);
  const [activeIndex, setActiveIndex] = useState(null);
  const [projectStatsMap, setProjectStatsMap] = useState({});
  const [stats, setStats] = useState({
    totalProjects: 0,
    totalTasks: 0,
    completedTasks: 0,
    inProgressTasks: 0,
    teamMembers: 0,
    onTimeRate: 0,
    completionRate: 0
  });

  // Fetch data
  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      
      const [projectsData, tasksData, membersData] = await Promise.all([
        projectService.getProjects(),
        taskService.getTasks(),
        teamService.getTeamMembers(),
      ]);

      const allProjects = projectsData?.data || projectsData || [];
      const tasksList = tasksData?.data || tasksData || [];
      const membersList = membersData?.data || membersData || [];

      const userId = user?.id || user?.u_id;
      
      // Find projects where this lead is the creator
      const userProjects = allProjects.filter(p => {
        const isCreator = Number(p.created_by) === Number(userId);
        return isCreator;
      });
      
      // Also find TeamMember for this lead (match by name)
      const teamMember = membersList.find(m => {
        const memberName = (m.name || '').toLowerCase().trim();
        const userName = (user?.u_name || '').toLowerCase().trim();
        return memberName === userName;
      });
      const teamMemberId = teamMember ? Number(teamMember.id) : null;
      
      // Get project IDs from user's projects
      const createdProjectIds = userProjects.map(p => Number(p.p_id || p.id));
      
      // Get project IDs from tasks assigned to this lead
      const assignedProjectIds = tasksList
        .filter(t => Number(t.assign_to) === teamMemberId)
        .map(t => Number(t.p_id || t.p));
      
      // Combine all project IDs
      const allProjectIds = [...new Set([...createdProjectIds, ...assignedProjectIds])];
      
      // Get all projects the lead is involved in
      const involvedProjects = allProjects.filter(p => 
        allProjectIds.includes(Number(p.p_id || p.id))
      );

      // ✅ Get stats for each project using the stats endpoint
      let totalTasks = 0;
      let completedTasks = 0;
      let inProgressTasks = 0;
      let totalCompletion = 0;
      const statsMap = {};

      for (const project of involvedProjects) {
        const projectId = Number(project.p_id || project.id);
        try {
          const statsResponse = await projectService.getProjectStats(projectId);
          const stats = statsResponse?.data || {};
          statsMap[projectId] = stats;
          totalTasks += stats.totalTasks || 0;
          completedTasks += stats.completedTasks || 0;
          inProgressTasks += stats.inProgressTasks || 0;
          totalCompletion += stats.completionRate || 0;
        } catch (error) {
          console.error(`Error fetching stats for project ${projectId}:`, error);
        }
      }

      setProjectStatsMap(statsMap);

      // Get unique team members from tasks
      const memberIds = new Set();
      tasksList.forEach(t => {
        if (t.assign_to) memberIds.add(Number(t.assign_to));
      });
      const uniqueMembers = membersList.filter(m => 
        memberIds.has(Number(m.id))
      );

      const completionRate = involvedProjects.length > 0 
        ? Math.round(totalCompletion / involvedProjects.length) 
        : 0;
      
      // Calculate on-time rate
      const completedTasksList = tasksList.filter(t => 
        t.status === 'done' || t.status === 'completed'
      );
      const onTime = completedTasksList.filter(t => 
        t.due_date && new Date(t.due_date) >= new Date(t.start_date || t.created_at)
      ).length;
      const onTimeRate = completedTasksList.length === 0 ? 0 : Math.round((onTime / completedTasksList.length) * 100);

      console.log('📊 Lead Dashboard Stats:', {
        totalProjects: involvedProjects.length,
        totalTasks,
        completedTasks,
        inProgressTasks,
        completionRate,
        onTimeRate
      });

      setProjects(involvedProjects);
      setTasks(tasksList);
      setTeamMembers(membersList);

      setStats({
        totalProjects: involvedProjects.length,
        totalTasks: totalTasks,
        completedTasks: completedTasks,
        inProgressTasks: inProgressTasks,
        teamMembers: uniqueMembers.length,
        onTimeRate,
        completionRate
      });

    } catch (error) {
      console.error('❌ Failed to fetch dashboard data:', error);
      toast.error('Failed to load dashboard data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchDashboardData();
    toast.success('Dashboard refreshed');
  };

  const getProjectProgress = (projectId) => {
    const stats = projectStatsMap[projectId];
    return stats?.completionRate || 0;
  };

  const getProjectMembers = (projectId) => {
    const projectTasks = tasks.filter(t => Number(t.p_id || t.p) === Number(projectId));
    const memberIds = new Set();
    projectTasks.forEach(t => {
      if (t.assign_to) memberIds.add(Number(t.assign_to));
    });
    return teamMembers.filter(m => memberIds.has(Number(m.id))).slice(0, 4);
  };

  // Chart data
  const taskStatusData = [
    { 
      name: 'To Do', 
      value: tasks.filter(t => t.status === 'todo' || t.status === 'pending').length, 
      fill: '#94a3b8' 
    },
    { 
      name: 'In Progress', 
      value: tasks.filter(t => t.status === 'in_progress' || t.status === 'in-progress').length, 
      fill: '#818cf8' 
    },
    { 
      name: 'Review', 
      value: tasks.filter(t => t.status === 'review').length, 
      fill: '#f59e0b' 
    },
    { 
      name: 'Done', 
      value: tasks.filter(t => t.status === 'done' || t.status === 'completed').length, 
      fill: '#34d399' 
    }
  ];

  // Task trend data (simplified for lead)
  const taskTrendData = [
    { month: 'Week 1', tasks: tasks.length > 0 ? Math.round(tasks.length * 0.2) : 0 },
    { month: 'Week 2', tasks: tasks.length > 0 ? Math.round(tasks.length * 0.35) : 0 },
    { month: 'Week 3', tasks: tasks.length > 0 ? Math.round(tasks.length * 0.45) : 0 },
    { month: 'Week 4', tasks: tasks.length > 0 ? Math.round(tasks.length * 0.6) : 0 }
  ];

  // Upcoming deadlines
  const upcoming = tasks
    .filter(t => t.status !== 'done' && t.status !== 'completed' && (t.due_date || t.deadline))
    .sort((a, b) => {
      const dateA = new Date(a.due_date || a.deadline);
      const dateB = new Date(b.due_date || b.deadline);
      return dateA - dateB;
    })
    .slice(0, 5);

  // Custom tooltip
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

  // Loading state
  if (loading) {
    return (
      <div>
        <Topbar title="Dashboard" onMenuClick={onMenuClick} />
        <div className="page-container">
          <div className="loading-spinner-wrapper">
            <div className="loading-spinner" />
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

      <div className="page-container lead-dashboard">

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
            <div className="stat-card-trend up">
              <ArrowUpRight size={14} />
              <span>{stats.totalProjects > 0 ? 'Active' : '0'}</span>
            </div>
          </div>

          <div className="stat-card-modern">
            <div className="stat-card-icon emerald">
              <CheckCircle2 size={20} />
            </div>
            <div className="stat-card-content">
              <span className="stat-card-value">{stats.completedTasks}</span>
              <span className="stat-card-label">Tasks Completed</span>
            </div>
            <div className="stat-card-trend up">
              <ArrowUpRight size={14} />
              <span>{stats.completionRate}%</span>
            </div>
          </div>

          <div className="stat-card-modern">
            <div className="stat-card-icon amber">
              <Clock size={20} />
            </div>
            <div className="stat-card-content">
              <span className="stat-card-value">{stats.inProgressTasks}</span>
              <span className="stat-card-label">In Progress</span>
            </div>
            <div className="stat-card-trend">
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Active</span>
            </div>
          </div>

          <div className="stat-card-modern">
            <div className="stat-card-icon teal">
              <Award size={20} />
            </div>
            <div className="stat-card-content">
              <span className="stat-card-value">{stats.onTimeRate}%</span>
              <span className="stat-card-label">On-Time Rate</span>
            </div>
            <div className="stat-card-trend up">
              <ArrowUpRight size={14} />
              <span>Good</span>
            </div>
          </div>
        </div>

        {/* ─── SECONDARY STATS ─── */}
        <div className="stats-grid-secondary">
          <div className="stat-card-mini">
            <Users size={16} className="stat-mini-icon" />
            <div>
              <span className="stat-mini-value">{stats.teamMembers}</span>
              <span className="stat-mini-label">Team Members</span>
            </div>
          </div>
          <div className="stat-card-mini">
            <Target size={16} className="stat-mini-icon" />
            <div>
              <span className="stat-mini-value">{stats.totalTasks}</span>
              <span className="stat-mini-label">Total Tasks</span>
            </div>
          </div>
          <div className="stat-card-mini">
            <TrendingUp size={16} className="stat-mini-icon" />
            <div>
              <span className="stat-mini-value">{stats.completionRate}%</span>
              <span className="stat-mini-label">Completion Rate</span>
            </div>
          </div>
          <div className="stat-card-mini">
            <Calendar size={16} className="stat-mini-icon" />
            <div>
              <span className="stat-mini-value">{upcoming.length}</span>
              <span className="stat-mini-label">Upcoming Deadlines</span>
            </div>
          </div>
        </div>

        {/* ─── CHARTS ROW ─── */}
        <div className="charts-row">
          {/* Task Overview */}
          <div className="chart-card">
            <div className="chart-card-header">
              <h3 className="chart-card-title">
                <BarChart3 size={16} />
                Task Overview
              </h3>
              <span className="chart-badge">
                {taskStatusData.reduce((a, b) => a + b.value, 0)} total
              </span>
            </div>
            <div className="chart-container">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={taskStatusData} barSize={36}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} opacity={0.3} />
                  <XAxis dataKey="name" fontSize={11} stroke="var(--text-muted)" tickLine={false} axisLine={false} />
                  <YAxis fontSize={11} stroke="var(--text-muted)" tickLine={false} axisLine={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="value" radius={[6, 6, 2, 2]}>
                    {taskStatusData.map((e, i) => (
                      <Cell key={i} fill={e.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Task Trend */}
          <div className="chart-card">
            <div className="chart-card-header">
              <h3 className="chart-card-title">
                <TrendingUp size={16} />
                Task Activity
              </h3>
              <span className="chart-badge">This month</span>
            </div>
            <div className="chart-container">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={taskTrendData}>
                  <defs>
                    <linearGradient id="taskGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#818cf8" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#818cf8" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} opacity={0.3} />
                  <XAxis dataKey="month" fontSize={11} stroke="var(--text-muted)" tickLine={false} axisLine={false} />
                  <YAxis fontSize={11} stroke="var(--text-muted)" tickLine={false} axisLine={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="tasks"
                    stroke="#818cf8"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#taskGradient)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* ─── MY PROJECTS ─── */}
        <div className="projects-card">
          <div className="projects-card-header">
            <h3 className="projects-card-title">
              <FolderKanban size={16} />
              My Projects
            </h3>
            <button
              className="view-all-btn"
              onClick={() => navigate('/lead/projects')}
            >
              View all →
            </button>
          </div>

          <div className="projects-list">
            {projects.slice(0, 4).map(p => {
              const projectId = Number(p.p_id || p.id);
              const progress = getProjectProgress(projectId);
              const members = getProjectMembers(projectId);
              const hc = progress >= 70 ? '#34d399' : progress >= 40 ? '#f59e0b' : '#f87171';

              return (
                <div
                  key={projectId}
                  className="project-item"
                  onClick={() => navigate(`/lead/projects/${projectId}`)}
                >
                  <div className="project-progress">
                    <ProgressRing progress={progress} size={44} strokeWidth={4} color={hc} />
                    <span className="project-progress-text" style={{ color: hc }}>{progress}%</span>
                  </div>

                  <div className="project-info">
                    <p className="project-name">{p.p_name || p.name}</p>
                    <div className="project-meta">
                      <StatusBadge status={p.status} />
                      <span className="project-task-count">
                        {tasks.filter(t => Number(t.p_id || t.p) === projectId).length} tasks
                      </span>
                    </div>
                  </div>

                  <AvatarGroup members={members} max={3} />
                </div>
              );
            })}

            {projects.length === 0 && (
              <div className="projects-empty">
                <FolderKanban size={40} style={{ opacity: 0.3, marginBottom: 8 }} />
                <p>No projects assigned to you yet.</p>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Projects will appear here once assigned.</span>
              </div>
            )}
          </div>
        </div>

        {/* ─── UPCOMING DEADLINES ─── */}
        <div className="deadlines-card">
          <div className="deadlines-card-header">
            <h3 className="deadlines-card-title">
              <Calendar size={16} />
              Upcoming Deadlines
            </h3>
            <span className="deadlines-badge">{upcoming.length} tasks</span>
          </div>

          {upcoming.length === 0 ? (
            <div className="deadlines-empty">
              <CheckCircle2 size={32} style={{ color: '#34d399', opacity: 0.5, marginBottom: 8 }} />
              <p>No upcoming deadlines</p>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>You're all caught up! 🎉</span>
            </div>
          ) : (
            <div className="deadlines-list">
              {upcoming.map(task => {
                const taskId = task.t_id || task.id;
                const project = projects.find(p => Number(p.p_id || p.id) === Number(task.p_id || task.p));
                const dueDate = new Date(task.due_date || task.deadline);
                const today = new Date();
                const daysLeft = Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24));
                const isOverdue = daysLeft < 0;
                const isUrgent = daysLeft >= 0 && daysLeft <= 3;

                return (
                  <div
                    key={taskId}
                    className={`deadline-item ${isOverdue ? 'overdue' : ''} ${isUrgent ? 'urgent' : ''}`}
                    onClick={() => project && navigate(`/lead/projects/${project.p_id || project.id}`)}
                  >
                    <div className="deadline-info">
                      <p className="deadline-title">{task.title}</p>
                      <p className="deadline-project">
                        {project?.p_name || project?.name || 'Unknown Project'}
                      </p>
                    </div>

                    <div className="deadline-badges">
                      <PriorityBadge priority={task.priority} />
                      <StatusBadge status={task.status} />
                    </div>

                    <span className="deadline-days" style={{
                      color: isOverdue ? '#f87171' : isUrgent ? '#f59e0b' : 'var(--text-secondary)'
                    }}>
                      {isOverdue
                        ? `${Math.abs(daysLeft)}d overdue`
                        : daysLeft === 0
                        ? 'Due today'
                        : `${daysLeft}d left`}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </div>

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        .spin { animation: spin 1s linear infinite; }

        .loading-spinner-wrapper {
          display: flex;
          justify-content: center;
          align-items: center;
          height: 400px;
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

        /* ─── SECONDARY STATS ─── */
        .stats-grid-secondary {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
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
        }

        .chart-card-title {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 14px;
          font-weight: 700;
          color: var(--text-primary);
        }

        .chart-badge {
          font-size: 11px;
          font-weight: 600;
          color: var(--text-muted);
          background: var(--bg-secondary);
          padding: 3px 10px;
          border-radius: 20px;
        }

        .chart-container {
          width: 100%;
          height: 200px;
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

        /* ─── PROJECTS CARD ─── */
        .projects-card {
          background: var(--bg-card);
          border: 1px solid var(--border-subtle);
          border-radius: 14px;
          padding: 20px;
          margin-bottom: 20px;
        }

        .projects-card-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 16px;
        }

        .projects-card-title {
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

        .projects-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .project-item {
          display: flex;
          align-items: center;
          gap: 14px;
          padding: 10px 14px;
          background: var(--bg-secondary);
          border: 1px solid var(--border-subtle);
          border-radius: 10px;
          cursor: pointer;
          transition: all 0.15s;
        }

        .project-item:hover {
          border-color: var(--accent-primary);
          background: var(--bg-card);
        }

        .project-progress {
          position: relative;
          width: 44px;
          height: 44px;
          flex-shrink: 0;
        }

        .project-progress-text {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 10px;
          font-weight: 700;
        }

        .project-info {
          flex: 1;
          min-width: 0;
        }

        .project-name {
          font-size: 13px;
          font-weight: 600;
          color: var(--text-primary);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .project-meta {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-top: 4px;
        }

        .project-task-count {
          font-size: 11px;
          color: var(--text-muted);
        }

        .projects-empty {
          text-align: center;
          padding: 30px 0;
          color: var(--text-muted);
        }

        .projects-empty p {
          font-size: 13px;
          margin-bottom: 4px;
        }

        /* ─── DEADLINES CARD ─── */
        .deadlines-card {
          background: var(--bg-card);
          border: 1px solid var(--border-subtle);
          border-radius: 14px;
          padding: 20px;
        }

        .deadlines-card-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 16px;
        }

        .deadlines-card-title {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 14px;
          font-weight: 700;
          color: var(--text-primary);
        }

        .deadlines-badge {
          font-size: 11px;
          font-weight: 600;
          color: var(--text-muted);
          background: var(--bg-secondary);
          padding: 3px 10px;
          border-radius: 20px;
        }

        .deadlines-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .deadline-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 10px 14px;
          background: var(--bg-secondary);
          border: 1px solid var(--border-subtle);
          border-radius: 10px;
          cursor: pointer;
          transition: all 0.15s;
          flex-wrap: wrap;
        }

        .deadline-item:hover {
          border-color: var(--accent-primary);
          background: var(--bg-card);
        }

        .deadline-item.overdue {
          border-color: rgba(248, 113, 113, 0.3);
          background: rgba(248, 113, 113, 0.05);
        }

        .deadline-item.urgent {
          border-color: rgba(245, 158, 11, 0.3);
          background: rgba(245, 158, 11, 0.05);
        }

        .deadline-item.overdue:hover {
          border-color: #f87171;
        }

        .deadline-item.urgent:hover {
          border-color: #f59e0b;
        }

        .deadline-info {
          flex: 1;
          min-width: 140px;
        }

        .deadline-title {
          font-size: 13px;
          font-weight: 600;
          color: var(--text-primary);
        }

        .deadline-project {
          font-size: 11px;
          color: var(--text-muted);
          margin-top: 2px;
        }

        .deadline-badges {
          display: flex;
          gap: 6px;
          flex-shrink: 0;
        }

        .deadline-days {
          font-size: 12px;
          font-weight: 700;
          white-space: nowrap;
          flex-shrink: 0;
        }

        .deadlines-empty {
          text-align: center;
          padding: 30px 0;
          color: var(--text-muted);
        }

        .deadlines-empty p {
          font-size: 13px;
          margin-bottom: 4px;
        }

        /* ─── RESPONSIVE ─── */
        @media (max-width: 1200px) {
          .stats-grid {
            grid-template-columns: repeat(2, 1fr);
          }
          .stats-grid-secondary {
            grid-template-columns: repeat(2, 1fr);
          }
        }

        @media (max-width: 992px) {
          .charts-row {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 768px) {
          .stats-grid {
            grid-template-columns: 1fr 1fr;
          }
          .stats-grid-secondary {
            grid-template-columns: 1fr 1fr;
          }
          .chart-card {
            padding: 16px;
          }
          .chart-container {
            height: 160px;
          }
          .project-item {
            flex-wrap: wrap;
          }
          .deadline-item {
            flex-direction: column;
            align-items: flex-start;
          }
          .deadline-badges {
            width: 100%;
          }
          .deadline-days {
            margin-top: 4px;
          }
        }

        @media (max-width: 480px) {
          .stats-grid {
            grid-template-columns: 1fr;
          }
          .stats-grid-secondary {
            grid-template-columns: 1fr;
          }
          .stat-card-modern {
            padding: 14px 16px;
          }
          .stat-card-value {
            font-size: 20px;
          }
          .chart-card-header {
            flex-direction: column;
            align-items: flex-start;
            gap: 8px;
          }
          .page-container.lead-dashboard {
            padding: 10px;
          }
          .project-item {
            padding: 8px 12px;
          }
          .deadline-item {
            padding: 8px 12px;
          }
        }
      `}</style>
    </div>
  );
}