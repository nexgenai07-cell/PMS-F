// components/supervisor/SupervisorLeads.jsx
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useOutletContext } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Users, FolderKanban, X, RefreshCw, UserPlus, Search,
  PlusCircle, UserCheck, AlertCircle, Loader2, UserCog,
  Briefcase, Plus, CheckCircle2, Calendar, Check    // ← add Check
} from "lucide-react";
import toast from "react-hot-toast";

import Topbar from "../shared/Topbar";
import { StatusBadge, PriorityBadge } from "../shared/UIComponents";

import projectService from "../../services/projectService";
import taskService from "../../services/taskService";
import teamService from "../../services/teamService";
import userService from "../../services/userService";
import projectTeamService from "../../services/projectTeamService";
import { useAuth } from "../../context/AuthContext";
import NotificationHelper from '../../services/notificationHelper';

/* ─────────── Validation constants ─────────── */
const LIMITS = {
  memberName:   { min: 2, max: 100 },
  memberRole:   { min: 2, max: 80 },
  qualification:{ min: 2, max: 200 },
  skills:       { min: 2, max: 500 },
  description:  { max: 2000 },
  experience:   { min: 0, max: 70 },
  taskTitle:    { min: 3, max: 200 },
  taskDesc:     { max: 2000 },
};

const NAME_REGEX  = /^[\p{L}\p{N} &\-.'()]+$/u;
const ROLE_REGEX  = /^[\p{L}\p{N} &\-.'()/]+$/u;
const TITLE_REGEX = /^[\p{L}\p{N} &\-.'(),!?]+$/u;

/* ─────────── Validators ─────────── */
const validators = {
  memberName: (v) => {
    const s = (v ?? '').trim();
    if (!s) return 'Name is required';
    if (s.length < LIMITS.memberName.min) return `At least ${LIMITS.memberName.min} characters`;
    if (s.length > LIMITS.memberName.max) return `Less than ${LIMITS.memberName.max} characters`;
    if (!NAME_REGEX.test(s)) return 'Invalid characters in name';
    return '';
  },
  memberRole: (v) => {
    const s = (v ?? '').trim();
    if (!s) return 'Role is required';
    if (s.length < LIMITS.memberRole.min) return `At least ${LIMITS.memberRole.min} characters`;
    if (s.length > LIMITS.memberRole.max) return `Less than ${LIMITS.memberRole.max} characters`;
    if (!ROLE_REGEX.test(s)) return 'Invalid characters in role';
    return '';
  },
  qualification: (v) => {
    const s = (v ?? '').trim();
    if (!s) return 'Qualification is required';
    if (s.length < LIMITS.qualification.min) return `At least ${LIMITS.qualification.min} characters`;
    if (s.length > LIMITS.qualification.max) return `Less than ${LIMITS.qualification.max} characters`;
    return '';
  },
  skills: (v) => {
    const s = (v ?? '').trim();
    if (!s) return 'Skills are required';
    if (s.length < LIMITS.skills.min) return `At least ${LIMITS.skills.min} characters`;
    if (s.length > LIMITS.skills.max) return `Less than ${LIMITS.skills.max} characters`;
    return '';
  },
  experience: (v) => {
    const s = String(v ?? '').trim();
    if (s === '') return 'Experience is required';
    const n = Number(s);
    if (Number.isNaN(n)) return 'Must be a number';
    if (!Number.isInteger(n)) return 'Must be a whole number';
    if (n < LIMITS.experience.min) return `At least ${LIMITS.experience.min}`;
    if (n > LIMITS.experience.max) return `Less than ${LIMITS.experience.max}`;
    return '';
  },
  description: (v) => {
    const s = v ?? '';
    if (s.length > LIMITS.description.max) return `Less than ${LIMITS.description.max} characters`;
    return '';
  },
  taskTitle: (v) => {
    const s = (v ?? '').trim();
    if (!s) return 'Task title is required';
    if (s.length < LIMITS.taskTitle.min) return `At least ${LIMITS.taskTitle.min} characters`;
    if (s.length > LIMITS.taskTitle.max) return `Less than ${LIMITS.taskTitle.max} characters`;
    if (!TITLE_REGEX.test(s)) return 'Invalid characters';
    return '';
  },
  taskDesc: (v) => {
    const s = v ?? '';
    if (s.length > LIMITS.taskDesc.max) return `Less than ${LIMITS.taskDesc.max} characters`;
    return '';
  },
};

function FieldError({ message }) {
  if (!message) return null;
  return (
    <div className="sl-field-error" role="alert">
      <AlertCircle size={12} />
      <span>{message}</span>
    </div>
  );
}
/* ─── Project picker — searchable, styled dropdown ─── */
/* ─── Project picker — searchable, styled dropdown (portal-safe) ─── */
function ProjectPicker({ projects = [], value, onChange, disabled = false }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [dropdownStyle, setDropdownStyle] = useState({});
  const triggerRef = useRef(null);
  const inputRef = useRef(null);

  const selected = projects.find(p => String(p.p_id || p.id) === String(value));

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter(p =>
      (p.p_name || p.name || '').toLowerCase().includes(q)
    );
  }, [projects, query]);

  // Compute dropdown position relative to viewport whenever it opens / resizes
  const updatePosition = useCallback(() => {
  if (!triggerRef.current) return;
  const rect = triggerRef.current.getBoundingClientRect();
  const spaceBelow = window.innerHeight - rect.bottom;
  const desiredHeight = 320;

  setDropdownStyle({
    position: 'fixed',
    left: rect.left,
    width: rect.width,
    top: rect.bottom + 6,          // always below
    maxHeight: Math.min(spaceBelow - 12, desiredHeight),
    zIndex: 10001,
  });
}, []);

  // Recompute on open + on window resize/scroll
  useEffect(() => {
    if (!open) return;
    updatePosition();

    const onScrollOrResize = () => updatePosition();
    window.addEventListener('resize', onScrollOrResize);
    // Capture-phase scroll catches scrolls inside the modal too
    window.addEventListener('scroll', onScrollOrResize, true);
    return () => {
      window.removeEventListener('resize', onScrollOrResize);
      window.removeEventListener('scroll', onScrollOrResize, true);
    };
  }, [open, updatePosition]);

  // Focus search input when opening
  useEffect(() => {
    if (open) {
      const t = setTimeout(() => inputRef.current?.focus(), 40);
      return () => clearTimeout(t);
    }
    setQuery('');
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open]);

  const handleSelect = (project) => {
    const id = project.p_id || project.id;
    onChange(String(id));
    setOpen(false);
  };

  const statusColor = (status) =>
    status === 'active' ? '#34d399'
      : status === 'completed' ? '#818cf8'
      : status === 'on_hold' ? '#f59e0b'
      : status === 'cancelled' ? '#f87171'
      : '#94a3b8';

  return (
    <div className="sl-picker">
      <button
        ref={triggerRef}
        type="button"
        className={`sl-picker-trigger ${open ? 'open' : ''} ${selected ? 'has-value' : ''}`}
        onClick={() => !disabled && setOpen(o => !o)}
        disabled={disabled}
      >
        {selected ? (
          <span className="sl-picker-selected" title={selected.p_name || selected.name}>
            <span className="sl-picker-dot" style={{ background: statusColor(selected.status) }} />
            <span className="sl-picker-name">{selected.p_name || selected.name}</span>
            {selected.status && (
              <span className="sl-picker-status">{selected.status}</span>
            )}
          </span>
        ) : (
          <span className="sl-picker-placeholder">Select a project...</span>
        )}
        <svg
          className={`sl-picker-chevron ${open ? 'rotate' : ''}`}
          width="14" height="14" viewBox="0 0 24 24"
          fill="none" stroke="currentColor" strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <>
          <div className="sl-picker-backdrop" onClick={() => setOpen(false)} />
          <div className="sl-picker-dropdown" style={dropdownStyle}>
            <div className="sl-picker-search">
              <Search size={14} />
              <input
                ref={inputRef}
                type="text"
                placeholder="Search projects..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && filtered.length > 0) {
                    e.preventDefault();
                    handleSelect(filtered[0]);
                  }
                }}
              />
              {query && (
                <button
                  type="button"
                  className="sl-picker-clear"
                  onClick={() => setQuery('')}
                  aria-label="Clear search"
                >
                  <X size={12} />
                </button>
              )}
            </div>

            <div className="sl-picker-list">
              {filtered.length === 0 ? (
                <div className="sl-picker-empty">
                  {query ? 'No projects match your search' : 'No projects available'}
                </div>
              ) : (
                filtered.map((p) => {
                  const id = String(p.p_id || p.id);
                  const isSelected = String(value) === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      className={`sl-picker-option ${isSelected ? 'selected' : ''}`}
                      onClick={() => handleSelect(p)}
                    >
                      <span className="sl-picker-dot" style={{ background: statusColor(p.status) }} />
                      <span className="sl-picker-option-body">
                        <span className="sl-picker-option-name" title={p.p_name || p.name}>
                          {p.p_name || p.name}
                        </span>
                        {(p.desc || p.description) && (
                          <span className="sl-picker-option-desc">
                            {p.desc || p.description}
                          </span>
                        )}
                      </span>
                      {p.status && (
                        <span className="sl-picker-status">{p.status}</span>
                      )}
                      {isSelected && (
                        <Check size={14} className="sl-picker-check" />
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
/* ─────────── Lead data aggregation ─────────── */
const getLeadData = (leadId, projects, tasks, teamMembers, users) => {
  const user = users.find(u => Number(u.id || u.u_id) === Number(leadId));

  const userProjects = projects.filter(p =>
    Number(p.created_by) === Number(leadId)
  );

  const projectIds = userProjects.map(p => Number(p.p_id || p.id));

  const teamMember = teamMembers.find(m => {
    const memberName = (m.name || '').toLowerCase().trim();
    const userName = (user?.u_name || '').toLowerCase().trim();
    return memberName === userName;
  });
  const teamMemberId = teamMember ? Number(teamMember.id) : null;

  const userTasks = tasks.filter(t => {
    const taskAssignedTo = Number(t.assign_to);
    const taskProjectId = Number(t.p_id || t.p);
    const isAssignedToLead = teamMemberId && taskAssignedTo === teamMemberId;
    const isInProject = projectIds.includes(taskProjectId);
    return isAssignedToLead || isInProject;
  });

  const completed = userTasks.filter(t => t.status === "done" || t.status === "completed").length;
  const inProgress = userTasks.filter(t => t.status === "in_progress" || t.status === "in-progress" || t.status === "review").length;
  const todo = userTasks.filter(t => t.status === "todo" || t.status === "pending" || t.status === "planning").length;

  const uniqueMemberIds = new Set();
  userTasks.forEach(t => { if (t.assign_to) uniqueMemberIds.add(Number(t.assign_to)); });
  const members = teamMembers.filter(m => uniqueMemberIds.has(Number(m.id)));

  const totalTasks = userTasks.length;
  const completionRate = totalTasks === 0 ? 0 : Math.round((completed / totalTasks) * 100);

  const performance = completionRate >= 80 ? "Excellent" :
                      completionRate >= 60 ? "Good" :
                      completionRate >= 40 ? "Average" : "Needs Attention";
  const perfColor = completionRate >= 80 ? "#34d399" :
                    completionRate >= 60 ? "#2dd4bf" :
                    completionRate >= 40 ? "#f59e0b" : "#f87171";

  return {
    user, projects: userProjects, tasks: userTasks,
    completed, inProgress, todo, members,
    uniqueMemberIds: Array.from(uniqueMemberIds),
    completionRate, performance, perfColor,
    totalTasks, teamMemberId, hasTeamMember: !!teamMemberId
  };
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
  return colors[role?.toLowerCase()] || colors.member;
};

const getInitials = (name) => {
  if (!name) return '?';
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
};

const emptyMemberForm = {
  name: '', description: '', skills: '', role: 'Member',
  qualification: '', experience: ''
};

export default function SupervisorLeads() {
  const { user } = useAuth();
  const ctx = useOutletContext?.() || {};
  const onMenuClick = ctx.onMenuClick;

  /* Data state */
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [projects, setProjects] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [teamMembers, setTeamMembers] = useState([]);
  const [users, setUsers] = useState([]);
  const [leadList, setLeadList] = useState([]);

  /* UI state */
  const [selectedLead, setSelectedLead] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterPerformance, setFilterPerformance] = useState('all');

  /* Assignment modals */
  const [showAssignProject, setShowAssignProject] = useState(false);
  const [showAssignTask, setShowAssignTask] = useState(false);
  const [showAddTeamMember, setShowAddTeamMember] = useState(false);
  const [selectedLeadForAssignment, setSelectedLeadForAssignment] = useState(null);
  const [pendingActionAfterAdd, setPendingActionAfterAdd] = useState(null);

  const [assignProjectData, setAssignProjectData] = useState({ projectId: '' });
  const [assignTaskData, setAssignTaskData] = useState({
    title: '', description: '', priority: 'medium', status: 'todo',
    projectId: '', dueDate: ''
  });
  const [teamMemberForm, setTeamMemberForm] = useState(emptyMemberForm);

  /* Touched / submit / saving */
  const [projectSubmitAttempted, setProjectSubmitAttempted] = useState(false);
  const [taskSubmitAttempted, setTaskSubmitAttempted] = useState(false);
  const [memberSubmitAttempted, setMemberSubmitAttempted] = useState(false);
  const [taskTouched, setTaskTouched] = useState({});
  const [memberTouched, setMemberTouched] = useState({});

  const [submitting, setSubmitting] = useState(false);

  const taskTitleRef = useRef(null);
  const memberNameRef = useRef(null);

  /* ─── Fetch data ─── */
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [projectsData, tasksData, membersData, usersData] = await Promise.all([
        projectService.getProjects(),
        taskService.getTasks(),
        teamService.getTeamMembers(),
        userService.getUsers(),
      ]);

      const projectsList = projectsData?.data || projectsData || [];
      const tasksList = tasksData?.data || tasksData || [];
      const membersList = membersData?.data || membersData || [];
      const usersList = usersData?.data || usersData || [];

      setProjects(projectsList);
      setTasks(tasksList);
      setTeamMembers(membersList);
      setUsers(usersList);

      const leads = usersList
        .filter(u => {
          const role = u.role?.toLowerCase() || '';
          return role === 'member' || role === 'developer' || role.includes('lead');
        })
        .map(u => Number(u.id || u.u_id));

      setLeadList(leads);
    } catch (error) {
      console.error('Error fetching leads data:', error);
      toast.error('Failed to load leads data');
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

  /* ─── Helpers ─── */
  const getTeamMemberIdForUser = (userId) => {
    const u = users.find(u => Number(u.id || u.u_id) === Number(userId));
    if (!u) return null;
    const member = teamMembers.find(m => {
      const memberName = (m.name || '').toLowerCase().trim();
      const userName = (u.u_name || '').toLowerCase().trim();
      return memberName === userName;
    });
    return member ? Number(member.id) : null;
  };

  const getUserName = (userId) => {
    const found = users.find(u => Number(u.id || u.u_id) === Number(userId));
    return found?.u_name || found?.name || 'Unknown';
  };

  /* ─── Derived validation ─── */
  const memberErrors = useMemo(() => ({
    name: validators.memberName(teamMemberForm.name),
    role: validators.memberRole(teamMemberForm.role),
    qualification: validators.qualification(teamMemberForm.qualification),
    experience: validators.experience(teamMemberForm.experience),
    skills: validators.skills(teamMemberForm.skills),
    description: validators.description(teamMemberForm.description),
  }), [teamMemberForm]);

  const taskErrors = useMemo(() => ({
    title: validators.taskTitle(assignTaskData.title),
    description: validators.taskDesc(assignTaskData.description),
  }), [assignTaskData]);

  const isMemberValid = Object.values(memberErrors).every(e => e === '');
  const isTaskValid = Object.values(taskErrors).every(e => e === '');

  const markTaskTouched = (field) => setTaskTouched(prev => ({ ...prev, [field]: true }));
  const showTaskError = (field) => {
    if (taskSubmitAttempted) return taskErrors[field];
    return taskTouched[field] ? taskErrors[field] : '';
  };

  const markMemberTouched = (field) => setMemberTouched(prev => ({ ...prev, [field]: true }));
  const showMemberError = (field) => {
    if (memberSubmitAttempted) return memberErrors[field];
    return memberTouched[field] ? memberErrors[field] : '';
  };

  /* ─── Auto-focus ─── */
  useEffect(() => {
    if (!showAssignTask) return;
    const t = setTimeout(() => taskTitleRef.current?.focus(), 60);
    return () => clearTimeout(t);
  }, [showAssignTask]);

  useEffect(() => {
    if (!showAddTeamMember) return;
    const t = setTimeout(() => memberNameRef.current?.focus(), 60);
    return () => clearTimeout(t);
  }, [showAddTeamMember]);

  /* ─── Escape to close ─── */
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      if (submitting) return;
      if (showAddTeamMember) { setShowAddTeamMember(false); return; }
      if (showAssignTask) { setShowAssignTask(false); return; }
      if (showAssignProject) { setShowAssignProject(false); return; }
      if (selectedLead) { setSelectedLead(null); return; }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showAddTeamMember, showAssignTask, showAssignProject, selectedLead, submitting]);

  /* ─── Open modals ─── */
  const openAssignProject = (leadId) => {
    setSelectedLeadForAssignment(leadId);
    setAssignProjectData({ projectId: '' });
    setProjectSubmitAttempted(false);
    setShowAssignProject(true);
    setPendingActionAfterAdd(null);
  };

  const openAssignTask = (leadId) => {
    setSelectedLeadForAssignment(leadId);
    setAssignTaskData({
      title: '', description: '', priority: 'medium', status: 'todo',
      projectId: '', dueDate: ''
    });
    setTaskTouched({});
    setTaskSubmitAttempted(false);
    setShowAssignTask(true);
    setPendingActionAfterAdd(null);
  };

  const openAddTeamMember = (leadId) => {
    const leadUser = users.find(u => Number(u.id || u.u_id) === Number(leadId));
    setSelectedLeadForAssignment(leadId);
    setTeamMemberForm({
      ...emptyMemberForm,
      name: leadUser?.u_name || '',
    });
    setMemberTouched({});
    setMemberSubmitAttempted(false);
    setShowAddTeamMember(true);
  };

  const closeAssignProject = () => {
    setShowAssignProject(false);
    setSelectedLeadForAssignment(null);
    setProjectSubmitAttempted(false);
  };
  const closeAssignTask = () => {
    setShowAssignTask(false);
    setSelectedLeadForAssignment(null);
    setTaskTouched({});
    setTaskSubmitAttempted(false);
  };
  const closeAddTeamMember = () => {
    setShowAddTeamMember(false);
    setSelectedLeadForAssignment(null);
    setMemberTouched({});
    setMemberSubmitAttempted(false);
  };

  /* ─── Add team member ─── */
  const handleAddTeamMember = async () => {
    setMemberSubmitAttempted(true);

    if (!isMemberValid) {
      toast.error('Please fix the highlighted errors before saving');
      return;
    }
    if (submitting) return;

    setSubmitting(true);
    try {
      const payload = {
        name: teamMemberForm.name.trim(),
        desc: (teamMemberForm.description || '').trim(),
        skills: teamMemberForm.skills.trim(),
        role: teamMemberForm.role.trim() || 'Member',
        qualitifcation: teamMemberForm.qualification.trim(),
        experience: parseInt(teamMemberForm.experience) || 0,
      };

      const response = await teamService.addTeamMember(payload);
      const newMember = response?.data || response;

      if (!newMember || !newMember.id) {
        toast.error('Failed to add team member');
        return;
      }

      setTeamMembers(prev => [...prev, newMember]);
      toast.success(`Team member "${payload.name}" added successfully`);
      closeAddTeamMember();

      // If we were mid-assignment, re-open the pending modal
      if (pendingActionAfterAdd === 'assignProject') {
        setPendingActionAfterAdd(null);
        const leadId = selectedLeadForAssignment;
        setTimeout(() => openAssignProject(leadId), 100);
      } else if (pendingActionAfterAdd === 'assignTask') {
        setPendingActionAfterAdd(null);
        const leadId = selectedLeadForAssignment;
        setTimeout(() => openAssignTask(leadId), 100);
      }
    } catch (error) {
      console.error('Error adding team member:', error);
      const rawMsg = error?.response?.data?.message ||
                     error?.response?.data?.detail ||
                     error?.message;
      toast.error(typeof rawMsg === 'string' ? rawMsg : 'Failed to add team member');
    } finally {
      setSubmitting(false);
    }
  };

  /* ─── Assign project ─── */
  const handleAssignProject = async () => {
    setProjectSubmitAttempted(true);

    if (!assignProjectData.projectId || !selectedLeadForAssignment) {
      toast.error('Please select a project');
      return;
    }
    if (submitting) return;

    setSubmitting(true);
    try {
      const projectId = parseInt(assignProjectData.projectId);
      const leadId = parseInt(selectedLeadForAssignment);

      const project = projects.find(p => Number(p.p_id || p.id) === projectId);
      if (!project) {
        toast.error('Project not found');
        return;
      }

      const teamMemberId = getTeamMemberIdForUser(leadId);

      if (!teamMemberId) {
        // No TeamMember for this lead → prompt to create one, then come back
        setPendingActionAfterAdd('assignProject');
        setShowAssignProject(false);
        openAddTeamMember(leadId);
        return;
      }

      // 1. Add lead to the project team (PTeam entry)
      try {
        await projectTeamService.addMemberToProject(projectId, teamMemberId);
      } catch (pteamErr) {
        // If already in project, backend may reject with 400 — that's ok
        console.warn('Could not add lead to project PTeam (may already be there):', pteamErr);
      }

      // 2. Also create a marker task assigned to the lead
      const response = await taskService.createTask({
        title: `Project Assignment: ${project.p_name || project.name}`,
        description: `Assigned to lead: ${getUserName(leadId)}`,
        status: 'todo',
        priority: 'medium',
        projectId,
        assignTo: teamMemberId,
        dueDate: null,
        startDate: null,
      });

      const newTask = response?.data || response;
      const assignee = teamMembers.find(m => Number(m.id) === Number(teamMemberId));
      const leadUser = users.find(u => Number(u.id || u.u_id) === Number(leadId));

      try {
        await NotificationHelper.taskAssigned(newTask, assignee, user, project);
        if (NotificationHelper.leadAssigned) {
          await NotificationHelper.leadAssigned(leadUser, project, user);
        }
      } catch (notifyErr) {
        console.warn('Notification failed:', notifyErr);
      }

      toast.success(`Project "${project.p_name || project.name}" assigned to ${getUserName(leadId)}`);
      closeAssignProject();
      await fetchData();
    } catch (error) {
      console.error('Error assigning project:', error);
      const rawMsg = error?.response?.data?.message ||
                     error?.response?.data?.detail ||
                     error?.message;
      toast.error(typeof rawMsg === 'string' ? rawMsg : 'Failed to assign project');
    } finally {
      setSubmitting(false);
    }
  };

  /* ─── Assign task ─── */
  const handleAssignTask = async () => {
    setTaskSubmitAttempted(true);

    if (!isTaskValid) {
      toast.error('Please fix the highlighted errors');
      return;
    }
    if (!assignTaskData.projectId || !selectedLeadForAssignment) {
      toast.error('Please select a project');
      return;
    }
    if (submitting) return;

    setSubmitting(true);
    try {
      const projectId = parseInt(assignTaskData.projectId);
      const leadId = parseInt(selectedLeadForAssignment);

      const teamMemberId = getTeamMemberIdForUser(leadId);

      if (!teamMemberId) {
        setPendingActionAfterAdd('assignTask');
        setShowAssignTask(false);
        openAddTeamMember(leadId);
        return;
      }

      const response = await taskService.createTask({
        title: assignTaskData.title.trim(),
        description: (assignTaskData.description || '').trim(),
        status: assignTaskData.status,
        priority: assignTaskData.priority,
        projectId,
        assignTo: teamMemberId,
        dueDate: assignTaskData.dueDate || null,
        startDate: null,
      });

      const newTask = response?.data || response;
      const assignee = teamMembers.find(m => Number(m.id) === Number(teamMemberId));
      const project = projects.find(p => Number(p.p_id || p.id) === projectId);

      try {
        await NotificationHelper.taskAssigned(newTask, assignee, user, project);
      } catch (notifyErr) {
        console.warn('Notification failed:', notifyErr);
      }

      toast.success(`Task "${assignTaskData.title.trim()}" assigned to ${getUserName(leadId)}`);
      closeAssignTask();
      await fetchData();
    } catch (error) {
      console.error('Error assigning task:', error);
      const rawMsg = error?.response?.data?.message ||
                     error?.response?.data?.detail ||
                     error?.message;
      toast.error(typeof rawMsg === 'string' ? rawMsg : 'Failed to assign task');
    } finally {
      setSubmitting(false);
    }
  };

  /* ─── Filter leads ─── */
  const filteredLeads = leadList.filter(leadId => {
    const d = getLeadData(leadId, projects, tasks, teamMembers, users);
    const nameMatch = d.user?.u_name?.toLowerCase().includes(searchTerm.toLowerCase()) || false;
    const perfMatch = filterPerformance === 'all' || d.performance.toLowerCase() === filterPerformance.toLowerCase();
    return nameMatch && perfMatch;
  });

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

  const leadsWithProfile = leadList.filter(id => getLeadData(id, projects, tasks, teamMembers, users).hasTeamMember).length;
  const leadsWithoutProfile = leadList.length - leadsWithProfile;

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
              <span className="leads-stat-value">{leadList.length}</span>
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
            {filteredLeads.map((leadId) => {
              const d = getLeadData(leadId, projects, tasks, teamMembers, users);
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
                      <span>Completion</span>
                      <span style={{ color: d.perfColor, fontWeight: 700 }}>{d.completionRate}%</span>
                    </div>
                    <div className="lead-progress-bar">
                      <div className="lead-progress-fill" style={{ width: `${d.completionRate}%`, background: d.perfColor }} />
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
                    </div>
                    <div className="lead-card-actions">
                      {!d.hasTeamMember && (
                        <button
                          className="lead-action-btn"
                          onClick={(e) => { e.stopPropagation(); openAddTeamMember(leadId); }}
                          title="Add Team Member"
                          style={{ color: '#f59e0b' }}
                        >
                          <UserCog size={14} />
                        </button>
                      )}
                      <button
                        className="lead-action-btn"
                        onClick={(e) => { e.stopPropagation(); openAssignProject(leadId); }}
                        title="Assign Project"
                        style={{ color: '#818cf8' }}
                      >
                        <FolderKanban size={14} />
                      </button>
                      <button
                        className="lead-action-btn"
                        onClick={(e) => { e.stopPropagation(); openAssignTask(leadId); }}
                        title="Assign Task"
                        style={{ color: '#34d399' }}
                      >
                        <PlusCircle size={14} />
                      </button>
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
          const d = getLeadData(selectedLead, projects, tasks, teamMembers, users);
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
                      <span>Completion Rate</span>
                      <span style={{ color: d.perfColor, fontWeight: 700 }}>{d.completionRate}%</span>
                    </div>
                    <div className="modal-progress-bar">
                      <div className="modal-progress-fill" style={{ width: `${d.completionRate}%`, background: d.perfColor }} />
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
                            {p.desc && <span className="modal-project-desc">{p.desc || p.description}</span>}
                          </div>
                          <div className="modal-project-badges">
                            <StatusBadge status={p.status} />
                            <PriorityBadge priority={p.priority} />
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  <div className="modal-actions">
                    <button className="modal-action-btn primary" onClick={() => { setSelectedLead(null); openAssignProject(selectedLead); }}>
                      <FolderKanban size={14} /> Assign Project
                    </button>
                    <button className="modal-action-btn primary" onClick={() => { setSelectedLead(null); openAssignTask(selectedLead); }}>
                      <PlusCircle size={14} /> Assign Task
                    </button>
                    {!d.hasTeamMember && (
                      <button className="modal-action-btn success" onClick={() => { setSelectedLead(null); openAddTeamMember(selectedLead); }}>
                        <UserCog size={14} /> Add Team Member
                      </button>
                    )}
                  </div>
                </div>
              </motion.div>
            </motion.div>
          );
        })()}
      </AnimatePresence>

      {/* ─── ASSIGN PROJECT MODAL ─── */}
      <AnimatePresence>
        {showAssignProject && (
          <motion.div className="modal-overlay"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => !submitting && closeAssignProject()}>
            <motion.div className="modal-content"
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.95 }}
              transition={{ type: 'spring', damping: 25 }}
              onClick={(e) => e.stopPropagation()}>

              <div className="modal-header">
                <h2 className="modal-name">Assign Project</h2>
                <button className="modal-close-btn" onClick={closeAssignProject} disabled={submitting}>
                  <X size={20} />
                </button>
              </div>

              <div className="modal-body">
  <p className="sl-modal-hint">
    Assign a project to <strong>{getUserName(selectedLeadForAssignment)}</strong>.
    The lead will be added to the project team and receive a project assignment task.
  </p>

  <div className="sl-field">
    <label className="sl-label">Project <span className="sl-required">*</span></label>
    <ProjectPicker
  projects={projects}
  value={assignTaskData.projectId}
  onChange={(id) => setAssignTaskData({ ...assignTaskData, projectId: id })}
  disabled={submitting}
/>
    {projectSubmitAttempted && !assignProjectData.projectId && (
      <FieldError message="Please select a project" />
    )}
  </div>
</div>

              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={closeAssignProject} disabled={submitting}>
                  Cancel
                </button>
                <button className="btn btn-primary" onClick={handleAssignProject} disabled={submitting}>
                  {submitting ? <><Loader2 size={14} className="spin" /> Assigning...</> : 'Assign Project'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── ASSIGN TASK MODAL ─── */}
      <AnimatePresence>
        {showAssignTask && (
          <motion.div className="modal-overlay"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => !submitting && closeAssignTask()}>
            <motion.div className="modal-content"
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.95 }}
              transition={{ type: 'spring', damping: 25 }}
              onClick={(e) => e.stopPropagation()}>

              <div className="modal-header">
                <h2 className="modal-name">Assign Task</h2>
                <button className="modal-close-btn" onClick={closeAssignTask} disabled={submitting}>
                  <X size={20} />
                </button>
              </div>

              <div className="modal-body">
                <div className="sl-field">
                  <label className="sl-label">Task Title <span className="sl-required">*</span></label>
                  <input
                    ref={taskTitleRef}
                    className={`sl-input ${showTaskError('title') ? 'sl-input-error' : ''}`}
                    placeholder="e.g. Implement login flow"
                    value={assignTaskData.title}
                    maxLength={LIMITS.taskTitle.max}
                    onChange={(e) => setAssignTaskData({ ...assignTaskData, title: e.target.value })}
                    onBlur={() => markTaskTouched('title')}
                    disabled={submitting}
                  />
                  <FieldError message={showTaskError('title')} />
                </div>

                <div className="sl-field">
                  <label className="sl-label">Description</label>
                  <textarea
                    className={`sl-input ${showTaskError('description') ? 'sl-input-error' : ''}`}
                    placeholder="Brief description of the task"
                    value={assignTaskData.description}
                    maxLength={LIMITS.taskDesc.max}
                    onChange={(e) => setAssignTaskData({ ...assignTaskData, description: e.target.value })}
                    onBlur={() => markTaskTouched('description')}
                    style={{ minHeight: 80, resize: 'vertical' }}
                    disabled={submitting}
                  />
                  <FieldError message={showTaskError('description')} />
                </div>

                <div className="sl-form-2col">
                  <div className="sl-field">
                    <label className="sl-label">Priority</label>
                    <select
                      className="sl-input"
                      value={assignTaskData.priority}
                      onChange={(e) => setAssignTaskData({ ...assignTaskData, priority: e.target.value })}
                      disabled={submitting}
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                      <option value="critical">Critical</option>
                    </select>
                  </div>

                  <div className="sl-field">
                    <label className="sl-label">Status</label>
                    <select
                      className="sl-input"
                      value={assignTaskData.status}
                      onChange={(e) => setAssignTaskData({ ...assignTaskData, status: e.target.value })}
                      disabled={submitting}
                    >
                      <option value="todo">To Do</option>
                      <option value="in_progress">In Progress</option>
                      <option value="review">In Review</option>
                      <option value="done">Done</option>
                    </select>
                  </div>
                </div>

                <div className="sl-field">
                  <label className="sl-label">Project <span className="sl-required">*</span></label>
                  <select
                    className="sl-input"
                    value={assignTaskData.projectId}
                    onChange={(e) => setAssignTaskData({ ...assignTaskData, projectId: e.target.value })}
                    disabled={submitting}
                  >
                    <option value="">Select a project...</option>
                    {projects.map(p => (
                      <option key={p.p_id || p.id} value={p.p_id || p.id}>
                        {p.p_name || p.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="sl-field">
                  <label className="sl-label">Due Date</label>
                  <input
                    type="date"
                    className="sl-input"
                    value={assignTaskData.dueDate}
                    onChange={(e) => setAssignTaskData({ ...assignTaskData, dueDate: e.target.value })}
                    disabled={submitting}
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={closeAssignTask} disabled={submitting}>
                  Cancel
                </button>
                <button className="btn btn-primary" onClick={handleAssignTask} disabled={submitting}>
                  {submitting ? <><Loader2 size={14} className="spin" /> Assigning...</> : 'Assign Task'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── ADD TEAM MEMBER MODAL ─── */}
      <AnimatePresence>
        {showAddTeamMember && (
          <motion.div className="modal-overlay"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => !submitting && closeAddTeamMember()}>
            <motion.div className="modal-content"
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.95 }}
              transition={{ type: 'spring', damping: 25 }}
              onClick={(e) => e.stopPropagation()}>

              <div className="modal-header">
                <h2 className="modal-name">Add Team Member</h2>
                <button className="modal-close-btn" onClick={closeAddTeamMember} disabled={submitting}>
                  <X size={20} />
                </button>
              </div>

              <div className="modal-body">
                <p className="modal-empty" style={{ textAlign: 'left' }}>
                  Create a TeamMember profile so <strong>{getUserName(selectedLeadForAssignment)}</strong> can be
                  assigned to projects and tasks.
                </p>

                <div className="sl-field">
                  <label className="sl-label">Name <span className="sl-required">*</span></label>
                  <input
                    ref={memberNameRef}
                    className={`sl-input ${showMemberError('name') ? 'sl-input-error' : ''}`}
                    placeholder="Full name"
                    value={teamMemberForm.name}
                    maxLength={LIMITS.memberName.max}
                    onChange={(e) => setTeamMemberForm({ ...teamMemberForm, name: e.target.value })}
                    onBlur={() => markMemberTouched('name')}
                    disabled={submitting}
                  />
                  <FieldError message={showMemberError('name')} />
                </div>

                <div className="sl-field">
                  <label className="sl-label">Role <span className="sl-required">*</span></label>
                  <input
                    className={`sl-input ${showMemberError('role') ? 'sl-input-error' : ''}`}
                    placeholder="e.g. Frontend Developer"
                    value={teamMemberForm.role}
                    maxLength={LIMITS.memberRole.max}
                    onChange={(e) => setTeamMemberForm({ ...teamMemberForm, role: e.target.value })}
                    onBlur={() => markMemberTouched('role')}
                    disabled={submitting}
                  />
                  <FieldError message={showMemberError('role')} />
                </div>

                <div className="sl-field">
                  <label className="sl-label">Qualification <span className="sl-required">*</span></label>
                  <input
                    className={`sl-input ${showMemberError('qualification') ? 'sl-input-error' : ''}`}
                    placeholder="e.g. BS Computer Science"
                    value={teamMemberForm.qualification}
                    maxLength={LIMITS.qualification.max}
                    onChange={(e) => setTeamMemberForm({ ...teamMemberForm, qualification: e.target.value })}
                    onBlur={() => markMemberTouched('qualification')}
                    disabled={submitting}
                  />
                  <FieldError message={showMemberError('qualification')} />
                </div>

                <div className="sl-field">
                  <label className="sl-label">Years of Experience <span className="sl-required">*</span></label>
                  <input
                    type="number"
                    min={LIMITS.experience.min}
                    max={LIMITS.experience.max}
                    className={`sl-input ${showMemberError('experience') ? 'sl-input-error' : ''}`}
                    placeholder="e.g. 3"
                    value={teamMemberForm.experience}
                    onChange={(e) => setTeamMemberForm({ ...teamMemberForm, experience: e.target.value })}
                    onBlur={() => markMemberTouched('experience')}
                    disabled={submitting}
                  />
                  <FieldError message={showMemberError('experience')} />
                </div>

                <div className="sl-field">
                  <label className="sl-label">Skills <span className="sl-required">*</span></label>
                  <input
                    className={`sl-input ${showMemberError('skills') ? 'sl-input-error' : ''}`}
                    placeholder="React, Node.js, MongoDB"
                    value={teamMemberForm.skills}
                    maxLength={LIMITS.skills.max}
                    onChange={(e) => setTeamMemberForm({ ...teamMemberForm, skills: e.target.value })}
                    onBlur={() => markMemberTouched('skills')}
                    disabled={submitting}
                  />
                  <FieldError message={showMemberError('skills')} />
                </div>

                <div className="sl-field">
                  <label className="sl-label">Short Description</label>
                  <textarea
                    className={`sl-input ${showMemberError('description') ? 'sl-input-error' : ''}`}
                    placeholder="Brief description"
                    value={teamMemberForm.description}
                    maxLength={LIMITS.description.max}
                    onChange={(e) => setTeamMemberForm({ ...teamMemberForm, description: e.target.value })}
                    onBlur={() => markMemberTouched('description')}
                    style={{ minHeight: 70, resize: 'vertical' }}
                    disabled={submitting}
                  />
                  <FieldError message={showMemberError('description')} />
                </div>
              </div>

              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={closeAddTeamMember} disabled={submitting}>
                  Cancel
                </button>
                <button className="btn btn-primary" onClick={handleAddTeamMember} disabled={submitting}>
                  {submitting ? <><Loader2 size={14} className="spin" /> Adding...</> : 'Add Team Member'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .spin { animation: spin 1s linear infinite; }

        /* ─── STATS ─── */
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

        /* ─── FILTERS ─── */
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

        /* ─── GRID ─── */
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
        .lead-card-actions { display: flex; gap: 4px; }
        .lead-action-btn {
          display: inline-flex; align-items: center; justify-content: center;
          padding: 4px; border-radius: 6px;
          border: 1px solid var(--border-subtle);
          background: var(--bg-secondary);
          color: var(--text-secondary);
          cursor: pointer;
          transition: all 0.14s;
        }
        .lead-action-btn:hover {
          background: var(--bg-primary);
          border-color: var(--accent-primary);
          color: var(--accent-primary);
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

        /* ─── MODAL ─── */
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
        .modal-close-btn:disabled { opacity: 0.5; cursor: not-allowed; }
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
        .modal-actions {
          display: flex; gap: 8px; flex-wrap: wrap;
          padding-top: 8px;
          border-top: 1px solid var(--border-subtle);
        }
        .modal-action-btn {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 8px 14px; border-radius: 8px;
          font-size: 12px; font-weight: 600;
          border: none; cursor: pointer;
          transition: all 0.15s;
        }
        .modal-action-btn.primary {
          background: var(--accent-primary); color: #fff;
        }
        .modal-action-btn.primary:hover { opacity: 0.85; }
        .modal-action-btn.success {
          background: #34d399; color: #fff;
        }
        .modal-action-btn.success:hover { opacity: 0.85; }

        .modal-footer {
          display: flex; gap: 10px; justify-content: flex-end;
          padding: 14px 24px 20px;
          border-top: 1px solid var(--border-subtle);
          background: var(--bg-card);
          border-radius: 0 0 18px 18px;
        }

        /* ─── FORM FIELDS ─── */
        .sl-field { display: flex; flex-direction: column; gap: 4px; }
        .sl-label {
          font-size: 12px; font-weight: 600;
          color: var(--text-secondary);
        }
        .sl-required { color: #f87171; margin-left: 2px; }
        .sl-input {
          padding: 9px 12px;
          border-radius: 8px;
          border: 1px solid var(--border-default);
          background: var(--bg-secondary);
          color: var(--text-primary);
          font-size: 13px;
          font-family: inherit;
          outline: none;
          transition: all 0.2s;
          width: 100%;
          box-sizing: border-box;
        }
        .sl-input:focus {
          border-color: var(--accent-primary);
          background: var(--bg-card);
          box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.08);
        }
        .sl-input:disabled { opacity: 0.6; }
        .sl-input-error {
          border-color: #f87171 !important;
          background: rgba(248, 113, 113, 0.04) !important;
        }
        .sl-input-error:focus {
          box-shadow: 0 0 0 3px rgba(248, 113, 113, 0.12) !important;
        }
        .sl-field-error {
          display: flex; align-items: center; gap: 4px;
          font-size: 11.5px; font-weight: 500;
          color: #f87171;
          margin-top: 2px;
        }
        .sl-form-2col {
          display: grid; grid-template-columns: 1fr 1fr; gap: 12px;
        }

        /* ─── RESPONSIVE ─── */
        @media (max-width: 768px) {
          .leads-stats { grid-template-columns: 1fr 1fr 1fr; }
          .leads-grid { grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); }
          .modal-stats { grid-template-columns: repeat(3, 1fr); }
          .modal-content { max-width: 100%; border-radius: 14px; max-height: 95vh; }
          .sl-form-2col { grid-template-columns: 1fr; }
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
          /* ─── PROJECT PICKER ─── */
.sl-picker {
  position: relative;
  width: 100%;
}

.sl-picker-trigger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  min-height: 42px;
  padding: 9px 12px;
  border-radius: 9px;
  border: 1px solid var(--border-default);
  background: var(--bg-secondary);
  color: var(--text-primary);
  font-size: 13px;
  font-family: inherit;
  cursor: pointer;
  text-align: left;
  transition: border-color 0.15s, background 0.15s, box-shadow 0.15s;
}

.sl-picker-trigger:hover:not(:disabled) {
  border-color: var(--border-strong);
  background: var(--bg-hover);
}

.sl-picker-trigger.open,
.sl-picker-trigger:focus-visible {
  outline: none;
  border-color: var(--accent-primary);
  background: var(--bg-card);
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.08);
}

.sl-picker-trigger.has-value {
  background: var(--bg-card);
}

.sl-picker-trigger:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.sl-picker-placeholder {
  color: var(--text-muted);
  font-size: 13px;
}

.sl-picker-selected {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex: 1;
}

.sl-picker-name {
  font-weight: 500;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}

.sl-picker-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
  box-shadow: 0 0 0 3px rgba(0, 0, 0, 0.04);
}

.sl-picker-status {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  padding: 2px 7px;
  border-radius: 20px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-subtle);
  color: var(--text-secondary);
  flex-shrink: 0;
}

.sl-picker-chevron {
  flex-shrink: 0;
  color: var(--text-muted);
  transition: transform 0.2s;
}
.sl-picker-chevron.rotate {
  transform: rotate(180deg);
}

.sl-picker-backdrop {
  position: fixed;
  inset: 0;
  z-index: 10000;
}

.sl-picker-dropdown {
  /* position/size/z-index are set inline by the component */
  background: var(--bg-card);
  border: 1px solid var(--border-default);
  border-radius: 12px;
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.28);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  animation: sl-picker-in 0.15s ease;
}

@keyframes sl-picker-in {
  from { opacity: 0; transform: translateY(-4px); }
  to   { opacity: 1; transform: translateY(0); }
}

.sl-picker-search {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--border-subtle);
  background: var(--bg-card);
  color: var(--text-muted);
  position: sticky;
  top: 0;
  z-index: 2;
}

