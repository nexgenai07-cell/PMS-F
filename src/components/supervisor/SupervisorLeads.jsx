// components/supervisor/SupervisorLeads.jsx
import { useState, useEffect, useCallback, useMemo } from "react";
import { useOutletContext, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Users, FolderKanban, X, RefreshCw, Search,
  UserCheck, AlertCircle, UserCog, TrendingUp, TrendingDown,
  MessageSquare, CheckCircle2, Award,
  Download, BarChart2, Target, Zap, Eye,
  Filter, Mail, ExternalLink, ListTodo, Briefcase,
} from "lucide-react";
import toast from "react-hot-toast";

import Topbar from "../shared/Topbar";
import { StatusBadge, PriorityBadge } from "../shared/UIComponents";
import leadService from "../../services/leadService";

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

const SORT_OPTIONS = [
  { value: 'completion-desc',  label: 'Personal Completion (High → Low)' },
  { value: 'completion-asc',   label: 'Personal Completion (Low → High)' },
  { value: 'personal-tasks-desc', label: 'Personal Tasks (Most First)' },
  { value: 'project-tasks-desc',  label: 'Project Tasks (Most First)' },
  { value: 'progress-desc',    label: 'Avg. Progress (High → Low)' },
  { value: 'projects-desc',    label: 'Projects (Most First)' },
  { value: 'name-asc',         label: 'Name (A–Z)' },
  { value: 'name-desc',        label: 'Name (Z–A)' },
];

/**
 * Map a backend lead-stats row into the shape the UI expects.
 *
 * Two scopes are unpacked:
 *   - PERSONAL  → d.personal.*    (the lead's own tasks)
 *   - PROJECT   → d.project.*     (all tasks in the lead's projects)
 */
function mapLeadRow(row) {
  const pTotal    = Number(row.personalTotalTasks) || 0;
  const pCompRate = Number(row.personalCompletionRate) || 0;

  // The performance verdict is based on PERSONAL completion, not project.
  // A lead who runs a large project but does zero work themselves isn't
  // "excellent" — they're "managing". A lead with no personal tasks at
  // all is "New" only if they also have no projects.
  const projectTotal = Number(row.totalTasks) || 0;
  const performance =
    pTotal === 0 && projectTotal === 0 ? 'New' :
    pTotal === 0 ?                       'Managing' :
    pCompRate >= 80 ?                    'Excellent' :
    pCompRate >= 60 ?                    'Good' :
    pCompRate >= 40 ?                    'Average' :
                                          'Needs Attention';

  const perfColor =
    pTotal === 0 && projectTotal === 0 ? '#94a3b8' :
    pTotal === 0 ?                       '#818cf8' :
    pCompRate >= 80 ?                    '#34d399' :
    pCompRate >= 60 ?                    '#2dd4bf' :
    pCompRate >= 40 ?                    '#f59e0b' :
                                          '#f87171';

  return {
    leadId: row.userId,
    user: {
      id: row.userId,
      u_name: row.u_name,
      email: row.email,
      role: row.role,
    },
    projects: asArray(row.projects),

    // ─── PERSONAL scope (the lead's own work) ───
    personal: {
      total:       pTotal,
      completed:   Number(row.personalCompletedTasks) || 0,
      inProgress:  Number(row.personalInProgressTasks) || 0,
      todo:        Number(row.personalTodoTasks) || 0,
      completionRate: pCompRate,
      avgProgress:    Number(row.personalAvgProgress) || 0,
      onTimeRate:     Number(row.personalOnTimeRate) || 0,
      hasCompletedWithDue: !!row.personalHasCompletedWithDue,
    },

    // ─── PROJECT scope (team-wide outcome) ───
    project: {
      total:       projectTotal,
      completed:   Number(row.completedTasks) || 0,
      inProgress:  Number(row.inProgressTasks) || 0,
      todo:        Number(row.todoTasks) || 0,
      completionRate: Number(row.completionRate) || 0,
      avgProgress:    Number(row.avgProgress) || 0,
      onTimeRate:     Number(row.onTimeRate) || 0,
      hasCompletedWithDue: !!row.hasCompletedWithDue,
    },

    // ─── Misc ───
    teamSize:    Number(row.teamSize) || 0,
    hasTeamMember: !!row.hasTeamMember,
    teamMemberId:  row.teamMemberId,

    // ─── Verdict ───
    performance,
    perfColor,
  };
}

/* ─────────── Sub-components ─────────── */

function StatCard({ icon: Icon, label, value, color, sublabel }) {
  return (
    <motion.div
      className="leads-stat"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
    >
      <div
        className="leads-stat-icon"
        style={{ background: `${color}1f`, color }}
      >
        <Icon size={18} />
      </div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <span className="leads-stat-value">{value}</span>
        <span className="leads-stat-label">{label}</span>
        {sublabel && <span className="leads-stat-sublabel">{sublabel}</span>}
      </div>
    </motion.div>
  );
}

function EmptyState({ icon: Icon, title, subtitle }) {
  return (
    <div className="leads-empty">
      <Icon size={48} />
      <h3>{title}</h3>
      <p>{subtitle}</p>
    </div>
  );
}

function PerformanceBadge({ performance, color, size = 'sm' }) {
  return (
    <span
      className={`lead-perf-badge ${size === 'lg' ? 'lead-perf-badge-lg' : ''}`}
      style={{ color }}
    >
      {performance}
    </span>
  );
}

/**
 * A single scoped stat row: { Done / Active / To Do / Total } +
 * a header label and a completion-rate pill on the right.
 */
