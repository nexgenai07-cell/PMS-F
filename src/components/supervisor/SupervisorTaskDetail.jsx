// components/supervisor/SupervisorTaskDetail.jsx
import { useState, useEffect, useMemo, useRef } from "react";
import { useParams, useNavigate, useOutletContext } from "react-router-dom";
import {
  ArrowLeft, MessageSquare, CheckCircle2,
  Pencil, Trash2, X, Pin, PinOff, RefreshCw,
  Loader2, User, Calendar, AlertCircle,
  FolderKanban, Send, Sparkles, TrendingUp, Clock,
  Target, ChevronDown, Check, Search, ListChecks, Plus, Flag,
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
import { useAuth } from "../../context/AuthContext";
import NotificationHelper from '../../services/notificationHelper';

const LIMITS = {
  title:   { min: 3, max: 200 },
  desc:    { max: 2000 },
  comment: { min: 1, max: 1000 },
  progress:{ min: 0, max: 100 },
};
const TITLE_REGEX = /^[\p{L}\p{N} &\-.'(),!?]+$/u;
const PRIORITY_OPTIONS = ["low", "medium", "high", "critical"];
const STATUS_OPTIONS   = ["todo", "in_progress", "review", "done", "cancelled"];

const getStatusColor = (status) => {
  const colors = {
    todo: "#94a3b8", pending: "#94a3b8",
    in_progress: "#818cf8", "in-progress": "#818cf8",
    review: "#f59e0b", done: "#34d399",
    completed: "#34d399", cancelled: "#f87171"
  };
  return colors[status?.toLowerCase()] || "#94a3b8";
};
const getStatusLabel = (status) => {
  const labels = {
    todo: "To Do", pending: "Pending",
    in_progress: "In Progress", "in-progress": "In Progress",
    review: "In Review", done: "Done",
    completed: "Completed", cancelled: "Cancelled"
  };
  return labels[status?.toLowerCase()] || status || "Unknown";
};

const validators = {
  title: (v) => {
    const s = (v ?? '').trim();
    if (!s) return 'Task title is required';
    if (s.length < LIMITS.title.min) return `Title must be at least ${LIMITS.title.min} characters`;
    if (s.length > LIMITS.title.max) return `Title must be less than ${LIMITS.title.max} characters`;
    if (!TITLE_REGEX.test(s)) return 'Title contains invalid characters';
    return '';
  },
  desc: (v) => {
    const s = v ?? '';
    if (s.length > LIMITS.desc.max) return `Description must be less than ${LIMITS.desc.max} characters`;
    return '';
  },
  status: (v) => (!STATUS_OPTIONS.includes(v) ? 'Invalid status' : ''),
  priority: (v) => (!PRIORITY_OPTIONS.includes(v) ? 'Invalid priority' : ''),
  progress: (v) => {
    const n = Number(v);
    if (Number.isNaN(n)) return 'Progress must be a number';
    if (n < LIMITS.progress.min || n > LIMITS.progress.max) return 'Progress must be between 0 and 100';
    return '';
  },
  comment: (v) => {
    const s = (v ?? '').trim();
    if (!s) return 'Comment cannot be empty';
    if (s.length < LIMITS.comment.min) return 'Comment is too short';
    if (s.length > LIMITS.comment.max) return `Comment must be less than ${LIMITS.comment.max} characters`;
    return '';
  },
};

function FieldError({ message }) {
  if (!message) return null;
  return (
    <div className="lt-field-error" role="alert">
      <AlertCircle size={12} />
      <span>{message}</span>
    </div>
  );
}

/* ─── Multi-assignee picker ─── */
function MemberMultiPicker({ selected = [], onChange, members = [], disabled = false }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const triggerRef = useRef(null);
  const [dropdownStyle, setDropdownStyle] = useState({});

  const safeMembers = asArray(members);
  const selectedSet = new Set(selected.map(Number));
  const selectedMembers = safeMembers.filter(m => selectedSet.has(Number(m.id)));

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return safeMembers;
    return safeMembers.filter(m =>
      (m.name || '').toLowerCase().includes(q) ||
      (m.role || '').toLowerCase().includes(q)
    );
  }, [safeMembers, query]);

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
      <div ref={triggerRef} className="lt-picker-trigger" onClick={() => !disabled && setOpen(o => !o)}>
        {selectedMembers.length === 0 ? (
          <span className="lt-picker-placeholder">Unassigned</span>
        ) : (
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', flex: 1 }}>
            {selectedMembers.map(m => (
              <span key={m.id} className="lt-picker-chip">
                <Avatar name={m.name} size="sm" />
                {m.name}
                {!disabled && (
                  <button type="button" onClick={(e) => { e.stopPropagation(); toggle(m.id); }}>
                    <X size={10} />
                  </button>
                )}
              </span>
            ))}
          </div>
        )}
        <ChevronDown size={14} className={`lt-picker-chevron ${open ? 'rotate' : ''}`} />
      </div>
      {open && (
        <>
          <div className="lt-picker-backdrop" onClick={() => setOpen(false)} />
          <div className="lt-picker-dropdown" style={dropdownStyle}>
            <div className="lt-picker-search">
              <Search size={14} />
              <input
                autoFocus
                placeholder="Search members..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              {query && <button onClick={() => setQuery('')}><X size={12} /></button>}
            </div>
            <div className="lt-picker-list">
              {filtered.length === 0 ? (
                <div className="lt-picker-empty">No members match</div>
              ) : filtered.map(m => {
                const isSelected = selectedSet.has(Number(m.id));
                return (
                  <button
                    key={m.id}
                    type="button"
                    className={`lt-picker-option ${isSelected ? 'selected' : ''}`}
                    onClick={() => toggle(m.id)}
                  >
                    <Avatar name={m.name} size="sm" />
                    <span style={{ flex: 1, textAlign: 'left' }}>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{m.name}</div>
                      {m.role && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{m.role}</div>}
                    </span>
                    {isSelected && <Check size={14} className="lt-picker-check" />}
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

const asArray = (v) => (Array.isArray(v) ? v : []);

export default function SupervisorTaskDetail() {
  const { id, taskId } = useParams();
  const navigate = useNavigate();
  const { onMenuClick } = useOutletContext();
  const { user } = useAuth();

  const projectId = parseInt(id);
  const tId = parseInt(taskId);

  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [project, setProject]       = useState(null);
  const [task, setTask]             = useState(null);
  const [assignees, setAssignees]   = useState([]);
  const [teamMembers, setTeamMembers] = useState([]);
  const [projectMemberIds, setProjectMemberIds] = useState(new Set());
  const [comments, setComments]     = useState([]);

  const [newComment, setNewComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [commentTouched, setCommentTouched] = useState(false);

  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState({
    title: "", desc: "", status: "todo", priority: "medium",
    assignees: [], progress: 0, due_date: "",
  });
  const [editTouched, setEditTouched] = useState({});
  const [editSubmitAttempted, setEditSubmitAttempted] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);

  const editTitleRef = useRef(null);

  /* ─── Subtasks ─── */
  const [subtasks, setSubtasks] = useState([]);
  const [showAddSubtask, setShowAddSubtask] = useState(false);
  const [newSubtask, setNewSubtask] = useState({
    title: "", desc: "", priority: "medium", status: "todo",
    progress: 0, assignees: [], dueDate: "",
  });
  const [subtaskSubmitting, setSubtaskSubmitting] = useState(false);
  const [subtaskTouched, setSubtaskTouched] = useState({});
  const [subtaskSubmitAttempted, setSubtaskSubmitAttempted] = useState(false);
  const subtaskTitleRef = useRef(null);

  const editErrors = useMemo(() => ({
    title: validators.title(editForm.title),
    desc: validators.desc(editForm.desc),
    status: validators.status(editForm.status),
    priority: validators.priority(editForm.priority),
    progress: validators.progress(editForm.progress),
  }), [editForm]);

  const subtaskErrors = useMemo(() => ({
    title: validators.title(newSubtask.title),
    desc: validators.desc(newSubtask.desc),
    priority: validators.priority(newSubtask.priority),
    status: validators.status(newSubtask.status),
    progress: validators.progress(newSubtask.progress),
  }), [newSubtask]);

  const assignableMembers = useMemo(() => {
    const all = asArray(teamMembers);
    if (!projectMemberIds || projectMemberIds.size === 0) return all;
    return all.filter(m => projectMemberIds.has(Number(m.id)));
  }, [teamMembers, projectMemberIds]);

  const commentError = validators.comment(newComment);
  const isEditValid = Object.values(editErrors).every(e => e === '');
  const isSubtaskValid = Object.values(subtaskErrors).every(e => e === '');

  const markEditTouched = (f) => setEditTouched(p => ({ ...p, [f]: true }));
  const showEditError = (f) => editSubmitAttempted ? editErrors[f] : (editTouched[f] ? editErrors[f] : '');

  const markSubtaskTouched = (f) => setSubtaskTouched(p => ({ ...p, [f]: true }));
  const showSubtaskError = (f) => subtaskSubmitAttempted ? subtaskErrors[f] : (subtaskTouched[f] ? subtaskErrors[f] : '');

  useEffect(() => { fetchTaskData(); /* eslint-disable-next-line */ }, [projectId, tId]);

  const fetchTaskData = async () => {
    try {
      setLoading(true);
      const [projectData, taskData, membersData, subtasksData, projectMembersData] = await Promise.all([
        projectService.getProject(projectId),
        taskService.getTask(tId),
        teamService.getTeamMembers(),
        taskService.getSubtasks(tId).catch(() => ({ data: [] })),
        projectTeamService.getProjectMembers(projectId).catch(() => ({ data: [] })),
      ]);

      const projectItem = projectData?.data || projectData;
      const taskItem = taskData?.data || taskData;
      const membersList = membersData?.data || membersData || [];
      const subsList = subtasksData?.data || subtasksData || [];
      const projectMembersList = projectMembersData?.data || projectMembersData || [];

      setProject(projectItem);
      setTask(taskItem);
      setTeamMembers(membersList);
      setSubtasks(subsList);

      const pmIds = new Set(
        asArray(projectMembersList)
          .map(m => Number(m.id ?? m.tmId ?? m.tm))
          .filter(Number.isFinite)
      );
      setProjectMemberIds(pmIds);

      const assigneeIds = Array.isArray(taskItem?.assignees) && taskItem.assignees.length > 0
        ? taskItem.assignees.map(Number)
        : (taskItem?.assign_to ? [Number(taskItem.assign_to)] : []);

      const resolvedAssignees = assigneeIds
        .map(aid => membersList.find(m => Number(m.id) === Number(aid)))
        .filter(Boolean);
      setAssignees(resolvedAssignees);

      if (taskItem) {
        setEditForm({
          title: taskItem.title || "",
          desc: taskItem.desc || taskItem.description || "",
          status: taskItem.status || "todo",
          priority: taskItem.priority || "medium",
          assignees: assigneeIds,
          progress: Number(taskItem.progress) || 0,
          due_date: taskItem.due_date ? String(taskItem.due_date).slice(0, 16) : "",
        });
      }

      try {
        const commentsResponse = await commentService.getCommentsByTask(tId);
        const commentsList = commentsResponse?.data || commentsResponse || [];
        setComments(commentsList);
      } catch {
        setComments([]);
      }
    } catch (error) {
      console.error("[Supervisor] Error fetching task data:", error);
      toast.error("Failed to load task details");
      if (error?.response?.status === 404 || error?.status === 404) {
        navigate(`/supervisor/projects/${projectId}`);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchTaskData();
    toast.success("Task refreshed");
  };

  /* ─── Comments ─── */
  const handleAddComment = async () => {
    setCommentTouched(true);
    if (commentError) { toast.error(commentError); return; }
    if (submitting) return;
    setSubmitting(true);
    try {
      const response = await commentService.addComment({
        taskId: tId,
        desc: newComment.trim(),
        priority: "normal",
        pin: false,
      });
      const newC = response?.data || response;
      try { await NotificationHelper.commentAdded(newC, user); } catch { /* silent */ }
      setComments([newC, ...comments]);
      setNewComment("");
      setCommentTouched(false);
      toast.success("Comment added successfully");
    } catch (error) {
      console.error("[Supervisor] Error adding comment:", error);
      toast.error('Failed to add comment');
    } finally {
      setSubmitting(false);
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
    } catch { toast.error("Failed to update pin"); }
  };

  const deleteComment = async (commentId) => {
    if (!window.confirm("Delete this comment?")) return;
    try {
      await commentService.deleteComment(commentId);
      setComments(prev => prev.filter(c => (c.c_id || c.id) !== commentId));
      toast.success("Comment deleted");
    } catch { toast.error("Failed to delete comment"); }
  };

  /* ─── Update task ─── */
  const handleUpdateTask = async () => {
    setEditSubmitAttempted(true);
    if (!isEditValid) { toast.error('Please fix the highlighted errors'); return; }
    if (savingEdit) return;
    setSavingEdit(true);
    try {
      const assigneeIds = asArray(editForm.assignees).map(Number).filter(Number.isFinite);

      const response = await taskService.updateTask(tId, {
        title: editForm.title.trim(),
        description: (editForm.desc || '').trim(),
        status: editForm.status,
        priority: editForm.priority,
        progress: Number(editForm.progress) || 0,
        assignees: assigneeIds,
        assignTo: assigneeIds[0] ?? null,
        dueDate: editForm.due_date || null,
      });

      const updatedTask = response?.data || response;
      setTask(updatedTask);

      const resolvedAssignees = assigneeIds
        .map(aid => teamMembers.find(m => Number(m.id) === Number(aid)))
        .filter(Boolean);
      setAssignees(resolvedAssignees);

      try { await NotificationHelper.taskUpdated(updatedTask, user); } catch { /* silent */ }

      setEditTouched({});
      setEditSubmitAttempted(false);
      setEditMode(false);
      toast.success("Task updated successfully");
    } catch (error) {
      console.error("[Supervisor] Error updating task:", error);
      toast.error('Failed to update task');
    } finally {
      setSavingEdit(false);
    }
  };

  /* ─── Add subtask ─── */
  const handleAddSubtask = async () => {
    setSubtaskSubmitAttempted(true);
    if (!isSubtaskValid) { toast.error('Please fix the highlighted errors'); return; }
    if (subtaskSubmitting) return;
    setSubtaskSubmitting(true);
    try {
      const assigneeIds = asArray(newSubtask.assignees).map(Number).filter(Number.isFinite);

      const response = await taskService.createSubtask(tId, {
        title: newSubtask.title.trim(),
        description: (newSubtask.desc || '').trim(),
        status: newSubtask.status,
        priority: newSubtask.priority,
        progress: newSubtask.progress,
        assignees: assigneeIds,
        assignTo: assigneeIds[0] ?? null,
        dueDate: newSubtask.dueDate || null,
      });

      const createdSub = response?.data || response;
      setSubtasks(prev => [createdSub, ...prev]);

      setNewSubtask({
        title: "", desc: "", priority: "medium", status: "todo",
        progress: 0, assignees: [], dueDate: "",
      });
      setSubtaskTouched({});
      setSubtaskSubmitAttempted(false);
      setShowAddSubtask(false);
      toast.success("Subtask added");
    } catch (error) {
      console.error("[Supervisor] Error adding subtask:", error);
      toast.error('Failed to add subtask');
    } finally {
      setSubtaskSubmitting(false);
    }
  };

  const handleDeleteSubtask = async (subId) => {
    if (!window.confirm("Delete this subtask?")) return;
    try {
      await taskService.deleteTask(subId);
      setSubtasks(prev => prev.filter(s => (s.t_id || s.id) !== subId));
      toast.success("Subtask deleted");
    } catch { toast.error("Failed to delete subtask"); }
  };

  const handleToggleSubtaskDone = async (sub) => {
    const sid = sub.t_id || sub.id;
    const nextStatus = (sub.status === 'done') ? 'todo' : 'done';
    const nextProgress = nextStatus === 'done' ? 100 : (Number(sub.progress) || 0);
    try {
      const response = await taskService.updateTask(sid, {
        title: sub.title,
        description: sub.desc || '',
        status: nextStatus,
        priority: sub.priority,
        progress: nextProgress,
      });
      const updated = response?.data || response;
      setSubtasks(prev => prev.map(s => (s.t_id || s.id) === sid ? updated : s));
    } catch {
      toast.error('Failed to update subtask');
    }
  };

  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      if (savingEdit) return;
      if (editMode) {
        setEditMode(false);
        setEditTouched({});
        setEditSubmitAttempted(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editMode, savingEdit]);

  useEffect(() => {
    if (!editMode) return;
    const t = setTimeout(() => editTitleRef.current?.focus(), 60);
    return () => clearTimeout(t);
  }, [editMode]);

  useEffect(() => {
    if (!showAddSubtask) return;
    const t = setTimeout(() => subtaskTitleRef.current?.focus(), 60);
    return () => clearTimeout(t);
  }, [showAddSubtask]);

  if (loading) {
    return (
      <div>
        <Topbar title="Task Details" onMenuClick={onMenuClick} />
        <div className="page-container">
          <div className="loading-spinner-wrapper"><div className="loading-spinner" /></div>
        </div>
      </div>
    );
  }

  if (!task || !project) {
    return (
      <div>
        <Topbar title="Task Details" onMenuClick={onMenuClick} />
        <div className="page-container">
          <div className="not-found-container">
            <AlertCircle size={48} style={{ color: 'var(--text-muted)', opacity: 0.5 }} />
            <h2>Task or Project not found</h2>
            <button className="btn btn-primary" onClick={() => navigate(`/supervisor/projects/${projectId}`)}>
              <ArrowLeft size={14} /> Back to Project
            </button>
          </div>
        </div>
      </div>
    );
  }

  const sortedComments = [...comments].sort((a, b) =>
    (b.pin || b.pinned) === (a.pin || a.pinned) ? 0 : (b.pin || b.pinned) ? 1 : -1
  );

  const taskStatusColor = getStatusColor(task.status);
  const taskStatusLabel = getStatusLabel(task.status);

  const getMemberName = (memberId) => {
    if (memberId == null) return "Unassigned";
    const member = teamMembers.find(m => Number(m.id) === Number(memberId));
    return member ? member.name : "Unassigned";
  };

  const assigneeList = assignees.length > 0
    ? assignees
    : (Array.isArray(task.assignee_names) ? task.assignee_names.map((n, i) => ({ id: `n-${i}`, name: n })) : []);

  const subtaskTotal = subtasks.length;
  const subtaskDone = subtasks.filter(s => s.status === 'done').length;
  const subtaskProgress = subtaskTotal > 0 ? Math.round((subtaskDone / subtaskTotal) * 100) : 0;

  return (
    <div>
      <Topbar
        title={
          <span className="task-title-text">
            <span className="task-title-main">{task.title}</span>
            <span className="task-title-badge" style={{ background: taskStatusColor }}>
              {taskStatusLabel}
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
            <button
              className={`btn ${editMode ? 'btn-secondary' : 'btn-primary'} btn-sm`}
              onClick={() => {
                if (editMode) {
                  setEditMode(false);
                  setEditTouched({});
                  setEditSubmitAttempted(false);
                } else {
                  setEditMode(true);
                }
              }}
              disabled={savingEdit}
            >
              <Pencil size={14} /> {editMode ? 'Cancel' : 'Edit Task'}
            </button>
          </div>
        }
      />

      <div className="task-detail-page">
        {/* LEFT */}
        <div className="task-detail-left">
          <button className="back-button" onClick={() => navigate(`/supervisor/projects/${projectId}`)}>
            <ArrowLeft size={16} /><span>Back to Project</span>
          </button>

          <div className="task-content-card">
            {editMode ? (
              <motion.div className="edit-form" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                <div className="edit-form-group">
                  <label className="edit-label">Title <span className="edit-required">*</span></label>
                  <input
                    ref={editTitleRef}
                    className={`edit-input ${showEditError('title') ? 'lt-input-error' : ''}`}
                    value={editForm.title}
                    maxLength={LIMITS.title.max}
                    onChange={(e) => setEditForm(prev => ({ ...prev, title: e.target.value }))}
                    onBlur={(e) => {
                      const t = e.target.value.trim();
                      if (t !== e.target.value) setEditForm(prev => ({ ...prev, title: t }));
                      markEditTouched('title');
                    }}
                    disabled={savingEdit}
                  />
                  <FieldError message={showEditError('title')} />
                </div>

                <div className="edit-form-group">
                  <label className="edit-label">Description</label>
                  <textarea
                    className={`edit-input edit-textarea ${showEditError('desc') ? 'lt-input-error' : ''}`}
                    value={editForm.desc}
                    maxLength={LIMITS.desc.max}
                    onChange={(e) => {
                      const v = e.target.value;
                      setEditForm(prev => ({ ...prev, desc: v }));
                    }}
                    onBlur={() => markEditTouched('desc')}
                    placeholder="Enter task description..."
                    rows={4}
                    disabled={savingEdit}
                  />
                  <FieldError message={showEditError('desc')} />
                </div>

                <div className="edit-form-row">
                  <div className="edit-form-group">
                    <label className="edit-label">Status</label>
                    <select className="edit-input" value={editForm.status} onChange={(e) => setEditForm(prev => ({ ...prev, status: e.target.value }))} disabled={savingEdit}>
                      {STATUS_OPTIONS.map(s => <option key={s} value={s}>{getStatusLabel(s)}</option>)}
                    </select>
                  </div>
                  <div className="edit-form-group">
                    <label className="edit-label">Priority</label>
                    <select className="edit-input" value={editForm.priority} onChange={(e) => setEditForm(prev => ({ ...prev, priority: e.target.value }))} disabled={savingEdit}>
                      {PRIORITY_OPTIONS.map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
                    </select>
                  </div>
                </div>

                <div className="edit-form-group">
                  <label className="edit-label">Assignees</label>
                  <MemberMultiPicker
                    selected={editForm.assignees}
                    onChange={(ids) => setEditForm(prev => ({ ...prev, assignees: ids }))}
                    members={assignableMembers}
                    disabled={savingEdit}
                  />
                </div>

                <div className="edit-form-group">
                  <label className="edit-label">Deadline</label>
                  <input
                    type="datetime-local"
                    className="edit-input"
                    value={editForm.due_date || ''}
                    onChange={(e) => setEditForm(prev => ({ ...prev, due_date: e.target.value || '' }))}
                    disabled={savingEdit}
                  />
                </div>

                <div className="edit-form-group">
                  <label className="edit-label">Progress: <strong>{editForm.progress}%</strong></label>
                  <input
                    type="range"
                    min={0} max={100}
                    value={editForm.progress}
                    className="edit-range"
                    onChange={(e) => setEditForm(prev => ({ ...prev, progress: Number(e.target.value) }))}
                    disabled={savingEdit}
                  />
                </div>

                <div className="edit-actions">
                  <button className="btn btn-primary btn-sm" onClick={handleUpdateTask} disabled={savingEdit}>
                    {savingEdit ? <><Loader2 size={14} className="spin" /> Saving...</> : <><CheckCircle2 size={14} /> Save Changes</>}
                  </button>
                  <button className="btn btn-secondary btn-sm" onClick={() => { setEditMode(false); setEditTouched({}); setEditSubmitAttempted(false); }} disabled={savingEdit}>
                    <X size={14} /> Cancel
                  </button>
                </div>
              </motion.div>
            ) : (
              <>
                <div className="task-header">
                  <div className="task-header-left">
                    <h1 className="task-title-display">{task.title}</h1>
                    {task.desc && <p className="task-description">{task.desc}</p>}
                  </div>
                  <div className="task-header-right">
                    <div className="task-badges">
                      <span className="task-badge status" style={{ background: taskStatusColor }}>
                        <span className="task-badge-dot" style={{ background: taskStatusColor }} />
                        {taskStatusLabel}
                      </span>
                      <PriorityBadge priority={task.priority} />
                    </div>
                  </div>
                </div>

                <div className="task-meta-grid">
                  <div className="task-meta-item">
                    <FolderKanban size={14} className="task-meta-icon" />
                    <div>
                      <span className="task-meta-label">Project</span>
                      <span className="task-meta-value">{project.p_name || project.name}</span>
                    </div>
                  </div>
                  <div className="task-meta-item">
                    <User size={14} className="task-meta-icon" />
                    <div>
                      <span className="task-meta-label">Assignees</span>
                      <span className="task-meta-value">
                        {assigneeList.length === 0
                          ? 'Unassigned'
                          : assigneeList.map(a => a.name).join(', ')}
                      </span>
                    </div>
                  </div>
                  <div className="task-meta-item">
                    <TrendingUp size={14} className="task-meta-icon" />
                    <div>
                      <span className="task-meta-label">Progress</span>
                      <span className="task-meta-value" style={{ color: task.progress >= 70 ? '#34d399' : task.progress >= 40 ? '#f59e0b' : '#f87171' }}>
                        {task.progress || 0}%
                      </span>
                    </div>
                  </div>
                  {task.due_date && (
                    <div className="task-meta-item">
                      <Calendar size={14} className="task-meta-icon" />
                      <div>
                        <span className="task-meta-label">Deadline</span>
                        <span className="task-meta-value">{new Date(task.due_date).toLocaleString()}</span>
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          <div className="progress-card">
            <div className="progress-header">
              <span className="progress-title"><Target size={14} style={{ marginRight: 6 }} />Task Progress</span>
              <span className="progress-percentage" style={{ color: task.progress >= 70 ? '#34d399' : task.progress >= 40 ? '#f59e0b' : '#f87171' }}>
                {task.progress || 0}%
              </span>
            </div>
            <div className="progress-track">
              <motion.div
                className="progress-fill"
                initial={{ width: 0 }}
                animate={{ width: `${task.progress || 0}%` }}
                transition={{ duration: 0.6 }}
                style={{ background: task.progress >= 70 ? '#34d399' : task.progress >= 40 ? '#f59e0b' : '#f87171' }}
              />
            </div>
          </div>

          {/* SUBTASKS */}
          <div className="subtasks-card">
            <div className="subtasks-header">
              <h3 className="subtasks-title">
                <ListChecks size={16} />
                Subtasks
                <span className="subtasks-count">{subtaskDone}/{subtaskTotal}</span>
              </h3>
              <button className="btn btn-primary btn-sm" onClick={() => setShowAddSubtask(s => !s)}>
                <Plus size={14} /> {showAddSubtask ? 'Cancel' : 'Add Subtask'}
              </button>
            </div>

            {subtaskTotal > 0 && (
              <div className="subtasks-progress">
                <div className="subtasks-progress-track">
                  <div className="subtasks-progress-fill" style={{ width: `${subtaskProgress}%` }} />
                </div>
                <span className="subtasks-progress-label">{subtaskProgress}%</span>
              </div>
            )}

            <AnimatePresence>
              {showAddSubtask && (
                <motion.div
                  className="subtask-form"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                >
                  <div className="edit-form-group">
                    <label className="edit-label">Subtask Title <span className="edit-required">*</span></label>
                    <input
                      ref={subtaskTitleRef}
                      className={`edit-input ${showSubtaskError('title') ? 'lt-input-error' : ''}`}
                      value={newSubtask.title}
                      maxLength={LIMITS.title.max}
                      onChange={(e) => setNewSubtask(prev => ({ ...prev, title: e.target.value }))}
                      onBlur={(e) => {
                        const t = e.target.value.trim();
                        if (t !== e.target.value) setNewSubtask(prev => ({ ...prev, title: t }));
                        markSubtaskTouched('title');
                      }}
                      placeholder="Enter subtask title"
                      disabled={subtaskSubmitting}
                    />
                    <FieldError message={showSubtaskError('title')} />
                  </div>

                  <div className="edit-form-group">
                    <label className="edit-label">Description</label>
                    <textarea
                      className="edit-input edit-textarea"
                      value={newSubtask.desc}
                      maxLength={LIMITS.desc.max}
                      onChange={(e) => {
                        const v = e.target.value;
                        setNewSubtask(prev => ({ ...prev, desc: v }));
                      }}
                      placeholder="Optional description"
                      rows={2}
                      disabled={subtaskSubmitting}
                    />
                  </div>

                  <div className="edit-form-row">
                    <div className="edit-form-group">
                      <label className="edit-label">Priority</label>
                      <select className="edit-input" value={newSubtask.priority} onChange={(e) => setNewSubtask(prev => ({ ...prev, priority: e.target.value }))}>
                        {PRIORITY_OPTIONS.map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
                      </select>
                    </div>
                    <div className="edit-form-group">
                      <label className="edit-label">Status</label>
                      <select className="edit-input" value={newSubtask.status} onChange={(e) => setNewSubtask(prev => ({ ...prev, status: e.target.value }))}>
                        {STATUS_OPTIONS.map(s => <option key={s} value={s}>{getStatusLabel(s)}</option>)}
                      </select>
                    </div>
                  </div>

                  <div className="edit-form-group">
                    <label className="edit-label">Assignees</label>
                    <MemberMultiPicker
                      selected={newSubtask.assignees}
                      onChange={(ids) => setNewSubtask(prev => ({ ...prev, assignees: ids }))}
                      members={assignableMembers}
                      disabled={subtaskSubmitting}
                    />
                  </div>

                  <div className="edit-form-group">
                    <label className="edit-label">Deadline</label>
                    <input
                      type="datetime-local"
                      className="edit-input"
                      value={newSubtask.dueDate || ''}
                      onChange={(e) => setNewSubtask(prev => ({ ...prev, dueDate: e.target.value || '' }))}
                      disabled={subtaskSubmitting}
                    />
                  </div>

                  <div className="edit-actions">
                    <button className="btn btn-primary btn-sm" onClick={handleAddSubtask} disabled={subtaskSubmitting}>
                      {subtaskSubmitting ? <><Loader2 size={14} className="spin" /> Adding...</> : <><Plus size={14} /> Add Subtask</>}
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="subtasks-list">
              {subtaskTotal === 0 ? (
                <div className="subtasks-empty">
                  <ListChecks size={28} style={{ opacity: 0.3 }} />
                  <p>No subtasks yet</p>
                  <span>Break this task down into smaller steps</span>
                </div>
              ) : (
                subtasks.map((sub, i) => {
                  const sid = sub.t_id || sub.id;
                  const isDone = sub.status === 'done';
                  const subAssigneeIds = Array.isArray(sub.assignees) && sub.assignees.length > 0
                    ? sub.assignees.map(Number)
                    : (sub.assign_to ? [Number(sub.assign_to)] : []);
                  return (
                    <motion.div key={sid || `sub-${i}`} className="subtask-item" initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }}>
                      <button
                        className={`subtask-check ${isDone ? 'checked' : ''}`}
                        onClick={() => handleToggleSubtaskDone(sub)}
                        title={isDone ? "Mark as todo" : "Mark as done"}
                      >
                        {isDone && <Check size={12} />}
                      </button>
                      <div className="subtask-body">
                        <div className="subtask-title-row">
                          <span className={`subtask-title ${isDone ? 'done' : ''}`}>{sub.title}</span>
                          <PriorityBadge priority={sub.priority} />
                        </div>
                        {sub.desc && <p className="subtask-desc">{sub.desc}</p>}
                        <div className="subtask-meta">
                          <span><User size={11} /> {subAssigneeIds.length === 0 ? 'Unassigned' : subAssigneeIds.map(aid => getMemberName(aid)).join(', ')}</span>
                          {sub.due_date && <span><Calendar size={11} /> {new Date(sub.due_date).toLocaleDateString()}</span>}
                          <span>{sub.progress || 0}%</span>
                        </div>
                      </div>
                      <div className="subtask-actions">
                        <button className="icon-btn" onClick={() => navigate(`/supervisor/projects/${projectId}/tasks/${sid}`)} title="Open subtask">
                          <ArrowLeft size={12} style={{ transform: 'rotate(180deg)' }} />
                        </button>
                        <button className="icon-btn danger" onClick={() => handleDeleteSubtask(sid)} title="Delete subtask">
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </motion.div>
                  );
                })
              )}
            </div>
          </div>

          {/* Comments */}
          <div className="comments-card">
            <div className="comments-header">
              <h3 className="comments-title">
                <MessageSquare size={18} />Comments
                <span className="comments-count">{comments.length}</span>
              </h3>
            </div>

            <div className="comment-input-wrapper">
              <div className="comment-input-container">
                <Avatar name={user?.u_name || 'User'} size="sm" />
                <textarea
                  className={`comment-input ${commentTouched && commentError && newComment.length > 0 ? 'lt-input-error' : ''}`}
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  onBlur={() => setCommentTouched(true)}
                  placeholder="Write a comment... (Ctrl+Enter to send)"
                  rows={2}
                  maxLength={LIMITS.comment.max}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && e.ctrlKey) { e.preventDefault(); handleAddComment(); }
                  }}
                  disabled={submitting}
                />
              </div>
              {commentTouched && commentError && newComment.length > 0 && (
                <FieldError message={commentError} />
              )}
              <button className="send-comment-btn" onClick={handleAddComment} disabled={submitting || !newComment.trim()}>
                {submitting ? <Loader2 size={16} className="spin" /> : <Send size={16} />}
                {submitting ? 'Sending...' : 'Send'}
              </button>
            </div>

            <div className="comment-list">
              {sortedComments.length === 0 ? (
                <div className="comment-empty">
                  <MessageSquare size={32} style={{ opacity: 0.3 }} />
                  <p>No comments yet</p>
                </div>
              ) : (
                <AnimatePresence>
                  {sortedComments.map((c) => {
                    const commentId = c.c_id || c.id;
                    const isPinned = c.pin || c.pinned;
                    return (
                      <motion.div key={commentId} className={`comment-item ${isPinned ? 'pinned' : ''}`} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
                        {isPinned && <div className="pin-badge"><Pin size={10} /> Pinned</div>}
                        <div className="comment-header">
                          <div className="comment-user">
                            <Avatar name={c.u_name || 'User'} size="sm" />
                            <div>
                              <p className="comment-username">{c.u_name || 'User'}</p>
                              <p className="comment-role">Member</p>
                            </div>
                          </div>
                          <div className="comment-actions">
                            <button className="icon-btn" onClick={() => togglePin(commentId)}>
                              {isPinned ? <PinOff size={12} /> : <Pin size={12} />}
                            </button>
                            <button className="icon-btn danger" onClick={() => deleteComment(commentId)}>
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </div>
                        <p className="comment-content">{c.desc || c.content}</p>
                        <p className="comment-time">{c.created_at ? new Date(c.created_at).toLocaleString() : 'Just now'}</p>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT */}
        <div className="task-detail-right">
          <div className="sidebar-card">
            <h4 className="sidebar-card-title"><Sparkles size={14} />Task Details</h4>

            <div className="detail-item">
              <div className="detail-icon" style={{ background: 'rgba(129, 140, 248, 0.12)', color: '#818cf8' }}><Flag size={14} /></div>
              <div className="detail-content">
                <span className="detail-label">Status</span>
                <span className="detail-value">
                  <span className="detail-status-dot" style={{ background: taskStatusColor }} />
                  {taskStatusLabel}
                </span>
              </div>
            </div>

            <div className="detail-item">
              <div className="detail-icon" style={{ background: 'rgba(245, 158, 11, 0.12)', color: '#f59e0b' }}><AlertCircle size={14} /></div>
              <div className="detail-content">
                <span className="detail-label">Priority</span>
                <span className="detail-value"><PriorityBadge priority={task.priority} /></span>
              </div>
            </div>

            <div className="detail-item">
              <div className="detail-icon" style={{ background: 'rgba(52, 211, 153, 0.12)', color: '#34d399' }}><User size={14} /></div>
              <div className="detail-content">
                <span className="detail-label">Assignees</span>
                <span className="detail-value">
                  {assigneeList.length === 0 ? 'Unassigned' : assigneeList.map(a => a.name).join(', ')}
                </span>
              </div>
            </div>

            {task.due_date && (
              <div className="detail-item">
                <div className="detail-icon" style={{ background: 'rgba(245, 158, 11, 0.12)', color: '#f59e0b' }}><Calendar size={14} /></div>
                <div className="detail-content">
                  <span className="detail-label">Deadline</span>
                  <span className="detail-value">{new Date(task.due_date).toLocaleString()}</span>
                </div>
              </div>
            )}

            {task.start_date && (
              <div className="detail-item">
                <div className="detail-icon" style={{ background: 'rgba(129, 140, 248, 0.12)', color: '#818cf8' }}><Clock size={14} /></div>
                <div className="detail-content">
                  <span className="detail-label">Start Date</span>
                  <span className="detail-value">{new Date(task.start_date).toLocaleString()}</span>
                </div>
              </div>
            )}
          </div>

          <div className="sidebar-card">
            <h4 className="sidebar-card-title"><FolderKanban size={14} />Project</h4>
            <p className="project-name">{project.p_name || project.name}</p>
            <p className="project-desc">{project.desc || 'No description'}</p>
            <button className="sidebar-action-btn" onClick={() => navigate(`/supervisor/projects/${projectId}`)}>
              <FolderKanban size={14} /> View Project Details
            </button>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .spin { animation: spin 1s linear infinite; }
        .loading-spinner-wrapper { display: flex; justify-content: center; align-items: center; height: 400px; }
        .loading-spinner { width: 40px; height: 40px; border: 3px solid var(--border-subtle); border-top-color: var(--accent-primary); border-radius: 50%; animation: spin 0.8s linear infinite; }
        .not-found-container { text-align: center; padding: 60px 20px; color: var(--text-muted); }

        .task-title-text { display: flex; align-items: center; gap: 12px; }
        .task-title-main { max-width: 300px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .task-title-badge { font-size: 10px; font-weight: 700; padding: 3px 10px; border-radius: 20px; color: #fff; text-transform: uppercase; }
        .topbar-actions { display: flex; gap: 8px; }
        .refresh-btn { display: flex; align-items: center; gap: 6px; }

        .task-detail-page { display: flex; gap: 24px; padding: 24px; min-height: calc(100vh - 56px); background: var(--bg-primary); }
        .task-detail-left { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 16px; }
        .task-detail-right { width: 320px; flex-shrink: 0; display: flex; flex-direction: column; gap: 12px; }

        .back-button { display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; border: none; border-radius: 8px; background: var(--bg-secondary); color: var(--text-secondary); font-size: 12px; font-weight: 500; cursor: pointer; width: fit-content; }
        .back-button:hover { color: var(--accent-primary); }

        .task-content-card { background: var(--bg-card); border: 1px solid var(--border-subtle); border-radius: 14px; padding: 24px; }
        .task-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; }
        .task-header-left { flex: 1; min-width: 0; }
        .task-title-display { font-size: 22px; font-weight: 800; color: var(--text-primary); margin: 0 0 4px; }
        .task-description { font-size: 14px; color: var(--text-secondary); line-height: 1.6; margin: 0; white-space: pre-wrap; }
        .task-badges { display: flex; gap: 6px; flex-wrap: wrap; }
        .task-badge { display: inline-flex; align-items: center; gap: 6px; padding: 4px 12px; border-radius: 20px; font-size: 11px; font-weight: 600; color: #fff; }
        .task-badge-dot { width: 6px; height: 6px; border-radius: 50%; }

        .task-meta-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--border-subtle); }
        .task-meta-item { display: flex; align-items: center; gap: 10px; }
        .task-meta-icon { color: var(--text-muted); flex-shrink: 0; }
        .task-meta-label { display: block; font-size: 10px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; }
        .task-meta-value { display: block; font-size: 13px; font-weight: 600; color: var(--text-primary); }

        .progress-card { background: var(--bg-card); border: 1px solid var(--border-subtle); border-radius: 14px; padding: 16px 20px; }
        .progress-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
        .progress-title { font-size: 13px; font-weight: 600; color: var(--text-secondary); display: flex; align-items: center; }
        .progress-percentage { font-size: 14px; font-weight: 700; }
        .progress-track { width: 100%; height: 8px; background: var(--border-subtle); border-radius: 10px; overflow: hidden; }
        .progress-fill { height: 100%; border-radius: 10px; }

        .subtasks-card { background: var(--bg-card); border: 1px solid var(--border-subtle); border-radius: 14px; padding: 18px 20px; }
        .subtasks-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
        .subtasks-title { display: flex; align-items: center; gap: 8px; font-size: 15px; font-weight: 700; color: var(--text-primary); margin: 0; }
        .subtasks-count { font-size: 11px; font-weight: 600; color: var(--text-muted); background: var(--bg-secondary); padding: 1px 10px; border-radius: 20px; }
        .subtasks-progress { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
        .subtasks-progress-track { flex: 1; height: 6px; background: var(--border-subtle); border-radius: 10px; overflow: hidden; }
        .subtasks-progress-fill { height: 100%; background: linear-gradient(90deg, var(--accent-primary), #a78bfa); border-radius: 10px; transition: width 0.3s; }
        .subtasks-progress-label { font-size: 11px; font-weight: 700; color: var(--text-secondary); }
        .subtask-form { display: flex; flex-direction: column; gap: 10px; padding: 12px; background: var(--bg-secondary); border-radius: 10px; margin-bottom: 12px; overflow: hidden; }
        .subtasks-list { display: flex; flex-direction: column; gap: 8px; max-height: 400px; overflow-y: auto; padding-right: 4px; }
        .subtasks-empty { text-align: center; padding: 24px 0; color: var(--text-muted); }
        .subtasks-empty p { font-size: 13px; font-weight: 500; margin: 6px 0 2px; }
        .subtasks-empty span { font-size: 11px; }
        .subtask-item { display: flex; align-items: flex-start; gap: 10px; padding: 10px 12px; background: var(--bg-secondary); border: 1px solid var(--border-subtle); border-radius: 10px; }
        .subtask-check { width: 20px; height: 20px; border-radius: 50%; border: 2px solid var(--border-default); background: transparent; cursor: pointer; display: flex; align-items: center; justify-content: center; flex-shrink: 0; margin-top: 2px; color: #fff; transition: all 0.15s; }
        .subtask-check.checked { background: #34d399; border-color: #34d399; }
        .subtask-body { flex: 1; min-width: 0; }
        .subtask-title-row { display: flex; align-items: center; gap: 8px; }
        .subtask-title { font-size: 13px; font-weight: 600; color: var(--text-primary); }
        .subtask-title.done { text-decoration: line-through; color: var(--text-muted); }
        .subtask-desc { font-size: 12px; color: var(--text-secondary); margin: 4px 0 0; }
        .subtask-meta { display: flex; gap: 12px; font-size: 11px; color: var(--text-muted); margin-top: 4px; flex-wrap: wrap; }
        .subtask-meta span { display: inline-flex; align-items: center; gap: 4px; }
        .subtask-actions { display: flex; gap: 4px; flex-shrink: 0; }

        .comments-card { background: var(--bg-card); border: 1px solid var(--border-subtle); border-radius: 14px; padding: 20px 24px; }
        .comments-header { display: flex; align-items: center; margin-bottom: 16px; }
        .comments-title { display: flex; align-items: center; gap: 8px; font-size: 15px; font-weight: 700; color: var(--text-primary); margin: 0; }
        .comments-count { font-size: 11px; font-weight: 600; color: var(--text-muted); background: var(--bg-secondary); padding: 1px 10px; border-radius: 20px; }
        .comment-input-wrapper { margin-bottom: 16px; }
        .comment-input-container { display: flex; gap: 10px; padding: 10px 12px; background: var(--bg-secondary); border: 1px solid var(--border-default); border-radius: 10px; }
        .comment-input { flex: 1; border: none; outline: none; background: transparent; color: var(--text-primary); font-size: 13px; resize: vertical; font-family: inherit; min-height: 40px; }
        .send-comment-btn { display: flex; align-items: center; gap: 6px; padding: 8px 16px; border: none; border-radius: 8px; background: var(--accent-primary); color: #fff; font-size: 13px; font-weight: 600; cursor: pointer; margin-top: 8px; align-self: flex-end; }
        .comment-list { display: flex; flex-direction: column; gap: 10px; max-height: 480px; overflow-y: auto; padding-right: 4px; }
        .comment-empty { text-align: center; padding: 24px 0; color: var(--text-muted); }
        .comment-item { padding: 12px 14px; border: 1px solid var(--border-subtle); border-radius: 10px; background: var(--bg-secondary); }
        .comment-item.pinned { border-color: var(--accent-primary); }
        .pin-badge { display: flex; align-items: center; gap: 4px; font-size: 10px; font-weight: 700; color: var(--accent-primary); text-transform: uppercase; margin-bottom: 6px; }
        .comment-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 6px; }
        .comment-user { display: flex; align-items: center; gap: 8px; }
        .comment-username { font-weight: 600; font-size: 13px; color: var(--text-primary); margin: 0; }
        .comment-role { font-size: 11px; color: var(--text-muted); margin: 0; }
        .comment-content { font-size: 13px; color: var(--text-secondary); line-height: 1.6; margin: 4px 0; white-space: pre-wrap; }
        .comment-time { font-size: 11px; color: var(--text-muted); margin: 4px 0 0; }
        .comment-actions { display: flex; gap: 4px; }
        .icon-btn { display: inline-flex; align-items: center; justify-content: center; padding: 4px 6px; border-radius: 6px; border: 1px solid var(--border-subtle); background: var(--bg-card); color: var(--text-secondary); cursor: pointer; }
        .icon-btn:hover { color: var(--accent-primary); border-color: var(--accent-primary); }
        .icon-btn.danger:hover { color: #f87171; border-color: #f87171; }

        .edit-form { display: flex; flex-direction: column; gap: 12px; }
        .edit-form-group { display: flex; flex-direction: column; gap: 4px; }
        .edit-label { font-size: 12px; font-weight: 600; color: var(--text-secondary); }
        .edit-required { color: #f87171; }
        .edit-input { padding: 9px 12px; border: 1px solid var(--border-default); border-radius: 8px; background: var(--bg-secondary); color: var(--text-primary); font-size: 13px; font-family: inherit; }
        .edit-input:focus { outline: none; border-color: var(--accent-primary); background: var(--bg-card); }
        .edit-textarea { resize: vertical; min-height: 80px; }
        .edit-form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .edit-actions { display: flex; gap: 10px; margin-top: 4px; }
        .edit-range { width: 100%; accent-color: var(--accent-primary); }
        .lt-input-error { border-color: #f87171 !important; background: rgba(248, 113, 113, 0.04) !important; }
        .lt-field-error { display: flex; align-items: center; gap: 5px; font-size: 11.5px; font-weight: 500; color: #f87171; margin-top: 4px; }

        .lt-picker-trigger { display: flex; align-items: center; gap: 8px; min-height: 42px; padding: 8px 12px; border-radius: 9px; border: 1px solid var(--border-default); background: var(--bg-secondary); cursor: pointer; }
        .lt-picker-chip { display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; background: var(--bg-card); border: 1px solid var(--border-subtle); border-radius: 20px; font-size: 12px; }
        .lt-picker-chip button { background: transparent; border: none; color: var(--text-muted); cursor: pointer; }
        .lt-picker-placeholder { color: var(--text-muted); font-size: 13px; flex: 1; }
        .lt-picker-chevron { margin-left: auto; color: var(--text-muted); transition: transform 0.15s; }
        .lt-picker-chevron.rotate { transform: rotate(180deg); }
        .lt-picker-backdrop { position: fixed; inset: 0; z-index: 10000; }
        .lt-picker-dropdown { background: var(--bg-card); border: 1px solid var(--border-default); border-radius: 12px; box-shadow: 0 16px 40px rgba(0, 0, 0, 0.28); overflow: hidden; display: flex; flex-direction: column; }
        .lt-picker-search { display: flex; align-items: center; gap: 8px; padding: 10px 12px; border-bottom: 1px solid var(--border-subtle); }
        .lt-picker-search input { flex: 1; border: none; outline: none; background: transparent; font-size: 13px; color: var(--text-primary); }
        .lt-picker-search button { background: transparent; border: none; color: var(--text-muted); cursor: pointer; }
        .lt-picker-list { overflow-y: auto; padding: 6px; }
        .lt-picker-option { display: flex; align-items: center; gap: 10px; width: 100%; padding: 8px 10px; border: none; background: transparent; border-radius: 8px; cursor: pointer; color: var(--text-primary); }
        .lt-picker-option:hover { background: var(--bg-secondary); }
        .lt-picker-option.selected { background: color-mix(in srgb, var(--accent-primary) 10%, transparent); }
        .lt-picker-check { color: var(--accent-primary); }
        .lt-picker-empty { padding: 20px; text-align: center; font-size: 13px; color: var(--text-muted); }

        .sidebar-card { background: var(--bg-card); border: 1px solid var(--border-subtle); border-radius: 14px; padding: 16px 18px; }
        .sidebar-card-title { display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 700; color: var(--text-primary); margin: 0 0 12px; }
        .detail-item { display: flex; align-items: center; gap: 12px; padding: 8px 0; border-bottom: 1px solid var(--border-subtle); }
        .detail-item:last-child { border-bottom: none; }
        .detail-icon { width: 30px; height: 30px; border-radius: 8px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
        .detail-content { flex: 1; min-width: 0; }
        .detail-label { display: block; font-size: 10px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; }
        .detail-value { display: block; font-size: 13px; font-weight: 500; color: var(--text-primary); }
        .detail-status-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 6px; }
        .project-name { font-size: 14px; font-weight: 600; color: var(--text-primary); margin: 0 0 4px; }
        .project-desc { font-size: 12px; color: var(--text-muted); margin: 0 0 12px; }
        .sidebar-action-btn { display: flex; align-items: center; justify-content: center; gap: 6px; width: 100%; padding: 8px 12px; border: 1px solid var(--border-default); border-radius: 8px; background: var(--bg-secondary); color: var(--text-secondary); font-size: 12px; font-weight: 500; cursor: pointer; }
        .sidebar-action-btn:hover { border-color: var(--accent-primary); color: var(--accent-primary); }

        @media (max-width: 1024px) { .task-detail-right { width: 280px; } }
        @media (max-width: 768px) {
          .task-detail-page { flex-direction: column; padding: 16px; }
          .task-detail-right { width: 100%; }
          .task-header { flex-direction: column; }
          .task-meta-grid { grid-template-columns: 1fr 1fr; }
          .edit-form-row { grid-template-columns: 1fr; }
        }
      `}</style>
    </div>
  );
}