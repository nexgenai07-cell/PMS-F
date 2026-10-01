// components/supervisor/SupervisorLeads.jsx
import { useState, useEffect, useCallback, useMemo } from "react";
import { useOutletContext } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Users, FolderKanban, X, RefreshCw, Search,
  UserCheck, AlertCircle, UserCog,
  MessageSquare, CheckCircle2,
} from "lucide-react";
import toast from "react-hot-toast";

import Topbar from "../shared/Topbar";
import { StatusBadge, PriorityBadge } from "../shared/UIComponents";

import projectService from "../../services/projectService";
import taskService from "../../services/taskService";
import teamService from "../../services/teamService";
import userService from "../../services/userService";
import projectTeamService from "../../services/projectTeamService";

/* ─────────── Helpers ─────────── */

const asArray = (v) => (Array.isArray(v) ? v : []);

const norm = (s) => (s || '').toLowerCase().trim();

const getInitials = (name) => {
  if (!name) return '?';
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
};

const getRoleColor = (role) => {
  const colors = {
    admin:      { bg: 'rgba(167, 139, 250, 0.15)', color: '#a78bfa' },
    manager:    { bg: 'rgba(129, 140, 248, 0.15)', color: '#818cf8' },
    supervisor: { bg: 'rgba(52, 211, 153, 0.15)',  color: '#34d399' },
    lead:       { bg: 'rgba(245, 158, 11, 0.15)',  color: '#f59e0b' },
    member:     { bg: 'rgba(148, 163, 184, 0.15)', color: '#94a3b8' },
    developer:  { bg: 'rgba(45, 212, 191, 0.15)',  color: '#2dd4bf' },
  };
  return colors[norm(role)] || colors.member;
};

/* PTeam field getters (defensive) */
function getPteamProjectId(entry) {
  return Number(
    entry?.p ?? entry?.p_id ?? entry?.project ?? entry?.projectId ?? entry?.project_id
  );
}
function getPteamTmId(entry) {
  return Number(
    entry?.tm ?? entry?.tm_id ?? entry?.team_member ??
    entry?.member ?? entry?.member_id ?? entry?.teamMember
  );
}

/* ─────────── Compute a lead's full stats from raw data ─────────── */
/*
 * A lead's projects = any project where:
 *   - created_by === lead's user id, OR
 *   - lead's user id is in project.supervisors, OR
 *   - lead's TeamMember profile appears in a PTeam entry for that project
 *
 * A lead's tasks = any task whose project is in the above set OR
 * that is directly assigned to the lead's TeamMember profile.
 */