function ScopedStatRow({ scope, label, rate, rateColor, icon: Icon }) {
  return (
    <div className="scope-block">
      <div className="scope-header">
        <div className="scope-label">
          {Icon && <Icon size={11} />}
          <span>{label}</span>
        </div>
        <span className="scope-rate" style={{ color: rateColor }}>
          {scope.total > 0 ? `${rate}%` : '—'}
        </span>
      </div>
      <div className="scope-grid">
        <div className="scope-cell">
          <span className="scope-num" style={{ color: '#34d399' }}>
            {scope.completed}
          </span>
          <span className="scope-lbl">Done</span>
        </div>
        <div className="scope-cell">
          <span className="scope-num" style={{ color: '#818cf8' }}>
            {scope.inProgress}
          </span>
          <span className="scope-lbl">Active</span>
        </div>
        <div className="scope-cell">
          <span className="scope-num" style={{ color: '#94a3b8' }}>
            {scope.todo}
          </span>
          <span className="scope-lbl">To Do</span>
        </div>
        <div className="scope-cell">
          <span className="scope-num">{scope.total}</span>
          <span className="scope-lbl">Total</span>
        </div>
      </div>
    </div>
  );
}

/* ─────────── Main Component ─────────── */
export default function SupervisorLeads() {
  const ctx = useOutletContext?.() || {};
  const onMenuClick = ctx.onMenuClick;
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [leadsData, setLeadsData] = useState([]);

  const [selectedLead, setSelectedLead] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterPerformance, setFilterPerformance] = useState('all');
  const [filterHasProfile, setFilterHasProfile] = useState('all');
  const [sortBy, setSortBy] = useState('completion-desc');

  /* ─── Fetch data ─── */
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const res = await leadService.getLeadsStats();
      const rows = asArray(res?.data || res);
      const mapped = rows.map(mapLeadRow);
      setLeadsData(mapped);

      setSelectedLead((prev) => {
        if (prev == null) return prev;
        return mapped.some((l) => l.leadId === prev) ? prev : null;
      });

      console.log('📊 [SupervisorLeads] leads loaded:', mapped.length);
    } catch (error) {
      console.error('Error fetching leads data:', error);
      toast.error('Failed to load leads data');
      setLeadsData([]);
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

  /* ─── Aggregate ─── */
  const aggregate = useMemo(() => {
    const total = leadsData.length;
    const withProfile = leadsData.filter(x => x.hasTeamMember).length;
    const withoutProfile = total - withProfile;

    const personalTasks = leadsData.reduce((s, l) => s + l.personal.total, 0);
    const projectTasks  = leadsData.reduce((s, l) => s + l.project.total, 0);
    const totalProjects = leadsData.reduce((s, l) => s + l.projects.length, 0);

    // Personal completion is what we compare leads on.
    const avgPersonalCompletion = total
      ? Math.round(
          leadsData.reduce((s, l) => s + l.personal.completionRate, 0) / total
        )
      : 0;

    const topPerformer = [...leadsData]
      .filter((l) => l.personal.total > 0)
      .sort((a, b) => b.personal.completionRate - a.personal.completionRate)[0] || null;

    return {
      total, withProfile, withoutProfile,
      personalTasks, projectTasks, totalProjects,
      avgPersonalCompletion,
      topPerformer,
    };
  }, [leadsData]);

  /* ─── Filter + sort ─── */
  const visibleLeads = useMemo(() => {
    const q = norm(searchTerm);
    let out = leadsData.filter((d) => {
      const nameMatch = !q || norm(d.user?.u_name).includes(q);
      const perfMatch =
        filterPerformance === 'all' ||
        norm(d.performance) === norm(filterPerformance);
      const profileMatch =
        filterHasProfile === 'all' ||
        (filterHasProfile === 'yes' && d.hasTeamMember) ||
        (filterHasProfile === 'no' && !d.hasTeamMember);
      return nameMatch && perfMatch && profileMatch;
    });

    out = [...out].sort((a, b) => {
      switch (sortBy) {
        case 'name-asc':  return norm(a.user?.u_name).localeCompare(norm(b.user?.u_name));
        case 'name-desc': return norm(b.user?.u_name).localeCompare(norm(a.user?.u_name));
        case 'completion-desc':  return b.personal.completionRate - a.personal.completionRate;
        case 'completion-asc':   return a.personal.completionRate - b.personal.completionRate;
        case 'personal-tasks-desc': return b.personal.total - a.personal.total;
        case 'project-tasks-desc':  return b.project.total - a.project.total;
        case 'progress-desc':    return b.personal.avgProgress - a.personal.avgProgress;
        case 'projects-desc':    return b.projects.length - a.projects.length;
        default: return 0;
      }
    });

    return out;
  }, [leadsData, searchTerm, filterPerformance, filterHasProfile, sortBy]);

  const hasActiveFilters =
    searchTerm !== '' ||
    filterPerformance !== 'all' ||
    filterHasProfile !== 'all';

  const clearAllFilters = () => {
    setSearchTerm('');
    setFilterPerformance('all');
    setFilterHasProfile('all');
  };

  /* ─── CSV export ─── */
  const handleExportCSV = () => {
    if (visibleLeads.length === 0) {
      toast.error('Nothing to export');
      return;
    }

    const headers = [
      'Name', 'Email', 'Role',
      'Projects', 'Team Size', 'Has Profile',
      // Personal scope
      'Personal Total', 'Personal Completed', 'Personal In Progress',
      'Personal To Do', 'Personal Completion Rate (%)',
      'Personal Avg Progress (%)', 'Personal On-Time Rate (%)',
      // Project scope
      'Project Total', 'Project Completed', 'Project In Progress',
      'Project To Do', 'Project Completion Rate (%)',
      'Project Avg Progress (%)', 'Project On-Time Rate (%)',
      'Performance',
    ];

    const rows = visibleLeads.map((d) => [
      d.user?.u_name ?? '',
      d.user?.email ?? '',
      d.user?.role ?? '',
      d.projects.length,
      d.teamSize,
      d.hasTeamMember ? 'Yes' : 'No',
      d.personal.total,
      d.personal.completed,
      d.personal.inProgress,
      d.personal.todo,
      d.personal.completionRate,
      d.personal.avgProgress,
      d.personal.hasCompletedWithDue ? d.personal.onTimeRate : '',
      d.project.total,
      d.project.completed,
      d.project.inProgress,
      d.project.todo,
      d.project.completionRate,
      d.project.avgProgress,
      d.project.hasCompletedWithDue ? d.project.onTimeRate : '',
      d.performance,
    ]);

    const escapeCell = (v) => {
      const s = String(v ?? '');
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };

    const csv = [headers, ...rows]
      .map((r) => r.map(escapeCell).join(','))
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `leads-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success(`Exported ${visibleLeads.length} leads`);
  };

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
              animation: 'spin 0.8s linear infinite',
            }} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <Topbar
        title="Leads Overview"
        onMenuClick={onMenuClick}
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="btn btn-secondary btn-sm"
              onClick={handleExportCSV}
              disabled={visibleLeads.length === 0}
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
              title="Export visible leads to CSV"
            >
              <Download size={14} />
              Export
            </button>
            <button
              className="btn btn-secondary btn-sm"
              onClick={handleRefresh}
              disabled={refreshing}
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <RefreshCw size={14} className={refreshing ? 'spin' : ''} />
              {refreshing ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>
        }
      />

      <div className="page-container">
        {/* ─── Aggregate cards ─── */}
        <div className="leads-stats">
          <StatCard icon={Users}        label="Total Leads"    value={aggregate.total}           color="#818cf8" />
          <StatCard icon={UserCheck}    label="With Profile"   value={aggregate.withProfile}     color="#34d399"
            sublabel={aggregate.total > 0 ? `${Math.round((aggregate.withProfile / aggregate.total) * 100)}% of total` : null} />
          <StatCard icon={AlertCircle}  label="No Profile"     value={aggregate.withoutProfile}  color="#f59e0b"
            sublabel={aggregate.withoutProfile > 0 ? 'Need a TeamMember profile' : 'All set'} />
          <StatCard icon={BarChart2}    label="Avg. Personal"  value={`${aggregate.avgPersonalCompletion}%`} color="#2dd4bf" />
          <StatCard icon={Target}       label="Personal Tasks" value={aggregate.personalTasks}   color="#a78bfa" />
          <StatCard icon={Briefcase}    label="Project Tasks"  value={aggregate.projectTasks}    color="#f472b6" />
        </div>

        {/* ─── Top performer ─── */}
        {aggregate.topPerformer && (
          <motion.div
            className="top-performer-banner"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div className="top-performer-icon"><Award size={18} /></div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="top-performer-title">Top Personal Performer</div>
              <div className="top-performer-name">
                {aggregate.topPerformer.user?.u_name}
              </div>
            </div>
            <div className="top-performer-metrics">
              <span className="top-performer-metric">
                <Target size={12} />
                {aggregate.topPerformer.personal.completionRate}% personal
              </span>
              <span className="top-performer-metric">
                <Zap size={12} />
                {aggregate.topPerformer.personal.total} tasks
              </span>
            </div>
          </motion.div>
        )}

        {/* ─── Filters ─── */}
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
              <button
                className="leads-search-clear"
                onClick={() => setSearchTerm('')}
                aria-label="Clear search"
              >
                <X size={14} />
              </button>
            )}
          </div>

          <select
            className="leads-filter-select"
            value={filterPerformance}
            onChange={e => setFilterPerformance(e.target.value)}
            aria-label="Filter by performance"
          >
            <option value="all">All Performance</option>
            <option value="excellent">⭐ Excellent</option>
            <option value="good">✅ Good</option>
            <option value="average">📊 Average</option>
            <option value="needs attention">⚠️ Needs Attention</option>
            <option value="managing">👔 Managing (no personal tasks)</option>
            <option value="new">🆕 New</option>
          </select>

          <select
            className="leads-filter-select"
            value={filterHasProfile}
            onChange={e => setFilterHasProfile(e.target.value)}
            aria-label="Filter by profile status"
          >
            <option value="all">All Profiles</option>
            <option value="yes">✓ Has Profile</option>
            <option value="no">✗ No Profile</option>
          </select>

          <select
            className="leads-filter-select"
            value={sortBy}
            onChange={e => setSortBy(e.target.value)}
            aria-label="Sort leads"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        {hasActiveFilters && (
          <div className="active-filters-bar">
            <Filter size={12} />
            <span>
              Showing <strong>{visibleLeads.length}</strong> of{' '}
              <strong>{leadsData.length}</strong> leads
            </span>
            <button className="clear-filters-btn" onClick={clearAllFilters}>
              Clear all filters
            </button>
          </div>
        )}

        {/* ─── Grid ─── */}
        {visibleLeads.length === 0 ? (
          <EmptyState
            icon={Users}
            title={hasActiveFilters ? 'No leads match your filters' : 'No leads found'}
            subtitle={
              hasActiveFilters
                ? 'Try adjusting or clearing your filters'
                : 'No users with the Lead role exist yet'
            }
          />
        ) : (
          <div className="leads-grid">
            {visibleLeads.map((d, index) => {
              const roleInfo = getRoleColor(d.user?.role);
              const initials = getInitials(d.user?.u_name);

              return (
                <motion.div
                  key={d.leadId}
                  className="lead-card"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(index * 0.03, 0.4), duration: 0.25 }}
                  whileHover={{ y: -3 }}
                  onClick={() => setSelectedLead(d.leadId)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setSelectedLead(d.leadId);
                    }
                  }}
                >
                  <div className="lead-card-header">
                    <div className="lead-avatar" style={{ borderColor: d.perfColor }}>
                      {initials}
                    </div>
                    <div className="lead-info">
                      <h3 className="lead-name" title={d.user?.u_name}>
                        {d.user?.u_name || 'Unknown'}
                      </h3>
                      <div className="lead-badges">
                        <span
                          className="lead-role-badge"
                          style={{ background: roleInfo.bg, color: roleInfo.color }}
                        >
                          {d.user?.role || 'Member'}
                        </span>
                        <PerformanceBadge performance={d.performance} color={d.perfColor} />
                        {!d.hasTeamMember && (
                          <span className="lead-no-profile-badge">No Profile</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* ─── PERSONAL SCOPE ─── */}
                  <ScopedStatRow
                    scope={d.personal}
                    label="Their Own Tasks"
                    rate={d.personal.completionRate}
                    rateColor={d.perfColor}
                    icon={UserCog}
                  />

                  {/* ─── PROJECT SCOPE ─── */}
                  <div className="scope-block scope-block-secondary">
                    <div className="scope-header">
                      <div className="scope-label">
                        <Briefcase size={11} />
                        <span>Their Projects (team-wide)</span>
                      </div>
                      <span className="scope-rate" style={{ color: 'var(--text-muted)' }}>
                        {d.project.total > 0 ? `${d.project.completionRate}%` : '—'}
                      </span>
                    </div>
                    <div className="scope-grid">
                      <div className="scope-cell">
                        <span className="scope-num">{d.projects.length}</span>
                        <span className="scope-lbl">Projects</span>
                      </div>
                      <div className="scope-cell">
                        <span className="scope-num" style={{ color: '#34d399' }}>
                          {d.project.completed}
                        </span>
                        <span className="scope-lbl">Done</span>
                      </div>
                      <div className="scope-cell">
                        <span className="scope-num" style={{ color: '#818cf8' }}>
                          {d.project.inProgress}
                        </span>
                        <span className="scope-lbl">Active</span>
                      </div>
                      <div className="scope-cell">
                        <span className="scope-num">{d.project.total}</span>
                        <span className="scope-lbl">Total</span>
                      </div>
                    </div>
                  </div>

                  <div className="lead-card-footer">
                    <div className="lead-meta-pills">
                      <span
                        className="lead-meta-pill"
                        title={
                          d.project.hasCompletedWithDue
                            ? 'On-time completion rate across their projects'
                            : 'No completed tasks with due dates yet'
                        }
                      >
                        <CheckCircle2 size={11} />
                        {d.project.hasCompletedWithDue ? `${d.project.onTimeRate}%` : '—'}
                      </span>
                      <span
                        className="lead-meta-pill"
                        title="Team members on their projects"
                      >
                        <UserCog size={11} />
                        {d.teamSize}
                      </span>
                    </div>
                    <div className="lead-project-tags">
                      {d.projects.slice(0, 2).map((p) => (
                        <span
                          key={p.p_id || p.id}
                          className="lead-project-tag"
                          title={p.p_name || p.name}
                        >
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
          const d = leadsData.find((l) => l.leadId === selectedLead);
          if (!d) return null;

          const roleInfo = getRoleColor(d.user?.role);
          const initials = getInitials(d.user?.u_name);
          const delta = d.personal.completionRate - aggregate.avgPersonalCompletion;

          return (
            <motion.div
              className="modal-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedLead(null)}
            >
              <motion.div
                className="modal-content"
                initial={{ opacity: 0, y: 20, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 20, scale: 0.95 }}
                transition={{ type: 'spring', damping: 25 }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="modal-header">
                  <div className="modal-header-left">
                    <div className="modal-avatar" style={{ borderColor: d.perfColor }}>
                      {initials}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <h2 className="modal-name">{d.user?.u_name || 'Unknown'}</h2>
                      <div className="modal-badges">
                        <span
                          className="modal-role-badge"
                          style={{ background: roleInfo.bg, color: roleInfo.color }}
                        >
                          {d.user?.role || 'Member'}
                        </span>
                        <PerformanceBadge performance={d.performance} color={d.perfColor} size="lg" />
                      </div>
                    </div>
                  </div>
                  <button
                    className="modal-close-btn"
                    onClick={() => setSelectedLead(null)}
                    aria-label="Close"
                  >
                    <X size={20} />
                  </button>
                </div>

                <div className="modal-body">
                  {d.user?.email && (
                    <a
                      className="modal-contact-row"
                      href={`mailto:${d.user.email}`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Mail size={14} />
                      <span>{d.user.email}</span>
                      <ExternalLink size={12} style={{ opacity: 0.5 }} />
                    </a>
                  )}

                  {/* ─── PERSONAL SCOPE ─── */}
                  <div className="modal-scope-card modal-scope-personal">
                    <div className="modal-scope-title">
                      <UserCog size={14} />
                      <span>Their Own Tasks</span>
                      <span className="modal-scope-rate" style={{ color: d.perfColor }}>
                        {d.personal.total > 0 ? `${d.personal.completionRate}%` : '—'}
                      </span>
                    </div>
                    <div className="modal-scope-stats">
                      <div className="modal-stat">
                        <span className="modal-stat-value" style={{ color: '#34d399' }}>
                          {d.personal.completed}
                        </span>
                        <span className="modal-stat-label">Done</span>
                      </div>
                      <div className="modal-stat">
                        <span className="modal-stat-value" style={{ color: '#818cf8' }}>
                          {d.personal.inProgress}
                        </span>
                        <span className="modal-stat-label">Active</span>
                      </div>
                      <div className="modal-stat">
                        <span className="modal-stat-value" style={{ color: '#94a3b8' }}>
                          {d.personal.todo}
                        </span>
                        <span className="modal-stat-label">To Do</span>
                      </div>
                      <div className="modal-stat">
                        <span className="modal-stat-value">{d.personal.total}</span>
                        <span className="modal-stat-label">Total</span>
                      </div>
                    </div>
                    <div className="modal-progress">
                      <div className="modal-progress-header">
                        <span>Avg. Progress (own tasks)</span>
                        <span style={{ color: d.perfColor, fontWeight: 700 }}>
                          {d.personal.total > 0 ? `${d.personal.avgProgress}%` : '—'}
                        </span>
                      </div>
                      <div className="modal-progress-bar">
                        <div
                          className="modal-progress-fill"
                          style={{ width: `${d.personal.avgProgress}%`, background: d.perfColor }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* ─── PROJECT SCOPE ─── */}
                  <div className="modal-scope-card modal-scope-project">
                    <div className="modal-scope-title">
                      <Briefcase size={14} />
                      <span>Their Projects (team-wide)</span>
                      <span className="modal-scope-rate" style={{ color: 'var(--text-muted)' }}>
                        {d.project.total > 0 ? `${d.project.completionRate}%` : '—'}
                      </span>
                    </div>
                    <div className="modal-scope-stats">
                      <div className="modal-stat">
                        <span className="modal-stat-value" style={{ color: '#34d399' }}>
                          {d.project.completed}
                        </span>
                        <span className="modal-stat-label">Done</span>
                      </div>
                      <div className="modal-stat">
                        <span className="modal-stat-value" style={{ color: '#818cf8' }}>
                          {d.project.inProgress}
                        </span>
                        <span className="modal-stat-label">Active</span>
                      </div>
                      <div className="modal-stat">
                        <span className="modal-stat-value" style={{ color: '#94a3b8' }}>
                          {d.project.todo}
                        </span>
                        <span className="modal-stat-label">To Do</span>
                      </div>
                      <div className="modal-stat">
                        <span className="modal-stat-value">{d.project.total}</span>
                        <span className="modal-stat-label">Total</span>
                      </div>
                    </div>
                    <div className="modal-progress">
                      <div className="modal-progress-header">
                        <span>Avg. Progress (project-wide)</span>
                        <span style={{ color: 'var(--text-secondary)', fontWeight: 700 }}>
                          {d.project.total > 0 ? `${d.project.avgProgress}%` : '—'}
                        </span>
                      </div>
                      <div className="modal-progress-bar">
                        <div
                          className="modal-progress-fill"
                          style={{
                            width: `${d.project.avgProgress}%`,
                            background: 'var(--text-muted)',
                          }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Comparison vs. average (personal rate) */}
                  {aggregate.total > 1 && d.personal.total > 0 && (
                    <div className={`modal-comparison ${delta >= 0 ? 'up' : 'down'}`}>
                      {delta >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                      <span>
                        {delta >= 0 ? '+' : ''}
                        {delta.toFixed(1)}% personal completion vs team average (
                        {aggregate.avgPersonalCompletion}%)
                      </span>
                    </div>
                  )}

                  {/* KPI row */}
                  <div className="modal-kpis">
                    <div className="modal-kpi">
                      <CheckCircle2 size={14} />
                      <div>
                        <span className="modal-kpi-value">
                          {d.personal.hasCompletedWithDue ? `${d.personal.onTimeRate}%` : '—'}
                        </span>
                        <span className="modal-kpi-label">On-time (own)</span>
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
                        <span className="modal-kpi-value">{d.personal.total}</span>
                        <span className="modal-kpi-label">Assigned tasks</span>
                      </div>
                    </div>
                  </div>

                  {/* Projects list */}
                  <div className="modal-section">
                    <h4 className="modal-section-title">
                      <FolderKanban size={14} /> Projects ({d.projects.length})
                    </h4>
                    {d.projects.length === 0 ? (
                      <p className="modal-empty">No projects assigned</p>
                    ) : (
                      d.projects.map((p) => (
                        <button
                          key={p.p_id || p.id}
                          className="modal-project-item"
                          onClick={() => {
                            setSelectedLead(null);
                            navigate(`/supervisor/projects/${p.p_id || p.id}`);
                          }}
                          title="Open project"
                        >
                          <div style={{ minWidth: 0, flex: 1, textAlign: 'left' }}>
                            <span className="modal-project-name">
                              {p.p_name || p.name}
                            </span>
                            {(p.desc || p.description) && (
                              <span className="modal-project-desc">
                                {p.desc || p.description}
                              </span>
                            )}
                          </div>
                          <div className="modal-project-badges">
                            <StatusBadge status={p.status} />
                            <PriorityBadge priority={p.priority} />
                          </div>
                          <Eye size={14} className="modal-project-eye" />
                        </button>
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

        /* ─── Aggregate cards ─── */
        .leads-stats {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
          gap: 12px;
          margin-bottom: 18px;
        }
        .leads-stat {
          display: flex; align-items: center; gap: 12px;
          padding: 14px 16px;
          background: var(--bg-card);
          border: 1px solid var(--border-subtle);
          border-radius: 12px;
          transition: border-color 0.15s;
        }
        .leads-stat:hover { border-color: var(--border-default); }
        .leads-stat-icon {
          width: 40px; height: 40px; border-radius: 10px;
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
        }
        .leads-stat-value {
          display: block; font-size: 20px; font-weight: 800;
          color: var(--text-primary); line-height: 1.2;
        }
        .leads-stat-label { display: block; font-size: 12px; color: var(--text-muted); }
        .leads-stat-sublabel {
          display: block; font-size: 10px;
          color: var(--text-muted); opacity: 0.75; margin-top: 2px;
        }

        /* ─── Top performer banner ─── */
        .top-performer-banner {
          display: flex; align-items: center; gap: 12px;
          padding: 12px 16px;
          background: linear-gradient(90deg,
            rgba(245, 158, 11, 0.08),
            rgba(245, 158, 11, 0.02));
          border: 1px solid rgba(245, 158, 11, 0.25);
          border-radius: 12px;
          margin-bottom: 16px;
        }
        .top-performer-icon {
          width: 34px; height: 34px; border-radius: 8px;
          display: flex; align-items: center; justify-content: center;
          background: rgba(245, 158, 11, 0.15); color: #f59e0b;
          flex-shrink: 0;
        }
        .top-performer-title {
          font-size: 10px; font-weight: 700; color: #f59e0b;
          text-transform: uppercase; letter-spacing: 0.5px;
        }
        .top-performer-name {
          font-size: 14px; font-weight: 700; color: var(--text-primary);
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .top-performer-metrics { display: flex; gap: 10px; flex-wrap: wrap; flex-shrink: 0; }
        .top-performer-metric {
          display: inline-flex; align-items: center; gap: 4px;
          font-size: 11px; font-weight: 600; color: var(--text-secondary);
          padding: 3px 10px;
          background: var(--bg-card);
          border: 1px solid var(--border-subtle);
          border-radius: 20px;
          white-space: nowrap;
        }

        /* ─── Filters ─── */
        .leads-filters { display: flex; gap: 10px; margin-bottom: 16px; flex-wrap: wrap; }
        .leads-search { position: relative; flex: 1; min-width: 220px; }
        .leads-search-icon {
          position: absolute; left: 12px; top: 50%;
          transform: translateY(-50%); color: var(--text-muted); pointer-events: none;
        }
        .leads-search-input {
          width: 100%; padding: 9px 36px 9px 36px;
          border-radius: 8px;
          border: 1px solid var(--border-default);
          background: var(--bg-secondary);
          color: var(--text-primary);
          font-size: 13px; outline: none;
          transition: border-color 0.2s, box-shadow 0.2s;
        }
        .leads-search-input:focus {
          border-color: var(--accent-primary);
          background: var(--bg-card);
          box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.08);
        }
        .leads-search-clear {
          position: absolute; right: 8px; top: 50%; transform: translateY(-50%);
          display: flex; align-items: center; justify-content: center;
          width: 26px; height: 26px; border: none; border-radius: 50%;
          background: var(--bg-hover); color: var(--text-muted);
          cursor: pointer; transition: background 0.15s, color 0.15s;
        }
        .leads-search-clear:hover { background: var(--border-default); color: var(--text-primary); }
        .leads-filter-select {
          padding: 9px 32px 9px 12px; border-radius: 8px;
          border: 1px solid var(--border-default);
          background: var(--bg-secondary);
          color: var(--text-primary);
          font-size: 13px; outline: none; cursor: pointer;
          appearance: none;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E");
          background-repeat: no-repeat; background-position: right 10px center;
          transition: border-color 0.15s;
        }
        .leads-filter-select:hover { border-color: var(--border-strong); }
        .leads-filter-select:focus { border-color: var(--accent-primary); }

        /* ─── Active filters bar ─── */
        .active-filters-bar {
          display: flex; align-items: center; gap: 8px;
          padding: 8px 12px;
          background: var(--bg-secondary);
          border: 1px solid var(--border-subtle);
          border-radius: 8px;
          margin-bottom: 14px;
          font-size: 12px;
          color: var(--text-secondary);
          flex-wrap: wrap;
        }
        .active-filters-bar strong { color: var(--text-primary); }
        .clear-filters-btn {
          margin-left: auto;
          background: transparent;
          border: 1px solid var(--border-default);
          border-radius: 6px;
          padding: 3px 10px;
          font-size: 11px;
          font-weight: 600;
          color: var(--accent-primary);
          cursor: pointer;
          transition: background 0.15s, border-color 0.15s;
        }
        .clear-filters-btn:hover {
          background: var(--bg-hover);
          border-color: var(--accent-primary);
        }

        /* ─── Grid + cards ─── */
        .leads-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
          gap: 16px;
        }
        .lead-card {
          padding: 18px;
          background: var(--bg-card);
          border: 1px solid var(--border-subtle);
          border-radius: 14px;
          cursor: pointer;
          transition: border-color 0.2s, transform 0.2s, box-shadow 0.2s;
          display: flex; flex-direction: column; gap: 12px;
        }
        .lead-card:hover,
        .lead-card:focus-visible {
          border-color: var(--accent-primary);
          box-shadow: 0 6px 20px rgba(0, 0, 0, 0.08);
          outline: none;
        }
        .lead-card-header { display: flex; align-items: center; gap: 12px; }
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
        .lead-badges { display: flex; gap: 4px; flex-wrap: wrap; margin-top: 3px; }
        .lead-role-badge {
          font-size: 10px; font-weight: 600;
          padding: 2px 8px; border-radius: 10px;
          text-transform: capitalize;
        }
        .lead-perf-badge {
          font-size: 10px; font-weight: 700;
          padding: 2px 8px; border-radius: 10px;
          border: 1px solid currentColor;
          white-space: nowrap;
        }
        .lead-perf-badge-lg { font-size: 11px; padding: 2px 10px; border-radius: 12px; }
        .lead-no-profile-badge {
          font-size: 9px; font-weight: 600;
          padding: 2px 6px; border-radius: 4px;
          background: rgba(245, 158, 11, 0.15);
          color: #f59e0b;
          border: 1px solid rgba(245, 158, 11, 0.3);
        }

        /* ─── Scoped stat rows ─── */
        .scope-block {
          display: flex; flex-direction: column; gap: 6px;
        }
        .scope-block-secondary { opacity: 0.92; }
        .scope-header {
          display: flex; justify-content: space-between; align-items: center;
          padding: 0 2px;
        }
        .scope-label {
          display: inline-flex; align-items: center; gap: 5px;
          font-size: 10.5px; font-weight: 700;
          color: var(--text-secondary);
          text-transform: uppercase;
          letter-spacing: 0.4px;
        }
        .scope-rate {
          font-size: 12px; font-weight: 800;
          line-height: 1;
        }
        .scope-grid {
          display: grid; grid-template-columns: repeat(4, 1fr);
          gap: 4px;
          background: var(--bg-secondary);
          border-radius: 10px;
          border: 1px solid var(--border-subtle);
          padding: 6px 0;
        }
        .scope-cell { text-align: center; padding: 4px; }
        .scope-cell:not(:last-child) { border-right: 1px solid var(--border-subtle); }
        .scope-num {
          display: block; font-size: 15px; font-weight: 700;
          color: var(--text-primary); line-height: 1.2;
        }
        .scope-lbl {
          font-size: 9px; color: var(--text-muted);
          text-transform: uppercase; letter-spacing: 0.3px;
        }

        .lead-card-footer {
          display: flex; justify-content: space-between; align-items: center;
          padding-top: 10px;
          border-top: 1px solid var(--border-subtle);
          gap: 8px; flex-wrap: wrap;
        }
        .lead-project-tags { display: flex; gap: 4px; flex-wrap: wrap; }
        .lead-project-tag {
          font-size: 10px; font-weight: 500;
          padding: 2px 8px; border-radius: 4px;
          background: var(--bg-secondary);
          border: 1px solid var(--border-subtle);
          color: var(--text-secondary);
          white-space: nowrap; max-width: 100px;
          overflow: hidden; text-overflow: ellipsis;
        }
        .lead-meta-pills { display: flex; gap: 4px; flex-wrap: wrap; }
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
          color: var(--text-primary); margin: 12px 0 4px;
        }
        .leads-empty p { font-size: 13px; }

        /* ─── Modal ─── */
        .modal-overlay {
          position: fixed; inset: 0;
          background: rgba(0, 0, 0, 0.6);
          backdrop-filter: blur(6px);
          display: flex; align-items: center; justify-content: center;
          z-index: 1000; padding: 20px;
        }
        .modal-content {
          width: 100%; max-width: 660px; max-height: 90vh;
          overflow-y: auto;
          background: var(--bg-card);
          border: 1px solid var(--border-default);
          border-radius: 18px;
          box-shadow: 0 24px 80px rgba(0, 0, 0, 0.35);
        }
        .modal-content::-webkit-scrollbar { width: 4px; }
        .modal-content::-webkit-scrollbar-thumb {
          background: var(--border-default); border-radius: 10px;
        }
        .modal-header {
          display: flex; justify-content: space-between; align-items: flex-start;
          padding: 20px 24px 16px;
          border-bottom: 1px solid var(--border-subtle);
          position: sticky; top: 0;
          background: var(--bg-card);
          border-radius: 18px 18px 0 0;
          z-index: 2;
        }
        .modal-header-left { display: flex; align-items: center; gap: 14px; min-width: 0; }
        .modal-avatar {
          width: 52px; height: 52px; border-radius: 50%;
          border: 2px solid;
          display: flex; align-items: center; justify-content: center;
          font-size: 20px; font-weight: 800;
          background: var(--bg-secondary); color: var(--text-primary);
          flex-shrink: 0;
        }
        .modal-name {
          font-size: 18px; font-weight: 700;
          color: var(--text-primary); margin: 0;
          overflow: hidden; text-overflow: ellipsis;
          white-space: nowrap; max-width: 320px;
        }
        .modal-badges {
          display: flex; gap: 4px; flex-wrap: wrap;
          margin-top: 4px; align-items: center;
        }
        .modal-role-badge {
          font-size: 11px; font-weight: 600;
          padding: 2px 10px; border-radius: 12px;
          text-transform: capitalize;
        }
        .modal-close-btn {
          display: flex; align-items: center; justify-content: center;
          width: 36px; height: 36px; border-radius: 8px;
          border: 1px solid var(--border-subtle);
          background: var(--bg-secondary);
          color: var(--text-secondary);
          cursor: pointer;
          transition: border-color 0.15s, color 0.15s;
          flex-shrink: 0;
        }
        .modal-close-btn:hover {
          border-color: var(--accent-primary);
          color: var(--accent-primary);
        }
        .modal-body {
          padding: 20px 24px 24px;
          display: flex; flex-direction: column; gap: 16px;
        }

        .modal-contact-row {
          display: inline-flex; align-items: center; gap: 8px;
          padding: 8px 12px;
          background: var(--bg-secondary);
          border: 1px solid var(--border-subtle);
          border-radius: 8px;
          font-size: 12.5px;
          color: var(--text-secondary);
          text-decoration: none;
          transition: border-color 0.15s, color 0.15s;
          width: fit-content; max-width: 100%;
        }
        .modal-contact-row:hover {
          border-color: var(--accent-primary);
          color: var(--accent-primary);
        }
        .modal-contact-row span {
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }

        /* ─── Modal scope cards ─── */
        .modal-scope-card {
          padding: 14px 16px;
          border-radius: 12px;
          border: 1px solid var(--border-subtle);
          background: var(--bg-secondary);
          display: flex; flex-direction: column; gap: 10px;
        }
        .modal-scope-personal {
          background: linear-gradient(180deg,
            rgba(99, 102, 241, 0.04),
            rgba(99, 102, 241, 0.01));
          border-color: rgba(99, 102, 241, 0.18);
        }
        .modal-scope-project {
          background: var(--bg-secondary);
        }
        .modal-scope-title {
          display: flex; align-items: center; gap: 6px;
          font-size: 11px; font-weight: 700;
          color: var(--text-secondary);
          text-transform: uppercase;
          letter-spacing: 0.4px;
        }
        .modal-scope-title > span:first-of-type { flex: 1; }
        .modal-scope-rate { font-size: 13px; font-weight: 800; }

        .modal-scope-stats {
          display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px;
        }
        .modal-stat {
          text-align: center;
          padding: 10px 6px;
          background: var(--bg-card);
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
          background: var(--bg-card);
          border-radius: 10px;
          padding: 10px 14px;
          border: 1px solid var(--border-subtle);
        }
        .modal-progress-header {
          display: flex; justify-content: space-between;
          font-size: 12px; color: var(--text-secondary);
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

        .modal-comparison {
          display: flex; align-items: center; gap: 8px;
          padding: 8px 12px;
          border-radius: 8px;
          font-size: 12px; font-weight: 600;
        }
        .modal-comparison.up {
          background: rgba(52, 211, 153, 0.08);
          color: #34d399;
          border: 1px solid rgba(52, 211, 153, 0.2);
        }
        .modal-comparison.down {
          background: rgba(248, 113, 113, 0.08);
          color: #f87171;
          border: 1px solid rgba(248, 113, 113, 0.2);
        }

        .modal-kpis {
          display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px;
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
          display: block; font-size: 15px; font-weight: 800;
          color: var(--text-primary); line-height: 1.2;
        }
        .modal-kpi-label {
          display: block; font-size: 10px;
          color: var(--text-muted);
          text-transform: uppercase; letter-spacing: 0.3px;
        }

        .modal-section { display: flex; flex-direction: column; gap: 8px; }
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
          cursor: pointer;
          transition: border-color 0.15s, background 0.15s;
          font: inherit; color: inherit; text-align: left; width: 100%;
        }
        .modal-project-item:hover {
          border-color: var(--accent-primary);
          background: var(--bg-hover);
        }
        .modal-project-name {
          display: block; font-size: 13px; font-weight: 600;
          color: var(--text-primary);
        }
        .modal-project-desc {
          display: block; font-size: 11px;
          color: var(--text-muted);
          overflow: hidden; text-overflow: ellipsis;
          white-space: nowrap; max-width: 320px;
        }
        .modal-project-badges { display: flex; gap: 4px; flex-shrink: 0; }
        .modal-project-eye {
          color: var(--text-muted);
          flex-shrink: 0;
          transition: color 0.15s;
        }
        .modal-project-item:hover .modal-project-eye {
          color: var(--accent-primary);
        }
        .modal-empty {
          font-size: 13px; color: var(--text-muted);
          text-align: center; padding: 8px 0;
        }

        /* ─── Responsive ─── */
        @media (max-width: 768px) {
          .leads-stats { grid-template-columns: 1fr 1fr; }
          .leads-grid { grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); }
          .modal-scope-stats { grid-template-columns: repeat(3, 1fr); }
          .modal-kpis { grid-template-columns: 1fr; }
          .modal-content { max-width: 100%; border-radius: 14px; max-height: 95vh; }
          .top-performer-banner { flex-wrap: wrap; }
          .top-performer-metrics { margin-left: 46px; }
        }
        @media (max-width: 480px) {
          .leads-stats { grid-template-columns: 1fr; }
          .leads-filters { flex-direction: column; }
          .leads-grid { grid-template-columns: 1fr; }
          .modal-scope-stats { grid-template-columns: repeat(2, 1fr); }
          .modal-header { padding: 16px 18px; }
          .modal-body { padding: 16px 18px; }
          .modal-name { max-width: 180px; }
          .top-performer-metrics { margin-left: 0; }
        }
      `}</style>
    </div>
  );
}