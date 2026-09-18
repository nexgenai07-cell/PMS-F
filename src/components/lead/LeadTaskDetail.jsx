// components/lead/LeadTaskDetail.jsx
import { useState, useEffect, useMemo, useRef } from "react";
import { useParams, useNavigate, useOutletContext } from "react-router-dom";
import {
  ArrowLeft, MessageSquare, Users, CheckCircle2,
  Pencil, Trash2, X, Pin, PinOff, RefreshCw,
  Loader2, User, Calendar, Flag, AlertCircle,
  FolderKanban, Send, Sparkles, TrendingUp, Clock,
  Target, ChevronDown, Check, Search
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import toast from "react-hot-toast";

import Topbar from "../shared/Topbar";
import { Avatar, StatusBadge, PriorityBadge } from "../shared/UIComponents";
import projectService from "../../services/projectService";
import taskService from "../../services/taskService";
import teamService from "../../services/teamService";
import commentService from "../../services/commentService";
import { useAuth } from "../../context/AuthContext";
import NotificationHelper from '../../services/notificationHelper';

/* ─────────── Validation constants ─────────── */
const LIMITS = {
  title:   { min: 3, max: 200 },
  desc:    { max: 2000 },
  comment: { min: 1, max: 1000 },
  progress:{ min: 0, max: 100 },
};

const TITLE_REGEX = /^[\p{L}\p{N} &\-.'(),!?]+$/u;

const PRIORITY_OPTIONS = ["low", "medium", "high", "critical"];
const STATUS_OPTIONS = ["todo", "in_progress", "review", "done", "cancelled"];

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

/* ─────────── Validators ─────────── */
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

/* ─── Assignee picker ─── */
function AssigneePicker({ value, onChange, members = [], disabled = false }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [dropdownStyle, setDropdownStyle] = useState({});
  const triggerRef = useRef(null);
  const inputRef = useRef(null);

  const selected = members.find(m => String(m.id) === String(value));

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return members;
    return members.filter(m =>
      (m.name || '').toLowerCase().includes(q) ||
      (m.role || '').toLowerCase().includes(q)
    );
  }, [members, query]);

  const updatePosition = () => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    setDropdownStyle({
      position: 'fixed',
      left: rect.left,
      width: rect.width,
      top: rect.bottom + 6,
      maxHeight: Math.min(spaceBelow - 12, 300),
      zIndex: 10001,
    });
  };

  useEffect(() => {
    if (!open) return;
    updatePosition();
    const onScrollOrResize = () => updatePosition();
    window.addEventListener('resize', onScrollOrResize);
    window.addEventListener('scroll', onScrollOrResize, true);
    return () => {
      window.removeEventListener('resize', onScrollOrResize);
      window.removeEventListener('scroll', onScrollOrResize, true);
    };
  }, [open]);

  useEffect(() => {
    if (open) {
      const t = setTimeout(() => inputRef.current?.focus(), 40);
      return () => clearTimeout(t);
    }
    setQuery('');
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open]);

  const handleSelect = (member) => {
    onChange(member ? String(member.id) : '');
    setOpen(false);
  };

  return (
    <div className="lt-picker">
      <button
        ref={triggerRef}
        type="button"
        className={`lt-picker-trigger ${open ? 'open' : ''} ${selected ? 'has-value' : ''}`}
        onClick={() => !disabled && setOpen(o => !o)}
        disabled={disabled}
      >
        {selected ? (
          <span className="lt-picker-selected">
            <Avatar name={selected.name} size="sm" />
            <span className="lt-picker-name">{selected.name}</span>
            {selected.role && <span className="lt-picker-role">{selected.role}</span>}
          </span>
        ) : (
          <span className="lt-picker-placeholder">Unassigned</span>
        )}
        <ChevronDown size={14} className={`lt-picker-chevron ${open ? 'rotate' : ''}`} />
      </button>

      {open && (
        <>
          <div className="lt-picker-backdrop" onClick={() => setOpen(false)} />
          <div className="lt-picker-dropdown" style={dropdownStyle}>
            <div className="lt-picker-search">
              <Search size={14} />
              <input
                ref={inputRef}
                type="text"
                placeholder="Search members..."
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
                <button type="button" className="lt-picker-clear" onClick={() => setQuery('')}>
                  <X size={12} />
                </button>
              )}
            </div>
            <div className="lt-picker-list">
              <button
                type="button"
                className={`lt-picker-option ${!value ? 'selected' : ''}`}
                onClick={() => handleSelect(null)}
              >
                <span className="lt-picker-option-empty">Unassigned</span>
                {!value && <Check size={14} className="lt-picker-check" />}
              </button>
              {filtered.length === 0 ? (
                <div className="lt-picker-empty">No members match your search</div>
              ) : (
                filtered.map((m) => {
                  const isSelected = String(value) === String(m.id);
                  return (
                    <button
                      key={m.id}
                      type="button"
                      className={`lt-picker-option ${isSelected ? 'selected' : ''}`}
                      onClick={() => handleSelect(m)}
                    >
                      <Avatar name={m.name} size="sm" />
                      <span className="lt-picker-option-body">
                        <span className="lt-picker-option-name">{m.name}</span>
                        {m.role && <span className="lt-picker-option-role">{m.role}</span>}
                      </span>
                      {isSelected && <Check size={14} className="lt-picker-check" />}
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

export default function LeadTaskDetail() {
  const { id, taskId } = useParams();
  const navigate = useNavigate();
  const { onMenuClick } = useOutletContext();
  const { user } = useAuth();

  const projectId = parseInt(id);
  const tId = parseInt(taskId);

  /* Data */
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [project, setProject] = useState(null);
  const [task, setTask] = useState(null);
  const [assignee, setAssignee] = useState(null);
  const [teamMembers, setTeamMembers] = useState([]);
  const [comments, setComments] = useState([]);

  /* Comment composer */
  const [newComment, setNewComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [commentTouched, setCommentTouched] = useState(false);

  /* Edit mode */
  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState({
    title: "", desc: "", status: "todo", priority: "medium",
    assignTo: null, progress: 0,
  });
  const [editTouched, setEditTouched] = useState({});
  const [editSubmitAttempted, setEditSubmitAttempted] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);

  const editTitleRef = useRef(null);

  /* ─── Derived errors ─── */
  const editErrors = useMemo(() => ({
    title: validators.title(editForm.title),
    desc: validators.desc(editForm.desc),
    status: validators.status(editForm.status),
    priority: validators.priority(editForm.priority),
    progress: validators.progress(editForm.progress),
  }), [editForm]);

  const commentError = validators.comment(newComment);
  const isEditValid = Object.values(editErrors).every(e => e === '');

  const markEditTouched = (field) => setEditTouched(prev => ({ ...prev, [field]: true }));
  const showEditError = (field) => {
    if (editSubmitAttempted) return editErrors[field];
    return editTouched[field] ? editErrors[field] : '';
  };

  /* ─── Fetch ─── */
  useEffect(() => { fetchTaskData(); }, [projectId, tId]);

  const fetchTaskData = async () => {
    try {
      setLoading(true);
      const [projectData, taskData, membersData] = await Promise.all([
        projectService.getProject(projectId),
        taskService.getTask(tId),
        teamService.getTeamMembers(),
      ]);

      const projectItem = projectData?.data || projectData;
      const taskItem = taskData?.data || taskData;
      const membersList = membersData?.data || membersData || [];

      setProject(projectItem);
      setTask(taskItem);
      setTeamMembers(membersList);

      if (taskItem?.assign_to) {
        const found = membersList.find(m => Number(m.id) === Number(taskItem.assign_to));
        setAssignee(found);
      } else {
        setAssignee(null);
      }

      if (taskItem) {
        setEditForm({
          title: taskItem.title || "",
          desc: taskItem.desc || taskItem.description || "",
          status: taskItem.status || "todo",
          priority: taskItem.priority || "medium",
          assignTo: taskItem.assign_to || null,
          progress: Number(taskItem.progress) || 0,
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
      console.error("Error fetching task data:", error);
      toast.error("Failed to load task details");
      if (error?.response?.status === 404 || error?.status === 404) {
        navigate(`/lead/projects/${projectId}`);
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

      try {
        await NotificationHelper.commentAdded(newC, user);
      } catch (notifyErr) {
        console.warn('Notification failed:', notifyErr);
      }

      setComments([newC, ...comments]);
      setNewComment("");
      setCommentTouched(false);
      toast.success("Comment added successfully");
    } catch (error) {
      console.error("Error adding comment:", error);
      const rawMsg = error?.response?.data?.message ||
                     error?.response?.data?.detail ||
                     error?.message;
      toast.error(typeof rawMsg === 'string' ? rawMsg : 'Failed to add comment');
    } finally {
      setSubmitting(false);
    }
  };

  const togglePin = async (commentId) => {
    try {
      const response = await commentService.togglePin(commentId);
      const updatedComment = response?.data || response;

      if (updatedComment.pin) {
        try {
          await NotificationHelper.commentPinned(updatedComment, user);
        } catch (notifyErr) {
          console.warn('Notification failed:', notifyErr);
        }
      }

      setComments(prev =>
        prev.map(c => (c.c_id || c.id) === commentId ? { ...c, pin: updatedComment.pin || !c.pin } : c)
      );
      toast.success(updatedComment.pin ? "Comment pinned" : "Comment unpinned");
    } catch (error) {
      console.error("Error toggling pin:", error);
      toast.error("Failed to update pin");
    }
  };

  const deleteComment = async (commentId) => {
    if (!window.confirm("Are you sure you want to delete this comment?")) return;
    try {
      await commentService.deleteComment(commentId);
      setComments(prev => prev.filter(c => (c.c_id || c.id) !== commentId));
      toast.success("Comment deleted successfully");
    } catch (error) {
      console.error("Error deleting comment:", error);
      toast.error("Failed to delete comment");
    }
  };

  /* ─── Task update ─── */
  const handleUpdateTask = async () => {
    setEditSubmitAttempted(true);

    if (!isEditValid) {
      toast.error('Please fix the highlighted errors before saving');
      return;
    }
    if (savingEdit) return;

    setSavingEdit(true);
    try {
      const previousAssignee = task?.assign_to;
      const assignTo = editForm.assignTo ? Number(editForm.assignTo) : null;

      const response = await taskService.updateTask(tId, {
        title: editForm.title.trim(),
        description: (editForm.desc || '').trim(),
        status: editForm.status,
        priority: editForm.priority,
        progress: Number(editForm.progress) || 0,
        assignTo: assignTo,
      });

      const updatedTask = response?.data || response;
      setTask(updatedTask);

      try {
        await NotificationHelper.taskUpdated(updatedTask, user);
        if (editForm.status === 'done' || editForm.status === 'completed') {
          await NotificationHelper.taskCompleted(updatedTask, user);
        }
        if (assignTo && Number(previousAssignee) !== Number(assignTo)) {
          const assigneeObj = teamMembers.find(m => Number(m.id) === Number(assignTo));
          if (assigneeObj) {
            await NotificationHelper.taskAssigned(updatedTask, assigneeObj, user, project);
            toast.success(`Task assigned to ${assigneeObj.name} and notification sent!`);
          }
        }
      } catch (notifyErr) {
        console.warn('Notification failed:', notifyErr);
      }

      if (updatedTask.assign_to) {
        const found = teamMembers.find(m => Number(m.id) === Number(updatedTask.assign_to));
        setAssignee(found);
      } else {
        setAssignee(null);
      }

      // Sync editForm to saved values
      setEditForm({
        title: updatedTask.title || '',
        desc: updatedTask.desc || updatedTask.description || '',
        status: updatedTask.status || 'todo',
        priority: updatedTask.priority || 'medium',
        assignTo: updatedTask.assign_to || null,
        progress: Number(updatedTask.progress) || 0,
      });

      setEditTouched({});
      setEditSubmitAttempted(false);
      setEditMode(false);
      toast.success("Task updated successfully");
    } catch (error) {
      console.error("Error updating task:", error);
      const rawMsg = error?.response?.data?.message ||
                     error?.response?.data?.detail ||
                     error?.message;
      toast.error(typeof rawMsg === 'string' ? rawMsg : 'Failed to update task');
    } finally {
      setSavingEdit(false);
    }
  };

  /* ─── Helpers ─── */
  const getMemberName = (memberId) => {
    if (!memberId) return "Unassigned";
    const member = teamMembers.find(m => Number(m.id) === Number(memberId));
    return member ? member.name : "Unassigned";
  };

  /* ─── Escape to close edit ─── */
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

  /* ─── Loading ─── */
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
            <p>The task you're looking for doesn't exist or you don't have access.</p>
            <button className="btn btn-primary" onClick={() => navigate(`/lead/projects/${projectId}`)}>
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
            <button
              className="btn btn-secondary btn-sm refresh-btn"
              onClick={handleRefresh}
              disabled={refreshing}
            >
              <RefreshCw size={14} className={refreshing ? 'spin' : ''} />
              {refreshing ? 'Refreshing...' : 'Refresh'}
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
          <button className="back-button" onClick={() => navigate(`/lead/projects/${projectId}`)}>
            <ArrowLeft size={16} /><span>Back to Project</span>
          </button>

          <div className="task-content-card">
            {editMode ? (
              <motion.div className="edit-form" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
                <div className="edit-form-group">
                  <label className="edit-label">Title <span className="edit-required">*</span></label>
                  <input
                    ref={editTitleRef}
                    className={`edit-input ${showEditError('title') ? 'lt-input-error' : ''}`}
                    value={editForm.title}
                    maxLength={LIMITS.title.max}
                    onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                    onBlur={(e) => {
                      const t = e.target.value.trim();
                      if (t !== e.target.value) setEditForm(prev => ({ ...prev, title: t }));
                      markEditTouched('title');
                    }}
                    placeholder="Enter task title"
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
                    onChange={(e) => setEditForm({ ...editForm, desc: e.target.value })}
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
                    <select
                      className="edit-input"
                      value={editForm.status}
                      onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                      onBlur={() => markEditTouched('status')}
                      disabled={savingEdit}
                    >
                      {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{getStatusLabel(s)}</option>)}
                    </select>
                    <FieldError message={showEditError('status')} />
                  </div>
                  <div className="edit-form-group">
                    <label className="edit-label">Priority</label>
                    <select
                      className="edit-input"
                      value={editForm.priority}
                      onChange={(e) => setEditForm({ ...editForm, priority: e.target.value })}
                      onBlur={() => markEditTouched('priority')}
                      disabled={savingEdit}
                    >
                      {PRIORITY_OPTIONS.map((p) => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
                    </select>
                    <FieldError message={showEditError('priority')} />
                  </div>
                </div>

                <div className="edit-form-group">
                  <label className="edit-label">Assign To</label>
                  <AssigneePicker
                    value={editForm.assignTo}
                    onChange={(id) => setEditForm({ ...editForm, assignTo: id ? Number(id) : null })}
                    members={teamMembers}
                    disabled={savingEdit}
                  />
                </div>

                <div className="edit-form-group">
                  <label className="edit-label">
                    Progress: <strong>{editForm.progress}%</strong>
                  </label>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={editForm.progress}
                    className="edit-range"
                    onChange={(e) => setEditForm({ ...editForm, progress: Number(e.target.value) })}
                    disabled={savingEdit}
                  />
                  <FieldError message={showEditError('progress')} />
                </div>

                <div className="edit-actions">
                  <button className="btn btn-primary btn-sm" onClick={handleUpdateTask} disabled={savingEdit}>
                    {savingEdit ? <><Loader2 size={14} className="spin" /> Saving...</> : <><CheckCircle2 size={14} /> Save Changes</>}
                  </button>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => {
                      setEditMode(false);
                      setEditTouched({});
                      setEditSubmitAttempted(false);
                    }}
                    disabled={savingEdit}
                  >
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
                      <span className="task-meta-label">Assignee</span>
                      <span className="task-meta-value">{getMemberName(task.assign_to)}</span>
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
                        <span className="task-meta-label">Due Date</span>
                        <span className="task-meta-value">{new Date(task.due_date).toLocaleDateString()}</span>
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
                transition={{ duration: 0.6, ease: "easeOut" }}
                style={{ background: task.progress >= 70 ? '#34d399' : task.progress >= 40 ? '#f59e0b' : '#f87171' }}
              />
            </div>
          </div>

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
                    if (e.key === 'Enter' && e.ctrlKey) {
                      e.preventDefault();
                      handleAddComment();
                    }
                  }}
                  disabled={submitting}
                />
              </div>
              {commentTouched && commentError && newComment.length > 0 && (
                <FieldError message={commentError} />
              )}
              <button
                className="send-comment-btn"
                onClick={handleAddComment}
                disabled={submitting || !newComment.trim()}
              >
                {submitting ? <Loader2 size={16} className="spin" /> : <Send size={16} />}
                {submitting ? 'Sending...' : 'Send'}
              </button>
            </div>

            <div className="comment-list">
              {sortedComments.length === 0 ? (
                <div className="comment-empty">
                  <MessageSquare size={32} style={{ opacity: 0.3 }} />
                  <p>No comments yet</p>
                  <span>Be the first to share your thoughts</span>
                </div>
              ) : (
                <AnimatePresence>
                  {sortedComments.map((c) => {
                    const commentId = c.c_id || c.id;
                    const isPinned = c.pin || c.pinned;
                    return (
                      <motion.div
                        key={commentId}
                        className={`comment-item ${isPinned ? 'pinned' : ''}`}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ duration: 0.2 }}
                      >
                        {isPinned && (
                          <div className="pin-badge"><Pin size={10} /> Pinned</div>
                        )}
                        <div className="comment-header">
                          <div className="comment-user">
                            <Avatar name={c.u_name || 'User'} size="sm" />
                            <div>
                              <p className="comment-username">{c.u_name || 'User'}</p>
                              <p className="comment-role">Member</p>
                            </div>
                          </div>
                          <div className="comment-actions">
                            <button className="icon-btn" onClick={() => togglePin(commentId)} title={isPinned ? "Unpin" : "Pin"}>
                              {isPinned ? <PinOff size={12} /> : <Pin size={12} />}
                            </button>
                            <button className="icon-btn danger" onClick={() => deleteComment(commentId)} title="Delete">
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </div>
                        <p className="comment-content">{c.desc || c.content}</p>
                        <p className="comment-time">
                          {c.created_at ? new Date(c.created_at).toLocaleString() : 'Just now'}
                        </p>
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
              <div className="detail-icon" style={{ background: 'rgba(129, 140, 248, 0.12)', color: '#818cf8' }}>
                <Flag size={14} />
              </div>
              <div className="detail-content">
                <span className="detail-label">Status</span>
                <span className="detail-value">
                  <span className="detail-status-dot" style={{ background: taskStatusColor }} />
                  {taskStatusLabel}
                </span>
              </div>
            </div>

            <div className="detail-item">
              <div className="detail-icon" style={{ background: 'rgba(245, 158, 11, 0.12)', color: '#f59e0b' }}>
                <AlertCircle size={14} />
              </div>
              <div className="detail-content">
                <span className="detail-label">Priority</span>
                <span className="detail-value"><PriorityBadge priority={task.priority} /></span>
              </div>
            </div>

            <div className="detail-item">
              <div className="detail-icon" style={{ background: 'rgba(52, 211, 153, 0.12)', color: '#34d399' }}>
                <User size={14} />
              </div>
              <div className="detail-content">
                <span className="detail-label">Assignee</span>
                <span className="detail-value">{getMemberName(task.assign_to)}</span>
              </div>
            </div>

            {task.due_date && (
              <div className="detail-item">
                <div className="detail-icon" style={{ background: 'rgba(245, 158, 11, 0.12)', color: '#f59e0b' }}>
                  <Calendar size={14} />
                </div>
                <div className="detail-content">
                  <span className="detail-label">Due Date</span>
                  <span className="detail-value">{new Date(task.due_date).toLocaleDateString()}</span>
                </div>
              </div>
            )}

            {task.start_date && (
              <div className="detail-item">
                <div className="detail-icon" style={{ background: 'rgba(129, 140, 248, 0.12)', color: '#818cf8' }}>
                  <Clock size={14} />
                </div>
                <div className="detail-content">
                  <span className="detail-label">Start Date</span>
                  <span className="detail-value">{new Date(task.start_date).toLocaleDateString()}</span>
                </div>
              </div>
            )}
          </div>

          <div className="sidebar-card">
            <h4 className="sidebar-card-title"><FolderKanban size={14} />Project</h4>
            <p className="project-name">{project.p_name || project.name}</p>
            <p className="project-desc">{project.desc || 'No description'}</p>
            <button className="sidebar-action-btn" onClick={() => navigate(`/lead/projects/${projectId}`)}>
              <FolderKanban size={14} /> View Project Details
            </button>
          </div>

          <div className="sidebar-card">
            <h4 className="sidebar-card-title">
              <Users size={14} />Team Members
              <span className="team-count">{teamMembers.length}</span>
            </h4>
            <div className="team-list">
              {teamMembers.slice(0, 5).map((m) => (
                <div key={m.id} className="team-item">
                  <Avatar name={m.name} size="sm" />
                  <div className="team-item-info">
                    <span className="team-item-name">{m.name}</span>
                    <span className="team-item-role">{m.role || 'Member'}</span>
                  </div>
                </div>
              ))}
              {teamMembers.length > 5 && (
                <p className="team-more">+{teamMembers.length - 5} more members</p>
              )}
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .spin { animation: spin 1s linear infinite; }

        .loading-spinner-wrapper { display: flex; justify-content: center; align-items: center; height: 400px; }
        .loading-spinner {
          width: 40px; height: 40px;
          border: 3px solid var(--border-subtle);
          border-top-color: var(--accent-primary);
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }
        .not-found-container { text-align: center; padding: 60px 20px; color: var(--text-muted); }
        .not-found-container h2 { font-size: 24px; font-weight: 700; color: var(--text-primary); margin: 16px 0 8px; }
        .not-found-container p { margin-bottom: 20px; }

        .task-title-text { display: flex; align-items: center; gap: 12px; }
        .task-title-main {
          max-width: 300px; white-space: nowrap;
          overflow: hidden; text-overflow: ellipsis;
        }
        .task-title-badge {
          font-size: 10px; font-weight: 700;
          padding: 3px 10px; border-radius: 20px;
          color: #fff; text-transform: uppercase;
          letter-spacing: 0.3px; flex-shrink: 0;
        }
        .topbar-actions { display: flex; gap: 8px; }
        .refresh-btn { display: flex; align-items: center; gap: 6px; }

        .task-detail-page {
          display: flex; gap: 24px;
          padding: 24px;
          min-height: calc(100vh - 56px);
          background: var(--bg-primary);
        }
        .task-detail-left { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 16px; }
        .task-detail-right { width: 320px; flex-shrink: 0; display: flex; flex-direction: column; gap: 12px; }

        .back-button {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 6px 12px; border: none; border-radius: 8px;
          background: var(--bg-secondary); color: var(--text-secondary);
          font-size: 12px; font-weight: 500; cursor: pointer;
          transition: all 0.15s; width: fit-content;
        }
        .back-button:hover { background: var(--bg-hover); color: var(--accent-primary); }

        .task-content-card {
          background: var(--bg-card); border: 1px solid var(--border-subtle);
          border-radius: 14px; padding: 24px; transition: all 0.2s ease;
        }
        .task-content-card:hover { border-color: var(--border-default); }
        .task-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; }
        .task-header-left { flex: 1; min-width: 0; }
        .task-title-display { font-size: 22px; font-weight: 800; color: var(--text-primary); margin: 0 0 4px; }
        .task-description { font-size: 14px; color: var(--text-secondary); line-height: 1.6; margin: 0; }
        .task-header-right { flex-shrink: 0; }
        .task-badges { display: flex; gap: 6px; flex-wrap: wrap; }
        .task-badge {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 4px 12px; border-radius: 20px;
          font-size: 11px; font-weight: 600; color: #fff;
        }
        .task-badge-dot { width: 6px; height: 6px; border-radius: 50%; }

        .task-meta-grid {
          display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
          gap: 12px; margin-top: 16px; padding-top: 16px;
          border-top: 1px solid var(--border-subtle);
        }
        .task-meta-item { display: flex; align-items: center; gap: 10px; }
        .task-meta-icon { color: var(--text-muted); flex-shrink: 0; }
        .task-meta-label {
          display: block; font-size: 10px; font-weight: 600;
          color: var(--text-muted); text-transform: uppercase;
          letter-spacing: 0.3px;
        }
        .task-meta-value { display: block; font-size: 13px; font-weight: 600; color: var(--text-primary); }

        .progress-card {
          background: var(--bg-card); border: 1px solid var(--border-subtle);
          border-radius: 14px; padding: 16px 20px;
        }
        .progress-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
        .progress-title { font-size: 13px; font-weight: 600; color: var(--text-secondary); display: flex; align-items: center; }
        .progress-percentage { font-size: 14px; font-weight: 700; }
        .progress-track { width: 100%; height: 8px; background: var(--border-subtle); border-radius: 10px; overflow: hidden; }
        .progress-fill { height: 100%; border-radius: 10px; transition: width 0.6s ease; }

        .comments-card { background: var(--bg-card); border: 1px solid var(--border-subtle); border-radius: 14px; padding: 20px 24px; }
        .comments-header { display: flex; align-items: center; margin-bottom: 16px; }
        .comments-title {
          display: flex; align-items: center; gap: 8px;
          font-size: 15px; font-weight: 700;
          color: var(--text-primary); margin: 0;
        }
        .comments-count {
          font-size: 11px; font-weight: 600; color: var(--text-muted);
          background: var(--bg-secondary);
          padding: 1px 10px; border-radius: 20px; margin-left: 4px;
        }
        .comment-input-wrapper { margin-bottom: 16px; }
        .comment-input-container {
          display: flex; gap: 10px;
          padding: 10px 12px;
          background: var(--bg-secondary);
          border: 1px solid var(--border-default);
          border-radius: 10px; transition: border-color 0.2s;
        }
        .comment-input-container:focus-within {
          border-color: var(--accent-primary);
          background: var(--bg-card);
        }
        .comment-input {
          flex: 1; border: none; outline: none;
          background: transparent; color: var(--text-primary);
          font-size: 13px; resize: vertical;
          font-family: inherit; min-height: 40px;
        }
        .comment-input::placeholder { color: var(--text-muted); }
        .send-comment-btn {
          display: flex; align-items: center; gap: 6px;
          padding: 8px 16px; border: none; border-radius: 8px;
          background: var(--accent-primary); color: #fff;
          font-size: 13px; font-weight: 600; cursor: pointer;
          transition: all 0.15s; margin-top: 8px; align-self: flex-end;
        }
        .send-comment-btn:hover:not(:disabled) { opacity: 0.85; transform: translateY(-1px); }
        .send-comment-btn:disabled { opacity: 0.5; cursor: not-allowed; }

        .comment-list { display: flex; flex-direction: column; gap: 10px; }
        .comment-empty { text-align: center; padding: 24px 0; color: var(--text-muted); }
        .comment-empty p { font-size: 14px; font-weight: 500; margin: 8px 0 4px; }
        .comment-empty span { font-size: 12px; }
        .comment-item {
          padding: 12px 14px;
          border: 1px solid var(--border-subtle);
          border-radius: 10px;
          background: var(--bg-secondary);
          transition: all 0.15s;
        }
        .comment-item.pinned {
          border-color: var(--accent-primary);
          background: color-mix(in srgb, var(--accent-primary) 5%, var(--bg-secondary));
        }
        .pin-badge {
          display: flex; align-items: center; gap: 4px;
          font-size: 10px; font-weight: 700; color: var(--accent-primary);
          text-transform: uppercase; letter-spacing: 0.4px;
          margin-bottom: 6px;
        }
        .comment-header {
          display: flex; justify-content: space-between;
          align-items: flex-start; margin-bottom: 6px;
        }
        .comment-user { display: flex; align-items: center; gap: 8px; }
        .comment-username { font-weight: 600; font-size: 13px; color: var(--text-primary); margin: 0; }
        .comment-role { font-size: 11px; color: var(--text-muted); margin: 0; }
        .comment-content {
          font-size: 13px; color: var(--text-secondary);
          line-height: 1.6; margin: 4px 0; white-space: pre-wrap;
        }
        .comment-time { font-size: 11px; color: var(--text-muted); margin: 4px 0 0; }
        .comment-actions { display: flex; gap: 4px; flex-shrink: 0; }

        .icon-btn {
          display: inline-flex; align-items: center; justify-content: center;
          padding: 4px 6px; border-radius: 6px;
          border: 1px solid var(--border-subtle);
          background: var(--bg-card); color: var(--text-secondary);
          cursor: pointer; transition: all 0.14s; font-size: 12px;
        }
        .icon-btn:hover {
          background: var(--bg-primary);
          color: var(--accent-primary);
          border-color: var(--accent-primary);
        }
        .icon-btn.danger:hover {
          color: #f87171; border-color: #f87171;
          background: rgba(248, 113, 113, 0.06);
        }

        /* ─── EDIT FORM ─── */
        .edit-form { display: flex; flex-direction: column; gap: 12px; }
        .edit-form-group { display: flex; flex-direction: column; gap: 4px; }
        .edit-label { font-size: 12px; font-weight: 600; color: var(--text-secondary); }
        .edit-required { color: #f87171; }
        .edit-input {
          padding: 9px 12px;
          border: 1px solid var(--border-default);
          border-radius: 8px;
          background: var(--bg-secondary);
          color: var(--text-primary);
          font-size: 13px;
          transition: all 0.2s;
          font-family: inherit;
        }
        .edit-input:focus {
          border-color: var(--accent-primary);
          background: var(--bg-card);
          outline: none;
          box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.08);
        }
        .edit-textarea { resize: vertical; min-height: 80px; }
        .edit-form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .edit-actions { display: flex; gap: 10px; margin-top: 4px; }
        .edit-range { width: 100%; accent-color: var(--accent-primary); cursor: pointer; }

        .lt-input-error {
          border-color: #f87171 !important;
          background: rgba(248, 113, 113, 0.04) !important;
        }
        .lt-input-error:focus {
          box-shadow: 0 0 0 3px rgba(248, 113, 113, 0.12) !important;
        }
        .lt-field-error {
          display: flex; align-items: center; gap: 5px;
          font-size: 11.5px; font-weight: 500;
          color: #f87171; margin-top: 4px;
        }

        /* ─── SIDEBAR ─── */
        .sidebar-card {
          background: var(--bg-card); border: 1px solid var(--border-subtle);
          border-radius: 14px; padding: 16px 18px;
        }
        .sidebar-card-title {
          display: flex; align-items: center; gap: 8px;
          font-size: 13px; font-weight: 700;
          color: var(--text-primary); margin: 0 0 12px;
        }
        .detail-item {
          display: flex; align-items: center; gap: 12px;
          padding: 8px 0;
          border-bottom: 1px solid var(--border-subtle);
        }
        .detail-item:last-child { border-bottom: none; }
        .detail-icon {
          width: 30px; height: 30px; border-radius: 8px;
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
        }
        .detail-content { flex: 1; min-width: 0; }
        .detail-label {
          display: block; font-size: 10px; font-weight: 600;
          color: var(--text-muted); text-transform: uppercase;
          letter-spacing: 0.3px;
        }
        .detail-value { display: block; font-size: 13px; font-weight: 500; color: var(--text-primary); }
        .detail-status-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 6px; vertical-align: middle; }

        .project-name { font-size: 14px; font-weight: 600; color: var(--text-primary); margin: 0 0 4px; }
        .project-desc { font-size: 12px; color: var(--text-muted); margin: 0 0 12px; line-height: 1.5; }
        .sidebar-action-btn {
          display: flex; align-items: center; justify-content: center; gap: 6px;
          width: 100%; padding: 8px 12px;
          border: 1px solid var(--border-default);
          border-radius: 8px;
          background: var(--bg-secondary);
          color: var(--text-secondary);
          font-size: 12px; font-weight: 500;
          cursor: pointer; transition: all 0.15s;
        }
        .sidebar-action-btn:hover {
          border-color: var(--accent-primary);
          color: var(--accent-primary);
          background: var(--bg-card);
        }
        .team-count {
          margin-left: auto; font-size: 11px; font-weight: 600;
          color: var(--text-muted);
          background: var(--bg-secondary);
          padding: 1px 10px; border-radius: 20px;
        }
        .team-list { display: flex; flex-direction: column; gap: 6px; }
        .team-item {
          display: flex; align-items: center; gap: 10px;
          padding: 6px 8px; border-radius: 8px;
          transition: background 0.15s;
        }
        .team-item:hover { background: var(--bg-secondary); }
        .team-item-info { flex: 1; min-width: 0; }
        .team-item-name { display: block; font-size: 13px; font-weight: 500; color: var(--text-primary); }
        .team-item-role { display: block; font-size: 11px; color: var(--text-muted); }
        .team-more { font-size: 12px; color: var(--text-muted); text-align: center; padding: 4px 0; }

        /* ─── ASSIGNEE PICKER ─── */
        .lt-picker { position: relative; width: 100%; }
        .lt-picker-trigger {
          display: flex; align-items: center; justify-content: space-between;
          gap: 8px; width: 100%; min-height: 42px;
          padding: 8px 12px; border-radius: 9px;
          border: 1px solid var(--border-default);
          background: var(--bg-secondary);
          color: var(--text-primary);
          font-size: 13px; font-family: inherit;
          cursor: pointer; text-align: left;
          transition: border-color 0.15s, background 0.15s, box-shadow 0.15s;
        }
        .lt-picker-trigger:hover:not(:disabled) {
          border-color: var(--border-strong);
          background: var(--bg-hover);
        }
        .lt-picker-trigger.open,
        .lt-picker-trigger:focus-visible {
          outline: none;
          border-color: var(--accent-primary);
          background: var(--bg-card);
          box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.08);
        }
        .lt-picker-trigger:disabled { opacity: 0.6; cursor: not-allowed; }
        .lt-picker-placeholder { color: var(--text-muted); font-size: 13px; }
        .lt-picker-selected { display: flex; align-items: center; gap: 8px; min-width: 0; flex: 1; }
        .lt-picker-name {
          font-weight: 500; color: var(--text-primary);
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .lt-picker-role {
          font-size: 10px; padding: 2px 8px; border-radius: 10px;
          background: var(--bg-secondary);
          border: 1px solid var(--border-subtle);
          color: var(--text-muted);
          font-weight: 600; flex-shrink: 0;
        }
        .lt-picker-chevron { flex-shrink: 0; color: var(--text-muted); transition: transform 0.2s; }
        .lt-picker-chevron.rotate { transform: rotate(180deg); }
        .lt-picker-backdrop { position: fixed; inset: 0; z-index: 10000; }
        .lt-picker-dropdown {
          background: var(--bg-card);
          border: 1px solid var(--border-default);
          border-radius: 12px;
          box-shadow: 0 16px 40px rgba(0, 0, 0, 0.28);
          overflow: hidden;
          display: flex; flex-direction: column;
          animation: lt-picker-in 0.15s ease;
        }
        @keyframes lt-picker-in {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .lt-picker-search {
          display: flex; align-items: center; gap: 8px;
          padding: 10px 12px;
          border-bottom: 1px solid var(--border-subtle);
          background: var(--bg-card);
          color: var(--text-muted);
          position: sticky; top: 0; z-index: 2;
        }
        .lt-picker-search input {
          flex: 1; border: none; background: transparent;
          outline: none; font-size: 13px;
          color: var(--text-primary); font-family: inherit;
          padding: 0; min-width: 0;
        }
        .lt-picker-search input::placeholder { color: var(--text-muted); }
        .lt-picker-clear {
          display: inline-flex; align-items: center; justify-content: center;
          width: 20px; height: 20px;
          border: none; border-radius: 50%;
          background: var(--bg-hover);
          color: var(--text-muted); cursor: pointer;
          transition: all 0.15s; flex-shrink: 0;
        }
        .lt-picker-clear:hover { background: var(--border-default); color: var(--text-primary); }
        .lt-picker-list {
          flex: 1; min-height: 0;
          overflow-y: auto; padding: 6px;
          scrollbar-width: thin; scrollbar-color: var(--border-default) transparent;
        }
        .lt-picker-list::-webkit-scrollbar { width: 6px; }
        .lt-picker-list::-webkit-scrollbar-thumb { background: var(--border-default); border-radius: 10px; }
        .lt-picker-option {
          display: flex; align-items: center; gap: 10px;
          width: 100%; padding: 8px 10px;
          border: none; border-radius: 8px;
          background: transparent;
          color: var(--text-primary);
          cursor: pointer; text-align: left;
          transition: background 0.12s;
          font-family: inherit;
        }
        .lt-picker-option:hover { background: var(--bg-secondary); }
        .lt-picker-option.selected { background: color-mix(in srgb, var(--accent-primary) 10%, transparent); }
        .lt-picker-option-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
        .lt-picker-option-name {
          font-size: 13px; font-weight: 500; color: var(--text-primary);
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .lt-picker-option-role { font-size: 11px; color: var(--text-muted); }
        .lt-picker-option-empty { font-size: 13px; color: var(--text-muted); font-style: italic; }
        .lt-picker-check { color: var(--accent-primary); flex-shrink: 0; }
        .lt-picker-empty { padding: 24px 16px; text-align: center; font-size: 13px; color: var(--text-muted); }

        /* ─── RESPONSIVE ─── */
        @media (max-width: 1024px) { .task-detail-right { width: 280px; } }
        @media (max-width: 768px) {
          .task-detail-page { flex-direction: column; padding: 16px; }
          .task-detail-right { width: 100%; }
          .task-header { flex-direction: column; }
          .task-title-display { font-size: 18px; }
          .task-meta-grid { grid-template-columns: 1fr 1fr; }
          .edit-form-row { grid-template-columns: 1fr; }
          .task-title-text { flex-direction: column; align-items: flex-start; gap: 4px; }
          .task-title-main { max-width: 200px; }
          .comment-input-container { flex-direction: column; }
          .send-comment-btn { align-self: stretch; }
        }
        @media (max-width: 480px) {
          .task-detail-page { padding: 10px; }
          .task-content-card { padding: 16px; }
          .comments-card { padding: 16px; }
          .task-meta-grid { grid-template-columns: 1fr; }
          .task-title-main { max-width: 150px; }
          .topbar-actions { flex-direction: column; gap: 4px; }
        }
      `}</style>
    </div>
  );
}