function computeLeadData(leadId, projects, tasks, teamMembers, users, pteamEntries) {
  const leadUser = users.find(u => Number(u.id ?? u.u_id) === Number(leadId));

  // 1. Find the lead's TeamMember profile by matching name
  const leadName = norm(leadUser?.u_name);
  const leadMember = leadName
    ? asArray(teamMembers).find(m => norm(m.name) === leadName)
    : null;
  const teamMemberId = leadMember ? Number(leadMember.id) : null;

  // 2. Project IDs from PTeam where this lead's TeamMember appears
  const pteamProjectIds = new Set();
  if (teamMemberId != null) {
    asArray(pteamEntries).forEach(entry => {
      if (getPteamTmId(entry) === teamMemberId) {
        const pid = getPteamProjectId(entry);
        if (Number.isFinite(pid)) pteamProjectIds.add(pid);
      }
    });
  }

  // 3. Build the lead's project set:
  //    created_by OR supervised OR PTeam membership
  const projectMap = new Map();
  asArray(projects).forEach(p => {
    const id = Number(p.p_id ?? p.id);
    if (!Number.isFinite(id)) return;

    const isCreator = Number(p.created_by) === Number(leadId);
    const isSupervisor = asArray(p.supervisors).map(Number).includes(Number(leadId));
    const isPteamMember = pteamProjectIds.has(id);

    if (isCreator || isSupervisor || isPteamMember) {
      projectMap.set(id, p);
    }
  });
  const leadProjects = Array.from(projectMap.values());
  const leadProjectIds = leadProjects.map(p => Number(p.p_id ?? p.id));

  // 4. Tasks in those projects
  const projectTasks = asArray(tasks).filter(t => {
    const tpid = Number(t.p_id ?? t.p);
    return leadProjectIds.includes(tpid);
  });

  // 5. Tasks directly assigned to the lead's TeamMember (may be in other
  //    projects the lead isn't yet credited with — include them too)
  const directAssignedTasks = teamMemberId != null
    ? asArray(tasks).filter(t => Number(t.assign_to ?? t.assignedTo) === teamMemberId)
    : [];

  // Combine (dedupe by task id)
  const taskMap = new Map();
  [...projectTasks, ...directAssignedTasks].forEach(t => {
    const id = Number(t.t_id ?? t.id);
    if (Number.isFinite(id)) taskMap.set(id, t);
  });
  const allLeadTasks = Array.from(taskMap.values());

  const totalTasks = allLeadTasks.length;
  const completedTasks = allLeadTasks.filter(t => {
    const s = norm(t.status);
    return s === 'done' || s === 'completed';
  }).length;
  const inProgressTasks = allLeadTasks.filter(t => {
    const s = norm(t.status);
    return s === 'in_progress' || s === 'in-progress' || s === 'review';
  }).length;
  const todoTasks = allLeadTasks.filter(t => {
    const s = norm(t.status);
    return s === 'todo' || s === 'pending' || s === 'planning';
  }).length;

  const completionRate = totalTasks > 0
    ? Math.round((completedTasks / totalTasks) * 100)
    : 0;

  const avgProgress = totalTasks > 0
    ? Math.round(
        allLeadTasks.reduce((sum, t) => {
          const p = Number(t.progress);
          if (Number.isFinite(p)) return sum + p;
          const s = norm(t.status);
          if (s === 'done' || s === 'completed') return sum + 100;
          if (s === 'review') return sum + 75;
          if (s === 'in_progress' || s === 'in-progress') return sum + 50;
          return sum;
        }, 0) / totalTasks
      )
    : 0;

  const completedWithDue = allLeadTasks.filter(t => {
    const s = norm(t.status);
    return (s === 'done' || s === 'completed') && (t.due_date || t.deadline);
  });
  const onTimeCount = completedWithDue.filter(t => {
    const due = new Date(t.due_date || t.deadline);
    const updated = new Date(
      t.updated_at || t.update_last || t.created_at || Date.now()
    );
    return updated <= due;
  }).length;
  const onTimeRate = completedWithDue.length > 0
    ? Math.round((onTimeCount / completedWithDue.length) * 100)
    : 0;

  // Unique members on the lead's projects
  const memberIdSet = new Set();
  projectTasks.forEach(t => {
    const a = t.assign_to ?? t.assignedTo;
    if (a != null) memberIdSet.add(Number(a));
  });
  const teamSize = memberIdSet.size;

  const performance =
    totalTasks === 0 ? 'New' :
    completionRate >= 80 ? 'Excellent' :
    completionRate >= 60 ? 'Good' :
    completionRate >= 40 ? 'Average' :
    'Needs Attention';

  const perfColor =
    totalTasks === 0 ? '#94a3b8' :
    completionRate >= 80 ? '#34d399' :
    completionRate >= 60 ? '#2dd4bf' :
    completionRate >= 40 ? '#f59e0b' :
    '#f87171';

  return {
    user: leadUser,
    projects: leadProjects,
    tasks: allLeadTasks,
    directAssignedTasks,
    completed: completedTasks,
    inProgress: inProgressTasks,
    todo: todoTasks,
    totalTasks,
    completionRate,
    avgProgress,
    onTimeRate,
    hasCompletedWithDue: completedWithDue.length > 0,
    teamSize,
    performance,
    perfColor,
    teamMemberId,
    hasTeamMember: !!teamMemberId,
  };
}

