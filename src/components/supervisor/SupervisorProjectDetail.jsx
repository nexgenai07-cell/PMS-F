// components/supervisor/SupervisorProjectDetail.jsx
import { useState, useEffect, useMemo, useRef } from "react";
import { useParams, useNavigate, useOutletContext } from "react-router-dom";
import {
  ArrowLeft, MessageSquare, Users, CheckCircle2, Pencil, Trash2,
  Milestone, X, Pin, PinOff, BarChart2, RefreshCw, Plus, Loader2,
  FolderKanban, Calendar, AlertCircle, Sparkles, User, Send, FileText,
  Clock, Crown, UserMinus, Shield, Briefcase, Flag, TrendingUp,
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
const STATUS_OPTIONS = ["todo", "in_progress", "review", "done", "cancelled"];
const SUPERVISOR_ROLES = ['manager', 'admin', 'supervisor'];
const LEAD_ROLES = ['lead', 'member'];

/* ─────────── Safe array helper ─────────── */
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

const LIMITS = {
  taskTitle: { min: 3, max: 200 },
  taskDesc:  { max: 2000 },
  comment:   { min: 1, max: 1000 },
};

const TASK_TITLE_REGEX = /^[\p{L}\p{N} &\-.'(),!?]+$/u;

const validators = {
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
    const BLOCKED = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u202A-\u202E]|\p{So}/u;
    if (BLOCKED.test(v)) return 'Description contains characters that are not allowed';
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
  comment: (value) => {
    const v = (value ?? '').trim();
    if (!v) return 'Comment cannot be empty';
    if (v.length < LIMITS.comment.min) return 'Comment is too short';
    if (v.length > LIMITS.comment.max) return `Comment must be less than ${LIMITS.comment.max} characters`;
    const BLOCKED = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u202A-\u202E]/;
    if (BLOCKED.test(v)) return 'Comment contains characters that are not allowed';
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

const getStatusLabel = (status) => {
  const labels = {
    todo: "To Do", pending: "Pending",
    in_progress: "In Progress", "in-progress": "In Progress",
    review: "In Review", done: "Done",
    completed: "Completed", cancelled: "Cancelled"
  };
  return labels[status?.toLowerCase()] || status || "Unknown";
};

const getStatusColor = (status) => {
  const colors = {
    todo: "#94a3b8", pending: "#94a3b8",
    in_progress: "#818cf8", "in-progress": "#818cf8",
    review: "#f59e0b", done: "#34d399",
    completed: "#34d399", cancelled: "#f87171"
  };
  return colors[status?.toLowerCase()] || "#94a3b8";
};

export default function SupervisorProjectDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { onMenuClick } = useOutletContext();
  const { user } = useAuth();

  const projectId = parseInt(id);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [project, setProject] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [allTeamMembers, setAllTeamMembers] = useState([]);
  const [projectMembers, setProjectMembers] = useState([]);
  const [projectSupervisors, setProjectSupervisors] = useState([]);
  const [projectLeads, setProjectLeads] = useState([]);
  const [users, setUsers] = useState([]);
  const [comments, setComments] = useState([]);
  const [pteamEntries, setPteamEntries] = useState([]);
  const [selectedTask, setSelectedTask] = useState(null);
  const [editTask, setEditTask] = useState(null);
  const [showAddTask, setShowAddTask] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [modalCommentText, setModalCommentText] = useState("");
  const [isModalCommenting, setIsModalCommenting] = useState(false);

  const [addTaskTouched, setAddTaskTouched] = useState({});
  const [editTaskTouched, setEditTaskTouched] = useState({});
  const [addTaskSubmitAttempted, setAddTaskSubmitAttempted] = useState(false);
  const [editTaskSubmitAttempted, setEditTaskSubmitAttempted] = useState(false);
  const [modalCommentTouched, setModalCommentTouched] = useState(false);

  const [removeMemberInfo, setRemoveMemberInfo] = useState(null);
  const [reassignTo, setReassignTo] = useState('');
  const [removeMemberSaving, setRemoveMemberSaving] = useState(false);

  const [addSupervisorOpen, setAddSupervisorOpen] = useState(false);
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [addLeadOpen, setAddLeadOpen] = useState(false);
  const [addSupervisorSaving, setAddSupervisorSaving] = useState(false);
  const [addMemberSaving, setAddMemberSaving] = useState(false);
  const [addLeadSaving, setAddLeadSaving] = useState(false);

  const addTaskTitleRef = useRef(null);
  const editTaskTitleRef = useRef(null);

  const [stats, setStats] = useState({
    totalTasks: 0, completedTasks: 0, inProgressTasks: 0, todoTasks: 0,
    completionRate: 0, onTimeRate: 0, membersCount: 0, avgProgress: 0
  });

  const [newTask, setNewTask] = useState({
    title: "", desc: "", priority: "medium", status: "todo",
    progress: 0, assignedTo: null, milestones: [],
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

  const modalCommentError = validators.comment(modalCommentText);

  const isAddTaskValid = Object.values(addTaskErrors).every(e => e === '');
  const isEditTaskValid = Object.values(editTaskErrors).every(e => e === '');

  /* ═══════════════════════════════════════════════════════════
     DERIVED DATA
     ═══════════════════════════════════════════════════════════ */

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

  const projectLeadsFinal = asArray(projectLeads).length > 0
    ? asArray(projectLeads)
    : projectLeadsDerived;

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
    const countable = tasks.filter(
      t => (t.status || '').toLowerCase() !== 'cancelled'
    );
    if (countable.length === 0) return 0;
    const total = countable.reduce(
      (sum, t) => sum + (Number(t.progress) || 0), 0
    );
    return Math.round(total / countable.length);
  }, [tasks, stats?.avgProgress]);

  /* ═══════════════════════════════════════════════════════════
     EFFECTS
     ═══════════════════════════════════════════════════════════ */

  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      if (removeMemberInfo) { setRemoveMemberInfo(null); setReassignTo(''); return; }
      if (showDeleteConfirm !== null) { setShowDeleteConfirm(null); return; }
      if (editTask) { setEditTask(null); setEditTaskTouched({}); setEditTaskSubmitAttempted(false); return; }
      if (showAddTask) { setShowAddTask(false); setAddTaskTouched({}); setAddTaskSubmitAttempted(false); return; }
      if (selectedTask) { setSelectedTask(null); return; }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [removeMemberInfo, showDeleteConfirm, editTask, showAddTask, selectedTask]);

  useEffect(() => {
    if (!showAddTask) return;
    const t = setTimeout(() => addTaskTitleRef.current?.focus(), 60);
    return () => clearTimeout(t);
  }, [showAddTask]);

  useEffect(() => {
    if (!editTask) return;
    const t = setTimeout(() => editTaskTitleRef.current?.focus(), 60);
    return () => clearTimeout(t);
  }, [editTask]);

  const resetAddTaskTouched = () => { setAddTaskTouched({}); setAddTaskSubmitAttempted(false); };
  const markAddTaskTouched = (field) => setAddTaskTouched(prev => ({ ...prev, [field]: true }));
  const showAddTaskError = (field) => {
    if (addTaskSubmitAttempted) return addTaskErrors[field];
    return addTaskTouched[field] ? addTaskErrors[field] : '';
  };

  const resetEditTaskTouched = () => { setEditTaskTouched({}); setEditTaskSubmitAttempted(false); };
  const markEditTaskTouched = (field) => setEditTaskTouched(prev => ({ ...prev, [field]: true }));
  const showEditTaskError = (field) => {
    if (editTaskSubmitAttempted) return editTaskErrors[field];
    return editTaskTouched[field] ? editTaskErrors[field] : '';
  };

  const getTaskComments = (taskId) => {
    if (!taskId) return [];
    return asArray(comments).filter(c => Number(c.taskId || c.t) === Number(taskId));
  };

  const modalTaskComments = selectedTask ? getTaskComments(selectedTask.t_id || selectedTask.id) : [];
  const sortedModalComments = [...modalTaskComments].sort((a, b) =>
    (b.pin || b.pinned) === (a.pin || a.pinned) ? 0 : (b.pin || b.pinned) ? 1 : -1
  );

  useEffect(() => {
    fetchProjectData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  /* ═══════════════════════════════════════════════════════════
     FETCH PROJECT DATA
     ═══════════════════════════════════════════════════════════ */
  const fetchProjectData = async () => {
    console.log('🚀 [Supervisor] fetchProjectData STARTED for projectId:', projectId);
    try {
      setLoading(true);
      console.log('📡 [Supervisor] Fetching project, tasks, members, users, pteam, stats...');

      const [
        projectData,
        tasksData,
        membersData,
        usersData,
        pteamData,
        statsData,
      ] = await Promise.all([
        projectService.getProject(projectId).catch(e => { console.error('❌ getProject:', e); return { data: null }; }),
        taskService.getTasks().catch(e => { console.error('❌ getTasks:', e); return { data: [] }; }),
        teamService.getTeamMembers().catch(e => { console.error('❌ getTeamMembers:', e); return { data: [] }; }),
        userService.getUsers().catch(e => { console.error('❌ getUsers:', e); return { data: [] }; }),
        projectTeamService.getProjectTeams().catch(e => { console.error('❌ getProjectTeams:', e); return { data: [] }; }),
        projectService.getProjectStats(projectId).catch(e => { console.error('❌ getProjectStats:', e); return { data: {} }; }),
      ]);

      const projectItem  = projectData?.data || projectData || null;
      const allTasks     = asArray(tasksData?.data || tasksData);
      const membersList  = asArray(membersData?.data || membersData);
      const usersList    = asArray(usersData?.data || usersData);
      const pteamList    = asArray(pteamData?.data || pteamData);
      const statsResponse = statsData?.data || statsData || {};

      console.log('✅ [Supervisor] Normalized:', {
        project: projectItem?.p_name,
        tasks: allTasks.length,
        members: membersList.length,
        users: usersList.length,
        pteam: pteamList.length,
        stats: statsResponse,
      });

      setProject(projectItem);
      setAllTeamMembers(membersList);
      setUsers(usersList);
      setPteamEntries(pteamList);

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
        return Number(taskProjectId) === Number(projectId);
      });
      console.log('✅ [Supervisor] projectTasks filtered:', projectTasks.length);

      const memberMap = new Map();
      const projectPteamEntries = pteamList.filter(
        entry => getPteamProjectId(entry) === Number(projectId)
      );
      console.log('✅ [Supervisor] projectPteamEntries:', projectPteamEntries.length);

      projectPteamEntries.forEach(entry => {
        const tmId = getPteamTmId(entry);
        if (!Number.isFinite(tmId)) return;
        if (memberMap.has(tmId)) return;

        const resolved = resolveTeamMemberId(tmId, usersList, membersList);
        if (resolved) {
          memberMap.set(tmId, {
            ...resolved,
            pt_id: entry.pt_id ?? entry.id ?? null,
            task_id: entry.t ?? entry.task_id ?? entry.task ?? null,
          });
        }
      });

      const memberEntries = Array.from(memberMap.values()).map(m => {
        const realTmId = findRealTeamMemberId(m, membersList, usersList);
        return { ...m, tmId: realTmId ?? null };
      });
      console.log('✅ [Supervisor] memberEntries:', memberEntries.length, memberEntries);

      const supervisorIds = asArray(projectItem?.supervisors).map(Number);
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

      console.log('✅ [Supervisor] supervisorEntries:', supervisorEntries);
      setProjectSupervisors(supervisorEntries);

      const supUserIdSet = new Set(supervisorEntries.map(s => Number(s.userId)));
      const membersWithoutSupervisors = memberEntries.filter(
        m => !supUserIdSet.has(Number(m.userId))
      );
      const allMembers = [...supervisorEntries, ...membersWithoutSupervisors];
      setProjectMembers(allMembers);
      console.log('✅ [Supervisor] projectMembers:', allMembers.length);

      const creatorId = Number(projectItem?.created_by);
      const leadEntries = memberEntries.filter(m => {
        const role = (m.role || '').toLowerCase();
        if (!LEAD_ROLES.includes(role)) return false;
        if (Number(m.userId) === creatorId) return false;
        if (supUserIdSet.has(Number(m.userId))) return false;
        return true;
      });
      setProjectLeads(leadEntries);
      console.log('✅ [Supervisor] projectLeads:', leadEntries);

       const mappedTasks = projectTasks.map(t => ({
        ...t,
        progress: computeTaskProgress(t),
        milestones: asArray(t.milestones),
        assigneeId: t.assign_to ?? null,
      }));
      setTasks(mappedTasks);
      console.log('✅ [Supervisor] mappedTasks:', mappedTasks.length);

      // ⬇️⬇️⬇️  DIAGNOSTIC GOES HERE  ⬇️⬇️⬇️
      console.log('🔍 ===== TASK / ASSIGNEE DIAGNOSTIC =====');
      console.log('🔍 TeamMembers:', membersList.map(m => ({ id: m.id, name: m.name })));
      console.log('🔍 Users:', usersList.map(u => ({ id: u.id, name: u.u_name || u.name })));
      console.log('🔍 Tasks with assignee resolution:',
        mappedTasks.map(t => {
          const id = Number(t.assign_to);
          let resolvesTo = 'no valid id';
          if (Number.isFinite(id)) {
            const tm = membersList.find(m => Number(m.id) === id);
            if (tm) {
              resolvesTo = `TeamMember #${tm.id} = "${tm.name}"`;
            } else {
              const u = usersList.find(x => Number(x.id) === id);
              if (u) {
                resolvesTo = `User #${u.id} = "${u.u_name || u.name}"`;
              } else {
                resolvesTo = `id ${id} NOT FOUND`;
              }
            }
          }
          return {
            t_id: t.t_id,
            title: t.title,
            assign_to: t.assign_to,
            assign_to_name: t.assign_to_name,
            resolves_to: resolvesTo,
          };
        })
      );
      console.log('🔍 =========================================');
      

      loadCommentsForTasks(mappedTasks);

    } catch (error) {
      console.error('❌ [Supervisor] Error fetching project data:', error);
      toast.error('Failed to load project details');
      if (error?.status === 404 || error?.response?.status === 404) {
        navigate('/supervisor/projects');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
      console.log('✅ [Supervisor] fetchProjectData COMPLETE');
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
        } catch (e) { /* silent */ }
      }
      setComments(allComments);
      console.log('✅ [Supervisor] comments loaded:', allComments.length);
    } catch (e) {
      console.error('❌ [Supervisor] comments load failed:', e);
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

  const handleAddTask = async () => {
    setAddTaskSubmitAttempted(true);
    if (!isAddTaskValid) {
      toast.error("Please fix the highlighted errors before creating the task");
      return;
    }
    if (isSubmitting) return;

    setIsSubmitting(true);
    try {
      const assignTo = newTask.assignedTo ? Number(newTask.assignedTo) : null;

      const response = await taskService.createTask({
        title: newTask.title.trim(),
        description: (newTask.desc || '').trim(),
        status: newTask.status,
        priority: newTask.priority,
        projectId: projectId,
        assignTo: assignTo,
        dueDate: null,
        startDate: null,
        progress: newTask.progress,
      });

      const createdTask = response?.data || response;
      try { await NotificationHelper.taskCreated(createdTask, user); } catch (e) { /* silent */ }

      if (createdTask?.assign_to) {
        const assignee = allTeamMembers.find(m => Number(m.id) === Number(createdTask.assign_to));
        if (assignee) {
          const assigneeEmail = getAssigneeEmail(assignee);
          if (assigneeEmail) {
            const assigneeWithEmail = { ...assignee, email: assigneeEmail };
            try {
              await NotificationHelper.taskAssigned(createdTask, assigneeWithEmail, user, project);
              toast.success(`Task created and notification sent to ${assignee.name}`);
            } catch (e) {
              toast.success('Task created successfully');
            }
          } else {
            toast.success(`Task created but ${assignee.name} has no email on file`);
          }
        }
      } else {
        toast.success('Task created successfully');
      }

      setNewTask({
        title: "", desc: "", priority: "medium", status: "todo",
        progress: 0, assignedTo: null, milestones: [],
      });
      setShowAddTask(false);
      resetAddTaskTouched();

      await fetchProjectData();
    } catch (error) {
      console.error('❌ Error adding task:', error);
      const rawMsg = error?.response?.data?.message || error?.response?.data?.detail;
      toast.error(typeof rawMsg === 'string' ? rawMsg : 'Failed to add task');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateTask = async (updated) => {
    setEditTaskSubmitAttempted(true);
    if (!isEditTaskValid) {
      toast.error('Please fix the highlighted errors before saving');
      return;
    }

    try {
      const previousAssignee = updated.assign_to || updated.assignTo;
      const assignTo = previousAssignee ? Number(previousAssignee) : null;

      const response = await taskService.updateTask(updated.t_id || updated.id, {
        title: updated.title.trim(),
        description: (updated.desc || '').trim(),
        status: updated.status,
        priority: updated.priority,
        progress: updated.progress,
        assignTo: assignTo,
      });

      const updatedTask = response?.data || response;

      try { await NotificationHelper.taskUpdated(updatedTask, user); } catch (e) { /* silent */ }
      if (updated.status === 'done' || updated.status === 'completed') {
        try { await NotificationHelper.taskCompleted(updatedTask, user); } catch (e) { /* silent */ }
      }

      // 🔧 FIX: If the assignee changed, DO NOT carry over the old
      // `assign_to_name`. The cached name from the previous state is stale
      // and would make the task card show the old assignee even though
      // the assign_to id now points at someone else.
      setTasks(prev => prev.map(t => {
        if ((t.t_id || t.id) !== (updated.t_id || updated.id)) return t;

        const prevAssignee = t.assign_to != null ? Number(t.assign_to) : null;
        const nextAssignee = updatedTask.assign_to != null
          ? Number(updatedTask.assign_to)
          : (assignTo != null ? Number(assignTo) : null);
        const assigneeChanged = prevAssignee !== nextAssignee;

        return {
          ...t,
          ...updatedTask,
          progress: computeTaskProgress({ ...t, ...updatedTask }),
          assign_to: nextAssignee,
          // Drop the cached name if the assignee changed — getMemberName
          // will resolve the fresh name from `assign_to` id.
          assign_to_name: assigneeChanged
            ? null
            : (updatedTask.assign_to_name ?? t.assign_to_name ?? null),
        };
      }));

      setEditTask(null);
      resetEditTaskTouched();
      setSelectedTask(updated);
      toast.success("Task updated successfully");

      await fetchProjectData();
    } catch (error) {
      console.error('❌ Error updating task:', error);
      const rawMsg = error?.response?.data?.message || error?.response?.data?.detail;
      toast.error(typeof rawMsg === 'string' ? rawMsg : 'Failed to update task');
    }
  };

  const handleDeleteTask = async (taskId) => {
    try {
      await taskService.deleteTask(taskId);
      setTasks(prev => prev.filter(t => (t.t_id || t.id) !== taskId));
      setShowDeleteConfirm(null);
      setSelectedTask(null);
      toast.success("Task deleted successfully");
      await fetchProjectData();
    } catch (error) {
      console.error('❌ Error deleting task:', error);
      const rawMsg = error?.response?.data?.message || error?.response?.data?.detail;
      toast.error(typeof rawMsg === 'string' ? rawMsg : 'Failed to delete task');
    }
  };

  const addModalComment = async () => {
    setModalCommentTouched(true);
    if (modalCommentError) { toast.error(modalCommentError); return; }
    if (!selectedTask) { toast.error("Please select a task to comment on"); return; }

    setIsModalCommenting(true);
    try {
      const response = await commentService.addComment({
        taskId: selectedTask.t_id || selectedTask.id,
        desc: modalCommentText.trim(),
        priority: "normal",
        pin: false,
      });

      const newComment = response?.data || response;
      setComments(prev => [...prev, { ...newComment, taskId: selectedTask.t_id || selectedTask.id }]);
      setModalCommentText("");
      setModalCommentTouched(false);
      toast.success("Comment added successfully");
    } catch (error) {
      console.error('❌ Error adding comment:', error);
      const rawMsg = error?.response?.data?.message || error?.response?.data?.detail;
      toast.error(typeof rawMsg === 'string' ? rawMsg : 'Failed to add comment');
    } finally {
      setIsModalCommenting(false);
    }
  };

  const togglePin = async (commentId) => {
    try {
      const comment = asArray(comments).find(c => (c.c_id || c.id) === commentId);
      if (comment) {
        const response = await commentService.togglePin(commentId);
        const updatedComment = response?.data || response;
        if (updatedComment.pin) {
          try { await NotificationHelper.commentPinned(updatedComment, user); } catch (e) { /* silent */ }
        }
        setComments(prev =>
          prev.map(c => (c.c_id || c.id) === commentId ? { ...c, pin: updatedComment.pin || !c.pin } : c)
        );
        toast.success(updatedComment.pin ? "Comment pinned" : "Comment unpinned");
      }
    } catch (error) {
      console.error('❌ Error toggling pin:', error);
      toast.error('Failed to update pin');
    }
  };

  const deleteComment = async (commentId) => {
    if (!window.confirm("Are you sure you want to delete this comment?")) return;
    try {
      await commentService.deleteComment(commentId);
      setComments(prev => prev.filter(c => (c.c_id || c.id) !== commentId));
      toast.success("Comment deleted successfully");
    } catch (error) {
      console.error('❌ Error deleting comment:', error);
      toast.error('Failed to delete comment');
    }
  };

  /* ═══════════════ REMOVE-MEMBER FLOW ═══════════════ */

  const promptRemoveMember = (member) => {
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
    const { projectId: pId, member, assignedTasks } = removeMemberInfo;

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

      const currentPteam = asArray(pteamEntries).filter(entry => getPteamProjectId(entry) === Number(pId));
      const realTmId = findRealTeamMemberId(member, allTeamMembers, users);
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
      await fetchProjectData();
    } catch (error) {
      console.error('❌ Error removing member:', error);
      toast.error('Failed to remove member');
    } finally {
      setRemoveMemberSaving(false);
    }
  };

  const progress = projectProgress;

  /* ═══════════════════════════════════════════════════════════
     🔧 FIX: getMemberName
     ═══════════════════════════════════════════════════════════
     The old version returned `taskRef.assign_to_name` FIRST, which is
     a cached string that can go stale after a reassignment. This new
     version resolves the name from the `assign_to` id FIRST, and only
     falls back to the cached name if the id lookup fails. This is why
     the card showed "Admin" while the modal (which refetches fresh)
     showed "Alii".
     ═══════════════════════════════════════════════════════════ */
  const getMemberName = (memberId, taskRef = null) => {
    // 1. Try to resolve by id — this is always the freshest source.
    if (memberId != null) {
      const numId = Number(memberId);
      if (Number.isFinite(numId)) {
        const tm = asArray(allTeamMembers).find(m => Number(m.id) === numId);
        if (tm) return tm.name;

        const u = asArray(users).find(x => Number(x.id) === numId);
        if (u) return u.u_name || u.name || "Unassigned";
      }
    }

    // 2. Only if we have no usable id, fall back to the cached name
    //    from the task reference (last resort).
    if (taskRef?.assign_to_name) return taskRef.assign_to_name;

    // 3. Nothing to go on.
    return "Unassigned";
  };

  /* ═══════════════ ADD SUPERVISOR / LEAD / MEMBER ═══════════════ */

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
    } catch (error) {
      console.error('❌ Error adding supervisor:', error);
      const rawMsg = error?.response?.data?.message ||
                     error?.response?.data?.detail ||
                     error?.response?.data?.supervisors?.[0];
      toast.error(typeof rawMsg === 'string' ? rawMsg : 'Failed to add supervisor');
    } finally {
      setAddSupervisorSaving(false);
    }
  };

  const handleAddLead = async (teamMemberId) => {
    if (!teamMemberId) return;
    setAddLeadSaving(true);
    try {
      await projectTeamService.addMemberToProject(projectId, Number(teamMemberId));
      toast.success('Project Lead added');
      setAddLeadOpen(false);
      await fetchProjectData();
    } catch (error) {
      console.error('❌ Error adding lead:', error);
      const rawMsg = error?.response?.data?.message || error?.response?.data?.detail;
      toast.error(typeof rawMsg === 'string' ? rawMsg : 'Failed to add project lead');
    } finally {
      setAddLeadSaving(false);
    }
  };

  const handleAddTeamMember = async (teamMemberId) => {
    if (!teamMemberId) return;
    setAddMemberSaving(true);
    try {
      await projectTeamService.addMemberToProject(projectId, Number(teamMemberId));
      toast.success('Team member added');
      setAddMemberOpen(false);
      await fetchProjectData();
    } catch (error) {
      console.error('❌ Error adding team member:', error);
      const rawMsg = error?.response?.data?.message || error?.response?.data?.detail;
      toast.error(typeof rawMsg === 'string' ? rawMsg : 'Failed to add team member');
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
            <button className="btn btn-primary" onClick={() => navigate('/supervisor/projects')}>
              <ArrowLeft size={14} /> Back to Projects
            </button>
          </div>
        </div>
      </div>
    );
  }

  const creatorName = project.created_by_name || 'Project Lead';
  const additionalLeads = asArray(projectLeadsFinal).filter(
    m => Number(m.userId) !== Number(project.created_by)
  );
  const totalLeadCount = 1 + additionalLeads.length;

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
            <button className="btn btn-secondary btn-sm" onClick={() => navigate('/supervisor/projects')}>
              <ArrowLeft size={14} /> Back
            </button>
          </div>
        }
      />

      {/* ─── TASK DETAIL MODAL ─── */}
      <AnimatePresence>
        {selectedTask && (
          <motion.div className="modal-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setSelectedTask(null)}>
            <motion.div className="modal-box" initial={{ scale: 0.95, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: 20 }} transition={{ duration: 0.2 }} onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2 className="modal-title">{selectedTask.title}</h2>
                <button className="modal-close-btn" onClick={() => setSelectedTask(null)}><X size={18} /></button>
              </div>

              <div className="modal-body">
                <p className="modal-desc">{selectedTask.desc || 'No description'}</p>

                <div className="modal-meta-row">
                  <StatusBadge status={selectedTask.status} />
                  <PriorityBadge priority={selectedTask.priority} />
                </div>

                {/* 🔧 FIX: use the id-resolving getMemberName helper so
                    the modal also reflects the fresh assignee. */}
                <div style={{ marginBottom: 12 }}>
                  <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>
                    Assigned To
                  </p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-primary)' }}>
                    <User size={13} />
                    {getMemberName(selectedTask.assign_to, selectedTask)}
                  </div>
                </div>

                {asArray(selectedTask.milestones).length > 0 && (
                  <div className="modal-milestones">
                    <h4 className="modal-subtitle"><Milestone size={14} /> Milestones</h4>
                    {asArray(selectedTask.milestones).map((m, i) => (
                      <div key={`milestone-${i}-${m.id || i}`} className="milestone-box">
                        <div className="milestone-title">{m.title}</div>
                        <div className="milestone-meta">
                          <Calendar size={12} /> {m.dueDate}
                          <User size={12} /> {getMemberName(m.assignedTo)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="modal-progress-section">
                  <div className="modal-progress-header">
                    <span className="modal-progress-label">Progress</span>
                    <span className="modal-progress-value">{selectedTask.progress || 0}%</span>
                  </div>
                  <div className="modal-progress-track">
                    <motion.div className="modal-progress-fill" initial={{ width: 0 }} animate={{ width: `${selectedTask.progress || 0}%` }} transition={{ duration: 0.5 }} />
                  </div>
                </div>

                <div className="modal-comments-section">
                  <h4 className="modal-subtitle" style={{ marginTop: 16 }}>
                    <MessageSquare size={14} /> Comments ({sortedModalComments.length})
                  </h4>

                  <div className="modal-comment-input">
                    <textarea
                      className={`modal-comment-textarea ${modalCommentTouched && modalCommentError ? 'pd-input-error' : ''}`}
                      value={modalCommentText}
                      onChange={(e) => setModalCommentText(e.target.value)}
                      onBlur={() => setModalCommentTouched(true)}
                      placeholder={`Write a comment on "${selectedTask.title}"... (Ctrl+Enter to send)`}
                      rows={2}
                      maxLength={LIMITS.comment.max}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && e.ctrlKey) { e.preventDefault(); addModalComment(); }
                      }}
                    />
                    {modalCommentTouched && modalCommentError && <FieldError message={modalCommentError} />}
                    <button className="modal-comment-send-btn" onClick={addModalComment} disabled={isModalCommenting || !modalCommentText.trim()}>
                      {isModalCommenting ? <Loader2 size={14} className="spin" /> : <Send size={14} />}
                      {isModalCommenting ? 'Sending...' : 'Send'}
                    </button>
                  </div>

                  <div className="modal-comment-list">
                    {sortedModalComments.length === 0 ? (
                      <div className="modal-comment-empty">
                        <MessageSquare size={20} style={{ opacity: 0.3 }} />
                        <p>No comments yet</p>
                      </div>
                    ) : (
                      sortedModalComments.map((c, i) => {
                        const commentKey = c.c_id || c.id || `comment-${i}`;
                        const isPinned = c.pin || c.pinned;
                        return (
                          <motion.div key={commentKey} className={`modal-comment-item ${isPinned ? 'pinned' : ''}`} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.15 }}>
                            {isPinned && <div className="modal-comment-pin-badge"><Pin size={10} /> Pinned</div>}
                            <p className="modal-comment-text">{c.desc || c.content}</p>
                            <div className="modal-comment-footer">
                              <span className="modal-comment-meta">
                                {c.u_name || c.user_name || 'User'} •
                                {c.created_at ? new Date(c.created_at).toLocaleString() : 'Just now'}
                              </span>
                              <div className="modal-comment-actions">
                                <button className={`modal-comment-action-btn ${isPinned ? 'active' : ''}`} title={isPinned ? "Unpin" : "Pin"} onClick={() => togglePin(c.c_id || c.id)}>
                                  {isPinned ? <PinOff size={11} /> : <Pin size={11} />}
                                </button>
                                <button className="modal-comment-action-btn danger" title="Delete" onClick={() => deleteComment(c.c_id || c.id)}>
                                  <Trash2 size={11} />
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

              <div className="modal-footer">
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button className="btn btn-secondary btn-sm" onClick={() => { setEditTask({ ...selectedTask, assignedTo: selectedTask.assign_to }); resetEditTaskTouched(); setSelectedTask(null); }}>
                    <Pencil size={13} /> Edit Task
                  </button>
                  <button className="btn btn-danger btn-sm" onClick={() => { setShowDeleteConfirm(selectedTask.t_id || selectedTask.id); setSelectedTask(null); }}>
                    <Trash2 size={13} /> Delete
                  </button>
                </div>
                <button className="btn btn-secondary btn-sm" onClick={() => setSelectedTask(null)}>Close</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── EDIT TASK MODAL ─── */}
      <AnimatePresence>
        {editTask && (
          <motion.div className="modal-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => { setEditTask(null); resetEditTaskTouched(); }}>
            <motion.div className="modal-box" initial={{ scale: 0.95, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: 20 }} onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2 className="modal-title">Edit Task</h2>
                <button className="modal-close-btn" onClick={() => { setEditTask(null); resetEditTaskTouched(); }}><X size={18} /></button>
              </div>

              <div className="modal-body edit-form">
                <div className="form-group">
                  <label className="form-label">Title <span className="form-required">*</span></label>
                  <input
                    ref={editTaskTitleRef}
                    className={`form-input ${showEditTaskError('title') ? 'pd-input-error' : ''}`}
                    value={editTask.title}
                    maxLength={LIMITS.taskTitle.max}
                    onChange={(e) => setEditTask({ ...editTask, title: e.target.value })}
                    onBlur={(e) => {
                      const t = e.target.value.trim();
                      if (t !== e.target.value) setEditTask(prev => ({ ...prev, title: t }));
                      markEditTaskTouched('title');
                    }}
                  />
                  <FieldError message={showEditTaskError('title')} />
                </div>

                <div className="form-group">
                  <label className="form-label">Description</label>
                  <textarea
                    className={`form-input form-textarea ${showEditTaskError('desc') ? 'pd-input-error' : ''}`}
                    value={editTask.desc || ''}
                    maxLength={LIMITS.taskDesc.max}
                    onChange={(e) => setEditTask({ ...editTask, desc: e.target.value })}
                    onBlur={() => markEditTaskTouched('desc')}
                  />
                  <FieldError message={showEditTaskError('desc')} />
                </div>

                <div className="form-row-2">
                  <div className="form-group">
                    <label className="form-label">Priority</label>
                    <select className="form-input" value={editTask.priority} onChange={(e) => setEditTask({ ...editTask, priority: e.target.value })} onBlur={() => markEditTaskTouched('priority')}>
                      {PRIORITY_OPTIONS.map((p) => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
                    </select>
                    <FieldError message={showEditTaskError('priority')} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Status</label>
                    <select className="form-input" value={editTask.status} onChange={(e) => setEditTask({ ...editTask, status: e.target.value })} onBlur={() => markEditTaskTouched('status')}>
                      {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{getStatusLabel(s)}</option>)}
                    </select>
                    <FieldError message={showEditTaskError('status')} />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Assign To</label>
                  <select
                    className="form-input"
                    value={editTask.assign_to || editTask.assignTo || ''}
                    onChange={(e) => setEditTask({ ...editTask, assign_to: e.target.value ? parseInt(e.target.value) : null })}
                  >
                    <option value="">Unassigned</option>
                    {assignableMembers.map((m) => (
                      <option key={m.id} value={m.tmId}>
                        {m.name} {supervisorIdSet.has(Number(m.userId)) ? '👑' : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Progress: <strong>{editTask.progress || 0}%</strong></label>
                  <input type="range" min={0} max={100} value={editTask.progress || 0} className="range-input" onChange={(e) => setEditTask({ ...editTask, progress: Number(e.target.value) })} />
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

      {/* ─── ADD TASK MODAL ─── */}
      <AnimatePresence>
        {showAddTask && (
          <motion.div className="modal-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => { setShowAddTask(false); resetAddTaskTouched(); }}>
            <motion.div className="modal-box" initial={{ scale: 0.95, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: 20 }} onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2 className="modal-title"><Plus size={18} /> Create New Task</h2>
                <button className="modal-close-btn" onClick={() => { setShowAddTask(false); resetAddTaskTouched(); }}><X size={18} /></button>
              </div>

              <div className="modal-body edit-form">
                <div className="form-group">
                  <label className="form-label">Task Title <span className="form-required">*</span></label>
                  <input
                    ref={addTaskTitleRef}
                    className={`form-input ${showAddTaskError('title') ? 'pd-input-error' : ''}`}
                    placeholder="Enter task title"
                    value={newTask.title}
                    maxLength={LIMITS.taskTitle.max}
                    onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
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
                    className={`form-input form-textarea ${showAddTaskError('desc') ? 'pd-input-error' : ''}`}
                    placeholder="Enter task description..."
                    value={newTask.desc}
                    maxLength={LIMITS.taskDesc.max}
                    onChange={(e) => setNewTask({ ...newTask, desc: e.target.value })}
                    onBlur={() => markAddTaskTouched('desc')}
                  />
                  <FieldError message={showAddTaskError('desc')} />
                </div>

                <div className="form-row-2">
                  <div className="form-group">
                    <label className="form-label">Priority</label>
                    <select className="form-input" value={newTask.priority} onChange={(e) => setNewTask({ ...newTask, priority: e.target.value })} onBlur={() => markAddTaskTouched('priority')}>
                      {PRIORITY_OPTIONS.map((p) => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
                    </select>
                    <FieldError message={showAddTaskError('priority')} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Status</label>
                    <select className="form-input" value={newTask.status} onChange={(e) => setNewTask({ ...newTask, status: e.target.value })} onBlur={() => markAddTaskTouched('status')}>
                      {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{getStatusLabel(s)}</option>)}
                    </select>
                    <FieldError message={showAddTaskError('status')} />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Assign Team Member</label>
                  <select
                    className="form-input"
                    value={newTask.assignedTo || ""}
                    onChange={(e) => setNewTask({ ...newTask, assignedTo: e.target.value ? parseInt(e.target.value) : null })}
                  >
                    <option value="">Select Member</option>
                    {assignableMembers.map((mem) => (
                      <option key={mem.id} value={mem.tmId}>
                        {mem.name} {supervisorIdSet.has(Number(mem.userId)) ? '👑' : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Initial Progress: <strong>{newTask.progress}%</strong></label>
                  <input type="range" min={0} max={100} className="range-input" value={newTask.progress} onChange={(e) => setNewTask({ ...newTask, progress: Number(e.target.value) })} />
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

      {/* ─── REMOVE MEMBER MODAL ─── */}
      <AnimatePresence>
        {removeMemberInfo && (
          <motion.div
            className="modal-overlay"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => { if (!removeMemberSaving) { setRemoveMemberInfo(null); setReassignTo(''); } }}
          >
            <motion.div
              className="modal-box"
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              onClick={e => e.stopPropagation()}
              style={{ maxWidth: 480 }}
            >
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
                    <div style={{
                      padding: '10px 12px', background: 'rgba(245, 158, 11, 0.08)',
                      border: '1px solid rgba(245, 158, 11, 0.25)', borderRadius: 8,
                      fontSize: 12.5, color: 'var(--text-secondary)',
                    }}>
                      <AlertCircle size={12} style={{ display: 'inline', marginRight: 4, color: '#f59e0b' }} />
                      This member has <strong>{removeMemberInfo.assignedTasks.length}</strong> assigned
                      task{removeMemberInfo.assignedTasks.length !== 1 ? 's' : ''} in this project.
                    </div>

                    <div style={{ maxHeight: 120, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {removeMemberInfo.assignedTasks.map(t => (
                        <div key={t.t_id || t.id} style={{
                          fontSize: 12.5, padding: '6px 10px', background: 'var(--bg-secondary)',
                          border: '1px solid var(--border-subtle)', borderRadius: 6, color: 'var(--text-primary)',
                        }}>
                          📋 {t.title}
                        </div>
                      ))}
                    </div>

                    <label className="form-label" style={{ marginTop: 6 }}>Reassign those tasks to</label>
                    <select className="form-input" value={reassignTo} onChange={e => setReassignTo(e.target.value)} disabled={removeMemberSaving}>
                      <option value="">— Leave unassigned —</option>
                      {assignableMembers
                        .filter(m => Number(m.id) !== Number(removeMemberInfo.member.id))
                        .map(m => <option key={m.id} value={m.tmId}>{m.name}</option>)}
                    </select>
                  </>
                ) : (
                  <div style={{
                    padding: '10px 12px', background: 'rgba(52, 211, 153, 0.08)',
                    border: '1px solid rgba(52, 211, 153, 0.25)', borderRadius: 8,
                    fontSize: 12.5, color: 'var(--text-secondary)',
                  }}>
                    <CheckCircle2 size={12} style={{ display: 'inline', marginRight: 4, color: '#34d399' }} />
                    No tasks assigned to this member in this project.
                  </div>
                )}
              </div>

              <div className="modal-footer">
                <button className="btn btn-secondary btn-sm" onClick={() => { setRemoveMemberInfo(null); setReassignTo(''); }} disabled={removeMemberSaving}>
                  Cancel
                </button>
                <button className="btn btn-danger btn-sm" onClick={confirmRemoveMember} disabled={removeMemberSaving}>
                  {removeMemberSaving
                    ? <><Loader2 size={13} className="spin" /> Removing...</>
                    : <><Trash2 size={13} /> Remove member</>}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── DELETE CONFIRM ─── */}
      <AnimatePresence>
        {showDeleteConfirm !== null && (
          <motion.div className="modal-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowDeleteConfirm(null)}>
            <motion.div className="modal-box confirm-box" initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} onClick={(e) => e.stopPropagation()}>
              <AlertCircle size={40} style={{ color: '#f87171', marginBottom: 12 }} />
              <h3 className="confirm-title">Delete Task?</h3>
              <p className="confirm-desc">This action cannot be undone. The task will be permanently removed.</p>
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

      {/* ─── PROJECT BODY ─── */}
      <div className="project-body">
        <div className="project-left">
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
                    <circle className="ring-fill" cx="60" cy="60" r="50" strokeDasharray={Math.PI * 2 * 50} strokeDashoffset={Math.PI * 2 * 50 * (1 - progress / 100)} style={{ stroke: progress >= 70 ? '#34d399' : progress >= 40 ? '#f59e0b' : '#f87171' }} />
                  </svg>
                  <div className="ring-center">
                    <span className="ring-value">{progress}%</span>
                    <span className="ring-label">Complete</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

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
                    <FileText size={32} style={{ opacity: 0.3 }} />
                    <p>No tasks yet</p>
                    <span>Create your first task to get started</span>
                  </div>
                ) : (
                  asArray(tasks).map((t, idx) => {
                    const taskKey = t.t_id || t.id || `task-${idx}`;
                    const taskStatusColor = getStatusColor(t.status);
                    const taskCommentCount = getTaskComments(t.t_id || t.id).length;
                    return (
                      <motion.div key={taskKey} className="task-item" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} onClick={() => setSelectedTask(t)}>
                        <div className="task-item-header">
                          <div className="task-item-left">
                            <div className="task-status-dot" style={{ background: taskStatusColor }} />
                            <span className="task-item-title">{t.title}</span>
                          </div>
                          <div className="task-item-badges">
                            <PriorityBadge priority={t.priority} />
                            {taskCommentCount > 0 && (
                              <span className="task-comment-badge"><MessageSquare size={10} /> {taskCommentCount}</span>
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
                          {/* 🔧 FIX: getMemberName resolves by id, so the card
                              always shows the CURRENT assignee. */}
                          <div className="task-item-assignee"><User size={12} />{getMemberName(t.assign_to, t)}</div>
                          <div className="task-item-actions">
                            <button
                              className="task-action-btn"
                              title="Open comments"
                              onClick={(e) => { e.stopPropagation(); setSelectedTask(t); }}
                            >
                              <MessageSquare size={12} />
                            </button>
                            <button
                              className="task-action-btn"
                              title="Edit Task"
                              onClick={(e) => { e.stopPropagation(); setEditTask({ ...t, assignedTo: t.assign_to }); resetEditTaskTouched(); }}
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

        <div className="project-right">
          <div className="info-card">
            <h4 className="info-card-title"><Sparkles size={14} /> Overview</h4>
            <div className="info-stats">
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
            </div>
          </div>

          <div className="info-card">
            <h4 className="info-card-title">
              <Users size={14} /> Team
              <span className="info-badge">{asArray(projectMembers).length}</span>
            </h4>

            <div className="team-sections">
              <div className="team-section team-section-lead">
                <div className="team-section-header">
                  <div className="team-section-title">
                    <Shield size={13} style={{ color: '#6366f1' }} />
                    <span>Project Lead</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span className="team-section-count">{totalLeadCount}</span>
                    <button
                      className="team-add-btn"
                      title="Add project lead"
                      onClick={() => setAddLeadOpen(true)}
                    >
                      <Plus size={11} />
                    </button>
                  </div>
                </div>

                <div className="team-section-list">
                  <div className="team-member-item lead-item">
                    <Avatar name={creatorName} size="sm" />
                    <div className="team-member-info">
                      <span className="team-member-name">
                        {creatorName}
                        <span className="lead-badge" title="Project Lead (Creator)">
                          <Shield size={12} style={{ color: '#6366f1', marginLeft: 4 }} />
                        </span>
                      </span>
                      <span className="team-member-role">Team Lead (Creator)</span>
                    </div>
                  </div>

                  {additionalLeads.map((m, idx) => (
                    <div key={m.id || `lead-${idx}`} className="team-member-item lead-item">
                      <Avatar name={m.name || 'Lead'} size="sm" />
                      <div className="team-member-info">
                        <span className="team-member-name">
                          {m.name || `User ${m.id}`}
                          <span className="lead-badge" title="Project Lead">
                            <Shield size={12} style={{ color: '#6366f1', marginLeft: 4 }} />
                          </span>
                        </span>
                        <span className="team-member-role">Project Lead</span>
                      </div>
                      <button
                        className="task-action-btn danger"
                        title={`Remove ${m.name || 'lead'}`}
                        onClick={() => promptRemoveMember(m)}
                      >
                        <UserMinus size={11} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="team-section team-section-supervisors">
                <div className="team-section-header">
                  <div className="team-section-title">
                    <Crown size={13} style={{ color: '#f59e0b' }} />
                    <span>Supervisors</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span className="team-section-count">{asArray(projectSupervisors).length}</span>
                    <button
                      className="team-add-btn"
                      title="Add supervisor"
                      onClick={() => setAddSupervisorOpen(true)}
                    >
                      <Plus size={11} />
                    </button>
                  </div>
                </div>

                {asArray(projectSupervisors).length === 0 ? (
                  <div className="team-section-empty">No supervisors assigned</div>
                ) : (
                  <div className="team-section-list">
                    {projectSupervisors.map((m, idx) => (
                      <div key={m.id || `sup-${idx}`} className="team-member-item supervisor-item">
                        <Avatar name={m.name || 'Supervisor'} size="sm" />
                        <div className="team-member-info">
                          <span className="team-member-name">
                            {m.name || `User ${m.id}`}
                            <span className="supervisor-badge" title="Supervisor">
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

              <div className="team-section team-section-members">
                <div className="team-section-header">
                  <div className="team-section-title">
                    <Users size={13} style={{ color: 'var(--accent-primary)' }} />
                    <span>Team Members</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span className="team-section-count">{regularMembers.length}</span>
                    <button
                      className="team-add-btn"
                      title="Add team member"
                      onClick={() => setAddMemberOpen(true)}
                    >
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
                        <button
                          className="task-action-btn danger"
                          title={`Remove ${m.name || 'member'}`}
                          onClick={() => promptRemoveMember(m)}
                        >
                          <UserMinus size={11} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

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
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    Open a task to add a comment
                  </span>
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
                      <motion.div key={commentKey} className={`comment-item ${isPinned ? 'pinned' : ''}`} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.15 }}>
                        {isPinned && <div className="comment-pin-badge"><Pin size={10} /> Pinned</div>}
                        <p className="comment-text">{c.desc || c.content}</p>
                        <div className="comment-meta-row">
                          <span className="comment-meta">
                            {c.u_name || c.user_name || 'User'} •
                            {c.created_at ? new Date(c.created_at).toLocaleString() : 'Just now'}
                          </span>
                          {task && <span className="comment-task-tag">📋 {task.title}</span>}
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

      {/* ─── ADD SUPERVISOR MODAL ─── */}
      <AnimatePresence>
        {addSupervisorOpen && (
          <motion.div
            className="modal-overlay"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => !addSupervisorSaving && setAddSupervisorOpen(false)}
          >
            <motion.div
              className="modal-box"
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              onClick={e => e.stopPropagation()}
              style={{ maxWidth: 420 }}
            >
              <div className="modal-header">
                <h2 className="modal-title"><Crown size={16} /> Add Supervisor</h2>
                <button className="modal-close-btn" onClick={() => setAddSupervisorOpen(false)} disabled={addSupervisorSaving}>
                  <X size={16} />
                </button>
              </div>
              <div className="modal-body">
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 0, marginBottom: 12 }}>
                  Select a user to add as a supervisor for this project.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 320, overflowY: 'auto' }}>
                  {asArray(users)
                    .filter(u => SUPERVISOR_ROLES.includes((u.role || '').toLowerCase()))
                    .filter(u => !asArray(projectSupervisors).some(s => Number(s.userId) === Number(u.id)))
                    .map(u => (
                      <button
                        key={u.id}
                        className="add-picker-row"
                        onClick={() => handleAddSupervisor(u.id)}
                        disabled={addSupervisorSaving}
                      >
                        <Avatar name={u.u_name || u.name || 'Supervisor'} size="sm" />
                        <div style={{ flex: 1, textAlign: 'left' }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                            {u.u_name || u.name || `User ${u.id}`}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                            {u.email || ''}
                          </div>
                        </div>
                        <Plus size={14} style={{ color: 'var(--accent-primary)' }} />
                      </button>
                    ))
                  }
                  {asArray(users)
                    .filter(u => SUPERVISOR_ROLES.includes((u.role || '').toLowerCase()))
                    .filter(u => !asArray(projectSupervisors).some(s => Number(s.userId) === Number(u.id)))
                    .length === 0 && (
                    <div style={{
                      padding: '20px 16px', textAlign: 'center', fontSize: 13,
                      color: 'var(--text-muted)', background: 'var(--bg-secondary)',
                      borderRadius: 10, border: '1px dashed var(--border-subtle)',
                    }}>
                      All available supervisors are already on this project.
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── ADD LEAD MODAL ─── */}
      <AnimatePresence>
        {addLeadOpen && (
          <motion.div
            className="modal-overlay"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => !addLeadSaving && setAddLeadOpen(false)}
          >
            <motion.div
              className="modal-box"
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              onClick={e => e.stopPropagation()}
              style={{ maxWidth: 420 }}
            >
              <div className="modal-header">
                <h2 className="modal-title"><Shield size={16} /> Add Project Lead</h2>
                <button className="modal-close-btn" onClick={() => setAddLeadOpen(false)} disabled={addLeadSaving}>
                  <X size={16} />
                </button>
              </div>
              <div className="modal-body">
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 0, marginBottom: 12 }}>
                  Select a Lead to add to this project. Leads must already exist as a Team Member profile.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 320, overflowY: 'auto' }}>
                  {asArray(allTeamMembers)
                    .filter(m => m.is_deleted !== 1)
                    .filter(m => LEAD_ROLES.includes((m.role || '').toLowerCase()))
                    .filter(m => !asArray(projectMembers).some(pm => Number(pm.userId) === Number(m.id)))
                    .filter(m => Number(m.id) !== Number(project?.created_by))
                    .map(m => (
                      <button
                        key={m.id}
                        className="add-picker-row"
                        onClick={() => handleAddLead(m.id)}
                        disabled={addLeadSaving}
                      >
                        <Avatar name={m.name || 'Lead'} size="sm" />
                        <div style={{ flex: 1, textAlign: 'left' }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                            {m.name || `User ${m.id}`}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                            {m.role || 'Lead'}
                          </div>
                        </div>
                        <Plus size={14} style={{ color: '#6366f1' }} />
                      </button>
                    ))
                  }
                  {asArray(allTeamMembers)
                    .filter(m => m.is_deleted !== 1)
                    .filter(m => LEAD_ROLES.includes((m.role || '').toLowerCase()))
                    .filter(m => !asArray(projectMembers).some(pm => Number(pm.userId) === Number(m.id)))
                    .length === 0 && (
                    <div style={{
                      padding: '20px 16px', textAlign: 'center', fontSize: 13,
                      color: 'var(--text-muted)', background: 'var(--bg-secondary)',
                      borderRadius: 10, border: '1px dashed var(--border-subtle)',
                    }}>
                      No additional leads available. Create Lead profiles from the Team page first.
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── ADD TEAM MEMBER MODAL ─── */}
      <AnimatePresence>
        {addMemberOpen && (
          <motion.div
            className="modal-overlay"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => !addMemberSaving && setAddMemberOpen(false)}
          >
            <motion.div
              className="modal-box"
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              onClick={e => e.stopPropagation()}
              style={{ maxWidth: 420 }}
            >
              <div className="modal-header">
                <h2 className="modal-title"><Users size={16} /> Add Team Member</h2>
                <button className="modal-close-btn" onClick={() => setAddMemberOpen(false)} disabled={addMemberSaving}>
                  <X size={16} />
                </button>
              </div>
              <div className="modal-body">
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 0, marginBottom: 12 }}>
                  Select a team member to add to this project.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 320, overflowY: 'auto' }}>
                  {asArray(allTeamMembers)
                    .filter(m => m.is_deleted !== 1)
                    .filter(m => !LEAD_ROLES.includes((m.role || '').toLowerCase()))
                    .filter(m => !asArray(projectMembers).some(pm => Number(pm.userId) === Number(m.id)))
                    .filter(m => !asArray(projectSupervisors).some(s => Number(s.userId) === Number(m.id)))
                    .map(m => (
                      <button
                        key={m.id}
                        className="add-picker-row"
                        onClick={() => handleAddTeamMember(m.id)}
                        disabled={addMemberSaving}
                      >
                        <Avatar name={m.name || 'Member'} size="sm" />
                        <div style={{ flex: 1, textAlign: 'left' }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                            {m.name || `User ${m.id}`}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                            {m.role || 'Member'}
                          </div>
                        </div>
                        <Plus size={14} style={{ color: 'var(--accent-primary)' }} />
                      </button>
                    ))
                  }
                  {asArray(allTeamMembers)
                    .filter(m => m.is_deleted !== 1)
                    .filter(m => !LEAD_ROLES.includes((m.role || '').toLowerCase()))
                    .filter(m => !asArray(projectMembers).some(pm => Number(pm.userId) === Number(m.id)))
                    .filter(m => !asArray(projectSupervisors).some(s => Number(s.userId) === Number(m.id)))
                    .length === 0 && (
                    <div style={{
                      padding: '20px 16px', textAlign: 'center', fontSize: 13,
                      color: 'var(--text-muted)', background: 'var(--bg-secondary)',
                      borderRadius: 10, border: '1px dashed var(--border-subtle)',
                    }}>
                      All available team members are already on this project.
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .spin { animation: spin 1s linear infinite; }
        .loading-spinner-wrapper { display: flex; justify-content: center; align-items: center; height: 400px; }
        .loading-spinner { width: 40px; height: 40px; border: 3px solid var(--border-subtle); border-top-color: var(--accent-primary); border-radius: 50%; animation: spin 0.8s linear infinite; }
        .not-found-container { text-align: center; padding: 60px 20px; color: var(--text-muted); }
        .not-found-container h2 { font-size: 24px; font-weight: 700; color: var(--text-primary); margin: 16px 0 8px; }
        .not-found-container p { margin-bottom: 20px; }
        .project-title-text { display: flex; align-items: center; gap: 12px; }
        .project-title-main { max-width: 300px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .project-title-badge { font-size: 10px; font-weight: 700; padding: 3px 10px; border-radius: 20px; color: #fff; flex-shrink: 0; }
        .topbar-actions { display: flex; gap: 8px; }
        .refresh-btn { display: flex; align-items: center; gap: 6px; }
        .pd-field-error { display: flex; align-items: center; gap: 5px; font-size: 11.5px; font-weight: 500; color: #f87171; margin-top: 4px; margin-bottom: 2px; }
        .pd-input-error { border-color: #f87171 !important; background: rgba(248, 113, 113, 0.04) !important; }
        .pd-input-error:focus { box-shadow: 0 0 0 3px rgba(248, 113, 113, 0.12) !important; }
        .project-detail-page { min-height: 100vh; background: var(--bg-primary); }
        .project-body { display: grid; grid-template-columns: 1fr 340px; gap: 20px; padding: 20px 24px; max-width: 1440px; margin: 0 auto; }
        .project-left { display: flex; flex-direction: column; gap: 16px; }
        .project-right { display: flex; flex-direction: column; gap: 16px; }
        .team-sections { display: flex; flex-direction: column; gap: 12px; }
        .team-section { border-radius: 10px; padding: 10px 12px; border: 1px solid var(--border-subtle); transition: all 0.15s; }
        .team-section-lead { background: rgba(99, 102, 241, 0.05); border-color: rgba(99, 102, 241, 0.18); }
        .team-section-supervisors { background: rgba(245, 158, 11, 0.04); border-color: rgba(245, 158, 11, 0.18); }
        .team-section-members { background: rgba(99, 102, 241, 0.04); border-color: rgba(99, 102, 241, 0.15); }
        .team-section-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; padding-bottom: 6px; border-bottom: 1px solid var(--border-subtle); }
        .team-section-title { display: flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 700; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.5px; }
        .team-section-count { font-size: 10px; font-weight: 700; padding: 1px 8px; border-radius: 10px; background: var(--bg-secondary); color: var(--text-muted); border: 1px solid var(--border-subtle); }
        .team-section-lead .team-section-count { background: rgba(99, 102, 241, 0.12); color: #6366f1; border-color: rgba(99, 102, 241, 0.25); }
        .team-section-supervisors .team-section-count { background: rgba(245, 158, 11, 0.12); color: #f59e0b; border-color: rgba(245, 158, 11, 0.25); }
        .team-section-members .team-section-count { background: rgba(99, 102, 241, 0.12); color: var(--accent-primary); border-color: rgba(99, 102, 241, 0.25); }
        .team-section-list { display: flex; flex-direction: column; gap: 4px; }
        .team-section-empty { font-size: 11.5px; color: var(--text-muted); font-style: italic; text-align: center; padding: 10px 0; }
        .supervisor-item { background: rgba(245, 158, 11, 0.05); border: 1px solid rgba(245, 158, 11, 0.15); border-radius: 8px; padding: 6px 10px; }
        .supervisor-item:hover { background: rgba(245, 158, 11, 0.1); }
        .supervisor-badge { display: inline-flex; align-items: center; margin-left: 4px; }
        .lead-item { background: rgba(99, 102, 241, 0.05); border: 1px solid rgba(99, 102, 241, 0.15); border-radius: 8px; padding: 6px 10px; }
        .lead-item:hover { background: rgba(99, 102, 241, 0.1); }
        .lead-badge { display: inline-flex; align-items: center; margin-left: 4px; }
        .comment-meta-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; margin-top: 4px; }
        .comment-task-tag { display: inline-flex; align-items: center; gap: 4px; padding: 1px 8px; border-radius: 12px; font-size: 10px; color: var(--text-muted); background: var(--bg-secondary); border: 1px solid var(--border-subtle); max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex-shrink: 0; }
        .task-comment-badge { display: inline-flex; align-items: center; gap: 3px; font-size: 10px; font-weight: 600; color: var(--text-muted); background: var(--bg-secondary); padding: 1px 8px; border-radius: 12px; border: 1px solid var(--border-subtle); }
        .modal-comments-section { margin-top: 12px; border-top: 1px solid var(--border-subtle); padding-top: 12px; }
        .modal-comment-input { display: flex; flex-direction: column; gap: 6px; margin-bottom: 10px; }
        .modal-comment-textarea { padding: 8px 12px; border: 1px solid var(--border-default); border-radius: 8px; background: var(--bg-secondary); color: var(--text-primary); font-size: 13px; resize: vertical; min-height: 50px; font-family: inherit; transition: border-color 0.2s; }
        .modal-comment-textarea:focus { outline: none; border-color: var(--accent-primary); background: var(--bg-card); }
        .modal-comment-textarea::placeholder { color: var(--text-muted); }
        .modal-comment-send-btn { display: flex; align-items: center; justify-content: center; gap: 6px; padding: 5px 14px; border: none; border-radius: 6px; background: var(--accent-primary); color: #fff; font-size: 12px; font-weight: 600; cursor: pointer; transition: all 0.15s; align-self: flex-end; }
        .modal-comment-send-btn:hover:not(:disabled) { opacity: 0.85; }
        .modal-comment-send-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .modal-comment-list { display: flex; flex-direction: column; gap: 6px; max-height: 200px; overflow-y: auto; scrollbar-width: thin; scrollbar-color: var(--border-default) transparent; }
        .modal-comment-list::-webkit-scrollbar { width: 3px; }
        .modal-comment-list::-webkit-scrollbar-thumb { background: var(--border-default); border-radius: 10px; }
        .modal-comment-item { padding: 8px 10px; border: 1px solid var(--border-subtle); border-radius: 6px; background: var(--bg-secondary); transition: all 0.15s; }
        .modal-comment-item.pinned { border-color: var(--accent-primary); background: color-mix(in srgb, var(--accent-primary) 5%, var(--bg-secondary)); }
        .modal-comment-pin-badge { display: flex; align-items: center; gap: 4px; font-size: 9px; font-weight: 700; color: var(--accent-primary); text-transform: uppercase; letter-spacing: 0.4px; margin-bottom: 3px; }
        .modal-comment-text { font-size: 12px; color: var(--text-secondary); line-height: 1.4; margin: 0; white-space: pre-wrap; }
        .modal-comment-footer { display: flex; justify-content: space-between; align-items: center; margin-top: 4px; }
        .modal-comment-meta { font-size: 9px; color: var(--text-muted); }
        .modal-comment-actions { display: flex; gap: 2px; }
        .modal-comment-action-btn { display: inline-flex; align-items: center; justify-content: center; padding: 2px 4px; border: 1px solid var(--border-subtle); border-radius: 4px; background: var(--bg-card); color: var(--text-secondary); cursor: pointer; transition: all 0.14s; }
        .modal-comment-action-btn:hover { background: var(--bg-primary); color: var(--accent-primary); border-color: var(--accent-primary); }
        .modal-comment-action-btn.active { color: var(--accent-primary); border-color: var(--accent-primary); }
        .modal-comment-action-btn.danger:hover { color: #f87171; border-color: #f87171; }
        .modal-comment-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 12px 0; color: var(--text-muted); text-align: center; }
        .modal-comment-empty p { font-size: 12px; margin: 2px 0 0; }
        .project-overview-card { background: var(--bg-card); border: 1px solid var(--border-subtle); border-radius: 14px; padding: 20px 24px; }
        .overview-header { display: flex; justify-content: space-between; align-items: center; gap: 20px; }
        .overview-info { flex: 1; min-width: 0; }
        .overview-title { font-size: 20px; font-weight: 800; color: var(--text-primary); margin: 0 0 4px; }
        .overview-desc { font-size: 13px; color: var(--text-secondary); line-height: 1.6; margin: 0; }
        .overview-progress-ring { flex-shrink: 0; }
        .ring-container { position: relative; width: 80px; height: 80px; }
        .ring-svg { transform: rotate(-90deg); width: 100%; height: 100%; }
        .ring-bg { fill: none; stroke: var(--border-subtle); stroke-width: 6; }
        .ring-fill { fill: none; stroke-width: 6; stroke-linecap: round; transition: stroke-dashoffset 0.8s ease; }
        .ring-center { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; }
        .ring-value { font-size: 18px; font-weight: 800; color: var(--text-primary); line-height: 1; }
        .ring-label { font-size: 8px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; }
        .tasks-card { background: var(--bg-card); border: 1px solid var(--border-subtle); border-radius: 14px; padding: 18px 20px; }
        .tasks-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }
        .tasks-title { display: flex; align-items: center; gap: 8px; font-size: 15px; font-weight: 700; color: var(--text-primary); margin: 0; }
        .tasks-count { font-size: 11px; font-weight: 600; color: var(--text-muted); background: var(--bg-secondary); padding: 1px 10px; border-radius: 20px; }
        .tasks-scroll { max-height: 480px; overflow-y: auto; padding-right: 4px; scrollbar-width: thin; scrollbar-color: var(--border-default) transparent; }
        .tasks-scroll::-webkit-scrollbar { width: 4px; }
        .tasks-scroll::-webkit-scrollbar-thumb { background: var(--border-default); border-radius: 10px; }
        .tasks-list { display: flex; flex-direction: column; gap: 8px; }
        .tasks-empty { text-align: center; padding: 30px 0; color: var(--text-muted); }
        .tasks-empty p { font-size: 14px; font-weight: 500; margin: 8px 0 4px; }
        .tasks-empty span { font-size: 12px; }
        .task-item { padding: 12px 14px; background: var(--bg-secondary); border: 1px solid var(--border-subtle); border-radius: 10px; cursor: pointer; transition: all 0.15s; }
        .task-item:hover { border-color: var(--accent-primary); background: var(--bg-card); }
        .task-item-header { display: flex; justify-content: space-between; align-items: center; gap: 10px; }
        .task-item-left { display: flex; align-items: center; gap: 8px; flex: 1; min-width: 0; }
        .task-status-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
        .task-item-title { font-size: 13px; font-weight: 600; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .task-item-badges { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
        .task-item-progress-badge { font-size: 10px; font-weight: 700; padding: 1px 8px; border-radius: 12px; }
        .task-item-desc { font-size: 12px; color: var(--text-secondary); margin: 6px 0 8px; display: -webkit-box; -webkit-line-clamp: 1; -webkit-box-orient: vertical; overflow: hidden; }
        .task-item-footer { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
        .task-item-assignee { display: flex; align-items: center; gap: 4px; font-size: 11px; color: var(--text-muted); }
        .task-item-actions { display: flex; gap: 4px; margin-left: auto; }
        .task-action-btn { display: inline-flex; align-items: center; justify-content: center; padding: 3px 5px; border-radius: 4px; border: 1px solid var(--border-subtle); background: var(--bg-card); color: var(--text-secondary); cursor: pointer; transition: all 0.14s; }
        .task-action-btn:hover { background: var(--bg-primary); color: var(--accent-primary); border-color: var(--accent-primary); }
        .task-action-btn.danger:hover { color: #f87171; border-color: #f87171; }
        .info-card { background: var(--bg-card); border: 1px solid var(--border-subtle); border-radius: 14px; padding: 16px 18px; }
        .info-card-title { display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 700; color: var(--text-primary); margin: 0 0 12px; }
        .info-badge { margin-left: auto; font-size: 11px; font-weight: 600; color: var(--text-muted); background: var(--bg-secondary); padding: 1px 10px; border-radius: 20px; }
        .info-stats { display: flex; flex-direction: column; gap: 8px; }
        .info-stat { display: flex; align-items: center; gap: 12px; padding: 8px 10px; background: var(--bg-secondary); border-radius: 8px; }
        .info-stat-icon { width: 32px; height: 32px; border-radius: 8px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
        .info-stat-value { display: block; font-size: 15px; font-weight: 700; color: var(--text-primary); }
        .info-stat-label { font-size: 11px; color: var(--text-muted); }
        .team-member-item { display: flex; align-items: center; gap: 10px; padding: 6px 8px; border-radius: 8px; transition: background 0.15s; }
        .team-member-item:hover { background: var(--bg-secondary); }
        .team-member-info { flex: 1; min-width: 0; }
        .team-member-name { display: block; font-size: 13px; font-weight: 500; color: var(--text-primary); }
        .team-member-role { font-size: 11px; color: var(--text-muted); }
        .comments-card { flex: 1; }
        .comment-list { display: flex; flex-direction: column; gap: 8px; max-height: 400px; overflow-y: auto; scrollbar-width: thin; scrollbar-color: var(--border-default) transparent; }
        .comment-list::-webkit-scrollbar { width: 3px; }
        .comment-list::-webkit-scrollbar-thumb { background: var(--border-default); border-radius: 10px; }
        .comment-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 16px 0; color: var(--text-muted); text-align: center; }
        .comment-empty p { font-size: 13px; margin: 4px 0 0; }
        .comment-item { padding: 10px 12px; border: 1px solid var(--border-subtle); border-radius: 8px; background: var(--bg-secondary); transition: all 0.15s; }
        .comment-item.pinned { border-color: var(--accent-primary); background: color-mix(in srgb, var(--accent-primary) 5%, var(--bg-secondary)); }
        .comment-pin-badge { display: flex; align-items: center; gap: 4px; font-size: 9px; font-weight: 700; color: var(--accent-primary); text-transform: uppercase; letter-spacing: 0.4px; margin-bottom: 4px; }
        .comment-text { font-size: 13px; color: var(--text-secondary); line-height: 1.5; margin: 0; white-space: pre-wrap; }
        .comment-footer { display: flex; justify-content: space-between; align-items: center; margin-top: 6px; }
        .comment-meta { font-size: 10px; color: var(--text-muted); }
        .comment-actions { display: flex; gap: 3px; }
        .comment-action-btn { display: inline-flex; align-items: center; justify-content: center; padding: 2px 4px; border: 1px solid var(--border-subtle); border-radius: 4px; background: var(--bg-card); color: var(--text-secondary); cursor: pointer; transition: all 0.14s; }
        .comment-action-btn:hover { background: var(--bg-primary); color: var(--accent-primary); border-color: var(--accent-primary); }
        .comment-action-btn.active { color: var(--accent-primary); border-color: var(--accent-primary); }
        .comment-action-btn.danger:hover { color: #f87171; border-color: #f87171; }
        .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.6); backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 16px; }
        .modal-box { background: var(--bg-card); border: 1px solid var(--border-default); border-radius: 20px; width: 100%; max-width: 520px; max-height: 90vh; overflow-y: auto; box-shadow: 0 24px 60px rgba(0,0,0,0.3); scrollbar-width: thin; scrollbar-color: var(--border-default) transparent; }
        .modal-box::-webkit-scrollbar { width: 4px; }
        .modal-box::-webkit-scrollbar-thumb { background: var(--border-default); border-radius: 10px; }
        .modal-header { display: flex; align-items: center; justify-content: space-between; padding: 18px 20px 14px; border-bottom: 1px solid var(--border-subtle); position: sticky; top: 0; background: var(--bg-card); border-radius: 20px 20px 0 0; z-index: 2; }
        .modal-title { font-size: 17px; font-weight: 700; color: var(--text-primary); display: flex; align-items: center; gap: 8px; margin: 0; }
        .modal-close-btn { display: inline-flex; align-items: center; justify-content: center; padding: 6px; border-radius: 8px; border: 1px solid var(--border-subtle); background: var(--bg-secondary); color: var(--text-secondary); cursor: pointer; transition: all 0.14s; }
        .modal-close-btn:hover { border-color: var(--accent-primary); color: var(--accent-primary); background: var(--bg-primary); }
        .modal-body { padding: 18px 20px; }
        .modal-desc { font-size: 14px; color: var(--text-secondary); line-height: 1.6; margin: 0 0 14px; }
        .modal-meta-row { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 12px; }
        .modal-milestones { margin: 12px 0; }
        .modal-subtitle { display: flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 700; color: var(--text-secondary); margin: 0 0 8px; }
        .milestone-box { padding: 10px 12px; background: var(--bg-secondary); border: 1px solid var(--border-subtle); border-radius: 8px; margin-bottom: 6px; }
        .milestone-title { font-size: 13px; font-weight: 600; color: var(--text-primary); }
        .milestone-meta { display: flex; gap: 12px; font-size: 11px; color: var(--text-muted); margin-top: 4px; }
        .milestone-meta svg { width: 12px; height: 12px; }
        .modal-progress-section { margin-top: 14px; }
        .modal-progress-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
        .modal-progress-label { font-size: 12px; font-weight: 600; color: var(--text-secondary); }
        .modal-progress-value { font-size: 14px; font-weight: 800; color: var(--accent-primary); }
        .modal-progress-track { width: 100%; height: 8px; background: var(--border-subtle); border-radius: 10px; overflow: hidden; }
        .modal-progress-fill { height: 100%; background: linear-gradient(90deg, var(--accent-primary), #a78bfa); border-radius: 10px; transition: width 0.5s ease; }
        .modal-footer { display: flex; gap: 10px; padding: 14px 20px 20px; border-top: 1px solid var(--border-subtle); justify-content: space-between; align-items: center; }
        .confirm-box { max-width: 380px; text-align: center; padding-bottom: 24px; }
        .confirm-title { font-size: 18px; font-weight: 800; color: var(--text-primary); margin: 0 0 6px; }
        .confirm-desc { font-size: 13px; color: var(--text-muted); margin: 0 0 16px; }
        .edit-form { display: flex; flex-direction: column; gap: 12px; }
        .form-group { display: flex; flex-direction: column; gap: 4px; }
        .form-label { font-size: 12px; font-weight: 600; color: var(--text-secondary); }
        .form-required { color: #f87171; }
        .form-input { padding: 9px 12px; border: 1px solid var(--border-default); border-radius: 8px; background: var(--bg-secondary); color: var(--text-primary); font-size: 13px; transition: all 0.2s; font-family: inherit; }
        .form-input:focus { outline: none; border-color: var(--accent-primary); background: var(--bg-card); box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.08); }
        .form-textarea { resize: vertical; min-height: 80px; }
        .form-row-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .range-input { width: 100%; accent-color: var(--accent-primary); cursor: pointer; }
        .btn-danger { background: rgba(239, 68, 68, 0.1); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.3); }
        .btn-danger:hover { background: rgba(239, 68, 68, 0.2); }
        .btn-secondary { background: var(--bg-secondary); color: var(--text-primary); border: 1px solid var(--border-default); }
        .btn-secondary:hover { border-color: var(--accent-primary); }
        @media (max-width: 1024px) { .project-body { grid-template-columns: 1fr 280px; padding: 16px 20px; } }
        @media (max-width: 768px) {
          .project-body { grid-template-columns: 1fr; padding: 14px 16px; gap: 14px; }
          .overview-header { flex-direction: column; align-items: stretch; text-align: center; }
          .overview-progress-ring { align-self: center; }
          .project-title-main { max-width: 180px; }
          .form-row-2 { grid-template-columns: 1fr; }
          .modal-comment-list { max-height: 150px; }
          .modal-footer { flex-direction: column; gap: 8px; }
          .modal-footer > div { width: 100%; }
          .modal-footer button { flex: 1; }
        }
        .team-add-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 22px;
          height: 22px;
          border-radius: 6px;
          border: 1px solid var(--border-subtle);
          background: var(--bg-card);
          color: var(--text-secondary);
          cursor: pointer;
          transition: all 0.14s;
          padding: 0;
        }
        .team-add-btn:hover {
          background: var(--accent-primary);
          color: #fff;
          border-color: var(--accent-primary);
        }
        .add-picker-row {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px 12px;
          background: var(--bg-secondary);
          border: 1px solid var(--border-subtle);
          border-radius: 10px;
          cursor: pointer;
          transition: all 0.14s;
          color: var(--text-primary);
        }
        .add-picker-row:hover:not(:disabled) {
          border-color: var(--accent-primary);
          background: var(--bg-card);
        }
        .add-picker-row:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        @media (max-width: 480px) {
          .project-body { padding: 10px 12px; gap: 12px; }
          .project-overview-card { padding: 16px; }
          .overview-title { font-size: 17px; }
          .tasks-card { padding: 14px 16px; }
          .task-item { padding: 10px 12px; }
          .task-item-header { flex-direction: column; align-items: flex-start; gap: 6px; }
          .task-item-badges { width: 100%; justify-content: flex-start; }
          .task-item-footer { flex-wrap: wrap; }
          .task-item-actions { margin-left: 0; }
          .info-card { padding: 14px; }
          .modal-box { max-width: 100%; border-radius: 16px; }
          .modal-header { padding: 14px 16px; }
          .modal-body { padding: 14px 16px; }
          .modal-footer { padding: 12px 16px 16px; }
          .project-title-text { flex-direction: column; align-items: flex-start; gap: 4px; }
          .project-title-main { max-width: 150px; }
          .topbar-actions { flex-direction: column; gap: 4px; }
          .ring-container { width: 64px; height: 64px; }
          .ring-value { font-size: 14px; }
          .modal-comment-list { max-height: 120px; }
        }
        @media (max-width: 360px) {
          .project-body { padding: 8px 10px; }
          .project-overview-card { padding: 12px; }
          .overview-title { font-size: 15px; }
          .overview-desc { font-size: 11px; }
          .tasks-card { padding: 12px; }
          .tasks-title { font-size: 13px; }
          .task-item-title { font-size: 12px; }
        }
      `}</style>
    </div>
  );
}