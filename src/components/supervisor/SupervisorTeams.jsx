// components/supervisor/SupervisorTeams.jsx
import { useState, useEffect, useMemo, useRef } from 'react';
import {
  Search, UserPlus, Trash2, Pencil, X, RefreshCw, Users,
  Briefcase, GraduationCap, TrendingUp, Mail, Award,
  CheckCircle2, Clock, AlertCircle, Loader2
} from 'lucide-react';
import { useOutletContext } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';

import Topbar from '../shared/Topbar';
import { ProgressRing, Modal, Avatar } from '../shared/UIComponents';
import teamService from '../../services/teamService';
import taskService from '../../services/taskService';
import userService from '../../services/userService';
import projectTeamService from '../../services/projectTeamService';
import { useAuth } from '../../context/AuthContext';

/* ─────────── Validation constants ─────────── */
const LIMITS = {
  name:          { min: 2,   max: 100 },
  role:          { min: 2,   max: 80 },
  email:         { max: 254 },
  qualification: { min: 2,   max: 200 },
  skills:        { min: 2,   max: 500 },
  description:   { max: 2000 },
  experience:    { min: 0,   max: 70 },
};

const EMAIL_REGEX   = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
const NAME_REGEX    = /^[\p{L}\p{N} &\-.'()]+$/u;
const ROLE_REGEX    = /^[\p{L}\p{N} &\-.'()/]+$/u;

/* ─────────── Validators ─────────── */
const validators = {
  name: (value) => {
    const v = (value ?? '').trim();
    if (!v) return 'Name is required';
    if (v.length < LIMITS.name.min) return `Name must be at least ${LIMITS.name.min} characters`;
    if (v.length > LIMITS.name.max) return `Name must be less than ${LIMITS.name.max} characters`;
    if (!NAME_REGEX.test(v)) return 'Name can only contain letters, numbers, spaces and  & - . \' ( )';
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

const defaultForm = {
  name: '',
  role: '',
  qualification: '',
  experience: '',
  skills: '',
  email: '',
  description: ''
};

export default function SupervisorTeams() {
  const { user } = useAuth();
  const { onMenuClick } = useOutletContext();

  // Data state
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [members, setMembers] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [users, setUsers] = useState([]);
  const [memberStatsMap, setMemberStatsMap] = useState({});

  // Filter / sort / pagination
  const [search, setSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [filterRole, setFilterRole] = useState('all');
  const [filterExperience, setFilterExperience] = useState('all');
  const [sortBy, setSortBy] = useState('name');
  const itemsPerPage = 6;

  // Modals
  const [showAdd, setShowAdd] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [selected, setSelected] = useState(null);
  const [drawer, setDrawer] = useState(null);

  // Form state
  const [form, setForm] = useState(defaultForm);
  const [formTouched, setFormTouched] = useState({});
  const [formSubmitAttempted, setFormSubmitAttempted] = useState(false);
  const [savingForm, setSavingForm] = useState(false);

  // Delete/reassign state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(null);
  const [memberToDelete, setMemberToDelete] = useState(null);
  const [assignedTasks, setAssignedTasks] = useState([]);
  const [reassignTarget, setReassignTarget] = useState('');
  const [deleteOption, setDeleteOption] = useState('reassign');
  const [isDeleting, setIsDeleting] = useState(false);

  // Auto-focus
  const addNameRef = useRef(null);
  const editNameRef = useRef(null);

  const colors = ['#818cf8','#34d399','#f87171','#f59e0b','#2dd4bf','#f97316','#ec4899','#a78bfa'];

  /* ─────────── Fetch data ─────────── */
  useEffect(() => { fetchData(); }, []);

  useEffect(() => {
    if (members.length > 0) fetchMemberStats();
  }, [members]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [membersData, tasksData, usersData] = await Promise.all([
        teamService.getTeamMembers(),
        taskService.getTasks(),
        userService.getUsers(),
      ]);

      let membersList = membersData?.data || membersData || [];
      const tasksList = tasksData?.data || tasksData || [];
      const usersList = usersData?.data || usersData || [];

      if (!Array.isArray(membersList)) membersList = [];

      const activeMembers = membersList.filter(m => m.is_deleted !== 1);

      setMembers(activeMembers);
      setTasks(tasksList);
      setUsers(usersList);

      console.log('📊 Tasks loaded:', tasksList.length);
      console.log('📊 Active Members loaded:', activeMembers.length);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Failed to load team members');
      setMembers([]);
      setTasks([]);
      setUsers([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const fetchMemberStats = async () => {
    try {
      const statsMap = {};
      for (const member of members) {
        try {
          const response = await teamService.getTeamMemberStats(member.id);
          const statsData = response?.data || response || {};
          statsMap[member.id] = statsData;
        } catch (err) {
          console.error(`Error fetching stats for member ${member.id}:`, err);
          statsMap[member.id] = {};
        }
      }
      setMemberStatsMap(statsMap);
    } catch (error) {
      console.error('Error fetching member stats:', error);
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
        if (entry.pt_id) {
          await projectTeamService.removeMemberFromProject(entry.pt_id);
          console.log(`✅ Removed PTeam entry ${entry.pt_id} for member ${memberId}`);
        }
      }
      return memberEntries.length;
    } catch (error) {
      console.error('Error removing member from projects:', error);
      return 0;
    }
  };

  const getMemberStats = (memberId) => {
    const cachedStats = memberStatsMap[memberId];
    if (cachedStats && Object.keys(cachedStats).length > 0) return cachedStats;

    const numericMemberId = Number(memberId);
    const memberTasks = tasks.filter(t => {
      const assignTo = t.assign_to || t.assignedTo;
      return Number(assignTo) === numericMemberId;
    });

    const totalTasks = memberTasks.length;
    const completedTasks = memberTasks.filter(t => t.status === 'done' || t.status === 'completed').length;
    const inProgressTasks = memberTasks.filter(t => t.status === 'in_progress' || t.status === 'in-progress' || t.status === 'review').length;
    const todoTasks = memberTasks.filter(t => t.status === 'todo' || t.status === 'pending').length;

    return {
      totalTasks,
      completedTasks,
      inProgressTasks,
      todoTasks,
      completionRate: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0,
      onTimeRate: 0,
      avgProgress: 0,
      tasks: memberTasks
    };
  };

  const getTasksForMember = (memberId) => {
    const stats = getMemberStats(memberId);
    return stats.tasks || [];
  };

  const getMemberName = (memberId) => {
    const member = members.find(m => Number(m.id) === Number(memberId));
    return member ? member.name : 'Unknown';
  };

  const getUserById = (id) => users.find(u => (u.id || u.u_id) === id);

  const getInitials = (name) => {
    if (!name) return '?';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };


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

  if (!isFormValid) {
    toast.error('Please fix the highlighted errors before saving');
    return;
  }

  try {
    setSavingForm(true);

    const { name, role, email, qualification, experience, skills, description } = form;

    // Just add a TeamMember record — no User creation, no temp password.
    const response = await teamService.addTeamMember({
      name: name.trim(),
      role: role.trim(),
      email: email.trim().toLowerCase(),
      qualification: qualification.trim(),
      experience: parseInt(experience) || 0,
      skills: skills.trim(),
      description: description.trim(),
      added_by: user?.id || user?.u_id || 1,
    });

    const newMember = response?.data || response;

    if (newMember && newMember.id) {
      setMembers(prev => [newMember, ...prev]);
      setShowAdd(false);
      resetFormState();
      toast.success(`Team member "${name.trim()}" added successfully`);
      await fetchMemberStats();
    } else {
      toast.error('Failed to add team member');
    }
  } catch (error) {
    console.error('Error adding member:', error);
    const rawMsg = error?.response?.data?.message ||
                   error?.response?.data?.detail ||
                   error?.message;
    const errorMsg = typeof rawMsg === 'string' ? rawMsg : 'Failed to add team member';
    toast.error(errorMsg);
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
      qualification: member.qualitifcation || member.qualification || '',
      experience: member.experience ?? '',
      skills: member.skills || '',
      description: member.desc || member.description || ''
    });
    setFormTouched({});
    setFormSubmitAttempted(false);
    setShowEdit(true);
  };

  const handleUpdate = async () => {
    setFormSubmitAttempted(true);

    if (!isFormValid) {
      toast.error('Please fix the highlighted errors before saving');
      return;
    }

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

      setMembers(members.map(m => (m.id) === (selected.id) ? updatedMember : m));
      setShowEdit(false);
      setSelected(null);
      resetFormState();
      toast.success('Member updated successfully');
      await fetchMemberStats();
    } catch (error) {
      console.error('Error updating member:', error);
      const rawMsg = error?.response?.data?.message ||
                     error?.response?.data?.detail ||
                     error?.message;
      const errorMsg = typeof rawMsg === 'string' ? rawMsg : 'Failed to update member';
      toast.error(errorMsg);
    } finally {
      setSavingForm(false);
    }
  };

  const handleFormChange = (e) => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
  };

  const handleFormBlur = (field) => markFormTouched(field);

  const closeAddModal = () => {
    setShowAdd(false);
    resetFormState();
  };

  const closeEditModal = () => {
    setShowEdit(false);
    setSelected(null);
    resetFormState();
  };

  /* ─────────── Delete flow ─────────── */
  const handleDeleteClick = (member) => {
    const memberTasks = getTasksForMember(member.id);
    setMemberToDelete(member);
    setAssignedTasks(memberTasks);
    setReassignTarget('');
    setDeleteOption('reassign');
    setShowDeleteConfirm(true);
  };

  const handleDeleteWithReassign = async () => {
    if (!memberToDelete) return;

    setIsDeleting(true);
    try {
      if (deleteOption === 'reassign' && reassignTarget) {
        const targetMemberId = parseInt(reassignTarget);
        for (const task of assignedTasks) {
          await taskService.updateTask(task.t_id || task.id, {
            title: task.title,
            description: task.desc,
            status: task.status,
            priority: task.priority,
            progress: task.progress,
            assignTo: targetMemberId,
          });
        }
        toast.success(`Reassigned ${assignedTasks.length} tasks to ${getMemberName(targetMemberId)}`);
      } else if (deleteOption === 'park') {
        for (const task of assignedTasks) {
          await taskService.updateTask(task.t_id || task.id, {
            title: task.title,
            description: task.desc,
            status: task.status,
            priority: task.priority,
            progress: task.progress,
            assignTo: null,
          });
        }
        toast.success(`Unassigned ${assignedTasks.length} tasks (parked)`);
      }

      await removeMemberFromAllProjects(memberToDelete.id);
      await teamService.deleteTeamMember(memberToDelete.id);

      setMembers(prev => prev.filter(m => (m.id) !== memberToDelete.id));
      setMemberStatsMap(prev => {
        const newMap = { ...prev };
        delete newMap[memberToDelete.id];
        return newMap;
      });

      await fetchData();
      setShowDeleteConfirm(null);
      const deletedName = memberToDelete.name;
      setMemberToDelete(null);
      setAssignedTasks([]);
      setReassignTarget('');
      toast.success(`Member "${deletedName}" removed successfully`);
    } catch (error) {
      console.error('Error during deletion/reassignment:', error);
      const rawMsg = error?.response?.data?.message ||
                     error?.response?.data?.detail ||
                     error?.message;
      const errorMsg = typeof rawMsg === 'string' ? rawMsg : 'Failed to process member deletion';
      toast.error(errorMsg);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDelete = async () => {
    if (assignedTasks.length === 0) {
      try {
        setIsDeleting(true);
        await removeMemberFromAllProjects(memberToDelete.id);
        await teamService.deleteTeamMember(memberToDelete.id);

        setMembers(prev => prev.filter(m => (m.id) !== memberToDelete.id));
        setMemberStatsMap(prev => {
          const newMap = { ...prev };
          delete newMap[memberToDelete.id];
          return newMap;
        });

        await fetchData();
        setShowDeleteConfirm(null);
        const deletedName = memberToDelete.name;
        setMemberToDelete(null);
        toast.success(`Member "${deletedName}" removed successfully`);
      } catch (error) {
        console.error('Error deleting member:', error);
        const rawMsg = error?.response?.data?.message ||
                       error?.response?.data?.detail ||
                       error?.message;
        const errorMsg = typeof rawMsg === 'string' ? rawMsg : 'Failed to delete member';
        toast.error(errorMsg);
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
    const skills = m.skills || '';
    const name = m.name || '';
    const role = m.role || '';
    const experience = m.experience || 0;

    const searchMatch = name.toLowerCase().includes(search.toLowerCase()) ||
      role.toLowerCase().includes(search.toLowerCase()) ||
      skills.toLowerCase().includes(search.toLowerCase());

    const roleMatch = filterRole === 'all' || role.toLowerCase() === filterRole.toLowerCase();

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
      const statsA = getMemberStats(a.id);
      const statsB = getMemberStats(b.id);
      return (statsB.totalTasks || 0) - (statsA.totalTasks || 0);
    }
    return 0;
  });

  const totalPages = Math.ceil(sortedMembers.length / itemsPerPage);
  const paginatedMembers = sortedMembers.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

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
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
          <button className="btn btn-primary btn-sm" onClick={() => setShowAdd(true)}>
            <UserPlus size={14} /> Add Member
          </button>
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
                <option value="lead">🚀 Lead</option>
                <option value="manager">📊 Manager</option>
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
                onClick={() => {
                  setSearch('');
                  setFilterRole('all');
                  setFilterExperience('all');
                  setSortBy('name');
                }}
              >
                Clear all filters
              </button>
            )}
          </div>
        </div>

        {/* Members Grid */}
        <div className="grid-auto stagger-children">
          {paginatedMembers.length === 0 ? (
            <div style={{
              gridColumn: '1 / -1',
              textAlign: 'center',
              padding: '60px 20px',
              color: 'var(--text-muted)'
            }}>
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
              const onTimeRate = stats?.onTimeRate || 0;
              const initials = getInitials(member.name);
              const completionRate = stats?.completionRate || 0;
              const totalTasks = stats?.totalTasks || 0;
              const completedTasks = stats?.completedTasks || 0;
              const inProgressTasks = stats?.inProgressTasks || 0;

              return (
                <motion.div
                  key={memberId || `member-${i}`}
                  className="member-card animate-fade-in"
                  whileHover={{ y: -4 }}
                  transition={{ duration: 0.2 }}
                  onClick={() => setDrawer(member)}
                  style={{
                    position: 'relative',
                    cursor: 'pointer',
                    padding: '20px',
                    borderRadius: '16px',
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border-subtle)',
                    transition: 'all 0.2s'
                  }}
                >
                  <div style={{ position: 'absolute', top: 12, right: 12, display: 'flex', gap: 6 }}>
                    <button
                      className="btn btn-secondary btn-icon"
                      style={{ padding: 4, borderRadius: 8 }}
                      onClick={(e) => { e.stopPropagation(); openEdit(member); }}
                      title="Edit member"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      className="btn btn-danger btn-icon"
                      style={{ padding: 4, borderRadius: 8 }}
                      onClick={(e) => { e.stopPropagation(); handleDeleteClick(member); }}
                      title="Delete member"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>

                  <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                    <div style={{
                      width: 56, height: 56, borderRadius: '50%',
                      background: `${color}22`,
                      border: `2px solid ${color}40`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '20px',
                      fontWeight: 800,
                      color: color,
                      flexShrink: 0
                    }}>
                      {initials}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <h3 style={{
                        fontWeight: 700, fontSize: 15, marginBottom: 2,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                      }} title={member.name}>
                        {member.name}
                      </h3>
                      <span className="badge badge-purple" style={{ fontSize: 11 }}>{member.role}</span>
                    </div>
                  </div>

                  <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 8 }}>
                    {member.qualitifcation || member.qualification || ''} · {member.experience || 0} yrs exp
                  </p>

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 8 }}>
                    {skills.split(',').filter(s => s.trim()).slice(0, 4).map((s, idx) => (
                      <span key={`skill-${idx}`} className="badge badge-gray" style={{ fontSize: 10.5 }}>
                        {s.trim()}
                      </span>
                    ))}
                  </div>

                  <div style={{
                    display: 'flex', background: 'var(--bg-secondary)', borderRadius: 10,
                    border: '1px solid var(--border-subtle)', marginTop: 12
                  }}>
                    <div style={{ flex: 1, textAlign: 'center', padding: 8 }}>
                      <p style={{ fontWeight: 700, fontSize: 16 }}>{totalTasks}</p>
                      <p style={{ fontSize: 9, color: 'var(--text-muted)' }}>Tasks</p>
                    </div>
                    <div style={{ flex: 1, textAlign: 'center', padding: 8, borderLeft: '1px solid var(--border-subtle)' }}>
                      <p style={{ fontWeight: 700, fontSize: 16, color: '#34d399' }}>{completedTasks}</p>
                      <p style={{ fontSize: 9, color: 'var(--text-muted)' }}>Done</p>
                    </div>
                    <div style={{ flex: 1, textAlign: 'center', padding: 8, borderLeft: '1px solid var(--border-subtle)' }}>
                      <p style={{ fontWeight: 700, fontSize: 16, color: '#818cf8' }}>{inProgressTasks}</p>
                      <p style={{ fontSize: 9, color: 'var(--text-muted)' }}>Active</p>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 10 }}>
                    <ProgressRing progress={onTimeRate} size={40} strokeWidth={4} />
                    <div>
                      <p style={{ fontSize: 13, fontWeight: 600 }}>{onTimeRate}% On-time</p>
                      <p style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                        {totalTasks > 0 ? `${completionRate}% completion` : 'No tasks assigned'}
                      </p>
                    </div>
                  </div>
                </motion.div>
              );
            })
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: 24, gap: 8, flexWrap: 'wrap' }}>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
            >
              Prev
            </button>
            {[...Array(totalPages)].map((_, i) => (
              <button
                key={`page-${i}`}
                className={`btn ${currentPage === i + 1 ? 'btn-primary' : 'btn-secondary'}`}
                style={{ padding: '6px 12px', minWidth: 32 }}
                onClick={() => setCurrentPage(i + 1)}
              >
                {i + 1}
              </button>
            ))}
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
            >
              Next
            </button>
          </div>
        )}
      </div>

      {/* ── MEMBER DETAIL MODAL ── */}
      <AnimatePresence>
        {drawer && (() => {
          const memberId = drawer.id;
          const stats = getMemberStats(memberId);
          const onTimeRate = stats?.onTimeRate || 0;

          const initials = getInitials(drawer.name);
          const color = drawer.avatar_color || '#818cf8';
          const addedBy = getUserById(drawer.added_by);
          const completionRate = stats?.completionRate || 0;
          const totalTasks = stats?.totalTasks || 0;
          const completedTasks = stats?.completedTasks || 0;
          const inProgressTasks = stats?.inProgressTasks || 0;

          const currentProjects = tasks
            .filter(t => {
              const assignTo = t.assign_to || t.assignedTo;
              return Number(assignTo) === Number(memberId) && t.status !== 'done' && t.status !== 'completed';
            })
            .slice(0, 3)
            .map(t => ({
              name: t.title,
              role: t.status || 'In Progress',
              progress: t.progress || 0,
              status: t.status || 'Active'
            }));

          const completedProjects = tasks
            .filter(t => {
              const assignTo = t.assign_to || t.assignedTo;
              return Number(assignTo) === Number(memberId) && (t.status === 'done' || t.status === 'completed');
            })
            .slice(0, 3)
            .map(t => ({
              name: t.title,
              duration: 'Completed',
              performance: 'Done'
            }));

          const workHistory = [
            { year: new Date().getFullYear(), text: `Working as ${drawer.role || 'Team Member'}` },
            ...(completedTasks > 0 ? [{ year: new Date().getFullYear(), text: `Completed ${completedTasks} tasks` }] : [])
          ];

          return (
            <motion.div
              className="member-modal-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
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
                        <span className="badge badge-purple">{drawer.role}</span>
                        <span className="badge badge-green">Active</span>
                        <span className="badge badge-gray">{drawer.experience || 0} yrs exp</span>
                      </div>
                    </div>
                  </div>
                  <button className="mm-close-btn" onClick={() => setDrawer(null)}>
                    <X size={20} />
                  </button>
                </div>

                <div className="mm-body">
                  {drawer.desc || drawer.description ? (
                    <div className="mm-description">{drawer.desc || drawer.description}</div>
                  ) : (
                    <div className="mm-description muted">
                      A skilled team member contributing to the project.
                    </div>
                  )}

                  {drawer.email && (
                    <div className="mm-email">
                      <Mail size={14} />
                      <span>{drawer.email}</span>
                    </div>
                  )}

                  <div className="mm-stats-row">
                    <div className="mm-stat-item">
                      <span className="mm-stat-value">{totalTasks}</span>
                      <span className="mm-stat-label">Total Tasks</span>
                    </div>
                    <div className="mm-stat-item">
                      <span className="mm-stat-value" style={{ color: '#34d399' }}>{completedTasks}</span>
                      <span className="mm-stat-label">Completed</span>
                    </div>
                    <div className="mm-stat-item">
                      <span className="mm-stat-value" style={{ color: '#818cf8' }}>{inProgressTasks}</span>
                      <span className="mm-stat-label">Active</span>
                    </div>
                    <div className="mm-stat-item">
                      <span className="mm-stat-value" style={{ color: onTimeRate >= 70 ? '#34d399' : '#f59e0b' }}>{onTimeRate}%</span>
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

                  <div className="mm-section">
                    <h4 className="mm-section-title"><Briefcase size={14} /> Current Projects</h4>
                    <div className="mm-project-list">
                      {currentProjects.length === 0 ? (
                        <div className="mm-no-data">No active projects</div>
                      ) : (
                        currentProjects.map((p, i) => (
                          <div key={`proj-${i}`} className="mm-project-item">
                            <div className="mm-project-info">
                              <span className="mm-project-name">{p.name}</span>
                              <span className="mm-project-role">{p.role}</span>
                            </div>
                            <div className="mm-project-status">
                              <span className="badge badge-blue">{p.status}</span>
                              <span className="mm-project-progress">{p.progress}%</span>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  <div className="mm-section">
                    <h4 className="mm-section-title"><CheckCircle2 size={14} /> Completed Projects</h4>
                    <div className="mm-project-list">
                      {completedProjects.length === 0 ? (
                        <div className="mm-no-data">No completed projects</div>
                      ) : (
                        completedProjects.map((p, i) => (
                          <div key={`hist-${i}`} className="mm-project-item completed">
                            <div className="mm-project-info">
                              <span className="mm-project-name">{p.name}</span>
                              <span className="mm-project-role">{p.duration}</span>
                            </div>
                            <span className="badge badge-green">{p.performance}</span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  <div className="mm-section">
                    <h4 className="mm-section-title"><Clock size={14} /> Work Timeline</h4>
                    <div className="mm-timeline">
                      {workHistory.map((item, i) => (
                        <div key={`tl-${i}`} className="mm-timeline-item">
                          <span className="mm-tl-year">{item.year}</span>
                          <span className="mm-tl-text">{item.text}</span>
                        </div>
                      ))}
                      {addedBy && (
                        <div className="mm-timeline-item">
                          <span className="mm-tl-year">Added</span>
                          <span className="mm-tl-text">by {addedBy.u_name || addedBy.name}</span>
                        </div>
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

      {/* ── DELETE CONFIRM MODAL ── */}
      <AnimatePresence>
        {showDeleteConfirm && memberToDelete && (
          <motion.div
            className="member-modal-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
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
                  <div className="delete-icon-wrapper">
                    <AlertCircle size={24} color="#f87171" />
                  </div>
                  <div className="mm-header-info">
                    <h2 className="mm-name">Delete Member</h2>
                    <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                      {memberToDelete.name} · {memberToDelete.role}
                    </p>
                  </div>
                </div>
                <button
                  className="mm-close-btn"
                  onClick={() => !isDeleting && setShowDeleteConfirm(null)}
                  disabled={isDeleting}
                >
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
                        <div key={i} className="assigned-task-item">
                          <span className="task-dot" />
                          <span className="task-title">{task.title}</span>
                          <span className="task-status-badge" style={{
                            background: task.status === 'done' || task.status === 'completed'
                              ? 'rgba(52, 211, 153, 0.15)'
                              : 'rgba(245, 158, 11, 0.15)',
                            color: task.status === 'done' || task.status === 'completed' ? '#34d399' : '#f59e0b'
                          }}>
                            {task.status || 'todo'}
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
                            type="radio"
                            name="deleteOption"
                            value="reassign"
                            checked={deleteOption === 'reassign'}
                            onChange={() => setDeleteOption('reassign')}
                            disabled={isDeleting}
                          />
                          <div>
                            <strong>Reassign Tasks</strong>
                            <span>Assign all tasks to another team member</span>
                          </div>
                        </label>
                        {deleteOption === 'reassign' && (
                          <select
                            className="reassign-select"
                            value={reassignTarget}
                            onChange={(e) => setReassignTarget(e.target.value)}
                            disabled={isDeleting}
                          >
                            <option value="">Select a team member...</option>
                            {members
                              .filter(m => Number(m.id) !== Number(memberToDelete.id))
                              .map(m => (
                                <option key={m.id} value={m.id}>
                                  {m.name} ({m.role || 'Member'})
                                </option>
                              ))}
                          </select>
                        )}
                      </div>

                      <div className="delete-option">
                        <label className="radio-label">
                          <input
                            type="radio"
                            name="deleteOption"
                            value="park"
                            checked={deleteOption === 'park'}
                            onChange={() => setDeleteOption('park')}
                            disabled={isDeleting}
                          />
                          <div>
                            <strong>Park Tasks</strong>
                            <span>Unassign all tasks (leave them without assignee)</span>
                          </div>
                        </label>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="delete-warning" style={{ background: 'rgba(52, 211, 153, 0.08)', borderColor: 'rgba(52, 211, 153, 0.2)' }}>
                    <CheckCircle2 size={18} color="#34d399" />
                    <span>This member has no assigned tasks. They can be safely removed.</span>
                  </div>
                )}
              </div>

              <div className="mm-footer delete-footer">
                <button
                  className="mm-footer-btn secondary"
                  onClick={() => setShowDeleteConfirm(null)}
                  disabled={isDeleting}
                >
                  Cancel
                </button>
                <button
                  className="mm-footer-btn danger"
                  onClick={handleDelete}
                  disabled={isDeleting || (deleteOption === 'reassign' && assignedTasks.length > 0 && !reassignTarget)}
                >
                  {isDeleting ? (
                    <><div className="spinner-small" /> Processing...</>
                  ) : (
                    <><Trash2 size={14} /> Confirm Delete</>
                  )}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ADD MEMBER MODAL */}
      <Modal isOpen={showAdd} onClose={closeAddModal} title="Add New Team Member">
        <form onSubmit={(e) => { e.preventDefault(); handleAdd(); }}>
          <div style={{ marginBottom: 12 }}>
            <label className="lt-form-label">Full Name <span className="lt-required">*</span></label>
            <input
              ref={addNameRef}
              name="name"
              className={`input ${showFormError('name') ? 'lt-input-error' : ''}`}
              placeholder="John Doe"
              value={form.name}
              onChange={handleFormChange}
              onBlur={() => handleFormBlur('name')}
              maxLength={LIMITS.name.max}
            />
            <FieldError message={showFormError('name')} />
          </div>

          <div style={{ marginBottom: 12 }}>
            <label className="lt-form-label">Role <span className="lt-required">*</span></label>
            <input
              name="role"
              className={`input ${showFormError('role') ? 'lt-input-error' : ''}`}
              placeholder="Frontend Developer"
              value={form.role}
              onChange={handleFormChange}
              onBlur={() => handleFormBlur('role')}
              maxLength={LIMITS.role.max}
            />
            <FieldError message={showFormError('role')} />
          </div>

          <div style={{ marginBottom: 12 }}>
            <label className="lt-form-label">Email Address <span className="lt-required">*</span></label>
            <input
              name="email"
              type="email"
              className={`input ${showFormError('email') ? 'lt-input-error' : ''}`}
              placeholder="john@example.com"
              value={form.email}
              onChange={handleFormChange}
              onBlur={() => handleFormBlur('email')}
              maxLength={LIMITS.email.max}
            />
            <FieldError message={showFormError('email')} />
          </div>

          <div style={{ marginBottom: 12 }}>
            <label className="lt-form-label">Qualification <span className="lt-required">*</span></label>
            <input
              name="qualification"
              className={`input ${showFormError('qualification') ? 'lt-input-error' : ''}`}
              placeholder="BS Computer Science"
              value={form.qualification}
              onChange={handleFormChange}
              onBlur={() => handleFormBlur('qualification')}
              maxLength={LIMITS.qualification.max}
            />
            <FieldError message={showFormError('qualification')} />
          </div>

          <div style={{ marginBottom: 12 }}>
            <label className="lt-form-label">Years of Experience <span className="lt-required">*</span></label>
            <input
              name="experience"
              type="number"
              min={LIMITS.experience.min}
              max={LIMITS.experience.max}
              className={`input ${showFormError('experience') ? 'lt-input-error' : ''}`}
              placeholder="3"
              value={form.experience}
              onChange={handleFormChange}
              onBlur={() => handleFormBlur('experience')}
            />
            <FieldError message={showFormError('experience')} />
          </div>

          <div style={{ marginBottom: 12 }}>
            <label className="lt-form-label">Skills <span className="lt-required">*</span></label>
            <input
              name="skills"
              className={`input ${showFormError('skills') ? 'lt-input-error' : ''}`}
              placeholder="React, Node.js, MongoDB"
              value={form.skills}
              onChange={handleFormChange}
              onBlur={() => handleFormBlur('skills')}
              maxLength={LIMITS.skills.max}
            />
            <FieldError message={showFormError('skills')} />
          </div>

          <div style={{ marginBottom: 20 }}>
            <label className="lt-form-label">Short Description</label>
            <textarea
              name="description"
              className={`input ${showFormError('description') ? 'lt-input-error' : ''}`}
              placeholder="Brief description of the member's background"
              value={form.description}
              onChange={handleFormChange}
              onBlur={() => handleFormBlur('description')}
              maxLength={LIMITS.description.max}
              style={{ minHeight: 80, resize: 'vertical' }}
            />
            <FieldError message={showFormError('description')} />
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" className="btn btn-secondary flex-1" onClick={closeAddModal} disabled={savingForm}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary flex-1" disabled={savingForm}>
              {savingForm ? <><Loader2 size={14} className="spin" /> Adding...</> : 'Add Member'}
            </button>
          </div>
        </form>
      </Modal>

      {/* EDIT MEMBER MODAL */}
      <Modal isOpen={showEdit} onClose={closeEditModal} title="Edit Team Member">
        <form onSubmit={(e) => { e.preventDefault(); handleUpdate(); }}>
          <div style={{ marginBottom: 12 }}>
            <label className="lt-form-label">Full Name <span className="lt-required">*</span></label>
            <input
              ref={editNameRef}
              name="name"
              className={`input ${showFormError('name') ? 'lt-input-error' : ''}`}
              value={form.name}
              onChange={handleFormChange}
              onBlur={() => handleFormBlur('name')}
              maxLength={LIMITS.name.max}
            />
            <FieldError message={showFormError('name')} />
          </div>

          <div style={{ marginBottom: 12 }}>
            <label className="lt-form-label">Role <span className="lt-required">*</span></label>
            <input
              name="role"
              className={`input ${showFormError('role') ? 'lt-input-error' : ''}`}
              value={form.role}
              onChange={handleFormChange}
              onBlur={() => handleFormBlur('role')}
              maxLength={LIMITS.role.max}
            />
            <FieldError message={showFormError('role')} />
          </div>

          <div style={{ marginBottom: 12 }}>
            <label className="lt-form-label">Email Address <span className="lt-required">*</span></label>
            <input
              name="email"
              type="email"
              className={`input ${showFormError('email') ? 'lt-input-error' : ''}`}
              value={form.email}
              onChange={handleFormChange}
              onBlur={() => handleFormBlur('email')}
              maxLength={LIMITS.email.max}
            />
            <FieldError message={showFormError('email')} />
          </div>

          <div style={{ marginBottom: 12 }}>
            <label className="lt-form-label">Qualification <span className="lt-required">*</span></label>
            <input
              name="qualification"
              className={`input ${showFormError('qualification') ? 'lt-input-error' : ''}`}
              value={form.qualification}
              onChange={handleFormChange}
              onBlur={() => handleFormBlur('qualification')}
              maxLength={LIMITS.qualification.max}
            />
            <FieldError message={showFormError('qualification')} />
          </div>

          <div style={{ marginBottom: 12 }}>
            <label className="lt-form-label">Years of Experience <span className="lt-required">*</span></label>
            <input
              name="experience"
              type="number"
              min={LIMITS.experience.min}
              max={LIMITS.experience.max}
              className={`input ${showFormError('experience') ? 'lt-input-error' : ''}`}
              value={form.experience}
              onChange={handleFormChange}
              onBlur={() => handleFormBlur('experience')}
            />
            <FieldError message={showFormError('experience')} />
          </div>

          <div style={{ marginBottom: 12 }}>
            <label className="lt-form-label">Skills <span className="lt-required">*</span></label>
            <input
              name="skills"
              className={`input ${showFormError('skills') ? 'lt-input-error' : ''}`}
              value={form.skills}
              onChange={handleFormChange}
              onBlur={() => handleFormBlur('skills')}
              maxLength={LIMITS.skills.max}
            />
            <FieldError message={showFormError('skills')} />
          </div>

          <div style={{ marginBottom: 16 }}>
            <label className="lt-form-label">Short Description</label>
            <textarea
              name="description"
              className={`input ${showFormError('description') ? 'lt-input-error' : ''}`}
              value={form.description}
              onChange={handleFormChange}
              onBlur={() => handleFormBlur('description')}
              maxLength={LIMITS.description.max}
              style={{ minHeight: 60, resize: 'vertical' }}
            />
            <FieldError message={showFormError('description')} />
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" className="btn btn-secondary flex-1" onClick={closeEditModal} disabled={savingForm}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary flex-1" disabled={savingForm}>
              {savingForm ? <><Loader2 size={14} className="spin" /> Saving...</> : 'Update Member'}
            </button>
          </div>
        </form>
      </Modal>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .spin { animation: spin 1s linear infinite; }

        .lt-form-label {
          font-size: 12px;
          font-weight: 600;
          color: var(--text-secondary);
          display: block;
          margin-bottom: 4px;
        }

        .lt-required { color: #f87171; margin-left: 2px; }

        .lt-input-error {
          border-color: #f87171 !important;
          background: rgba(248, 113, 113, 0.04) !important;
        }

        .lt-input-error:focus {
          box-shadow: 0 0 0 3px rgba(248, 113, 113, 0.12) !important;
        }

        .lt-field-error {
          display: flex;
          align-items: center;
          gap: 4px;
          font-size: 11.5px;
          font-weight: 500;
          color: #f87171;
          margin-top: 4px;
        }

        /* ─── DELETE MODAL ─── */
        .delete-modal { max-width: 520px !important; }
        .delete-icon-wrapper {
          width: 40px; height: 40px; border-radius: 50%;
          background: rgba(248, 113, 113, 0.1);
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
        }
        .delete-warning {
          display: flex; align-items: flex-start; gap: 10px;
          padding: 12px 14px;
          background: rgba(248, 113, 113, 0.06);
          border: 1px solid rgba(248, 113, 113, 0.2);
          border-radius: 10px;
          font-size: 13px; color: var(--text-secondary);
          line-height: 1.5;
        }
        .delete-warning svg { flex-shrink: 0; margin-top: 1px; }
        .assigned-tasks-list {
          background: var(--bg-secondary);
          border-radius: 10px;
          padding: 12px 14px;
          border: 1px solid var(--border-subtle);
        }
        .assigned-task-item {
          display: flex; align-items: center; gap: 8px;
          padding: 4px 0;
          border-bottom: 1px solid var(--border-subtle);
        }
        .assigned-task-item:last-child { border-bottom: none; }
        .task-dot {
          width: 6px; height: 6px; border-radius: 50%;
          background: var(--accent-primary);
          flex-shrink: 0;
        }
        .task-title { font-size: 13px; color: var(--text-primary); flex: 1; }
        .task-status-badge {
          font-size: 10px; font-weight: 600;
          padding: 1px 8px; border-radius: 12px;
        }
        .delete-options { display: flex; flex-direction: column; gap: 10px; }
        .delete-option {
          padding: 12px 14px;
          background: var(--bg-secondary);
          border: 1px solid var(--border-subtle);
          border-radius: 10px;
          transition: border-color 0.15s;
        }
        .delete-option:has(input:checked) {
          border-color: var(--accent-primary);
          background: color-mix(in srgb, var(--accent-primary) 4%, var(--bg-secondary));
        }
        .radio-label {
          display: flex; align-items: flex-start; gap: 10px;
          cursor: pointer;
        }
        .radio-label input[type="radio"] {
          margin-top: 2px;
          accent-color: var(--accent-primary);
          cursor: pointer;
        }
        .radio-label div { display: flex; flex-direction: column; gap: 2px; }
        .radio-label strong { font-size: 13px; color: var(--text-primary); }
        .radio-label span { font-size: 12px; color: var(--text-muted); }
        .reassign-select {
          margin-top: 10px;
          width: 100%;
          padding: 8px 12px;
          border-radius: 8px;
          border: 1px solid var(--border-default);
          background: var(--bg-card);
          color: var(--text-primary);
          font-size: 13px;
          outline: none;
        }
        .reassign-select:focus { border-color: var(--accent-primary); }
        .delete-footer { justify-content: space-between !important; }
        .mm-footer-btn.danger {
          background: rgba(248, 113, 113, 0.1);
          color: #f87171;
          border: 1px solid rgba(248, 113, 113, 0.3);
        }
        .mm-footer-btn.danger:hover:not(:disabled) { background: rgba(248, 113, 113, 0.2); }
        .mm-footer-btn.danger:disabled { opacity: 0.5; cursor: not-allowed; }
        .spinner-small {
          width: 16px; height: 16px;
          border: 2px solid rgba(255,255,255,0.3);
          border-top-color: #fff;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
          display: inline-block;
        }

        /* ─── MEMBER MODAL ─── */
        .member-modal-overlay {
          position: fixed; inset: 0;
          background: rgba(0, 0, 0, 0.65);
          backdrop-filter: blur(8px);
          z-index: 99999;
          display: flex; align-items: center; justify-content: center;
          padding: 20px;
          overflow-y: auto;
        }
        .member-modal {
          width: 100%; max-width: 620px; max-height: 90vh;
          overflow-y: auto;
          background: var(--bg-card);
          border: 1px solid var(--border-default);
          border-radius: 20px;
          box-shadow: 0 24px 80px rgba(0, 0, 0, 0.4);
          display: flex; flex-direction: column;
        }
        .member-modal::-webkit-scrollbar { width: 5px; }
        .member-modal::-webkit-scrollbar-track { background: transparent; }
        .member-modal::-webkit-scrollbar-thumb {
          background: var(--border-default);
          border-radius: 10px;
        }
        .mm-header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 20px 24px 16px;
          border-bottom: 1px solid var(--border-subtle);
          position: sticky; top: 0;
          background: var(--bg-card);
          border-radius: 20px 20px 0 0;
          z-index: 2;
        }
        .mm-header-left { display: flex; align-items: center; gap: 14px; }
        .mm-avatar {
          width: 56px; height: 56px; border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          font-weight: 800; font-size: 20px;
          flex-shrink: 0;
        }
        .mm-header-info { flex: 1; min-width: 0; }
        .mm-name {
          font-size: 18px; font-weight: 700;
          color: var(--text-primary);
          margin: 0 0 4px;
        }
        .mm-badges { display: flex; flex-wrap: wrap; gap: 4px; }
        .mm-close-btn {
          display: flex; align-items: center; justify-content: center;
          width: 36px; height: 36px;
          border-radius: 10px;
          border: 1px solid var(--border-subtle);
          background: var(--bg-secondary);
          color: var(--text-secondary);
          cursor: pointer;
          transition: all 0.15s;
          flex-shrink: 0;
        }
        .mm-close-btn:hover {
          border-color: var(--accent-primary);
          color: var(--accent-primary);
          background: var(--bg-primary);
        }
        .mm-body {
          padding: 20px 24px;
          display: flex; flex-direction: column; gap: 16px;
        }
        .mm-description {
          font-size: 13px;
          color: var(--text-secondary);
          line-height: 1.6;
          padding: 12px 16px;
          background: var(--bg-secondary);
          border-radius: 10px;
          border: 1px solid var(--border-subtle);
        }
        .mm-description.muted { color: var(--text-muted); }
        .mm-email {
          display: flex; align-items: center; gap: 8px;
          font-size: 13px; color: var(--text-secondary);
          padding: 6px 0;
        }
        .mm-email svg { color: var(--text-muted); }
        .mm-stats-row {
          display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px;
        }
        .mm-stat-item {
          display: flex; flex-direction: column; align-items: center;
          padding: 12px 8px;
          background: var(--bg-secondary);
          border-radius: 10px;
          border: 1px solid var(--border-subtle);
        }
        .mm-stat-value {
          font-size: 20px; font-weight: 800;
          color: var(--text-primary);
          line-height: 1.2;
        }
        .mm-stat-label {
          font-size: 10px; color: var(--text-muted);
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.4px;
        }
        .mm-section {
          background: var(--bg-secondary);
          border: 1px solid var(--border-subtle);
          border-radius: 12px;
          padding: 14px 16px;
        }
        .mm-section-title {
          display: flex; align-items: center; gap: 6px;
          font-size: 12px; font-weight: 700;
          color: var(--text-secondary);
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin: 0 0 10px;
        }
        .mm-section-title svg { color: var(--accent-primary); }
        .mm-skills { display: flex; flex-wrap: wrap; gap: 6px; }
        .mm-skill-tag {
          font-size: 11px; font-weight: 500;
          padding: 4px 12px;
          border-radius: 20px;
          background: var(--bg-card);
          border: 1px solid var(--border-subtle);
          color: var(--text-secondary);
        }
        .mm-no-data { font-size: 12px; color: var(--text-muted); padding: 4px 0; }
        .mm-project-list { display: flex; flex-direction: column; gap: 8px; }
        .mm-project-item {
          display: flex; justify-content: space-between; align-items: center;
          padding: 10px 12px;
          background: var(--bg-card);
          border-radius: 8px;
          border: 1px solid var(--border-subtle);
          gap: 10px;
        }
        .mm-project-item.completed {
          border-color: rgba(52, 211, 153, 0.2);
          background: rgba(52, 211, 153, 0.05);
        }
        .mm-project-info { flex: 1; min-width: 0; }
        .mm-project-name {
          display: block;
          font-size: 13px; font-weight: 600;
          color: var(--text-primary);
        }
        .mm-project-role { display: block; font-size: 11px; color: var(--text-muted); }
        .mm-project-status { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
        .mm-project-progress { font-size: 12px; font-weight: 700; color: var(--text-secondary); }
        .mm-timeline { display: flex; flex-direction: column; gap: 6px; }
        .mm-timeline-item { display: flex; gap: 10px; align-items: baseline; }
        .mm-tl-year {
          font-size: 11px; font-weight: 700;
          color: var(--accent-primary);
          flex-shrink: 0;
          min-width: 50px;
        }
        .mm-tl-text {
          font-size: 13px; color: var(--text-secondary);
          line-height: 1.4;
        }
        .mm-footer {
          display: flex; gap: 10px;
          padding: 14px 24px 20px;
          border-top: 1px solid var(--border-subtle);
          justify-content: flex-end;
          background: var(--bg-card);
          border-radius: 0 0 20px 20px;
        }
        .mm-footer-btn {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 8px 16px;
          border-radius: 8px;
          font-size: 13px; font-weight: 600;
          cursor: pointer;
          transition: all 0.15s;
          border: none;
        }
        .mm-footer-btn.primary {
          background: var(--accent-primary);
          color: #fff;
        }
        .mm-footer-btn.primary:hover { opacity: 0.85; transform: translateY(-1px); }
        .mm-footer-btn.secondary {
          background: var(--bg-secondary);
          color: var(--text-secondary);
          border: 1px solid var(--border-default);
        }
        .mm-footer-btn.secondary:hover {
          border-color: var(--accent-primary);
          color: var(--accent-primary);
        }

        /* Badges */
        .badge {
          display: inline-flex; align-items: center; gap: 4px;
          padding: 2px 10px;
          border-radius: 20px;
          font-size: 11px; font-weight: 600;
        }
        .badge-purple { background: rgba(129, 140, 248, 0.15); color: #818cf8; }
        .badge-green  { background: rgba(52, 211, 153, 0.15); color: #34d399; }
        .badge-blue   { background: rgba(99, 102, 241, 0.15); color: #6366f1; }
        .badge-gray   { background: var(--bg-secondary); color: var(--text-muted); border: 1px solid var(--border-subtle); }

        /* Filters */
        .lt-filters-container {
          display: flex; flex-direction: column; gap: 14px;
          margin-bottom: 24px;
          background: var(--bg-card);
          padding: 18px 20px;
          border-radius: 14px;
          border: 1px solid var(--border-subtle);
          transition: all 0.2s ease;
        }
        .lt-filters-container:focus-within {
          border-color: var(--accent-primary);
          box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.08);
        }
        .lt-search-wrapper {
          position: relative;
          display: flex; align-items: center;
          width: 100%;
        }
        .lt-search-icon {
          position: absolute; left: 14px;
          color: var(--text-muted);
          pointer-events: none;
          transition: color 0.2s;
        }
        .lt-search-wrapper:focus-within .lt-search-icon { color: var(--accent-primary); }
        .lt-search-input {
          width: 100%;
          padding: 11px 40px 11px 42px;
          border-radius: 10px;
          border: 1px solid var(--border-default);
          background: var(--bg-secondary);
          color: var(--text-primary);
          font-size: 13px;
          transition: all 0.2s ease;
          outline: none;
        }
        .lt-search-input:focus {
          border-color: var(--accent-primary);
          background: var(--bg-card);
          box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.08);
        }
        .lt-search-input::placeholder { color: var(--text-muted); }
        .lt-search-clear {
          position: absolute; right: 10px;
          display: flex; align-items: center; justify-content: center;
          width: 28px; height: 28px;
          border: none; border-radius: 50%;
          background: var(--bg-hover);
          color: var(--text-muted);
          cursor: pointer;
          transition: all 0.15s;
        }
        .lt-search-clear:hover { background: var(--border-default); color: var(--text-primary); }
        .lt-filter-controls {
          display: flex; align-items: center;
          gap: 16px; flex-wrap: wrap;
        }
        .lt-filter-group {
          display: flex; align-items: center; gap: 8px;
          flex: 1; min-width: 140px;
        }
        .lt-filter-label {
          display: flex; align-items: center; gap: 4px;
          font-size: 11px; font-weight: 600;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.04em;
          white-space: nowrap;
        }
        .lt-filter-select {
          flex: 1;
          padding: 8px 12px;
          border-radius: 8px;
          border: 1px solid var(--border-default);
          background: var(--bg-secondary);
          color: var(--text-primary);
          font-size: 12px; font-weight: 500;
          cursor: pointer; outline: none;
          transition: all 0.2s ease;
          min-width: 120px;
          appearance: none;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E");
          background-repeat: no-repeat;
          background-position: right 10px center;
          padding-right: 32px;
        }
        .lt-filter-select:hover { border-color: var(--border-strong); background-color: var(--bg-hover); }
        .lt-filter-select:focus {
          border-color: var(--accent-primary);
          background-color: var(--bg-card);
          box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.08);
        }
        .lt-active-filters {
          display: flex; align-items: center;
          gap: 6px; flex-wrap: wrap; margin-left: auto;
        }
        .lt-filter-chip {
          display: inline-flex; align-items: center; gap: 4px;
          padding: 4px 10px 4px 12px;
          border-radius: 20px;
          font-size: 11px; font-weight: 600;
          background: var(--accent-muted);
          color: var(--accent-primary);
          border: 1px solid rgba(99, 102, 241, 0.2);
          white-space: nowrap;
        }
        .lt-filter-chip button {
          display: flex; align-items: center; justify-content: center;
          padding: 2px; border: none; border-radius: 50%;
          background: transparent;
          color: var(--accent-primary);
          cursor: pointer;
          transition: all 0.15s;
        }
        .lt-filter-chip button:hover { background: rgba(239, 68, 68, 0.1); color: #ef4444; }
        .lt-results-count {
          display: flex; align-items: center; gap: 8px;
          padding-top: 12px;
          border-top: 1px solid var(--border-subtle);
          font-size: 12px; color: var(--text-muted);
          flex-wrap: wrap;
        }
        .lt-results-count span { font-weight: 500; }
        .lt-results-count .lt-results-total { color: var(--text-secondary); }
        .lt-results-dot { color: var(--border-default); }
        .lt-clear-filters-btn {
          margin-left: auto;
          padding: 4px 12px;
          border: none; border-radius: 6px;
          background: var(--bg-secondary);
          color: var(--text-secondary);
          font-size: 11px; font-weight: 500;
          cursor: pointer;
          transition: all 0.15s;
        }
        .lt-clear-filters-btn:hover { background: var(--bg-hover); color: var(--accent-primary); }

        .grid-auto {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
          gap: 16px;
        }
        .member-card {
          position: relative; cursor: pointer;
          padding: 20px;
          border-radius: 16px;
          background: var(--bg-card);
          border: 1px solid var(--border-subtle);
          transition: all 0.2s ease;
        }
        .member-card:hover {
          border-color: var(--accent-primary);
          transform: translateY(-2px);
          box-shadow: var(--shadow-md);
        }

        /* Responsive */
        @media (max-width: 768px) {
          .lt-filters-container { padding: 14px 16px; gap: 12px; }
          .lt-filter-controls { flex-direction: column; align-items: stretch; gap: 10px; }
          .lt-filter-group { min-width: 0; }
          .lt-filter-select { min-width: 0; }
          .lt-active-filters { margin-left: 0; justify-content: flex-start; }
          .lt-results-count { padding-top: 10px; flex-wrap: wrap; }
          .lt-clear-filters-btn { margin-left: 0; }
          .grid-auto { grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); }
          .member-modal { max-width: 100%; border-radius: 16px; max-height: 95vh; }
          .mm-stats-row { grid-template-columns: repeat(2, 1fr); }
          .mm-header { padding: 16px 18px; }
          .mm-body { padding: 16px 18px; }
          .mm-footer { padding: 12px 18px 16px; }
          .mm-avatar { width: 44px; height: 44px; font-size: 16px; }
          .mm-name { font-size: 16px; }
          .delete-modal { max-width: 100% !important; }
        }
        @media (max-width: 480px) {
          .lt-filters-container { padding: 12px; gap: 10px; }
          .lt-search-input { padding: 10px 36px 10px 38px; font-size: 12px; }
          .lt-filter-group { flex-direction: column; align-items: stretch; gap: 4px; }
          .lt-filter-label { font-size: 10px; }
          .lt-filter-select { padding: 7px 10px; font-size: 11px; }
          .grid-auto { grid-template-columns: 1fr; }
          .member-modal { border-radius: 12px; }
          .mm-header-left { gap: 10px; }
          .mm-stat-value { font-size: 17px; }
          .mm-project-item { flex-wrap: wrap; }
          .mm-project-status { width: 100%; justify-content: flex-start; }
          .delete-option { padding: 10px 12px; }
          .radio-label { font-size: 12px; }
        }
      `}</style>
    </div>
  );
}