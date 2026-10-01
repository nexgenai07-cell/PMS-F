// components/supervisor/SupervisorTeams.jsx
import { useState, useEffect, useMemo, useRef } from 'react';
import {
  Search, UserPlus, Trash2, Pencil, X, RefreshCw, Users,
  Briefcase, GraduationCap, TrendingUp, Mail, Award,
  CheckCircle2, Clock, AlertCircle, Loader2,
  Activity, BarChart3, Gauge, Target, ClipboardList, Flame
} from 'lucide-react';
import { useOutletContext } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';

import Topbar from '../shared/Topbar';
import { ProgressRing } from '../shared/UIComponents';
import teamService from '../../services/teamService';
import taskService from '../../services/taskService';
import userService from '../../services/userService';
import projectTeamService from '../../services/projectTeamService';
import { useAuth } from '../../context/AuthContext';

/* ─────────── Roles that are NOT team members ─────────── */
const NON_MEMBER_ROLES = ['lead', 'member', 'manager', 'admin', 'supervisor'];

/* ─────────── Validation constants ─────────── */
const LIMITS = {
  name:          { min: 2, max: 100 },
  role:          { min: 2, max: 80 },
  email:         { max: 254 },
  qualification: { min: 2, max: 200 },
  skills:        { min: 2, max: 500 },
  description:   { max: 2000 },
  experience:    { min: 0, max: 70 },
};

