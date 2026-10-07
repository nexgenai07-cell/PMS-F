// components/lead/LeadNotifications.jsx
import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import {
  Bell, CheckCheck, RefreshCw, Trash2,
  UserPlus, FolderKanban, CheckCircle2,
  MessageSquare, Users, AlertCircle,
  UserCheck, PlusCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';

import Topbar from '../shared/Topbar';
import { useAuth } from '../../context/AuthContext';
import notificationService from '../../services/notificationService';
import projectService from '../../services/projectService';
import taskService from '../../services/taskService';
import teamService from '../../services/teamService';
import userService from '../../services/userService';

const NOTIFICATION_ICONS = {
  project_created: { icon: FolderKanban, color: '#818cf8' },
  project_updated: { icon: FolderKanban, color: '#818cf8' },
  project_deleted: { icon: FolderKanban, color: '#f87171' },
  task_created:    { icon: PlusCircle,   color: '#34d399' },
  task_updated:    { icon: CheckCircle2, color: '#34d399' },
  task_deleted:    { icon: Trash2,       color: '#f87171' },
  task_assigned:   { icon: UserCheck,    color: '#34d399' },
  task_completed:  { icon: CheckCircle2, color: '#34d399' },
  comment_added:   { icon: MessageSquare, color: '#f59e0b' },
  comment_pinned:  { icon: MessageSquare, color: '#f59e0b' },
  member_added:    { icon: UserPlus,     color: '#34d399' },
  team_updated:    { icon: Users,        color: '#2dd4bf' },
  lead_assigned:   { icon: UserCheck,    color: '#34d399' },
  default:         { icon: Bell,         color: '#94a3b8' },
};

export default function LeadNotifications() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { onMenuClick } = useOutletContext();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [projects, setProjects] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [teamMembers, setTeamMembers] = useState([]);
  const [users, setUsers] = useState([]);
  const [filterType, setFilterType] = useState('all');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(null);

  // Convenience — the "user-scoped" localStorage keys must be consistent
  // between fetchData / markAsRead / markAllRead / deleteNotification.
  const userId = user?.id || user?.u_id;
  const userRole = user?.role || 'member';
  // NEW: the registration timestamp acts as a lower bound for notifications.
  const userCreatedAt = user?.created_at || null;

  const readKey = `read_notifications_${userId ?? 'anon'}`;
  const deletedKey = `deleted_notifications_${userId ?? 'anon'}`;

  /* ─────────── Data fetch ─────────── */
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);

      const [projectsData, tasksData, membersData, usersData, notificationsData] =
        await Promise.all([
          projectService.getProjects(),
          taskService.getTasks(),
          teamService.getTeamMembers(),
          userService.getUsers(),
          // Pass userCreatedAt so a brand-new user gets an empty inbox.
          notificationService.getNotifications(userId, userRole, userCreatedAt),
        ]);

      const projectsList  = projectsData?.data || projectsData || [];
      const tasksList     = tasksData?.data || tasksData || [];
      const membersList   = membersData?.data || membersData || [];
      const usersList     = usersData?.data || usersData || [];
      const rawNotifs     = notificationsData?.data || [];

      // Read user-scoped read/delete sets
      const readItems = JSON.parse(localStorage.getItem(readKey) || '[]');
      const deletedItems = JSON.parse(localStorage.getItem(deletedKey) || '[]');

      const notificationsList = (Array.isArray(rawNotifs) ? rawNotifs : [])
        .filter(n => !deletedItems.includes(n.n_id || n.id))
        .map(n => ({
          ...n,
          is_read: n.is_read || readItems.includes(n.n_id || n.id),
        }));

      setProjects(projectsList);
      setTasks(tasksList);
      setTeamMembers(membersList);
      setUsers(usersList);
      setNotifications(notificationsList);

      console.log('📬 [LeadNotifications] fetched:', {
        projects: projectsList.length,
        tasks: tasksList.length,
        notifications: notificationsList.length,
        userCreatedAt,
      });
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Failed to load notifications');
      setNotifications([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userId, userRole, userCreatedAt, readKey, deletedKey]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    toast.success('Notifications refreshed');
  };

  /* ─────────── Actions ─────────── */

  const markAllRead = async () => {
    const prev = notifications;
    const ids = notifications.map(n => n.n_id || n.id);

    // Optimistic update
    setNotifications(notifications.map(n => ({ ...n, is_read: true })));

    try {
      // Merge into user-scoped read set
      const existing = JSON.parse(localStorage.getItem(readKey) || '[]');
      const merged = [...new Set([...existing, ...ids])];
      localStorage.setItem(readKey, JSON.stringify(merged));

      // Also call service (which writes to same key)
      await notificationService.markAllRead(ids, userId);

      toast.success('All notifications marked as read');
    } catch (error) {
      console.error('markAllRead failed:', error);
      setNotifications(prev);
      toast.error('Failed to mark all as read');
    }
  };

  const markAsRead = async (id) => {
    const prev = notifications;
    setNotifications(notifications.map(n =>
      (n.n_id || n.id) === id ? { ...n, is_read: true } : n
    ));

    try {
      const existing = JSON.parse(localStorage.getItem(readKey) || '[]');
      if (!existing.includes(id)) {
        existing.push(id);
        localStorage.setItem(readKey, JSON.stringify(existing));
      }
      await notificationService.markAsRead(id, userId);
    } catch (error) {
      console.error('markAsRead failed:', error);
      setNotifications(prev);
    }
  };

  const deleteNotification = async (id) => {
    const prev = notifications;
    setNotifications(notifications.filter(n => (n.n_id || n.id) !== id));
    setShowDeleteConfirm(null);

    try {
      const existing = JSON.parse(localStorage.getItem(deletedKey) || '[]');
      if (!existing.includes(id)) {
        existing.push(id);
        localStorage.setItem(deletedKey, JSON.stringify(existing));
      }
      await notificationService.deleteNotification(id, userId);
      toast.success('Notification deleted');
    } catch (error) {
      console.error('delete failed:', error);
      setNotifications(prev);
      toast.error('Failed to delete notification');
    }
  };

  /* ─────────── Helpers ─────────── */

  const getNotificationIcon = (type) =>
    NOTIFICATION_ICONS[type] || NOTIFICATION_ICONS.default;

  const getEntityName = (entityId, entityType) => {
    if (entityType === 'project') {
      const project = projects.find(p => Number(p.p_id ?? p.id) === Number(entityId));
      return project?.p_name || project?.name || 'Unknown Project';
    }
    if (entityType === 'task') {
      const task = tasks.find(t => Number(t.t_id ?? t.id) === Number(entityId));
      return task?.title || 'Unknown Task';
    }
    if (entityType === 'user') {
      const userObj = users.find(u => Number(u.id ?? u.u_id) === Number(entityId));
      return userObj?.u_name || userObj?.name || 'Unknown User';
    }
    if (entityType === 'team_member') {
      const member = teamMembers.find(m => Number(m.id) === Number(entityId));
      return member?.name || 'Unknown Member';
    }
    return '';
  };

  const getTimeAgo = (date) => {
    if (!date) return '';
    const now = new Date();
    const past = new Date(date);
    const diff = Math.floor((now - past) / 1000);

    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
    return past.toLocaleDateString();
  };

  const getNotificationRoute = (notification) => {
    const type = notification.type || '';
    const entityType = notification.entity_type;
    const entityId = notification.entity_id;

    // ── Project ──
    if (entityType === 'project' && entityId) {
      return `/lead/projects/${entityId}`;
    }

    // ── Task (also used for comment_* events) ──
    if (
      (entityType === 'task' || type.startsWith('task_') || type.startsWith('comment_')) &&
      entityId
    ) {
      const task = tasks.find(t => Number(t.t_id ?? t.id) === Number(entityId));
      const projectId =
        task?.p_id ?? task?.p ?? task?.project ?? task?.project_id ?? null;
      if (projectId) {
        return `/lead/projects/${projectId}/tasks/${entityId}`;
      }
      return null;
    }

    // ── Team member ──
    if (entityType === 'team_member' || type === 'member_added' || type === 'team_updated') {
      return `/lead/team-members`;
    }

    // ── Lead assigned ──
    if (type === 'lead_assigned') {
      return `/lead/team-members`;
    }

    return null;
  };

  const handleNotificationClick = async (notification) => {
    const id = notification.n_id || notification.id;
    if (!notification.is_read) {
      markAsRead(id); // fire-and-forget
    }
    const route = getNotificationRoute(notification);
    if (route) {
      navigate(route);
    } else {
      toast('This activity has no linked page', { icon: 'ℹ️' });
    }
  };

  const filteredNotifications = notifications.filter(n => {
    if (filterType === 'all') return true;
    return n.type === filterType;
  });

  const notificationTypes = ['all', ...new Set(notifications.map(n => n.type).filter(Boolean))];

  const getTypeLabel = (type) => {
    const labels = {
      project_created: 'Project Created',
      project_updated: 'Project Updated',
      project_deleted: 'Project Deleted',
      task_created:    'Task Created',
      task_updated:    'Task Updated',
      task_deleted:    'Task Deleted',
      task_assigned:   'Task Assigned',
      task_completed:  'Task Completed',
      comment_added:   'Comment Added',
      comment_pinned:  'Comment Pinned',
      member_added:    'Member Added',
      team_updated:    'Team Updated',
      lead_assigned:   'Lead Assigned',
    };
    return labels[type] || (type ? type.replace(/_/g, ' ') : 'Notification');
  };

  /* ─────────── Loading ─────────── */
  if (loading) {
    return (
      <div>
        <Topbar title="Notifications" onMenuClick={onMenuClick} />
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
        title="Notifications"
        onMenuClick={onMenuClick}
        actions={
          <div className="topbar-actions">
            <button
              className="btn btn-secondary btn-sm refresh-btn"
              onClick={handleRefresh}
              disabled={refreshing}
              aria-label={refreshing ? 'Refreshing notifications' : 'Refresh notifications'}
              title="Refresh"
            >
              <RefreshCw size={14} className={refreshing ? 'spin' : ''} />
              <span className="btn-label">{refreshing ? 'Refreshing…' : 'Refresh'}</span>
            </button>
            {notifications.length > 0 && (
              <button
                className="btn btn-secondary btn-sm"
                onClick={markAllRead}
                aria-label="Mark all notifications as read"
                title="Mark All Read"
              >
                <CheckCheck size={14} />
                <span className="btn-label">Mark All Read</span>
              </button>
            )}
          </div>
        }
      />

      <div className="page-container">
        {notifications.length > 0 && (
          <div className="filter-bar">
            <div className="filter-scroll">
              {notificationTypes.map((type) => (
                <button
                  key={type}
                  className={`filter-btn ${filterType === type ? 'active' : ''}`}
                  onClick={() => setFilterType(type)}
                >
                  {type === 'all' ? 'All' : getTypeLabel(type)}
                  {type !== 'all' && (
                    <span className="filter-count">
                      {notifications.filter(n => n.type === type).length}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {notifications.length === 0 ? (
          <div className="empty-state card">
            <Bell size={48} className="empty-icon" />
            <h3>No activities yet</h3>
            <p>Activities from your projects and assigned tasks will appear here.</p>
          </div>
        ) : filteredNotifications.length === 0 ? (
          <div className="empty-state card">
            <Bell size={48} className="empty-icon" />
            <h3>No {filterType} activities</h3>
            <p>Try selecting a different filter.</p>
          </div>
        ) : (
          <div className="notifications-list">
            <AnimatePresence>
              {filteredNotifications.map((notification) => {
                const id = notification.n_id || notification.id;
                const isRead = notification.is_read;
                const { icon: Icon, color } = getNotificationIcon(notification.type);
                const timeAgo = getTimeAgo(notification.created_at);
                const message = notification.message || '';
                const typeLabel = getTypeLabel(notification.type);
                const route = getNotificationRoute(notification);
                const isClickable = !!route;
                const entityName = notification.entity_type && notification.entity_id
                  ? getEntityName(notification.entity_id, notification.entity_type)
                  : '';

                return (
                  <motion.div
                    key={id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2 }}
                    className={`notification-item card ${isRead ? 'read' : 'unread'} ${isClickable ? 'clickable' : ''}`}
                    onClick={() => handleNotificationClick(notification)}
                    role={isClickable ? 'button' : undefined}
                    tabIndex={isClickable ? 0 : undefined}
                    onKeyDown={(e) => {
                      if (!isClickable) return;
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleNotificationClick(notification);
                      }
                    }}
                    title={isClickable ? `Open ${entityName || 'linked page'}` : undefined}
                  >
                    <div className="notification-icon" style={{ background: `${color}20`, color }}>
                      <Icon size={18} />
                    </div>
                    <div className="notification-content">
                      <div className="notification-header">
                        <span className="notification-type" style={{ color }}>
                          {typeLabel}
                        </span>
                        <span className="notification-time">{timeAgo}</span>
                      </div>
                      <p className="notification-message" title={message}>{message}</p>
                      {entityName && (
                        <span className="notification-entity-tag" title={entityName}>
                          {notification.entity_type === 'project' && <FolderKanban size={12} />}
                          {notification.entity_type === 'task' && <CheckCircle2 size={12} />}
                          {notification.entity_type === 'user' && <Users size={12} />}
                          {notification.entity_type === 'team_member' && <UserPlus size={12} />}
                          <span className="notification-entity-name">{entityName}</span>
                        </span>
                      )}
                    </div>
                    <div className="notification-actions">
                      {!isRead && <span className="unread-dot" />}
                      <button
                        className="delete-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowDeleteConfirm(id);
                        }}
                        title="Delete"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Delete Confirm Modal */}
      <AnimatePresence>
        {showDeleteConfirm !== null && (
          <motion.div
            className="modal-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowDeleteConfirm(null)}
          >
            <motion.div
              className="modal-box confirm-box"
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
            >
              <AlertCircle size={40} style={{ color: '#f87171', marginBottom: 12 }} />
              <h3 className="confirm-title">Delete Notification?</h3>
              <p className="confirm-desc">This action cannot be undone. The notification will be permanently removed.</p>
              <div className="modal-footer" style={{ justifyContent: 'center' }}>
                <button className="btn btn-danger btn-sm" onClick={() => deleteNotification(showDeleteConfirm)}>
                  <Trash2 size={14} /> Yes, Delete
                </button>
                <button className="btn btn-secondary btn-sm" onClick={() => setShowDeleteConfirm(null)}>
                  Cancel
                </button>
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

        .topbar-actions { display: flex; align-items: center; flex-wrap: nowrap; gap: 8px; min-width: 0; }
        .refresh-btn { display: flex; align-items: center; gap: 6px; }

        .page-container { padding: 20px 24px; max-width: 900px; margin: 0 auto; }

        .filter-bar { margin-bottom: 20px; overflow-x: auto; scrollbar-width: none; }
        .filter-bar::-webkit-scrollbar { display: none; }
        .filter-scroll { display: flex; gap: 8px; padding-bottom: 4px; }
        .filter-btn {
          display: flex; align-items: center; gap: 6px;
          padding: 6px 14px; border-radius: 20px;
          border: 1px solid var(--border-subtle);
          background: var(--bg-secondary); color: var(--text-secondary);
          font-size: 12px; font-weight: 500;
          cursor: pointer; white-space: nowrap; transition: all 0.15s;
        }
        .filter-btn:hover { border-color: var(--border-default); color: var(--text-primary); }
        .filter-btn.active { background: var(--accent-primary); color: #fff; border-color: var(--accent-primary); }
        .filter-btn .filter-count {
          font-size: 10px; background: var(--bg-card); color: var(--text-muted);
          padding: 0 6px; border-radius: 10px; min-width: 18px; text-align: center;
        }
        .filter-btn.active .filter-count { background: rgba(255,255,255,0.2); color: #fff; }

        .empty-state { text-align: center; padding: 60px 20px; }
        .empty-icon { color: var(--text-muted); margin-bottom: 16px; opacity: 0.3; }
        .empty-state h3 { font-size: 18px; font-weight: 700; color: var(--text-primary); margin-bottom: 8px; }
        .empty-state p { color: var(--text-muted); font-size: 14px; }

        .notifications-list { display: flex; flex-direction: column; gap: 8px; }

        .notification-item {
          display: flex; align-items: flex-start; gap: 14px;
          padding: 14px 18px; transition: all 0.15s; position: relative;
          min-width: 0;
          max-width: 100%;
          box-sizing: border-box;
        }

        .notification-item.clickable { cursor: pointer; }
        .notification-item.clickable:hover {
          border-color: var(--accent-primary);
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(0,0,0,0.08);
        }
        .notification-item.clickable:focus-visible {
          outline: none;
          border-color: var(--accent-primary);
          box-shadow: 0 0 0 3px rgba(99,102,241,0.15);
        }

        .notification-item.unread {
          border-left: 3px solid var(--accent-primary);
          background: color-mix(in srgb, var(--accent-primary) 4%, var(--bg-card));
        }
        .notification-item.read { border-left: 3px solid transparent; opacity: 0.7; }
        .notification-item.read:hover { opacity: 0.9; }

        .notification-icon {
          width: 36px; height: 36px; border-radius: 50%;
          display: flex; align-items: center; justify-content: center; flex-shrink: 0;
        }

        .notification-content {
          flex: 1;
          min-width: 0;
          max-width: 100%;
          overflow: hidden;
        }

        .notification-header {
          display: flex; align-items: center; justify-content: space-between;
          gap: 8px; margin-bottom: 4px; flex-wrap: wrap;
        }
        .notification-type { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.3px; }
        .notification-time { font-size: 11px; color: var(--text-muted); flex-shrink: 0; }

        .notification-message {
          font-size: 13px;
          color: var(--text-secondary);
          line-height: 1.5;
          margin: 0;
          overflow-wrap: anywhere;
          word-break: break-word;
          white-space: normal;
          max-width: 100%;
        }

        .notification-entity-tag {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          margin-top: 6px;
          padding: 2px 10px;
          border-radius: 12px;
          font-size: 10px;
          color: var(--text-muted);
          background: var(--bg-secondary);
          border: 1px solid var(--border-subtle);
          max-width: 100%;
          min-width: 0;
          overflow: hidden;
          box-sizing: border-box;
        }
        .notification-entity-name {
          display: inline-block;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          min-width: 0;
          max-width: 100%;
          vertical-align: middle;
        }
        .notification-item.clickable .notification-entity-tag {
          color: var(--accent-primary);
          border-color: color-mix(in srgb, var(--accent-primary) 30%, transparent);
        }

        .notification-actions { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
        .unread-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--accent-primary); }

        .delete-btn {
          display: flex; align-items: center; justify-content: center;
          padding: 4px; border: none; border-radius: 6px;
          background: transparent; color: var(--text-muted);
          cursor: pointer; transition: all 0.14s; opacity: 0.5;
        }
        .notification-item:hover .delete-btn { opacity: 1; }
        .delete-btn:hover { color: #f87171; background: rgba(248, 113, 113, 0.1); }

        .modal-overlay {
          position: fixed; inset: 0; background: rgba(0,0,0,0.6);
          backdrop-filter: blur(4px); display: flex; align-items: center;
          justify-content: center; z-index: 1000; padding: 16px;
        }
        .modal-box {
          background: var(--bg-card); border: 1px solid var(--border-default);
          border-radius: 20px; width: 100%; max-width: 400px; max-height: 90vh;
          overflow-y: auto; box-shadow: 0 24px 60px rgba(0,0,0,0.3);
        }
        .confirm-box { text-align: center; padding: 32px 28px 24px; }
        .confirm-title { font-size: 18px; font-weight: 800; color: var(--text-primary); margin: 0 0 6px; }
        .confirm-desc { font-size: 13px; color: var(--text-muted); margin: 0 0 16px; line-height: 1.6; }
        .modal-footer { display: flex; gap: 10px; justify-content: center; }

        .btn {
          display: inline-flex; align-items: center; justify-content: center; gap: 6px;
          padding: 8px 16px; border-radius: 8px;
          font-size: 12px; font-weight: 600; cursor: pointer;
          border: 1px solid transparent; transition: all 0.15s;
          white-space: nowrap; flex-shrink: 0;
          -webkit-tap-highlight-color: transparent; touch-action: manipulation;
        }
        .btn-primary { background: var(--accent-primary); color: #fff; }
        .btn-primary:hover { opacity: 0.85; }
        .btn-secondary { background: var(--bg-secondary); color: var(--text-primary); border: 1px solid var(--border-default); }
        .btn-secondary:hover { border-color: var(--accent-primary); }
        .btn-danger { background: rgba(239, 68, 68, 0.1); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.3); }
        .btn-danger:hover { background: rgba(239, 68, 68, 0.2); }
        .btn-sm { padding: 6px 12px; font-size: 11px; }

        @media (max-width: 768px) {
          .page-container { padding: 14px 16px; }
          .notification-item { padding: 12px 14px; }
          .filter-scroll { gap: 6px; }
          .filter-btn { padding: 4px 10px; font-size: 11px; }
          .notification-icon { width: 30px; height: 30px; }
          .notification-icon svg { width: 14px; height: 14px; }
          .notification-entity-name { max-width: 180px; }
        }
        @media (max-width: 560px) {
          .topbar-actions .btn { width: 32px; height: 32px; padding: 0; border-radius: 8px; }
          .topbar-actions .btn-label { display: none; }
          .notification-entity-name { max-width: 140px; }
        }
        @media (max-width: 400px) {
          .topbar-actions .btn { width: 28px; height: 28px; border-radius: 7px; }
          .notification-entity-name { max-width: 100px; }
        }
        @media (max-width: 480px) {
          .page-container { padding: 10px 12px; }
          .notification-item { padding: 10px 12px; gap: 10px; }
          .notification-message { font-size: 12px; }
        }
        @media (hover: none) and (pointer: coarse) {
          .topbar-actions .btn { width: 40px !important; height: 40px !important; }
        }
      `}</style>
    </div>
  );
}