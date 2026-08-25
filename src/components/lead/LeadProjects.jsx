// components/lead/LeadProjects.jsx
import { useState, useEffect } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import {
  Search, FolderOpen, Plus, Pencil, Trash2,
  X, ListTodo, Milestone, ChevronDown,
  Users, Check, RefreshCw, Filter, Flag,
  Clock, Calendar, ArrowUpRight, TrendingUp,
  Crown, UserPlus, UserCheck
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

const PRIORITY_OPTIONS = ['low', 'medium', 'high', 'critical'];
const STATUS_OPTIONS = ['planning', 'active', 'on_hold', 'completed', 'cancelled'];

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
              const key = m.id || Math.random().toString();
              return (
                <span key={key} className="lp-member-chip">
                  <span className="lp-member-avatar-sm">{(m.name || '?')[0].toUpperCase()}</span>
                  {m.name}
                  <button type="button" className="lp-chip-remove"
                    onClick={e => { e.stopPropagation(); toggle(m.id); }}>
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
                const key = m.id || Math.random().toString();
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

/* ─── Members panel ─── */
function ProjectMembersPanel({ members, onEdit }) {
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
              const key = m.id || Math.random().toString();
              return (
                <div key={key} className="lp-member-row">
                  <span className="lp-member-avatar">{(m.name || '?')[0].toUpperCase()}</span>
                  <span style={{ fontSize: 13 }}>{m.name}</span>
                </div>
              );
            })}
          </div>
        )
      }
    </div>
  );
}