/* ─────────── Component ─────────── */
export default function SupervisorLeads() {
  const ctx = useOutletContext?.() || {};
  const onMenuClick = ctx.onMenuClick;

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [projects, setProjects] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [teamMembers, setTeamMembers] = useState([]);
  const [users, setUsers] = useState([]);
  const [pteamEntries, setPteamEntries] = useState([]);
  const [leadList, setLeadList] = useState([]);

  const [selectedLead, setSelectedLead] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterPerformance, setFilterPerformance] = useState('all');

  /* ─── Fetch data ─── */
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [projectsData, tasksData, membersData, usersData, pteamData] = await Promise.all([
        projectService.getProjects(),
        taskService.getTasks(),
        teamService.getTeamMembers(),
        userService.getUsers(),
        projectTeamService.getProjectTeams(),
      ]);

      const projectsList = asArray(projectsData?.data || projectsData);
      const tasksList = asArray(tasksData?.data || tasksData);
      const membersList = asArray(membersData?.data || membersData);
      const usersList = asArray(usersData?.data || usersData);
      const pteamList = asArray(pteamData?.data || pteamData);

      setProjects(projectsList);
      setTasks(tasksList);
      setTeamMembers(membersList);
      setUsers(usersList);
      setPteamEntries(pteamList);

      // Leads = users whose role is lead-ish (member / developer / *lead*)
      const leads = usersList
        .filter(u => {
          const role = norm(u.role);
          return role === 'member' || role === 'developer' || role.includes('lead');
        })
        .map(u => Number(u.id ?? u.u_id))
        .filter(Number.isFinite);

      setLeadList(leads);

      console.log('📊 [SupervisorLeads] users:', usersList.length);
      console.log('📊 [SupervisorLeads] leads:', leads.length);
      console.log('📊 [SupervisorLeads] projects:', projectsList.length);
      console.log('📊 [SupervisorLeads] tasks:', tasksList.length);
      console.log('📊 [SupervisorLeads] pteam entries:', pteamList.length);
      console.log(
        '📊 [SupervisorLeads] pteam sample:',
        pteamList.slice(0, 5).map(e => ({
          pt_id: e.pt_id,
          p: getPteamProjectId(e),
          tm: getPteamTmId(e),
        }))
      );
      console.log(
        '📊 [SupervisorLeads] project.created_by values:',
        projectsList.map(p => ({ id: p.p_id ?? p.id, created_by: p.created_by, supervisors: p.supervisors }))
      );
      console.log(
        '📊 [SupervisorLeads] task assign_to values:',
        tasksList.map(t => ({ id: t.t_id ?? t.id, assign_to: t.assign_to, p: t.p_id ?? t.p }))
      );
    } catch (error) {
      console.error('Error fetching leads data:', error);
      toast.error('Failed to load leads data');
      setProjects([]);
      setTasks([]);
      setTeamMembers([]);
      setUsers([]);
      setPteamEntries([]);
      setLeadList([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    toast.success('Leads refreshed');
  };

  /* ─── Derived leads (memoized) ─── */
  const leadsData = useMemo(() => {
    return leadList
      .map(id => ({
        leadId: id,
        data: computeLeadData(id, projects, tasks, teamMembers, users, pteamEntries),
      }))
      .filter(x => x.data.user);
  }, [leadList, projects, tasks, teamMembers, users, pteamEntries]);

  const filteredLeads = useMemo(() => {
    const q = norm(searchTerm);
    return leadsData.filter(({ data }) => {
      const nameMatch = !q || norm(data.user?.u_name).includes(q);
      const perfMatch =
        filterPerformance === 'all' ||
        norm(data.performance) === norm(filterPerformance);
      return nameMatch && perfMatch;
    });
  }, [leadsData, searchTerm, filterPerformance]);

  /* ─── Loading ─── */
  if (loading) {
    return (
      <div>
        <Topbar title="Leads Overview" onMenuClick={onMenuClick} />
        <div className="page-container">
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '400px' }}>
            <div style={{
              width: 40, height: 40,
              border: '3px solid var(--border-subtle)',
              borderTopColor: 'var(--accent-primary)',
              borderRadius: '50%',
              animation: 'spin 0.8s linear infinite'
            }} />
          </div>
        </div>
      </div>
    );
  }

  const leadsWithProfile = leadsData.filter(x => x.data.hasTeamMember).length;
  const leadsWithoutProfile = leadsData.length - leadsWithProfile;

  return (
    <div>
      <Topbar
        title="Leads Overview"
        onMenuClick={onMenuClick}
        actions={
          <button
            className="btn btn-secondary btn-sm"
            onClick={handleRefresh}
            disabled={refreshing}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <RefreshCw size={14} className={refreshing ? 'spin' : ''} />
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>
        }
      />

      <div className="page-container">
        {/* Stats */}
        <div className="leads-stats">
          <div className="leads-stat">
            <div className="leads-stat-icon" style={{ background: 'rgba(99, 102, 241, 0.12)', color: '#818cf8' }}>
              <Users size={18} />
            </div>
            <div>
              <span className="leads-stat-value">{leadsData.length}</span>
              <span className="leads-stat-label">Total Leads</span>
            </div>
          </div>
          <div className="leads-stat">
            <div className="leads-stat-icon" style={{ background: 'rgba(52, 211, 153, 0.12)', color: '#34d399' }}>
              <UserCheck size={18} />
            </div>
            <div>
              <span className="leads-stat-value">{leadsWithProfile}</span>
              <span className="leads-stat-label">With Profile</span>
            </div>
          </div>
          <div className="leads-stat">
            <div className="leads-stat-icon" style={{ background: 'rgba(245, 158, 11, 0.12)', color: '#f59e0b' }}>
              <AlertCircle size={18} />
            </div>
            <div>
              <span className="leads-stat-value">{leadsWithoutProfile}</span>
              <span className="leads-stat-label">No Profile</span>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="leads-filters">
          <div className="leads-search">
            <Search size={16} className="leads-search-icon" />
            <input
              className="leads-search-input"
              placeholder="Search leads by name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            {searchTerm && (
              <button className="leads-search-clear" onClick={() => setSearchTerm('')}>
                <X size={14} />
              </button>
            )}
          </div>

          <select
            className="leads-filter-select"
            value={filterPerformance}
            onChange={e => setFilterPerformance(e.target.value)}
          >
            <option value="all">All Performance</option>
            <option value="excellent">⭐ Excellent</option>
            <option value="good">✅ Good</option>
            <option value="average">📊 Average</option>
            <option value="needs attention">⚠️ Needs Attention</option>
            <option value="new">🆕 New</option>
          </select>
        </div>

        {/* Leads grid */}
        {filteredLeads.length === 0 ? (
          <div className="leads-empty">
            <Users size={48} />
            <h3>No leads found</h3>
            <p>Try adjusting your filters</p>
          </div>
        ) : (
          <div className="leads-grid">
            {filteredLeads.map(({ leadId, data: d }) => {
              const roleInfo = getRoleColor(d.user?.role);
              const initials = getInitials(d.user?.u_name);

              return (
                <motion.div
                  key={leadId}
                  className="lead-card"
                  whileHover={{ y: -2 }}
                  transition={{ type: 'spring', stiffness: 340, damping: 24 }}
                  onClick={() => setSelectedLead(leadId)}
                >
                  <div className="lead-card-header">
                    <div className="lead-avatar" style={{ borderColor: d.perfColor }}>
                      {initials}
                    </div>
                    <div className="lead-info">
                      <h3 className="lead-name">{d.user?.u_name || 'Unknown'}</h3>
                      <div className="lead-badges">
                        <span className="lead-role-badge" style={{ background: roleInfo.bg, color: roleInfo.color }}>
                          {d.user?.role || 'Member'}
                        </span>
                        <span className="lead-perf-badge" style={{ color: d.perfColor }}>
                          {d.performance}
                        </span>
                        {!d.hasTeamMember && (
                          <span className="lead-no-profile-badge">No Profile</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="lead-stats-grid">
                    <div className="lead-stat-item">
                      <span className="lead-stat-number">{d.projects.length}</span>
                      <span className="lead-stat-label">Projects</span>
                    </div>
                    <div className="lead-stat-item">
                      <span className="lead-stat-number" style={{ color: '#34d399' }}>{d.completed}</span>
                      <span className="lead-stat-label">Done</span>
                    </div>
                    <div className="lead-stat-item">
                      <span className="lead-stat-number" style={{ color: '#818cf8' }}>{d.inProgress}</span>
                      <span className="lead-stat-label">Active</span>
                    </div>
                    <div className="lead-stat-item">
                      <span className="lead-stat-number">{d.totalTasks}</span>
                      <span className="lead-stat-label">Total</span>
                    </div>
                  </div>

                  <div className="lead-progress">
                    <div className="lead-progress-header">
                      <span>Avg. Progress</span>
                      <span style={{ color: d.perfColor, fontWeight: 700 }}>
                        {d.totalTasks > 0 ? `${d.avgProgress}%` : '—'}
                      </span>
                    </div>
                    <div className="lead-progress-bar">
                      <div
                        className="lead-progress-fill"
                        style={{ width: `${d.avgProgress}%`, background: d.perfColor }}
                      />
                    </div>
                  </div>

                  <div className="lead-card-footer">
                    <div className="lead-project-tags">
                      {d.projects.slice(0, 2).map((p) => (
                        <span key={p.p_id || p.id} className="lead-project-tag">
                          {p.p_name || p.name}
                        </span>
                      ))}
                      {d.projects.length > 2 && (
                        <span className="lead-project-tag">+{d.projects.length - 2}</span>
                      )}
                      {d.projects.length === 0 && (
                        <span className="lead-project-tag" style={{ opacity: 0.6 }}>
                          No projects
                        </span>
                      )}
                    </div>
                    <div className="lead-meta-pills">
                      <span
                        className="lead-meta-pill"
                        title={d.hasCompletedWithDue ? 'On-time completion rate' : 'No completed tasks with due dates yet'}
                      >
                        <CheckCircle2 size={11} />
                        {d.hasCompletedWithDue ? `${d.onTimeRate}% on-time` : '— on-time'}
                      </span>
                      <span className="lead-meta-pill">
                        <UserCog size={11} />
                        {d.teamSize} member{d.teamSize !== 1 ? 's' : ''}
                      </span>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      {/* ─── LEAD DETAIL MODAL ─── */}
      <AnimatePresence>
        {selectedLead && (() => {
          const d = computeLeadData(selectedLead, projects, tasks, teamMembers, users, pteamEntries);
          const roleInfo = getRoleColor(d.user?.role);
          const initials = getInitials(d.user?.u_name);

          return (
            <motion.div className="modal-overlay"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setSelectedLead(null)}>
              <motion.div className="modal-content"
                initial={{ opacity: 0, y: 20, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 20, scale: 0.95 }}
                transition={{ type: 'spring', damping: 25 }}
                onClick={(e) => e.stopPropagation()}>

                <div className="modal-header">
                  <div className="modal-header-left">
                    <div className="modal-avatar" style={{ borderColor: d.perfColor }}>
                      {initials}
                    </div>
                    <div>
                      <h2 className="modal-name">{d.user?.u_name || 'Unknown'}</h2>
                      <div className="modal-badges">
                        <span className="modal-role-badge" style={{ background: roleInfo.bg, color: roleInfo.color }}>
                          {d.user?.role || 'Member'}
                        </span>
                        <span className="modal-perf-badge" style={{ color: d.perfColor }}>
                          {d.performance}
                        </span>
                        {d.user?.email && <span className="modal-email">{d.user.email}</span>}
                      </div>
                    </div>
                  </div>
                  <button className="modal-close-btn" onClick={() => setSelectedLead(null)}>
                    <X size={20} />
                  </button>
                </div>

                <div className="modal-body">
                  <div className="modal-stats">
                    <div className="modal-stat">
                      <span className="modal-stat-value">{d.projects.length}</span>
                      <span className="modal-stat-label">Projects</span>
                    </div>
                    <div className="modal-stat">
                      <span className="modal-stat-value" style={{ color: '#34d399' }}>{d.completed}</span>
                      <span className="modal-stat-label">Completed</span>
                    </div>
                    <div className="modal-stat">
                      <span className="modal-stat-value" style={{ color: '#818cf8' }}>{d.inProgress}</span>
                      <span className="modal-stat-label">In Progress</span>
                    </div>
                    <div className="modal-stat">
                      <span className="modal-stat-value" style={{ color: '#94a3b8' }}>{d.todo}</span>
                      <span className="modal-stat-label">To Do</span>
                    </div>
                    <div className="modal-stat">
                      <span className="modal-stat-value">{d.totalTasks}</span>
                      <span className="modal-stat-label">Total Tasks</span>
                    </div>
                  </div>

                  <div className="modal-progress">
                    <div className="modal-progress-header">
                      <span>Average Progress</span>
                      <span style={{ color: d.perfColor, fontWeight: 700 }}>
                        {d.totalTasks > 0 ? `${d.avgProgress}%` : '—'}
                      </span>
                    </div>
                    <div className="modal-progress-bar">
                      <div className="modal-progress-fill" style={{ width: `${d.avgProgress}%`, background: d.perfColor }} />
                    </div>
                  </div>

                  <div className="modal-kpis">
                    <div className="modal-kpi">
                      <CheckCircle2 size={14} />
                      <div>
                        <span className="modal-kpi-value">
                          {d.hasCompletedWithDue ? `${d.onTimeRate}%` : '—'}
                        </span>
                        <span className="modal-kpi-label">On-time rate</span>
                      </div>
                    </div>
                    <div className="modal-kpi">
                      <UserCog size={14} />
                      <div>
                        <span className="modal-kpi-value">{d.teamSize}</span>
                        <span className="modal-kpi-label">Team members</span>
                      </div>
                    </div>
                    <div className="modal-kpi">
                      <MessageSquare size={14} />
                      <div>
                        <span className="modal-kpi-value">{d.directAssignedTasks.length}</span>
                        <span className="modal-kpi-label">Assigned to lead</span>
                      </div>
                    </div>
                  </div>

                  <div className="modal-section">
                    <h4 className="modal-section-title">
                      <FolderKanban size={14} /> Projects ({d.projects.length})
                    </h4>
                    {d.projects.length === 0 ? (
                      <p className="modal-empty">No projects assigned</p>
                    ) : (
                      d.projects.map((p) => (
                        <div key={p.p_id || p.id} className="modal-project-item">
                          <div>
                            <span className="modal-project-name">{p.p_name || p.name}</span>
                            {(p.desc || p.description) && (
                              <span className="modal-project-desc">{p.desc || p.description}</span>
                            )}
                          </div>
                          <div className="modal-project-badges">
                            <StatusBadge status={p.status} />
                            <PriorityBadge priority={p.priority} />
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </motion.div>
            </motion.div>
          );
        })()}
      </AnimatePresence>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .spin { animation: spin 1s linear infinite; }

        .leads-stats {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
          gap: 12px;
          margin-bottom: 18px;
        }
        .leads-stat {
          display: flex; align-items: center; gap: 12px;
          padding: 14px 18px;
          background: var(--bg-card);
          border: 1px solid var(--border-subtle);
          border-radius: 12px;
        }
        .leads-stat-icon {
          width: 40px; height: 40px; border-radius: 10px;
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
        }
        .leads-stat-value {
          display: block; font-size: 20px; font-weight: 800;
          color: var(--text-primary); line-height: 1.2;
        }
        .leads-stat-label {
          display: block; font-size: 12px; color: var(--text-muted);
        }

        .leads-filters {
          display: flex; gap: 10px; margin-bottom: 16px; flex-wrap: wrap;
        }
        .leads-search {
          position: relative; flex: 1; min-width: 200px;
        }
        .leads-search-icon {
          position: absolute; left: 12px; top: 50%;
          transform: translateY(-50%);
          color: var(--text-muted);
        }
        .leads-search-input {
          width: 100%; padding: 9px 36px 9px 36px;
          border-radius: 8px;
          border: 1px solid var(--border-default);
          background: var(--bg-secondary);
          color: var(--text-primary);
          font-size: 13px; outline: none;
          transition: border-color 0.2s;
        }
        .leads-search-input:focus {
          border-color: var(--accent-primary);
          background: var(--bg-card);
          box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.08);
        }
        .leads-search-clear {
          position: absolute; right: 8px; top: 50%;
          transform: translateY(-50%);
          display: flex; align-items: center; justify-content: center;
          width: 26px; height: 26px;
          border: none; border-radius: 50%;
          background: var(--bg-hover);
          color: var(--text-muted);
          cursor: pointer;
        }
        .leads-search-clear:hover {
          background: var(--border-default);
          color: var(--text-primary);
        }
        .leads-filter-select {
          padding: 9px 32px 9px 12px;
          border-radius: 8px;
          border: 1px solid var(--border-default);
          background: var(--bg-secondary);
          color: var(--text-primary);
          font-size: 13px; outline: none; cursor: pointer;
          appearance: none;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E");
          background-repeat: no-repeat;
          background-position: right 10px center;
        }
        .leads-filter-select:focus { border-color: var(--accent-primary); }

        .leads-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
          gap: 16px;
        }
        .lead-card {
          padding: 18px;
          background: var(--bg-card);
          border: 1px solid var(--border-subtle);
          border-radius: 14px;
          cursor: pointer;
          transition: all 0.2s ease;
          display: flex; flex-direction: column; gap: 12px;
        }
        .lead-card:hover {
          border-color: var(--accent-primary);
          box-shadow: 0 4px 16px rgba(0,0,0,0.06);
        }
        .lead-card-header {
          display: flex; align-items: center; gap: 12px;
        }
        .lead-avatar {
          width: 44px; height: 44px; border-radius: 50%;
          border: 2px solid;
          display: flex; align-items: center; justify-content: center;
          font-size: 16px; font-weight: 800;
          color: var(--text-primary);
          background: var(--bg-secondary);
          flex-shrink: 0;
        }
        .lead-info { flex: 1; min-width: 0; }
        .lead-name {
          font-size: 15px; font-weight: 700;
          color: var(--text-primary); margin: 0;
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .lead-badges {
          display: flex; gap: 4px; flex-wrap: wrap; margin-top: 3px;
        }
        .lead-role-badge {
          font-size: 10px; font-weight: 600;
          padding: 2px 8px; border-radius: 10px;
        }
        .lead-perf-badge {
          font-size: 10px; font-weight: 700;
          padding: 2px 8px; border-radius: 10px;
          border: 1px solid currentColor;
        }
        .lead-no-profile-badge {
          font-size: 9px; font-weight: 600;
          padding: 2px 6px; border-radius: 4px;
          background: rgba(245, 158, 11, 0.15);
          color: #f59e0b;
          border: 1px solid rgba(245, 158, 11, 0.3);
        }

        .lead-stats-grid {
          display: grid; grid-template-columns: repeat(4, 1fr);
          gap: 4px;
          background: var(--bg-secondary);
          border-radius: 10px;
          border: 1px solid var(--border-subtle);
          padding: 6px 0;
        }
        .lead-stat-item {
          text-align: center; padding: 4px;
        }
        .lead-stat-item:not(:last-child) {
          border-right: 1px solid var(--border-subtle);
        }
        .lead-stat-number {
          display: block; font-size: 16px; font-weight: 700;
          color: var(--text-primary);
        }
        .lead-stat-label {
          font-size: 9px; color: var(--text-muted);
          text-transform: uppercase; letter-spacing: 0.3px;
        }

        .lead-progress { margin-top: 2px; }
        .lead-progress-header {
          display: flex; justify-content: space-between;
          font-size: 11px; color: var(--text-secondary);
          margin-bottom: 4px;
        }
        .lead-progress-bar {
          width: 100%; height: 6px;
          background: var(--border-subtle);
          border-radius: 10px; overflow: hidden;
        }
        .lead-progress-fill {
          height: 100%; border-radius: 10px;
          transition: width 0.6s ease;
        }

        .lead-card-footer {
          display: flex; justify-content: space-between; align-items: center;
          padding-top: 10px;
          border-top: 1px solid var(--border-subtle);
          gap: 8px; flex-wrap: wrap;
        }
        .lead-project-tags {
          display: flex; gap: 4px; flex-wrap: wrap;
        }
        .lead-project-tag {
          font-size: 10px; font-weight: 500;
          padding: 2px 8px; border-radius: 4px;
          background: var(--bg-secondary);
          border: 1px solid var(--border-subtle);
          color: var(--text-secondary);
          white-space: nowrap;
          max-width: 80px; overflow: hidden; text-overflow: ellipsis;
        }
        .lead-meta-pills {
          display: flex; gap: 4px; flex-wrap: wrap;
        }
        .lead-meta-pill {
          display: inline-flex; align-items: center; gap: 4px;
          font-size: 10.5px; font-weight: 600;
          color: var(--text-secondary);
          padding: 2px 8px;
          border-radius: 20px;
          background: var(--bg-secondary);
          border: 1px solid var(--border-subtle);
          white-space: nowrap;
        }

        .leads-empty {
          text-align: center; padding: 60px 20px;
          color: var(--text-muted);
        }
        .leads-empty h3 {
          font-size: 18px; font-weight: 700;
          color: var(--text-primary);
          margin: 12px 0 4px;
        }

        .modal-overlay {
          position: fixed; inset: 0;
          background: rgba(0,0,0,0.6);
          backdrop-filter: blur(6px);
          display: flex; align-items: center; justify-content: center;
          z-index: 1000; padding: 20px;
        }
        .modal-content {
          width: 100%; max-width: 620px; max-height: 90vh;
          overflow-y: auto;
          background: var(--bg-card);
          border: 1px solid var(--border-default);
          border-radius: 18px;
          box-shadow: 0 24px 80px rgba(0,0,0,0.35);
          padding: 0;
        }
        .modal-content::-webkit-scrollbar { width: 4px; }
        .modal-content::-webkit-scrollbar-thumb {
          background: var(--border-default);
          border-radius: 10px;
        }
        .modal-header {
          display: flex; justify-content: space-between; align-items: flex-start;
          padding: 20px 24px 16px;
          border-bottom: 1px solid var(--border-subtle);
          position: sticky; top: 0;
          background: var(--bg-card);
          border-radius: 18px 18px 0 0;
        }
        .modal-header-left {
          display: flex; align-items: center; gap: 14px;
        }
        .modal-avatar {
          width: 52px; height: 52px; border-radius: 50%;
          border: 2px solid;
          display: flex; align-items: center; justify-content: center;
          font-size: 20px; font-weight: 800;
          background: var(--bg-secondary);
          color: var(--text-primary);
          flex-shrink: 0;
        }
        .modal-name {
          font-size: 18px; font-weight: 700;
          color: var(--text-primary); margin: 0;
        }
        .modal-badges {
          display: flex; gap: 4px; flex-wrap: wrap; margin-top: 3px;
        }
        .modal-role-badge {
          font-size: 11px; font-weight: 600;
          padding: 2px 10px; border-radius: 12px;
        }
        .modal-perf-badge {
          font-size: 11px; font-weight: 700;
          padding: 2px 10px; border-radius: 12px;
          border: 1px solid currentColor;
        }
        .modal-email {
          font-size: 11px; color: var(--text-muted); padding: 2px 0;
        }
        .modal-close-btn {
          display: flex; align-items: center; justify-content: center;
          width: 36px; height: 36px;
          border-radius: 8px;
          border: 1px solid var(--border-subtle);
          background: var(--bg-secondary);
          color: var(--text-secondary);
          cursor: pointer;
          transition: all 0.15s;
        }
        .modal-close-btn:hover:not(:disabled) {
          border-color: var(--accent-primary);
          color: var(--accent-primary);
        }
        .modal-body {
          padding: 20px 24px 24px;
          display: flex; flex-direction: column; gap: 16px;
        }
        .modal-stats {
          display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px;
        }
        .modal-stat {
          text-align: center; padding: 10px 6px;
          background: var(--bg-secondary);
          border-radius: 10px;
          border: 1px solid var(--border-subtle);
        }
        .modal-stat-value {
          display: block; font-size: 18px; font-weight: 800;
          color: var(--text-primary);
        }
        .modal-stat-label {
          font-size: 9px; color: var(--text-muted);
          text-transform: uppercase; letter-spacing: 0.3px;
        }
        .modal-progress {
          background: var(--bg-secondary);
          border-radius: 10px; padding: 12px 16px;
          border: 1px solid var(--border-subtle);
        }
        .modal-progress-header {
          display: flex; justify-content: space-between;
          font-size: 13px; color: var(--text-secondary);
          margin-bottom: 6px;
        }
        .modal-progress-bar {
          width: 100%; height: 8px;
          background: var(--border-subtle);
          border-radius: 10px; overflow: hidden;
        }
        .modal-progress-fill {
          height: 100%; border-radius: 10px;
          transition: width 0.6s ease;
        }

        .modal-kpis {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 8px;
        }
        .modal-kpi {
          display: flex; align-items: center; gap: 10px;
          padding: 10px 12px;
          background: var(--bg-secondary);
          border: 1px solid var(--border-subtle);
          border-radius: 10px;
          color: var(--accent-primary);
        }
        .modal-kpi-value {
          display: block;
          font-size: 15px; font-weight: 800;
          color: var(--text-primary);
          line-height: 1.2;
        }
        .modal-kpi-label {
          display: block;
          font-size: 10px;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.3px;
        }

        .modal-section {
          display: flex; flex-direction: column; gap: 8px;
        }
        .modal-section-title {
          font-size: 13px; font-weight: 700;
          color: var(--text-secondary);
          display: flex; align-items: center; gap: 6px;
          margin: 0;
        }
        .modal-project-item {
          display: flex; justify-content: space-between; align-items: center;
          padding: 10px 14px;
          background: var(--bg-secondary);
          border-radius: 8px;
          border: 1px solid var(--border-subtle);
          gap: 10px; flex-wrap: wrap;
        }
        .modal-project-name {
          display: block; font-size: 13px; font-weight: 600;
          color: var(--text-primary);
        }
        .modal-project-desc {
          display: block; font-size: 11px; color: var(--text-muted);
        }
        .modal-project-badges {
          display: flex; gap: 4px; flex-shrink: 0;
        }
        .modal-empty {
          font-size: 13px; color: var(--text-muted);
          text-align: center; padding: 8px 0;
        }

        @media (max-width: 768px) {
          .leads-stats { grid-template-columns: 1fr 1fr 1fr; }
          .leads-grid { grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); }
          .modal-stats { grid-template-columns: repeat(3, 1fr); }
          .modal-kpis { grid-template-columns: 1fr; }
          .modal-content { max-width: 100%; border-radius: 14px; max-height: 95vh; }
        }
        @media (max-width: 480px) {
          .leads-stats { grid-template-columns: 1fr; }
          .leads-filters { flex-direction: column; }
          .leads-grid { grid-template-columns: 1fr; }
          .modal-stats { grid-template-columns: repeat(2, 1fr); }
          .modal-header { padding: 16px 18px; }
          .modal-body { padding: 16px 18px; }
          .modal-avatar { width: 40px; height: 40px; font-size: 16px; }
          .modal-name { font-size: 16px; }
        }
      `}</style>
    </div>
  );
}