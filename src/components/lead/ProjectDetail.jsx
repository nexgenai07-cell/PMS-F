// components/lead/LeadProjectDetail.jsx
import { useState, useEffect, useMemo, useRef } from "react";
import { useParams, useNavigate, useOutletContext } from "react-router-dom";
import {
  ArrowLeft, MessageSquare, Users, CheckCircle2, Pencil, Trash2,
  X, Pin, PinOff, BarChart2, RefreshCw, Plus, Loader2,
  FolderKanban, Calendar, AlertCircle, Sparkles, Crown,
  User, Send, Clock, UserMinus, Shield, ListChecks, ChevronDown,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import toast from "react-hot-toast";

import Topbar from "../shared/Topbar";
import { Avatar, StatusBadge, PriorityBadge } from "../shared/UIComponents";
import projectService from "../../services/projectService";
import taskService from "../../services/taskService";
import teamService from "../../services/teamService";
import commentService from "../../services/commentService";
import projectTeamService from "../../services/projectTeamService";
import userService from "../../services/userService";
import { useAuth } from "../../context/AuthContext";
import NotificationHelper from '../../services/notificationHelper';

const PRIORITY_OPTIONS = ["low", "medium", "high", "critical"];
const STATUS_OPTIONS   = ["todo", "in_progress", "review", "done", "cancelled"];
const SUPERVISOR_ROLES = ['manager', 'admin', 'supervisor'];
const LEAD_ROLES       = ['lead', 'member'];

const asArray = (v) => (Array.isArray(v) ? v : []);

/* ─── PTeam helpers ─── */
function getPteamProjectId(entry) {
  return Number(entry?.p ?? entry?.p_id ?? entry?.project ?? entry?.projectId ?? entry?.project_id);
}
function getPteamTmId(entry) {
  return Number(entry?.tm ?? entry?.tm_id ?? entry?.team_member ?? entry?.member ?? entry?.member_id ?? entry?.teamMember);
}

function computeTaskProgress(task) {
  if (task?.progress !== undefined && task?.progress !== null) {
    const raw = Number(task.progress);
    if (Number.isFinite(raw)) return raw;
  }
  const s = (task?.status || '').toLowerCase();
  if (s === 'done' || s === 'completed') return 100;
  if (s === 'review') return 75;
  if (s === 'in_progress' || s === 'in-progress') return 50;
  return 0;
}

/* ─── Validation ─── */
const LIMITS = {
  taskTitle: { min: 3, max: 200 },
  taskDesc:  { max: 2000 },
};
const TASK_TITLE_REGEX = /^[\p{L}\p{N} &\-.'(),!?]+$/u;

const validators = {
  taskTitle: (value) => {
    const v = (value ?? '').trim();
    if (!v) return 'Task title is required';
    if (v.length < LIMITS.taskTitle.min) return `Task title must be at least ${LIMITS.taskTitle.min} characters`;
    if (v.length > LIMITS.taskTitle.max) return `Task title must be less than ${LIMITS.taskTitle.max} characters`;
    if (!TASK_TITLE_REGEX.test(v)) return 'Only letters, numbers, spaces, and  & - . \' ( ) , ! ?  are allowed';
    return '';
  },
  taskDesc: (value) => {
    const v = value ?? '';
    if (v.length > LIMITS.taskDesc.max) return `Description must be less than ${LIMITS.taskDesc.max} characters`;
    return '';
  },
  priority: (value) => (!PRIORITY_OPTIONS.includes(value) ? 'Invalid priority selected' : ''),
  taskStatus: (value) => (!STATUS_OPTIONS.includes(value) ? 'Invalid status selected' : ''),
  progress: (value) => {
    const n = Number(value);
    if (Number.isNaN(n)) return 'Progress must be a number';
    if (n < 0 || n > 100) return 'Progress must be between 0 and 100';
    return '';
  },
};

function FieldError({ message }) {
  if (!message) return null;
  return (
    <div className="pd-field-error" role="alert">
      <AlertCircle size={12} />
      <span>{message}</span>
    </div>
  );
}

/* ─── Multi-select member picker ─── */
function MemberMultiPicker({ selected = [], onChange, members = [], label = "Members" }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const triggerRef = useRef(null);
  const [dropdownStyle, setDropdownStyle] = useState({});

  const safeMembers = asArray(members);
  const selectedSet = new Set(selected.map(Number));

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return safeMembers;
    return safeMembers.filter(m =>
      (m.name || '').toLowerCase().includes(q) ||
      (m.role || '').toLowerCase().includes(q)
    );
  }, [safeMembers, query]);

  const selectedMembers = safeMembers.filter(m => selectedSet.has(Number(m.id)));

  const toggle = (id) => {
    const num = Number(id);
    const next = selectedSet.has(num)
      ? selected.map(Number).filter(x => x !== num)
      : [...selected.map(Number), num];
    onChange(next);
  };

  const updatePosition = () => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    setDropdownStyle({
      position: 'fixed',
      left: rect.left,
      width: rect.width,
      top: rect.bottom + 6,
      maxHeight: Math.min(spaceBelow - 12, 320),
      zIndex: 10001,
    });
  };

  useEffect(() => {
    if (!open) return;
    updatePosition();
    const onScroll = () => updatePosition();
    window.addEventListener('resize', onScroll);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      window.removeEventListener('resize', onScroll);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open]);

  return (
    <div style={{ position: 'relative' }}>
      <label className="form-label">{label}</label>
      <div ref={triggerRef} className="multi-trigger" onClick={() => setOpen(o => !o)}>
        {selectedMembers.length === 0 ? (
          <span style={{ color: 'var(--text-muted)' }}>Select members...</span>
        ) : (
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', flex: 1 }}>
            {selectedMembers.map(m => (
              <span key={m.id} className="multi-chip">
                <Avatar name={m.name} size="sm" />
                {m.name}
                <button type="button" onClick={(e) => { e.stopPropagation(); toggle(m.id); }}>
                  <X size={10} />
                </button>
              </span>
            ))}
          </div>
        )}
        <ChevronDown size={14} style={{ marginLeft: 'auto', flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
      </div>
      {open && (
        <>
          <div className="multi-backdrop" onClick={() => setOpen(false)} />
          <div className="multi-dropdown" style={dropdownStyle}>
            <div className="multi-search">
              <input
                autoFocus
                placeholder="Search..."
                value={query}
                onChange={e => setQuery(e.target.value)}
              />
              {query && <button onClick={() => setQuery('')}><X size={12} /></button>}
            </div>
            <div className="multi-list">
              {filtered.length === 0 && <div className="multi-empty">No members match</div>}
              {filtered.map(m => {
                const isSelected = selectedSet.has(Number(m.id));
                return (
                  <button
                    key={m.id}
                    type="button"
                    className={`multi-option ${isSelected ? 'selected' : ''}`}
                    onClick={() => toggle(m.id)}
                  >
                    <Avatar name={m.name} size="sm" />
                    <span style={{ flex: 1, textAlign: 'left' }}>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{m.name}</div>
                      {m.role && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{m.role}</div>}
                    </span>
                    {isSelected && <CheckCircle2 size={14} style={{ color: 'var(--accent-primary)' }} />}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* ─── Lead picker with Lead/Member toggle ─── */
function LeadPicker({
  leads = [],
  assignments = {},
  onAssign,
  onUnassign,
  alreadyLeadIds = [],
  saving = false,
  onConfirm,
}) {
  const isSelected = (id) => assignments[id] != null;

  const toggleLead = (lead) => {
    if (isSelected(lead.id)) {
      onUnassign(lead.id);
    } else {
      onAssign(lead.id, 'lead');
    }
  };

  return (
    <>
      <div className="modal-body">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 380, overflowY: 'auto' }}>
          {leads.length === 0 ? (
            <p style={{ padding: '12px 4px', color: 'var(--text-muted)', fontSize: 13 }}>
              No leads available. Ask an admin to create Lead accounts.
            </p>
          ) : leads.map(l => {
            const name = l.u_name || l.name || `User ${l.id}`;
            const selected = isSelected(l.id);
            const mode = assignments[l.id];
            const alreadyLead = alreadyLeadIds.includes(Number(l.id));

            return (
              <div key={l.id} className="lead-add-row">
                <button
                  type="button"
                  className={`add-picker-row lead-add-btn ${selected ? 'selected' : ''}`}
                  onClick={() => toggleLead(l)}
                  style={{ flex: 1 }}
                >
                  <Avatar name={name} size="sm" />
                  <div style={{ flex: 1, textAlign: 'left' }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>
                      {name}
                      {alreadyLead && <span className="lead-already-badge">already a Lead</span>}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      {l.email || 'Lead'}
                    </div>
                  </div>
                  {selected && <CheckCircle2 size={14} style={{ color: 'var(--accent-primary)' }} />}
                </button>

                {selected && (
                  <div className="lead-mode-toggle" onClick={e => e.stopPropagation()}>
                    <button
                      type="button"
                      className={`lead-mode-btn ${mode === 'lead' ? 'active' : ''}`}
                      onClick={() => onAssign(l.id, 'lead')}
                      title="Add as Project Lead (co-supervisor of this project)"
                    >
                      Lead
                    </button>
                    <button
                      type="button"
                      className={`lead-mode-btn ${mode === 'member' ? 'active' : ''}`}
                      onClick={() => onAssign(l.id, 'member')}
                      title="Add as a regular Team Member on this project"
                    >
                      Member
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="modal-footer">
        <button
          className="btn btn-primary btn-sm"
          onClick={onConfirm}
          disabled={saving || Object.keys(assignments).length === 0}
        >
          {saving ? <><Loader2 size={13} className="spin" /> Adding...</> : 'Add Selected Leads'}
        </button>
      </div>
    </>
  );
}

/* ─── Inline "add subtask to draft" row used inside the Create Task modal ─── */
function SubtaskDraftRow({ onAdd, members, disabled }) {
  const [draft, setDraft] = useState({
    title: "", priority: "medium", status: "todo", assignees: [],
  });
  const [touched, setTouched] = useState(false);

  const titleError = validators.taskTitle(draft.title);
  const showError = touched && titleError;

  const handleAdd = () => {
    setTouched(true);
    if (titleError) return;
    onAdd({
      title: draft.title.trim(),
      priority: draft.priority,
      status: draft.status,
      assignees: asArray(draft.assignees).map(Number).filter(Number.isFinite),
    });
    setDraft({ title: "", priority: "medium", status: "todo", assignees: [] });
    setTouched(false);
  };

  return (
    <div className="subtask-draft-row">
      <div className="subtask-draft-inputs">
        <input
          className={`form-input ${showError ? 'pd-input-error' : ''}`}
          placeholder="Subtask title"
          value={draft.title}
          maxLength={LIMITS.taskTitle.max}
          autoComplete="off"
          onChange={(e) => setDraft(prev => ({ ...prev, title: e.target.value }))}
          onBlur={() => setTouched(true)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAdd(); } }}
          disabled={disabled}
        />
        <select
          className="form-input subtask-draft-select"
          value={draft.priority}
          onChange={(e) => setDraft(prev => ({ ...prev, priority: e.target.value }))}
          disabled={disabled}
        >
          {PRIORITY_OPTIONS.map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
        </select>
      </div>
      {showError && <FieldError message={titleError} />}
      <div className="subtask-draft-actions">
        <MemberMultiPicker
          label="Assignees (optional)"
          members={members}
          selected={draft.assignees}
          onChange={(ids) => setDraft(prev => ({ ...prev, assignees: ids }))}
        />
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={handleAdd}
          disabled={disabled || !draft.title.trim()}
        >
          <Plus size={13} /> Add Subtask
        </button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════ */
export default function LeadProjectDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { onMenuClick } = useOutletContext();
  const { user } = useAuth();

  const projectId = parseInt(id);

  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [project, setProject]       = useState(null);
  const [tasks, setTasks]           = useState([]);
  const [allTeamMembers, setAllTeamMembers] = useState([]);
  const [projectMembers, setProjectMembers] = useState([]);
  const [projectSupervisors, setProjectSupervisors] = useState([]);
  const [projectLeads, setProjectLeads] = useState([]);
  const [users, setUsers]           = useState([]);
  const [comments, setComments]     = useState([]);
  const [pteamEntries, setPteamEntries] = useState([]);

  const [editTask, setEditTask]                   = useState(null);
  const [showAddTask, setShowAddTask]             = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(null);
  const [isSubmitting, setIsSubmitting]           = useState(false);

  const [addTaskTouched, setAddTaskTouched]       = useState({});
  const [editTaskTouched, setEditTaskTouched]     = useState({});
  const [addTaskSubmitAttempted, setAddTaskSubmitAttempted]   = useState(false);
  const [editTaskSubmitAttempted, setEditTaskSubmitAttempted] = useState(false);

  const [removeMemberInfo, setRemoveMemberInfo] = useState(null);
  const [reassignTo, setReassignTo]             = useState('');
  const [removeMemberSaving, setRemoveMemberSaving] = useState(false);

  const [addSupervisorOpen, setAddSupervisorOpen] = useState(false);
  const [addMemberOpen, setAddMemberOpen]         = useState(false);
  const [addLeadOpen, setAddLeadOpen]             = useState(false);
  const [addSupervisorSaving, setAddSupervisorSaving] = useState(false);
  const [addMemberSaving, setAddMemberSaving]         = useState(false);
  const [addLeadSaving, setAddLeadSaving]             = useState(false);

  // Lead candidates + their Lead/Member assignment mode for the add-lead modal
  const [leadCandidates, setLeadCandidates] = useState([]);
  const [addLeadAssignments, setAddLeadAssignments] = useState({});

  const addTaskTitleRef  = useRef(null);
  const editTaskTitleRef = useRef(null);
  const editTaskDescRef  = useRef(null);

  const [stats, setStats] = useState({
    totalTasks: 0, completedTasks: 0, inProgressTasks: 0, todoTasks: 0,
    completionRate: 0, onTimeRate: 0, membersCount: 0, avgProgress: 0
  });

  const [newTask, setNewTask] = useState({
    title: "", desc: "", priority: "medium", status: "todo",
    progress: 0, assignees: [], dueDate: "",
    subtasksDraft: [],
  });

  const addTaskErrors = useMemo(() => ({
    title: validators.taskTitle(newTask.title),
    desc: validators.taskDesc(newTask.desc),
    priority: validators.priority(newTask.priority),
    status: validators.taskStatus(newTask.status),
    progress: validators.progress(newTask.progress),
  }), [newTask]);

  const editTaskErrors = useMemo(() => {
    if (!editTask) return {};
    return {
      title: validators.taskTitle(editTask.title),
      desc: validators.taskDesc(editTask.desc),
      priority: validators.priority(editTask.priority),
      status: validators.taskStatus(editTask.status),
      progress: validators.progress(editTask.progress),
    };
  }, [editTask]);

  const isAddTaskValid  = Object.values(addTaskErrors).every(e => e === '');
  const isEditTaskValid = Object.values(editTaskErrors).every(e => e === '');

  /* ─── Derived data ─── */
  const supervisorIdSet = useMemo(
    () => new Set(asArray(projectSupervisors).map(s => Number(s.userId))),
    [projectSupervisors]
  );

  const projectLeadsDerived = useMemo(() => {
    if (!project) return [];
    const creatorId = Number(project.created_by);
    return asArray(projectMembers).filter(m => {
      const role = (m.role || '').toLowerCase();
      if (!LEAD_ROLES.includes(role)) return false;
      if (Number(m.userId) === creatorId) return false;
      if (supervisorIdSet.has(Number(m.userId))) return false;
      return true;
    });
  }, [projectMembers, project, supervisorIdSet]);

  const projectLeadsFinal = useMemo(() => {
    const stored = asArray(projectLeads);
    return stored.length > 0 ? stored : projectLeadsDerived;
  }, [projectLeads, projectLeadsDerived]);

  const regularMembers = useMemo(
    () => asArray(projectMembers).filter(m => {
      const role = (m.role || '').toLowerCase();
      if (SUPERVISOR_ROLES.includes(role)) return false;
      if (LEAD_ROLES.includes(role)) return false;
      if (supervisorIdSet.has(Number(m.userId))) return false;
      return true;
    }),
    [projectMembers, supervisorIdSet]
  );

  const assignableMembers = useMemo(
    () => asArray(projectMembers).filter(m => m.tmId != null),
    [projectMembers]
  );

  const projectProgress = useMemo(() => {
    const backendProgress = Number(stats?.avgProgress);
    if (Number.isFinite(backendProgress) && backendProgress > 0) return Math.round(backendProgress);
    if (!tasks || tasks.length === 0) return 0;
    const countable = tasks.filter(t => (t.status || '').toLowerCase() !== 'cancelled');
    if (countable.length === 0) return 0;
    const total = countable.reduce((s, t) => s + (Number(t.progress) || 0), 0);
    return Math.round(total / countable.length);
  }, [tasks, stats?.avgProgress]);

  /* ─── Escape key handler ─── */
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      if (removeMemberInfo) { setRemoveMemberInfo(null); setReassignTo(''); return; }
      if (showDeleteConfirm !== null) { setShowDeleteConfirm(null); return; }
      if (editTask) { setEditTask(null); setEditTaskTouched({}); setEditTaskSubmitAttempted(false); return; }
      if (showAddTask) { setShowAddTask(false); setAddTaskTouched({}); setAddTaskSubmitAttempted(false); return; }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [removeMemberInfo, showDeleteConfirm, editTask, showAddTask]);

  useEffect(() => {
    if (!showAddTask) return;
    const t = setTimeout(() => addTaskTitleRef.current?.focus(), 60);
    return () => clearTimeout(t);
  }, [showAddTask]);

  useEffect(() => {
    if (!editTask) return;
    const t = setTimeout(() => editTaskTitleRef.current?.focus(), 60);
    return () => clearTimeout(t);
  }, [editTask?.t_id, editTask?.id]);

  const resetAddTaskTouched = () => { setAddTaskTouched({}); setAddTaskSubmitAttempted(false); };
  const markAddTaskTouched  = (f) => setAddTaskTouched(p => ({ ...p, [f]: true }));
  const showAddTaskError = (f) => addTaskSubmitAttempted ? addTaskErrors[f] : (addTaskTouched[f] ? addTaskErrors[f] : '');

  const resetEditTaskTouched = () => { setEditTaskTouched({}); setEditTaskSubmitAttempted(false); };
  const markEditTaskTouched  = (f) => setEditTaskTouched(p => ({ ...p, [f]: true }));
  const showEditTaskError = (f) => editTaskSubmitAttempted ? editTaskErrors[f] : (editTaskTouched[f] ? editTaskErrors[f] : '');

  const getTaskComments = (taskId) => {
    if (!taskId) return [];
    return asArray(comments).filter(c => Number(c.taskId || c.t) === Number(taskId));
  };

  useEffect(() => { fetchProjectData(); /* eslint-disable-next-line */ }, [projectId]);

  /* ═══════════════════════════════════════════════════════════
     FETCH PROJECT DATA
     ═══════════════════════════════════════════════════════════ */
  const fetchProjectData = async () => {
    try {
      setLoading(true);
      const [projectData, tasksData, membersData, usersData, pteamData, statsData, leadsData] = await Promise.all([
        projectService.getProject(projectId).catch(() => ({ data: null })),
        taskService.getTasks().catch(() => ({ data: [] })),
        teamService.getTeamMembers().catch(() => ({ data: [] })),
        userService.getUsers().catch(() => ({ data: [] })),
        projectTeamService.getProjectTeams().catch(() => ({ data: [] })),
        projectService.getProjectStats(projectId).catch(() => ({ data: {} })),
        projectService.getLeadCandidates().catch(() => ({ data: [] })),
      ]);

      const projectItem   = projectData?.data || projectData || null;
      const allTasks      = asArray(tasksData?.data || tasksData);
      const membersList   = asArray(membersData?.data || membersData);
      const usersList     = asArray(usersData?.data || usersData);
      const pteamList     = asArray(pteamData?.data || pteamData);
      const statsResponse = statsData?.data || statsData || {};
      const leadsList     = asArray(leadsData?.data || leadsData);

      setProject(projectItem);
      setAllTeamMembers(membersList);
      setUsers(usersList);
      setPteamEntries(pteamList);
      setLeadCandidates(leadsList);

      setStats({
        totalTasks:      Number(statsResponse.totalTasks) || 0,
        completedTasks:  Number(statsResponse.completedTasks) || 0,
        inProgressTasks: Number(statsResponse.inProgressTasks) || 0,
        todoTasks:       Number(statsResponse.todoTasks) || 0,
        completionRate:  Number(statsResponse.completionRate) || 0,
        onTimeRate:      Number(statsResponse.onTimeRate) || 0,
        membersCount:    Number(statsResponse.membersCount) || 0,
        avgProgress:     Number(statsResponse.avgProgress) || 0,
      });

      const projectTasks = allTasks.filter(t => {
        const taskProjectId = t.p_id ?? t.p ?? t.project ?? t.project_id;
        const belongsToProject = Number(taskProjectId) === Number(projectId);
        const isTopLevel = t.parent == null;
        return belongsToProject && isTopLevel;
      });

      const memberMap = new Map();
      const projectPteamEntries = pteamList.filter(
        entry => getPteamProjectId(entry) === Number(projectId)
      );

      projectPteamEntries.forEach(entry => {
        const tmId = getPteamTmId(entry);
        if (!Number.isFinite(tmId)) return;
        if (memberMap.has(tmId)) return;

        const tm = membersList.find(m => Number(m.id) === tmId);
        if (!tm) return;
        const matchedUser = usersList.find(u => {
          const uName = (u.u_name || u.name || '').toLowerCase().trim();
          const mName = (tm.name || '').toLowerCase().trim();
          return uName && mName && uName === mName;
        });
        memberMap.set(tmId, {
          id: tm.id,
          userId: matchedUser?.id ?? tm.id,
          name: tm.name || matchedUser?.u_name || `User ${tm.id}`,
          email: tm.email || matchedUser?.email || '',
          role: ((matchedUser?.role) || tm.role || '').toLowerCase(),
          pt_id: entry.pt_id ?? entry.id ?? null,
          task_id: entry.t ?? null,
          tmId: tm.id,
        });
      });

      const memberEntries = Array.from(memberMap.values());

      const supervisorIds   = asArray(projectItem?.supervisors).map(Number);
      const supervisorNames = asArray(projectItem?.supervisor_names);

      const supervisorEntries = supervisorIds
        .map((sid, idx) => {
          if (!Number.isFinite(sid)) return null;
          const userObj = usersList.find(u => Number(u.id) === Number(sid));
          return {
            id: sid,
            userId: sid,
            name: supervisorNames[idx] || userObj?.u_name || userObj?.name || `User ${sid}`,
            email: userObj?.email || '',
            role: (userObj?.role || 'supervisor').toLowerCase(),
          };
        })
        .filter(Boolean);

      setProjectSupervisors(supervisorEntries);

      const supUserIdSet = new Set(supervisorEntries.map(s => Number(s.userId)));
      const membersWithoutSupervisors = memberEntries.filter(
        m => !supUserIdSet.has(Number(m.userId))
      );
      const allMembers = [...supervisorEntries, ...membersWithoutSupervisors];
      setProjectMembers(allMembers);

      const creatorId = Number(projectItem?.created_by);
      const leadEntries = memberEntries.filter(m => {
        const role = (m.role || '').toLowerCase();
        if (!LEAD_ROLES.includes(role)) return false;
        if (Number(m.userId) === creatorId) return false;
        if (supUserIdSet.has(Number(m.userId))) return false;
        return true;
      });
      setProjectLeads(leadEntries);

      const mappedTasks = projectTasks.map(t => ({
        ...t,
        progress: computeTaskProgress(t),
      }));
      setTasks(mappedTasks);

      loadCommentsForTasks(mappedTasks);

    } catch (error) {
      console.error('❌ Error fetching project data:', error);
      toast.error('Failed to load project details');
      if (error?.status === 404 || error?.response?.status === 404) {
        navigate('/lead/projects');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const loadCommentsForTasks = async (taskList) => {
    if (!Array.isArray(taskList) || taskList.length === 0) {
      setComments([]);
      return;
    }
    try {
      const allComments = [];
      for (const task of taskList) {
        const tid = task.t_id ?? task.id;
        if (!tid) continue;
        try {
          const commentsResponse = await commentService.getCommentsByTask(tid);
          const commentsList = asArray(commentsResponse?.data || commentsResponse);
          commentsList.forEach(comment => {
            allComments.push({ ...comment, taskId: tid });
          });
        } catch { /* silent */ }
      }
      setComments(allComments);
    } catch {
      setComments([]);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchProjectData();
    toast.success('Project refreshed');
  };

  const getAssigneeEmail = (assignee) => {
    if (!assignee) return null;
    if (assignee.email) return assignee.email;
    const matchedUser = asArray(users).find(u => {
      const userName = (u.u_name || u.name || '').toLowerCase().trim();
      const memberName = (assignee.name || '').toLowerCase().trim();
      return userName === memberName;
    });
    return matchedUser?.email || null;
  };

  /* ─── Open edit with full detail fetch ─── */
  const openEditTask = async (task) => {
    const tid = task.t_id || task.id;
    if (!tid) return;
    try {
      const detailResp = await taskService.getTask(tid);
      const full = detailResp?.data || detailResp || task;
      setEditTask({
        ...task,
        ...full,
        desc: full?.desc ?? task?.desc ?? '',
        assignees: Array.isArray(full?.assignees) && full.assignees.length > 0
          ? full.assignees.map(Number)
          : (Array.isArray(task?.assignees) && task.assignees.length > 0
              ? task.assignees.map(Number)
              : (task?.assign_to ? [Number(task.assign_to)] : [])),
      });
      resetEditTaskTouched();
    } catch {
      setEditTask({
        ...task,
        desc: task?.desc ?? '',
        assignees: Array.isArray(task?.assignees) && task.assignees.length > 0
          ? task.assignees.map(Number)
          : (task?.assign_to ? [Number(task.assign_to)] : []),
      });
      resetEditTaskTouched();
    }
  };

  /* ─── Add task ─── */
  const handleAddTask = async () => {
    setAddTaskSubmitAttempted(true);
    if (!isAddTaskValid) {
      toast.error("Please fix the highlighted errors before creating the task");
      return;
    }
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      const assignees = asArray(newTask.assignees).map(Number).filter(Number.isFinite);

      const response = await taskService.createTask({
        title: newTask.title.trim(),
        description: (newTask.desc || '').trim(),
        status: newTask.status,
        priority: newTask.priority,
        projectId: projectId,
        assignees: assignees,
        assignTo: assignees[0] ?? null,
        dueDate: newTask.dueDate || null,
        startDate: null,
        progress: newTask.progress,
      });

      const createdTask = response?.data || response;
      const createdId = createdTask?.t_id || createdTask?.id;

      let subtaskFailures = 0;
      if (createdId && asArray(newTask.subtasksDraft).length > 0) {
        for (const sub of newTask.subtasksDraft) {
          try {
            await taskService.createSubtask(createdId, {
              title: sub.title,
              description: sub.desc || '',
              status: sub.status || 'todo',
              priority: sub.priority || 'medium',
              progress: sub.progress ?? 0,
              assignees: asArray(sub.assignees),
              assignTo: asArray(sub.assignees)[0] ?? null,
              dueDate: sub.dueDate || null,
            });
          } catch (e) {
            console.warn('Failed to create subtask:', sub, e);
            subtaskFailures += 1;
          }
        }
      }

      try { await NotificationHelper.taskCreated(createdTask, user); } catch { /* silent */ }

      if (assignees.length > 0) {
        let notified = 0;
        for (const aid of assignees) {
          const assignee = allTeamMembers.find(m => Number(m.id) === Number(aid));
          if (!assignee) continue;
          const email = getAssigneeEmail(assignee);
          if (!email) continue;
          try {
            await NotificationHelper.taskAssigned(createdTask, { ...assignee, email }, user, project);
            notified += 1;
          } catch { /* silent */ }
        }
        if (notified > 0) toast.success(`Task created · ${notified} notification(s) sent`);
        else toast.success('Task created successfully');
      } else {
        toast.success('Task created successfully');
      }

      if (subtaskFailures > 0) {
        toast.error(`${subtaskFailures} subtask(s) could not be created — you can add them from the task detail page.`);
      }

      setNewTask({
        title: "", desc: "", priority: "medium", status: "todo",
        progress: 0, assignees: [], dueDate: "",
        subtasksDraft: [],
      });
      setShowAddTask(false);
      resetAddTaskTouched();
      await fetchProjectData();
    } catch (error) {
      console.error('❌ Error adding task:', error);
      toast.error('Failed to add task');
    } finally {
      setIsSubmitting(false);
    }
  };

  /* ─── Update task ─── */
  const handleUpdateTask = async (updated) => {
    setEditTaskSubmitAttempted(true);
    if (!isEditTaskValid) {
      toast.error('Please fix the highlighted errors before saving');
      return;
    }
    try {
      const assignees = asArray(updated.assignees).map(Number).filter(Number.isFinite);

      const response = await taskService.updateTask(updated.t_id || updated.id, {
        title: updated.title.trim(),
        description: (updated.desc || '').trim(),
        status: updated.status,
        priority: updated.priority,
        progress: updated.progress,
        assignees: assignees,
        assignTo: assignees[0] ?? null,
        dueDate: updated.due_date || null,
      });

      const updatedTask = response?.data || response;
      try { await NotificationHelper.taskUpdated(updatedTask, user); } catch { /* silent */ }

      setEditTask(null);
      resetEditTaskTouched();
      toast.success("Task updated successfully");
      await fetchProjectData();
    } catch (error) {
      console.error('❌ Error updating task:', error);
      toast.error('Failed to update task');
    }
  };

  const handleDeleteTask = async (taskId) => {
    try {
      await taskService.deleteTask(taskId);
      setTasks(prev => prev.filter(t => (t.t_id || t.id) !== taskId));
      setShowDeleteConfirm(null);
      toast.success("Task deleted successfully");
      await fetchProjectData();
    } catch {
      toast.error('Failed to delete task');
    }
  };

  const togglePin = async (commentId) => {
    try {
      const response = await commentService.togglePin(commentId);
      const updatedComment = response?.data || response;
      setComments(prev =>
        prev.map(c => (c.c_id || c.id) === commentId ? { ...c, pin: updatedComment.pin || !c.pin } : c)
      );
      toast.success(updatedComment.pin ? "Comment pinned" : "Comment unpinned");
    } catch {
      toast.error('Failed to update pin');
    }
  };

  const deleteComment = async (commentId) => {
    if (!window.confirm("Delete this comment?")) return;
    try {
      await commentService.deleteComment(commentId);
      setComments(prev => prev.filter(c => (c.c_id || c.id) !== commentId));
      toast.success("Comment deleted");
    } catch {
      toast.error('Failed to delete comment');
    }
  };

  /* ─── Remove member flow ─── */
  const promptRemoveMember = (member) => {
    const memberTmId   = Number(member.id);
    const memberUserId = Number(member.userId ?? member.id);

    const assignedTasks = asArray(tasks).filter(t => {
      const belongsToProject = Number(t.p_id || t.p) === Number(projectId);
      if (!belongsToProject) return false;
      const ids = [];
      if (t.assign_to) ids.push(Number(t.assign_to));
      if (Array.isArray(t.assignees)) t.assignees.forEach(a => a && ids.push(Number(a)));
      return ids.includes(memberTmId) || ids.includes(memberUserId);
    });

    setRemoveMemberInfo({ projectId, member, assignedTasks });
    setReassignTo('');
  };

  const confirmRemoveMember = async () => {
    if (!removeMemberInfo) return;
    const { projectId: pId, member, assignedTasks } = removeMemberInfo;
    setRemoveMemberSaving(true);
    try {
      if (assignedTasks.length > 0) {
        for (const t of assignedTasks) {
          const tid = t.t_id || t.id;
          if (!tid) continue;
          const remaining = asArray(t.assignees)
            .map(Number)
            .filter(x => x !== Number(member.id));
          const payload = {
            title: t.title,
            description: t.desc || '',
            status: t.status,
            priority: t.priority,
            progress: t.progress ?? 0,
            assignees: reassignTo ? [Number(reassignTo), ...remaining] : remaining,
            assignTo: reassignTo ? Number(reassignTo) : (remaining[0] ?? null),
          };
          try { await taskService.updateTask(tid, payload); }
          catch (e) { console.warn(`Could not update task ${tid}:`, e); }
        }
      }

      const currentPteam = asArray(pteamEntries).filter(e => getPteamProjectId(e) === Number(pId));
      const entry = currentPteam.find(e => getPteamTmId(e) === Number(member.id));
      if (entry) {
        try { await projectTeamService.removeMemberFromProject(entry.pt_id); }
        catch (e) { console.warn('Could not remove PTeam entry:', e); }
      }

      toast.success(`${member.name} removed.`);
      setRemoveMemberInfo(null);
      setReassignTo('');
      await fetchProjectData();
    } catch {
      toast.error('Failed to remove member');
    } finally {
      setRemoveMemberSaving(false);
    }
  };

  const progress = projectProgress;

  const getMemberName = (memberId, taskRef = null) => {
    if (memberId != null) {
      const numId = Number(memberId);
      if (Number.isFinite(numId)) {
        const tm = asArray(allTeamMembers).find(m => Number(m.id) === numId);
        if (tm) return tm.name;
        const u = asArray(users).find(x => Number(x.id) === numId);
        if (u) return u.u_name || u.name || "Unassigned";
        return `Member #${numId}`;
      }
    }
    if (taskRef?.assign_to_name) return taskRef.assign_to_name;
    return "Unassigned";
  };

  /* ─── Add supervisor ─── */
  const handleAddSupervisor = async (userId) => {
    if (!userId) return;
    setAddSupervisorSaving(true);
    try {
      const currentIds = asArray(project?.supervisors).map(Number);
      const nextIds = Array.from(new Set([...currentIds, Number(userId)]));
      await projectService.updateProject(projectId, {
        name: project.p_name || project.name,
        description: project.desc || '',
        priority: project.priority,
        status: project.status,
        startDate: project.start_at || null,
        deadline: project.deadline || null,
        supervisors: nextIds,
      });
      toast.success('Supervisor added');
      setAddSupervisorOpen(false);
      await fetchProjectData();
    } catch {
      toast.error('Failed to add supervisor');
    } finally {
      setAddSupervisorSaving(false);
    }
  };

  /* ─── Lead assignment helpers ─── */
  const assignLeadMode = (leadId, mode) => {
    setAddLeadAssignments(prev => ({ ...prev, [leadId]: mode }));
  };
  const unassignLeadMode = (leadId) => {
    setAddLeadAssignments(prev => {
      const next = { ...prev };
      delete next[leadId];
      return next;
    });
  };

  const openAddLeadModal = () => {
    setAddLeadAssignments({});
    setAddLeadOpen(true);
  };

  const closeAddLeadModal = () => {
    if (addLeadSaving) return;
    setAddLeadOpen(false);
    setAddLeadAssignments({});
  };

  /* ─── Confirm add leads (handles both Lead and Member modes) ─── */
  const handleConfirmAddLeads = async () => {
    const entries = Object.entries(addLeadAssignments);
    if (entries.length === 0) return;

    setAddLeadSaving(true);
    try {
      const currentSupervisorIds = asArray(project?.supervisors).map(Number);

      // 1. Promote all Lead-mode leads to project supervisors in a single PATCH.
      const leadsToPromote = entries
        .filter(([, mode]) => mode === 'lead')
        .map(([id]) => Number(id));

      if (leadsToPromote.length > 0) {
        const nextSupervisorIds = Array.from(new Set([
          ...currentSupervisorIds,
          ...leadsToPromote,
        ]));
        await projectService.updateProject(projectId, {
          name: project.p_name || project.name,
          description: project.desc || '',
          priority: project.priority,
          status: project.status,
          startDate: project.start_at || null,
          deadline: project.deadline || null,
          supervisors: nextSupervisorIds,
        });
      }

      // 2. Add all Member-mode leads as regular team members.
      const leadsAsMembers = entries
        .filter(([, mode]) => mode === 'member')
        .map(([id]) => Number(id));

      for (const leadId of leadsAsMembers) {
        const lead = leadCandidates.find(l => Number(l.id) === leadId)
          || users.find(u => Number(u.id) === leadId);
        if (!lead) continue;
        try {
          await projectTeamService.addLeadAsTeamMember(projectId, lead, allTeamMembers);
        } catch (e) {
          console.warn(`Could not add lead ${leadId} as team member:`, e);
        }
      }

      const total = leadsToPromote.length + leadsAsMembers.length;
      toast.success(
        `Added ${total} ${total === 1 ? 'lead' : 'leads'} to the project`
      );

      setAddLeadOpen(false);
      setAddLeadAssignments({});
      await fetchProjectData();
    } catch (error) {
      console.error('Error adding leads:', error);
      const rawMsg = error?.response?.data?.message || error?.response?.data?.detail;
      const errorMsg = typeof rawMsg === 'string' ? rawMsg : 'Failed to add leads';
      toast.error(errorMsg);
    } finally {
      setAddLeadSaving(false);
    }
  };

  /* ─── Add team member (regular) ─── */
  const handleAddTeamMember = async (teamMemberId) => {
    if (!teamMemberId) return;
    setAddMemberSaving(true);
    try {
      await projectTeamService.addMemberToProject(projectId, Number(teamMemberId));
      toast.success('Team member added');
      setAddMemberOpen(false);
      await fetchProjectData();
    } catch {
      toast.error('Failed to add team member');
    } finally {
      setAddMemberSaving(false);
    }
  };

  /* ═══════════════════════════════════════════════════════════
     RENDER
     ═══════════════════════════════════════════════════════════ */
  if (loading) {
    return (
      <div>
        <Topbar title="Project Details" onMenuClick={onMenuClick} />
        <div className="page-container">
          <div className="loading-spinner-wrapper"><div className="loading-spinner" /></div>
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div>
        <Topbar title="Project Details" onMenuClick={onMenuClick} />
        <div className="page-container">
          <div className="not-found-container">
            <FolderKanban size={48} style={{ opacity: 0.3, color: 'var(--text-muted)' }} />
            <h2>Project not found</h2>
            <p>The project you're looking for doesn't exist or you don't have access.</p>
            <button className="btn btn-primary" onClick={() => navigate('/lead/projects')}>
              <ArrowLeft size={14} /> Back to Projects
            </button>
          </div>
        </div>
      </div>
    );
  }

  // The "Project Lead" section should show actual Leads — a Supervisor who
// created the project is not a Lead. Only count the creator as the Lead
// when they actually hold a Lead-role (i.e. their role is one of LEAD_ROLES
// on their matched TeamMember record, or their User.role is 'member').
const creatorUserId = Number(project.created_by);
const creatorUser   = asArray(users).find(u => Number(u.id) === creatorUserId);
const creatorUserRole = (creatorUser?.role || '').toLowerCase();

// A User's auth role decides which section their "created by" entry lives in.
// "member" (aka Lead) → Project Lead section
// "manager"/"supervisor"/"admin" → Supervisors section
// anything else → Team Members section
const creatorIsLead       = creatorUserRole === 'member';
const creatorIsSupervisor = SUPERVISOR_ROLES.includes(creatorUserRole);

const creatorName = project.created_by_name || creatorUser?.u_name || 'Unknown';

// Leads listed in the Project Lead section = actual project Leads +
// (the creator if they're a Lead themselves). The creator-as-Lead entry is
// rendered separately below, so we only need the "additional" leads here.
const additionalLeads = asArray(projectLeadsFinal).filter(
  m => Number(m.userId) !== creatorUserId
);
const totalLeadCount = (creatorIsLead ? 1 : 0) + additionalLeads.length;

// Same idea for the Supervisors section: the creator's name is shown inline
// with a "Created by" tag when they're a supervisor. All other supervisors
// come from projectSupervisors, minus the creator if they're in that list.
const additionalSupervisors = asArray(projectSupervisors).filter(
  s => Number(s.userId) !== creatorUserId
);
const totalSupervisorCount = (creatorIsSupervisor ? 1 : 0) + additionalSupervisors.length;

  return (
    <div className="project-detail-page">
      <Topbar
        title={
          <span className="project-title-text">
            <span className="project-title-main">{project.p_name || project.name}</span>
            <span className="project-title-badge" style={{
              background: progress >= 70 ? '#34d399' : progress >= 40 ? '#f59e0b' : '#f87171'
            }}>
              {progress}% Complete
            </span>
          </span>
        }
        onMenuClick={onMenuClick}
        actions={
          <div className="topbar-actions">
            <button className="btn btn-secondary btn-sm refresh-btn" onClick={handleRefresh} disabled={refreshing}>
              <RefreshCw size={14} className={refreshing ? 'spin' : ''} />
              {refreshing ? '...' : 'Refresh'}
            </button>
            <button className="btn btn-secondary btn-sm" onClick={() => navigate('/lead/projects')}>
              <ArrowLeft size={14} /> Back
            </button>
          </div>
        }
      />

      {/* ═══ EDIT TASK MODAL ═══ */}
      <AnimatePresence>
        {editTask && (
          <motion.div className="modal-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => { setEditTask(null); resetEditTaskTouched(); }}>
            <motion.div className="modal-box" initial={{ scale: 0.95, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: 20 }} onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <h2 className="modal-title">Edit Task</h2>
                <button className="modal-close-btn" onClick={() => { setEditTask(null); resetEditTaskTouched(); }}><X size={18} /></button>
              </div>
              <div className="modal-body edit-form">
                <div className="form-group">
                  <label className="form-label">Title <span className="form-required">*</span></label>
                  <input
                    key="edit-task-title-field"
                    ref={editTaskTitleRef}
                    className={`form-input ${showEditTaskError('title') ? 'pd-input-error' : ''}`}
                    value={editTask.title ?? ''}
                    maxLength={LIMITS.taskTitle.max}
                    autoComplete="off"
                    onChange={(e) => {
                      const value = e.target.value;
                      setEditTask(prev => (prev ? { ...prev, title: value } : prev));
                    }}
                    onBlur={(e) => {
                      const t = e.target.value.trim();
                      if (t !== e.target.value) {
                        setEditTask(prev => (prev ? { ...prev, title: t } : prev));
                      }
                      markEditTaskTouched('title');
                    }}
                  />
                  <FieldError message={showEditTaskError('title')} />
                </div>

                <div className="form-group">
                  <label className="form-label">Description</label>
                  <textarea
                    key="edit-task-desc-field"
                    ref={editTaskDescRef}
                    className={`form-input form-textarea ${showEditTaskError('desc') ? 'pd-input-error' : ''}`}
                    value={editTask.desc ?? ''}
                    maxLength={LIMITS.taskDesc.max}
                    onChange={(e) => {
                      const value = e.target.value;
                      setEditTask(prev => (prev ? { ...prev, desc: value } : prev));
                    }}
                    onBlur={() => markEditTaskTouched('desc')}
                    placeholder="Enter task description..."
                  />
                  <FieldError message={showEditTaskError('desc')} />
                </div>

                <div className="form-row-2">
                  <div className="form-group">
                    <label className="form-label">Priority</label>
                    <select className="form-input" value={editTask.priority || 'medium'} onChange={(e) => setEditTask(prev => (prev ? { ...prev, priority: e.target.value } : prev))}>
                      {PRIORITY_OPTIONS.map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Status</label>
                    <select className="form-input" value={editTask.status || 'todo'} onChange={(e) => setEditTask(prev => (prev ? { ...prev, status: e.target.value } : prev))}>
                      {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                    </select>
                  </div>
                </div>

                <MemberMultiPicker
                  label="Assign To"
                  members={assignableMembers}
                  selected={Array.isArray(editTask.assignees) ? editTask.assignees.map(Number) : (editTask.assign_to ? [Number(editTask.assign_to)] : [])}
                  onChange={(ids) => setEditTask(prev => (prev ? { ...prev, assignees: ids } : prev))}
                />

                <div className="form-group">
                  <label className="form-label">Deadline</label>
                  <input
                    type="datetime-local"
                    className="form-input"
                    value={editTask.due_date ? String(editTask.due_date).slice(0, 16) : ''}
                    onChange={(e) => setEditTask(prev => (prev ? { ...prev, due_date: e.target.value || null } : prev))}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Progress: <strong>{editTask.progress || 0}%</strong></label>
                  <input type="range" min={0} max={100} value={editTask.progress || 0} className="range-input" onChange={(e) => setEditTask(prev => (prev ? { ...prev, progress: Number(e.target.value) } : prev))} />
                </div>
              </div>
              <div className="modal-footer">
                <button className="btn btn-primary btn-sm" onClick={() => handleUpdateTask(editTask)}>
                  <CheckCircle2 size={14} /> Save Changes
                </button>
                <button className="btn btn-secondary btn-sm" onClick={() => { setEditTask(null); resetEditTaskTouched(); }}>Cancel</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══ ADD TASK MODAL ═══ */}
      <AnimatePresence>
        {showAddTask && (
          <motion.div className="modal-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => { setShowAddTask(false); resetAddTaskTouched(); }}>
            <motion.div className="modal-box" initial={{ scale: 0.95, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: 20 }} onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <h2 className="modal-title"><Plus size={18} /> Create New Task</h2>
                <button className="modal-close-btn" onClick={() => { setShowAddTask(false); resetAddTaskTouched(); }}><X size={18} /></button>
              </div>
              <div className="modal-body edit-form">
                <div className="form-group">
                  <label className="form-label">Task Title <span className="form-required">*</span></label>
                  <input
                    key="add-task-title-field"
                    ref={addTaskTitleRef}
                    className={`form-input ${showAddTaskError('title') ? 'pd-input-error' : ''}`}
                    placeholder="Enter task title"
                    value={newTask.title}
                    maxLength={LIMITS.taskTitle.max}
                    autoComplete="off"
                    onChange={(e) => setNewTask(prev => ({ ...prev, title: e.target.value }))}
                    onBlur={(e) => {
                      const t = e.target.value.trim();
                      if (t !== e.target.value) setNewTask(prev => ({ ...prev, title: t }));
                      markAddTaskTouched('title');
                    }}
                  />
                  <FieldError message={showAddTaskError('title')} />
                </div>

                <div className="form-group">
                  <label className="form-label">Description</label>
                  <textarea
                    key="add-task-desc-field"
                    className={`form-input form-textarea ${showAddTaskError('desc') ? 'pd-input-error' : ''}`}
                    placeholder="Enter task description..."
                    value={newTask.desc}
                    maxLength={LIMITS.taskDesc.max}
                    onChange={(e) => setNewTask(prev => ({ ...prev, desc: e.target.value }))}
                    onBlur={() => markAddTaskTouched('desc')}
                  />
                  <FieldError message={showAddTaskError('desc')} />
                </div>

                <div className="form-row-2">
                  <div className="form-group">
                    <label className="form-label">Priority</label>
                    <select className="form-input" value={newTask.priority} onChange={(e) => setNewTask(prev => ({ ...prev, priority: e.target.value }))}>
                      {PRIORITY_OPTIONS.map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Status</label>
                    <select className="form-input" value={newTask.status} onChange={(e) => setNewTask(prev => ({ ...prev, status: e.target.value }))}>
                      {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                    </select>
                  </div>
                </div>

                <MemberMultiPicker
                  label="Assign Team Members"
                  members={assignableMembers}
                  selected={newTask.assignees}
                  onChange={(ids) => setNewTask(prev => ({ ...prev, assignees: ids }))}
                />

                <div className="form-group">
                  <label className="form-label">Deadline</label>
                  <input
                    type="datetime-local"
                    className="form-input"
                    value={newTask.dueDate || ''}
                    onChange={(e) => setNewTask(prev => ({ ...prev, dueDate: e.target.value || "" }))}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Initial Progress: <strong>{newTask.progress}%</strong></label>
                  <input type="range" min={0} max={100} className="range-input" value={newTask.progress} onChange={(e) => setNewTask(prev => ({ ...prev, progress: Number(e.target.value) }))} />
                </div>

                <div className="add-subtasks-block">
                  <div className="add-subtasks-header">
                    <label className="form-label" style={{ margin: 0 }}>
                      <ListChecks size={13} style={{ verticalAlign: 'text-bottom', marginRight: 4 }} />
                      Subtasks {newTask.subtasksDraft.length > 0 && (
                        <span className="add-subtasks-count">{newTask.subtasksDraft.length}</span>
                      )}
                    </label>
                    <span className="add-subtasks-hint">Optional — added after the task is created</span>
                  </div>

                  {newTask.subtasksDraft.length > 0 && (
                    <div className="add-subtasks-list">
                      {newTask.subtasksDraft.map((sub, idx) => (
                        <div key={`${sub.title}-${idx}`} className="add-subtask-chip">
                          <span className="add-subtask-chip-title">{sub.title}</span>
                          <span className="add-subtask-chip-meta">
                            {sub.priority}
                            {asArray(sub.assignees).length > 0 && ` · ${asArray(sub.assignees).length} assignee(s)`}
                          </span>
                          <button
                            type="button"
                            className="add-subtask-chip-remove"
                            title="Remove subtask"
                            onClick={() => setNewTask(prev => ({
                              ...prev,
                              subtasksDraft: prev.subtasksDraft.filter((_, i) => i !== idx),
                            }))}
                          >
                            <X size={11} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <SubtaskDraftRow
                    members={assignableMembers}
                    disabled={isSubmitting}
                    onAdd={(draft) => setNewTask(prev => ({
                      ...prev,
                      subtasksDraft: [...prev.subtasksDraft, draft],
                    }))}
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button className="btn btn-primary btn-sm" onClick={handleAddTask} disabled={isSubmitting}>
                  {isSubmitting ? (<><Loader2 size={14} className="spin" /> Creating...</>) : 'Create Task'}
                </button>
                <button className="btn btn-secondary btn-sm" onClick={() => { setShowAddTask(false); resetAddTaskTouched(); }}>Cancel</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══ REMOVE MEMBER MODAL ═══ */}
      <AnimatePresence>
        {removeMemberInfo && (
          <motion.div className="modal-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => { if (!removeMemberSaving) { setRemoveMemberInfo(null); setReassignTo(''); } }}>
            <motion.div className="modal-box" initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              onClick={e => e.stopPropagation()} style={{ maxWidth: 480 }}>
              <div className="modal-header">
                <h2 className="modal-title"><UserMinus size={16} /> Remove member</h2>
                <button className="modal-close-btn" onClick={() => { setRemoveMemberInfo(null); setReassignTo(''); }} disabled={removeMemberSaving}>
                  <X size={16} />
                </button>
              </div>
              <div className="modal-body edit-form">
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>
                  Remove <strong>{removeMemberInfo.member.name}</strong> from this project?
                </p>
                {removeMemberInfo.assignedTasks.length > 0 ? (
                  <>
                    <div style={{ padding: '10px 12px', background: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.25)', borderRadius: 8, fontSize: 12.5 }}>
                      <AlertCircle size={12} style={{ display: 'inline', marginRight: 4, color: '#f59e0b' }} />
                      This member has <strong>{removeMemberInfo.assignedTasks.length}</strong> assigned task(s).
                    </div>
                    <label className="form-label">Reassign those tasks to</label>
                    <select className="form-input" value={reassignTo} onChange={e => setReassignTo(e.target.value)} disabled={removeMemberSaving}>
                      <option value="">— Leave unassigned —</option>
                      {assignableMembers
                        .filter(m => Number(m.id) !== Number(removeMemberInfo.member.id))
                        .map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                    </select>
                  </>
                ) : (
                  <div style={{ padding: '10px 12px', background: 'rgba(52, 211, 153, 0.08)', border: '1px solid rgba(52, 211, 153, 0.25)', borderRadius: 8, fontSize: 12.5 }}>
                    <CheckCircle2 size={12} style={{ display: 'inline', marginRight: 4, color: '#34d399' }} />
                    No tasks assigned in this project.
                  </div>
                )}
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary btn-sm" onClick={() => { setRemoveMemberInfo(null); setReassignTo(''); }} disabled={removeMemberSaving}>Cancel</button>
                <button className="btn btn-danger btn-sm" onClick={confirmRemoveMember} disabled={removeMemberSaving}>
                  {removeMemberSaving ? <><Loader2 size={13} className="spin" /> Removing...</> : <><Trash2 size={13} /> Remove member</>}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══ DELETE TASK CONFIRM ═══ */}
      <AnimatePresence>
        {showDeleteConfirm !== null && (
          <motion.div className="modal-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowDeleteConfirm(null)}>
            <motion.div className="modal-box confirm-box" initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} onClick={e => e.stopPropagation()}>
              <AlertCircle size={40} style={{ color: '#f87171', marginBottom: 12 }} />
              <h3 className="confirm-title">Delete Task?</h3>
              <p className="confirm-desc">This action cannot be undone.</p>
              <div className="modal-footer" style={{ justifyContent: 'center' }}>
                <button className="btn btn-danger btn-sm" onClick={() => handleDeleteTask(showDeleteConfirm)}>
                  <Trash2 size={14} /> Yes, Delete
                </button>
                <button className="btn btn-secondary btn-sm" onClick={() => setShowDeleteConfirm(null)}>Cancel</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══ PROJECT BODY ═══ */}
      <div className="project-body">
        <div className="project-left">

          {/* OVERVIEW */}
          <div className="project-overview-card">
            <div className="overview-header">
              <div className="overview-info">
                <h1 className="overview-title">{project.p_name || project.name}</h1>
                <p className="overview-desc">{project.desc || project.description}</p>
              </div>
              <div className="overview-progress-ring">
                <div className="ring-container">
                  <svg className="ring-svg" viewBox="0 0 120 120">
                    <circle className="ring-bg" cx="60" cy="60" r="50" />
                    <circle
                      className="ring-fill"
                      cx="60" cy="60" r="50"
                      strokeDasharray={Math.PI * 2 * 50}
                      strokeDashoffset={Math.PI * 2 * 50 * (1 - progress / 100)}
                      style={{ stroke: progress >= 70 ? '#34d399' : progress >= 40 ? '#f59e0b' : '#f87171' }}
                    />
                  </svg>
                  <div className="ring-center">
                    <span className="ring-value">{progress}%</span>
                    <span className="ring-label">Complete</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="info-stats" style={{ marginTop: 16 }}>
              <div className="info-stat">
                <div className="info-stat-icon" style={{ background: 'rgba(129, 140, 248, 0.12)', color: '#818cf8' }}><FolderKanban size={16} /></div>
                <div>
                  <span className="info-stat-value">{stats.totalTasks}</span>
                  <span className="info-stat-label">Total Tasks</span>
                </div>
              </div>
              <div className="info-stat">
                <div className="info-stat-icon" style={{ background: 'rgba(52, 211, 153, 0.12)', color: '#34d399' }}><CheckCircle2 size={16} /></div>
                <div>
                  <span className="info-stat-value">{stats.completedTasks}</span>
                  <span className="info-stat-label">Completed</span>
                </div>
              </div>
              <div className="info-stat">
                <div className="info-stat-icon" style={{ background: 'rgba(245, 158, 11, 0.12)', color: '#f59e0b' }}><Clock size={16} /></div>
                <div>
                  <span className="info-stat-value">{stats.inProgressTasks}</span>
                  <span className="info-stat-label">In Progress</span>
                </div>
              </div>
              <div className="info-stat">
                <div className="info-stat-icon" style={{ background: 'rgba(99, 102, 241, 0.12)', color: '#6366f1' }}><Users size={16} /></div>
                <div>
                  <span className="info-stat-value">{stats.membersCount}</span>
                  <span className="info-stat-label">Members</span>
                </div>
              </div>
            </div>
          </div>

          {/* TASKS */}
          <div className="tasks-card">
            <div className="tasks-header">
              <h3 className="tasks-title">
                <BarChart2 size={16} /> Tasks
                <span className="tasks-count">{asArray(tasks).length}</span>
              </h3>
              <button className="btn btn-primary btn-sm" onClick={() => setShowAddTask(true)}>
                <Plus size={14} /> Add Task
              </button>
            </div>

            <div className="tasks-scroll">
              <div className="tasks-list">
                {asArray(tasks).length === 0 ? (
                  <div className="tasks-empty">
                    <ListChecks size={32} style={{ opacity: 0.3 }} />
                    <p>No tasks yet</p>
                    <span>Create your first task to get started</span>
                  </div>
                ) : (
                  asArray(tasks).map((t, idx) => {
                    const taskKey = t.t_id || t.id || `task-${idx}`;
                    const taskCommentCount = getTaskComments(t.t_id || t.id).length;
                    const subtaskCount = Number(t.subtask_count) || 0;
                    const completedSubtasks = Number(t.completed_subtasks) || 0;

                    const assigneeIds = Array.isArray(t.assignees) && t.assignees.length > 0
                      ? t.assignees.map(Number)
                      : (t.assign_to != null ? [Number(t.assign_to)] : []);

                    return (
                      <motion.div
                        key={taskKey}
                        className="task-item"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        onClick={() => navigate(`/lead/projects/${projectId}/tasks/${t.t_id || t.id}`)}
                      >
                        <div className="task-item-header">
                          <div className="task-item-left">
                            <span className="task-item-title">{t.title}</span>
                          </div>
                          <div className="task-item-badges">
                            <PriorityBadge priority={t.priority} />
                            {taskCommentCount > 0 && (
                              <span className="task-comment-badge"><MessageSquare size={10} /> {taskCommentCount}</span>
                            )}
                            {subtaskCount > 0 && (
                              <span className="task-comment-badge"><ListChecks size={10} /> {completedSubtasks}/{subtaskCount}</span>
                            )}
                            <span className="task-item-progress-badge" style={{
                              background: t.progress >= 70 ? 'rgba(52, 211, 153, 0.15)' : t.progress >= 40 ? 'rgba(245, 158, 11, 0.15)' : 'rgba(248, 113, 113, 0.15)',
                              color: t.progress >= 70 ? '#34d399' : t.progress >= 40 ? '#f59e0b' : '#f87171'
                            }}>{t.progress || 0}%</span>
                          </div>
                        </div>
                        {t.desc && <p className="task-item-desc">{t.desc}</p>}
                        <div className="task-item-footer">
                          <StatusBadge status={t.status} />
                          <div className="task-item-assignee">
                            <User size={12} />
                            {assigneeIds.length === 0
                              ? 'Unassigned'
                              : assigneeIds.length === 1
                                ? getMemberName(assigneeIds[0], t)
                                : `${getMemberName(assigneeIds[0], t)} +${assigneeIds.length - 1}`}
                          </div>
                          {t.due_date && (
                            <div className="task-item-assignee" style={{ marginLeft: 4 }}>
                              <Calendar size={12} />
                              {new Date(t.due_date).toLocaleDateString()}
                            </div>
                          )}
                          <div className="task-item-actions">
                            <button
                              className="task-action-btn"
                              title="Open task"
                              onClick={(e) => { e.stopPropagation(); navigate(`/lead/projects/${projectId}/tasks/${t.t_id || t.id}`); }}
                            >
                              <ArrowLeft size={12} style={{ transform: 'rotate(180deg)' }} />
                            </button>
                            <button
                              className="task-action-btn"
                              title="Edit Task"
                              onClick={(e) => { e.stopPropagation(); openEditTask(t); }}
                            >
                              <Pencil size={12} />
                            </button>
                            <button
                              className="task-action-btn danger"
                              title="Delete Task"
                              onClick={(e) => { e.stopPropagation(); setShowDeleteConfirm(t.t_id || t.id); }}
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN */}
        <div className="project-right">
          <div className="info-card">
            <h4 className="info-card-title">
              <Users size={14} /> Team
              <span className="info-badge">{asArray(projectMembers).length}</span>
            </h4>

            <div className="team-sections">
              {/* Project Lead */}
              <div className="team-section team-section-lead">
                <div className="team-section-header">
                  <div className="team-section-title">
                    <Shield size={13} style={{ color: '#6366f1' }} />
                    <span>Project Lead</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span className="team-section-count">{totalLeadCount}</span>
                    <button className="team-add-btn" title="Add project lead" onClick={openAddLeadModal}>
                      <Plus size={11} />
                    </button>
                  </div>
                </div>
                <div className="team-section-list">
  {creatorIsLead && (
    <div className="team-member-item lead-item">
      <Avatar name={creatorName} size="sm" />
      <div className="team-member-info">
        <span className="team-member-name">
          {creatorName}
          <span className="lead-badge"><Shield size={12} style={{ color: '#6366f1', marginLeft: 4 }} /></span>
        </span>
        <span className="team-member-role">Team Lead (Creator)</span>
      </div>
    </div>
  )}

  {additionalLeads.map((m, idx) => (
    <div key={m.id || `lead-${idx}`} className="team-member-item lead-item">
      <Avatar name={m.name || 'Lead'} size="sm" />
      <div className="team-member-info">
        <span className="team-member-name">
          {m.name || `User ${m.id}`}
          <span className="lead-badge"><Shield size={12} style={{ color: '#6366f1', marginLeft: 4 }} /></span>
        </span>
        <span className="team-member-role">Project Lead</span>
      </div>
      <button className="task-action-btn danger" title={`Remove ${m.name || 'lead'}`} onClick={() => promptRemoveMember(m)}>
        <UserMinus size={11} />
      </button>
    </div>
  ))}

  {!creatorIsLead && additionalLeads.length === 0 && (
    <div className="team-section-empty">No project lead assigned</div>
  )}
</div>

              {/* Supervisors */}
              <div className="team-section team-section-supervisors">
  <div className="team-section-header">
    <div className="team-section-title">
      <Crown size={13} style={{ color: '#f59e0b' }} />
      <span>Supervisors</span>
    </div>
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span className="team-section-count">{totalSupervisorCount}</span>
      <button className="team-add-btn" title="Add supervisor" onClick={() => setAddSupervisorOpen(true)}>
        <Plus size={11} />
      </button>
    </div>
  </div>

  {(creatorIsSupervisor ? 1 : 0) + additionalSupervisors.length === 0 ? (
    <div className="team-section-empty">No supervisors assigned</div>
  ) : (
    <div className="team-section-list">
      {creatorIsSupervisor && (
        <div className="team-member-item supervisor-item">
          <Avatar name={creatorName} size="sm" />
          <div className="team-member-info">
            <span className="team-member-name">
              {creatorName}
              <span className="supervisor-badge">
                <Crown size={12} style={{ color: '#f59e0b', marginLeft: 4 }} />
              </span>
            </span>
            <span className="team-member-role">Supervisor (Creator)</span>
          </div>
        </div>
      )}

      {additionalSupervisors.map((m, idx) => (
        <div key={m.id || `sup-${idx}`} className="team-member-item supervisor-item">
          <Avatar name={m.name || 'Supervisor'} size="sm" />
          <div className="team-member-info">
            <span className="team-member-name">
              {m.name || `User ${m.id}`}
              <span className="supervisor-badge">
                <Crown size={12} style={{ color: '#f59e0b', marginLeft: 4 }} />
              </span>
            </span>
            <span className="team-member-role">Supervisor</span>
          </div>
          <button
            className="task-action-btn danger"
            title={`Remove ${m.name || 'supervisor'}`}
            onClick={() => promptRemoveMember(m)}
          >
            <UserMinus size={11} />
          </button>
        </div>
      ))}
    </div>
  )}
</div>

              {/* Team Members */}
              <div className="team-section team-section-members">
                <div className="team-section-header">
                  <div className="team-section-title">
                    <Users size={13} style={{ color: 'var(--accent-primary)' }} />
                    <span>Team Members</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span className="team-section-count">{regularMembers.length}</span>
                    <button className="team-add-btn" title="Add team member" onClick={() => setAddMemberOpen(true)}>
                      <Plus size={11} />
                    </button>
                  </div>
                </div>
                {regularMembers.length === 0 ? (
                  <div className="team-section-empty">No team members assigned</div>
                ) : (
                  <div className="team-section-list">
                    {regularMembers.map((m, idx) => (
                      <div key={m.id || `member-${idx}`} className="team-member-item">
                        <Avatar name={m.name || 'Member'} size="sm" />
                        <div className="team-member-info">
                          <span className="team-member-name">{m.name || `User ${m.id}`}</span>
                          <span className="team-member-role">{m.role || 'Member'}</span>
                        </div>
                        <button className="task-action-btn danger" title={`Remove ${m.name || 'member'}`} onClick={() => promptRemoveMember(m)}>
                          <UserMinus size={11} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Comments */}
          <div className="info-card comments-card">
            <h4 className="info-card-title">
              <MessageSquare size={14} /> Comments
              <span className="info-badge">{asArray(comments).length}</span>
            </h4>
            <div className="comment-list">
              {asArray(comments).length === 0 ? (
                <div className="comment-empty">
                  <MessageSquare size={24} style={{ opacity: 0.3 }} />
                  <p>No comments yet</p>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Open a task to add a comment</span>
                </div>
              ) : (
                [...asArray(comments)]
                  .sort((a, b) => (b.pin || b.pinned) - (a.pin || a.pinned))
                  .slice(0, 15)
                  .map((c, idx) => {
                    const commentKey = c.c_id || c.id || `comment-${idx}`;
                    const isPinned = c.pin || c.pinned;
                    const task = asArray(tasks).find(t => Number(t.t_id || t.id) === Number(c.taskId || c.t));
                    return (
                      <motion.div key={commentKey} className={`comment-item ${isPinned ? 'pinned' : ''}`} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }}>
                        {isPinned && <div className="comment-pin-badge"><Pin size={10} /> Pinned</div>}
                        <p className="comment-text">{c.desc || c.content}</p>
                        <div className="comment-meta-row">
                          <span className="comment-meta">
                            {c.u_name || c.user_name || 'User'} • {c.created_at ? new Date(c.created_at).toLocaleString() : 'Just now'}
                          </span>
                          {task && (
                            <button className="comment-task-tag" onClick={() => navigate(`/lead/projects/${projectId}/tasks/${task.t_id || task.id}`)}>
                              📋 {task.title}
                            </button>
                          )}
                        </div>
                        <div className="comment-footer">
                          <div className="comment-actions">
                            <button className={`comment-action-btn ${isPinned ? 'active' : ''}`} title={isPinned ? "Unpin" : "Pin"} onClick={() => togglePin(c.c_id || c.id)}>
                              {isPinned ? <PinOff size={11} /> : <Pin size={11} />}
                            </button>
                            <button className="comment-action-btn danger" title="Delete" onClick={() => deleteComment(c.c_id || c.id)}><Trash2 size={11} /></button>
                          </div>
                        </div>
                      </motion.div>
                    );
                  })
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ═════════ ADD SUPERVISOR MODAL ═════════ */}
      <AnimatePresence>
        {addSupervisorOpen && (
          <motion.div className="modal-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => !addSupervisorSaving && setAddSupervisorOpen(false)}>
            <motion.div className="modal-box" initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              onClick={e => e.stopPropagation()} style={{ maxWidth: 420 }}>
              <div className="modal-header">
                <h2 className="modal-title"><Crown size={16} /> Add Supervisor</h2>
                <button className="modal-close-btn" onClick={() => setAddSupervisorOpen(false)} disabled={addSupervisorSaving}><X size={16} /></button>
              </div>
              <div className="modal-body">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 320, overflowY: 'auto' }}>
                  {asArray(users)
                    .filter(u => SUPERVISOR_ROLES.includes((u.role || '').toLowerCase()))
                    .filter(u => !asArray(projectSupervisors).some(s => Number(s.userId) === Number(u.id)))
                    .map(u => (
                      <button key={u.id} className="add-picker-row" onClick={() => handleAddSupervisor(u.id)} disabled={addSupervisorSaving}>
                        <Avatar name={u.u_name || u.name || 'Supervisor'} size="sm" />
                        <div style={{ flex: 1, textAlign: 'left' }}>
                          <div style={{ fontSize: 13, fontWeight: 600 }}>{u.u_name || u.name || `User ${u.id}`}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{u.email || ''}</div>
                        </div>
                        <Plus size={14} style={{ color: 'var(--accent-primary)' }} />
                      </button>
                    ))
                  }
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═════════ ADD LEAD MODAL — with Lead/Member toggle ═════════ */}
      <AnimatePresence>
        {addLeadOpen && (
          <motion.div className="modal-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={closeAddLeadModal}>
            <motion.div className="modal-box" initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              onClick={e => e.stopPropagation()} style={{ maxWidth: 500 }}>
              <div className="modal-header">
                <div>
                  <h2 className="modal-title"><Shield size={16} /> Add Project Lead</h2>
                  <p style={{ fontSize: 11.5, color: 'var(--text-muted)', margin: '4px 0 0' }}>
                    Choose <strong>Lead</strong> to make them a co-supervisor, or <strong>Member</strong> to add them as a regular team member.
                  </p>
                </div>
                <button className="modal-close-btn" onClick={closeAddLeadModal} disabled={addLeadSaving}><X size={16} /></button>
              </div>
              <LeadPicker
                leads={leadCandidates.filter(l =>
                  !asArray(projectMembers).some(pm => Number(pm.userId) === Number(l.id))
                )}
                assignments={addLeadAssignments}
                onAssign={assignLeadMode}
                onUnassign={unassignLeadMode}
                alreadyLeadIds={asArray(projectSupervisors).map(s => Number(s.userId))}
                saving={addLeadSaving}
                onConfirm={handleConfirmAddLeads}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═════════ ADD MEMBER MODAL ═════════ */}
      <AnimatePresence>
        {addMemberOpen && (
          <motion.div className="modal-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => !addMemberSaving && setAddMemberOpen(false)}>
            <motion.div className="modal-box" initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              onClick={e => e.stopPropagation()} style={{ maxWidth: 420 }}>
              <div className="modal-header">
                <h2 className="modal-title"><Users size={16} /> Add Team Member</h2>
                <button className="modal-close-btn" onClick={() => setAddMemberOpen(false)} disabled={addMemberSaving}><X size={16} /></button>
              </div>
              <div className="modal-body">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 320, overflowY: 'auto' }}>
                  {asArray(allTeamMembers)
                    .filter(m => m.is_deleted !== 1)
                    .filter(m => !LEAD_ROLES.includes((m.role || '').toLowerCase()))
                    .filter(m => !asArray(projectMembers).some(pm => Number(pm.userId) === Number(m.id)))
                    .map(m => (
                      <button key={m.id} className="add-picker-row" onClick={() => handleAddTeamMember(m.id)} disabled={addMemberSaving}>
                        <Avatar name={m.name || 'Member'} size="sm" />
                        <div style={{ flex: 1, textAlign: 'left' }}>
                          <div style={{ fontSize: 13, fontWeight: 600 }}>{m.name || `User ${m.id}`}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{m.role || 'Member'}</div>
                        </div>
                        <Plus size={14} style={{ color: 'var(--accent-primary)' }} />
                      </button>
                    ))
                  }
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── STYLES ─── */}
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .spin { animation: spin 1s linear infinite; }
        .loading-spinner-wrapper { display: flex; justify-content: center; align-items: center; height: 400px; }
        .loading-spinner { width: 40px; height: 40px; border: 3px solid var(--border-subtle); border-top-color: var(--accent-primary); border-radius: 50%; animation: spin 0.8s linear infinite; }
        .not-found-container { text-align: center; padding: 60px 20px; color: var(--text-muted); }
        .not-found-container h2 { font-size: 24px; font-weight: 700; color: var(--text-primary); margin: 16px 0 8px; }

        .project-title-text { display: flex; align-items: center; gap: 12px; }
        .project-title-main { max-width: 300px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .project-title-badge { font-size: 10px; font-weight: 700; padding: 3px 10px; border-radius: 20px; color: #fff; flex-shrink: 0; }
        .topbar-actions { display: flex; gap: 8px; }
        .refresh-btn { display: flex; align-items: center; gap: 6px; }

        .pd-field-error { display: flex; align-items: center; gap: 5px; font-size: 11.5px; font-weight: 500; color: #f87171; margin-top: 4px; }
        .pd-input-error { border-color: #f87171 !important; background: rgba(248, 113, 113, 0.04) !important; }

        .project-detail-page { min-height: 100vh; background: var(--bg-primary); }
        .project-body { display: grid; grid-template-columns: 1fr 340px; gap: 20px; padding: 20px 24px; max-width: 1440px; margin: 0 auto; }
        .project-left { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
        .project-right { display: flex; flex-direction: column; gap: 16px; }

        .project-overview-card { background: var(--bg-card); border: 1px solid var(--border-subtle); border-radius: 14px; padding: 20px 24px; }
        .overview-header { display: flex; justify-content: space-between; align-items: center; gap: 20px; }
        .overview-info {
          flex: 1;
          min-width: 0;
          max-width: 100%;
          overflow: hidden;
        }
        .overview-title { font-size: 22px; font-weight: 800; color: var(--text-primary); margin: 0 0 6px; }
        .overview-desc {
          font-size: 13px;
          color: var(--text-secondary);
          line-height: 1.6;
          margin: 0;
          overflow-wrap: anywhere;
          word-break: break-word;
          white-space: normal;
          max-width: 100%;
        }
        .overview-progress-ring { flex-shrink: 0; }
        .ring-container { position: relative; width: 90px; height: 90px; }
        .ring-svg { transform: rotate(-90deg); width: 100%; height: 100%; }
        .ring-bg { fill: none; stroke: var(--border-subtle); stroke-width: 6; }
        .ring-fill { fill: none; stroke-width: 6; stroke-linecap: round; transition: stroke-dashoffset 0.8s ease; }
        .ring-center { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; }
        .ring-value { font-size: 18px; font-weight: 800; color: var(--text-primary); line-height: 1; }
        .ring-label { font-size: 8px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; }

        .info-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
        .info-stat { display: flex; align-items: center; gap: 10px; padding: 10px 12px; background: var(--bg-secondary); border-radius: 8px; }
        .info-stat-icon { width: 32px; height: 32px; border-radius: 8px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
        .info-stat-value { display: block; font-size: 15px; font-weight: 700; color: var(--text-primary); }
        .info-stat-label { font-size: 11px; color: var(--text-muted); }

        .info-card { background: var(--bg-card); border: 1px solid var(--border-subtle); border-radius: 14px; padding: 16px 18px; }
        .info-card-title { display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 700; color: var(--text-primary); margin: 0 0 12px; }
        .info-badge { margin-left: auto; font-size: 11px; font-weight: 600; color: var(--text-muted); background: var(--bg-secondary); padding: 1px 10px; border-radius: 20px; }
        .team-sections { display: flex; flex-direction: column; gap: 12px; }
        .team-section { border-radius: 10px; padding: 10px 12px; border: 1px solid var(--border-subtle); }
        .team-section-lead { background: rgba(99, 102, 241, 0.05); border-color: rgba(99, 102, 241, 0.18); }
        .team-section-supervisors { background: rgba(245, 158, 11, 0.04); border-color: rgba(245, 158, 11, 0.18); }
        .team-section-members { background: rgba(99, 102, 241, 0.04); border-color: rgba(99, 102, 241, 0.15); }
        .team-section-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; padding-bottom: 6px; border-bottom: 1px solid var(--border-subtle); }
        .team-section-title { display: flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 700; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.5px; }
        .team-section-count { font-size: 10px; font-weight: 700; padding: 1px 8px; border-radius: 10px; background: var(--bg-secondary); color: var(--text-muted); border: 1px solid var(--border-subtle); }
        .team-section-list { display: flex; flex-direction: column; gap: 4px; }
        .team-section-empty { font-size: 11.5px; color: var(--text-muted); font-style: italic; text-align: center; padding: 10px 0; }
        .team-member-item { display: flex; align-items: center; gap: 10px; padding: 6px 8px; border-radius: 8px; }
        .team-member-item:hover { background: var(--bg-secondary); }
        .team-member-info { flex: 1; min-width: 0; }
        .team-member-name { display: block; font-size: 13px; font-weight: 500; color: var(--text-primary); }
        .team-member-role { font-size: 11px; color: var(--text-muted); }
        .supervisor-item { background: rgba(245, 158, 11, 0.05); border: 1px solid rgba(245, 158, 11, 0.15); border-radius: 8px; padding: 6px 10px; }
        .lead-item { background: rgba(99, 102, 241, 0.05); border: 1px solid rgba(99, 102, 241, 0.15); border-radius: 8px; padding: 6px 10px; }
        .team-add-btn { display: inline-flex; align-items: center; justify-content: center; width: 22px; height: 22px; border-radius: 6px; border: 1px solid var(--border-subtle); background: var(--bg-card); color: var(--text-secondary); cursor: pointer; padding: 0; }
        .team-add-btn:hover { background: var(--accent-primary); color: #fff; border-color: var(--accent-primary); }

        .comments-card { flex: 1; }
        .comment-list { display: flex; flex-direction: column; gap: 8px; max-height: 400px; overflow-y: auto; padding-right: 4px; }
        .comment-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 16px 0; color: var(--text-muted); text-align: center; }
        .comment-item { padding: 10px 12px; border: 1px solid var(--border-subtle); border-radius: 8px; background: var(--bg-secondary); }
        .comment-item.pinned { border-color: var(--accent-primary); background: color-mix(in srgb, var(--accent-primary) 5%, var(--bg-secondary)); }
        .comment-pin-badge { display: flex; align-items: center; gap: 4px; font-size: 9px; font-weight: 700; color: var(--accent-primary); text-transform: uppercase; margin-bottom: 4px; }
        .comment-text { font-size: 13px; color: var(--text-secondary); line-height: 1.5; margin: 0; white-space: pre-wrap; }
        .comment-meta-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; margin-top: 4px; }
        .comment-meta { font-size: 10px; color: var(--text-muted); }
        .comment-task-tag { display: inline-flex; align-items: center; gap: 4px; padding: 1px 8px; border-radius: 12px; font-size: 10px; color: var(--text-muted); background: var(--bg-secondary); border: 1px solid var(--border-subtle); cursor: pointer; max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .comment-footer { display: flex; justify-content: flex-end; margin-top: 6px; }
        .comment-actions { display: flex; gap: 3px; }
        .comment-action-btn { display: inline-flex; align-items: center; justify-content: center; padding: 2px 4px; border: 1px solid var(--border-subtle); border-radius: 4px; background: var(--bg-card); color: var(--text-secondary); cursor: pointer; }
        .comment-action-btn.active { color: var(--accent-primary); border-color: var(--accent-primary); }
        .comment-action-btn.danger:hover { color: #f87171; border-color: #f87171; }

        .tasks-card { background: var(--bg-card); border: 1px solid var(--border-subtle); border-radius: 14px; padding: 18px 20px; }
        .tasks-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }
        .tasks-title { display: flex; align-items: center; gap: 8px; font-size: 15px; font-weight: 700; color: var(--text-primary); margin: 0; }
        .tasks-count { font-size: 11px; font-weight: 600; color: var(--text-muted); background: var(--bg-secondary); padding: 1px 10px; border-radius: 20px; }
        .tasks-scroll { max-height: 500px; overflow-y: auto; padding-right: 6px; }
        .tasks-list { display: flex; flex-direction: column; gap: 14px; }
        .tasks-empty { text-align: center; padding: 30px 0; color: var(--text-muted); }
        .tasks-empty p { font-size: 14px; font-weight: 500; margin: 8px 0 4px; }
        .tasks-empty span { font-size: 12px; }
        .task-item { padding: 12px 14px; background: var(--bg-secondary); border: 1px solid var(--border-subtle); border-radius: 10px; cursor: pointer; transition: all 0.15s; }
        .task-item:hover { border-color: var(--accent-primary); background: var(--bg-card); }
        .task-item-header { display: flex; justify-content: space-between; align-items: center; gap: 10px; }
        .task-item-left { display: flex; align-items: center; gap: 8px; flex: 1; min-width: 0; }
        .task-item-title { font-size: 13px; font-weight: 600; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .task-item-badges { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
        .task-comment-badge { display: inline-flex; align-items: center; gap: 3px; font-size: 10px; font-weight: 600; color: var(--text-muted); background: var(--bg-secondary); padding: 1px 8px; border-radius: 12px; border: 1px solid var(--border-subtle); }
        .task-item-progress-badge { font-size: 10px; font-weight: 700; padding: 1px 8px; border-radius: 12px; }
        .task-item-desc { font-size: 12px; color: var(--text-secondary); margin: 6px 0 8px; display: -webkit-box; -webkit-line-clamp: 1; -webkit-box-orient: vertical; overflow: hidden; }
        .task-item-footer { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
        .task-item-assignee { display: flex; align-items: center; gap: 4px; font-size: 11px; color: var(--text-muted); }
        .task-item-actions { display: flex; gap: 4px; margin-left: auto; }
        .task-action-btn { display: inline-flex; align-items: center; justify-content: center; padding: 3px 5px; border-radius: 4px; border: 1px solid var(--border-subtle); background: var(--bg-card); color: var(--text-secondary); cursor: pointer; }
        .task-action-btn:hover { color: var(--accent-primary); border-color: var(--accent-primary); }
        .task-action-btn.danger:hover { color: #f87171; border-color: #f87171; }

        .multi-trigger { display: flex; align-items: center; gap: 8px; min-height: 42px; padding: 6px 12px; border-radius: 9px; border: 1px solid var(--border-default); background: var(--bg-secondary); cursor: pointer; }
        .multi-trigger:hover { border-color: var(--border-strong); }
        .multi-chip { display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; background: var(--bg-card); border: 1px solid var(--border-subtle); border-radius: 20px; font-size: 12px; color: var(--text-primary); }
        .multi-chip button { display: inline-flex; align-items: center; justify-content: center; border: none; background: transparent; color: var(--text-muted); cursor: pointer; padding: 0; }
        .multi-backdrop { position: fixed; inset: 0; z-index: 10000; }
        .multi-dropdown { background: var(--bg-card); border: 1px solid var(--border-default); border-radius: 12px; box-shadow: 0 16px 40px rgba(0, 0, 0, 0.28); overflow: hidden; display: flex; flex-direction: column; }
        .multi-search { display: flex; align-items: center; gap: 8px; padding: 10px 12px; border-bottom: 1px solid var(--border-subtle); }
        .multi-search input { flex: 1; border: none; background: transparent; outline: none; font-size: 13px; color: var(--text-primary); }
        .multi-search button { background: transparent; border: none; color: var(--text-muted); cursor: pointer; }
        .multi-list { overflow-y: auto; padding: 6px; }
        .multi-option { display: flex; align-items: center; gap: 10px; width: 100%; padding: 8px 10px; border: none; background: transparent; border-radius: 8px; cursor: pointer; color: var(--text-primary); }
        .multi-option:hover { background: var(--bg-secondary); }
        .multi-option.selected { background: color-mix(in srgb, var(--accent-primary) 10%, transparent); }
        .multi-empty { padding: 20px; text-align: center; font-size: 13px; color: var(--text-muted); }

        .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.6); backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 16px; }
        .modal-box { background: var(--bg-card); border: 1px solid var(--border-default); border-radius: 20px; width: 100%; max-width: 520px; max-height: 90vh; overflow-y: auto; }
        .modal-header { display: flex; align-items: center; justify-content: space-between; padding: 18px 20px 14px; border-bottom: 1px solid var(--border-subtle); }
        .modal-title { font-size: 17px; font-weight: 700; color: var(--text-primary); display: flex; align-items: center; gap: 8px; margin: 0; }
        .modal-close-btn { display: inline-flex; padding: 6px; border-radius: 8px; border: 1px solid var(--border-subtle); background: var(--bg-secondary); color: var(--text-secondary); cursor: pointer; }
        .modal-body { padding: 18px 20px; }
        .modal-footer { display: flex; gap: 10px; padding: 14px 20px 20px; border-top: 1px solid var(--border-subtle); justify-content: flex-end; align-items: center; }
        .edit-form { display: flex; flex-direction: column; gap: 12px; }
        .form-group { display: flex; flex-direction: column; gap: 4px; }
        .form-label { font-size: 12px; font-weight: 600; color: var(--text-secondary); }
        .form-required { color: #f87171; }
        .form-input { padding: 9px 12px; border: 1px solid var(--border-default); border-radius: 8px; background: var(--bg-secondary); color: var(--text-primary); font-size: 13px; font-family: inherit; }
        .form-input:focus { outline: none; border-color: var(--accent-primary); background: var(--bg-card); }
        .form-textarea { resize: vertical; min-height: 80px; }
        .form-row-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .range-input { width: 100%; accent-color: var(--accent-primary); cursor: pointer; }
        .btn-danger { background: rgba(239, 68, 68, 0.1); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.3); }
        .btn-secondary { background: var(--bg-secondary); color: var(--text-primary); border: 1px solid var(--border-default); }
        .add-picker-row { display: flex; align-items: center; gap: 10px; padding: 10px 12px; background: var(--bg-secondary); border: 1px solid var(--border-subtle); border-radius: 10px; cursor: pointer; color: var(--text-primary); }
        .add-picker-row:hover:not(:disabled) { border-color: var(--accent-primary); background: var(--bg-card); }
        .confirm-box { max-width: 380px; text-align: center; padding-bottom: 24px; }
        .confirm-title { font-size: 18px; font-weight: 800; color: var(--text-primary); margin: 0 0 6px; }
        .confirm-desc { font-size: 13px; color: var(--text-muted); margin: 0 0 16px; }

        /* ─── Lead picker rows (Lead vs Member toggle) ─── */
        .lead-add-row {
          display: flex;
          align-items: stretch;
          gap: 6px;
        }
        .lead-add-row .lead-add-btn {
          flex: 1;
        }
        .lead-add-row .lead-add-btn.selected {
          border-color: var(--accent-primary);
          background: color-mix(in srgb, var(--accent-primary) 8%, var(--bg-secondary));
        }
        .lead-already-badge {
          display: inline-block;
          margin-left: 6px;
          font-size: 10px;
          font-weight: 500;
          color: var(--text-muted);
          font-style: italic;
        }
        .lead-mode-toggle {
          display: inline-flex;
          gap: 2px;
          padding: 2px;
          background: var(--bg-secondary);
          border: 1px solid var(--border-subtle);
          border-radius: 8px;
          align-self: center;
        }
        .lead-mode-btn {
          font-size: 10.5px;
          font-weight: 600;
          padding: 5px 10px;
          border: none;
          border-radius: 6px;
          background: transparent;
          color: var(--text-muted);
          cursor: pointer;
          transition: all 0.12s;
        }
        .lead-mode-btn:hover { color: var(--text-primary); }
        .lead-mode-btn.active { background: var(--accent-primary); color: #fff; }

        /* ─── Subtasks section ─── */
        .add-subtasks-block {
          margin-top: 8px;
          padding: 12px;
          background: var(--bg-secondary);
          border: 1px solid var(--border-subtle);
          border-radius: 10px;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .add-subtasks-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
        }
        .add-subtasks-count {
          display: inline-block;
          margin-left: 6px;
          font-size: 10px;
          font-weight: 700;
          padding: 1px 8px;
          border-radius: 10px;
          background: var(--accent-primary);
          color: #fff;
        }
        .add-subtasks-hint {
          font-size: 10.5px;
          color: var(--text-muted);
          font-style: italic;
        }
        .add-subtasks-list {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .add-subtask-chip {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 6px 10px;
          background: var(--bg-card);
          border: 1px solid var(--border-subtle);
          border-radius: 8px;
          font-size: 12.5px;
        }
        .add-subtask-chip-title {
          flex: 1;
          min-width: 0;
          font-weight: 500;
          color: var(--text-primary);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .add-subtask-chip-meta {
          font-size: 11px;
          color: var(--text-muted);
          flex-shrink: 0;
        }
        .add-subtask-chip-remove {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 20px;
          height: 20px;
          border-radius: 6px;
          border: 1px solid var(--border-subtle);
          background: transparent;
          color: var(--text-muted);
          cursor: pointer;
          flex-shrink: 0;
        }
        .add-subtask-chip-remove:hover { color: #f87171; border-color: #f87171; }
        .subtask-draft-row {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .subtask-draft-inputs {
          display: grid;
          grid-template-columns: 1fr 120px;
          gap: 8px;
        }
        .subtask-draft-select { min-width: 0; }
        .subtask-draft-actions {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .subtask-draft-actions .btn { align-self: flex-end; }

        @media (max-width: 1024px) { .project-body { grid-template-columns: 1fr 280px; padding: 16px 20px; } }
        @media (max-width: 768px) {
          .project-body { grid-template-columns: 1fr; padding: 14px 16px; gap: 14px; }
          .overview-header { flex-direction: column; align-items: stretch; text-align: center; }
          .overview-progress-ring { align-self: center; }
          .form-row-2 { grid-template-columns: 1fr; }
          .info-stats { grid-template-columns: 1fr 1fr; }
          .subtask-draft-inputs { grid-template-columns: 1fr; }
        }
      `}</style>
    </div>
  );
}