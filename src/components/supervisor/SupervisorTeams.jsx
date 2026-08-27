// components/supervisor/SupervisorTeams.jsx
import { useState, useEffect } from 'react';
import { 
  Search, UserPlus, Trash2, Pencil, X, RefreshCw, Users, 
  Briefcase, GraduationCap, TrendingUp, Mail, Award, 
  CheckCircle2, Clock, AlertCircle, UserCheck, UserX
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

  // State
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [members, setMembers] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [users, setUsers] = useState([]);
  const [memberStatsMap, setMemberStatsMap] = useState({});
  const [showAdd, setShowAdd] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [selected, setSelected] = useState(null);
  const [drawer, setDrawer] = useState(null);
  const [form, setForm] = useState(defaultForm);
  const [currentPage, setCurrentPage] = useState(1);
  const [filterRole, setFilterRole] = useState('all');
  const [filterExperience, setFilterExperience] = useState('all');
  const [sortBy, setSortBy] = useState('name');
  const itemsPerPage = 6;

  // Delete/Reassign state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(null);
  const [memberToDelete, setMemberToDelete] = useState(null);
  const [assignedTasks, setAssignedTasks] = useState([]);
  const [reassignTarget, setReassignTarget] = useState('');
  const [deleteOption, setDeleteOption] = useState('reassign');
  const [isDeleting, setIsDeleting] = useState(false);

  const colors = [
    '#818cf8','#34d399','#f87171','#f59e0b',
    '#2dd4bf','#f97316','#ec4899','#a78bfa'
  ];

  // Fetch data
  useEffect(() => {
    fetchData();
  }, []);

  // Fetch stats when members change
  useEffect(() => {
    if (members.length > 0) {
      fetchMemberStats();
    }
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

      if (!Array.isArray(membersList)) {
        membersList = [];
      }

      // Filter out deleted members (is_deleted === 1)
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

  // Fetch stats for all members from backend
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
      console.log('📊 Member stats loaded:', Object.keys(statsMap).length);
    } catch (error) {
      console.error('Error fetching member stats:', error);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    toast.success('Team members refreshed');
  };

  // Remove member from all projects by deleting PTeam entries
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

  // Get member stats from cached map or compute fallback
  const getMemberStats = (memberId) => {
    const cachedStats = memberStatsMap[memberId];
    if (cachedStats && Object.keys(cachedStats).length > 0) {
      return cachedStats;
    }
    
    // Fallback: compute from tasks
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

  // Get tasks assigned to a member
  const getTasksForMember = (memberId) => {
    const stats = getMemberStats(memberId);
    return stats.tasks || [];
  };

  // Handle delete with reassign
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

      // Remove member from all projects first
      await removeMemberFromAllProjects(memberToDelete.id);

      // Then delete the member
      await teamService.deleteTeamMember(memberToDelete.id);
      
      // Remove from local state
      setMembers(prev => prev.filter(m => (m.id) !== memberToDelete.id));
      
      // Remove from stats map
      setMemberStatsMap(prev => {
        const newMap = { ...prev };
        delete newMap[memberToDelete.id];
        return newMap;
      });
      
      // Refresh data
      await fetchData();
      
      setShowDeleteConfirm(null);
      setMemberToDelete(null);
      setAssignedTasks([]);
      setReassignTarget('');
      toast.success(`Member "${memberToDelete.name}" removed successfully`);
    } catch (error) {
      console.error('Error during deletion/reassignment:', error);
      toast.error(error?.message || 'Failed to process member deletion');
    } finally {
      setIsDeleting(false);
    }
  };

  const getMemberName = (memberId) => {
    const member = members.find(m => Number(m.id) === Number(memberId));
    return member ? member.name : 'Unknown';
  };

  // Filter members
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

  // Sort members
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

  // CRUD Operations
 const handleAdd = async () => {
  const { name, role, email, qualification, experience, skills, description } = form;
  
  // Validation
  if (!name.trim()) return toast.error('Name is required');
  if (!role.trim()) return toast.error('Role is required');
  if (!email.trim()) return toast.error('Email is required');
  if (!qualification.trim()) return toast.error('Qualification is required');
  if (!experience.toString().trim()) return toast.error('Experience is required');
  if (!skills.trim()) return toast.error('Skills are required');

  try {
    // Check if user already exists
    const usersResponse = await userService.getUsers();
    const existingUsers = usersResponse?.data || usersResponse || [];
    const existingUser = existingUsers.find(u => 
      u.email?.toLowerCase() === email.trim().toLowerCase()
    );

    if (existingUser) {
      // User exists → Just add team member
      const response = await teamService.addTeamMember({
        name: name.trim(),
        role: role.trim(),
        email: email.trim(),
        qualification: qualification.trim(),
        experience: parseInt(experience) || 0,
        skills: skills.trim(),
        description: description.trim(),
        added_by: user?.id || user?.u_id || 1
      });

      const newMember = response?.data || response;
      if (newMember && newMember.id) {
        setMembers(prev => [newMember, ...prev]);
        setShowAdd(false);
        setForm(defaultForm);
        toast.success(`Team member "${name}" added to existing user!`);
        await fetchMemberStats();
      }
    } else {
      // User doesn't exist → Create both
      
      // Generate temporary password
      const tempPassword = generateSecurePassword();
      
      // Create user + team member
      const result = await teamService.createUserAndTeamMember(
        {
          u_name: name.trim(),
          email: email.trim(),
          password: tempPassword,
          role: role.trim(),
        },
        {
          name: name.trim(),
          description: description.trim(),
          skills: skills.trim(),
          role: role.trim(),
          qualification: qualification.trim(),
          experience: parseInt(experience) || 0,
        }
      );

      if (result.success) {
        setMembers(prev => [result.teamMember, ...prev]);
        setShowAdd(false);
        setForm(defaultForm);
        
        toast.success(`✅ User "${name}" created with team member profile!`);
        
        // Show temporary password (in production, send via email)
        toast.info(`📧 Temporary password: ${tempPassword} (please share with user)`);
        
        await fetchMemberStats();
      }
    }
  } catch (error) {
    console.error('Error adding member:', error);
    toast.error(error?.message || 'Failed to add team member');
  }
};

// Helper function
const generateSecurePassword = () => {
  const length = 14;
  const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
  let password = '';
  for (let i = 0; i < length; i++) {
    password += charset.charAt(Math.floor(Math.random() * charset.length));
  }
  return password;
};

  // Updated delete function - shows modal with task reassign options
  const handleDeleteClick = (member) => {
    const memberTasks = getTasksForMember(member.id);
    setMemberToDelete(member);
    setAssignedTasks(memberTasks);
    setReassignTarget('');
    setDeleteOption(memberTasks.length > 0 ? 'reassign' : 'reassign');
    setShowDeleteConfirm(true);
  };

  // ✅ FIXED: handleDelete without NotificationHelper
  const handleDelete = async () => {
    if (assignedTasks.length === 0) {
      try {
        // Remove member from all projects first
        await removeMemberFromAllProjects(memberToDelete.id);
        
        // Then delete the member
        await teamService.deleteTeamMember(memberToDelete.id);
        setMembers(prev => prev.filter(m => (m.id) !== memberToDelete.id));
        
        // Remove from stats map
        setMemberStatsMap(prev => {
          const newMap = { ...prev };
          delete newMap[memberToDelete.id];
          return newMap;
        });
        
        // Refresh data
        await fetchData();
        
        setShowDeleteConfirm(null);
        setMemberToDelete(null);
        toast.success(`Member "${memberToDelete.name}" removed successfully`);
      } catch (error) {
        console.error('Error deleting member:', error);
        toast.error(error?.message || 'Failed to delete member');
      }
    } else {
      handleDeleteWithReassign();
    }
  };

  const openEdit = (member) => {
    setSelected(member);
    setForm({
      name: member.name || '',
      role: member.role || '',
      email: member.email || '',
      qualification: member.qualitifcation || member.qualification || '',
      experience: member.experience || '',
      skills: member.skills || '',
      description: member.desc || member.description || ''
    });
    setShowEdit(true);
  };

  const handleUpdate = async () => {
    const { name, role, email, qualification, experience, skills, description } = form;
    if (!name.trim()) return toast.error('Name is required');
    if (!role.trim()) return toast.error('Role is required');

    try {
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

      setMembers(members.map(m => 
        (m.id) === (selected.id) ? updatedMember : m
      ));
      setShowEdit(false);
      setSelected(null);
      setForm(defaultForm);
      toast.success('Member updated successfully');
      
      // Refresh stats for updated member
      await fetchMemberStats();
    } catch (error) {
      console.error('Error updating member:', error);
      toast.error(error?.message || 'Failed to update member');
    }
  };

  const handleFormChange = (e) => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
  };

  const closeAddModal = () => { setShowAdd(false); setForm(defaultForm); };
  const closeEditModal = () => { setShowEdit(false); setSelected(null); setForm(defaultForm); };

  const getUserById = (id) => {
    return users.find(u => (u.id || u.u_id) === id);
  };

  const getInitials = (name) => {
    if (!name) return '?';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

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
        {/* Header Actions */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
          <button
            className="btn btn-primary btn-sm"
            onClick={() => setShowAdd(true)}
          >
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
              <div className="lt-filter-label">
                <Briefcase size={12} />
                <span>Role</span>
              </div>
              <select 
                className="lt-filter-select" 
                value={filterRole} 
                onChange={e => setFilterRole(e.target.value)}
              >
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
              <div className="lt-filter-label">
                <GraduationCap size={12} />
                <span>Experience</span>
              </div>
              <select 
                className="lt-filter-select" 
                value={filterExperience} 
                onChange={e => setFilterExperience(e.target.value)}
              >
                <option value="all">All Experience</option>
                <option value="0-1">🌱 0-1 yrs</option>
                <option value="2-4">🌿 2-4 yrs</option>
                <option value="5+">🌳 5+ yrs</option>
              </select>
            </div>

            <div className="lt-filter-group">
              <div className="lt-filter-label">
                <TrendingUp size={12} />
                <span>Sort</span>
              </div>
              <select 
                className="lt-filter-select" 
                value={sortBy} 
                onChange={e => setSortBy(e.target.value)}
              >
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
                    <button onClick={() => setFilterRole('all')}>
                      <X size={12} />
                    </button>
                  </span>
                )}
                {filterExperience !== 'all' && (
                  <span className="lt-filter-chip">
                    {filterExperience} yrs
                    <button onClick={() => setFilterExperience('all')}>
                      <X size={12} />
                    </button>
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
              const addedBy = getUserById(member.added_by);
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
                    >
                      <Pencil size={14} />
                    </button>
                    <button 
                      className="btn btn-danger btn-icon" 
                      style={{ padding: 4, borderRadius: 8 }}
                      onClick={(e) => { e.stopPropagation(); handleDeleteClick(member); }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>

                  <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                    <div style={{
                      width: 56,
                      height: 56,
                      borderRadius: '50%',
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
                    <div style={{ flex: 1 }}>
                      <h3 style={{ fontWeight: 700, fontSize: 15, marginBottom: 2 }}>
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
                    display: 'flex', 
                    background: 'var(--bg-secondary)', 
                    borderRadius: 10, 
                    border: '1px solid var(--border-subtle)',
                    marginTop: 12
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
          <div style={{
            display: 'flex',
            justifyContent: 'center',
            marginTop: 24,
            gap: 8,
            flexWrap: 'wrap'
          }}>
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

      {/* ── MEMBER DETAIL MODAL POPUP ── */}
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
                {/* HEADER */}
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

                {/* BODY */}
                <div className="mm-body">
                  {/* Description */}
                  {drawer.desc || drawer.description ? (
                    <div className="mm-description">
                      {drawer.desc || drawer.description}
                    </div>
                  ) : (
                    <div className="mm-description muted">
                      {drawer.role === 'Frontend Developer' ? "Frontend specialist focused on building responsive and interactive UI components with React and modern design systems." :
                       drawer.role === 'Backend Developer' ? "Backend engineer responsible for API development, database optimization, and server-side logic implementation." :
                       drawer.role === 'UI Engineer' ? "UI-focused developer ensuring clean, user-friendly, and visually consistent interfaces across the application." :
                       drawer.role === 'Full Stack Developer' ? "Full-stack developer experienced in both frontend and backend development, building scalable web applications." :
                       "A skilled software developer contributing to system design, development, and maintenance across multiple modules."}
                    </div>
                  )}

                  {/* Email */}
                  {drawer.email && (
                    <div className="mm-email">
                      <Mail size={14} />
                      <span>{drawer.email}</span>
                    </div>
                  )}

                  {/* STATS ROW */}
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

                  {/* SKILLS */}
                  <div className="mm-section">
                    <h4 className="mm-section-title">
                      <Award size={14} /> Skills
                    </h4>
                    <div className="mm-skills">
                      {(drawer.skills || '').split(',').filter(s => s.trim()).map((s, i) => (
                        <span key={`skill-${i}`} className="mm-skill-tag">
                          {s.trim()}
                        </span>
                      ))}
                      {(!drawer.skills || drawer.skills.split(',').filter(s => s.trim()).length === 0) && (
                        <span className="mm-no-data">No skills listed</span>
                      )}
                    </div>
                  </div>

                  {/* CURRENT PROJECTS */}
                  <div className="mm-section">
                    <h4 className="mm-section-title">
                      <Briefcase size={14} /> Current Projects
                    </h4>
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

                  {/* COMPLETED PROJECTS */}
                  <div className="mm-section">
                    <h4 className="mm-section-title">
                      <CheckCircle2 size={14} /> Completed Projects
                    </h4>
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

                  {/* WORK TIMELINE */}
                  <div className="mm-section">
                    <h4 className="mm-section-title">
                      <Clock size={14} /> Work Timeline
                    </h4>
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

                {/* FOOTER */}
                <div className="mm-footer">
                  <button 
                    className="mm-footer-btn secondary"
                    onClick={() => setDrawer(null)}
                  >
                    Close
                  </button>
                  <button 
                    className="mm-footer-btn primary"
                    onClick={() => { openEdit(drawer); setDrawer(null); }}
                  >
                    <Pencil size={14} /> Edit Member
                  </button>
                </div>
              </motion.div>
            </motion.div>
          );
        })()}
      </AnimatePresence>

      {/* ─── DELETE CONFIRM WITH REASSIGN MODAL ─── */}
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
                {/* Assigned Tasks Warning */}
                {assignedTasks.length > 0 ? (
                  <>
                    <div className="delete-warning">
                      <AlertCircle size={18} />
                      <span>
                        This member has <strong>{assignedTasks.length}</strong> task{assignedTasks.length > 1 ? 's' : ''} assigned.
                        Please choose how to handle them:
                      </span>
                    </div>

                    {/* Task List */}
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

                    {/* Options */}
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

      {/* ADD MODAL */}
      <Modal isOpen={showAdd} onClose={closeAddModal} title="Add New Team Member">
        <form onSubmit={(e) => { e.preventDefault(); handleAdd(); }}>
          <input 
            name="name" 
            placeholder="Full Name *" 
            value={form.name} 
            onChange={handleFormChange} 
            className="input" 
            style={{ marginBottom: 12 }} 
            required
          />
          <textarea
            name="description"
            placeholder="Short Description"
            value={form.description}
            onChange={handleFormChange}
            className="input"
            style={{ marginBottom: 12, minHeight: 80 }}
          />
          <input 
            name="role" 
            placeholder="Role *" 
            value={form.role} 
            onChange={handleFormChange} 
            className="input" 
            style={{ marginBottom: 12 }} 
            required
          />
          <input 
            name="email" 
            type="email" 
            placeholder="Email Address *" 
            value={form.email} 
            onChange={handleFormChange} 
            className="input" 
            style={{ marginBottom: 12 }} 
            required
          />
          <input 
            name="qualification" 
            placeholder="Qualification *" 
            value={form.qualification} 
            onChange={handleFormChange} 
            className="input" 
            style={{ marginBottom: 12 }} 
            required
          />
          <input 
            name="experience" 
            type="number" 
            placeholder="Years of Experience *" 
            value={form.experience} 
            onChange={handleFormChange} 
            className="input" 
            style={{ marginBottom: 12 }} 
            required
          />
          <input 
            name="skills" 
            placeholder="Skills (comma separated) *" 
            value={form.skills} 
            onChange={handleFormChange} 
            className="input" 
            style={{ marginBottom: 20 }} 
            required
          />
          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" className="btn btn-secondary flex-1" onClick={closeAddModal}>Cancel</button>
            <button type="submit" className="btn btn-primary flex-1">Add Member</button>
          </div>
        </form>
      </Modal>

      {/* EDIT MODAL - WITH REQUIRED FIELD INDICATORS */}
      <Modal isOpen={showEdit} onClose={closeEditModal} title="Edit Team Member">
        <form onSubmit={(e) => { e.preventDefault(); handleUpdate(); }}>
          <div style={{ marginBottom: 4 }}>
            <label className="form-label">Full Name <span className="required-star">*</span></label>
            <input 
              name="name" 
              placeholder="Full Name" 
              value={form.name} 
              onChange={handleFormChange} 
              className="input" 
              style={{ marginBottom: 8 }} 
              required
            />
          </div>
          <div style={{ marginBottom: 4 }}>
            <label className="form-label">Short Description</label>
            <textarea
              name="description"
              placeholder="Short Description"
              value={form.description}
              onChange={handleFormChange}
              className="input"
              style={{ marginBottom: 8, minHeight: 60 }}
            />
          </div>
          <div style={{ marginBottom: 4 }}>
            <label className="form-label">Role <span className="required-star">*</span></label>
            <input 
              name="role" 
              placeholder="Role" 
              value={form.role} 
              onChange={handleFormChange} 
              className="input" 
              style={{ marginBottom: 8 }} 
              required
            />
          </div>
          <div style={{ marginBottom: 4 }}>
            <label className="form-label">Email Address</label>
            <input 
              name="email" 
              type="email" 
              placeholder="Email Address" 
              value={form.email} 
              onChange={handleFormChange} 
              className="input" 
              style={{ marginBottom: 8 }} 
            />
          </div>
          <div style={{ marginBottom: 4 }}>
            <label className="form-label">Qualification</label>
            <input 
              name="qualification" 
              placeholder="Qualification" 
              value={form.qualification} 
              onChange={handleFormChange} 
              className="input" 
              style={{ marginBottom: 8 }} 
            />
          </div>
          <div style={{ marginBottom: 4 }}>
            <label className="form-label">Years of Experience</label>
            <input 
              name="experience" 
              type="number" 
              placeholder="Years of Experience" 
              value={form.experience} 
              onChange={handleFormChange} 
              className="input" 
              style={{ marginBottom: 8 }} 
            />
          </div>
          <div style={{ marginBottom: 4 }}>
            <label className="form-label">Skills (comma separated)</label>
            <input 
              name="skills" 
              placeholder="Skills (comma separated)" 
              value={form.skills} 
              onChange={handleFormChange} 
              className="input" 
              style={{ marginBottom: 16 }} 
            />
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" className="btn btn-secondary flex-1" onClick={closeEditModal}>Cancel</button>
            <button type="submit" className="btn btn-primary flex-1">Update Member</button>
          </div>
        </form>
      </Modal>

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        .spin { animation: spin 1s linear infinite; }

        .required-star {
          color: #f87171;
          margin-left: 2px;
        }

        .form-label {
          font-size: 12px;
          font-weight: 600;
          color: var(--text-secondary);
          display: block;
          margin-bottom: 4px;
        }

        /* ─── DELETE MODAL STYLES ─── */
        .delete-modal {
          max-width: 520px !important;
        }

        .delete-icon-wrapper {
          width: 40px;
          height: 40px;
          border-radius: 50%;
          background: rgba(248, 113, 113, 0.1);
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .delete-warning {
          display: flex;
          align-items: flex-start;
          gap: 10px;
          padding: 12px 14px;
          background: rgba(248, 113, 113, 0.06);
          border: 1px solid rgba(248, 113, 113, 0.2);
          border-radius: 10px;
          font-size: 13px;
          color: var(--text-secondary);
          line-height: 1.5;
        }

        .delete-warning svg {
          flex-shrink: 0;
          margin-top: 1px;
        }

        .assigned-tasks-list {
          background: var(--bg-secondary);
          border-radius: 10px;
          padding: 12px 14px;
          border: 1px solid var(--border-subtle);
        }

        .assigned-task-item {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 4px 0;
          border-bottom: 1px solid var(--border-subtle);
        }

        .assigned-task-item:last-child {
          border-bottom: none;
        }

        .task-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: var(--accent-primary);
          flex-shrink: 0;
        }

        .task-title {
          font-size: 13px;
          color: var(--text-primary);
          flex: 1;
        }

        .task-status-badge {
          font-size: 10px;
          font-weight: 600;
          padding: 1px 8px;
          border-radius: 12px;
        }

        .delete-options {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

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
          display: flex;
          align-items: flex-start;
          gap: 10px;
          cursor: pointer;
        }

        .radio-label input[type="radio"] {
          margin-top: 2px;
          accent-color: var(--accent-primary);
          cursor: pointer;
        }

        .radio-label div {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .radio-label strong {
          font-size: 13px;
          color: var(--text-primary);
        }

        .radio-label span {
          font-size: 12px;
          color: var(--text-muted);
        }

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

        .reassign-select:focus {
          border-color: var(--accent-primary);
        }

        .delete-footer {
          justify-content: space-between !important;
        }

        .mm-footer-btn.danger {
          background: rgba(248, 113, 113, 0.1);
          color: #f87171;
          border: 1px solid rgba(248, 113, 113, 0.3);
        }

        .mm-footer-btn.danger:hover:not(:disabled) {
          background: rgba(248, 113, 113, 0.2);
        }

        .mm-footer-btn.danger:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .spinner-small {
          width: 16px;
          height: 16px;
          border: 2px solid rgba(255,255,255,0.3);
          border-top-color: #fff;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
          display: inline-block;
        }

        /* ─── MEMBER MODAL ─── */
        .member-modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.65);
          backdrop-filter: blur(8px);
          z-index: 99999;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
          overflow-y: auto;
        }

        .member-modal {
          width: 100%;
          max-width: 620px;
          max-height: 90vh;
          overflow-y: auto;
          background: var(--bg-card);
          border: 1px solid var(--border-default);
          border-radius: 20px;
          box-shadow: 0 24px 80px rgba(0, 0, 0, 0.4);
          display: flex;
          flex-direction: column;
        }

        .member-modal::-webkit-scrollbar {
          width: 5px;
        }
        .member-modal::-webkit-scrollbar-track {
          background: transparent;
        }
        .member-modal::-webkit-scrollbar-thumb {
          background: var(--border-default);
          border-radius: 10px;
        }

        .mm-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 20px 24px 16px;
          border-bottom: 1px solid var(--border-subtle);
          position: sticky;
          top: 0;
          background: var(--bg-card);
          border-radius: 20px 20px 0 0;
          z-index: 2;
        }

        .mm-header-left {
          display: flex;
          align-items: center;
          gap: 14px;
        }

        .mm-avatar {
          width: 56px;
          height: 56px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 800;
          font-size: 20px;
          flex-shrink: 0;
        }

        .mm-header-info {
          flex: 1;
          min-width: 0;
        }

        .mm-name {
          font-size: 18px;
          font-weight: 700;
          color: var(--text-primary);
          margin: 0 0 4px;
        }

        .mm-badges {
          display: flex;
          flex-wrap: wrap;
          gap: 4px;
        }

        .mm-close-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 36px;
          height: 36px;
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
          display: flex;
          flex-direction: column;
          gap: 16px;
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

        .mm-description.muted {
          color: var(--text-muted);
        }

        .mm-email {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 13px;
          color: var(--text-secondary);
          padding: 6px 0;
        }

        .mm-email svg {
          color: var(--text-muted);
        }

        .mm-stats-row {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 8px;
        }

        .mm-stat-item {
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 12px 8px;
          background: var(--bg-secondary);
          border-radius: 10px;
          border: 1px solid var(--border-subtle);
        }

        .mm-stat-value {
          font-size: 20px;
          font-weight: 800;
          color: var(--text-primary);
          line-height: 1.2;
        }

        .mm-stat-label {
          font-size: 10px;
          color: var(--text-muted);
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
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 12px;
          font-weight: 700;
          color: var(--text-secondary);
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin: 0 0 10px;
        }

        .mm-section-title svg {
          color: var(--accent-primary);
        }

        .mm-skills {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }

        .mm-skill-tag {
          font-size: 11px;
          font-weight: 500;
          padding: 4px 12px;
          border-radius: 20px;
          background: var(--bg-card);
          border: 1px solid var(--border-subtle);
          color: var(--text-secondary);
        }

        .mm-no-data {
          font-size: 12px;
          color: var(--text-muted);
          padding: 4px 0;
        }

        .mm-project-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .mm-project-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
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

        .mm-project-info {
          flex: 1;
          min-width: 0;
        }

        .mm-project-name {
          display: block;
          font-size: 13px;
          font-weight: 600;
          color: var(--text-primary);
        }

        .mm-project-role {
          display: block;
          font-size: 11px;
          color: var(--text-muted);
        }

        .mm-project-status {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-shrink: 0;
        }

        .mm-project-progress {
          font-size: 12px;
          font-weight: 700;
          color: var(--text-secondary);
        }

        .mm-timeline {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .mm-timeline-item {
          display: flex;
          gap: 10px;
          align-items: baseline;
        }

        .mm-tl-year {
          font-size: 11px;
          font-weight: 700;
          color: var(--accent-primary);
          flex-shrink: 0;
          min-width: 50px;
        }

        .mm-tl-text {
          font-size: 13px;
          color: var(--text-secondary);
          line-height: 1.4;
        }

        .mm-footer {
          display: flex;
          gap: 10px;
          padding: 14px 24px 20px;
          border-top: 1px solid var(--border-subtle);
          justify-content: flex-end;
          background: var(--bg-card);
          border-radius: 0 0 20px 20px;
        }

        .mm-footer-btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 8px 16px;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.15s;
          border: none;
        }

        .mm-footer-btn.primary {
          background: var(--accent-primary);
          color: #fff;
        }

        .mm-footer-btn.primary:hover {
          opacity: 0.85;
          transform: translateY(-1px);
        }

        .mm-footer-btn.secondary {
          background: var(--bg-secondary);
          color: var(--text-secondary);
          border: 1px solid var(--border-default);
        }

        .mm-footer-btn.secondary:hover {
          border-color: var(--accent-primary);
          color: var(--accent-primary);
        }

        /* Badge styles */
        .badge {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 2px 10px;
          border-radius: 20px;
          font-size: 11px;
          font-weight: 600;
        }

        .badge-purple {
          background: rgba(129, 140, 248, 0.15);
          color: #818cf8;
        }

        .badge-green {
          background: rgba(52, 211, 153, 0.15);
          color: #34d399;
        }

        .badge-blue {
          background: rgba(99, 102, 241, 0.15);
          color: #6366f1;
        }

        .badge-gray {
          background: var(--bg-secondary);
          color: var(--text-muted);
          border: 1px solid var(--border-subtle);
        }

        /* Filters */
        .lt-filters-container {
          display: flex;
          flex-direction: column;
          gap: 14px;
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
          display: flex;
          align-items: center;
          width: 100%;
        }

        .lt-search-icon {
          position: absolute;
          left: 14px;
          color: var(--text-muted);
          pointer-events: none;
          transition: color 0.2s;
        }

        .lt-search-wrapper:focus-within .lt-search-icon {
          color: var(--accent-primary);
        }

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

        .lt-search-input::placeholder {
          color: var(--text-muted);
        }

        .lt-search-clear {
          position: absolute;
          right: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 28px;
          height: 28px;
          border: none;
          border-radius: 50%;
          background: var(--bg-hover);
          color: var(--text-muted);
          cursor: pointer;
          transition: all 0.15s;
        }

        .lt-search-clear:hover {
          background: var(--border-default);
          color: var(--text-primary);
        }

        .lt-filter-controls {
          display: flex;
          align-items: center;
          gap: 16px;
          flex-wrap: wrap;
        }

        .lt-filter-group {
          display: flex;
          align-items: center;
          gap: 8px;
          flex: 1;
          min-width: 140px;
        }

        .lt-filter-label {
          display: flex;
          align-items: center;
          gap: 4px;
          font-size: 11px;
          font-weight: 600;
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
          font-size: 12px;
          font-weight: 500;
          cursor: pointer;
          outline: none;
          transition: all 0.2s ease;
          min-width: 120px;
          appearance: none;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E");
          background-repeat: no-repeat;
          background-position: right 10px center;
          padding-right: 32px;
        }

        .lt-filter-select:hover {
          border-color: var(--border-strong);
          background-color: var(--bg-hover);
        }

        .lt-filter-select:focus {
          border-color: var(--accent-primary);
          background-color: var(--bg-card);
          box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.08);
        }

        .lt-active-filters {
          display: flex;
          align-items: center;
          gap: 6px;
          flex-wrap: wrap;
          margin-left: auto;
        }

        .lt-filter-chip {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 4px 10px 4px 12px;
          border-radius: 20px;
          font-size: 11px;
          font-weight: 600;
          background: var(--accent-muted);
          color: var(--accent-primary);
          border: 1px solid rgba(99, 102, 241, 0.2);
          white-space: nowrap;
        }

        .lt-filter-chip button {
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 2px;
          border: none;
          border-radius: 50%;
          background: transparent;
          color: var(--accent-primary);
          cursor: pointer;
          transition: all 0.15s;
        }

        .lt-filter-chip button:hover {
          background: rgba(239, 68, 68, 0.1);
          color: #ef4444;
        }

        .lt-results-count {
          display: flex;
          align-items: center;
          gap: 8px;
          padding-top: 12px;
          border-top: 1px solid var(--border-subtle);
          font-size: 12px;
          color: var(--text-muted);
          flex-wrap: wrap;
        }

        .lt-results-count span {
          font-weight: 500;
        }

        .lt-results-count .lt-results-total {
          color: var(--text-secondary);
        }

        .lt-results-dot {
          color: var(--border-default);
        }

        .lt-clear-filters-btn {
          margin-left: auto;
          padding: 4px 12px;
          border: none;
          border-radius: 6px;
          background: var(--bg-secondary);
          color: var(--text-secondary);
          font-size: 11px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.15s;
        }

        .lt-clear-filters-btn:hover {
          background: var(--bg-hover);
          color: var(--accent-primary);
        }

        .grid-auto {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
          gap: 16px;
        }

        .member-card {
          position: relative;
          cursor: pointer;
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
          .lt-filters-container {
            padding: 14px 16px;
            gap: 12px;
          }

          .lt-filter-controls {
            flex-direction: column;
            align-items: stretch;
            gap: 10px;
          }

          .lt-filter-group {
            min-width: 0;
          }

          .lt-filter-select {
            min-width: 0;
          }

          .lt-active-filters {
            margin-left: 0;
            justify-content: flex-start;
          }

          .lt-results-count {
            padding-top: 10px;
            flex-wrap: wrap;
          }

          .lt-clear-filters-btn {
            margin-left: 0;
          }

          .grid-auto {
            grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
          }

          .member-modal {
            max-width: 100%;
            border-radius: 16px;
            max-height: 95vh;
          }

          .mm-stats-row {
            grid-template-columns: repeat(2, 1fr);
          }

          .mm-header {
            padding: 16px 18px;
          }

          .mm-body {
            padding: 16px 18px;
          }

          .mm-footer {
            padding: 12px 18px 16px;
          }

          .mm-avatar {
            width: 44px;
            height: 44px;
            font-size: 16px;
          }

          .mm-name {
            font-size: 16px;
          }

          .delete-modal {
            max-width: 100% !important;
          }
        }

        @media (max-width: 480px) {
          .lt-filters-container {
            padding: 12px;
            gap: 10px;
          }

          .lt-search-input {
            padding: 10px 36px 10px 38px;
            font-size: 12px;
          }

          .lt-filter-group {
            flex-direction: column;
            align-items: stretch;
            gap: 4px;
          }

          .lt-filter-label {
            font-size: 10px;
          }

          .lt-filter-select {
            padding: 7px 10px;
            font-size: 11px;
          }

          .grid-auto {
            grid-template-columns: 1fr;
          }

          .member-modal {
            border-radius: 12px;
          }

          .mm-header-left {
            gap: 10px;
          }

          .mm-stat-value {
            font-size: 17px;
          }

          .mm-project-item {
            flex-wrap: wrap;
          }

          .mm-project-status {
            width: 100%;
            justify-content: flex-start;
          }

          .delete-option {
            padding: 10px 12px;
          }

          .radio-label {
            font-size: 12px;
          }
        }
      `}</style>
    </div>
  );
}