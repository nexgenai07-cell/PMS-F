// components/supervisor/SupervisorProjects.jsx
import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import {
  Search, FolderOpen, Plus, Pencil, Trash2,
  X, ListTodo, Milestone, ChevronDown,
  Users, Check, RefreshCw, Filter, Flag,
  Crown, AlertCircle, Loader2, UserMinus
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

import Topbar from '../shared/Topbar';
import {
  PriorityBadge,
  StatusBadge,
  AvatarGroup,
  EmptyState
} from '../shared/UIComponents';

import projectService from '../../services/projectService';
import taskService from '../../services/taskService';
import teamService from '../../services/teamService';
import userService from '../../services/userService';
import projectTeamService from '../../services/projectTeamService';
import { useAuth } from '../../context/AuthContext';
import toast from 'react-hot-toast';
import NotificationHelper from '../../services/notificationHelper';

const PRIORITY_OPTIONS = ['low', 'medium', 'high', 'critical'];
const STATUS_OPTIONS = ['planning', 'active', 'on_hold', 'completed', 'cancelled'];
const TASK_STATUS_OPTIONS = ['todo', 'in_progress', 'review', 'done'];

const SUPERVISOR_ROLES = ['manager', 'admin', 'supervisor'];

const asArray = (v) => (Array.isArray(v) ? v : []);

/* ─────────── Resolve TeamMember id → user-like object ─────────── */
function resolveTeamMemberId(tmId, usersList, membersList) {
  if (tmId == null) return null;
  const numId = Number(tmId);
  if (!Number.isFinite(numId)) return null;

  const safeUsers = asArray(usersList);
  const safeMembers = asArray(membersList);

  const tm = safeMembers.find(m => Number(m.id) === numId);
  if (tm) {
    const userObj = safeUsers.find(u => {
      const uName = (u.u_name || u.name || '').toLowerCase().trim();
      const mName = (tm.name || '').toLowerCase().trim();
      return uName && mName && uName === mName;
    });
    return {
      id: tm.id,
      userId: userObj?.id ?? tm.id,
      name: tm.name || userObj?.u_name || `User ${tm.id}`,
      email: tm.email || userObj?.email || '',
      role: ((userObj?.role) || tm.role || '').toLowerCase(),
    };
  }

  const userObj = safeUsers.find(u => Number(u.id) === numId);
  if (userObj) {
    return {
      id: userObj.id,
      userId: userObj.id,
      name: userObj.u_name || userObj.name || `User ${userObj.id}`,
      email: userObj.email || '',
      role: (userObj.role || '').toLowerCase(),
    };
  }
  return null;
}

/* ─────────── Resolve User id → object ─────────── */
function resolveUserId(userId, usersList, membersList) {
  if (userId == null) return null;
  const numId = Number(userId);
  if (!Number.isFinite(numId)) return null;

  const safeUsers = asArray(usersList);
  const safeMembers = asArray(membersList);

  const userObj = safeUsers.find(u => Number(u.id) === numId);
  if (userObj) {
    return {
      id: userObj.id,
      userId: userObj.id,
      name: userObj.u_name || userObj.name || `User ${userObj.id}`,
      email: userObj.email || '',
      role: (userObj.role || '').toLowerCase(),
    };
  }

  const tm = safeMembers.find(m => Number(m.id) === numId);
  if (tm) {
    return {
      id: tm.id,
      userId: tm.id,
      name: tm.name || `User ${tm.id}`,
      email: tm.email || '',
      role: (tm.role || '').toLowerCase(),
    };
  }
  return null;
}

/* ─────────── PTeam field getters ─────────── */
function getPteamProjectId(entry) {
  return Number(entry?.p ?? entry?.p_id ?? entry?.project ?? entry?.projectId ?? entry?.project_id);
}
function getPteamTmId(entry) {
  return Number(entry?.tm ?? entry?.tm_id ?? entry?.team_member ?? entry?.member ?? entry?.member_id ?? entry?.teamMember);
}

/* ─────────── Compute task progress ─────────── */
function computeTaskProgress(task) {
  if (task?.progress !== undefined && task?.progress !== null) {
    const raw = Number(task.progress);
    if (Number.isFinite(raw)) return raw;
  }
  const status = (task?.status || '').toLowerCase();
  if (status === 'done' || status === 'completed') return 100;
  if (status === 'review') return 75;
  if (status === 'in_progress' || status === 'in-progress') return 50;
  return 0;
}

/* ─────────── Find real TeamMember id from a user id ─────────── */
function findRealTeamMemberId(userIdOrObj, teamMembersList, usersList) {
  if (!userIdOrObj) return null;
  const id = typeof userIdOrObj === 'object'
    ? (userIdOrObj.userId ?? userIdOrObj.id)
    : userIdOrObj;
  const numId = Number(id);
  if (!Number.isFinite(numId)) return null;

  const safeMembers = asArray(teamMembersList);
  const safeUsers = asArray(usersList);

  const direct = safeMembers.find(m => !m._placeholder && Number(m.id) === numId);
  if (direct) return Number(direct.id);

  const userObj = safeUsers.find(u => Number(u.id) === numId);
  if (userObj) {
    const name = (userObj.u_name || userObj.name || '').toLowerCase().trim();
    const email = (userObj.email || '').toLowerCase().trim();
    const byName = safeMembers.find(m =>
      !m._placeholder && (m.name || '').toLowerCase().trim() === name
    );
    if (byName) return Number(byName.id);
    if (email) {
      const byEmail = safeMembers.find(m =>
        !m._placeholder && (m.email || '').toLowerCase().trim() === email
      );
      if (byEmail) return Number(byEmail.id);
    }
  }
  return null;
}

/* ─────────── Validation constants ─────────── */
const LIMITS = {
  projectName: { min: 3, max: 120 },
  projectDesc: { max: 2000 },
  taskTitle:   { min: 3, max: 200 },
  taskDesc:    { max: 2000 },
  milestone:   { max: 120 },
};

const PROJECT_NAME_REGEX = /^[\p{L}\p{N} &\-.'(),]+$/u;
const TASK_TITLE_REGEX   = /^[\p{L}\p{N} &\-.'(),!?]+$/u;

const validators = {
  projectName: (value) => {
    const v = (value ?? '').trim();
    if (!v) return 'Project name is required';
    if (v.length < LIMITS.projectName.min) return `Project name must be at least ${LIMITS.projectName.min} characters`;
    if (v.length > LIMITS.projectName.max) return `Project name must be less than ${LIMITS.projectName.max} characters`;
    if (!PROJECT_NAME_REGEX.test(v)) {
      return 'Only letters, numbers, spaces, and the characters  & - . \' ( ) ,  are allowed';
    }
    return '';
  },

  projectDesc: (value) => {
    const v = value ?? '';
    if (v.length > LIMITS.projectDesc.max) return `Description must be less than ${LIMITS.projectDesc.max} characters`;
    const BLOCKED = /[\p{So}\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u;
    if (BLOCKED.test(v)) return 'Description contains characters that are not allowed';
    return '';
  },

  projectDates: (startDate, deadline) => {
    if (startDate && deadline) {
      const s = new Date(startDate);
      const e = new Date(deadline);
      if (isNaN(s.getTime()) || isNaN(e.getTime())) return 'Invalid date format';
      if (e < s) return 'Deadline cannot be before the start date';
    }
    return '';
  },

  priority: (value) => (!PRIORITY_OPTIONS.includes(value) ? 'Invalid priority selected' : ''),
  projectStatus: (value) => (!STATUS_OPTIONS.includes(value) ? 'Invalid status selected' : ''),

  taskTitle: (value) => {
    const v = (value ?? '').trim();
    if (!v) return 'Task title is required';
    if (v.length < LIMITS.taskTitle.min) return `Task title must be at least ${LIMITS.taskTitle.min} characters`;
    if (v.length > LIMITS.taskTitle.max) return `Task title must be less than ${LIMITS.taskTitle.max} characters`;
    if (!TASK_TITLE_REGEX.test(v)) {
      return 'Only letters, numbers, spaces, and the characters  & - . \' ( ) , ! ?  are allowed';
    }
    return '';
  },

  taskDesc: (value) => {
    const v = value ?? '';
    if (v.length > LIMITS.taskDesc.max) return `Description must be less than ${LIMITS.taskDesc.max} characters`;
    return '';
  },

  taskStatus: (value) => (!TASK_STATUS_OPTIONS.includes(value) ? 'Invalid status selected' : ''),

  milestone: (value) => {
    const v = value ?? '';
    if (v.length > LIMITS.milestone.max) return `Milestone must be less than ${LIMITS.milestone.max} characters`;
    return '';
  },

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
    <div className="lp-field-error" role="alert">
      <AlertCircle size={12} />
      <span>{message}</span>
    </div>
  );
}

/* ─── Multi-member picker ─── */
function MemberPicker({ selected = [], onChange, label = 'Members', members = [] }) {
  const [open, setOpen] = useState(false);

  const toggle = (id) => {
    const next = selected.includes(id)
      ? selected.filter(item => item !== id)
      : [...selected, id];
    onChange(next);
  };

  const selectedMembers = members.filter(m => selected.includes(m.id));

  return (
    <div style={{ position: 'relative' }}>
      <label className="lp-label">{label}</label>
      <div className="lp-member-trigger" onClick={() => setOpen(o => !o)} style={{ cursor: 'pointer' }}>
        {selectedMembers.length === 0 ? (
          <span style={{ color: 'var(--text-muted)' }}>Select members...</span>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', flex: 1 }}>
            {selectedMembers.map(m => {
              const key = m.id || `m-${Math.random().toString(36).slice(2, 8)}`;
              return (
                <span key={key} className="lp-member-chip">
                  <span className="lp-member-avatar-sm">{(m.name || '?')[0].toUpperCase()}</span>
                  {m.name}
                  <button
                    type="button"
                    className="lp-chip-remove"
                    title={`Remove ${m.name}`}
                    onClick={e => { e.stopPropagation(); toggle(m.id); }}
                  >
                    <X size={10} />
                  </button>
                </span>
              );
            })}
          </div>
        )}
        <ChevronDown size={14} style={{ flexShrink: 0, color: 'var(--text-muted)', marginLeft: 'auto', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
      </div>

      {open && (
        <>
          <div className="lp-picker-backdrop" onClick={() => setOpen(false)} />
          <div className="lp-member-dropdown">
            {members.length === 0
              ? <p style={{ padding: '12px 16px', color: 'var(--text-muted)', fontSize: 13 }}>No members available.</p>
              : members.map(m => {
                const key = m.id || `m-${Math.random().toString(36).slice(2, 8)}`;
                const isSelected = selected.includes(m.id);
                return (
                  <button key={key} type="button"
                    className={`lp-member-option ${isSelected ? 'selected' : ''}`}
                    onClick={() => toggle(m.id)}>
                    <span className="lp-member-avatar">{(m.name || '?')[0].toUpperCase()}</span>
                    <span style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>{m.name}</span>
                    {isSelected && <Check size={14} style={{ color: 'var(--accent-primary)', flexShrink: 0 }} />}
                  </button>
                );
              })
            }
          </div>
        </>
      )}
    </div>
  );
}

/* ─── Lead picker with "Lead vs Member" toggle ─── */
function LeadPicker({
  leads = [],
  assignments = {},
  onAssign,
  onUnassign,
  label = 'Project Leads',
  assignedLeadIds = [],
}) {
  const [open, setOpen] = useState(false);

  const isSelected = (id) => assignments[id] != null;

  const toggleLead = (lead) => {
    if (isSelected(lead.id)) {
      onUnassign(lead.id);
    } else {
      onAssign(lead.id, 'lead');
    }
  };

  const selectedLeads = leads.filter(l => isSelected(l.id));

  return (
    <div style={{ position: 'relative' }}>
      <label className="lp-label">
        <Crown size={13} style={{ display: 'inline', marginRight: 4, verticalAlign: 'text-bottom' }} />
        {label}
      </label>
      <div className="lp-member-trigger" onClick={() => setOpen(o => !o)} style={{ cursor: 'pointer' }}>
        {selectedLeads.length === 0 ? (
          <span style={{ color: 'var(--text-muted)' }}>Select leads…</span>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', flex: 1 }}>
            {selectedLeads.map(l => {
              const mode = assignments[l.id];
              return (
                <span key={l.id} className="lp-member-chip" title={`Assigned as: ${mode}`}>
                  <span className="lp-member-avatar-sm">{(l.u_name || l.name || '?')[0].toUpperCase()}</span>
                  {l.u_name || l.name}
                  <span className={`lp-lead-mode-pill ${mode}`}>{mode === 'lead' ? 'Lead' : 'Member'}</span>
                  <button
                    type="button"
                    className="lp-chip-remove"
                    title={`Remove ${l.u_name || l.name}`}
                    onClick={e => { e.stopPropagation(); onUnassign(l.id); }}
                  >
                    <X size={10} />
                  </button>
                </span>
              );
            })}
          </div>
        )}
        <ChevronDown size={14} style={{ flexShrink: 0, color: 'var(--text-muted)', marginLeft: 'auto', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
      </div>

      {open && (
        <>
          <div className="lp-picker-backdrop" onClick={() => setOpen(false)} />
          <div className="lp-member-dropdown">
            {leads.length === 0 ? (
              <p style={{ padding: '12px 16px', color: 'var(--text-muted)', fontSize: 13 }}>
                No leads available. Ask a supervisor to create Lead accounts.
              </p>
            ) : leads.map(l => {
              const name = l.u_name || l.name || `User ${l.id}`;
              const selected = isSelected(l.id);
              const mode = assignments[l.id];
              return (
                <div key={l.id} className="lp-lead-option-row">
                  <button
                    type="button"
                    className={`lp-member-option ${selected ? 'selected' : ''}`}
                    onClick={() => toggleLead(l)}
                    style={{ flex: 1 }}
                  >
                    <span className="lp-member-avatar">{(name || '?')[0].toUpperCase()}</span>
                    <span style={{ flex: 1, fontSize: 13, fontWeight: 500, textAlign: 'left' }}>
                      {name}
                      {assignedLeadIds.includes(Number(l.id)) && (
                        <span className="lp-lead-existing">already a Lead</span>
                      )}
                    </span>
                    {selected && <Check size={14} style={{ color: 'var(--accent-primary)', flexShrink: 0 }} />}
                  </button>

                  {selected && (
                    <div className="lp-lead-mode-toggle" onClick={e => e.stopPropagation()}>
                      <button
                        type="button"
                        className={`lp-lead-mode-btn ${mode === 'lead' ? 'active' : ''}`}
                        onClick={() => onAssign(l.id, 'lead')}
                        title="Add as Project Lead (co-supervisor of this project)"
                      >
                        Lead
                      </button>
                      <button
                        type="button"
                        className={`lp-lead-mode-btn ${mode === 'member' ? 'active' : ''}`}
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
        </>
      )}
    </div>
  );
}

function ProjectMembersPanel({ members, onEdit, onRemove }) {
  return (
    <div className="lp-members-panel">
      <div className="lp-members-panel-header">
        <Users size={14} />
        <span>Project Members ({members.length})</span>
        <button className="lp-icon-btn" style={{ marginLeft: 'auto' }} onClick={onEdit} title="Edit members">
          <Pencil size={11} />
        </button>
      </div>
      {members.length === 0
        ? <p style={{ fontSize: 12, color: 'var(--text-muted)', padding: '8px 0' }}>No members assigned.</p>
        : (
          <div className="lp-members-list">
            {members.map(m => {
              const key = m.id || `m-${Math.random().toString(36).slice(2, 8)}`;
              return (
                <div key={key} className="lp-member-row">
                  <span className="lp-member-avatar">{(m.name || '?')[0].toUpperCase()}</span>
                  <span style={{ fontSize: 13, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {m.name}
                  </span>
                  <button
                    className="lp-icon-btn danger"
                    title={`Remove ${m.name} from project`}
                    onClick={() => onRemove && onRemove(m)}
                    style={{ padding: '3px 4px' }}
                  >
                    <UserMinus size={11} />
                  </button>
                </div>
              );
            })}
          </div>
        )
      }
    </div>
  );
}

export default function SupervisorProjects() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { onMenuClick } = useOutletContext();

  const currentUserId = user?.id || user?.u_id;

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [projects, setProjects] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [teamMembers, setTeamMembers] = useState([]);
  const [users, setUsers] = useState([]);
  const [pteamEntries, setPteamEntries] = useState([]);
  const [allSupervisors, setAllSupervisors] = useState([]);
  const [projectStatsMap, setProjectStatsMap] = useState({});

  const [supervisorOptions, setSupervisorOptions] = useState([]);
  const [memberOptions, setMemberOptions] = useState([]);
  const [allLeads, setAllLeads] = useState([]);
  const [leadAssignments, setLeadAssignments] = useState({});

  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterPriority, setFilterPriority] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 6;

  const [projectModal, setProjectModal] = useState(false);
  const [taskAddModal, setTaskAddModal] = useState(null);
  const [editProject, setEditProject] = useState(null);
  const [taskListModal, setTaskListModal] = useState(null);
  const [selectedTask, setSelectedTask] = useState(null);
  const [editTask, setEditTask] = useState(null);
  const [deleteTaskId, setDeleteTaskId] = useState(null);
  const [deleteProjectId, setDeleteProjectId] = useState(null);
  const [editMembersFor, setEditMembersFor] = useState(null);

  const [removeMemberInfo, setRemoveMemberInfo] = useState(null);
  const [reassignTo, setReassignTo] = useState('');
  const [removeMemberSaving, setRemoveMemberSaving] = useState(false);

  const [savingProject, setSavingProject] = useState(false);
  const [savingTask, setSavingTask] = useState(false);
  const [savingEditTask, setSavingEditTask] = useState(false);

  const [projectTouched, setProjectTouched] = useState({});
  const [taskTouched, setTaskTouched] = useState({});
  const [editTaskTouched, setEditTaskTouched] = useState({});
  const [projectSubmitAttempted, setProjectSubmitAttempted] = useState(false);
  const [taskSubmitAttempted, setTaskSubmitAttempted] = useState(false);
  const [editTaskSubmitAttempted, setEditTaskSubmitAttempted] = useState(false);

  const projectNameRef = useRef(null);
  const taskTitleRef = useRef(null);

  const [form, setForm] = useState({
    name: '',
    description: '',
    priority: 'medium',
    status: 'planning',
    startDate: '',
    deadline: '',
    members: [],
    supervisors: []
  });

  const [taskForm, setTaskForm] = useState({
    title: '',
    desc: '',
    assignedTo: [],
    status: 'todo',
    priority: 'medium',
    milestone: '',
    milestoneDate: '',
    progress: 0
  });

  const projectErrors = useMemo(() => ({
    name: validators.projectName(form.name),
    description: validators.projectDesc(form.description),
    priority: validators.priority(form.priority),
    status: validators.projectStatus(form.status),
    dates: validators.projectDates(form.startDate, form.deadline),
  }), [form]);

  const taskErrors = useMemo(() => ({
    title: validators.taskTitle(taskForm.title),
    desc: validators.taskDesc(taskForm.desc),
    priority: validators.priority(taskForm.priority),
    status: validators.taskStatus(taskForm.status),
    milestone: validators.milestone(taskForm.milestone),
    progress: validators.progress(taskForm.progress),
  }), [taskForm]);

  const editTaskErrors = useMemo(() => {
    if (!editTask) return {};
    return {
      title: validators.taskTitle(editTask.title),
      desc: validators.taskDesc(editTask.desc),
      priority: validators.priority(editTask.priority),
      status: validators.taskStatus(editTask.status),
      milestone: validators.milestone(editTask.milestone),
      progress: validators.progress(editTask.progress),
    };
  }, [editTask]);

  const isProjectValid = Object.values(projectErrors).every(e => e === '');
  const isTaskValid = Object.values(taskErrors).every(e => e === '');
  const isEditTaskValid = Object.values(editTaskErrors).every(e => e === '');

  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      if (removeMemberInfo) { setRemoveMemberInfo(null); setReassignTo(''); return; }
      if (deleteTaskId !== null) { setDeleteTaskId(null); return; }
      if (deleteProjectId !== null) { setDeleteProjectId(null); return; }
      if (editTask) { setEditTask(null); setEditTaskTouched({}); setEditTaskSubmitAttempted(false); return; }
      if (selectedTask) { setSelectedTask(null); return; }
      if (taskAddModal) { setTaskAddModal(null); setTaskTouched({}); setTaskSubmitAttempted(false); return; }
      if (projectModal) { setProjectModal(false); setEditProject(null); setLeadAssignments({}); setProjectTouched({}); setProjectSubmitAttempted(false); return; }
      if (taskListModal) { setTaskListModal(null); setEditMembersFor(null); return; }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [removeMemberInfo, deleteTaskId, deleteProjectId, editTask, selectedTask, taskAddModal, projectModal, taskListModal]);

  useEffect(() => {
    if (!projectModal) return;
    const t = setTimeout(() => projectNameRef.current?.focus(), 60);
    return () => clearTimeout(t);
  }, [projectModal]);

  useEffect(() => {
    if (!taskAddModal) return;
    const t = setTimeout(() => taskTitleRef.current?.focus(), 60);
    return () => clearTimeout(t);
  }, [taskAddModal]);

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const categorizeMembers = (members, users) => {
    const supervisors = [];
    const regularMembers = [];

    asArray(members).forEach(m => {
      if (m._placeholder) return;
      const role = (m.role || '').trim().toLowerCase();
      const isSupervisor = SUPERVISOR_ROLES.includes(role);
      if (isSupervisor) supervisors.push({ ...m, role: role || 'supervisor' });
      else regularMembers.push({ ...m, role: role || 'member' });
    });

    return { supervisors, regularMembers };
  };

  const assignLead = (leadId, mode) => {
    setLeadAssignments(prev => ({ ...prev, [leadId]: mode }));
  };
  const unassignLead = (leadId) => {
    setLeadAssignments(prev => {
      const next = { ...prev };
      delete next[leadId];
      return next;
    });
  };

  const fetchData = async () => {
    console.log('🚀 [SupervisorProjects] fetchData STARTED');
    try {
      setLoading(true);

      const [projectsData, tasksData, membersData, usersData, pteamData, leadsData] = await Promise.all([
        projectService.getProjects().catch(e => { console.error('❌ getProjects:', e); return { data: [] }; }),
        taskService.getTasks().catch(e => { console.error('❌ getTasks:', e); return { data: [] }; }),
        teamService.getTeamMembers().catch(e => { console.error('❌ getTeamMembers:', e); return { data: [] }; }),
        userService.getUsers().catch(e => { console.error('❌ getUsers:', e); return { data: [] }; }),
        projectTeamService.getProjectTeams().catch(e => { console.error('❌ getProjectTeams:', e); return { data: [] }; }),
        projectService.getLeadCandidates().catch(e => { console.error('❌ getLeadCandidates:', e); return { data: [] }; }),
      ]);

      const projectsList = asArray(projectsData?.data || projectsData);
      const tasksList = asArray(tasksData?.data || tasksData);
      const membersList = asArray(membersData?.data || membersData);
      const usersList = asArray(usersData?.data || usersData);
      const pteamList = asArray(pteamData?.data || pteamData);
      const leadsList = asArray(leadsData?.data || leadsData);

      console.log('✅ [SupervisorProjects] Normalized:', {
        projects: projectsList.length,
        tasks: tasksList.length,
        members: membersList.length,
        users: usersList.length,
        pteam: pteamList.length,
        leads: leadsList.length,
      });

      setAllLeads(leadsList);

      // Only real, non-deleted team members
      const activeMembersList = membersList.filter(m => m.is_deleted !== 1);
      const userId = user?.id || user?.u_id;

      // Add current user as a supervisor-picker placeholder only
      const currentUserInMembers = activeMembersList.some(m => Number(m.id) === Number(userId));
      const augmentedMembersList = [...activeMembersList];
      if (!currentUserInMembers && userId) {
        const userObj = usersList.find(u => Number(u.id) === Number(userId));
        if (userObj) {
          augmentedMembersList.push({
            id: userId,
            name: userObj.u_name || userObj.name || 'User',
            email: userObj.email,
            role: userObj.role,
            is_deleted: 0,
            _placeholder: true,
          });
        }
      }

      // Supervisor options
      const allSupervisorUsers = usersList
        .filter(u => SUPERVISOR_ROLES.includes((u.role || '').toLowerCase()))
        .map(u => ({
          id: u.id,
          name: u.u_name || u.name || 'Unknown',
          email: u.email,
          role: (u.role || 'supervisor').toLowerCase(),
        }));

      const supIdSetForOptions = new Set(allSupervisorUsers.map(s => Number(s.id)));
      augmentedMembersList.forEach(m => {
        const role = (m.role || '').toLowerCase();
        if (SUPERVISOR_ROLES.includes(role) && !supIdSetForOptions.has(Number(m.id))) {
          supIdSetForOptions.add(Number(m.id));
          allSupervisorUsers.push({
            id: m.id,
            name: m.name || 'Unknown',
            email: m.email,
            role: role || 'supervisor',
          });
        }
      });

      setSupervisorOptions(allSupervisorUsers);
      setAllSupervisors(allSupervisorUsers);

      // Member options: non-supervisor TeamMembers only
      const { regularMembers: memberList } = categorizeMembers(activeMembersList, usersList);
      setMemberOptions(memberList);
      setTeamMembers(activeMembersList);

      // Projects: use backend-filtered list as-is
      const projectsWithMembers = projectsList.map(project => {
        const projectId = project.p_id || project.id;
        const projectPteamEntries = pteamList.filter(entry => getPteamProjectId(entry) === Number(projectId));

        const memberMap = new Map();

        projectPteamEntries.forEach(entry => {
          const tmId = getPteamTmId(entry);
          if (!Number.isFinite(tmId)) return;
          if (memberMap.has(tmId)) return;
          const resolved = resolveTeamMemberId(tmId, usersList, activeMembersList);
          if (resolved) {
            memberMap.set(tmId, {
              ...resolved,
              pt_id: entry.pt_id ?? entry.id ?? null,
              task_id: entry.t ?? null,
            });
          }
        });

        const projectMembersRaw = Array.from(memberMap.values());

        const supervisorIds = asArray(project.supervisors).map(Number);
        const supervisorNames = asArray(project.supervisor_names);

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

        const supUserIdSet = new Set(supervisorEntries.map(s => Number(s.userId)));
        const regularMembersList = projectMembersRaw.filter(m => !supUserIdSet.has(Number(m.userId)));
        const allMembers = [...supervisorEntries, ...regularMembersList];

        return {
          ...project,
          members: allMembers,
          supervisorMembers: supervisorEntries,
          regularMembers: regularMembersList,
          memberIds: allMembers.map(m => m.id),
          supervisorIds: supervisorEntries.map(m => m.id),
        };
      });

      const mappedTasks = tasksList.map(t => ({
        ...t,
        progress: computeTaskProgress(t),
      }));

      setProjects(projectsWithMembers);
      setTasks(mappedTasks);
      setUsers(usersList);
      setPteamEntries(pteamList);

      // Fetch stats per project
      const statsMap = {};
      for (const project of projectsWithMembers) {
        const projectId = project.p_id || project.id;
        try {
          const statsResponse = await projectService.getProjectStats(projectId);
          statsMap[projectId] = statsResponse?.data || {};
        } catch (error) {
          console.error(`Error fetching stats for project ${projectId}:`, error);
        }
      }
      setProjectStatsMap(statsMap);

      console.log('✅ [SupervisorProjects] fetchData COMPLETE');

    } catch (error) {
      console.error('❌ [SupervisorProjects] Error fetching data:', error);
      toast.error('Failed to load projects. Please refresh.');
      setProjects([]);
      setTasks([]);
      setTeamMembers([]);
      setUsers([]);
      setSupervisorOptions([]);
      setMemberOptions([]);
      setAllLeads([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    toast.success('Projects refreshed');
  };

  const filtered = projects.filter(p => {
    const searchMatch = (p.p_name || p.name || '')?.toLowerCase().includes(search.toLowerCase()) ||
                       (p.desc || p.description || '')?.toLowerCase().includes(search.toLowerCase());
    const statusMatch = filterStatus === 'all' || p.status === filterStatus;
    const priorityMatch = filterPriority === 'all' || p.priority === filterPriority;
    return searchMatch && statusMatch && priorityMatch;
  });

  const totalPages = Math.ceil(filtered.length / itemsPerPage);
  const paginatedProjects = filtered.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const resetProjectTouched = () => { setProjectTouched({}); setProjectSubmitAttempted(false); };
  const markProjectTouched = (field) => setProjectTouched(prev => ({ ...prev, [field]: true }));
  const showProjectError = (field) => {
    if (projectSubmitAttempted) return projectErrors[field];
    return projectTouched[field] ? projectErrors[field] : '';
  };

  const openNewProject = () => {
    setEditProject(null);
    setForm({
      name: '',
      description: '',
      priority: 'medium',
      status: 'planning',
      startDate: '',
      deadline: '',
      members: [],
      supervisors: []
    });
    setLeadAssignments({});
    resetProjectTouched();
    setProjectModal(true);
  };

  const closeProjectModal = () => {
    setProjectModal(false);
    setEditProject(null);
    setLeadAssignments({});
    resetProjectTouched();
  };

  const handleSaveProject = async () => {
    setProjectSubmitAttempted(true);

    if (!isProjectValid) {
      toast.error('Please fix the highlighted errors before saving');
      return;
    }
    if (savingProject) return;

    setSavingProject(true);
    try {
      const userId = user?.id || user?.u_id || null;

      // Auto-assign creator as supervisor ONLY when form.supervisors is empty
      const supervisorsFromForm = [...new Set(form.supervisors.map(Number))];
      const finalSupervisors = supervisorsFromForm.length > 0
        ? supervisorsFromForm
        : (userId ? [userId] : []);

      const projectData = {
        name: form.name.trim(),
        description: (form.description || '').trim(),
        priority: form.priority,
        status: form.status,
        startDate: form.startDate || null,
        deadline: form.deadline || null,
        created_by: userId,
        supervisors: finalSupervisors,
      };

      const uniqueMembers = [...new Set(form.members.map(Number))];

      let createdProject;
      let projectIdForLeads;

      if (editProject) {
        const updated = await projectService.updateProject(
          editProject.p_id || editProject.id,
          projectData
        );
        createdProject = updated?.data || updated;
        projectIdForLeads = createdProject.p_id || createdProject.id;

        const currentPteam = asArray(pteamEntries).filter(entry => getPteamProjectId(entry) === Number(projectIdForLeads));
        const currentMemberIds = [...new Set(currentPteam.map(entry => getPteamTmId(entry)))];

        // Add supervisors as team members too (so they show in PTeam)
        for (const supId of finalSupervisors) {
          const realTmId = findRealTeamMemberId(supId, teamMembers, users);
          if (!realTmId) continue;
          if (currentMemberIds.includes(realTmId)) continue;
          try {
            await projectTeamService.addMemberToProject(projectIdForLeads, realTmId);
            currentMemberIds.push(realTmId);
          } catch (e) {
            console.warn(`Could not add supervisor ${supId} to PTeam:`, e);
          }
        }

        // Add regular members to PTeam
        for (const memberId of uniqueMembers) {
          const realTmId = findRealTeamMemberId(memberId, teamMembers, users);
          if (!realTmId) continue;
          if (currentMemberIds.includes(realTmId)) continue;
          try {
            await projectTeamService.addMemberToProject(projectIdForLeads, realTmId);
            currentMemberIds.push(realTmId);
          } catch (e) {
            console.warn(`Could not add member ${memberId} to PTeam:`, e);
          }
        }

        // Remove no-longer-wanted PTeam entries
        const allWantedTmIds = [
          ...finalSupervisors.map(id => findRealTeamMemberId(id, teamMembers, users)).filter(Boolean),
          ...uniqueMembers.map(id => findRealTeamMemberId(id, teamMembers, users)).filter(Boolean),
        ];
        for (const currentTmId of currentMemberIds) {
          if (!allWantedTmIds.includes(currentTmId)) {
            const entryToRemove = currentPteam.find(entry => getPteamTmId(entry) === currentTmId);
            if (entryToRemove) {
              try { await projectTeamService.removeMemberFromProject(entryToRemove.pt_id); }
              catch (e) { console.warn(`Could not remove tm ${currentTmId}:`, e); }
            }
          }
        }

        toast.success('Project updated successfully');
      } else {
        const newProject = await projectService.createProject(projectData);
        createdProject = newProject?.data || newProject;
        projectIdForLeads = createdProject.p_id || createdProject.id;

        // Add supervisors to PTeam
        for (const supId of finalSupervisors) {
          const realTmId = findRealTeamMemberId(supId, teamMembers, users);
          if (!realTmId) continue;
          try {
            await projectTeamService.addMemberToProject(projectIdForLeads, realTmId);
          } catch (e) {
            console.warn(`Could not add supervisor ${supId} to PTeam:`, e);
          }
        }

        // Add regular members to PTeam
        for (const memberId of uniqueMembers) {
          const realTmId = findRealTeamMemberId(memberId, teamMembers, users);
          if (!realTmId) continue;
          try {
            await projectTeamService.addMemberToProject(projectIdForLeads, realTmId);
          } catch (e) {
            console.warn(`Could not add member ${memberId} to PTeam:`, e);
          }
        }

        toast.success('Project created successfully');
      }

      // ─── Apply lead assignments ───
      const currentSupervisorIds = Array.isArray(createdProject?.supervisors)
        ? createdProject.supervisors.map(Number)
        : [...finalSupervisors];

      const leadsToPromote = Object.entries(leadAssignments)
        .filter(([, mode]) => mode === 'lead')
        .map(([id]) => Number(id));

      const nextSupervisorIds = Array.from(new Set([
        ...currentSupervisorIds,
        ...leadsToPromote,
      ]));

      if (leadsToPromote.length > 0) {
        try {
          await projectService.updateProject(projectIdForLeads, {
            name: projectData.name,
            description: projectData.description,
            priority: projectData.priority,
            status: projectData.status,
            startDate: projectData.startDate,
            deadline: projectData.deadline,
            supervisors: nextSupervisorIds,
          });
        } catch (e) {
          console.warn('Could not promote leads:', e);
        }
      }

      const leadsAsMembers = Object.entries(leadAssignments)
        .filter(([, mode]) => mode === 'member')
        .map(([id]) => Number(id));

      for (const leadId of leadsAsMembers) {
        const lead = allLeads.find(l => Number(l.id) === leadId);
        if (!lead) continue;
        try {
          await projectTeamService.addLeadAsTeamMember(
            projectIdForLeads,
            lead,
            teamMembers,
          );
        } catch (e) {
          console.warn(`Could not add lead ${leadId} as team member:`, e);
        }
      }

      closeProjectModal();
      await fetchData();
    } catch (error) {
      console.error('Error saving project:', error);
      const rawMsg = error?.response?.data?.message ||
                     error?.response?.data?.detail ||
                     error?.response?.data?.error ||
                     error?.response?.data?.supervisors?.[0];
      const errorMsg = typeof rawMsg === 'string' ? rawMsg : 'Failed to save project';
      toast.error(errorMsg);
    } finally {
      setSavingProject(false);
    }
  };

  const handleDeleteProject = async () => {
    try {
      await projectService.deleteProject(deleteProjectId);
      setProjects(projects.filter(p => (p.p_id || p.id) !== deleteProjectId));
      setDeleteProjectId(null);
      toast.success('Project deleted successfully');
    } catch (error) {
      console.error('Error deleting project:', error);
      toast.error('Failed to delete project');
    }
  };

  const resetTaskTouched = () => { setTaskTouched({}); setTaskSubmitAttempted(false); };
  const markTaskTouched = (field) => setTaskTouched(prev => ({ ...prev, [field]: true }));
  const showTaskError = (field) => {
    if (taskSubmitAttempted) return taskErrors[field];
    return taskTouched[field] ? taskErrors[field] : '';
  };

  const openAddTask = (project) => {
    setTaskAddModal(project);
    setTaskForm({
      title: '', desc: '', assignedTo: [], status: 'todo', priority: 'medium',
      milestone: '', milestoneDate: '', progress: 0
    });
    resetTaskTouched();
  };

  const closeTaskAddModal = () => {
    setTaskAddModal(null);
    resetTaskTouched();
  };

  const handleAddTask = async () => {
    setTaskSubmitAttempted(true);

    if (!isTaskValid) {
      toast.error('Please fix the highlighted errors before adding the task');
      return;
    }
    if (savingTask) return;

    setSavingTask(true);
    try {
      const assignTo = taskForm.assignedTo[0] ? Number(taskForm.assignedTo[0]) : null;

      const response = await taskService.createTask({
        title: taskForm.title.trim(),
        description: (taskForm.desc || '').trim(),
        status: taskForm.status,
        priority: taskForm.priority,
        projectId: taskAddModal.p_id || taskAddModal.id,
        assignTo: assignTo,
        dueDate: taskForm.milestoneDate || null,
        startDate: null,
        progress: taskForm.progress,
      });

      const newTask = response?.data || response;

      if (assignTo) {
        const assignee = teamMembers.find(m => Number(m.id) === Number(assignTo));
        if (assignee) {
          const project = projects.find(p => (p.p_id || p.id) === (taskAddModal.p_id || taskAddModal.id));
          try {
            await NotificationHelper.taskAssigned(newTask, assignee, user, project);
            toast.success(`Task created and notification sent to ${assignee.name}`);
          } catch (notifyErr) {
            console.warn('Task created but notification failed:', notifyErr);
            toast.success('Task created successfully');
          }
        }
      } else {
        toast.success('Task created successfully');
      }

      await fetchData();
      closeTaskAddModal();
    } catch (error) {
      console.error('Error creating task:', error);
      const rawMsg = error?.response?.data?.message || error?.response?.data?.detail;
      const errorMsg = typeof rawMsg === 'string' ? rawMsg : 'Failed to create task';
      toast.error(errorMsg);
    } finally {
      setSavingTask(false);
    }
  };

  const openEditTask = (task) => {
    setEditTask({
      ...task,
      assignedTo: Array.isArray(task.assignedTo)
        ? task.assignedTo
        : (task.assignedTo ? [task.assignedTo] : []),
    });
    setEditTaskTouched({});
    setEditTaskSubmitAttempted(false);
  };

  const closeEditTask = () => {
    setEditTask(null);
    setEditTaskTouched({});
    setEditTaskSubmitAttempted(false);
  };

  const markEditTaskTouched = (field) => setEditTaskTouched(prev => ({ ...prev, [field]: true }));
  const showEditTaskError = (field) => {
    if (editTaskSubmitAttempted) return editTaskErrors[field];
    return editTaskTouched[field] ? editTaskErrors[field] : '';
  };

  const handleUpdateTask = async () => {
    setEditTaskSubmitAttempted(true);

    if (!isEditTaskValid) {
      toast.error('Please fix the highlighted errors before saving');
      return;
    }
    if (savingEditTask) return;

    setSavingEditTask(true);
    try {
      const assignTo = editTask.assignedTo?.[0] ? Number(editTask.assignedTo[0]) : null;

      const response = await taskService.updateTask(editTask.t_id || editTask.id, {
        title: editTask.title.trim(),
        description: (editTask.desc || '').trim(),
        status: editTask.status,
        priority: editTask.priority,
        progress: editTask.progress,
        assignTo: assignTo,
      });

      const updatedTask = response?.data || response;
      closeEditTask();
      setSelectedTask(null);
      toast.success('Task updated successfully');
      await fetchData();
    } catch (error) {
      console.error('Error updating task:', error);
      const rawMsg = error?.response?.data?.message || error?.response?.data?.detail;
      const errorMsg = typeof rawMsg === 'string' ? rawMsg : 'Failed to update task';
      toast.error(errorMsg);
    } finally {
      setSavingEditTask(false);
    }
  };

  const handleDeleteTask = async () => {
    try {
      await taskService.deleteTask(deleteTaskId);
      setDeleteTaskId(null);
      setSelectedTask(null);
      toast.success('Task deleted successfully');
      await fetchData();
    } catch (error) {
      console.error('Error deleting task:', error);
      const rawMsg = error?.response?.data?.message || error?.response?.data?.detail;
      const errorMsg = typeof rawMsg === 'string' ? rawMsg : 'Failed to delete task';
      toast.error(errorMsg);
    }
  };

  const changeTaskPriority = (taskId, priority) => {
    setTasks(tasks.map(t => (t.t_id || t.id) === taskId ? { ...t, priority } : t));
  };

  const getProjectProgress = (projectId) => {
    const s = projectStatsMap[projectId];
    const avg = Number(s?.avgProgress);
    if (Number.isFinite(avg)) return Math.round(avg);
    return Math.round(Number(s?.completionRate) || 0);
  };
  const getProjectTotalTasks = (projectId) => projectStatsMap[projectId]?.totalTasks || 0;
  const getProjectDoneTasks = (projectId) => projectStatsMap[projectId]?.completedTasks || 0;
  const getProjectMembers = (project) => asArray(project?.members);
  const getMemberObjects = (ids = []) => teamMembers.filter(m => asArray(ids).includes(m.id));

  const handleEditProject = (project) => {
    setEditProject(project);

    const supervisorIds = [...new Set(asArray(project.supervisorMembers).map(s => s.id))];
    const memberIds = [...new Set(asArray(project.regularMembers).map(m => m.id))];

    setForm({
      name: project.p_name || project.name || '',
      description: project.desc || project.description || '',
      priority: project.priority || 'medium',
      status: project.status || 'planning',
      startDate: project.start_at || project.startDate || '',
      deadline: project.deadline || project.end_date || '',
      members: memberIds,
      supervisors: supervisorIds
    });

    // Seed lead assignments from existing project state
    const seeded = {};
    asArray(allLeads).forEach(lead => {
      const isSup = supervisorIds.includes(Number(lead.id));
      if (isSup) {
        seeded[lead.id] = 'lead';
        return;
      }
      const nameLower = (lead.u_name || lead.name || '').toLowerCase().trim();
      const matchingMember = asArray(project.regularMembers).find(
        m => (m.name || '').toLowerCase().trim() === nameLower
      );
      if (matchingMember) seeded[lead.id] = 'member';
    });
    setLeadAssignments(seeded);

    resetProjectTouched();
    setProjectModal(true);
  };

  /* ═══════════════ REMOVE-MEMBER FLOW ═══════════════ */

  const promptRemoveMember = (member) => {
    if (!taskListModal) return;
    const projectId = taskListModal.p_id || taskListModal.id;
    const memberUserId = Number(member.userId ?? member.id);

    const assignedTasks = asArray(tasks).filter(t => {
      const belongsToProject = Number(t.p_id || t.p) === Number(projectId);
      if (!belongsToProject) return false;
      const ids = [];
      if (t.assign_to) ids.push(Number(t.assign_to));
      if (Array.isArray(t.assignedTo)) t.assignedTo.forEach(a => a && ids.push(Number(a)));
      return ids.includes(memberUserId);
    });

    setRemoveMemberInfo({ projectId, member, assignedTasks });
    setReassignTo('');
  };

  const confirmRemoveMember = async () => {
    if (!removeMemberInfo) return;
    const { projectId, member, assignedTasks } = removeMemberInfo;

    setRemoveMemberSaving(true);
    try {
      if (assignedTasks.length > 0) {
        for (const t of assignedTasks) {
          const tid = t.t_id || t.id;
          if (!tid) continue;
          const payload = {
            title: t.title,
            description: t.desc || '',
            status: t.status,
            priority: t.priority,
            progress: t.progress ?? 0,
            assignTo: reassignTo ? Number(reassignTo) : null,
          };
          try { await taskService.updateTask(tid, payload); }
          catch (e) { console.warn(`Could not update task ${tid}:`, e); }
        }
      }

      const currentPteam = asArray(pteamEntries).filter(entry => getPteamProjectId(entry) === Number(projectId));
      const realTmId = findRealTeamMemberId(member, teamMembers, users);
      if (realTmId) {
        const entry = currentPteam.find(e => getPteamTmId(e) === realTmId);
        if (entry) {
          try { await projectTeamService.removeMemberFromProject(entry.pt_id); }
          catch (e) { console.warn('Could not remove PTeam entry:', e); }
        }
      }

      toast.success(
        reassignTo
          ? `${member.name} removed. Their tasks reassigned.`
          : `${member.name} removed. Their tasks are now unassigned.`
      );

      setRemoveMemberInfo(null);
      setReassignTo('');
      await fetchData();
    } catch (error) {
      console.error('Error removing member:', error);
      toast.error('Failed to remove member');
    } finally {
      setRemoveMemberSaving(false);
    }
  };

  if (loading) {
    return (
      <div>
        <Topbar title="All Projects" onMenuClick={onMenuClick} />
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
        title="All Projects"
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

      <div className="page-container">
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
          <button className="btn btn-primary btn-sm" onClick={openNewProject}>
            <Plus size={14} /> New Project
          </button>
        </div>

        <div className="lp-filters-container">
          <div className="lp-search-wrapper">
            <Search size={16} className="lp-search-icon" />
            <input
              className="lp-search-input"
              placeholder="Search projects by name or description..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            {search && (
              <button className="lp-search-clear" onClick={() => setSearch('')}>
                <X size={14} />
              </button>
            )}
          </div>

          <div className="lp-filter-controls">
            <div className="lp-filter-group">
              <div className="lp-filter-label">
                <Filter size={12} />
                <span>Status</span>
              </div>
              <select className="lp-filter-select" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                <option value="all">All Status</option>
                <option value="planning">📋 Planning</option>
                <option value="active">🚀 Active</option>
                <option value="on_hold">⏸ On Hold</option>
                <option value="completed">✅ Completed</option>
                <option value="cancelled">❌ Cancelled</option>
              </select>
            </div>

            <div className="lp-filter-group">
              <div className="lp-filter-label">
                <Flag size={12} />
                <span>Priority</span>
              </div>
              <select className="lp-filter-select" value={filterPriority} onChange={e => setFilterPriority(e.target.value)}>
                <option value="all">All Priority</option>
                <option value="low">🟢 Low</option>
                <option value="medium">🟡 Medium</option>
                <option value="high">🟠 High</option>
                <option value="critical">🔴 Critical</option>
              </select>
            </div>

            {(filterStatus !== 'all' || filterPriority !== 'all') && (
              <div className="lp-active-filters">
                {filterStatus !== 'all' && (
                  <span className="lp-filter-chip">
                    {filterStatus}
                    <button onClick={() => setFilterStatus('all')}><X size={12} /></button>
                  </span>
                )}
                {filterPriority !== 'all' && (
                  <span className="lp-filter-chip">
                    {filterPriority}
                    <button onClick={() => setFilterPriority('all')}><X size={12} /></button>
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="lp-results-count">
            <span>{filtered.length} project{filtered.length !== 1 ? 's' : ''}</span>
            <span className="lp-results-dot">•</span>
            <span className="lp-results-total">{projects.length} total</span>
            {filtered.length !== projects.length && (
              <button
                className="lp-clear-filters-btn"
                onClick={() => { setSearch(''); setFilterStatus('all'); setFilterPriority('all'); }}
              >
                Clear all filters
              </button>
            )}
          </div>
        </div>

        {paginatedProjects.length === 0 ? (
          <EmptyState icon={FolderOpen} title="No projects found" desc="Try adjusting filters or create a new project." />
        ) : (
          <div className="lp-projects-grid">
            {paginatedProjects.map((project, index) => {
              const projectId = project.p_id || project.id;
              const progress = getProjectProgress(projectId);
              const totalTasks = getProjectTotalTasks(projectId);
              const doneTasks = getProjectDoneTasks(projectId);
              const members = getProjectMembers(project);
              const health = progress >= 70 ? '#34d399' : progress >= 40 ? '#f59e0b' : '#f87171';
              const supervisorNames = asArray(project.supervisorMembers).map(s => s.name).join(', ') || '';

              return (
                <motion.div
                  key={project.p_id || project.id || `p-${index}`}
                  className="lp-project-card"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  onClick={() => navigate(`/supervisor/projects/${project.p_id || project.id}`)}
                >
                  <div className="lp-card-top" onClick={e => e.stopPropagation()}>
                    <div className="lp-card-badges">
                      <PriorityBadge priority={project.priority} />
                      <StatusBadge status={project.status} />
                      {asArray(project.supervisorMembers).length > 0 && (
                        <span className="lp-supervisor-badge" title={`${asArray(project.supervisorMembers).length} supervisor(s): ${supervisorNames}`}>
                          <Crown size={10} />
                          {asArray(project.supervisorMembers).length}
                        </span>
                      )}
                    </div>
                    <div className="lp-card-actions">
                      <button className="lp-icon-btn" title="View Tasks" onClick={() => setTaskListModal(project)}>
                        <ListTodo size={13} />
                      </button>
                      <button className="lp-icon-btn" title="Edit Project" onClick={() => handleEditProject(project)}>
                        <Pencil size={13} />
                      </button>
                      <button className="lp-icon-btn" title="Add Task" onClick={e => { e.stopPropagation(); openAddTask(project); }}>
                        <Plus size={13} />
                      </button>
                      <button className="lp-icon-btn danger" title="Delete Project" onClick={(e) => {
                        e.stopPropagation();
                        setDeleteProjectId(project.p_id || project.id);
                      }}>
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>

                  <div className="lp-card-body">
                    <h3 className="lp-project-name" title={project.p_name || project.name}>{project.p_name || project.name}</h3>
                    <p className="lp-project-desc">{project.desc || project.description}</p>
                  </div>

                  <div className="lp-card-body">
                    <div className="lp-progress-header">
                      <span>Progress</span>
                      <span className="lp-progress-value" style={{ color: health }}>{progress}%</span>
                    </div>
                    <div className="progress-bar">
                      <div className="progress-fill" style={{ width: `${progress}%`, background: health }} />
                    </div>
                  </div>

                  <div className="lp-card-meta">
                    <div>
                      <p className="lp-meta-label">Supervisor</p>
                      <p className="lp-meta-value">{supervisorNames || 'Not assigned'}</p>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <p className="lp-meta-label">Tasks</p>
                      <p className="lp-meta-value">{doneTasks}/{totalTasks}</p>
                    </div>
                  </div>

                  <div className="lp-card-footer">
                    <AvatarGroup members={members} max={4} />
                    {members.length > 0 && (
                      <span className="lp-member-count">
                        {members.length} member{members.length !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}

        {totalPages > 1 && (
          <div className="lp-pagination">
            <button className="btn btn-secondary btn-sm" disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)}>Prev</button>
            <span className="lp-page-info">Page {currentPage} of {totalPages}</span>
            <button className="btn btn-secondary btn-sm" disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)}>Next</button>
          </div>
        )}
      </div>

      {/* ─── TASK LIST MODAL ─── */}
      {taskListModal && !selectedTask && !editTask && (
        <div className="lp-overlay" onClick={() => { setTaskListModal(null); setEditMembersFor(null); }}>
          <div className="lp-modal lp-modal-wide" onClick={e => e.stopPropagation()}>
            <div className="lp-modal-header">
              <div>
                <h2 className="lp-modal-title"><ListTodo size={17}/> {taskListModal.p_name || taskListModal.name}</h2>
                <p className="lp-modal-sub">All tasks · click a task to view details</p>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-primary btn-sm" onClick={() => openAddTask(taskListModal)}>
                  <Plus size={13}/> Add Task
                </button>
                <button className="lp-icon-btn" onClick={() => { setTaskListModal(null); setEditMembersFor(null); }}><X size={16}/></button>
              </div>
            </div>

            <div className="lp-modal-body-split">
              <div className="lp-task-scroll">
                {asArray(tasks).filter(t => Number(t.p_id || t.p) === Number(taskListModal.p_id || taskListModal.id) && !t.is_deleted).length === 0
                  ? <p style={{ textAlign:'center', color:'var(--text-muted)', padding:'32px 0' }}>No tasks yet.</p>
                  : asArray(tasks).filter(t => Number(t.p_id || t.p) === Number(taskListModal.p_id || taskListModal.id) && !t.is_deleted).map((t, idx) => {
                      const key = t.t_id || t.id || `t-${idx}`;
                      return (
                        <div key={key} className="lp-task-row" onClick={() => setSelectedTask(t)}>
                          <div className="lp-task-info">
                            <strong className="lp-task-title">{t.title}</strong>
                            {t.milestone && <span className="lp-milestone-tag"><Milestone size={10}/>{t.milestone}</span>}
                            {(t.assignedTo || []).length > 0 && (
                              <div style={{ display:'flex', gap:4, marginTop:2 }}>
                                {getMemberObjects(Array.isArray(t.assignedTo) ? t.assignedTo : [t.assignedTo]).map((m, i) => (
                                  <span key={m.id || `a-${i}`} className="lp-task-assignee">
                                    {(m.name || '?')[0].toUpperCase()}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                          <div className="lp-task-meta">
                            <StatusBadge status={t.status}/>
                            <select className="lp-priority-select" value={t.priority}
                              onClick={e => e.stopPropagation()}
                              onChange={e => { e.stopPropagation(); changeTaskPriority(t.t_id || t.id, e.target.value); }}>
                              {PRIORITY_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
                            </select>
                            <div className="lp-mini-progress">
                              <div className="lp-mini-track"><div className="lp-mini-fill" style={{ width:`${t.progress || 0}%` }}/></div>
                              <span className="lp-mini-pct">{t.progress || 0}%</span>
                            </div>
                          </div>
                          <div className="lp-task-actions" onClick={e => e.stopPropagation()}>
                            <button className="lp-icon-btn" title="Edit" onClick={() => openEditTask(t)}>
                              <Pencil size={12}/>
                            </button>
                            <button className="lp-icon-btn danger" title="Delete" onClick={() => setDeleteTaskId(t.t_id || t.id)}>
                              <Trash2 size={12}/>
                            </button>
                          </div>
                        </div>
                      );
                    })
                }
              </div>

              <div className="lp-members-sidebar">
                {editMembersFor === (taskListModal.p_id || taskListModal.id) ? (
                  <div>
                    <div className="lp-members-panel-header" style={{ marginBottom: 10 }}>
                      <Users size={14} /><span>Edit Members</span>
                    </div>
                    <MemberPicker
                      selected={asArray(taskListModal.members).map(m => m.id)}
                      onChange={(nm) => setTaskListModal(prev => ({ ...prev, members: nm.map(id => teamMembers.find(m => m.id === id) || { id }) }))}
                      label=""
                      members={teamMembers}
                    />
                    <div style={{ display:'flex', gap:8, marginTop:12 }}>
                      <button className="btn btn-primary btn-sm" style={{ flex:1 }}
                        onClick={() => {
                          setProjects(prev => prev.map(p =>
                            (p.p_id || p.id) === (taskListModal.p_id || taskListModal.id)
                              ? { ...p, members: taskListModal.members || [] }
                              : p
                          ));
                          setEditMembersFor(null);
                          toast.success('Members updated');
                        }}>Save</button>
                      <button className="btn btn-secondary btn-sm" onClick={() => setEditMembersFor(null)}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <ProjectMembersPanel
                    members={getProjectMembers(taskListModal)}
                    onEdit={() => setEditMembersFor(taskListModal.p_id || taskListModal.id)}
                    onRemove={promptRemoveMember}
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── TASK DETAIL MODAL ─── */}
      {selectedTask && (
        <div className="lp-overlay" onClick={() => setSelectedTask(null)}>
          <div className="lp-modal" onClick={e => e.stopPropagation()}>
            <div className="lp-modal-header">
              <h2 className="lp-modal-title">{selectedTask.title}</h2>
              <button className="lp-icon-btn" onClick={() => setSelectedTask(null)}><X size={16}/></button>
            </div>
            <div className="lp-modal-body">
              <p className="lp-modal-desc">{selectedTask.desc || <em style={{ color:'var(--text-muted)' }}>No description.</em>}</p>
              <div className="lp-meta-row">
                <StatusBadge status={selectedTask.status}/>
                <PriorityBadge priority={selectedTask.priority}/>
              </div>
              {selectedTask.milestone && <div className="lp-milestone-tag lg"><Milestone size={12}/>{selectedTask.milestone}</div>}
              {(Array.isArray(selectedTask.assignedTo) ? selectedTask.assignedTo : (selectedTask.assignedTo ? [selectedTask.assignedTo] : [])).length > 0 && (
                <div style={{ marginBottom: 14 }}>
                  <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>Assigned To</p>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {getMemberObjects(Array.isArray(selectedTask.assignedTo) ? selectedTask.assignedTo : [selectedTask.assignedTo]).map((m, i) => (
                      <span key={m.id || `a-${i}`} className="lp-member-chip" style={{ cursor: 'default' }}>
                        <span className="lp-member-avatar-sm">{(m.name || '?')[0].toUpperCase()}</span>
                        {m.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              <div className="lp-progress-section">
                <div className="lp-progress-label-row">
                  <span className="lp-progress-label">Progress</span>
                  <span className="lp-progress-pct">{selectedTask.progress || 0}%</span>
                </div>
                <div className="lp-progress-track">
                  <div className="lp-progress-fill" style={{ width:`${selectedTask.progress || 0}%` }}/>
                </div>
              </div>
            </div>
            <div className="lp-modal-footer">
              <button className="btn btn-secondary btn-sm"
                onClick={() => { openEditTask(selectedTask); setSelectedTask(null); }}>
                <Pencil size={12}/> Edit
              </button>
              <button className="btn btn-danger btn-sm"
                onClick={() => { setDeleteTaskId(selectedTask.t_id || selectedTask.id); setSelectedTask(null); }}>
                <Trash2 size={12}/> Delete
              </button>
              <button className="btn btn-secondary btn-sm" onClick={() => setSelectedTask(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* ─── EDIT TASK MODAL ─── */}
      {editTask && (
        <div className="lp-overlay" onClick={closeEditTask}>
          <div className="lp-modal" onClick={e => e.stopPropagation()}>
            <div className="lp-modal-header">
              <h2 className="lp-modal-title">Edit Task</h2>
              <button className="lp-icon-btn" onClick={closeEditTask}><X size={16}/></button>
            </div>
            <div className="lp-modal-body lp-edit-form">
              <label className="lp-label">Title *</label>
              <input
                className={`input lp-input ${showEditTaskError('title') ? 'input-error' : ''}`}
                value={editTask.title}
                maxLength={LIMITS.taskTitle.max}
                onChange={e => setEditTask({ ...editTask, title: e.target.value })}
                onBlur={(e) => {
                  const t = e.target.value.trim();
                  if (t !== e.target.value) setEditTask(prev => ({ ...prev, title: t }));
                  markEditTaskTouched('title');
                }}
              />
              <FieldError message={showEditTaskError('title')} />

              <label className="lp-label">Description</label>
              <textarea
                className={`input lp-input lp-textarea ${showEditTaskError('desc') ? 'input-error' : ''}`}
                value={editTask.desc || ''}
                maxLength={LIMITS.taskDesc.max}
                onChange={e => setEditTask({ ...editTask, desc: e.target.value })}
                onBlur={() => markEditTaskTouched('desc')}
              />
              <FieldError message={showEditTaskError('desc')} />

              <div className="lp-form-2col">
                <div>
                  <label className="lp-label">Priority *</label>
                  <select className="input lp-input" value={editTask.priority}
                    onChange={e => setEditTask({ ...editTask, priority: e.target.value })}
                    onBlur={() => markEditTaskTouched('priority')}>
                    {PRIORITY_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                  <FieldError message={showEditTaskError('priority')} />
                </div>
                <div>
                  <label className="lp-label">Status *</label>
                  <select className="input lp-input" value={editTask.status}
                    onChange={e => setEditTask({ ...editTask, status: e.target.value })}
                    onBlur={() => markEditTaskTouched('status')}>
                    {TASK_STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <FieldError message={showEditTaskError('status')} />
                </div>
              </div>

              <MemberPicker
                selected={Array.isArray(editTask.assignedTo) ? editTask.assignedTo : (editTask.assignedTo ? [editTask.assignedTo] : [])}
                onChange={ids => setEditTask({ ...editTask, assignedTo: ids })}
                label="Assign To"
                members={teamMembers}
              />

              <label className="lp-label">Milestone</label>
              <input
                className={`input lp-input ${showEditTaskError('milestone') ? 'input-error' : ''}`}
                placeholder="e.g. Phase 1 Release"
                value={editTask.milestone || ''}
                maxLength={LIMITS.milestone.max}
                onChange={e => setEditTask({ ...editTask, milestone: e.target.value })}
                onBlur={() => markEditTaskTouched('milestone')}
              />
              <FieldError message={showEditTaskError('milestone')} />

              <label className="lp-label">Progress: <strong>{editTask.progress || 0}%</strong></label>
              <input type="range" min={0} max={100} className="lp-range" value={editTask.progress || 0}
                onChange={e => setEditTask({ ...editTask, progress: Number(e.target.value) })}/>
            </div>
            <div className="lp-modal-footer">
              <button className="btn btn-primary btn-sm" onClick={handleUpdateTask} disabled={savingEditTask}>
                {savingEditTask ? (<><Loader2 size={13} className="spin" /> Saving...</>) : 'Save Changes'}
              </button>
              <button className="btn btn-secondary btn-sm" onClick={closeEditTask} disabled={savingEditTask}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ─── ADD TASK MODAL ─── */}
      {taskAddModal && (
        <div className="lp-overlay" onClick={closeTaskAddModal}>
          <div className="lp-modal" onClick={e => e.stopPropagation()}>
            <div className="lp-modal-header">
              <h2 className="lp-modal-title">Add Task · {taskAddModal.p_name || taskAddModal.name}</h2>
              <button className="lp-icon-btn" onClick={closeTaskAddModal}><X size={16}/></button>
            </div>
            <div className="lp-modal-body lp-edit-form">
              <label className="lp-label">Task Title *</label>
              <input
                ref={taskTitleRef}
                className={`input lp-input ${showTaskError('title') ? 'input-error' : ''}`}
                placeholder="Enter task title"
                value={taskForm.title}
                maxLength={LIMITS.taskTitle.max}
                onChange={e => setTaskForm({ ...taskForm, title: e.target.value })}
                onBlur={(e) => {
                  const t = e.target.value.trim();
                  if (t !== e.target.value) setTaskForm(prev => ({ ...prev, title: t }));
                  markTaskTouched('title');
                }}
              />
              <FieldError message={showTaskError('title')} />

              <label className="lp-label">Description</label>
              <textarea
                className={`input lp-input lp-textarea ${showTaskError('desc') ? 'input-error' : ''}`}
                placeholder="Brief description..."
                value={taskForm.desc}
                maxLength={LIMITS.taskDesc.max}
                onChange={e => setTaskForm({ ...taskForm, desc: e.target.value })}
                onBlur={() => markTaskTouched('desc')}
              />
              <FieldError message={showTaskError('desc')} />

              <div className="lp-form-2col">
                <div>
                  <label className="lp-label">Priority *</label>
                  <select className="input lp-input" value={taskForm.priority}
                    onChange={e => setTaskForm({ ...taskForm, priority: e.target.value })}
                    onBlur={() => markTaskTouched('priority')}>
                    {PRIORITY_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                  <FieldError message={showTaskError('priority')} />
                </div>
                <div>
                  <label className="lp-label">Status *</label>
                  <select className="input lp-input" value={taskForm.status}
                    onChange={e => setTaskForm({ ...taskForm, status: e.target.value })}
                    onBlur={() => markTaskTouched('status')}>
                    {TASK_STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <FieldError message={showTaskError('status')} />
                </div>
              </div>

              <MemberPicker
                selected={taskForm.assignedTo}
                onChange={ids => setTaskForm({ ...taskForm, assignedTo: ids })}
                label="Assign Member"
                members={teamMembers}
              />

              <label className="lp-label">Milestone</label>
              <input
                className={`input lp-input ${showTaskError('milestone') ? 'input-error' : ''}`}
                placeholder="e.g. Phase 1 Release"
                value={taskForm.milestone}
                maxLength={LIMITS.milestone.max}
                onChange={e => setTaskForm({ ...taskForm, milestone: e.target.value })}
                onBlur={() => markTaskTouched('milestone')}
              />
              <FieldError message={showTaskError('milestone')} />

              <label className="lp-label">Initial Progress: <strong>{taskForm.progress}%</strong></label>
              <input type="range" min={0} max={100} className="lp-range" value={taskForm.progress}
                onChange={e => setTaskForm({ ...taskForm, progress: Number(e.target.value) })}/>
            </div>
            <div className="lp-modal-footer">
              <button className="btn btn-primary btn-sm" onClick={handleAddTask} disabled={savingTask}>
                {savingTask ? (<><Loader2 size={13} className="spin" /> Adding...</>) : 'Add Task'}
              </button>
              <button className="btn btn-secondary btn-sm" onClick={closeTaskAddModal} disabled={savingTask}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ─── REMOVE MEMBER MODAL ─── */}
      <AnimatePresence>
        {removeMemberInfo && (
          <motion.div
            className="lp-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => { if (!removeMemberSaving) { setRemoveMemberInfo(null); setReassignTo(''); } }}
          >
            <motion.div
              className="lp-modal"
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={e => e.stopPropagation()}
              style={{ maxWidth: 480 }}
            >
              <div className="lp-modal-header">
                <h2 className="lp-modal-title">
                  <UserMinus size={16} /> Remove member
                </h2>
                <button
                  className="lp-icon-btn"
                  onClick={() => { setRemoveMemberInfo(null); setReassignTo(''); }}
                  disabled={removeMemberSaving}
                >
                  <X size={16} />
                </button>
              </div>

              <div className="lp-modal-body lp-edit-form">
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>
                  Remove <strong>{removeMemberInfo.member.name}</strong> from this project?
                </p>

                {removeMemberInfo.assignedTasks.length > 0 ? (
                  <>
                    <div style={{
                      padding: '10px 12px',
                      background: 'rgba(245, 158, 11, 0.08)',
                      border: '1px solid rgba(245, 158, 11, 0.25)',
                      borderRadius: 8,
                      fontSize: 12.5,
                      color: 'var(--text-secondary)',
                    }}>
                      <AlertCircle size={12} style={{ display: 'inline', marginRight: 4, color: '#f59e0b' }} />
                      This member has <strong>{removeMemberInfo.assignedTasks.length}</strong> assigned
                      task{removeMemberInfo.assignedTasks.length !== 1 ? 's' : ''} in this project.
                    </div>

                    <div style={{ maxHeight: 120, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {removeMemberInfo.assignedTasks.map(t => (
                        <div key={t.t_id || t.id} style={{
                          fontSize: 12.5,
                          padding: '6px 10px',
                          background: 'var(--bg-secondary)',
                          border: '1px solid var(--border-subtle)',
                          borderRadius: 6,
                          color: 'var(--text-primary)',
                        }}>
                          📋 {t.title}
                        </div>
                      ))}
                    </div>

                    <label className="lp-label" style={{ marginTop: 6 }}>
                      Reassign those tasks to
                    </label>
                    <select
                      className="input lp-input"
                      value={reassignTo}
                      onChange={e => setReassignTo(e.target.value)}
                      disabled={removeMemberSaving}
                    >
                      <option value="">— Leave unassigned —</option>
                      {asArray(taskListModal?.members)
                        .filter(m => Number(m.userId ?? m.id) !== Number(removeMemberInfo.member.userId ?? removeMemberInfo.member.id))
                        .map(m => (
                          <option key={m.id} value={m.userId ?? m.id}>{m.name}</option>
                        ))
                      }
                    </select>
                    <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>
                      If you don't pick anyone, the tasks will be left unassigned.
                    </p>
                  </>
                ) : (
                  <div style={{
                    padding: '10px 12px',
                    background: 'rgba(52, 211, 153, 0.08)',
                    border: '1px solid rgba(52, 211, 153, 0.25)',
                    borderRadius: 8,
                    fontSize: 12.5,
                    color: 'var(--text-secondary)',
                  }}>
                    <Check size={12} style={{ display: 'inline', marginRight: 4, color: '#34d399' }} />
                    No tasks assigned to this member in this project.
                  </div>
                )}
              </div>

              <div className="lp-modal-footer">
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => { setRemoveMemberInfo(null); setReassignTo(''); }}
                  disabled={removeMemberSaving}
                >
                  Cancel
                </button>
                <button
                  className="btn btn-danger btn-sm"
                  onClick={confirmRemoveMember}
                  disabled={removeMemberSaving}
                >
                  {removeMemberSaving
                    ? <><Loader2 size={13} className="spin" /> Removing...</>
                    : <><Trash2 size={13} /> Remove member</>
                  }
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* DELETE TASK */}
      {deleteTaskId !== null && (
        <div className="lp-overlay" onClick={() => setDeleteTaskId(null)}>
          <div className="lp-modal lp-confirm" onClick={e => e.stopPropagation()}>
            <h3 className="lp-confirm-title">Delete Task?</h3>
            <p style={{ color:'var(--text-muted)', marginBottom:20, fontSize:13 }}>This cannot be undone.</p>
            <div className="lp-modal-footer" style={{ justifyContent:'center' }}>
              <button className="btn btn-danger btn-sm" onClick={handleDeleteTask}>Yes, Delete</button>
              <button className="btn btn-secondary btn-sm" onClick={() => setDeleteTaskId(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* DELETE PROJECT */}
      {deleteProjectId !== null && (
        <div className="lp-overlay" onClick={() => setDeleteProjectId(null)}>
          <div className="lp-modal lp-confirm" onClick={e => e.stopPropagation()}>
            <h3 className="lp-confirm-title">Delete Project?</h3>
            <p style={{ color:'var(--text-muted)', marginBottom:20, fontSize:13 }}>All tasks will also be removed.</p>
            <div className="lp-modal-footer" style={{ justifyContent:'center' }}>
              <button className="btn btn-danger btn-sm" onClick={handleDeleteProject}>Yes, Delete</button>
              <button className="btn btn-secondary btn-sm" onClick={() => setDeleteProjectId(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ─── PROJECT MODAL ─── */}
      {projectModal && (
        <div className="lp-overlay" onClick={closeProjectModal}>
          <div className="lp-modal" onClick={e => e.stopPropagation()}>
            <div className="lp-modal-header">
              <h2 className="lp-modal-title">{editProject ? 'Update Project' : 'Create New Project'}</h2>
              <button className="lp-icon-btn" onClick={closeProjectModal}><X size={16}/></button>
            </div>
            <div className="lp-modal-body lp-edit-form">
              <label className="lp-label">Project Name *</label>
              <input
                ref={projectNameRef}
                className={`input lp-input ${showProjectError('name') ? 'input-error' : ''}`}
                placeholder="Enter project name"
                value={form.name}
                maxLength={LIMITS.projectName.max}
                onChange={e => setForm({ ...form, name: e.target.value })}
                onBlur={(e) => {
                  const t = e.target.value.trim();
                  if (t !== e.target.value) setForm(prev => ({ ...prev, name: t }));
                  markProjectTouched('name');
                }}
              />
              <FieldError message={showProjectError('name')} />

              <label className="lp-label">Description</label>
              <textarea
                className={`input lp-input lp-textarea ${showProjectError('description') ? 'input-error' : ''}`}
                rows={3}
                placeholder="Write project description..."
                value={form.description}
                maxLength={LIMITS.projectDesc.max}
                onChange={e => setForm({ ...form, description: e.target.value })}
                onBlur={() => markProjectTouched('description')}
              />
              <FieldError message={showProjectError('description')} />

              <div className="lp-form-2col">
                <div>
                  <label className="lp-label">Priority *</label>
                  <select
                    className="input lp-input"
                    value={form.priority}
                    onChange={e => setForm({ ...form, priority: e.target.value })}
                    onBlur={() => markProjectTouched('priority')}
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="critical">Critical</option>
                  </select>
                  <FieldError message={showProjectError('priority')} />
                </div>
                <div>
                  <label className="lp-label">Status *</label>
                  <select
                    className="input lp-input"
                    value={form.status}
                    onChange={e => setForm({ ...form, status: e.target.value })}
                    onBlur={() => markProjectTouched('status')}
                  >
                    <option value="planning">Planning</option>
                    <option value="active">Active</option>
                    <option value="on_hold">On Hold</option>
                    <option value="completed">Completed</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                  <FieldError message={showProjectError('status')} />
                </div>
              </div>

              <div>
                <label className="lp-label">
                  <Crown size={14} style={{ display: 'inline', marginRight: 4 }} />
                  Select Supervisors <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>
                    (optional — if none selected, you'll be assigned automatically)
                  </span>
                </label>
                <div className="lp-supervisor-picker">
                  {supervisorOptions.length === 0 ? (
                    <div style={{
                      padding: '12px',
                      background: 'var(--bg-secondary)',
                      borderRadius: '8px',
                      border: '1px dashed var(--border-default)',
                      color: 'var(--text-muted)',
                      fontSize: 13,
                      textAlign: 'center'
                    }}>
                      No supervisors available.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {supervisorOptions.map(s => {
                        const isSelected = form.supervisors.includes(s.id);
                        const isCurrentUser = Number(s.id) === Number(currentUserId);
                        return (
                          <button
                            key={s.id}
                            type="button"
                            className={`lp-supervisor-chip ${isSelected ? 'selected' : ''} ${isCurrentUser ? 'current-user' : ''}`}
                            onClick={() => {
                              setForm(prev => ({
                                ...prev,
                                supervisors: isSelected
                                  ? prev.supervisors.filter(id => id !== s.id)
                                  : [...prev.supervisors, s.id]
                              }));
                            }}
                            title={isCurrentUser ? 'Toggle yourself as supervisor of this project' : undefined}
                          >
                            <span className="lp-member-avatar-sm">{(s.name || '?')[0].toUpperCase()}</span>
                            {s.name}
                            {isCurrentUser && <span className="lp-current-user-badge">(You)</span>}
                            {isSelected && <Check size={12} style={{ color: 'var(--accent-primary)' }} />}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
                <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
                  If you don't select any supervisor, you'll be assigned automatically.
                  If you select at least one, you're not required to include yourself.
                </p>
                <div style={{
                  marginTop: 8,
                  padding: '8px 12px',
                  background: form.supervisors.length > 0
                    ? 'rgba(245, 158, 11, 0.08)'
                    : 'rgba(52, 211, 153, 0.08)',
                  borderRadius: '6px',
                  fontSize: 12,
                  color: 'var(--text-secondary)'
                }}>
                  {form.supervisors.length > 0 ? (
                    <>
                      <Crown size={12} style={{ display: 'inline', marginRight: 4, color: '#f59e0b' }} />
                      {new Set(form.supervisors).size} supervisor{new Set(form.supervisors).size !== 1 ? 's' : ''} will have access
                    </>
                  ) : (
                    <>
                      <Check size={12} style={{ display: 'inline', marginRight: 4, color: '#34d399' }} />
                      You will be assigned as the supervisor automatically
                    </>
                  )}
                </div>
              </div>

              <LeadPicker
                leads={allLeads}
                assignments={leadAssignments}
                onAssign={assignLead}
                onUnassign={unassignLead}
                label={`Project Leads (${allLeads.length} available)`}
                assignedLeadIds={
                  editProject
                    ? (editProject.supervisorMembers || []).map(s => Number(s.id))
                    : []
                }
              />

              <MemberPicker
                selected={form.members}
                onChange={ids => setForm({ ...form, members: ids })}
                label={`Project Members (${memberOptions.length} available)`}
                members={memberOptions}
              />

              <div className="lp-form-2col">
                <div>
                  <label className="lp-label">Start Date</label>
                  <input
                    type="date"
                    className={`input lp-input ${showProjectError('dates') ? 'input-error' : ''}`}
                    value={form.startDate ? form.startDate.split('T')[0] : ''}
                    max={form.deadline || undefined}
                    onChange={e => setForm({ ...form, startDate: e.target.value })}
                    onBlur={() => markProjectTouched('dates')}
                  />
                </div>
                <div>
                  <label className="lp-label">Deadline</label>
                  <input
                    type="date"
                    className={`input lp-input ${showProjectError('dates') ? 'input-error' : ''}`}
                    value={form.deadline ? form.deadline.split('T')[0] : ''}
                    min={form.startDate || undefined}
                    onChange={e => setForm({ ...form, deadline: e.target.value })}
                    onBlur={() => markProjectTouched('dates')}
                  />
                </div>
              </div>
              <FieldError message={showProjectError('dates')} />
            </div>
            <div className="lp-modal-footer">
              <button className="btn btn-secondary btn-sm" onClick={closeProjectModal} disabled={savingProject}>Cancel</button>
              <button className="btn btn-primary btn-sm" onClick={handleSaveProject} disabled={savingProject}>
                {savingProject ? (
                  <><Loader2 size={13} className="spin" /> Saving...</>
                ) : (
                  editProject ? 'Update Project' : 'Create Project'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .spin { animation: spin 1s linear infinite; }
        .loading-spinner-wrapper { display: flex; justify-content: center; align-items: center; height: 400px; }
        .loading-spinner { width: 40px; height: 40px; border: 3px solid var(--border-subtle); border-top-color: var(--accent-primary); border-radius: 50%; animation: spin 0.8s linear infinite; }
        .refresh-btn { display: flex; align-items: center; gap: 6px; }
        .lp-field-error { display: flex; align-items: center; gap: 5px; font-size: 11.5px; font-weight: 500; color: #f87171; margin-top: -4px; margin-bottom: 4px; }
        .input-error { border-color: #f87171 !important; background: rgba(248, 113, 113, 0.04) !important; }
        .input-error:focus { box-shadow: 0 0 0 3px rgba(248, 113, 113, 0.12) !important; }
        .lp-supervisor-badge { display: inline-flex; align-items: center; gap: 3px; padding: 2px 7px; border-radius: 7px; font-size: 10px; font-weight: 600; background: rgba(245, 158, 11, 0.15); color: #f59e0b; border: 1px solid rgba(245, 158, 11, 0.3); }
        .lp-supervisor-picker { padding: 10px 12px; border-radius: 9px; border: 1px solid rgba(245, 158, 11, 0.25); background: rgba(245, 158, 11, 0.03); min-height: 44px; }
        .lp-supervisor-chip { display: inline-flex; align-items: center; gap: 5px; padding: 4px 10px 4px 6px; border-radius: 20px; border: 1px solid var(--border-subtle); background: var(--bg-card); color: var(--text-primary); font-size: 12px; font-weight: 500; cursor: pointer; transition: all 0.15s; }
        .lp-supervisor-chip:hover { border-color: #f59e0b; background: var(--bg-hover); }
        .lp-supervisor-chip.selected { background: rgba(245, 158, 11, 0.12); border-color: #f59e0b; }
        .lp-supervisor-chip.current-user { border-color: #34d399; background: rgba(52, 211, 153, 0.1); }
        .lp-current-user-badge { font-size: 9px; color: #34d399; font-weight: 600; }
        .lp-filters-container { display: flex; flex-direction: column; gap: 14px; margin-bottom: 24px; background: var(--bg-card); padding: 18px 20px; border-radius: 14px; border: 1px solid var(--border-subtle); transition: all 0.2s ease; }
        .lp-filters-container:focus-within { border-color: var(--accent-primary); box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.08); }
        .lp-search-wrapper { position: relative; display: flex; align-items: center; width: 100%; }
        .lp-search-icon { position: absolute; left: 14px; color: var(--text-muted); pointer-events: none; transition: color 0.2s; }
        .lp-search-wrapper:focus-within .lp-search-icon { color: var(--accent-primary); }
        .lp-search-input { width: 100%; padding: 11px 40px 11px 42px; border-radius: 10px; border: 1px solid var(--border-default); background: var(--bg-secondary); color: var(--text-primary); font-size: 13px; transition: all 0.2s ease; outline: none; }
        .lp-search-input:focus { border-color: var(--accent-primary); background: var(--bg-card); box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.08); }
        .lp-search-input::placeholder { color: var(--text-muted); }
        .lp-search-clear { position: absolute; right: 10px; display: flex; align-items: center; justify-content: center; width: 28px; height: 28px; border: none; border-radius: 50%; background: var(--bg-hover); color: var(--text-muted); cursor: pointer; transition: all 0.15s; }
        .lp-search-clear:hover { background: var(--border-default); color: var(--text-primary); }
        .lp-filter-controls { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
        .lp-filter-group { display: flex; align-items: center; gap: 8px; flex: 1; min-width: 140px; }
        .lp-filter-label { display: flex; align-items: center; gap: 4px; font-size: 11px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.04em; white-space: nowrap; }
        .lp-filter-select { flex: 1; padding: 8px 12px; border-radius: 8px; border: 1px solid var(--border-default); background: var(--bg-secondary); color: var(--text-primary); font-size: 12px; font-weight: 500; cursor: pointer; outline: none; transition: all 0.2s ease; min-width: 120px; appearance: none; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 10px center; padding-right: 32px; }
        .lp-filter-select:hover { border-color: var(--border-strong); background-color: var(--bg-hover); }
        .lp-filter-select:focus { border-color: var(--accent-primary); background-color: var(--bg-card); box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.08); }
        .lp-active-filters { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-left: auto; }
        .lp-filter-chip { display: inline-flex; align-items: center; gap: 4px; padding: 4px 10px 4px 12px; border-radius: 20px; font-size: 11px; font-weight: 600; background: var(--accent-muted); color: var(--accent-primary); border: 1px solid rgba(99, 102, 241, 0.2); white-space: nowrap; }
        .lp-filter-chip button { display: flex; align-items: center; justify-content: center; padding: 2px; border: none; border-radius: 50%; background: transparent; color: var(--accent-primary); cursor: pointer; transition: all 0.15s; }
        .lp-filter-chip button:hover { background: rgba(239, 68, 68, 0.1); color: #ef4444; }
        .lp-results-count { display: flex; align-items: center; gap: 8px; padding-top: 12px; border-top: 1px solid var(--border-subtle); font-size: 12px; color: var(--text-muted); flex-wrap: wrap; }
        .lp-results-count span { font-weight: 500; }
        .lp-results-count .lp-results-total { color: var(--text-secondary); }
        .lp-results-dot { color: var(--border-default); }
        .lp-clear-filters-btn { margin-left: auto; padding: 4px 12px; border: none; border-radius: 6px; background: var(--bg-secondary); color: var(--text-secondary); font-size: 11px; font-weight: 500; cursor: pointer; transition: all 0.15s; }
        .lp-clear-filters-btn:hover { background: var(--bg-hover); color: var(--accent-primary); }
        .lp-projects-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px; }
        .lp-project-card { padding: 0 0 14px !important; display: flex !important; flex-direction: column !important; gap: 10px !important; overflow: hidden; cursor: pointer; background: var(--bg-card); border: 1px solid var(--border-subtle); border-radius: 14px; transition: all 0.2s ease; }
        .lp-project-card:hover { border-color: var(--accent-primary); transform: translateY(-2px); box-shadow: var(--shadow-md); }
        .lp-card-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 12px 14px 0; width: 100%; box-sizing: border-box; min-width: 0; }
        .lp-card-badges { display: flex; align-items: center; gap: 5px; min-width: 0; flex: 1; overflow: hidden; flex-wrap: wrap; }
        .lp-card-badges > * { font-size: 10.5px !important; padding: 2px 7px !important; height: auto !important; line-height: 1.4 !important; border-radius: 7px !important; white-space: nowrap !important; display: inline-flex !important; align-items: center !important; gap: 3px !important; flex-shrink: 0 !important; box-sizing: border-box !important; }
        .lp-card-actions { display: flex; align-items: center; gap: 4px; flex-shrink: 0; }
        .lp-card-body { padding: 0 16px; }
        .lp-project-name { font-size: 15px; font-weight: 700; margin-bottom: 2px; color: var(--text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .lp-project-desc { font-size: 12px; color: var(--text-muted); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
        .lp-progress-header { display: flex; justify-content: space-between; font-size: 11px; margin-bottom: 4px; color: var(--text-secondary); }
        .lp-progress-value { font-weight: 600; }
        .lp-card-meta { display: flex; justify-content: space-between; font-size: 12px; padding: 0 16px; }
        .lp-meta-label { font-size: 10px; color: var(--text-muted); margin: 0; }
        .lp-meta-value { font-weight: 600; color: var(--text-primary); margin: 0; }
        .lp-card-footer { display: flex; justify-content: space-between; align-items: center; border-top: 1px solid var(--border-subtle); padding-top: 10px; margin: 0 16px; }
        .lp-member-count { font-size: 11px; color: var(--text-muted); }
        .lp-pagination { display: flex; justify-content: center; gap: 10px; margin-top: 20px; }
        .lp-page-info { padding: 6px 10px; font-size: 13px; color: var(--text-secondary); }
        .lp-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.6); backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 16px; }
        .lp-modal { background: var(--bg-card); border: 1px solid var(--border-default); border-radius: 20px; width: 100%; max-width: 520px; max-height: 90vh; overflow-y: auto; box-shadow: 0 24px 60px rgba(0,0,0,0.3); animation: lp-in 0.2s ease; scrollbar-width: thin; scrollbar-color: var(--border-default) transparent; }
        .lp-modal-wide { max-width: 800px; }
        @keyframes lp-in { from { opacity:0; transform: translateY(14px) scale(0.97); } to { opacity:1; transform: none; } }
        .lp-modal-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding: 20px 20px 14px; border-bottom: 1px solid var(--border-subtle); }
        .lp-modal-title { display: flex; align-items: center; gap: 8px; font-size: 17px; font-weight: 700; color: var(--text-primary); }
        .lp-modal-sub { font-size: 12px; color: var(--text-muted); margin-top: 3px; }
        .lp-modal-body-split { display: grid; grid-template-columns: 1fr 220px; min-height: 300px; max-height: calc(90vh - 130px); overflow: hidden; }
        .lp-modal-body { padding: 18px 20px; }
        .lp-modal-footer { display: flex; gap: 10px; padding: 14px 20px 20px; border-top: 1px solid var(--border-subtle); justify-content: flex-end; }
        .lp-modal-desc { font-size: 14px; color: var(--text-secondary); line-height: 1.6; margin-bottom: 14px; }
        .lp-task-scroll { max-height: 100%; overflow-y: auto; padding: 14px 20px; display: flex; flex-direction: column; gap: 10px; scrollbar-width: thin; scrollbar-color: var(--border-default) transparent; border-right: 1px solid var(--border-subtle); }
        .lp-task-row { display: flex; align-items: center; gap: 12px; padding: 12px 14px; border: 1px solid var(--border-subtle); border-radius: 12px; background: var(--bg-secondary); cursor: pointer; transition: border-color 0.15s, box-shadow 0.15s; flex-wrap: wrap; }
        .lp-task-row:hover { border-color: var(--accent-primary); box-shadow: 0 2px 10px rgba(0,0,0,0.08); }
        .lp-task-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
        .lp-task-title { font-size: 13px; font-weight: 600; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .lp-task-assignee { display: inline-flex; align-items: center; justify-content: center; width: 20px; height: 20px; border-radius: 50%; background: color-mix(in srgb, var(--accent-primary) 20%, transparent); color: var(--accent-primary); font-size: 10px; font-weight: 700; border: 1px solid color-mix(in srgb, var(--accent-primary) 30%, transparent); }
        .lp-task-meta { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
        .lp-task-actions { display: flex; gap: 5px; flex-shrink: 0; }
        .lp-priority-select { font-size: 11px; font-weight: 600; padding: 3px 8px; border-radius: 8px; border: 1px solid var(--border-default); background: var(--bg-card); color: var(--text-primary); cursor: pointer; outline: none; }
        .lp-priority-select:focus { border-color: var(--accent-primary); }
        .lp-mini-progress { display: flex; align-items: center; gap: 6px; }
        .lp-mini-track { width: 70px; height: 5px; background: var(--border-subtle); border-radius: 10px; overflow: hidden; }
        .lp-mini-fill { height: 100%; background: var(--accent-primary); border-radius: 10px; transition: width 0.3s; }
        .lp-mini-pct { font-size: 11px; font-weight: 700; color: var(--text-secondary); white-space: nowrap; }
        .lp-milestone-tag { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; font-weight: 600; color: var(--accent-primary); background: color-mix(in srgb, var(--accent-primary) 12%, transparent); border-radius: 7px; padding: 2px 8px; }
        .lp-milestone-tag.lg { font-size: 12px; padding: 4px 10px; margin-bottom: 12px; }
        .lp-progress-section { margin-top: 16px; }
        .lp-progress-label-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
        .lp-progress-label { font-size: 13px; font-weight: 600; color: var(--text-secondary); }
        .lp-progress-pct { font-size: 15px; font-weight: 800; color: var(--accent-primary); }
        .lp-progress-track { width: 100%; height: 10px; background: var(--border-subtle); border-radius: 10px; overflow: hidden; }
        .lp-progress-fill { height: 100%; background: linear-gradient(90deg, var(--accent-primary), color-mix(in srgb, var(--accent-primary) 60%, #a78bfa)); border-radius: 10px; transition: width 0.4s ease; }
        .lp-meta-row { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 12px; }
        .lp-edit-form { display: flex; flex-direction: column; gap: 10px; }
        .lp-label { font-size: 12px; font-weight: 600; color: var(--text-secondary); margin-bottom: 3px; display: block; }
        .lp-input { width: 100%; box-sizing: border-box; padding: 9px 12px; border-radius: 9px; font-size: 13px; background: var(--bg-secondary); border: 1px solid var(--border-default); color: var(--text-primary); }
        .lp-textarea { min-height: 80px; resize: vertical; }
        .lp-form-2col { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .lp-range { width: 100%; accent-color: var(--accent-primary); cursor: pointer; }
        .lp-confirm { max-width: 360px; text-align: center; padding-top: 28px; }
        .lp-confirm-title { font-size: 18px; font-weight: 700; color: var(--text-primary); margin-bottom: 6px; }
        .lp-icon-btn { display: inline-flex; align-items: center; justify-content: center; padding: 5px 6px; border-radius: 7px; border: 1px solid var(--border-subtle); background: var(--bg-card); color: var(--text-secondary); cursor: pointer; transition: all 0.14s; }
        .lp-icon-btn:hover { background: var(--bg-primary); color: var(--accent-primary); border-color: var(--accent-primary); }
        .lp-icon-btn.danger:hover { color: #ef4444; border-color: #ef4444; background: rgba(239,68,68,0.07); }
        .btn-danger { background: rgba(239,68,68,0.1); color: #ef4444; border: 1px solid rgba(239,68,68,0.3); }
        .btn-danger:hover { background: rgba(239,68,68,0.2); }
        .btn-secondary { background: var(--bg-secondary); color: var(--text-primary); border: 1px solid var(--border-default); }
        .btn-secondary:hover { border-color: var(--accent-primary); }
        .lp-member-trigger { display: flex; align-items: center; gap: 8px; width: 100%; min-height: 42px; padding: 8px 12px; border-radius: 9px; border: 1px solid rgba(99, 102, 241, 0.25); background: rgba(99, 102, 241, 0.03); color: var(--text-primary); cursor: pointer; text-align: left; font-size: 13px; transition: border-color 0.15s; flex-wrap: wrap; }
        .lp-member-trigger:hover, .lp-member-trigger:focus { border-color: var(--accent-primary); outline: none; }
        .lp-picker-backdrop { position: fixed; inset: 0; z-index: 10; }
        .lp-member-dropdown { position: absolute; top: calc(100% + 6px); left: 0; right: 0; background: var(--bg-card); border: 1px solid var(--border-default); border-radius: 12px; box-shadow: 0 8px 30px rgba(0,0,0,0.2); z-index: 20; overflow: hidden; max-height: 260px; overflow-y: auto; scrollbar-width: thin; scrollbar-color: var(--border-default) transparent; }
        .lp-member-option { display: flex; align-items: center; gap: 10px; width: 100%; padding: 10px 14px; border: none; background: transparent; color: var(--text-primary); cursor: pointer; transition: background 0.12s; text-align: left; }
        .lp-member-option:hover { background: var(--bg-secondary); }
        .lp-member-option.selected { background: color-mix(in srgb, var(--accent-primary) 8%, transparent); }
        .lp-member-avatar { display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; border-radius: 50%; background: color-mix(in srgb, var(--accent-primary) 20%, transparent); color: var(--accent-primary); font-size: 12px; font-weight: 700; flex-shrink: 0; }
        .lp-member-avatar-sm { display: inline-flex; align-items: center; justify-content: center; width: 20px; height: 20px; border-radius: 50%; background: color-mix(in srgb, var(--accent-primary) 20%, transparent); color: var(--accent-primary); font-size: 10px; font-weight: 700; flex-shrink: 0; }
        .lp-member-chip { display: inline-flex; align-items: center; gap: 5px; padding: 3px 8px 3px 4px; border-radius: 20px; background: color-mix(in srgb, var(--accent-primary) 12%, transparent); border: 1px solid color-mix(in srgb, var(--accent-primary) 25%, transparent); color: var(--text-primary); font-size: 12px; font-weight: 500; }
        .lp-chip-remove { display: inline-flex; align-items: center; justify-content: center; padding: 1px; border: none; background: transparent; color: var(--text-muted); cursor: pointer; border-radius: 50%; transition: color 0.12s, background 0.12s; margin-left: 2px; }
        .lp-chip-remove:hover { color: #ef4444; background: rgba(239,68,68,0.1); }
        .lp-members-sidebar { padding: 16px; overflow-y: auto; background: var(--bg-secondary); scrollbar-width: thin; scrollbar-color: var(--border-default) transparent; }
        .lp-members-panel-header { display: flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 700; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 12px; }
        .lp-members-list { display: flex; flex-direction: column; gap: 8px; }
        .lp-member-row { display: flex; align-items: center; gap: 8px; padding: 6px 8px; border-radius: 8px; background: var(--bg-card); border: 1px solid var(--border-subtle); }

        /* ─── Lead picker specific ─── */
        .lp-lead-mode-pill { font-size: 9px; font-weight: 700; padding: 1px 6px; border-radius: 8px; margin-left: 4px; text-transform: uppercase; letter-spacing: 0.3px; }
        .lp-lead-mode-pill.lead { background: rgba(245, 158, 11, 0.15); color: #f59e0b; }
        .lp-lead-mode-pill.member { background: rgba(99, 102, 241, 0.15); color: #6366f1; }
        .lp-lead-option-row { display: flex; align-items: center; gap: 8px; padding: 4px 8px 4px 0; }
        .lp-lead-option-row:hover { background: var(--bg-secondary); }
        .lp-lead-option-row .lp-member-option { padding: 8px 8px; }
        .lp-lead-existing { font-size: 10px; font-weight: 500; color: var(--text-muted); margin-left: 6px; font-style: italic; }
        .lp-lead-mode-toggle { display: inline-flex; gap: 2px; padding: 2px; background: var(--bg-secondary); border: 1px solid var(--border-subtle); border-radius: 8px; flex-shrink: 0; }
        .lp-lead-mode-btn { font-size: 10.5px; font-weight: 600; padding: 3px 10px; border: none; border-radius: 6px; background: transparent; color: var(--text-muted); cursor: pointer; transition: all 0.12s; }
        .lp-lead-mode-btn:hover { color: var(--text-primary); }
        .lp-lead-mode-btn.active { background: var(--accent-primary); color: #fff; }

        @media (max-width: 768px) {
          .lp-filters-container { padding: 14px 16px; gap: 12px; }
          .lp-filter-controls { flex-direction: column; align-items: stretch; gap: 10px; }
          .lp-filter-group { min-width: 0; }
          .lp-filter-select { min-width: 0; }
          .lp-active-filters { margin-left: 0; justify-content: flex-start; }
          .lp-results-count { padding-top: 10px; flex-wrap: wrap; }
          .lp-clear-filters-btn { margin-left: 0; }
          .lp-modal-body-split { grid-template-columns: 1fr; grid-template-rows: auto auto; }
          .lp-members-sidebar { border-top: 1px solid var(--border-subtle); }
          .lp-task-scroll { border-right: none; max-height: 300px; }
          .lp-projects-grid { grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); }
        }
        @media (max-width: 600px) {
          .lp-modal-body-split { grid-template-columns: 1fr; grid-template-rows: auto auto; }
          .lp-members-sidebar { border-top: 1px solid var(--border-subtle); }
          .lp-task-scroll { border-right: none; max-height: 300px; }
        }
        @media (max-width: 480px) {
          .lp-filters-container { padding: 12px; gap: 10px; }
          .lp-search-input { padding: 10px 36px 10px 38px; font-size: 12px; }
          .lp-filter-group { flex-direction: column; align-items: stretch; gap: 4px; }
          .lp-filter-label { font-size: 10px; }
          .lp-filter-select { padding: 7px 10px; font-size: 11px; }
          .lp-projects-grid { grid-template-columns: 1fr; }
          .lp-form-2col { grid-template-columns: 1fr; }
          .lp-task-meta { gap: 6px; }
          .lp-mini-track { width: 50px; }
          .lp-card-actions { gap: 3px; }
          .lp-icon-btn { padding: 4px 5px; }
          .lp-card-badges > * { max-width: 76px !important; font-size: 10px !important; }
        }
      `}</style>
    </div>
  );
}