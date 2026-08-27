// components/supervisor/SupervisorLeads.jsx
import { useState, useEffect, useCallback } from "react";
import { useOutletContext } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Users, FolderKanban, Activity, CheckCircle2,
  X, MessageSquare, Trash2, Pin, PinOff, Send,
  BarChart2, TrendingUp, AlertCircle, Clock,
  Award, ChevronRight, Briefcase, RefreshCw,
  UserPlus, Search, PlusCircle, UserCheck,
  Calendar, Flag, ClipboardList, Star, Loader2,
  UserCog, Eye, Mail
} from "lucide-react";
import toast from "react-hot-toast";

import Topbar from "../shared/Topbar";
import { StatusBadge, PriorityBadge } from "../shared/UIComponents";

import projectService from "../../services/projectService";
import taskService from "../../services/taskService";
import teamService from "../../services/teamService";
import userService from "../../services/userService";
import { useAuth } from "../../context/AuthContext";
import NotificationHelper from '../../services/notificationHelper';

// ─── Helper function to get lead data ───
const getLeadData = (leadId, projects, tasks, teamMembers, users) => {
  const user = users.find(u => Number(u.id || u.u_id) === Number(leadId));
  
  const userProjects = projects.filter(p => {
    const userId = Number(leadId);
    return Number(p.created_by) === userId;
  });
  
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
  userTasks.forEach(t => {
    if (t.assign_to) uniqueMemberIds.add(Number(t.assign_to));
  });
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
    user, 
    projects: userProjects, 
    tasks: userTasks, 
    completed, 
    inProgress, 
    todo, 
    members, 
    uniqueMemberIds: Array.from(uniqueMemberIds), 
    completionRate, 
    performance, 
    perfColor,
    totalTasks,
    teamMemberId,
    hasTeamMember: !!teamMemberId
  };
};

