// components/supervisor/SupervisorLeads.jsx
import { useState, useEffect, useCallback } from "react";
import { useOutletContext } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Users, FolderKanban, Activity, CheckCircle2,
  X, MessageSquare, Trash2, Pin, PinOff, Send,
  BarChart2, TrendingUp, AlertCircle, Clock,
  Award, ChevronRight, Briefcase, RefreshCw,
  UserPlus, Filter, Search, PlusCircle, UserCheck,
  Calendar, Flag, ClipboardList, Star, Zap, Loader2,
  UserCog, Plus
} from "lucide-react";
import toast from "react-hot-toast";

import Topbar from "../shared/Topbar";
import { StatusBadge, PriorityBadge } from "../shared/UIComponents";

import projectService from "../../services/projectService";
import taskService from "../../services/taskService";
import teamService from "../../services/teamService";
import userService from "../../services/userService";
import { useAuth } from "../../context/AuthContext";
// components/supervisor/SupervisorLeads.jsx
import NotificationHelper from '../../services/notificationHelper';

/* ── Helper function to get lead data ── */
const getLeadData = (leadId, projects, tasks, teamMembers, users) => {
  const user = users.find(u => Number(u.id || u.u_id) === Number(leadId));
  
  // Find projects where this lead is the creator
  const userProjects = projects.filter(p => {
    const userId = Number(leadId);
    const isCreator = Number(p.created_by) === userId;
    return isCreator;
  });
  
  const projectIds = userProjects.map(p => Number(p.p_id || p.id));
  
  // Match team member by name
  const teamMember = teamMembers.find(m => {
    const memberName = (m.name || '').toLowerCase().trim();
    const userName = (user?.u_name || '').toLowerCase().trim();
    return memberName === userName;
  });
  const teamMemberId = teamMember ? Number(teamMember.id) : null;
  
  // Find tasks assigned to this lead
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

const KPI_META = {
  projects:   { label: "All Projects",      icon: FolderKanban, color: "#818cf8" },
  completed:  { label: "Completed Tasks",   icon: CheckCircle2, color: "#34d399" },
  inProgress: { label: "In-Progress Tasks", icon: Clock,        color: "#f59e0b" },
  todo:       { label: "To-Do Tasks",       icon: AlertCircle,  color: "#94a3b8" },
  team:       { label: "Team Members",      icon: Users,        color: "#2dd4bf" },
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
  const [activeKpi, setActiveKpi] = useState(null);
  const [comments, setComments] = useState({});
  const [commentText, setCommentText] = useState("");
  const [deleteLeadId, setDeleteLeadId] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterPerformance, setFilterPerformance] = useState("all");

  // Assignment Modals
  const [showAssignProject, setShowAssignProject] = useState(false);
  const [showAssignTask, setShowAssignTask] = useState(false);
  const [showAddTeamMember, setShowAddTeamMember] = useState(false);
  const [selectedLeadForAssignment, setSelectedLeadForAssignment] = useState(null);
  const [pendingActionAfterAdd, setPendingActionAfterAdd] = useState(null);
  const [assignProjectData, setAssignProjectData] = useState({
    projectId: "",
    leadId: "",
  });
  const [assignTaskData, setAssignTaskData] = useState({
    title: "",
    description: "",
    priority: "medium",
    status: "todo",
    projectId: "",
    leadId: "",
    dueDate: "",
  });
  const [teamMemberForm, setTeamMemberForm] = useState({
    name: "",
    description: "",
    skills: "",
    role: "",
    qualification: "",
    experience: 0,
  });
  const [submitting, setSubmitting] = useState(false);

  // Fetch data
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
          const role = u.role?.toLowerCase();
          return role === 'member' || role === 'lead' || role === 'developer';
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

  // ─── Get TeamMember ID for a User (match by name) ───
  const getTeamMemberIdForUser = (userId) => {
    const user = users.find(u => Number(u.id || u.u_id) === Number(userId));
    if (!user) return null;
    const member = teamMembers.find(m => {
      const memberName = (m.name || '').toLowerCase().trim();
      const userName = (user.u_name || '').toLowerCase().trim();
      return memberName === userName;
    });
    return member ? Number(member.id) : null;
  };

  // ─── Get TeamMember for a User (match by name) ───
  const getTeamMemberForUser = (userId) => {
    const user = users.find(u => Number(u.id || u.u_id) === Number(userId));
    if (!user) return null;
    return teamMembers.find(m => {
      const memberName = (m.name || '').toLowerCase().trim();
      const userName = (user.u_name || '').toLowerCase().trim();
      return memberName === userName;
    });
  };

  // ─── ADD TEAM MEMBER ───
  const handleAddTeamMember = async () => {
  if (!teamMemberForm.name.trim()) {
    toast.error("Name is required");
    return;
  }

  setSubmitting(true);
  try {
    const payload = {
      name: teamMemberForm.name,
      description: teamMemberForm.description,
      skills: teamMemberForm.skills,
      role: teamMemberForm.role || "Member",
      qualification: teamMemberForm.qualification,
      experience: parseInt(teamMemberForm.experience) || 0,
    };

    console.log('📤 Adding team member with payload:', payload);
    
    const response = await teamService.addTeamMember(payload);
    const newMember = response?.data || response;
    console.log('✅ Team member added:', newMember);

    // ✅ Update teamMembers state immediately
    const updatedTeamMembers = [...teamMembers, newMember];
    setTeamMembers(updatedTeamMembers);

    // ✅ Create notification for member added
    await NotificationHelper.memberAdded(newMember, user);

    toast.success(`Team member "${teamMemberForm.name}" added successfully!`);
    
    setShowAddTeamMember(false);
    setTeamMemberForm({
      name: "",
      description: "",
      skills: "",
      role: "",
      qualification: "",
      experience: 0,
    });

      const leadId = selectedLeadForAssignment;
      if (leadId) {
        const leadUser = users.find(u => Number(u.id || u.u_id) === Number(leadId));
        if (leadUser) {
          const newTeamMember = updatedTeamMembers.find(m => {
            const memberName = (m.name || '').toLowerCase().trim();
            const userName = (leadUser.u_name || '').toLowerCase().trim();
            return memberName === userName;
          });
          
          if (newTeamMember) {
            toast.success(`✅ ${teamMemberForm.name} is now a team member!`);
            
            if (pendingActionAfterAdd === 'assignProject') {
              setShowAssignProject(true);
              setPendingActionAfterAdd(null);
            } else if (pendingActionAfterAdd === 'assignTask') {
              setShowAssignTask(true);
              setPendingActionAfterAdd(null);
            }
          } else {
            await fetchData();
            if (pendingActionAfterAdd === 'assignProject') {
              setShowAssignProject(true);
              setPendingActionAfterAdd(null);
            } else if (pendingActionAfterAdd === 'assignTask') {
              setShowAssignTask(true);
              setPendingActionAfterAdd(null);
            }
          }
        }
      }
      
    }  catch (error) {
    console.error('Error adding team member:', error);
    toast.error(error.response?.data?.message || "Failed to add team member");
  } finally {
    setSubmitting(false);
  }
};

  // ─── ASSIGN PROJECT TO LEAD ───
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
    
    // ✅ Create notification for task creation
    await NotificationHelper.taskCreated(newTask, user);
    
    // ✅ Create notification for lead assignment
    const leadUser = users.find(u => Number(u.id || u.u_id) === Number(leadId));
    const assignee = teamMembers.find(m => Number(m.id) === Number(teamMemberId));
    await NotificationHelper.taskAssigned(newTask, assignee, user);
    await NotificationHelper.leadAssigned(leadUser, project, user);

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

  // ─── ASSIGN TASK TO LEAD ───
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

    console.log('📤 Creating task with data:', {
      title: assignTaskData.title,
      description: assignTaskData.description,
      status: assignTaskData.status,
      priority: assignTaskData.priority,
      projectId: projectId,
      assignTo: teamMemberId,
      dueDate: assignTaskData.dueDate || null,
    });

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
    console.log('✅ Task created:', newTask);
    
    // ✅ Create notification for task creation
    await NotificationHelper.taskCreated(newTask, user);
    
    // ✅ Create notification for task assignment
    const assignee = teamMembers.find(m => Number(m.id) === Number(teamMemberId));
    await NotificationHelper.taskAssigned(newTask, assignee, user);
    
    await fetchData();
    
    toast.success(`Task "${assignTaskData.title}" assigned to ${getUserName(leadId)}`);
    
    setShowAssignTask(false);
    setAssignTaskData({
      title: "",
      description: "",
      priority: "medium",
      status: "todo",
      projectId: "",
      leadId: "",
      dueDate: "",
    });
    setSelectedLeadForAssignment(null);
    
  } catch (error) {
    console.error('Error assigning task:', error);
    if (error.response?.data) {
      console.error('Server error details:', error.response.data);
      let errorMsg = 'Failed to assign task';
      const errorData = error.response.data;
      if (typeof errorData === 'string') {
        errorMsg = errorData;
      } else if (errorData.message) {
        errorMsg = errorData.message;
      } else if (errorData.detail) {
        errorMsg = errorData.detail;
      } else if (errorData.error) {
        errorMsg = typeof errorData.error === 'string' ? errorData.error : 'Failed to assign task';
      } else if (errorData.non_field_errors) {
        errorMsg = Array.isArray(errorData.non_field_errors) ? errorData.non_field_errors[0] : errorData.non_field_errors;
      } else {
        const firstKey = Object.keys(errorData)[0];
        if (firstKey) {
          const value = errorData[firstKey];
          errorMsg = Array.isArray(value) ? value[0] : String(value);
        }
      }
      toast.error(typeof errorMsg === 'string' ? errorMsg : 'Failed to assign task');
    } else {
      toast.error('Failed to assign task');
    }
  } finally {
    setSubmitting(false);
  }
};

  // Get user name by ID
  const getUserName = (userId) => {
    const found = users.find(u => Number(u.id || u.u_id) === Number(userId));
    return found?.u_name || found?.name || "Unknown";
  };

  // Open assign project modal
  const openAssignProject = (leadId) => {
    setSelectedLeadForAssignment(leadId);
    setAssignProjectData({
      projectId: "",
      leadId: leadId,
    });
    setShowAssignProject(true);
    setPendingActionAfterAdd(null);
  };

  // Open assign task modal
  const openAssignTask = (leadId) => {
    setSelectedLeadForAssignment(leadId);
    setAssignTaskData({
      title: "",
      description: "",
      priority: "medium",
      status: "todo",
      projectId: "",
      leadId: leadId,
      dueDate: "",
    });
    setShowAssignTask(true);
    setPendingActionAfterAdd(null);
  };

  // Open add team member modal
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

  const getComments = (id) => comments[id] || [];

  const addComment = (leadId) => {
    if (!commentText.trim()) return;
    const c = { 
      c_id: Date.now(), 
      text: commentText.trim(), 
      created_at: new Date().toLocaleString(), 
      pinned: false 
    };
    setComments((p) => ({ ...p, [leadId]: [...(p[leadId] || []), c] }));
    setCommentText("");
    toast.success("Comment added");
  };

  const togglePin = (leadId, c_id) =>
    setComments((p) => ({ 
      ...p, 
      [leadId]: (p[leadId] || []).map((c) => 
        c.c_id === c_id ? { ...c, pinned: !c.pinned } : c
      ) 
    }));

  const deleteComment = (leadId, c_id) =>
    setComments((p) => ({ 
      ...p, 
      [leadId]: (p[leadId] || []).filter((c) => c.c_id !== c_id) 
    }));

  const deleteLead = (leadId) => {
    setLeadList((p) => p.filter((id) => Number(id) !== Number(leadId)));
    setDeleteLeadId(null);
    setSelectedLead(null);
    setActiveKpi(null);
    toast.success("Lead removed from overview");
  };

  const handleKpiClick = (key) => {
    // Toggle: if same key clicked, close it; else open new one
    setActiveKpi(prev => prev === key ? null : key);
  };
  
  const openLead = (id) => { 
    setSelectedLead(id); 
    setActiveKpi(null); 
  };

  // Filter leads
  const filteredLeads = leadList.filter(leadId => {
    const d = getLeadData(leadId, projects, tasks, teamMembers, users);
    const nameMatch = d.user?.u_name?.toLowerCase().includes(searchTerm.toLowerCase()) || false;
    const perfMatch = filterPerformance === "all" || d.performance.toLowerCase() === filterPerformance.toLowerCase();
    return nameMatch && perfMatch;
  });

  // Loading state
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
        {/* Header Actions */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16, gap: '8px', flexWrap: 'wrap' }}>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => {
              if (leadList.length > 0) {
                openAssignProject(leadList[0]);
              } else {
                toast.error("No leads available to assign projects to");
              }
            }}
          >
            <UserPlus size={14} /> Assign Project
          </button>
          <button
            className="btn btn-primary btn-sm"
            onClick={() => {
              if (leadList.length > 0) {
                openAssignTask(leadList[0]);
              } else {
                toast.error("No leads available to assign tasks to");
              }
            }}
          >
            <PlusCircle size={14} /> Assign Task
          </button>
          <button
            className="btn btn-success btn-sm"
            onClick={() => {
              if (leadList.length > 0) {
                openAddTeamMember(leadList[0]);
              } else {
                toast.error("No leads available to add as team members");
              }
            }}
            style={{ background: '#34d399', color: '#fff', border: 'none' }}
          >
            <UserCog size={14} /> Add Team Member
          </button>
        </div>

        {/* SEARCH & FILTERS */}
        <div className="ll-filters-container">
          <div className="ll-search-wrapper">
            <Search size={16} className="ll-search-icon" />
            <input
              className="ll-search-input"
              placeholder="Search leads by name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            {searchTerm && (
              <button className="ll-search-clear" onClick={() => setSearchTerm('')}>
                <X size={14} />
              </button>
            )}
          </div>

          <div className="ll-filter-controls">
            <div className="ll-filter-group">
              <div className="ll-filter-label">
                <Star size={12} />
                <span>Performance</span>
              </div>
              <select 
                className="ll-filter-select" 
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

            {filterPerformance !== 'all' && (
              <div className="ll-active-filters">
                <span className="ll-filter-chip">
                  {filterPerformance}
                  <button onClick={() => setFilterPerformance('all')}>
                    <X size={12} />
                  </button>
                </span>
              </div>
            )}
          </div>

          <div className="ll-results-count">
            <span>{filteredLeads.length} lead{filteredLeads.length !== 1 ? 's' : ''}</span>
            <span className="ll-results-dot">•</span>
            <span className="ll-results-total">{leadList.length} total</span>
            {filteredLeads.length !== leadList.length && (
              <button 
                className="ll-clear-filters-btn"
                onClick={() => {
                  setSearchTerm('');
                  setFilterPerformance('all');
                }}
              >
                Clear all filters
              </button>
            )}
          </div>
        </div>

        {/* Leads Grid */}
        {filteredLeads.length === 0 ? (
          <div style={{ 
            textAlign: 'center', 
            padding: '60px 20px',
            color: 'var(--text-muted)'
          }}>
            <Users size={48} style={{ marginBottom: 12, opacity: 0.3 }} />
            <h3>No leads found</h3>
            <p>{searchTerm || filterPerformance !== 'all' ? 'Try adjusting your filters' : 'There are no team leads with projects assigned yet.'}</p>
          </div>
        ) : (
          <div className="sl-grid">
            {filteredLeads.map((leadId) => {
              const d = getLeadData(leadId, projects, tasks, teamMembers, users);
              const cCount = getComments(leadId).length;
              const hasTeamMember = d.hasTeamMember;
              
              return (
                <motion.div key={leadId} className="card sl-card"
                  whileHover={{ y: -2 }}
                  transition={{ type: "spring", stiffness: 340, damping: 24 }}
                  onClick={() => openLead(leadId)}>
                  <div className="sl-strip" style={{ background: d.perfColor }} />
                  <div className="sl-card-header">
                    <div className="sl-avatar">{(d.user?.u_name || "?")[0].toUpperCase()}</div>
                    <div className="sl-card-title">
                      <h3>{d.user?.u_name || "Unknown"}</h3>
                      <span className="sl-perf-badge" style={{ color: d.perfColor, borderColor: d.perfColor }}>
                        {d.performance}
                      </span>
                    </div>
                    <ChevronRight size={16} className="sl-chevron" />
                  </div>
                  <div className="sl-stats-mini">
                    <MiniStat icon={FolderKanban} label="Projects" value={d.projects.length} />
                    <MiniStat icon={CheckCircle2} label="Done" value={d.completed} />
                    <MiniStat icon={Activity} label="Tasks" value={d.totalTasks} />
                    <MiniStat icon={Users} label="Team" value={d.uniqueMemberIds.length} />
                  </div>
                  <div>
                    <div className="sl-progress-row">
                      <span>Completion</span>
                      <span style={{ color: d.perfColor, fontWeight: 700 }}>{d.completionRate}%</span>
                    </div>
                    <div className="progress-bar">
                      <div className="progress-fill" style={{ width: `${d.completionRate}%`, background: d.perfColor }} />
                    </div>
                  </div>
                  <div className="sl-card-footer">
                    <div className="sl-project-tags">
                      {d.projects.slice(0, 2).map((p) => (
                        <span key={p.p_id || p.id} className="badge badge-gray sl-proj-tag">
                          {p.p_name || p.name}
                        </span>
                      ))}
                      {d.projects.length > 2 && (
                        <span className="badge badge-gray sl-proj-tag">+{d.projects.length - 2}</span>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                      {!hasTeamMember && (
                        <span className="sl-team-badge" style={{ 
                          fontSize: '9px', 
                          color: '#f59e0b', 
                          background: 'rgba(245, 158, 11, 0.15)',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          border: '1px solid rgba(245, 158, 11, 0.3)'
                        }}>
                          No Profile
                        </span>
                      )}
                      {hasTeamMember && (
                        <span className="sl-team-badge" style={{ 
                          fontSize: '9px', 
                          color: '#34d399', 
                          background: 'rgba(52, 211, 153, 0.15)',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          border: '1px solid rgba(52, 211, 153, 0.3)'
                        }}>
                          ✅ Team Profile
                        </span>
                      )}
                      {cCount > 0 && (
                        <span className="sl-comment-count">
                          <MessageSquare size={11} /> {cCount}
                        </span>
                      )}
                      <button 
                        className="sl-icon-btn sm" 
                        title="Assign Project"
                        onClick={(e) => { e.stopPropagation(); openAssignProject(leadId); }}
                        style={{ color: '#818cf8' }}
                      >
                        <FolderKanban size={13} />
                      </button>
                      <button 
                        className="sl-icon-btn sm" 
                        title="Assign Task"
                        onClick={(e) => { e.stopPropagation(); openAssignTask(leadId); }}
                        style={{ color: '#34d399' }}
                      >
                        <PlusCircle size={13} />
                      </button>
                      {!hasTeamMember && (
                        <button 
                          className="sl-icon-btn sm" 
                          title="Add as Team Member"
                          onClick={(e) => { e.stopPropagation(); openAddTeamMember(leadId); }}
                          style={{ color: '#f59e0b' }}
                        >
                          <UserCog size={13} />
                        </button>
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
          const d = getLeadData(selectedLead, projects, tasks, teamMembers, users);
          const leadComments = [...getComments(selectedLead)].sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
          
          // Get drill data based on activeKpi
          const getDrillItems = () => {
            switch (activeKpi) {
              case "projects":
                return d.projects;
              case "completed":
                return d.tasks.filter((t) => t.status === "done" || t.status === "completed");
              case "inProgress":
                return d.tasks.filter((t) => t.status === "in_progress" || t.status === "in-progress" || t.status === "review");
              case "todo":
                return d.tasks.filter((t) => t.status === "todo" || t.status === "pending" || t.status === "planning");
              case "team":
                return d.members;
              default:
                return [];
            }
          };
          
          const drillItems = getDrillItems();
          const drillCount = drillItems.length;
          const drillColor = activeKpi ? KPI_META[activeKpi]?.color || "#818cf8" : "#818cf8";
          const drillLabel = activeKpi ? KPI_META[activeKpi]?.label || "" : "";
          const DrillIcon = activeKpi ? KPI_META[activeKpi]?.icon || FolderKanban : FolderKanban;

          return (
            <motion.div className="sl-overlay"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => { setSelectedLead(null); setActiveKpi(null); }}>
              <motion.div className="sl-modal"
                initial={{ opacity: 0, y: 30, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 20, scale: 0.97 }}
                transition={{ type: "spring", stiffness: 300, damping: 28 }}
                onClick={(e) => e.stopPropagation()}>
                <div className="sl-modal-strip" style={{ background: d.perfColor }} />

                <div className="sl-modal-header">
                  <div className="sl-modal-avatar" style={{ borderColor: d.perfColor, color: d.perfColor }}>
                    {(d.user?.u_name || "?")[0].toUpperCase()}
                  </div>
                  <div className="sl-modal-title-block">
                    <h2 className="sl-modal-name">{d.user?.u_name || "Unknown Lead"}</h2>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      <span className="sl-perf-badge lg" style={{ color: d.perfColor, borderColor: d.perfColor }}>
                        <Award size={11} /> {d.performance}
                      </span>
                      <span className="badge badge-gray" style={{ fontSize: '11px' }}>
                        {d.user?.role || 'Lead'}
                      </span>
                      <span className="badge badge-gray" style={{ fontSize: '11px' }}>
                        {d.user?.email}
                      </span>
                      {!d.hasTeamMember && (
                        <span className="badge" style={{ 
                          fontSize: '10px', 
                          background: 'rgba(245, 158, 11, 0.15)', 
                          color: '#f59e0b',
                          border: '1px solid rgba(245, 158, 11, 0.3)'
                        }}>
                          No Team Profile
                        </span>
                      )}
                      {d.hasTeamMember && (
                        <span className="badge" style={{ 
                          fontSize: '10px', 
                          background: 'rgba(52, 211, 153, 0.15)', 
                          color: '#34d399',
                          border: '1px solid rgba(52, 211, 153, 0.3)'
                        }}>
                          ✅ Team Profile
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="sl-modal-header-actions">
                    {!d.hasTeamMember && (
                      <button 
                        className="sl-icon-btn" 
                        title="Add as Team Member"
                        onClick={() => { setSelectedLead(null); openAddTeamMember(selectedLead); }}
                        style={{ color: '#f59e0b' }}
                      >
                        <UserCog size={15} />
                      </button>
                    )}
                    <button 
                      className="sl-icon-btn" 
                      title="Assign Project"
                      onClick={() => { setSelectedLead(null); openAssignProject(selectedLead); }}
                      style={{ color: '#818cf8' }}
                    >
                      <FolderKanban size={15} />
                    </button>
                    <button 
                      className="sl-icon-btn" 
                      title="Assign Task"
                      onClick={() => { setSelectedLead(null); openAssignTask(selectedLead); }}
                      style={{ color: '#34d399' }}
                    >
                      <PlusCircle size={15} />
                    </button>
                    <button className="sl-icon-btn danger" title="Delete Lead" onClick={() => setDeleteLeadId(selectedLead)}>
                      <Trash2 size={15} />
                    </button>
                    <button className="sl-icon-btn" onClick={() => { setSelectedLead(null); setActiveKpi(null); }}>
                      <X size={16} />
                    </button>
                  </div>
                </div>

                <div className="sl-modal-body">
                  {/* ─── KPI CARDS ─── */}
                  <div className="sl-kpi-row">
                    {[
                      { key: "projects", icon: FolderKanban, label: "Projects", value: d.projects.length, color: "#818cf8" },
                      { key: "completed", icon: CheckCircle2, label: "Completed", value: d.completed, color: "#34d399" },
                      { key: "inProgress", icon: Clock, label: "In Progress", value: d.inProgress, color: "#f59e0b" },
                      { key: "todo", icon: AlertCircle, label: "To Do", value: d.todo, color: "#94a3b8" },
                      { key: "team", icon: Users, label: "Team Size", value: d.uniqueMemberIds.length, color: "#2dd4bf" },
                    ].map(({ key, icon: Icon, label, value, color }) => (
                      <motion.div key={key}
                        className={`sl-kpi-card${activeKpi === key ? " kpi-active" : ""}`}
                        style={{ "--kpi-color": color }}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.96 }}
                        onClick={() => handleKpiClick(key)}>
                        <div className="sl-kpi-icon" style={{ background: `${color}20` }}>
                          <Icon size={15} style={{ color }} />
                        </div>
                        <div className="sl-kpi-value">{value}</div>
                        <div className="sl-kpi-label">{label}</div>
                        {activeKpi === key && <div className="sl-kpi-dot" style={{ background: color }} />}
                      </motion.div>
                    ))}
                  </div>

                  {/* ─── DRILL-DOWN PANEL ─── */}
                  {activeKpi && (
                    <div 
                      className="sl-drilldown"
                      style={{ 
                        "--drill-color": drillColor,
                        borderColor: `${drillColor}44`
                      }}
                    >
                      <div className="sl-drill-header">
                        <span className="sl-drill-title">
                          <DrillIcon size={14} style={{ color: drillColor }} />
                          {drillLabel}
                        </span>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span className="sl-drill-count" style={{ color: drillColor }}>
                            {drillCount}
                          </span>
                          <button className="sl-icon-btn sm" onClick={() => setActiveKpi(null)}>
                            <X size={12}/>
                          </button>
                        </div>
                      </div>

                      <div className="sl-drill-list">
                        {drillCount === 0 ? (
                          <div className="sl-drill-empty">
                            <p>No {drillLabel.toLowerCase()} found</p>
                          </div>
                        ) : activeKpi === "projects" ? (
                          // ─── Projects List ───
                          drillItems.map((p) => (
                            <div key={p.p_id || p.id} className="sl-drill-row">
                              <div className="sl-drill-icon-wrap" style={{ background: `${drillColor}20` }}>
                                <Briefcase size={13} style={{ color: drillColor }} />
                              </div>
                              <div className="sl-drill-info">
                                <span className="sl-drill-name">{p.p_name || p.name}</span>
                                {p.desc && <span className="sl-drill-sub">{p.desc || p.description}</span>}
                              </div>
                              <div className="sl-drill-badges">
                                <StatusBadge status={p.status}/>
                                <PriorityBadge priority={p.priority}/>
                              </div>
                            </div>
                          ))
                        ) : activeKpi === "team" ? (
                          // ─── Team Members List ───
                          drillItems.map((m) => (
                            <div key={m.id} className="sl-drill-row">
                              <div className="sl-drill-avatar-sm">{(m.name || "?")[0].toUpperCase()}</div>
                              <div className="sl-drill-info">
                                <span className="sl-drill-name">{m.name}</span>
                                {m.role && <span className="sl-drill-sub">{m.role}</span>}
                              </div>
                              {m.email && <span className="sl-drill-email">{m.email}</span>}
                            </div>
                          ))
                        ) : (
                          // ─── Tasks List (completed, inProgress, todo) ───
                          drillItems.map((t) => {
                            const pct = t.progress ?? (t.status === "done" || t.status === "completed" ? 100 : 
                                      t.status === "in_progress" || t.status === "in-progress" ? 50 : 
                                      t.status === "review" ? 75 : 0);
                            const proj = d.projects.find((p) => Number(p.p_id || p.id) === Number(t.p_id || t.p));
                            return (
                              <div key={t.t_id || t.id} className="sl-drill-row">
                                <div className="sl-drill-icon-wrap" style={{ background: `${drillColor}20` }}>
                                  <CheckCircle2 size={13} style={{ color: drillColor }} />
                                </div>
                                <div className="sl-drill-info">
                                  <span className="sl-drill-name">{t.title}</span>
                                  {t.desc && <span className="sl-drill-sub">{t.desc}</span>}
                                  {proj && (
                                    <span className="sl-drill-proj-tag">
                                      <FolderKanban size={9}/> {proj.p_name || proj.name}
                                    </span>
                                  )}
                                  <div className="sl-drill-prog-row">
                                    <div className="sl-drill-prog-track">
                                      <div className="sl-drill-prog-fill" style={{ width: `${pct}%`, background: drillColor }} />
                                    </div>
                                    <span className="sl-drill-prog-pct">{pct}%</span>
                                  </div>
                                </div>
                                <div className="sl-drill-badges">
                                  <PriorityBadge priority={t.priority}/>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  )}

                  {/* ─── COMPLETION ─── */}
                  <div className="sl-section">
                    <h4 className="sl-section-title"><TrendingUp size={14}/> Completion Rate</h4>
                    <div className="sl-progress-row">
                      <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>Overall</span>
                      <span style={{ fontWeight: 700, color: d.perfColor }}>{d.completionRate}%</span>
                    </div>
                    <div className="sl-fat-track">
                      <motion.div className="sl-fat-fill"
                        initial={{ width: 0 }}
                        animate={{ width: `${d.completionRate}%` }}
                        transition={{ duration: 0.7, ease: "easeOut" }}
                        style={{ background: d.perfColor }}/>
                    </div>
                  </div>

                  {/* ─── PROJECTS ─── */}
                  <div className="sl-section">
                    <h4 className="sl-section-title"><FolderKanban size={14}/> Projects ({d.projects.length})</h4>
                    <div className="sl-project-list">
                      {d.projects.length === 0 ? (
                        <div className="sl-drill-empty">No projects assigned</div>
                      ) : (
                        d.projects.map((p) => (
                          <div key={p.p_id || p.id} className="sl-project-row">
                            <div className="sl-project-info">
                              <span className="sl-project-name">{p.p_name || p.name}</span>
                              {p.desc && <span className="sl-project-desc">{p.desc || p.description}</span>}
                            </div>
                            <div className="sl-project-badges">
                              <StatusBadge status={p.status}/>
                              <PriorityBadge priority={p.priority}/>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {/* ─── TASK BREAKDOWN ─── */}
                  <div className="sl-section">
                    <h4 className="sl-section-title"><BarChart2 size={14}/> Task Breakdown</h4>
                    <div className="sl-task-breakdown">
                      <BreakdownBar label="Done" value={d.completed} total={d.totalTasks} color="#34d399"/>
                      <BreakdownBar label="In Progress" value={d.inProgress} total={d.totalTasks} color="#f59e0b"/>
                      <BreakdownBar label="To Do" value={d.todo} total={d.totalTasks} color="#94a3b8"/>
                    </div>
                  </div>

                  {/* ─── TEAM ─── */}
                  {d.members.length > 0 && (
                    <div className="sl-section">
                      <h4 className="sl-section-title"><Users size={14}/> Team Members ({d.members.length})</h4>
                      <div className="sl-team-grid">
                        {d.members.map((m) => (
                          <div key={m.id} className="sl-member-chip">
                            <div className="sl-member-avatar">{(m.name || "?")[0].toUpperCase()}</div>
                            <div>
                              <div className="sl-member-name">{m.name}</div>
                              {m.role && <div className="sl-member-role">{m.role}</div>}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* ─── COMMENTS ─── */}
                  <div className="sl-section">
                    <h4 className="sl-section-title"><MessageSquare size={14}/> Comments</h4>
                    <div className="sl-comment-input-row">
                      <textarea className="sl-comment-input"
                        placeholder="Send a comment to this lead… (Ctrl+Enter to send)"
                        value={commentText} rows={2}
                        onChange={(e) => setCommentText(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter" && e.ctrlKey) addComment(selectedLead); }}/>
                      <button className="sl-send-btn" onClick={() => addComment(selectedLead)}>
                        <Send size={14}/> Send
                      </button>
                    </div>
                    {leadComments.length === 0
                      ? <p className="sl-no-comments">No comments yet. Be the first!</p>
                      : (
                        <div className="sl-comment-list">
                          {leadComments.map((c) => (
                            <div key={c.c_id} className={`sl-comment-item${c.pinned ? " pinned" : ""}`}>
                              {c.pinned && <div className="sl-pin-label"><Pin size={10}/> Pinned</div>}
                              <p className="sl-comment-text">{c.text}</p>
                              <div className="sl-comment-footer">
                                <small className="sl-comment-time">{c.created_at}</small>
                                <div className="sl-comment-actions">
                                  <button className={`sl-icon-btn sm${c.pinned ? " active" : ""}`}
                                    title={c.pinned ? "Unpin" : "Pin"}
                                    onClick={() => togglePin(selectedLead, c.c_id)}>
                                    {c.pinned ? <PinOff size={11}/> : <Pin size={11}/>}
                                  </button>
                                  <button className="sl-icon-btn sm danger"
                                    onClick={() => deleteComment(selectedLead, c.c_id)}>
                                    <Trash2 size={11}/> 
                                  </button>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )
                    }
                  </div>

                  {/* ─── Quick Actions ─── */}
                  <div className="sl-section">
                    <h4 className="sl-section-title"><Activity size={14}/> Quick Actions</h4>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      <button 
                        className="btn btn-secondary btn-sm"
                        onClick={() => {
                          toast.success(`Opening projects for ${d.user?.u_name}`);
                        }}
                      >
                        <FolderKanban size={14} /> View Projects
                      </button>
                      <button 
                        className="btn btn-secondary btn-sm"
                        onClick={() => {
                          toast.success(`Opening tasks for ${d.user?.u_name}`);
                        }}
                      >
                        <CheckCircle2 size={14} /> View Tasks
                      </button>
                      <button 
                        className="btn btn-primary btn-sm"
                        onClick={() => { openAssignProject(selectedLead); }}
                      >
                        <UserPlus size={14} /> Assign Project
                      </button>
                      <button 
                        className="btn btn-primary btn-sm"
                        onClick={() => { openAssignTask(selectedLead); }}
                      >
                        <PlusCircle size={14} /> Assign Task
                      </button>
                      {!d.hasTeamMember && (
                        <button 
                          className="btn btn-success btn-sm"
                          onClick={() => { openAddTeamMember(selectedLead); }}
                          style={{ background: '#34d399', color: '#fff', border: 'none' }}
                        >
                          <UserCog size={14} /> Add as Team Member
                        </button>
                      )}
                    </div>
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
          <motion.div className="sl-overlay" style={{ zIndex: 1100 }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => { setShowAssignProject(false); setAssignProjectData({ projectId: "", leadId: "" }); setPendingActionAfterAdd(null); }}>
            <motion.div className="sl-modal" style={{ maxWidth: '500px' }}
              initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}>
              <div className="sl-modal-header">
                <h2 className="sl-modal-name" style={{ fontSize: '18px', marginBottom: 0 }}>
                  <FolderKanban size={18} style={{ marginRight: '8px' }} />
                  Assign Project to Lead
                </h2>
                <button className="sl-icon-btn" onClick={() => { setShowAssignProject(false); setAssignProjectData({ projectId: "", leadId: "" }); setPendingActionAfterAdd(null); }}>
                  <X size={16} />
                </button>
              </div>
              <div className="sl-modal-body" style={{ padding: '20px' }}>
                <div style={{ marginBottom: '16px' }}>
                  <label className="form-label">Select Lead</label>
                  <select
                    className="input"
                    value={assignProjectData.leadId}
                    onChange={(e) => setAssignProjectData({ ...assignProjectData, leadId: e.target.value })}
                    style={{ width: '100%' }}
                  >
                    <option value="">Select a lead...</option>
                    {leadList.map(id => {
                      const u = users.find(u => Number(u.id || u.u_id) === Number(id));
                      const hasTM = !!getTeamMemberIdForUser(id);
                      return (
                        <option key={id} value={id}>
                          {u?.u_name || u?.name || 'Unknown'} {hasTM ? '✅ Has Profile' : '⚠️ No Profile'}
                        </option>
                      );
                    })}
                  </select>
                </div>

                <div style={{ marginBottom: '16px' }}>
                  <label className="form-label">Select Project</label>
                  <select
                    className="input"
                    value={assignProjectData.projectId}
                    onChange={(e) => setAssignProjectData({ ...assignProjectData, projectId: e.target.value })}
                    style={{ width: '100%' }}
                  >
                    <option value="">Select a project...</option>
                    {projects.filter(p => !p.is_deleted).map(p => (
                      <option key={p.p_id || p.id} value={p.p_id || p.id}>
                        {p.p_name || p.name} ({p.status || 'Planning'})
                      </option>
                    ))}
                  </select>
                </div>

                {assignProjectData.projectId && assignProjectData.leadId && (() => {
                  const teamMemberId = getTeamMemberIdForUser(parseInt(assignProjectData.leadId));
                  const hasTeamMember = !!teamMemberId;
                  return (
                    <div style={{ 
                      padding: '10px 14px', 
                      borderRadius: '8px', 
                      background: hasTeamMember ? 'rgba(52, 211, 153, 0.08)' : 'rgba(245, 158, 11, 0.08)',
                      border: '1px solid ' + (hasTeamMember ? 'rgba(52, 211, 153, 0.3)' : 'rgba(245, 158, 11, 0.3)'),
                      marginBottom: '16px',
                      fontSize: '13px'
                    }}>
                      <p><strong>Lead:</strong> {getUserName(parseInt(assignProjectData.leadId))}</p>
                      <p><strong>Project:</strong> {projects.find(p => Number(p.p_id || p.id) === parseInt(assignProjectData.projectId))?.p_name || 'Unknown'}</p>
                      <p style={{ marginTop: '6px', fontSize: '11px', color: hasTeamMember ? '#34d399' : '#f59e0b' }}>
                        {hasTeamMember 
                          ? `✅ Team Member ID: ${teamMemberId} - Ready to assign!` 
                          : '⚠️ This lead does NOT have a Team Member profile. Click "Add as Team Member" to create one.'}
                      </p>
                      {!hasTeamMember && (
                        <button 
                          className="btn btn-success btn-sm"
                          onClick={() => { 
                            setShowAssignProject(false); 
                            setPendingActionAfterAdd('assignProject');
                            openAddTeamMember(parseInt(assignProjectData.leadId)); 
                          }}
                          style={{ marginTop: '8px', background: '#34d399', color: '#fff', border: 'none' }}
                        >
                          <UserCog size={14} /> Add as Team Member
                        </button>
                      )}
                    </div>
                  );
                })()}

                <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                  <button className="btn btn-secondary btn-sm" onClick={() => { setShowAssignProject(false); setAssignProjectData({ projectId: "", leadId: "" }); setPendingActionAfterAdd(null); }}>
                    Cancel
                  </button>
                  <button className="btn btn-primary btn-sm" onClick={handleAssignProject} disabled={submitting}>
                    {submitting ? <Loader2 size={14} className="spin" /> : <UserCheck size={14} />}
                    {submitting ? 'Assigning...' : 'Assign Project'}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── ASSIGN TASK MODAL ─── */}
      <AnimatePresence>
        {showAssignTask && (
          <motion.div className="sl-overlay" style={{ zIndex: 1100 }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => { setShowAssignTask(false); setAssignTaskData({ title: "", description: "", priority: "medium", status: "todo", projectId: "", leadId: "", dueDate: "" }); setPendingActionAfterAdd(null); }}>
            <motion.div className="sl-modal" style={{ maxWidth: '500px' }}
              initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}>
              <div className="sl-modal-header">
                <h2 className="sl-modal-name" style={{ fontSize: '18px', marginBottom: 0 }}>
                  <ClipboardList size={18} style={{ marginRight: '8px' }} />
                  Assign Task to Lead
                </h2>
                <button className="sl-icon-btn" onClick={() => { setShowAssignTask(false); setAssignTaskData({ title: "", description: "", priority: "medium", status: "todo", projectId: "", leadId: "", dueDate: "" }); setPendingActionAfterAdd(null); }}>
                  <X size={16} />
                </button>
              </div>
              <div className="sl-modal-body" style={{ padding: '20px' }}>
                <div style={{ marginBottom: '12px' }}>
                  <label className="form-label">Select Lead *</label>
                  <select
                    className="input"
                    value={assignTaskData.leadId}
                    onChange={(e) => setAssignTaskData({ ...assignTaskData, leadId: e.target.value })}
                    style={{ width: '100%' }}
                  >
                    <option value="">Select a lead...</option>
                    {leadList.map(id => {
                      const u = users.find(u => Number(u.id || u.u_id) === Number(id));
                      const hasTM = !!getTeamMemberIdForUser(id);
                      return (
                        <option key={id} value={id}>
                          {u?.u_name || u?.name || 'Unknown'} {hasTM ? '✅ Has Profile' : '⚠️ No Profile'}
                        </option>
                      );
                    })}
                  </select>
                </div>

                <div style={{ marginBottom: '12px' }}>
                  <label className="form-label">Select Project *</label>
                  <select
                    className="input"
                    value={assignTaskData.projectId}
                    onChange={(e) => setAssignTaskData({ ...assignTaskData, projectId: e.target.value })}
                    style={{ width: '100%' }}
                  >
                    <option value="">Select a project...</option>
                    {projects.filter(p => !p.is_deleted).map(p => (
                      <option key={p.p_id || p.id} value={p.p_id || p.id}>
                        {p.p_name || p.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div style={{ marginBottom: '12px' }}>
                  <label className="form-label">Task Title *</label>
                  <input
                    className="input"
                    placeholder="Enter task title"
                    value={assignTaskData.title}
                    onChange={(e) => setAssignTaskData({ ...assignTaskData, title: e.target.value })}
                    style={{ width: '100%' }}
                  />
                </div>

                <div style={{ marginBottom: '12px' }}>
                  <label className="form-label">Description</label>
                  <textarea
                    className="input"
                    placeholder="Enter task description"
                    value={assignTaskData.description}
                    onChange={(e) => setAssignTaskData({ ...assignTaskData, description: e.target.value })}
                    style={{ width: '100%', minHeight: '60px', resize: 'vertical' }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                  <div>
                    <label className="form-label">Priority</label>
                    <select
                      className="input"
                      value={assignTaskData.priority}
                      onChange={(e) => setAssignTaskData({ ...assignTaskData, priority: e.target.value })}
                      style={{ width: '100%' }}
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                      <option value="critical">Critical</option>
                    </select>
                  </div>
                  <div>
                    <label className="form-label">Status</label>
                    <select
                      className="input"
                      value={assignTaskData.status}
                      onChange={(e) => setAssignTaskData({ ...assignTaskData, status: e.target.value })}
                      style={{ width: '100%' }}
                    >
                      <option value="todo">To Do</option>
                      <option value="in_progress">In Progress</option>
                      <option value="review">Review</option>
                      <option value="done">Done</option>
                    </select>
                  </div>
                </div>

                <div style={{ marginBottom: '16px' }}>
                  <label className="form-label">Due Date</label>
                  <input
                    type="date"
                    className="input"
                    value={assignTaskData.dueDate}
                    onChange={(e) => setAssignTaskData({ ...assignTaskData, dueDate: e.target.value })}
                    style={{ width: '100%' }}
                  />
                </div>

                {assignTaskData.leadId && (() => {
                  const teamMemberId = getTeamMemberIdForUser(parseInt(assignTaskData.leadId));
                  const hasTeamMember = !!teamMemberId;
                  return (
                    <div style={{ 
                      padding: '8px 12px', 
                      borderRadius: '6px', 
                      background: hasTeamMember ? 'rgba(52, 211, 153, 0.08)' : 'rgba(245, 158, 11, 0.08)',
                      border: '1px solid ' + (hasTeamMember ? 'rgba(52, 211, 153, 0.3)' : 'rgba(245, 158, 11, 0.3)'),
                      marginBottom: '16px',
                      fontSize: '12px',
                      color: hasTeamMember ? '#34d399' : '#f59e0b'
                    }}>
                      {hasTeamMember 
                        ? `✅ Team Member ID: ${teamMemberId} - Ready to assign!` 
                        : '⚠️ This lead does NOT have a Team Member profile. Click "Add as Team Member" to create one.'}
                      {!hasTeamMember && (
                        <button 
                          className="btn btn-success btn-sm"
                          onClick={() => { 
                            setShowAssignTask(false); 
                            setPendingActionAfterAdd('assignTask');
                            openAddTeamMember(parseInt(assignTaskData.leadId)); 
                          }}
                          style={{ marginTop: '6px', background: '#34d399', color: '#fff', border: 'none', fontSize: '11px' }}
                        >
                          <UserCog size={12} /> Add as Team Member
                        </button>
                      )}
                    </div>
                  );
                })()}

                <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                  <button className="btn btn-secondary btn-sm" onClick={() => { setShowAssignTask(false); setAssignTaskData({ title: "", description: "", priority: "medium", status: "todo", projectId: "", leadId: "", dueDate: "" }); setPendingActionAfterAdd(null); }}>
                    Cancel
                  </button>
                  <button className="btn btn-primary btn-sm" onClick={handleAssignTask} disabled={submitting}>
                    {submitting ? <Loader2 size={14} className="spin" /> : <PlusCircle size={14} />}
                    {submitting ? 'Assigning...' : 'Assign Task'}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── ADD TEAM MEMBER MODAL ─── */}
      <AnimatePresence>
        {showAddTeamMember && (
          <motion.div className="sl-overlay" style={{ zIndex: 1100 }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => { setShowAddTeamMember(false); setTeamMemberForm({ name: "", description: "", skills: "", role: "", qualification: "", experience: 0 }); setPendingActionAfterAdd(null); }}>
            <motion.div className="sl-modal" style={{ maxWidth: '500px' }}
              initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}>
              <div className="sl-modal-header">
                <h2 className="sl-modal-name" style={{ fontSize: '18px', marginBottom: 0 }}>
                  <UserCog size={18} style={{ marginRight: '8px' }} />
                  Add Team Member
                </h2>
                <button className="sl-icon-btn" onClick={() => { setShowAddTeamMember(false); setTeamMemberForm({ name: "", description: "", skills: "", role: "", qualification: "", experience: 0 }); setPendingActionAfterAdd(null); }}>
                  <X size={16} />
                </button>
              </div>
              <div className="sl-modal-body" style={{ padding: '20px' }}>
                <div style={{ marginBottom: '12px' }}>
                  <label className="form-label">Name *</label>
                  <input
                    className="input"
                    placeholder="Enter full name"
                    value={teamMemberForm.name}
                    onChange={(e) => setTeamMemberForm({ ...teamMemberForm, name: e.target.value })}
                    style={{ width: '100%' }}
                  />
                </div>

                <div style={{ marginBottom: '12px' }}>
                  <label className="form-label">Role</label>
                  <input
                    className="input"
                    placeholder="e.g., Developer, Designer, Manager"
                    value={teamMemberForm.role}
                    onChange={(e) => setTeamMemberForm({ ...teamMemberForm, role: e.target.value })}
                    style={{ width: '100%' }}
                  />
                </div>

                <div style={{ marginBottom: '12px' }}>
                  <label className="form-label">Description</label>
                  <textarea
                    className="input"
                    placeholder="Brief description about the team member"
                    value={teamMemberForm.description}
                    onChange={(e) => setTeamMemberForm({ ...teamMemberForm, description: e.target.value })}
                    style={{ width: '100%', minHeight: '60px', resize: 'vertical' }}
                  />
                </div>

                <div style={{ marginBottom: '12px' }}>
                  <label className="form-label">Skills</label>
                  <input
                    className="input"
                    placeholder="e.g., React, Django, PostgreSQL"
                    value={teamMemberForm.skills}
                    onChange={(e) => setTeamMemberForm({ ...teamMemberForm, skills: e.target.value })}
                    style={{ width: '100%' }}
                  />
                </div>

                <div style={{ marginBottom: '12px' }}>
                  <label className="form-label">Qualification</label>
                  <input
                    className="input"
                    placeholder="e.g., BSc Computer Science"
                    value={teamMemberForm.qualification}
                    onChange={(e) => setTeamMemberForm({ ...teamMemberForm, qualification: e.target.value })}
                    style={{ width: '100%' }}
                  />
                </div>

                <div style={{ marginBottom: '16px' }}>
                  <label className="form-label">Experience (Years)</label>
                  <input
                    type="number"
                    className="input"
                    placeholder="0"
                    min="0"
                    value={teamMemberForm.experience}
                    onChange={(e) => setTeamMemberForm({ ...teamMemberForm, experience: parseInt(e.target.value) || 0 })}
                    style={{ width: '100%' }}
                  />
                </div>

                <div style={{ 
                  padding: '10px 14px', 
                  borderRadius: '8px', 
                  background: 'rgba(52, 211, 153, 0.08)',
                  border: '1px solid rgba(52, 211, 153, 0.3)',
                  marginBottom: '16px',
                  fontSize: '13px',
                  color: '#34d399'
                }}>
                  ℹ️ This will create a Team Member profile linked to <strong>{getUserName(selectedLeadForAssignment)}</strong>
                  {pendingActionAfterAdd && (
                    <span style={{ display: 'block', marginTop: '4px', fontSize: '12px', color: '#818cf8' }}>
                      ⚡ After adding, you'll be able to {pendingActionAfterAdd === 'assignProject' ? 'assign a project' : 'assign a task'} immediately!
                    </span>
                  )}
                </div>

                <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                  <button className="btn btn-secondary btn-sm" onClick={() => { setShowAddTeamMember(false); setTeamMemberForm({ name: "", description: "", skills: "", role: "", qualification: "", experience: 0 }); setPendingActionAfterAdd(null); }}>
                    Cancel
                  </button>
                  <button className="btn btn-success btn-sm" onClick={handleAddTeamMember} disabled={submitting} style={{ background: '#34d399', color: '#fff', border: 'none' }}>
                    {submitting ? <Loader2 size={14} className="spin" /> : <UserCheck size={14} />}
                    {submitting ? 'Adding...' : 'Add Team Member'}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── DELETE LEAD CONFIRM ─── */}
      <AnimatePresence>
        {deleteLeadId !== null && (
          <motion.div className="sl-overlay" style={{ zIndex: 1100 }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setDeleteLeadId(null)}>
            <motion.div className="sl-confirm-box"
              initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}>
              <Trash2 size={28} style={{ color: "#f87171", marginBottom: 10 }}/>
              <h3 className="sl-confirm-title">Remove Lead?</h3>
              <p className="sl-confirm-desc">This lead will be removed from the overview. Their projects and tasks remain in the system.</p>
              <div className="sl-confirm-actions">
                <button className="sl-btn sl-btn-danger" onClick={() => deleteLead(deleteLeadId)}>Yes, Remove</button>
                <button className="sl-btn sl-btn-ghost" onClick={() => setDeleteLeadId(null)}>Cancel</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        .spin { animation: spin 1s linear infinite; }

        .sl-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(270px,1fr)); gap: 18px; }

        .ll-filters-container {
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

        .ll-filters-container:focus-within {
          border-color: var(--accent-primary);
          box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.08);
        }

        .ll-search-wrapper {
          position: relative;
          display: flex;
          align-items: center;
          width: 100%;
        }

        .ll-search-icon {
          position: absolute;
          left: 14px;
          color: var(--text-muted);
          pointer-events: none;
          transition: color 0.2s;
        }

        .ll-search-wrapper:focus-within .ll-search-icon {
          color: var(--accent-primary);
        }

        .ll-search-input {
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

        .ll-search-input:focus {
          border-color: var(--accent-primary);
          background: var(--bg-card);
          box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.08);
        }

        .ll-search-input::placeholder {
          color: var(--text-muted);
        }

        .ll-search-clear {
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

        .ll-search-clear:hover {
          background: var(--border-default);
          color: var(--text-primary);
        }

        .ll-filter-controls {
          display: flex;
          align-items: center;
          gap: 16px;
          flex-wrap: wrap;
        }

        .ll-filter-group {
          display: flex;
          align-items: center;
          gap: 8px;
          flex: 1;
          min-width: 160px;
        }

        .ll-filter-label {
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

        .ll-filter-select {
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
          min-width: 140px;
          appearance: none;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E");
          background-repeat: no-repeat;
          background-position: right 10px center;
          padding-right: 32px;
        }

        .ll-filter-select:hover {
          border-color: var(--border-strong);
          background-color: var(--bg-hover);
        }

        .ll-filter-select:focus {
          border-color: var(--accent-primary);
          background-color: var(--bg-card);
          box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.08);
        }

        .ll-active-filters {
          display: flex;
          align-items: center;
          gap: 6px;
          flex-wrap: wrap;
          margin-left: auto;
        }

        .ll-filter-chip {
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

        .ll-filter-chip button {
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

        .ll-filter-chip button:hover {
          background: rgba(239, 68, 68, 0.1);
          color: #ef4444;
        }

        .ll-results-count {
          display: flex;
          align-items: center;
          gap: 8px;
          padding-top: 12px;
          border-top: 1px solid var(--border-subtle);
          font-size: 12px;
          color: var(--text-muted);
          flex-wrap: wrap;
        }

        .ll-results-count span {
          font-weight: 500;
        }

        .ll-results-count .ll-results-total {
          color: var(--text-secondary);
        }

        .ll-results-dot {
          color: var(--border-default);
        }

        .ll-clear-filters-btn {
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

        .ll-clear-filters-btn:hover {
          background: var(--bg-hover);
          color: var(--accent-primary);
        }

        .sl-card {
          padding: 18px; position: relative; overflow: hidden; cursor: pointer;
          display: flex; flex-direction: column; gap: 14px; transition: box-shadow 0.2s;
        }
        .sl-card:hover { box-shadow: 0 8px 28px rgba(0,0,0,0.12); }
        .sl-strip { position: absolute; top: 0; left: 0; right: 0; height: 3px; border-radius: 16px 16px 0 0; }
        .sl-card-header { display: flex; align-items: center; gap: 10px; padding-top: 4px; }
        .sl-avatar {
          width: 38px; height: 38px; border-radius: 50%;
          background: var(--bg-secondary); border: 2px solid var(--border-subtle);
          display: flex; align-items: center; justify-content: center;
          font-size: 15px; font-weight: 800; color: var(--text-primary); flex-shrink: 0;
        }
        .sl-card-title { flex: 1; min-width: 0; }
        .sl-card-title h3 { font-size: 14px; font-weight: 700; color: var(--text-primary); }
        .sl-chevron { color: var(--text-muted); flex-shrink: 0; }
        .sl-perf-badge {
          display: inline-flex; align-items: center; gap: 4px;
          font-size: 10px; font-weight: 700; border: 1px solid; border-radius: 20px;
          padding: 2px 8px; text-transform: uppercase; letter-spacing: 0.4px;
        }
        .sl-perf-badge.lg { font-size: 11px; padding: 3px 10px; }
        .sl-stats-mini { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
        .sl-progress-row { display: flex; justify-content: space-between; font-size: 11px; margin-bottom: 5px; color: var(--text-secondary); }
        .sl-card-footer {
          display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap;
          border-top: 1px solid var(--border-subtle); padding-top: 10px;
        }
        .sl-project-tags { display: flex; flex-wrap: wrap; gap: 5px; }
        .sl-proj-tag { font-size: 10px !important; padding: 2px 8px !important; }
        .sl-comment-count { display: flex; align-items: center; gap: 4px; font-size: 11px; color: var(--text-muted); }

        .sl-overlay {
          position: fixed; inset: 0; background: rgba(0,0,0,0.6); backdrop-filter: blur(6px);
          display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 16px;
        }
        .sl-modal {
          width: 100%; max-width: 640px; max-height: 90vh;
          background: var(--bg-card); border: 1px solid var(--border-default); border-radius: 22px;
          overflow: hidden; display: flex; flex-direction: column;
          box-shadow: 0 30px 80px rgba(0,0,0,0.35);
        }
        .sl-modal-strip { height: 4px; width: 100%; flex-shrink: 0; }
        .sl-modal-header {
          display: flex; align-items: center; gap: 14px;
          padding: 18px 20px 14px; border-bottom: 1px solid var(--border-subtle); flex-shrink: 0;
        }
        .sl-modal-avatar {
          width: 52px; height: 52px; border-radius: 50%; border: 2px solid;
          background: var(--bg-secondary);
          display: flex; align-items: center; justify-content: center;
          font-size: 20px; font-weight: 800; flex-shrink: 0;
        }
        .sl-modal-title-block { flex: 1; min-width: 0; }
        .sl-modal-name { font-size: 19px; font-weight: 800; color: var(--text-primary); margin-bottom: 5px; }
        .sl-modal-header-actions { display: flex; gap: 8px; flex-shrink: 0; }
        .sl-modal-body {
          overflow-y: auto; padding: 18px 20px 24px; display: flex; flex-direction: column; gap: 20px;
          scrollbar-width: thin; scrollbar-color: var(--border-default) transparent;
        }

        .sl-kpi-row { display: grid; grid-template-columns: repeat(5,1fr); gap: 10px; }
        .sl-kpi-card {
          display: flex; flex-direction: column; align-items: center; gap: 6px;
          padding: 12px 8px; border-radius: 12px; border: 1px solid var(--border-subtle);
          background: var(--bg-secondary); text-align: center; cursor: pointer;
          position: relative; transition: border-color 0.15s, box-shadow 0.15s, background 0.15s;
          user-select: none;
        }
        .sl-kpi-card:hover {
          border-color: var(--kpi-color, var(--accent-primary));
          box-shadow: 0 2px 12px rgba(0,0,0,0.09);
        }
        .sl-kpi-card.kpi-active {
          border-color: var(--kpi-color, var(--accent-primary));
          background: color-mix(in srgb, var(--kpi-color, var(--accent-primary)) 10%, var(--bg-secondary));
          box-shadow: 0 0 0 2px color-mix(in srgb, var(--kpi-color, var(--accent-primary)) 25%, transparent);
        }
        .sl-kpi-icon { width: 32px; height: 32px; border-radius: 8px; display: flex; align-items: center; justify-content: center; }
        .sl-kpi-value { font-size: 20px; font-weight: 800; color: var(--text-primary); line-height: 1; }
        .sl-kpi-label { font-size: 10px; color: var(--text-muted); font-weight: 600; text-transform: uppercase; letter-spacing: 0.3px; }
        .sl-kpi-dot {
          position: absolute; bottom: 6px; left: 50%; transform: translateX(-50%);
          width: 5px; height: 5px; border-radius: 50%;
        }

        .sl-drilldown {
          border: 1px solid color-mix(in srgb, var(--drill-color, var(--accent-primary)) 35%, var(--border-subtle));
          border-radius: 14px; overflow: hidden;
          background: color-mix(in srgb, var(--drill-color, var(--accent-primary)) 4%, var(--bg-secondary));
          margin-top: 12px;
        }
        .sl-drill-header {
          display: flex; align-items: center; justify-content: space-between; padding: 10px 14px;
          border-bottom: 1px solid color-mix(in srgb, var(--drill-color, var(--accent-primary)) 20%, var(--border-subtle));
          background: color-mix(in srgb, var(--drill-color, var(--accent-primary)) 8%, var(--bg-card));
        }
        .sl-drill-title { display: flex; align-items: center; gap: 7px; font-size: 13px; font-weight: 700; color: var(--text-primary); }
        .sl-drill-count {
          font-size: 11px; font-weight: 700;
          background: color-mix(in srgb, var(--drill-color, var(--accent-primary)) 18%, transparent);
          color: var(--drill-color, var(--accent-primary));
          border-radius: 20px; padding: 2px 9px;
        }
        .sl-drill-list {
          display: flex; flex-direction: column; max-height: 320px; overflow-y: auto;
          scrollbar-width: thin; scrollbar-color: var(--border-default) transparent;
        }
        .sl-drill-row {
          display: flex; align-items: center; gap: 10px; padding: 10px 14px;
          border-bottom: 1px solid color-mix(in srgb, var(--drill-color, var(--accent-primary)) 10%, var(--border-subtle));
          transition: background 0.12s;
        }
        .sl-drill-row:last-child { border-bottom: none; }
        .sl-drill-row:hover { background: color-mix(in srgb, var(--drill-color, var(--accent-primary)) 6%, transparent); }
        .sl-drill-icon-wrap {
          width: 28px; height: 28px; border-radius: 7px; flex-shrink: 0;
          display: flex; align-items: center; justify-content: center;
        }
        .sl-drill-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
        .sl-drill-name { font-size: 13px; font-weight: 600; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .sl-drill-sub  { font-size: 11px; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .sl-drill-proj-tag { display: inline-flex; align-items: center; gap: 3px; font-size: 10px; color: var(--text-muted); margin-top: 2px; }
        .sl-drill-prog-row { display: flex; align-items: center; gap: 7px; margin-top: 5px; }
        .sl-drill-prog-track { flex: 1; height: 5px; background: var(--border-subtle); border-radius: 10px; overflow: hidden; }
        .sl-drill-prog-fill { height: 100%; border-radius: 10px; }
        .sl-drill-prog-pct { font-size: 10px; font-weight: 700; color: var(--text-secondary); white-space: nowrap; }
        .sl-drill-badges { display: flex; gap: 5px; flex-shrink: 0; flex-wrap: wrap; justify-content: flex-end; }
        .sl-drill-avatar-sm {
          width: 28px; height: 28px; border-radius: 50%; flex-shrink: 0;
          background: var(--bg-card); border: 1px solid var(--border-default);
          display: flex; align-items: center; justify-content: center;
          font-size: 12px; font-weight: 700; color: var(--text-primary);
        }
        .sl-drill-email { font-size: 11px; color: var(--text-muted); flex-shrink: 0; }
        .sl-drill-empty { text-align: center; color: var(--text-muted); font-size: 13px; padding: 18px 0; }
        .sl-drill-empty p { margin: 0; }

        .sl-section { display: flex; flex-direction: column; gap: 10px; }
        .sl-section-title {
          display: flex; align-items: center; gap: 7px; font-size: 13px; font-weight: 700;
          color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.5px;
        }
        .sl-fat-track { width: 100%; height: 12px; background: var(--border-subtle); border-radius: 20px; overflow: hidden; }
        .sl-fat-fill  { height: 100%; border-radius: 20px; }

        .sl-project-list { display: flex; flex-direction: column; gap: 8px; }
        .sl-project-row {
          display: flex; align-items: center; justify-content: space-between; gap: 12px;
          padding: 10px 14px; border-radius: 10px; background: var(--bg-secondary);
          border: 1px solid var(--border-subtle); flex-wrap: wrap;
        }
        .sl-project-info { flex: 1; min-width: 0; }
        .sl-project-name { font-size: 13px; font-weight: 600; color: var(--text-primary); display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .sl-project-desc { font-size: 11px; color: var(--text-muted); display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .sl-project-badges { display: flex; gap: 6px; flex-shrink: 0; flex-wrap: wrap; }

        .sl-task-breakdown { display: flex; flex-direction: column; gap: 8px; }
        .sl-breakdown-row  { display: flex; align-items: center; gap: 10px; }
        .sl-breakdown-label { font-size: 12px; color: var(--text-secondary); width: 90px; flex-shrink: 0; }
        .sl-breakdown-track { flex: 1; height: 7px; background: var(--border-subtle); border-radius: 10px; overflow: hidden; }
        .sl-breakdown-fill  { height: 100%; border-radius: 10px; transition: width 0.5s ease; }
        .sl-breakdown-val   { font-size: 12px; font-weight: 700; color: var(--text-primary); width: 28px; text-align: right; flex-shrink: 0; }

        .sl-team-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px,1fr)); gap: 8px; }
        .sl-member-chip {
          display: flex; align-items: center; gap: 9px; padding: 9px 12px;
          border-radius: 10px; background: var(--bg-secondary); border: 1px solid var(--border-subtle);
        }
        .sl-member-avatar {
          width: 30px; height: 30px; border-radius: 50%; background: var(--bg-card);
          border: 1px solid var(--border-default); display: flex; align-items: center; justify-content: center;
          font-size: 12px; font-weight: 700; color: var(--text-primary); flex-shrink: 0;
        }
        .sl-member-name { font-size: 12px; font-weight: 600; color: var(--text-primary); }
        .sl-member-role { font-size: 10px; color: var(--text-muted); }

        .sl-comment-input-row { display: flex; flex-direction: column; gap: 8px; }
        .sl-comment-input {
          width: 100%; box-sizing: border-box; padding: 10px 12px; border-radius: 10px;
          border: 1px solid var(--border-default); background: var(--bg-secondary);
          color: var(--text-primary); font-size: 13px; resize: none; line-height: 1.5;
        }
        .sl-comment-input:focus { outline: none; border-color: var(--accent-primary); }
        .sl-send-btn {
          align-self: flex-end; display: flex; align-items: center; gap: 6px;
          padding: 8px 16px; border-radius: 10px; border: none;
          background: var(--accent-primary); color: #fff;
          font-size: 13px; font-weight: 600; cursor: pointer; transition: opacity 0.15s;
        }
        .sl-send-btn:hover { opacity: 0.85; }
        .sl-no-comments { font-size: 13px; color: var(--text-muted); text-align: center; padding: 16px 0; }
        .sl-comment-list { display: flex; flex-direction: column; gap: 8px; }
        .sl-comment-item {
          padding: 11px 13px; border-radius: 10px; border: 1px solid var(--border-subtle);
          background: var(--bg-secondary); word-break: break-word; transition: border-color 0.15s;
        }
        .sl-comment-item.pinned {
          border-color: var(--accent-primary);
          background: color-mix(in srgb, var(--accent-primary) 5%, var(--bg-secondary));
        }
        .sl-pin-label {
          display: flex; align-items: center; gap: 4px; font-size: 10px; font-weight: 700;
          color: var(--accent-primary); text-transform: uppercase; letter-spacing: 0.4px; margin-bottom: 5px;
        }
        .sl-comment-text   { font-size: 13px; color: var(--text-primary); line-height: 1.5; }
        .sl-comment-footer { display: flex; align-items: center; justify-content: space-between; margin-top: 8px; }
        .sl-comment-time   { font-size: 11px; color: var(--text-muted); }
        .sl-comment-actions { display: flex; gap: 4px; }

        .sl-icon-btn {
          display: inline-flex; align-items: center; justify-content: center;
          padding: 6px 8px; border-radius: 8px; border: 1px solid var(--border-subtle);
          background: var(--bg-secondary); color: var(--text-secondary); cursor: pointer; transition: all 0.14s;
        }
        .sl-icon-btn.sm { padding: 4px 6px; }
        .sl-icon-btn:hover { background: var(--bg-primary); color: var(--accent-primary); border-color: var(--accent-primary); }
        .sl-icon-btn.danger:hover { color: #f87171; border-color: #f87171; background: rgba(248,113,113,0.08); }
        .sl-icon-btn.active { color: var(--accent-primary); border-color: var(--accent-primary); }

        .sl-confirm-box {
          background: var(--bg-card); border: 1px solid var(--border-default); border-radius: 20px;
          padding: 32px 28px 24px; max-width: 380px; width: 100%; text-align: center;
          box-shadow: 0 24px 60px rgba(0,0,0,0.3);
        }
        .sl-confirm-title { font-size: 18px; font-weight: 800; color: var(--text-primary); margin-bottom: 8px; }
        .sl-confirm-desc  { font-size: 13px; color: var(--text-muted); line-height: 1.6; margin-bottom: 22px; }
        .sl-confirm-actions { display: flex; gap: 10px; justify-content: center; }
        .sl-btn { display: inline-flex; align-items: center; gap: 6px; padding: 10px 20px; border-radius: 10px; font-size: 13px; font-weight: 700; cursor: pointer; border: 1px solid transparent; transition: all 0.15s; }
        .sl-btn-danger { background: rgba(248,113,113,0.1); color: #f87171; border-color: rgba(248,113,113,0.3); }
        .sl-btn-danger:hover { background: rgba(248,113,113,0.2); }
        .sl-btn-ghost  { background: var(--bg-secondary); color: var(--text-primary); border-color: var(--border-default); }
        .sl-btn-ghost:hover { border-color: var(--accent-primary); }

        .form-label {
          font-size: 12px;
          font-weight: 600;
          color: var(--text-secondary);
          display: block;
          margin-bottom: 4px;
        }

        .input {
          padding: 9px 12px;
          border: 1px solid var(--border-default);
          border-radius: 8px;
          background: var(--bg-secondary);
          color: var(--text-primary);
          font-size: 13px;
          transition: all 0.2s;
          font-family: inherit;
        }

        .input:focus {
          outline: none;
          border-color: var(--accent-primary);
          background: var(--bg-card);
          box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.08);
        }

        .btn-success {
          background: #34d399;
          color: #fff;
          border: 1px solid #34d399;
        }
        .btn-success:hover {
          background: #2ecc71;
          border-color: #2ecc71;
        }

        .progress-bar {
          width: 100%;
          height: 6px;
          background: var(--border-subtle);
          border-radius: 10px;
          overflow: hidden;
        }

        .progress-fill {
          height: 100%;
          border-radius: 10px;
          transition: width 0.6s ease;
        }

        .badge {
          display: inline-block;
          padding: 2px 10px;
          border-radius: 20px;
          font-size: 11px;
          font-weight: 600;
        }

        .badge-gray {
          background: var(--bg-secondary);
          color: var(--text-secondary);
          border: 1px solid var(--border-subtle);
        }

        .sl-team-badge {
          font-size: 9px;
          padding: 2px 6px;
          border-radius: 4px;
          border: 1px solid;
        }

        @media (max-width: 768px) {
          .ll-filters-container {
            padding: 14px 16px;
            gap: 12px;
          }

          .ll-filter-controls {
            flex-direction: column;
            align-items: stretch;
            gap: 10px;
          }

          .ll-filter-group {
            min-width: 0;
          }

          .ll-filter-select {
            min-width: 0;
          }

          .ll-active-filters {
            margin-left: 0;
            justify-content: flex-start;
          }

          .ll-results-count {
            padding-top: 10px;
            flex-wrap: wrap;
          }

          .ll-clear-filters-btn {
            margin-left: 0;
          }

          .sl-kpi-row { grid-template-columns: repeat(3,1fr); }
          .sl-modal { max-height: 95vh; border-radius: 18px; }
          .sl-team-grid { grid-template-columns: 1fr 1fr; }
          .sl-modal-name { font-size: 16px; }
          .sl-drill-list { max-height: 260px; }
        }

        @media (max-width: 480px) {
          .ll-filters-container {
            padding: 12px;
            gap: 10px;
          }

          .ll-search-input {
            padding: 10px 36px 10px 38px;
            font-size: 12px;
          }

          .ll-filter-group {
            flex-direction: column;
            align-items: stretch;
            gap: 4px;
          }

          .ll-filter-label {
            font-size: 10px;
          }

          .ll-filter-select {
            padding: 7px 10px;
            font-size: 11px;
          }

          .sl-kpi-row { grid-template-columns: repeat(2,1fr); }
          .sl-team-grid { grid-template-columns: 1fr; }
          .sl-modal-header { padding: 14px 14px 12px; }
          .sl-modal-body { padding: 14px 14px 20px; }
          .sl-modal-avatar { width: 42px; height: 42px; font-size: 16px; }
          .sl-drill-list { max-height: 200px; }
          .sl-grid { grid-template-columns: 1fr; }
        }
      `}</style>
    </div>
  );
}

function MiniStat({ icon: Icon, label, value }) {
  return (
    <div style={{ display:"flex", gap:8, alignItems:"center", background:"var(--bg-secondary)", padding:"8px 10px", borderRadius:8, border:"1px solid var(--border-subtle)" }}>
      <Icon size={13} style={{ color:"var(--text-muted)", flexShrink:0 }} />
      <div>
        <p style={{ fontSize:10, color:"var(--text-muted)" }}>{label}</p>
        <p style={{ fontWeight:700, fontSize:13 }}>{value}</p>
      </div>
    </div>
  );
}

function BreakdownBar({ label, value, total, color }) {
  const pct = total === 0 ? 0 : Math.round((value / total) * 100);
  return (
    <div className="sl-breakdown-row">
      <span className="sl-breakdown-label">{label}</span>
      <div className="sl-breakdown-track">
        <div className="sl-breakdown-fill" style={{ width:`${pct}%`, background:color }}/>
      </div>
      <span className="sl-breakdown-val">{value}</span>
    </div>
  );
}