.sl-picker-search input {
  flex: 1;
  border: none;
  background: transparent;
  outline: none;
  font-size: 13px;
  color: var(--text-primary);
  font-family: inherit;
  padding: 0;
  min-width: 0;
}

.sl-picker-search input::placeholder {
  color: var(--text-muted);
}

.sl-picker-clear {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border: none;
  border-radius: 50%;
  background: var(--bg-hover);
  color: var(--text-muted);
  cursor: pointer;
  transition: all 0.15s;
  flex-shrink: 0;
}
.sl-picker-clear:hover {
  background: var(--border-default);
  color: var(--text-primary);
}

.sl-picker-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 6px;
  scrollbar-width: thin;
  scrollbar-color: var(--border-default) transparent;
}
.sl-picker-list::-webkit-scrollbar { width: 6px; }
.sl-picker-list::-webkit-scrollbar-thumb {
  background: var(--border-default);
  border-radius: 10px;
}

.sl-picker-option {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 10px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--text-primary);
  cursor: pointer;
  text-align: left;
  transition: background 0.12s;
  font-family: inherit;
}

.sl-picker-option:hover {
  background: var(--bg-secondary);
}

.sl-picker-option.selected {
  background: color-mix(in srgb, var(--accent-primary) 10%, transparent);
}

.sl-picker-option-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.sl-picker-option-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}

.sl-picker-option-desc {
  font-size: 11.5px;
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}

.sl-picker-check {
  color: var(--accent-primary);
  flex-shrink: 0;
}

.sl-picker-empty {
  padding: 24px 16px;
  text-align: center;
  font-size: 13px;
  color: var(--text-muted);
}

/* Modal hint text */
.sl-modal-hint {
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.6;
  padding: 0;
  margin: 0;
}
.sl-modal-hint strong {
  color: var(--text-primary);
  font-weight: 700;
}
      `}</style>
    </div>
  );
}