// ─── Role Color Helper ───
const getRoleColor = (role) => {
  const colors = {
    admin: { bg: 'rgba(167, 139, 250, 0.15)', color: '#a78bfa' },
    manager: { bg: 'rgba(129, 140, 248, 0.15)', color: '#818cf8' },
    supervisor: { bg: 'rgba(52, 211, 153, 0.15)', color: '#34d399' },
    lead: { bg: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b' },
    member: { bg: 'rgba(148, 163, 184, 0.15)', color: '#94a3b8' },
    developer: { bg: 'rgba(45, 212, 191, 0.15)', color: '#2dd4bf' },
  };
  return colors[role?.toLowerCase()] || colors.member;
};

export default function SupervisorLeads() {
  const { user } = useAuth();
  const ctx = useOutletContext?.() || {};
  const onMenuClick = ctx.onMenuClick;

  // State
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [projects, setProjects] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [teamMembers, setTeamMembers] = useState([]);
  const [users, setUsers] = useState([]);
  const [leadList, setLeadList] = useState([]);
  const [selectedLead, setSelectedLead] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterPerformance, setFilterPerformance] = useState("all");

  // Assignment Modals
  const [showAssignProject, setShowAssignProject] = useState(false);
  const [showAssignTask, setShowAssignTask] = useState(false);
  const [showAddTeamMember, setShowAddTeamMember] = useState(false);
  const [selectedLeadForAssignment, setSelectedLeadForAssignment] = useState(null);
  const [pendingActionAfterAdd, setPendingActionAfterAdd] = useState(null);
  const [assignProjectData, setAssignProjectData] = useState({ projectId: "", leadId: "" });
  const [assignTaskData, setAssignTaskData] = useState({
    title: "", description: "", priority: "medium", status: "todo",
    projectId: "", leadId: "", dueDate: "",
  });
  const [teamMemberForm, setTeamMemberForm] = useState({
    name: "", description: "", skills: "", role: "Member", qualification: "", experience: 0,
  });
  const [submitting, setSubmitting] = useState(false);

  // ─── Fetch Data ───
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

      // ✅ Include users with role containing 'lead' (case insensitive)
      const leads = usersList
        .filter(u => {
          const role = u.role?.toLowerCase() || '';
          return role === 'member' || role === 'developer' || role.includes('lead');
        })
        .map(u => Number(u.id || u.u_id));
      
      setLeadList(leads);
      
    } catch (error) {
      console.error("Error fetching leads data:", error);
      toast.error("Failed to load leads data");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    toast.success("Leads refreshed");
  };

  // ─── Helpers ───
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
    return found?.u_name || found?.name || "Unknown";
  };

  const getInitials = (name) => {
    if (!name) return "?";
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  // ─── Open Modals ───
  const openAssignProject = (leadId) => {
    setSelectedLeadForAssignment(leadId);
    setAssignProjectData({ projectId: "", leadId: leadId });
    setShowAssignProject(true);
    setPendingActionAfterAdd(null);
  };

  const openAssignTask = (leadId) => {
    setSelectedLeadForAssignment(leadId);
    setAssignTaskData({
      title: "", description: "", priority: "medium", status: "todo",
      projectId: "", leadId: leadId, dueDate: "",
    });
    setShowAssignTask(true);
    setPendingActionAfterAdd(null);
  };

  const openAddTeamMember = (leadId) => {
    const leadUser = users.find(u => Number(u.id || u.u_id) === Number(leadId));
    setSelectedLeadForAssignment(leadId);
    setTeamMemberForm({
      name: leadUser?.u_name || "",
      description: "",
      skills: "",
      role: "Member",
      qualification: "",
      experience: 0,
    });
    setShowAddTeamMember(true);
  };

  // ─── Handlers ───
  const handleAddTeamMember = async () => {
    if (!teamMemberForm.name.trim()) {
      toast.error("Name is required");
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        name: teamMemberForm.name,
        desc: teamMemberForm.description,
        skills: teamMemberForm.skills,
        role: teamMemberForm.role || "Member",
        qualitifcation: teamMemberForm.qualification,
        experience: parseInt(teamMemberForm.experience) || 0,
      };

      const response = await teamService.addTeamMember(payload);
      const newMember = response?.data || response;

      setTeamMembers(prev => [...prev, newMember]);
      toast.success(`Team member "${teamMemberForm.name}" added successfully!`);
      
      setShowAddTeamMember(false);
      setTeamMemberForm({
        name: "", description: "", skills: "", role: "Member", qualification: "", experience: 0,
      });

      const leadId = selectedLeadForAssignment;
      if (leadId) {
        const leadUser = users.find(u => Number(u.id || u.u_id) === Number(leadId));
        if (leadUser) {
          const newTeamMember = [...teamMembers, newMember].find(m => {
            const memberName = (m.name || '').toLowerCase().trim();
            const userName = (leadUser.u_name || '').toLowerCase().trim();
            return memberName === userName;
          });
          
          if (newTeamMember && pendingActionAfterAdd === 'assignProject') {
            setShowAssignProject(true);
            setPendingActionAfterAdd(null);
          } else if (newTeamMember && pendingActionAfterAdd === 'assignTask') {
            setShowAssignTask(true);
            setPendingActionAfterAdd(null);
          }
        }
      }
      
    } catch (error) {
      console.error('Error adding team member:', error);
      toast.error(error.response?.data?.message || "Failed to add team member");
    } finally {
      setSubmitting(false);
    }
  };

  const handleAssignProject = async () => {
    if (!assignProjectData.projectId || !assignProjectData.leadId) {
      toast.error("Please select both a project and a lead");
      return;
    }

    setSubmitting(true);
    try {
      const projectId = parseInt(assignProjectData.projectId);
      const leadId = parseInt(assignProjectData.leadId);
      
      const project = projects.find(p => Number(p.p_id || p.id) === projectId);
      if (!project) {
        toast.error("Project not found");
        return;
      }

      const teamMemberId = getTeamMemberIdForUser(leadId);
      
      if (!teamMemberId) {
        setPendingActionAfterAdd('assignProject');
        setShowAssignProject(false);
        openAddTeamMember(leadId);
        return;
      }

      const response = await taskService.createTask({
        title: `Project Assignment: ${project.p_name || project.name}`,
        description: `Assigned to lead: ${getUserName(leadId)}`,
        status: "todo",
        priority: "medium",
        projectId: projectId,
        assignTo: teamMemberId,
        dueDate: null,
        startDate: null,
      });

      const newTask = response?.data || response;
      const assignee = teamMembers.find(m => Number(m.id) === Number(teamMemberId));
      
      await NotificationHelper.taskAssigned(newTask, assignee, user, project);
      await NotificationHelper.leadAssigned(
        users.find(u => Number(u.id || u.u_id) === Number(leadId)),
        project,
        user
      );

      toast.success(`Project "${project.p_name || project.name}" assigned to ${getUserName(leadId)}`);
      await fetchData();
      
      setShowAssignProject(false);
      setAssignProjectData({ projectId: "", leadId: "" });
      setSelectedLeadForAssignment(null);
      
    } catch (error) {
      console.error("Error assigning project:", error);
      toast.error(error.response?.data?.message || "Failed to assign project");
    } finally {
      setSubmitting(false);
    }
  };

  const handleAssignTask = async () => {
    if (!assignTaskData.title.trim() || !assignTaskData.projectId || !assignTaskData.leadId) {
      toast.error("Please fill in all required fields");
      return;
    }

    setSubmitting(true);
    try {
      const projectId = parseInt(assignTaskData.projectId);
      const leadId = parseInt(assignTaskData.leadId);

      const teamMemberId = getTeamMemberIdForUser(leadId);
      
      if (!teamMemberId) {
        setPendingActionAfterAdd('assignTask');
        setShowAssignTask(false);
        openAddTeamMember(leadId);
        return;
      }

      const response = await taskService.createTask({
        title: assignTaskData.title,
        description: assignTaskData.description,
        status: assignTaskData.status,
        priority: assignTaskData.priority,
        projectId: projectId,
        assignTo: teamMemberId,
        dueDate: assignTaskData.dueDate || null,
        startDate: null,
      });

      const newTask = response?.data || response;
      const assignee = teamMembers.find(m => Number(m.id) === Number(teamMemberId));
      const project = projects.find(p => Number(p.p_id || p.id) === projectId);
      
      await NotificationHelper.taskAssigned(newTask, assignee, user, project);

      toast.success(`Task "${assignTaskData.title}" assigned to ${getUserName(leadId)}`);
      await fetchData();
      
      setShowAssignTask(false);
      setAssignTaskData({
        title: "", description: "", priority: "medium", status: "todo",
        projectId: "", leadId: "", dueDate: "",
      });
      setSelectedLeadForAssignment(null);
      
    } catch (error) {
      console.error('Error assigning task:', error);
      toast.error(error.response?.data?.message || "Failed to assign task");
    } finally {
      setSubmitting(false);
    }
  };

  // ─── Filter Leads ───
  const filteredLeads = leadList.filter(leadId => {
    const d = getLeadData(leadId, projects, tasks, teamMembers, users);
    const nameMatch = d.user?.u_name?.toLowerCase().includes(searchTerm.toLowerCase()) || false;
    const perfMatch = filterPerformance === "all" || d.performance.toLowerCase() === filterPerformance.toLowerCase();
    return nameMatch && perfMatch;
  });

  // ─── Loading State ───
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
        {/* ─── Stats Summary ─── */}
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
              <span className="leads-stat-value">
                {leadList.filter(id => getLeadData(id, projects, tasks, teamMembers, users).hasTeamMember).length}
              </span>
              <span className="leads-stat-label">With Profile</span>
            </div>
          </div>
          <div className="leads-stat">
            <div className="leads-stat-icon" style={{ background: 'rgba(245, 158, 11, 0.12)', color: '#f59e0b' }}>
              <AlertCircle size={18} />
            </div>
            <div>
              <span className="leads-stat-value">
                {leadList.filter(id => !getLeadData(id, projects, tasks, teamMembers, users).hasTeamMember).length}
              </span>
              <span className="leads-stat-label">No Profile</span>
            </div>
          </div>
        </div>

        {/* ─── Search & Filters ─── */}
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

          {filterPerformance !== 'all' && (
            <button className="leads-filter-clear" onClick={() => setFilterPerformance('all')}>
              <X size={12} /> Clear
            </button>
          )}
        </div>

        {/* ─── Quick Actions ─── */}
        <div className="leads-actions">
          <button className="btn btn-secondary btn-sm" onClick={() => {
            if (leadList.length > 0) openAssignProject(leadList[0]);
            else toast.error("No leads available");
          }}>
            <UserPlus size={14} /> Assign Project
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => {
            if (leadList.length > 0) openAssignTask(leadList[0]);
            else toast.error("No leads available");
          }}>
            <PlusCircle size={14} /> Assign Task
          </button>
          <button className="btn btn-success btn-sm" onClick={() => {
            if (leadList.length > 0) openAddTeamMember(leadList[0]);
            else toast.error("No leads available");
          }} style={{ background: '#34d399', color: '#fff', border: 'none' }}>
            <UserCog size={14} /> Add Team Member
          </button>
        </div>

        {/* ─── Leads Grid ─── */}
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
                  transition={{ type: "spring", stiffness: 340, damping: 24 }}
                  onClick={() => setSelectedLead(leadId)}
                >
                  {/* Header */}
                  <div className="lead-card-header">
                    <div className="lead-avatar" style={{ borderColor: d.perfColor }}>
                      {initials}
                    </div>
                    <div className="lead-info">
                      <h3 className="lead-name">{d.user?.u_name || "Unknown"}</h3>
                      <div className="lead-badges">
                        <span className="lead-role-badge" style={{ 
                          background: roleInfo.bg, 
                          color: roleInfo.color 
                        }}>
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

                  {/* Stats */}
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

                  {/* Progress */}
                  <div className="lead-progress">
                    <div className="lead-progress-header">
                      <span>Completion</span>
                      <span style={{ color: d.perfColor, fontWeight: 700 }}>{d.completionRate}%</span>
                    </div>
                    <div className="lead-progress-bar">
                      <div className="lead-progress-fill" style={{ width: `${d.completionRate}%`, background: d.perfColor }} />
                    </div>
                  </div>

                  {/* Footer Actions */}
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
                transition={{ type: "spring", damping: 25 }}
                onClick={(e) => e.stopPropagation()}>
                
                {/* Modal Header */}
                <div className="modal-header">
                  <div className="modal-header-left">
                    <div className="modal-avatar" style={{ borderColor: d.perfColor }}>
                      {initials}
                    </div>
                    <div>
                      <h2 className="modal-name">{d.user?.u_name || "Unknown"}</h2>
                      <div className="modal-badges">
                        <span className="modal-role-badge" style={{ background: roleInfo.bg, color: roleInfo.color }}>
                          {d.user?.role || 'Member'}
                        </span>
                        <span className="modal-perf-badge" style={{ color: d.perfColor }}>
                          {d.performance}
                        </span>
                        <span className="modal-email">{d.user?.email}</span>
                      </div>
                    </div>
                  </div>
                  <button className="modal-close-btn" onClick={() => setSelectedLead(null)}>
                    <X size={20} />
                  </button>
                </div>

                {/* Modal Body */}
                <div className="modal-body">
                  {/* Stats Row */}
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

                  {/* Completion Rate */}
                  <div className="modal-progress">
                    <div className="modal-progress-header">
                      <span>Completion Rate</span>
                      <span style={{ color: d.perfColor, fontWeight: 700 }}>{d.completionRate}%</span>
                    </div>
                    <div className="modal-progress-bar">
                      <div className="modal-progress-fill" style={{ width: `${d.completionRate}%`, background: d.perfColor }} />
                    </div>
                  </div>

                  {/* Projects List */}
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

                  {/* Quick Actions */}
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

      {/* ─── MODALS ─── (Assign Project, Assign Task, Add Team Member) - keep your existing modals */}
      {/* ... existing modals code ... */}

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        .spin { animation: spin 1s linear infinite; }

        /* ─── STATS ─── */
        .leads-stats {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
          gap: 12px;
          margin-bottom: 18px;
        }

        .leads-stat {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 14px 18px;
          background: var(--bg-card);
          border: 1px solid var(--border-subtle);
          border-radius: 12px;
        }

        .leads-stat-icon {
          width: 40px;
          height: 40px;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .leads-stat-value {
          display: block;
          font-size: 20px;
          font-weight: 800;
          color: var(--text-primary);
          line-height: 1.2;
        }

        .leads-stat-label {
          display: block;
          font-size: 12px;
          color: var(--text-muted);
        }

        /* ─── FILTERS ─── */
        .leads-filters {
          display: flex;
          gap: 10px;
          margin-bottom: 16px;
          flex-wrap: wrap;
        }

        .leads-search {
          position: relative;
          flex: 1;
          min-width: 200px;
        }

        .leads-search-icon {
          position: absolute;
          left: 12px;
          top: 50%;
          transform: translateY(-50%);
          color: var(--text-muted);
        }

        .leads-search-input {
          width: 100%;
          padding: 9px 36px 9px 36px;
          border-radius: 8px;
          border: 1px solid var(--border-default);
          background: var(--bg-secondary);
          color: var(--text-primary);
          font-size: 13px;
          outline: none;
          transition: border-color 0.2s;
        }

        .leads-search-input:focus {
          border-color: var(--accent-primary);
          background: var(--bg-card);
          box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.08);
        }

        .leads-search-clear {
          position: absolute;
          right: 8px;
          top: 50%;
          transform: translateY(-50%);
          display: flex;
          align-items: center;
          justify-content: center;
          width: 26px;
          height: 26px;
          border: none;
          border-radius: 50%;
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
          font-size: 13px;
          outline: none;
          cursor: pointer;
          appearance: none;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E");
          background-repeat: no-repeat;
          background-position: right 10px center;
        }

        .leads-filter-select:focus {
          border-color: var(--accent-primary);
        }

        .leads-filter-clear {
          display: flex;
          align-items: center;
          gap: 4px;
          padding: 9px 14px;
          border-radius: 8px;
          border: 1px solid var(--border-default);
          background: var(--bg-secondary);
          color: var(--text-secondary);
          font-size: 12px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.15s;
        }

        .leads-filter-clear:hover {
          border-color: var(--accent-primary);
          color: var(--accent-primary);
        }

        /* ─── ACTIONS ─── */
        .leads-actions {
          display: flex;
          gap: 8px;
          margin-bottom: 18px;
          flex-wrap: wrap;
        }

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
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .lead-card:hover {
          border-color: var(--accent-primary);
          box-shadow: 0 4px 16px rgba(0,0,0,0.06);
        }

        .lead-card-header {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .lead-avatar {
          width: 44px;
          height: 44px;
          border-radius: 50%;
          border: 2px solid;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 16px;
          font-weight: 800;
          color: var(--text-primary);
          background: var(--bg-secondary);
          flex-shrink: 0;
        }

        .lead-info {
          flex: 1;
          min-width: 0;
        }

        .lead-name {
          font-size: 15px;
          font-weight: 700;
          color: var(--text-primary);
          margin: 0;
        }

        .lead-badges {
          display: flex;
          gap: 4px;
          flex-wrap: wrap;
          margin-top: 3px;
        }

        .lead-role-badge {
          font-size: 10px;
          font-weight: 600;
          padding: 2px 8px;
          border-radius: 10px;
        }

        .lead-perf-badge {
          font-size: 10px;
          font-weight: 700;
          padding: 2px 8px;
          border-radius: 10px;
          border: 1px solid currentColor;
        }

        .lead-no-profile-badge {
          font-size: 9px;
          font-weight: 600;
          padding: 2px 6px;
          border-radius: 4px;
          background: rgba(245, 158, 11, 0.15);
          color: #f59e0b;
          border: 1px solid rgba(245, 158, 11, 0.3);
        }

        /* ─── STATS GRID ─── */
        .lead-stats-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 4px;
          background: var(--bg-secondary);
          border-radius: 10px;
          border: 1px solid var(--border-subtle);
          padding: 6px 0;
        }

        .lead-stat-item {
          text-align: center;
          padding: 4px;
        }

        .lead-stat-item:not(:last-child) {
          border-right: 1px solid var(--border-subtle);
        }

        .lead-stat-number {
          display: block;
          font-size: 16px;
          font-weight: 700;
          color: var(--text-primary);
        }

        .lead-stat-label {
          font-size: 9px;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.3px;
        }

        /* ─── PROGRESS ─── */
        .lead-progress {
          margin-top: 2px;
        }

        .lead-progress-header {
          display: flex;
          justify-content: space-between;
          font-size: 11px;
          color: var(--text-secondary);
          margin-bottom: 4px;
        }

        .lead-progress-bar {
          width: 100%;
          height: 6px;
          background: var(--border-subtle);
          border-radius: 10px;
          overflow: hidden;
        }

        .lead-progress-fill {
          height: 100%;
          border-radius: 10px;
          transition: width 0.6s ease;
        }

        /* ─── FOOTER ─── */
        .lead-card-footer {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding-top: 10px;
          border-top: 1px solid var(--border-subtle);
        }

        .lead-project-tags {
          display: flex;
          gap: 4px;
          flex-wrap: wrap;
        }

        .lead-project-tag {
          font-size: 10px;
          font-weight: 500;
          padding: 2px 8px;
          border-radius: 4px;
          background: var(--bg-secondary);
          border: 1px solid var(--border-subtle);
          color: var(--text-secondary);
          white-space: nowrap;
          max-width: 80px;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .lead-card-actions {
          display: flex;
          gap: 4px;
        }

        .lead-action-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 4px;
          border-radius: 6px;
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

        /* ─── EMPTY STATE ─── */
        .leads-empty {
          text-align: center;
          padding: 60px 20px;
          color: var(--text-muted);
        }

        .leads-empty h3 {
          font-size: 18px;
          font-weight: 700;
          color: var(--text-primary);
          margin: 12px 0 4px;
        }

        /* ─── MODAL ─── */
        .modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,0.6);
          backdrop-filter: blur(6px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          padding: 20px;
        }

        .modal-content {
          width: 100%;
          max-width: 620px;
          max-height: 90vh;
          overflow-y: auto;
          background: var(--bg-card);
          border: 1px solid var(--border-default);
          border-radius: 18px;
          box-shadow: 0 24px 80px rgba(0,0,0,0.35);
          padding: 0;
        }

        .modal-content::-webkit-scrollbar {
          width: 4px;
        }
        .modal-content::-webkit-scrollbar-thumb {
          background: var(--border-default);
          border-radius: 10px;
        }

        .modal-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          padding: 20px 24px 16px;
          border-bottom: 1px solid var(--border-subtle);
          position: sticky;
          top: 0;
          background: var(--bg-card);
          border-radius: 18px 18px 0 0;
        }

        .modal-header-left {
          display: flex;
          align-items: center;
          gap: 14px;
        }

        .modal-avatar {
          width: 52px;
          height: 52px;
          border-radius: 50%;
          border: 2px solid;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 20px;
          font-weight: 800;
          background: var(--bg-secondary);
          color: var(--text-primary);
          flex-shrink: 0;
        }

        .modal-name {
          font-size: 18px;
          font-weight: 700;
          color: var(--text-primary);
          margin: 0;
        }

        .modal-badges {
          display: flex;
          gap: 4px;
          flex-wrap: wrap;
          margin-top: 3px;
        }

        .modal-role-badge {
          font-size: 11px;
          font-weight: 600;
          padding: 2px 10px;
          border-radius: 12px;
        }

        .modal-perf-badge {
          font-size: 11px;
          font-weight: 700;
          padding: 2px 10px;
          border-radius: 12px;
          border: 1px solid currentColor;
        }

        .modal-email {
          font-size: 11px;
          color: var(--text-muted);
          padding: 2px 0;
        }

        .modal-close-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 36px;
          height: 36px;
          border-radius: 8px;
          border: 1px solid var(--border-subtle);
          background: var(--bg-secondary);
          color: var(--text-secondary);
          cursor: pointer;
          transition: all 0.15s;
        }

        .modal-close-btn:hover {
          border-color: var(--accent-primary);
          color: var(--accent-primary);
        }

        .modal-body {
          padding: 20px 24px 24px;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .modal-stats {
          display: grid;
          grid-template-columns: repeat(5, 1fr);
          gap: 8px;
        }

        .modal-stat {
          text-align: center;
          padding: 10px 6px;
          background: var(--bg-secondary);
          border-radius: 10px;
          border: 1px solid var(--border-subtle);
        }

        .modal-stat-value {
          display: block;
          font-size: 18px;
          font-weight: 800;
          color: var(--text-primary);
        }

        .modal-stat-label {
          font-size: 9px;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.3px;
        }

        .modal-progress {
          background: var(--bg-secondary);
          border-radius: 10px;
          padding: 12px 16px;
          border: 1px solid var(--border-subtle);
        }

        .modal-progress-header {
          display: flex;
          justify-content: space-between;
          font-size: 13px;
          color: var(--text-secondary);
          margin-bottom: 6px;
        }

        .modal-progress-bar {
          width: 100%;
          height: 8px;
          background: var(--border-subtle);
          border-radius: 10px;
          overflow: hidden;
        }

        .modal-progress-fill {
          height: 100%;
          border-radius: 10px;
          transition: width 0.6s ease;
        }

        .modal-section {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .modal-section-title {
          font-size: 13px;
          font-weight: 700;
          color: var(--text-secondary);
          display: flex;
          align-items: center;
          gap: 6px;
          margin: 0;
        }

        .modal-project-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 10px 14px;
          background: var(--bg-secondary);
          border-radius: 8px;
          border: 1px solid var(--border-subtle);
          gap: 10px;
          flex-wrap: wrap;
        }

        .modal-project-name {
          display: block;
          font-size: 13px;
          font-weight: 600;
          color: var(--text-primary);
        }

        .modal-project-desc {
          display: block;
          font-size: 11px;
          color: var(--text-muted);
        }

        .modal-project-badges {
          display: flex;
          gap: 4px;
          flex-shrink: 0;
        }

        .modal-empty {
          font-size: 13px;
          color: var(--text-muted);
          text-align: center;
          padding: 8px 0;
        }

        .modal-actions {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
          padding-top: 8px;
          border-top: 1px solid var(--border-subtle);
        }

        .modal-action-btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 8px 14px;
          border-radius: 8px;
          font-size: 12px;
          font-weight: 600;
          border: none;
          cursor: pointer;
          transition: all 0.15s;
        }

        .modal-action-btn.primary {
          background: var(--accent-primary);
          color: #fff;
        }

        .modal-action-btn.primary:hover {
          opacity: 0.85;
        }

        .modal-action-btn.success {
          background: #34d399;
          color: #fff;
        }

        .modal-action-btn.success:hover {
          opacity: 0.85;
        }

        /* ─── RESPONSIVE ─── */
        @media (max-width: 768px) {
          .leads-stats {
            grid-template-columns: 1fr 1fr 1fr;
          }

          .leads-grid {
            grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
          }

          .modal-stats {
            grid-template-columns: repeat(3, 1fr);
          }

          .modal-content {
            max-width: 100%;
            border-radius: 14px;
            max-height: 95vh;
          }
        }

        @media (max-width: 480px) {
          .leads-stats {
            grid-template-columns: 1fr;
          }

          .leads-filters {
            flex-direction: column;
          }

          .leads-grid {
            grid-template-columns: 1fr;
          }

          .modal-stats {
            grid-template-columns: repeat(2, 1fr);
          }

          .modal-header {
            padding: 16px 18px;
          }

          .modal-body {
            padding: 16px 18px;
          }

          .modal-avatar {
            width: 40px;
            height: 40px;
            font-size: 16px;
          }

          .modal-name {
            font-size: 16px;
          }
        }
      `}</style>
    </div>
  );
}