const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
const NAME_REGEX  = /^[\p{L}\p{N} &\-.'()]+$/u;
const ROLE_REGEX  = /^[\p{L}\p{N} &\-.'()/]+$/u;

const validators = {
  name: (value) => {
    const v = (value ?? '').trim();
    if (!v) return 'Name is required';
    if (v.length < LIMITS.name.min) return `Name must be at least ${LIMITS.name.min} characters`;
    if (v.length > LIMITS.name.max) return `Name must be less than ${LIMITS.name.max} characters`;
    if (!NAME_REGEX.test(v)) return "Name can only contain letters, numbers, spaces and  & - . ' ( )";
    return '';
  },
  role: (value) => {
    const v = (value ?? '').trim();
    if (!v) return 'Role is required';
    if (v.length < LIMITS.role.min) return `Role must be at least ${LIMITS.role.min} characters`;
    if (v.length > LIMITS.role.max) return `Role must be less than ${LIMITS.role.max} characters`;
    if (!ROLE_REGEX.test(v)) return 'Role contains invalid characters';
    return '';
  },
  email: (value) => {
    const v = (value ?? '').trim();
    if (!v) return 'Email is required';
    if (v.length > LIMITS.email.max) return `Email must be less than ${LIMITS.email.max} characters`;
    if (!EMAIL_REGEX.test(v)) return 'Please enter a valid email address';
    return '';
  },
  qualification: (value) => {
    const v = (value ?? '').trim();
    if (!v) return 'Qualification is required';
    if (v.length < LIMITS.qualification.min) return `Qualification must be at least ${LIMITS.qualification.min} characters`;
    if (v.length > LIMITS.qualification.max) return `Qualification must be less than ${LIMITS.qualification.max} characters`;
    return '';
  },
  experience: (value) => {
    const v = String(value ?? '').trim();
    if (v === '') return 'Experience is required';
    const n = Number(v);
    if (Number.isNaN(n)) return 'Experience must be a number';
    if (!Number.isInteger(n)) return 'Experience must be a whole number';
    if (n < LIMITS.experience.min) return `Experience must be at least ${LIMITS.experience.min}`;
    if (n > LIMITS.experience.max) return `Experience must be less than ${LIMITS.experience.max} years`;
    return '';
  },
  skills: (value) => {
    const v = (value ?? '').trim();
    if (!v) return 'Skills are required';
    if (v.length < LIMITS.skills.min) return `Please add at least ${LIMITS.skills.min} characters of skills`;
    if (v.length > LIMITS.skills.max) return `Skills must be less than ${LIMITS.skills.max} characters`;
    return '';
  },
  description: (value) => {
    const v = value ?? '';
    if (v.length > LIMITS.description.max) return `Description must be less than ${LIMITS.description.max} characters`;
    const BLOCKED = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u202A-\u202E]/;
    if (BLOCKED.test(v)) return 'Description contains invalid characters';
    return '';
  },
};

/* ─────────── Task & date helpers (single source of truth) ─────────── */
const norm = (s) => (s || '').toString().toLowerCase().trim();
const isDone    = (t) => ['done', 'completed'].includes(norm(t.status));
const isActive  = (t) => ['in_progress', 'in-progress', 'review'].includes(norm(t.status));
const isTodo    = (t) => ['todo', 'pending', ''].includes(norm(t.status));
const assigneeOf = (t) => Number(t.assign_to ?? t.assignedTo ?? NaN);
const dueOf      = (t) => t.due_date || t.deadline || null;
const updatedOf  = (t) => t.updated_at || t.update_last || null;

const clampProgress = (t) => {
  const p = Number(t.progress);
  if (Number.isFinite(p)) return Math.max(0, Math.min(100, Math.round(p)));
  if (isDone(t)) return 100;
  if (norm(t.status) === 'review') return 75;
  if (isActive(t)) return 50;
  return 0;
};

const daysUntil = (d) => {
  if (!d) return null;
  const date = new Date(d);
  if (isNaN(date.getTime())) return null;
  return Math.ceil((date.getTime() - Date.now()) / 86400000);
};

const formatDate = (d) => {
  if (!d) return null;
  const date = new Date(d);
  if (isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

const formatRelative = (d) => {
  if (!d) return null;
  const date = new Date(d);
  if (isNaN(date.getTime())) return null;
  const mins = Math.floor((Date.now() - date.getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  const wks = Math.floor(days / 7);
  if (wks < 5) return `${wks}w ago`;
  return formatDate(d);
};

const statusLabel = (s) => {
  const v = norm(s);
  if (['done', 'completed'].includes(v)) return 'Done';
  if (v === 'review') return 'In Review';
  if (['in_progress', 'in-progress'].includes(v)) return 'In Progress';
  if (['todo', 'pending'].includes(v)) return 'To Do';
  return s || 'Unknown';
};

const statusColor = (s) => {
  const v = norm(s);
  if (['done', 'completed'].includes(v)) return '#34d399';
  if (v === 'review') return '#a78bfa';
  if (['in_progress', 'in-progress'].includes(v)) return '#818cf8';
  return '#f59e0b';
};

/* ─────────── Inline error ─────────── */
function FieldError({ message }) {
  if (!message) return null;
  return (
    <div className="lt-field-error" role="alert">
      <AlertCircle size={12} />
      <span>{message}</span>
    </div>
  );
}

/* ─────────── KPI card for insights panel ─────────── */
function KpiCard({ icon, tint, value, label, sub, valueColor, bar, barColor }) {
  return (
    <div className="lt-insight-card">
      <div className="lt-insight-top">
        <span className="lt-insight-icon" style={{ background: `${tint}1f`, color: tint }}>{icon}</span>
      </div>
      <div className="lt-insight-value" style={valueColor ? { color: valueColor } : undefined}>{value}</div>
      <div className="lt-insight-label">{label}</div>
      {sub && <div className="lt-insight-sub">{sub}</div>}
      {typeof bar === 'number' && (
        <div className="lt-mini-bar">
          <span style={{ width: `${Math.min(100, Math.max(0, bar))}%`, background: barColor || tint }} />
        </div>
      )}
    </div>
  );
}

const defaultForm = {
  name: '', role: '', qualification: '', experience: '',
  skills: '', email: '', description: ''
};

/* ─────────── Compute per-member task stats from REAL task list ─────────── */
function computeTaskStatsForMember(memberId, allTasks) {
  const numId = Number(memberId);
  const memberTasks = (allTasks || []).filter(t => assigneeOf(t) === numId);

  const doneTasks = memberTasks.filter(isDone);
  const totalTasks = memberTasks.length;
  const completedTasks = doneTasks.length;
  const inProgressTasks = memberTasks.filter(isActive).length;
  const todoTasks = memberTasks.filter(isTodo).length;
  const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
  const avgProgress = totalTasks > 0
    ? Math.round(memberTasks.reduce((sum, t) => sum + clampProgress(t), 0) / totalTasks)
    : 0;

  // On-time: only judgeable tasks (completed + due date + completion timestamp)
  let completedWithDue = 0, onTimeCount = 0;
  doneTasks.forEach(t => {
    const due = dueOf(t);
    const doneAt = updatedOf(t) || t.created_at;
    if (!due || !doneAt) return;
    completedWithDue++;
    if (new Date(doneAt) <= new Date(due)) onTimeCount++;
  });
  const onTimeRate = completedWithDue > 0 ? Math.round((onTimeCount / completedWithDue) * 100) : 0;

  // Overdue / due soon (unfinished tasks only)
  let overdueTasks = 0, dueSoonTasks = 0;
  memberTasks.forEach(t => {
    if (isDone(t)) return;
    const dl = daysUntil(dueOf(t));
    if (dl === null) return;
    if (dl < 0) overdueTasks++;
    else if (dl <= 7) dueSoonTasks++;
  });

  // Real timestamps: last activity & completed this month
  let lastActivity = null;
  memberTasks.forEach(t => {
    const ts = updatedOf(t) || t.created_at;
    if (ts && (!lastActivity || new Date(ts) > lastActivity)) lastActivity = new Date(ts);
  });
  const monthStart = new Date();
  monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
  const completedThisMonth = doneTasks.filter(t => {
    const ts = updatedOf(t) || t.created_at;
    return ts && new Date(ts) >= monthStart;
  }).length;

  return {
    totalTasks, completedTasks, inProgressTasks, todoTasks,
    completionRate, avgProgress, onTimeRate, completedWithDue,
    overdueTasks, dueSoonTasks, lastActivity, completedThisMonth,
    projectsCount: new Set(memberTasks.map(t => Number(t.p_id || t.p)).filter(Boolean)).size,
    tasks: memberTasks,
  };
}

export default function SupervisorTeams() {
  const { user } = useAuth();
  const { onMenuClick } = useOutletContext();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [members, setMembers] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [users, setUsers] = useState([]);
  const [memberStatsMap, setMemberStatsMap] = useState({});

  const [search, setSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [filterRole, setFilterRole] = useState('all');
  const [filterExperience, setFilterExperience] = useState('all');
  const [sortBy, setSortBy] = useState('name');
  const itemsPerPage = 6;

  const [showAdd, setShowAdd] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [selected, setSelected] = useState(null);
  const [drawer, setDrawer] = useState(null);

  const [form, setForm] = useState(defaultForm);
  const [formTouched, setFormTouched] = useState({});
  const [formSubmitAttempted, setFormSubmitAttempted] = useState(false);
  const [savingForm, setSavingForm] = useState(false);

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(null);
  const [memberToDelete, setMemberToDelete] = useState(null);
  const [assignedTasks, setAssignedTasks] = useState([]);
  const [reassignTarget, setReassignTarget] = useState('');
  const [deleteOption, setDeleteOption] = useState('reassign');
  const [isDeleting, setIsDeleting] = useState(false);

  const addNameRef = useRef(null);
  const editNameRef = useRef(null);

  const colors = ['#818cf8', '#34d399', '#f87171', '#f59e0b', '#2dd4bf', '#f97316', '#ec4899', '#a78bfa'];

  /* ─────────── Data fetch ─────────── */
  useEffect(() => { fetchData(); }, []);
  useEffect(() => { setCurrentPage(1); }, [search, filterRole, filterExperience, sortBy]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [membersData, tasksData, usersData] = await Promise.all([
        teamService.getTeamMembers(),
        taskService.getTasks(),
        userService.getUsers(),
      ]);

      let rawMembers = membersData?.data || membersData || [];
      const tasksList = tasksData?.data || tasksData || [];
      const usersList = usersData?.data || usersData || [];
      if (!Array.isArray(rawMembers)) rawMembers = [];

      // Only show real team members (exclude leads/supervisors/admins)
      const activeMembers = rawMembers.filter(m => m.is_deleted !== 1);
      const filteredMembers = activeMembers.filter(m => {
        const memberName = (m.name || '').toLowerCase().trim();
        const memberEmail = (m.email || '').toLowerCase().trim();
        const linkedUser = usersList.find(u => {
          const uEmail = (u.email || '').toLowerCase().trim();
          const uName = (u.u_name || u.name || '').toLowerCase().trim();
          if (memberEmail && uEmail && memberEmail === uEmail) return true;
          if (memberName && uName && memberName === uName) return true;
          return false;
        });
        if (!linkedUser) return true;
        return !NON_MEMBER_ROLES.includes((linkedUser.role || '').toLowerCase());
      });

      setMembers(filteredMembers);
      setTasks(tasksList);
      setUsers(usersList);

      // Local stats from real tasks, enriched with backend stats when available
      const mergedStats = {};
      await Promise.all(filteredMembers.map(async (member) => {
        const local = computeTaskStatsForMember(member.id, tasksList);
        let stats = local;
        try {
          const response = await teamService.getTeamMemberStats(member.id);
          const backend = response?.data || response || {};
          stats = { ...local };
          const KNOWN = ['totalTasks', 'completedTasks', 'inProgressTasks', 'todoTasks',
                         'completionRate', 'onTimeRate', 'avgProgress', 'projectsCount'];
          KNOWN.forEach(k => {
            if (backend?.[k] != null && backend[k] !== '') {
              const n = Number(backend[k]);
              if (Number.isFinite(n)) stats[k] = n;
            }
          });
        } catch { /* keep local stats */ }
        mergedStats[Number(member.id)] = stats;
      }));

      setMemberStatsMap(mergedStats);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Failed to load team members');
      setMembers([]); setTasks([]); setUsers([]); setMemberStatsMap({});
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    toast.success('Team members refreshed');
  };

  /* ─────────── Helpers ─────────── */
  const removeMemberFromAllProjects = async (memberId) => {
    try {
      const pteamData = await projectTeamService.getProjectTeams();
      const pteamList = pteamData?.data || pteamData || [];
      const memberEntries = pteamList.filter(entry => Number(entry.tm) === Number(memberId));
      for (const entry of memberEntries) {
        if (entry.pt_id) await projectTeamService.removeMemberFromProject(entry.pt_id);
      }
      return memberEntries.length;
    } catch (error) {
      console.error('Error removing member from projects:', error);
      return 0;
    }
  };

  const getMemberStats = (memberId) => {
    const numId = Number(memberId);
    return memberStatsMap[numId] || computeTaskStatsForMember(numId, tasks);
  };

  const getTasksForMember = (memberId) => getMemberStats(memberId).tasks || [];

  const getMemberName = (memberId) => {
    const member = members.find(m => Number(m.id) === Number(memberId));
    return member ? member.name : 'Unknown';
  };

  const getUserById = (id) => users.find(u => Number(u.id ?? u.u_id) === Number(id));

  const getInitials = (name) => {
    if (!name) return '?';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  /* ─────────── LIVE team insights — computed from real tasks & members ─────────── */
  const teamInsights = useMemo(() => {
    const memberIds = new Set(members.map(m => Number(m.id)));
    const teamTasks = (tasks || []).filter(t => memberIds.has(assigneeOf(t)));

    const doneTasks = teamTasks.filter(isDone);
    const activeTasks = teamTasks.filter(isActive);
    const todoTasks = teamTasks.filter(isTodo);
    const totalTasks = teamTasks.length;
    const completionRate = totalTasks ? Math.round((doneTasks.length / totalTasks) * 100) : 0;

    let onTimeSample = 0, onTimeCount = 0;
    doneTasks.forEach(t => {
      const due = dueOf(t);
      const doneAt = updatedOf(t) || t.created_at;
      if (!due || !doneAt) return;
      onTimeSample++;
      if (new Date(doneAt) <= new Date(due)) onTimeCount++;
    });
    const onTimeRate = onTimeSample ? Math.round((onTimeCount / onTimeSample) * 100) : 0;

    let overdueTasks = 0, dueSoonTasks = 0;
    teamTasks.forEach(t => {
      if (isDone(t)) return;
      const dl = daysUntil(dueOf(t));
      if (dl === null) return;
      if (dl < 0) overdueTasks++;
      else if (dl <= 7) dueSoonTasks++;
    });

    const statsOf = (id) => memberStatsMap[Number(id)] || computeTaskStatsForMember(id, tasks);

    const workload = members.map(m => {
      const s = statsOf(m.id);
      return {
        id: m.id, name: m.name,
        active: s.inProgressTasks, total: s.totalTasks,
        completionRate: s.completionRate, onTimeRate: s.onTimeRate,
        overdue: s.overdueTasks,
      };
    }).sort((a, b) => b.active - a.active || b.total - a.total);

    const membersWithTasks = workload.filter(w => w.total > 0).length;
    const availableCount = workload.filter(w => w.active === 0).length;
    const maxActive = Math.max(1, ...workload.map(w => w.active));

    const eligible = workload.filter(w => w.total >= 2);
    const topPerformer = eligible.length
      ? eligible.reduce((best, w) =>
          (w.completionRate > best.completionRate ||
           (w.completionRate === best.completionRate && w.onTimeRate > best.onTimeRate)) ? w : best)
      : null;

    const skillMap = {};
    members.forEach(m => (m.skills || '').split(',').forEach(raw => {
      const s = raw.trim();
      if (!s) return;
      const key = s.toLowerCase();
      if (!skillMap[key]) skillMap[key] = { name: s, count: 0 };
      skillMap[key].count++;
    }));
    const topSkills = Object.values(skillMap).sort((a, b) => b.count - a.count).slice(0, 8);

    return {
      totalTasks, doneCount: doneTasks.length, activeCount: activeTasks.length, todoCount: todoTasks.length,
      completionRate, onTimeRate, onTimeSample, overdueTasks, dueSoonTasks,
      workload, membersWithTasks, availableCount, maxActive, topPerformer,
      topSkills, distinctSkills: Object.keys(skillMap).length,
    };
  }, [members, tasks, memberStatsMap]);

  /* ─────────── Form validation ─────────── */
  const formErrors = useMemo(() => ({
    name: validators.name(form.name),
    role: validators.role(form.role),
    email: validators.email(form.email),
    qualification: validators.qualification(form.qualification),
    experience: validators.experience(form.experience),
    skills: validators.skills(form.skills),
    description: validators.description(form.description),
  }), [form]);

  const isFormValid = Object.values(formErrors).every(e => e === '');

  const markFormTouched = (field) => setFormTouched(prev => ({ ...prev, [field]: true }));
  const showFormError = (field) => {
    if (formSubmitAttempted) return formErrors[field];
    return formTouched[field] ? formErrors[field] : '';
  };

  const resetFormState = () => {
    setForm(defaultForm);
    setFormTouched({});
    setFormSubmitAttempted(false);
  };

  /* ─────────── Add member ─────────── */
  const handleAdd = async () => {
    setFormSubmitAttempted(true);
    if (!isFormValid) { toast.error('Please fix the highlighted errors before saving'); return; }

    const addedBy = user?.id ?? user?.u_id;
    if (addedBy == null) {
      toast.error('Could not identify your account. Please re-login.');
      return;
    }

    try {
      setSavingForm(true);
      const { name, role, email, qualification, experience, skills, description } = form;
      const response = await teamService.addTeamMember({
        name: name.trim(),
        role: role.trim(),
        email: email.trim().toLowerCase(),
        qualification: qualification.trim(),
        experience: parseInt(experience) || 0,
        skills: skills.trim(),
        description: description.trim(),
        added_by: addedBy,
      });

      const newMember = response?.data || response;
      if (newMember && newMember.id) {
        setMembers(prev => [newMember, ...prev]);
        setMemberStatsMap(prev => ({
          ...prev,
          [Number(newMember.id)]: computeTaskStatsForMember(newMember.id, tasks),
        }));
        setShowAdd(false);
        resetFormState();
        toast.success(`Team member "${name.trim()}" added successfully`);
      } else {
        toast.error('Failed to add team member');
      }
    } catch (error) {
      console.error('Error adding member:', error);
      const rawMsg = error?.response?.data?.message || error?.response?.data?.detail || error?.message;
      toast.error(typeof rawMsg === 'string' ? rawMsg : 'Failed to add team member');
    } finally {
      setSavingForm(false);
    }
  };

  /* ─────────── Edit member ─────────── */
  const openEdit = (member) => {
    setSelected(member);
    setForm({
      name: member.name || '',
      role: member.role || '',
      email: member.email || '',
      qualification: member.qualification || member.qualitifcation || '',
      experience: member.experience ?? '',
      skills: member.skills || '',
      description: member.description || member.desc || ''
    });
    setFormTouched({});
    setFormSubmitAttempted(false);
    setShowEdit(true);
  };

  const handleUpdate = async () => {
    setFormSubmitAttempted(true);
    if (!isFormValid) { toast.error('Please fix the highlighted errors before saving'); return; }

    try {
      setSavingForm(true);
      const { name, role, email, qualification, experience, skills, description } = form;
      const response = await teamService.updateTeamMember(selected.id, {
        name: name.trim(),
        role: role.trim(),
        email: email.trim(),
        qualification: qualification.trim(),
        experience: parseInt(experience) || 0,
        skills: skills.trim(),
        description: description.trim()
      });
      const updatedMember = response?.data || response;
      setMembers(members.map(m => Number(m.id) === Number(selected.id) ? updatedMember : m));
      setShowEdit(false);
      setSelected(null);
      resetFormState();
      toast.success('Member updated successfully');
    } catch (error) {
      console.error('Error updating member:', error);
      const rawMsg = error?.response?.data?.message || error?.response?.data?.detail || error?.message;
      toast.error(typeof rawMsg === 'string' ? rawMsg : 'Failed to update member');
    } finally {
      setSavingForm(false);
    }
  };

  const handleFormChange = (e) => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
  };
  const handleFormBlur = (field) => markFormTouched(field);

  const closeAddModal = () => { setShowAdd(false); resetFormState(); };
  const closeEditModal = () => { setShowEdit(false); setSelected(null); resetFormState(); };

  /* ─────────── Delete flow ─────────── */
  const handleDeleteClick = (member) => {
    setMemberToDelete(member);
    setAssignedTasks(getTasksForMember(member.id));
    setReassignTarget('');
    setDeleteOption('reassign');
    setShowDeleteConfirm(true);
  };

  const deleteMemberEverywhere = async () => {
    await removeMemberFromAllProjects(memberToDelete.id);
    await teamService.deleteTeamMember(memberToDelete.id);
    setMembers(prev => prev.filter(m => Number(m.id) !== Number(memberToDelete.id)));
    setMemberStatsMap(prev => {
      const newMap = { ...prev };
      delete newMap[Number(memberToDelete.id)];
      return newMap;
    });
  };

  const handleDeleteWithReassign = async () => {
    if (!memberToDelete) return;
    setIsDeleting(true);
    try {
      if (deleteOption === 'reassign' && reassignTarget) {
        const targetMemberId = parseInt(reassignTarget);
        for (const task of assignedTasks) {
          await taskService.updateTask(task.t_id || task.id, {
            title: task.title, description: task.desc, status: task.status,
            priority: task.priority, progress: task.progress, assignTo: targetMemberId,
          });
        }
        toast.success(`Reassigned ${assignedTasks.length} tasks to ${getMemberName(targetMemberId)}`);
      } else if (deleteOption === 'park') {
        for (const task of assignedTasks) {
          await taskService.updateTask(task.t_id || task.id, {
            title: task.title, description: task.desc, status: task.status,
            priority: task.priority, progress: task.progress, assignTo: null,
          });
        }
        toast.success(`Unassigned ${assignedTasks.length} tasks (parked)`);
      }

      await deleteMemberEverywhere();
      await fetchData();
      setShowDeleteConfirm(null);
      const deletedName = memberToDelete.name;
      setMemberToDelete(null);
      setAssignedTasks([]);
      setReassignTarget('');
      toast.success(`Member "${deletedName}" removed successfully`);
    } catch (error) {
      console.error('Error during deletion/reassignment:', error);
      const rawMsg = error?.response?.data?.message || error?.response?.data?.detail || error?.message;
      toast.error(typeof rawMsg === 'string' ? rawMsg : 'Failed to process member deletion');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDelete = async () => {
    if (assignedTasks.length === 0) {
      try {
        setIsDeleting(true);
        await deleteMemberEverywhere();
        await fetchData();
        setShowDeleteConfirm(null);
        const deletedName = memberToDelete.name;
        setMemberToDelete(null);
        toast.success(`Member "${deletedName}" removed successfully`);
      } catch (error) {
        console.error('Error deleting member:', error);
        const rawMsg = error?.response?.data?.message || error?.response?.data?.detail || error?.message;
        toast.error(typeof rawMsg === 'string' ? rawMsg : 'Failed to delete member');
      } finally {
        setIsDeleting(false);
      }
    } else {
      handleDeleteWithReassign();
    }
  };

  /* ─────────── Escape to close ─────────── */
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      if (isDeleting) return;
      if (showDeleteConfirm) { setShowDeleteConfirm(null); return; }
      if (showEdit) { closeEditModal(); return; }
      if (showAdd) { closeAddModal(); return; }
      if (drawer) { setDrawer(null); return; }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showDeleteConfirm, showEdit, showAdd, drawer, isDeleting]);

  /* ─────────── Auto-focus ─────────── */
  useEffect(() => {
    if (!showAdd) return;
    const t = setTimeout(() => addNameRef.current?.focus(), 60);
    return () => clearTimeout(t);
  }, [showAdd]);

  useEffect(() => {
    if (!showEdit) return;
    const t = setTimeout(() => editNameRef.current?.focus(), 60);
    return () => clearTimeout(t);
  }, [showEdit]);

  /* ─────────── Filtering / sorting ─────────── */
  const filtered = members.filter(m => {
    const skills = (m.skills || '').toLowerCase();
    const name = (m.name || '').toLowerCase();
    const role = (m.role || '').toLowerCase();
    const experience = m.experience || 0;
    const q = search.toLowerCase();

    const searchMatch = name.includes(q) || role.includes(q) || skills.includes(q);
    const roleMatch = filterRole === 'all' || role.includes(filterRole.toLowerCase());

    let expMatch = true;
    if (filterExperience === '0-1') expMatch = experience >= 0 && experience <= 1;
    else if (filterExperience === '2-4') expMatch = experience >= 2 && experience <= 4;
    else if (filterExperience === '5+') expMatch = experience >= 5;

    return searchMatch && roleMatch && expMatch;
  });

  const sortedMembers = [...filtered].sort((a, b) => {
    if (sortBy === 'name') return a.name?.localeCompare(b.name || '') || 0;
    if (sortBy === 'role') return a.role?.localeCompare(b.role || '') || 0;
    if (sortBy === 'experience') return (b.experience || 0) - (a.experience || 0);
    if (sortBy === 'tasks') {
      return (getMemberStats(b.id).totalTasks || 0) - (getMemberStats(a.id).totalTasks || 0);
    }
    if (sortBy === 'performance') {
      const sa = getMemberStats(a.id), sb = getMemberStats(b.id);
      return (sb.completionRate || 0) - (sa.completionRate || 0) ||
             (sb.onTimeRate || 0) - (sa.onTimeRate || 0);
    }
    return 0;
  });

  const totalPages = Math.ceil(sortedMembers.length / itemsPerPage);
  const paginatedMembers = sortedMembers.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const otherMembers = memberToDelete
    ? members.filter(m => Number(m.id) !== Number(memberToDelete.id))
    : [];

  /* ─────────── Loading ─────────── */
  if (loading) {
    return (
      <div>
        <Topbar title="Team Members" onMenuClick={onMenuClick} />
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

  return (
    <div>
      <Topbar
        title="Team Members"
        onMenuClick={onMenuClick}
        actions={
          <>
            <button className="btn btn-secondary btn-sm" onClick={handleRefresh} disabled={refreshing}>
              <RefreshCw size={14} className={refreshing ? 'spin' : ''} />
              {refreshing ? 'Refreshing...' : 'Refresh'}
            </button>
            <button className="btn btn-primary btn-sm" onClick={() => setShowAdd(true)}>
              <UserPlus size={14} /> Add Member
            </button>
          </>
        }
      />

      <div className="page-container">

        {/* ═══════════ LIVE TEAM INSIGHTS ═══════════ */}
        <div className="lt-insights">
          <div className="lt-insights-header">
            <span className="lt-live-dot" />
            <span className="lt-insights-title"><Activity size={13} /> Team Insights</span>
            <span className="lt-insights-sub">Live — computed from your teams' real tasks</span>
          </div>

          <div className="lt-insight-grid">
            <KpiCard
              icon={<Users size={15} />} tint="#818cf8"
              value={members.length} label="Team Members"
              sub={`${teamInsights.membersWithTasks} with tasks · ${teamInsights.availableCount} idle`}
            />
            <KpiCard
              icon={<ClipboardList size={15} />} tint="#2dd4bf"
              value={teamInsights.totalTasks} label="Tasks Tracked"
              sub={`${teamInsights.activeCount} active · ${teamInsights.todoCount} to do`}
            />
            <KpiCard
              icon={<Target size={15} />} tint="#34d399"
              value={`${teamInsights.completionRate}%`} label="Completion Rate"
              sub={`${teamInsights.doneCount} completed`}
              bar={teamInsights.completionRate} barColor="#34d399"
            />
            <KpiCard
              icon={<Clock size={15} />} tint="#f59e0b"
              value={teamInsights.onTimeSample ? `${teamInsights.onTimeRate}%` : '—'}
              label="On-Time Delivery"
              sub={teamInsights.onTimeSample
                ? `based on ${teamInsights.onTimeSample} dated completion${teamInsights.onTimeSample > 1 ? 's' : ''}`
                : 'no dated completions yet'}
            />
            <KpiCard
              icon={<Flame size={15} />} tint={teamInsights.overdueTasks > 0 ? '#f87171' : '#34d399'}
              value={teamInsights.overdueTasks} label="Overdue Tasks"
              valueColor={teamInsights.overdueTasks > 0 ? '#f87171' : '#34d399'}
              sub={teamInsights.overdueTasks > 0
                ? `${teamInsights.dueSoonTasks} more due within 7 days`
                : 'All clear'}
            />
          </div>

          <div className="lt-insight-split">
            {/* Task distribution — real counts */}
            <div className="lt-panel">
              <div className="lt-panel-title"><BarChart3 size={13} /> Task Distribution</div>
              {teamInsights.totalTasks === 0 ? (
                <div className="lt-empty-note">No tasks are assigned to team members yet.</div>
              ) : (
                <>
                  <div className="lt-stackbar">
                    {teamInsights.doneCount > 0 && <span style={{ flexGrow: teamInsights.doneCount, flexBasis: 0, background: '#34d399' }} />}
                    {teamInsights.activeCount > 0 && <span style={{ flexGrow: teamInsights.activeCount, flexBasis: 0, background: '#818cf8' }} />}
                    {teamInsights.todoCount > 0 && <span style={{ flexGrow: teamInsights.todoCount, flexBasis: 0, background: '#f59e0b' }} />}
                  </div>
                  <div className="lt-legend">
                    <span className="lt-legend-item"><span className="lt-legend-dot" style={{ background: '#34d399' }} /> Done <b>{teamInsights.doneCount}</b></span>
                    <span className="lt-legend-item"><span className="lt-legend-dot" style={{ background: '#818cf8' }} /> In Progress <b>{teamInsights.activeCount}</b></span>
                    <span className="lt-legend-item"><span className="lt-legend-dot" style={{ background: '#f59e0b' }} /> To Do <b>{teamInsights.todoCount}</b></span>
                  </div>
                </>
              )}
            </div>

            {/* Workload balance — real per-member counts */}
            <div className="lt-panel">
              <div className="lt-panel-title">
                <Gauge size={13} /> Workload Balance
                {teamInsights.topPerformer && (
                  <span className="lt-top-performer">
                    <Award size={11} /> Top: {teamInsights.topPerformer.name.split(' ')[0]} · {teamInsights.topPerformer.completionRate}%
                  </span>
                )}
              </div>
              {teamInsights.workload.length === 0 ? (
                <div className="lt-empty-note">No members to show.</div>
              ) : (
                <div className="lt-workload-list">
                  {teamInsights.workload.slice(0, 6).map(w => {
                    const fillPct = Math.round((w.active / teamInsights.maxActive) * 100);
                    const fillColor = w.active >= 5 ? '#f87171' : w.active >= 3 ? '#f59e0b' : '#34d399';
                    return (
                      <div className="lt-workload-row" key={`wl-${w.id}`}>
                        <span className="lt-workload-name" title={w.name}>{w.name}</span>
                        <div className="lt-workload-track">
                          <span className="lt-workload-fill" style={{
                            width: `${w.active > 0 ? Math.max(6, fillPct) : 0}%`,
                            background: w.active > 0 ? fillColor : 'transparent',
                          }} />
                        </div>
                        {w.active >= 5
                          ? <span className="lt-load-badge danger">Overloaded</span>
                          : w.active === 0
                            ? <span className="lt-load-badge ok">Available</span>
                            : <span className="lt-load-badge">{w.active} active</span>}
                      </div>
                    );
                  })}
                  {teamInsights.workload.length > 6 && (
                    <div className="lt-empty-note">+{teamInsights.workload.length - 6} more members</div>
                  )}
                </div>
              )}
            </div>
          </div>

          {teamInsights.topSkills.length > 0 && (
            <div className="lt-panel">
              <div className="lt-panel-title">
                <GraduationCap size={13} /> Skill Coverage
                <span className="lt-panel-sub">{teamInsights.distinctSkills} distinct skills across all teams</span>
              </div>
              <div className="lt-skill-coverage">
                {teamInsights.topSkills.map(s => (
                  <span key={s.name.toLowerCase()} className="lt-skill-chip">
                    {s.name}<span className="lt-skill-count">{s.count}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Filters */}
        <div className="lt-filters-container">
          <div className="lt-search-wrapper">
            <Search size={16} className="lt-search-icon" />
            <input
              className="lt-search-input"
              placeholder="Search members by name, role, or skills..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            {search && (
              <button className="lt-search-clear" onClick={() => setSearch('')}>
                <X size={14} />
              </button>
            )}
          </div>

          <div className="lt-filter-controls">
            <div className="lt-filter-group">
              <div className="lt-filter-label"><Briefcase size={12} /><span>Role</span></div>
              <select className="lt-filter-select" value={filterRole} onChange={e => setFilterRole(e.target.value)}>
                <option value="all">All Roles</option>
                <option value="frontend">🎨 Frontend</option>
                <option value="backend">⚙️ Backend</option>
                <option value="full stack">🔄 Full Stack</option>
                <option value="designer">✏️ Designer</option>
                <option value="developer">💻 Developer</option>
                <option value="qa">🧪 QA</option>
                <option value="devops">🔧 DevOps</option>
              </select>
            </div>

            <div className="lt-filter-group">
              <div className="lt-filter-label"><GraduationCap size={12} /><span>Experience</span></div>
              <select className="lt-filter-select" value={filterExperience} onChange={e => setFilterExperience(e.target.value)}>
                <option value="all">All Experience</option>
                <option value="0-1">🌱 0-1 yrs</option>
                <option value="2-4">🌿 2-4 yrs</option>
                <option value="5+">🌳 5+ yrs</option>
              </select>
            </div>

            <div className="lt-filter-group">
              <div className="lt-filter-label"><TrendingUp size={12} /><span>Sort</span></div>
              <select className="lt-filter-select" value={sortBy} onChange={e => setSortBy(e.target.value)}>
                <option value="name">By Name</option>
                <option value="role">By Role</option>
                <option value="experience">By Experience</option>
                <option value="tasks">By Tasks</option>
                <option value="performance">By Performance</option>
              </select>
            </div>

            {(filterRole !== 'all' || filterExperience !== 'all') && (
              <div className="lt-active-filters">
                {filterRole !== 'all' && (
                  <span className="lt-filter-chip">
                    {filterRole}
                    <button onClick={() => setFilterRole('all')}><X size={12} /></button>
                  </span>
                )}
                {filterExperience !== 'all' && (
                  <span className="lt-filter-chip">
                    {filterExperience} yrs
                    <button onClick={() => setFilterExperience('all')}><X size={12} /></button>
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="lt-results-count">
            <span>{sortedMembers.length} member{sortedMembers.length !== 1 ? 's' : ''}</span>
            <span className="lt-results-dot">•</span>
            <span className="lt-results-total">{members.length} total</span>
            {sortedMembers.length !== members.length && (
              <button
                className="lt-clear-filters-btn"
                onClick={() => { setSearch(''); setFilterRole('all'); setFilterExperience('all'); setSortBy('name'); }}
              >
                Clear all filters
              </button>
            )}
          </div>
        </div>

        {/* Members Grid */}
        <div className="members-grid">
          {paginatedMembers.length === 0 ? (
            <div className="members-empty">
              <Users size={48} style={{ marginBottom: 12, opacity: 0.3 }} />
              <h3>No team members found</h3>
              <p>Try adjusting your filters or add a new member</p>
            </div>
          ) : (
            paginatedMembers.map((member, i) => {
              const memberId = member.id;
              const stats = getMemberStats(memberId);
              const color = member.avatar_color || colors[i % colors.length];
              const skills = member.skills || '';
              const initials = getInitials(member.name);
              const completionRate = stats.completionRate || 0;
              const totalTasks = stats.totalTasks || 0;
              const completedTasks = stats.completedTasks || 0;
              const inProgressTasks = stats.inProgressTasks || 0;
              const overdue = stats.overdueTasks || 0;
              const dueSoon = stats.dueSoonTasks || 0;

              return (
                <motion.div
                  key={memberId || `member-${i}`}
                  className="member-card"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  whileHover={{ y: -4 }}
                  onClick={() => setDrawer(member)}
                >
                  <div className="member-card-actions">
                    <button className="member-action-btn" onClick={(e) => { e.stopPropagation(); openEdit(member); }} title="Edit">
                      <Pencil size={13} />
                    </button>
                    <button className="member-action-btn danger" onClick={(e) => { e.stopPropagation(); handleDeleteClick(member); }} title="Delete">
                      <Trash2 size={13} />
                    </button>
                  </div>

                  <div className="member-avatar-wrapper">
                    <div className="member-avatar" style={{ background: `${color}22`, borderColor: `${color}40`, color }}>
                      {initials}
                    </div>
                    {/* Status dot reflects real state: red if overdue */}
                    <div className="member-status-dot" style={{ background: overdue > 0 ? '#f87171' : completionRate >= 50 ? '#34d399' : '#f59e0b' }} />
                  </div>

                  <div className="member-info">
                    <h3 className="member-name" title={member.name}>{member.name}</h3>
                    <span className="member-role">{member.role}</span>
                  </div>

                  <p className="member-qualification">
                    {member.qualification || member.qualitifcation || 'Qualification not set'} · {member.experience || 0} yrs exp
                  </p>

                  <div className="member-skills">
                    {skills.split(',').filter(s => s.trim()).slice(0, 4).map((s, idx) => (
                      <span key={`skill-${idx}`} className="member-skill">{s.trim()}</span>
                    ))}
                  </div>

                  {/* Real due-date signals */}
                  {(overdue > 0 || dueSoon > 0) && (
                    <div className="member-due-row">
                      {overdue > 0 && (
                        <span className="lt-due-chip overdue"><AlertCircle size={11} /> {overdue} overdue</span>
                      )}
                      {dueSoon > 0 && (
                        <span className="lt-due-chip soon"><Clock size={11} /> {dueSoon} due soon</span>
                      )}
                    </div>
                  )}

                  <div className="member-stats">
                    <div className="member-stat">
                      <span className="member-stat-value">{totalTasks}</span>
                      <span className="member-stat-label">Tasks</span>
                    </div>
                    <div className="member-stat">
                      <span className="member-stat-value" style={{ color: '#34d399' }}>{completedTasks}</span>
                      <span className="member-stat-label">Done</span>
                    </div>
                    <div className="member-stat">
                      <span className="member-stat-value" style={{ color: '#818cf8' }}>{inProgressTasks}</span>
                      <span className="member-stat-label">Active</span>
                    </div>
                  </div>

                  <div className="member-footer">
                    <div className="member-on-time">
                      <ProgressRing progress={stats.onTimeRate || 0} size={36} strokeWidth={3} />
                      <div>
                        <p className="member-on-time-value">
                          {stats.completedWithDue > 0 ? `${stats.onTimeRate}%` : '—'}
                        </p>
                        <p className="member-on-time-label">On-time</p>
                      </div>
                    </div>
                    <span className="member-completion" style={{
                      color: completionRate >= 70 ? '#34d399' : completionRate >= 40 ? '#f59e0b' : '#f87171'
                    }}>
                      {totalTasks > 0 ? `${completionRate}% completion` : 'No tasks yet'}
                    </span>
                  </div>
                </motion.div>
              );
            })
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="pagination">
            <button className="pagination-btn" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}>
              Prev
            </button>
            {[...Array(totalPages)].map((_, i) => (
              <button key={`page-${i}`} className={`pagination-btn ${currentPage === i + 1 ? 'active' : ''}`} onClick={() => setCurrentPage(i + 1)}>
                {i + 1}
              </button>
            ))}
            <button className="pagination-btn" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}>
              Next
            </button>
          </div>
        )}
      </div>

      {/* ═══════════ MEMBER DETAIL MODAL (real data only) ═══════════ */}
      <AnimatePresence>
        {drawer && (() => {
          const stats = getMemberStats(drawer.id);
          const initials = getInitials(drawer.name);
          const color = drawer.avatar_color || '#818cf8';
          const addedBy = drawer.added_by ? getUserById(drawer.added_by) : null;
          const memberTasks = stats.tasks || [];

          const activeTasks = memberTasks.filter(t => !isDone(t)).sort((a, b) => {
            const da = dueOf(a), db = dueOf(b);
            if (!da && !db) return 0;
            if (!da) return 1;
            if (!db) return -1;
            return new Date(da) - new Date(db);
          });
          const doneSorted = memberTasks.filter(isDone).sort((a, b) =>
            new Date(updatedOf(b) || b.created_at || 0) - new Date(updatedOf(a) || a.created_at || 0));

          const activeCount = activeTasks.length;
          const overdue = stats.overdueTasks || 0;

          // Real timeline — only entries we actually have data for
          const timeline = [];
          const joined = formatDate(drawer.created_at);
          if (joined) timeline.push({ label: 'Joined', text: joined });
          const lastAct = stats.lastActivity ? formatRelative(stats.lastActivity) : null;
          if (lastAct) timeline.push({ label: 'Activity', text: `Last task update ${lastAct}` });
          if (stats.completedThisMonth > 0) timeline.push({
            label: 'This month',
            text: `Completed ${stats.completedThisMonth} task${stats.completedThisMonth > 1 ? 's' : ''}`,
          });
          if (addedBy) timeline.push({ label: 'Added by', text: addedBy.u_name || addedBy.name || '—' });

          return (
            <motion.div
              className="member-modal-overlay"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setDrawer(null)}
            >
              <motion.div
                className="member-modal"
                initial={{ scale: 0.92, opacity: 0, y: 30 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.92, opacity: 0, y: 30 }}
                transition={{ type: "spring", damping: 25, stiffness: 300 }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="mm-header">
                  <div className="mm-header-left">
                    <div className="mm-avatar" style={{ background: `${color}22`, border: `2px solid ${color}55`, color }}>
                      {initials}
                    </div>
                    <div className="mm-header-info">
                      <h2 className="mm-name">{drawer.name}</h2>
                      <div className="mm-badges">
                        <span className="badge badge-purple">{drawer.role || 'Team Member'}</span>
                        <span className="badge" style={{
                          background: activeCount > 0 ? 'rgba(52,211,153,.15)' : 'rgba(148,163,184,.15)',
                          color: activeCount > 0 ? '#34d399' : '#94a3b8',
                        }}>
                          {activeCount > 0 ? 'Active' : 'Idle'}
                        </span>
                        <span className="badge badge-gray">{drawer.experience || 0} yrs exp</span>
                      </div>
                    </div>
                  </div>
                  <button className="mm-close-btn" onClick={() => setDrawer(null)}><X size={20} /></button>
                </div>

                <div className="mm-body">
                  {(drawer.desc || drawer.description) ? (
                    <div className="mm-description">{drawer.desc || drawer.description}</div>
                  ) : (
                    <div className="mm-description muted">No description provided.</div>
                  )}

                  {drawer.email && (
                    <div className="mm-email"><Mail size={14} /><span>{drawer.email}</span></div>
                  )}

                  <div className="mm-stats-row">
                    <div className="mm-stat-item">
                      <span className="mm-stat-value">{stats.totalTasks}</span>
                      <span className="mm-stat-label">Total Tasks</span>
                    </div>
                    <div className="mm-stat-item">
                      <span className="mm-stat-value" style={{ color: '#34d399' }}>{stats.completedTasks}</span>
                      <span className="mm-stat-label">Completed</span>
                    </div>
                    <div className="mm-stat-item">
                      <span className="mm-stat-value" style={{ color: '#818cf8' }}>{activeCount}</span>
                      <span className="mm-stat-label">Active</span>
                    </div>
                    <div className="mm-stat-item">
                      <span className="mm-stat-value" style={{ color: overdue > 0 ? '#f87171' : undefined }}>{overdue}</span>
                      <span className="mm-stat-label">Overdue</span>
                    </div>
                    <div className="mm-stat-item">
                      <span className="mm-stat-value" style={{
                        color: stats.completedWithDue > 0 ? ((stats.onTimeRate || 0) >= 70 ? '#34d399' : '#f59e0b') : undefined
                      }}>
                        {stats.completedWithDue > 0 ? `${stats.onTimeRate}%` : '—'}
                      </span>
                      <span className="mm-stat-label">On-Time</span>
                    </div>
                  </div>

                  <div className="mm-section">
                    <h4 className="mm-section-title"><Award size={14} /> Skills</h4>
                    <div className="mm-skills">
                      {(drawer.skills || '').split(',').filter(s => s.trim()).map((s, i) => (
                        <span key={`skill-${i}`} className="mm-skill-tag">{s.trim()}</span>
                      ))}
                      {(!drawer.skills || drawer.skills.split(',').filter(s => s.trim()).length === 0) && (
                        <span className="mm-no-data">No skills listed</span>
                      )}
                    </div>
                  </div>

                  {/* Current tasks — real titles, statuses, due dates, progress */}
                  <div className="mm-section">
                    <h4 className="mm-section-title"><Briefcase size={14} /> Current Tasks</h4>
                    <div className="mm-project-list">
                      {activeTasks.length === 0 ? (
                        <div className="mm-no-data">No active tasks</div>
                      ) : (
                        activeTasks.slice(0, 4).map((t, i) => {
                          const due = dueOf(t);
                          const dl = daysUntil(due);
                          const dueCls = dl !== null && dl < 0 ? 'overdue' : dl !== null && dl <= 7 ? 'soon' : '';
                          return (
                            <div className="mm-project-item" key={t.t_id || t.id || `ct-${i}`}>
                              <div className="mm-project-info">
                                <span className="mm-project-name">{t.title || 'Untitled task'}</span>
                                <span className={`mm-task-due ${dueCls}`}>
                                  {due ? `Due ${formatDate(due)}` : 'No due date'}
                                  {dl !== null && dl < 0 ? ' · overdue' : ''}
                                </span>
                                <div className="mm-progress-track">
                                  <span className="mm-progress-fill" style={{
                                    width: `${clampProgress(t)}%`,
                                    background: statusColor(t.status),
                                  }} />
                                </div>
                              </div>
                              <span className="badge badge-blue" style={{
                                background: `${statusColor(t.status)}1f`, color: statusColor(t.status),
                              }}>
                                {statusLabel(t.status)}
                              </span>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>

                  {/* Completed tasks — real completion dates + on-time/late */}
                  <div className="mm-section">
                    <h4 className="mm-section-title"><CheckCircle2 size={14} /> Completed Tasks</h4>
                    <div className="mm-project-list">
                      {doneSorted.length === 0 ? (
                        <div className="mm-no-data">No completed tasks yet</div>
                      ) : (
                        doneSorted.slice(0, 4).map((t, i) => {
                          const doneAt = updatedOf(t) || t.created_at;
                          const due = dueOf(t);
                          let punctuality = null;
                          if (due && doneAt) punctuality = new Date(doneAt) <= new Date(due) ? 'On time' : 'Late';
                          return (
                            <div className="mm-project-item completed" key={t.t_id || t.id || `dt-${i}`}>
                              <div className="mm-project-info">
                                <span className="mm-project-name">{t.title || 'Untitled task'}</span>
                                <span className="mm-task-due">
                                  {doneAt ? `Completed ${formatDate(doneAt)}` : 'Completed'}
                                </span>
                              </div>
                              {punctuality ? (
                                <span className="badge badge-green" style={
                                  punctuality === 'Late' ? { background: 'rgba(248,113,113,.15)', color: '#f87171' } : undefined
                                }>
                                  {punctuality}
                                </span>
                              ) : (
                                <span className="mm-no-data">No due date</span>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>

                  {/* Real timeline */}
                  <div className="mm-section">
                    <h4 className="mm-section-title"><Clock size={14} /> Timeline</h4>
                    <div className="mm-timeline">
                      {timeline.length === 0 ? (
                        <div className="mm-no-data">No timeline data yet</div>
                      ) : (
                        timeline.map((item, i) => (
                          <div className="mm-timeline-item" key={`tl-${i}`}>
                            <span className="mm-tl-year">{item.label}</span>
                            <span className="mm-tl-text">{item.text}</span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>

                <div className="mm-footer">
                  <button className="mm-footer-btn secondary" onClick={() => setDrawer(null)}>Close</button>
                  <button className="mm-footer-btn primary" onClick={() => { openEdit(drawer); setDrawer(null); }}>
                    <Pencil size={14} /> Edit Member
                  </button>
                </div>
              </motion.div>
            </motion.div>
          );
        })()}
      </AnimatePresence>

      {/* ═══════════ DELETE CONFIRM ═══════════ */}
      <AnimatePresence>
        {showDeleteConfirm && memberToDelete && (
          <motion.div
            className="member-modal-overlay"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => !isDeleting && setShowDeleteConfirm(null)}
          >
            <motion.div
              className="member-modal delete-modal"
              initial={{ scale: 0.92, opacity: 0, y: 30 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.92, opacity: 0, y: 30 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mm-header">
                <div className="mm-header-left">
                  <div className="delete-icon-wrapper"><AlertCircle size={24} color="#f87171" /></div>
                  <div className="mm-header-info">
                    <h2 className="mm-name">Delete Member</h2>
                    <p className="mm-sub">{memberToDelete.name} · {memberToDelete.role}</p>
                  </div>
                </div>
                <button className="mm-close-btn" onClick={() => !isDeleting && setShowDeleteConfirm(null)} disabled={isDeleting}>
                  <X size={20} />
                </button>
              </div>

              <div className="mm-body">
                {assignedTasks.length > 0 ? (
                  <>
                    <div className="delete-warning">
                      <AlertCircle size={18} />
                      <span>
                        This member has <strong>{assignedTasks.length}</strong> task{assignedTasks.length > 1 ? 's' : ''} assigned.
                        Please choose how to handle them:
                      </span>
                    </div>

                    <div className="assigned-tasks-list">
                      <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>
                        Assigned Tasks:
                      </p>
                      {assignedTasks.slice(0, 5).map((task, i) => (
                        <div key={task.t_id || task.id || i} className="assigned-task-item">
                          <span className="task-dot" />
                          <span className="task-title">{task.title}</span>
                          <span className="task-status-badge" style={{
                            background: isDone(task) ? 'rgba(52, 211, 153, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                            color: isDone(task) ? '#34d399' : '#f59e0b',
                          }}>
                            {statusLabel(task.status)}
                          </span>
                        </div>
                      ))}
                      {assignedTasks.length > 5 && (
                        <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                          +{assignedTasks.length - 5} more tasks
                        </p>
                      )}
                    </div>

                    <div className="delete-options">
                      <div className="delete-option">
                        <label className="radio-label">
                          <input
                            type="radio" name="deleteOption" value="reassign"
                            checked={deleteOption === 'reassign'}
                            onChange={() => setDeleteOption('reassign')}
                          />
                          <span>Reassign tasks to another member</span>
                        </label>
                        {deleteOption === 'reassign' && (
                          otherMembers.length > 0 ? (
                            <select
                              className="lt-select"
                              value={reassignTarget}
                              onChange={e => setReassignTarget(e.target.value)}
                              style={{ marginTop: 8 }}
                            >
                              <option value="">Select a member…</option>
                              {otherMembers.map(m => (
                                <option key={m.id} value={m.id}>{m.name} ({m.role})</option>
                              ))}
                            </select>
                          ) : (
                            <p className="lt-empty-note" style={{ marginTop: 6 }}>
                              No other members available — tasks will be unassigned instead.
                            </p>
                          )
                        )}
                      </div>
                      <div className="delete-option">
                        <label className="radio-label">
                          <input
                            type="radio" name="deleteOption" value="park"
                            checked={deleteOption === 'park'}
                            onChange={() => setDeleteOption('park')}
                          />
                          <span>Leave tasks unassigned (park them)</span>
                        </label>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="delete-warning">
                    <AlertCircle size={18} />
                    <span>
                      Are you sure you want to delete <strong>{memberToDelete.name}</strong>?
                      This member has no assigned tasks.
                    </span>
                  </div>
                )}
              </div>

              <div className="mm-footer">
                <button className="mm-footer-btn secondary" onClick={() => setShowDeleteConfirm(null)} disabled={isDeleting}>
                  Cancel
                </button>
                <button
                  className="mm-footer-btn danger"
                  onClick={handleDelete}
                  disabled={isDeleting || (assignedTasks.length > 0 && deleteOption === 'reassign' && otherMembers.length > 0 && !reassignTarget)}
                >
                  {isDeleting ? <Loader2 size={14} className="spin" /> : <Trash2 size={14} />}
                  {isDeleting ? 'Deleting…' : 'Delete Member'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══════════ ADD MEMBER ═══════════ */}
      <AnimatePresence>
        {showAdd && (
          <motion.div
            className="member-modal-overlay"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={closeAddModal}
          >
            <motion.div
              className="member-modal wide"
              initial={{ scale: 0.92, opacity: 0, y: 30 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.92, opacity: 0, y: 30 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mm-header">
                <div className="mm-header-left">
                  <div className="delete-icon-wrapper" style={{ background: 'rgba(129,140,248,.12)' }}>
                    <UserPlus size={22} color="#818cf8" />
                  </div>
                  <div className="mm-header-info">
                    <h2 className="mm-name">Add Team Member</h2>
                    <p className="mm-sub">Fields marked * are required</p>
                  </div>
                </div>
                <button className="mm-close-btn" onClick={closeAddModal}><X size={20} /></button>
              </div>

              <div className="mm-body">
                <div className="lt-form-grid">
                  <div className="lt-form-field">
                    <label className="lt-form-label">Name *</label>
                    <input ref={addNameRef} className={`lt-input ${showFormError('name') ? 'invalid' : ''}`} name="name"
                      value={form.name} onChange={handleFormChange} onBlur={() => handleFormBlur('name')}
                      placeholder="e.g. Priya Sharma" maxLength={LIMITS.name.max} />
                    <FieldError message={showFormError('name')} />
                  </div>
                  <div className="lt-form-field">
                    <label className="lt-form-label">Role *</label>
                    <input className={`lt-input ${showFormError('role') ? 'invalid' : ''}`} name="role"
                      value={form.role} onChange={handleFormChange} onBlur={() => handleFormBlur('role')}
                      placeholder="e.g. Frontend Developer" maxLength={LIMITS.role.max} />
                    <FieldError message={showFormError('role')} />
                  </div>
                  <div className="lt-form-field">
                    <label className="lt-form-label">Email *</label>
                    <input className={`lt-input ${showFormError('email') ? 'invalid' : ''}`} name="email" type="email"
                      value={form.email} onChange={handleFormChange} onBlur={() => handleFormBlur('email')}
                      placeholder="member@company.com" maxLength={LIMITS.email.max} />
                    <FieldError message={showFormError('email')} />
                  </div>
                  <div className="lt-form-field">
                    <label className="lt-form-label">Experience (years) *</label>
                    <input className={`lt-input ${showFormError('experience') ? 'invalid' : ''}`} name="experience" type="number" min="0"
                      value={form.experience} onChange={handleFormChange} onBlur={() => handleFormBlur('experience')}
                      placeholder="e.g. 3" />
                    <FieldError message={showFormError('experience')} />
                  </div>
                  <div className="lt-form-field">
                    <label className="lt-form-label">Qualification *</label>
                    <input className={`lt-input ${showFormError('qualification') ? 'invalid' : ''}`} name="qualification"
                      value={form.qualification} onChange={handleFormChange} onBlur={() => handleFormBlur('qualification')}
                      placeholder="e.g. B.Tech Computer Science" maxLength={LIMITS.qualification.max} />
                    <FieldError message={showFormError('qualification')} />
                  </div>
                  <div className="lt-form-field">
                    <label className="lt-form-label">Skills * <span className="lt-char-count">comma separated</span></label>
                    <input className={`lt-input ${showFormError('skills') ? 'invalid' : ''}`} name="skills"
                      value={form.skills} onChange={handleFormChange} onBlur={() => handleFormBlur('skills')}
                      placeholder="e.g. React, Node.js, Figma" maxLength={LIMITS.skills.max} />
                    <FieldError message={showFormError('skills')} />
                  </div>
                  <div className="lt-form-field full">
                    <label className="lt-form-label">
                      Description
                      <span className="lt-char-count">{form.description.length}/{LIMITS.description.max}</span>
                    </label>
                    <textarea className={`lt-textarea ${showFormError('description') ? 'invalid' : ''}`} name="description"
                      value={form.description} onChange={handleFormChange} onBlur={() => handleFormBlur('description')}
                      placeholder="Short bio or notes about this member (optional)" maxLength={LIMITS.description.max} />
                    <FieldError message={showFormError('description')} />
                  </div>
                </div>
              </div>

              <div className="mm-footer">
                <button className="mm-footer-btn secondary" onClick={closeAddModal} disabled={savingForm}>Cancel</button>
                <button className="mm-footer-btn primary" onClick={handleAdd} disabled={savingForm}>
                  {savingForm && <Loader2 size={14} className="spin" />}
                  {savingForm ? 'Saving…' : 'Add Member'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {/* ═══════════ EDIT MEMBER ═══════════ */}
        {showEdit && selected && (
          <motion.div
            className="member-modal-overlay"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={closeEditModal}
          >
            <motion.div
              className="member-modal wide"
              initial={{ scale: 0.92, opacity: 0, y: 30 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.92, opacity: 0, y: 30 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mm-header">
                <div className="mm-header-left">
                  <div className="delete-icon-wrapper" style={{ background: 'rgba(129,140,248,.12)' }}>
                    <Pencil size={22} color="#818cf8" />
                  </div>
                  <div className="mm-header-info">
                    <h2 className="mm-name">Edit Member</h2>
                    <p className="mm-sub">{selected.name}</p>
                  </div>
                </div>
                <button className="mm-close-btn" onClick={closeEditModal}><X size={20} /></button>
              </div>

              <div className="mm-body">
                <div className="lt-form-grid">
                  <div className="lt-form-field">
                    <label className="lt-form-label">Name *</label>
                    <input ref={editNameRef} className={`lt-input ${showFormError('name') ? 'invalid' : ''}`} name="name"
                      value={form.name} onChange={handleFormChange} onBlur={() => handleFormBlur('name')}
                      maxLength={LIMITS.name.max} />
                    <FieldError message={showFormError('name')} />
                  </div>
                  <div className="lt-form-field">
                    <label className="lt-form-label">Role *</label>
                    <input className={`lt-input ${showFormError('role') ? 'invalid' : ''}`} name="role"
                      value={form.role} onChange={handleFormChange} onBlur={() => handleFormBlur('role')}
                      maxLength={LIMITS.role.max} />
                    <FieldError message={showFormError('role')} />
                  </div>
                  <div className="lt-form-field">
                    <label className="lt-form-label">Email *</label>
                    <input className={`lt-input ${showFormError('email') ? 'invalid' : ''}`} name="email" type="email"
                      value={form.email} onChange={handleFormChange} onBlur={() => handleFormBlur('email')}
                      maxLength={LIMITS.email.max} />
                    <FieldError message={showFormError('email')} />
                  </div>
                  <div className="lt-form-field">
                    <label className="lt-form-label">Experience (years) *</label>
                    <input className={`lt-input ${showFormError('experience') ? 'invalid' : ''}`} name="experience" type="number" min="0"
                      value={form.experience} onChange={handleFormChange} onBlur={() => handleFormBlur('experience')} />
                    <FieldError message={showFormError('experience')} />
                  </div>
                  <div className="lt-form-field">
                    <label className="lt-form-label">Qualification *</label>
                    <input className={`lt-input ${showFormError('qualification') ? 'invalid' : ''}`} name="qualification"
                      value={form.qualification} onChange={handleFormChange} onBlur={() => handleFormBlur('qualification')}
                      maxLength={LIMITS.qualification.max} />
                    <FieldError message={showFormError('qualification')} />
                  </div>
                  <div className="lt-form-field">
                    <label className="lt-form-label">Skills * <span className="lt-char-count">comma separated</span></label>
                    <input className={`lt-input ${showFormError('skills') ? 'invalid' : ''}`} name="skills"
                      value={form.skills} onChange={handleFormChange} onBlur={() => handleFormBlur('skills')}
                      maxLength={LIMITS.skills.max} />
                    <FieldError message={showFormError('skills')} />
                  </div>
                  <div className="lt-form-field full">
                    <label className="lt-form-label">
                      Description
                      <span className="lt-char-count">{form.description.length}/{LIMITS.description.max}</span>
                    </label>
                    <textarea className={`lt-textarea ${showFormError('description') ? 'invalid' : ''}`} name="description"
                      value={form.description} onChange={handleFormChange} onBlur={() => handleFormBlur('description')}
                      maxLength={LIMITS.description.max} />
                    <FieldError message={showFormError('description')} />
                  </div>
                </div>
              </div>

              <div className="mm-footer">
                <button className="mm-footer-btn secondary" onClick={closeEditModal} disabled={savingForm}>Cancel</button>
                <button className="mm-footer-btn primary" onClick={handleUpdate} disabled={savingForm}>
                  {savingForm && <Loader2 size={14} className="spin" />}
                  {savingForm ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}