export default function LeadProjects() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { onMenuClick } = useOutletContext();

  // State
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [projects, setProjects] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [teamMembers, setTeamMembers] = useState([]);
  const [users, setUsers] = useState([]);
  const [pteamEntries, setPteamEntries] = useState([]);
  const [allSupervisors, setAllSupervisors] = useState([]);
  const [projectStatsMap, setProjectStatsMap] = useState({});

  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterPriority, setFilterPriority] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 6;

  // Modal states
  const [projectModal, setProjectModal] = useState(false);
  const [taskAddModal, setTaskAddModal] = useState(null);
  const [editProject, setEditProject] = useState(null);
  const [taskListModal, setTaskListModal] = useState(null);
  const [selectedTask, setSelectedTask] = useState(null);
  const [editTask, setEditTask] = useState(null);
  const [deleteTaskId, setDeleteTaskId] = useState(null);
  const [deleteProjectId, setDeleteProjectId] = useState(null);
  const [editMembersFor, setEditMembersFor] = useState(null);

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
    milestoneOwner: [],
    progress: 0
  });

  // Fetch data
  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      
      const [projectsData, tasksData, membersData, usersData, pteamData] = await Promise.all([
        projectService.getProjects(),
        taskService.getTasks(),
        teamService.getTeamMembers(),
        userService.getUsers(),
        projectTeamService.getProjectTeams(),
      ]);

      console.log('📊 All Projects Data:', projectsData);
      
      const projectsList = projectsData?.data || projectsData || [];
      const tasksList = tasksData?.data || tasksData || [];
      const membersList = membersData?.data || membersData || [];
      const usersList = usersData?.data || usersData || [];
      const pteamList = pteamData?.data || pteamData || [];

      const userId = user?.id || user?.u_id;
      const userName = user?.u_name || 'Unknown';
      
      console.log(`👤 Current user: ${userName} (ID: ${userId})`);

      // ✅ IMPORTANT: Ensure current user is in teamMembers list
      let activeMembersList = membersList.filter(m => m.is_deleted !== 1);
      
      const currentUserInMembers = activeMembersList.some(m => Number(m.id) === Number(userId));
      if (!currentUserInMembers && userId) {
        const userObj = usersList.find(u => Number(u.id) === Number(userId));
        if (userObj) {
          activeMembersList.push({
            id: userId,
            name: userObj.u_name || userObj.name || 'User',
            email: userObj.email,
            role: userObj.role,
            is_deleted: 0,
          });
          console.log(`✅ Added current user ${userName} (ID: ${userId}) to teamMembers list`);
        }
      }

      // ✅ Get supervisors
      const supervisors = usersList.filter(u => 
        u.role === 'manager' || u.role === 'admin' || u.role === 'supervisor'
      );
      setAllSupervisors(supervisors);

      // ✅ For leads: Show only projects they created OR are added to via PTeam
      const userProjects = projectsList.filter(p => {
        const isCreator = Number(p.created_by) === Number(userId);
        const isMember = pteamList.some(pteam => 
          Number(pteam.p) === Number(p.p_id || p.id) && 
          Number(pteam.tm) === Number(userId)
        );
        return isCreator || isMember;
      });

      // ✅ Map project members from PTeam entries with deduplication
      const projectsWithMembers = userProjects.map(project => {
        const projectId = project.p_id || project.id;
        
        const projectPteamEntries = pteamList.filter(entry => Number(entry.p) === Number(projectId));
        
        const memberMap = new Map();
        projectPteamEntries.forEach(entry => {
          let member = activeMembersList.find(m => Number(m.id) === Number(entry.tm));
          
          if (!member) {
            const userObj = usersList.find(u => Number(u.id) === Number(entry.tm));
            if (userObj) {
              member = {
                id: userObj.id,
                name: userObj.u_name || userObj.name || 'Unknown',
                email: userObj.email,
                role: userObj.role,
                is_deleted: 0,
              };
            }
          }
          
          if (member && member.is_deleted !== 1) {
            if (!memberMap.has(member.id)) {
              memberMap.set(member.id, {
                ...member,
                pt_id: entry.pt_id,
                task_id: entry.t,
              });
            }
          }
        });
        
        const projectMembers = Array.from(memberMap.values());

        const supervisorMembers = projectMembers.filter(m => {
          if (m.role && (m.role === 'manager' || m.role === 'admin' || m.role === 'supervisor')) {
            return true;
          }
          const userObj = usersList.find(u => Number(u.id) === Number(m.id));
          return userObj && (userObj.role === 'manager' || userObj.role === 'admin' || userObj.role === 'supervisor');
        });

        const regularMembers = projectMembers.filter(m => {
          if (m.role && (m.role === 'manager' || m.role === 'admin' || m.role === 'supervisor')) {
            return false;
          }
          const userObj = usersList.find(u => Number(u.id) === Number(m.id));
          return !(userObj && (userObj.role === 'manager' || userObj.role === 'admin' || userObj.role === 'supervisor'));
        });

        return {
          ...project,
          members: projectMembers,
          supervisorMembers: supervisorMembers,
          regularMembers: regularMembers,
          memberIds: [...new Set(projectMembers.map(m => m.id))],
          supervisorIds: [...new Set(supervisorMembers.map(m => m.id))],
        };
      });

      console.log(`✅ ${userName} has access to ${projectsWithMembers.length} projects`);

      setProjects(projectsWithMembers);
      setTasks(tasksList);
      setTeamMembers(activeMembersList);
      setUsers(usersList);
      setPteamEntries(pteamList);

      // ✅ Fetch stats for all projects
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

    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Failed to load projects');
      setProjects([]);
      setTasks([]);
      setTeamMembers([]);
      setUsers([]);
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

  // Filter and pagination
  const filtered = projects.filter(p => {
    const searchMatch = (p.p_name || p.name || '')?.toLowerCase().includes(search.toLowerCase()) || 
                       (p.desc || p.description || '')?.toLowerCase().includes(search.toLowerCase());
    const statusMatch = filterStatus === 'all' || p.status === filterStatus;
    const priorityMatch = filterPriority === 'all' || p.priority === filterPriority;
    return searchMatch && statusMatch && priorityMatch;
  });

  const totalPages = Math.ceil(filtered.length / itemsPerPage);
  const paginatedProjects = filtered.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

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
    setProjectModal(true);
  };

  const handleSaveProject = async () => {
    if (!form.name.trim()) {
      toast.error('Project name is required');
      return;
    }

    if (form.supervisors.length === 0) {
      toast.error('Please select at least one supervisor for the project');
      return;
    }

    try {
      const userId = user?.id || user?.u_id || null;
      
      const projectData = {
        name: form.name,
        description: form.description,
        priority: form.priority,
        status: form.status,
        startDate: form.startDate || null,
        deadline: form.deadline || null,
        created_by: userId,
      };

      console.log('📤 Saving project with payload:', projectData);
      console.log('📤 Selected supervisors (User IDs):', form.supervisors);
      console.log('📤 Selected members (User IDs):', form.members);

      const uniqueSupervisors = [...new Set(form.supervisors)];
      const uniqueMembers = [...new Set(form.members)];

      console.log('📤 Deduplicated supervisor IDs:', uniqueSupervisors);
      console.log('📤 Deduplicated member IDs:', uniqueMembers);

      let createdProject;
      if (editProject) {
        const updated = await projectService.updateProject(
          editProject.p_id || editProject.id, 
          projectData
        );
        createdProject = updated?.data || updated;
        const projectId = createdProject.p_id || createdProject.id;
        
        const currentPteam = pteamEntries.filter(entry => Number(entry.p) === Number(projectId));
        
        const currentSupervisorIds = [...new Set(
          currentPteam
            .filter(entry => {
              const member = teamMembers.find(m => Number(m.id) === Number(entry.tm));
              const userObj = users.find(u => Number(u.id) === Number(member?.id));
              return userObj && (userObj.role === 'manager' || userObj.role === 'admin' || userObj.role === 'supervisor');
            })
            .map(entry => Number(entry.tm))
        )];
        
        const currentMemberIds = [...new Set(currentPteam.map(entry => Number(entry.tm)))];
        
        const newSupervisorIds = [...new Set(
          uniqueSupervisors
            .map(userId => {
              let teamMember = teamMembers.find(m => Number(m.id) === Number(userId));
              return teamMember ? Number(teamMember.id) : Number(userId);
            })
            .filter(id => id !== null && !isNaN(id))
        )];
        
        const newMemberIds = [...new Set(
          uniqueMembers
            .map(userId => {
              let teamMember = teamMembers.find(m => Number(m.id) === Number(userId));
              return teamMember ? Number(teamMember.id) : Number(userId);
            })
            .filter(id => id !== null && !isNaN(id))
        )];
        
        console.log('📤 New supervisor TeamMember IDs:', newSupervisorIds);
        console.log('📤 New member TeamMember IDs:', newMemberIds);
        
        for (const tmId of newSupervisorIds) {
          if (!currentSupervisorIds.includes(tmId)) {
            try {
              await projectTeamService.addMemberToProject(projectId, tmId);
              console.log(`✅ Added supervisor TeamMember ${tmId} to project ${projectId}`);
            } catch (pteamError) {
              console.warn(`Could not add supervisor ${tmId} to PTeam:`, pteamError);
            }
          } else {
            console.log(`⏭️ Supervisor TeamMember ${tmId} already in project ${projectId}`);
          }
        }
        
        for (const tmId of newMemberIds) {
          if (!currentMemberIds.includes(tmId)) {
            try {
              await projectTeamService.addMemberToProject(projectId, tmId);
              console.log(`✅ Added member TeamMember ${tmId} to project ${projectId}`);
            } catch (pteamError) {
              console.warn(`Could not add member ${tmId} to PTeam:`, pteamError);
            }
          } else {
            console.log(`⏭️ Member TeamMember ${tmId} already in project ${projectId}`);
          }
        }
        
        for (const currentId of currentSupervisorIds) {
          if (!newSupervisorIds.includes(currentId)) {
            const entryToRemove = currentPteam.find(entry => Number(entry.tm) === currentId);
            if (entryToRemove) {
              try {
                await projectTeamService.removeMemberFromProject(entryToRemove.pt_id);
                console.log(`✅ Removed supervisor TeamMember ${currentId} from project ${projectId}`);
              } catch (pteamError) {
                console.warn(`Could not remove supervisor ${currentId} from PTeam:`, pteamError);
              }
            }
          }
        }
        
        const allNewIds = [...newSupervisorIds, ...newMemberIds];
        for (const currentId of currentMemberIds) {
          if (!allNewIds.includes(currentId)) {
            const entryToRemove = currentPteam.find(entry => Number(entry.tm) === currentId);
            if (entryToRemove) {
              try {
                await projectTeamService.removeMemberFromProject(entryToRemove.pt_id);
                console.log(`✅ Removed member TeamMember ${currentId} from project ${projectId}`);
              } catch (pteamError) {
                console.warn(`Could not remove member ${currentId} from PTeam:`, pteamError);
              }
            }
          }
        }
        
        setProjects(projects.map(p => 
          (p.p_id || p.id) === (editProject.p_id || editProject.id) ? createdProject : p
        ));
        toast.success('Project updated successfully');
      } else {
        const newProject = await projectService.createProject(projectData);
        createdProject = newProject?.data || newProject;
        const projectId = createdProject.p_id || createdProject.id;
        
        if (createdProject && userId) {
          try {
            await projectTeamService.addMemberToProject(projectId, userId);
          } catch (pteamError) {
            console.warn('Could not add creator to PTeam:', pteamError);
          }
        }

        if (createdProject && uniqueSupervisors.length > 0) {
          const uniqueSupervisorIds = [...new Set(uniqueSupervisors)];
          for (const supervisorId of uniqueSupervisorIds) {
            try {
              const teamMember = teamMembers.find(m => Number(m.id) === Number(supervisorId));
              const tmId = teamMember ? Number(teamMember.id) : Number(supervisorId);
              await projectTeamService.addMemberToProject(projectId, tmId);
              console.log(`✅ Added supervisor ${supervisorId} to project ${projectId}`);
            } catch (pteamError) {
              console.warn(`Could not add supervisor ${supervisorId} to PTeam:`, pteamError);
            }
          }
        }

        if (createdProject && uniqueMembers.length > 0) {
          const uniqueMemberIds = [...new Set(uniqueMembers)];
          for (const memberId of uniqueMemberIds) {
            try {
              const teamMember = teamMembers.find(m => Number(m.id) === Number(memberId));
              const tmId = teamMember ? Number(teamMember.id) : Number(memberId);
              await projectTeamService.addMemberToProject(projectId, tmId);
              console.log(`✅ Added member ${memberId} to project ${projectId}`);
            } catch (pteamError) {
              console.warn(`Could not add member ${memberId} to PTeam:`, pteamError);
            }
          }
        }

        setProjects([createdProject, ...projects]);
        toast.success('Project created successfully');
      }
      setProjectModal(false);
      setEditProject(null);
      await fetchData();
    } catch (error) {
      console.error('Error saving project:', error);
      const errorMsg = error.response?.data?.message || 
                       error.response?.data?.detail || 
                       error.response?.data?.error ||
                       'Failed to save project';
      toast.error(errorMsg);
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

  const openAddTask = (project) => {
    setTaskAddModal(project);
    setTaskForm({
      title: '',
      desc: '',
      assignedTo: [],
      status: 'todo',
      priority: 'medium',
      milestone: '',
      milestoneDate: '',
      milestoneOwner: [],
      progress: 0
    });
  };

  const handleAddTask = async () => {
    if (!taskForm.title.trim()) {
      toast.error('Task title is required');
      return;
    }

    try {
      const assignTo = taskForm.assignedTo[0] ? Number(taskForm.assignedTo[0]) : null;
      
      console.log('📤 Creating task with assignTo:', assignTo);
      
      const response = await taskService.createTask({
        title: taskForm.title,
        description: taskForm.desc,
        status: taskForm.status,
        priority: taskForm.priority,
        projectId: taskAddModal.p_id || taskAddModal.id,
        assignTo: assignTo,
        dueDate: taskForm.milestoneDate || null,
        startDate: null,
      });
      
      const newTask = response?.data || response;
      console.log('✅ Task created with assign_to:', newTask.assign_to);
      
      setTasks([newTask, ...tasks]);
      setTaskAddModal(null);
      toast.success('Task created successfully');
    } catch (error) {
      console.error('Error creating task:', error);
      toast.error(error.response?.data?.message || 'Failed to create task');
    }
  };

  const handleUpdateTask = async () => {
    try {
      const assignTo = editTask.assignedTo?.[0] ? Number(editTask.assignedTo[0]) : null;
      
      const response = await taskService.updateTask(editTask.t_id || editTask.id, {
        title: editTask.title,
        description: editTask.desc,
        status: editTask.status,
        priority: editTask.priority,
        progress: editTask.progress,
        assignTo: assignTo,
      });
      
      const updatedTask = response?.data || response;
      setTasks(tasks.map(t => (t.t_id || t.id) === (editTask.t_id || editTask.id) ? updatedTask : t));
      setEditTask(null);
      setSelectedTask(null);
      toast.success('Task updated successfully');
    } catch (error) {
      console.error('Error updating task:', error);
      toast.error(error.response?.data?.message || 'Failed to update task');
    }
  };

  const handleDeleteTask = async () => {
    try {
      await taskService.deleteTask(deleteTaskId);
      setTasks(tasks.filter(t => (t.t_id || t.id) !== deleteTaskId));
      setDeleteTaskId(null);
      setSelectedTask(null);
      toast.success('Task deleted successfully');
    } catch (error) {
      console.error('Error deleting task:', error);
      toast.error(error.response?.data?.message || 'Failed to delete task');
    }
  };

  const changeTaskPriority = (taskId, priority) => {
    setTasks(tasks.map(t => (t.t_id || t.id) === taskId ? { ...t, priority } : t));
  };

  // ✅ Helper functions using stats map
  const getProjectProgress = (projectId) => {
    const stats = projectStatsMap[projectId];
    return stats?.completionRate || 0;
  };

  const getProjectTotalTasks = (projectId) => {
    const stats = projectStatsMap[projectId];
    return stats?.totalTasks || 0;
  };

  const getProjectDoneTasks = (projectId) => {
    const stats = projectStatsMap[projectId];
    return stats?.completedTasks || 0;
  };

  const getProjectMembers = (project) => {
    return project.members || [];
  };

  const getMemberObjects = (ids = []) => {
    return teamMembers.filter(m => ids.includes(m.id));
  };

  const handleEditProject = (project) => {
    setEditProject(project);
    
    const supervisorIds = [...new Set(project.supervisorMembers?.map(s => s.id) || [])];
    const memberIds = [...new Set(project.memberIds || [])];
    
    console.log('📤 Editing project:', project.p_name || project.name);
    console.log('📤 Supervisor IDs from project:', supervisorIds);
    console.log('📤 Member IDs from project:', memberIds);
    
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
    setProjectModal(true);
  };

  // Loading state
  if (loading) {
    return (
      <div>
        <Topbar title="My Projects" onMenuClick={onMenuClick} />
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
        title="My Projects"
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
        {/* Header Actions */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
          <button className="btn btn-primary btn-sm" onClick={openNewProject}>
            <Plus size={14} /> New Project
          </button>
        </div>

        {/* ─── IMPROVED FILTERS ─── */}
        <div className="lp-filters-container">
          {/* Search Bar */}
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

          {/* Filter Controls */}
          <div className="lp-filter-controls">
            <div className="lp-filter-group">
              <div className="lp-filter-label">
                <Filter size={12} />
                <span>Status</span>
              </div>
              <select 
                className="lp-filter-select" 
                value={filterStatus} 
                onChange={e => setFilterStatus(e.target.value)}
              >
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
              <select 
                className="lp-filter-select" 
                value={filterPriority} 
                onChange={e => setFilterPriority(e.target.value)}
              >
                <option value="all">All Priority</option>
                <option value="low">🟢 Low</option>
                <option value="medium">🟡 Medium</option>
                <option value="high">🟠 High</option>
                <option value="critical">🔴 Critical</option>
              </select>
            </div>

            {/* Active Filters Display */}
            {(filterStatus !== 'all' || filterPriority !== 'all') && (
              <div className="lp-active-filters">
                {filterStatus !== 'all' && (
                  <span className="lp-filter-chip">
                    {filterStatus}
                    <button onClick={() => setFilterStatus('all')}>
                      <X size={12} />
                    </button>
                  </span>
                )}
                {filterPriority !== 'all' && (
                  <span className="lp-filter-chip">
                    {filterPriority}
                    <button onClick={() => setFilterPriority('all')}>
                      <X size={12} />
                    </button>
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Results Count */}
          <div className="lp-results-count">
            <span>{filtered.length} project{filtered.length !== 1 ? 's' : ''}</span>
            <span className="lp-results-dot">•</span>
            <span className="lp-results-total">{projects.length} total</span>
            {filtered.length !== projects.length && (
              <button 
                className="lp-clear-filters-btn"
                onClick={() => {
                  setSearch('');
                  setFilterStatus('all');
                  setFilterPriority('all');
                }}
              >
                Clear all filters
              </button>
            )}
          </div>
        </div>

        {/* Projects Grid */}
        {paginatedProjects.length === 0 ? (
          <EmptyState 
            icon={FolderOpen} 
            title="No projects available" 
            desc="You haven't been assigned to any projects yet. Contact your supervisor or create a new project." 
          />
        ) : (
          <div className="lp-projects-grid">
            {paginatedProjects.map((project, index) => {
              const projectId = project.p_id || project.id;
              
              // ✅ Get stats from map (already fetched)
              const progress = getProjectProgress(projectId);
              const totalTasks = getProjectTotalTasks(projectId);
              const doneTasks = getProjectDoneTasks(projectId);
              
              const members = getProjectMembers(project);
              const health = progress >= 70 ? '#34d399' : progress >= 40 ? '#f59e0b' : '#f87171';

              return (
                <motion.div
                  key={project.p_id || project.id || Math.random().toString()}
                  className="lp-project-card"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  onClick={() => navigate(`/lead/projects/${project.p_id || project.id}`)}
                >
                  <div className="lp-card-top" onClick={e => e.stopPropagation()}>
                    <div className="lp-card-badges">
                      <PriorityBadge priority={project.priority} />
                      <StatusBadge status={project.status} />
                      {project.supervisorMembers && project.supervisorMembers.length > 0 && (
                        <span className="lp-supervisor-badge" title={`${project.supervisorMembers.length} supervisor(s)`}>
                          <Crown size={10} />
                          {project.supervisorMembers.length}
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
                      <button className="lp-icon-btn" title="Add Task" onClick={e => {
                        e.stopPropagation();
                        openAddTask(project);
                      }}>
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
                    <h3 className="lp-project-name">{project.p_name || project.name}</h3>
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
                      <p className="lp-meta-value">
                        {project.supervisorMembers && project.supervisorMembers.length > 0 
                          ? project.supervisorMembers.map(s => s.name).join(', ')
                          : 'Assigned'}
                      </p>
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

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="lp-pagination">
            <button 
              className="btn btn-secondary btn-sm" 
              disabled={currentPage === 1} 
              onClick={() => setCurrentPage(p => p - 1)}
            >
              Prev
            </button>
            <span className="lp-page-info">Page {currentPage} of {totalPages}</span>
            <button 
              className="btn btn-secondary btn-sm" 
              disabled={currentPage === totalPages} 
              onClick={() => setCurrentPage(p => p + 1)}
            >
              Next
            </button>
          </div>
        )}
      </div>

      {/* ─── MODALS ─── */}
      {/* All modal code remains the same as your original file */}
      {/* ... (task list modal, task detail modal, edit task modal, add task modal, delete confirm modals) ... */}
      {/* PROJECT MODAL */}
      {projectModal && (
        <div className="lp-overlay" onClick={() => setProjectModal(false)}>
          <div className="lp-modal" onClick={e => e.stopPropagation()}>
            <div className="lp-modal-header">
              <h2 className="lp-modal-title">{editProject ? 'Update Project' : 'Create New Project'}</h2>
              <button className="lp-icon-btn" onClick={() => setProjectModal(false)}><X size={16}/></button>
            </div>
            <div className="lp-modal-body lp-edit-form">
              <label className="lp-label">Project Name *</label>
              <input 
                className="input lp-input" 
                placeholder="Enter project name" 
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
              />
              
              <label className="lp-label">Description</label>
              <textarea 
                className="input lp-input lp-textarea" 
                rows={3} 
                placeholder="Write project description..."
                value={form.description}
                onChange={e => setForm({ ...form, description: e.target.value })}
              />
              
              <div className="lp-form-2col">
                <div>
                  <label className="lp-label">Priority *</label>
                  <select 
                    className="input lp-input" 
                    value={form.priority}
                    onChange={e => setForm({ ...form, priority: e.target.value })}
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="critical">Critical</option>
                  </select>
                </div>
                <div>
                  <label className="lp-label">Status *</label>
                  <select 
                    className="input lp-input" 
                    value={form.status}
                    onChange={e => setForm({ ...form, status: e.target.value })}
                  >
                    <option value="planning">Planning</option>
                    <option value="active">Active</option>
                    <option value="on_hold">On Hold</option>
                    <option value="completed">Completed</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>
              </div>

              {/* SUPERVISORS PICKER */}
              <div>
                <label className="lp-label">
                  <Crown size={14} style={{ display: 'inline', marginRight: 4 }} />
                  Select Supervisor * <span style={{ color: '#ef4444', fontWeight: 700 }}>(Required)</span>
                </label>
                <div className="lp-supervisor-picker">
                  {allSupervisors.length === 0 ? (
                    <div style={{ 
                      padding: '12px', 
                      background: 'var(--bg-secondary)', 
                      borderRadius: '8px',
                      border: '1px dashed var(--border-default)',
                      color: 'var(--text-muted)',
                      fontSize: 13,
                      textAlign: 'center'
                    }}>
                      No supervisors available. Contact an admin to add supervisors.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {allSupervisors.map(s => {
                        const isSelected = form.supervisors.includes(s.id);
                        const isCurrentUser = Number(s.id) === Number(user?.id || user?.u_id);
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
                          >
                            <span className="lp-member-avatar-sm">
                              {(s.u_name || '?')[0].toUpperCase()}
                            </span>
                            {s.u_name}
                            {isCurrentUser && (
                              <span className="lp-current-user-badge">(You)</span>
                            )}
                            {isSelected && <Check size={12} style={{ color: 'var(--accent-primary)' }} />}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
                <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
                  <span style={{ color: '#ef4444' }}>*</span> You must select at least one supervisor for this project.
                </p>
                {form.supervisors.length > 0 && (
                  <div style={{ 
                    marginTop: 8, 
                    padding: '8px 12px', 
                    background: 'rgba(52, 211, 153, 0.1)',
                    borderRadius: '6px',
                    fontSize: 12,
                    color: '#34d399'
                  }}>
                    <Check size={12} style={{ display: 'inline', marginRight: 4 }} />
                    {form.supervisors.length} supervisor{form.supervisors.length !== 1 ? 's' : ''} selected
                  </div>
                )}
                {form.supervisors.length === 0 && (
                  <div style={{ 
                    marginTop: 8, 
                    padding: '8px 12px', 
                    background: 'rgba(248, 113, 113, 0.08)',
                    borderRadius: '6px',
                    fontSize: 12,
                    color: '#f87171'
                  }}>
                    ⚠️ Please select at least one supervisor
                  </div>
                )}
              </div>

              <MemberPicker
                selected={form.members}
                onChange={ids => setForm({ ...form, members: ids })}
                label="Project Members"
                members={teamMembers}
              />
              
              <div className="lp-form-2col">
                <div>
                  <label className="lp-label">Start Date</label>
                  <input 
                    type="date" 
                    className="input lp-input" 
                    value={form.startDate ? form.startDate.split('T')[0] : ''}
                    onChange={e => setForm({ ...form, startDate: e.target.value })}
                  />
                </div>
                <div>
                  <label className="lp-label">Deadline</label>
                  <input 
                    type="date" 
                    className="input lp-input" 
                    value={form.deadline ? form.deadline.split('T')[0] : ''}
                    onChange={e => setForm({ ...form, deadline: e.target.value })}
                  />
                </div>
              </div>
            </div>
            <div className="lp-modal-footer">
              <button className="btn btn-secondary btn-sm" onClick={() => setProjectModal(false)}>Cancel</button>
              <button 
                className="btn btn-primary btn-sm" 
                onClick={handleSaveProject}
                disabled={form.supervisors.length === 0}
              >
                {editProject ? 'Update Project' : 'Create Project'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* All styles remain the same as your original file */}
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

        .refresh-btn {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .lp-supervisor-badge {
          display: inline-flex;
          align-items: center;
          gap: 3px;
          padding: 2px 7px;
          border-radius: 7px;
          font-size: 10px;
          font-weight: 600;
          background: rgba(245, 158, 11, 0.15);
          color: #f59e0b;
          border: 1px solid rgba(245, 158, 11, 0.3);
        }

        .lp-supervisor-picker {
          padding: 10px 12px;
          border-radius: 9px;
          border: 1px solid var(--border-default);
          background: var(--bg-secondary);
          min-height: 44px;
        }

        .lp-supervisor-chip {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 4px 10px 4px 6px;
          border-radius: 20px;
          border: 1px solid var(--border-subtle);
          background: var(--bg-card);
          color: var(--text-primary);
          font-size: 12px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.15s;
        }

        .lp-supervisor-chip:hover {
          border-color: var(--accent-primary);
          background: var(--bg-hover);
        }

        .lp-supervisor-chip.selected {
          background: color-mix(in srgb, var(--accent-primary) 12%, transparent);
          border-color: var(--accent-primary);
        }

        .lp-supervisor-chip.current-user {
          border-color: #34d399;
          background: rgba(52, 211, 153, 0.1);
        }

        .lp-current-user-badge {
          font-size: 9px;
          color: #34d399;
          font-weight: 600;
        }

        .lp-filters-container {
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

        .lp-filters-container:focus-within {
          border-color: var(--accent-primary);
          box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.08);
        }

        .lp-search-wrapper {
          position: relative;
          display: flex;
          align-items: center;
          width: 100%;
        }

        .lp-search-icon {
          position: absolute;
          left: 14px;
          color: var(--text-muted);
          pointer-events: none;
          transition: color 0.2s;
        }

        .lp-search-wrapper:focus-within .lp-search-icon {
          color: var(--accent-primary);
        }

        .lp-search-input {
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

        .lp-search-input:focus {
          border-color: var(--accent-primary);
          background: var(--bg-card);
          box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.08);
        }

        .lp-search-input::placeholder {
          color: var(--text-muted);
        }

        .lp-search-clear {
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

        .lp-search-clear:hover {
          background: var(--border-default);
          color: var(--text-primary);
        }

        .lp-filter-controls {
          display: flex;
          align-items: center;
          gap: 16px;
          flex-wrap: wrap;
        }

        .lp-filter-group {
          display: flex;
          align-items: center;
          gap: 8px;
          flex: 1;
          min-width: 140px;
        }

        .lp-filter-label {
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

        .lp-filter-select {
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

        .lp-filter-select:hover {
          border-color: var(--border-strong);
          background-color: var(--bg-hover);
        }

        .lp-filter-select:focus {
          border-color: var(--accent-primary);
          background-color: var(--bg-card);
          box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.08);
        }

        .lp-active-filters {
          display: flex;
          align-items: center;
          gap: 6px;
          flex-wrap: wrap;
          margin-left: auto;
        }

        .lp-filter-chip {
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

        .lp-filter-chip button {
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

        .lp-filter-chip button:hover {
          background: rgba(239, 68, 68, 0.1);
          color: #ef4444;
        }

        .lp-results-count {
          display: flex;
          align-items: center;
          gap: 8px;
          padding-top: 12px;
          border-top: 1px solid var(--border-subtle);
          font-size: 12px;
          color: var(--text-muted);
          flex-wrap: wrap;
        }

        .lp-results-count span {
          font-weight: 500;
        }

        .lp-results-count .lp-results-total {
          color: var(--text-secondary);
        }

        .lp-results-dot {
          color: var(--border-default);
        }

        .lp-clear-filters-btn {
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

        .lp-clear-filters-btn:hover {
          background: var(--bg-hover);
          color: var(--accent-primary);
        }

        .lp-projects-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
          gap: 16px;
        }

        .lp-project-card {
          padding: 0 0 14px !important;
          display: flex !important;
          flex-direction: column !important;
          gap: 10px !important;
          overflow: hidden;
          cursor: pointer;
          background: var(--bg-card);
          border: 1px solid var(--border-subtle);
          border-radius: 14px;
          transition: all 0.2s ease;
        }

        .lp-project-card:hover {
          border-color: var(--accent-primary);
          transform: translateY(-2px);
          box-shadow: var(--shadow-md);
        }

        .lp-card-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          padding: 12px 14px 0;
          width: 100%;
          box-sizing: border-box;
          min-width: 0;
        }

        .lp-card-badges {
          display: flex;
          align-items: center;
          gap: 5px;
          min-width: 0;
          flex: 1;
          overflow: hidden;
          flex-wrap: wrap;
        }

        .lp-card-badges > * {
          font-size: 10.5px !important;
          padding: 2px 7px !important;
          height: auto !important;
          line-height: 1.4 !important;
          border-radius: 7px !important;
          white-space: nowrap !important;
          display: inline-flex !important;
          align-items: center !important;
          gap: 3px !important;
          flex-shrink: 0 !important;
          box-sizing: border-box !important;
        }

        .lp-card-actions {
          display: flex;
          align-items: center;
          gap: 4px;
          flex-shrink: 0;
        }

        .lp-card-body {
          padding: 0 16px;
        }

        .lp-project-name {
          font-size: 15px;
          font-weight: 700;
          margin-bottom: 2px;
          color: var(--text-primary);
        }

        .lp-project-desc {
          font-size: 12px;
          color: var(--text-muted);
        }

        .lp-progress-header {
          display: flex;
          justify-content: space-between;
          font-size: 11px;
          margin-bottom: 4px;
          color: var(--text-secondary);
        }

        .lp-progress-value {
          font-weight: 600;
        }

        .lp-card-meta {
          display: flex;
          justify-content: space-between;
          font-size: 12px;
          padding: 0 16px;
        }

        .lp-meta-label {
          font-size: 10px;
          color: var(--text-muted);
          margin: 0;
        }

        .lp-meta-value {
          font-weight: 600;
          color: var(--text-primary);
          margin: 0;
        }

        .lp-card-footer {
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-top: 1px solid var(--border-subtle);
          padding-top: 10px;
          margin: 0 16px;
        }

        .lp-member-count {
          font-size: 11px;
          color: var(--text-muted);
        }

        .lp-pagination {
          display: flex;
          justify-content: center;
          gap: 10px;
          margin-top: 20px;
        }

        .lp-page-info {
          padding: 6px 10px;
          font-size: 13px;
          color: var(--text-secondary);
        }

        .lp-overlay {
          position: fixed; inset: 0;
          background: rgba(0,0,0,0.6);
          backdrop-filter: blur(4px);
          display: flex; align-items: center; justify-content: center;
          z-index: 1000; padding: 16px;
        }

        .lp-modal {
          background: var(--bg-card);
          border: 1px solid var(--border-default);
          border-radius: 20px;
          width: 100%; max-width: 520px; max-height: 90vh;
          overflow-y: auto;
          box-shadow: 0 24px 60px rgba(0,0,0,0.3);
          animation: lp-in 0.2s ease;
          scrollbar-width: thin;
          scrollbar-color: var(--border-default) transparent;
        }

        .lp-modal-wide { max-width: 800px; }

        @keyframes lp-in {
          from { opacity:0; transform: translateY(14px) scale(0.97); }
          to   { opacity:1; transform: none; }
        }

        .lp-modal-header {
          display: flex; align-items: flex-start; justify-content: space-between;
          gap: 12px; padding: 20px 20px 14px;
          border-bottom: 1px solid var(--border-subtle);
        }

        .lp-modal-title {
          display: flex; align-items: center; gap: 8px;
          font-size: 17px; font-weight: 700; color: var(--text-primary);
        }

        .lp-modal-sub { font-size: 12px; color: var(--text-muted); margin-top: 3px; }

        .lp-modal-body-split {
          display: grid;
          grid-template-columns: 1fr 220px;
          min-height: 300px;
          max-height: calc(90vh - 130px);
          overflow: hidden;
        }

        .lp-modal-body  { padding: 18px 20px; }

        .lp-modal-footer {
          display: flex; gap: 10px; padding: 14px 20px 20px;
          border-top: 1px solid var(--border-subtle); justify-content: flex-end;
        }

        .lp-modal-desc {
          font-size: 14px; color: var(--text-secondary);
          line-height: 1.6; margin-bottom: 14px;
        }

        .lp-task-scroll {
          max-height: 100%; overflow-y: auto;
          padding: 14px 20px;
          display: flex; flex-direction: column; gap: 10px;
          scrollbar-width: thin; scrollbar-color: var(--border-default) transparent;
          border-right: 1px solid var(--border-subtle);
        }

        .lp-task-row {
          display: flex; align-items: center; gap: 12px;
          padding: 12px 14px;
          border: 1px solid var(--border-subtle); border-radius: 12px;
          background: var(--bg-secondary); cursor: pointer;
          transition: border-color 0.15s, box-shadow 0.15s; flex-wrap: wrap;
        }

        .lp-task-row:hover { border-color: var(--accent-primary); box-shadow: 0 2px 10px rgba(0,0,0,0.08); }

        .lp-task-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }

        .lp-task-title {
          font-size: 13px; font-weight: 600; color: var(--text-primary);
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }

        .lp-task-assignee {
          display: inline-flex; align-items: center; justify-content: center;
          width: 20px; height: 20px; border-radius: 50%;
          background: color-mix(in srgb, var(--accent-primary) 20%, transparent);
          color: var(--accent-primary); font-size: 10px; font-weight: 700;
          border: 1px solid color-mix(in srgb, var(--accent-primary) 30%, transparent);
        }

        .lp-task-meta { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
        .lp-task-actions { display: flex; gap: 5px; flex-shrink: 0; }

        .lp-priority-select {
          font-size: 11px; font-weight: 600; padding: 3px 8px;
          border-radius: 8px; border: 1px solid var(--border-default);
          background: var(--bg-card); color: var(--text-primary);
          cursor: pointer; outline: none;
        }

        .lp-priority-select:focus { border-color: var(--accent-primary); }

        .lp-mini-progress { display: flex; align-items: center; gap: 6px; }

        .lp-mini-track { width: 70px; height: 5px; background: var(--border-subtle); border-radius: 10px; overflow: hidden; }

        .lp-mini-fill { height: 100%; background: var(--accent-primary); border-radius: 10px; transition: width 0.3s; }

        .lp-mini-pct { font-size: 11px; font-weight: 700; color: var(--text-secondary); white-space: nowrap; }

        .lp-milestone-tag {
          display: inline-flex; align-items: center; gap: 4px;
          font-size: 11px; font-weight: 600; color: var(--accent-primary);
          background: color-mix(in srgb, var(--accent-primary) 12%, transparent);
          border-radius: 7px; padding: 2px 8px;
        }

        .lp-milestone-tag.lg { font-size: 12px; padding: 4px 10px; margin-bottom: 12px; }

        .lp-progress-section { margin-top: 16px; }

        .lp-progress-label-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
        .lp-progress-label { font-size: 13px; font-weight: 600; color: var(--text-secondary); }
        .lp-progress-pct   { font-size: 15px; font-weight: 800; color: var(--accent-primary); }

        .lp-progress-track { width: 100%; height: 10px; background: var(--border-subtle); border-radius: 10px; overflow: hidden; }

        .lp-progress-fill {
          height: 100%;
          background: linear-gradient(90deg, var(--accent-primary), color-mix(in srgb, var(--accent-primary) 60%, #a78bfa));
          border-radius: 10px; transition: width 0.4s ease;
        }

        .lp-meta-row { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 12px; }

        .lp-edit-form { display: flex; flex-direction: column; gap: 10px; }

        .lp-label {
          font-size: 12px; font-weight: 600; color: var(--text-secondary);
          margin-bottom: 3px; display: block;
        }

        .lp-input {
          width: 100%; box-sizing: border-box; padding: 9px 12px;
          border-radius: 9px; font-size: 13px;
          background: var(--bg-secondary); border: 1px solid var(--border-default);
          color: var(--text-primary);
        }

        .lp-textarea { min-height: 80px; resize: vertical; }

        .lp-form-2col { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }

        .lp-range { width: 100%; accent-color: var(--accent-primary); cursor: pointer; }

        .lp-confirm { max-width: 360px; text-align: center; padding-top: 28px; }
        .lp-confirm-title { font-size: 18px; font-weight: 700; color: var(--text-primary); margin-bottom: 6px; }

        .lp-icon-btn {
          display: inline-flex; align-items: center; justify-content: center;
          padding: 5px 6px; border-radius: 7px;
          border: 1px solid var(--border-subtle); background: var(--bg-card);
          color: var(--text-secondary); cursor: pointer; transition: all 0.14s;
        }

        .lp-icon-btn:hover { background: var(--bg-primary); color: var(--accent-primary); border-color: var(--accent-primary); }
        .lp-icon-btn.danger:hover { color: #ef4444; border-color: #ef4444; background: rgba(239,68,68,0.07); }

        .btn-danger { background: rgba(239,68,68,0.1); color: #ef4444; border: 1px solid rgba(239,68,68,0.3); }
        .btn-danger:hover { background: rgba(239,68,68,0.2); }

        .btn-secondary { background: var(--bg-secondary); color: var(--text-primary); border: 1px solid var(--border-default); }
        .btn-secondary:hover { border-color: var(--accent-primary); }

        .lp-member-trigger {
          display: flex; align-items: center; gap: 8px; width: 100%; min-height: 42px;
          padding: 8px 12px; border-radius: 9px; border: 1px solid var(--border-default);
          background: var(--bg-secondary); color: var(--text-primary);
          cursor: pointer; text-align: left; font-size: 13px;
          transition: border-color 0.15s; flex-wrap: wrap;
        }

        .lp-member-trigger:hover,
        .lp-member-trigger:focus { border-color: var(--accent-primary); outline: none; }

        .lp-picker-backdrop { position: fixed; inset: 0; z-index: 10; }

        .lp-member-dropdown {
          position: absolute; top: calc(100% + 6px); left: 0; right: 0;
          background: var(--bg-card); border: 1px solid var(--border-default);
          border-radius: 12px; box-shadow: 0 8px 30px rgba(0,0,0,0.2);
          z-index: 20; overflow: hidden; max-height: 220px; overflow-y: auto;
          scrollbar-width: thin; scrollbar-color: var(--border-default) transparent;
        }

        .lp-member-option {
          display: flex; align-items: center; gap: 10px; width: 100%;
          padding: 10px 14px; border: none; background: transparent;
          color: var(--text-primary); cursor: pointer; transition: background 0.12s; text-align: left;
        }

        .lp-member-option:hover { background: var(--bg-secondary); }
        .lp-member-option.selected { background: color-mix(in srgb, var(--accent-primary) 8%, transparent); }

        .lp-member-avatar {
          display: inline-flex; align-items: center; justify-content: center;
          width: 28px; height: 28px; border-radius: 50%;
          background: color-mix(in srgb, var(--accent-primary) 20%, transparent);
          color: var(--accent-primary); font-size: 12px; font-weight: 700; flex-shrink: 0;
        }

        .lp-member-avatar-sm {
          display: inline-flex; align-items: center; justify-content: center;
          width: 20px; height: 20px; border-radius: 50%;
          background: color-mix(in srgb, var(--accent-primary) 20%, transparent);
          color: var(--accent-primary); font-size: 10px; font-weight: 700; flex-shrink: 0;
        }

        .lp-member-chip {
          display: inline-flex; align-items: center; gap: 5px;
          padding: 3px 8px 3px 4px; border-radius: 20px;
          background: color-mix(in srgb, var(--accent-primary) 12%, transparent);
          border: 1px solid color-mix(in srgb, var(--accent-primary) 25%, transparent);
          color: var(--text-primary); font-size: 12px; font-weight: 500;
        }

        .lp-chip-remove {
          display: inline-flex; align-items: center; justify-content: center;
          padding: 1px; border: none; background: transparent; color: var(--text-muted);
          cursor: pointer; border-radius: 50%; transition: color 0.12s, background 0.12s; margin-left: 2px;
        }

        .lp-chip-remove:hover { color: #ef4444; background: rgba(239,68,68,0.1); }

        .lp-members-sidebar {
          padding: 16px; overflow-y: auto; background: var(--bg-secondary);
          scrollbar-width: thin; scrollbar-color: var(--border-default) transparent;
        }

        .lp-members-panel-header {
          display: flex; align-items: center; gap: 6px;
          font-size: 12px; font-weight: 700; color: var(--text-secondary);
          text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 12px;
        }

        .lp-members-list { display: flex; flex-direction: column; gap: 8px; }

        .lp-member-row {
          display: flex; align-items: center; gap: 8px; padding: 6px 8px;
          border-radius: 8px; background: var(--bg-card); border: 1px solid var(--border-subtle);
        }

        @media (max-width: 768px) {
          .lp-filters-container {
            padding: 14px 16px;
            gap: 12px;
          }

          .lp-filter-controls {
            flex-direction: column;
            align-items: stretch;
            gap: 10px;
          }

          .lp-filter-group {
            min-width: 0;
          }

          .lp-filter-select {
            min-width: 0;
          }

          .lp-active-filters {
            margin-left: 0;
            justify-content: flex-start;
          }

          .lp-results-count {
            padding-top: 10px;
            flex-wrap: wrap;
          }

          .lp-clear-filters-btn {
            margin-left: 0;
          }

          .lp-modal-body-split { grid-template-columns: 1fr; grid-template-rows: auto auto; }
          .lp-members-sidebar { border-top: 1px solid var(--border-subtle); }
          .lp-task-scroll { border-right: none; max-height: 300px; }
          .lp-projects-grid {
            grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
          }
        }

        @media (max-width: 600px) {
          .lp-modal-body-split { grid-template-columns: 1fr; grid-template-rows: auto auto; }
          .lp-members-sidebar { border-top: 1px solid var(--border-subtle); }
          .lp-task-scroll { border-right: none; max-height: 300px; }
        }

        @media (max-width: 480px) {
          .lp-filters-container {
            padding: 12px;
            gap: 10px;
          }

          .lp-search-input {
            padding: 10px 36px 10px 38px;
            font-size: 12px;
          }

          .lp-filter-group {
            flex-direction: column;
            align-items: stretch;
            gap: 4px;
          }

          .lp-filter-label {
            font-size: 10px;
          }

          .lp-filter-select {
            padding: 7px 10px;
            font-size: 11px;
          }

          .lp-projects-grid {
            grid-template-columns: 1fr;
          }

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